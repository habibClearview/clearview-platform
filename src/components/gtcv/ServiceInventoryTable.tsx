// @ts-nocheck
'use client'
// ============================================================
// Decision Point 1 SERVICE INVENTORY TABLE
//
// The working surface for the Service Reality Audit: one row per service the
// organisation currently delivers, and for each one the honest answers that
// produce the Decision Point 1 decision.
//
//   what it delivers      -> the real output, not the proposal language
//   grant or market logic -> does it exist because a donor funds it, or
//                            because a customer buys it
//   genuine demand        -> yes / no / unsure, answered separately from the
//                            logic question, because donor driven supply
//                            often looks like demand
//   hidden delivery costs -> what the current budget does not show
//   delivery quality risk -> what breaks at real volume
//   decision              -> keep / redesign / pause / stop
//
// A summary strip counts the decisions, so a coach can see at a glance
// whether the audit has actually concluded anything or is still all blanks.
//
// Writes to gtcv_service_inventory (see
// supabase/migrations/2026_08_09_gtcv_dp_tables_a.sql). Reads and writes go
// through the browser Supabase client, so RLS scopes everything to the
// signed-in viewer. canManage=false renders the same table read only.
//
// CLIENT AGNOSTIC: no service, client or programme is named here. Every row
// is data entered during the session.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const TABLE = 'gtcv_service_inventory'

const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', white: 'var(--cv-card)',
  slate: 'var(--cv-slate)', border: 'var(--cv-border)', teal: 'var(--cv-teal)',
  red: 'var(--cv-red)', green: 'var(--cv-green)', amber: 'var(--cv-amber)',
  purple: 'var(--cv-purple)', alt: 'var(--cv-alt)',
}
const card = { background: C.white, border: '1px solid var(--cv-border-soft)', borderRadius: 14, padding: '1.35rem 1.5rem', marginBottom: '1.25rem', boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)' }
const secH = { fontFamily: 'var(--cv-font)', fontSize: '1.32rem', fontWeight: 700, color: C.navy, margin: 0 }
const hint = { fontSize: '1.01rem', color: C.slate, lineHeight: 1.4 }
const th = { padding: '0.45rem 0.6rem', textAlign: 'left', fontFamily: 'var(--cv-font-mono)', fontSize: '0.87rem', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, color: C.slate, borderBottom: `1px solid ${C.border}`, verticalAlign: 'bottom' }
const td = { padding: '0.35rem 0.4rem', verticalAlign: 'top', borderBottom: '1px solid var(--cv-border-soft)' }
const cell = { width: '100%', padding: '0.4rem 0.55rem', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: '1.01rem', fontFamily: 'inherit', background: 'var(--cv-bg-2)', color: C.navy, boxSizing: 'border-box' }
const readCell = { fontSize: '1.01rem', color: C.navy, lineHeight: 1.4, padding: '0.4rem 0.55rem', whiteSpace: 'pre-wrap', minHeight: '1.2rem' }
const ghostBtn = { fontFamily: 'var(--cv-font-mono)', fontSize: '0.91rem', padding: '0.3rem 0.7rem', border: `1px solid ${C.cyan}`, borderRadius: 6, background: 'transparent', color: C.cyan, cursor: 'pointer' }
const solidBtn = { fontFamily: 'var(--cv-font-mono)', fontSize: '0.95rem', fontWeight: 700, padding: '0.38rem 0.9rem', border: 'none', borderRadius: 6, background: C.cyan, color: 'var(--cv-on-accent)', cursor: 'pointer' }
const delBtn = { fontFamily: 'var(--cv-font-mono)', fontSize: '0.91rem', padding: '0.25rem 0.5rem', border: `1px solid ${C.border}`, borderRadius: 6, background: 'transparent', color: C.red, cursor: 'pointer' }

// The workbook columns, in the order the conversation runs.
const FIELDS = [
  { key: 'service_name', label: 'Service', type: 'text', width: 160, placeholder: 'Name the service' },
  { key: 'what_it_delivers', label: 'What it delivers', type: 'area', width: 200, placeholder: 'The real output' },
  { key: 'logic_type', label: 'Grant or market logic', type: 'select', width: 140, options: [
    { v: '', l: 'Not set' }, { v: 'grant', l: 'Grant logic' }, { v: 'market', l: 'Market logic' },
    { v: 'mixed', l: 'Mixed' }, { v: 'unclear', l: 'Unclear' },
  ] },
  { key: 'has_demand', label: 'Genuine demand', type: 'select', width: 110, options: [
    { v: '', l: 'Not set' }, { v: 'yes', l: 'Yes' }, { v: 'no', l: 'No' }, { v: 'unsure', l: 'Unsure' },
  ] },
  { key: 'hidden_delivery_costs', label: 'Hidden delivery costs', type: 'area', width: 180, placeholder: 'What the budget does not show' },
  { key: 'delivery_quality_risk', label: 'Delivery quality risk', type: 'area', width: 180, placeholder: 'What breaks at volume' },
  { key: 'decision', label: 'Decision', type: 'select', width: 130, options: [
    { v: '', l: 'Not decided' }, { v: 'keep', l: 'Keep' }, { v: 'redesign', l: 'Redesign' },
    { v: 'pause', l: 'Pause' }, { v: 'stop', l: 'Stop' },
  ] },
  { key: 'notes', label: 'Notes', type: 'area', width: 180, placeholder: '' },
]

const DECISIONS = [
  { v: 'keep', l: 'Keep', color: C.green },
  { v: 'redesign', l: 'Redesign', color: C.amber },
  { v: 'pause', l: 'Pause', color: C.purple },
  { v: 'stop', l: 'Stop', color: C.red },
]

function optionLabel(field, value) {
  const opt = (field.options || []).find((o) => o.v === (value || ''))
  return opt ? opt.l : value || ''
}

export default function ServiceInventoryTable({ clientId, canManage }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('idle') // idle | saving | saved
  const [err, setErr] = useState(null)
  const [dirty, setDirty] = useState({})       // { rowId: { field: true } }
  const [busy, setBusy] = useState(false)

  // Refs so a blur handler always reads the current row values and the
  // current dirty map, never the ones captured when the input rendered.
  const rowsRef = useRef([])
  const dirtyRef = useRef({})
  useEffect(() => { rowsRef.current = rows }, [rows])
  useEffect(() => { dirtyRef.current = dirty }, [dirty])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!clientId) { setRows([]); setLoading(false); return }
      setLoading(true)
      // setLoading(false) belongs in a finally. Left after the await, a thrown
      // error, for example an aborted request, skips it and the surface sits on
      // its loading message forever with nothing to say why.
      try {
        const { data, error } = await supabase
          .from(TABLE)
          .select('*')
          .eq('client_id', clientId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true })
        if (cancelled) return
        if (error) {
          console.error('ServiceInventoryTable: load failed', error)
          setErr('Could not load the service inventory. Try again.')
        }
        else { setErr(null); setRows(data || []) }
      } catch (e) {
        if (cancelled) return
        console.error('ServiceInventoryTable: load threw', e)
        setErr('Could not load the service inventory. Try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [clientId])

  const pendingCount = useMemo(
    () => Object.keys(dirty).filter((id) => Object.keys(dirty[id] || {}).length > 0).length,
    [dirty]
  )

  const counts = useMemo(() => {
    const out = { keep: 0, redesign: 0, pause: 0, stop: 0, undecided: 0 }
    rows.forEach((r) => {
      if (r.decision && out[r.decision] !== undefined) out[r.decision] += 1
      else out.undecided += 1
    })
    return out
  }, [rows])

  function setField(id, field, value) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
    setDirty((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: true } }))
    setStatus('idle')
  }

  async function saveRow(id) {
    const fields = Object.keys(dirtyRef.current[id] || {})
    if (!fields.length) return
    const row = rowsRef.current.find((r) => r.id === id)
    if (!row) return
    const patch = { updated_at: new Date().toISOString() }
    fields.forEach((f) => { patch[f] = row[f] === '' ? null : row[f] })
    // The row stays marked unsaved until the write comes back. Clearing it
    // first made the Save button disappear on a failed write, so the coach saw
    // an error with nothing left to retry and lost the edit on reload.
    setStatus('saving')
    const { error } = await supabase.from(TABLE).update(patch).eq('id', id)
    if (error) {
      setErr('Could not save. Your changes are still here, try again.')
      setStatus('idle')
      return
    }
    setDirty((prev) => { const next = { ...prev }; delete next[id]; return next })
    dirtyRef.current = (() => { const n = { ...dirtyRef.current }; delete n[id]; return n })()
    setErr(null); setStatus('saved')
  }

  async function saveAll() {
    const ids = Object.keys(dirtyRef.current)
    for (const id of ids) await saveRow(id)
  }

  async function addRow() {
    if (!clientId || busy) return
    setBusy(true)
    const nextOrder = rows.reduce((m, r) => Math.max(m, Number(r.sort_order) || 0), 0) + 1
    const { data, error } = await supabase
      .from(TABLE)
      .insert([{ client_id: clientId, sort_order: nextOrder }])
      .select()
      .single()
    setBusy(false)
    if (error) { setErr('Could not add a row: ' + error.message); return }
    setErr(null)
    setRows((prev) => [...prev, data])
  }

  async function removeRow(id) {
    const row = rows.find((r) => r.id === id)
    const name = row && row.service_name ? row.service_name : 'this service'
    if (typeof window !== 'undefined' && !window.confirm(`Delete ${name} from the inventory?`)) return
    setRows((prev) => prev.filter((r) => r.id !== id))
    setDirty((prev) => { const next = { ...prev }; delete next[id]; return next })
    const { error } = await supabase.from(TABLE).delete().eq('id', id)
    if (error) setErr('Could not delete: ' + error.message)
    else setErr(null)
  }

  function statusPill() {
    if (status === 'saving') return { text: 'Saving', color: C.amber }
    if (pendingCount > 0) return { text: `${pendingCount} unsaved row${pendingCount === 1 ? '' : 's'}`, color: C.amber }
    if (status === 'saved') return { text: 'Saved', color: C.green }
    return null
  }
  const pill = statusPill()

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
        <div>
          <div style={secH}>Service Inventory</div>
          <div style={{ ...hint, marginTop: '0.25rem' }}>
            One row per service. What it delivers, whether it runs on grant logic or market
            logic, and what happens to it next.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {pill && (
            <span style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.87rem', color: pill.color, border: `1px solid ${pill.color}`, borderRadius: 999, padding: '0.15rem 0.6rem' }}>
              {pill.text}
            </span>
          )}
          {canManage && pendingCount > 0 && <button type="button" style={solidBtn} onClick={saveAll}>Save</button>}
          {canManage && <button type="button" style={ghostBtn} onClick={addRow} disabled={busy}>+ Add row</button>}
        </div>
      </div>

      {err && <div style={{ fontSize: '1.01rem', color: C.red, margin: '0.5rem 0' }}>{err}</div>}

      {/* Decision summary. Counts are the point: an audit with every row
          undecided has not concluded anything yet. */}
      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.85rem 0 1rem' }}>
          {DECISIONS.map((d) => (
            <div key={d.v} style={{ borderTop: `3px solid ${d.color}`, background: C.alt, borderRadius: 8, padding: '0.5rem 0.9rem', minWidth: 96 }}>
              <div style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.85rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.slate }}>{d.l}</div>
              <div style={{ fontFamily: 'var(--cv-font)', fontSize: '1.5rem', fontWeight: 700, color: d.color, lineHeight: 1.1 }}>{counts[d.v]}</div>
            </div>
          ))}
          <div style={{ borderTop: `3px solid ${C.slate}`, background: C.alt, borderRadius: 8, padding: '0.5rem 0.9rem', minWidth: 96 }}>
            <div style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.85rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.slate }}>Not decided</div>
            <div style={{ fontFamily: 'var(--cv-font)', fontSize: '1.5rem', fontWeight: 700, color: C.slate, lineHeight: 1.1 }}>{counts.undecided}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={hint}>Loading the service inventory...</div>
      ) : rows.length === 0 ? (
        <div style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: '1.4rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--cv-font)', fontSize: '1.15rem', color: C.navy, marginBottom: '0.35rem' }}>
            No services listed yet
          </div>
          <div style={{ ...hint, marginBottom: canManage ? '0.9rem' : 0 }}>
            Start with everything the organisation delivers today, including the work nobody
            calls a service. The decision column comes last.
          </div>
          {canManage && <button type="button" style={solidBtn} onClick={addRow} disabled={busy}>+ Add the first service</button>}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
            <thead>
              <tr>
                {FIELDS.map((f) => <th key={f.key} style={{ ...th, minWidth: f.width }}>{f.label}</th>)}
                {canManage && <th style={{ ...th, width: 44 }} />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {FIELDS.map((f) => (
                    <td key={f.key} style={{ ...td, minWidth: f.width }}>
                      {!canManage ? (
                        <div style={readCell}>
                          {f.type === 'select' ? (optionLabel(f, r[f.key]) || '') : (r[f.key] || '')}
                        </div>
                      ) : f.type === 'select' ? (
                        <select
                           aria-label={f.label}
                           style={cell}
                          value={r[f.key] || ''}
                          onChange={(e) => setField(r.id, f.key, e.target.value)}
                          onBlur={() => saveRow(r.id)}
                        >
                          {f.options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                      ) : f.type === 'area' ? (
                        <textarea
                           aria-label={f.label}
                           style={{ ...cell, minHeight: 54, resize: 'vertical', lineHeight: 1.35 }}
                          value={r[f.key] || ''}
                          placeholder={f.placeholder}
                          onChange={(e) => setField(r.id, f.key, e.target.value)}
                          onBlur={() => saveRow(r.id)}
                        />
                      ) : (
                        <input
                           aria-label={f.label}
                           style={cell}
                          value={r[f.key] || ''}
                          placeholder={f.placeholder}
                          onChange={(e) => setField(r.id, f.key, e.target.value)}
                          onBlur={() => saveRow(r.id)}
                        />
                      )}
                    </td>
                  ))}
                  {canManage && (
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button type="button" style={delBtn} onClick={() => removeRow(r.id)} title="Delete this row">x</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!canManage && rows.length > 0 && (
        <div style={{ ...hint, marginTop: '0.7rem' }}>Read only. Ask the engagement coach to edit this table.</div>
      )}
    </div>
  )
}
