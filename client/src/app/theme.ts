import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

/** The user's explicit choice, if any. Storage can be unavailable (private mode), hence the guards. */
function readChoice(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

let choice = readChoice()

const current = (): Theme => choice ?? (media.matches ? 'dark' : 'light')

function apply() {
  // Without a choice the attribute is absent and the stylesheet follows the system setting.
  if (choice) document.documentElement.dataset.theme = choice
  else delete document.documentElement.dataset.theme
  for (const listener of listeners) listener()
}

export function setTheme(theme: Theme) {
  choice = theme
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // The choice still applies for this visit.
  }
  apply()
}

media.addEventListener('change', apply)
apply()

export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    current,
  )
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')]
}
