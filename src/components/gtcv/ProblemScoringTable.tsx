// @ts-nocheck
'use client'
// ============================================================
// GtCV Decision Point 2: Problem Prioritisation Scoring.
//
// An organisation coming out of grant delivery can usually name a dozen
// problems it could solve. Only a few of them are commercially real. This
// grid scores each candidate problem 1 to 5 on four dimensions, totals
// them, sorts the list by total, and marks the top three as advancing.
//
// THE FOUR DIMENSIONS (each 1 to 5):
//   Urgency            How hard the problem is pressing on them now.
//   Ownership clarity  How clearly one named person owns the problem.
//   Willingness to pay Evidence they would pay to have it solved.
//   Access             How reachable that budget holder actually is.
//
// A problem can be urgent and still be worthless commercially if nobody
// owns it, nobody will pay, or nobody will see you. That is why all four
// carry equal weight and the total is a flat sum out of 20.
//
// Only the top three advance to Decision Point 3. The cut is deliberate: a value
// proposition written for six problems is written for none of them.
// Unscored dimensions count as zero, so a half scored problem cannot
// float to the top of the list.
//
// Backed by supabase/migrations/2026_08_09_gtcv_dp_tables_b.sql
// (table gtcv_problem_scores; read via can_view_client, write via
// can_manage_client_access). The total is never stored, it is recomputed
// on every read from the four scores, so it cannot drift.
//
// Client agnostic: every problem and score is data.
//
// Props: { clientId, canManage }
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { segmentsAwaitingScore, carriedRow } from '@/lib/gtcv-problem-carryover'

const TABLE = 'gtcv_problem_scores'
const SEGMENTS_TABLE = 'gtcv_customer_segments'

// How many problems carry into Decision Point 3.
const ADVANCING_COUNT = 3

// ----- design tokens (same --cv-* palette as the rest of the app) -----
const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', slate: 'var(--cv-slate)',
  border: 'var(--cv-border)', borderSoft: 'var(--cv-border-soft)',
  green: 'var(--cv-green)', red: 'var(--cv-red)', amber: 'var(--cv-amber)',
  card: 'var(--cv-card)', alt: 'var(--cv-alt)', teal: 'var(--cv-teal)',
}
const CARD = {
  background: C.card, border: `1px solid ${C.borderSoft}`,
  borderRadius: 14, padding: '1.4rem 1.6rem', marginBottom: '1.35rem',
}
const H = (size = '1.15rem') => ({
  fontFamily: 'var(--cv-font)', fontWeight: 700, color: C.navy, fontSize: size,
})
const LABEL = {
  fontFamily: 'var(--cv-font-mono)', fontSize: '0.78rem', letterSpacing: '0.04em',
  textTransform: 'uppercase', color: C.slate,
}
const inputStyle = {
  fontFamily: 'inherit', fontSize: '0.85rem', padding: '0.4rem 0.55rem',
  border: `1px solid ${C.border}`, borderRadius: 7, background: C.card,
  color: C.navy, width: '100%', boxSizing: 'border-box',
}
const th = { ...LABEL, textAlign: 'left', padding: '0.5rem 0.7rem', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
const td = { padding: '0.5rem 0.7rem', fontSize: '0.86rem', color: C.navy, verticalAlign: 'top', borderBottom: `1px solid ${C.borderSoft}` }
function btn(color, solid = false) {
  return solid
    ? { fontFamily: 'var(--cv-font-mono)', fontSize: '0.82rem', fontWeight: 700, padding: '0.42rem 0.9rem', border: 'none', borderRadius: 7, background: color, color: 'var(--cv-on-accent)', cursor: 'pointer' }
    : { fontFamily: 'var(--cv-font-mono)', fontSize: '0.82rem', padding: '0.42rem 0.9rem', border: `1px solid ${color}`, borderRadius: 7, background: 'transparent', color, cursor: 'pointer' }
}

// The four scored dimensions, in the order the method asks them.
const DIMENSIONS = [
  { key: 'urgency_score', short: 'Urgency', help: 'How hard is this pressing on them right now? 1 they can live with it, 5 they are acting on it already.' },
  { key: 'ownership_clarity_score', short: 'Ownership', help: 'How clearly does one named person own this problem? 1 nobody owns it, 5 one named holder of the budget owns it.' },
  { key: 'willingness_to_pay_score', short: 'Pay', help: 'What evidence is there that they would pay to solve it? 1 none, 5 they have paid for something like it.' },
  { key: 'access_score', short: 'Access', help: 'How reachable is that budget holder? 1 no route in, 5 a direct line already open.' },
]
const MAX_TOTAL = DIMENSIONS.length * 5

// Unscored counts as zero. A problem scored on one dimension only is not
// a strong problem, it is an unfinished assessment.
function totalOf(row) {
  return DIMENSIONS.reduce((sum, d) => sum + (Number(row[d.key]) || 0), 0)
}
function scoredCount(row) {
  return DIMENSIONS.filter((d) => row[d.key] != null && row[d.key] !== '').length
}
function totalTone(total) {
  if (total >= 15) return C.green
  if (total >= 10) return C.amber
  return C.red
}

function Pill({ text, tone, title }) {
  return (
    <span title={title} style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.78rem', fontWeight: 700, color: tone, border: `1px solid ${tone}`, borderRadius: 6, padding: '0.1rem 0.45rem', whiteSpace: 'nowrap', display: 'inline-block' }}>
      {text}
    </span>
  )
}

export default function ProblemScoringTable({ clientId, canManage }) {
  const [rows, setRows] = useState([])
  const [segments, setSegments] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('idle')   // idle | saving | saved | error
  const [msg, setMsg] = useState(null)
  const [adding, setAdding] = useState(false)
  const timers = useRef({})
  const pending = useRef({})
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      Object.values(timers.current).forEach((t) => clearTimeout(t))
      timers.current = {}
    }
  }, [])

  async function load() {
    if (!clientId) { setRows([]); setSegments([]); setLoading(false); return }
    setLoading(true)
    try {
      const [scores, segs] = await Promise.all([
        supabase.from(TABLE).select('*').eq('client_id', clientId)
          .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
        supabase.from(SEGMENTS_TABLE).select('id, segment_name, problem_in_their_words').eq('client_id', clientId)
          .order('sort_order', { ascending: true }),
      ])
      if (!alive.current) return
      if (scores.error) {
        console.error('ProblemScoringTable: scores failed', scores.error)
        setMsg('Could not load the problem scores. Try again.'); setStatus('error')
      } else {
        setRows(scores.data || [])
      }
      // A failed segment read used to pass silently, leaving the "Who feels
      // it" list empty. An empty list reads as "there are no segments", which
      // is a different statement from "the segments did not load".
      if (segs.error) {
        console.error('ProblemScoringTable: segments failed', segs.error)
        setMsg('Could not load the customer segments, so the list of who feels the problem is incomplete.')
        setStatus('error')
      } else {
        setSegments(segs.data || [])
      }
    } catch (e) {
      if (!alive.current) return
      console.error('ProblemScoringTable: load threw', e)
      setMsg('Could not load this table. Try again.'); setStatus('error')
    } finally {
      if (alive.current) setLoading(false)
    }
  }

  useEffect(() => { load() }, [clientId])

  // Edit locally at once, write 600ms after typing stops. One timer per
  // row so simultaneous edits do not cancel each other.
  // Changes accumulate per row rather than the timer closing over the last
  // one. Editing two fields inside the debounce window used to send only the
  // second, so the first was lost quietly: local state still showed it, and it
  // vanished on reload. Merging into a pending bag and sending the bag fixes
  // that. A failed write puts the changes back so the next edit carries them.
  function patch(id, changes) {
    if (!canManage) return
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)))
    setStatus('saving'); setMsg(null)
    pending.current[id] = { ...(pending.current[id] || {}), ...changes }
    clearTimeout(timers.current[id])
    timers.current[id] = setTimeout(async () => {
      const merged = pending.current[id] || {}
      delete pending.current[id]
      const { error } = await supabase
        .from(TABLE)
        .update({ ...merged, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (!alive.current) return
      if (error) {
        pending.current[id] = { ...merged, ...(pending.current[id] || {}) }
        setStatus('error'); setMsg(error.message)
      } else {
        setStatus('saved'); setMsg(null)
      }
    }, 600)
  }

  async function addRow() {
    if (!canManage || !clientId) return
    setAdding(true); setStatus('saving'); setMsg(null)
    const { data, error } = await supabase
      .from(TABLE)
      .insert({ client_id: clientId, problem_statement: '', sort_order: rows.length })
      .select()
      .single()
    if (!alive.current) return
    setAdding(false)
    if (error) { setStatus('error'); setMsg(error.message); return }
    setRows((prev) => [...prev, data])
    setStatus('saved')
  }

  // Bring a problem across from the segments rather than retyping it. The
  // wording is the customer's, written one table up, and a retyped problem is
  // the consultant's paraphrase of it.
  async function carryAcross(carry) {
    if (!canManage || !clientId) return
    setAdding(true); setStatus('saving'); setMsg(null)
    const { data, error } = await supabase
      .from(TABLE)
      .insert(carriedRow(carry, clientId, rows.length))
      .select()
      .single()
    if (!alive.current) return
    setAdding(false)
    if (error) { setStatus('error'); setMsg(error.message); return }
    setRows((prev) => [...prev, data])
    setStatus('saved')
  }

  async function removeRow(row) {
    if (!canManage) return
    const name = row.problem_statement || 'this problem'
    if (!window.confirm(`Delete "${name}" and its scores?`)) return
    setStatus('saving'); setMsg(null)
    clearTimeout(timers.current[row.id])
    const { error } = await supabase.from(TABLE).delete().eq('id', row.id)
    if (!alive.current) return
    if (error) { setStatus('error'); setMsg(error.message); return }
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    setStatus('saved')
  }

  // Sorted by total, highest first. Ties keep the order they were entered
  // in, so the list never jumps around while a coach is scoring.
  const ranked = useMemo(() => {
    return rows
      .map((r, i) => ({ row: r, total: totalOf(r), entered: i }))
      .sort((a, b) => (b.total - a.total) || (a.entered - b.entered))
      .map((x, idx) => ({ ...x, rank: idx + 1, advancing: idx < ADVANCING_COUNT && x.total > 0 }))
  }, [rows])

  const advancingRows = ranked.filter((x) => x.advancing)
  const cutLine = advancingRows.length > 0 ? advancingRows[advancingRows.length - 1].total : 0
  const unfinished = rows.filter((r) => scoredCount(r) < DIMENSIONS.length).length

  const saveWord = status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved' : status === 'error' ? 'Not saved' : ''
  const saveTone = status === 'error' ? C.red : status === 'saved' ? C.green : C.slate
  const waiting = segmentsAwaitingScore(segments, rows)
  const segmentName = (id) => (segments.find((s) => s.id === id) || {}).segment_name || ''

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={H('1.2rem')}>Problem prioritisation</div>
          <div style={{ color: C.slate, fontSize: '0.85rem', marginTop: 3, maxWidth: '92ch', lineHeight: 1.5 }}>
            Score each candidate problem 1 to 5 on urgency, ownership clarity, willingness to pay and
            access. The total out of {MAX_TOTAL} sorts the list. Only the top {ADVANCING_COUNT} advance to the value
            proposition work. A problem can be urgent and still be worth nothing commercially if
            nobody owns it, nobody will pay, or nobody will see you.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {saveWord && <span style={{ ...LABEL, color: saveTone }}>{saveWord}</span>}
          {canManage && (
            <button type="button" onClick={addRow} disabled={adding} style={btn(C.green)}>
              {adding ? 'Adding...' : 'Add a problem by hand'}
            </button>
          )}
        </div>
      </div>

      {/* The problems were written in the customer's own words one table up.
          Retyping them here loses the wording and costs the room time, so the
          segments waiting to be scored are offered one click away. */}
      {canManage && waiting.length > 0 && (
        <div style={{
          marginTop: 12, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.green}`,
          borderRadius: 10, padding: '10px 12px',
        }}>
          <div style={LABEL}>
            {waiting.length === 1
              ? 'One segment has a problem written down and not yet scored'
              : `${waiting.length} segments have a problem written down and not yet scored`}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {waiting.map((c) => (
              <button
                key={c.segmentId}
                type="button"
                onClick={() => carryAcross(c)}
                disabled={adding}
                title={c.problem}
                style={{ ...btn(C.green, true), textAlign: 'left', maxWidth: 340 }}
              >
                + {c.segmentName}
              </button>
            ))}
          </div>
        </div>
      )}

      {!canManage && (
        <div style={{ ...LABEL, marginTop: 8 }}>Read only. You can see this work but not change it.</div>
      )}
      {msg && <div style={{ color: C.red, fontSize: '0.82rem', marginTop: 8 }}>{msg}</div>}

      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0.9rem 0 0.2rem' }}>
          <Pill text={`${rows.length} problem${rows.length === 1 ? '' : 's'} scored`} tone={C.slate} />
          <Pill text={`${advancingRows.length} advancing`} tone={advancingRows.length > 0 ? C.green : C.amber} />
          {advancingRows.length > 0 && <Pill text={`Cut line ${cutLine} of ${MAX_TOTAL}`} tone={C.slate} />}
          {unfinished > 0 && (
            <Pill
              text={`${unfinished} not fully scored`}
              tone={C.amber}
              title="Any dimension left blank counts as zero, so an unfinished row ranks lower than it may deserve."
            />
          )}
        </div>
      )}

      {loading ? (
        <div style={{ color: C.slate, fontSize: '0.85rem', fontStyle: 'italic', marginTop: '0.9rem' }}>Loading problems...</div>
      ) : rows.length === 0 ? (
        <div style={{ color: C.slate, fontSize: '0.85rem', fontStyle: 'italic', marginTop: '0.9rem' }}>
          No problems scored yet. {canManage ? 'Add the candidate problems you heard in the conversations.' : 'Nothing has been recorded yet.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', marginTop: '0.7rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1020 }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 54 }}>Rank</th>
                <th style={{ ...th, minWidth: 240 }}>Problem</th>
                <th style={{ ...th, minWidth: 160 }}>Who feels it</th>
                {DIMENSIONS.map((d) => (
                  <th key={d.key} style={{ ...th, width: 92 }} title={d.help}>{d.short}</th>
                ))}
                <th style={{ ...th, width: 96 }}>Total</th>
                <th style={{ ...th, width: 118 }}>Status</th>
                <th style={{ ...th, minWidth: 170 }}>Notes</th>
                {canManage && <th style={{ ...th, width: 44 }}></th>}
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ row: r, total, rank, advancing }) => (
                <tr key={r.id} style={advancing ? { background: C.alt } : undefined}>
                  <td style={{ ...td, fontFamily: 'var(--cv-font-mono)', fontWeight: 700, color: advancing ? C.green : C.slate }}>{rank}</td>
                  <td style={td}>
                    {canManage ? (
                      <textarea aria-label="State the problem as the customer states it" style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }} value={r.problem_statement || ''}
                        placeholder="State the problem as the customer states it"
                        onChange={(e) => patch(r.id, { problem_statement: e.target.value })} />
                    ) : (r.problem_statement || '-')}
                  </td>
                  <td style={td}>
                    {canManage ? (
                      <div style={{ display: 'grid', gap: 5 }}>
                        <select aria-label="Who feels this problem" style={inputStyle} value={r.segment_id || ''}
                          onChange={(e) => patch(r.id, { segment_id: e.target.value || null })}>
                          <option value="">No segment linked</option>
                          {segments.map((s) => (
                            <option key={s.id} value={s.id}>{s.segment_name || 'Unnamed segment'}</option>
                          ))}
                        </select>
                        {!r.segment_id && (
                          <input aria-label="Or name them here" style={inputStyle} value={r.segment_label || ''} placeholder="Or name them here"
                            onChange={(e) => patch(r.id, { segment_label: e.target.value })} />
                        )}
                      </div>
                    ) : (segmentName(r.segment_id) || r.segment_label || '-')}
                  </td>
                  {DIMENSIONS.map((d) => (
                    <td key={d.key} style={td} title={d.help}>
                      {canManage ? (
                        <select aria-label={d.label} style={{ ...inputStyle, fontFamily: 'var(--cv-font-mono)' }} value={r[d.key] == null ? '' : String(r[d.key])}
                          onChange={(e) => patch(r.id, { [d.key]: e.target.value === '' ? null : Number(e.target.value) })}>
                          <option value="">-</option>
                          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      ) : (r[d.key] == null ? '-' : r[d.key])}
                    </td>
                  ))}
                  <td style={td}>
                    <div style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '1.05rem', fontWeight: 700, color: totalTone(total) }}>
                      {total}
                      <span style={{ color: C.slate, fontWeight: 400, fontSize: '0.78rem' }}> / {MAX_TOTAL}</span>
                    </div>
                    {scoredCount(r) < DIMENSIONS.length && (
                      <div style={{ ...LABEL, color: C.amber, marginTop: 2 }}>{scoredCount(r)} of {DIMENSIONS.length} scored</div>
                    )}
                  </td>
                  <td style={td}>
                    {advancing
                      ? <Pill text="Advancing" tone={C.green} title={`Top ${ADVANCING_COUNT} by total. Carry this into the proposition builder.`} />
                      : <Pill text="Holding" tone={C.slate} title="Not in the top three. Keep it on the list, do not build a proposition for it yet." />}
                  </td>
                  <td style={td}>
                    {canManage ? (
                      <textarea aria-label="What the score rests on" style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }} value={r.notes || ''}
                        placeholder="What the score rests on"
                        onChange={(e) => patch(r.id, { notes: e.target.value })} />
                    ) : (r.notes || '-')}
                  </td>
                  {canManage && (
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button type="button" onClick={() => removeRow(r)} style={btn(C.red)} title="Delete this problem">x</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ borderLeft: `4px solid ${advancingRows.length > 0 ? C.green : C.amber}`, background: C.alt, borderRadius: 8, padding: '0.6rem 0.8rem', marginTop: '0.9rem' }}>
          <div style={{ ...LABEL, marginBottom: 4 }}>What advances</div>
          <div style={{ fontSize: '0.83rem', color: C.navy, lineHeight: 1.45 }}>
            {advancingRows.length === 0
              ? 'Nothing advances yet. Score at least one problem on the four dimensions.'
              : `${advancingRows.map((x) => x.row.problem_statement || 'an unnamed problem').join('; ')}. Build a value proposition for these and no others.`}
          </div>
        </div>
      )}
    </div>
  )
}
