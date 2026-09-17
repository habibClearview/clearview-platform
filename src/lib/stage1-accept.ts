// ============================================================
// WHERE AN ACCEPTED ANSWER GOES  (the fix for "six answers, six rows")
// 15 August 2026.
//
// WHAT WAS WRONG, in one line: accept could only insert.
//
// Tool 1 asks six questions, one variable each. Answer all six and the room
// used to get SIX ROWS, each with a single cell filled and nothing joining
// them, because accept copied the question's target column into a brand new
// row of the block's table and that was the whole of its logic.
//
// The model says otherwise. Two of the six questions NAME a new thing, and
// four of them DESCRIBE a thing already named:
//
//     What problem does this service solve?      -> names a problem
//     Name one activity that solves that problem -> names an activity
//     What does that activity deliver?           -> fills THAT activity
//     Who pays for it today?                     -> fills THAT activity
//     What has to be true for this to work?      -> fills THAT activity
//     What would prove that wrong?               -> fills THAT activity
//
// Tool 2's five questions are the same shape one level up: they all fill a
// problem that Tool 1 already stated, and none of them names anything new.
//
// So the column the question targets decides the MODE, not just the table.
// This module is that decision and nothing else — no database, no request, no
// React — so the rule can be read and tested on its own.
//
// The four fields that hold more than one value are filled through
// gtcv_activity_values, not by overwriting a column, because a room genuinely
// has two funders for one activity (T1.21). Accepting a second "who pays" adds
// a second value; it does not replace the first.
// ============================================================

/** What accept does with one answer. */
export type AcceptMode =
  /** A problem the service solves. A new row of the problem table. */
  | 'createProblem'
  /** An activity that solves the anchored problem. A new row of the activity table. */
  | 'createActivity'
  /** One of the four multi-value fields of an activity already named. */
  | 'fillActivityValue'
  /** One column of a problem already stated. */
  | 'fillProblemColumn'
  /** Every other block: the answer is a row of that block's own table. */
  | 'createRow'

export interface AcceptTarget {
  mode: AcceptMode
  table: string
  /** The column being filled, on the two fill modes. */
  field?: string
}

/** The activity fields that hold more than one value (T1.21, T1.22). */
export const ACTIVITY_VALUE_FIELDS = ['delivers', 'who_pays', 'assumption', 'disproof'] as const

/** Tool 2's five columns. Each one describes a problem Tool 1 already stated. */
export const PROBLEM_COLUMNS = [
  'experienced_by', 'accountable', 'budget_holder',
  'cost_of_not_solving', 'budget_mechanism',
] as const

/**
 * The tables the service to problem to activity chain is built out of.
 *
 * A block whose answers land anywhere else is not part of that chain, however
 * its columns happen to be spelled.
 */
export const CHAIN_TABLES = ['gtcv_assumptions', 'gtcv_problem_owner_budget']

/**
 * Column by column, what accepting an answer to it means.
 *
 * A column that is not here is not part of the chain, and the answer becomes a
 * row of the block's own table exactly as it always did. That is the right
 * answer for Decision Point 1, whose questions name services.
 */
export const ACCEPT_TARGETS: Record<string, AcceptTarget> = {
  problem: { mode: 'createProblem', table: 'gtcv_problem_owner_budget' },
  activity: { mode: 'createActivity', table: 'gtcv_assumptions' },
  ...Object.fromEntries(ACTIVITY_VALUE_FIELDS.map((f) => [
    f, { mode: 'fillActivityValue' as const, table: 'gtcv_assumptions', field: f },
  ])),
  ...Object.fromEntries(PROBLEM_COLUMNS.map((f) => [
    f, { mode: 'fillProblemColumn' as const, table: 'gtcv_problem_owner_budget', field: f },
  ])),
}

/** What the room is working through when the answer is accepted. */
export interface RoomAnchor {
  serviceId: string | null
  problemId: string | null
  activityId: string | null
}

export interface AcceptPlan {
  mode: AcceptMode
  table: string
  field?: string
  /** The row being filled, on the two fill modes. */
  rowId?: string
  /** The parent the new row hangs from, on the two create modes. */
  serviceId?: string | null
  problemId?: string | null
}

export interface AcceptRefusal {
  /**
   * Said in the words of the thing that is missing, because the facilitator is
   * standing in front of a room and needs to know what to press, not that a
   * value was null. The answer STAYS PENDING when this is returned: nothing the
   * room said is ever thrown away by a refusal.
   */
  refusal: string
}

export type AcceptDecision = AcceptPlan | AcceptRefusal

export function isRefusal(d: AcceptDecision): d is AcceptRefusal {
  return typeof (d as AcceptRefusal).refusal === 'string'
}

/**
 * Where this answer goes.
 *
 * @param columns      the question's target columns, in the question's own order
 * @param anchor       what the room is working through
 * @param blockTable   the block's own table, for every column outside the chain
 * @param targetRowId  the row the facilitator pointed the answer at, which
 *                     overrides the anchor. This is how a second activity gets
 *                     its own "who pays" when the room named three of them.
 */
/**
 * WHAT TO DO WITH AN ANSWER THAT IS NOT FILED AS A ROW. 17 September 2026.
 *
 * Some blocks are scored and argued rather than listed: the pre-engagement
 * questions, the six Commercial Readiness fit tests, the five independence
 * tests at handover. The room still answers them, still sees the spread, and
 * still agrees a number. What it does not do is create a row, because the
 * number belongs on that block's own panel, where it is signed.
 *
 * This used to say "that block does not take answers yet", which reads as a
 * thing somebody forgot to build and tells the facilitator nothing to do next.
 */
export const NOT_FILED_HERE =
  'The room\'s answers stay on screen here to be read and discussed. '
  + 'Record what the room agrees on the panel below, where it is signed.'

export function planAccept(
  columns: string[],
  anchor: RoomAnchor,
  blockTable: string | null,
  targetRowId?: string | null,
): AcceptDecision {
  // ONE VARIABLE PER QUESTION, so a chain question has exactly one target
  // column. The first recognised one decides; a question with none of them
  // is not part of the chain at all.
  //
  // AND THE CHAIN BELONGS TO PHASE 0, NOT TO EVERY BLOCK. 17 September 2026,
  // from the review on #281. ACCEPT_TARGETS is keyed by column name alone, so
  // it matched any block that happened to use one of those words. Decision
  // Point 3 has a column genuinely called "problem" on gtcv_propositions, and
  // the new prompt for it would have been filed as a Phase 0 problem, on
  // gtcv_problem_owner_budget, in another block entirely. The room would have
  // answered, the facilitator would have pressed Accept, and the proposition
  // would have stayed empty while a row appeared somewhere nobody was looking.
  //
  // The chain is what links a service to its problems to its activities, and
  // those live on Phase 0's own tables. So it is consulted only when this
  // block is one of them.
  const inChain = !blockTable || CHAIN_TABLES.includes(blockTable)
  const column = inChain ? columns.find((c) => ACCEPT_TARGETS[c]) : undefined
  const target = column ? ACCEPT_TARGETS[column] : null

  if (!target) {
    if (!blockTable) return { refusal: NOT_FILED_HERE }
    return { mode: 'createRow', table: blockTable }
  }

  switch (target.mode) {
    case 'createProblem': {
      // A problem belongs to a service. The service is the one thing the room
      // has always been anchored to, so this is the one create that cannot be
      // blocked by a missing link in the chain.
      if (!anchor.serviceId) {
        return { refusal: 'No service is anchored. Choose the service in the bar above, then accept this.' }
      }
      return { mode: 'createProblem', table: target.table, serviceId: anchor.serviceId }
    }

    case 'createActivity': {
      const problemId = targetRowId || anchor.problemId
      if (!problemId) {
        return {
          refusal: 'No problem to hang this on. Accept a problem first, or choose one beside this answer. '
            + 'An activity solves a problem.',
        }
      }
      return {
        mode: 'createActivity', table: target.table,
        problemId, serviceId: anchor.serviceId,
      }
    }

    case 'fillActivityValue': {
      const rowId = targetRowId || anchor.activityId
      if (!rowId) {
        return {
          refusal: 'No activity to fill. Accept an activity first, or choose one beside this answer. '
            + 'This answer describes an activity.',
        }
      }
      return { mode: 'fillActivityValue', table: target.table, field: target.field, rowId }
    }

    case 'fillProblemColumn': {
      const rowId = targetRowId || anchor.problemId
      if (!rowId) {
        return {
          refusal: 'No problem to fill. Accept a problem first, or choose one beside this answer. '
            + 'This answer describes a problem.',
        }
      }
      return { mode: 'fillProblemColumn', table: target.table, field: target.field, rowId }
    }

    default:
      return { refusal: NOT_FILED_HERE }
  }
}

/**
 * Which list the facilitator picks from beside a pending answer.
 *
 * The chooser is the answer to "this is the wrong activity": the room named
 * three activities and the second "who pays" belongs to the second of them.
 * Nothing to choose from means no chooser is drawn.
 */
export function chooserFor(columns: string[]): 'problem' | 'activity' | null {
  const column = columns.find((c) => ACCEPT_TARGETS[c])
  const mode = column ? ACCEPT_TARGETS[column].mode : null
  if (mode === 'createActivity' || mode === 'fillProblemColumn') return 'problem'
  if (mode === 'fillActivityValue') return 'activity'
  return null
}
