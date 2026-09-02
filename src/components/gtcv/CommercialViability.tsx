// @ts-nocheck
'use client'
// ============================================================
// Decision Point 4 COMMERCIAL VIABILITY
//
// The workbook's cost and pricing surface, as one screen instead of two
// spreadsheet tabs that drift apart. It answers the Decision Point 4 question directly:
// what does it cost to deliver this once, and at what price does the
// organisation sustain itself.
//
// The order on the screen is the order the method insists on, and it is not
// cosmetic. Cost first, then the market, then price, then break even. Work
// the other way round and the cost estimate quietly bends to fit the price
// somebody already had in mind.
//
//   1. The five cost categories, each an editable table with a subtotal.
//   2. The cost floor headline, computed once from those five subtotals and
//      used by everything below it.
//   3. The overhead check. Below 20 percent of direct costs is flagged.
//   4. Market price reference, at least three sources, read as a range
//      against the floor.
//   5. Pricing tiers with live margin and percent above the floor. A price
//      below the floor is named as a structural deficit, not a discount.
//   6. Fixed costs and the break even readout per tier.
//
// All arithmetic lives in src/lib/gtcv-costing.ts, which has no React in it
// and is covered by tests. This file renders and saves, nothing more, so the
// floor on screen and the floor in the tests are the same number.
//
// SCOPE: this is the workbook surface. The deeper financial modelling the
// ClearView dashboard already runs is not rebuilt here, it is linked to.
//
// Currency is a prop. It is set once per engagement and applied everywhere,
// and nothing in this file assumes what it is.
//
// Tables: gtcv_cost_lines, gtcv_pricing_tiers, gtcv_market_prices,
// gtcv_fixed_costs (2026_08_09_gtcv_dp04.sql).
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { serviceOptions, serviceLabelFor, servicesFromPropositions, SHARED_SERVICE_LABEL } from '@/lib/gtcv-services'
import {
  buildViability,
  formatAmount,
  formatPercent,
  num,
  COST_CATEGORIES,
  MINIMUM_MARKET_SOURCES,
  REQUIRED_TIERS,
} from '@/lib/gtcv-costing'

const T_COST = 'gtcv_cost_lines'
const T_TIERS = 'gtcv_pricing_tiers'
const T_MARKET = 'gtcv_market_prices'
const T_FIXED = 'gtcv_fixed_costs'
const T_PROPS = 'gtcv_propositions'

// ─── design tokens (mirror the coach dashboard) ──────────────
const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', white: 'var(--cv-card)',
  slate: 'var(--cv-slate)', border: 'var(--cv-border)', teal: 'var(--cv-teal)',
  red: 'var(--cv-red)', green: 'var(--cv-green)', amber: 'var(--cv-amber)',
  purple: 'var(--cv-purple)', alt: 'var(--cv-alt)',
}
const card = { background: C.white, border: '1px solid var(--cv-border-soft)', borderRadius: 14, padding: '1.25rem 1.4rem', marginBottom: '1.1rem', boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)' }
const secH = { fontFamily: 'var(--cv-font)', fontSize: '1.25rem', fontWeight: 700, color: C.navy, margin: 0 }
const hint = { fontSize: '0.9rem', color: C.slate, lineHeight: 1.45 }
const mono = { fontFamily: 'var(--cv-font-mono)' }
const th = { ...mono, padding: '0.45rem 0.55rem', textAlign: 'left', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.slate, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
const td = { padding: '0.35rem 0.55rem', verticalAlign: 'top', fontSize: '0.9rem', color: C.navy }
const tdNum = { ...td, ...mono, textAlign: 'right', whiteSpace: 'nowrap' }
const inp = { width: '100%', padding: '0.34rem 0.5rem', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: '0.9rem', fontFamily: 'inherit', background: 'var(--cv-bg-2)', color: C.navy, boxSizing: 'border-box' }
const btn = (col) => ({ ...mono, fontSize: '0.86rem', fontWeight: 600, padding: '0.4rem 0.85rem', border: `1px solid ${col}`, borderRadius: 7, background: 'transparent', color: col, cursor: 'pointer' })
const xBtn = { ...mono, border: 'none', background: 'transparent', color: C.red, cursor: 'pointer', fontSize: '1rem', padding: '0.2rem 0.3rem' }

const stamp = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

// A number cell that shows a dash rather than a misleading zero when nothing
// has been entered yet.
const orDash = (v, render) => (v === null || v === undefined ? '-' : render(v))

function Flag({ level, children }) {
  const colour = level === 'deficit' ? C.red : C.amber
  return (
    <div style={{
      display: 'flex', gap: '0.55rem', alignItems: 'flex-start',
      background: 'var(--cv-bg-2)', borderLeft: `3px solid ${colour}`,
      borderRadius: 6, padding: '0.5rem 0.7rem', marginTop: '0.45rem',
    }}>
      <span style={{ ...mono, fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: colour, fontWeight: 700, paddingTop: '0.12rem', whiteSpace: 'nowrap' }}>
        {level === 'deficit' ? 'Deficit' : 'Gap'}
      </span>
      <span style={{ ...hint, color: C.navy }}>{children}</span>
    </div>
  )
}

function Stat({ label, value, note, colour }) {
  return (
    <div style={{ background: C.white, borderRadius: 12, padding: '0.75rem 0.9rem', borderTop: `3px solid ${colour || C.cyan}`, boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 26px var(--cv-shadow-2)', minWidth: 0 }}>
      <div style={{ ...mono, fontSize: '0.78rem', letterSpacing: '0.1em', color: C.slate, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'var(--cv-font)', fontSize: '1.6rem', fontWeight: 700, color: C.navy, lineHeight: 1.15, wordBreak: 'break-word' }}>{value}</div>
      {note && <div style={{ ...hint, fontSize: '0.8rem', marginTop: '0.15rem' }}>{note}</div>}
    </div>
  )
}

export default function CommercialViability({ clientId, canManage, currency }) {
  const [costLines, setCostLines] = useState([])
  const [tiers, setTiers] = useState([])
  const [market, setMarket] = useState([])
  const [fixed, setFixed] = useState([])
  // The new services, from Decision Point 3. A value proposition is the service the
  // organisation intends to sell, and Decision Point 4 builds the financial model for
  // those rather than for the inventory it is moving away from. Read only
  // here: Decision Point 4 costs them, it does not define them.
  const [servicesRows, setServicesRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [save, setSave] = useState(null)
  const [busy, setBusy] = useState(false)

  // The delivery volume the break even is read against. It is seeded from the
  // annual deliveries already recorded on the cost lines, because that is the
  // volume the cost model was built at. The coach can move it here to test a
  // different plan without disturbing the stored cost model.
  const [targetOverride, setTargetOverride] = useState(null)

  const money = useCallback((v, digits = 0) => formatAmount(num(v), currency, digits), [currency])

  const load = useCallback(async () => {
    if (!clientId) { setCostLines([]); setTiers([]); setMarket([]); setFixed([]); setServicesRows([]); setLoading(false); return }
    setLoading(true)
    try {
      const order = (q) => q.eq('client_id', clientId).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
      const [c, t, m, f, p] = await Promise.all([
        order(supabase.from(T_COST).select('*')),
        order(supabase.from(T_TIERS).select('*')),
        order(supabase.from(T_MARKET).select('*')),
        order(supabase.from(T_FIXED).select('*')),
        order(supabase.from(T_PROPS).select('id, segment_label, capability, assembled_statement, sort_order')),
      ])
      // A failure to read the services is not a reason to refuse the cost
      // model: the numbers are still right, they just cannot be attributed. It
      // shows as an empty service list rather than stopping the screen.
      if (p.error) console.error('CommercialViability: could not read the services', p.error)
      setServicesRows(p.data || [])
      const err = c.error || t.error || m.error || f.error
      if (err) {
        // A cost model with rows missing produces a cost floor that is simply
        // wrong, and a wrong floor sets a wrong price. Better to say the read
        // failed than to show a number built on part of the data.
        console.error('CommercialViability: load failed', err)
        setSave({ ok: false, text: 'Could not load the commercial model. Do not price from what is on screen until it loads.' })
        return
      }
      setSave(null)
      setCostLines(c.data || [])
      setTiers(t.data || [])
      setMarket(m.data || [])
      setFixed(f.data || [])
    } catch (e) {
      console.error('CommercialViability: load threw', e)
      setSave({ ok: false, text: 'Could not load the commercial model. Do not price from what is on screen until it loads.' })
    } finally {
      // Every path, so a thrown request cannot leave this on Loading forever.
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { load() }, [load])

  // ─── generic row editing, shared by the four tables ────────
  const setterFor = (table) => (
    table === T_COST ? setCostLines : table === T_TIERS ? setTiers : table === T_MARKET ? setMarket : setFixed
  )
  const rowsFor = (table) => (
    table === T_COST ? costLines : table === T_TIERS ? tiers : table === T_MARKET ? market : fixed
  )

  function edit(table, id, field, value) {
    setterFor(table)((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  async function commit(table, id, patch) {
    if (!canManage) return
    setterFor(table)((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    setSave({ ok: true, text: 'Saving' })
    const { error } = await supabase.from(table)
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { setSave({ ok: false, text: `Could not save. ${error.message}. Nothing was lost, please try again.` }); return }
    setSave({ ok: true, text: `Saved at ${stamp()}` })
  }

  async function addRow(table, extra = {}) {
    if (!canManage || !clientId) return
    setBusy(true); setSave({ ok: true, text: 'Saving' })
    const existing = rowsFor(table)
    const nextOrder = existing.length ? Math.max(...existing.map((r) => Number(r.sort_order) || 0)) + 1 : 0
    const { data, error } = await supabase.from(table)
      .insert({ client_id: clientId, sort_order: nextOrder, ...extra }).select().single()
    setBusy(false)
    if (error) { setSave({ ok: false, text: `Could not add the line. ${error.message}` }); return }
    setterFor(table)((rs) => [...rs, data])
    setSave({ ok: true, text: `Saved at ${stamp()}` })
  }

  async function removeRow(table, row, what) {
    if (!canManage) return
    if (!window.confirm(`Delete ${what}? This cannot be undone.`)) return
    setBusy(true)
    const { error } = await supabase.from(table).delete().eq('id', row.id)
    setBusy(false)
    if (error) { setSave({ ok: false, text: `Could not delete. ${error.message}` }); return }
    setterFor(table)((rs) => rs.filter((r) => r.id !== row.id))
    setSave({ ok: true, text: `Deleted at ${stamp()}` })
  }

  // A text input that edits locally as you type and saves on blur, so typing
  // never lags behind the keyboard.
  const serviceList = useMemo(() => servicesFromPropositions(servicesRows), [servicesRows])
  const services = useMemo(() => serviceOptions(serviceList), [serviceList])

  const textCell = (table, row, field, placeholder) => (
    canManage
      ? <input aria-label={placeholder || field} style={inp} value={row[field] ?? ''} placeholder={placeholder}
          onChange={(e) => edit(table, row.id, field, e.target.value)}
          onBlur={(e) => commit(table, row.id, { [field]: e.target.value || null })} />
      : <span>{row[field] || '-'}</span>
  )

  const numCell = (table, row, field, placeholder, render) => (
    canManage
      ? <input aria-label={placeholder || field} style={{ ...inp, textAlign: 'right' }} type="number" value={row[field] ?? ''} placeholder={placeholder}
          onChange={(e) => edit(table, row.id, field, e.target.value)}
          onBlur={(e) => commit(table, row.id, { [field]: e.target.value === '' ? null : Number(e.target.value) })} />
      : <span style={mono}>{orDash(row[field], render || money)}</span>
  )

  // Which new service this line is for. Decision Point 4 asks whether a service sustains
  // the organisation, and that cannot be answered by a cost model that does not
  // know which service a cost belongs to. Blank stays available and means
  // shared across services, which is the honest answer for an office or a
  // finance lead rather than a gap to be filled in.
  const serviceCell = (table, row) => {
    if (!canManage) {
      return <span style={{ fontSize: '0.86rem' }}>{serviceLabelFor(serviceList, row.proposition_id)}</span>
    }
    return (
      <select
        aria-label="Which service this line is for"
        style={inp}
        value={row.proposition_id || ''}
        onChange={(e) => {
          const v = e.target.value || null
          edit(table, row.id, 'proposition_id', v)
          commit(table, row.id, { proposition_id: v })
        }}
      >
        <option value="">{SHARED_SERVICE_LABEL}</option>
        {services.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
    )
  }

  // ─── the calculation, all of it, from the pure module ──────
  const seededTarget = useMemo(
    () => costLines.reduce((max, l) => Math.max(max, num(l.annual_deliveries)), 0),
    [costLines],
  )
  const targetDeliveries = targetOverride === null ? seededTarget : num(targetOverride)

  const v = useMemo(
    () => buildViability({ costLines, tiers, marketPrices: market, fixedCosts: fixed, targetDeliveries, currency }),
    [costLines, tiers, market, fixed, targetDeliveries, currency],
  )

  const deficits = v.flags.filter((f) => f.level === 'deficit')
  const gaps = v.flags.filter((f) => f.level === 'gap')

  return (
    <div>
      {/* ── headline: the cost floor and the checks on it ───── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h3 style={secH}>Decision Point 4 commercial viability</h3>
            <div style={{ ...hint, marginTop: '0.3rem', maxWidth: '92ch' }}>
              What one delivery costs, and the price at which the organisation sustains itself.
              Work down the page in order. Cost first, then the market, then price, then break
              even. Done the other way round, the cost estimate quietly bends to fit a price
              somebody already had in mind.
            </div>
          </div>
          <div style={{ ...mono, fontSize: '0.82rem', color: save && save.ok === false ? C.red : C.slate, textAlign: 'right', minWidth: 140 }}>
            {save ? save.text : canManage ? 'All changes save as you type' : 'Read only'}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.7rem', marginTop: '1rem' }}>
          <Stat
            label="Cost floor, one delivery"
            value={money(v.costFloor)}
            note={v.cost.complete ? 'All five categories entered' : `${v.cost.emptyCategories.length} of 5 categories still empty`}
            colour={v.cost.complete ? C.teal : C.amber}
          />
          <Stat label="Direct costs" value={money(v.cost.directCosts)} note="Four categories, before overhead" colour={C.cyan} />
          <Stat
            label="Overhead share"
            value={formatPercent(v.cost.overheadShareOfDirect)}
            note={`Of direct costs. Minimum 20%.`}
            colour={v.cost.overheadBelowMinimum ? C.amber : C.teal}
          />
          <Stat
            label="Annual fixed costs"
            value={money(v.fixed.annualTotal)}
            note={`${money(v.fixed.monthlyTotal)} a month`}
            colour={C.purple}
          />
          <Stat
            label="Target deliveries a year"
            value={targetDeliveries || '-'}
            note="What break even is read against"
            colour={C.slate}
          />
        </div>

        <div style={{ ...hint, marginTop: '0.85rem', maxWidth: '92ch' }}>
          The cost floor is the sum of the five categories below. It is calculated once and used
          by every tier and every break even on this page, so there is only ever one floor in
          play. No price may sit below it.
        </div>

        {deficits.map((f, i) => <Flag key={`d${i}`} level="deficit">{f.message}</Flag>)}
        {gaps.map((f, i) => <Flag key={`g${i}`} level="gap">{f.message}</Flag>)}

        <div style={{ ...hint, marginTop: '0.9rem', paddingTop: '0.7rem', borderTop: `1px solid var(--cv-border-soft)`, maxWidth: '92ch' }}>
          This is the workbook model: cost, price and break even for one service. The full
          financial picture for the organisation, projections, drivers and monthly actuals, lives
          in the ClearView dashboard and is not repeated here. Use this page to set the floor and
          the price. Use the dashboard to run the numbers over time.
        </div>
      </div>

      {/* ── 1. the five cost categories ─────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h3 style={{ ...secH, fontSize: '1.1rem' }}>Cost model, the full baseline</h3>
          <span style={{ ...mono, fontSize: '0.8rem', color: C.slate }}>{costLines.length} line{costLines.length === 1 ? '' : 's'}</span>
        </div>
        <div style={{ ...hint, marginTop: '0.3rem', maxWidth: '92ch' }}>
          Enter every cost of delivering the service once, at the standard a paying client would
          accept. All five categories. An incomplete cost produces a floor the organisation
          cannot survive on.
        </div>

        {loading ? (
          <div style={{ ...hint, marginTop: '0.9rem' }}>Loading the commercial model.</div>
        ) : v.cost.categories.map((cat) => {
          const meta = COST_CATEGORIES.find((c) => c.value === cat.category)
          return (
            <div key={cat.category} style={{ marginTop: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ ...mono, fontSize: '0.82rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: cat.direct ? C.navy : C.purple, fontWeight: 700 }}>
                  {cat.label}
                </div>
                <div style={{ ...mono, fontSize: '0.86rem', color: C.navy }}>
                  Subtotal <b>{money(cat.costPerCycle)}</b> per cycle
                  <span style={{ color: C.slate }}>  |  {money(cat.annualCost)} a year</span>
                </div>
              </div>
              <div style={{ ...hint, fontSize: '0.84rem', marginTop: '0.15rem', maxWidth: '92ch' }}>{meta ? meta.hint : ''}</div>

              <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, minWidth: 200 }}>Cost item</th>
                      <th style={{ ...th, minWidth: 150 }}>Service</th>
                      <th style={{ ...th, width: 110 }}>Unit</th>
                      <th style={{ ...th, width: 100, textAlign: 'right' }}>Qty / cycle</th>
                      <th style={{ ...th, width: 120, textAlign: 'right' }}>Unit cost</th>
                      <th style={{ ...th, width: 130, textAlign: 'right' }}>Cost / cycle</th>
                      <th style={{ ...th, width: 110, textAlign: 'right' }}>Deliveries / yr</th>
                      <th style={{ ...th, width: 130, textAlign: 'right' }}>Annual cost</th>
                      <th style={{ ...th, minWidth: 160 }}>Notes and source</th>
                      {canManage && <th style={{ ...th, width: 44 }} />}
                    </tr>
                  </thead>
                  <tbody>
                    {cat.lines.length === 0 && (
                      <tr>
                        <td style={{ ...td, color: C.slate }} colSpan={canManage ? 10 : 9}>
                          Nothing entered for {cat.label}. A category left empty does not make the
                          cost lower, it makes it incomplete.
                        </td>
                      </tr>
                    )}
                    {cat.lines.map((line) => {
                      const row = costLines.find((r) => r.id === line.id)
                      if (!row) return null
                      return (
                        <tr key={line.id} style={{ borderBottom: '1px solid var(--cv-border-soft)' }}>
                          <td style={td}>{textCell(T_COST, row, 'item', 'What the cost is')}</td>
                          <td style={td}>{serviceCell(T_COST, row)}</td>
                          <td style={td}>{textCell(T_COST, row, 'unit', 'day, set')}</td>
                          <td style={td}>{numCell(T_COST, row, 'qty_per_cycle', '0', (x) => String(x))}</td>
                          <td style={td}>{numCell(T_COST, row, 'unit_cost', '0')}</td>
                          <td style={tdNum}>{money(line.costPerCycle)}</td>
                          <td style={td}>{numCell(T_COST, row, 'annual_deliveries', '0', (x) => String(x))}</td>
                          <td style={{ ...tdNum, color: C.slate }}>{money(line.annualCost)}</td>
                          <td style={td}>{textCell(T_COST, row, 'notes', 'Where the figure came from')}</td>
                          {canManage && (
                            <td style={{ ...td, textAlign: 'right' }}>
                              <button type="button" title="Delete this cost line" disabled={busy} style={xBtn}
                                onClick={() => removeRow(T_COST, row, row.item || 'this cost line')}>x</button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {canManage && (
                <button type="button" style={{ ...btn(C.cyan), marginTop: '0.45rem' }} disabled={busy}
                  onClick={() => addRow(T_COST, { category: cat.category })}>
                  + Add a {cat.label.toLowerCase()} line
                </button>
              )}
            </div>
          )
        })}

        {/* cost summary and the overhead check */}
        {!loading && (
          <div style={{ marginTop: '1.4rem', paddingTop: '0.9rem', borderTop: `1px solid ${C.border}` }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                <tbody>
                  {v.cost.categories.map((cat) => (
                    <tr key={`sum-${cat.category}`} style={{ borderBottom: '1px solid var(--cv-border-soft)' }}>
                      <td style={{ ...td, color: cat.empty ? C.amber : C.navy }}>{cat.label}</td>
                      <td style={tdNum}>{money(cat.costPerCycle)}</td>
                      <td style={{ ...tdNum, color: C.slate }}>{money(cat.annualCost)} a year</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...td, fontWeight: 700 }}>Cost floor, one delivery cycle. Never sell below this.</td>
                    <td style={{ ...tdNum, fontWeight: 700, fontSize: '1.05rem' }}>{money(v.costFloor)}</td>
                    <td style={{ ...tdNum, color: C.slate }}>{money(v.cost.annualCost)} a year</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ ...hint, marginTop: '0.8rem', maxWidth: '92ch' }}>
              <b style={{ color: C.navy }}>Overhead check.</b> Overhead is {formatPercent(v.cost.overheadShareOfDirect)} of
              direct costs ({money(v.cost.overhead)} against {money(v.cost.directCosts)}). The
              recommended minimum is 20 percent.
            </div>
            {v.cost.overheadBelowMinimum && (
              <Flag level="gap">
                Overhead is below the 20 percent minimum, {money(v.cost.overheadShortfall)} short
                of {money(v.cost.overheadMinimum)}. The overhead exists whether it is attributed to
                this service or not. Leaving it out means the organisation is subsidising its
                commercial work from its core budget and does not know it.
              </Flag>
            )}
          </div>
        )}
      </div>

      {/* ── 2. market price reference ───────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h3 style={{ ...secH, fontSize: '1.1rem' }}>Market price reference</h3>
          {canManage && <button type="button" style={btn(C.cyan)} disabled={busy} onClick={() => addRow(T_MARKET)}>+ Add a source</button>}
        </div>
        <div style={{ ...hint, marginTop: '0.3rem', maxWidth: '92ch' }}>
          What comparable providers actually charge, from client research. At least
          {' '}{MINIMUM_MARKET_SOURCES} sources before the range means anything. This is a
          reference, not the price. The floor sets the price.
        </div>

        <div style={{ overflowX: 'auto', marginTop: '0.7rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr>
                <th style={{ ...th, minWidth: 200 }}>Source or provider</th>
                <th style={{ ...th, width: 140, textAlign: 'right' }}>Price quoted</th>
                <th style={{ ...th, width: 140 }}>Quality level</th>
                <th style={{ ...th, width: 140 }}>Source date</th>
                <th style={{ ...th, minWidth: 180 }}>Notes</th>
                {canManage && <th style={{ ...th, width: 44 }} />}
              </tr>
            </thead>
            <tbody>
              {market.length === 0 && (
                <tr><td style={{ ...td, color: C.slate }} colSpan={canManage ? 6 : 5}>No market prices recorded yet.</td></tr>
              )}
              {market.map((r) => {
                const below = r.price !== null && r.price !== undefined && num(r.price) < v.costFloor && v.costFloor > 0
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--cv-border-soft)' }}>
                    <td style={td}>{textCell(T_MARKET, r, 'source', 'Who quoted it')}</td>
                    <td style={td}>
                      {numCell(T_MARKET, r, 'price', '0')}
                      {below && <div style={{ ...mono, fontSize: '0.78rem', color: C.amber, marginTop: '0.15rem', textAlign: 'right' }}>Below our floor</div>}
                    </td>
                    <td style={td}>{textCell(T_MARKET, r, 'quality_level', 'High, Mid, Low')}</td>
                    <td style={td}>
                      {canManage
                        ? <input aria-label="Date this price was seen" type="date" style={inp} value={r.source_date || ''}
                            onChange={(e) => commit(T_MARKET, r.id, { source_date: e.target.value || null })} />
                        : <span>{r.source_date || '-'}</span>}
                    </td>
                    <td style={td}>{textCell(T_MARKET, r, 'notes', 'What was included at that price')}</td>
                    {canManage && (
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button type="button" title="Delete this source" disabled={busy} style={xBtn}
                          onClick={() => removeRow(T_MARKET, r, r.source || 'this market source')}>x</button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ ...hint, marginTop: '0.75rem' }}>
          <b style={{ color: C.navy }}>Range.</b>{' '}
          {v.market.pricedCount === 0
            ? 'No priced sources yet.'
            : <>
                {money(v.market.low)} to {money(v.market.high)} across {v.market.pricedCount} source
                {v.market.pricedCount === 1 ? '' : 's'}, median {money(v.market.median)}. Our floor
                is {money(v.costFloor)}
                {v.market.floorWithinRange ? ', which sits inside the observed range.' : '.'}
              </>}
        </div>
        {!v.market.enoughSources && (
          <Flag level="gap">
            Only {v.market.pricedCount} priced source{v.market.pricedCount === 1 ? '' : 's'}. The
            method asks for at least {MINIMUM_MARKET_SOURCES} before the range can be read against
            the floor with any confidence.
          </Flag>
        )}
        {v.market.floorAboveMarket && (
          <Flag level="deficit">
            The cost floor sits above every price recorded. Three options, and only three: reduce
            the cost of delivery, reframe the value proposition against a larger outcome the buyer
            already pays for, or accept that this segment is not viable at this price point and
            look for one with higher willingness to pay.
          </Flag>
        )}
      </div>

      {/* ── 3. pricing tiers ────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h3 style={{ ...secH, fontSize: '1.1rem' }}>Pricing tiers</h3>
          {canManage && <button type="button" style={btn(C.cyan)} disabled={busy} onClick={() => addRow(T_TIERS)}>+ Add a tier</button>}
        </div>
        <div style={{ ...hint, marginTop: '0.3rem', maxWidth: '92ch' }}>
          Three tiers are required. Entry is the minimum viable version for a first time buyer.
          Standard is the core service and is where break even lives. Premium is the full ongoing
          relationship. Two more may be added once the first three have been validated in the
          pilot.
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
          {v.tierCoverage.map((t) => (
            <span key={t.key} style={{
              ...mono, fontSize: '0.78rem', padding: '0.2rem 0.5rem', borderRadius: 5,
              border: `1px solid ${t.priced ? C.teal : t.present ? C.amber : C.red}`,
              color: t.priced ? C.teal : t.present ? C.amber : C.red,
            }}>
              {t.label}: {t.priced ? 'priced' : t.present ? 'no price yet' : 'missing'}
            </span>
          ))}
        </div>

        <div style={{ overflowX: 'auto', marginTop: '0.7rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1020 }}>
            <thead>
              <tr>
                <th style={{ ...th, minWidth: 170 }}>Tier name</th>
                <th style={{ ...th, minWidth: 200 }}>What is included</th>
                <th style={{ ...th, minWidth: 160 }}>Target client type</th>
                <th style={{ ...th, width: 130, textAlign: 'right' }}>Price</th>
                <th style={{ ...th, width: 130, textAlign: 'right' }}>Cost floor</th>
                <th style={{ ...th, width: 130, textAlign: 'right' }}>Margin</th>
                <th style={{ ...th, width: 130, textAlign: 'right' }}>% above floor</th>
                {canManage && <th style={{ ...th, width: 44 }} />}
              </tr>
            </thead>
            <tbody>
              {tiers.length === 0 && (
                <tr><td style={{ ...td, color: C.slate }} colSpan={canManage ? 8 : 7}>No tiers yet. Start with Entry and Standard.</td></tr>
              )}
              {v.tiers.map((t) => {
                const row = tiers.find((r) => r.id === t.id)
                if (!row) return null
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--cv-border-soft)', background: t.belowFloor ? 'var(--cv-bg-2)' : 'transparent' }}>
                    <td style={td}>{textCell(T_TIERS, row, 'tier_name', 'Entry, Standard, Premium')}</td>
                    <td style={td}>{textCell(T_TIERS, row, 'included', 'Exactly what the buyer gets')}</td>
                    <td style={td}>{textCell(T_TIERS, row, 'target_client', 'Who this tier is for')}</td>
                    <td style={td}>{numCell(T_TIERS, row, 'price', '0')}</td>
                    <td style={{ ...tdNum, color: C.slate }}>{money(t.costFloor)}</td>
                    <td style={{ ...tdNum, color: t.belowFloor ? C.red : C.navy, fontWeight: t.belowFloor ? 700 : 400 }}>
                      {orDash(t.margin, (x) => money(x))}
                    </td>
                    <td style={{ ...tdNum, color: t.belowFloor ? C.red : C.navy }}>
                      {t.marginRatio === null ? '-' : formatPercent(t.marginRatio)}
                    </td>
                    {canManage && (
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button type="button" title="Delete this tier" disabled={busy} style={xBtn}
                          onClick={() => removeRow(T_TIERS, row, row.tier_name || 'this tier')}>x</button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {v.tiers.filter((t) => t.deficitWarning).map((t) => (
          <Flag key={`tw-${t.id}`} level={t.belowFloor ? 'deficit' : 'gap'}>
            <b>{t.tierName || 'This tier'}.</b> {t.deficitWarning}
          </Flag>
        ))}

        <div style={{ ...hint, marginTop: '0.8rem', display: 'grid', gap: '0.3rem' }}>
          {REQUIRED_TIERS.map((t) => (
            <span key={t.key}><b style={{ color: C.navy }}>{t.label}.</b> {t.hint}</span>
          ))}
        </div>
      </div>

      {/* ── 4. fixed costs and break even ───────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h3 style={{ ...secH, fontSize: '1.1rem' }}>Fixed costs and break even</h3>
          {canManage && <button type="button" style={btn(C.cyan)} disabled={busy} onClick={() => addRow(T_FIXED)}>+ Add a fixed cost</button>}
        </div>
        <div style={{ ...hint, marginTop: '0.3rem', maxWidth: '92ch' }}>
          Fixed costs are what the organisation pays whether it delivers or not: salaries,
          premises, software, marketing. Enter them monthly. Break even is annual fixed costs
          divided by the contribution each delivery makes, and contribution is price minus the
          cost floor.
        </div>

        <div style={{ overflowX: 'auto', marginTop: '0.7rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ ...th, minWidth: 240 }}>Fixed cost item</th>
                <th style={{ ...th, width: 150, textAlign: 'right' }}>Per month</th>
                <th style={{ ...th, width: 150, textAlign: 'right' }}>Per year</th>
                {canManage && <th style={{ ...th, width: 44 }} />}
              </tr>
            </thead>
            <tbody>
              {fixed.length === 0 && (
                <tr><td style={{ ...td, color: C.slate }} colSpan={canManage ? 4 : 3}>No fixed costs entered, so break even cannot be calculated yet.</td></tr>
              )}
              {fixed.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--cv-border-soft)' }}>
                  <td style={td}>{textCell(T_FIXED, r, 'item', 'Salaries, office, software')}</td>
                  <td style={td}>{numCell(T_FIXED, r, 'monthly_amount', '0')}</td>
                  <td style={{ ...tdNum, color: C.slate }}>{money(num(r.monthly_amount) * 12)}</td>
                  {canManage && (
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button type="button" title="Delete this fixed cost" disabled={busy} style={xBtn}
                        onClick={() => removeRow(T_FIXED, r, r.item || 'this fixed cost')}>x</button>
                    </td>
                  )}
                </tr>
              ))}
              <tr>
                <td style={{ ...td, fontWeight: 700 }}>Total fixed costs</td>
                <td style={{ ...tdNum, fontWeight: 700 }}>{money(v.fixed.monthlyTotal)}</td>
                <td style={{ ...tdNum, fontWeight: 700 }}>{money(v.fixed.annualTotal)}</td>
                {canManage && <td style={td} />}
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <span style={{ ...hint, color: C.navy }}>Target deliveries a year</span>
          {canManage
            ? <input aria-label="Target deliveries per year" style={{ ...inp, width: 110, textAlign: 'right' }} type="number"
                value={targetOverride === null ? seededTarget : targetOverride}
                onChange={(e) => setTargetOverride(e.target.value === '' ? 0 : Number(e.target.value))} />
            : <span style={{ ...mono, color: C.navy }}>{targetDeliveries || '-'}</span>}
          <span style={{ ...hint, fontSize: '0.84rem', maxWidth: '52ch' }}>
            Seeded from the annual deliveries on the cost lines, which is the volume the cost
            model was built at. Change it here to read break even against a different plan.
          </span>
        </div>

        <div style={{ overflowX: 'auto', marginTop: '0.9rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
            <thead>
              <tr>
                <th style={{ ...th, minWidth: 170 }}>Pricing tier</th>
                <th style={{ ...th, width: 130, textAlign: 'right' }}>Price</th>
                <th style={{ ...th, width: 140, textAlign: 'right' }}>Variable cost</th>
                <th style={{ ...th, width: 140, textAlign: 'right' }}>Contribution</th>
                <th style={{ ...th, width: 150, textAlign: 'right' }}>Break even / year</th>
                <th style={{ ...th, width: 150 }}>Clears target?</th>
                <th style={{ ...th, width: 170, textAlign: 'right' }}>Surplus at target</th>
              </tr>
            </thead>
            <tbody>
              {v.tiers.length === 0 && (
                <tr><td style={{ ...td, color: C.slate }} colSpan={7}>Add a pricing tier above to read break even.</td></tr>
              )}
              {v.tiers.map((t) => (
                <tr key={`be-${t.id}`} style={{ borderBottom: '1px solid var(--cv-border-soft)' }}>
                  <td style={td}>{t.tierName || 'Unnamed tier'}</td>
                  <td style={tdNum}>{orDash(t.price, (x) => money(x))}</td>
                  <td style={{ ...tdNum, color: C.slate }}>{money(t.costFloor)}</td>
                  <td style={{ ...tdNum, color: t.belowFloor ? C.red : C.navy }}>{orDash(t.contribution, (x) => money(x))}</td>
                  <td style={tdNum}>
                    {t.price === null
                      ? '-'
                      : t.breakEvenDeliveries === null
                        ? <span style={{ color: C.red }}>Never</span>
                        : t.breakEvenDeliveries}
                  </td>
                  <td style={td}>
                    {t.price === null
                      ? <span style={{ color: C.slate }}>-</span>
                      : t.clearsTargetVolume
                        ? <span style={{ ...mono, fontSize: '0.8rem', color: C.teal }}>Yes, at {targetDeliveries} a year</span>
                        : <span style={{ ...mono, fontSize: '0.8rem', color: C.amber }}>Not at {targetDeliveries} a year</span>}
                  </td>
                  <td style={{ ...tdNum, color: t.annualSurplusOrDeficit !== null && t.annualSurplusOrDeficit < 0 ? C.red : C.navy }}>
                    {orDash(t.annualSurplusOrDeficit, (x) => money(x))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ ...hint, marginTop: '0.8rem', maxWidth: '92ch' }}>
          A tier that shows <b style={{ color: C.red }}>Never</b> does not break even at any
          volume, because its price does not clear the cost floor. Selling more of it makes the
          loss larger, not smaller. That is a pricing decision to reopen, not a sales target to
          raise.
        </div>
      </div>
    </div>
  )
}
