// @ts-nocheck
'use client'
// ============================================================
// PHASE 0 WORKSPACE -- the five tools of "clear the ground", in the order
// the method uses them:
//
//   1. Assumption Dump Canvas       -> gtcv_assumptions
//   2. Problem Owner Budget Matrix  -> gtcv_problem_owner_budget
//   3. Hypothesis Shortlist Board   -> gtcv_hypotheses_shortlist
//   4. Signal vs Story Board        -> gtcv_signal_story
//   5. Continue / Pause / Kill      -> gtcv_continue_pause_kill
//
// Tables created in
// supabase/migrations/2026_08_09_gtcv_dp_tables_d.sql.
//
// The method rules are visible in the surface, not hidden in a document:
//   * Tool 2 shows the pause warning on any row with no budget holder named.
//     You cannot sell a problem nobody has money for.
//   * Tool 3 totals the four scores and marks who is in the top 3 to 5, the
//     only hypotheses allowed to advance out of Phase 0.
//   * Tool 5 carries a summary strip, because every activity must land
//     somewhere with a rationale and a destination gate.
//
// Editing model: typing changes local state only, and the row is written to
// Supabase when the field loses focus (or immediately for a dropdown or a
// checkbox). The save indicator at the top reports the state of the last
// write. When canManage is false everything renders read only.
//
// Client agnostic: the only client input is the clientId prop.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Shared style vocabulary (matches the coach dashboard) ───
const C = {
  navy: 'var(--cv-navy)', slate: 'var(--cv-slate)', faint: 'var(--cv-faint)',
  card: 'var(--cv-card)', alt: 'var(--cv-alt)', border: 'var(--cv-border)',
  borderSoft: 'var(--cv-border-soft)', header: 'var(--cv-header)',
  cyan: 'var(--cv-cyan)', teal: 'var(--cv-teal)', green: 'var(--cv-green)',
  amber: 'var(--cv-amber)', red: 'var(--cv-red)', purple: 'var(--cv-purple)',
  tintAmber: 'var(--cv-tint-amber)', tintGreen: 'var(--cv-tint-green)',
  tintRed: 'var(--cv-tint-red)', tintCyan: 'var(--cv-tint-cyan)',
  disabled: 'var(--cv-disabled)', bg2: 'var(--cv-bg-2)',
}

const wrap = { fontFamily: "'Segoe UI',system-ui,-apple-system,sans-serif", color: C.navy }
const card = { background: C.card, border: `1px solid ${C.borderSoft}`, borderRadius: 14, marginBottom: '1.25rem', boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)', overflow: 'hidden' }
const cardHead = { background: C.header, color: 'var(--cv-on-accent)', padding: '0.85rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }
const cardBody = { padding: '1.1rem 1.2rem 1.3rem' }
const toolNo = { fontFamily: 'monospace', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--cv-wa-75)' }
const toolTitle = { fontFamily: 'Georgia,serif', fontSize: '1.12rem', fontWeight: 700 }
const purpose = { fontSize: '0.95rem', color: C.slate, lineHeight: 1.45, marginBottom: '0.9rem' }
const tableWrap = { overflowX: 'auto' }
const table = { width: '100%', borderCollapse: 'collapse', fontSize: '0.93rem', minWidth: 860 }
const th = { padding: '0.45rem 0.55rem', textAlign: 'left', fontFamily: 'monospace', fontSize: '0.76rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.slate, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
const td = { padding: '0.4rem 0.4rem', verticalAlign: 'top', borderBottom: `1px solid ${C.borderSoft}` }
const cellInput = { width: '100%', minWidth: 120, padding: '0.4rem 0.5rem', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: '0.93rem', fontFamily: 'inherit', background: C.bg2, color: C.navy, boxSizing: 'border-box', resize: 'vertical' }
const roInput = { ...cellInput, background: C.disabled, cursor: 'default' }
const selectStyle = { ...cellInput, minWidth: 108 }
const addButton = { fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 700, border: 'none', borderRadius: 6, background: 'var(--cv-cyan)', color: 'var(--cv-on-accent)', padding: '0.4rem 0.9rem', cursor: 'pointer' }
const delButton = { fontFamily: 'monospace', fontSize: '0.85rem', border: `1px solid ${C.border}`, borderRadius: 6, background: 'transparent', color: C.red, padding: '0.28rem 0.55rem', cursor: 'pointer' }
const emptyNote = { fontSize: '0.93rem', color: C.faint, padding: '0.7rem 0' }
const strip = { display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.85rem' }

function pill(bg, fg) {
  return { fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.04em', padding: '0.22rem 0.6rem', borderRadius: 999, background: bg, color: fg, display: 'inline-block', whiteSpace: 'nowrap' }
}
function noteBox(border, bg) {
  return { border: `1px solid ${border}`, background: bg, borderRadius: 8, padding: '0.6rem 0.8rem', fontSize: '0.9rem', color: C.navy, lineHeight: 1.45 }
}

// ─── Method content (fixed IP, identical for every engagement) ───
const DESTINATION_OPTIONS = [
  { id: '', label: 'No destination yet' },
  { id: 'dp01', label: 'DP01 Service Reality Audit' },
  { id: 'dp02', label: 'DP02 Customer and Problem Clarity' },
  { id: 'dp03', label: 'DP03 Value Proposition' },
  { id: 'dp04', label: 'DP04 Commercial Viability' },
  { id: 'dp05', label: 'DP05 Market Entry' },
  { id: 'dp06', label: 'DP06 Identity and Partners' },
  { id: 'dp07', label: 'DP07 Pilot and Learn' },
  { id: 'dp08', label: 'DP08 Scale Pathway' },
  { id: 'dp09', label: 'DP09 Commercial Readiness' },
]

const DECISIONS = [
  { id: 'undecided', label: 'Not landed', color: C.faint },
  { id: 'continue', label: 'Continue', color: C.green },
  { id: 'pause', label: 'Pause', color: C.amber },
  { id: 'kill', label: 'Kill', color: C.red },
]
const decisionMeta = (id) => DECISIONS.find((d) => d.id === id) || DECISIONS[0]

const CLASSIFICATIONS = [
  { id: 'unclassified', label: 'Not classified', color: C.faint },
  { id: 'signal', label: 'Signal', color: C.green },
  { id: 'story', label: 'Story', color: C.purple },
]
const classificationMeta = (id) => CLASSIFICATIONS.find((c) => c.id === id) || CLASSIFICATIONS[0]

const SCORE_FIELDS = [
  { key: 'urgency', label: 'Urgency' },
  { key: 'ownership_clarity', label: 'Ownership clarity' },
  { key: 'willingness_to_pay', label: 'Willingness to pay' },
  { key: 'access', label: 'Access' },
]

// The board advances the top 3 to 5 only. Rank 1 to 3 advance; rank 4 and 5
// advance only if there is capacity to carry them; everything below is held.
const ADVANCE_FLOOR = 3
const ADVANCE_CEILING = 5

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const blank = (v) => !String(v ?? '').trim()

// ─── Small building blocks ───────────────────────────────────
function TextCell({ value, onCommit, canManage, placeholder, rows = 2 }) {
  const [local, setLocal] = useState(value ?? '')
  useEffect(() => { setLocal(value ?? '') }, [value])
  if (!canManage) {
    return <div style={{ ...roInput, minHeight: 34, whiteSpace: 'pre-wrap' }}>{local || <span style={{ color: C.faint }}>Not filled in</span>}</div>
  }
  return (
    <textarea
      style={cellInput}
      rows={rows}
      placeholder={placeholder}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if ((value ?? '') !== local) onCommit(local) }}
    />
  )
}

function SaveIndicator({ state, message }) {
  const map = {
    idle: { text: 'All changes saved', color: C.faint },
    loading: { text: 'Loading', color: C.faint },
    saving: { text: 'Saving', color: C.amber },
    saved: { text: 'Saved', color: C.green },
    error: { text: message || 'Could not save', color: C.red },
  }
  const m = map[state] || map.idle
  return (
    <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: m.color, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
      {m.text}
    </span>
  )
}

function Section({ number, title, question, purposeText, children, right }) {
  return (
    <section style={card}>
      <div style={cardHead}>
        <div>
          <div style={toolNo}>Tool {number}</div>
          <div style={toolTitle}>{title}</div>
        </div>
        {right || null}
      </div>
      <div style={cardBody}>
        <div style={purpose}>
          <em style={{ color: C.navy }}>{question}</em>
          <br />
          {purposeText}
        </div>
        {children}
      </div>
    </section>
  )
}

// ─── The workspace ───────────────────────────────────────────
export default function PhaseZeroWorkspace({ clientId, canManage }) {
  const editable = !!canManage
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [saveState, setSaveState] = useState('loading')
  const [saveMessage, setSaveMessage] = useState(null)

  const [assumptions, setAssumptions] = useState([])
  const [owners, setOwners] = useState([])
  const [hypotheses, setHypotheses] = useState([])
  const [signals, setSignals] = useState([])
  const [decisions, setDecisions] = useState([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!clientId) { setLoading(false); return }
      setLoading(true)
      setSaveState('loading')
      const order = (q) => q.eq('client_id', clientId).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
      const [a, o, h, s, d] = await Promise.all([
        order(supabase.from('gtcv_assumptions').select('*')),
        order(supabase.from('gtcv_problem_owner_budget').select('*')),
        order(supabase.from('gtcv_hypotheses_shortlist').select('*')),
        order(supabase.from('gtcv_signal_story').select('*')),
        order(supabase.from('gtcv_continue_pause_kill').select('*')),
      ])
      if (cancelled) return
      const firstError = a.error || o.error || h.error || s.error || d.error
      if (firstError) setLoadError(firstError.message)
      setAssumptions(a.data || [])
      setOwners(o.data || [])
      setHypotheses(h.data || [])
      setSignals(s.data || [])
      setDecisions(d.data || [])
      setLoading(false)
      setSaveState('idle')
    }
    load().catch((e) => { if (!cancelled) { setLoadError(e?.message || 'Could not load Phase 0'); setLoading(false); setSaveState('idle') } })
    return () => { cancelled = true }
  }, [clientId])

  // One write path for every table, so the save indicator is always honest.
  const persist = useCallback(async (tableName, id, patch) => {
    setSaveState('saving')
    setSaveMessage(null)
    const { error } = await supabase
      .from(tableName)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { setSaveState('error'); setSaveMessage(error.message); return false }
    setSaveState('saved')
    return true
  }, [])

  const makeUpdater = (tableName, setRows) => (id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    persist(tableName, id, patch)
  }

  const makeAdder = (tableName, rows, setRows, defaults) => async () => {
    setSaveState('saving')
    setSaveMessage(null)
    const row = { client_id: clientId, sort_order: rows.length, ...defaults }
    const { data, error } = await supabase.from(tableName).insert([row]).select().single()
    if (error) { setSaveState('error'); setSaveMessage(error.message); return }
    setRows((prev) => [...prev, data])
    setSaveState('saved')
  }

  const makeRemover = (tableName, setRows) => async (id) => {
    setSaveState('saving')
    setSaveMessage(null)
    const { error } = await supabase.from(tableName).delete().eq('id', id)
    if (error) { setSaveState('error'); setSaveMessage(error.message); return }
    setRows((prev) => prev.filter((r) => r.id !== id))
    setSaveState('saved')
  }

  const updAssumption = makeUpdater('gtcv_assumptions', setAssumptions)
  const updOwner = makeUpdater('gtcv_problem_owner_budget', setOwners)
  const updHypothesis = makeUpdater('gtcv_hypotheses_shortlist', setHypotheses)
  const updSignal = makeUpdater('gtcv_signal_story', setSignals)
  const updDecision = makeUpdater('gtcv_continue_pause_kill', setDecisions)

  const addAssumption = makeAdder('gtcv_assumptions', assumptions, setAssumptions, {})
  const addOwner = makeAdder('gtcv_problem_owner_budget', owners, setOwners, {})
  const addHypothesis = makeAdder('gtcv_hypotheses_shortlist', hypotheses, setHypotheses, { urgency: 0, ownership_clarity: 0, willingness_to_pay: 0, access: 0, advances: false })
  const addSignal = makeAdder('gtcv_signal_story', signals, setSignals, { classification: 'unclassified' })
  const addDecision = makeAdder('gtcv_continue_pause_kill', decisions, setDecisions, { decision: 'undecided' })

  const delAssumption = makeRemover('gtcv_assumptions', setAssumptions)
  const delOwner = makeRemover('gtcv_problem_owner_budget', setOwners)
  const delHypothesis = makeRemover('gtcv_hypotheses_shortlist', setHypotheses)
  const delSignal = makeRemover('gtcv_signal_story', setSignals)
  const delDecision = makeRemover('gtcv_continue_pause_kill', setDecisions)

  // Tool 2: the rule. A problem with no named budget holder is paused.
  const unfundedProblems = useMemo(
    () => owners.filter((r) => blank(r.budget_holder)).length,
    [owners],
  )

  // Tool 3: auto total, and the rank that decides who advances.
  const scoredHypotheses = useMemo(() => {
    const withTotals = hypotheses.map((r) => ({
      ...r,
      total: num(r.urgency) + num(r.ownership_clarity) + num(r.willingness_to_pay) + num(r.access),
    }))
    const ranked = [...withTotals].sort((a, b) => b.total - a.total)
    const rankById = new Map()
    ranked.forEach((r, i) => rankById.set(r.id, i + 1))
    return withTotals.map((r) => {
      const rank = rankById.get(r.id)
      const scored = r.total > 0
      return {
        ...r,
        rank,
        // Only a scored hypothesis can hold a shortlist place.
        inTopThree: scored && rank <= ADVANCE_FLOOR,
        inTopFive: scored && rank <= ADVANCE_CEILING,
      }
    })
  }, [hypotheses])
  const shortlistCount = scoredHypotheses.filter((r) => r.inTopFive).length

  // Tool 4: how much of what the room believes is actually observed.
  const signalCount = signals.filter((r) => r.classification === 'signal').length
  const storyCount = signals.filter((r) => r.classification === 'story').length
  const unclassifiedCount = signals.filter((r) => r.classification !== 'signal' && r.classification !== 'story').length

  // Tool 5: the summary strip. Every activity must land somewhere, with a
  // rationale and a destination.
  const decisionSummary = useMemo(() => {
    const counts = { continue: 0, pause: 0, kill: 0, undecided: 0 }
    let missingRationale = 0
    let missingDestination = 0
    decisions.forEach((r) => {
      const key = ['continue', 'pause', 'kill'].includes(r.decision) ? r.decision : 'undecided'
      counts[key] += 1
      if (blank(r.rationale)) missingRationale += 1
      if (key !== 'kill' && blank(r.destination_dp)) missingDestination += 1
    })
    return { counts, missingRationale, missingDestination, total: decisions.length }
  }, [decisions])

  if (!clientId) {
    return <div style={{ ...wrap, ...emptyNote }}>Select an engagement to open its Phase 0 workspace.</div>
  }
  if (loading) {
    return <div style={{ ...wrap, ...emptyNote }}>Loading the Phase 0 workspace...</div>
  }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: C.teal }}>Phase 0</div>
          <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.45rem', fontWeight: 700 }}>Clear the ground</div>
          <div style={{ fontSize: '0.95rem', color: C.slate, maxWidth: '68ch', marginTop: '0.25rem' }}>
            Five tools, used in order. Strip the activity back to what is actually true, find out who has the
            money, shortlist the few problems worth testing, separate what was observed from what is believed,
            and decide what continues, pauses or stops before any gate work begins.
          </div>
        </div>
        <SaveIndicator state={saveState} message={saveMessage} />
      </div>

      {loadError && (
        <div style={{ ...noteBox(C.red, C.tintRed), marginBottom: '1rem' }}>
          Some Phase 0 data could not be loaded: {loadError}
        </div>
      )}
      {!editable && (
        <div style={{ ...noteBox(C.border, C.alt), marginBottom: '1rem' }}>
          Read only. You can see the Phase 0 work but not change it.
        </div>
      )}

      {/* ─── TOOL 1: Assumption Dump Canvas ─────────────────── */}
      <Section
        number={1}
        title="Assumption Dump Canvas"
        question="What are we already doing, and what has to be true for it to work?"
        purposeText="List every activity the organisation runs. For each one, name what it delivers, who pays for it today, the assumption sitting underneath it, and what evidence would prove that assumption wrong."
        right={editable ? <button type="button" style={addButton} onClick={addAssumption}>+ Add activity</button> : null}
      >
        {assumptions.length === 0 ? (
          <div style={emptyNote}>No activities listed yet.</div>
        ) : (
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={{ ...th, width: '18%' }}>Activity</th>
                  <th style={{ ...th, width: '18%' }}>What it delivers</th>
                  <th style={{ ...th, width: '15%' }}>Who pays</th>
                  <th style={{ ...th, width: '22%' }}>Assumption underneath</th>
                  <th style={{ ...th, width: '22%' }}>What would prove it wrong</th>
                  {editable && <th style={{ ...th, width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {assumptions.map((r) => (
                  <tr key={r.id}>
                    <td style={td}><TextCell value={r.activity} canManage={editable} placeholder="The activity" onCommit={(v) => updAssumption(r.id, { activity: v })} /></td>
                    <td style={td}><TextCell value={r.delivers} canManage={editable} placeholder="What it actually delivers" onCommit={(v) => updAssumption(r.id, { delivers: v })} /></td>
                    <td style={td}><TextCell value={r.who_pays} canManage={editable} placeholder="Who pays for it now" onCommit={(v) => updAssumption(r.id, { who_pays: v })} /></td>
                    <td style={td}><TextCell value={r.assumption} canManage={editable} placeholder="What has to be true" onCommit={(v) => updAssumption(r.id, { assumption: v })} /></td>
                    <td style={td}><TextCell value={r.disproof} canManage={editable} placeholder="Evidence that would kill it" onCommit={(v) => updAssumption(r.id, { disproof: v })} /></td>
                    {editable && <td style={td}><button type="button" style={delButton} title="Delete this row" onClick={() => delAssumption(r.id)}>Delete</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ─── TOOL 2: Problem Owner Budget Matrix ────────────── */}
      <Section
        number={2}
        title="Problem Owner Budget Matrix"
        question="Who has this problem, and who controls the money to fix it?"
        purposeText="For each problem implied by the activity above, name who experiences it, who is accountable for it, who controls the budget, what it costs them not to solve it, and the mechanism through which money would actually be released."
        right={editable ? <button type="button" style={addButton} onClick={addOwner}>+ Add problem</button> : null}
      >
        <div style={strip}>
          <span style={pill(C.tintCyan, C.navy)}>{owners.length} problem{owners.length === 1 ? '' : 's'}</span>
          {unfundedProblems > 0 && (
            <span style={pill(C.amber, 'var(--cv-on-accent)')}>{unfundedProblems} with no budget holder</span>
          )}
        </div>
        {unfundedProblems > 0 && (
          <div style={{ ...noteBox(C.amber, C.tintAmber), marginBottom: '0.9rem' }}>
            <strong>Rule:</strong> if you cannot name a budget holder, pause the problem. {unfundedProblems} row
            {unfundedProblems === 1 ? ' has' : 's have'} no budget holder named, so {unfundedProblems === 1 ? 'it is' : 'they are'} not
            ready to carry into a hypothesis.
          </div>
        )}
        {owners.length === 0 ? (
          <div style={emptyNote}>No problems listed yet.</div>
        ) : (
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={{ ...th, width: '20%' }}>Problem implied</th>
                  <th style={{ ...th, width: '14%' }}>Who experiences it</th>
                  <th style={{ ...th, width: '14%' }}>Who is accountable</th>
                  <th style={{ ...th, width: '18%' }}>Who controls the budget</th>
                  <th style={{ ...th, width: '17%' }}>Cost of not solving it</th>
                  <th style={{ ...th, width: '17%' }}>Budget mechanism</th>
                  {editable && <th style={{ ...th, width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {owners.map((r) => {
                  const noHolder = blank(r.budget_holder)
                  return (
                    <tr key={r.id} style={noHolder ? { background: C.tintAmber } : undefined}>
                      <td style={td}><TextCell value={r.problem} canManage={editable} placeholder="The problem" onCommit={(v) => updOwner(r.id, { problem: v })} /></td>
                      <td style={td}><TextCell value={r.experienced_by} canManage={editable} placeholder="Who feels it" onCommit={(v) => updOwner(r.id, { experienced_by: v })} /></td>
                      <td style={td}><TextCell value={r.accountable} canManage={editable} placeholder="Who answers for it" onCommit={(v) => updOwner(r.id, { accountable: v })} /></td>
                      <td style={td}>
                        <TextCell value={r.budget_holder} canManage={editable} placeholder="Name the budget holder" onCommit={(v) => updOwner(r.id, { budget_holder: v })} />
                        {noHolder && (
                          <div style={{ marginTop: '0.35rem', fontSize: '0.82rem', color: C.amber, fontWeight: 600, lineHeight: 1.35 }}>
                            No budget holder named. Pause this problem until you can say who releases the money.
                          </div>
                        )}
                      </td>
                      <td style={td}><TextCell value={r.cost_of_not_solving} canManage={editable} placeholder="What it costs them to leave it" onCommit={(v) => updOwner(r.id, { cost_of_not_solving: v })} /></td>
                      <td style={td}><TextCell value={r.budget_mechanism} canManage={editable} placeholder="How the money is released" onCommit={(v) => updOwner(r.id, { budget_mechanism: v })} /></td>
                      {editable && <td style={td}><button type="button" style={delButton} title="Delete this row" onClick={() => delOwner(r.id)}>Delete</button></td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ─── TOOL 3: Hypothesis Shortlist Board ─────────────── */}
      <Section
        number={3}
        title="Hypothesis Shortlist Board"
        question="Which of these are worth testing, and which are we carrying out of habit?"
        purposeText="Score each emerging hypothesis 1 to 5 on Urgency, Ownership clarity, Willingness to pay and Access. The total is out of 20. Only the top 3 to 5 advance out of Phase 0."
        right={editable ? <button type="button" style={addButton} onClick={addHypothesis}>+ Add hypothesis</button> : null}
      >
        <div style={strip}>
          <span style={pill(C.tintCyan, C.navy)}>{hypotheses.length} on the board</span>
          <span style={pill(shortlistCount > 0 ? C.green : C.faint, 'var(--cv-on-accent)')}>{shortlistCount} in the shortlist</span>
          {hypotheses.length - shortlistCount > 0 && (
            <span style={pill(C.tintAmber, C.navy)}>{hypotheses.length - shortlistCount} held back</span>
          )}
        </div>
        {hypotheses.length === 0 ? (
          <div style={emptyNote}>No hypotheses on the board yet.</div>
        ) : (
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={{ ...th, width: '30%' }}>Hypothesis</th>
                  {SCORE_FIELDS.map((f) => <th key={f.key} style={{ ...th, width: 96 }}>{f.label}</th>)}
                  <th style={{ ...th, width: 70 }}>Total</th>
                  <th style={{ ...th, width: 150 }}>Standing</th>
                  <th style={{ ...th, width: '18%' }}>Notes</th>
                  {editable && <th style={{ ...th, width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {scoredHypotheses.map((r) => {
                  const standing = !r.inTopFive
                    ? { label: 'Held back', color: C.faint }
                    : r.inTopThree
                      ? { label: `Advances (rank ${r.rank})`, color: C.green }
                      : { label: `Advances if capacity (rank ${r.rank})`, color: C.teal }
                  return (
                    <tr key={r.id} style={r.inTopFive ? { background: C.tintGreen } : undefined}>
                      <td style={td}><TextCell value={r.hypothesis} canManage={editable} placeholder="The hypothesis to test" onCommit={(v) => updHypothesis(r.id, { hypothesis: v })} /></td>
                      {SCORE_FIELDS.map((f) => (
                        <td key={f.key} style={td}>
                          {editable ? (
                            <select
                              style={{ ...selectStyle, minWidth: 70 }}
                              value={num(r[f.key])}
                              onChange={(e) => updHypothesis(r.id, { [f.key]: num(e.target.value) })}
                            >
                              <option value={0}>-</option>
                              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                          ) : (
                            <div style={{ ...roInput, minWidth: 60, textAlign: 'center' }}>{num(r[f.key]) || '-'}</div>
                          )}
                        </td>
                      ))}
                      <td style={{ ...td, fontFamily: 'Georgia,serif', fontSize: '1.15rem', fontWeight: 700, textAlign: 'center', color: C.navy }}>
                        {r.total}
                        <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: C.faint, fontWeight: 400 }}>of 20</div>
                      </td>
                      <td style={td}>
                        <span style={pill(standing.color, 'var(--cv-on-accent)')}>{standing.label}</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.4rem', fontSize: '0.82rem', color: C.slate }}>
                          <input
                            type="checkbox"
                            checked={!!r.advances}
                            disabled={!editable}
                            onChange={(e) => updHypothesis(r.id, { advances: e.target.checked })}
                          />
                          Confirmed to advance
                        </label>
                      </td>
                      <td style={td}><TextCell value={r.notes} canManage={editable} placeholder="Why this score" onCommit={(v) => updHypothesis(r.id, { notes: v })} /></td>
                      {editable && <td style={td}><button type="button" style={delButton} title="Delete this row" onClick={() => delHypothesis(r.id)}>Delete</button></td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ─── TOOL 4: Signal vs Story Board ──────────────────── */}
      <Section
        number={4}
        title="Signal vs Story Board"
        question="What did we actually see, and what are we telling ourselves?"
        purposeText="Split each statement in two. A signal is something observed: a behaviour, a payment, a refusal, a document. A story is believed but not observed. Only signals may carry weight in a hypothesis."
        right={editable ? <button type="button" style={addButton} onClick={addSignal}>+ Add item</button> : null}
      >
        <div style={strip}>
          <span style={pill(C.green, 'var(--cv-on-accent)')}>{signalCount} signal{signalCount === 1 ? '' : 's'}</span>
          <span style={pill(C.purple, 'var(--cv-on-accent)')}>{storyCount} stor{storyCount === 1 ? 'y' : 'ies'}</span>
          {unclassifiedCount > 0 && <span style={pill(C.tintAmber, C.navy)}>{unclassifiedCount} not classified</span>}
        </div>
        {signals.length === 0 ? (
          <div style={emptyNote}>Nothing on the board yet.</div>
        ) : (
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={{ ...th, width: '24%' }}>Statement</th>
                  <th style={{ ...th, width: '24%' }}>What was actually observed</th>
                  <th style={{ ...th, width: '24%' }}>What is believed but not observed</th>
                  <th style={{ ...th, width: 140 }}>Classification</th>
                  <th style={{ ...th, width: '14%' }}>Source</th>
                  {editable && <th style={{ ...th, width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {signals.map((r) => {
                  const meta = classificationMeta(r.classification)
                  return (
                    <tr key={r.id}>
                      <td style={td}><TextCell value={r.item} canManage={editable} placeholder="The claim or statement" onCommit={(v) => updSignal(r.id, { item: v })} /></td>
                      <td style={td}><TextCell value={r.observed} canManage={editable} placeholder="Observed behaviour or evidence" onCommit={(v) => updSignal(r.id, { observed: v })} /></td>
                      <td style={td}><TextCell value={r.believed} canManage={editable} placeholder="Belief with no observation behind it" onCommit={(v) => updSignal(r.id, { believed: v })} /></td>
                      <td style={td}>
                        {editable ? (
                          <select style={selectStyle} value={r.classification || 'unclassified'} onChange={(e) => updSignal(r.id, { classification: e.target.value })}>
                            {CLASSIFICATIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                          </select>
                        ) : (
                          <span style={pill(meta.color, 'var(--cv-on-accent)')}>{meta.label}</span>
                        )}
                      </td>
                      <td style={td}><TextCell value={r.source} canManage={editable} placeholder="Who said it, where" onCommit={(v) => updSignal(r.id, { source: v })} /></td>
                      {editable && <td style={td}><button type="button" style={delButton} title="Delete this row" onClick={() => delSignal(r.id)}>Delete</button></td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ─── TOOL 5: Continue / Pause / Kill Table ──────────── */}
      <Section
        number={5}
        title="Continue / Pause / Kill Table"
        question="What continues, what pauses, and what stops here?"
        purposeText="Every activity must land somewhere. Give each one a decision, a one sentence rationale, and the decision point it travels to next. An activity with no landing is unfinished Phase 0 work."
        right={editable ? <button type="button" style={addButton} onClick={addDecision}>+ Add activity</button> : null}
      >
        <div style={strip}>
          <span style={pill(C.green, 'var(--cv-on-accent)')}>{decisionSummary.counts.continue} continue</span>
          <span style={pill(C.amber, 'var(--cv-on-accent)')}>{decisionSummary.counts.pause} pause</span>
          <span style={pill(C.red, 'var(--cv-on-accent)')}>{decisionSummary.counts.kill} kill</span>
          <span style={pill(decisionSummary.counts.undecided > 0 ? C.tintAmber : C.alt, C.navy)}>{decisionSummary.counts.undecided} not landed</span>
        </div>
        {(decisionSummary.counts.undecided > 0 || decisionSummary.missingRationale > 0 || decisionSummary.missingDestination > 0) && (
          <div style={{ ...noteBox(C.amber, C.tintAmber), marginBottom: '0.9rem' }}>
            <strong>Phase 0 is not closed yet.</strong>
            <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
              {decisionSummary.counts.undecided > 0 && <li>{decisionSummary.counts.undecided} activit{decisionSummary.counts.undecided === 1 ? 'y has' : 'ies have'} no decision.</li>}
              {decisionSummary.missingRationale > 0 && <li>{decisionSummary.missingRationale} row{decisionSummary.missingRationale === 1 ? '' : 's'} without a one sentence rationale.</li>}
              {decisionSummary.missingDestination > 0 && <li>{decisionSummary.missingDestination} row{decisionSummary.missingDestination === 1 ? '' : 's'} continuing or paused with no destination decision point.</li>}
            </ul>
          </div>
        )}
        {decisionSummary.total > 0 && decisionSummary.counts.undecided === 0 && decisionSummary.missingRationale === 0 && decisionSummary.missingDestination === 0 && (
          <div style={{ ...noteBox(C.green, C.tintGreen), marginBottom: '0.9rem' }}>
            Every activity has landed with a rationale and a destination. Phase 0 is ready to close.
          </div>
        )}
        {decisions.length === 0 ? (
          <div style={emptyNote}>No activities landed yet.</div>
        ) : (
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={{ ...th, width: '26%' }}>Activity</th>
                  <th style={{ ...th, width: 140 }}>Decision</th>
                  <th style={{ ...th, width: '34%' }}>Rationale, one sentence</th>
                  <th style={{ ...th, width: 220 }}>Destination decision point</th>
                  {editable && <th style={{ ...th, width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {decisions.map((r) => {
                  const meta = decisionMeta(r.decision)
                  const isKill = r.decision === 'kill'
                  return (
                    <tr key={r.id}>
                      <td style={td}><TextCell value={r.activity} canManage={editable} placeholder="The activity" onCommit={(v) => updDecision(r.id, { activity: v })} /></td>
                      <td style={td}>
                        {editable ? (
                          <select style={selectStyle} value={r.decision || 'undecided'} onChange={(e) => updDecision(r.id, { decision: e.target.value })}>
                            {DECISIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                          </select>
                        ) : (
                          <span style={pill(meta.color, 'var(--cv-on-accent)')}>{meta.label}</span>
                        )}
                      </td>
                      <td style={td}>
                        <TextCell value={r.rationale} canManage={editable} placeholder="Why it lands there" onCommit={(v) => updDecision(r.id, { rationale: v })} />
                        {blank(r.rationale) && (
                          <div style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: C.amber, fontWeight: 600 }}>A rationale is required before this row counts as landed.</div>
                        )}
                      </td>
                      <td style={td}>
                        {editable ? (
                          <select style={{ ...selectStyle, minWidth: 200 }} value={r.destination_dp || ''} onChange={(e) => updDecision(r.id, { destination_dp: e.target.value || null })}>
                            {DESTINATION_OPTIONS.map((o) => <option key={o.id || 'none'} value={o.id}>{o.label}</option>)}
                          </select>
                        ) : (
                          <div style={{ ...roInput, minWidth: 160 }}>
                            {(DESTINATION_OPTIONS.find((o) => o.id === (r.destination_dp || '')) || DESTINATION_OPTIONS[0]).label}
                          </div>
                        )}
                        {!isKill && blank(r.destination_dp) && (
                          <div style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: C.amber, fontWeight: 600 }}>Name the gate this travels to.</div>
                        )}
                      </td>
                      {editable && <td style={td}><button type="button" style={delButton} title="Delete this row" onClick={() => delDecision(r.id)}>Delete</button></td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}
