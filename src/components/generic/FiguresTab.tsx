'use client'

// ─────────────────────────────────────────────────────────────
// FINANCE › Figures — the unified surface. STAGE 2b: the "This month"
// view where, for a chosen unit + month, every line shows Plan | Actual |
// Difference side by side.
//
//   • Plan column   — editable, saves to config.plan_lines exactly as the
//                     Planning tab does (auto-saves as you type).
//   • Actual column — editable MANUAL entry (line_values), saved to
//                     generic_actuals exactly as the Actuals tab does:
//                     an explicit Save (draft) / Submit-for-approval, the
//                     same fail-closed period-close lock, and the same
//                     "editing clears a prior approval" rule.
//
// Field-app figures (field_line_values) are NEVER edited here — they are
// written only by aggregate_field_transactions(). We add them to the manual
// figure for display/totals, and show the field portion as a read-only hint,
// mirroring the Actuals tab. Lines that use a COGS breakdown or catalogue
// pricing are locked here and point to the Actuals tab, where those richer
// entry modes live.
//
// Runs ALONGSIDE the existing Planning and Actuals tabs (both untouched).
//
// Prop contract (wired by GenericDashboard): { config, months, cc, P, onSave, onGoToOverTime }
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', slate: 'var(--cv-slate)',
  border: 'var(--cv-border)', borderSoft: 'var(--cv-border-soft)',
  green: 'var(--cv-green)', red: 'var(--cv-red)', amber: 'var(--cv-amber)',
  teal: 'var(--cv-teal)', card: 'var(--cv-card)', cream: 'var(--cv-cream)',
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

// Buffered number input — commits on blur / Enter, so we don't fire on every
// keystroke (mirrors the tabs' buffered-input behaviour).
function NumCell({ value, onCommit, disabled, tint }: { value: number; onCommit: (v: number) => void; disabled?: boolean; tint?: boolean }) {
  const [buf, setBuf] = useState<string>(value ? String(value) : '')
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

function Badge({ text, color }: { text: string; color: string }) {
  return <span style={{ fontFamily: 'monospace', fontSize: '0.68rem', letterSpacing: '0.04em', textTransform: 'uppercase', color, border: `1px solid ${color}`, borderRadius: 12, padding: '2px 8px' }}>{text}</span>
}

export default function FiguresTab({ config, months, cc, P, onSave, onGoToOverTime }: any) {
  const currency = cc || ''
  const canEditPlan = !!P?.canEditPlan
  const canSeeAll = P?.role === 'super_coach' || P?.role === 'ceo' || P?.role === 'finance_manager'
  const units = useMemo(() => (config?.business_units || []).filter((u: any) => u.active), [config])
  const [selUnit, setSelUnit] = useState<string>(units[0]?.id || '')
  const [selPeriod, setSelPeriod] = useState<string>(firstOfThisMonth)

  // Actuals state. line_values is the MANUAL figure (editable here); the
  // field figure is read-only. catalogue_quantities / cogs_line_detail are
  // loaded so we can (a) preserve them on save and (b) lock lines that use
  // those richer entry modes, pointing them to the Actuals tab.
  const [lineValues, setLineValues] = useState<Record<string, number>>({})
  const [fieldLineValues, setFieldLineValues] = useState<Record<string, number>>({})
  const [catalogueQuantities, setCatalogueQuantities] = useState<Record<string, any>>({})
  const [cogsDetail, setCogsDetail] = useState<Record<string, any[]>>({})
  const [submitted, setSubmitted] = useState(false)
  const [approved, setApproved] = useState(false)
  const [reviewNote, setReviewNote] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Period-close state. Fail closed: while the lookup is in flight (or if it
  // errors) treat the period as NOT verified, so editing/saving refuses to
  // assume "open" — identical to the Actuals tab's hard gate.
  const [periodClose, setPeriodClose] = useState<any>(null)
  const [periodCloseVerified, setPeriodCloseVerified] = useState(false)

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

  // Load actuals for the selected unit + month.
  useEffect(() => {
    if (!selUnit || !selPeriod) return
    let active = true
    setLoading(true); setDirty(false); setSaveMsg(null)
    supabase.from('generic_actuals').select('*')
      .eq('client_id', config.client_id).eq('unit_id', selUnit).eq('period', selPeriod).maybeSingle()
      .then(({ data }) => {
        if (!active) return
        setLineValues(data?.line_values || {})
        setFieldLineValues(data?.field_line_values || {})
        setCatalogueQuantities(data?.catalogue_quantities || {})
        setCogsDetail(data?.cogs_line_detail || {})
        setSubmitted(data?.submitted || false)
        setApproved(data?.approved || false)
        setReviewNote(data?.review_note || null)
        setLoading(false)
      })
    return () => { active = false }
  }, [selUnit, selPeriod, config.client_id])

  // Period-close lookup (fail closed).
  useEffect(() => {
    let active = true
    setPeriodClose(null); setPeriodCloseVerified(false)
    supabase.from('generic_period_close').select('*')
      .eq('client_id', config.client_id).eq('period', selPeriod).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) return // stays unverified → editing disabled
        setPeriodClose(data); setPeriodCloseVerified(true)
      })
    return () => { active = false }
  }, [selPeriod, config.client_id])

  const linesFor = (cat: string) => (config?.plan_lines || []).filter((l: any) => l.unit_id === selUnit && l.category === cat && l.active)
  const planOf = (l: any) => (inHorizon && Array.isArray(l.monthly_plan)) ? (Number(l.monthly_plan[planIndex]) || 0) : 0
  const fieldOf = (l: any) => Number(fieldLineValues[l.id]) || 0
  const manualOf = (l: any) => Number(lineValues[l.id]) || 0
  const actualOf = (l: any) => isPastOrCurrent ? (manualOf(l) + fieldOf(l)) : 0

  // A line is locked for direct actual entry here when it uses a richer entry
  // mode that lives in the Actuals tab: a COGS breakdown, or catalogue pricing.
  const hasComps = (l: any) => l.category === 'cost_of_sales' && Array.isArray(cogsDetail[l.id]) && cogsDetail[l.id].length > 0
  const hasCatalogue = (l: any) => catalogueQuantities[l.id] && Object.keys(catalogueQuantities[l.id]).length > 0
  const lineLocked = (l: any) => hasComps(l) || hasCatalogue(l)

  // Global lock on actual editing: not verified, closed, or submitted-and-not-a-reviewer.
  const actualsLocked = !periodCloseVerified || !!periodClose?.closed || (submitted && !canSeeAll) || !isPastOrCurrent

  function commitPlan(lineId: string, val: number) {
    onSave({ ...config, plan_lines: config.plan_lines.map((l: any) => l.id === lineId ? { ...l, monthly_plan: (l.monthly_plan || []).map((v: number, i: number) => i === planIndex ? val : v) } : l) })
  }
  function commitActual(lineId: string, val: number) {
    setLineValues(v => ({ ...v, [lineId]: val })); setDirty(true); setSaveMsg(null)
  }

  async function saveActuals(submit = false) {
    if (!periodCloseVerified) { setSaveMsg({ ok: false, text: 'Close status is still loading. Please try again in a moment.' }); return }
    if (periodClose?.closed) { setSaveMsg({ ok: false, text: 'This period is closed and cannot be edited. Ask your Finance Manager to reopen it first.' }); return }
    setSaving(true); setSaveMsg(null)
    const { error } = await supabase.from('generic_actuals').upsert({
      client_id: config.client_id, unit_id: selUnit, period: selPeriod,
      // Pass catalogue/cogs detail through UNCHANGED so we never wipe them.
      line_values: lineValues, catalogue_quantities: catalogueQuantities, cogs_line_detail: cogsDetail,
      submitted: submit || (submitted && !canSeeAll),
      submitted_at: submit ? new Date().toISOString() : undefined,
      submitted_by: submit ? P.fullName : undefined,
      // Editing figures always clears a prior approval — the same rule the
      // Actuals tab enforces so an "Approved" stamp never sits on changed numbers.
      approved: false, approved_at: null, approved_by: null,
      ...(submit ? { review_note: null } : {}),
      entered_by: P.fullName, entered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id,unit_id,period' })
    setSaving(false)
    if (error) { setSaveMsg({ ok: false, text: 'Could not save — ' + error.message + '. Nothing was lost; please try again.' }); return }
    setApproved(false); setDirty(false)
    if (submit) { setSubmitted(true); setReviewNote(null) }
    setSaveMsg({ ok: true, text: submit
      ? 'Submitted for approval ✓ — your coach, CEO or accountant can now approve it.'
      : 'Saved ✓ ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) })
  }

  // Totals per category + overall (combined manual + field).
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
  const btn = (accent: string): React.CSSProperties => ({ fontFamily: 'inherit', fontSize: '0.86rem', fontWeight: 700, padding: '0.5rem 0.9rem', border: `1px solid ${accent}`, borderRadius: 8, background: accent, color: '#fff', cursor: 'pointer' })
  const btnGhost = (accent: string): React.CSSProperties => ({ ...btn(accent), background: 'transparent', color: accent })

  return (
    <div>
      <div style={{ marginBottom: '0.8rem' }}>
        <div style={H('1.35rem')}>Figures</div>
        <div style={{ color: C.slate, fontSize: '0.9rem', marginTop: 4, maxWidth: 780 }}>
          One place for the plan and the actual, side by side. Pick a month, set the plan, record what really happened.
          <span style={{ color: C.amber }}> Preview — this runs beside Planning and Actuals while we settle it.</span>
        </div>
      </div>

      <div style={{ ...CARD, display: 'flex', gap: '0.7rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ ...H('1.05rem') }}>This month</span>
        <button onClick={onGoToOverTime} style={{ ...selStyle, cursor: 'pointer', color: C.cyan, borderColor: C.cyan }}>Over time →</button>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
          {approved ? <Badge text="Approved" color={C.teal} /> : submitted && <Badge text="Submitted" color={C.green} />}
          {periodClose?.closed && <Badge text="Closed" color={'var(--cv-header, #0B1F33)'} />}
        </span>
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

      {reviewNote && (
        <div style={{ ...CARD, borderColor: C.amber, fontSize: '0.88rem', color: C.navy }}>
          <strong>Sent back for a correction:</strong> {reviewNote}
        </div>
      )}

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
                      ) : lines.map((l: any) => {
                        const locked = lineLocked(l)
                        const fld = fieldOf(l)
                        return (
                          <tr key={l.id} style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
                            <td style={{ ...td, textAlign: 'left', fontFamily: 'inherit', color: C.navy }}>
                              {l.name}
                              {isPastOrCurrent && locked && <span style={{ display: 'block', fontSize: '0.72rem', color: C.slate }}>Entered by {hasComps(l) ? 'cost breakdown' : 'catalogue'} — edit in Actuals</span>}
                              {isPastOrCurrent && fld !== 0 && <span style={{ display: 'block', fontSize: '0.72rem', color: C.teal, fontFamily: 'monospace' }}>incl. {fmt(fld, currency)} from Field</span>}
                            </td>
                            <td style={td}><NumCell value={planOf(l)} onCommit={v => commitPlan(l.id, v)} disabled={!canEditPlan || !inHorizon} tint /></td>
                            <td style={td}>
                              {!isPastOrCurrent ? <span style={{ color: C.slate }}>—</span>
                                : (actualsLocked || locked)
                                  ? <span style={{ color: isPastOrCurrent ? C.navy : C.slate, fontWeight: 600 }}>{fmt(actualOf(l), currency)}</span>
                                  : <NumCell value={manualOf(l)} onCommit={v => commitActual(l.id, v)} />}
                            </td>
                            <td style={td}>{diffCell(planOf(l), actualOf(l), cat.cost)}</td>
                          </tr>
                        )
                      })}
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

        {/* Actual-column controls: an explicit Save (draft) / Submit-for-approval,
            exactly like the Actuals tab. The Plan column saves as you type. */}
        {isPastOrCurrent && (
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.9rem', paddingTop: '0.8rem', borderTop: `1px solid ${C.borderSoft}` }}>
            {periodClose?.closed ? (
              <span style={{ fontSize: '0.86rem', color: C.slate }}>This month is closed — figures are final. Ask your Finance Manager to reopen it to make a correction.</span>
            ) : (submitted && !canSeeAll) ? (
              <span style={{ fontSize: '0.86rem', color: C.slate }}>Submitted and waiting for approval — editing is locked until it’s approved or sent back.</span>
            ) : (
              <>
                <button onClick={() => saveActuals(false)} disabled={saving || !periodCloseVerified} style={btnGhost(C.navy)}>{saving ? 'Saving…' : 'Save actuals'}</button>
                <button onClick={() => saveActuals(true)} disabled={saving || !periodCloseVerified} style={btn(C.green)}>Submit for approval</button>
                {dirty && <span style={{ fontSize: '0.8rem', color: C.amber }}>Unsaved changes</span>}
              </>
            )}
            {saveMsg && <span style={{ fontSize: '0.84rem', color: saveMsg.ok ? C.green : C.red }}>{saveMsg.text}</span>}
          </div>
        )}

        <div style={{ fontSize: '0.76rem', color: C.slate, marginTop: '0.7rem' }}>
          The <strong style={{ color: C.navy }}>Plan</strong> column saves as you type (same as Planning). The <strong style={{ color: C.navy }}>Actual</strong> column is manual entry — figures from Clearview Field are added automatically and shown separately. Cost breakdowns and catalogue pricing stay in the Actuals tab.
        </div>
      </div>
    </div>
  )
}
