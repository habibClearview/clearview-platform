'use client'

// ─────────────────────────────────────────────────────────────
// FINANCE › Figures — STAGE 2a of the unified surface: the "This month"
// view. For a chosen unit + month, every line shows Plan | Actual |
// Difference side by side. In THIS slice the Plan column is editable (it
// writes to config.plan_lines exactly as the Planning tab does — reused,
// low-risk path) and the Actual column is READ-ONLY (combined manual +
// field actuals). Editing the Actual column, with the approval/close lock
// rules, is Stage 2b.
//
// Runs ALONGSIDE the existing Planning and Actuals tabs (both untouched), so
// nothing breaks while it is compared on staging.
//
// Reads:
//   plan     → config.plan_lines[line].monthly_plan[monthIndex]
//   actual   → generic_actuals(client,unit,period).line_values + field_line_values
//
// Prop contract (wired by GenericDashboard): { config, months, cc, P, onSave, onGoToOverTime }
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', slate: 'var(--cv-slate)',
  border: 'var(--cv-border)', borderSoft: 'var(--cv-border-soft)',
  green: 'var(--cv-green)', red: 'var(--cv-red)', amber: 'var(--cv-amber)',
  card: 'var(--cv-card)', cream: 'var(--cv-cream)',
}
const CARD: React.CSSProperties = { background: C.card, border: `1px solid ${C.borderSoft}`, borderRadius: 14, padding: '1.2rem 1.4rem', marginBottom: '1.2rem' }
const H = (s = '1.15rem'): React.CSSProperties => ({ fontFamily: 'Georgia,serif', fontWeight: 700, color: C.navy, fontSize: s })
const LABEL: React.CSSProperties = { fontFamily: 'monospace', fontSize: '0.72rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: C.slate }
const selStyle: React.CSSProperties = { fontFamily: 'inherit', fontSize: '0.9rem', padding: '0.42rem 0.6rem', border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, color: C.navy, fontWeight: 600 }

// P&L categories in order, with plain-language headings + a colour.
const CATS: { key: string; label: string; color: string; cost: boolean }[] = [
  { key: 'revenue', label: 'Money in (sales)', color: 'var(--cv-green)', cost: false },
  { key: 'cost_of_sales', label: 'Cost of what you sold', color: 'var(--cv-red)', cost: true },
  { key: 'staff', label: 'Staff pay', color: 'var(--cv-purple, #8B5CF6)', cost: true },
  { key: 'direct_opex', label: 'Running costs (overheads)', color: 'var(--cv-amber)', cost: true },
]

const fmt = (n: number, cc: string) => `${cc ? cc + ' ' : ''}${Math.round(n).toLocaleString()}`
const firstOfThisMonth = () => { const d = new Date(); d.setDate(1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }

// Buffered number input — commits on blur / Enter, so we don't save on every
// keystroke (mirrors the Planning tab's BufferedInput behaviour).
function NumCell({ value, onCommit, disabled, tint }: { value: number; onCommit: (v: number) => void; disabled?: boolean; tint?: boolean }) {
  const [buf, setBuf] = useState<string>(String(value ?? ''))
  useEffect(() => { setBuf(value ? String(value) : '') }, [value])
  if (disabled) return <span style={{ display: 'block', textAlign: 'right', fontFamily: 'ui-monospace,monospace', fontSize: '0.86rem', color: C.slate }}>{fmt(value || 0, '')}</span>
  return (
    <input inputMode="numeric" value={buf}
      onChange={e => setBuf(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      onBlur={() => { const n = Number(buf.replace(/,/g, '')); if (!isNaN(n) && n !== value) onCommit(n) }}
      style={{ width: 108, textAlign: 'right', fontFamily: 'ui-monospace,monospace', fontSize: '0.86rem', padding: '0.28rem 0.4rem', border: `1px solid ${tint ? C.cyan : C.border}`, borderRadius: 6, background: tint ? 'var(--cv-tint-cyan, rgba(0,180,216,.06))' : C.card, color: C.navy }} />
  )
}

export default function FiguresTab({ config, months, cc, P, onSave, onGoToOverTime }: any) {
  const currency = cc || ''
  const canEditPlan = !!P?.canEditPlan
  const units = useMemo(() => (config?.business_units || []).filter((u: any) => u.active), [config])
  const [selUnit, setSelUnit] = useState<string>(units[0]?.id || '')
  const [selPeriod, setSelPeriod] = useState<string>(firstOfThisMonth)
  const [lineValues, setLineValues] = useState<Record<string, number>>({})
  const [fieldLineValues, setFieldLineValues] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)

  const periodMonths = useMemo(() => Array.from({ length: 24 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 12 + i)
    return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, label: d.toLocaleString('en-GB', { month: 'long', year: 'numeric' }) }
  }), [])

  // Plan index = whole months from the model's start_date to the selected period.
  const planIndex = useMemo(() => {
    const s = new Date(config?.start_date || firstOfThisMonth())
    const p = new Date(selPeriod)
    return (p.getFullYear() - s.getFullYear()) * 12 + (p.getMonth() - s.getMonth())
  }, [config?.start_date, selPeriod])
  const inHorizon = planIndex >= 0 && planIndex < (config?.planning_months || 0)
  const isPastOrCurrent = selPeriod <= firstOfThisMonth()

  useEffect(() => {
    if (!selUnit || !selPeriod) return
    setLoading(true)
    supabase.from('generic_actuals').select('line_values,field_line_values')
      .eq('client_id', config.client_id).eq('unit_id', selUnit).eq('period', selPeriod).maybeSingle()
      .then(({ data }) => { setLineValues(data?.line_values || {}); setFieldLineValues(data?.field_line_values || {}); setLoading(false) })
  }, [selUnit, selPeriod, config.client_id])

  const linesFor = (cat: string) => (config?.plan_lines || []).filter((l: any) => l.unit_id === selUnit && l.category === cat && l.active)
  const planOf = (l: any) => (inHorizon && Array.isArray(l.monthly_plan)) ? (Number(l.monthly_plan[planIndex]) || 0) : 0
  const actualOf = (l: any) => isPastOrCurrent ? ((Number(lineValues[l.id]) || 0) + (Number(fieldLineValues[l.id]) || 0)) : 0

  function commitPlan(lineId: string, val: number) {
    onSave({ ...config, plan_lines: config.plan_lines.map((l: any) => l.id === lineId ? { ...l, monthly_plan: (l.monthly_plan || []).map((v: number, i: number) => i === planIndex ? val : v) } : l) })
  }

  // Totals per category + overall.
  const totals = useMemo(() => {
    const t: Record<string, { plan: number; actual: number }> = {}
    let profP = 0, profA = 0
    for (const cat of CATS) {
      let p = 0, a = 0
      for (const l of linesFor(cat.key)) { p += planOf(l); a += actualOf(l) }
      t[cat.key] = { plan: p, actual: a }
      const sign = cat.cost ? -1 : 1
      profP += sign * p; profA += sign * a
    }
    return { byCat: t, profitPlan: profP, profitActual: profA }
    // eslint-disable-next-line
  }, [config, selUnit, selPeriod, lineValues, fieldLineValues, planIndex])

  const diffCell = (plan: number, actual: number, cost: boolean) => {
    if (!isPastOrCurrent) return <span style={{ color: C.slate }}>—</span>
    const d = actual - plan
    const fav = cost ? d <= 0 : d >= 0
    const tone = d === 0 ? C.slate : fav ? C.green : C.red
    return <span style={{ color: tone, fontWeight: 700 }}>{d === 0 ? '0' : `${d > 0 ? '+' : ''}${fmt(d, currency)}`}</span>
  }

  const th: React.CSSProperties = { ...LABEL, padding: '0.5rem 0.7rem', textAlign: 'right', borderBottom: `1px solid ${C.border}` }
  const td: React.CSSProperties = { padding: '0.42rem 0.7rem', fontSize: '0.9rem', textAlign: 'right', fontFamily: 'ui-monospace,monospace', fontVariantNumeric: 'tabular-nums' }

  return (
    <div>
      <div style={{ marginBottom: '0.8rem' }}>
        <div style={H('1.35rem')}>Figures</div>
        <div style={{ color: C.slate, fontSize: '0.9rem', marginTop: 4, maxWidth: 760 }}>
          One place for the plan and the actual, side by side. Pick a month and fill it in.
          <span style={{ color: C.amber }}> Preview — this runs beside Planning and Actuals while we settle it; the Plan column saves, recording actuals here is coming next.</span>
        </div>
      </div>

      <div style={{ ...CARD, display: 'flex', gap: '0.7rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ ...H('1.05rem') }}>This month</span>
        <button onClick={onGoToOverTime} style={{ ...selStyle, cursor: 'pointer', color: C.cyan, borderColor: C.cyan }}>Over time →</button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <span style={LABEL}>Unit</span>
          <select style={selStyle} value={selUnit} onChange={e => setSelUnit(e.target.value)}>
            {units.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={LABEL}>Month</span>
          <select style={selStyle} value={selPeriod} onChange={e => setSelPeriod(e.target.value)}>
            {periodMonths.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
      </div>

      {!inHorizon && (
        <div style={{ ...CARD, borderColor: C.amber, fontSize: '0.86rem', color: C.slate }}>
          This month is outside the current plan window, so there’s no plan slot to edit. Extend the planning horizon in Planning to plan it.
        </div>
      )}

      <div style={CARD}>
        {loading ? <div style={{ color: C.slate, textAlign: 'center', padding: '1rem' }}>Loading…</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead><tr>
                <th style={{ ...th, textAlign: 'left' }}>Line</th>
                <th style={th}>Planned</th><th style={th}>Actual</th><th style={th}>Difference</th>
              </tr></thead>
              <tbody>
                {CATS.map(cat => {
                  const lines = linesFor(cat.key)
                  const sub = totals.byCat[cat.key]
                  return (
                    <React.Fragment key={cat.key}>
                      <tr>
                        <td colSpan={4} style={{ padding: '0.6rem 0.7rem 0.25rem' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...H('1rem') }}>
                            <span style={{ width: 9, height: 9, borderRadius: 3, background: cat.color, display: 'inline-block' }} />{cat.label}
                          </span>
                        </td>
                      </tr>
                      {lines.length === 0 ? (
                        <tr><td colSpan={4} style={{ ...td, textAlign: 'left', color: C.slate, fontFamily: 'inherit', fontStyle: 'italic' }}>No lines yet.</td></tr>
                      ) : lines.map((l: any) => (
                        <tr key={l.id} style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
                          <td style={{ ...td, textAlign: 'left', fontFamily: 'inherit', color: C.navy }}>{l.name}</td>
                          <td style={td}><NumCell value={planOf(l)} onCommit={v => commitPlan(l.id, v)} disabled={!canEditPlan || !inHorizon} tint /></td>
                          <td style={{ ...td, color: isPastOrCurrent ? C.navy : C.slate, fontWeight: isPastOrCurrent ? 600 : 400 }}>{isPastOrCurrent ? fmt(actualOf(l), currency) : '—'}</td>
                          <td style={td}>{diffCell(planOf(l), actualOf(l), cat.cost)}</td>
                        </tr>
                      ))}
                      <tr style={{ background: 'color-mix(in srgb, var(--cv-cream) 55%, transparent)' }}>
                        <td style={{ ...td, textAlign: 'left', ...LABEL }}>{cat.label} total</td>
                        <td style={{ ...td, fontWeight: 700 }}>{fmt(sub.plan, currency)}</td>
                        <td style={{ ...td, fontWeight: 700, color: isPastOrCurrent ? C.navy : C.slate }}>{isPastOrCurrent ? fmt(sub.actual, currency) : '—'}</td>
                        <td style={td}>{diffCell(sub.plan, sub.actual, cat.cost)}</td>
                      </tr>
                    </React.Fragment>
                  )
                })}
                <tr>
                  <td style={{ ...td, textAlign: 'left', ...H('1.02rem'), borderTop: `2px solid ${C.border}`, paddingTop: '0.7rem' }}>Profit for the month</td>
                  <td style={{ ...td, fontWeight: 700, borderTop: `2px solid ${C.border}` }}>{fmt(totals.profitPlan, currency)}</td>
                  <td style={{ ...td, fontWeight: 700, borderTop: `2px solid ${C.border}`, color: isPastOrCurrent ? C.navy : C.slate }}>{isPastOrCurrent ? fmt(totals.profitActual, currency) : '—'}</td>
                  <td style={{ ...td, borderTop: `2px solid ${C.border}` }}>{diffCell(totals.profitPlan, totals.profitActual, false)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: '0.76rem', color: C.slate, marginTop: '0.7rem' }}>
          The <strong style={{ color: C.navy }}>Plan</strong> column saves as you type (same as Planning). The <strong style={{ color: C.navy }}>Actual</strong> column is read-only here for now — record actuals in the Actuals tab until Stage 2b lands editing with the approval/lock rules.
        </div>
      </div>
    </div>
  )
}
