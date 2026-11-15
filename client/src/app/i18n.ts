import { useSyncExternalStore } from 'react'
import { de } from './locales/de'
import { ru } from './locales/ru'
import { uk } from './locales/uk'

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'uk', name: 'Українська' },
  { code: 'ru', name: 'Русский' },
] as const

export type Lang = (typeof LANGUAGES)[number]['code']

/**
 * English is the source language: the English text is the key, and a missing
 * translation simply shows the English text. That keeps the components
 * readable and makes an incomplete dictionary harmless.
 */
const dictionaries: Record<Exclude<Lang, 'en'>, Record<string, string>> = { de, uk, ru }

const LOCALES: Record<Lang, string> = { en: 'en-CH', de: 'de-CH', uk: 'uk-UA', ru: 'ru-RU' }
const STORAGE_KEY = 'language'
const isLang = (value: unknown): value is Lang => LANGUAGES.some((language) => language.code === value)

/** The saved choice, else the browser's language, else English. Safe outside a browser (tests). */
function initialLang(): Lang {
  if (typeof window === 'undefined') return 'en'
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (isLang(saved)) return saved
  } catch {
    // Storage can be unavailable (private mode); fall through to the browser's language.
  }
  const preferred = window.navigator.language.slice(0, 2).toLowerCase()
  return isLang(preferred) ? preferred : 'en'
}

let lang: Lang = initialLang()
const listeners = new Set<() => void>()
if (typeof document !== 'undefined') document.documentElement.lang = lang

export const getLang = () => lang
/** Locale for dates, numbers and prices in the current language. */
export const locale = () => LOCALES[lang]

export function setLang(next: Lang) {
  lang = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // The choice still applies for this visit.
  }
  document.documentElement.lang = next
  for (const listener of listeners) listener()
}

/**
 * Translates an English text. `{name}` placeholders are filled from `vars`:
 * t('Within {km} km', { km: 5 }).
 */
export function t(text: string | undefined, vars?: Record<string, string | number>): string {
  if (!text) return ''
  const template = lang === 'en' ? text : (dictionaries[lang][text] ?? text)
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => String(vars[name] ?? match))
}

/** Re-renders the caller when the language changes. */
export const useLang = (): Lang =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => lang,
  )
