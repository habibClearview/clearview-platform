// @ts-nocheck
'use client'
// ============================================================
// INTERVIEW CAPTURE
//
// The field capture form for a customer validation conversation, as the
// method defines it. Six dimensions, each one scored 1 to 5 with the
// verbatim words first and the interpretation second:
//
//   1. Role and Accountability
//   2. Problem Reality
//   3. Consequence Severity
//   4. Current Attempts
//   5. Budget and Authority
//   6. Willingness to Pay
//
// Then the post interview summary: the most important thing said (verbatim),
// the strongest purchasing signal, the budget signal strength, one
// assumption confirmed, one assumption overturned, the follow up needed, the
// referral obtained, and an overall score of 1 to 5.
//
// The discipline the method insists on is visible in the surface, not buried
// in a document:
//   * Verbatim first. No polishing. The verbatim box sits above the
//     interpretation box in every dimension and is labelled as such.
//   * Written up within 30 minutes of the conversation. While a capture is
//     still a draft the header counts the minutes since the conversation and
//     turns the timer amber, then red, as the window closes and passes.
//   * Submit moves the capture from draft to submitted, which is the handover
//     to the co-implementer for synthesis.
//
// Writes to gtcv_interview_captures (see
// supabase/migrations/2026_08_09_gtcv_field_capture.sql). Everything goes
// through the browser Supabase client, so RLS scopes it to the signed in
// viewer. canManage=false renders the same capture read only.
//
// CLIENT AGNOSTIC: no client, organisation, interviewee or segment is named
// here. The only client input is the clientId prop.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const TABLE = 'gtcv_interview_captures'
const WINDOW_MINUTES = 30

const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', white: 'var(--cv-card)',
  slate: 'var(--cv-slate)', border: 'var(--cv-border)', teal: 'var(--cv-teal)',
  red: 'var(--cv-red)', green: 'var(--cv-green)', amber: 'var(--cv-amber)',
  purple: 'var(--cv-purple)', alt: 'var(--cv-alt)', bg2: 'var(--cv-bg-2)',
}
const card = { background: C.white, border: '1px solid var(--cv-border-soft)', borderRadius: 14, padding: '1.35rem 1.5rem', marginBottom: '1.25rem', boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)' }
const secH = { fontFamily: 'Georgia,serif', fontSize: '1.32rem', fontWeight: 700, color: C.navy, margin: 0 }
const subH = { fontFamily: 'Georgia,serif', fontSize: '1.1rem', fontWeight: 700, color: C.navy, margin: 0 }
const hint = { fontSize: '1.01rem', color: C.slate, lineHeight: 1.45 }
const lbl = { display: 'block', fontFamily: 'monospace', fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.slate, marginBottom: '0.25rem' }
const cell = { width: '100%', padding: '0.45rem 0.6rem', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: '1.01rem', fontFamily: 'inherit', background: C.bg2, color: C.navy, boxSizing: 'border-box' }
const readCell = { fontSize: '1.01rem', color: C.navy, lineHeight: 1.45, padding: '0.45rem 0.6rem', whiteSpace: 'pre-wrap', minHeight: '1.2rem', background: C.alt, borderRadius: 6 }
const ghostBtn = { fontFamily: 'monospace', fontSize: '0.91rem', padding: '0.3rem 0.7rem', border: `1px solid ${C.cyan}`, borderRadius: 6, background: 'transparent', color: C.cyan, cursor: 'pointer' }
const solidBtn = { fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, padding: '0.38rem 0.9rem', border: 'none', borderRadius: 6, background: C.cyan, color: 'var(--cv-on-accent)', cursor: 'pointer' }
const th = { padding: '0.45rem 0.6rem', textAlign: 'left', fontFamily: 'monospace', fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: C.slate, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
const td = { padding: '0.45rem 0.6rem', verticalAlign: 'top', borderBottom: '1px solid var(--cv-border-soft)', fontSize: '1.01rem', color: C.navy }

// The six dimensions of the capture, in the method's order. The prompt under
// each one is what the interviewer is listening for, not a question to read
// out loud: the conversation is a discussion, not an interview.
const DIMENSIONS = [
  { key: 'role_accountability', label: 'Role and Accountability', prompt: 'Who owns this problem inside the organisation, and who is accountable for solving it?' },
  { key: 'problem_reality', label: 'Problem Reality', prompt: 'Is this a real and recurring problem, or a one off? How long has it been running?' },
  { key: 'consequence_severity', label: 'Consequence Severity', prompt: 'What does it cost them when it is not solved? Money, time, reputation, relationships.' },
  { key: 'current_attempts', label: 'Current Attempts', prompt: 'What have they already tried, and what actually happened when they tried it?' },
  { key: 'budget_authority', label: 'Budget and Authority', prompt: 'Is there money for this, and who has to approve spending it?' },
  { key: 'willingness_to_pay', label: 'Willingness to Pay', prompt: 'What have they paid for comparable support before? What would make a solution worth the investment?' },
]

// Interview details, the block above the dimensions.
const DETAIL_FIELDS = [
  { key: 'interviewer_name', label: 'Team member', type: 'text', placeholder: 'Who ran the conversation' },
  { key: 'interview_date', label: 'Interview date', type: 'date' },
  { key: 'interviewee_name', label: 'Interviewee', type: 'text', placeholder: 'Who you spoke to' },
  { key: 'interviewee_role', label: 'Interviewee role', type: 'text', placeholder: 'Their role and level' },
  { key: 'organisation', label: 'Organisation', type: 'text', placeholder: 'Where they work' },
  { key: 'segment', label: 'Customer segment', type: 'text', placeholder: 'The segment being tested' },
]

// The post interview summary, completed immediately after the conversation.
const SUMMARY_FIELDS = [
  { key: 'most_important_verbatim', label: 'Most important thing said (verbatim)', type: 'area', placeholder: 'Their exact words. Do not tidy them up.' },
  { key: 'strongest_purchasing_signal', label: 'Strongest purchasing signal observed', type: 'area', placeholder: 'Something that happened, not something that was agreed with' },
  { key: 'budget_signal_strength', label: 'Budget signal strength', type: 'select', options: [
    { v: '', l: 'Not set' }, { v: 'strong', l: 'Strong' }, { v: 'moderate', l: 'Moderate' },
    { v: 'weak', l: 'Weak' }, { v: 'none', l: 'None' },
  ] },
  { key: 'assumption_confirmed', label: 'One assumption confirmed', type: 'area', placeholder: 'Which of our assumptions this conversation held up' },
  { key: 'assumption_overturned', label: 'One assumption overturned', type: 'area', placeholder: 'Which of our assumptions this conversation broke' },
  { key: 'follow_up_needed', label: 'Follow up needed', type: 'area', placeholder: 'What was agreed, and by when' },
  { key: 'referral_obtained', label: 'Referral obtained', type: 'area', placeholder: 'Who else they said we should speak to' },
]

const BUDGET_COLORS = { strong: C.green, moderate: C.teal, weak: C.amber, none: C.red }

function scoreColor(score) {
  const n = Number(score)
  if (!n) return C.slate
  if (n >= 4) return C.green
  if (n === 3) return C.amber
  return C.red
}

function fmtDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// The 30 minute rule, expressed as elapsed time since the conversation.
function elapsedState(row, nowMs) {
  const stamp = row && (row.captured_at || row.created_at)
  if (!stamp) return null
  const t = new Date(stamp).getTime()
  if (Number.isNaN(t)) return null
  const mins = Math.max(0, Math.floor((nowMs - t) / 60000))
  if (mins > WINDOW_MINUTES) {
    return { mins, color: C.red, text: `${mins} minutes since the conversation. The 30 minute window has passed, write it up now and note anything you are unsure of.` }
  }
  if (mins >= WINDOW_MINUTES - 10) {
    return { mins, color: C.amber, text: `${mins} minutes since the conversation. ${WINDOW_MINUTES - mins} minutes left in the 30 minute window.` }
  }
  return { mins, color: C.teal, text: `${mins} minutes since the conversation. Complete this capture within 30 minutes, before memory degrades.` }
}

export default function InterviewCaptureForm({ clientId, canManage }) {
  const [rows, setRows] = useState([])
  const [openId, setOpenId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [status, setStatus] = useState('idle') // idle | saving | saved
  const [dirty, setDirty] = useState({})       // { rowId: { field: true } }
  const [busy, setBusy] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  // Refs so a blur handler always reads the current values, never the ones
  // captured when the input first rendered.
  const rowsRef = useRef([])
  const dirtyRef = useRef({})
  useEffect(() => { rowsRef.current = rows }, [rows])
  useEffect(() => { dirtyRef.current = dirty }, [dirty])

  // The elapsed timer only has to be roughly right, so once a minute is
  // enough and costs nothing.
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

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
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (error) setErr('Could not load the interview captures: ' + error.message)
      else { setErr(null); setRows(data || []) }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [clientId])

  const open = useMemo(() => rows.find((r) => r.id === openId) || null, [rows, openId])
  const pendingCount = useMemo(
    () => Object.keys(dirty).filter((id) => Object.keys(dirty[id] || {}).length > 0).length,
    [dirty]
  )
  const counts = useMemo(() => {
    const out = { draft: 0, submitted: 0 }
    rows.forEach((r) => { if (r.status === 'submitted') out.submitted += 1; else out.draft += 1 })
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

  // Dropdowns and score buttons write straight through, so a click is never
  // left sitting unsaved.
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

  async function addCapture() {
    if (!clientId || busy) return
    setBusy(true)
    const now = new Date()
    const nextOrder = rows.reduce((m, r) => Math.max(m, Number(r.sort_order) || 0), 0) + 1
    const { data, error } = await supabase
      .from(TABLE)
      .insert([{
        client_id: clientId,
        sort_order: nextOrder,
        status: 'draft',
        captured_at: now.toISOString(),
        interview_date: now.toISOString().split('T')[0],
      }])
      .select()
      .single()
    setBusy(false)
    if (error) { setErr('Could not start a capture: ' + error.message); return }
    setErr(null)
    setRows((prev) => [data, ...prev])
    setOpenId(data.id)
  }

  async function submitCapture(id) {
    await saveRow(id)
    const stamp = new Date().toISOString()
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'submitted', submitted_at: stamp } : r)))
    const { error } = await supabase
      .from(TABLE)
      .update({ status: 'submitted', submitted_at: stamp, updated_at: stamp })
      .eq('id', id)
    if (error) setErr('Could not submit: ' + error.message)
    else { setErr(null); setStatus('saved') }
  }

  async function reopenCapture(id) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'draft' } : r)))
    const { error } = await supabase
      .from(TABLE)
      .update({ status: 'draft', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) setErr('Could not reopen: ' + error.message)
    else setErr(null)
  }

  async function removeCapture(id) {
    const row = rows.find((r) => r.id === id)
    const who = row && row.interviewee_name ? row.interviewee_name : 'this capture'
    if (typeof window !== 'undefined' && !window.confirm(`Delete the capture for ${who}?`)) return
    setRows((prev) => prev.filter((r) => r.id !== id))
    setDirty((prev) => { const next = { ...prev }; delete next[id]; return next })
    if (openId === id) setOpenId(null)
    const { error } = await supabase.from(TABLE).delete().eq('id', id)
    if (error) setErr('Could not delete: ' + error.message)
    else setErr(null)
  }

  function pill() {
    if (status === 'saving') return { text: 'Saving', color: C.amber }
    if (pendingCount > 0) return { text: `${pendingCount} unsaved capture${pendingCount === 1 ? '' : 's'}`, color: C.amber }
    if (status === 'saved') return { text: 'Saved', color: C.green }
    return null
  }
  const savePill = pill()
  const editable = canManage && open && open.status !== 'submitted'
  const elapsed = open && open.status !== 'submitted' ? elapsedState(open, nowMs) : null

  function ScoreRow({ row, field }) {
    const value = Number(row[field]) || 0
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n
          return (
            <button
              key={n}
              type="button"
              disabled={!editable}
              onClick={() => editable && setAndSave(row.id, field, n)}
              style={{
                width: 34, height: 34, borderRadius: 8, cursor: editable ? 'pointer' : 'default',
                fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700,
                border: `1px solid ${on ? scoreColor(n) : C.border}`,
                background: on ? scoreColor(n) : 'transparent',
                color: on ? 'var(--cv-on-accent)' : C.slate,
              }}
            >{n}</button>
          )
        })}
        {editable && value > 0 && (
          <button type="button" style={{ ...ghostBtn, borderColor: C.border, color: C.slate }} onClick={() => setAndSave(row.id, field, null)}>Clear</button>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* ---------- The list of captures ---------- */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <div style={secH}>Interview Capture</div>
            <div style={{ ...hint, marginTop: '0.25rem' }}>
              One capture per customer validation conversation. Six dimensions, each scored 1 to 5
              with the verbatim words first and the interpretation second.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {savePill && (
              <span style={{ fontFamily: 'monospace', fontSize: '0.87rem', color: savePill.color, border: `1px solid ${savePill.color}`, borderRadius: 999, padding: '0.15rem 0.6rem' }}>
                {savePill.text}
              </span>
            )}
            {canManage && pendingCount > 0 && <button style={solidBtn} onClick={saveAll}>Save</button>}
            {canManage && <button style={ghostBtn} onClick={addCapture} disabled={busy}>+ New capture</button>}
          </div>
        </div>

        <div style={{ background: C.alt, borderLeft: `3px solid ${C.cyan}`, borderRadius: 8, padding: '0.6rem 0.85rem', margin: '0.9rem 0 0.4rem', fontSize: '1.01rem', color: C.navy, lineHeight: 1.45 }}>
          <strong>Verbatim first. No polishing.</strong> Write exactly what the person said before you
          interpret it. Interpretation comes second. Complete the capture within 30 minutes of every
          conversation, before memory degrades.
        </div>

        {err && <div style={{ fontSize: '1.01rem', color: C.red, margin: '0.5rem 0' }}>{err}</div>}

        {rows.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.85rem 0 1rem' }}>
            {[{ k: 'draft', l: 'Draft', c: C.amber }, { k: 'submitted', l: 'Submitted', c: C.green }].map((s) => (
              <div key={s.k} style={{ borderTop: `3px solid ${s.c}`, background: C.alt, borderRadius: 8, padding: '0.5rem 0.9rem', minWidth: 108 }}>
                <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.slate }}>{s.l}</div>
                <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.5rem', fontWeight: 700, color: s.c, lineHeight: 1.1 }}>{counts[s.k]}</div>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div style={hint}>Loading the interview captures...</div>
        ) : rows.length === 0 ? (
          <div style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: '1.4rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.15rem', color: C.navy, marginBottom: '0.35rem' }}>
              No captures recorded yet
            </div>
            <div style={{ ...hint, marginBottom: canManage ? '0.9rem' : 0 }}>
              Start a capture as soon as the conversation ends. Read the Interview Briefing before
              going into the field.
            </div>
            {canManage && <button style={solidBtn} onClick={addCapture} disabled={busy}>+ Start the first capture</button>}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead>
                <tr>
                  {['Date', 'Interviewee', 'Organisation', 'Segment', 'Overall', 'Budget signal', 'Status', ''].map((h, i) => (
                    <th key={i} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isOpen = r.id === openId
                  const rowElapsed = r.status !== 'submitted' ? elapsedState(r, nowMs) : null
                  return (
                    <tr key={r.id} style={{ background: isOpen ? C.alt : 'transparent' }}>
                      <td style={td}>{fmtDate(r.interview_date) || '...'}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{r.interviewee_name || 'Not named yet'}</div>
                        <div style={{ fontSize: '0.9rem', color: C.slate }}>{r.interviewee_role || ''}</div>
                      </td>
                      <td style={td}>{r.organisation || ''}</td>
                      <td style={td}>{r.segment || ''}</td>
                      <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: scoreColor(r.overall_score) }}>
                        {r.overall_score ? `${r.overall_score}/5` : '...'}
                      </td>
                      <td style={{ ...td, color: BUDGET_COLORS[r.budget_signal_strength] || C.slate }}>
                        {r.budget_signal_strength || '...'}
                      </td>
                      <td style={td}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: r.status === 'submitted' ? C.green : C.amber, border: `1px solid ${r.status === 'submitted' ? C.green : C.amber}`, borderRadius: 999, padding: '0.1rem 0.55rem' }}>
                          {r.status === 'submitted' ? 'submitted' : 'draft'}
                        </span>
                        {rowElapsed && (
                          <div style={{ fontSize: '0.85rem', color: rowElapsed.color, marginTop: '0.25rem' }}>
                            {rowElapsed.mins} min since interview
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button style={ghostBtn} onClick={() => setOpenId(isOpen ? null : r.id)}>
                          {isOpen ? 'Close' : 'Open'}
                        </button>
                        {canManage && (
                          <button
                            style={{ ...ghostBtn, borderColor: C.border, color: C.red, marginLeft: '0.35rem' }}
                            onClick={() => removeCapture(r.id)}
                            title="Delete this capture"
                          >x</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!canManage && rows.length > 0 && (
          <div style={{ ...hint, marginTop: '0.7rem' }}>Read only. Ask the engagement coach to edit these captures.</div>
        )}
      </div>

      {/* ---------- The open capture ---------- */}
      {open && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <div style={subH}>{open.interviewee_name || 'New capture'}</div>
              <div style={{ ...hint, marginTop: '0.2rem' }}>
                {[open.interviewee_role, open.organisation, open.segment].filter(Boolean).join('  ·  ') || 'Fill in the interview details below.'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {open.status === 'submitted' ? (
                <>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.87rem', color: C.green, border: `1px solid ${C.green}`, borderRadius: 999, padding: '0.15rem 0.6rem' }}>Submitted</span>
                  {canManage && <button style={ghostBtn} onClick={() => reopenCapture(open.id)}>Reopen as draft</button>}
                </>
              ) : (
                canManage && <button style={solidBtn} onClick={() => submitCapture(open.id)}>Submit capture</button>
              )}
            </div>
          </div>

          {/* The 30 minute discipline, made visible while the capture is a draft. */}
          {elapsed && (
            <div style={{ background: C.alt, borderLeft: `3px solid ${elapsed.color}`, borderRadius: 8, padding: '0.6rem 0.85rem', margin: '0.9rem 0', fontSize: '1.01rem', color: C.navy, lineHeight: 1.45 }}>
              <strong style={{ color: elapsed.color }}>{elapsed.text}</strong>
            </div>
          )}
          {open.status === 'submitted' && (
            <div style={{ ...hint, margin: '0.9rem 0' }}>
              This capture has gone to the co-implementer for synthesis. Reopen it as a draft to
              change anything.
            </div>
          )}

          {/* Interview details */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '0.75rem', marginBottom: '1.2rem' }}>
            {DETAIL_FIELDS.map((f) => (
              <div key={f.key}>
                <label style={lbl}>{f.label}</label>
                {editable ? (
                  <input
                    style={cell}
                    type={f.type === 'date' ? 'date' : 'text'}
                    value={open[f.key] || ''}
                    placeholder={f.placeholder || ''}
                    onChange={(e) => setField(open.id, f.key, e.target.value)}
                    onBlur={() => saveRow(open.id)}
                  />
                ) : (
                  <div style={readCell}>{f.type === 'date' ? fmtDate(open[f.key]) : (open[f.key] || '')}</div>
                )}
              </div>
            ))}
          </div>

          {/* The six dimensions */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '1rem' }}>
            <div style={{ ...subH, marginBottom: '0.2rem' }}>The six dimensions</div>
            <div style={{ ...hint, marginBottom: '1rem' }}>
              Score each dimension 1 to 5. Write the verbatim evidence exactly as it was said, then
              the interpretation.
            </div>

            {DIMENSIONS.map((d, i) => (
              <div key={d.key} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.9rem 1rem', marginBottom: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                  <div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: C.slate }}>
                      Dimension {i + 1}
                    </div>
                    <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.08rem', fontWeight: 700, color: C.navy }}>{d.label}</div>
                    <div style={{ ...hint, fontSize: '0.95rem', marginTop: '0.15rem' }}>{d.prompt}</div>
                  </div>
                  <div>
                    <label style={lbl}>Score 1 to 5</label>
                    <ScoreRow row={open} field={`${d.key}_score`} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '0.75rem' }}>
                  <div>
                    <label style={lbl}>Verbatim evidence, their exact words</label>
                    {editable ? (
                      <textarea
                        style={{ ...cell, minHeight: 88, resize: 'vertical', lineHeight: 1.4 }}
                        value={open[`${d.key}_verbatim`] || ''}
                        placeholder="Write exactly what was said. Do not polish it."
                        onChange={(e) => setField(open.id, `${d.key}_verbatim`, e.target.value)}
                        onBlur={() => saveRow(open.id)}
                      />
                    ) : (
                      <div style={{ ...readCell, minHeight: 88 }}>{open[`${d.key}_verbatim`] || ''}</div>
                    )}
                  </div>
                  <div>
                    <label style={lbl}>Interpretation, what this tells us</label>
                    {editable ? (
                      <textarea
                        style={{ ...cell, minHeight: 88, resize: 'vertical', lineHeight: 1.4 }}
                        value={open[`${d.key}_interpretation`] || ''}
                        placeholder="Your reading of it, written after the verbatim"
                        onChange={(e) => setField(open.id, `${d.key}_interpretation`, e.target.value)}
                        onBlur={() => saveRow(open.id)}
                      />
                    ) : (
                      <div style={{ ...readCell, minHeight: 88 }}>{open[`${d.key}_interpretation`] || ''}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Post interview summary */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '1rem' }}>
            <div style={{ ...subH, marginBottom: '0.2rem' }}>Post interview summary</div>
            <div style={{ ...hint, marginBottom: '1rem' }}>
              Complete this immediately after the conversation, while it is still fresh.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '0.85rem' }}>
              {SUMMARY_FIELDS.map((f) => (
                <div key={f.key} style={f.type === 'area' ? {} : { alignSelf: 'start' }}>
                  <label style={lbl}>{f.label}</label>
                  {!editable ? (
                    <div style={readCell}>{open[f.key] || ''}</div>
                  ) : f.type === 'select' ? (
                    <select
                      style={cell}
                      value={open[f.key] || ''}
                      onChange={(e) => setAndSave(open.id, f.key, e.target.value)}
                    >
                      {f.options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  ) : (
                    <textarea
                      style={{ ...cell, minHeight: 72, resize: 'vertical', lineHeight: 1.4 }}
                      value={open[f.key] || ''}
                      placeholder={f.placeholder || ''}
                      onChange={(e) => setField(open.id, f.key, e.target.value)}
                      onBlur={() => saveRow(open.id)}
                    />
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginTop: '1rem' }}>
              <label style={lbl}>Overall score for this interviewee, 1 to 5</label>
              <ScoreRow row={open} field="overall_score" />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.2rem', flexWrap: 'wrap' }}>
            {canManage && pendingCount > 0 && <button style={ghostBtn} onClick={saveAll}>Save changes</button>}
            {canManage && open.status !== 'submitted' && (
              <button style={solidBtn} onClick={() => submitCapture(open.id)}>Submit capture</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
