'use client'
// ============================================================
// STAGING / non-production safety banner
// ============================================================
// A thin, unmissable strip pinned to the top of every page whenever the app is
// NOT running against production. Its whole job is to stop anyone from ever
// confusing the safe test copy with the real thing — e.g. entering real client
// figures into staging, or "testing" a delete against production. On the real
// production site it renders NOTHING at all.
import { appEnv } from '@/lib/app-env'

export default function EnvBanner() {
  const env = appEnv()
  if (env === 'production') return null

  // Deliberately does NOT promise "this can never touch production" — that would
  // depend on the Supabase URL actually pointing at staging, which this banner
  // can't verify. Instead it tells people what to DO: treat this as a test area
  // and don't put real client information in it.
  const label =
    env === 'staging'
      ? 'STAGING — test copy for trying things out. Do NOT enter real client information here; use made-up data.'
      : 'LOCAL DEV — development build. Do not enter real client information.'

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 2147483647, // above everything, including dashboard headers/modals
        width: '100%',
        background: env === 'staging' ? '#B8860B' : '#4A5A6A',
        color: '#FFFFFF',
        fontFamily: 'monospace',
        fontSize: '0.78rem',
        fontWeight: 700,
        letterSpacing: '0.02em',
        textAlign: 'center',
        padding: '0.4rem 0.75rem',
        lineHeight: 1.3,
        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
      }}
    >
      {label}
    </div>
  )
}
