'use client'

// ─────────────────────────────────────────────────────────────
// FINANCE › Trends — the READ-ONLY "over time" view of the numbers.
//
// ONE combined chart (Money in, Money out, Profit together; each measure's
// actual is a solid line to "now" and its plan is a dashed line that runs on
// into the months you have planned), plus a month by month table laid out the
// way people actually read a trend: months run ACROSS the top, and Plan /
// Actual / Difference run DOWN the side, so the eye moves left to right along
// time.
//
// Reads ONLY the engine result that Figures already computes (no writes):
//   * whole business → result.con      (rev/cogs/gp/ebitda/npat + act_* )
//   * a single unit  → result.unitPL[id] (rev/cogs/gp/staff/opex/ebitda + act_*)
//
// Actual arrays are null for future months, so an actual line stops at the
// latest recorded month while the plan line keeps going.
//
// Prop contract (wired in by GenericDashboard): { config, result, months, cc, P }
// ─────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'

const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', slate: 'var(--cv-slate)',
  border: 'var(--cv-border)', borderSoft: 'var(--cv-border-soft)',
  green: 'var(--cv-green)', red: 'var(--cv-red)', amber: 'var(--cv-amber)',
  card: 'var(--cv-card)', cream: 'var(--cv-cream)',
}
const CARD: React.CSSProperties = { background: C.card, border: `1px solid ${C.borderSoft}`, borderRadius: 14, padding: '1.3rem 1.5rem', marginBottom: '1.35rem' }
const H = (s = '1.15rem'): React.CSSProperties => ({ fontFamily: 'var(--cv-font)', fontWeight: 700, color: C.navy, fontSize: s })
const LABEL: React.CSSProperties = { fontFamily: 'var(--cv-font-mono)', fontSize: '0.72rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: C.slate }
const selStyle: React.CSSProperties = { fontFamily: 'inherit', fontSize: '0.95rem', padding: '0.5rem 0.7rem', border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, color: C.navy, fontWeight: 600 }

interface Metric { key: string; label: string; plan: number[]; actual: (number | null)[]; higherBetter: boolean }
interface Series { key: string; label: string; color: string; plan: number[]; actual: (number | null)[]; higherBetter: boolean }

const fmt = (n: number, cc: string) => `${cc ? cc + ' ' : ''}${Math.round(n).toLocaleString()}`
const arr = (a: any): number[] => Array.isArray(a) ? a.map((v: any) => Number(v) || 0) : []
const nullArr = (a: any): (number | null)[] => Array.isArray(a) ? a.map((v: any) => (v === null || v === undefined ? null : Number(v))) : []

function metricsFor(source: any, whole: boolean): Metric[] {
  if (!source) return []
  const m: Metric[] = []
  const add = (key: string, label: string, planKey: string, actKey: string, higherBetter: boolean) => {
    if (Array.isArray(source[planKey])) m.push({ key, label, plan: arr(source[planKey]), actual: nullArr(source[actKey]), higherBetter })
  }
  add('rev', 'Money in (sales)', 'rev', 'act_rev', true)
  add('cogs', 'Cost of what you sold', 'cogs', 'act_cogs', false)
  add('gp', 'Gross profit', 'gp', 'act_gp', true)
  if (!whole) {
    add('staff', 'Staff pay', 'staff', 'act_staff', false)
    add('opex', 'Running costs', 'opex', 'act_opex', false)
  }
  add('ebitda', 'Profit (operating)', 'ebitda', 'act_ebitda', true)
  if (whole) add('npat', 'What you kept (after tax)', 'npat', 'act_npat', true)
  return m
}

// The three headline lines shown together on the one chart.
function headlineSeries(source: any): Series[] {
  if (!source) return []
  const revP = arr(source.rev), revA = nullArr(source.act_rev)
  const ebP = arr(source.ebitda), ebA = nullArr(source.act_ebitda)
  const costP = revP.map((v, i) => v - (ebP[i] || 0))
  const costA = revA.map((v, i) => (v !== null && ebA[i] !== null) ? (v - (ebA[i] as number)) : null)
  return [
    { key: 'in', label: 'Money in', color: C.green, plan: revP, actual: revA, higherBetter: true },
    { key: 'out', label: 'Money out', color: C.red, plan: costP, actual: costA, higherBetter: false },
    { key: 'profit', label: 'Profit', color: C.cyan, plan: ebP, actual: ebA, higherBetter: true },
  ]
}

function lastActualIdx(actual: (number | null)[]): number {
  let idx = -1
  for (let i = 0; i < actual.length; i++) if (actual[i] !== null) idx = i
  return idx
}

// ── ONE chart: several measures together, each actual solid + plan dashed ──
function CombinedChart({ series, months }: { series: Series[]; months: string[] }) {
  const lens = series.map(s => s.plan.length).filter(l => l > 0)
  const n = Math.min(months.length || 0, lens.length ? Math.min(...lens) : (months.length || 0))
  const W = 880, Hh = 300, padL = 8, padR = 14, padT = 18, padB = 34
  const nowIdx = series.length ? Math.max(...series.map(s => lastActualIdx(s.actual))) : -1
  const vals: number[] = []
  for (const s of series) {
    for (let i = 0; i < n; i++) { vals.push(s.plan[i] || 0); const a = s.actual[i]; if (a !== null && a !== undefined) vals.push(a as number) }
  }
  const max = Math.max(1, ...vals) * 1.12
  const min = Math.min(0, ...vals) * 1.05
  const X = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR))
  const Y = (v: number) => padT + (1 - (v - min) / (max - min || 1)) * (Hh - padT - padB)
  const labelStep = Math.max(1, Math.ceil(n / 12))
  if (n === 0) return <div style={{ color: C.slate, padding: '1rem' }}>No months to show yet.</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${Hh}`} style={{ width: '100%', minWidth: 560, height: 'auto', display: 'block' }} role="img" aria-label="Money in, money out and profit over time, actual versus plan">
        {[0, 1, 2, 3].map(g => { const gy = padT + (g / 3) * (Hh - padT - padB); return <line key={g} x1={padL} y1={gy} x2={W - padR} y2={gy} stroke={C.borderSoft} strokeWidth="1" /> })}
        {min < 0 && <line x1={padL} y1={Y(0)} x2={W - padR} y2={Y(0)} stroke={C.border} strokeWidth="1" />}
        {nowIdx >= 0 && nowIdx < n - 1 && (
          <>
            <line x1={X(nowIdx)} y1={padT} x2={X(nowIdx)} y2={Hh - padB} stroke={C.cyan} strokeWidth="1" strokeDasharray="2 3" opacity={0.5} />
            <text x={X(nowIdx)} y={padT - 5} textAnchor="end" style={{ fill: C.cyan, fontSize: 10, fontWeight: 700, fontFamily: 'var(--cv-font-mono)' }}>now</text>
          </>
        )}
        {series.map(s => {
          const planPts = s.plan.slice(0, n).map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
          const actPts = s.actual.slice(0, n).map((v, i) => v === null ? null : `${X(i).toFixed(1)},${Y(v as number).toFixed(1)}`).filter(Boolean).join(' ')
          return (
            <g key={s.key}>
              <polyline points={planPts} fill="none" stroke={s.color} strokeWidth="1.8" strokeDasharray="5 4" opacity={0.7} />
              {actPts && <polyline points={actPts} fill="none" stroke={s.color} strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" />}
              {nowIdx >= 0 && s.actual[nowIdx] != null && <circle cx={X(nowIdx)} cy={Y(s.actual[nowIdx] as number)} r={4} fill={s.color} stroke={C.card} strokeWidth={2} />}
            </g>
          )
        })}
        {months.slice(0, n).map((mo, i) => i % labelStep === 0 ? (
          <text key={i} x={X(i)} y={Hh - 12} textAnchor="middle" style={{ fill: C.slate, fontSize: 10.5, fontFamily: 'var(--cv-font-mono)' }}>{mo}</text>
        ) : null)}
      </svg>
    </div>
  )
}

// ── Month by month table, laid out ACROSS time: months are columns, and
//    Plan / Actual / Difference are rows. First column is sticky. ──
function MetricTableWide({ metric, months, cc }: { metric: Metric; months: string[]; cc: string }) {
  const n = Math.min(metric.plan.length, months.length)
  const nowIdx = lastActualIdx(metric.actual)
  const idxs = Array.from({ length: n }, (_, i) => i)
  let planTot = 0, actTot = 0, planToDate = 0
  for (let i = 0; i < n; i++) { planTot += metric.plan[i] || 0; if (metric.actual[i] !== null) { actTot += metric.actual[i] as number; planToDate += metric.plan[i] || 0 } }
  const totDiff = actTot - planToDate
  const totFav = metric.higherBetter ? totDiff >= 0 : totDiff <= 0
  const tone = (fav: boolean | null) => fav === null ? C.slate : fav ? C.green : C.red

  const firstCol: React.CSSProperties = { position: 'sticky', left: 0, zIndex: 2, background: C.card, textAlign: 'left', padding: '0.5rem 0.8rem', fontFamily: 'inherit', whiteSpace: 'nowrap', borderRight: `1px solid ${C.border}` }
  const cell: React.CSSProperties = { padding: '0.5rem 0.8rem', fontSize: '0.88rem', textAlign: 'right', fontFamily: 'var(--cv-font-mono)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
  const totCol: React.CSSProperties = { ...cell, borderLeft: `2px solid ${C.border}`, fontWeight: 700 }

  return (
    <div style={{ marginTop: '1.4rem' }}>
      <div style={{ ...LABEL, marginBottom: 6 }}>Month by month · {metric.label}</div>
      <div style={{ overflowX: 'auto', border: `1px solid ${C.borderSoft}`, borderRadius: 10 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <th style={{ ...firstCol, ...LABEL }}> </th>
              {idxs.map(i => (
                <th key={i} style={{ ...cell, ...LABEL, color: i === nowIdx ? C.cyan : C.slate, background: i === nowIdx ? 'var(--cv-tint-cyan, rgba(0,180,216,.08))' : undefined }}>{months[i]}{i === nowIdx ? ' • now' : ''}</th>
              ))}
              <th style={{ ...totCol, ...LABEL }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...firstCol, fontWeight: 700, color: C.navy }}>🎯 Planned</td>
              {idxs.map(i => <td key={i} style={{ ...cell, color: C.slate, background: i === nowIdx ? 'var(--cv-tint-cyan, rgba(0,180,216,.08))' : undefined }}>{fmt(metric.plan[i] || 0, cc)}</td>)}
              <td style={totCol}>{fmt(planTot, cc)}</td>
            </tr>
            <tr style={{ borderTop: `1px solid ${C.borderSoft}` }}>
              <td style={{ ...firstCol, fontWeight: 700, color: C.navy }}>✅ Actual</td>
              {idxs.map(i => { const a = metric.actual[i]; return <td key={i} style={{ ...cell, color: a !== null ? C.navy : C.slate, fontWeight: a !== null ? 700 : 400, background: i === nowIdx ? 'var(--cv-tint-cyan, rgba(0,180,216,.08))' : undefined }}>{a !== null ? fmt(a as number, cc) : '—'}</td> })}
              <td style={totCol}>{fmt(actTot, cc)}</td>
            </tr>
            <tr style={{ borderTop: `1px solid ${C.borderSoft}` }}>
              <td style={{ ...firstCol, fontWeight: 700, color: C.navy }}>Difference</td>
              {idxs.map(i => {
                const a = metric.actual[i]; if (a === null) return <td key={i} style={{ ...cell, color: C.slate, background: i === nowIdx ? 'var(--cv-tint-cyan, rgba(0,180,216,.08))' : undefined }}>—</td>
                const d = (a as number) - (metric.plan[i] || 0); const fav = metric.higherBetter ? d >= 0 : d <= 0
                return <td key={i} style={{ ...cell, color: tone(fav), fontWeight: 700, background: i === nowIdx ? 'var(--cv-tint-cyan, rgba(0,180,216,.08))' : undefined }}>{d === 0 ? '0' : `${d > 0 ? '+' : ''}${fmt(d, cc)}`}</td>
              })}
              <td style={{ ...totCol, color: tone(totFav) }}>{totDiff > 0 ? '+' : ''}{fmt(totDiff, cc)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: '0.78rem', color: C.slate, marginTop: 6, lineHeight: 1.5 }}>
        Read it left to right to see the month by month story. “Difference” compares the actual with the plan for months you have already recorded. Future months show the plan only. The Total for actual and difference covers the months recorded so far.
      </div>
    </div>
  )
}

export default function FiguresTrendsTab({ config, result, months, cc, P }: any) {
  void P
  const currency = cc || ''
  const units = useMemo(() => (config?.business_units || []).filter((u: any) => u.active), [config])
  const [scope, setScope] = useState<string>('__whole__')
  const [metricKey, setMetricKey] = useState<string>('rev')
  const [hidden, setHidden] = useState<Record<string, boolean>>({})

  const source = scope === '__whole__' ? result?.con : result?.unitPL?.[scope]
  const whole = scope === '__whole__'
  const metrics = useMemo(() => metricsFor(source, whole), [source, whole])
  const metric = metrics.find(m => m.key === metricKey) || metrics[0]
  const allSeries = useMemo(() => headlineSeries(source), [source])
  const shownSeries = allSeries.filter(s => !hidden[s.key])

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <div style={H('1.4rem')}>Trends</div>
        <div style={{ color: C.slate, fontSize: '0.95rem', marginTop: 4, maxWidth: 780, lineHeight: 1.5 }}>
          How your money moves month by month. A <strong style={{ color: C.navy }}>solid line</strong> is what really happened, a <strong style={{ color: C.slate }}>dashed line</strong> is your plan (it keeps going past “now” into the months you have planned). This is a view only, you set your plan and record what happened in Sales, Costs &amp; Profit.
        </div>
      </div>

      {!result?.con && !result?.unitPL ? (
        <div style={{ ...CARD, color: C.slate }}>No numbers yet. Add some plan or actual figures in Sales, Costs &amp; Profit first.</div>
      ) : (
        <div style={CARD}>
          <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={LABEL}>View</span>
              <select style={selStyle} value={scope} onChange={e => setScope(e.target.value)}>
                <option value="__whole__">Whole business</option>
                {units.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            {/* Tap a line name to show or hide it on the chart. */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {allSeries.map(s => {
                const off = hidden[s.key]
                return (
                  <button key={s.key} type="button" onClick={() => setHidden(h => ({ ...h, [s.key]: !h[s.key] }))}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: off ? 'transparent' : 'var(--cv-cream)', border: `1px solid ${off ? C.border : s.color}`, borderRadius: 20, padding: '0.3rem 0.7rem', cursor: 'pointer', color: off ? C.slate : C.navy, fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 600, opacity: off ? 0.55 : 1 }}>
                    <span style={{ width: 16, borderTop: `3px solid ${s.color}`, display: 'inline-block' }} />{s.label}
                  </button>
                )
              })}
            </div>
          </div>

          <CombinedChart series={shownSeries} months={months || []} />
          <div style={{ fontSize: '0.8rem', color: C.slate, marginTop: '0.6rem' }}>
            Solid = what happened. Dashed = the plan. Same colour is the same measure. {currency} · {months?.[0]} to {months?.[months.length - 1]}
          </div>

          <div style={{ marginTop: '1.6rem', display: 'flex', gap: '0.7rem', alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${C.borderSoft}`, paddingTop: '1.1rem' }}>
            <span style={{ ...H('1.05rem') }}>Look closer</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={LABEL}>Measure</span>
              <select style={selStyle} value={metric?.key || ''} onChange={e => setMetricKey(e.target.value)}>
                {metrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
          </div>
          {metric ? <MetricTableWide metric={metric} months={months || []} cc={currency} /> : <div style={{ color: C.slate }}>No measure available for this view.</div>}
        </div>
      )}
    </div>
  )
}
