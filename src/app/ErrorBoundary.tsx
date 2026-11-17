import { Component, type ReactNode } from 'react'

// Covers render errors and a stale lazy-loaded chunk after deployment.
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed)
      return (
        <main className="page-content">
          <h1>Не удалось открыть страницу</h1>
          <p>Попробуйте обновить приложение.</p>
          <button className="button primary" onClick={() => window.location.reload()}>
            Обновить
          </button>
        </main>
      )
    return this.props.children
  }
}
