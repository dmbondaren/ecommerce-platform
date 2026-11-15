import { describe, expect, it } from 'vitest'
import { getLang, t } from './i18n'
import { de } from './locales/de'
import { ru } from './locales/ru'
import { uk } from './locales/uk'

describe('t', () => {
  it('returns the English text as it is and fills placeholders', () => {
    expect(getLang()).toBe('en')
    expect(t('Sign in')).toBe('Sign in')
    expect(t('Within {km} km', { km: 5 })).toBe('Within 5 km')
    expect(t(undefined)).toBe('')
  })

  it('falls back to English for a text without a translation', () => {
    expect(de['A text nobody translated']).toBeUndefined()
    expect(t('A text nobody translated')).toBe('A text nobody translated')
  })
})

describe('dictionaries', () => {
  const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort()

  it.each([
    ['de', de],
    ['uk', uk],
    ['ru', ru],
  ])('%s keeps every placeholder of the source text', (_code, dictionary) => {
    for (const [source, translation] of Object.entries(dictionary)) {
      expect(placeholders(translation), source).toEqual(placeholders(source))
      expect(translation.trim(), source).not.toBe('')
    }
  })

  it('covers the same texts in every language', () => {
    expect(Object.keys(uk).sort()).toEqual(Object.keys(de).sort())
    expect(Object.keys(ru).sort()).toEqual(Object.keys(de).sort())
  })
})
