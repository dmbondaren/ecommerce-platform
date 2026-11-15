import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { AuthProvider } from './app/auth'
import { useLang } from './app/i18n'
import { queryClient } from './app/queryClient'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Toasts } from './components/Toasts'
import { t } from './app/i18n'
import './styles.css'

/**
 * Texts are translated while rendering, so switching the language simply
 * renders the routes afresh: the `key` makes React rebuild them.
 */
function LocalizedApp() {
  const lang = useLang()
  return <App key={lang} />
}

const root = document.getElementById('root')
if (!root) throw new Error(t('Missing #root element'))

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <LocalizedApp />
          </BrowserRouter>
          <Toasts />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
