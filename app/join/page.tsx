// @ts-nocheck
'use client'
// ============================================================
// Where somebody types the code that is on the screen at the front.
//
// This is the whole reason the code exists. The address of this page is short
// enough to say out loud and type without a mistake, and once you are here the
// only thing to do is enter eight characters. Everything else about joining a
// session happens after that, on the session's own page, unchanged.
//
// IT IS DELIBERATELY THE PLAINEST PAGE IN THE PLATFORM. Somebody arrives here
// during a session, with the room waiting, on a device nobody has set up. One
// field, one button, no navigation, no account, nothing to read.
//
// A CODE IS SHOWN AS TYPED, not silently corrected. The field accepts spaces,
// hyphens and lower case, because a code said out loud gets written down with a
// dash in it and phone keyboards capitalise whatever they like. It does not
// accept a character the alphabet leaves out: a code with an O in it was
// misread, and quietly turning it into a zero could hand somebody a different
// session, which is far worse than saying it is not right.
// ============================================================

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { JOIN_CODE_LENGTH, normaliseJoinCode } from '@/lib/join-code'

const C = {
  bg: 'var(--cv-bg, #F4F1EA)',
  card: 'var(--cv-card, #FFFFFF)',
  border: 'var(--cv-border, #D8D2C6)',
  navy: 'var(--cv-navy, #1B2A3A)',
  slate: 'var(--cv-slate, #4A5A6A)',
  teal: 'var(--cv-teal, #1A9DAA)',
  red: 'var(--cv-red, #C0392B)',
}

export default function JoinPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const ready = Boolean(normaliseJoinCode(code))

  async function go(e) {
    e.preventDefault()
    const clean = normaliseJoinCode(code)
    if (!clean || busy) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/session-join?code=${encodeURIComponent(clean)}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.token) {
        setErr(json?.error || 'That code does not open anything. Check it on the screen and try again.')
        setBusy(false)
        return
      }
      router.push(`/session/${json.token}`)
    } catch {
      setErr('Could not reach the session. Check the connection and try again.')
      setBusy(false)
    }
  }

  return (
    <main style={{
      minHeight: '100vh', background: C.bg, color: C.navy,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.25rem', fontFamily: "'Segoe UI',system-ui,sans-serif",
    }}>
      <div style={{
        width: '100%', maxWidth: 460, background: C.card,
        border: `1px solid ${C.border}`, borderRadius: 14, padding: '1.75rem 1.5rem',
      }}>
        <h1 style={{
          fontFamily: 'Georgia,serif', fontSize: '1.5rem', fontWeight: 600,
          margin: 0, lineHeight: 1.2,
        }}>Join the session</h1>
        <p style={{ color: C.slate, fontSize: '1rem', lineHeight: 1.55, margin: '0.6rem 0 1.4rem' }}>
          Type the code that is on the screen at the front of the room. You do not need an account
          and there is nothing to install.
        </p>

        <form onSubmit={go}>
          <label htmlFor="join-code" style={{
            fontFamily: 'monospace', fontSize: '0.7rem', letterSpacing: '.12em',
            textTransform: 'uppercase', color: C.slate, display: 'block', marginBottom: '0.4rem',
          }}>The code</label>
          <input
            id="join-code"
            value={code}
            onChange={(e) => { setCode(e.target.value); setErr(null) }}
            placeholder="XXXX-XXXX"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            // A code is short, and a field that scrolls sideways while somebody
            // types eight characters is a field they mistrust.
            maxLength={JOIN_CODE_LENGTH + 4}
            style={{
              width: '100%', boxSizing: 'border-box',
              fontFamily: 'monospace', fontSize: '1.5rem', letterSpacing: '.18em',
              textAlign: 'center', textTransform: 'uppercase',
              padding: '0.75rem 0.6rem', borderRadius: 10,
              border: `1px solid ${err ? C.red : C.border}`,
              background: 'var(--cv-bg-2, #FAFAF7)', color: C.navy,
            }}
          />

          {err ? (
            <p role="alert" style={{ color: C.red, fontSize: '0.95rem', margin: '0.7rem 0 0' }}>{err}</p>
          ) : null}

          <button
            type="submit"
            disabled={!ready || busy}
            style={{
              width: '100%', marginTop: '1.1rem', padding: '0.7rem 1rem',
              fontFamily: 'monospace', fontSize: '1rem', fontWeight: 700,
              border: 'none', borderRadius: 10,
              background: ready && !busy ? C.teal : C.border,
              color: ready && !busy ? 'var(--cv-on-accent, #FFFFFF)' : C.slate,
              cursor: ready && !busy ? 'pointer' : 'default',
            }}
          >{busy ? 'Opening...' : 'Join'}</button>
        </form>

        <p style={{ color: C.slate, fontSize: '0.88rem', lineHeight: 1.5, margin: '1.2rem 0 0' }}>
          Eight characters. Capitals and the dash do not matter. If you were sent a full link
          instead, open that and you will not need a code at all.
        </p>
      </div>
    </main>
  )
}
