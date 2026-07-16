'use client'
// A guard rail: if any section inside it throws while rendering, show a small
// contained message and a way to recover, instead of letting the error white-
// screen the entire dashboard. Keeps one broken panel from blocking access to
// everything else -- important now that real client data is flowing in.
import React from 'react'

interface Props { children: React.ReactNode; label?: string; onReset?: () => void }
interface State { hasError: boolean }

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Surfaced in the browser console (and any error logging) so the real
    // cause is still visible for a fix -- we hide the crash from the user,
    // not from ourselves.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', this.props.label || '', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    const btn: React.CSSProperties = {
      fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 600, padding: '0.5rem 1rem',
      borderRadius: 6, border: '1px solid var(--cv-border)', background: 'transparent',
      color: 'var(--cv-navy)', cursor: 'pointer',
    }
    return (
      <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.25rem', fontWeight: 700, color: 'var(--cv-navy)', marginBottom: '0.5rem' }}>
          This section couldn&rsquo;t load
        </div>
        <div style={{ color: 'var(--cv-slate)', fontSize: '1rem', lineHeight: 1.6, maxWidth: '46ch', margin: '0 auto 1.25rem' }}>
          Something went wrong showing this part{this.props.label ? ` (${this.props.label})` : ''}. The rest of your
          dashboard is unaffected — switch to another tab, or try again.
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button style={btn} onClick={() => { this.setState({ hasError: false }); this.props.onReset?.() }}>Try again</button>
          <button style={btn} onClick={() => { if (typeof window !== 'undefined') window.location.reload() }}>Reload page</button>
        </div>
      </div>
    )
  }
}
