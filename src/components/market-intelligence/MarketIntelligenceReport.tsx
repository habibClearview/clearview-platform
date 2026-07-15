'use client'
// Read-only Market Intelligence report, rendered from a PortfolioViewData
// payload. Used by the public /access/[token] page so a subscriber can browse
// the live intelligence online (scoped to their grant), not just download the
// Word version. Presentational only -- no data fetching, no coach controls.
import React from 'react'

const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', teal: 'var(--cv-teal)', cream: 'var(--cv-cream)',
  card: 'var(--cv-card)', slate: 'var(--cv-slate)', border: 'var(--cv-border-soft)',
  green: 'var(--cv-green)', amber: 'var(--cv-amber)', red: 'var(--cv-red)', navyOn: 'var(--cv-on-accent)',
}
const LRS_DIM_LABELS: Record<string, string> = {
  marketOpportunity: 'Market Opportunity', visibility: 'Visibility', trust: 'Trust',
  profitability: 'Profitability', capacity: 'Capacity', resilience: 'Resilience', compliance: 'Compliance',
}
const READY_LABELS: Record<string, string> = {
  pre_investment: 'Pre-Investment', development_stage: 'Development', near_ready: 'Near Ready', investment_ready: 'Investment Ready',
}
const FAC_LABELS: Record<string, string> = {
  credit: 'Credit / debt', grant: 'Grant', equity: 'Equity', consignment: 'Consignment', recoverableGrant: 'Recoverable grant',
}

const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '1.2rem 1.4rem', marginBottom: '1.15rem' }
const h2: React.CSSProperties = { fontFamily: 'Georgia,serif', fontSize: '1.15rem', fontWeight: 700, color: C.navy, margin: '0 0 0.2rem' }
const lead: React.CSSProperties = { fontSize: '0.9rem', color: C.slate, margin: '0 0 0.9rem' }
const kicker: React.CSSProperties = { fontFamily: 'monospace', fontSize: '0.68rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: C.teal, marginBottom: '0.35rem' }

const med = (ms: any, unit = '', dec = 0) => ms && ms.median !== null && ms.median !== undefined ? `${ms.median.toFixed(dec)}${unit}` : '—'
const fmtMoney = (n: number, cc: string) => {
  const a = Math.abs(n)
  const s = a >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : a >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : `${Math.round(n)}`
  return `${cc} ${s}`
}

function Dist({ label, summary, unit, decimals = 0, note, roadmap, roadmapNote }: { label: string; summary?: any; unit?: string; decimals?: number; note?: string; roadmap?: boolean; roadmapNote?: string }) {
  if (roadmap) return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.9rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: C.slate, fontWeight: 600 }}>{label}</span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.64rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: 20, background: 'var(--cv-tint-amber)', color: C.amber, border: `1px solid ${C.amber}` }}>roadmap</span>
      </div>
      <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.5rem', fontWeight: 700, color: C.slate }}>—</div>
      <div style={{ fontSize: '0.74rem', color: C.slate, marginTop: 6 }}>{roadmapNote || 'Needs a short per-period customer input.'}</div>
    </div>
  )
  const s = summary
  const has = !!(s && s.count > 0 && s.median !== null)
  const vals: number[] = has ? s.values : []
  const min = has ? Math.min(...vals) : 0, max = has ? Math.max(...vals) : 1
  const bins = 7, counts = Array(bins).fill(0)
  vals.forEach(v => { const idx = max === min ? Math.floor(bins / 2) : Math.min(bins - 1, Math.floor((v - min) / (max - min) * bins)); counts[idx]++ })
  const cMax = Math.max(1, ...counts)
  const medBin = has ? (max === min ? Math.floor(bins / 2) : Math.min(bins - 1, Math.floor((s.median - min) / (max - min) * bins))) : -1
  const fv = (v: number) => `${v.toFixed(decimals)}${unit || ''}`
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.9rem 1rem' }}>
      <div style={{ fontFamily: 'monospace', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.5rem', fontWeight: 700, color: C.navy, lineHeight: 1.1 }}>{has ? fv(s.median) : '—'}<span style={{ fontSize: '0.78rem', color: C.slate, fontWeight: 400 }}> median</span></div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 32, marginTop: 6 }}>
        {counts.map((c, i) => <div key={i} style={{ flex: 1, height: `${Math.max(6, (c / cMax) * 100)}%`, background: i === medBin ? C.teal : 'var(--cv-tint-cyan)', borderRadius: '2px 2px 0 0' }} />)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: '0.64rem', color: C.slate, marginTop: 2 }}>
        <span>{has ? fv(min) : ''}</span><span>{has ? fv(max) : ''}</span>
      </div>
      <div style={{ fontSize: '0.74rem', color: C.slate, marginTop: 4 }}>{has ? `${s.count} business${s.count === 1 ? '' : 'es'}` : 'no data yet'}{note ? ` · ${note}` : ''}</div>
    </div>
  )
}

const thStyle = (left: boolean): React.CSSProperties => ({ background: C.navy, color: C.navyOn, fontFamily: 'monospace', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.03em', padding: '8px 9px', textAlign: left ? 'left' : 'right', whiteSpace: 'nowrap' })
const tdStyle = (left: boolean, bold = false): React.CSSProperties => ({ padding: '7px 9px', textAlign: left ? 'left' : 'right', color: bold ? C.navy : C.slate, fontWeight: bold ? 700 : 400 })

export default function MarketIntelligenceReport({ data, scopeDescription }: { data: any; scopeDescription?: string }) {
  if (!data || !data.portfolio) return <div style={{ padding: '2rem', color: C.slate }}>No intelligence data available.</div>
  const view = data.segment ? data.segment.segment : data.portfolio
  const perfSum = (data.segmentPerformanceSummary || data.performanceSummary) || null
  const bySector = data.performanceBySector || []
  const readyCount = view.readinessPipeline?.investment_ready ?? 0
  const weakDim = view.mostCommonWeakDimension ? LRS_DIM_LABELS[view.mostCommonWeakDimension] : null
  const currencies = Object.keys(view.currentFundAbsorption || {})
  const grid4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }
  const gsign = (m: any) => m && m.median !== null ? `${m.median > 0 ? '+' : ''}${m.median}%` : '—'

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'linear-gradient(160deg,var(--cv-navy),#22344f)', color: '#eef4f7', borderRadius: 14, padding: '1.5rem 1.7rem', marginBottom: '1.15rem', borderBottom: `3px solid ${C.cyan}` }}>
        <div style={{ fontFamily: 'monospace', fontSize: '0.68rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: C.cyan }}>ClearView · Market Intelligence</div>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.7rem', fontWeight: 700, margin: '0.3rem 0 0.2rem' }}>Portfolio Performance &amp; Investability</div>
        <div style={{ color: '#b9c7d4', fontSize: '0.9rem' }}>{scopeDescription || 'Whole portfolio'} · {view.totalBusinesses} business{view.totalBusinesses === 1 ? '' : 'es'}</div>
      </div>

      {/* Finding */}
      <div style={{ ...card, borderLeft: `4px solid ${C.cyan}` }}>
        <div style={kicker}>The finding</div>
        <div style={{ fontSize: '1.02rem', lineHeight: 1.6, color: C.navy }}>
          Across <b>{view.totalBusinesses}</b> business{view.totalBusinesses === 1 ? '' : 'es'}, <b>{readyCount}</b> {readyCount === 1 ? 'is' : 'are'} investment-ready today
          {perfSum && perfSum.revenueGrowth.median !== null ? <> — median revenue growth is <b style={{ color: C.teal }}>{gsign(perfSum.revenueGrowth)}</b></> : null}
          {perfSum && perfSum.dscr.count > 0 ? <>, and <b>{perfSum.bankableCount}</b> can service new debt at a comfortable 1.5×</> : null}
          {weakDim ? <>. The weakest readiness dimension is <b style={{ color: C.red }}>{weakDim}</b>.</> : '.'}
        </div>
      </div>

      {/* Trust band */}
      <div style={grid4}>
        {[['' + data.snapshotCount + ' models', 'Full standardised financial models, not survey estimates.'],
          ['90%+', 'have no credit-agency rating — the coverage gap this fills.'],
          ['Independent', 'Model-derived; no payment relationship with the business rated.'],
          ['Median-based', "One outlier can't distort a benchmark; only present values are counted."]].map(([t, d], i) => (
          <div key={i} style={{ background: 'var(--cv-tint-cyan)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.75rem 0.9rem' }}>
            <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.15rem', fontWeight: 700, color: C.navy }}>{t}</div>
            <div style={{ fontSize: '0.74rem', color: C.slate }}>{d}</div>
          </div>
        ))}
      </div>

      {/* Performance */}
      {perfSum && (
        <div style={{ ...card, marginTop: '1.15rem' }}>
          <div style={kicker}>Performance</div>
          <div style={h2}>The numbers that decide bankability</div>
          <p style={lead}>Each figure is the median shown over the spread across businesses — the distribution, not one average, is what a lender reads.</p>
          <div style={grid4}>
            <Dist label="Revenue growth" summary={perfSum.revenueGrowth} unit="%" />
            <Dist label="Cost ratio" summary={perfSum.costRatio} unit="%" />
            <Dist label="EBITDA margin" summary={perfSum.ebitdaMargin} unit="%" />
            <Dist label="Debt coverage (DSCR)" summary={perfSum.dscr} unit="×" decimals={1} note={`${perfSum.bankableCount} bankable (1.5×+)`} />
          </div>
        </div>
      )}

      {/* Business quality & durability + sector table */}
      {perfSum && (
        <div style={card}>
          <div style={kicker}>Business quality &amp; durability</div>
          <div style={h2}>Is the growth real, efficient and durable?</div>
          <div style={{ ...grid4, marginBottom: 12 }}>
            <Dist label="Rule of 40" summary={perfSum.ruleOf40} note={`${perfSum.ruleOf40StrongCount} score 40+`} />
            <Dist label="Burn multiple" summary={perfSum.burnMultiple} unit="×" decimals={1} note="under 1× is efficient" />
            <Dist label="Gross margin" summary={perfSum.grossMargin} unit="%" />
            <Dist label="Return on investment" summary={perfSum.roi} unit="%" />
          </div>
          <div style={grid4}>
            <Dist label="LTV : CAC" roadmap roadmapNote="Is growth economically real? Needs customer data." />
            <Dist label="Churn" roadmap roadmapNote="Will revenue still be there to repay? Needs customer data." />
            <Dist label="Net revenue retention" roadmap roadmapNote="Do existing customers grow or leak? Needs customer data." />
            <Dist label="Net margin" summary={perfSum.netMargin} unit="%" />
          </div>
          {bySector.length > 0 && (
            <div style={{ marginTop: '1.1rem', overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', minWidth: 640 }}>
                <thead><tr>{['Sector', 'Biz', 'Rule of 40', 'Gross', 'EBITDA', 'Net', 'Burn'].map((hh, i) => <th key={hh} style={thStyle(i === 0)}>{hh}</th>)}</tr></thead>
                <tbody>
                  {bySector.map((r: any) => (
                    <tr key={r.sector} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={tdStyle(true, true)}>{r.sector}</td>
                      <td style={tdStyle(false)}>{r.count}</td>
                      <td style={tdStyle(false, true)}>{med(r.summary.ruleOf40)}</td>
                      <td style={tdStyle(false)}>{med(r.summary.grossMargin, '%')}</td>
                      <td style={tdStyle(false)}>{med(r.summary.ebitdaMargin, '%')}</td>
                      <td style={tdStyle(false)}>{med(r.summary.netMargin, '%')}</td>
                      <td style={tdStyle(false)}>{med(r.summary.burnMultiple, '×', 1)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: `2px solid ${C.cyan}`, background: 'var(--cv-tint-cyan)' }}>
                    <td style={tdStyle(true, true)}>Portfolio median</td>
                    <td style={tdStyle(false, true)}>{perfSum.total}</td>
                    <td style={tdStyle(false, true)}>{med(perfSum.ruleOf40)}</td>
                    <td style={tdStyle(false, true)}>{med(perfSum.grossMargin, '%')}</td>
                    <td style={tdStyle(false, true)}>{med(perfSum.ebitdaMargin, '%')}</td>
                    <td style={tdStyle(false, true)}>{med(perfSum.netMargin, '%')}</td>
                    <td style={tdStyle(false, true)}>{med(perfSum.burnMultiple, '×', 1)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Benchmarked by segment */}
      {bySector.length > 0 && (
        <div style={card}>
          <div style={kicker}>Benchmarked by segment</div>
          <div style={h2}>Which segments perform, ranked</div>
          <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', minWidth: 640 }}>
              <thead><tr>{['Sector', 'Biz', 'Ready', 'LRS', 'Growth', 'Cost', 'Cover', 'EBITDA', 'Weakest'].map((hh, i) => <th key={hh} style={thStyle(i === 0 || i === 8)}>{hh}</th>)}</tr></thead>
              <tbody>
                {[...bySector].sort((a: any, b: any) => (b.overview.avgLRSScore || 0) - (a.overview.avgLRSScore || 0)).map((r: any) => (
                  <tr key={r.sector} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={tdStyle(true, true)}>{r.sector}</td>
                    <td style={tdStyle(false)}>{r.count}</td>
                    <td style={tdStyle(false)}>{r.overview.readinessPipeline.investment_ready}</td>
                    <td style={tdStyle(false, true)}>{Math.round(r.overview.avgLRSScore)}</td>
                    <td style={tdStyle(false)}>{gsign(r.summary.revenueGrowth)}</td>
                    <td style={tdStyle(false)}>{med(r.summary.costRatio, '%')}</td>
                    <td style={tdStyle(false)}>{med(r.summary.dscr, '×', 1)}</td>
                    <td style={tdStyle(false)}>{med(r.summary.ebitdaMargin, '%')}</td>
                    <td style={tdStyle(true)}>{r.overview.mostCommonWeakDimension ? LRS_DIM_LABELS[r.overview.mostCommonWeakDimension] : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Readiness & dimensions */}
      <div style={card}>
        <div style={kicker}>Readiness &amp; risk</div>
        <div style={h2}>How ready, and how sure we are</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '0.9rem' }}>
          {(['pre_investment', 'development_stage', 'near_ready', 'investment_ready'] as const).map((st, i) => (
            <div key={st} style={{ flex: '1 1 130px', borderLeft: `4px solid ${[C.red, C.amber, C.cyan, C.green][i]}`, padding: '0.5rem 0.8rem', background: 'var(--cv-tint-cyan)', borderRadius: 4 }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: C.navy }}>{view.readinessPipeline[st]}</div>
              <div style={{ fontSize: '0.8rem', color: C.slate }}>{READY_LABELS[st]}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {Object.entries(view.dimensionAverages || {}).sort((a: any, b: any) => a[1] - b[1]).map(([dim, avg]: any) => (
            <div key={dim} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.84rem' }}>
              <div style={{ width: 150, color: C.navy, flexShrink: 0 }}>{LRS_DIM_LABELS[dim] || dim}</div>
              <div style={{ flex: 1, background: 'var(--cv-tint-cyan)', borderRadius: 5, height: 10 }}><div style={{ width: `${Math.max(2, avg)}%`, height: '100%', borderRadius: 5, background: avg < 50 ? C.red : avg < 60 ? C.amber : C.green }} /></div>
              <div style={{ width: 34, textAlign: 'right', fontFamily: 'monospace', color: C.slate }}>{Math.round(avg)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Capital absorption */}
      {currencies.length > 0 && (
        <div style={card}>
          <div style={kicker}>Capital absorption</div>
          <div style={h2}>How much capital could be deployed</div>
          {currencies.map(cc => (
            <div key={cc} style={{ marginBottom: '0.6rem' }}>
              <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: C.slate, marginBottom: 4 }}>{cc}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
                {Object.entries(view.currentFundAbsorption[cc]).map(([type, val]: any) => (
                  <div key={type} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.6rem 0.7rem' }}>
                    <div style={{ fontSize: '0.76rem', color: C.slate }}>{FAC_LABELS[type] || type}</div>
                    <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.05rem', fontWeight: 700, color: C.navy }}>{val === null ? 'n/a' : fmtMoney(val, cc)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Business by business */}
      {(data.profiles || []).length > 0 && (
        <div style={card}>
          <div style={kicker}>Business by business</div>
          <div style={h2}>Each business, ranked</div>
          <p style={lead}>Anonymised unless a business has consented to be named.</p>
          <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', minWidth: 680 }}>
              <thead><tr>{['Business', 'Sector', 'Size', 'LRS', 'Growth', 'Cost', 'Cover', 'EBITDA', 'Conf.'].map((hh, i) => <th key={hh} style={thStyle(i <= 2)}>{hh}</th>)}</tr></thead>
              <tbody>
                {[...(data.profiles || [])].sort((a: any, b: any) => b.irScore - a.irScore).map((p: any) => { const pf = p.performance || {}; return (
                  <tr key={p.refCode} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ ...tdStyle(true, true), fontFamily: p.isNamed ? 'inherit' : 'monospace', whiteSpace: 'nowrap' }}>{p.displayName}</td>
                    <td style={tdStyle(true)}>{p.sector || 'n/a'}</td>
                    <td style={tdStyle(true)}>{p.sizeBracket}</td>
                    <td style={tdStyle(false, true)}>{Math.round(p.lrs.score)}</td>
                    <td style={{ ...tdStyle(false), color: pf.revenueGrowthPct != null && pf.revenueGrowthPct < 0 ? C.red : C.slate }}>{pf.revenueGrowthPct != null ? `${pf.revenueGrowthPct > 0 ? '+' : ''}${pf.revenueGrowthPct}%` : '—'}</td>
                    <td style={tdStyle(false)}>{pf.costRatioPct != null ? `${pf.costRatioPct}%` : '—'}</td>
                    <td style={{ ...tdStyle(false), color: pf.dscrMin != null && pf.dscrMin < 1 ? C.red : C.slate }}>{pf.dscrMin != null ? `${pf.dscrMin.toFixed(1)}×` : '—'}</td>
                    <td style={{ ...tdStyle(false), color: pf.ebitdaMarginPct != null && pf.ebitdaMarginPct < 0 ? C.red : C.slate }}>{pf.ebitdaMarginPct != null ? `${pf.ebitdaMarginPct}%` : '—'}</td>
                    <td style={tdStyle(false)}>{Math.round(p.confidenceScore)}</td>
                  </tr>
                ) })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Impact roadmap */}
      <div style={card}>
        <div style={kicker}>Impact &amp; inclusion · roadmap</div>
        <div style={h2}>Who these businesses reach</div>
        <p style={{ ...lead, marginBottom: 0 }}>Smallholder farmers and farmer groups reached, and the share of women and youth by supply chain, customers and workforce — captured per enterprise via a short per-period return. Not yet collected. Maps to IRIS+, the 2X Criteria and SDGs 1 / 5 / 8.</p>
      </div>

      {/* Methodology */}
      <div style={card}>
        <div style={h2}>Methodology &amp; confidence</div>
        <p style={{ ...lead, marginBottom: 0 }}>
          Growth = year-on-year revenue change; cost ratio = total costs ÷ revenue; DSCR = operating cash ÷ debt due (1.5× is the lender comfort line); EBITDA margin = operating profit ÷ revenue. Medians over the full distribution, computed from the businesses in this portfolio — peer comparisons, not external industry norms, never shown below a 3-business minimum. Everything is as at the latest financial model; tracking factors over time needs historical snapshots not yet stored.
        </p>
      </div>

      <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '0.72rem', color: C.slate, padding: '1rem 0 2rem' }}>
        Confidential · Powered by Canvas Coach · ClearView
      </div>
    </div>
  )
}
