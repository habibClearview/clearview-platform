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

// Clearing the ground writes into gtcv_assumptions, whose columns are
// service_name, activity, delivers, who_pays, assumption and disproof.
const CLEARING_THE_GROUND: QuestionSeed[] = [
  q({
    gate_id: 'phase_0',
    sort_order: 1,
    question_text: 'What does this organisation actually do? Name one activity, and the service it sits under.',
    question_type: 'collect',
    suggested_minutes: 8,
    target_fields: [
      { column: 'service_name', heading: 'Service' },
      { column: 'activity', heading: 'Activity' },
      { column: 'delivers', heading: 'What it delivers' },
      { column: 'who_pays', heading: 'Who pays for it today' },
    ],
  }),
  q({
    gate_id: 'phase_0',
    sort_order: 2,
    question_text: 'What are we assuming is true about this activity, that we have never actually checked?',
    question_type: 'collect',
    suggested_minutes: 6,
    target_fields: [
      { column: 'assumption', heading: 'The assumption underneath it' },
      { column: 'disproof', heading: 'What would prove it wrong' },
    ],
  }),
  q({
    gate_id: 'phase_0',
    sort_order: 3,
    question_text: 'If the grant stopped tomorrow, how likely is it that someone would still pay for this activity?',
    question_type: 'score',
    suggested_minutes: 3,
    scale_min: 1,
    scale_max: 5,
  }),
  q({
    gate_id: 'phase_0',
    sort_order: 4,
    question_text: 'Is what we have just heard a signal, or a story?',
    question_type: 'classify',
    suggested_minutes: 4,
    options: ['Signal', 'Story'],
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
