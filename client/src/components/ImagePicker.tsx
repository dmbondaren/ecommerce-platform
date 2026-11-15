import { useRef, useState, type DragEvent } from 'react'
import { errorMessage } from '../api/client'
import { uploadImages } from '../api/endpoints'
import { toast } from '../app/toast'
import { Icon } from './Icon'
import { t } from '../app/i18n'

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

interface Props {
  urls: string[]
  max: number
  onChange: (urls: string[]) => void
}

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files')

/**
 * Uploads photos as soon as they are chosen or dropped in, and lets the user
 * reorder them: drag one photo onto another to swap the two, or use the arrow
 * buttons (which also work with a keyboard and on touch screens). The first
 * photo is the cover.
 */
export function ImagePicker({ urls, max, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [dragged, setDragged] = useState<number | null>(null)
  const [target, setTarget] = useState<number | null>(null)
  const [fileOver, setFileOver] = useState(false)

  const add = async (list: FileList | File[] | null) => {
    const room = max - urls.length
    const files = Array.from(list ?? []).filter((file) => ACCEPT.includes(file.type))
    if (files.length === 0) {
      if (list && list.length > 0) toast.error(t('Only JPEG, PNG, WebP and GIF images can be added'))
      return
    }
    if (room <= 0) {
      toast.error(`A listing can have at most ${max} photos`)
      return
    }
    const tooLarge = files.find((file) => file.size > MAX_BYTES)
    if (tooLarge) {
      toast.error(`“${tooLarge.name}” is larger than 10 MB`)
      return
    }
    setBusy(true)
    try {
      const uploaded = await uploadImages(files.slice(0, room))
      onChange([...urls, ...uploaded.map((file) => file.url)])
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const swap = (from: number, to: number) => {
    const next = [...urls]
    const a = next[from]
    const b = next[to]
    if (a === undefined || b === undefined || from === to) return
    next[from] = b
    next[to] = a
    onChange(next)
  }

  const endDrag = () => {
    setDragged(null)
    setTarget(null)
  }

  const cellClass = (index: number) =>
    [dragged === index ? 'dragging' : '', target === index && dragged !== index ? 'drop-target' : '']
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div
      className={fileOver ? 'image-picker file-over' : 'image-picker'}
      onDragOver={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        setFileOver(true)
      }}
      onDragLeave={() => setFileOver(false)}
      onDrop={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        setFileOver(false)
        void add(event.dataTransfer.files)
      }}
    >
      {urls.map((url, index) => (
        <figure
          key={url}
          className={cellClass(index)}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', String(index))
            setDragged(index)
          }}
          onDragOver={(event) => {
            if (dragged === null) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            if (target !== index) setTarget(index)
          }}
          onDrop={(event) => {
            if (dragged === null) return
            event.preventDefault()
            swap(dragged, index)
            endDrag()
          }}
          onDragEnd={endDrag}
        >
          <img src={url} alt={`Photo ${index + 1}`} draggable={false} />
          {index === 0 && <figcaption className="badge badge-overlay">{t('Cover')}</figcaption>}
          <div className="image-tools">
            {index > 0 && (
              <button type="button" onClick={() => swap(index, index - 1)} aria-label={`Move photo ${index + 1} earlier`}>
                <Icon name="left" size={16} />
              </button>
            )}
            {index < urls.length - 1 && (
              <button type="button" onClick={() => swap(index, index + 1)} aria-label={`Move photo ${index + 1} later`}>
                <Icon name="right" size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onChange(urls.filter((item) => item !== url))}
              aria-label={`Remove photo ${index + 1}`}
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        </figure>
      ))}
      {urls.length < max && (
        <button type="button" className="image-add" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <span className="spinner spinner-sm" /> : <Icon name="plus" />}
          <span>{busy ? t('Uploading…') : t('Add or drop photos')}</span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT.join(',')}
        multiple
        hidden
        onChange={(event) => void add(event.target.files)}
      />
    </div>
  )
}
