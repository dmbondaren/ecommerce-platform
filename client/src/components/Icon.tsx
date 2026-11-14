const PATHS = {
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  cart: 'M3 4h2l2.4 11h10.2L20 7H6.2M9.5 19.5h.01M16.5 19.5h.01',
  chat: 'M4 5h16v11H9l-5 4z',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM16 16l5 5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1.5-4 4.5-5 8-5s6.5 1 8 5',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z',
  flag: 'M5 21V4h11l-1.5 4L16 12H5',
  send: 'M4 12l16-8-6 16-2.5-6.5z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5h.01',
  pin: 'M12 21s-6-5.6-6-10a6 6 0 0 1 12 0c0 4.4-6 10-6 10zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  shield: 'M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z',
  thumb: 'M7 11v9H4v-9zM7 11l4-8c1.7 0 2.5 1.2 2.5 2.5V9H19a2 2 0 0 1 2 2.3l-1 6.7a2 2 0 0 1-2 2H7',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  clip: 'M19 11l-7.5 7.5a4 4 0 0 1-5.7-5.7L13 5.6a2.7 2.7 0 0 1 3.8 3.8L9.6 16.6a1.3 1.3 0 0 1-1.9-1.9L14 8.5',
} as const

export type IconName = keyof typeof PATHS

interface Props {
  name: IconName
  size?: number
  filled?: boolean
  className?: string
}

/** Decorative by default; give the surrounding button an `aria-label`. */
export function Icon({ name, size = 20, filled = false, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
