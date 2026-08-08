// @ts-nocheck
'use client'
// ============================================================
// EVIDENCE LIBRARY PANEL
//
// The audit trail and the handover record at the same time. Every piece of
// evidence used across an engagement, referenced E-001, E-002 and so on, and
// cited by that reference inside the decision point surfaces.
//
// This reads and writes the EXISTING evidence_library table, the one the
// coach dashboard already loads. It does not create a second one. The four
// columns it needs beyond what was already there (dp_id, file_path,
// reliability, status) are added additively in
// supabase/migrations/2026_08_09_gtcv_field_capture.sql.
//
// What the panel does:
//   * generates the next E-nnn reference automatically, from the highest
//     reference already recorded for this client, so references never
//     collide and never restart;
//   * attaches an entry to the decision point it came from;
//   * records the reliability rating (firsthand, reported, documented) and
//     the lifecycle status (active, archived, superseded);
//   * takes a pasted link (a shared drive URL, a file name, a physical
//     location);
//   * optionally uploads the file itself to the 'evidence' Storage bucket at
//     <client_id>/<reference>-<filename>, storing the object path in
//     file_path. If that bucket does not exist the panel says so plainly and
//     keeps working: a link is still a perfectly good record.
//
// dpId is optional. When it is passed the panel filters to that gate and
// every new entry defaults to it, so the same component can sit inside a
// decision point surface and inside a whole engagement view.
//
// CLIENT AGNOSTIC: the only client input is the clientId prop.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const TABLE = 'evidence_library'
const BUCKET = 'evidence'

const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', white: 'var(--cv-card)',
  slate: 'var(--cv-slate)', border: 'var(--cv-border)', teal: 'var(--cv-teal)',
  red: 'var(--cv-red)', green: 'var(--cv-green)', amber: 'var(--cv-amber)',
  purple: 'var(--cv-purple)', alt: 'var(--cv-alt)', bg2: 'var(--cv-bg-2)',
}
const card = { background: C.white, border: '1px solid var(--cv-border-soft)', borderRadius: 14, padding: '1.35rem 1.5rem', marginBottom: '1.25rem', boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)' }
const secH = { fontFamily: 'Georgia,serif', fontSize: '1.32rem', fontWeight: 700, color: C.navy, margin: 0 }
const hint = { fontSize: '1.01rem', color: C.slate, lineHeight: 1.45 }
const th = { padding: '0.45rem 0.55rem', textAlign: 'left', fontFamily: 'monospace', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: C.slate, borderBottom: `1px solid ${C.border}`, verticalAlign: 'bottom', whiteSpace: 'nowrap' }
const td = { padding: '0.35rem 0.4rem', verticalAlign: 'top', borderBottom: '1px solid var(--cv-border-soft)' }
const cell = { width: '100%', padding: '0.4rem 0.5rem', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: '1.01rem', fontFamily: 'inherit', background: C.bg2, color: C.navy, boxSizing: 'border-box' }
const readCell = { fontSize: '1.01rem', color: C.navy, lineHeight: 1.4, padding: '0.4rem 0.5rem', whiteSpace: 'pre-wrap', minHeight: '1.2rem' }
const ghostBtn = { fontFamily: 'monospace', fontSize: '0.87rem', padding: '0.28rem 0.65rem', border: `1px solid ${C.cyan}`, borderRadius: 6, background: 'transparent', color: C.cyan, cursor: 'pointer' }
const solidBtn = { fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, padding: '0.38rem 0.9rem', border: 'none', borderRadius: 6, background: C.cyan, color: 'var(--cv-on-accent)', cursor: 'pointer' }
const delBtn = { fontFamily: 'monospace', fontSize: '0.87rem', padding: '0.25rem 0.5rem', border: `1px solid ${C.border}`, borderRadius: 6, background: 'transparent', color: C.red, cursor: 'pointer' }

// The decision points, using the app's runtime dp ids.
const DP_OPTIONS = [
  { v: '', l: 'Not set' },
  { v: 'setup', l: 'Setup' },
  { v: 'phase_0', l: 'Phase 0' },
  { v: 'dp01', l: 'DP01' }, { v: 'dp02', l: 'DP02' }, { v: 'dp03', l: 'DP03' },
  { v: 'dp04', l: 'DP04' }, { v: 'dp05', l: 'DP05' }, { v: 'dp06', l: 'DP06' },
  { v: 'dp07', l: 'DP07' }, { v: 'dp08', l: 'DP08' }, { v: 'dp09', l: 'DP09' },
  { v: 'handover', l: 'Handover' },
]

// The evidence types the workbook uses.
const TYPE_OPTIONS = [
  { v: '', l: 'Not set' },
  { v: 'client_conversation', l: 'Client conversation' },
  { v: 'document', l: 'Document' },
  { v: 'tender', l: 'Tender' },
  { v: 'field_observation', l: 'Field observation' },
  { v: 'pilot_delivery', l: 'Pilot delivery' },
  { v: 'financial_data', l: 'Financial data' },
  { v: 'market_reference', l: 'Market reference' },
]

// How close the person recording it was to the thing itself.
const RELIABILITY_OPTIONS = [
  { v: '', l: 'Not set' },
  { v: 'firsthand', l: 'Firsthand' },
  { v: 'reported', l: 'Reported' },
  { v: 'documented', l: 'Documented' },
]

const STATUS_OPTIONS = [
  { v: '', l: 'Not set' },
  { v: 'active', l: 'Active' },
  { v: 'archived', l: 'Archived' },
  { v: 'superseded', l: 'Superseded' },
]

const STATUS_COLORS = { active: C.green, archived: C.slate, superseded: C.amber }
const RELIABILITY_COLORS = { firsthand: C.green, reported: C.amber, documented: C.teal }

// A value already in the table that is not in our option list still has to
// be visible and selectable, otherwise editing a row would silently rewrite
// data recorded before this panel existed.
function optionsWith(options, value) {
  if (!value) return options
  if (options.some((o) => o.v === value)) return options
  return [...options, { v: value, l: value }]
}
function optionLabel(options, value) {
  const opt = options.find((o) => o.v === (value || ''))
  return opt ? opt.l : value || ''
}

// E-007 -> 7. Anything that is not in that shape is ignored for numbering.
function referenceNumber(reference) {
  const m = /^E-(\d+)$/.exec(String(reference || '').trim())
  return m ? Number(m[1]) : 0
}
function nextReference(rows) {
  const highest = rows.reduce((max, r) => Math.max(max, referenceNumber(r.reference)), 0)
  return `E-${String(highest + 1).padStart(3, '0')}`
}

function safeFileName(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
}

// Supabase reports a missing bucket as a 404 with 'Bucket not found'. Turn
// that into an instruction rather than a stack trace.
function isMissingBucket(error) {
  if (!error) return false
  const msg = `${error.message || ''} ${error.error || ''}`.toLowerCase()
  return msg.includes('bucket not found') || msg.includes('not_found') || Number(error.statusCode) === 404
}
const BUCKET_MISSING_MESSAGE = `File storage is not set up for this engagement yet. Create a Storage bucket named "${BUCKET}" in Supabase, then uploads will work here. In the meantime, paste a link to the file instead, the record is just as valid.`

export default function EvidenceLibraryPanel({ clientId, canManage, dpId }) {
  const [rows, setRows] = useState([])          // every row for this client
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [notice, setNotice] = useState(null)    // storage guidance, not an error
  const [status, setStatus] = useState('idle')  // idle | saving | saved
  const [dirty, setDirty] = useState({})
  const [busy, setBusy] = useState(false)
  const [uploadingId, setUploadingId] = useState(null)

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
        // Load every row for the client, not just this gate, so the next
        // reference number is correct even when the panel is filtered.
        const { data, error } = await supabase
          .from(TABLE)
          .select('*')
          .eq('client_id', clientId)
          .order('reference', { ascending: true })
        if (cancelled) return
        if (error) setErr('Could not load the evidence library: ' + error.message)
        else { setErr(null); setRows(data || []) }
      } catch (e) {
        if (cancelled) return
        console.error('EvidenceLibraryPanel: load threw', e)
        setErr('Could not load the evidence. Try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [clientId])

  const visible = useMemo(
    () => (dpId ? rows.filter((r) => r.dp_id === dpId) : rows),
    [rows, dpId]
  )
  const pendingCount = useMemo(
    () => Object.keys(dirty).filter((id) => Object.keys(dirty[id] || {}).length > 0).length,
    [dirty]
  )
  const counts = useMemo(() => {
    const out = { active: 0, archived: 0, superseded: 0, unset: 0 }
    visible.forEach((r) => {
      if (r.status && out[r.status] !== undefined) out[r.status] += 1
      else out.unset += 1
    })
    return out
  }, [visible])

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

  async function setAndSave(id, field, value) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
    setStatus('saving')
    const { error } = await supabase
      .from(TABLE)
      .update({ [field]: value === '' ? null : value, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { setErr('Could not save: ' + error.message); setStatus('idle') }
    else { setErr(null); setStatus('saved') }
  }

  async function saveAll() {
    const ids = Object.keys(dirtyRef.current)
    for (const id of ids) await saveRow(id)
  }

  async function addEntry() {
    if (!clientId || busy) return
    setBusy(true)
    const reference = nextReference(rows)
    const payload = {
      client_id: clientId,
      reference,
      date: new Date().toISOString().split('T')[0],
      status: 'active',
    }
    if (dpId) payload.dp_id = dpId
    const { data, error } = await supabase.from(TABLE).insert([payload]).select().single()
    setBusy(false)
    if (error) { setErr('Could not add an entry: ' + error.message); return }
    setErr(null)
    setRows((prev) => [...prev, data])
  }

  async function removeEntry(id) {
    const row = rows.find((r) => r.id === id)
    const ref = row && row.reference ? row.reference : 'this entry'
    if (typeof window !== 'undefined' && !window.confirm(`Delete ${ref} from the evidence library?`)) return
    setRows((prev) => prev.filter((r) => r.id !== id))
    setDirty((prev) => { const next = { ...prev }; delete next[id]; return next })
    const { error } = await supabase.from(TABLE).delete().eq('id', id)
    if (error) setErr('Could not delete: ' + error.message)
    else setErr(null)
  }

  // ---- Storage. Everything here degrades to a clear message. ----
  async function uploadFile(row, file) {
    if (!file || !clientId) return
    setUploadingId(row.id)
    setNotice(null)
    const objectPath = `${clientId}/${row.reference || 'E-000'}-${safeFileName(file.name)}`
    const { error } = await supabase.storage.from(BUCKET).upload(objectPath, file, { upsert: true })
    setUploadingId(null)
    if (error) {
      if (isMissingBucket(error)) setNotice(BUCKET_MISSING_MESSAGE)
      else setErr('Could not upload the file: ' + error.message)
      return
    }
    setErr(null)
    await setAndSave(row.id, 'file_path', objectPath)
  }

  async function openFile(row) {
    setNotice(null)
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.file_path, 3600)
    if (error || !data || !data.signedUrl) {
      if (isMissingBucket(error)) setNotice(BUCKET_MISSING_MESSAGE)
      else setErr('Could not open the file: ' + ((error && error.message) || 'no signed URL returned'))
      return
    }
    setErr(null)
    if (typeof window !== 'undefined') window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function detachFile(row) {
    // Clears the reference on the row. The stored object is left alone, so a
    // mistaken click is recoverable.
    await setAndSave(row.id, 'file_path', null)
  }

  function pill() {
    if (status === 'saving') return { text: 'Saving', color: C.amber }
    if (pendingCount > 0) return { text: `${pendingCount} unsaved entr${pendingCount === 1 ? 'y' : 'ies'}`, color: C.amber }
    if (status === 'saved') return { text: 'Saved', color: C.green }
    return null
  }
  const savePill = pill()

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <div style={secH}>Evidence Library</div>
          <div style={{ ...hint, marginTop: '0.25rem' }}>
            {dpId
              ? `Evidence recorded against ${optionLabel(DP_OPTIONS, dpId)}. New entries default to this gate.`
              : 'Every piece of evidence used across the engagement, referenced E-001 onwards. Cite the reference number inside the decision point surfaces.'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {savePill && (
            <span style={{ fontFamily: 'monospace', fontSize: '0.87rem', color: savePill.color, border: `1px solid ${savePill.color}`, borderRadius: 999, padding: '0.15rem 0.6rem' }}>
              {savePill.text}
            </span>
          )}
          {canManage && pendingCount > 0 && <button type="button" style={solidBtn} onClick={saveAll}>Save</button>}
          {canManage && (
            <button type="button" style={ghostBtn} onClick={addEntry} disabled={busy}>
              + Add {nextReference(rows)}
            </button>
          )}
        </div>
      </div>

      {err && <div style={{ fontSize: '1.01rem', color: C.red, margin: '0.6rem 0' }}>{err}</div>}
      {notice && (
        <div style={{ background: C.alt, borderLeft: `3px solid ${C.amber}`, borderRadius: 8, padding: '0.6rem 0.85rem', margin: '0.6rem 0', fontSize: '1.01rem', color: C.navy, lineHeight: 1.45 }}>
          {notice}
          <button type="button" style={{ ...ghostBtn, marginLeft: '0.6rem', borderColor: C.border, color: C.slate }} onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {visible.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.85rem 0 1rem' }}>
          {[
            { k: 'active', l: 'Active', c: C.green },
            { k: 'archived', l: 'Archived', c: C.slate },
            { k: 'superseded', l: 'Superseded', c: C.amber },
            { k: 'unset', l: 'Not set', c: C.purple },
          ].map((s) => (
            <div key={s.k} style={{ borderTop: `3px solid ${s.c}`, background: C.alt, borderRadius: 8, padding: '0.5rem 0.9rem', minWidth: 100 }}>
              <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.slate }}>{s.l}</div>
              <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.5rem', fontWeight: 700, color: s.c, lineHeight: 1.1 }}>{counts[s.k]}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={hint}>Loading the evidence library...</div>
      ) : visible.length === 0 ? (
        <div style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: '1.4rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.15rem', color: C.navy, marginBottom: '0.35rem' }}>
            {dpId ? 'No evidence recorded against this gate yet' : 'No evidence recorded yet'}
          </div>
          <div style={{ ...hint, marginBottom: canManage ? '0.9rem' : 0 }}>
            Record it as it is captured, not at the end. Be specific about what it shows, and use
            verbatim wherever you can.
          </div>
          {canManage && <button type="button" style={solidBtn} onClick={addEntry} disabled={busy}>+ Add {nextReference(rows)}</button>}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1180 }}>
            <thead>
              <tr>
                <th style={{ ...th, minWidth: 72 }}>Ref</th>
                <th style={{ ...th, minWidth: 130 }}>Date captured</th>
                <th style={{ ...th, minWidth: 130 }}>Captured by</th>
                <th style={{ ...th, minWidth: 150 }}>Evidence type</th>
                <th style={{ ...th, minWidth: 110 }}>Decision point</th>
                <th style={{ ...th, minWidth: 240 }}>Description</th>
                <th style={{ ...th, minWidth: 190 }}>File or link</th>
                <th style={{ ...th, minWidth: 120 }}>Reliability</th>
                <th style={{ ...th, minWidth: 120 }}>Status</th>
                {canManage && <th style={{ ...th, width: 44 }} />}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: C.cyan, whiteSpace: 'nowrap', paddingTop: '0.75rem' }}>
                    {r.reference || '...'}
                  </td>

                  <td style={td}>
                    {canManage ? (
                      <input
                        style={cell}
                        type="date"
                        value={r.date || ''}
                        onChange={(e) => setField(r.id, 'date', e.target.value)}
                        onBlur={() => saveRow(r.id)}
                      />
                    ) : <div style={readCell}>{r.date || ''}</div>}
                  </td>

                  <td style={td}>
                    {canManage ? (
                      <input
                        style={cell}
                        value={r.uploaded_by || ''}
                        placeholder="Coach or organisation"
                        onChange={(e) => setField(r.id, 'uploaded_by', e.target.value)}
                        onBlur={() => saveRow(r.id)}
                      />
                    ) : <div style={readCell}>{r.uploaded_by || ''}</div>}
                  </td>

                  <td style={td}>
                    {canManage ? (
                      <select style={cell} value={r.type || ''} onChange={(e) => setAndSave(r.id, 'type', e.target.value)}>
                        {optionsWith(TYPE_OPTIONS, r.type).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    ) : <div style={readCell}>{optionLabel(TYPE_OPTIONS, r.type)}</div>}
                  </td>

                  <td style={td}>
                    {canManage ? (
                      <select style={cell} value={r.dp_id || ''} onChange={(e) => setAndSave(r.id, 'dp_id', e.target.value)}>
                        {optionsWith(DP_OPTIONS, r.dp_id).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    ) : <div style={readCell}>{optionLabel(DP_OPTIONS, r.dp_id)}</div>}
                  </td>

                  <td style={td}>
                    {canManage ? (
                      <textarea
                        style={{ ...cell, minHeight: 62, resize: 'vertical', lineHeight: 1.35 }}
                        value={r.description || ''}
                        placeholder="What was captured and what it shows. Verbatim where possible."
                        onChange={(e) => setField(r.id, 'description', e.target.value)}
                        onBlur={() => saveRow(r.id)}
                      />
                    ) : <div style={readCell}>{r.description || ''}</div>}
                  </td>

                  <td style={td}>
                    {canManage ? (
                      <input
                        style={cell}
                        value={r.url || ''}
                        placeholder="Paste a link, or a file name"
                        onChange={(e) => setField(r.id, 'url', e.target.value)}
                        onBlur={() => saveRow(r.id)}
                      />
                    ) : (
                      <div style={readCell}>
                        {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: C.cyan }}>Open link</a> : ''}
                      </div>
                    )}

                    {/* The uploaded file, when there is one. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                      {r.file_path && (
                        <button type="button" style={{ ...ghostBtn, borderColor: C.teal, color: C.teal }} onClick={() => openFile(r)}>
                          View file
                        </button>
                      )}
                      {canManage && (
                        <label style={{ ...ghostBtn, cursor: uploadingId === r.id ? 'default' : 'pointer', margin: 0, display: 'inline-block' }}>
                          {uploadingId === r.id ? 'Uploading...' : r.file_path ? 'Replace file' : '+ Upload file'}
                          <input
                            type="file"
                            style={{ display: 'none' }}
                            disabled={uploadingId === r.id}
                            onChange={(e) => {
                              const file = e.target.files && e.target.files[0]
                              e.target.value = ''
                              if (file) uploadFile(r, file)
                            }}
                          />
                        </label>
                      )}
                      {canManage && r.file_path && (
                        <button type="button" style={{ ...ghostBtn, borderColor: C.border, color: C.slate }} onClick={() => detachFile(r)}>
                          Detach
                        </button>
                      )}
                    </div>
                    {r.file_path && (
                      <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: C.slate, marginTop: '0.25rem', wordBreak: 'break-all' }}>
                        {r.file_path}
                      </div>
                    )}
                  </td>

                  <td style={td}>
                    {canManage ? (
                      <select style={cell} value={r.reliability || ''} onChange={(e) => setAndSave(r.id, 'reliability', e.target.value)}>
                        {optionsWith(RELIABILITY_OPTIONS, r.reliability).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    ) : (
                      <div style={{ ...readCell, color: RELIABILITY_COLORS[r.reliability] || C.navy }}>
                        {optionLabel(RELIABILITY_OPTIONS, r.reliability)}
                      </div>
                    )}
                  </td>

                  <td style={td}>
                    {canManage ? (
                      <select style={cell} value={r.status || ''} onChange={(e) => setAndSave(r.id, 'status', e.target.value)}>
                        {optionsWith(STATUS_OPTIONS, r.status).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    ) : (
                      <div style={{ ...readCell, color: STATUS_COLORS[r.status] || C.navy }}>
                        {optionLabel(STATUS_OPTIONS, r.status)}
                      </div>
                    )}
                  </td>

                  {canManage && (
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button type="button" style={delBtn} onClick={() => removeEntry(r.id)} title="Delete this entry">x</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!canManage && visible.length > 0 && (
        <div style={{ ...hint, marginTop: '0.7rem' }}>Read only. Ask the engagement coach to edit this library.</div>
      )}
    </div>
  )
}
