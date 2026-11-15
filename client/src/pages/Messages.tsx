import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage } from '../api/client'
import { chatApi, uploadImages } from '../api/endpoints'
import type { Conversation, Message } from '../api/types'
import { useAuth } from '../app/auth'
import { useDocumentTitle } from '../app/hooks'
import { keys } from '../app/queryClient'
import { toast } from '../app/toast'
import { ConfirmDialog } from '../components/dialogs'
import { Icon } from '../components/Icon'
import { Avatar, Button, EmptyState, QueryView, Spinner } from '../components/ui'
import { formatDate, formatTime, isSameDay, timeAgo } from '../lib/format'
import { t } from '../app/i18n'

/** Who or what a conversation is "with", from the viewer's point of view. */
function describe(conversation: Conversation, viewerId: string) {
  if (conversation.type === 'ADMIN_ROOM') return { name: t('Staff room'), detail: t('Visible to all moderators'), user: null }
  if (conversation.type === 'SUPPORT') {
    const own = conversation.buyer?.id === viewerId
    return {
      name: own ? t('Support') : `${t('Support')} · ${conversation.buyer?.nickname ?? t('Deleted account')}`,
      detail: own ? t('Our team usually answers within a day') : t('Support request'),
      user: own ? null : conversation.buyer,
    }
  }
  const other = conversation.buyer?.id === viewerId ? conversation.seller : conversation.buyer
  return {
    name: other?.nickname ?? t('Deleted account'),
    detail: conversation.listing?.title ?? t('Listing removed'),
    user: other,
  }
}

function ConversationList({ conversations, activeId, viewerId }: { conversations: Conversation[]; activeId?: string; viewerId: string }) {
  return (
    <ul className="chat-list">
      {conversations.map((conversation) => {
        const info = describe(conversation, viewerId)
        const last = conversation.lastMessage
        return (
          <li key={conversation.id}>
            <Link
              to={`/messages/${conversation.id}`}
              className={conversation.id === activeId ? 'chat-item active' : 'chat-item'}
              aria-current={conversation.id === activeId ? 'page' : undefined}
            >
              <Avatar user={info.user ?? { nickname: info.name, avatarUrl: null }} size={40} />
              <span className="chat-item-main">
                <span className="chat-item-top">
                  <strong>{info.name}</strong>
                  <span className="muted">{timeAgo(conversation.lastMessageAt)}</span>
                </span>
                <span className="chat-item-detail">{info.detail}</span>
                <span className="chat-item-preview">
                  {last ? (last.hasAttachment && !last.body ? t('Photo') : last.body || t('Message deleted')) : t('No messages yet')}
                </span>
              </span>
              {conversation.unreadCount > 0 && <span className="counter counter-inline">{conversation.unreadCount}</span>}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function Bubble({ message, mine, onEdit, onDelete }: { message: Message; mine: boolean; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className={mine ? 'bubble-row mine' : 'bubble-row'}>
      <div className={message.deleted ? 'bubble deleted' : 'bubble'}>
        {!mine && message.sender && <span className="bubble-author">{message.sender.nickname}</span>}
        {message.deleted ? (
          <em>{t('Message deleted')}</em>
        ) : (
          <>
            {message.attachmentUrl && (
              <a href={message.attachmentUrl} target="_blank" rel="noreferrer">
                <img src={message.attachmentUrl} alt={message.attachmentName ?? 'Attached photo'} loading="lazy" />
              </a>
            )}
            {message.body && <p>{message.body}</p>}
          </>
        )}
        <span className="bubble-meta">
          {formatTime(message.createdAt)}
          {message.editedAt && !message.deleted && ' · edited'}
        </span>
      </div>
      {mine && !message.deleted && (
        <div className="bubble-tools">
          {message.body && (
            <button type="button" className="icon-btn" onClick={onEdit} aria-label={t('Edit message')}>
              <Icon name="edit" size={16} />
            </button>
          )}
          <button type="button" className="icon-btn" onClick={onDelete} aria-label={t('Delete message')}>
            <Icon name="trash" size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

function Thread({ id, viewerId }: { id: string; viewerId: string }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const conversation = useQuery({ queryKey: [...keys.conversations, id], queryFn: () => chatApi.get(id) })
  const history = useInfiniteQuery({
    queryKey: keys.messages(id),
    queryFn: ({ pageParam }) => chatApi.messages(id, pageParam),
    initialPageParam: undefined as string | undefined,
    // Pages run backwards in time: the "next" page is the one before the oldest loaded message.
    getNextPageParam: (page) => (page.hasMore ? page.items[0]?.createdAt : undefined),
  })
  const messages = useMemo(
    () => (history.data?.pages ?? []).slice().reverse().flatMap((page) => page.items),
    [history.data],
  )

  const [text, setText] = useState('')
  const [editing, setEditing] = useState<Message | null>(null)
  const [deleting, setDeleting] = useState<Message | null>(null)
  const [uploading, setUploading] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const lastId = messages[messages.length - 1]?.id
  useEffect(() => {
    if (!lastId) return
    bottom.current?.scrollIntoView({ block: 'end' })
    // Seeing the newest message is what marks the conversation as read.
    chatApi
      .markRead(id)
      .then(() => client.invalidateQueries({ queryKey: keys.unread }))
      .catch(() => undefined)
  }, [id, lastId, client])

  const refresh = () => client.invalidateQueries({ queryKey: keys.conversations })
  const send = useMutation({
    mutationFn: (input: { body: string; attachmentUrl?: string; attachmentName?: string }) =>
      editing ? chatApi.editMessage(editing.id, input.body) : chatApi.send(id, input),
    onSuccess: () => {
      setText('')
      setEditing(null)
      return refresh()
    },
  })

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    const body = text.trim()
    if (body && !send.isPending) send.mutate({ body })
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
    if (event.key === 'Escape' && editing) {
      setEditing(null)
      setText('')
    }
  }
  const attach = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const [uploaded] = await uploadImages([file])
      if (uploaded) await chatApi.send(id, { body: text.trim(), attachmentUrl: uploaded.url, attachmentName: uploaded.name })
      setText('')
      await refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const info = conversation.data ? describe(conversation.data, viewerId) : null

  return (
    <section className="chat-thread" aria-label={t('Conversation')}>
      <header className="chat-header">
        <Link to="/messages" className="icon-btn chat-back" aria-label={t('Back to conversations')}>
          <Icon name="left" />
        </Link>
        <div className="chat-header-main">
          {info?.user ? (
            <Link to={`/users/${info.user.id}`} title={t('View profile')}>
              <strong>{info.name}</strong>
            </Link>
          ) : (
            <strong>{info?.name ?? '…'}</strong>
          )}
          {conversation.data?.listing ? (
            <Link className="muted" to={`/listings/${conversation.data.listing.id}`}>
              {conversation.data.listing.title}
            </Link>
          ) : (
            <span className="muted">{info?.detail}</span>
          )}
        </div>
        {conversation.data?.type === 'LISTING' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void chatApi
                .hide(id)
                .then(refresh)
                .then(() => navigate('/messages'))
                .catch((error: unknown) => toast.error(errorMessage(error)))
            }
          >
            {t('Remove chat')}
          </Button>
        )}
      </header>

      <div className="chat-messages">
        {history.isPending ? (
          <Spinner />
        ) : history.isError ? (
          <EmptyState title={t('This conversation could not be loaded')}>
            <Button onClick={() => void history.refetch()}>{t('Try again')}</Button>
          </EmptyState>
        ) : (
          <>
            {history.hasNextPage && (
              <Button size="sm" variant="ghost" busy={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
                {t('Show earlier messages')}
              </Button>
            )}
            {messages.length === 0 && <p className="muted center">{t('No messages yet. Say hello.')}</p>}
            {messages.map((message, index) => {
              const previous = messages[index - 1]
              return (
                <Fragment key={message.id}>
                  {(!previous || !isSameDay(previous.createdAt, message.createdAt)) && (
                    <p className="chat-day">{formatDate(message.createdAt)}</p>
                  )}
                  <Bubble
                    message={message}
                    mine={message.sender?.id === viewerId}
                    onEdit={() => {
                      setEditing(message)
                      setText(message.body)
                    }}
                    onDelete={() => setDeleting(message)}
                  />
                </Fragment>
              )
            })}
            <div ref={bottom} />
          </>
        )}
      </div>

      <form className="chat-composer" onSubmit={submit}>
        {editing && (
          <p className="chat-editing">
            {t('Editing a message')}
            <button
              type="button"
              className="link"
              onClick={() => {
                setEditing(null)
                setText('')
              }}
            >
              {t('Cancel')}
            </button>
          </p>
        )}
        <div className="chat-composer-row">
          {!editing && (
            <button
              type="button"
              className="icon-btn"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
              aria-label={t('Attach a photo')}
            >
              {uploading ? <span className="spinner spinner-sm" /> : <Icon name="clip" />}
            </button>
          )}
          <textarea
            rows={1}
            maxLength={4000}
            placeholder={t('Write a message')}
            aria-label={t('Message')}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <Button type="submit" variant="primary" icon="send" busy={send.isPending} disabled={!text.trim()}>
            {editing ? t('Save') : t('Send')}
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(event) => void attach(event.target.files?.[0])}
        />
      </form>

      {deleting && (
        <ConfirmDialog
          title={t('Delete this message?')}
          confirmLabel={t('Delete')}
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await chatApi.deleteMessage(deleting.id)
            await refresh()
          }}
        >
          <p>{t('It will be removed for everyone in the conversation.')}</p>
        </ConfirmDialog>
      )}
    </section>
  )
}

export function Messages() {
  const { id } = useParams()
  const { user } = useAuth()
  const conversations = useQuery({ queryKey: keys.conversations, queryFn: chatApi.list })
  useDocumentTitle(t('Messages'))
  if (!user) return null

  return (
    <div className={id ? 'chat chat-open' : 'chat'}>
      <aside className="chat-sidebar" aria-label={t('Conversations')}>
        <h1>{t('Messages')}</h1>
        <QueryView
          query={conversations}
          empty={
            <EmptyState title={t('No conversations yet')}>
              <p>{t('Open a listing and message the seller to start one.')}</p>
            </EmptyState>
          }
        >
          {(items) => <ConversationList conversations={items} activeId={id} viewerId={user.id} />}
        </QueryView>
      </aside>
      {id ? (
        <Thread key={id} id={id} viewerId={user.id} />
      ) : (
        <div className="chat-thread chat-placeholder">
          <EmptyState title={t('Select a conversation')} />
        </div>
      )}
    </div>
  )
}
