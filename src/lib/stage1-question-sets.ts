// ============================================================
// THE QUESTION SETS FOR THE TWO BLOCKS STAGE 1 COVERS (R4)
//
// R1 says a Question is stored as data, not written into a page. So these are
// not the questions: they are the STARTING SET that gets written into
// gtcv_questions for an engagement, after which they are rows like any other
// and can be edited without touching this file.
//
// R4 defines sets for two blocks only, "Clearing the ground" and "Decision Point 1 Service
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

// Decision Point 1 writes into gtcv_service_inventory, whose columns are service_name,
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
 * A block with no set returns nothing, and that is a correct answer rather than
 * a missing one. It is not, however, a permanent one: Decision Point 9 read as
 * "no questions have been set up for this block" for months while the six fit
 * tests it is entirely about sat in another file, and nobody had noticed
 * because the answer looked deliberate.
 */
export function startingQuestionSet(gateId: string): QuestionSeed[] {
  return SETS[gateId] || []
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

// ============================================================
// EVERY OTHER BLOCK, SO NOTHING IS GREYED OUT
//
// Habib, 17 September 2026: "All sessions should be able to run in the room so
// there should be nothing greyed out saying there is no question set." And,
// before that: "the run in the room button is not just about questions, it is
// about participation. There are decision points that are not question driven
// but participants writing ideas, sentences and suggestions. These should
// appear on the page that is projected in the room, it can then be discussed
// and rephrased on the projected board and then finalised by saving. Decision
// points 4, 5, 6 and so on are not necessarily questions but brainstorming
// sessions."
//
// He is describing the collect type, which has existed all along. A collect
// question puts a box in front of every person in the room, their words arrive
// on the projected board, the room argues about them, and Accept writes the
// agreed wording into the block's own table. That is brainstorming. What was
// missing was not the machinery but the prompts: nobody had written them for
// these blocks, so the room was told there was nothing to ask.
//
// ONE VARIABLE PER QUESTION. This is the rule that cost most of a week when it
// was broken (see the note on Tool 1 above). A prompt asking for a segment and
// its budget holder together can only ever produce one of each; asked
// separately, the room can send three segments and five budget holders, and
// "+ add" arrives from the floor instead of being typed in afterwards.
//
// THE COLUMNS ARE REAL. Each target column below exists on the block's own
// table and is a text column, because that is what a person types into a box.
// Numbers, dates and yes/no live on the block's table and are set there, where
// the format can be checked.
// ============================================================

// The three questions asked of the Executive Director, with the funder in the
// room, before Decision Point 1 can open. They are answered out loud and the
// answers are written down verbatim, so these carry no target column: the
// record goes on the Pre-engagement diagnostic tab, where it is signed.
const PRE_ENGAGEMENT: QuestionSeed[] = [
  q({
    gate_id: 'setup', sort_order: 1, suggested_minutes: 10,
    question_text: 'What does commercial success look like for your organisation in 18 months?',
    question_type: 'collect',
  }),
  q({
    gate_id: 'setup', sort_order: 2, suggested_minutes: 10,
    question_text: 'What is the biggest thing stopping you from earning commercial revenue right now?',
    question_type: 'collect',
  }),
  q({
    gate_id: 'setup', sort_order: 3, suggested_minutes: 10,
    question_text: 'What would have to be true for your organisation to stop needing grant funding?',
    question_type: 'collect',
  }),
]

// DECISION POINT 2, the opening plenary on customer segments. The guide:
// "Map segments from the revenue ready inventory. Separate paying clients from
// clients and programme officers. Name the budget holder for each segment."
// Lands in gtcv_customer_segments.
const CUSTOMER_CLARITY: QuestionSeed[] = [
  q({
    gate_id: 'dp02', sort_order: 1, suggested_minutes: 8,
    question_text: 'Name one group of organisations that might pay for this service. One group per answer, and send as many as you can think of.',
    question_type: 'collect',
    target_fields: [{ column: 'segment_name', heading: 'The group' }],
  }),
  q({
    gate_id: 'dp02', sort_order: 2, suggested_minutes: 8,
    question_text: 'In their words, not ours: what problem does that group have? Write the sentence you have actually heard one of them say.',
    question_type: 'collect',
    target_fields: [{ column: 'problem_in_their_words', heading: 'The problem, in their words' }],
  }),
  q({
    gate_id: 'dp02', sort_order: 3, suggested_minutes: 6,
    question_text: 'Who in that organisation holds the budget for this? Name the person, not the department.',
    question_type: 'collect',
    target_fields: [{ column: 'budget_holder_name', heading: 'Who holds the budget' }],
  }),
  q({
    gate_id: 'dp02', sort_order: 4, suggested_minutes: 5,
    question_text: 'What is that person job title?',
    question_type: 'collect',
    target_fields: [{ column: 'budget_holder_role', heading: 'Their job title' }],
  }),
  q({
    gate_id: 'dp02', sort_order: 5, suggested_minutes: 6,
    question_text: 'How badly does this group feel the problem today? 1 is they can live with it, 5 is it is costing them money right now.',
    question_type: 'score',
  }),
]

// DECISION POINT 3, the value proposition workshop. The guide: "Build the four
// components using the exact language clients used in Decision Point 2." Lands
// in gtcv_propositions.
const VALUE_PROPOSITION: QuestionSeed[] = [
  q({
    gate_id: 'dp03', sort_order: 1, suggested_minutes: 8,
    question_text: 'What can we actually do for this group? One capability per answer, and only what we can do today.',
    question_type: 'collect',
    target_fields: [{ column: 'capability', heading: 'What we can do' }],
  }),
  q({
    gate_id: 'dp03', sort_order: 2, suggested_minutes: 8,
    question_text: 'Which of their problems does that solve? Use the words they used, not ours.',
    question_type: 'collect',
    target_fields: [{ column: 'problem', heading: 'The problem it solves' }],
  }),
  q({
    gate_id: 'dp03', sort_order: 3, suggested_minutes: 8,
    question_text: 'What is different for them afterwards? Write the change they would notice, not the activity we delivered.',
    question_type: 'collect',
    target_fields: [{ column: 'outcome', heading: 'What changes for them' }],
  }),
  q({
    gate_id: 'dp03', sort_order: 4, suggested_minutes: 8,
    question_text: 'Why would they choose us over anyone else doing this? Be honest. If there is no good answer, say so.',
    question_type: 'collect',
    target_fields: [{ column: 'reason_to_choose', heading: 'Why us' }],
  }),
  q({
    gate_id: 'dp03', sort_order: 5, suggested_minutes: 6,
    question_text: 'What proof do we have that we can do this? Name something a client could check.',
    question_type: 'collect',
    target_fields: [{ column: 'credibility_signal', heading: 'The proof' }],
  }),
]

// DECISION POINT 4, cost mapping. The guide runs three sessions across five
// categories, finance and leadership only, with the field team validating
// delivery time separately and never seeing the totals. The room names the
// cost lines; the actual figures are typed into the table, where the format is
// checked. Lands in gtcv_cost_lines.
const VIABILITY: QuestionSeed[] = [
  q({
    gate_id: 'dp04', sort_order: 1, suggested_minutes: 8,
    question_text: 'Name one thing we pay for in order to deliver this service. One per answer. Nothing is too small.',
    question_type: 'collect',
    target_fields: [{ column: 'item', heading: 'What we pay for' }],
  }),
  q({
    gate_id: 'dp04', sort_order: 2, suggested_minutes: 5,
    question_text: 'Which kind of cost is that? Direct labour, direct materials, travel and logistics, quality assurance, or overhead.',
    question_type: 'classify',
    options: ['Direct labour', 'Direct materials', 'Travel and logistics', 'Quality assurance', 'Overhead'],
    target_fields: [{ column: 'category', heading: 'Kind of cost' }],
  }),
  q({
    gate_id: 'dp04', sort_order: 3, suggested_minutes: 6,
    question_text: 'What is that cost counted in? Per day, per person, per trip, per delivery.',
    question_type: 'collect',
    target_fields: [{ column: 'unit', heading: 'Counted in' }],
  }),
  q({
    gate_id: 'dp04', sort_order: 4, suggested_minutes: 8,
    question_text: 'Name a cost we are currently carrying without counting it. Somebody time, an office, a vehicle, a subsidy nobody has written down.',
    question_type: 'collect',
    target_fields: [{ column: 'notes', heading: 'The uncounted cost' }],
  }),
]

// DECISION POINT 5, market entry. The guide builds a pipeline of "minimum 10
// target institutions with an outreach sequence", and debriefs the A/B message
// test in plenary. Lands in gtcv_pipeline.
const MARKET_ENTRY: QuestionSeed[] = [
  q({
    gate_id: 'dp05', sort_order: 1, suggested_minutes: 8,
    question_text: 'Name one organisation we should approach. One per answer, and send every one you can think of before we start choosing.',
    question_type: 'collect',
    target_fields: [{ column: 'organisation', heading: 'The organisation' }],
  }),
  q({
    gate_id: 'dp05', sort_order: 2, suggested_minutes: 6,
    question_text: 'Who do we know there, or who should we be trying to reach?',
    question_type: 'collect',
    target_fields: [{ column: 'contact_name', heading: 'The person' }],
  }),
  q({
    gate_id: 'dp05', sort_order: 3, suggested_minutes: 5,
    question_text: 'What is their job title?',
    question_type: 'collect',
    target_fields: [{ column: 'contact_role', heading: 'Their job title' }],
  }),
  q({
    gate_id: 'dp05', sort_order: 4, suggested_minutes: 6,
    question_text: 'What is the first thing we should do to reach them? One action, and one somebody could do this week.',
    question_type: 'collect',
    target_fields: [{ column: 'next_action', heading: 'First move' }],
  }),
  q({
    gate_id: 'dp05', sort_order: 5, suggested_minutes: 5,
    question_text: 'Who is going to do it? Name a person, not a team.',
    question_type: 'collect',
    target_fields: [{ column: 'owner', heading: 'Who does it' }],
  }),
]

// DECISION POINT 6, identity and partners. The guide: every current and
// potential partner categorised as referral, co-delivery, endorsement or
// conflict, and the conflicts named with a recommendation for each. Lands in
// gtcv_partner_map.
const IDENTITY_AND_PARTNERS: QuestionSeed[] = [
  q({
    gate_id: 'dp06', sort_order: 1, suggested_minutes: 8,
    question_text: 'Name one organisation we work with, or would like to. One per answer.',
    question_type: 'collect',
    target_fields: [{ column: 'partner_name', heading: 'The partner' }],
  }),
  q({
    gate_id: 'dp06', sort_order: 2, suggested_minutes: 5,
    question_text: 'What kind of relationship is that? They send us work, we deliver together, they vouch for us, or they compete with us.',
    question_type: 'classify',
    options: ['They send us work', 'We deliver together', 'They vouch for us', 'They compete with us'],
    target_fields: [{ column: 'partner_type', heading: 'Kind of relationship' }],
  }),
  q({
    gate_id: 'dp06', sort_order: 3, suggested_minutes: 6,
    question_text: 'What do they bring that we do not have?',
    question_type: 'collect',
    target_fields: [{ column: 'what_they_bring', heading: 'What they bring' }],
  }),
  q({
    gate_id: 'dp06', sort_order: 4, suggested_minutes: 6,
    question_text: 'What do they need from us in return?',
    question_type: 'collect',
    target_fields: [{ column: 'what_they_need', heading: 'What they need' }],
  }),
  q({
    gate_id: 'dp06', sort_order: 5, suggested_minutes: 8,
    question_text: 'How does being seen with them change how a paying client sees us? Say it plainly, including when the answer is that it makes us look like a grant project.',
    question_type: 'collect',
    target_fields: [{ column: 'positioning_effect', heading: 'How it makes us look' }],
  }),
]

// DECISION POINT 7, the pilot. Two iterations: in the first the coach leads
// the conversation with a real potential customer and the organisation
// observes; in the second the organisation pitches and the coach is the
// backstop. These are the debrief prompts, run straight after a session while
// everybody still remembers it. Lands in gtcv_pilot_sessions.
const PILOT: QuestionSeed[] = [
  q({
    gate_id: 'dp07', sort_order: 1, suggested_minutes: 8,
    question_text: 'Write down something the client actually said, in their words. Not what you think they meant.',
    question_type: 'collect',
    target_fields: [{ column: 'verbatim_responses', heading: 'What they said' }],
  }),
  q({
    gate_id: 'dp07', sort_order: 2, suggested_minutes: 6,
    question_text: 'Where did they lean in, and where did their attention drop away?',
    question_type: 'collect',
    target_fields: [{ column: 'obs_engagement', heading: 'Where they leaned in' }],
  }),
  q({
    gate_id: 'dp07', sort_order: 3, suggested_minutes: 6,
    question_text: 'What did they push back on, and how hard?',
    question_type: 'collect',
    target_fields: [{ column: 'obs_resistance', heading: 'What they pushed back on' }],
  }),
  q({
    gate_id: 'dp07', sort_order: 4, suggested_minutes: 6,
    question_text: 'What happened in the seconds after the price was said? Describe it, do not interpret it.',
    question_type: 'collect',
    target_fields: [{ column: 'obs_price_moment', heading: 'The price moment' }],
  }),
  q({
    gate_id: 'dp07', sort_order: 5, suggested_minutes: 6,
    question_text: 'What surprised you? Something you did not expect before we walked in.',
    question_type: 'collect',
    target_fields: [{ column: 'what_surprised_us', heading: 'What surprised us' }],
  }),
  q({
    gate_id: 'dp07', sort_order: 6, suggested_minutes: 8,
    question_text: 'What should we change before the next one? One change per answer.',
    question_type: 'collect',
    target_fields: [{ column: 'revision_recommended', heading: 'What to change' }],
  }),
  q({
    gate_id: 'dp07', sort_order: 7, suggested_minutes: 5,
    question_text: 'On what we saw today, how likely is this to sell? 1 is not at this price to this person, 5 is they were reaching for a pen.',
    question_type: 'score',
  }),
]

// DECISION POINT 8, scale. The guide: name the entry point segment and the
// scale segment, and work out what is needed to reach them "without programme
// facilitation. A route that runs only through the programme is not an
// independent channel." Lands in gtcv_channel_logic.
const SCALE: QuestionSeed[] = [
  q({
    gate_id: 'dp08', sort_order: 1, suggested_minutes: 8,
    question_text: 'Name a group we could grow into. One per answer.',
    question_type: 'collect',
    target_fields: [{ column: 'segment', heading: 'The group' }],
  }),
  q({
    gate_id: 'dp08', sort_order: 2, suggested_minutes: 5,
    question_text: 'Is that where we start, or where we grow to?',
    question_type: 'classify',
    options: ['Where we start', 'Where we grow to'],
    target_fields: [{ column: 'entry_or_scale', heading: 'Start or grow' }],
  }),
  q({
    gate_id: 'dp08', sort_order: 3, suggested_minutes: 8,
    question_text: 'How would we reach them? One route per answer.',
    question_type: 'collect',
    target_fields: [{ column: 'channel', heading: 'The route' }],
  }),
  q({
    gate_id: 'dp08', sort_order: 4, suggested_minutes: 8,
    question_text: 'Would that route still work if this programme ended tomorrow? If it only works because the funder opens the door, say so.',
    question_type: 'collect',
    target_fields: [{ column: 'channel_logic', heading: 'Does it work without the programme' }],
  }),
  q({
    gate_id: 'dp08', sort_order: 5, suggested_minutes: 6,
    question_text: 'What is the first thing we would have to do to make that route real?',
    question_type: 'collect',
    target_fields: [{ column: 'first_action', heading: 'First move' }],
  }),
]

// HANDOVER. The leadership team presents the commercial model unassisted, and
// the coach and the funder are evaluators rather than helpers. These are the
// five independence tests, scored by the room. The agreed score goes on the
// handover record in the block, which is where it is signed.
const HANDOVER: QuestionSeed[] = [
  q({
    gate_id: 'handover', sort_order: 1, scale_min: 1, scale_max: 5, suggested_minutes: 5,
    question_text: 'Can the team explain the pricing without help? 1 is they looked to the coach, 5 is they defended it themselves.',
    question_type: 'score',
  }),
  q({
    gate_id: 'handover', sort_order: 2, scale_min: 1, scale_max: 5, suggested_minutes: 5,
    question_text: 'Can they update the financial model themselves? 1 is not without the coach, 5 is they did it in front of us.',
    question_type: 'score',
  }),
  q({
    gate_id: 'handover', sort_order: 3, scale_min: 1, scale_max: 5, suggested_minutes: 5,
    question_text: 'Can they hold a customer conversation without the coach in the room? 1 is no, 5 is they already have.',
    question_type: 'score',
  }),
  q({
    gate_id: 'handover', sort_order: 4, scale_min: 1, scale_max: 5, suggested_minutes: 5,
    question_text: 'Can they reach a paying client without the programme opening the door? 1 is no, 5 is they have done it.',
    question_type: 'score',
  }),
  q({
    gate_id: 'handover', sort_order: 5, scale_min: 1, scale_max: 5, suggested_minutes: 5,
    question_text: 'Can they defend every decision in the model on the evidence behind it? 1 is no, 5 is any decision, on the spot.',
    question_type: 'score',
  }),
]

// ============================================================
// DECISION POINT 9: THE SIX FIT TESTS, SCORED BY THE ROOM
//
// Habib, 17 September 2026: "In decision point 9 the run in the room button
// says there are no questions, but there are six questions that must be
// answered by participants and scored. These are the questions that need to be
// there when running the room. The questions are answered individually,
// discussed and scores agreed, which is then recorded in the tab."
//
// The six are not new. They are the fit tests the Commercial Readiness
// Diagnostic has always scored, word for word from FIT_TESTS in
// ReadinessDiagnostic.tsx, and the 0 to 3 scale is that panel's own: 0 no
// evidence, 1 asserted, 2 evidenced, 3 proven. What was missing was simply
// that nobody had written them down as questions the room can be asked, so the
// block said no questions had been set up and the session was run from paper.
//
// EACH PERSON SCORES BEFORE ANYBODY ARGUES, which is the point of running it
// this way. Six separate questions rather than one, so the room's answers to
// "can delivery grow beyond the founder" arrive on their own and the spread is
// visible. The agreed score is then entered on the Commercial Readiness table
// in this block, because the score that counts is the one the room agreed and
// not the average of what people first thought.
const DP09: QuestionSeed[] = [
  q({
    gate_id: 'dp09', sort_order: 1, scale_min: 0, scale_max: 3, suggested_minutes: 4,
    question_text: 'Problem-Provider Fit. Do we have the capability and credibility to own this problem in this market?',
    question_type: 'score',
  }),
  q({
    gate_id: 'dp09', sort_order: 2, scale_min: 0, scale_max: 3, suggested_minutes: 4,
    question_text: 'Problem-Solution Fit. Does the service solve the problem as the client experiences it?',
    question_type: 'score',
  }),
  q({
    gate_id: 'dp09', sort_order: 3, scale_min: 0, scale_max: 3, suggested_minutes: 4,
    question_text: 'Solution-Customer Fit. Does it reach a decision maker with budget, not a client without one?',
    question_type: 'score',
  }),
  q({
    gate_id: 'dp09', sort_order: 4, scale_min: 0, scale_max: 3, suggested_minutes: 4,
    question_text: 'Solution-Pilot Fit. Is it testable in a real client environment inside the engagement window?',
    question_type: 'score',
  }),
  q({
    gate_id: 'dp09', sort_order: 5, scale_min: 0, scale_max: 3, suggested_minutes: 4,
    question_text: 'Solution-Market Fit. Is there a reachable segment that buys this, at the price it costs to deliver?',
    question_type: 'score',
  }),
  q({
    gate_id: 'dp09', sort_order: 6, scale_min: 0, scale_max: 3, suggested_minutes: 4,
    question_text: 'Solution-Scale Fit. Can delivery grow beyond the founder and the first client?',
    question_type: 'score',
  }),
]



/** Shown beside "Run this with the room" on a block that has none (Q8). */
export const NO_QUESTIONS_YET = 'No questions have been set up for this block yet.'

/** Every block, and what the room is asked in it. */
const SETS: Record<string, QuestionSeed[]> = {
  setup: PRE_ENGAGEMENT,
  phase_0: [...CLEARING_THE_GROUND, ...PROBLEM_OWNER_BUDGET],
  dp01: SERVICE_REALITY,
  dp02: CUSTOMER_CLARITY,
  dp03: VALUE_PROPOSITION,
  dp04: VIABILITY,
  dp05: MARKET_ENTRY,
  dp06: IDENTITY_AND_PARTNERS,
  dp07: PILOT,
  dp08: SCALE,
  dp09: DP09,
  handover: HANDOVER,
}

/**
 * The blocks that can be run with the room, which is now all of them.
 *
 * Habib, 17 September 2026: "All sessions should be able to run in the room so
 * there should be nothing greyed out saying there is no question set." Derived
 * from the sets rather than typed out beside them, so the two can never
 * disagree: a block has questions exactly when it has questions.
 */
export const BLOCKS_WITH_QUESTIONS = Object.keys(SETS)
