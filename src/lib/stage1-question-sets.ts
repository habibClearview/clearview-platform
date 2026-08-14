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
  if (gateId === 'phase_0') return CLEARING_THE_GROUND
  if (gateId === 'dp01') return SERVICE_REALITY
  return []
}

/** The blocks Stage 1 gives questions to. */
export const BLOCKS_WITH_QUESTIONS = ['phase_0', 'dp01']

/** Shown beside "Run this with the room" on a block that has none (Q8). */
export const NO_QUESTIONS_YET = 'No questions have been set up for this block yet.'
