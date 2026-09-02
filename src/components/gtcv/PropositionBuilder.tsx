// @ts-nocheck
'use client'
// ============================================================
// GtCV DP03: Proposition Builder.
//
// One proposition per priority segment. A GtCV value proposition has FOUR
// parts and no others:
//
//   Capability        what we can actually do
//   Problem           the problem it removes, in the customer's words
//   Outcome           what changes for them, stated as a result
//   Reason to choose  why us rather than the alternative they have
//
// Differentiation is one of exactly THREE types:
//
//   Capability  we can do something others cannot
//   Context     we understand this setting in a way others do not
//   Access      we can reach people or places others cannot
//
// If a claimed difference is none of those three, it is not a difference,
// it is a preference. The builder offers no fourth option.
//
// The assembled proposition is composed from the four parts into a single
// paragraph and stays in step with them until somebody edits it. From that
// point the edited wording is kept and never overwritten silently, because
// the wording an organisation arrives at after a real conversation is the
// asset. A rebuild is always one click away and always explicit.
//
// A proposition is not finished when it reads well. It is finished when a
// real customer has reacted to it and something changed as a result, so
// every proposition carries a test log (who it was tested with, their
// reaction, what changed) and a revision counter. The method expects each
// revision to get shorter and more specific, so the word count is shown.
//
// Backed by supabase/migrations/2026_08_09_gtcv_dp_tables_b.sql
// (tables gtcv_propositions and gtcv_proposition_tests; read via
// can_view_client, write via can_manage_client_access).
//
// Client agnostic: every segment, claim and test is data.
//
// Props: { clientId, canManage }
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const TABLE = 'gtcv_propositions'
const TESTS_TABLE = 'gtcv_proposition_tests'
const SEGMENTS_TABLE = 'gtcv_customer_segments'

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
  fontFamily: 'var(--cv-font-mono)', fontSize: '0.72rem', letterSpacing: '0.04em',
  textTransform: 'uppercase', color: C.slate,
}
const inputStyle = {
  fontFamily: 'inherit', fontSize: '0.85rem', padding: '0.4rem 0.55rem',
  border: `1px solid ${C.border}`, borderRadius: 7, background: C.card,
  color: C.navy, width: '100%', boxSizing: 'border-box',
}
const th = { ...LABEL, textAlign: 'left', padding: '0.45rem 0.6rem', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
const td = { padding: '0.45rem 0.6rem', fontSize: '0.85rem', color: C.navy, verticalAlign: 'top', borderBottom: `1px solid ${C.borderSoft}` }
function btn(color, solid = false) {
  return solid
    ? { fontFamily: 'var(--cv-font-mono)', fontSize: '0.82rem', fontWeight: 700, padding: '0.42rem 0.9rem', border: 'none', borderRadius: 7, background: color, color: 'var(--cv-on-accent)', cursor: 'pointer' }
    : { fontFamily: 'var(--cv-font-mono)', fontSize: '0.82rem', padding: '0.42rem 0.9rem', border: `1px solid ${color}`, borderRadius: 7, background: 'transparent', color, cursor: 'pointer' }
}

// The four parts, in the order the method states them.
const PARTS = [
  { key: 'capability', label: 'Capability', help: 'What we can actually do. Not our mission, our capability.', placeholder: 'e.g. run cost and pricing reviews for service teams' },
  { key: 'problem', label: 'Problem', help: 'The problem it removes, in the words the customer used.', placeholder: 'e.g. they cannot say what a service costs them to deliver' },
  { key: 'outcome', label: 'Outcome', help: 'What changes for them. State it as a result, not an activity.', placeholder: 'e.g. they price with a floor they can defend' },
  { key: 'reason_to_choose', label: 'Reason to choose', help: 'Why us rather than the alternative they already have.', placeholder: 'e.g. we have done it inside organisations like theirs' },
]

// Differentiation has exactly three types in the method.
const DIFF_TYPES = [
  { key: 'capability', label: 'Capability', help: 'We can do something others cannot do.' },
  { key: 'context', label: 'Context', help: 'We understand this setting in a way others do not.' },
  { key: 'access', label: 'Access', help: 'We can reach people or places others cannot reach.' },
]

const txt = (v) => (v == null ? '' : String(v)).trim()
// Strip a trailing full stop so the composer can add its own without
// producing two.
const clause = (v) => txt(v).replace(/[.\s]+$/, '')
const words = (v) => txt(v).split(/\s+/).filter(Boolean).length

// Compose the four parts into one paragraph. Missing parts are skipped
// rather than filled with filler, so a half built proposition reads as
// half built instead of reading as finished.
function composeProposition(p, segmentLabel) {
  const out = []
  const seg = clause(segmentLabel)
  const cap = clause(p.capability)
  const prob = clause(p.problem)
  const outc = clause(p.outcome)
  const reason = clause(p.reason_to_choose)
  const diffType = (DIFF_TYPES.find((d) => d.key === p.differentiation_type) || {}).label
  const diff = clause(p.differentiation_statement)
  const cred = clause(p.credibility_signal)

  if (cap) out.push(seg ? `For ${seg}, we ${cap.replace(/^we\s+/i, '')}.` : `We ${cap.replace(/^we\s+/i, '')}.`)
  else if (seg) out.push(`For ${seg}.`)
  if (prob) out.push(`Today, ${prob.charAt(0).toLowerCase()}${prob.slice(1)}.`)
  if (outc) out.push(`With us, ${outc.charAt(0).toLowerCase()}${outc.slice(1)}.`)
  if (reason) out.push(`They choose us because ${reason.charAt(0).toLowerCase()}${reason.slice(1)}.`)
  if (diff) out.push(`Our difference is ${diffType ? diffType.toLowerCase() : 'this'}: ${diff}.`)
  if (cred) out.push(`The proof is ${cred.charAt(0).toLowerCase()}${cred.slice(1)}.`)
  return out.join(' ')
}

function missingParts(p) {
  return PARTS.filter((x) => !txt(p[x.key])).map((x) => x.label)
}

function Pill({ text, tone, title }) {
  return (
    <span title={title} style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.72rem', fontWeight: 700, color: tone, border: `1px solid ${tone}`, borderRadius: 6, padding: '0.1rem 0.45rem', whiteSpace: 'nowrap', display: 'inline-block' }}>
      {text}
    </span>
  )
}

export default function PropositionBuilder({ clientId, canManage }) {
  const [rows, setRows] = useState([])
  const [tests, setTests] = useState([])
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
    if (!clientId) { setRows([]); setTests([]); setSegments([]); setLoading(false); return }
    setLoading(true)
    try {
      const [props, logs, segs] = await Promise.all([
        supabase.from(TABLE).select('*').eq('client_id', clientId)
          .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
        supabase.from(TESTS_TABLE).select('*').eq('client_id', clientId)
          .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
        supabase.from(SEGMENTS_TABLE).select('id, segment_name').eq('client_id', clientId)
          .order('sort_order', { ascending: true }),
      ])
      if (!alive.current) return
      // Each failure is named. A silently empty test log or segment list reads
      // as "nothing has been done yet", which is a different statement from
      // "this did not load".
      if (props.error) {
        console.error('PropositionBuilder: propositions failed', props.error)
        setMsg('Could not load the propositions. Try again.'); setStatus('error')
      } else {
        setRows(props.data || [])
      }
      if (logs.error) {
        console.error('PropositionBuilder: tests failed', logs.error)
        setMsg('Could not load the proposition tests, so the testing history is incomplete.'); setStatus('error')
      } else {
        setTests(logs.data || [])
      }
      if (segs.error) {
        console.error('PropositionBuilder: segments failed', segs.error)
        setMsg('Could not load the customer segments, so the segment list is incomplete.'); setStatus('error')
      } else {
        setSegments(segs.data || [])
      }
    } catch (e) {
      if (!alive.current) return
      console.error('PropositionBuilder: load threw', e)
      setMsg('Could not load this surface. Try again.'); setStatus('error')
    } finally {
      if (alive.current) setLoading(false)
    }
  }

  useEffect(() => { load() }, [clientId])

  // Edit locally at once, write 600ms after typing stops. One timer per
  // record so simultaneous edits do not cancel each other.
  // Changes accumulate per record rather than the timer closing over the last
  // one. Editing two fields inside the debounce window used to send only the
  // second, and the first was lost quietly on reload.
  function schedule(table, id, changes, key) {
    setStatus('saving'); setMsg(null)
    pending.current[key] = { ...(pending.current[key] || {}), ...changes }
    clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(async () => {
      const merged = pending.current[key] || {}
      delete pending.current[key]
      const { error } = await supabase
        .from(table)
        .update({ ...merged, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (!alive.current) return
      if (error) {
        pending.current[key] = { ...merged, ...(pending.current[key] || {}) }
        setStatus('error'); setMsg(error.message)
      } else {
        setStatus('saved'); setMsg(null)
      }
    }, 600)
  }

  function patch(id, changes) {
    if (!canManage) return
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)))
    schedule(TABLE, id, changes, `p:${id}`)
  }

  function patchTest(id, changes) {
    if (!canManage) return
    setTests((prev) => prev.map((t) => (t.id === id ? { ...t, ...changes } : t)))
    schedule(TESTS_TABLE, id, changes, `t:${id}`)
  }

  async function addProposition() {
    if (!canManage || !clientId) return
    setAdding(true); setStatus('saving'); setMsg(null)
    const { data, error } = await supabase
      .from(TABLE)
      .insert({ client_id: clientId, sort_order: rows.length, assembled_is_custom: false, revision_count: 0 })
      .select()
      .single()
    if (!alive.current) return
    setAdding(false)
    if (error) { setStatus('error'); setMsg(error.message); return }
    setRows((prev) => [...prev, data])
    setStatus('saved')
  }

  async function removeProposition(row) {
    if (!canManage) return
    if (!window.confirm('Delete this proposition and every test logged against it?')) return
    setStatus('saving'); setMsg(null)
    clearTimeout(timers.current[`p:${row.id}`])
    const { error } = await supabase.from(TABLE).delete().eq('id', row.id)
    if (!alive.current) return
    if (error) { setStatus('error'); setMsg(error.message); return }
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    setTests((prev) => prev.filter((t) => t.proposition_id !== row.id))
    setStatus('saved')
  }

  async function addTest(propositionId) {
    if (!canManage || !clientId) return
    setStatus('saving'); setMsg(null)
    const mine = tests.filter((t) => t.proposition_id === propositionId)
    const { data, error } = await supabase
      .from(TESTS_TABLE)
      .insert({
        client_id: clientId,
        proposition_id: propositionId,
        tested_on: new Date().toISOString().split('T')[0],
        sort_order: mine.length,
      })
      .select()
      .single()
    if (!alive.current) return
    if (error) { setStatus('error'); setMsg(error.message); return }
    setTests((prev) => [...prev, data])
    setStatus('saved')
  }

  async function removeTest(test) {
    if (!canManage) return
    if (!window.confirm('Delete this test entry?')) return
    setStatus('saving'); setMsg(null)
    clearTimeout(timers.current[`t:${test.id}`])
    const { error } = await supabase.from(TESTS_TABLE).delete().eq('id', test.id)
    if (!alive.current) return
    if (error) { setStatus('error'); setMsg(error.message); return }
    setTests((prev) => prev.filter((t) => t.id !== test.id))
    setStatus('saved')
  }

  const segmentName = (id) => (segments.find((s) => s.id === id) || {}).segment_name || ''
  const labelFor = (r) => segmentName(r.segment_id) || txt(r.segment_label)

  const saveWord = status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved' : status === 'error' ? 'Not saved' : ''
  const saveTone = status === 'error' ? C.red : status === 'saved' ? C.green : C.slate

  const summary = useMemo(() => {
    const complete = rows.filter((r) => missingParts(r).length === 0).length
    const tested = rows.filter((r) => tests.some((t) => t.proposition_id === r.id && txt(t.reaction))).length
    return { total: rows.length, complete, tested }
  }, [rows, tests])

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={H('1.2rem')}>Proposition builder</div>
          <div style={{ color: C.slate, fontSize: '0.85rem', marginTop: 3, maxWidth: '92ch', lineHeight: 1.5 }}>
            One proposition per priority segment, built from four parts: capability, problem,
            outcome, reason to choose. Differentiation is capability, context or access, and nothing
            else. The paragraph is assembled from the parts and stays editable. A proposition counts
            as finished only once a real customer has reacted to it and something changed.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {saveWord && <span style={{ ...LABEL, color: saveTone }}>{saveWord}</span>}
          {canManage && (
            <button type="button" onClick={addProposition} disabled={adding} style={btn(C.green, true)}>
              {adding ? 'Adding...' : 'Add proposition'}
            </button>
          )}
        </div>
      </div>

      {!canManage && (
        <div style={{ ...LABEL, marginTop: 8 }}>Read only. You can see this work but not change it.</div>
      )}
      {msg && <div style={{ color: C.red, fontSize: '0.82rem', marginTop: 8 }}>{msg}</div>}

      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0.9rem 0 0.2rem' }}>
          <Pill text={`${summary.total} proposition${summary.total === 1 ? '' : 's'}`} tone={C.slate} />
          <Pill text={`${summary.complete} with all four parts`} tone={summary.complete > 0 ? C.green : C.amber} />
          <Pill text={`${summary.tested} tested with a real customer`} tone={summary.tested > 0 ? C.green : C.amber} />
        </div>
      )}

      {loading ? (
        <div style={{ color: C.slate, fontSize: '0.85rem', fontStyle: 'italic', marginTop: '0.9rem' }}>Loading propositions...</div>
      ) : rows.length === 0 ? (
        <div style={{ color: C.slate, fontSize: '0.85rem', fontStyle: 'italic', marginTop: '0.9rem' }}>
          No propositions yet. {canManage ? 'Add one for each segment that came through the scoring as a priority.' : 'Nothing has been recorded yet.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem', marginTop: '0.9rem' }}>
          {rows.map((r) => (
            <PropositionCard
              key={r.id}
              row={r}
              label={labelFor(r)}
              segments={segments}
              tests={tests.filter((t) => t.proposition_id === r.id)}
              canManage={canManage}
              patch={patch}
              patchTest={patchTest}
              addTest={addTest}
              removeTest={removeTest}
              removeProposition={removeProposition}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PropositionCard({ row: r, label, segments, tests, canManage, patch, patchTest, addTest, removeTest, removeProposition }) {
  const composed = composeProposition(r, label)
  const assembled = txt(r.assembled_statement)
  const missing = missingParts(r)
  // The assembled paragraph has been edited by hand and the parts have
  // moved on since. Stated, never fixed silently.
  const stale = r.assembled_is_custom && composed && assembled && composed !== assembled
  // Until somebody edits the wording, the paragraph tracks the four parts
  // live. Once edited, the edited wording wins and is never overwritten
  // without a click.
  const shown = r.assembled_is_custom ? (assembled || composed) : (composed || assembled)

  function rebuild() {
    if (!canManage) return
    patch(r.id, { assembled_statement: composed, assembled_is_custom: false })
  }
  function editAssembled(v) {
    patch(r.id, { assembled_statement: v, assembled_is_custom: true })
  }
  function bumpRevision(delta) {
    const next = Math.max(0, (Number(r.revision_count) || 0) + delta)
    patch(r.id, { revision_count: next })
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem 1.1rem', background: C.card }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 240, flex: '1 1 260px' }}>
          <div style={{ ...LABEL, marginBottom: 4 }}>Segment</div>
          {canManage ? (
            <div style={{ display: 'grid', gap: 5 }}>
              <select aria-label="Customer segment" style={inputStyle} value={r.segment_id || ''}
                onChange={(e) => patch(r.id, { segment_id: e.target.value || null })}>
                <option value="">No segment linked</option>
                {segments.map((s) => <option key={s.id} value={s.id}>{s.segment_name || 'Unnamed segment'}</option>)}
              </select>
              {!r.segment_id && (
                <input aria-label="Or name the segment here" style={inputStyle} value={r.segment_label || ''} placeholder="Or name the segment here"
                  onChange={(e) => patch(r.id, { segment_label: e.target.value })} />
              )}
            </div>
          ) : (
            <div style={{ ...H('1rem') }}>{label || 'Segment not named'}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Pill
            text={`Revision ${Number(r.revision_count) || 0}`}
            tone={C.slate}
            title="Each revision after a test should come out shorter and more specific."
          />
          {canManage && (
            <>
              <button type="button" style={btn(C.cyan)} onClick={() => bumpRevision(1)} title="Record that this proposition changed after a test">Record revision</button>
              <button type="button" style={btn(C.slate)} onClick={() => bumpRevision(-1)} title="Undo the last revision count">Undo</button>
              <button type="button" style={btn(C.red)} onClick={() => removeProposition(r)} title="Delete this proposition">x</button>
            </>
          )}
        </div>
      </div>

      {/* The four parts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '0.7rem', marginTop: '0.9rem' }}>
        {PARTS.map((p) => (
          <label key={p.key} style={{ display: 'block' }} title={p.help}>
            <div style={{ ...LABEL, marginBottom: 4 }}>{p.label}</div>
            {canManage ? (
              <textarea aria-label={p.label} style={{ ...inputStyle, minHeight: 62, resize: 'vertical' }} value={r[p.key] || ''}
                placeholder={p.placeholder} onChange={(e) => patch(r.id, { [p.key]: e.target.value })} />
            ) : (
              <div style={{ fontSize: '0.85rem', color: C.navy, lineHeight: 1.45 }}>{r[p.key] || '-'}</div>
            )}
            <div style={{ fontSize: '0.76rem', color: C.slate, marginTop: 3, lineHeight: 1.35 }}>{p.help}</div>
          </label>
        ))}
      </div>

      {missing.length > 0 && (
        <div style={{ ...LABEL, color: C.amber, marginTop: 8 }}>
          Still missing: {missing.join(', ')}. All four parts are required.
        </div>
      )}

      {/* Differentiation and credibility */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,0.7fr) minmax(220px,1.3fr) minmax(220px,1fr)', gap: '0.7rem', marginTop: '0.9rem' }}>
        <label style={{ display: 'block' }}>
          <div style={{ ...LABEL, marginBottom: 4 }}>Differentiation type</div>
          {canManage ? (
            <select aria-label="Kind of differentiation" style={inputStyle} value={r.differentiation_type || ''}
              onChange={(e) => patch(r.id, { differentiation_type: e.target.value || null })}>
              <option value="">Choose one</option>
              {DIFF_TYPES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          ) : (
            <div style={{ fontSize: '0.85rem' }}>{(DIFF_TYPES.find((d) => d.key === r.differentiation_type) || {}).label || '-'}</div>
          )}
          <div style={{ fontSize: '0.76rem', color: C.slate, marginTop: 3, lineHeight: 1.35 }}>
            {(DIFF_TYPES.find((d) => d.key === r.differentiation_type) || {}).help
              || 'Capability, context or access. If it is none of the three, it is not a difference.'}
          </div>
        </label>
        <label style={{ display: 'block' }}>
          <div style={{ ...LABEL, marginBottom: 4 }}>Differentiation statement</div>
          {canManage ? (
            <textarea aria-label="Say the difference in one line" style={{ ...inputStyle, minHeight: 62, resize: 'vertical' }} value={r.differentiation_statement || ''}
              placeholder="Say the difference in one line" onChange={(e) => patch(r.id, { differentiation_statement: e.target.value })} />
          ) : (
            <div style={{ fontSize: '0.85rem', lineHeight: 1.45 }}>{r.differentiation_statement || '-'}</div>
          )}
        </label>
        <label style={{ display: 'block' }}>
          <div style={{ ...LABEL, marginBottom: 4 }}>Credibility signal</div>
          {canManage ? (
            <textarea aria-label="The proof that makes the claim believable" style={{ ...inputStyle, minHeight: 62, resize: 'vertical' }} value={r.credibility_signal || ''}
              placeholder="The proof that makes the claim believable" onChange={(e) => patch(r.id, { credibility_signal: e.target.value })} />
          ) : (
            <div style={{ fontSize: '0.85rem', lineHeight: 1.45 }}>{r.credibility_signal || '-'}</div>
          )}
        </label>
      </div>

      {/* Assembled paragraph */}
      <div style={{ background: C.alt, borderRadius: 10, padding: '0.8rem 0.9rem', marginTop: '1rem', borderLeft: `4px solid ${missing.length === 0 ? C.green : C.amber}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
          <div style={LABEL}>The proposition</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Pill text={`${words(shown)} words`} tone={words(shown) > 0 && words(shown) <= 60 ? C.green : C.slate}
              title="Shorter and more specific is the direction of travel. Under 60 words reads aloud well." />
            <Pill text={r.assembled_is_custom ? 'Edited by hand' : 'Assembled from the parts'} tone={r.assembled_is_custom ? C.cyan : C.slate} />
            {canManage && (
              <button type="button" style={btn(C.cyan)} onClick={rebuild} title="Replace the wording with a fresh compose from the four parts">
                Rebuild from parts
              </button>
            )}
          </div>
        </div>
        {canManage ? (
          <textarea
            aria-label="The proposition written as one thing you could say out loud"
            style={{ ...inputStyle, minHeight: 92, resize: 'vertical', fontSize: '0.92rem', lineHeight: 1.5 }}
            value={shown}
            placeholder="Fill the four parts above and this writes itself. Then edit it into their language."
            onChange={(e) => editAssembled(e.target.value)}
          />
        ) : (
          <div style={{ fontSize: '0.92rem', color: C.navy, lineHeight: 1.55 }}>{shown || 'Not written yet.'}</div>
        )}
        {stale && (
          <div style={{ ...LABEL, color: C.amber, marginTop: 6 }}>
            The four parts have changed since this wording was edited. Rebuild from parts to take the change, or leave it as it stands.
          </div>
        )}
      </div>

      {/* Test log */}
      <div style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ ...H('0.98rem') }}>Test log</div>
            <div style={{ fontSize: '0.8rem', color: C.slate, marginTop: 2 }}>
              Who heard it, what they actually said, and what changed because of it. A test that
              changed nothing is a test that taught nothing.
            </div>
          </div>
          {canManage && <button type="button" style={btn(C.green)} onClick={() => addTest(r.id)}>Log a test</button>}
        </div>

        {tests.length === 0 ? (
          <div style={{ color: C.slate, fontSize: '0.83rem', fontStyle: 'italic', marginTop: 8 }}>
            Not tested with anyone yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 140 }}>Tested with</th>
                  <th style={{ ...th, width: 130 }}>Their role</th>
                  <th style={{ ...th, width: 130 }}>Date</th>
                  <th style={{ ...th, minWidth: 200 }}>Their reaction</th>
                  <th style={{ ...th, minWidth: 200 }}>What changed</th>
                  {canManage && <th style={{ ...th, width: 40 }}></th>}
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.id}>
                    <td style={td}>
                      {canManage ? (
                        <input aria-label="Name and organisation" style={inputStyle} value={t.tested_with || ''} placeholder="Name and organisation"
                          onChange={(e) => patchTest(t.id, { tested_with: e.target.value })} />
                      ) : (t.tested_with || '-')}
                    </td>
                    <td style={td}>
                      {canManage ? (
                        <input aria-label="Role" style={inputStyle} value={t.tested_with_role || ''} placeholder="Role"
                          onChange={(e) => patchTest(t.id, { tested_with_role: e.target.value })} />
                      ) : (t.tested_with_role || '-')}
                    </td>
                    <td style={td}>
                      {canManage ? (
                        <input aria-label="Date tested" type="date" style={{ ...inputStyle, fontFamily: 'var(--cv-font-mono)' }} value={t.tested_on || ''}
                          onChange={(e) => patchTest(t.id, { tested_on: e.target.value || null })} />
                      ) : (t.tested_on || '-')}
                    </td>
                    <td style={td}>
                      {canManage ? (
                        <textarea aria-label="What they said or did" style={{ ...inputStyle, minHeight: 54, resize: 'vertical' }} value={t.reaction || ''}
                          placeholder="What they said or did"
                          onChange={(e) => patchTest(t.id, { reaction: e.target.value })} />
                      ) : (t.reaction || '-')}
                    </td>
                    <td style={td}>
                      {canManage ? (
                        <textarea aria-label="What you changed in the proposition" style={{ ...inputStyle, minHeight: 54, resize: 'vertical' }} value={t.what_changed || ''}
                          placeholder="What you changed in the proposition"
                          onChange={(e) => patchTest(t.id, { what_changed: e.target.value })} />
                      ) : (t.what_changed || '-')}
                      {!txt(t.what_changed) && txt(t.reaction) && (
                        <div style={{ ...LABEL, color: C.amber, marginTop: 3 }}>Nothing changed yet</div>
                      )}
                    </td>
                    {canManage && (
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button type="button" style={btn(C.red)} onClick={() => removeTest(t)} title="Delete this test entry">x</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canManage && (
          <div style={{ fontSize: '0.8rem', color: C.slate, marginTop: 8, lineHeight: 1.45 }}>
            Notes on this proposition:
          </div>
        )}
        {canManage ? (
          <textarea aria-label="Anything the next person needs to know" style={{ ...inputStyle, minHeight: 54, resize: 'vertical', marginTop: 4 }} value={r.notes || ''}
            placeholder="Anything the next person needs to know"
            onChange={(e) => patch(r.id, { notes: e.target.value })} />
        ) : (
          r.notes ? <div style={{ fontSize: '0.83rem', color: C.slate, marginTop: 8 }}>{r.notes}</div> : null
        )}
      </div>
    </div>
  )
}
