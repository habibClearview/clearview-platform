// @ts-nocheck
'use client'
// ============================================================
// DP08 CHANNEL LOGIC TABLE
//
// The working surface for the scale pathway: one row per segment, and for
// each one the route to that segment plus the test that decides whether the
// route is real.
//
//   entry or scale  -> is this the way in, or the way to grow once in
//   channel         -> the route itself
//   channel logic   -> WHY this channel reaches this segment. The reasoning
//                      matters more than the label; a channel with no logic
//                      behind it is a wish.
//   independent of programme facilitation -> the hard question. If the route
//                      only works because the programme makes the
//                      introduction, it does not survive handover.
//   evidence needed -> what still has to be proven
//   first action + timeline -> what happens next, and by when
//
// The summary strip counts how many segments have a channel that stands on
// its own, because that count is the real scale readiness signal.
//
// Writes to gtcv_channel_logic (see
// supabase/migrations/2026_08_09_gtcv_dp_tables_a.sql). Reads and writes go
// through the browser Supabase client, so RLS scopes everything to the
// signed-in viewer. canManage=false renders the same table read only.
//
// CLIENT AGNOSTIC: no segment, channel, client or programme is named here.
// Every row is data entered during the session.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const TABLE = 'gtcv_channel_logic'

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
  { key: 'segment', label: 'Segment', type: 'text', width: 150, placeholder: 'Who this reaches' },
  { key: 'entry_or_scale', label: 'Entry or scale', type: 'select', width: 120, options: [
    { v: '', l: 'Not set' }, { v: 'entry', l: 'Entry point' }, { v: 'scale', l: 'Scale' }, { v: 'both', l: 'Both' },
  ] },
  { key: 'channel', label: 'Channel', type: 'text', width: 160, placeholder: 'The route to them' },
  { key: 'channel_logic', label: 'Channel logic', type: 'area', width: 210, placeholder: 'Why this channel reaches this segment' },
  { key: 'independent_of_facilitation', label: 'Independent of programme facilitation', type: 'bool', width: 150 },
  { key: 'evidence_needed', label: 'Evidence needed', type: 'area', width: 180, placeholder: 'What still has to be proven' },
  { key: 'first_action', label: 'First action', type: 'area', width: 170, placeholder: 'The next concrete step' },
  { key: 'timeline', label: 'Timeline', type: 'text', width: 110, placeholder: 'By when' },
]

function optionLabel(field, value) {
  const opt = (field.options || []).find((o) => o.v === (value || ''))
  return opt ? opt.l : value || ''
}

export default function ChannelLogicTable({ clientId, canManage }) {
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
      if (error) setErr('Could not load the channel logic: ' + error.message)
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

  // Scale readiness in one line: how many segments have a channel that works
  // without the programme in the room.
  const independentCount = useMemo(
    () => rows.filter((r) => !!r.independent_of_facilitation).length,
    [rows]
  )
  const entryCount = useMemo(
    () => rows.filter((r) => r.entry_or_scale === 'entry' || r.entry_or_scale === 'both').length,
    [rows]
  )
  const scaleCount = useMemo(
    () => rows.filter((r) => r.entry_or_scale === 'scale' || r.entry_or_scale === 'both').length,
    [rows]
  )

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
    fields.forEach((f) => {
      // independent_of_facilitation is NOT NULL, so it is written as a real
      // boolean rather than blanked to null like the free-text columns.
      if (f === 'independent_of_facilitation') patch[f] = !!row[f]
      else patch[f] = row[f] === '' ? null : row[f]
    })
    setDirty((prev) => { const next = { ...prev }; delete next[id]; return next })
    dirtyRef.current = (() => { const n = { ...dirtyRef.current }; delete n[id]; return n })()
    setStatus('saving')
    const { error } = await supabase.from(TABLE).update(patch).eq('id', id)
    if (error) { setErr('Could not save: ' + error.message); setStatus('idle') }
    else { setErr(null); setStatus('saved') }
  }

  async function saveAll() {
    const ids = Object.keys(dirtyRef.current)
    for (const id of ids) await saveRow(id)
  }

  // A checkbox has no meaningful blur, so it saves as soon as it is toggled.
  function toggleIndependent(id, value) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, independent_of_facilitation: value } : r)))
    setDirty((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), independent_of_facilitation: true } }))
    dirtyRef.current = { ...dirtyRef.current, [id]: { ...(dirtyRef.current[id] || {}), independent_of_facilitation: true } }
    rowsRef.current = rowsRef.current.map((r) => (r.id === id ? { ...r, independent_of_facilitation: value } : r))
    saveRow(id)
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
    const name = row && row.segment ? row.segment : 'this segment'
    if (typeof window !== 'undefined' && !window.confirm(`Delete ${name} from the channel logic table?`)) return
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

  const strip = [
    { l: 'Segments', v: rows.length, color: C.navy },
    { l: 'Entry channels', v: entryCount, color: C.cyan },
    { l: 'Scale channels', v: scaleCount, color: C.teal },
    { l: 'Independent', v: independentCount, color: independentCount > 0 ? C.green : C.amber },
  ]

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
        <div>
          <div style={secH}>Channel Logic</div>
          <div style={{ ...hint, marginTop: '0.25rem' }}>
            One row per segment. The channel, the reasoning behind it, and whether it still
            works once the programme stops making the introductions.
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
          {strip.map((s) => (
            <div key={s.l} style={{ borderTop: `3px solid ${s.color}`, background: C.alt, borderRadius: 8, padding: '0.5rem 0.9rem', minWidth: 116 }}>
              <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.slate }}>{s.l}</div>
              <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.5rem', fontWeight: 700, color: s.color, lineHeight: 1.1 }}>{s.v}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={hint}>Loading the channel logic...</div>
      ) : rows.length === 0 ? (
        <div style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: '1.4rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.15rem', color: C.navy, marginBottom: '0.35rem' }}>
            No channels mapped yet
          </div>
          <div style={{ ...hint, marginBottom: canManage ? '0.9rem' : 0 }}>
            Take one segment at a time. Name the channel, then say why it reaches that
            segment, then test whether it holds without the programme.
          </div>
          {canManage && <button style={solidBtn} onClick={addRow} disabled={busy}>+ Add the first segment</button>}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1180 }}>
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
                      {f.type === 'bool' ? (
                        !canManage ? (
                          <div style={readCell}>{r[f.key] ? 'Yes' : 'No'}</div>
                        ) : (
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '1.01rem', color: C.navy, padding: '0.4rem 0.55rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={!!r[f.key]}
                              onChange={(e) => toggleIndependent(r.id, e.target.checked)}
                            />
                            {r[f.key] ? 'Yes' : 'No'}
                          </label>
                        )
                      ) : !canManage ? (
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
