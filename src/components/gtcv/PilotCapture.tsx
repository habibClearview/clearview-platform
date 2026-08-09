// @ts-nocheck
'use client'
// ============================================================
// DP07 PILOT CAPTURE
//
// One record per pilot session. The method (GtCV handbook, DP07) runs the
// pilot as two iterations with two real paying clients each:
//
//   Iteration 1  the coach leads, the organisation observes
//   Iteration 2  the organisation leads, the coach is the backstop
//
// Every session is captured in three phases: the pre-session brief (the
// hypothesis being tested, the price tier offered, who leads, who observes),
// the live observation (the five dimensions, each with its own note, plus
// what the client actually said and the purchasing signals that surfaced),
// and the post-session debrief (was the close genuine or polite, viability
// 1 to 5, what surprised us, what revision is recommended).
//
// The five observation dimensions are fixed method IP: Engagement, Language,
// Resistance, Surprise, The Price Moment.
//
// The iteration comparison view puts iteration 1 and iteration 2 side by
// side on viability and key learning, which is the question DP07 actually
// answers: did the offer hold up when the organisation ran it themselves.
//
// Client agnostic: the paying clients are labelled per record, nothing is
// baked in. Table: gtcv_pilot_sessions (2026_08_09_gtcv_dp_tables_c.sql).
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const TABLE = 'gtcv_pilot_sessions'

// Two iterations, two real paying clients each. Both fixed by the method.
const ITERATIONS = [1, 2]
const CLIENT_SLOTS = [1, 2]

const ITERATION_RULE = {
  1: { leads: 'Coach leads', observes: 'Organisation observes', summary: 'Iteration 1: the coach leads the session and the organisation observes.' },
  2: { leads: 'Organisation leads', observes: 'Coach observes as backstop', summary: 'Iteration 2: the organisation leads the session and the coach is the backstop.' },
}

// The five observation dimensions. Fixed method IP, same for every pilot.
const DIMENSIONS = [
  { field: 'obs_engagement', label: 'Engagement', prompt: 'Where did they lean in, and where did attention drop away?' },
  { field: 'obs_language', label: 'Language', prompt: 'Which words did they use for the problem and for the offer?' },
  { field: 'obs_resistance', label: 'Resistance', prompt: 'What did they push back on, and how hard did they push?' },
  { field: 'obs_surprise', label: 'Surprise', prompt: 'What did they react to that you did not expect?' },
  { field: 'obs_price_moment', label: 'The Price Moment', prompt: 'What happened in the seconds after the price was said?' },
]

const CLOSES = [
  { value: 'genuine', label: 'Genuine close' },
  { value: 'polite', label: 'Polite close' },
  { value: 'none', label: 'No close' },
]
const closeLabel = (v) => (CLOSES.find((c) => c.value === v) || {}).label || 'Not recorded'

// ─── design tokens (mirror the coach dashboard) ──────────────
const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', white: 'var(--cv-card)',
  slate: 'var(--cv-slate)', border: 'var(--cv-border)', teal: 'var(--cv-teal)',
  red: 'var(--cv-red)', green: 'var(--cv-green)', amber: 'var(--cv-amber)',
  purple: 'var(--cv-purple)', alt: 'var(--cv-alt)',
}
const card = { background: C.white, border: '1px solid var(--cv-border-soft)', borderRadius: 14, padding: '1.25rem 1.4rem', marginBottom: '1.1rem', boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)' }
const secH = { fontFamily: 'Georgia,serif', fontSize: '1.25rem', fontWeight: 700, color: C.navy, margin: 0 }
const hint = { fontSize: '0.9rem', color: C.slate, lineHeight: 1.45 }
const mono = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' }
const lbl = { display: 'block', fontWeight: 600, fontSize: '0.86rem', marginBottom: '0.2rem', color: C.navy }
const inp = { width: '100%', padding: '0.36rem 0.55rem', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: '0.9rem', fontFamily: 'inherit', background: 'var(--cv-bg-2)', color: C.navy, boxSizing: 'border-box' }
const area = { ...inp, minHeight: 62, resize: 'vertical', lineHeight: 1.4 }
const btn = (col) => ({ ...mono, fontSize: '0.86rem', fontWeight: 600, padding: '0.4rem 0.85rem', border: `1px solid ${col}`, borderRadius: 7, background: 'transparent', color: col, cursor: 'pointer' })
const pill = (active, col) => ({ ...mono, fontSize: '0.84rem', padding: '0.35rem 0.75rem', borderRadius: 8, border: `1px solid ${active ? col : C.border}`, background: active ? col : 'transparent', color: active ? 'var(--cv-on-accent)' : C.slate, cursor: 'pointer', fontWeight: active ? 700 : 400, whiteSpace: 'nowrap' })
const phaseHead = (col) => ({ ...mono, fontSize: '0.76rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: col, fontWeight: 700, borderBottom: `1px solid ${C.border}`, paddingBottom: '0.3rem', marginBottom: '0.6rem' })
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '0.75rem' }

const today = () => new Date().toISOString().split('T')[0]
const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null)

// Everything the comparison view needs about one iteration.
function iterationStats(rows, iteration) {
  const list = rows.filter((r) => Number(r.iteration) === iteration)
  const scores = list.map((r) => Number(r.viability)).filter((n) => Number.isFinite(n) && n > 0)
  const clients = new Set(list.map((r) => Number(r.client_number)).filter((n) => n === 1 || n === 2))
  return {
    iteration,
    sessions: list.length,
    clientsCovered: clients.size,
    viability: avg(scores),
    genuine: list.filter((r) => r.close_type === 'genuine').length,
    polite: list.filter((r) => r.close_type === 'polite').length,
    revisions: list.filter((r) => (r.revision_recommended || '').trim()).length,
    learnings: list
      .map((r) => ({
        label: r.pilot_client_label || `Client ${r.client_number || '?'}`,
        text: (r.key_learning || r.what_surprised_us || r.revision_recommended || '').trim(),
      }))
      .filter((x) => x.text),
    rows: list,
  }
}

export default function PilotCapture({ clientId, canManage }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [save, setSave] = useState(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState('sessions')       // 'sessions' | 'comparison'
  const [filter, setFilter] = useState('all')        // 'all' | 1 | 2
  const [open, setOpen] = useState({})               // session id -> expanded

  const load = useCallback(async () => {
    if (!clientId) { setRows([]); setLoading(false); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from(TABLE).select('*').eq('client_id', clientId)
        .order('iteration', { ascending: true }).order('client_number', { ascending: true })
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
      if (error) {
        console.error('PilotCapture: load failed', error)
        setSave({ ok: false, text: 'Could not load the pilot records. What you can see may be out of date.' })
        return
      }
      setSave(null)
      setRows(data || [])
    } catch (e) {
      console.error('PilotCapture: load threw', e)
      setSave({ ok: false, text: 'Could not load the pilot records. What you can see may be out of date.' })
    } finally {
      // Every path, so a thrown request cannot leave this on Loading forever.
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { load() }, [load])

  const stamp = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  function edit(id, field, value) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  async function commit(id, patch) {
    if (!canManage) return
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    setSave({ ok: true, text: 'Saving' })
    const { error } = await supabase.from(TABLE)
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { setSave({ ok: false, text: `Could not save. ${error.message}. Nothing was lost, please try again.` }); return }
    setSave({ ok: true, text: `Saved at ${stamp()}` })
  }

  async function addSession(iteration, clientNumber) {
    if (!canManage || !clientId) return
    setBusy(true); setSave({ ok: true, text: 'Saving' })
    const rule = ITERATION_RULE[iteration]
    const nextOrder = rows.length ? Math.max(...rows.map((r) => Number(r.sort_order) || 0)) + 1 : 0
    const { data, error } = await supabase.from(TABLE).insert({
      client_id: clientId, sort_order: nextOrder,
      iteration, client_number: clientNumber,
      session_date: today(),
      who_leads: rule.leads, who_observes: rule.observes,
    }).select().single()
    setBusy(false)
    if (error) { setSave({ ok: false, text: `Could not add a session. ${error.message}` }); return }
    setRows((rs) => [...rs, data])
    setOpen((o) => ({ ...o, [data.id]: true }))
    setSave({ ok: true, text: `Saved at ${stamp()}` })
  }

  async function removeSession(row) {
    if (!canManage) return
    const who = row.session_title || row.pilot_client_label || `iteration ${row.iteration} session`
    if (!window.confirm(`Delete the record for ${who}? This cannot be undone.`)) return
    setBusy(true)
    const { error } = await supabase.from(TABLE).delete().eq('id', row.id)
    setBusy(false)
    if (error) { setSave({ ok: false, text: `Could not delete. ${error.message}` }); return }
    setRows((rs) => rs.filter((r) => r.id !== row.id))
    setSave({ ok: true, text: `Deleted at ${stamp()}` })
  }

  const i1 = useMemo(() => iterationStats(rows, 1), [rows])
  const i2 = useMemo(() => iterationStats(rows, 2), [rows])
  const shown = filter === 'all' ? rows : rows.filter((r) => Number(r.iteration) === filter)

  // Text field bound to local state, written on blur.
  const field = (row, name, placeholder, multiline) => {
    if (!canManage) {
      return <div style={{ ...hint, whiteSpace: 'pre-wrap', color: C.navy, minHeight: '1.2rem' }}>{row[name] || '-'}</div>
    }
    const props = {
      style: multiline ? area : inp,
      value: row[name] || '',
      placeholder,
      onChange: (e) => edit(row.id, name, e.target.value),
      onBlur: (e) => commit(row.id, { [name]: e.target.value || null }),
    }
    return multiline ? <textarea {...props} /> : <input {...props} />
  }

  // Rendered as a plain function call rather than a nested component so the
  // inputs keep focus while typing: a nested component would be a new
  // component type on every render and React would remount the subtree.
  function renderSession(r) {
    const rule = ITERATION_RULE[Number(r.iteration)] || ITERATION_RULE[1]
    const expanded = !!open[r.id]
    return (
      <div key={r.id} style={{ border: '1px solid var(--cv-border-soft)', borderRadius: 12, marginBottom: '0.8rem', background: 'var(--cv-bg-2)' }}>
        <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.7rem 0.9rem', borderLeft: `4px solid ${Number(r.iteration) === 2 ? C.purple : C.cyan}`, borderRadius: '12px 0 0 12px' }}>
          <button type="button" onClick={() => setOpen((o) => ({ ...o, [r.id]: !expanded }))}
            style={{ ...mono, border: 'none', background: 'transparent', color: C.navy, cursor: 'pointer', fontSize: '1rem', padding: '0 0.2rem' }}>
            {expanded ? 'v' : '>'}
          </button>
          <span style={{ ...mono, fontSize: '0.76rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 4, background: Number(r.iteration) === 2 ? C.purple : C.cyan, color: 'var(--cv-on-accent)' }}>
            ITERATION {r.iteration} / CLIENT {r.client_number}
          </span>
          <span style={{ fontFamily: 'Georgia,serif', fontWeight: 700, color: C.navy }}>
            {r.session_title || r.pilot_client_label || 'Untitled pilot session'}
          </span>
          <span style={{ ...mono, fontSize: '0.8rem', color: C.slate }}>{r.session_date || 'no date'}</span>
          <span style={{ ...mono, fontSize: '0.8rem', color: r.close_type === 'genuine' ? C.green : r.close_type === 'polite' ? C.amber : C.slate }}>
            {closeLabel(r.close_type)}
          </span>
          <span style={{ ...mono, fontSize: '0.8rem', color: C.slate }}>Viability {r.viability || '-'} of 5</span>
          {canManage && (
            <button type="button" title="Delete this session" disabled={busy} onClick={() => removeSession(r)}
              style={{ ...mono, marginLeft: 'auto', border: 'none', background: 'transparent', color: C.red, cursor: 'pointer', fontSize: '1rem' }}>x</button>
          )}
        </div>

        {expanded && (
          <div style={{ padding: '0.2rem 1rem 1rem' }}>
            {/* Identity of the session */}
            <div style={{ ...grid, marginBottom: '1rem' }}>
              <div>
                <label style={lbl}>Session title</label>
                {field(r, 'session_title', 'What this session was')}
              </div>
              <div>
                <label style={lbl}>Paying client</label>
                {field(r, 'pilot_client_label', 'The client this was run with')}
              </div>
              <div>
                <label style={lbl}>Date</label>
                {canManage
                  ? <input aria-label="Session date" type="date" style={inp} value={r.session_date || ''} onChange={(e) => commit(r.id, { session_date: e.target.value || null })} />
                  : <div style={{ ...hint, color: C.navy }}>{r.session_date || '-'}</div>}
              </div>
              <div>
                <label style={lbl}>Iteration</label>
                {canManage
                  ? <select aria-label="Pilot iteration" style={inp} value={Number(r.iteration) || 1} onChange={(e) => commit(r.id, { iteration: Number(e.target.value) })}>
                      {ITERATIONS.map((n) => <option key={n} value={n}>Iteration {n}</option>)}
                    </select>
                  : <div style={{ ...hint, color: C.navy }}>Iteration {r.iteration}</div>}
                <div style={{ ...hint, fontSize: '0.78rem', marginTop: '0.2rem' }}>{rule.summary}</div>
              </div>
              <div>
                <label style={lbl}>Paying client number</label>
                {canManage
                  ? <select aria-label="Which client" style={inp} value={Number(r.client_number) || 1} onChange={(e) => commit(r.id, { client_number: Number(e.target.value) })}>
                      {CLIENT_SLOTS.map((n) => <option key={n} value={n}>Client {n}</option>)}
                    </select>
                  : <div style={{ ...hint, color: C.navy }}>Client {r.client_number}</div>}
                <div style={{ ...hint, fontSize: '0.78rem', marginTop: '0.2rem' }}>Each iteration runs with two real paying clients.</div>
              </div>
            </div>

            {/* Phase 1 */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={phaseHead(C.cyan)}>Phase 1. Pre-session brief</div>
              <div style={grid}>
                <div>
                  <label style={lbl}>Hypothesis being tested</label>
                  {field(r, 'hypothesis', 'What this session is meant to prove or disprove', true)}
                </div>
                <div>
                  <label style={lbl}>Price tier offered</label>
                  {field(r, 'price_tier', 'The tier and the number quoted')}
                </div>
                <div>
                  <label style={lbl}>Who leads</label>
                  {field(r, 'who_leads', rule.leads)}
                  <div style={{ ...hint, fontSize: '0.78rem', marginTop: '0.2rem' }}>Method expects: {rule.leads}.</div>
                </div>
                <div>
                  <label style={lbl}>Who observes</label>
                  {field(r, 'who_observes', rule.observes)}
                  <div style={{ ...hint, fontSize: '0.78rem', marginTop: '0.2rem' }}>Method expects: {rule.observes}.</div>
                </div>
              </div>
            </div>

            {/* Phase 2 */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={phaseHead(C.teal)}>Phase 2. Live observation</div>
              <div style={grid}>
                {DIMENSIONS.map((d) => (
                  <div key={d.field}>
                    <label style={lbl}>{d.label}</label>
                    {field(r, d.field, d.prompt, true)}
                    <div style={{ ...hint, fontSize: '0.78rem', marginTop: '0.2rem' }}>{d.prompt}</div>
                  </div>
                ))}
              </div>
              <div style={{ ...grid, marginTop: '0.75rem' }}>
                <div>
                  <label style={lbl}>Verbatim client responses</label>
                  {field(r, 'verbatim_responses', 'Their exact words, not your summary of them', true)}
                </div>
                <div>
                  <label style={lbl}>Purchasing signals</label>
                  {field(r, 'purchasing_signals', 'Budget, timing, who else needs to agree, next step asked for', true)}
                </div>
              </div>
            </div>

            {/* Phase 3 */}
            <div>
              <div style={phaseHead(C.purple)}>Phase 3. Post-session debrief</div>
              <div style={grid}>
                <div>
                  <label style={lbl}>Close</label>
                  {canManage
                    ? <select aria-label="How the session closed" style={inp} value={r.close_type || ''} onChange={(e) => commit(r.id, { close_type: e.target.value || null })}>
                        <option value="">Not recorded</option>
                        {CLOSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    : <div style={{ ...hint, color: C.navy }}>{closeLabel(r.close_type)}</div>}
                  <div style={{ ...hint, fontSize: '0.78rem', marginTop: '0.2rem' }}>A genuine close commits to something. A polite close is agreement with no commitment.</div>
                </div>
                <div>
                  <label style={lbl}>Viability, 1 to 5</label>
                  {canManage
                    ? <select aria-label="Viability read" style={inp} value={r.viability || ''} onChange={(e) => commit(r.id, { viability: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">-</option>
                        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    : <div style={{ ...hint, color: C.navy }}>{r.viability || '-'}</div>}
                </div>
                <div>
                  <label style={lbl}>What surprised us</label>
                  {field(r, 'what_surprised_us', 'The thing you did not predict', true)}
                </div>
                <div>
                  <label style={lbl}>Revision recommended</label>
                  {field(r, 'revision_recommended', 'What changes before the next session', true)}
                </div>
                <div>
                  <label style={lbl}>Key learning</label>
                  {field(r, 'key_learning', 'The one sentence this session earned', true)}
                </div>
                <div>
                  <label style={lbl}>Other notes</label>
                  {field(r, 'notes', 'Anything else worth keeping', true)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  function renderComparisonColumn(s, accent) {
    return (
      <div key={s.iteration} style={{ background: 'var(--cv-bg-2)', border: '1px solid var(--cv-border-soft)', borderRadius: 12, borderTop: `3px solid ${accent}`, padding: '0.95rem 1.05rem' }}>
        <div style={{ ...mono, fontSize: '0.76rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: accent, fontWeight: 700 }}>Iteration {s.iteration}</div>
        <div style={{ ...hint, marginTop: '0.15rem' }}>{ITERATION_RULE[s.iteration].summary}</div>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: '2rem', fontWeight: 700, color: C.navy, marginTop: '0.5rem', lineHeight: 1.1 }}>
          {s.viability === null ? '-' : s.viability.toFixed(1)}
          <span style={{ fontSize: '0.9rem', color: C.slate, fontWeight: 400 }}> of 5 average viability</span>
        </div>
        <div style={{ ...hint, marginTop: '0.3rem' }}>
          {s.sessions} session{s.sessions === 1 ? '' : 's'} across {s.clientsCovered} of 2 paying clients
          <br />
          {s.genuine} genuine close{s.genuine === 1 ? '' : 's'}, {s.polite} polite
          <br />
          {s.revisions} session{s.revisions === 1 ? '' : 's'} recommending a revision
        </div>
        <div style={{ ...mono, fontSize: '0.74rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: C.slate, marginTop: '0.8rem', marginBottom: '0.3rem' }}>Key learning</div>
        {s.learnings.length === 0
          ? <div style={hint}>Nothing recorded yet.</div>
          : (
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {s.learnings.map((l, i) => (
                <li key={i} style={{ ...hint, marginBottom: '0.3rem' }}>
                  <b style={{ color: C.navy }}>{l.label}.</b> {l.text}
                </li>
              ))}
            </ul>
          )}
      </div>
    )
  }

  // The DP07 verdict in one line: did viability hold when the organisation
  // took the lead. That is what iteration 2 exists to answer.
  function comparisonVerdict() {
    if (i1.viability === null || i2.viability === null) {
      return { tone: C.slate, text: 'Both iterations need at least one scored session before they can be compared. Iteration 2 is the one that tells you whether the offer works without the coach holding it.' }
    }
    const delta = i2.viability - i1.viability
    if (delta >= 0) {
      return { tone: C.green, text: `Viability held when the organisation led: ${i2.viability.toFixed(1)} in iteration 2 against ${i1.viability.toFixed(1)} in iteration 1. The offer is not carried by the coach.` }
    }
    if (delta > -1) {
      return { tone: C.amber, text: `Viability slipped slightly when the organisation led: ${i2.viability.toFixed(1)} against ${i1.viability.toFixed(1)}. Look at what the coach was doing in iteration 1 that did not transfer.` }
    }
    return { tone: C.red, text: `Viability dropped when the organisation led: ${i2.viability.toFixed(1)} against ${i1.viability.toFixed(1)}. On the evidence so far the result belongs to the coach, not the offer. Work the revisions and run iteration 2 again.` }
  }

  const coverage = ITERATIONS.map((it) => CLIENT_SLOTS.map((cn) => ({
    iteration: it, clientNumber: cn,
    count: rows.filter((r) => Number(r.iteration) === it && Number(r.client_number) === cn).length,
  })))
  const v = comparisonVerdict()

  return (
    <div>
      <div style={{ ...card }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h3 style={secH}>DP07 pilot capture</h3>
            <div style={{ ...hint, marginTop: '0.3rem', maxWidth: '92ch' }}>
              The pilot runs as two iterations with two real paying clients each. Iteration 1 is coach
              led with the organisation observing. Iteration 2 is organisation led with the coach as
              backstop. Every session is captured in three phases: pre-session brief, live observation,
              post-session debrief.
            </div>
          </div>
          <div style={{ ...mono, fontSize: '0.82rem', color: save && save.ok === false ? C.red : C.slate, textAlign: 'right', minWidth: 140 }}>
            {save ? save.text : canManage ? 'All changes save as you type' : 'Read only'}
          </div>
        </div>

        {/* Coverage against the method shape: 2 iterations x 2 paying clients */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(165px,1fr))', gap: '0.7rem', marginTop: '1rem' }}>
          {coverage.flat().map((c) => (
            <div key={`${c.iteration}-${c.clientNumber}`}
              style={{ background: 'var(--cv-bg-2)', border: `1px solid ${c.count ? C.border : 'var(--cv-border-soft)'}`, borderTop: `3px solid ${c.count ? (c.iteration === 2 ? C.purple : C.cyan) : C.border}`, borderRadius: 10, padding: '0.65rem 0.8rem' }}>
              <div style={{ ...mono, fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: C.slate }}>
                Iteration {c.iteration}, client {c.clientNumber}
              </div>
              <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.4rem', fontWeight: 700, color: c.count ? C.navy : C.slate, lineHeight: 1.2 }}>
                {c.count} session{c.count === 1 ? '' : 's'}
              </div>
              {c.count === 0 && <div style={{ ...hint, fontSize: '0.78rem' }}>Not captured yet</div>}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button type="button" style={pill(view === 'sessions', C.cyan)} onClick={() => setView('sessions')}>Sessions</button>
          <button type="button" style={pill(view === 'comparison', C.purple)} onClick={() => setView('comparison')}>Iteration comparison</button>
        </div>
      </div>

      {view === 'comparison' ? (
        <div style={{ ...card }}>
          <h3 style={{ ...secH, fontSize: '1.1rem', marginBottom: '0.6rem' }}>Iteration 1 against iteration 2</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '0.9rem' }}>
            {renderComparisonColumn(i1, C.cyan)}
            {renderComparisonColumn(i2, C.purple)}
          </div>
          <div style={{ marginTop: '0.9rem', borderLeft: `3px solid ${v.tone}`, background: C.alt, borderRadius: 8, padding: '0.75rem 0.95rem' }}>
            <div style={{ ...mono, fontSize: '0.74rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: v.tone, fontWeight: 700 }}>What the comparison says</div>
            <div style={{ ...hint, marginTop: '0.25rem' }}>{v.text}</div>
          </div>
        </div>
      ) : (
        <div style={{ ...card }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
            <h3 style={{ ...secH, fontSize: '1.1rem' }}>Pilot sessions ({shown.length}{filter === 'all' ? '' : ` of ${rows.length}`})</h3>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" style={pill(filter === 'all', C.cyan)} onClick={() => setFilter('all')}>All</button>
              {ITERATIONS.map((n) => (
                <button key={n} type="button" style={pill(filter === n, n === 2 ? C.purple : C.cyan)} onClick={() => setFilter(n)}>Iteration {n}</button>
              ))}
              {canManage && ITERATIONS.map((n) => (
                <button key={`add-${n}`} type="button" style={btn(n === 2 ? C.purple : C.cyan)} disabled={busy}
                  onClick={() => addSession(n, CLIENT_SLOTS.find((cn) => !rows.some((r) => Number(r.iteration) === n && Number(r.client_number) === cn)) || 1)}>
                  + Session, iteration {n}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={hint}>Loading the pilot records.</div>
          ) : shown.length === 0 ? (
            <div style={hint}>
              {rows.length === 0
                ? `No pilot sessions captured yet. ${canManage ? 'Start with the first iteration 1 session: the coach leads, the organisation watches.' : ''}`
                : 'No sessions captured for this iteration yet.'}
            </div>
          ) : (
            shown.map((r) => renderSession(r))
          )}
        </div>
      )}
    </div>
  )
}
