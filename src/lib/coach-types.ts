// ============================================================
// COACH PLATFORM TYPES — v2
// Two engagement modes: canvas (full GtCV) | financial (Clearview only)
// ============================================================

export type ClientType =
  | 'crop_aggregator'
  | 'livestock_aggregator'
  | 'farmer_group_enterprise'
  | 'service_lsp'

export type EngagementMode = 'canvas' | 'financial'

export type ProgrammeType = 'donor_programme' | 'direct_client' | 'blended'

export type DPStatus = '○' | '◐' | '✓' | '⚠'

export type EngagementStatus =
  | 'setup' | 'phase_0'
  | 'dp01' | 'dp02' | 'dp03' | 'dp04' | 'dp05'
  | 'dp06' | 'dp07' | 'dp08' | 'dp09'
  | 'complete' | 'paused'

// ── Five-layer Decision Component ────────────────────────────
export interface DecisionComponent {
  id: string              // e.g. 'dp01_1_1'
  number: string          // e.g. '1.1'
  title: string
  whatItIs: string
  whyItMatters: string
  coachGuidance: string
  actionTrigger: string
  signalToLookFor: string
  // Evidence recorded during engagement
  status: DPStatus
  evidenceRecorded: string
  coachNotes: string
  ceoSignedOff: boolean
  ceoSignedOffAt: string
  ceoSignedOffBy: string
}

export interface DecisionPoint {
  id: string              // 'phase_0' | 'dp01' … 'dp09'
  label: string
  coreQuestion: string
  commitment: string
  components: DecisionComponent[]
  // DP-level sign-off
  status: DPStatus
  completedAt: string
  ceoSignedOff: boolean
  ceoSignedOffAt: string
  sessionTime: string     // e.g. '3–4 hrs'
  outputRequired: string
}

// ── Timesheet ────────────────────────────────────────────────
export interface TimesheetEntry {
  id: string
  coImplementerId: string
  date: string            // ISO date
  clientId: string
  dpId: string            // which DP or 'general'
  hours: number           // to 0.5
  description: string
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
  submittedAt: string
  approvedAt: string
  rejectionNote: string
}

// ── Invoice ──────────────────────────────────────────────────
export interface Invoice {
  id: string
  coImplementerId: string
  invoiceNumber: string
  periodStart: string
  periodEnd: string
  timesheetIds: string[]
  totalHours: number
  ratePerDay: number
  totalAmount: number
  currency: string
  expenses: {description: string; amount: number}[]
  status: 'draft' | 'submitted' | 'approved' | 'paid'
  submittedAt: string
  approvedAt: string
  paidAt: string
  notes: string
}

// ── Co-implementer ───────────────────────────────────────────
export interface CoImplementer {
  id: string
  name: string
  email: string
  phone: string
  country: string
  specialisation: string
  ratePerDay: number
  currency: string
  programmeIds: string[]
  clientIds: string[]
  active: boolean
  notes: string
}

// ── Programme ────────────────────────────────────────────────
export interface Programme {
  id: string
  name: string
  type: ProgrammeType
  funder: string
  country: string
  startDate: string
  endDate: string
  notes: string
  clientIds: string[]
  coImplementerIds: string[]
  funderEmail: string     // for funder invite
  funderInvited: boolean
}

// ── Client ───────────────────────────────────────────────────
export interface EngagementClient {
  id: string
  name: string
  slug: string
  type: ClientType
  engagementMode: EngagementMode
  programmeId: string
  country: string
  sector: string
  contactName: string
  contactEmail: string
  contactPhone: string
  status: EngagementStatus
  clearviewActive: boolean
  ceoInvited: boolean
  ceoInvitedAt: string
  notes: string
  startDate: string
  expectedClose: string
  // Canvas engagement fields
  canvas: DecisionPoint[]
  // Financial headline (from Clearview)
  financialHeadline?: {
    revenue: number; ebitda: number; cash: number
    currency: string; lastUpdated: string
  }
}

// ── Coach state ───────────────────────────────────────────────
export interface CoachState {
  programmes: Programme[]
  clients: EngagementClient[]
  coImplementers: CoImplementer[]
  timesheets: TimesheetEntry[]
  invoices: Invoice[]
}

// ============================================================
// REFERENCE DATA
// ============================================================
export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  crop_aggregator: 'Crop Aggregator with Input',
  livestock_aggregator: 'Livestock Aggregator',
  farmer_group_enterprise: 'Farmer Group Enterprise',
  service_lsp: 'Service LSP',
}

export const CLIENT_TYPE_COLORS: Record<ClientType, string> = {
  crop_aggregator: '#1A7A4A',
  livestock_aggregator: '#B8860B',
  farmer_group_enterprise: '#1B2A4A',
  service_lsp: '#00B4D8',
}

export function statusLabel(s: EngagementStatus): string {
  if (s === 'setup') return 'Setting Up'
  if (s === 'complete') return 'Complete'
  if (s === 'paused') return 'Paused'
  if (s === 'phase_0') return 'Phase 0'
  return s.toUpperCase().replace('_','-')
}

export function statusColor(s: EngagementStatus): string {
  if (s === 'complete') return '#1A7A4A'
  if (s === 'paused') return '#8B2E2E'
  if (s === 'setup') return '#4A5A6A'
  return '#00B4D8'
}

// ============================================================
// FULL GTCV CANVAS — all 9 DPs with all 9 components each
// Five layers per component drawn from the handbook and workbook
// ============================================================
export function buildEmptyCanvas(): DecisionPoint[] {
  function comp(id: string, num: string, title: string,
    what: string, why: string, coach: string, action: string, signal: string
  ): DecisionComponent {
    return { id, number: num, title,
      whatItIs: what, whyItMatters: why, coachGuidance: coach,
      actionTrigger: action, signalToLookFor: signal,
      status: '○', evidenceRecorded: '', coachNotes: '',
      ceoSignedOff: false, ceoSignedOffAt: '', ceoSignedOffBy: '' }
  }

  return [
    // ── PHASE 0 ────────────────────────────────────────────
    {
      id: 'phase_0', label: 'Phase 0 — Assumption Clearing',
      coreQuestion: 'What are we actually operating on — and which of these assumptions have commercial validity?',
      commitment: 'Continue / Pause / Kill decision on every activity. Hypotheses with named problem owners proceed to canvas.',
      sessionTime: '2–3 hrs', outputRequired: 'Continue/Pause/Kill table with every activity classified and hypotheses shortlisted.',
      status: '○', completedAt: '', ceoSignedOff: false, ceoSignedOffAt: '',
      components: [
        comp('p0_1','P0.1','Assumption Dump Canvas',
          'A structured exercise to make every implicit belief explicit before any analysis begins.',
          'Organisations operate on assumptions they have never written down. The longer the assumption has been held, the harder it is to see.',
          'Ask the team to list every activity. For each one: the claimed problem, the supposed customer, who pays, what evidence exists, and what would make the assumption obviously wrong. That last column is the most valuable.',
          'The team produces a completed Assumption Dump Canvas — one row per activity, all five columns filled in, including the disconfirmation column.',
          'The team pauses on the disconfirmation column. The pause is the signal that honest thinking is happening.'),
        comp('p0_2','P0.2','Problem-Owner-Budget Matrix',
          'Tests whether each problem is commercially real by tracing ownership and budget.',
          'Commercial problems have owners with budgets. Development problems have beneficiaries without budgets. Most organisations have never separated these two categories.',
          'Apply three questions: Who owns this problem? What is the cost of not solving it? Who controls the budget to solve it? Any problem without a named budget holder is paused.',
          'The team produces a completed matrix — every problem assessed against all three questions. Problems without a budget holder are marked Pause.',
          'At least one problem the team believed was commercial turns out not to have a budget holder. That discovery is the purpose of this tool.'),
        comp('p0_3','P0.3','Hypothesis Shortlist Board',
          'Ranks surviving problems to prevent exploring everything simultaneously.',
          'Organisations that pursue twelve half-developed hypotheses produce twelve half-developed services. Concentration on three is what makes the canvas work.',
          'Score each surviving problem on Urgency, Ownership Clarity, Willingness to Pay, and Access — each on a 1–5 scale with anchored definitions. Only the top three to five move forward.',
          'The team produces a scored shortlist. Every score is anchored to a specific definition — not an impression.',
          'Disagreement between team members on scores. Disagreement is more valuable than consensus at this stage.'),
        comp('p0_4','P0.4','Signal vs Story Board',
          'Separates what the organisation has directly observed from what it believes.',
          'Signals are things witnessed or measured. Stories are interpretations. Most grant-funded organisations have a great deal of story and very little signal.',
          'For each shortlisted problem, separate the evidence into Signal (directly witnessed, measured, documented) and Story (inferred, assumed, interpreted). Add a fifth column: what would we need to see to confirm this is real?',
          'The team produces a Signal vs Story Board for each shortlisted problem, with at least one specific validation question per problem.',
          'The team acknowledges that evidence they called strong is actually story. That acknowledgment is the point of the exercise.'),
        comp('p0_5','P0.5','Continue / Pause / Kill Table',
          'Forces a decision on every activity. Nothing is allowed to remain in hopeful ambiguity.',
          'Every activity the organisation continues costs staff time and leadership attention. Clarity about what to stop is as important as clarity about what to build.',
          'Every activity must land in Continue, Pause, or Kill. Pause requires a specific question attached — what evidence would change its status? Kill means stop now and redirect resources.',
          'The team produces a completed Continue/Pause/Kill table. Every activity has a classification and every Pause has a specific question.',
          'Staff who have built careers around activities marked Kill accept the classification without the coach defending it. That acceptance is the signal.'),
      ]
    },

    // ── DP01 ────────────────────────────────────────────────
    {
      id: 'dp01', label: 'DP01 — Service Reality Audit',
      coreQuestion: 'What does the organisation actually deliver — and what exists only because the grant made it possible?',
      commitment: 'Service Inventory with grant-logic / market-logic classification. Stop / Pause / Redesign Register. Hidden Cost Map.',
      sessionTime: '3–4 hrs', outputRequired: 'Category A services with full cost per unit, delivery standard defined, and prior evidence documented.',
      status: '○', completedAt: '', ceoSignedOff: false, ceoSignedOffAt: '',
      components: [
        comp('dp01_1','1.1','Service Inventory',
          'A complete, honest list of every service the organisation currently delivers — nothing added, nothing omitted.',
          'LSPs list aspirational services alongside real ones. What they hope to deliver gets mixed with what they actually deliver.',
          'Ask the Leadership Team to list every service from memory first. Then open the last 12 months of donor reports, invoices, and activity logs. What appears in reports but not on the memory list reveals what the organisation does but does not identify with.',
          'The organisation produces a written Service Inventory — one row per service, with three columns: service name, evidence of delivery in the last 12 months, and the name of the person responsible for delivery.',
          'The Leadership Team debates which services belong on the list. Services they agree on immediately are real. Services that require negotiation are revealing something.'),
        comp('dp01_2','1.2','Grant-Logic vs Market-Logic Classification',
          'Separates services that exist because a donor funded them from those with genuine market demand.',
          'Every dollar spent on a grant-logic service in the commercial transition is a dollar not spent on building the commercial model.',
          'For each service: if the grant funding ended tomorrow, would a specific organisation pay to continue receiving it? Category A = plausible yes. Category B = no or another donor only.',
          'Each service is classified as Category A or Category B with a one-sentence rationale. Classification is done by the full team, not by the coach.',
          'Fewer than 20% of services are Category A. This is normal. Most organisations are surprised by how few services have a genuine commercial pathway in their current form.'),
        comp('dp01_3','1.3','Full Cost per Unit',
          'Calculates the real cost of delivering each Category A service once, at an acceptable quality standard.',
          'Most grant-funded organisations have never costed a specific service in isolation. Without a floor price, any price set is guesswork.',
          'Bottom-up costing: staff time at realistic daily rate including overhead allocation, direct costs, travel and logistics, quality assurance time. Do not use programme budget allocations as a proxy.',
          'The organisation produces a cost-per-unit figure for each Category A service. This is the floor price below which no commercial price can be set.',
          'The floor price is higher than the team expected. Almost always. That discovery is the point — it shapes every pricing decision that follows.'),
        comp('dp01_4','1.4','Service Coherence Test',
          'Tests whether each Category A service is specific enough, proven enough, and costed enough to be priced and sold.',
          'A service that cannot be described precisely in one sentence, has not been delivered before, or has no cost figure is not yet canvas-ready.',
          'Five questions for each Category A service: Can we describe it precisely? Have we delivered it before? Do we know the full cost? Can we name the customer type? Is there any prior evidence of value from a non-donor actor?',
          'Each Category A service is assessed against all five questions. Services failing two or more questions are reclassified as Category B pending development.',
          'The team identifies exactly what is missing for each reclassified service. Specificity about the gap is what makes it actionable.'),
        comp('dp01_5','1.5','Delivery Proof Check',
          'Requires tangible evidence of delivery capability — not descriptions or intentions.',
          'A service that has been proposed but never delivered is theoretical. The canvas builds on real capability only.',
          'Three proofs required: evidence of delivery (report, participant list, output document), evidence of quality (specific feedback from a recipient), evidence of consistency (more than one delivery with similar outcomes).',
          'The organisation produces documented proof for each Category A service against all three dimensions.',
          'For any proof that does not yet exist, the team identifies what one delivery would be needed to generate it — and plans that delivery before the canvas continues.'),
        comp('dp01_6','1.6','Hidden Cost Map',
          'Surfaces costs that have been absorbed into programme budgets and are invisible in the organisation\'s own accounting.',
          'Hidden costs are what make commercial models unviable at prices that seemed reasonable. They include management oversight, quality review, reporting, and organisational overhead.',
          'Ask the delivery team — not just leadership — to map every input that goes into a single delivery. Compare this to what the finance team thinks a delivery costs. The gap is the hidden cost.',
          'The organisation produces a Hidden Cost Map showing the gap between perceived and actual cost per delivery.',
          'At least one significant cost category that was previously untracked is identified. The team agrees it must be included in the floor price.'),
        comp('dp01_7','1.7','Stop / Pause / Redesign Register',
          'Records the specific services that will not continue in their current form, with clear rationale and next step.',
          'Services that are not on the Register keep consuming resources. The Register makes the decision visible and permanent.',
          'Every Category B service must appear on the Register in one of three columns: Stop (no commercial pathway, redirect resources now), Pause (specific evidence needed before deciding), Redesign (market-logic version possible with defined changes).',
          'The Register is produced, reviewed by the full Leadership Team, and signed off. Every entry has a rationale and a named next step.',
          'The Leadership Team is willing to share the Register with their board. That willingness is the signal that the decisions are genuine.'),
        comp('dp01_8','1.8','Pricing Signal Baseline',
          'Records any evidence from the market about what similar services cost or what customers have paid for adjacent services.',
          'Without a market pricing signal, the floor price has no external reference. The signal tells the organisation whether the floor price is within the range the market will bear.',
          'Document any prior payment for a service similar to the Category A services — whether by this organisation or by a competitor. Include prices paid for adjacent services that solve a related problem.',
          'The organisation produces a Pricing Signal Baseline — a list of comparable services and their known prices or price ranges.',
          'At least one comparable exists. If none exists, the organisation identifies how it will generate a pricing signal before DP04.'),
        comp('dp01_9','1.9','DP01 Decision Record',
          'The formal record of what the organisation has decided at DP01 and what it is committing to carry forward.',
          'A Decision Point that is worked through but not formally recorded produces no accountability. The record is what makes the commitment real.',
          'The team produces a one-page Decision Record: services confirmed as Category A with cost and evidence, services on the Stop/Pause/Redesign Register, and a clear statement of what will and will not be developed commercially.',
          'The Decision Record is produced, reviewed, and signed by the Executive Director or CEO before DP02 opens.',
          'The CEO signs without immediately qualifying the decision. A clean signature is the signal that the decision has been genuinely made.'),
      ]
    },

    // ── DP02 ────────────────────────────────────────────────
    {
      id: 'dp02', label: 'DP02 — Customer & Problem Clarity',
      coreQuestion: 'Who specifically will pay for this, for what specific problem — and how do we know?',
      commitment: 'Named customer segments with documented problem urgency, budget holder identified, Three-Stage Adoption Test™ applied.',
      sessionTime: '4–6 hrs', outputRequired: 'Named customer segment, problem statement in customer\'s words, commercial signal evidence from 5+ validation conversations, adoption stage profile.',
      status: '○', completedAt: '', ceoSignedOff: false, ceoSignedOffAt: '',
      components: [
        comp('dp02_1','2.1','Customer Hypothesis',
          'The initial, explicit statement of who the paying customer is — before any validation has occurred.',
          'An untested customer hypothesis is an assumption. Writing it down explicitly makes it testable rather than unexamined.',
          'For each Category A service: write a specific customer hypothesis — a named type of organisation, the problem they have, why they would pay, and what evidence you have so far. This is the hypothesis to be tested, not a conclusion.',
          'The team produces a written customer hypothesis for each Category A service, with the assumption clearly distinguished from the evidence.',
          'The team finds it harder to write the hypothesis than expected. That difficulty reveals how much of their customer understanding is story rather than evidence.'),
        comp('dp02_2','2.2','Commercial Structure Identification',
          'Identifies which commercial structure applies — B2B, B2C, B2G, B2D, B2B2C, or other — because each requires a different validation approach.',
          'The wrong commercial structure produces the wrong validation approach. An organisation that validates with beneficiaries when the structure is B2B will conclude demand exists when no commercial demand has been confirmed.',
          'Apply the Commercial Structures Reference™ to each service. Identify the paying actor, the decision-making process, and the budget authority. Confirm this with the problem-owner-budget analysis from Phase 0.',
          'Each Category A service has a confirmed commercial structure with the paying actor named and the decision-making process described.',
          'The commercial structure for at least one service turns out to be different from what the team assumed. That correction is the purpose of this component.'),
        comp('dp02_3','2.3','Three-Stage Adoption Test™ — Willing',
          'Tests whether potential customers are willing — whether they express genuine interest in the problem being solved.',
          'Willingness is the entry condition. Without it, no further test is relevant. But willingness alone never pays for a service.',
          'Conduct initial outreach conversations focused on whether the potential customer acknowledges the problem as real and significant. Record verbatim responses. Do not pitch the service — listen for whether they describe the problem unprompted.',
          'The team documents at least three conversations where the potential customer described the problem in their own words without prompting from the team.',
          'The language potential customers use to describe the problem is different from the language the organisation used to describe it. That difference is the raw material for the value proposition.'),
        comp('dp02_4','2.4','Three-Stage Adoption Test™ — Able',
          'Tests whether willing customers have the financial means and organisational authority to pay.',
          'Many customers are willing but not able — grant-funded entities in austerity, companies with frozen budgets, individuals without purchasing authority. Ability is not visible from the outside without asking.',
          'Ask directly about budget: "Have you spent money on this type of need in the past?" and "Is there a budget line for this?" Identify whether the person you are speaking to controls the budget or needs to refer.',
          'The team documents evidence of budget existence and decision authority for at least three potential customers who passed the Willing stage.',
          'At least one customer who seemed like a strong prospect is Unable — the budget holder is someone else, or the budget does not exist in the current cycle. That discovery prevents building a commercial model aimed at the wrong actor.'),
        comp('dp02_5','2.5','Three-Stage Adoption Test™ — Prioritised',
          'Tests whether able customers have allocated or protected budget for this problem in the current financial period.',
          'A customer who is willing and able but has twelve other priorities will not pay. Prioritisation is the commercial signal that separates a genuine pipeline from a polite conversation.',
          'Ask: "Is this problem on your active agenda right now?" Evidence of prioritisation: they have allocated time to it, raised it at senior level, or connected it to a current organisational pressure. Urgency language is the signal.',
          'The team documents at least one customer who has actively allocated budget or time to this problem in the current financial period.',
          'The Prioritised customer uses urgency language — names a deadline, a competitive pressure, or a financial consequence — without being prompted. That unprompted urgency is the strongest commercial signal available.'),
        comp('dp02_6','2.6','Validation Conversation Protocol',
          'The structured approach to conducting validation conversations that generate evidence rather than polite agreement.',
          'Unstructured conversations produce impressions. Structured conversations produce evidence. The protocol ensures every conversation generates comparable, documented data.',
          'Brief the team on the six signal dimensions: problem description, prior attempts, budget, decision authority, commitment, and urgency. Train the team to record verbatim, ask about behaviour not preference, allow silence, and not pitch during the conversation.',
          'The team conducts a minimum of five validation conversations using the protocol. Each conversation is documented in the Interview Capture format with verbatim responses recorded.',
          'At least three of five conversations produce strong signal on budget and decision authority. Fewer than three means the hypothesis needs to be refined before building the commercial model.'),
        comp('dp02_7','2.7','Customer Profile',
          'A detailed description of the validated paying customer — not a category but a named type with documented characteristics.',
          'A commercial model designed for "agricultural organisations" is designed for no one. A commercial model designed for "private agri-input companies in the $500K–$5M revenue range with a commercial director who controls a training budget" is designed for someone specific.',
          'From the validation conversations, build a customer profile: type of organisation, size range, geography, the specific role of the budget holder, the problem they own, what they have spent on adjacent services, and what they read and attend.',
          'The team produces a written customer profile for each validated customer segment — specific enough that a new team member could identify a qualified prospect from the description alone.',
          'A team member who was not in the validation conversations reads the profile and correctly identifies a qualified prospect from their own network. That is the test of specificity.'),
        comp('dp02_8','2.8','Problem Statement',
          'The problem described in the customer\'s exact words — not the organisation\'s interpretation.',
          'The language the customer uses to describe their problem is the raw material of the value proposition. Paraphrasing loses the precision that makes a value proposition land.',
          'Extract the exact phrases customers used in the validation conversations to describe their problem. Do not summarise or interpret. The problem statement is a direct quotation — or a composite of direct quotations from multiple customers describing the same problem.',
          'The team produces a problem statement for each validated customer segment, written entirely in the customer\'s language, with the source conversations cited.',
          'When the problem statement is read back to a validation conversation contact, they say "yes, that is exactly it" without asking for clarification. That confirmation is the standard.'),
        comp('dp02_9','2.9','DP02 Decision Record & Adoption Stage Profile',
          'The formal record of the validated customer and their position on the Three-Stage Adoption Test™.',
          'The adoption stage profile tells the organisation where the most important commercial work needs to happen. It shapes every downstream Decision Point.',
          'Produce the Decision Record: named customer segment, problem statement in their words, commercial signal evidence summary, and the adoption stage profile — where validated customers sit on Willing/Able/Prioritised and what would move them to the next stage.',
          'The Decision Record is produced and signed by the CEO before DP03 opens.',
          'The CEO can describe the customer type, their problem, and their adoption stage in a two-minute conversation with someone unfamiliar with the engagement. That fluency is the handover test.'),
      ]
    },

    // ── DP03 ────────────────────────────────────────────────
    {
      id: 'dp03', label: 'DP03 — Value Proposition Architecture',
      coreQuestion: 'Why does this service matter to this specific client — and can we prove it?',
      commitment: 'A client-tested value proposition for each priority service, revised after real client feedback.',
      sessionTime: '3–4 hrs', outputRequired: 'Tested value proposition per service with four components documented, differentiation argument with proof.',
      status: '○', completedAt: '', ceoSignedOff: false, ceoSignedOffAt: '',
      components: [
        comp('dp03_1','3.1','Capability Statement',
          'A precise description of what the organisation can reliably deliver — specific enough that a customer could hold the organisation accountable to it.',
          'Vague capability statements are not commitments. A commercial relationship is built on commitments.',
          'Write a one-sentence capability statement per Category A service: service type, delivery format, recipient, and what it produces. Apply the accountability test: if the customer hired you based on this and delivery did not match, would they have grounds to complain?',
          'The team produces a capability statement for each service that passes the accountability test.',
          'A team member who was not involved in writing the statement reads it and correctly describes what a delivery looks like. That is the specificity standard.'),
        comp('dp03_2','3.2','Problem Connection',
          'Links the capability to the customer\'s problem using the customer\'s own language from the DP02 validation conversations.',
          'A value proposition that uses the organisation\'s language is marketing. One that uses the customer\'s language is understanding. Customers respond to the latter.',
          'Return to the verbatim notes from DP02. Extract the exact phrases. Write the problem connection using those phrases — not a summary of them. Add the consequence framing: what is happening right now, in measurable terms, because this problem exists?',
          'The team produces a problem connection statement built entirely from verbatim customer language, with a consequence framing that names a measurable impact.',
          'When the problem connection is read to a validation contact, they lean forward. That physical signal is the standard.'),
        comp('dp03_3','3.3','Outcome Definition',
          'The measurable result the customer gets from working with the organisation — not an output but an outcome.',
          'Output is what is delivered. Outcome is what changes. Commercial decisions are made on outcomes, not outputs.',
          'Identify the measurable outcome from prior delivery evidence. Express it in the terms the customer uses to measure their own performance. If no outcome data exists yet, design the pilot specifically to generate it.',
          'The team produces an outcome statement per service, expressed in the customer\'s performance metrics, with prior evidence cited or pilot evidence plan documented.',
          'The outcome statement is specific enough that a customer could use it in a board presentation. That is the test.'),
        comp('dp03_4','3.4','Differentiation Argument',
          'The specific, provable reason why this customer should choose this organisation over every alternative.',
          'A differentiation claim that cannot be proved destroys credibility rather than building it.',
          'Identify the differentiation type — capability, context, or access. Write the claim. Apply the proof test: if the customer asked to see the proof, could it be produced? Revise until the answer is yes.',
          'The team produces a differentiation argument for each service that passes the proof test.',
          'The differentiation argument survives a sceptical question from a new contact who has no prior relationship with the organisation.'),
        comp('dp03_5','3.5','Value Proposition Assembly',
          'Combines the four components into a two to three sentence statement that is immediately compelling to the validated customer.',
          'A value proposition that sounds like marketing has not been built from customer evidence. One that sounds like a direct answer to the customer\'s problem has been.',
          'Combine: capability + problem (customer\'s words) + outcome (measurable) + differentiation (provable). Write two to three sentences. Read aloud. If it sounds like a brochure, rebuild it from the components.',
          'The team produces a complete value proposition per service — two to three sentences, built from the four components, readable in under 30 seconds.',
          'A member of the target customer type reads the proposition and asks about pricing. That question is the signal that the proposition is working.'),
        comp('dp03_6','3.6','Value Proposition Testing',
          'Tests the value proposition with real potential customers before it is used in the market.',
          'A value proposition tested only internally reflects what the organisation thinks is compelling. One tested with customers reflects what actually compels.',
          'Share the draft proposition with two or three validation conversation contacts. Ask: does this describe what you need? Does this sound like something you would pay for? Use their responses to refine.',
          'The value proposition is tested with at least two potential customers and revised based on their feedback. The revision is documented.',
          'The revised proposition is shorter and more specific than the original. That compression is the evidence that it has been genuinely refined, not just endorsed.'),
        comp('dp03_7','3.7','Alternative Comparison',
          'Explicitly positions the service against what the customer would do if they did not buy — including doing nothing.',
          'Every customer has an alternative. An organisation that does not know the alternative cannot price against it or differentiate from it.',
          'Identify the customer\'s realistic alternatives: a competitor, an internal solution, doing nothing, a workaround. For each alternative, document the cost (financial, time, quality) and where the organisation\'s offer is superior.',
          'The team produces an alternative comparison document for each service, used internally to prepare for pricing and objection handling.',
          'The team can articulate the alternative comparison in a client conversation without referring to the document.'),
        comp('dp03_8','3.8','Value Proposition by Segment',
          'Adapts the value proposition for each validated customer segment, since different segments have different problems and different language.',
          'A value proposition written for one segment and applied to all segments produces weak results with all of them.',
          'For each validated customer segment, revise the value proposition to reflect the specific problem language, outcome priorities, and differentiation points that matter most to that segment.',
          'The team produces a distinct value proposition per customer segment — different enough to reflect genuine segment differences, consistent enough to be recognisably the same service.',
          'A team member can identify which segment a given customer belongs to from their first question about the service.'),
        comp('dp03_9','3.9','DP03 Decision Record',
          'The formal record of the tested and validated value proposition for each service.',
          'A value proposition that is designed but not formally adopted will drift. The Decision Record makes it the organisation\'s official commercial positioning.',
          'Produce the Decision Record: final value proposition per service, the customer testing evidence, and any outstanding refinements. CEO signs off before DP04 opens.',
          'The Decision Record is produced and signed by the CEO.',
          'The CEO presents the value proposition in a real stakeholder meeting without preparation support. That presentation is the final test.'),
      ]
    },

    // ── DP04 ────────────────────────────────────────────────
    {
      id: 'dp04', label: 'DP04 — Commercial Viability Model',
      coreQuestion: 'Does this service sustain us — and can we prove it with numbers that hold?',
      commitment: 'Working financial model in Clearview. Price floor calculated. Two pricing tiers minimum. Break-even confirmed.',
      sessionTime: '4–5 hrs', outputRequired: 'Tiered pricing structure, break-even calculation, working financial model that non-technical staff can run.',
      status: '○', completedAt: '', ceoSignedOff: false, ceoSignedOffAt: '',
      components: [
        comp('dp04_1','4.1','Full Cost Structure',
          'A complete breakdown of the cost of delivering each service once, covering all five cost categories.',
          'The single most common commercial failure is setting prices without knowing costs. The cost structure is the foundation of every financial decision that follows.',
          'Five categories: Direct Labour (all staff time at realistic daily rates including overhead allocation), Direct Materials, Travel & Logistics, Quality Assurance, Overhead Allocation. Use bottom-up costing — not budget allocations.',
          'The team produces a completed cost structure table for each Category A service, with every cost category populated and a total cost per unit calculated.',
          'The cost per unit is higher than the team expected. Almost always. That discovery is the purpose of this component.'),
        comp('dp04_2','4.2','Floor Price',
          'The minimum price at which the organisation breaks even on a single delivery of the service.',
          'Any price below the floor price generates a loss. The floor price is the constraint that every pricing decision must respect.',
          'Sum all five cost categories for a single delivery. This is the floor price. Compare it to the pricing signals from DP02. If the floor price is above the range customers indicated, identify the response: reduce cost, reframe value, or find a different segment.',
          'The team produces a documented floor price for each service, compared to the DP02 pricing signals, with a clear response if there is a gap.',
          'The team does not adjust the cost estimate to make the floor price fit a price they have already decided on. The sequence must be: calculate cost, then set price.'),
        comp('dp04_3','4.3','Pricing Tiers',
          'A structured pricing model with at least two tiers — Entry and Standard — designed to reduce barriers to the first transaction while generating sustainable revenue.',
          'A single price leaves revenue on the table from customers who would pay more and excludes customers who would buy a lower-cost version.',
          'Design Entry tier (minimum viable version, first-time customers, fixed fee) and Standard tier (core service plus additional components, main revenue tier, must cover floor price plus margin). Design Premium tier if evidence of demand exists.',
          'The team produces a tiered pricing structure with documented rationale for each tier — what is included, who it is for, and why the price is set where it is.',
          'The Standard tier price covers the full floor price plus a margin contribution toward fixed costs. Any tier priced below the floor price is a loss on every sale.'),
        comp('dp04_4','4.4','Break-Even Calculation',
          'The number of deliveries required per period for the organisation to cover all its fixed costs from commercial revenue.',
          'An organisation that does not know its break-even is not running a commercial model — it is running a programme with a price attached.',
          'Formula: Fixed costs ÷ (Standard tier price − direct cost per delivery) = number of deliveries required per year. Ask: is this achievable given current capacity? Is the market large enough?',
          'The team produces a documented break-even calculation and a realistic assessment of whether the volume required is achievable.',
          'A non-technical staff member updates the break-even calculation when one input changes and explains what the new figure means for their pricing decision. That is the usability standard.'),
        comp('dp04_5','4.5','Financial Model Build',
          'A working spreadsheet that the organisation\'s own staff can run, update, and use to make real pricing decisions.',
          'A financial model built by the consultant and filed by the organisation is a document. One built by the organisation\'s own staff is a tool.',
          'Build the model in Clearview — or in a spreadsheet linked from this record. Five sections: cost structure, pricing tiers, break-even calculation, 12-month revenue projection, scenario analysis. The model must be updatable by a non-builder in under 10 minutes.',
          'The financial model is built and linked from this Decision Point. A non-builder updates an input and recalculates the break-even in under 10 minutes.',
          'The non-technical staff member says "I can do this." That statement is the DP04 completion signal specified in the handbook.'),
        comp('dp04_6','4.6','Scenario Analysis',
          'Tests the financial model under three scenarios: conservative, base case, and optimistic — to understand the risk envelope.',
          'An organisation that has only modelled the base case does not know how fragile or resilient its commercial model is.',
          'Run three scenarios in the financial model: conservative (−20% revenue, +10% costs), base case, optimistic (+20% revenue, −5% costs). Document what happens to break-even under each scenario.',
          'The team produces a scenario analysis table showing break-even volume under all three scenarios.',
          'The team can describe what specific combination of conditions would make the model unviable — and has a response plan for that scenario.'),
        comp('dp04_7','4.7','Capital Structure Review',
          'Reviews the organisation\'s current capital structure — grants, loans, equity — and its implications for the commercial model.',
          'Recoverable grants and loans create repayment obligations that affect cash flow. An organisation that does not account for these in its financial model will appear viable when it is not.',
          'Document all funding obligations: recoverable grants, bank loans, repayment schedules, interest rates. Build these into the financial model\'s cash flow. Confirm that commercial revenue can service these obligations at break-even volume.',
          'The capital structure is documented and reflected in the Clearview financial model, with repayment obligations visible in the cash flow statement.',
          'The cash flow statement shows the organisation can service all funding obligations at the break-even volume. If it cannot, the pricing or volume target must be adjusted.'),
        comp('dp04_8','4.8','Grant Dependency Ratio Target',
          'Sets a measurable target for reducing dependence on grant income over the engagement timeline.',
          'Without a quantified target, the transition from grant to commercial is aspirational rather than managed.',
          'Set a twelve-month target: commercial fee income as a percentage of total income. Recommended minimum: 30% by month 18. Build this target into the financial model as a tracking metric.',
          'The team sets a documented grant dependency ratio target, agrees the timeline, and confirms it is reflected in the financial model.',
          'The Leadership Team refers to the ratio target when making a staffing or service development decision. That reference is the signal that the target is owned.'),
        comp('dp04_9','4.9','DP04 Decision Record',
          'The formal record of the commercial model — floor price, pricing tiers, break-even, and the financial model link.',
          'A commercial model that is agreed in a session but not formally recorded will drift under pricing pressure from the first difficult customer conversation.',
          'Produce the Decision Record: floor price per service, pricing tiers with rationale, break-even calculation, financial model link, and grant dependency ratio target. CEO signs before DP05 opens.',
          'The Decision Record is produced and signed by the CEO.',
          'The CEO presents the pricing structure to a real potential customer and defends the Standard tier price without discounting. That conversation is the final test.'),
      ]
    },

    // ── DP05 ────────────────────────────────────────────────
    {
      id: 'dp05', label: 'DP05 — Market Entry Design',
      coreQuestion: 'How do we reach the right clients, with the right message, through the right channels — and in what order?',
      commitment: 'Segmented outreach plan. A/B tested messaging. Pipeline Tracker with minimum 10 priority organisations.',
      sessionTime: '3–4 hrs', outputRequired: 'Prioritised customer pipeline, tested outreach message, three client-facing materials.',
      status: '○', completedAt: '', ceoSignedOff: false, ceoSignedOffAt: '',
      components: [
        comp('dp05_1','5.1','Segment Prioritisation',
          'Ranks validated customer segments against four criteria to identify the primary entry segment.',
          'An organisation that pursues all segments simultaneously produces shallow engagement everywhere. Concentration on the highest-scoring segment first is what produces the first commercial client.',
          'Score each segment on Problem Urgency, Budget Clarity, Access, and Scalability — each 1–5 with anchored definitions. The highest-scoring segment is the primary entry target.',
          'The team produces a scored segment prioritisation table and identifies the primary entry segment with a one-sentence rationale.',
          'The team can explain why they are not leading with a segment that seems larger or more exciting. That explanation reveals whether the prioritisation is evidence-based.'),
        comp('dp05_2','5.2','Warm Introduction Mapping',
          'Inventories every existing relationship that could produce a warm introduction to a qualified potential customer.',
          'Warm introductions convert to meetings at 60–80%. Cold outreach converts at 3–8%. The warm introduction map is the most valuable commercial asset most organisations have never inventoried.',
          'For the primary entry segment: who on the team knows someone at a target organisation? Who has attended an event with target organisation representatives? Who has a prior working relationship that could open a commercial conversation?',
          'The team produces a warm introduction map — specific names, specific relationships, specific ask, specific owner, and specific timeline for each.',
          'At least one introduction exists that the team had not previously thought of as a commercial asset. That discovery is the point of the exercise.'),
        comp('dp05_3','5.3','Outreach Message',
          'A direct outreach message built from the value proposition — specific, outcome-focused, and testable.',
          'Generic outreach produces near-zero conversion. A message built from the customer\'s problem language and a specific outcome claim produces a response rate worth building on.',
          'Write the message: subject line (customer\'s problem in their words), opening two sentences (problem + consequence), and call to action (specific meeting request). Test with 15 contacts before scaling.',
          'The team produces a tested outreach message with a documented open rate and response rate from the test cohort.',
          'The response rate from the test exceeds 15%. If it does not, the message is revised and retested before scaling.'),
        comp('dp05_4','5.4','Message Testing',
          'Tests the outreach message with a small cohort before committing to scaled outreach.',
          'An untested message sent to 200 contacts that produces zero responses has consumed the goodwill of 200 people who will not engage again.',
          'Three tests: subject line test (three versions, 15 contacts each, measure open rate), response rate test (measure response to opening sentences), meeting conversion test (measure percentage of respondents who agree to meet).',
          'The team produces documented test results for each of the three tests, with the winning message identified and the revision rationale documented.',
          'Meeting conversion rate exceeds 30% of respondents. If not, the offer or targeting is revised before scaling.'),
        comp('dp05_5','5.5','Pipeline Tracker',
          'A five-stage tracker of every qualified potential customer — identified, contacted, met, proposal sent, closed.',
          'Without a pipeline, the organisation cannot distinguish between a slow market and a broken process. The pipeline makes the bottleneck visible.',
          'Build a pipeline for the primary segment with a minimum of 10 qualified contacts across the five stages. Assign a relationship owner to each contact. Set a follow-up schedule.',
          'The team produces a pipeline with at least 10 qualified contacts, each assigned to an owner, each with a next action and a timeline.',
          'The pipeline is reviewed weekly. Contacts that have not moved in two weeks have a documented reason. That discipline is the signal that the pipeline is being managed actively.'),
        comp('dp05_6','5.6','Client-Facing Materials',
          'Three essential materials for the outreach and conversion process: one-page service description, case study or evidence summary, pricing menu.',
          'Outreach without materials is a conversation that cannot be followed up. Materials without a tested message are produced before they are needed.',
          'Produce: (1) one-page service description — uses the value proposition language, describes what the customer receives; (2) case study or evidence summary — one completed engagement or pilot described in outcome terms; (3) pricing menu — entry and standard tiers with what each includes.',
          'The three materials are produced, reviewed against the value proposition language, and ready to send.',
          'A potential customer reads the one-page description and asks a specific question about their own situation. That question is the signal that the description is specific enough.'),
        comp('dp05_7','5.7','Channel Architecture',
          'Maps the channels through which the service will reach customers beyond the first cohort of warm introductions.',
          'Warm introductions cannot scale indefinitely. The channel architecture identifies the institutional routes that extend reach without requiring new warm relationships for every client.',
          'Identify three channel types: referral partners (existing contacts who can introduce qualified prospects), sector associations (institutional channels that reach the target segment), peer organisations (complementary organisations whose clients overlap with the target segment).',
          'The team produces a channel architecture with at least three channels identified, each with a named contact, an activation step, and a conversion rate estimate.',
          'At least one channel has an existing relationship that can be activated immediately. The team does not need to build the relationship from scratch.'),
        comp('dp05_8','5.8','Market Entry Launch Date',
          'A specific, committed date on which the first commercial outreach will occur — not a target range but a named date.',
          'Without a launch date, market entry is perpetually two weeks away. The date creates the accountability that converts preparation into action.',
          'Set a specific Market Entry Launch Date. Define what will happen on that date: who will make the first outreach, to which contact, using which message, through which channel. Document it.',
          'The team commits to a Market Entry Launch Date in writing and can describe exactly what will happen on that date without prompting.',
          'The team refers to the launch date in subsequent sessions as the anchor for all preparation activities. That reference is the signal that the commitment is real.'),
        comp('dp05_9','5.9','DP05 Decision Record',
          'The formal record of the market entry plan — primary segment, pipeline, message, materials, and launch date.',
          'A market entry plan that is agreed but not formally recorded will be reinterpreted under the pressure of the first difficult outreach conversation.',
          'Produce the Decision Record: primary entry segment rationale, pipeline status, tested message, three materials, channel architecture, and launch date. CEO signs before DP06 opens.',
          'The Decision Record is produced and signed by the CEO.',
          'The CEO names the launch date in a conversation with a board member or funder. That public commitment is the final test.'),
      ]
    },

    // ── DP06 ────────────────────────────────────────────────
    {
      id: 'dp06', label: 'DP06 — Identity & Partner Architecture',
      coreQuestion: 'Who are we as a Service Provider — and who stands alongside us?',
      commitment: 'Commercial Identity Statement — two sentences. Partner map with every partner categorised.',
      sessionTime: '2–3 hrs', outputRequired: 'Commercial identity statement, positioning evidence, partner map with reinforcing/undermining assessment.',
      status: '○', completedAt: '', ceoSignedOff: false, ceoSignedOffAt: '',
      components: [
        comp('dp06_1','6.1','Commercial Identity Type',
          'Identifies which of the four commercial identity types applies: specialist advisory firm, training and capacity provider, research and intelligence provider, or systems and tools provider.',
          'The identity type determines how the organisation positions itself, what evidence base it builds, and what pricing structure it uses. The wrong identity type sends a confusing signal to the market.',
          'Present the four identity types with their characteristics. The team selects the primary identity type and a secondary if applicable. The primary must be specific enough to exclude some customer types — an identity that includes everyone includes no one.',
          'The team identifies their primary commercial identity type with a one-sentence rationale explaining why it fits the validated customer and service.',
          'The team finds it difficult to choose between two types. That difficulty is productive — it reveals where the positioning is not yet clear.'),
        comp('dp06_2','6.2','Commercial Identity Statement',
          'A one-paragraph description of the organisation\'s commercial identity — who it is, what it does, for whom, and what makes it the right choice.',
          'The commercial identity statement is used in direct outreach, on the commercial-facing profile, and in partner conversations. Without it, every commercial interaction starts from scratch.',
          'Write the statement for the target customer — not for a general audience. One paragraph. Uses the customer\'s language. Describes the problem being solved, the type of organisation being served, and the specific capability being offered.',
          'The team produces a commercial identity statement that passes the customer-language test and the specificity test.',
          'The Leadership Team uses the statement spontaneously when introducing the organisation to a new contact — without prompting and without defaulting to the grant-funded history.'),
        comp('dp06_3','6.3','Development vs Commercial Identity Separation',
          'Deliberately separates the commercial identity from the development identity so each is presented in the appropriate context.',
          'An organisation that presents its development identity in commercial contexts creates cognitive dissonance. The development and commercial identities can coexist — but they cannot be used interchangeably.',
          'Identify which materials, profiles, and events are commercial-facing and which are development-facing. Agree the rule: in commercial contexts, lead with the commercial identity. In development contexts, lead with the development identity.',
          'The team produces a written separation protocol — which identity is used in which context, with specific examples.',
          'The commercial-facing website page or profile does not include donor programme logos. That omission is the signal that the separation has been made.'),
        comp('dp06_4','6.4','Positioning Evidence',
          'Identifies the two or three pieces of evidence that most powerfully support the commercial identity.',
          'An identity claim without evidence is aspiration. With evidence, it is positioning.',
          'Identify the evidence: prior client outcomes, sector recognition, proprietary methodology, track record in a specific context. Each piece must be independently verifiable by a potential customer.',
          'The team produces a positioning evidence list — two or three specific pieces of evidence, each described in one sentence, each independently verifiable.',
          'A potential customer reads the positioning evidence and asks a follow-up question about methodology or track record. That question confirms the evidence is credible.'),
        comp('dp06_5','6.5','Partner Map',
          'Maps every current partnership against its effect on the commercial identity — reinforcing, undermining, or neutral.',
          'Every partnership sends a signal. An organisation that does not manage its partnership signals is allowing others to define its commercial identity.',
          'List all current partnerships. For each: assess whether it reinforces, undermines, or is neutral to the commercial identity. For undermining partnerships, identify whether they can be repositioned or should be reduced in visibility.',
          'The team produces a completed partner map with an assessment for each partnership and a specific action for each undermining partnership.',
          'The team takes action on at least one undermining partnership before the end of the engagement. Action may be reducing visibility rather than ending the relationship.'),
        comp('dp06_6','6.6','Referral Partner Identification',
          'Identifies the specific organisations that could send qualified referrals to the organisation — and initiates those relationships.',
          'Referral partnerships are the highest-converting channel available. They must be built from the first client, not after the commercial model is running.',
          'Identify three to five organisations whose clients overlap with the target segment and whose own offering is complementary rather than competitive. For each, identify the specific person to approach and the specific value exchange.',
          'The team produces a referral partner target list with named contacts and a plan to initiate each relationship within the engagement timeline.',
          'At least one referral partner has been approached and has agreed in principle to make introductions. That agreement is the signal.'),
        comp('dp06_7','6.7','Endorsement and Association',
          'Identifies which sector associations, professional bodies, or institutional relationships would lend credibility to the commercial identity.',
          'Credibility that comes from association is faster to build than credibility that comes from track record alone — especially in markets where the organisation is not yet known commercially.',
          'Identify two to three associations or bodies whose membership would signal credibility to the target customer. For each, assess whether membership, speaking opportunities, or partnership agreements are the right entry point.',
          'The team produces an endorsement target list with a specific entry point and timeline for each.',
          'The team attends or speaks at one sector event before the end of the engagement in their commercial identity capacity.'),
        comp('dp06_8','6.8','Co-Delivery Partner Assessment',
          'Identifies whether a co-delivery partner is needed to fill a capability gap in the current service model.',
          'A co-delivery partner fills a gap. A co-delivery partner for a capability the organisation already has dilutes rather than strengthens.',
          'For each Category A service, identify whether the full delivery requires a capability the organisation does not currently have. If yes, identify the co-delivery partner type and assess whether the partnership is genuinely needed or whether the capability should be built internally.',
          'The team produces a co-delivery partner assessment — for each service, either "no partner required" with rationale, or a specific partner profile and a plan to identify a named partner.',
          'The team can describe their co-delivery partner as filling a specific gap, not as validating the engagement.'),
        comp('dp06_9','6.9','DP06 Decision Record',
          'The formal record of the commercial identity and partner architecture.',
          'A commercial identity agreed in a session but not formally adopted will be overridden by the development identity in the first difficult commercial conversation.',
          'Produce the Decision Record: commercial identity statement, positioning evidence, partner map with actions, referral partner targets, and the development vs commercial separation protocol. CEO signs before DP07 opens.',
          'The Decision Record is produced and signed by the CEO.',
          'The CEO uses the commercial identity statement in a real context before the end of the engagement. That use is the final test.'),
      ]
    },

    // ── DP07 ────────────────────────────────────────────────
    {
      id: 'dp07', label: 'DP07 — Pilot & Learn Architecture',
      coreQuestion: 'Does the commercial model work under real conditions — and what do we know now that we did not before?',
      commitment: 'Four real client engagements across two iterations. Iteration comparison document. Commercial model revised.',
      sessionTime: '8–12 hrs', outputRequired: 'Two completed pilot records, two payments, two debrief records, revision list, scale readiness verdict.',
      status: '○', completedAt: '', ceoSignedOff: false, ceoSignedOffAt: '',
      components: [
        comp('dp07_1','7.1','Pilot Architecture Design',
          'Defines what the pilot is testing, what confirming and disconfirming evidence looks like, and what the revision boundaries are between iterations.',
          'An undesigned pilot produces activity. A designed pilot produces evidence. The design decisions made here determine what the pilots can produce.',
          'Document: specific assumptions being tested, confirming evidence standard per assumption, disconfirming evidence standard, client selection criteria for each iteration, observation framework, revision boundaries.',
          'The team produces a pilot architecture document agreed by all delivery team members before the first client is approached.',
          'The team can describe what a failed pilot looks like — what specific evidence would require a return to a previous Decision Point. That clarity is the signal that the architecture is genuine.'),
        comp('dp07_2','7.2','Iteration 1 Client Selection',
          'Identifies the right client for Iteration 1 — the one who will test the model most rigorously, not the one most likely to give positive feedback.',
          'A pilot client selected for their willingness to support the organisation produces misleading evidence. The right client tests the model.',
          'Apply three criteria: genuine problem ownership (budget holder confirmed, not just an interested staff member), written commitment (not verbal), adequate complexity (will push back and give honest feedback).',
          'The team identifies the Iteration 1 client, confirms all three criteria are met, and secures a written commitment before the session is scheduled.',
          'The Iteration 1 client is not the most convenient contact. The deliberate choice of a more challenging client is the signal that the architecture is being applied.'),
        comp('dp07_3','7.3','Iteration 1 Delivery',
          'The first live commercial engagement — planned, delivered, and debriefed using the observation framework.',
          'The first commercial engagement is always imperfect. The standard is not perfection — it is that the engagement produces a payment and a specific revision list.',
          'Complete the pre-engagement checklist. Assign the observer role. Run the internal debrief immediately after. Run the client debrief within 48 hours. Document verbatim responses against all five debrief dimensions.',
          'The team produces: a completed engagement, a payment or formal payment commitment, a documented internal debrief, a documented client debrief, and a specific revision list.',
          'The revision list contains three to five specific changes, each with a clear rationale from the evidence. A list of more than ten items suggests fundamental redesign is needed before Iteration 2.'),
        comp('dp07_4','7.4','Revision Process',
          'The structured review that converts Iteration 1 evidence into specific, bounded revisions for Iteration 2.',
          'Unstructured revision produces changes based on what the coach thinks should be different rather than what the evidence says needs to change.',
          'Three-step process: synthesise the evidence, diagnose the root cause of each gap, make bounded revisions addressing root causes only. Complete within one week of the Iteration 1 debrief.',
          'The team produces a revision document: three to five changes, each with the evidence source cited, the root cause identified, and the specific change described.',
          'The revisions address root causes, not symptoms. A revision that changes a word in the value proposition when the root cause is a misidentified customer is a symptom fix.'),
        comp('dp07_5','7.5','Iteration 2 Client Selection',
          'Identifies the right client for Iteration 2 — different from Iteration 1 in at least one significant dimension.',
          'Iteration 2 tests whether the model works beyond the warmest entry point. If both iterations use the same type of relationship, the evidence does not confirm repeatability.',
          'The Iteration 2 client must differ from Iteration 1 in at least one significant way: different contact source, different sub-segment, or different scale of engagement. The organisation\'s staff lead all client interactions in Iteration 2 — the coach is not in the lead.',
          'The team identifies the Iteration 2 client with the significant difference documented, and confirms the organisation will lead all interactions.',
          'The organisation\'s staff manage the entire Iteration 2 engagement without requesting coach support at any stage.'),
        comp('dp07_6','7.6','Iteration 2 Delivery',
          'The second live commercial engagement — led by the organisation\'s staff, with the coach in an observer role only.',
          'Iteration 2 is the independence test. The coach\'s absence from the lead is not optional — it is the purpose of the second iteration.',
          'Run Iteration 2 with the revised model. Organisation staff lead all interactions. Complete the observation framework, internal debrief, and client debrief using the same protocol as Iteration 1.',
          'The team produces: a completed engagement, a payment, a documented internal debrief, and a documented client debrief.',
          'The organisation\'s staff do not request coach support during or immediately after the Iteration 2 session. That independence is the signal.'),
        comp('dp07_7','7.7','Comparative Evidence Analysis',
          'A structured comparison of Iteration 1 and Iteration 2 evidence to identify what improved, what remained constant, and what still needs work.',
          'Without a comparison, the two iterations produce two separate data points rather than an evidence progression.',
          'Compare across all five debrief dimensions: which elements were consistent across both clients (confirming), which improved from Iteration 1 to Iteration 2 (validating the revision), which remained problematic (requiring further development).',
          'The team produces a comparative evidence analysis document — a side-by-side comparison of both iterations with a clear assessment of what the evidence shows.',
          'The team can articulate what they know now that they did not know before the pilots. That articulation is the handbook\'s definition of DP07 completion.'),
        comp('dp07_8','7.8','Commercial Readiness Diagnostic — Final Reading',
          'The third and final reading of the Commercial Readiness Diagnostic, taken after both pilot iterations are complete.',
          'The final reading measures how far the organisation has moved across the full canvas journey and quantifies the evidence generated.',
          'Score all six fit tests using the 0–3 scale. Compare to baseline and mid-point readings. Document the movement at each stage and the specific evidence that drove each score.',
          'The team produces the final Diagnostic reading with all six scores and the movement documented.',
          'The final reading is above 12 out of 18. If not, identify which fit tests are still below 2 and what specific work is needed before the scale decision.'),
        comp('dp07_9','7.9','Scale Readiness Verdict',
          'The formal verdict on whether the commercial model is ready to scale — Verdict 01 (ready), 02 (ready with revisions), or 03 (return to design).',
          'The verdict is the output that determines what happens next. It must be based on evidence, not on optimism.',
          'Issue one of three verdicts: Verdict 01 — both iterations produced payment, consistent problem confirmation, price acceptance without resistance. Verdict 02 — payments received but specific gaps need bounded revisions. Verdict 03 — fundamental problem identified requiring return to a specific Decision Point.',
          'The team produces a written scale readiness verdict with the specific evidence cited for the verdict.',
          'Verdict 03 is not treated as a failure. It is treated as the pilot working correctly — surfacing a problem at the cheapest possible point rather than after scaling.'),
      ]
    },

    // ── DP08 ────────────────────────────────────────────────
    {
      id: 'dp08', label: 'DP08 — Scale & Expansion Pathway',
      coreQuestion: 'What does growth look like from here — and what do we need to make it real?',
      commitment: 'Scale Pathway Commitment Document. 36-month revenue projection. Resource requirements map.',
      sessionTime: '3–4 hrs', outputRequired: 'Named, sequenced, owned scale pathway with at least two expansion segments and independent channel logic.',
      status: '○', completedAt: '', ceoSignedOff: false, ceoSignedOffAt: '',
      components: [
        comp('dp08_1','8.1','Founding Cohort Conversion',
          'Converts the warm relationships already in the pipeline to paying clients — the first stage of the scale pathway.',
          'The founding cohort exists already. The scale pathway begins not with new relationships but with converting existing ones.',
          'List every qualified contact in the current pipeline who has not yet paid. For each: assign a relationship owner, identify the next action, set a timeline, and confirm whether this is the right entry point for the commercial offer.',
          'The team produces a founding cohort conversion plan — named contacts, owners, next actions, and timelines.',
          'At least two founding cohort contacts convert to paying clients within 60 days of the scale pathway being activated.'),
        comp('dp08_2','8.2','Referral Expansion',
          'Uses satisfied pilot clients as the entry point to the next tier of customers — the highest-converting expansion channel.',
          'A satisfied client who refers is worth fifteen cold outreach contacts in conversion terms. The referral ask must be systematic, not opportunistic.',
          'Design the referral ask: when it is made (at the debrief or at the renewal conversation), what it asks for (a specific introduction to a named type of contact), and what follow-up looks like.',
          'The team produces a referral expansion protocol — the specific ask, the timing, and the follow-up process — and applies it to both pilot clients.',
          'At least one referral introduction is made within 90 days of DP08 being activated. The referral produces a qualified conversation.'),
        comp('dp08_3','8.3','Channel Expansion',
          'Identifies institutional channels — sector associations, professional bodies, training registries — that reach the target segment without warm introduction.',
          'Warm introductions cannot scale indefinitely. Channel expansion is what converts a commercial model from a network business to a market business.',
          'For each channel: name the organisation, describe the member profile and why it matches the target segment, identify the entry point (speaking, membership, partnership), name the relationship owner, and set a timeline.',
          'The team produces a channel expansion plan with two to three specific channels, each with a named entry point, owner, and timeline.',
          'At least one channel relationship is initiated within 60 days. Initiated means a conversation has occurred, not that a plan exists.'),
        comp('dp08_4','8.4','Segment Expansion',
          'Identifies adjacent customer segments that the service can reach with modest adaptation.',
          'Adjacent segments often produce faster growth than the founding segment because the value proposition is already proven and the capability is already built.',
          'Identify two adjacent segments — organisations with a related problem the service can address with adaptation. For each: describe the adaptation required, identify at least one pilot client in that segment, and assess whether evidence from one engagement would be sufficient to confirm viability.',
          'The team produces a segment expansion plan with two adjacent segments, each with an adaptation description and a pilot client candidate.',
          'The team does not pursue segment expansion before completing at least three engagements in the founding segment. Segment expansion is the second stage, not the first.'),
        comp('dp08_5','8.5','36-Month Revenue Projection',
          'A grounded projection of commercial revenue over 36 months, based on the scale pathway stages and confirmed conversion rates.',
          'A projection built on assumptions produces a number. A projection built on evidence from the pilots produces a tool for managing the commercial transition.',
          'Build the 36-month projection in the Clearview financial model. Base it on confirmed conversion rates from outreach testing and pilot evidence. Model three scenarios.',
          'The 36-month projection is built, linked from this record, and based on documented assumptions with sources cited.',
          'A non-technical staff member can update one assumption in the projection and explain what the change means for the organisation\'s hiring decision. That usability is the standard.'),
        comp('dp08_6','8.6','Resource Requirements Map',
          'Identifies the specific people, technology, and systems needed to deliver the commercial model at scale.',
          'An organisation that scales revenue without scaling capacity produces declining quality. The resource map is what prevents that.',
          'Map: what the current team can deliver at current capacity, what additional capacity is needed for each stage of the scale pathway, and at what revenue level each additional resource can be funded from commercial income.',
          'The team produces a resource requirements map — current capacity ceiling, stage-by-stage additions, and funding trigger for each addition.',
          'The CEO can describe the resource requirements map in a conversation with a potential investor or board member without preparation. That fluency is the test.'),
        comp('dp08_7','8.7','Pipeline Requirement',
          'Calculates the pipeline size needed to sustain the commercial model — and assesses whether current pipeline development is sufficient.',
          'A pipeline smaller than three times annual delivery capacity means the organisation will reach a volume ceiling before its commercial model is self-sustaining.',
          'Calculate: annual delivery capacity × 3 = minimum pipeline size at all times. Assess current pipeline against this requirement. Identify which channels need to be activated to maintain the required pipeline.',
          'The team produces a documented pipeline requirement calculation and an assessment of the gap between current and required pipeline.',
          'The team reviews the pipeline requirement monthly and adjusts channel activity when the pipeline falls below the required size.'),
        comp('dp08_8','8.8','Independence Test',
          'Confirms that the scale pathway can be executed without programme facilitation, coach introductions, or external support.',
          'A scale pathway that depends on programme support to reach new clients is not independent. The test of independence is whether the pathway works in the absence of every form of external facilitation.',
          'For each channel and segment in the scale pathway: confirm that the organisation has or can build the relationship, the capability, and the process needed to execute it without external support.',
          'The team produces a documented independence assessment — for each pathway element, either confirmed independent or identified dependency with a plan to resolve it.',
          'The team can execute the first 90 days of the scale pathway without any coach involvement. That execution is the test.'),
        comp('dp08_9','8.9','DP08 Decision Record & Scale Pathway Commitment',
          'The formal record of the scale pathway — the organisation\'s committed plan for reaching commercial sustainability independently.',
          'A scale pathway agreed in a session but not formally committed will be the first thing abandoned when the engagement pressure is removed.',
          'Produce the Scale Pathway Commitment Document: founding cohort conversion plan, referral expansion protocol, channel expansion plan, segment expansion plan, 36-month projection, resource map. CEO signs.',
          'The Commitment Document is produced and signed by the CEO.',
          'The CEO refers to the Commitment Document when making a commercial decision not anticipated during the engagement. That reference is the handbook\'s completion signal for DP08.'),
      ]
    },

    // ── DP09 ────────────────────────────────────────────────
    {
      id: 'dp09', label: 'DP09 — Commercial Readiness Diagnostic',
      coreQuestion: 'Where are we on the journey — and what does the evidence actually show?',
      commitment: 'Commercial Readiness Diagnostic scored at three points. Investment Case Summary. Formal Handover Presentation delivered.',
      sessionTime: '1–2 hrs × 3', outputRequired: 'Diagnostic scored at baseline, mid-point, and close. Investment Case Summary. Handover Presentation delivered without notes.',
      status: '○', completedAt: '', ceoSignedOff: false, ceoSignedOffAt: '',
      components: [
        comp('dp09_1','9.1','Baseline Reading',
          'The first reading of the Commercial Readiness Diagnostic — taken before Phase 0 begins. Measures the starting position.',
          'Without a baseline reading, the final reading has no reference point. The progression from baseline to final is the quantified evidence of what the engagement produced.',
          'Score all six fit tests: Problem-Provider Fit, Problem-Solution Fit, Solution-Customer Fit, Solution-Pilot Fit, Solution-Market Fit, Solution-Scale Fit. Use the 0–3 scale with documented anchors. Score independently first, then discuss.',
          'The team produces and records the baseline Diagnostic reading with all six scores and the total.',
          'The team\'s baseline score is lower than expected. That honest reading is what makes the final reading meaningful.'),
        comp('dp09_2','9.2','Mid-Point Reading',
          'The second reading — taken after DP01 through DP06 are complete. Identifies gaps before the pilots begin.',
          'The mid-point reading is the quality gate before the pilots. An organisation that enters DP07 with Problem-Solution Fit or Solution-Customer Fit below 2 will produce activity, not evidence.',
          'Repeat the six fit test scoring after completing DP01–DP06. For any test scoring 0 or 1, identify the specific Decision Point that needs to be revisited before the pilots begin.',
          'The team produces the mid-point reading with all six scores, the movement from baseline documented, and a gap closure plan for any score below 2.',
          'Problem-Solution Fit and Solution-Customer Fit both score 2 or above before DP07 opens. If either scores below 2, DP07 does not open.'),
        comp('dp09_3','9.3','Final Reading',
          'The third reading — taken after both pilot iterations are complete. Measures the full progression.',
          'The final reading is the engagement\'s summary evidence — the quantification of how far the organisation has moved from assumption to evidence.',
          'Repeat the six fit test scoring after completing DP07. Document the movement from mid-point to final. The final reading should show improvement on every test compared to mid-point.',
          'The team produces the final reading with all six scores and the full progression from baseline to final documented.',
          'The final reading is above 12 out of 18. If not, the scale readiness verdict is Verdict 02 or 03.'),
        comp('dp09_4','9.4','Commercial Readiness Progression Report',
          'A visual and narrative account of the full diagnostic progression — baseline to mid-point to final — with commentary on what drove each movement.',
          'The progression report is the engagement\'s evidence of impact — used for funder reporting, board presentations, and investor conversations.',
          'Produce a one-page progression report: the three readings displayed visually, a one-sentence explanation of the key movement at each stage, and the specific evidence behind each final-reading score.',
          'The progression report is produced and can be shared with the programme funder as a progress document.',
          'A programme funder reads the report and asks a follow-up question about the evidence behind a specific score. That question confirms the report is specific enough.'),
        comp('dp09_5','9.5','Investment Case Summary',
          'A concise, evidence-based summary of the commercial case for this organisation — written for an investor, a funder, or a strategic partner.',
          'An investment case built on the canvas evidence is qualitatively different from a business plan. It describes what was tested, what the evidence showed, and what is now known to be true.',
          'Produce a two-page Investment Case Summary: the commercial model in one paragraph, the pilot evidence (two payments, outcomes described), the scale pathway summary, and the 36-month revenue projection headline figures.',
          'The Investment Case Summary is produced and linked from this Decision Point.',
          'The CEO presents the Investment Case to a real potential investor or funder and receives a request for a follow-up meeting. That request is the standard.'),
        comp('dp09_6','9.6','Handover Standard Assessment',
          'Assesses whether the organisation meets all five elements of the handover standard before the engagement closes.',
          'A handover that occurs before the standard is met leaves the organisation with a commercial model it cannot operate independently.',
          'Assess all five elements: financial model independence, value proposition independence, outreach process independence, client management independence, commercial identity independence. Document gaps and close them before the formal handover.',
          'The team produces a handover standard assessment with each element scored and any gaps identified with a closure plan.',
          'Every element of the handover standard is met before the formal handover session is scheduled.'),
        comp('dp09_7','9.7','Formal Handover Presentation',
          'The organisation\'s Leadership Team presents the commercial model to the coach — as if the coach had never seen it before.',
          'The handover presentation is the proof of ownership. An organisation that cannot present its own commercial model without notes or prompting does not yet own it.',
          'The Leadership Team presents: the commercial model, the value proposition, the pricing structure, the scale pathway, and the 36-month projection — in a 30-minute presentation without notes or preparation support from the coach.',
          'The Formal Handover Presentation is delivered. The coach observes and challenges with questions that the Leadership Team answers from their own knowledge.',
          'The Leadership Team answers the coach\'s challenge questions without hesitation. That fluency is the completion signal.'),
        comp('dp09_8','9.8','Handover Record',
          'The formal record of what the organisation owns and can operate independently at the close of the engagement.',
          'The Handover Record is the organisation\'s reference for the twelve months following the engagement. It documents what was built, what remains, and who is responsible.',
          'Produce the Handover Record: what is owned and independently operable (five elements), remaining development priorities, responsible person for each priority, and the twelve-month review date.',
          'The Handover Record is produced, reviewed, and signed by both the CEO and the coach at the final session.',
          'The CEO can describe the contents of the Handover Record to a board member without referring to the document.'),
        comp('dp09_9','9.9','Twelve-Month Review Commitment',
          'A committed date for the twelve-month review of the commercial model — to assess whether it has held and what has changed.',
          'Without a committed review date, the twelve-month check never happens. The model atrophies without anyone noticing.',
          'Set a specific twelve-month review date. Agree the format: a two-hour session with the Leadership Team reviewing the five financial metrics, the pipeline health, and the grant dependency ratio against the targets set at DP08.',
          'The twelve-month review date is set and confirmed by the CEO in writing.',
          'The CEO adds the review date to their board calendar. That public commitment is the signal that it will happen.'),
      ]
    },
  ]
}

// ── DEFAULT COACH STATE ───────────────────────────────────────
export function defaultCoachState(): CoachState {
  return {
    programmes: [
      {
        id: 'csj', name: 'Palladium CSJ', type: 'donor_programme',
        funder: 'FCDO', country: 'Uganda', startDate: '2025-01-01',
        endDate: '2026-12-31', notes: 'CSJ/Wiigot Northern Uganda programme.',
        clientIds: ['conas','wonderland','kenali','viester','konya'],
        coImplementerIds: [], funderEmail: '', funderInvited: false,
      },
      {
        id: 'ignite', name: 'Ignite', type: 'donor_programme',
        funder: 'Ignite', country: 'Uganda', startDate: '2026-06-01',
        endDate: '2027-05-31', notes: 'GtCV canvas delivery for LSP clients.',
        clientIds: ['ikore'],
        coImplementerIds: [], funderEmail: '', funderInvited: false,
      },
    ],
    clients: [
      {
        id:'conas', name:'CONAS Agricultural Hub', slug:'conas',
        type:'crop_aggregator', engagementMode:'financial',
        programmeId:'csj', country:'Uganda', sector:'Agricultural Services',
        contactName:'', contactEmail:'', contactPhone:'',
        status:'dp04', clearviewActive:true, ceoInvited:false, ceoInvitedAt:'',
        startDate:'2025-06-01', expectedClose:'2026-06-30',
        notes:'Clearview live. Five input profit centres. 20 FGEs.',
        canvas:[],
      },
      {
        id:'wonderland', name:'Wonderland Farm Services', slug:'wonderland',
        type:'crop_aggregator', engagementMode:'financial',
        programmeId:'csj', country:'Uganda', sector:'Agricultural Services',
        contactName:'Bernard', contactEmail:'', contactPhone:'',
        status:'dp04', clearviewActive:true, ceoInvited:false, ceoInvitedAt:'',
        startDate:'2025-06-01', expectedClose:'2026-06-30',
        notes:'Bernard (CEO). Input business + FGE aggregation.',
        canvas:[],
      },
      {
        id:'kenali', name:'Kenali Group', slug:'kenali',
        type:'livestock_aggregator', engagementMode:'financial',
        programmeId:'csj', country:'Uganda', sector:'Livestock',
        contactName:'Kenneth Opio', contactEmail:'', contactPhone:'',
        status:'dp02', clearviewActive:false, ceoInvited:false, ceoInvitedAt:'',
        startDate:'2025-06-01', expectedClose:'2026-12-31',
        notes:'Kenneth Opio (MD). Goat aggregation.',
        canvas:[],
      },
      {
        id:'viester', name:'Viester Animal Breeding Farm', slug:'viester',
        type:'livestock_aggregator', engagementMode:'financial',
        programmeId:'csj', country:'Uganda', sector:'Livestock',
        contactName:'Ogenrwoth Victor', contactEmail:'', contactPhone:'',
        status:'dp02', clearviewActive:false, ceoInvited:false, ceoInvitedAt:'',
        startDate:'2025-06-01', expectedClose:'2026-12-31',
        notes:'Ogenrwoth Victor (Executive Director). Goat aggregation.',
        canvas:[],
      },
      {
        id:'konya', name:'Konya FGE', slug:'konya',
        type:'farmer_group_enterprise', engagementMode:'financial',
        programmeId:'csj', country:'Uganda', sector:'Agricultural Equipment',
        contactName:'', contactEmail:'', contactPhone:'',
        status:'dp01', clearviewActive:false, ceoInvited:false, ceoInvitedAt:'',
        startDate:'2025-06-01', expectedClose:'2026-12-31',
        notes:'Acholi region. Equipment-based FGE.',
        canvas:[],
      },
      {
        id:'ikore', name:'Ikore', slug:'ikore',
        type:'service_lsp', engagementMode:'canvas',
        programmeId:'ignite', country:'Uganda', sector:'Advisory Services',
        contactName:'', contactEmail:'', contactPhone:'',
        status:'setup', clearviewActive:false, ceoInvited:false, ceoInvitedAt:'',
        startDate:'2026-06-01', expectedClose:'2027-05-31',
        notes:'Ignite programme. Full GtCV canvas engagement.',
        canvas: buildEmptyCanvas(),
      },
    ],
    coImplementers: [],
    timesheets: [],
    invoices: [],
  }
}
