// @ts-nocheck
'use client'
// ============================================================
// DP09 COMMERCIAL READINESS DIAGNOSTIC
//
// Six fit tests, each scored 0 to 3, maximum 18. The same six tests are
// taken three times: at baseline, at the mid point, and at close. The value
// is in the movement between them, not in any single number.
//
//   Problem-Provider   Problem-Solution   Solution-Customer
//   Solution-Pilot     Solution-Market    Solution-Scale
//
// Rules encoded here:
//   * Evidence is required for any score above 1. A 2 or a 3 must point at
//     something observed. The score is refused with a visible message, not
//     silently dropped, and evidence cannot be removed from a cell that is
//     still scored above 1.
//   * Pilot entry gate: at the mid point, Problem-Solution and
//     Solution-Customer must both be at least 2.
//   * Bands on a checkpoint total: under 12 not ready, 12 to 15 ready to
//     scale, 15 to 18 comprehensively validated. A total of exactly 15 is
//     read as the upper band.
//
// Writes one row per client, fit test and checkpoint to
// gtcv_readiness_scores (see supabase/migrations/
// 2026_08_09_gtcv_dp_tables_d.sql), upserted on that unique key so a cell
// that has never been touched simply does not exist yet.
//
// Client agnostic: the only client input is the clientId prop.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
const panel = { background: C.card, border: `1px solid ${C.borderSoft}`, borderRadius: 14, boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)', overflow: 'hidden', marginBottom: '1.25rem' }
const panelHead = { background: C.header, color: 'var(--cv-on-accent)', padding: '0.85rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }
const panelBody = { padding: '1.1rem 1.2rem 1.3rem' }
const tableWrap = { overflowX: 'auto' }
const table = { width: '100%', borderCollapse: 'collapse', fontSize: '0.93rem', minWidth: 900 }
const th = { padding: '0.5rem 0.55rem', textAlign: 'left', fontFamily: 'monospace', fontSize: '0.76rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.slate, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
const td = { padding: '0.5rem 0.5rem', verticalAlign: 'top', borderBottom: `1px solid ${C.borderSoft}` }
const inputBase = { width: '100%', padding: '0.4rem 0.5rem', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: '0.9rem', fontFamily: 'inherit', background: C.bg2, color: C.navy, boxSizing: 'border-box', resize: 'vertical' }
const roBox = { ...inputBase, background: C.disabled, minHeight: 32, whiteSpace: 'pre-wrap' }
const emptyNote = { fontSize: '0.93rem', color: C.faint, padding: '0.7rem 0' }

function pill(bg, fg) {
  return { fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.04em', padding: '0.22rem 0.6rem', borderRadius: 999, background: bg, color: fg, display: 'inline-block', whiteSpace: 'nowrap' }
}
function noteBox(border, bg) {
  return { border: `1px solid ${border}`, background: bg, borderRadius: 8, padding: '0.65rem 0.85rem', fontSize: '0.9rem', color: C.navy, lineHeight: 1.45 }
}

// ─── Method content (fixed IP, identical for every engagement) ───
const FIT_TESTS = [
  { id: 'problem_provider', label: 'Problem-Provider Fit', question: 'Do we have the capability and credibility to own this problem in this market?' },
  { id: 'problem_solution', label: 'Problem-Solution Fit', question: 'Does the service solve the problem as the client experiences it?' },
  { id: 'solution_customer', label: 'Solution-Customer Fit', question: 'Does it reach a decision maker with budget, not a beneficiary without one?' },
  { id: 'solution_pilot', label: 'Solution-Pilot Fit', question: 'Is it testable in a real client environment inside the engagement window?' },
  { id: 'solution_market', label: 'Solution-Market Fit', question: 'Is there a reachable segment that buys this, at the price it costs to deliver?' },
  { id: 'solution_scale', label: 'Solution-Scale Fit', question: 'Can delivery grow beyond the founder and the first client?' },
]

const CHECKPOINTS = [
  { id: 'baseline', label: 'Baseline', when: 'At the start' },
  { id: 'midpoint', label: 'Mid point', when: 'Before the pilots' },
  { id: 'close', label: 'Close', when: 'At handover' },
]

const SCORE_LABELS = {
  0: '0 no evidence',
  1: '1 asserted',
  2: '2 evidenced',
  3: '3 proven',
}

const MAX_TOTAL = FIT_TESTS.length * 3 // 18

// The two tests that gate entry to the pilots, checked at the mid point.
const PILOT_GATE_TESTS = ['problem_solution', 'solution_customer']
const PILOT_GATE_MIN = 2

// Evidence is required for any score above 1.
const EVIDENCE_REQUIRED_ABOVE = 1

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const blank = (v) => !String(v ?? '').trim()
const cellKey = (fitTest, checkpoint) => `${fitTest}:${checkpoint}`

// Bands on a checkpoint total. Exactly 15 reads as the upper band.
function band(total) {
  if (total < 12) return { label: 'Not ready', color: C.red, detail: 'Under 12. The organisation is not ready to sell this.' }
  if (total < 15) return { label: 'Ready to scale', color: C.amber, detail: '12 to 15. Enough is proven to move, with gaps still open.' }
  return { label: 'Comprehensively validated', color: C.green, detail: '15 to 18. Every fit test is carrying real evidence.' }
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

// One cell of the grid: a score and the evidence that earns it.
function ScoreCell({ row, canManage, message, onScore, onEvidence }) {
  const score = num(row?.score)
  const [local, setLocal] = useState(row?.evidence ?? '')
  useEffect(() => { setLocal(row?.evidence ?? '') }, [row?.evidence])

  const needsEvidence = score > EVIDENCE_REQUIRED_ABOVE && blank(local)
  const tint = score >= 2 && !needsEvidence ? C.tintGreen : score === 0 ? undefined : C.tintCyan

  return (
    <div style={{ background: tint, borderRadius: 8, padding: tint ? '0.4rem' : 0 }}>
      {canManage ? (
        <select
          style={{ ...inputBase, fontFamily: 'monospace' }}
          value={score}
          onChange={(e) => onScore(num(e.target.value), local)}
        >
          {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{SCORE_LABELS[n]}</option>)}
        </select>
      ) : (
        <div style={{ ...roBox, fontFamily: 'monospace' }}>{SCORE_LABELS[score]}</div>
      )}

      {canManage ? (
        <textarea
          style={{ ...inputBase, marginTop: '0.35rem' }}
          rows={2}
          placeholder="Evidence: what was observed, and where"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => { if ((row?.evidence ?? '') !== local) onEvidence(local, () => setLocal(row?.evidence ?? '')) }}
        />
      ) : (
        <div style={{ ...roBox, marginTop: '0.35rem' }}>{local || <span style={{ color: C.faint }}>No evidence recorded</span>}</div>
      )}

      {message && (
        <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: C.red, fontWeight: 600, lineHeight: 1.35 }}>{message}</div>
      )}
      {!message && needsEvidence && (
        <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: C.amber, fontWeight: 600, lineHeight: 1.35 }}>
          This score is above 1 with no evidence behind it.
        </div>
      )}
    </div>
  )
}

function CheckpointCard({ checkpoint, total, scored }) {
  const b = band(total)
  return (
    <div style={{ background: C.card, border: `1px solid ${C.borderSoft}`, borderTop: `3px solid ${b.color}`, borderRadius: 12, padding: '0.9rem 1rem', flex: '1 1 200px', minWidth: 200 }}>
      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: C.slate }}>{checkpoint.label}</div>
      <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.1, marginTop: '0.2rem' }}>
        {total}<span style={{ fontSize: '1rem', color: C.faint }}> of {MAX_TOTAL}</span>
      </div>
      <div style={{ marginTop: '0.4rem' }}><span style={pill(b.color, 'var(--cv-on-accent)')}>{b.label}</span></div>
      <div style={{ fontSize: '0.82rem', color: C.slate, marginTop: '0.4rem', lineHeight: 1.35 }}>{b.detail}</div>
      <div style={{ fontSize: '0.8rem', color: C.faint, marginTop: '0.3rem' }}>{scored} of {FIT_TESTS.length} fit tests scored</div>
    </div>
  )
}

export default function ReadinessDiagnostic({ clientId, canManage }) {
  const editable = !!canManage
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [saveState, setSaveState] = useState('loading')
  const [saveMessage, setSaveMessage] = useState(null)
  // Row per cell key, and the inline rule message per cell key.
  const [cells, setCells] = useState({})
  const [messages, setMessages] = useState({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!clientId) { setLoading(false); return }
      setLoading(true)
      setSaveState('loading')
      const { data, error } = await supabase
        .from('gtcv_readiness_scores')
        .select('*')
        .eq('client_id', clientId)
      if (cancelled) return
      if (error) setLoadError(error.message)
      const next = {}
      ;(data || []).forEach((r) => { next[cellKey(r.fit_test, r.checkpoint)] = r })
      setCells(next)
      setLoading(false)
      setSaveState('idle')
    }
    load().catch((e) => { if (!cancelled) { setLoadError(e?.message || 'Could not load the diagnostic'); setLoading(false); setSaveState('idle') } })
    return () => { cancelled = true }
  }, [clientId])

  const setMessage = useCallback((key, text) => {
    setMessages((prev) => ({ ...prev, [key]: text }))
  }, [])

  // Upsert on the (client, fit test, checkpoint) key, so a cell that has
  // never been touched is created on first edit.
  const persist = useCallback(async (fitTest, checkpoint, patch) => {
    setSaveState('saving')
    setSaveMessage(null)
    const key = cellKey(fitTest, checkpoint)
    const { data, error } = await supabase
      .from('gtcv_readiness_scores')
      .upsert(
        { client_id: clientId, fit_test: fitTest, checkpoint, ...patch, updated_at: new Date().toISOString() },
        { onConflict: 'client_id,fit_test,checkpoint' },
      )
      .select()
      .single()
    if (error) { setSaveState('error'); setSaveMessage(error.message); return false }
    setCells((prev) => ({ ...prev, [key]: data }))
    setSaveState('saved')
    return true
  }, [clientId])

  // Rule: evidence is required for any score above 1. The score is refused
  // with a message rather than being written and quietly ignored.
  function changeScore(fitTest, checkpoint, nextScore, evidenceInBox) {
    const key = cellKey(fitTest, checkpoint)
    const existing = cells[key]
    const evidence = evidenceInBox ?? existing?.evidence ?? ''
    if (nextScore > EVIDENCE_REQUIRED_ABOVE && blank(evidence)) {
      setMessage(key, `A score of ${nextScore} needs evidence. Write what was observed in the box below, then set the score.`)
      return
    }
    setMessage(key, null)
    persist(fitTest, checkpoint, { score: nextScore })
  }

  // The same rule read backwards: evidence cannot be stripped out of a cell
  // that is still scored above 1. The box is put back and the coach is told
  // to lower the score first.
  function changeEvidence(fitTest, checkpoint, nextEvidence, revert) {
    const key = cellKey(fitTest, checkpoint)
    const score = num(cells[key]?.score)
    if (blank(nextEvidence) && score > EVIDENCE_REQUIRED_ABOVE) {
      setMessage(key, `This cell scores ${score}, which has to rest on evidence. Lower the score to 1 or 0 before clearing it.`)
      if (revert) revert()
      return
    }
    setMessage(key, null)
    persist(fitTest, checkpoint, { evidence: nextEvidence })
  }

  const totals = useMemo(() => {
    const out = {}
    CHECKPOINTS.forEach((cp) => {
      let total = 0
      let scored = 0
      FIT_TESTS.forEach((ft) => {
        const row = cells[cellKey(ft.id, cp.id)]
        const s = num(row?.score)
        total += s
        if (row && s > 0) scored += 1
      })
      out[cp.id] = { total, scored }
    })
    return out
  }, [cells])

  // Pilot entry gate, checked at the mid point.
  const pilotGate = useMemo(() => {
    const detail = PILOT_GATE_TESTS.map((id) => {
      const ft = FIT_TESTS.find((f) => f.id === id)
      const score = num(cells[cellKey(id, 'midpoint')]?.score)
      return { id, label: ft ? ft.label : id, score, passes: score >= PILOT_GATE_MIN }
    })
    return { detail, passes: detail.every((d) => d.passes) }
  }, [cells])

  const movement = totals.close.total - totals.baseline.total
  const anyClose = totals.close.scored > 0
  const anyBaseline = totals.baseline.scored > 0

  if (!clientId) {
    return <div style={{ ...wrap, ...emptyNote }}>Select an engagement to open its readiness diagnostic.</div>
  }
  if (loading) {
    return <div style={{ ...wrap, ...emptyNote }}>Loading the readiness diagnostic...</div>
  }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: C.teal }}>DP09</div>
          <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.45rem', fontWeight: 700 }}>Commercial Readiness Diagnostic</div>
          <div style={{ fontSize: '0.95rem', color: C.slate, maxWidth: '68ch', marginTop: '0.25rem' }}>
            Six fit tests, each scored 0 to 3, maximum {MAX_TOTAL}. The same six are taken three times, at
            baseline, at the mid point and at close. A score above 1 has to point at evidence, and the movement
            between the three sittings is the real result.
          </div>
        </div>
        <SaveIndicator state={saveState} message={saveMessage} />
      </div>

      {loadError && (
        <div style={{ ...noteBox(C.red, C.tintRed), marginBottom: '1rem' }}>
          The diagnostic could not be loaded: {loadError}
        </div>
      )}
      {!editable && (
        <div style={{ ...noteBox(C.border, C.alt), marginBottom: '1rem' }}>
          Read only. You can see the scores and the evidence but not change them.
        </div>
      )}

      {/* ─── Totals, bands and movement ─────────────────────── */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {CHECKPOINTS.map((cp) => (
          <CheckpointCard key={cp.id} checkpoint={cp} total={totals[cp.id].total} scored={totals[cp.id].scored} />
        ))}
        <div style={{ background: C.card, border: `1px solid ${C.borderSoft}`, borderTop: `3px solid ${C.teal}`, borderRadius: 12, padding: '0.9rem 1rem', flex: '1 1 200px', minWidth: 200 }}>
          <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: C.slate }}>Movement</div>
          <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.1, marginTop: '0.2rem', color: movement > 0 ? C.green : movement < 0 ? C.red : C.navy }}>
            {movement > 0 ? `+${movement}` : movement}
          </div>
          <div style={{ fontSize: '0.85rem', color: C.slate, marginTop: '0.4rem', lineHeight: 1.35 }}>
            {anyBaseline || anyClose
              ? <>Baseline {totals.baseline.total} to close {totals.close.total}, out of {MAX_TOTAL}.</>
              : <>Score the baseline first, so there is something to move from.</>}
          </div>
        </div>
      </div>

      {/* ─── Pilot entry gate ───────────────────────────────── */}
      <div style={{ ...noteBox(pilotGate.passes ? C.green : C.amber, pilotGate.passes ? C.tintGreen : C.tintAmber), marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={pill(pilotGate.passes ? C.green : C.amber, 'var(--cv-on-accent)')}>
            {pilotGate.passes ? 'Pilot entry gate open' : 'Pilot entry gate closed'}
          </span>
          <strong>At the mid point, Problem-Solution and Solution-Customer must both be at least {PILOT_GATE_MIN}.</strong>
        </div>
        <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
          {pilotGate.detail.map((d) => (
            <li key={d.id} style={{ color: d.passes ? C.green : C.amber, fontWeight: 600 }}>
              {d.label}: {d.score} at mid point. {d.passes ? 'Passes.' : `Needs at least ${PILOT_GATE_MIN}.`}
            </li>
          ))}
        </ul>
      </div>

      {/* ─── The grid: six fit tests by three checkpoints ──── */}
      <section style={panel}>
        <div style={panelHead}>
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--cv-wa-75)' }}>Six fit tests, three sittings</div>
            <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.12rem', fontWeight: 700 }}>Scores and the evidence behind them</div>
          </div>
          <span style={pill('var(--cv-wa-20)', 'var(--cv-on-accent)')}>0 to 3 per test, {MAX_TOTAL} maximum</span>
        </div>
        <div style={panelBody}>
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={{ ...th, width: '22%' }}>Fit test</th>
                  {CHECKPOINTS.map((cp) => (
                    <th key={cp.id} style={{ ...th, width: '22%' }}>{cp.label}<div style={{ fontSize: '0.7rem', textTransform: 'none', letterSpacing: 0, color: C.faint }}>{cp.when}</div></th>
                  ))}
                  <th style={{ ...th, width: 130 }}>Baseline to close</th>
                </tr>
              </thead>
              <tbody>
                {FIT_TESTS.map((ft) => {
                  const base = num(cells[cellKey(ft.id, 'baseline')]?.score)
                  const close = num(cells[cellKey(ft.id, 'close')]?.score)
                  const delta = close - base
                  const isGateTest = PILOT_GATE_TESTS.includes(ft.id)
                  return (
                    <tr key={ft.id}>
                      <td style={td}>
                        <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>{ft.label}</div>
                        <div style={{ fontSize: '0.83rem', color: C.slate, marginTop: '0.2rem', lineHeight: 1.35 }}>{ft.question}</div>
                        {isGateTest && (
                          <div style={{ marginTop: '0.4rem' }}><span style={pill(C.tintCyan, C.navy)}>Pilot entry gate test</span></div>
                        )}
                      </td>
                      {CHECKPOINTS.map((cp) => {
                        const key = cellKey(ft.id, cp.id)
                        return (
                          <td key={cp.id} style={td}>
                            <ScoreCell
                              row={cells[key]}
                              canManage={editable}
                              message={messages[key]}
                              onScore={(next, evidenceInBox) => changeScore(ft.id, cp.id, next, evidenceInBox)}
                              onEvidence={(next, revert) => changeEvidence(ft.id, cp.id, next, revert)}
                            />
                          </td>
                        )
                      })}
                      <td style={{ ...td, textAlign: 'center' }}>
                        <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.25rem', fontWeight: 700, color: delta > 0 ? C.green : delta < 0 ? C.red : C.faint }}>
                          {delta > 0 ? `+${delta}` : delta}
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: C.faint }}>{base} to {close}</div>
                      </td>
                    </tr>
                  )
                })}
                <tr>
                  <td style={{ ...td, fontFamily: 'Georgia,serif', fontWeight: 700, fontSize: '1.02rem' }}>Total</td>
                  {CHECKPOINTS.map((cp) => {
                    const t = totals[cp.id].total
                    const b = band(t)
                    return (
                      <td key={cp.id} style={td}>
                        <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.35rem', fontWeight: 700 }}>{t}<span style={{ fontSize: '0.9rem', color: C.faint }}> of {MAX_TOTAL}</span></div>
                        <div style={{ marginTop: '0.3rem' }}><span style={pill(b.color, 'var(--cv-on-accent)')}>{b.label}</span></div>
                      </td>
                    )
                  })}
                  <td style={{ ...td, textAlign: 'center' }}>
                    <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.35rem', fontWeight: 700, color: movement > 0 ? C.green : movement < 0 ? C.red : C.faint }}>
                      {movement > 0 ? `+${movement}` : movement}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.85rem', color: C.slate }}>
            <span><strong style={{ color: C.navy }}>0</strong> no evidence at all</span>
            <span><strong style={{ color: C.navy }}>1</strong> asserted, nothing observed</span>
            <span><strong style={{ color: C.navy }}>2</strong> evidenced by something observed</span>
            <span><strong style={{ color: C.navy }}>3</strong> proven, repeatedly and independently</span>
          </div>
          <div style={{ marginTop: '0.6rem', fontSize: '0.85rem', color: C.slate }}>
            Bands on a checkpoint total: under 12 not ready, 12 to 15 ready to scale, 15 to 18 comprehensively
            validated. A total of exactly 15 is read as the upper band.
          </div>
        </div>
      </section>
    </div>
  )
}
