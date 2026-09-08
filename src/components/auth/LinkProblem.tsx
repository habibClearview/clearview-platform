'use client'
// ============================================================
// WHEN A SIGN-IN LINK DOES NOT WORK
//
// Supabase reports a bad or spent link by sending the reader to the redirect
// address with the reason in the URL FRAGMENT: #error=access_denied&
// error_code=otp_expired. A fragment is invisible to the server, so the page
// loaded normally and the recipient was shown an engagement they were not
// signed in to, with no explanation and nothing to press.
//
// That happened to real recipients of a real first letter. Whatever the cause
// of an expired link, being shown a working-looking page and left to guess is
// the part that costs credibility, and it is the part that is fixable in one
// place: this component sits in the root layout, watches for that fragment on
// every page, and turns it into an explanation and a way back in.
//
// It offers to send a fresh link to the address the reader types. The answer
// is the same whether or not that address has an account, because "no such
// account" is how somebody works out who a client's staff are.
// ============================================================
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const C = {
  navy: '#1B2A41', teal: '#00767A', cream: '#F5F0E8',
  card: '#FDFBF7', slate: '#4A5A6A', border: '#D8E0E8',
}

/** The reasons worth naming differently. Anything else gets the general words. */
function explain(code: string): string {
  if (code === 'otp_expired') {
    return 'That sign-in link has expired or has already been used. Links are single use, and some '
      + 'email systems open them automatically to check them, which uses them up before you get there.'
  }
  if (code === 'access_denied') {
    return 'That sign-in link could not be accepted. It has usually expired or already been used.'
  }
  return 'That sign-in link could not be accepted.'
}

export default function LinkProblem() {
  const [code, setCode] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    function read() {
      try {
        const hash = window.location.hash.replace(/^#/, '')
        if (!hash) return
        const p = new URLSearchParams(hash)
        const err = p.get('error_code') || p.get('error')
        if (err) setCode(err)
      } catch { /* nothing readable, nothing to say */ }
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  if (!code) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="There is a problem with that link"
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483646, background: C.cream,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
        fontFamily: 'var(--cv-font)', overflowY: 'auto',
      }}
    >
      <div style={{ width: '100%', maxWidth: 520, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '2rem' }}>
        <div style={{ fontSize: '0.78rem', letterSpacing: '0.15em', color: C.teal, marginBottom: '0.5rem' }}>THE CANVAS COACH</div>
        <h1 style={{ fontSize: '1.4rem', color: C.navy, margin: '0 0 0.75rem', fontWeight: 700 }}>
          Let us get you a new link
        </h1>
        <p style={{ color: C.slate, lineHeight: 1.6, margin: '0 0 1.25rem' }}>{explain(code)}</p>

        {sent ? (
          <div style={{ background: '#EEF7F1', border: '1px solid #1A7A4A', borderRadius: 8, padding: '0.85rem 1rem', color: C.navy, lineHeight: 1.6 }}>
            If that address has an account, a new link is on its way. It is good for 24 hours.
            Check the spam folder if it does not arrive within a few minutes.
          </div>
        ) : (
          <>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: C.navy, marginBottom: '0.35rem' }}>
              Your email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send() }}
              placeholder="you@organisation.org"
              autoComplete="email"
              style={{
                width: '100%', padding: '0.65rem 0.8rem', border: `1px solid ${C.border}`,
                borderRadius: 8, fontSize: '0.95rem', fontFamily: 'inherit', boxSizing: 'border-box',
                background: '#fff', color: C.navy, marginBottom: '0.9rem',
              }}
            />
            <button
              type="button"
              onClick={send}
              style={{
                width: '100%', padding: '0.8rem', border: 0, borderRadius: 8, background: C.teal,
                color: '#fff', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Send me a new link</button>
          </>
        )}

        <p style={{ color: C.slate, fontSize: '0.85rem', lineHeight: 1.6, margin: '1.25rem 0 0' }}>
          Nothing is wrong with your account, and you have not lost anything. If it still will not let you
          in, reply to the email that brought you here and it will be sorted out.
        </p>
      </div>
    </div>
  )

  function send() {
    const address = email.trim()
    if (!address) return
    // Answered the same either way, and not waited on: the reply does not
    // depend on the request and a slow provider should not look like a failure.
    setSent(true)
    supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/reset-password`,
    }).catch(() => undefined)
  }
}
