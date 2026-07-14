'use client'
// Public, no-login page for redeeming a coach-issued external access
// grant -- an investor, programme officer, DFI, or subscriber lands here
// from a link the coach handed them. Talks only to
// /api/access-grant/[token] (service-role, token-authenticated). Every
// scope (client / portfolio / segment) now returns a Word document, so
// this page has one job: confirm the recipient (if the coach required
// it), then trigger the download.
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

const C = {
  cream: 'var(--cv-cream)', card: 'var(--cv-card)',
  border: 'var(--cv-border)', slate: 'var(--cv-slate)',
  green: 'var(--cv-green)', red: 'var(--cv-red)',
  header: 'var(--cv-header)',
}

export default function AccessGrantPage() {
  const params = useParams()
  const token = params?.token as string

  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState<any>(null)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/access-grant/${token}`).then(r => r.json()).then(json => {
      if (json.error) setError(json.error)
      else setInfo(json)
      setLoading(false)
    }).catch(() => { setError('Could not load this link.'); setLoading(false) })
  }, [token])

  async function redeem(e?: React.FormEvent) {
    e?.preventDefault()
    setSubmitting(true)
    setError('')
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
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="(.+)"/)
      const fileName = match ? match[1] : 'Clearview_Document.docx'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = fileName
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setDownloaded(true)
    } catch {
      setError('Could not open this link.')
    }
    setSubmitting(false)
  }

  const page: React.CSSProperties = { minHeight: '100vh', background: C.cream, fontFamily: "'Segoe UI',system-ui,sans-serif" }
  const wrap: React.CSSProperties = { maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem' }
  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '1.75rem 2rem', boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)' }

  if (loading) return <div style={page}><div style={wrap}><div style={card}>Loading…</div></div></div>

  if (error && !info) return (
    <div style={page}><div style={wrap}>
      <div style={{ ...card, borderLeft: `4px solid ${C.red}` }}>
        <div style={{ fontWeight: 700, color: C.red, marginBottom: '0.4rem' }}>⚠ {error}</div>
        <div style={{ color: C.slate, fontSize: '0.95rem' }}>If you believe this is a mistake, contact the person who sent you this link.</div>
      </div>
    </div></div>
  )

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

          {downloaded ? (
            <div style={{ color: C.green, fontWeight: 600 }}>✓ Your download has started. You can close this page.</div>
          ) : (
            <form onSubmit={redeem}>
              {info.requiresEmail && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.88rem', color: C.slate, marginBottom: '0.3rem' }}>
                    Confirm the email address this link was sent to
                  </label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={{ width: '100%', maxWidth: 360, padding: '0.55rem 0.7rem', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: '0.95rem' }} />
                </div>
              )}
              {error && <div style={{ color: C.red, fontSize: '0.9rem', marginBottom: '0.8rem' }}>⚠ {error}</div>}
              <button type="submit" disabled={submitting}
                style={{ background: C.header, color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.3rem', fontSize: '0.98rem', fontWeight: 600, cursor: 'pointer' }}>
                {submitting ? 'Generating…' : info.scopeType === 'client' ? 'Download Investment Brief' : 'Download Portfolio Intelligence'}
              </button>
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
