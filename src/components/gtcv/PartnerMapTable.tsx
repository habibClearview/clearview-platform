// @ts-nocheck
'use client'
// ============================================================
// DP06 PARTNER CATEGORISATION TABLE
//
// The working surface for partner categorisation: one row per partner, and
// for each one the question DP06 actually turns on, which is not "are they
// useful" but "what is this relationship, and does it help or hurt the
// commercial identity we are building".
//
//   type            -> referral / co-delivery / endorsement / conflict.
//                      Conflict is a real category: a partner chasing the
//                      same buyer has to be named as one.
//   what they bring -> the asset, reach or credibility on their side
//   what they need  -> the ask on our side, stated honestly
//   positioning     -> strengthens / neutral / compromises / unclear
//   action          -> what happens to the relationship next
//
// Writes to gtcv_partner_map (see
// supabase/migrations/2026_08_09_gtcv_dp_tables_a.sql). Reads and writes go
// through the browser Supabase client, so RLS scopes everything to the
// signed-in viewer. canManage=false renders the same table read only.
//
// CLIENT AGNOSTIC: no partner, client or programme is named here. Every row
// is data entered during the session.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const TABLE = 'gtcv_partner_map'

const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', white: 'var(--cv-card)',
  slate: 'var(--cv-slate)', border: 'var(--cv-border)', teal: 'var(--cv-teal)',
  red: 'var(--cv-red)', green: 'var(--cv-green)', amber: 'var(--cv-amber)',
  purple: 'var(--cv-purple)', alt: 'var(--cv-alt)',
}
const card = { background: C.white, border: '1px solid var(--cv-border-soft)', borderRadius: 14, padding: '1.35rem 1.5rem', marginBottom: '1.25rem', boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)' }
const secH = { fontFamily: 'Georgia,serif', fontSize: '1.32rem', fontWeight: 700, color: C.navy, margin: 0 }
const hint = { fontSize: '1.01rem', color: C.slate, lineHeight: 1.4 }
const th = { padding: '0.45rem 0.6rem', textAlign: 'left', fontFamily: 'monospace', fontSize: '0.87rem', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, color: C.slate, borderBottom: `1px solid ${C.border}`, verticalAlign: 'bottom' }
const td = { padding: '0.35rem 0.4rem', verticalAlign: 'top', borderBottom: '1px solid var(--cv-border-soft)' }
const cell = { width: '100%', padding: '0.4rem 0.55rem', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: '1.01rem', fontFamily: 'inherit', background: 'var(--cv-bg-2)', color: C.navy, boxSizing: 'border-box' }
const readCell = { fontSize: '1.01rem', color: C.navy, lineHeight: 1.4, padding: '0.4rem 0.55rem', whiteSpace: 'pre-wrap', minHeight: '1.2rem' }
const ghostBtn = { fontFamily: 'monospace', fontSize: '0.91rem', padding: '0.3rem 0.7rem', border: `1px solid ${C.cyan}`, borderRadius: 6, background: 'transparent', color: C.cyan, cursor: 'pointer' }
const solidBtn = { fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, padding: '0.38rem 0.9rem', border: 'none', borderRadius: 6, background: C.cyan, color: 'var(--cv-on-accent)', cursor: 'pointer' }
const delBtn = { fontFamily: 'monospace', fontSize: '0.91rem', padding: '0.25rem 0.5rem', border: `1px solid ${C.border}`, borderRadius: 6, background: 'transparent', color: C.red, cursor: 'pointer' }

const FIELDS = [
  { key: 'partner_name', label: 'Partner', type: 'text', width: 160, placeholder: 'Name the partner' },
  { key: 'partner_type', label: 'Type', type: 'select', width: 140, options: [
    { v: '', l: 'Not set' }, { v: 'referral', l: 'Referral' }, { v: 'co_delivery', l: 'Co-delivery' },
    { v: 'endorsement', l: 'Endorsement' }, { v: 'conflict', l: 'Conflict' },
  ] },
  { key: 'what_they_bring', label: 'What they bring', type: 'area', width: 200, placeholder: 'Reach, credibility, capability' },
  { key: 'what_they_need', label: 'What they need from us', type: 'area', width: 200, placeholder: 'The ask on our side' },
  { key: 'positioning_effect', label: 'Strengthens or compromises positioning', type: 'select', width: 150, options: [
    { v: '', l: 'Not set' }, { v: 'strengthens', l: 'Strengthens' }, { v: 'neutral', l: 'Neutral' },
    { v: 'compromises', l: 'Compromises' }, { v: 'unclear', l: 'Unclear' },
  ] },
  { key: 'action', label: 'Action', type: 'area', width: 180, placeholder: 'What happens next' },
  { key: 'notes', label: 'Notes', type: 'area', width: 170, placeholder: '' },
]

// Counted in the summary strip so a partner list that is all "strengthens"
// gets challenged rather than accepted.
const EFFECTS = [
  { v: 'strengthens', l: 'Strengthens', color: C.green },
  { v: 'neutral', l: 'Neutral', color: C.slate },
  { v: 'compromises', l: 'Compromises', color: C.red },
  { v: 'unclear', l: 'Unclear', color: C.amber },
]

function optionLabel(field, value) {
  const opt = (field.options || []).find((o) => o.v === (value || ''))
  return opt ? opt.l : value || ''
}

export default function PartnerMapTable({ clientId, canManage }) {
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
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('client_id', clientId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (error) setErr('Could not load the partner map: ' + error.message)
      else { setErr(null); setRows(data || []) }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [clientId])

  const pendingCount = useMemo(
    () => Object.keys(dirty).filter((id) => Object.keys(dirty[id] || {}).length > 0).length,
    [dirty]
  )

  const counts = useMemo(() => {
    const out = { strengthens: 0, neutral: 0, compromises: 0, unclear: 0, unassessed: 0 }
    rows.forEach((r) => {
      if (r.positioning_effect && out[r.positioning_effect] !== undefined) out[r.positioning_effect] += 1
      else out.unassessed += 1
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
    const name = row && row.partner_name ? row.partner_name : 'this partner'
    if (typeof window !== 'undefined' && !window.confirm(`Delete ${name} from the partner map?`)) return
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
          <div style={secH}>Partner Categorisation</div>
          <div style={{ ...hint, marginTop: '0.25rem' }}>
            One row per partner. What the relationship really is, what each side gets, and
            whether it strengthens or compromises commercial positioning.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {pill && (
            <span style={{ fontFamily: 'monospace', fontSize: '0.87rem', color: pill.color, border: `1px solid ${pill.color}`, borderRadius: 999, padding: '0.15rem 0.6rem' }}>
              {pill.text}
            </span>
          )}
          {canManage && pendingCount > 0 && <button style={solidBtn} onClick={saveAll}>Save</button>}
          {canManage && <button style={ghostBtn} onClick={addRow} disabled={busy}>+ Add row</button>}
        </div>
      </div>

      {err && <div style={{ fontSize: '1.01rem', color: C.red, margin: '0.5rem 0' }}>{err}</div>}

      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.85rem 0 1rem' }}>
          {EFFECTS.map((e) => (
            <div key={e.v} style={{ borderTop: `3px solid ${e.color}`, background: C.alt, borderRadius: 8, padding: '0.5rem 0.9rem', minWidth: 108 }}>
              <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.slate }}>{e.l}</div>
              <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.5rem', fontWeight: 700, color: e.color, lineHeight: 1.1 }}>{counts[e.v]}</div>
            </div>
          ))}
          <div style={{ borderTop: `3px solid ${C.slate}`, background: C.alt, borderRadius: 8, padding: '0.5rem 0.9rem', minWidth: 108 }}>
            <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.slate }}>Not assessed</div>
            <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.5rem', fontWeight: 700, color: C.slate, lineHeight: 1.1 }}>{counts.unassessed}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={hint}>Loading the partner map...</div>
      ) : rows.length === 0 ? (
        <div style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: '1.4rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.15rem', color: C.navy, marginBottom: '0.35rem' }}>
            No partners mapped yet
          </div>
          <div style={{ ...hint, marginBottom: canManage ? '0.9rem' : 0 }}>
            List every organisation already in the picture, including the ones that compete
            for the same buyer. Categorise before judging.
          </div>
          {canManage && <button style={solidBtn} onClick={addRow} disabled={busy}>+ Add the first partner</button>}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1120 }}>
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
                          style={cell}
                          value={r[f.key] || ''}
                          onChange={(e) => setField(r.id, f.key, e.target.value)}
                          onBlur={() => saveRow(r.id)}
                        >
                          {f.options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                      ) : f.type === 'area' ? (
                        <textarea
                          style={{ ...cell, minHeight: 54, resize: 'vertical', lineHeight: 1.35 }}
                          value={r[f.key] || ''}
                          placeholder={f.placeholder}
                          onChange={(e) => setField(r.id, f.key, e.target.value)}
                          onBlur={() => saveRow(r.id)}
                        />
                      ) : (
                        <input
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
                      <button style={delBtn} onClick={() => removeRow(r.id)} title="Delete this row">x</button>
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
