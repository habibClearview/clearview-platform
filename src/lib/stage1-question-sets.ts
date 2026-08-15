// ============================================================
// THE QUESTION SETS FOR THE TWO BLOCKS STAGE 1 COVERS (R4)
//
// R1 says a Question is stored as data, not written into a page. So these are
// not the questions: they are the STARTING SET that gets written into
// gtcv_questions for an engagement, after which they are rows like any other
// and can be edited without touching this file.
//
// R4 defines sets for two blocks only, "Clearing the ground" and "DP01 Service
// Reality". Every other block has none, and that is not an error.
//
// R13: a collect question asks for the target fields SEPARATELY, and the
// heading a participant sees above each box is the heading of the column it
// lands in. So target_fields carries both, and the two must stay in step with
// the real columns of the block's table. Those columns are named in the
// comments beneath each set so a mismatch is visible on the page rather than
// only at save time.
// ============================================================
import type { QuestionType, TargetField } from './stage1-questions'

export interface QuestionSeed {
  gate_id: string
  /**
   * WHICH TOOL ASKS IT. Phase 0 is five tools on one block, and a question
   * always belongs to one of them. A question in the wrong tool's list is the
   * fault that cost most of a week: "signal, or story?" is Tool 4's, and it was
   * being asked from Tool 1.
   */
  tool: number
  sort_order: number
  question_text: string
  question_type: QuestionType
  is_named: boolean
  target_fields: TargetField[]
  options: string[]
  suggested_minutes: number | null
  scale_min: number
  scale_max: number
}

/** The five parts of a question that a person edits, with the safe defaults. */
function q(seed: Partial<QuestionSeed> & {
  gate_id: string
  sort_order: number
  question_text: string
  question_type: QuestionType
}): QuestionSeed {
  return {
    tool: 1,
    is_named: seed.question_type === 'collect',
    target_fields: [],
    options: [],
    suggested_minutes: null,
    scale_min: 1,
    scale_max: 5,
    ...seed,
  }
}

// ============================================================
// TOOL 1's QUESTIONS, AND ONLY TOOL 1's. 14 August 2026.
//
// WHAT WAS WRONG, and it cost most of a week. This was one flat list of four
// questions spanning three different tools. Question 3 ranks grant dependency
// and question 4 is "signal, or story?" — which is Tool 4's board, by name, on
// the same screen. So pressing "next question" in Tool 1 walked the room
// straight into Tool 4's question, and Habib said so repeatedly before anyone
// looked at this file.
//
// AND THE FIRST TWO COMBINED SEVERAL ANSWERS INTO ONE SUBMISSION. One
// submission carries one set of values, so a room could never give two things
// an activity delivers, or two people who pay for it. Splitting one variable
// per question is not a matter of wording: it is the only way the multiplicity
// Habib has asked for repeatedly can exist at all. Send "Skills", send
// "Knowledge" — two answers, both attached, "+ add" arriving from the room
// instead of being typed into the block afterwards.
//
// THE ORDER IS THE SESSION'S OWN ORDER. The problem the service solves, then
// the activity that solves it, then what that activity delivers, who pays, the
// assumption held, and what would prove that assumption wrong.
//
// THE SERVICE IS NEVER ASKED. The room is anchored to one service, its name is
// on every phone above the question, and asking people to type it produced
// "Workshop" for a service anchored as "Gender Workshop" — two names for one
// thing, joined by nothing.
//
// Tool 1 writes into gtcv_assumptions, whose columns are activity, delivers,
// who_pays, assumption and disproof. The problem writes to the problem table
// instead, which is why it carries the problem column and is handled apart in
// the facilitate route.
// ============================================================
const CLEARING_THE_GROUND: QuestionSeed[] = [
  q({
    gate_id: 'phase_0',
    sort_order: 1,
    question_text: 'What problem does this service solve?',
    question_type: 'collect',
    suggested_minutes: 6,
    target_fields: [
      { column: 'problem', heading: 'The problem' },
    ],
  }),
  q({
    gate_id: 'phase_0',
    sort_order: 2,
    question_text: 'Name one activity that solves that problem.',
    question_type: 'collect',
    suggested_minutes: 6,
    target_fields: [
      { column: 'activity', heading: 'The activity' },
    ],
  }),
  q({
    gate_id: 'phase_0',
    sort_order: 3,
    question_text: 'What does that activity deliver?',
    question_type: 'collect',
    suggested_minutes: 5,
    target_fields: [
      { column: 'delivers', heading: 'What it delivers' },
    ],
  }),
  q({
    gate_id: 'phase_0',
    sort_order: 4,
    question_text: 'Who pays for it today?',
    question_type: 'collect',
    suggested_minutes: 4,
    target_fields: [
      { column: 'who_pays', heading: 'Who pays' },
    ],
  }),
  q({
    gate_id: 'phase_0',
    sort_order: 5,
    question_text: 'What has to be true for this to work?',
    question_type: 'collect',
    suggested_minutes: 5,
    target_fields: [
      { column: 'assumption', heading: 'The assumption underneath' },
    ],
  }),
  q({
    gate_id: 'phase_0',
    sort_order: 6,
    question_text: 'What would prove that wrong?',
    question_type: 'collect',
    suggested_minutes: 5,
    target_fields: [
      { column: 'disproof', heading: 'What would prove it wrong' },
    ],
  }),
]

// ============================================================
// TOOL 2's QUESTIONS. 15 August 2026.
//
// Tool 2 does not ask what the problem is. It already has it: Tool 1 stated it,
// under the same service, and Tool 2 opens with those rows filled in. Asking a
// room to restate the problem is how the two tools end up with two versions of
// it and no way to say which one is real.
//
// So all five of these DESCRIBE a problem already on the table, and accepting
// one FILLS that problem's row — the mode is in src/lib/stage1-accept.ts and
// the columns are the five of gtcv_problem_owner_budget.
//
// ONE VARIABLE PER QUESTION, for the same mechanical reason as Tool 1: one
// submission carries one set of values, so a combined question makes two
// answers impossible. "Who is accountable and who holds the budget" is two
// questions, and in most organisations two different people, which is the
// whole point of asking.
//
// THE PROBLEM IS NEVER ASKED IN THE ROOM QUESTION, the same way the service is
// never asked in Tool 1's. The room is working through one problem, its words
// are on the wall above the question, and asking people to retype it produces
// two names for one thing joined by nothing.
//
// The rule Tool 2 exists to enforce: a problem with no budget holder is
// paused. Question 3 is the one that decides it.
// ============================================================
const PROBLEM_OWNER_BUDGET: QuestionSeed[] = [
  q({
    gate_id: 'phase_0',
    tool: 2,
    sort_order: 11,
    question_text: 'Who actually experiences this problem?',
    question_type: 'collect',
    suggested_minutes: 5,
    target_fields: [
      { column: 'experienced_by', heading: 'Who experiences it' },
    ],
  }),
  q({
    gate_id: 'phase_0',
    tool: 2,
    sort_order: 12,
    question_text: 'Who inside the organisation is accountable for it?',
    question_type: 'collect',
    suggested_minutes: 5,
    target_fields: [
      { column: 'accountable', heading: 'Who is accountable' },
    ],
  }),
  q({
    gate_id: 'phase_0',
    tool: 2,
    sort_order: 13,
    question_text: 'Who controls the budget that would pay to solve it?',
    question_type: 'collect',
    suggested_minutes: 6,
    target_fields: [
      { column: 'budget_holder', heading: 'Who controls the budget' },
    ],
  }),
  q({
    gate_id: 'phase_0',
    tool: 2,
    sort_order: 14,
    question_text: 'What does it cost them to leave this problem unsolved?',
    question_type: 'collect',
    suggested_minutes: 6,
    target_fields: [
      { column: 'cost_of_not_solving', heading: 'Cost of not solving it' },
    ],
  }),
  q({
    gate_id: 'phase_0',
    tool: 2,
    sort_order: 15,
    question_text: 'Through what mechanism would that money actually be released?',
    question_type: 'collect',
    suggested_minutes: 6,
    target_fields: [
      { column: 'budget_mechanism', heading: 'Budget mechanism' },
    ],
  }),
]

// DP01 writes into gtcv_service_inventory, whose columns are service_name,
// what_it_delivers, logic_type, has_demand, hidden_delivery_costs,
// delivery_quality_risk and decision.
const SERVICE_REALITY: QuestionSeed[] = [
  q({
    gate_id: 'dp01',
    sort_order: 1,
    question_text: 'Name one service this organisation delivers today, and say what the buyer actually receives.',
    question_type: 'collect',
    suggested_minutes: 8,
    target_fields: [
      { column: 'service_name', heading: 'Service' },
      { column: 'what_it_delivers', heading: 'What it delivers' },
    ],
  }),
  q({
    gate_id: 'dp01',
    sort_order: 2,
    question_text: 'What does this service cost us that the budget does not show?',
    question_type: 'collect',
    suggested_minutes: 6,
    target_fields: [
      { column: 'hidden_delivery_costs', heading: 'Hidden delivery costs' },
      { column: 'delivery_quality_risk', heading: 'What could go wrong at real volume' },
    ],
  }),
  q({
    gate_id: 'dp01',
    sort_order: 3,
    question_text: 'Does this service exist because a donor funds it, or because a customer buys it?',
    question_type: 'classify',
    suggested_minutes: 4,
    options: ['Grant', 'Market', 'Mixed', 'Unclear'],
  }),
  q({
    gate_id: 'dp01',
    sort_order: 4,
    question_text: 'How much genuine demand is there for this service, setting the grant aside?',
    question_type: 'score',
    suggested_minutes: 3,
    scale_min: 1,
    scale_max: 5,
  }),
]

/**
 * The starting set for a block, or an empty list where Stage 1 defines none.
 *
 * R4: the nine other blocks return nothing, and that is a correct answer rather
 * than a missing one.
 */
export function startingQuestionSet(gateId: string): QuestionSeed[] {
  if (gateId === 'phase_0') return [...CLEARING_THE_GROUND, ...PROBLEM_OWNER_BUDGET]
  if (gateId === 'dp01') return SERVICE_REALITY
  return []
}

/**
 * The starting set for ONE TOOL of a block.
 *
 * A block that already has questions is never re-seeded, which is right — they
 * are rows and somebody may have edited them. But a block that has Tool 1's
 * questions and has never had Tool 2's is not "already seeded" for Tool 2, and
 * without this every engagement that opened Phase 0 before today would need its
 * new questions inserting by hand.
 */
export function startingQuestionSetForTool(gateId: string, tool: number): QuestionSeed[] {
  return startingQuestionSet(gateId).filter((s) => s.tool === tool)
}

/** Every tool of a block that has a starting set. */
export function toolsWithQuestions(gateId: string): number[] {
  return Array.from(new Set(startingQuestionSet(gateId).map((s) => s.tool))).sort((a, b) => a - b)
}

/**
 * What each tool is called, for the screen at the front of the room.
 *
 * The wall showed the question and nothing else, so nobody in the room could
 * tell which tool it belonged to — and with Phase 0's eleven questions on one
 * block, neither could the facilitator choosing one.
 */
export const TOOL_NAMES: Record<number, string> = {
  1: 'Assumption Dump Canvas',
  2: 'Problem Owner Budget Matrix',
  3: 'Hypothesis Shortlist',
  4: 'Signal vs Story',
  5: 'Continue / Pause / Kill',
}

/** The blocks Stage 1 gives questions to. */
export const BLOCKS_WITH_QUESTIONS = ['phase_0', 'dp01']

/** Shown beside "Run this with the room" on a block that has none (Q8). */
export const NO_QUESTIONS_YET = 'No questions have been set up for this block yet.'
