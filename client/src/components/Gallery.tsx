import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { t } from '../app/i18n'
import { Icon } from './Icon'
import { ListingImage } from './ListingCard'

/** How far a drag travels, in pixels, for each photo it moves on. */
const STEP_DISTANCE = 70

const wrap = (index: number, count: number) => ((index % count) + count) % count

/**
 * Dragging across the photo (mouse, finger or pen) picks another one: every
 * `STEP_DISTANCE` pixels moves one photo further, to the left for the next
 * and to the right for the previous. The photo itself does not slide away;
 * `onPreview` reports the photo the drag currently points at, so that it can
 * be shown and marked while the button is still held, and `onCommit` fires
 * on release. `wasDrag` lets a click handler ignore the click that ends a drag.
 */
function useDragToPick(count: number, index: number, onPreview: (index: number | null) => void, onCommit: (index: number) => void) {
  const start = useRef<{ x: number; index: number } | null>(null)
  const target = useRef<number | null>(null)
  const dragged = useRef(false)
  const [dragging, setDragging] = useState(false)

  const finish = (commit: boolean) => {
    if (!start.current) return
    start.current = null
    setDragging(false)
    if (commit && target.current !== null) onCommit(target.current)
    target.current = null
    onPreview(null)
  }

  return {
    dragging,
    wasDrag: () => dragged.current,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        start.current = { x: event.clientX, index }
        target.current = null
        dragged.current = false
        event.currentTarget.setPointerCapture(event.pointerId)
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (!start.current) return
        const delta = event.clientX - start.current.x
        if (Math.abs(delta) > 5 && !dragged.current) {
          dragged.current = true
          setDragging(true)
        }
        const steps = Math.trunc(-delta / STEP_DISTANCE)
        const next = steps === 0 ? null : wrap(start.current.index + steps, count)
        if (next !== target.current) {
          target.current = next
          onPreview(next)
        }
      },
      onPointerUp: () => finish(true),
      onPointerCancel: () => finish(false),
    },
  }
}

interface StageProps {
  images: string[]
  /** The selected photo. */
  index: number
  /** The photo a drag points at, shown instead of the selected one while it lasts. */
  preview: number | null
  title: string
  onPreview: (index: number | null) => void
  onSelect: (index: number) => void
  onOpen?: () => void
}

/** The large photo with arrows, shared by the page and the full-screen view. */
function Stage({ images, index, preview, title, onPreview, onSelect, onOpen }: StageProps) {
  const count = images.length
  const drag = useDragToPick(count, index, onPreview, onSelect)
  const shown = preview ?? index
  const many = count > 1
  const classes = ['gallery-main', onOpen && 'zoomable', many && 'draggable', drag.dragging && 'dragging'].filter(Boolean).join(' ')
  return (
    <div className="gallery-stage">
      <div className={classes} onClick={() => !drag.wasDrag() && onOpen?.()} {...(many ? drag.handlers : {})}>
        <ListingImage src={images[shown]} alt={title} />
      </div>
      {many && (
        <>
          <button type="button" className="gallery-arrow prev" onClick={() => onSelect(wrap(index - 1, count))} aria-label={t('Previous photo')}>
            <Icon name="left" />
          </button>
          <button type="button" className="gallery-arrow next" onClick={() => onSelect(wrap(index + 1, count))} aria-label={t('Next photo')}>
            <Icon name="right" />
          </button>
          <span className="gallery-count" aria-hidden="true">
            {shown + 1} / {count}
          </span>
        </>
      )}
    </div>
  )
}

interface ThumbsProps {
  images: string[]
  index: number
  preview: number | null
  onSelect: (index: number) => void
}

/** The column of small photos. The one a drag points at is marked before it is chosen. */
function Thumbs({ images, index, preview, onSelect }: ThumbsProps) {
  const marked = preview ?? index
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Keeps the marked photo in sight when there are more than fit. The list
    // is scrolled by hand: `scrollIntoView` would also move the page.
    const list = listRef.current
    const item = list?.children[marked]
    if (!list || !(item instanceof HTMLElement)) return
    const top = item.offsetTop - list.offsetTop
    const left = item.offsetLeft - list.offsetLeft
    if (top < list.scrollTop) list.scrollTop = top
    else if (top + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + item.offsetHeight - list.clientHeight
    if (left < list.scrollLeft) list.scrollLeft = left
    else if (left + item.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = left + item.offsetWidth - list.clientWidth
  }, [marked])

  return (
    <div className="gallery-thumbs" ref={listRef}>
      {images.map((url, position) => {
        const state = position === preview ? 'target' : position === index && preview === null ? 'active' : undefined
        return (
          <button
            key={url}
            type="button"
            className={state}
            onClick={() => onSelect(position)}
            aria-label={t('Photo {n} of {total}', { n: position + 1, total: images.length })}
            aria-current={position === index}
          >
            <img src={url} alt="" loading="lazy" draggable={false} />
          </button>
        )
      })}
    </div>
  )
}

/**
 * Photos of a listing: a column of thumbnails beside one large photo. The
 * arrows, the arrow keys, the thumbnails and dragging across the photo all
 * choose another one; a click opens the photo full screen, where the same
 * controls work.
 */
export function Gallery({ images, title }: { images: string[]; title: string }) {
  const [selected, setSelected] = useState(0)
  const [preview, setPreview] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const count = images.length
  const index = Math.min(selected, Math.max(0, count - 1))
  const step = useCallback((delta: number) => setSelected((current) => wrap(Math.min(current, count - 1) + delta, count)), [count])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
      if (event.key === 'ArrowLeft') step(-1)
      if (event.key === 'ArrowRight') step(1)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, step])

  if (count === 0) {
    return (
      <div className="gallery">
        <div className="gallery-main">
          <ListingImage src={undefined} alt={title} />
        </div>
      </div>
    )
  }

  const body = (onOpen?: () => void) => (
    <div className={count > 1 ? 'gallery-body' : 'gallery-body single'}>
      {count > 1 && <Thumbs images={images} index={index} preview={preview} onSelect={setSelected} />}
      <Stage images={images} index={index} preview={preview} title={title} onPreview={setPreview} onSelect={setSelected} onOpen={onOpen} />
    </div>
  )

  return (
    <div className="gallery">
      {body(() => setOpen(true))}
      {open && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}
        >
          <button type="button" className="icon-btn lightbox-close" onClick={() => setOpen(false)} aria-label={t('Close')}>
            <Icon name="x" />
          </button>
          {body()}
        </div>
      )}
    </div>
  )
}
