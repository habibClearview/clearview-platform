// @ts-nocheck
'use client'
// ============================================================
// INTERVIEW REPORTING
//
// What the customer conversations add up to. The capture form records one
// conversation at a time; this reads all of them together and answers the
// question the gate actually asks, which is not "how many did we do" but
// "does this converge, and did anybody name a budget".
//
// THE TWO NUMBERS THAT MATTER, AND WHY THEY ARE DIFFERENT.
//
//   The minimum is how many conversations an engagement agreed to hold per
//   segment. Five by default, configurable, because a Charter can agree
//   something else. It is a measure of effort.
//
//   Convergence is three or more conversations pointing at the same problem
//   with the same budget signal. It is a measure of evidence, and it does not
//   move with the minimum. Three is the point at which a pattern stops being an
//   anecdote, and that does not change because an engagement chose to hold four
//   conversations or eight.
//
// So a segment can hit its minimum and still fail. The panel says so plainly
// rather than showing a green count and letting the coach infer the rest.
//
// WHAT IT WILL NOT DO. It will not average the six dimension scores into a
// single number. An average hides the shape: a conversation scoring five on
// problem reality and one on budget and authority is a completely different
// finding from one scoring three across the board, and the average is the same.
// The dimensions are shown as a spread, per segment, and read as a spread.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DEFAULT_VALIDATION_MIN_PER_SEGMENT } from '@/lib/engagement-types'

const CAPTURES = 'gtcv_interview_captures'
const SEGMENTS = 'gtcv_customer_segments'
const CONFIG = 'engagement_config'

// The convergence bar is the method's, not the engagement's, so it is a
// constant here rather than configuration. See the header.
const CONVERGENCE_MINIMUM = 3

const C = {
  card: 'var(--cv-card)', alt: 'var(--cv-alt)', border: 'var(--cv-border)',
  slate: 'var(--cv-slate)', navy: 'var(--cv-navy)', teal: 'var(--cv-teal)',
  green: 'var(--cv-green)', amber: 'var(--cv-amber)', red: 'var(--cv-red)',
}
const mono = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' }
const hint = { fontSize: '0.88rem', color: C.slate, lineHeight: 1.5 }

// The six dimensions, in the order the workbook lists them. Kept here so the
// report reads in the same order as the form that produced it.
const DIMENSIONS = [
  { key: 'role_accountability', label: 'Role and accountability' },
  { key: 'problem_reality', label: 'Problem reality' },
  { key: 'consequence_severity', label: 'Consequence severity' },
  { key: 'current_attempts', label: 'Current attempts' },
  { key: 'budget_authority', label: 'Budget and authority' },
  { key: 'willingness_to_pay', label: 'Willingness to pay' },
]

// A budget signal is a named budget, a budget holder, a spend already made or
// a purchase already authorised. Interest is not a budget signal, and the
// difference is what separates a market from an opinion.
const REAL_BUDGET = ['strong', 'moderate']

export default function InterviewReporting({ clientId }) {
  const [captures, setCaptures] = useState([])
  const [segments, setSegments] = useState([])
  const [minimum, setMinimum] = useState(DEFAULT_VALIDATION_MIN_PER_SEGMENT)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  const load = useCallback(async () => {
    if (!clientId) { setCaptures([]); setSegments([]); setLoading(false); return }
    setLoading(true)
    try {
      const [cap, seg, cfg] = await Promise.all([
        supabase.from(CAPTURES).select('*').eq('client_id', clientId).order('sort_order'),
        supabase.from(SEGMENTS).select('id, segment_name').eq('client_id', clientId).order('sort_order'),
        supabase.from(CONFIG).select('validation_min_per_segment').eq('client_id', clientId).maybeSingle(),
      ])
      if (cap.error) {
        console.error('InterviewReporting: captures failed', cap.error)
        setErr('Could not load the conversations. What you see may be incomplete.')
      } else {
        setErr(null)
        setCaptures(cap.data || [])
      }
      if (!seg.error) setSegments(seg.data || [])
      // ?? rather than ||, so an engagement that deliberately agreed zero is
      // not silently given five.
      setMinimum(cfg.data?.validation_min_per_segment ?? DEFAULT_VALIDATION_MIN_PER_SEGMENT)
    } catch (e) {
      console.error('InterviewReporting: load threw', e)
      setErr('Could not load the conversations. What you see may be incomplete.')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { load() }, [load])

  const report = useMemo(() => {
    const submitted = captures.filter((c) => c.status === 'submitted')
    const bySegment = new Map()

    // The capture stores the segment as free text, because a field team types
    // what they were sent to talk to rather than picking from a list. Matching
    // is therefore case and space insensitive against the segment names, and
    // anything that matches nothing is grouped as unassigned rather than
    // dropped: a capture nobody can place is a gap in the record, and the panel
    // says so instead of quietly losing it.
    const norm = (v) => String(v || '').trim().toLowerCase()
    const byName = new Map(segments.map((s) => [norm(s.segment_name), s.id]))
    const key = (c) => byName.get(norm(c.segment)) || '__unassigned'
    for (const c of submitted) {
      const k = key(c)
      if (!bySegment.has(k)) bySegment.set(k, [])
      bySegment.get(k).push(c)
    }

    const rows = []
    const named = segments.map((s) => ({ id: s.id, name: s.segment_name || 'Unnamed segment' }))
    const unassigned = bySegment.get('__unassigned') || []
    const all = [...named, ...(unassigned.length ? [{ id: '__unassigned', name: 'Not assigned to a segment' }] : [])]

    for (const s of all) {
      const list = bySegment.get(s.id) || []
      const withBudget = list.filter((c) => REAL_BUDGET.includes(String(c.budget_signal_strength || '').toLowerCase()))
      const confirmed = list.filter((c) => c.assumption_confirmed)
      const overturned = list.filter((c) => c.assumption_overturned)
      const followUp = list.filter((c) => c.follow_up_needed)
      const referrals = list.filter((c) => c.referral_obtained)

      // Convergence is counted on conversations that both carry a real budget
      // signal and confirmed the assumption being tested. Either alone is not
      // convergence: a budget with no confirmed problem is somebody who spends
      // on something else, and a confirmed problem with no budget is sympathy.
      const converging = list.filter((c) =>
        REAL_BUDGET.includes(String(c.budget_signal_strength || '').toLowerCase()) && c.assumption_confirmed)

      const dimensions = DIMENSIONS.map((d) => {
        const scores = list.map((c) => Number(c[`${d.key}_score`])).filter((n) => Number.isFinite(n) && n > 0)
        return {
          ...d,
          scored: scores.length,
          low: scores.length ? Math.min(...scores) : null,
          high: scores.length ? Math.max(...scores) : null,
          // The count at each score, so the shape is visible rather than
          // flattened into one number.
          spread: [1, 2, 3, 4, 5].map((n) => scores.filter((s) => s === n).length),
        }
      })

      rows.push({
        id: s.id,
        name: s.name,
        held: list.length,
        meetsMinimum: list.length >= minimum,
        withBudget: withBudget.length,
        converging: converging.length,
        converges: converging.length >= CONVERGENCE_MINIMUM,
        confirmed: confirmed.length,
        overturned: overturned.length,
        followUp: followUp.length,
        referrals: referrals.length,
        dimensions,
        verbatims: list.map((c) => c.most_important_verbatim).filter(Boolean),
      })
    }

    return {
      rows,
      submitted: submitted.length,
      drafts: captures.length - submitted.length,
    }
  }, [captures, segments, minimum])

  if (loading) return <p style={hint}>Reading the conversations...</p>

  const anyConverges = report.rows.some((r) => r.converges)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem 1.1rem', background: C.card }}>
        <div style={{ ...mono, fontSize: '0.75rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
          What the conversations add up to
        </div>
        <p style={{ ...hint, margin: '0.4rem 0 0', maxWidth: '68ch' }}>
          Two different questions. <strong>The minimum</strong> is how many conversations this
          engagement agreed to hold per segment, currently {minimum}. That is effort.{' '}
          <strong>Convergence</strong> is {CONVERGENCE_MINIMUM} or more conversations pointing at the
          same problem with a real budget behind it. That is evidence, and it does not move with the
          minimum. A segment can hit its minimum and still not converge.
        </p>

        <div style={{ display: 'flex', gap: '1.6rem', marginTop: '0.9rem', flexWrap: 'wrap' }}>
          <Stat label="Submitted" value={report.submitted} />
          <Stat label="Still in draft" value={report.drafts} tone={report.drafts > 0 ? C.amber : C.slate} />
          <Stat
            label="Segments that converge"
            value={`${report.rows.filter((r) => r.converges).length} of ${report.rows.length}`}
            tone={anyConverges ? C.green : C.amber}
          />
        </div>

        {report.drafts > 0 ? (
          <p style={{ ...hint, marginTop: '0.7rem', color: C.amber }}>
            {report.drafts} {report.drafts === 1 ? 'capture is' : 'captures are'} still in draft and
            counted nowhere below. A conversation that has not been submitted is not yet evidence.
          </p>
        ) : null}

        {err ? <div style={{ color: C.red, fontSize: '0.95rem', marginTop: '0.7rem' }}>{err}</div> : null}
      </div>

      {report.rows.length === 0 ? (
        <p style={hint}>
          No conversations recorded yet. They are captured on Block 2, one per conversation, within
          thirty minutes of each one.
        </p>
      ) : report.rows.map((r) => (
        <div key={r.id} style={{
          border: `1px solid ${C.border}`,
          borderLeft: `4px solid ${r.converges ? C.green : r.held > 0 ? C.amber : C.slate}`,
          borderRadius: 11, padding: '0.9rem 1rem', background: C.card,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
            <h3 style={{ fontFamily: 'Georgia,serif', fontSize: '1.1rem', fontWeight: 600, color: C.navy, margin: 0 }}>
              {r.name}
            </h3>
            <span style={{
              ...mono, fontSize: '0.78rem', color: r.converges ? C.green : C.amber,
              border: `1px solid ${r.converges ? C.green : C.amber}`, borderRadius: 999, padding: '0.15rem 0.6rem',
            }}>
              {r.converges ? 'Converges' : 'Does not converge yet'}
            </span>
          </div>

          <p style={{ ...hint, margin: '0.5rem 0 0' }}>
            <strong>{r.held}</strong> {r.held === 1 ? 'conversation' : 'conversations'} held
            {r.meetsMinimum
              ? `, which meets the agreed minimum of ${minimum}. `
              : `, ${minimum - r.held} short of the agreed minimum of ${minimum}. `}
            <strong>{r.withBudget}</strong> named a real budget, a budget holder or a spend they
            already make. <strong>{r.converging}</strong> both named a budget and confirmed the
            problem, and {CONVERGENCE_MINIMUM} is what convergence takes.
          </p>

          {r.overturned > 0 ? (
            <p style={{ ...hint, margin: '0.4rem 0 0', color: C.amber }}>
              <strong>{r.overturned}</strong> {r.overturned === 1 ? 'conversation' : 'conversations'}{' '}
              overturned the assumption being tested. That is a finding, not a failure, and it belongs
              in what this gate established.
            </p>
          ) : null}

          {r.followUp > 0 || r.referrals > 0 ? (
            <p style={{ ...hint, margin: '0.4rem 0 0' }}>
              {r.followUp > 0 ? `${r.followUp} need a follow up call. ` : ''}
              {r.referrals > 0 ? `${r.referrals} produced a referral, which is the cheapest next conversation you will get.` : ''}
            </p>
          ) : null}

          <div style={{ ...mono, fontSize: '0.68rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate, margin: '0.9rem 0 0.4rem' }}>
            How the six dimensions scored, as a spread
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 440 }}>
              <thead>
                <tr>
                  <th style={th}>Dimension</th>
                  {[1, 2, 3, 4, 5].map((n) => <th key={n} style={{ ...th, textAlign: 'center', width: 42 }}>{n}</th>)}
                  <th style={{ ...th, textAlign: 'right' }}>Range</th>
                </tr>
              </thead>
              <tbody>
                {r.dimensions.map((d) => (
                  <tr key={d.key}>
                    <td style={td}>{d.label}</td>
                    {d.spread.map((count, i) => (
                      <td key={i} style={{
                        ...td, textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                        color: count === 0 ? 'var(--cv-border)' : C.navy,
                        fontWeight: count === 0 ? 400 : 700,
                      }}>{count === 0 ? '.' : count}</td>
                    ))}
                    <td style={{ ...td, textAlign: 'right', ...mono, fontSize: '0.8rem', color: C.slate }}>
                      {d.scored === 0 ? 'Not scored' : d.low === d.high ? `All ${d.low}` : `${d.low} to ${d.high}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {r.verbatims.length > 0 ? (
            <>
              <div style={{ ...mono, fontSize: '0.68rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate, margin: '0.9rem 0 0.4rem' }}>
                In their own words
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {r.verbatims.map((v, i) => (
                  <blockquote key={i} style={{
                    margin: 0, padding: '0.5rem 0.75rem', borderLeft: `3px solid ${C.teal}`,
                    background: C.alt, borderRadius: '0 8px 8px 0',
                    fontSize: '0.93rem', color: C.navy, fontStyle: 'italic', lineHeight: 1.5,
                  }}>{v}</blockquote>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ))}
    </div>
  )
}

const th = {
  textAlign: 'left', padding: '0.35rem 0.5rem', borderBottom: `1px solid ${C.border}`,
  fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
  fontSize: '0.68rem', letterSpacing: '.08em', textTransform: 'uppercase', color: C.slate,
  fontWeight: 600, whiteSpace: 'nowrap',
}
const td = {
  padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--cv-border-soft)',
  fontSize: '0.9rem', color: 'var(--cv-navy)',
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <div style={{ ...mono, fontSize: '0.68rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>{label}</div>
      <div style={{
        fontFamily: 'Georgia,serif', fontSize: '1.35rem', fontWeight: 600,
        color: tone || C.navy, marginTop: 2, fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
    </div>
  )
}
