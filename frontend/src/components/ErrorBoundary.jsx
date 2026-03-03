import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="loading-screen">
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Something went wrong</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            An unexpected error occurred. Try refreshing.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn--primary" onClick={() => window.location.reload()}>
              Refresh
            </button>
            <button className="btn btn--ghost" onClick={() => { window.location.href = '/login' }}>
              Back to Login
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
