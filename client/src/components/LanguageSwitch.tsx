import { useEffect, useRef, useState } from 'react'
import { LANGUAGES, setLang, useLang, type Lang } from '../app/i18n'

/** Small flags drawn as SVG: flag emoji do not render on Windows. */
function Flag({ code }: { code: Lang }) {
  return (
    <svg className="flag" viewBox="0 0 30 20" aria-hidden="true">
      {code === 'de' && (
        <>
          <rect width="30" height="20" fill="#ffce00" />
          <rect width="30" height="13.4" fill="#dd0000" />
          <rect width="30" height="6.7" fill="#000000" />
        </>
      )}
      {code === 'uk' && (
        <>
          <rect width="30" height="20" fill="#ffd700" />
          <rect width="30" height="10" fill="#0057b7" />
        </>
      )}
      {code === 'ru' && (
        <>
          <rect width="30" height="20" fill="#d52b1e" />
          <rect width="30" height="13.4" fill="#0039a6" />
          <rect width="30" height="6.7" fill="#ffffff" />
        </>
      )}
      {code === 'en' && (
        <>
          <rect width="30" height="20" fill="#012169" />
          <path d="M0 0l30 20M30 0L0 20" stroke="#ffffff" strokeWidth="4" />
          <path d="M0 0l30 20M30 0L0 20" stroke="#c8102e" strokeWidth="1.6" />
          <path d="M15 0v20M0 10h30" stroke="#ffffff" strokeWidth="6.5" />
          <path d="M15 0v20M0 10h30" stroke="#c8102e" strokeWidth="3.8" />
        </>
      )}
    </svg>
  )
}

/** Language menu in the header: the current flag, and a list of the others. */
export function LanguageSwitch() {
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !root.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div className="lang" ref={root}>
      <button
        type="button"
        className="lang-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Language: ${LANGUAGES.find((language) => language.code === lang)?.name}`}
        onClick={() => setOpen((current) => !current)}
      >
        <Flag code={lang} />
        <span>{lang.toUpperCase()}</span>
      </button>
      {open && (
        <ul className="lang-menu card" role="menu">
          {LANGUAGES.map((language) => (
            <li key={language.code} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={language.code === lang}
                className={language.code === lang ? 'active' : undefined}
                lang={language.code}
                onClick={() => {
                  setLang(language.code)
                  setOpen(false)
                }}
              >
                <Flag code={language.code} />
                {language.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
