'use client'
// Public, no-login page for redeeming a coach-issued external access
// grant -- an investor, programme officer, DFI, or subscriber lands here
// from a link the coach handed them. Talks only to
// /api/access-grant/[token] (service-role, token-authenticated).
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

const C = {
  navy: 'var(--cv-navy)', cream: 'var(--cv-cream)', card: 'var(--cv-card)',
  border: 'var(--cv-border)', slate: 'var(--cv-slate)',
  cyan: 'var(--cv-cyan)', green: 'var(--cv-green)', amber: 'var(--cv-amber)', red: 'var(--cv-red)',
  header: 'var(--cv-header)',
}

function fmtMoney(n: number | null, cc: string) {
  if (n === null || n === undefined) return 'n/a'
  const v = Math.round(Math.abs(n))
  const s = v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()
  return `${cc} ${s}`
}

const DIM_LABELS: Record<string, string> = {
  marketOpportunity: 'Market Opportunity', visibility: 'Visibility', trust: 'Trust',
  profitability: 'Profitability', capacity: 'Capacity', resilience: 'Resilience', compliance: 'Compliance',
}
const FAC_LABELS: Record<string, string> = {
  credit: 'Credit', grant: 'Grant', equity: 'Equity', consignment: 'Consignment', recoverableGrant: 'Recoverable Grant',
}

export default function AccessGrantPage() {
  const params = useParams()
  const token = params?.token as string

  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState<any>(null)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [portfolioData, setPortfolioData] = useState<any>(null)
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
      const contentType = response.headers.get('Content-Type') || ''
      if (!response.ok) {
        const errData = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {}
        setError(errData.error || 'Could not open this link.')
        setSubmitting(false)
        return
      }
      if (contentType.includes('application/json')) {
        const data = await response.json()
        setPortfolioData(data)
      } else {
        const blob = await response.blob()
        const disposition = response.headers.get('Content-Disposition') || ''
        const match = disposition.match(/filename="(.+)"/)
        const fileName = match ? match[1] : 'Investment_Brief.docx'
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = fileName
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
        setDownloaded(true)
      }
    } catch {
      setError('Could not open this link.')
    }
    setSubmitting(false)
  }

  const page: React.CSSProperties = { minHeight: '100vh', background: C.cream, fontFamily: "'Segoe UI',system-ui,sans-serif", color: C.navy }
  const wrap: React.CSSProperties = { maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }
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
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 1.5rem', color: '#fff', fontFamily: 'Georgia,serif', fontSize: '1.3rem', fontWeight: 700 }}>
          Canvas Coach ClearView
        </div>
      </div>
      <div style={wrap}>
        {!portfolioData && (
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
                  {submitting ? 'Opening…' : info.scopeType === 'client' ? 'Download Investment Brief' : 'View Portfolio Intelligence'}
                </button>
              </form>
            )}
          </div>
        )}

        {portfolioData && <PortfolioReadOnlyView data={portfolioData} />}

        <div style={{ textAlign: 'center', color: C.slate, fontSize: '0.82rem', marginTop: '2rem' }}>
          Powered by Canvas Coach ClearView · Confidential, shared with you directly by your coach
        </div>
      </div>
    </div>
  )
}

function PortfolioReadOnlyView({ data }: { data: any }) {
  const view = data.segment ? data.segment.segment : data.portfolio
  const currencies = Object.keys(view.currentFundAbsorption || {})
  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '1.5rem 1.75rem', marginBottom: '1.25rem' }
  const kpiRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '1.1rem' }
  const kpiCard: React.CSSProperties = { border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.9rem 1.1rem' }

  return (
    <div>
      <div style={card}>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.9rem' }}>
          {data.scopeType === 'segment' ? 'Segment overview' : 'Portfolio overview'} · {view.totalBusinesses} businesses
        </div>
        <div style={kpiRow}>
          <div style={kpiCard}><div style={{ fontSize: '0.78rem', color: C.slate, textTransform: 'uppercase' }}>Avg Investment Readiness</div><div style={{ fontFamily: 'Georgia,serif', fontSize: '1.4rem', fontWeight: 700 }}>{Math.round(view.avgIRScore)}/30</div></div>
          <div style={kpiCard}><div style={{ fontSize: '0.78rem', color: C.slate, textTransform: 'uppercase' }}>Avg Verification Confidence</div><div style={{ fontFamily: 'Georgia,serif', fontSize: '1.4rem', fontWeight: 700 }}>{Math.round(view.avgConfidenceScore)}/100</div></div>
          <div style={kpiCard}><div style={{ fontSize: '0.78rem', color: C.slate, textTransform: 'uppercase' }}>Avg Liquidity Readiness</div><div style={{ fontFamily: 'Georgia,serif', fontSize: '1.4rem', fontWeight: 700 }}>{Math.round(view.avgLRSScore)}/100</div></div>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.7rem' }}>Readiness pipeline</div>
        <div style={kpiRow}>
          {(['investment_ready', 'near_ready', 'development_stage', 'pre_investment'] as const).map(stage => (
            <div key={stage} style={kpiCard}>
              <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.25rem', fontWeight: 700 }}>{view.readinessPipeline[stage]}</div>
              <div style={{ fontSize: '0.8rem', color: C.slate }}>{stage.replace(/_/g, ' ')} · {Math.round(view.readinessPipelinePct[stage])}%</div>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.7rem' }}>Seven-dimension average</div>
        {Object.entries(view.dimensionAverages || {}).map(([dim, avg]: [string, any]) => (
          <div key={dim} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
            <div style={{ width: 150, fontSize: '0.88rem' }}>{DIM_LABELS[dim] || dim}</div>
            <div style={{ flex: 1, background: 'var(--cv-track)', borderRadius: 4, height: 12 }}>
              <div style={{ width: `${Math.max(2, avg)}%`, background: C.cyan, height: '100%', borderRadius: 4 }} />
            </div>
            <div style={{ width: 36, fontSize: '0.84rem', color: C.slate, textAlign: 'right' }}>{Math.round(avg)}</div>
          </div>
        ))}
      </div>

      {currencies.length > 0 && (
        <div style={card}>
          <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.3rem' }}>Current fund absorption capacity</div>
          <div style={{ fontSize: '0.85rem', color: C.slate, marginBottom: '0.8rem' }}>What businesses in view could absorb today, by type -- not a hypothetical ceiling.</div>
          {currencies.map(cc => (
            <div key={cc} style={{ marginBottom: '0.8rem' }}>
              <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: C.slate, marginBottom: '0.4rem' }}>{cc}</div>
              <div style={kpiRow}>
                {Object.entries(view.currentFundAbsorption[cc]).map(([type, val]: [string, any]) => (
                  <div key={type} style={kpiCard}>
                    <div style={{ fontSize: '0.76rem', color: C.slate }}>{FAC_LABELS[type] || type}</div>
                    <div style={{ fontSize: '1.02rem', fontWeight: 700 }}>{val === null ? 'n/a' : fmtMoney(val, cc)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {data.profiles && data.profiles.length > 0 && (
        <div style={card}>
          <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.3rem' }}>Businesses in this view</div>
          <div style={{ fontSize: '0.85rem', color: C.slate, marginBottom: '0.9rem' }}>Anonymised unless the business owner has consented to be named.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '1rem' }}>
            {data.profiles.map((p: any) => (
              <div key={p.refCode} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.8rem 1rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', fontFamily: p.isNamed ? 'inherit' : 'monospace' }}>{p.displayName}</div>
                <div style={{ fontSize: '0.8rem', color: C.slate, marginTop: '0.2rem' }}>{p.sector || 'Sector n/a'} · {p.sizeBracket}</div>
                <div style={{ fontSize: '0.8rem', color: C.slate, marginTop: '0.2rem' }}>{p.irTier} · IR {Math.round(p.irScore)}/30</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
