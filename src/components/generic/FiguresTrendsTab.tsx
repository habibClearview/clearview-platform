'use client'

// ─────────────────────────────────────────────────────────────
// FINANCE › Trends  (per-client dashboard section) — STAGE 1 of the
// unified "Figures" surface: the READ-ONLY "Over time" view.
//
// Actual vs Plan across the months, as a chart (solid = what happened,
// dashed = the plan, which continues past "now" into planned months). Reads
// ONLY the engine result that Planning/Actuals already compute — no writes,
// no new data, so it can't affect any entry flow:
//   * whole business  → result.con  (rev/cogs/gp/ebitda/npat + act_* )
//   * a single unit    → result.unitPL[id] (rev/cogs/gp/staff/opex/ebitda + act_*)
//
// Actual arrays are null for future months (calendar rule), so the actual
// line stops at the latest recorded month while the plan line runs on.
//
// Prop contract (wired in by GenericDashboard): { config, result, months, cc, P }
// ─────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'

const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', slate: 'var(--cv-slate)',
  border: 'var(--cv-border)', borderSoft: 'var(--cv-border-soft)',
  green: 'var(--cv-green)', red: 'var(--cv-red)', amber: 'var(--cv-amber)',
  card: 'var(--cv-card)', cream: 'var(--cv-cream)', plan: 'var(--cv-slate)',
}
const CARD: React.CSSProperties = { background: C.card, border: `1px solid ${C.borderSoft}`, borderRadius: 14, padding: '1.3rem 1.5rem', marginBottom: '1.35rem' }
const H = (s = '1.15rem'): React.CSSProperties => ({ fontFamily: 'Georgia,serif', fontWeight: 700, color: C.navy, fontSize: s })
const LABEL: React.CSSProperties = { fontFamily: 'monospace', fontSize: '0.72rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: C.slate }
const selStyle: React.CSSProperties = { fontFamily: 'inherit', fontSize: '0.9rem', padding: '0.42rem 0.6rem', border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, color: C.navy, fontWeight: 600 }

interface Metric { key: string; label: string; plan: number[]; actual: (number | null)[]; higherBetter: boolean }

const fmt = (n: number, cc: string) => `${cc ? cc + ' ' : ''}${Math.round(n).toLocaleString()}`
const arr = (a: any): number[] => Array.isArray(a) ? a.map((v: any) => Number(v) || 0) : []
const nullArr = (a: any): (number | null)[] => Array.isArray(a) ? a.map((v: any) => (v === null || v === undefined ? null : Number(v))) : []

// Build the metric list available for a scope (whole business vs one unit).
function metricsFor(source: any, whole: boolean): Metric[] {
  if (!source) return []
  const m: Metric[] = []
  const add = (key: string, label: string, planKey: string, actKey: string, higherBetter: boolean) => {
    if (Array.isArray(source[planKey])) m.push({ key, label, plan: arr(source[planKey]), actual: nullArr(source[actKey]), higherBetter })
  }
  if (whole) add('npat', 'Net profit (after tax)', 'npat', 'act_npat', true)
  add('ebitda', 'Operating profit', 'ebitda', 'act_ebitda', true)
  add('rev', 'Revenue (money in)', 'rev', 'act_rev', true)
  add('gp', 'Gross profit', 'gp', 'act_gp', true)
  add('cogs', 'Cost of sales', 'cogs', 'act_cogs', false)
  if (!whole) {
    add('staff', 'Staff pay', 'staff', 'act_staff', false)
    add('opex', 'Overheads', 'opex', 'act_opex', false)
  }
  return m
}

// Latest month index that has a recorded actual (non-null), else -1.
function lastActualIdx(actual: (number | null)[]): number {
  let idx = -1
  for (let i = 0; i < actual.length; i++) if (actual[i] !== null) idx = i
  return idx
}

// ── Line chart: plan (dashed, full span) vs actual (solid, to "now") ──
function TrendChart({ plan, actual, months, cc }: { plan: number[]; actual: (number | null)[]; months: string[]; cc: string }) {
  const n = Math.min(plan.length, months.length)
  const W = 860, Hh = 260, padL = 8, padR = 14, padT = 16, padB = 34
  const nowIdx = lastActualIdx(actual)
  const vals = plan.slice(0, n).concat(actual.slice(0, n).filter(v => v !== null) as number[])
  const max = Math.max(1, ...vals) * 1.12
  const min = Math.min(0, ...vals) * 1.05
  const X = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR))
  const Y = (v: number) => padT + (1 - (v - min) / (max - min || 1)) * (Hh - padT - padB)
  const planPts = plan.slice(0, n).map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
  const actPts = actual.slice(0, n).map((v, i) => v === null ? null : `${X(i).toFixed(1)},${Y(v as number).toFixed(1)}`).filter(Boolean).join(' ')
  const labelStep = Math.ceil(n / 12)
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${Hh}`} style={{ width: '100%', minWidth: 520, height: 'auto', display: 'block' }} role="img" aria-label="Actual versus plan over time">
        {[0, 1, 2, 3].map(g => { const gy = padT + (g / 3) * (Hh - padT - padB); return <line key={g} x1={padL} y1={gy} x2={W - padR} y2={gy} stroke={C.borderSoft} strokeWidth="1" /> })}
        {min < 0 && <line x1={padL} y1={Y(0)} x2={W - padR} y2={Y(0)} stroke={C.border} strokeWidth="1" />}
        {nowIdx >= 0 && nowIdx < n - 1 && (
          <>
            <line x1={X(nowIdx)} y1={padT} x2={X(nowIdx)} y2={Hh - padB} stroke={C.cyan} strokeWidth="1" strokeDasharray="2 3" opacity={0.5} />
            <text x={X(nowIdx)} y={padT - 4} textAnchor="end" style={{ fill: C.cyan, fontSize: 10, fontWeight: 700, fontFamily: 'monospace' }}>now</text>
          </>
        )}
        <polyline points={planPts} fill="none" stroke={C.plan} strokeWidth="2" strokeDasharray="5 4" opacity={0.85} />
        {actPts && <polyline points={actPts} fill="none" stroke={C.cyan} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />}
        {actual.slice(0, n).map((v, i) => v === null ? null : (
          <circle key={i} cx={X(i)} cy={Y(v as number)} r={i === nowIdx ? 4 : 2} fill={C.cyan} stroke={i === nowIdx ? C.card : 'none'} strokeWidth={i === nowIdx ? 2 : 0} />
        ))}
        {months.slice(0, n).map((mo, i) => i % labelStep === 0 ? (
          <text key={i} x={X(i)} y={Hh - 12} textAnchor="middle" style={{ fill: C.slate, fontSize: 10.5, fontFamily: 'monospace' }}>{mo}</text>
        ) : null)}
      </svg>
    </div>
  )
}

// ── Small sparkline (actual where present, else plan) ──
function Spark({ series, color }: { series: number[]; color: string }) {
  const w = 150, h = 30, pad = 2
  const max = Math.max(...series, 1), min = Math.min(0, ...series), rng = (max - min) || 1
  const x = (i: number) => pad + (series.length <= 1 ? 0 : (i / (series.length - 1)) * (w - 2 * pad))
  const y = (v: number) => h - pad - ((v - min) / rng) * (h - 2 * pad)
  const p = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: 30 }}><polyline points={p} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" /></svg>
}

export default function FiguresTrendsTab({ config, result, months, cc, P }: any) {
  void P
  const currency = cc || ''
  const units = useMemo(() => (config?.business_units || []).filter((u: any) => u.active), [config])
  const [scope, setScope] = useState<string>('__whole__')
  const [metricKey, setMetricKey] = useState<string>('ebitda')

  const source = scope === '__whole__' ? result?.con : result?.unitPL?.[scope]
  const whole = scope === '__whole__'
  const metrics = useMemo(() => metricsFor(source, whole), [source, whole])
  const metric = metrics.find(m => m.key === metricKey) || metrics[0]

  const catStrip = useMemo(() => {
    if (!source) return []
    const cats: { key: string; label: string; color: string; higherBetter: boolean }[] = whole
      ? [{ key: 'rev', label: 'Revenue', color: 'var(--cv-green)', higherBetter: true }, { key: 'cogs', label: 'Cost of sales', color: 'var(--cv-red)', higherBetter: false }, { key: 'gp', label: 'Gross profit', color: 'var(--cv-cyan)', higherBetter: true }]
      : [{ key: 'rev', label: 'Revenue', color: 'var(--cv-green)', higherBetter: true }, { key: 'cogs', label: 'Cost of sales', color: 'var(--cv-red)', higherBetter: false }, { key: 'staff', label: 'Staff', color: 'var(--cv-purple, #8B5CF6)', higherBetter: false }, { key: 'opex', label: 'Overheads', color: 'var(--cv-amber)', higherBetter: false }]
    return cats.map(c => {
      const m = metricsFor(source, whole).find(x => x.key === c.key)
      if (!m) return null
      const nowIdx = lastActualIdx(m.actual)
      // Actual-to-date vs plan-to-date (up to the latest recorded month).
      let aSum = 0, pSum = 0
      for (let i = 0; i <= nowIdx; i++) { aSum += (m.actual[i] ?? 0); pSum += (m.plan[i] ?? 0) }
      const spark = m.plan.map((pv, i) => (i <= nowIdx && m.actual[i] !== null) ? (m.actual[i] as number) : pv)
      const pct = pSum ? Math.round(((aSum - pSum) / Math.abs(pSum)) * 100) : null
      const favourable = pct === null ? null : (c.higherBetter ? pct >= 0 : pct <= 0)
      const txt = nowIdx < 0 ? 'no actuals yet' : pct === null ? '—' : `${pct > 0 ? '+' : ''}${pct}% vs plan`
      return { ...c, spark, txt, tone: favourable === null ? C.slate : favourable ? C.green : C.red }
    }).filter(Boolean) as any[]
  }, [source, whole])

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <div style={H('1.35rem')}>Trends</div>
        <div style={{ color: C.slate, fontSize: '0.9rem', marginTop: 4, maxWidth: 760 }}>
          Actual against plan over the months — <strong style={{ color: C.cyan }}>solid = what actually happened</strong>,
          <strong style={{ color: C.slate }}> dashed = the plan</strong> (it keeps going past “now” into the months you’ve planned).
          Read-only view; you plan and record in Planning and Actuals as usual.
        </div>
      </div>

      {!result?.con && !result?.unitPL ? (
        <div style={{ ...CARD, color: C.slate }}>No figures yet — add plan or actual numbers first.</div>
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
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={LABEL}>Showing</span>
              <select style={selStyle} value={metric?.key || ''} onChange={e => setMetricKey(e.target.value)}>
                {metrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '0.78rem', color: C.slate }}>
              <span><span style={{ display: 'inline-block', width: 20, borderTop: `2.6px solid ${C.cyan}`, verticalAlign: 'middle', marginRight: 5 }} />Actual</span>
              <span><span style={{ display: 'inline-block', width: 20, borderTop: `2px dashed ${C.plan}`, verticalAlign: 'middle', marginRight: 5 }} />Plan</span>
            </div>
          </div>

          {metric ? (
            <>
              <div style={{ ...H('1.05rem'), marginBottom: 2 }}>{metric.label} — actual vs plan</div>
              <div style={{ fontSize: '0.8rem', color: C.slate, marginBottom: '0.6rem' }}>{currency} · {months?.[0]} → {months?.[months.length - 1]}</div>
              <TrendChart plan={metric.plan} actual={metric.actual} months={months || []} cc={currency} />
            </>
          ) : (
            <div style={{ color: C.slate }}>No series available for this view.</div>
          )}

          {catStrip.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '0.7rem', marginTop: '1.2rem' }}>
              {catStrip.map(c => (
                <div key={c.key} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.6rem 0.7rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: C.slate, marginBottom: 3 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color, display: 'inline-block' }} />{c.label}
                  </div>
                  <Spark series={c.spark} color={c.color} />
                  <div style={{ fontSize: '0.74rem', fontWeight: 700, color: c.tone, marginTop: 3 }}>{c.txt}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
