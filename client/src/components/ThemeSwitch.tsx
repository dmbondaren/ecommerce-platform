import { useRef, useState, type PointerEvent } from 'react'
import { useTheme } from '../app/theme'
import { Icon } from './Icon'
import { t } from '../app/i18n'

const TRACK = 60
const KNOB = 26
const PADDING = 3
const TRAVEL = TRACK - KNOB - PADDING * 2
/** Pointer movement below this many pixels counts as a click, not a drag. */
const CLICK_TOLERANCE = 4

/**
 * Light/dark switch that works three ways: click it, drag the knob to a side,
 * or focus it and press Space. The knob is white in the dark theme and dark
 * in the light one, so it always stands out from its track.
 */
export function ThemeSwitch() {
  const [theme, setTheme] = useTheme()
  const dark = theme === 'dark'
  const start = useRef<{ x: number; offset: number } | null>(null)
  // Knob position in pixels while it is being dragged; `null` when it rests.
  const [dragOffset, setDragOffset] = useState<number | null>(null)
  const moved = useRef(false)

  const rest = dark ? TRAVEL : 0
  const offset = dragOffset ?? rest

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    start.current = { x: event.clientX, offset: rest }
    moved.current = false
  }

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!start.current) return
    const delta = event.clientX - start.current.x
    if (Math.abs(delta) > CLICK_TOLERANCE) moved.current = true
    if (moved.current) setDragOffset(Math.min(TRAVEL, Math.max(0, start.current.offset + delta)))
  }

  const onPointerUp = () => {
    if (!start.current) return
    start.current = null
    // A drag settles on the nearer side; a plain click is handled by onClick.
    if (moved.current && dragOffset !== null) setTheme(dragOffset > TRAVEL / 2 ? 'dark' : 'light')
    setDragOffset(null)
  }

  const label = dark ? 'Dark theme is on. Switch to light.' : 'Light theme is on. Switch to dark.'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={label}
      title={dark ? t('Switch to the light theme') : t('Switch to the dark theme')}
      className={dragOffset === null ? 'theme-switch' : 'theme-switch dragging'}
      style={{ width: TRACK, height: KNOB + PADDING * 2 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={() => {
        // The click that ends a drag must not toggle the theme back.
        if (moved.current) moved.current = false
        else setTheme()
      }}
    >
      <Icon name="sun" size={14} className="theme-switch-hint sun" />
      <Icon name="moon" size={14} className="theme-switch-hint moon" />
      <span
        className="theme-switch-knob"
        style={{ width: KNOB, height: KNOB, transform: `translateX(${offset}px)` }}
      >
        <Icon name={offset > TRAVEL / 2 ? 'moon' : 'sun'} size={15} />
      </span>
    </button>
  )
}
