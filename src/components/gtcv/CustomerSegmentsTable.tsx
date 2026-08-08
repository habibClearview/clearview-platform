// @ts-nocheck
'use client'
// ============================================================
// GtCV DP02: Customer Profile and Three-Stage Adoption Test.
//
// One row per candidate customer segment. For each segment the table holds
// the segment name, the problem in the customer's own words, the named
// budget holder and their role, how urgent the problem is (1 to 5), and the
// three adoption answers.
//
// METHOD (from the GtCV handbook), encoded here and not left to memory:
//
//   Three-Stage Adoption Test. A customer must be WILLING, then ABLE, then
//   PRIORITISED, in that order. The stages are sequential: a segment that
//   is not willing cannot be counted as able, and being able means nothing
//   until the work is prioritised. Prioritised is the real commercial
//   signal, because it is the only stage that survives contact with a
//   budget cycle. The adoption stage column is derived, never typed: it
//   shows the FIRST stage that is not a clear yes, which is where the
//   segment is stuck.
//
//   DP02 gate. A segment needs a minimum of 5 validation conversations,
//   with at least 3 of them converging on the same problem, the same
//   budget and the same willingness to pay. Five conversations that all
//   say different things is not evidence, it is noise. The readiness strip
//   under each row states plainly whether the rule is met and, if the
//   numbers are met, which adoption stage the segment is stuck at.
//
// Backed by supabase/migrations/2026_08_09_gtcv_dp_tables_b.sql
// (table gtcv_customer_segments; read via can_view_client, write via
// can_manage_client_access).
//
// Client agnostic: every segment, person and number is data.
//
// Props: { clientId, canManage }
// ============================================================
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DEFAULT_VALIDATION_MIN_PER_SEGMENT } from '@/lib/engagement-types'

// The handbook minimums. Conversations come from the shared constant so
// the app has one source of truth for the number; the converging minimum
// is fixed by the method at 3 of those conversations.
const MIN_CONVERSATIONS = DEFAULT_VALIDATION_MIN_PER_SEGMENT
const MIN_CONVERGING = 3

const TABLE = 'gtcv_customer_segments'

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
  fontFamily: 'Georgia,serif', fontWeight: 700, color: C.navy, fontSize: size,
})
const LABEL = {
  fontFamily: 'monospace', fontSize: '0.72rem', letterSpacing: '0.04em',
  textTransform: 'uppercase', color: C.slate,
}
const inputStyle = {
  fontFamily: 'inherit', fontSize: '0.85rem', padding: '0.4rem 0.55rem',
  border: `1px solid ${C.border}`, borderRadius: 7, background: C.card,
  color: C.navy, width: '100%', boxSizing: 'border-box',
}
const th = { ...LABEL, textAlign: 'left', padding: '0.5rem 0.7rem', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
const td = { padding: '0.5rem 0.7rem', fontSize: '0.86rem', color: C.navy, verticalAlign: 'top' }
function btn(color, solid = false) {
  return solid
    ? { fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 700, padding: '0.42rem 0.9rem', border: 'none', borderRadius: 7, background: color, color: 'var(--cv-on-accent)', cursor: 'pointer' }
    : { fontFamily: 'monospace', fontSize: '0.82rem', padding: '0.42rem 0.9rem', border: `1px solid ${color}`, borderRadius: 7, background: 'transparent', color, cursor: 'pointer' }
}

// ----- the method, as code -----
const ANSWERS = ['yes', 'no', 'unsure']

// The three stages in their fixed order. Order is the method: it is not a
// display preference and must not be re-sorted.
const STAGES = [
  { key: 'willing', label: 'Willing', question: 'Do they want this problem solved?' },
  { key: 'able', label: 'Able', question: 'Can they buy: budget, authority, a route to purchase?' },
  { key: 'prioritised', label: 'Prioritised', question: 'Does it beat the other calls on the same money this period?' },
]

// The first stage that is not a clear yes. Everything after it is untested
// by definition, so it is not reported.
function adoptionStage(row) {
  for (const s of STAGES) {
    if (row[s.key] !== 'yes') {
      return { stuck: true, key: s.key, label: s.label, answer: row[s.key] || 'unsure' }
    }
  }
  return { stuck: false, key: 'prioritised', label: 'Prioritised', answer: 'yes' }
}

function stageWord(st) {
  if (!st.stuck) return 'Prioritised'
  return `Stuck at ${st.label}`
}
function stageTone(st) {
  if (!st.stuck) return C.green
  if (st.key === 'willing') return C.red
  return C.amber
}

// The DP02 conversation rule, read straight off the row.
function gateCheck(row) {
  const logged = Number(row.conversations_logged) || 0
  const converging = Number(row.converging_count) || 0
  const enough = logged >= MIN_CONVERSATIONS
  const converged = converging >= MIN_CONVERGING
  // Converging conversations cannot exceed the conversations held. Flagged
  // rather than silently corrected, because it means the log is wrong.
  const inconsistent = converging > logged
  return { logged, converging, enough, converged, inconsistent, pass: enough && converged && !inconsistent }
}

function Pill({ text, tone }) {
  return (
    <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700, color: tone, border: `1px solid ${tone}`, borderRadius: 6, padding: '0.1rem 0.45rem', whiteSpace: 'nowrap', display: 'inline-block' }}>
      {text}
    </span>
  )
}

// The readiness strip: plain sentences, no scores, no jargon. It answers
// two questions only. Have we done enough conversations, and where is this
// segment stuck.
function ReadinessStrip({ row }) {
  const g = gateCheck(row)
  const st = adoptionStage(row)
  const tone = g.pass && !st.stuck ? C.green : g.pass ? C.amber : C.red

  const countLine = g.inconsistent
    ? `Check the log: ${g.converging} converging is more than the ${g.logged} conversations recorded.`
    : g.enough && g.converged
      ? `Evidence rule met: ${g.logged} conversations logged (needs ${MIN_CONVERSATIONS}), ${g.converging} converging (needs ${MIN_CONVERGING}).`
      : !g.enough && !g.converged
        ? `Evidence rule not met: ${g.logged} of ${MIN_CONVERSATIONS} conversations logged, ${g.converging} of ${MIN_CONVERGING} converging.`
        : !g.enough
          ? `Evidence rule not met: ${g.logged} of ${MIN_CONVERSATIONS} conversations logged. Converging is fine at ${g.converging}.`
          : `Evidence rule not met: ${g.converging} of ${MIN_CONVERGING} conversations converge on the same problem, budget and willingness to pay.`

  const stageLine = st.stuck
    ? `Adoption test: stuck at ${st.label}, answer is "${st.answer}". ${STAGES.find(s => s.key === st.key).question} Test this before moving on.`
    : 'Adoption test: willing, able and prioritised. This segment carries a real commercial signal.'

  return (
    <div style={{ borderLeft: `4px solid ${tone}`, background: C.alt, borderRadius: 8, padding: '0.6rem 0.8rem', margin: '0.1rem 0 0.4rem' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 5 }}>
        <span style={{ ...LABEL, color: tone }}>Gate readiness</span>
        <Pill text={g.pass ? 'Evidence rule met' : 'Evidence rule not met'} tone={g.pass ? C.green : C.red} />
        <Pill text={stageWord(st)} tone={stageTone(st)} />
      </div>
      <div style={{ fontSize: '0.83rem', color: C.navy, lineHeight: 1.45 }}>{countLine}</div>
      <div style={{ fontSize: '0.83rem', color: C.navy, lineHeight: 1.45 }}>{stageLine}</div>
    </div>
  )
}

export default function CustomerSegmentsTable({ clientId, canManage }) {
  const [rows, setRows] = useState([])
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
    if (!clientId) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('client_id', clientId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (!alive.current) return
    if (error) { setMsg(error.message); setStatus('error') } else { setRows(data || []) }
    setLoading(false)
  }

  useEffect(() => { load() }, [clientId])

  // Edit locally at once, write to the database 600ms after typing stops.
  // One timer per row, so two rows edited together do not cancel each other.
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
      .insert({
        client_id: clientId,
        segment_name: '',
        willing: 'unsure', able: 'unsure', prioritised: 'unsure',
        conversations_logged: 0, converging_count: 0,
        sort_order: rows.length,
      })
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
    const name = row.segment_name || 'this segment'
    if (!window.confirm(`Delete ${name} and the adoption test answers recorded against it?`)) return
    setStatus('saving'); setMsg(null)
    clearTimeout(timers.current[row.id])
    const { error } = await supabase.from(TABLE).delete().eq('id', row.id)
    if (!alive.current) return
    if (error) { setStatus('error'); setMsg(error.message); return }
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    setStatus('saved')
  }

  const summary = useMemo(() => {
    const total = rows.length
    const evidence = rows.filter((r) => gateCheck(r).pass).length
    const prioritised = rows.filter((r) => !adoptionStage(r).stuck).length
    const ready = rows.filter((r) => gateCheck(r).pass && !adoptionStage(r).stuck).length
    return { total, evidence, prioritised, ready }
  }, [rows])

  const saveWord = status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved' : status === 'error' ? 'Not saved' : ''
  const saveTone = status === 'error' ? C.red : status === 'saved' ? C.green : C.slate

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
        <div>
          <div style={H('1.2rem')}>Customer profile and adoption test</div>
          <div style={{ color: C.slate, fontSize: '0.85rem', marginTop: 3, maxWidth: '68ch', lineHeight: 1.5 }}>
            One row per segment. A customer must be willing, then able, then prioritised, in that
            order. Prioritised is the signal that counts. Each segment needs {MIN_CONVERSATIONS} validation
            conversations, with at least {MIN_CONVERGING} converging on the same problem, budget and
            willingness to pay.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {saveWord && <span style={{ ...LABEL, color: saveTone }}>{saveWord}</span>}
          {canManage && (
            <button type="button" onClick={addRow} disabled={adding} style={btn(C.green, true)}>
              {adding ? 'Adding...' : 'Add segment'}
            </button>
          )}
        </div>
      </div>

      {!canManage && (
        <div style={{ ...LABEL, marginTop: 8 }}>Read only. You can see this work but not change it.</div>
      )}
      {msg && <div style={{ color: C.red, fontSize: '0.82rem', marginTop: 8 }}>{msg}</div>}

      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0.9rem 0 0.4rem' }}>
          <Pill text={`${summary.total} segment${summary.total === 1 ? '' : 's'}`} tone={C.slate} />
          <Pill text={`${summary.evidence} of ${summary.total} meet the ${MIN_CONVERSATIONS} and ${MIN_CONVERGING} rule`} tone={summary.evidence > 0 ? C.green : C.red} />
          <Pill text={`${summary.prioritised} reach Prioritised`} tone={summary.prioritised > 0 ? C.green : C.amber} />
          <Pill text={`${summary.ready} ready to carry into DP03`} tone={summary.ready > 0 ? C.green : C.amber} />
        </div>
      )}

      {loading ? (
        <div style={{ color: C.slate, fontSize: '0.85rem', fontStyle: 'italic', marginTop: '0.9rem' }}>Loading segments...</div>
      ) : rows.length === 0 ? (
        <div style={{ color: C.slate, fontSize: '0.85rem', fontStyle: 'italic', marginTop: '0.9rem' }}>
          No segments yet. {canManage ? 'Add the first segment you are testing.' : 'Nothing has been recorded yet.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', marginTop: '0.7rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1180 }}>
            <thead>
              <tr>
                <th style={{ ...th, minWidth: 150 }}>Segment</th>
                <th style={{ ...th, minWidth: 210 }}>Problem in their words</th>
                <th style={{ ...th, minWidth: 160 }}>Budget holder</th>
                <th style={{ ...th, width: 92 }}>Urgency</th>
                <th style={{ ...th, width: 96 }}>Willing</th>
                <th style={{ ...th, width: 96 }}>Able</th>
                <th style={{ ...th, width: 108 }}>Prioritised</th>
                <th style={{ ...th, width: 128 }}>Adoption stage</th>
                <th style={{ ...th, width: 96 }}>Talks</th>
                <th style={{ ...th, width: 110 }}>Converging</th>
                <th style={{ ...th, minWidth: 180 }}>Notes</th>
                {canManage && <th style={{ ...th, width: 44 }}></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = adoptionStage(r)
                const cols = canManage ? 12 : 11
                return (
                  <Fragment key={r.id}>
                    <tr style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                      <td style={td}>
                        {canManage ? (
                          <input style={inputStyle} value={r.segment_name || ''} placeholder="Who they are"
                            onChange={(e) => patch(r.id, { segment_name: e.target.value })} />
                        ) : (r.segment_name || '-')}
                      </td>
                      <td style={td}>
                        {canManage ? (
                          <textarea style={{ ...inputStyle, minHeight: 58, resize: 'vertical' }} value={r.problem_in_their_words || ''}
                            placeholder="Quote them, do not paraphrase"
                            onChange={(e) => patch(r.id, { problem_in_their_words: e.target.value })} />
                        ) : (r.problem_in_their_words || '-')}
                      </td>
                      <td style={td}>
                        {canManage ? (
                          <div style={{ display: 'grid', gap: 5 }}>
                            <input style={inputStyle} value={r.budget_holder_name || ''} placeholder="Name"
                              onChange={(e) => patch(r.id, { budget_holder_name: e.target.value })} />
                            <input style={inputStyle} value={r.budget_holder_role || ''} placeholder="Role"
                              onChange={(e) => patch(r.id, { budget_holder_role: e.target.value })} />
                          </div>
                        ) : (
                          <div>
                            <div>{r.budget_holder_name || 'Not named'}</div>
                            <div style={{ color: C.slate, fontSize: '0.8rem' }}>{r.budget_holder_role || ''}</div>
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        {canManage ? (
                          <select style={{ ...inputStyle, fontFamily: 'monospace' }} value={r.problem_urgency == null ? '' : String(r.problem_urgency)}
                            onChange={(e) => patch(r.id, { problem_urgency: e.target.value === '' ? null : Number(e.target.value) })}>
                            <option value="">-</option>
                            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        ) : (r.problem_urgency == null ? '-' : r.problem_urgency)}
                      </td>
                      {STAGES.map((s) => (
                        <td key={s.key} style={td} title={s.question}>
                          {canManage ? (
                            <select style={{ ...inputStyle, fontFamily: 'monospace' }} value={r[s.key] || 'unsure'}
                              onChange={(e) => patch(r.id, { [s.key]: e.target.value })}>
                              {ANSWERS.map((a) => <option key={a} value={a}>{a}</option>)}
                            </select>
                          ) : (r[s.key] || 'unsure')}
                        </td>
                      ))}
                      <td style={td}>
                        <Pill text={stageWord(st)} tone={stageTone(st)} />
                      </td>
                      <td style={td}>
                        {canManage ? (
                          <input style={{ ...inputStyle, fontFamily: 'monospace' }} inputMode="numeric" value={r.conversations_logged ?? 0}
                            onChange={(e) => patch(r.id, { conversations_logged: Math.max(0, Number(e.target.value) || 0) })} />
                        ) : (r.conversations_logged ?? 0)}
                        <div style={{ ...LABEL, marginTop: 3 }}>of {MIN_CONVERSATIONS}</div>
                      </td>
                      <td style={td}>
                        {canManage ? (
                          <input style={{ ...inputStyle, fontFamily: 'monospace' }} inputMode="numeric" value={r.converging_count ?? 0}
                            onChange={(e) => patch(r.id, { converging_count: Math.max(0, Number(e.target.value) || 0) })} />
                        ) : (r.converging_count ?? 0)}
                        <div style={{ ...LABEL, marginTop: 3 }}>of {MIN_CONVERGING}</div>
                      </td>
                      <td style={td}>
                        {canManage ? (
                          <textarea style={{ ...inputStyle, minHeight: 58, resize: 'vertical' }} value={r.notes || ''}
                            placeholder="What the conversations changed"
                            onChange={(e) => patch(r.id, { notes: e.target.value })} />
                        ) : (r.notes || '-')}
                      </td>
                      {canManage && (
                        <td style={{ ...td, textAlign: 'right' }}>
                          <button type="button" onClick={() => removeRow(r)} style={btn(C.red)} title="Delete this segment">x</button>
                        </td>
                      )}
                    </tr>
                    <tr>
                      <td style={{ padding: '0 0.7rem 0.4rem' }} colSpan={cols}>
                        <ReadinessStrip row={r} />
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
