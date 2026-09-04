'use client'
// ============================================================
// ONE FORM, FOR THE LIBRARY, AN ENQUIRY AND THE NEWSLETTER.
//
// The source is passed in and sent to the server, which checks it against a
// fixed list before deciding a tag. The browser cannot file a visitor under a
// segment it invents.
//
// It degrades honestly. If the list is unreachable the visitor is told what
// actually happened rather than shown a success message that is not true,
// and the address still reaches Habib by email so nothing is lost.
// ============================================================
import { useState } from 'react'
import { C } from '@/components/site/tokens'

export const FORM_CSS = `
.hb .fm{display:flex;flex-direction:column;gap:16px;max-width:560px}
.hb .fm label{font-size:14px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  display:block;margin-bottom:8px}
.hb .fm input,.hb .fm textarea{
  width:100%;font-family:inherit;font-size:18px;padding:15px 16px;border:2px solid rgba(18,34,44,.22);
  background:#fff;color:${C.ink};border-radius:0}
.hb .fm textarea{min-height:150px;resize:vertical;line-height:1.5}
.hb .fm input:focus,.hb .fm textarea:focus{outline:none;border-color:${C.cyan}}
.hb .fm .row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.hb .fm .note{font-size:15px;line-height:1.5;opacity:.72}
.hb .fm .err{font-size:17px;font-weight:600;color:#b3261e}
.hb .done{border-left:5px solid ${C.green};padding:20px 24px;background:rgba(46,125,50,.09)}
.hb .done h4{margin-bottom:8px}
@media (max-width:600px){.hb .fm .row{grid-template-columns:1fr}}
`

export default function CaptureForm({
  source, cta, withOrg = false, withMessage = false, note, done,
}: {
  source: 'library' | 'enquiry' | 'newsletter' | 'intel'
  cta: string
  withOrg?: boolean
  withMessage?: boolean
  note?: string
  done: { head: string; body: string }
}) {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [organisation, setOrganisation] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<null | { subscribed: boolean }>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim()) { setError('An email address is needed.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, firstName, organisation, message, source,
          referrer: typeof window !== 'undefined' ? window.location.href : '',
        }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out?.error || 'That did not go through. Try again in a moment.'); return }
      setSent(out)
    } catch {
      setError('That did not go through. Check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="done">
        <h4>{done.head}</h4>
        <p style={{ opacity: 0.86 }}>
          {sent.subscribed
            ? done.body
            : 'That has reached me directly. The mailing list did not take it just now, so I will add you by hand and it may take a little longer than usual.'}
        </p>
      </div>
    )
  }

  return (
    <form className="fm" onSubmit={submit}>
      <div>
        <label htmlFor={`em-${source}`}>Email address</label>
        <input id={`em-${source}`} type="email" required autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@organisation.org" />
      </div>
      <div className="row">
        <div>
          <label htmlFor={`fn-${source}`}>First name</label>
          <input id={`fn-${source}`} type="text" autoComplete="given-name"
            value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Optional" />
        </div>
        {withOrg ? (
          <div>
            <label htmlFor={`or-${source}`}>Organisation</label>
            <input id={`or-${source}`} type="text" autoComplete="organization"
              value={organisation} onChange={(e) => setOrganisation(e.target.value)} placeholder="Optional" />
          </div>
        ) : null}
      </div>
      {withMessage ? (
        <div>
          <label htmlFor={`ms-${source}`}>What is the situation</label>
          <textarea id={`ms-${source}`} value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder="What you do, who pays for it now, and what happens when that stops." />
        </div>
      ) : null}
      <div>
        <button className="btn" type="submit" disabled={busy}
          style={{ background: C.ink, color: C.cream, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Sending...' : cta}
        </button>
      </div>
      {error ? <p className="err">{error}</p> : null}
      <p className="note">
        {note || 'Your address goes on the Viable by Design list and nowhere else. Every email has an unsubscribe link.'}
      </p>
    </form>
  )
}
