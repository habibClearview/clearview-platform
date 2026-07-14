'use client'
// Public, no-login page for redeeming a coach-issued external access
// grant -- an investor, programme officer, DFI, or subscriber lands here
// from a link the coach handed them. Talks only to
// /api/access-grant/[token] (service-role, token-authenticated).
//
// When the platform's email sending is configured (info.otpAvailable),
// this is a real two-step flow: enter an email, receive a one-time code
// there, enter the code to unlock the document. That proves the visitor
// actually controls the inbox, not just that they typed a string that
// happens to match. If email sending isn't configured, this falls back
// to a single "enter the email this was sent to" step (or, for a grant
// with no fixed email, straight to download) -- matching the previous
// behaviour rather than breaking access.
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

const C = {
  cream: 'var(--cv-cream)', card: 'var(--cv-card)',
  border: 'var(--cv-border)', slate: 'var(--cv-slate)',
  green: 'var(--cv-green)', red: 'var(--cv-red)',
  header: 'var(--cv-header)',
}

function triggerDownload(blob: Blob, disposition: string) {
  const match = disposition.match(/filename="(.+)"/)
  const fileName = match ? match[1] : 'Clearview_Document.docx'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = fileName
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function AccessGrantPage() {
  const params = useParams()
  const token = params?.token as string

  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState<any>(null)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState<'start' | 'code' | 'done'>('start')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/access-grant/${token}`).then(r => r.json()).then(json => {
      if (json.error) setError(json.error)
      else setInfo(json)
      setLoading(false)
    }).catch(() => { setError('Could not load this link.'); setLoading(false) })
  }, [token])

  // No email service configured on the platform -- one step, same as
  // before: confirm the email if the coach set one (or nothing to
  // confirm at all), then download.
  async function directRedeem(e?: React.FormEvent) {
    e?.preventDefault()
    setSubmitting(true); setError('')
    try {
      const response = await fetch(`/api/access-grant/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email || undefined }),
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        setError(errData.error || 'Could not open this link.')
        setSubmitting(false)
        return
      }
      triggerDownload(await response.blob(), response.headers.get('Content-Disposition') || '')
      setPhase('done')
    } catch { setError('Could not open this link.') }
    setSubmitting(false)
  }

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault()
    if (!email.trim()) { setError('Enter your email address.'); return }
    setSubmitting(true); setError('')
    try {
      const response = await fetch(`/api/access-grant/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'request', email }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) { setError(json.error || 'Could not send the code.'); setSubmitting(false); return }
      setPhase('code')
    } catch { setError('Could not send the code.') }
    setSubmitting(false)
  }

  async function verifyCode(e?: React.FormEvent) {
    e?.preventDefault()
    if (!code.trim()) { setError('Enter the code from your email.'); return }
    setSubmitting(true); setError('')
    try {
      const response = await fetch(`/api/access-grant/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'verify', email, code }),
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        setError(errData.error || 'Could not verify that code.')
        if (errData.expired) setPhase('start')
        setSubmitting(false)
        return
      }
      triggerDownload(await response.blob(), response.headers.get('Content-Disposition') || '')
      setPhase('done')
    } catch { setError('Could not verify that code.') }
    setSubmitting(false)
  }

  const page: React.CSSProperties = { minHeight: '100vh', background: C.cream, fontFamily: "'Segoe UI',system-ui,sans-serif" }
  const wrap: React.CSSProperties = { maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem' }
  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '1.75rem 2rem', boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)' }
  const inputStyle: React.CSSProperties = { width: '100%', maxWidth: 360, padding: '0.55rem 0.7rem', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: '0.95rem' }
  const btnStyle: React.CSSProperties = { background: C.header, color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.3rem', fontSize: '0.98rem', fontWeight: 600, cursor: 'pointer' }

  if (loading) return <div style={page}><div style={wrap}><div style={card}>Loading…</div></div></div>

  if (error && !info) return (
    <div style={page}><div style={wrap}>
      <div style={{ ...card, borderLeft: `4px solid ${C.red}` }}>
        <div style={{ fontWeight: 700, color: C.red, marginBottom: '0.4rem' }}>⚠ {error}</div>
        <div style={{ color: C.slate, fontSize: '0.95rem' }}>If you believe this is a mistake, contact the person who sent you this link.</div>
      </div>
    </div></div>
  )

  const downloadLabel = info.scopeType === 'client' ? 'Download Investment Brief' : 'Download Portfolio Intelligence'

  return (
    <div style={page}>
      <div style={{ background: C.header, padding: '1.5rem 0', marginBottom: '2rem' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 1.5rem', color: '#fff', fontFamily: 'Georgia,serif', fontSize: '1.3rem', fontWeight: 700 }}>
          Canvas Coach ClearView
        </div>
      </div>
      <div style={wrap}>
        <div style={card}>
          <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.4rem' }}>
            You've been granted access
          </div>
          <div style={{ color: C.slate, fontSize: '0.98rem', marginBottom: '1.2rem' }}>
            {info.granteeName} · {info.grantTypeLabel} · {info.scopeDescription}
          </div>

          {phase === 'done' ? (
            <div style={{ color: C.green, fontWeight: 600 }}>✓ Your download has started. You can close this page.</div>
          ) : !info.otpAvailable ? (
            <form onSubmit={directRedeem}>
              {info.requiresEmail && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.88rem', color: C.slate, marginBottom: '0.3rem' }}>Confirm the email address this link was sent to</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} />
                </div>
              )}
              {error && <div style={{ color: C.red, fontSize: '0.9rem', marginBottom: '0.8rem' }}>⚠ {error}</div>}
              <button type="submit" disabled={submitting} style={btnStyle}>{submitting ? 'Generating…' : downloadLabel}</button>
            </form>
          ) : phase === 'start' ? (
            <form onSubmit={requestCode}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.88rem', color: C.slate, marginBottom: '0.3rem' }}>Enter your email address -- we'll send you a one-time code</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} />
              </div>
              {error && <div style={{ color: C.red, fontSize: '0.9rem', marginBottom: '0.8rem' }}>⚠ {error}</div>}
              <button type="submit" disabled={submitting} style={btnStyle}>{submitting ? 'Sending…' : 'Send code'}</button>
            </form>
          ) : (
            <form onSubmit={verifyCode}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.88rem', color: C.slate, marginBottom: '0.3rem' }}>Enter the 6-digit code sent to {email}</label>
                <input type="text" inputMode="numeric" required value={code} onChange={e => setCode(e.target.value)} placeholder="123456" style={{ ...inputStyle, maxWidth: 160, letterSpacing: '0.2em', fontSize: '1.1rem', textAlign: 'center' }} />
              </div>
              {error && <div style={{ color: C.red, fontSize: '0.9rem', marginBottom: '0.8rem' }}>⚠ {error}</div>}
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="submit" disabled={submitting} style={btnStyle}>{submitting ? 'Verifying…' : downloadLabel}</button>
                <button type="button" onClick={() => requestCode()} disabled={submitting} style={{ background: 'none', border: 'none', color: C.slate, fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}>Resend code</button>
              </div>
            </form>
          )}
        </div>

        <div style={{ textAlign: 'center', color: C.slate, fontSize: '0.82rem', marginTop: '2rem' }}>
          Powered by Canvas Coach ClearView · Confidential, shared with you directly by your coach
        </div>
      </div>
    </div>
  )
}
