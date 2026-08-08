// ============================================================
// What the customer conversations add up to.
//
// Pure. No database, no React, no dates. Everything this needs is passed in,
// so the rules below can be tested directly rather than inferred from a screen.
//
// THE DISTINCTION THIS MODULE EXISTS TO HOLD
//
//   The minimum is how many conversations an engagement agreed to hold per
//   segment. Five by default, configurable, because a Charter can agree
//   something else. It measures effort.
//
//   Convergence is CONVERGENCE_MINIMUM conversations pointing at the same
//   problem with a real budget behind it. It measures evidence, and it does
//   not scale with the minimum. Three is the point at which a pattern stops
//   being an anecdote, and that does not change because an engagement chose to
//   hold four conversations or eight.
//
// So a segment can meet its minimum and still not converge, and the two are
// reported separately rather than rolled into one green tick.
//
// WHAT COUNTS AS CONVERGING. A conversation counts only when it carries a real
// budget signal AND confirmed the assumption being tested. Either alone is not
// convergence: a budget with no confirmed problem is somebody who spends on
// something else, and a confirmed problem with no budget is sympathy.
//
// WHAT THIS WILL NOT DO. It will not average the six dimension scores. An
// average hides the shape, and the shape is the finding: five on problem
// reality with one on budget and authority is a completely different
// conversation from three across the board, and the average is identical. The
// scores come back as a spread.
// ============================================================

/** Conversations that must converge before a segment is evidenced. */
export const CONVERGENCE_MINIMUM = 3

/** The six dimensions, in the order the workbook lists them. */
export const DIMENSIONS = [
  { key: 'role_accountability', label: 'Role and accountability' },
  { key: 'problem_reality', label: 'Problem reality' },
  { key: 'consequence_severity', label: 'Consequence severity' },
  { key: 'current_attempts', label: 'Current attempts' },
  { key: 'budget_authority', label: 'Budget and authority' },
  { key: 'willingness_to_pay', label: 'Willingness to pay' },
] as const

/**
 * A budget signal is a named budget, a budget holder, a spend already made or
 * a purchase already authorised. 'weak' and 'none' are interest, and interest
 * is not a budget signal. The difference is what separates a market from an
 * opinion, so it is encoded here rather than left to a reader's judgement.
 */
const REAL_BUDGET = new Set(['strong', 'moderate'])

export function hasRealBudget(signal: unknown): boolean {
  return REAL_BUDGET.has(String(signal ?? '').trim().toLowerCase())
}

export interface CaptureRow {
  status?: string | null
  segment?: string | null
  budget_signal_strength?: string | null
  assumption_confirmed?: boolean | null
  assumption_overturned?: boolean | null
  follow_up_needed?: boolean | null
  referral_obtained?: boolean | null
  most_important_verbatim?: string | null
  [scoreKey: string]: unknown
}

export interface SegmentRow {
  id: string
  segment_name?: string | null
}

export interface DimensionSummary {
  key: string
  label: string
  /** How many conversations scored this dimension at all. */
  scored: number
  low: number | null
  high: number | null
  /** How many conversations sat at each of the five scores, in order. */
  spread: number[]
}

export interface SegmentReport {
  id: string
  name: string
  held: number
  meetsMinimum: boolean
  withBudget: number
  converging: number
  converges: boolean
  confirmed: number
  overturned: number
  followUp: number
  referrals: number
  dimensions: DimensionSummary[]
  verbatims: string[]
}

export interface InterviewReport {
  rows: SegmentReport[]
  submitted: number
  drafts: number
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()

/** The bucket for conversations that name a segment nobody recognises. */
export const UNASSIGNED = '__unassigned'

/**
 * Read every capture together.
 *
 * Only submitted captures count. A draft is a conversation somebody has not
 * finished writing up, and treating it as evidence would let an engagement
 * pass a gate on notes nobody has stood behind.
 */
export function buildInterviewReport(
  captures: CaptureRow[],
  segments: SegmentRow[],
  minimumPerSegment: number,
): InterviewReport {
  const all = captures || []
  const submitted = all.filter((c) => norm(c.status) === 'submitted')

  // Captures name their segment as free text, because a field team types what
  // they were sent to talk to rather than picking from a list. Matching is
  // therefore case and space insensitive, and anything matching nothing is
  // grouped rather than dropped: a capture nobody can place is a gap in the
  // record, and losing it silently would hide the gap.
  const byName = new Map((segments || []).map((s) => [norm(s.segment_name), s.id]))
  const bucket = (c: CaptureRow) => byName.get(norm(c.segment)) ?? UNASSIGNED

  const grouped = new Map<string, CaptureRow[]>()
  for (const c of submitted) {
    const k = bucket(c)
    const list = grouped.get(k)
    if (list) list.push(c)
    else grouped.set(k, [c])
  }

  const named = (segments || []).map((s) => ({ id: s.id, name: s.segment_name || 'Unnamed segment' }))
  const orphans = grouped.get(UNASSIGNED) || []
  const order = [
    ...named,
    ...(orphans.length ? [{ id: UNASSIGNED, name: 'Not assigned to a segment' }] : []),
  ]

  const rows = order.map((s) => {
    const list = grouped.get(s.id) || []
    const converging = list.filter((c) => hasRealBudget(c.budget_signal_strength) && Boolean(c.assumption_confirmed))

    const dimensions: DimensionSummary[] = DIMENSIONS.map((d) => {
      const scores = list
        .map((c) => Number(c[`${d.key}_score`]))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5)
      return {
        key: d.key,
        label: d.label,
        scored: scores.length,
        low: scores.length ? Math.min(...scores) : null,
        high: scores.length ? Math.max(...scores) : null,
        spread: [1, 2, 3, 4, 5].map((n) => scores.filter((v) => v === n).length),
      }
    })

    return {
      id: s.id,
      name: s.name,
      held: list.length,
      // A minimum of zero is met by anything, including nothing. That is the
      // engagement's choice to have made and this reports it rather than
      // second-guessing it.
      meetsMinimum: list.length >= minimumPerSegment,
      withBudget: list.filter((c) => hasRealBudget(c.budget_signal_strength)).length,
      converging: converging.length,
      converges: converging.length >= CONVERGENCE_MINIMUM,
      confirmed: list.filter((c) => Boolean(c.assumption_confirmed)).length,
      overturned: list.filter((c) => Boolean(c.assumption_overturned)).length,
      followUp: list.filter((c) => Boolean(c.follow_up_needed)).length,
      referrals: list.filter((c) => Boolean(c.referral_obtained)).length,
      dimensions,
      verbatims: list
        .map((c) => (typeof c.most_important_verbatim === 'string' ? c.most_important_verbatim.trim() : ''))
        .filter(Boolean),
    }
  })

  return {
    rows,
    submitted: submitted.length,
    drafts: all.length - submitted.length,
  }
}
