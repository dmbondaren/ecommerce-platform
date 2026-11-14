import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Changing this value (e.g. the current URL) clears a caught error. */
  resetKey?: string
}

interface State {
  error: Error | null
}

/**
 * Catches rendering errors below it, so that a bug in one screen shows a
 * message with a way out instead of a blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled rendering error', error, info.componentStack)
  }

  override componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  override render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="state" role="alert">
        <h2>Something went wrong on this page</h2>
        <p className="muted">The problem has been logged. You can try again or go back to the start page.</p>
        <div className="row">
          <button type="button" className="btn btn-primary btn-md" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <a className="btn btn-secondary btn-md" href="/">
            Go to start page
          </a>
        </div>
      </div>
    )
  }
}
