'use client'
// ============================================================
// THE PAGE THE WELCOME LETTER'S BUTTON OPENS
//
// WHY THIS EXISTS AT ALL. A sign-in link is single use. Microsoft Defender
// Safe Links, Mimecast URL Protect and Proofpoint URL Defense all fetch a link
// with a GET to scan it before the recipient ever sees the message. On a
// single-use link that scan spends the token, and the human then clicks and is
// told the link has expired.
//
// The people this letter is written for are exactly the people behind those
// gateways: a funder's procurement lead, a finance lead, a country
// representative. Left alone, the most likely outcome of the letter is that
// the most senior recipient clicks and gets an error, which is not a first
// impression that can be recovered.
//
// So the letter points here, and this page does nothing on load. A scanner
// fetches it, finds ordinary HTML, and stops. The token is only redeemed when
// somebody presses the button, which a scanner does not do.
// ============================================================
import { useEffect, useState } from 'react'

const C = {
  navy: '#1B2A41', cyan: '#00767A', cream: '#F5F0E8',
  card: '#FDFBF7', slate: '#4A5A6A', border: '#D8E0E8',
}

export default function WelcomePage() {
  const [target, setTarget] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // The real sign-in link travels in the fragment, which browsers never send
    // to a server and scanners generally do not follow. Nothing is redeemed by
    // reading it.
    try {
      const hash = window.location.hash.replace(/^#/, '')
      const fromHash = new URLSearchParams(hash).get('to')
      const fromQuery = new URLSearchParams(window.location.search).get('to')
      const raw = fromHash || fromQuery
      if (raw) {
        const url = new URL(decodeURIComponent(raw))
        // Only ever an https link, so this cannot be turned into a way of
        // sending a reader somewhere else entirely.
        if (url.protocol === 'https:') setTarget(url.toString())
      }
    } catch { /* no usable link; the page says so below */ }
    setReady(true)
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: C.cream, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div style={{ width: '100%', maxWidth: 460, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '2rem' }}>
        <div style={{ fontSize: '0.78rem', letterSpacing: '0.15em', color: C.cyan, marginBottom: '0.5rem' }}>THE CANVAS COACH</div>
        <h1 style={{ fontSize: '1.5rem', color: C.navy, margin: '0 0 0.75rem', fontWeight: 700 }}>Welcome to Clearview</h1>
        {ready && target ? (
          <>
            <p style={{ color: C.slate, lineHeight: 1.6, margin: '0 0 1.25rem' }}>
              Press the button below to sign in and set your password. It opens your engagement.
            </p>
            <a
              href={target}
              style={{ display: 'inline-block', background: C.cyan, color: '#fff', textDecoration: 'none', fontWeight: 600, padding: '0.8rem 1.4rem', borderRadius: 8 }}
            >Sign in and set your password</a>
            <p style={{ color: C.slate, fontSize: '0.85rem', lineHeight: 1.6, margin: '1.25rem 0 0' }}>
              If it says the link has expired, go to{' '}
              <a href="/" style={{ color: C.cyan }}>the sign in page</a> and press Forgot your password.
              A new link arrives straight away.
            </p>
          </>
        ) : ready ? (
          <p style={{ color: C.slate, lineHeight: 1.6, margin: 0 }}>
            This link is incomplete. Go to <a href="/" style={{ color: C.cyan }}>the sign in page</a> and
            press Forgot your password to get a new one.
          </p>
        ) : null}
      </div>
    </div>
  )
}
