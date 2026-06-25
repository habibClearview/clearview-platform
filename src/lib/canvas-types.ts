// ============================================================
// IKORE CANVAS TYPES — Clearview Platform
// Canvas Coach | habibonifade.com
// ============================================================

export type CanvasRole = 'super_coach' | 'co_implementer' | 'ceo' | 'finance_manager' | 'team_member' | 'ignite_funder'

export type GateStatus =
  | 'locked'
  | 'not_started'
  | 'in_progress'
  | 'evidence_submitted'
  | 'ceo_signed'
  | 'coach_authorised'

export type EvidenceStatus = 'not_started' | 'in_progress' | 'submitted' | 'accepted' | 'queried'
export type EvidenceType = 'document' | 'interview' | 'observation' | 'financial_data' | 'other'
export type HypothesisStatus = 'holding' | 'confirmed' | 'rejected'
export type AssumptionRisk = 'high' | 'medium' | 'low'
export type ActorInfluence = 'high' | 'medium' | 'low'

// ─── PHASE IDENTIFIERS ───────────────────────────────────────
export type PhaseId = 'setup' | 'phase0' | 'dp01' | 'dp02' | 'dp03' | 'dp04' | 'dp05' | 'dp06' | 'dp07' | 'dp08' | 'dp09' | 'handover'

// ─── COMPONENT (5-LAYER) ─────────────────────────────────────
export interface CanvasComponent {
  id: string
  number: number
  title: string
  what_it_is: string
  why_it_matters: string
  action_trigger: string
  signal_to_look_for: string
  coach_guidance: string // hidden from client
}

// ─── DECISION POINT ──────────────────────────────────────────
export interface DecisionPoint {
  id: PhaseId
  number: string
  zone: string
  core_question: string
  good_answer: string
  weak_answer: string
  why_it_matters_for_ikore: string
  session_time: string
  components: CanvasComponent[]
}

// ─── EVIDENCE ENTRY ──────────────────────────────────────────
export interface EvidenceEntry {
  id: string          // E-001, E-002
  date: string
  phase: PhaseId
  type: EvidenceType
  description: string
  url: string
  uploaded_by: string
  status: EvidenceStatus
  linked_component?: string
}

// ─── INTERVIEW ───────────────────────────────────────────────
export interface InterviewCapture {
  id: string          // INT-001
  date: string
  phase: PhaseId
  respondent: string
  role: string
  organisation: string
  interviewer: string
  key_quotes: string
  observations: string
  follow_up: string
  evidence_ref: string
}

// ─── HYPOTHESIS ──────────────────────────────────────────────
export interface Hypothesis {
  id: string          // HYP-001
  phase: PhaseId
  date_formed: string
  hypothesis: string
  evidence_for: string
  evidence_against: string
  status: HypothesisStatus
  decision_made: string
}

// ─── CANVAS DECISION RECORD ──────────────────────────────────
export interface CanvasDecision {
  id: string          // CDR-001
  date: string
  phase: PhaseId
  decision: string
  made_by: string
  evidence_ref: string
  authorised_by: string
}

// ─── ASSUMPTION ──────────────────────────────────────────────
export interface Assumption {
  id: string
  assumption: string
  source: string
  risk: AssumptionRisk
  how_to_test: string
  outcome: string
}

// ─── STAKEHOLDER ─────────────────────────────────────────────
export interface Stakeholder {
  id: string
  actor: string
  role: string
  influence: ActorInfluence
  relationship: string
  action_needed: string
}

// ─── DATA GAP ────────────────────────────────────────────────
export interface DataGap {
  id: string
  data_needed: string
  why_it_matters: string
  how_to_get: string
  responsible: string
  status: string
}

// ─── READINESS QUESTION ──────────────────────────────────────
export interface ReadinessQuestion {
  id: string
  question: string
  answer: boolean | null
}

// ─── PILOT OBSERVATION ───────────────────────────────────────
export interface PilotObservation {
  id: string
  phase: PhaseId
  iteration: 1 | 2
  date: string
  client_name: string
  service_delivered: string
  went_well: string
  did_not_work: string
  client_feedback: string
  adjustments_made: string
  evidence_ref: string
}

// ─── HANDOVER TEST ───────────────────────────────────────────
export interface HandoverTest {
  id: string
  number: number
  test: string
  status: 'yes' | 'no' | 'partial' | 'not_assessed'
  evidence: string
  ceo_confirmed: boolean
  ceo_confirmed_date: string
}

// ─── GATE SIGN-OFF ───────────────────────────────────────────
export interface GateSignOff {
  phase: PhaseId
  status: GateStatus
  ceo_signed: boolean
  ceo_name: string
  ceo_date: string
  coach_authorised: boolean
  coach_note: string
  coach_date: string
}

// ─── COMPONENT EVIDENCE ──────────────────────────────────────
export interface ComponentEvidence {
  component_id: string
  description: string
  url: string
  evidence_ref: string
  status: EvidenceStatus
}

// ─── ENGAGEMENT TEAM MEMBER ──────────────────────────────────
export interface TeamMember {
  id: string
  name: string
  role: string
  organisation: string
  email: string
  notify: boolean
}

// ─── NOTIFICATION SETTINGS ───────────────────────────────────
export interface NotificationSettings {
  enabled: boolean
  recipients: {
    name: string
    email: string
    role: string
    notify_gate_signed: boolean
    notify_gate_authorised: boolean
    notify_evidence_submitted: boolean
    notify_dp_complete: boolean
  }[]
}

// ─── DIAGNOSTIC SCORE ────────────────────────────────────────
export interface DiagnosticScore {
  point: 'baseline' | 'midpoint' | 'final'
  date: string
  scores: Record<string, number>  // fit test id → score 1-5
  total: number
  notes: string
}

// ─── FULL ENGAGEMENT STATE ───────────────────────────────────
export interface CanvasEngagementState {
  // Setup
  engagement_title: string
  client_name: string
  programme: string
  funder: string
  lead_consultant: string
  start_date: string
  target_handover_date: string
  version: string
  sector: string
  registered_address: string
  file_links: { label: string; url: string }[]
  team: TeamMember[]
  notifications: NotificationSettings

  // Pre-engagement diagnostic
  diagnostic_q1: string
  diagnostic_q2: string
  diagnostic_q3: string
  diagnostic_signed_ceo: boolean
  diagnostic_signed_ceo_name: string
  diagnostic_signed_ceo_date: string
  diagnostic_signed_coach: boolean
  diagnostic_signed_coach_date: string

  // Phase 0 tools
  assumptions: Assumption[]
  stakeholders: Stakeholder[]
  data_gaps: DataGap[]
  readiness_answers: ReadinessQuestion[]
  commitment_signed: boolean
  commitment_signed_date: string

  // Per-phase evidence and tracking
  component_evidence: Record<string, ComponentEvidence>  // component_id → evidence
  gate_signoffs: Record<PhaseId, GateSignOff>

  // Evidence library
  evidence_library: EvidenceEntry[]

  // Interviews
  interviews: InterviewCapture[]

  // Hypotheses
  hypotheses: Hypothesis[]

  // Canvas decision record
  decisions: CanvasDecision[]

  // Pilot observations
  pilot_observations: PilotObservation[]

  // Handover
  handover_tests: HandoverTest[]

  // Commercial readiness diagnostic
  diagnostic_scores: DiagnosticScore[]
}

// ─── DEFAULT STATE ───────────────────────────────────────────
export const DEFAULT_HANDOVER_TESTS: HandoverTest[] = [
  { id: 'ht1', number: 1, test: 'Ikore can describe its paying customer clearly without consultant prompting', status: 'not_assessed', evidence: '', ceo_confirmed: false, ceo_confirmed_date: '' },
  { id: 'ht2', number: 2, test: 'Ikore can state its price and justify it without consultant prompting', status: 'not_assessed', evidence: '', ceo_confirmed: false, ceo_confirmed_date: '' },
  { id: 'ht3', number: 3, test: 'Ikore has booked at least one paying client independently', status: 'not_assessed', evidence: '', ceo_confirmed: false, ceo_confirmed_date: '' },
  { id: 'ht4', number: 4, test: 'Ikore has presented its commercial model to its leadership without consultant present', status: 'not_assessed', evidence: '', ceo_confirmed: false, ceo_confirmed_date: '' },
  { id: 'ht5', number: 5, test: 'Ikore has a documented 12-month plan that does not depend on grant funding', status: 'not_assessed', evidence: '', ceo_confirmed: false, ceo_confirmed_date: '' },
]

export const DEFAULT_READINESS_QUESTIONS: ReadinessQuestion[] = [
  { id: 'rq1', question: 'We know who our paying customers are (not just beneficiaries)', answer: null },
  { id: 'rq2', question: 'We have had direct conversations with at least 3 potential paying customers in the last 6 months', answer: null },
  { id: 'rq3', question: 'We can describe what problem we solve for a paying customer in one sentence', answer: null },
  { id: 'rq4', question: 'We have a price for at least one service', answer: null },
  { id: 'rq5', question: 'We know what it costs us to deliver our main service', answer: null },
  { id: 'rq6', question: 'We have at least one staff member who can lead business development', answer: null },
  { id: 'rq7', question: 'Our leadership team supports moving towards commercial revenue', answer: null },
  { id: 'rq8', question: 'We have time allocated for commercial viability work in the next 6 months', answer: null },
  { id: 'rq9', question: 'We are willing to test our services with real paying clients during this engagement', answer: null },
  { id: 'rq10', question: 'We understand that the goal is financial independence, not more grant funding', answer: null },
]

// ─── CANVAS DATA — ALL 9 DECISION POINTS ─────────────────────
export const CANVAS_DECISION_POINTS: DecisionPoint[] = [
  {
    id: 'dp01',
    number: 'DP01',
    zone: 'Zone 01 — Service Reality Audit',
    core_question: 'Which of our current services could a paying customer actually buy?',
    good_answer: 'Ikore can name 2 to 3 specific services, describe exactly who would pay for each, and explain why that person has the money and the reason to pay.',
    weak_answer: 'Ikore lists everything it currently does, including donor-funded activities, without distinguishing what a paying customer would value.',
    why_it_matters_for_ikore: 'Most LSPs have a mix of grant-logic services and market-logic services. This Decision Point separates them so you only invest commercial energy in services with real revenue potential.',
    session_time: '3 to 4 hours across two sessions',
    components: [
      { id: 'dp01_c1', number: 1, title: 'Service Inventory', what_it_is: 'A complete list of everything Ikore currently does, funded and unfunded.', why_it_matters: 'You cannot separate grant-logic from market-logic without first seeing everything on the table.', action_trigger: 'List every service or activity Ikore delivers. Include donor-funded work, fee-based work, and informal support you give for free.', signal_to_look_for: 'A list of 8 to 15 activities covering the full range of what Ikore does. Nothing left off because it seems too small.', coach_guidance: 'Push for completeness. Clients typically under-list informal services. Ask: what do you do that you are not paid for? What do people call you about?' },
      { id: 'dp01_c2', number: 2, title: 'Grant Logic vs Market Logic Sort', what_it_is: 'Each service is classified as grant-logic (exists because a donor pays for it) or market-logic (someone with budget authority would buy it).', why_it_matters: 'This is the most important sort in the engagement. It prevents energy being spent on services that cannot survive without subsidy.', action_trigger: 'For each service on your inventory, answer: if the donor stopped funding this tomorrow, would someone pay for it? Mark it grant-logic or market-logic.', signal_to_look_for: 'At least 2 services clearly in the market-logic column. If everything is grant-logic, that is critical information, not a failure.', coach_guidance: 'Expect resistance on this step. Clients emotionally attach to donor-funded work. Hold the line: the test is simple — would someone pay for it without being told to?' },
      { id: 'dp01_c3', number: 3, title: 'Service Delivery Evidence', what_it_is: 'For each market-logic service, what evidence exists that it has been delivered and that someone valued it?', why_it_matters: 'Services that have been delivered to real people with real problems are much closer to commercial than services that exist on paper.', action_trigger: 'For each market-logic service, find at least one piece of evidence: a report, a client record, a photo, a receipt, a testimonial.', signal_to_look_for: 'Evidence exists and can be retrieved. Services with no evidence need to be treated as hypothetical at this stage.', coach_guidance: 'Do not let clients count donor reports as evidence of service value. The question is whether the service receiver found it valuable, not whether the donor was satisfied.' },
      { id: 'dp01_c4', number: 4, title: 'Cost of Delivery', what_it_is: 'What does it actually cost Ikore to deliver each market-logic service once?', why_it_matters: 'You cannot price a service without knowing its cost. Most LSPs significantly underestimate because they exclude staff time and overhead.', action_trigger: 'For your top 2 market-logic services, estimate the direct cost of one delivery: staff time, materials, transport, any other variable cost.', signal_to_look_for: 'A number, even a rough one. The act of calculating surfaces assumptions that need testing.', coach_guidance: 'Full cost allocation comes in DP04. At this stage a directional estimate is enough. Push for staff time to be included — it is almost always excluded.' },
      { id: 'dp01_c5', number: 5, title: 'Service Readiness Assessment', what_it_is: 'How ready is each market-logic service for a real commercial transaction right now?', why_it_matters: 'Some services need significant development before they can be sold. Others are ready now. This shapes the engagement timeline.', action_trigger: 'Rate each market-logic service on readiness: Ready now (can be sold this month), Nearly ready (needs 1 to 2 months of development), Early stage (needs 3+ months).', signal_to_look_for: 'At least one service rated Ready now or Nearly ready. This becomes the pilot service in DP07.', coach_guidance: 'If nothing is rated ready, the engagement timeline needs to be recalibrated. Flag this to the programme manager before proceeding.' },
      { id: 'dp01_c6', number: 6, title: 'Competitor and Substitute Map', what_it_is: 'Who else provides similar services to similar customers? What do customers do if Ikore does not exist?', why_it_matters: 'Understanding competition prevents pricing too high and helps identify Ikore\'s real differentiation.', action_trigger: 'Name at least 3 other organisations or individuals who provide services similar to Ikore\'s top market-logic service. What do they charge?', signal_to_look_for: 'Real names, not categories. "Other NGOs" is not an answer. Specific organisations with known price points.', coach_guidance: 'Clients often say they have no competition. This is never true. Ask: what does the customer do if they cannot reach Ikore? That is the substitute.' },
      { id: 'dp01_c7', number: 7, title: 'Internal Capability Audit', what_it_is: 'Does Ikore have the staff skills, systems, and physical capacity to deliver the market-logic services at commercial volume?', why_it_matters: 'A service can have strong market demand but fail commercially because the organisation cannot scale delivery.', action_trigger: 'For your top market-logic service, list the capability requirements: skills needed, staff available, equipment needed, equipment available.', signal_to_look_for: 'Gaps are identified honestly. A capability gap is not a reason to drop the service, but it must be planned for.', coach_guidance: 'This step often surfaces HR sensitivities. Keep the conversation factual: what does delivery require, what does the organisation have?' },
      { id: 'dp01_c8', number: 8, title: 'Short-List of Commercial Services', what_it_is: 'From the full inventory, a short-list of 2 to 3 services that will be taken forward into the canvas.', why_it_matters: 'Focus is critical. Trying to commercialise everything produces nothing. The short-list is the foundation of the whole engagement.', action_trigger: 'Agree your short-list with your team. Write a one-sentence description of each service: what it is, who it is for, and what it costs.', signal_to_look_for: 'Short-list agreed and documented. Every team member can state the same 2 to 3 services without prompting.', coach_guidance: 'The short-list must be agreed collectively, not imposed by the CEO. Disagreement at this stage is critical information about internal alignment.' },
      { id: 'dp01_c9', number: 9, title: 'DP01 Summary and Commitment', what_it_is: 'A written summary of what was decided in DP01, signed by the CEO as the basis for proceeding to DP02.', why_it_matters: 'The summary creates a documented starting point that cannot be revised later without a formal decision record.', action_trigger: 'Write a one-page summary: what services are on the short-list, why, and what was learned about services that were not selected.', signal_to_look_for: 'Summary is specific, not generic. It describes Ikore\'s actual services, not a template.', coach_guidance: 'Review the summary before CEO sign-off. If it could apply to any LSP, it is not specific enough. Push for Ikore-specific language.' },
    ]
  },
  {
    id: 'dp02',
    number: 'DP02',
    zone: 'Zone 02 — Customer and Problem Clarity',
    core_question: 'Who will pay for our services, and what problem are we solving for them?',
    good_answer: 'Ikore can name a specific type of organisation or individual, describe the problem they experience in their own words, and confirm they have budget authority to purchase the solution.',
    weak_answer: 'Ikore describes a beneficiary population rather than a paying customer, or describes the problem in terms of what Ikore wants to solve rather than what the customer experiences.',
    why_it_matters_for_ikore: 'The single most common failure in LSP commercialisation is designing services for beneficiaries rather than for paying customers. This Decision Point ensures Ikore designs for the actor with budget authority.',
    session_time: '4 to 5 hours including customer visits',
    components: [
      { id: 'dp02_c1', number: 1, title: 'Beneficiary vs Paying Customer Distinction', what_it_is: 'A clear separation between who benefits from Ikore\'s services and who has the authority and motivation to pay for them.', why_it_matters: 'Conflating beneficiaries and customers produces services that are valued but not paid for.', action_trigger: 'For each short-listed service, ask: who benefits? Then ask separately: who would write the cheque? These may be different people or organisations.', signal_to_look_for: 'Ikore can name a paying customer who is distinct from the beneficiary, or confirm they are the same and explain why.', coach_guidance: 'This is often the most uncomfortable step. Clients resist the idea that the person who benefits is not the person who pays. Hold this distinction firmly.' },
      { id: 'dp02_c2', number: 2, title: 'Customer Profile', what_it_is: 'A detailed description of the paying customer: type of organisation, size, location, decision-making structure, budget cycle.', why_it_matters: 'A vague customer description produces vague service design. The more specific the profile, the more targeted the service.', action_trigger: 'Write a one-paragraph profile of your ideal paying customer. Include: type of organisation, size (staff or budget), where they operate, who makes purchasing decisions.', signal_to_look_for: 'Profile is specific enough that Ikore could name 5 real organisations that match it right now.', coach_guidance: 'Test the profile by asking: can you name 5 organisations that match this description? If not, it is too vague.' },
      { id: 'dp02_c3', number: 3, title: 'Problem Statement', what_it_is: 'A description of the problem the paying customer experiences, in their own words, not Ikore\'s.', why_it_matters: 'Services designed around the provider\'s perception of the problem frequently miss what the customer actually needs.', action_trigger: 'Write the customer\'s problem in the first person: "We struggle with..." or "We cannot..." Use language a customer would use, not sector jargon.', signal_to_look_for: 'A problem statement that a real customer would read and say "yes, that is our problem."', coach_guidance: 'The problem statement must come from customer conversations, not from Ikore\'s assumptions. If Ikore has not yet spoken to customers, this step cannot be completed honestly.' },
      { id: 'dp02_c4', number: 4, title: 'Budget Authority Confirmation', what_it_is: 'Evidence that the paying customer has the financial authority and motivation to purchase the service.', why_it_matters: 'A customer who values the service but has no budget or no authority to spend is not a commercial customer.', action_trigger: 'For your paying customer profile: confirm they have a budget line that could cover this service, and identify who in their organisation has authority to approve the purchase.', signal_to_look_for: 'A specific budget source (operating budget, programme budget, government line item) and a named decision-maker role.', coach_guidance: 'This often requires direct customer conversations. If Ikore cannot confirm budget authority from existing knowledge, it must be verified in customer visits.' },
      { id: 'dp02_c5', number: 5, title: 'Customer Validation Plan', what_it_is: 'A plan for direct conversations with at least 3 potential paying customers before DP02 closes.', why_it_matters: 'Every assumption made so far must be tested with real people. Desk research and internal discussion are not sufficient.', action_trigger: 'Identify 3 to 5 real organisations matching your customer profile. Plan brief conversations: who will you speak to, what will you ask, when will it happen?', signal_to_look_for: 'Named organisations, named contacts where possible, a date for the first conversation within 2 weeks.', coach_guidance: 'The lead consultant attends at least one customer validation conversation. Ensure this is scheduled before DP02 closes.' },
      { id: 'dp02_c6', number: 6, title: 'Customer Validation Results', what_it_is: 'What was learned from the customer validation conversations.', why_it_matters: 'Validation either confirms the customer profile and problem statement, or reveals adjustments needed before proceeding.', action_trigger: 'After completing validation conversations, record: what confirmed your assumptions, what surprised you, what you need to change in your customer profile or problem statement.', signal_to_look_for: 'At least one direct quote from a customer that validates (or challenges) the problem statement.', coach_guidance: 'Do not let clients summarise validation conversations without direct quotes. Paraphrased validation is unreliable.' },
      { id: 'dp02_c7', number: 7, title: 'Revised Customer Profile', what_it_is: 'The customer profile updated based on what was learned in validation conversations.', why_it_matters: 'The profile that enters DP03 must reflect real customer intelligence, not assumptions.', action_trigger: 'Revise your customer profile based on validation findings. Note what changed and why.', signal_to_look_for: 'The revised profile is more specific than the original. At least one thing changed based on customer feedback.', coach_guidance: 'If nothing changed after customer conversations, either the conversations were too shallow or the client is not updating honestly. Probe both possibilities.' },
      { id: 'dp02_c8', number: 8, title: 'Problem Prioritisation', what_it_is: 'Of all the problems the customer experiences, which one does Ikore\'s service address most directly?', why_it_matters: 'Customers have many problems. Ikore must address the one that creates the strongest motivation to pay.', action_trigger: 'From your customer conversations, list the top 3 problems the customer mentioned. Rank them by urgency and budget motivation. Confirm which one Ikore\'s service addresses.', signal_to_look_for: 'A clear first-ranked problem with evidence from customer conversations, and confirmation that Ikore\'s service addresses it directly.', coach_guidance: 'The ranked problem list should come from customers, not from Ikore\'s priorities. If they do not match, this is a design question that must be resolved before proceeding.' },
      { id: 'dp02_c9', number: 9, title: 'DP02 Summary and Commitment', what_it_is: 'A written summary of the validated customer profile and problem statement, signed by the CEO.', why_it_matters: 'This summary becomes the foundation for DP03 value proposition design. It cannot be changed without a formal decision record.', action_trigger: 'Write a one-page summary: who your paying customer is, what problem they have, and what you learned from validation conversations.', signal_to_look_for: 'Summary includes at least two direct customer quotes. Customer profile includes the name of at least one real organisation.', coach_guidance: 'Review before CEO sign-off. The summary must reflect what was actually learned, not what Ikore hoped to learn.' },
    ]
  },
  {
    id: 'dp03',
    number: 'DP03',
    zone: 'Zone 03 — Value Proposition Architecture',
    core_question: 'Why would this specific customer choose our service over any alternative?',
    good_answer: 'Ikore can articulate a clear, specific reason why their paying customer would choose them, grounded in the customer\'s problem and budget motivation, not in Ikore\'s capabilities or values.',
    weak_answer: 'Ikore describes its mission, experience, or technical capacity as its value proposition without connecting these to the customer\'s specific problem.',
    why_it_matters_for_ikore: 'A strong value proposition is the foundation of all pricing, marketing, and sales activity. Without it, Ikore cannot explain to a customer why they should pay.',
    session_time: '3 to 4 hours',
    components: [
      { id: 'dp03_c1', number: 1, title: 'Customer Gain and Pain Map', what_it_is: 'A structured map of what the paying customer is trying to achieve (gains) and what is getting in their way (pains).', why_it_matters: 'Value propositions that address real pains and enable real gains are far more compelling than capability statements.', action_trigger: 'List the top 3 gains your customer wants and the top 3 pains they experience. Use language from your customer validation conversations.', signal_to_look_for: 'Gains and pains are described in customer language, not Ikore\'s language. At least one should be surprising or non-obvious.', coach_guidance: 'Pull directly from validation conversation notes. If the list reads like it was written in a workshop without customer input, it is probably not accurate.' },
      { id: 'dp03_c2', number: 2, title: 'Value Proposition Statement', what_it_is: 'A single sentence that states who the service is for, what it does, and why it is different from alternatives.', why_it_matters: 'A clear value proposition statement is the anchor for all messaging, pricing, and service design decisions.', action_trigger: 'Write your value proposition: "For [customer profile], Ikore provides [service] that [specific outcome], unlike [alternative] which [limitation]."', signal_to_look_for: 'The statement could not apply to any other LSP. Every element is specific to Ikore\'s customer, service, and context.', coach_guidance: 'Test by substituting another LSP\'s name. If the statement still works, it is too generic. Push for specificity at every word.' },
      { id: 'dp03_c3', number: 3, title: 'Evidence of Value', what_it_is: 'Concrete evidence that Ikore has delivered the stated value to a paying or near-paying customer before.', why_it_matters: 'An asserted value proposition is weaker than a demonstrated one. Evidence transforms a claim into a proof point.', action_trigger: 'Find 1 to 2 examples of Ikore delivering this value: a case study, a client testimonial, a measurable outcome. Link to your Evidence Library.', signal_to_look_for: 'At least one piece of evidence that references a real client and a real outcome, with a number or specific result.', coach_guidance: 'Donor reports count only if they include client-level outcome data. Organisation-level reports are not evidence of individual client value.' },
      { id: 'dp03_c4', number: 4, title: 'Differentiation from Alternatives', what_it_is: 'A clear explanation of what makes Ikore\'s service different from what the customer can access from competitors or substitutes.', why_it_matters: 'Differentiation is the commercial justification for the price Ikore wants to charge. Without it, the customer has no reason to choose Ikore over a cheaper alternative.', action_trigger: 'For each competitor you identified in DP01, write one sentence explaining why a customer would choose Ikore over them.', signal_to_look_for: 'Differentiation is based on something real: a specific capability, a location advantage, a relationship, a track record. Not values or mission.', coach_guidance: '"We care more" and "We are more experienced" are not differentiators unless they translate into a specific, verifiable outcome the customer cares about.' },
      { id: 'dp03_c5', number: 5, title: 'Service Bundle Design', what_it_is: 'The service described as a concrete package: what is included, what is not included, and in what format it is delivered.', why_it_matters: 'An undefined service cannot be priced, sold, or consistently delivered. A bundle makes the service tangible to the customer.', action_trigger: 'Write a one-paragraph service description as if it were a product on a shelf: what the customer gets, how it is delivered, how long it takes, what they need to provide.', signal_to_look_for: 'Description is specific enough that two different staff members would deliver the same service without further guidance.', coach_guidance: 'Push for process clarity. Vague descriptions ("we provide advisory support") hide ambiguity that will cause problems in delivery and pricing.' },
      { id: 'dp03_c6', number: 6, title: 'Willingness to Pay Test', what_it_is: 'A direct test of whether the customer is willing to pay for the service at a price that covers Ikore\'s costs.', why_it_matters: 'Willingness to pay cannot be assumed. It must be tested with real customers before service design is finalised.', action_trigger: 'In your next customer conversation, tell them the service and ask: "What would this be worth to your organisation?" Note their answer verbatim.', signal_to_look_for: 'At least one customer has named a figure or confirmed they have budget. Even a qualified "yes, if the price is right" is valuable.', coach_guidance: 'Do not ask "would you pay for this?" Ask "what would this be worth to you?" The second question gets a more honest answer.' },
      { id: 'dp03_c7', number: 7, title: 'Service Tiers', what_it_is: 'At least two versions of the service at different price points and scope levels.', why_it_matters: 'Tiering allows Ikore to serve customers with different budgets and needs, and provides an upsell pathway.', action_trigger: 'Define an Entry tier (minimum viable service, lowest price) and a Standard tier (full service, full price). Describe what is included in each.', signal_to_look_for: 'Two tiers with clear differences in scope and clear price difference. Not the same service with a different label.', coach_guidance: 'A Premium tier can be added in DP04 once costing is complete. For now, Entry and Standard are sufficient.' },
      { id: 'dp03_c8', number: 8, title: 'Customer Outcome Statement', what_it_is: 'A measurable statement of what the customer can expect to achieve after receiving Ikore\'s service.', why_it_matters: 'Outcome statements are the most powerful sales tool an LSP has. They transform a service description into a promise.', action_trigger: 'Write an outcome statement for each service tier: "After completing [service], your organisation will be able to [specific, measurable outcome]."', signal_to_look_for: 'Outcomes are specific and verifiable. "You will be better able to manage your finances" is not an outcome. "You will have a 12-month cash flow projection signed off by your board" is.', coach_guidance: 'Connect outcome statements to the customer\'s problem statement from DP02. The outcome should directly address the priority problem.' },
      { id: 'dp03_c9', number: 9, title: 'DP03 Summary and Commitment', what_it_is: 'A written summary of the agreed value proposition, service bundle, and tiers, signed by the CEO.', why_it_matters: 'This summary enters DP04 as the basis for pricing. It cannot be changed without a formal decision record.', action_trigger: 'Write a one-page summary: value proposition statement, service bundle description, tiers, willingness-to-pay evidence.', signal_to_look_for: 'Summary is specific, evidence-based, and agreed by the team. CEO sign-off confirms readiness to proceed to pricing.', coach_guidance: 'Review against the customer profile from DP02. The value proposition must speak directly to the customer who was validated there.' },
    ]
  },
  {
    id: 'dp04',
    number: 'DP04',
    zone: 'Zone 04 — Commercial Viability Model',
    core_question: 'Can we deliver this service at a price the customer will pay and a volume that sustains the organisation?',
    good_answer: 'Ikore has a financial model showing cost of delivery, a price at or above cost-recovery, a break-even volume, and a 36-month projection with realistic assumptions.',
    weak_answer: 'Ikore has a budget or a donor report but no model that connects price, volume, and cost to produce a break-even calculation.',
    why_it_matters_for_ikore: 'Commercial viability is the point of the entire engagement. Without a working financial model, all the design work in DP01-03 remains theoretical.',
    session_time: '5 to 6 hours including model build',
    components: [
      { id: 'dp04_c1', number: 1, title: 'Full Cost of Delivery', what_it_is: 'The total cost of delivering one unit of each service, including direct costs, staff time, overhead allocation, and depreciation.', why_it_matters: 'Pricing below full cost produces a service that destroys value every time it is delivered.', action_trigger: 'For each service tier, calculate: direct materials, staff hours at cost, transport, overhead share (minimum 20% of direct costs). Sum these to a cost per delivery.', signal_to_look_for: 'A number that includes staff time. A cost figure without staff time is incomplete.', coach_guidance: 'Use the Clearview financial model for this calculation. The model handles overhead allocation automatically once inputs are entered.' },
      { id: 'dp04_c2', number: 2, title: 'Pricing Decision', what_it_is: 'The price for each service tier, set above cost of delivery and within the willingness-to-pay range confirmed in DP03.', why_it_matters: 'Price is the mechanism that converts value into revenue. It must be defensible to the customer and sustainable for Ikore.', action_trigger: 'Set a price for each tier. Check: is the price above your full cost of delivery? Is it within the range a customer indicated they would pay?', signal_to_look_for: 'Price per tier confirmed, margin calculated (price minus cost), margin is positive.', coach_guidance: 'If the margin is negative, there are three options: reduce cost, increase price, or drop the tier. All three need to be discussed before proceeding.' },
      { id: 'dp04_c3', number: 3, title: 'Break-Even Volume', what_it_is: 'The minimum number of service deliveries per month or per year needed for Ikore\'s revenue to cover its total costs.', why_it_matters: 'Break-even volume tells Ikore whether the commercial model is achievable given the size of the market.', action_trigger: 'Using your financial model, calculate: how many service deliveries per month are needed to cover all costs? Is this achievable in the market?', signal_to_look_for: 'A specific number, and a judgment about whether the market can support that volume.', coach_guidance: 'If break-even volume exceeds apparent market size, the model is not viable. This must be addressed before CEO sign-off.' },
      { id: 'dp04_c4', number: 4, title: '36-Month Revenue Projection', what_it_is: 'A month-by-month projection of revenue, costs, and surplus or deficit over 36 months, with clearly stated assumptions.', why_it_matters: 'A 36-month view reveals the trajectory: when does Ikore break even, when does it generate surplus, and what are the critical risk points?', action_trigger: 'Build the 36-month projection in the Clearview financial model. State your assumptions: how many clients per month, price, growth rate.', signal_to_look_for: 'Projection shows break-even within 18 months. If it does not, the assumptions or the model need to be revisited.', coach_guidance: 'Check that assumptions are conservative, not optimistic. A projection that assumes 100% capacity utilisation from month one is not credible.' },
      { id: 'dp04_c5', number: 5, title: 'Funding Gap Analysis', what_it_is: 'The difference between projected commercial revenue and total costs during the transition period, and how that gap will be funded.', why_it_matters: 'Most organisations cannot go from zero commercial revenue to full cost recovery immediately. The gap must be planned for, not ignored.', action_trigger: 'Calculate your funding gap for each of the first 12 months. Identify possible sources: remaining grant funding, bridge finance, cost reductions.', signal_to_look_for: 'Gap is quantified and a credible funding source is identified for each month. Gaps without a funding source are risks that must be flagged.', coach_guidance: 'Do not allow clients to assume the gap will be covered by "new grants." That is grant logic, not commercial planning.' },
      { id: 'dp04_c6', number: 6, title: 'Scenario Analysis', what_it_is: 'Three versions of the financial model: Conservative (70% of assumed volume), Base (assumed volume), Optimistic (130% of assumed volume).', why_it_matters: 'Single-scenario models are fragile. Scenario analysis reveals the range of outcomes and the conditions under which the model fails.', action_trigger: 'Run the Conservative, Base, and Optimistic scenarios in your financial model. In which scenario does the model break even? In which does it fail?', signal_to_look_for: 'The model survives in at least the Base scenario. If it only survives in Optimistic, the model is too fragile to proceed.', coach_guidance: 'Use the Clearview scenarios function. Ensure Conservative uses 70% volume, not 70% price. Price changes affect margin differently to volume changes.' },
      { id: 'dp04_c7', number: 7, title: 'Capital Requirements', what_it_is: 'Any upfront investment needed to deliver the service at commercial volume: equipment, systems, training, working capital.', why_it_matters: 'Some services require investment before they can generate revenue. This investment must be planned and funded.', action_trigger: 'List any capital investment needed to scale delivery to break-even volume. Estimate the cost. Identify whether it will be funded by grant, loan, or equity.', signal_to_look_for: 'Capital requirements are quantified and a funding source is identified. Unfunded capital requirements are blockers.', coach_guidance: 'Include working capital (cash needed to cover costs before revenue is received). This is frequently underestimated.' },
      { id: 'dp04_c8', number: 8, title: 'Financial Model Review', what_it_is: 'A review of the full financial model by the CEO and Finance Manager, confirming it is accurate and understood.', why_it_matters: 'A financial model that only the consultant understands is not a commercial viability model. The leadership must own it.', action_trigger: 'Present the financial model to your CEO and Finance Manager. Ask them to explain the break-even calculation back to you without prompting.', signal_to_look_for: 'CEO and Finance Manager can explain: what the break-even volume is, what would change it, and what the key assumptions are.', coach_guidance: 'The presentation test is the most important indicator of whether the engagement has achieved ownership transfer. Do not skip it.' },
      { id: 'dp04_c9', number: 9, title: 'DP04 Summary and Commitment', what_it_is: 'A written summary of the commercial viability model: cost, price, break-even, projection, and scenarios, signed by the CEO.', why_it_matters: 'CEO sign-off on the financial model confirms that the organisation is committing to a commercially viable service, not just a donor-fundable one.', action_trigger: 'Produce a one-page summary of the financial model findings. CEO signs to confirm the model is understood and accepted as the basis for market entry.', signal_to_look_for: 'Summary is specific. Includes the break-even number, the price, and the conservative scenario outcome.', coach_guidance: 'Do not allow a summary that says "see attached model." The one-pager must stand alone as a readable summary.' },
    ]
  },
  {
    id: 'dp05',
    number: 'DP05',
    zone: 'Zone 05 — Market Entry Design',
    core_question: 'How will we reach and convert our first paying customers?',
    good_answer: 'Ikore has a specific plan for reaching the first 5 paying customers: which channels, what message, what sequence of contact, and who is responsible.',
    weak_answer: 'Ikore describes broad outreach activities (workshops, social media, networking) without a specific conversion plan or responsibility assignment.',
    why_it_matters_for_ikore: 'Market entry is where commercial models succeed or fail. Without a specific, assigned plan, the financial model remains theoretical.',
    session_time: '3 to 4 hours',
    components: [
      { id: 'dp05_c1', number: 1, title: 'Customer Segmentation', what_it_is: 'The paying customer base divided into 2 to 3 segments by size, need, or readiness to buy.', why_it_matters: 'Different customer segments need different messages and different channels. Treating all customers the same produces mediocre results with all of them.', action_trigger: 'Divide your paying customers into 2 to 3 segments. Name each segment, describe it in one sentence, and estimate how many organisations fit it.', signal_to_look_for: 'Segments are based on observable differences in need or budget, not demographic proxies.', coach_guidance: 'Segment by purchasing behaviour and problem intensity, not by size alone. A large organisation with a small budget is not a priority segment.' },
      { id: 'dp05_c2', number: 2, title: 'Channel Map', what_it_is: 'The specific routes through which Ikore will reach each customer segment: relationships, referrals, events, direct outreach, intermediaries.', why_it_matters: 'Channels determine reach. Choosing the wrong channel wastes resources on customers who cannot be converted.', action_trigger: 'For your priority segment, list the 3 most effective channels to reach them. For each channel, name who controls it and how Ikore accesses it.', signal_to_look_for: 'Channels are specific and accessible. "Social media" is not a channel. "WhatsApp broadcast to 47 agrodealer contacts managed by [name]" is a channel.', coach_guidance: 'The best channel is almost always a warm relationship. Identify who in Ikore\'s network has credibility with the priority segment.' },
      { id: 'dp05_c3', number: 3, title: 'Outreach Message', what_it_is: 'The specific message Ikore will use when approaching a potential customer for the first time.', why_it_matters: 'First contact messages that open with Ikore\'s needs ("we need clients") or Ikore\'s capabilities ("we can provide training") are less effective than messages that open with the customer\'s problem.', action_trigger: 'Write a first-contact message of no more than 5 sentences. Open with the customer\'s problem. Describe the outcome, not the service. End with a specific call to action.', signal_to_look_for: 'Message opens with the customer\'s world, not Ikore\'s. Call to action is specific (a meeting, a call, a proposal request).', coach_guidance: 'Test the message by reading it from the customer\'s perspective. Would they respond? What objection would they raise first?' },
      { id: 'dp05_c4', number: 4, title: 'Sales Process Map', what_it_is: 'The sequence of steps from first contact to signed agreement, with timing and responsibility for each step.', why_it_matters: 'Without a defined sales process, leads are lost and conversion rates are low.', action_trigger: 'Map your sales process: first contact → qualifying conversation → proposal → negotiation → agreement. Assign a responsible person and a timeframe to each step.', signal_to_look_for: 'Each step has a named responsible person. Total process time from first contact to agreement is estimated and realistic.', coach_guidance: 'Most LSP sales processes are informal and undocumented. The act of mapping it surfaces gaps and ambiguities that can be resolved before they cost Ikore a sale.' },
      { id: 'dp05_c5', number: 5, title: 'First 5 Customers Plan', what_it_is: 'A specific plan to acquire the first 5 paying customers: who they are, how they will be reached, and by when.', why_it_matters: 'The first 5 customers are the foundation of Ikore\'s commercial track record. They are the reference clients for all subsequent sales.', action_trigger: 'Name 5 real organisations that could be Ikore\'s first paying customers. For each: what is the entry point, who will make the approach, and by what date?', signal_to_look_for: 'Five real names, not five types of organisation. Each has a named entry point and a responsible person.', coach_guidance: 'The first 5 should include at least 2 from the pilot cohort in DP07. This creates continuity between the pilot and commercial launch.' },
      { id: 'dp05_c6', number: 6, title: 'Pricing and Proposal Template', what_it_is: 'A standard proposal template that Ikore can send to a prospective customer, including service description, tiers, price, and outcome commitment.', why_it_matters: 'A standard template speeds up the sales process and ensures consistent messaging.', action_trigger: 'Draft a one-page proposal template: service description, what is included in each tier, price per tier, outcome commitment, and payment terms.', signal_to_look_for: 'Template is professional and readable. Any staff member could send it without modification.', coach_guidance: 'The template should reflect the value proposition from DP03, not introduce new claims. Consistency across customer touchpoints builds credibility.' },
      { id: 'dp05_c7', number: 7, title: 'A/B Test Design', what_it_is: 'A simple test of two different approaches to a customer segment: different message, different channel, or different tier lead.', why_it_matters: 'Market entry assumptions are frequently wrong. Testing two approaches simultaneously produces learning at twice the speed.', action_trigger: 'Design one A/B test: what are you testing, what is version A, what is version B, how will you measure which performs better, and when will you review results?', signal_to_look_for: 'One specific variable is being tested. Success metrics are defined before the test begins.', coach_guidance: 'Keep A/B tests simple. Testing more than one variable at a time produces uninterpretable results.' },
      { id: 'dp05_c8', number: 8, title: 'Business Development Responsibility', what_it_is: 'A named person in Ikore with specific business development responsibilities and time allocated to commercial work.', why_it_matters: 'Organisations without a designated business development person rarely convert leads to clients.', action_trigger: 'Name the person (or role) responsible for business development at Ikore. What percentage of their time is allocated to commercial work? What are their targets?', signal_to_look_for: 'Named person, percentage of time allocated (minimum 20%), and at least one measurable target.', coach_guidance: 'The business development person need not have a commercial background. They need time, a clear process (from DP05), and accountability.' },
      { id: 'dp05_c9', number: 9, title: 'DP05 Summary and Commitment', what_it_is: 'A written summary of the market entry plan, signed by the CEO.', why_it_matters: 'CEO sign-off commits the organisation to implementing the plan, not just agreeing it in a workshop.', action_trigger: 'Write a one-page summary: priority segment, channels, first 5 customers, business development responsibility, A/B test.', signal_to_look_for: 'Summary is specific and assigns responsibility. It would survive scrutiny from the programme funder.', coach_guidance: 'Review against the financial model from DP04. The volume of customers in the market entry plan must be consistent with the break-even volume.' },
    ]
  },
  {
    id: 'dp06',
    number: 'DP06',
    zone: 'Zone 06 — Organisational Identity and Partner Architecture',
    core_question: 'How does Ikore present itself commercially, and who are the partners that strengthen our market position?',
    good_answer: 'Ikore has a commercial identity statement, a professional service profile, and at least one partnership agreement that expands reach or credibility.',
    weak_answer: 'Ikore describes its development sector identity (mission, beneficiaries, donor relationships) rather than a commercial identity that would resonate with paying customers.',
    why_it_matters_for_ikore: 'Commercial identity is the first thing a paying customer evaluates. If Ikore presents as a grant-funded NGO, paying customers will not take it seriously as a service provider.',
    session_time: '3 to 4 hours',
    components: [
      { id: 'dp06_c1', number: 1, title: 'Commercial Identity Statement', what_it_is: 'A one-paragraph description of Ikore as a commercial service provider, written for a paying customer audience.', why_it_matters: 'Most LSPs have a donor-facing identity and no commercial identity. This component builds the commercial version.', action_trigger: 'Write a one-paragraph description of Ikore that opens with the customer it serves, the problem it solves, and the result it delivers. No mission language, no donor references.', signal_to_look_for: 'Statement is written for a paying customer, not a donor. Could appear on a commercial website without modification.', coach_guidance: 'Test by reading it as a potential customer. Does it make you want to enquire? If not, revise until it does.' },
      { id: 'dp06_c2', number: 2, title: 'Service Profile Documents', what_it_is: 'A one-page professional profile for each service tier, suitable for sharing with potential customers.', why_it_matters: 'Service profiles are the primary sales document. They must be professional, specific, and customer-facing.', action_trigger: 'Produce a one-page profile for your Entry tier service. Include: what it is, who it is for, what is included, what the customer will achieve, and the price.', signal_to_look_for: 'Profile is professional, specific, and could be shared as-is with a potential customer.', coach_guidance: 'Avoid formatting that looks like a donor report. Use a service provider layout: clear heading, bullet points for inclusions, bold outcome statement, clear price.' },
      { id: 'dp06_c3', number: 3, title: 'Track Record Documentation', what_it_is: 'A documented record of Ikore\'s most relevant commercial or near-commercial experience.', why_it_matters: 'Paying customers need evidence that Ikore can deliver. Track record documentation makes implicit experience explicit.', action_trigger: 'Document 3 to 5 past engagements in a standard format: client type, service delivered, outcome achieved, timeframe.', signal_to_look_for: 'Each record is specific: named outcome, timeframe, measurable result where available.', coach_guidance: 'Donor-funded work counts if it involved real service delivery to real clients. The test is whether the client received value, not how Ikore was paid.' },
      { id: 'dp06_c4', number: 4, title: 'Partner Identification', what_it_is: 'Identification of organisations whose partnership would expand Ikore\'s reach, credibility, or capability.', why_it_matters: 'Partners multiply market access without proportional increases in cost.', action_trigger: 'Name 3 to 5 organisations that could be strategic partners. For each: what does Ikore get from the partnership, and what does the partner get from Ikore?', signal_to_look_for: 'Partnerships are reciprocal. If Ikore gets everything and the partner gets nothing, it is not a partnership.', coach_guidance: 'Focus on partners who already have access to Ikore\'s priority customer segment. Distribution partnerships are often more valuable than capability partnerships at this stage.' },
      { id: 'dp06_c5', number: 5, title: 'Partnership Agreements', what_it_is: 'At least one formal or semi-formal partnership agreement with an organisation from the partner identification list.', why_it_matters: 'An identified partner who has not committed to anything is not a partner.', action_trigger: 'Initiate a partnership conversation with your highest-priority partner. Agree the terms in writing, even if informally. Document what was agreed.', signal_to_look_for: 'Written record of what was agreed, even if it is an email confirmation. Named contacts on both sides.', coach_guidance: 'Do not wait for a formal MOU. A confirming email from the partner contact is sufficient evidence at this stage.' },
      { id: 'dp06_c6', number: 6, title: 'Digital and Offline Presence', what_it_is: 'An assessment of Ikore\'s current digital and offline presence, and a plan to make it consistent with the commercial identity.', why_it_matters: 'A potential customer who searches for Ikore online will form an impression before any human contact. That impression must match the commercial identity.', action_trigger: 'Review Ikore\'s website, social media, and any printed materials. Note what is inconsistent with the commercial identity statement from DP06 Component 1.', signal_to_look_for: 'A list of specific inconsistencies and a plan to address them.', coach_guidance: 'This step does not require a full rebrand. Small, specific changes (updating the website header, adding a services page) can make a significant difference.' },
      { id: 'dp06_c7', number: 7, title: 'Referral System', what_it_is: 'A simple system for asking satisfied customers to refer Ikore to other potential customers.', why_it_matters: 'Referrals are the most cost-effective customer acquisition channel for LSPs at this stage.', action_trigger: 'Design a referral ask: when will Ikore ask for a referral, what will they say, and what (if anything) will they offer the referrer?', signal_to_look_for: 'A specific moment in the service delivery where a referral ask is natural, and a scripted way of making it.', coach_guidance: 'The best time to ask for a referral is immediately after a successful delivery, while the client\'s satisfaction is highest.' },
      { id: 'dp06_c8', number: 8, title: 'Commercial Readiness Baseline', what_it_is: 'The first run of the Commercial Readiness Diagnostic (Zone 09), establishing the baseline score before pilots begin.', why_it_matters: 'The baseline score documents Ikore\'s starting point and enables measurement of progress at mid-point and handover.', action_trigger: 'Complete the Commercial Readiness Diagnostic. Record the score for each of the six fit tests. Note the total score.', signal_to_look_for: 'Scores recorded for all six tests. A low baseline score is expected and is not a failure. It is information.', coach_guidance: 'Administer the diagnostic jointly with the CEO. Discuss each score before recording it. The conversation is as valuable as the number.' },
      { id: 'dp06_c9', number: 9, title: 'DP06 Summary and Commitment', what_it_is: 'A written summary of commercial identity, service profiles, track record, and partnerships, signed by the CEO.', why_it_matters: 'CEO sign-off confirms that Ikore accepts its commercial identity and is ready to present it to the market.', action_trigger: 'Write a one-page summary: commercial identity statement, key partnerships, track record highlights, presence improvements planned.', signal_to_look_for: 'Summary reads as a commercial brief, not a donor report. Could be shared with an investor.', coach_guidance: 'This summary can become the basis for Ikore\'s commercial pitch deck in future. Invest time in making it strong.' },
    ]
  },
  {
    id: 'dp07',
    number: 'DP07',
    zone: 'Zone 07 — Pilot: Iteration 1',
    core_question: 'Did our service work with real clients, and what did we learn?',
    good_answer: 'Ikore has delivered the service to at least 2 paying or near-paying clients, collected structured feedback, and made at least one design change based on that feedback.',
    weak_answer: 'Ikore has delivered the service in a workshop or training setting with donor-funded participants rather than real paying clients.',
    why_it_matters_for_ikore: 'A pilot with real clients producing real revenue is the most important milestone in the engagement. It proves the model works in practice, not just on paper.',
    session_time: '3 days on-site with lead consultant',
    components: [
      { id: 'dp07_c1', number: 1, title: 'Pilot Client Selection', what_it_is: 'Selection of 2 to 3 real clients for Iteration 1, drawn from the First 5 Customers Plan in DP05.', why_it_matters: 'Pilot clients must be real: they must pay (even a nominal amount) or have committed to pay. Rehearsal clients do not count.', action_trigger: 'Confirm your 2 to 3 pilot clients. For each: have they agreed to pay? What amount? What date does the pilot begin?', signal_to_look_for: 'Named clients, confirmed commitment, at least a nominal payment agreed.', coach_guidance: 'The lead consultant must be present for at least one pilot delivery in Iteration 1. Schedule this before the pilot begins.' },
      { id: 'dp07_c2', number: 2, title: 'Pilot Delivery Plan', what_it_is: 'A detailed plan for delivering the service to each pilot client: who does what, when, and what materials are needed.', why_it_matters: 'Unplanned pilot deliveries produce inconsistent experiences that are hard to learn from.', action_trigger: 'Write a delivery plan for each pilot client: date, location, who from Ikore attends, what materials are needed, what the client needs to prepare.', signal_to_look_for: 'Plan is specific enough that it could be handed to a staff member who was not involved in design.', coach_guidance: 'Use the service bundle description from DP03. The pilot must deliver exactly what was described there, not a modified version.' },
      { id: 'dp07_c3', number: 3, title: 'Pilot Delivery', what_it_is: 'The actual delivery of the service to the pilot clients.', why_it_matters: 'Delivery is where theory meets practice. Every challenge encountered in delivery is valuable design information.', action_trigger: 'Deliver the service to your pilot clients as planned. The lead consultant observes and notes what works and what does not.', signal_to_look_for: 'Service delivered to all planned pilot clients within the agreed timeframe.', coach_guidance: 'During delivery, take notes on: what the client responded to positively, what confused them, what took longer than expected, what was missing.' },
      { id: 'dp07_c4', number: 4, title: 'Client Feedback Collection', what_it_is: 'Structured feedback from each pilot client immediately after delivery.', why_it_matters: 'Feedback collected immediately is more accurate than feedback collected weeks later.', action_trigger: 'After each pilot delivery, ask the client 4 questions: What was most useful? What was least useful? What would you change? Would you recommend this to another organisation?', signal_to_look_for: 'Written feedback, captured verbatim or in direct summary, for each pilot client.', coach_guidance: 'Conduct the feedback conversation yourself in Iteration 1. Model the feedback approach so Ikore can replicate it in Iteration 2.' },
      { id: 'dp07_c5', number: 5, title: 'Iteration 1 Debrief', what_it_is: 'A structured debrief with the Ikore team after all Iteration 1 deliveries are complete.', why_it_matters: 'Learning from Iteration 1 must be captured collectively before Iteration 2 begins.', action_trigger: 'Hold a team debrief. Discuss: what worked well, what did not work, what surprised us, what we will change for Iteration 2.', signal_to_look_for: 'At least 3 specific changes agreed for Iteration 2. Changes are based on evidence, not preference.', coach_guidance: 'Facilitate the debrief but resist the temptation to provide all the answers. Push the team to identify their own learning.' },
      { id: 'dp07_c6', number: 6, title: 'Revenue Confirmation', what_it_is: 'Confirmation that payment was received from pilot clients, or documentation of why payment was deferred.', why_it_matters: 'A pilot that was delivered but not paid for is a free service, not a commercial transaction.', action_trigger: 'Confirm: did each pilot client pay? If not, why not, and when will they pay? Record the amount received.', signal_to_look_for: 'At least one payment received or formally committed with a specific date.', coach_guidance: 'If no pilot client paid, this is a critical warning signal. The willingness-to-pay evidence from DP03 must be revisited.' },
      { id: 'dp07_c7', number: 7, title: 'Service Adjustments', what_it_is: 'Specific changes to the service design, delivery process, or materials based on Iteration 1 feedback.', why_it_matters: 'An unchanged service after Iteration 1 suggests the feedback was not taken seriously.', action_trigger: 'Document the changes you are making for Iteration 2: what is changing, why, and what you expect the effect to be.', signal_to_look_for: 'At least one substantive change to service content or delivery process. Cosmetic changes (font, colour) do not count.', coach_guidance: 'Changes should be testable in Iteration 2. Frame each change as a hypothesis: "We believe [change] will produce [effect] because [reason from feedback]."' },
      { id: 'dp07_c8', number: 8, title: 'Mid-Point Commercial Readiness Diagnostic', what_it_is: 'The second run of the Commercial Readiness Diagnostic, measuring progress since the baseline in DP06.', why_it_matters: 'The mid-point score provides evidence of commercial development progress for the funder and for Ikore\'s own planning.', action_trigger: 'Complete the Commercial Readiness Diagnostic again. Compare scores to the baseline from DP06. Note what changed and why.', signal_to_look_for: 'Scores have improved on at least 3 of the 6 fit tests. Score improvement is supported by evidence.', coach_guidance: 'Do not adjust scores to show improvement without evidence. Accurate scoring is more valuable than a favourable result.' },
      { id: 'dp07_c9', number: 9, title: 'DP07 Summary and Commitment', what_it_is: 'A written summary of Iteration 1: what was delivered, what was learned, what changes are planned for Iteration 2, signed by the CEO.', why_it_matters: 'CEO sign-off confirms that the organisation is committing to Iteration 2 with the agreed changes.', action_trigger: 'Write a one-page summary: pilot clients, revenue received, key learning, changes planned.', signal_to_look_for: 'Summary is specific. Mentions actual clients, actual revenue, actual changes. Not "we delivered training and it went well."', coach_guidance: 'This summary is a key piece of evidence for the funder. It demonstrates that the engagement is producing real commercial activity, not just planning.' },
    ]
  },
  {
    id: 'dp08',
    number: 'DP08',
    zone: 'Zone 07 — Pilot: Iteration 2 and Commercial Handover',
    core_question: 'Can Ikore lead the service independently, and is the commercial model ready to scale?',
    good_answer: 'Ikore has delivered Iteration 2 with Ikore leading, the lead consultant observing. Ikore can present the commercial model independently. At least one client has renewed or referred.',
    weak_answer: 'Iteration 2 was led by the consultant with Ikore observing, or Ikore cannot explain the commercial model without prompting.',
    why_it_matters_for_ikore: 'The engagement only succeeds if Ikore owns the model. DP08 is the transfer point: Ikore leads, consultant steps back.',
    session_time: '3 days on-site with lead consultant',
    components: [
      { id: 'dp08_c1', number: 1, title: 'Iteration 2 Client Selection', what_it_is: 'Selection of 2 to 3 clients for Iteration 2, which may be the same clients as Iteration 1 or new clients.', why_it_matters: 'Iteration 2 clients must be selected with the service adjustments in mind. New clients test whether the adjusted service works beyond the founding cohort.', action_trigger: 'Confirm your Iteration 2 clients. Include at least one new client not in Iteration 1.', signal_to_look_for: 'Named clients confirmed. At least one is new to Ikore.', coach_guidance: 'Including a new client tests the adjusted service with someone who has no prior relationship with Ikore. This is a stronger test of commercial viability.' },
      { id: 'dp08_c2', number: 2, title: 'Ikore-Led Delivery', what_it_is: 'Iteration 2 is led by Ikore staff, with the lead consultant observing and coaching from the side.', why_it_matters: 'The transfer from consultant to Ikore is the defining moment of the engagement. If Ikore cannot lead Iteration 2, handover cannot happen.', action_trigger: 'Assign an Ikore staff member to lead each Iteration 2 delivery. The consultant observes and gives feedback only. The client deals with the Ikore lead.', signal_to_look_for: 'Ikore lead manages the full session without consultant intervention. Consultant provides debrief after, not direction during.', coach_guidance: 'Resist the temptation to intervene during delivery even if things go imperfectly. The imperfections are the learning. Debrief thoroughly after.' },
      { id: 'dp08_c3', number: 3, title: 'Client Feedback — Iteration 2', what_it_is: 'Structured feedback from Iteration 2 clients, collected by Ikore staff (not the consultant).', why_it_matters: 'Ikore collecting its own feedback is part of the independence test.', action_trigger: 'Ikore staff conduct the feedback conversation using the same 4 questions from DP07. Document responses verbatim.', signal_to_look_for: 'Feedback collected by Ikore without consultant involvement. Written record exists.', coach_guidance: 'Review the feedback records before the debrief. If they are thin or generic, it suggests the feedback conversations were not conducted properly.' },
      { id: 'dp08_c4', number: 4, title: 'Renewal and Referral Evidence', what_it_is: 'Evidence that at least one Iteration 1 or Iteration 2 client has renewed (agreed to a second service) or referred Ikore to another potential client.', why_it_matters: 'Renewal and referral are the strongest indicators of commercial viability. They demonstrate value without coaching input.', action_trigger: 'Document any renewals or referrals received. If none yet, note what steps are being taken to generate them.', signal_to_look_for: 'At least one renewal or referral documented. If neither exists, this is a warning signal for the commercial model.', coach_guidance: 'A referral conversation that has not yet converted still counts as evidence. Document the conversation, not just the conversion.' },
      { id: 'dp08_c5', number: 5, title: 'Commercial Model Presentation', what_it_is: 'Ikore presents its full commercial model to its leadership team without consultant prompting.', why_it_matters: 'This is one of the five independence tests. If Ikore cannot present the model, the engagement has not yet achieved its goal.', action_trigger: 'Organise a commercial model presentation by the CEO and Finance Manager to Ikore\'s board or leadership. The consultant attends but does not present.', signal_to_look_for: 'Presentation covers: target customer, service offer, price, break-even, 36-month projection, and scale pathway. Questions from the board are answered without consultant intervention.', coach_guidance: 'Prepare the Ikore team thoroughly before the presentation. The goal is success, not a test of unpreparedness.' },
      { id: 'dp08_c6', number: 6, title: 'Scale Pathway Design', what_it_is: 'A plan for growing commercial revenue beyond the founding client cohort.', why_it_matters: 'A scale pathway demonstrates that commercial viability is not dependent on the programme or the consultant.', action_trigger: 'Describe the scale pathway: which customer segment will be expanded, through which channels, at what investment, over what timeframe.', signal_to_look_for: 'Pathway identifies at least 2 new customer segments or channels beyond the founding cohort.', coach_guidance: 'The scale pathway must be grounded in evidence from the pilot. Aspirational pathways without evidence are not credible.' },
      { id: 'dp08_c7', number: 7, title: 'Financial Model Update', what_it_is: 'The financial model updated with actual pilot revenue data and revised assumptions based on Iteration 1 and 2 experience.', why_it_matters: 'A model built on assumptions is a plan. A model updated with actuals is an evidence base.', action_trigger: 'Update the Clearview financial model with actual revenue from pilots. Revise the 36-month projection based on what you now know.', signal_to_look_for: 'Model reflects actual pilot revenue. At least 2 assumptions have been revised based on experience.', coach_guidance: 'If actual pilot revenue is significantly below the original model, the break-even calculation must be revisited before handover.' },
      { id: 'dp08_c8', number: 8, title: 'Handover Preparation', what_it_is: 'Preparation of all materials Ikore will need to continue commercial operations independently after the engagement closes.', why_it_matters: 'Handover is not an event; it is a prepared state. Materials produced here become Ikore\'s operational toolkit.', action_trigger: 'Compile: commercial identity statement, service profiles, pricing, sales process map, proposal template, financial model, customer records. Confirm all are in Ikore\'s control.', signal_to_look_for: 'All materials are in Ikore\'s file system, not the consultant\'s. Ikore staff know where everything is.', coach_guidance: 'Test by asking an Ikore staff member to find a specific document without your help. If they cannot, the materials are not yet owned.' },
      { id: 'dp08_c9', number: 9, title: 'DP08 Summary and Commitment', what_it_is: 'A written summary of Iteration 2 and commercial handover readiness, signed by the CEO.', why_it_matters: 'CEO sign-off signals readiness to proceed to DP09 final commercial readiness assessment.', action_trigger: 'Write a one-page summary: Iteration 2 outcomes, independence test results so far, commercial model status, readiness for handover.', signal_to_look_for: 'Summary is honest about what is ready and what is not. It identifies any remaining risks before handover.', coach_guidance: 'Do not allow an optimistic summary that obscures real gaps. The DP09 final diagnostic will reveal them anyway.' },
    ]
  },
  {
    id: 'dp09',
    number: 'DP09',
    zone: 'Zone 09 — Commercial Readiness Diagnostic',
    core_question: 'Is Ikore ready to operate commercially without programme support?',
    good_answer: 'Ikore scores 4 or above on at least 5 of the 6 fit tests in the final Commercial Readiness Diagnostic, and all 5 independence tests are confirmed.',
    weak_answer: 'Ikore scores well on the diagnostic because scores were inflated or because the criteria were relaxed, rather than because commercial capability was genuinely built.',
    why_it_matters_for_ikore: 'The final diagnostic is the evidence base for the engagement\'s outcome. It demonstrates to Ignite that Ikore has genuinely built commercial capability, not just participated in a programme.',
    session_time: '4 to 5 hours including final presentation',
    components: [
      { id: 'dp09_c1', number: 1, title: 'Final Commercial Readiness Diagnostic', what_it_is: 'The third and final run of the six fit tests, measuring Ikore\'s commercial readiness at engagement close.', why_it_matters: 'The three-point diagnostic (baseline, mid-point, final) shows the trajectory of commercial development, not just an endpoint score.', action_trigger: 'Complete the Commercial Readiness Diagnostic for the final time. Score each fit test honestly based on evidence, not aspiration.', signal_to_look_for: 'Total score is 4 or above on at least 5 tests. Score has improved since mid-point.', coach_guidance: 'Review scores against the evidence library. Every score must be supported by a specific evidence reference.' },
      { id: 'dp09_c2', number: 2, title: 'Independence Tests Completion', what_it_is: 'Final confirmation of all 5 independence tests from the Handover Record (Tab 10).', why_it_matters: 'Independence tests are the most direct measure of whether the engagement succeeded.', action_trigger: 'Confirm the status of all 5 independence tests. For any test marked Partial or No, document the plan for completing it.', signal_to_look_for: 'At least 4 of 5 tests marked Yes. Test 4 (unassisted commercial model presentation) must be Yes.', coach_guidance: 'Test 4 is non-negotiable. An engagement cannot close with Ikore unable to present its own model.' },
      { id: 'dp09_c3', number: 3, title: 'Revenue Achieved vs Target', what_it_is: 'Comparison of actual commercial revenue generated during the engagement against the target in the financial model.', why_it_matters: 'Revenue against target is the most objective measure of commercial progress.', action_trigger: 'State the revenue target from the financial model and the actual revenue achieved. Calculate the percentage achievement.', signal_to_look_for: 'Achievement above 60% of target. Below 50% requires explanation and a revised post-engagement plan.', coach_guidance: 'Do not allow the target to be revised downward at this stage to improve the achievement percentage. The original target stands.' },
      { id: 'dp09_c4', number: 4, title: 'Customer Count vs Target', what_it_is: 'The number of paying customers acquired during the engagement versus the target.', why_it_matters: 'Revenue from one large customer is less robust than revenue from multiple customers. Customer count measures market reach.', action_trigger: 'State the customer count target and the actual number of paying customers acquired.', signal_to_look_for: 'At least 4 paying customers, including at least 2 from Iteration 2. Customer diversity across segments preferred.', coach_guidance: 'If all customers are from the same organisation or sector, commercial resilience is limited. Note this as a post-engagement risk.' },
      { id: 'dp09_c5', number: 5, title: 'Post-Engagement Commercial Plan', what_it_is: 'Ikore\'s plan for commercial operations for the 12 months after the engagement closes, without programme support.', why_it_matters: 'A post-engagement plan demonstrates that Ikore has internalised the commercial logic, not just participated in a funded programme.', action_trigger: 'Write a 12-month commercial plan: revenue targets by quarter, customers to pursue, services to develop, investment required, risk mitigation.', signal_to_look_for: 'Plan does not mention donor funding as a revenue source. Targets are consistent with what was demonstrated in pilots.', coach_guidance: 'Review the plan for grant logic. Any target that requires a new donor to be found is grant logic, not commercial logic.' },
      { id: 'dp09_c6', number: 6, title: 'Funder Reporting Package', what_it_is: 'A complete reporting package for Ignite: commercial readiness diagnostic progression, revenue achieved, customer count, key learning, post-engagement plan.', why_it_matters: 'The funder reporting package is the formal output of the engagement. It must be evidence-based and specific.', action_trigger: 'Compile the reporting package using the Clearview platform. Include: diagnostic scores (baseline, mid-point, final), pilot evidence, revenue data, independence test results, post-engagement plan.', signal_to_look_for: 'Package is complete, specific, and generated from the platform\'s evidence library. Not a narrative report with no data.', coach_guidance: 'The Clearview platform generates this report automatically from the evidence entered. Ensure all evidence is entered before generating the report.' },
      { id: 'dp09_c7', number: 7, title: 'Final Commercial Model Presentation', what_it_is: 'Ikore presents its complete commercial model to Ignite and any other stakeholders, without the consultant.', why_it_matters: 'The final presentation is the culmination of the engagement. Ikore demonstrates full commercial ownership in front of the funder.', action_trigger: 'Organise a final presentation. Ikore presents alone. Consultant and funder attend as audience.', signal_to_look_for: 'Ikore presents confidently for at least 30 minutes and answers questions from the funder without consultant support.', coach_guidance: 'Prepare rigorously but do not present. Your job at the final presentation is to watch and take notes. The success of the presentation is the success of the engagement.' },
      { id: 'dp09_c8', number: 8, title: 'Engagement Learning Record', what_it_is: 'A record of the key learning from the engagement for the Canvas Coach practice: what worked, what would be done differently, what tools need to be updated.', why_it_matters: 'Institutional learning from every engagement strengthens the methodology for the next one.', action_trigger: 'Write a one-page learning record: 3 things that worked well, 3 things to improve, 1 tool or framework that needs updating.', signal_to_look_for: 'Learning is specific to this engagement, not generic. At least one improvement relates to Ikore\'s specific context.', coach_guidance: 'This record is for the Canvas Coach practice, not for Ikore or Ignite. Be honest about what did not work, including your own delivery.' },
      { id: 'dp09_c9', number: 9, title: 'Formal Handover and Engagement Close', what_it_is: 'The formal close of the engagement, with CEO sign-off confirming Ikore has received everything needed for independent commercial operation.', why_it_matters: 'A formal close creates a clear boundary between the engagement and independence. It prevents ongoing dependency.', action_trigger: 'Complete the Handover Record (Tab 10) in full. CEO signs to confirm all independence tests are complete and all materials are in Ikore\'s possession.', signal_to_look_for: 'Handover Record fully completed and CEO signed. Date of engagement close documented.', coach_guidance: 'The engagement closes when the Handover Record is signed. Not when the final payment is made, not when the funder report is submitted. When Ikore confirms independence.' },
    ]
  },
]

// ─── FIT TESTS FOR COMMERCIAL READINESS DIAGNOSTIC ──────────
export const FIT_TESTS = [
  { id: 'ft01', number: '01', name: 'Problem–Provider Fit', description: 'Does Ikore have the right to own this problem in this market?' },
  { id: 'ft02', number: '02', name: 'Problem–Solution Fit', description: 'Does the service solve the problem as the client experiences it?' },
  { id: 'ft03', number: '03', name: 'Solution–Problem Owner Fit', description: 'Is the solution designed for the actor with budget, not just the beneficiary?' },
  { id: 'ft04', number: '04', name: 'Solution–Pilot Fit', description: 'Can this be tested meaningfully within the engagement timeline?' },
  { id: 'ft05', number: '05', name: 'Solution–Market Fit', description: 'Is there demonstrated willingness to pay at a cost-recovery price?' },
  { id: 'ft06', number: '06', name: 'Solution–Scale Channel Fit', description: 'Are there channels to reach beyond the founding clients independently?' },
]

// ─── HELPER: initial gate signoffs ───────────────────────────
export function initialGateSignoffs(): Record<PhaseId, GateSignOff> {
  const phases: PhaseId[] = ['setup', 'phase0', 'dp01', 'dp02', 'dp03', 'dp04', 'dp05', 'dp06', 'dp07', 'dp08', 'dp09', 'handover']
  const result: Record<string, GateSignOff> = {}
  phases.forEach((p, i) => {
    result[p] = {
      phase: p,
      status: i === 0 ? 'not_started' : 'locked',
      ceo_signed: false, ceo_name: '', ceo_date: '',
      coach_authorised: false, coach_note: '', coach_date: '',
    }
  })
  return result as Record<PhaseId, GateSignOff>
}

// ─── HELPER: get phase label ──────────────────────────────────
export function getPhaseLabel(id: PhaseId): string {
  const map: Record<PhaseId, string> = {
    setup: 'Setup', phase0: 'Phase 0', dp01: 'DP01', dp02: 'DP02',
    dp03: 'DP03', dp04: 'DP04', dp05: 'DP05', dp06: 'DP06',
    dp07: 'DP07', dp08: 'DP08', dp09: 'DP09', handover: 'Handover',
  }
  return map[id]
}

export function getPhaseOrder(): PhaseId[] {
  return ['setup', 'phase0', 'dp01', 'dp02', 'dp03', 'dp04', 'dp05', 'dp06', 'dp07', 'dp08', 'dp09', 'handover']
}

export function isPhaseUnlocked(phaseId: PhaseId, signoffs: Record<PhaseId, GateSignOff>): boolean {
  const order = getPhaseOrder()
  const idx = order.indexOf(phaseId)
  if (idx === 0) return true
  const prev = order[idx - 1]
  const prevGate = signoffs[prev]
  return prevGate.ceo_signed || prevGate.coach_authorised || prevGate.status === 'not_started'
}
