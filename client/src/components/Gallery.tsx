import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { t } from '../app/i18n'
import { Icon } from './Icon'
import { ListingImage } from './ListingCard'

/** How far a drag must travel, in pixels, to count as "next" or "previous". */
const SWIPE_DISTANCE = 50

/**
 * Turns a horizontal drag (mouse, finger or pen) into a step to the next or
 * previous photo. `wasDrag` tells a click handler to ignore the click that
 * ends a drag.
 */
function useSwipe(onStep: (delta: number) => void) {
  const start = useRef<number | null>(null)
  const dragged = useRef(false)
  const [offset, setOffset] = useState(0)

  const end = () => {
    if (start.current === null) return
    start.current = null
    if (Math.abs(offset) > SWIPE_DISTANCE) onStep(offset < 0 ? 1 : -1)
    setOffset(0)
  }

  return {
    offset,
    wasDrag: () => dragged.current,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        start.current = event.clientX
        dragged.current = false
        event.currentTarget.setPointerCapture(event.pointerId)
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (start.current === null) return
        const delta = event.clientX - start.current
        if (Math.abs(delta) > 5) dragged.current = true
        setOffset(delta)
      },
      onPointerUp: end,
      onPointerCancel: end,
    },
  }
}

interface StageProps {
  images: string[]
  index: number
  title: string
  onStep: (delta: number) => void
  onOpen?: () => void
}

/** The large photo with arrows, shared by the page and the full-screen view. */
function Stage({ images, index, title, onStep, onOpen }: StageProps) {
  const swipe = useSwipe(onStep)
  const many = images.length > 1
  return (
    <div className="gallery-stage">
      <div
        className={onOpen ? 'gallery-main zoomable' : 'gallery-main'}
        style={{ transform: swipe.offset ? `translateX(${swipe.offset}px)` : undefined }}
        onClick={() => !swipe.wasDrag() && onOpen?.()}
        {...(many ? swipe.handlers : {})}
      >
        <ListingImage src={images[index]} alt={title} />
      </div>
      {many && (
        <>
          <button type="button" className="gallery-arrow prev" onClick={() => onStep(-1)} aria-label={t('Previous photo')}>
            <Icon name="left" />
          </button>
          <button type="button" className="gallery-arrow next" onClick={() => onStep(1)} aria-label={t('Next photo')}>
            <Icon name="right" />
          </button>
          <span className="gallery-count" aria-hidden="true">
            {index + 1} / {images.length}
          </span>
        </>
      )}
    </div>
  )
}

function Thumbs({ images, index, onSelect }: { images: string[]; index: number; onSelect: (index: number) => void }) {
  if (images.length < 2) return null
  return (
    <div className="gallery-thumbs">
      {images.map((url, position) => (
        <button
          key={url}
          type="button"
          className={position === index ? 'active' : undefined}
          onClick={() => onSelect(position)}
          aria-label={t('Photo {n} of {total}', { n: position + 1, total: images.length })}
          aria-current={position === index}
        >
          <img src={url} alt="" loading="lazy" draggable={false} />
        </button>
      ))}
    </div>
  )
}

/**
 * Photos of a listing: one large photo with thumbnails underneath. Arrows,
 * the arrow keys and dragging move between photos; a click opens the photo
 * full screen, where the same controls work.
 */
export function Gallery({ images, title }: { images: string[]; title: string }) {
  const [selected, setSelected] = useState(0)
  const [open, setOpen] = useState(false)
  const count = images.length
  const index = Math.min(selected, Math.max(0, count - 1))
  const step = useCallback(
    (delta: number) => setSelected((current) => (Math.min(current, count - 1) + delta + count) % count),
    [count],
  )

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

  return (
    <div className="gallery">
      <Stage images={images} index={index} title={title} onStep={step} onOpen={() => setOpen(true)} />
      <Thumbs images={images} index={index} onSelect={setSelected} />
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
          <Stage images={images} index={index} title={title} onStep={step} />
          <Thumbs images={images} index={index} onSelect={setSelected} />
        </div>
      )}
    </div>
  )
}
