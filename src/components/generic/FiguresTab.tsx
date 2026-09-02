'use client'

// ─────────────────────────────────────────────────────────────
// FINANCE › Figures — the ONE place for the numbers.
//
// This is the merged surface that replaces the old separate Planning and
// Actuals tabs in the everyday menu. For a chosen unit and month it shows,
// for every line: what you PLANNED, what ACTUALLY happened, and the
// DIFFERENCE, side by side.
//
//   Plan column   saves as you type, straight into config.plan_lines
//                 (the same place the old Planning tab wrote to).
//   Actual column is manual entry saved to generic_actuals with an explicit
//                 Save / Submit, the same period-close lock and the same
//                 "editing clears a prior approval" rule as the old Actuals
//                 tab. Field-app figures are added in and shown separately;
//                 they are never edited by hand here.
//
// Written for non-financial, semi-literate users: plain words, an icon and a
// colour per category, a clickable "i" that explains each part in plain
// English, and friendly "Add another..." buttons. No jargon, no dashes.
//
// The advanced tools (seasons, drivers, scenarios; filling many past months
// at once) still exist and are one click away via the links at the bottom.
//
// Prop contract: { config, months, cc, P, onSave, onGoToOverTime, onGoToPlanningTools, onGoToCatchUp }
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { blankLine } from '@/lib/generic-engine'

const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', slate: 'var(--cv-slate)',
  border: 'var(--cv-border)', borderSoft: 'var(--cv-border-soft)',
  green: 'var(--cv-green)', red: 'var(--cv-red)', amber: 'var(--cv-amber)',
  teal: 'var(--cv-teal)', card: 'var(--cv-card)', cream: 'var(--cv-cream)',
}
// Consistent colour coding for the two columns, used everywhere so the eye
// learns it once: blue means "your plan", solid navy means "what happened".
const PLAN_TINT = 'var(--cv-tint-cyan, rgba(0,180,216,.08))'

const CARD: React.CSSProperties = { background: C.card, border: `1px solid ${C.borderSoft}`, borderRadius: 14, padding: '1.2rem 1.4rem', marginBottom: '1.2rem' }
const H = (s = '1.15rem'): React.CSSProperties => ({ fontFamily: 'var(--cv-font)', fontWeight: 700, color: C.navy, fontSize: s })
const LABEL: React.CSSProperties = { fontFamily: 'var(--cv-font-mono)', fontSize: '0.78rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: C.slate }
const selStyle: React.CSSProperties = { fontFamily: 'inherit', fontSize: '0.95rem', padding: '0.5rem 0.7rem', border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, color: C.navy, fontWeight: 600 }

// The four groups every profit picture is built from, each with a plain-word
// name, a friendly icon, a colour, and a plain-English explanation shown when
// the reader clicks the "i". The button to add a line is worded per group.
const CATS: {
  key: string; label: string; icon: string; color: string; cost: boolean
  help: string; addLabel: string; placeholder: string
}[] = [
  {
    key: 'revenue', label: 'Money in (sales)', icon: '💰', color: 'var(--cv-green)', cost: false,
    help: 'The money your customers pay you for what you sell. Example: you run a drinks shop and this month customers paid you 60,000 for drinks. That 60,000 goes here. Do NOT put money you borrowed or a loan here, this is only money from selling.',
    addLabel: 'Add another product or service', placeholder: 'e.g. Bottled water',
  },
  {
    key: 'cost_of_sales', label: 'Cost of what you sold', icon: '📦', color: 'var(--cv-red)', cost: true,
    help: 'What the things you sold cost YOU to get. Example: you buy a crate of drinks for 4,000 and sell it for 6,000. The 4,000 is the cost of what you sold, and it goes here. For a tailor it is the cloth and thread used on the clothes you finished. This is ONLY the cost of the goods you actually sold. Rent, wages and electricity do NOT go here, they go under Running costs.',
    addLabel: 'Add another cost of a sale', placeholder: 'e.g. Drinks you buy to resell',
  },
  {
    key: 'staff', label: 'Staff pay', icon: '👥', color: 'var(--cv-purple, #8B5CF6)', cost: true,
    help: 'What you pay the people who work for you. Example: you pay a shopkeeper 30,000 and a cleaner 10,000 this month, so 40,000 goes here. This covers wages, salaries and allowances for your team.',
    addLabel: 'Add another staff cost', placeholder: 'e.g. Shopkeeper wages',
  },
  {
    key: 'direct_opex', label: 'Running costs', icon: '🏠', color: 'var(--cv-amber)', cost: true,
    help: 'The bills you pay to keep the business open, whether or not you sell anything. Example: shop rent 15,000, electricity 5,000 and airtime 2,000 this month, so 22,000 goes here. Rent, electricity, transport, phone and internet all belong here.',
    addLabel: 'Add another running cost', placeholder: 'e.g. Shop rent',
  },
]
const PLAN_HELP = 'Your target for this month, set before or early in the month. Example: you aim to sell 60,000 of drinks, so you type 60,000 in the Planned box. It is what you are aiming for.'
const ACTUAL_HELP = 'What really happened. Example: by month end you actually sold 52,000 of drinks, so you type 52,000 in the Actual box once you know the real number.'

const fmt = (n: number, cc: string) => `${cc ? cc + ' ' : ''}${Math.round(n).toLocaleString()}`
const firstOfThisMonth = () => { const d = new Date(); d.setDate(1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }

// A small clickable "i" that reveals a plain-English note. Click to open,
// click again (or elsewhere) to close. Keeps the guidance out of the way
// until the reader wants it, so the screen stays uncluttered.
function InfoDot({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-label="What does this mean?" title="What does this mean?"
        style={{ marginLeft: 6, width: 19, height: 19, borderRadius: 10, border: `1.5px solid ${C.cyan}`, background: open ? C.cyan : 'transparent', color: open ? '#fff' : C.cyan, fontSize: '0.78rem', fontWeight: 700, fontFamily: 'var(--cv-font)', fontStyle: 'italic', cursor: 'pointer', lineHeight: 1, padding: 0, verticalAlign: 'middle' }}>i</button>
      {open && (
        <>
          <span onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <span style={{ position: 'absolute', top: '145%', left: 0, zIndex: 20, width: 264, background: C.card, border: `1px solid ${C.cyan}`, borderRadius: 12, padding: '0.75rem 0.85rem', fontSize: '0.84rem', fontFamily: 'inherit', color: C.navy, boxShadow: '0 8px 24px rgba(11,31,51,0.16)', textTransform: 'none', letterSpacing: 0, fontWeight: 400, lineHeight: 1.45, whiteSpace: 'normal' }}>
            {text}
          </span>
        </>
      )}
    </span>
  )
}

function Badge({ text, color }: { text: string; color: string }) {
  return <span style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.78rem', letterSpacing: '0.04em', textTransform: 'uppercase', color, border: `1px solid ${color}`, borderRadius: 12, padding: '2px 8px' }}>{text}</span>
}

// Buffered number box. Commits when the reader clicks away or presses Enter,
// so we are not saving on every keystroke.
function NumCell({ value, onCommit, disabled, tint }: { value: number; onCommit: (v: number) => void; disabled?: boolean; tint?: boolean }) {
  const [buf, setBuf] = useState<string>(value ? String(value) : '')
  useEffect(() => { setBuf(value ? String(value) : '') }, [value])
  if (disabled) return <span style={{ display: 'block', textAlign: 'right', fontFamily: 'var(--cv-font-mono)', fontSize: '0.9rem', color: C.slate }}>{fmt(value || 0, '')}</span>
  return (
    <input inputMode="numeric" value={buf}
      onChange={e => setBuf(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      onBlur={() => { const n = Number(buf.replace(/,/g, '')); if (!isNaN(n) && n !== value) onCommit(n) }}
      style={{ width: 116, textAlign: 'right', fontFamily: 'var(--cv-font-mono)', fontSize: '0.9rem', padding: '0.34rem 0.45rem', border: `1px solid ${tint ? C.cyan : C.border}`, borderRadius: 7, background: tint ? PLAN_TINT : C.card, color: C.navy }} />
  )
}

export default function FiguresTab({ config, months, cc, P, onSave, onGoToOverTime, onGoToPlanningTools, onGoToCatchUp }: any) {
  const currency = cc || ''
  const canEditPlan = !!P?.canEditPlan
  const canSeeAll = P?.role === 'super_coach' || P?.role === 'ceo' || P?.role === 'finance_manager'
  const units = useMemo(() => (config?.business_units || []).filter((u: any) => u.active), [config])
  const [selUnit, setSelUnit] = useState<string>(units[0]?.id || '')
  const [selPeriod, setSelPeriod] = useState<string>(firstOfThisMonth)

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

  const [periodClose, setPeriodClose] = useState<any>(null)
  const [periodCloseVerified, setPeriodCloseVerified] = useState(false)

  // Add a line, right here.
  const [addCat, setAddCat] = useState<string | null>(null)
  const [addName, setAddName] = useState('')

  const periodMonths = useMemo(() => Array.from({ length: 24 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 12 + i)
    return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, label: d.toLocaleString('en-GB', { month: 'long', year: 'numeric' }) }
  }), [])

  const planIndex = useMemo(() => {
    const s = new Date(config?.start_date || firstOfThisMonth())
    const p = new Date(selPeriod)
    return (p.getFullYear() - s.getFullYear()) * 12 + (p.getMonth() - s.getMonth())
  }, [config?.start_date, selPeriod])
  const inHorizon = planIndex >= 0 && planIndex < (config?.planning_months || 0)
  const isPastOrCurrent = selPeriod <= firstOfThisMonth()

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

  useEffect(() => {
    let active = true
    setPeriodClose(null); setPeriodCloseVerified(false)
    supabase.from('generic_period_close').select('*')
      .eq('client_id', config.client_id).eq('period', selPeriod).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) return
        setPeriodClose(data); setPeriodCloseVerified(true)
      })
    return () => { active = false }
  }, [selPeriod, config.client_id])

  const linesFor = (cat: string) => (config?.plan_lines || []).filter((l: any) => l.unit_id === selUnit && l.category === cat && l.active)
  const planOf = (l: any) => (inHorizon && Array.isArray(l.monthly_plan)) ? (Number(l.monthly_plan[planIndex]) || 0) : 0
  const fieldOf = (l: any) => Number(fieldLineValues[l.id]) || 0
  const manualOf = (l: any) => Number(lineValues[l.id]) || 0
  const actualOf = (l: any) => isPastOrCurrent ? (manualOf(l) + fieldOf(l)) : 0

  const hasComps = (l: any) => l.category === 'cost_of_sales' && Array.isArray(cogsDetail[l.id]) && cogsDetail[l.id].length > 0
  const hasCatalogue = (l: any) => catalogueQuantities[l.id] && Object.keys(catalogueQuantities[l.id]).length > 0
  const lineLocked = (l: any) => hasComps(l) || hasCatalogue(l)

  const actualsLocked = !periodCloseVerified || !!periodClose?.closed || (submitted && !canSeeAll) || !isPastOrCurrent

  function commitPlan(lineId: string, val: number) {
    onSave({ ...config, plan_lines: config.plan_lines.map((l: any) => l.id === lineId ? { ...l, monthly_plan: (l.monthly_plan || []).map((v: number, i: number) => i === planIndex ? val : v) } : l) })
  }
  function commitActual(lineId: string, val: number) {
    setLineValues(v => ({ ...v, [lineId]: val })); setDirty(true); setSaveMsg(null)
  }
  function createLine(cat: string) {
    const name = addName.trim()
    if (!name || !selUnit) return
    const id = `${selUnit}_${cat}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    onSave({ ...config, plan_lines: [...(config.plan_lines || []), blankLine(id, selUnit, name, cat as any, config.planning_months)] })
    setAddCat(null); setAddName('')
  }

  async function saveActuals(submit = false) {
    if (!periodCloseVerified) { setSaveMsg({ ok: false, text: 'Still checking whether this month is open. Please try again in a moment.' }); return }
    if (periodClose?.closed) { setSaveMsg({ ok: false, text: 'This month is closed, so it cannot be edited. Ask your Finance Manager to reopen it first.' }); return }
    setSaving(true); setSaveMsg(null)
    const { error } = await supabase.from('generic_actuals').upsert({
      client_id: config.client_id, unit_id: selUnit, period: selPeriod,
      line_values: lineValues, catalogue_quantities: catalogueQuantities, cogs_line_detail: cogsDetail,
      submitted: submit || (submitted && !canSeeAll),
      submitted_at: submit ? new Date().toISOString() : undefined,
      submitted_by: submit ? P.fullName : undefined,
      approved: false, approved_at: null, approved_by: null,
      ...(submit ? { review_note: null } : {}),
      entered_by: P.fullName, entered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id,unit_id,period' })
    setSaving(false)
    if (error) { setSaveMsg({ ok: false, text: 'Could not save. ' + error.message + '. Nothing was lost, please try again.' }); return }
    setApproved(false); setDirty(false)
    if (submit) { setSubmitted(true); setReviewNote(null) }
    setSaveMsg({ ok: true, text: submit
      ? 'Sent for approval. Your coach, CEO or accountant can now sign it off.'
      : 'Saved at ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) })
  }

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
    const face = d === 0 ? '' : fav ? '👍 ' : '👎 '
    return <span style={{ color: tone, fontWeight: 700 }}>{d === 0 ? 'Same' : `${face}${d > 0 ? '+' : ''}${fmt(d, currency)}`}</span>
  }

  const th: React.CSSProperties = { ...LABEL, padding: '0.5rem 0.7rem', textAlign: 'right', borderBottom: `1px solid ${C.border}` }
  const td: React.CSSProperties = { padding: '0.5rem 0.7rem', fontSize: '0.92rem', textAlign: 'right', fontFamily: 'var(--cv-font-mono)', fontVariantNumeric: 'tabular-nums' }
  const btn = (accent: string): React.CSSProperties => ({ fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 700, padding: '0.55rem 1rem', border: `1px solid ${accent}`, borderRadius: 9, background: accent, color: '#fff', cursor: 'pointer' })
  const btnGhost = (accent: string): React.CSSProperties => ({ ...btn(accent), background: 'transparent', color: accent })
  const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: C.cyan, fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }

  return (
    <div>
      <div style={{ marginBottom: '0.8rem' }}>
        <div style={H('1.4rem')}>Sales, Costs & Profit</div>
        <div style={{ color: C.slate, fontSize: '0.95rem', marginTop: 4, maxWidth: 780, lineHeight: 1.5 }}>
          Your plan and what really happened, side by side. Pick a month, set your target for your sales and costs, then fill in the real numbers once you have them. What is left over is your profit.
        </div>
      </div>

      {/* Colour key so the reader learns the code once. */}
      <div style={{ ...CARD, display: 'flex', gap: '1.2rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.7rem 1.1rem', fontSize: '0.86rem', color: C.navy }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 13, height: 13, borderRadius: 4, background: PLAN_TINT, border: `1.5px solid ${C.cyan}`, display: 'inline-block' }} /> 🎯 <strong>Planned</strong> is your target</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 13, height: 13, borderRadius: 4, background: C.navy, display: 'inline-block' }} /> ✅ <strong>Actual</strong> is what happened</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ color: C.green, fontWeight: 700 }}>👍 Green</span> means better than planned, <span style={{ color: C.red, fontWeight: 700 }}>👎 red</span> means worse</span>
      </div>

      <div style={{ ...CARD, display: 'flex', gap: '0.7rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          {approved ? <Badge text="Approved" color={C.teal} /> : submitted && <Badge text="Sent for approval" color={C.green} />}
          {periodClose?.closed && <Badge text="Closed" color={'var(--cv-header, #0B1F33)'} />}
        </span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <span style={LABEL}>Which part of the business</span>
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
        <div style={{ ...CARD, borderColor: C.amber, fontSize: '0.9rem', color: C.navy }}>
          <strong>Sent back so you can fix something:</strong> {reviewNote}
        </div>
      )}

      {!inHorizon && (
        <div style={{ ...CARD, borderColor: C.amber, fontSize: '0.9rem', color: C.slate }}>
          This month is outside your current plan window, so there is no target slot to fill in yet. Open <button style={linkBtn} onClick={onGoToPlanningTools}>the planning tools</button> to stretch your plan further ahead.
        </div>
      )}

      <div style={CARD}>
        {loading ? <div style={{ color: C.slate, textAlign: 'center', padding: '1rem' }}>Loading…</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 580 }}>
              <thead><tr>
                <th style={{ ...th, textAlign: 'left' }}>What</th>
                <th style={th}>🎯 Planned<InfoDot text={PLAN_HELP} /></th>
                <th style={th}>✅ Actual<InfoDot text={ACTUAL_HELP} /></th>
                <th style={th}>Difference</th>
              </tr></thead>
              <tbody>
                {CATS.map(cat => {
                  const lines = linesFor(cat.key)
                  const sub = totals.byCat[cat.key]
                  return (
                    <React.Fragment key={cat.key}>
                      <tr>
                        <td colSpan={4} style={{ padding: '0.75rem 0.7rem 0.3rem' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...H('1.02rem') }}>
                            <span style={{ fontSize: '1.1rem' }}>{cat.icon}</span>
                            <span style={{ width: 9, height: 9, borderRadius: 3, background: cat.color, display: 'inline-block' }} />
                            {cat.label}
                            <InfoDot text={cat.help} />
                          </span>
                        </td>
                      </tr>
                      {lines.length === 0 && addCat !== cat.key && (
                        <tr><td colSpan={4} style={{ ...td, textAlign: 'left', color: C.slate, fontFamily: 'inherit', fontStyle: 'italic' }}>Nothing here yet. Use the button below to add one.</td></tr>
                      )}
                      {lines.map((l: any) => {
                        const locked = lineLocked(l)
                        const fld = fieldOf(l)
                        return (
                          <tr key={l.id} style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
                            <td style={{ ...td, textAlign: 'left', fontFamily: 'inherit', color: C.navy }}>
                              {l.name}
                              {isPastOrCurrent && locked && <span style={{ display: 'block', fontSize: '0.78rem', color: C.slate }}>Filled in using the {hasComps(l) ? 'cost breakdown' : 'price list'}. Edit it in <button style={{ ...linkBtn, fontSize: '0.78rem' }} onClick={onGoToCatchUp}>the detailed view</button>.</span>}
                              {isPastOrCurrent && fld !== 0 && <span style={{ display: 'block', fontSize: '0.78rem', color: C.teal, fontFamily: 'var(--cv-font-mono)' }}>includes {fmt(fld, currency)} from Clearview Field</span>}
                            </td>
                            <td style={td}><NumCell value={planOf(l)} onCommit={v => commitPlan(l.id, v)} disabled={!canEditPlan || !inHorizon} tint /></td>
                            <td style={td}>
                              {!isPastOrCurrent ? <span style={{ color: C.slate }}>—</span>
                                : (actualsLocked || locked)
                                  ? <span style={{ color: C.navy, fontWeight: 600 }}>{fmt(actualOf(l), currency)}</span>
                                  : <NumCell value={manualOf(l)} onCommit={v => commitActual(l.id, v)} />}
                            </td>
                            <td style={td}>{diffCell(planOf(l), actualOf(l), cat.cost)}</td>
                          </tr>
                        )
                      })}
                      {/* Friendly, plainly-worded add button (or its inline form). */}
                      {canEditPlan && (
                        <tr>
                          <td colSpan={4} style={{ padding: '0.35rem 0.7rem 0.6rem' }}>
                            {addCat === cat.key ? (
                              <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <input autoFocus value={addName} onChange={e => setAddName(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') createLine(cat.key); if (e.key === 'Escape') { setAddCat(null); setAddName('') } }}
                                  placeholder={cat.placeholder}
                                  style={{ padding: '0.45rem 0.6rem', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: '0.92rem', color: C.navy, background: C.card, minWidth: 220 }} />
                                <button type="button" style={btn(cat.color)} onClick={() => createLine(cat.key)}>Add</button>
                                <button type="button" style={{ ...linkBtn, color: C.slate }} onClick={() => { setAddCat(null); setAddName('') }}>Cancel</button>
                              </span>
                            ) : (
                              <button type="button" onClick={() => { setAddCat(cat.key); setAddName('') }}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: `1.5px dashed ${cat.color}`, color: cat.color, fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600, padding: '0.45rem 0.85rem', borderRadius: 9, cursor: 'pointer' }}>
                                <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>＋</span> {cat.addLabel}
                              </button>
                            )}
                          </td>
                        </tr>
                      )}
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
                  <td style={{ ...td, textAlign: 'left', ...H('1.05rem'), borderTop: `2px solid ${C.border}`, paddingTop: '0.75rem' }}>💵 What you kept (profit)<InfoDot text="What is left over after you take all your costs away from your sales. Example: 52,000 came in and your costs were 40,000, so you kept 12,000. Green means you kept more than you planned, red means less." /></td>
                  <td style={{ ...td, fontWeight: 700, borderTop: `2px solid ${C.border}` }}>{fmt(totals.profitPlan, currency)}</td>
                  <td style={{ ...td, fontWeight: 700, borderTop: `2px solid ${C.border}`, color: isPastOrCurrent ? C.navy : C.slate }}>{isPastOrCurrent ? fmt(totals.profitActual, currency) : '—'}</td>
                  <td style={{ ...td, borderTop: `2px solid ${C.border}` }}>{diffCell(totals.profitPlan, totals.profitActual, false)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {isPastOrCurrent && (
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '1rem', paddingTop: '0.85rem', borderTop: `1px solid ${C.borderSoft}` }}>
            {periodClose?.closed ? (
              <span style={{ fontSize: '0.9rem', color: C.slate }}>This month is closed, so the figures are final. Ask your Finance Manager to reopen it if you need to fix something.</span>
            ) : (submitted && !canSeeAll) ? (
              <span style={{ fontSize: '0.9rem', color: C.slate }}>You have sent this month for approval, so it is locked until it is approved or sent back to you.</span>
            ) : (
              <>
                <button onClick={() => saveActuals(false)} disabled={saving || !periodCloseVerified} style={btnGhost(C.navy)}>{saving ? 'Saving…' : '💾 Save'}</button>
                <button onClick={() => saveActuals(true)} disabled={saving || !periodCloseVerified} style={btn(C.green)}>✅ Send for approval</button>
                {dirty && <span style={{ fontSize: '0.84rem', color: C.amber }}>You have changes that are not saved yet</span>}
              </>
            )}
            {saveMsg && <span style={{ fontSize: '0.88rem', color: saveMsg.ok ? C.green : C.red }}>{saveMsg.text}</span>}
          </div>
        )}
      </div>

      {/* The advanced tools live on, one click away. */}
      <div style={{ ...CARD, display: 'flex', gap: '1.4rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.9rem' }}>
        <span style={{ ...LABEL }}>More tools</span>
        <button style={linkBtn} onClick={onGoToOverTime}>📈 See the trend over many months</button>
        <button style={linkBtn} onClick={onGoToCatchUp}>🗓️ Fill in several past months at once</button>
        {canEditPlan && <button style={linkBtn} onClick={onGoToPlanningTools}>⚙️ Set up seasons, price lists and what-ifs</button>}
      </div>
    </div>
  )
}
