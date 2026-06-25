// @ts-nocheck
// ============================================================
// COACH TYPES — Clearview Platform
// Canvas Coach | habibonifade.com
// ============================================================

// ─── ROLES ───────────────────────────────────────────────────
export type CoachRole = 'super_coach' | 'co_implementer'
export type ClientRole = 'ceo' | 'finance_manager' | 'team_member'
export type FunderRole = 'ignite_funder'
export type AnyRole = CoachRole | ClientRole | FunderRole

// ─── PERMISSIONS ─────────────────────────────────────────────
export function canEdit(role: AnyRole): boolean {
  return role === 'super_coach' || role === 'co_implementer' || role === 'ceo'
}
export function canViewCoachGuidance(role: AnyRole): boolean {
  return role === 'super_coach' || role === 'co_implementer'
}
export function canSignOff(role: AnyRole): boolean {
  return role === 'ceo' || role === 'super_coach'
}
export function canManageTeam(role: AnyRole): boolean {
  return role === 'super_coach'
}
export function canApproveTimesheets(role: AnyRole): boolean {
  return role === 'super_coach'
}
export function canSubmitTimesheets(role: AnyRole): boolean {
  return role === 'co_implementer'
}

// ─── CLIENT TYPES ────────────────────────────────────────────
export type ClientType =
  | 'crop_aggregator'
  | 'livestock_aggregator'
  | 'farmer_group_enterprise'
  | 'service_lsp'

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  crop_aggregator: 'Crop Aggregator with Input',
  livestock_aggregator: 'Livestock Aggregator',
  farmer_group_enterprise: 'Farmer Group Enterprise',
  service_lsp: 'Service LSP',
}

export const CLIENT_TYPE_COLORS: Record<ClientType, string> = {
  crop_aggregator: '#1A9DAA',
  livestock_aggregator: '#1A7A4A',
  farmer_group_enterprise: '#B8860B',
  service_lsp: '#00B4D8',
}

// ─── ENGAGEMENT STATUS ───────────────────────────────────────
export type EngagementStatus =
  | 'setup' | 'phase_0'
  | 'dp01' | 'dp02' | 'dp03' | 'dp04' | 'dp05'
  | 'dp06' | 'dp07' | 'dp08' | 'dp09'
  | 'complete' | 'paused'

export type DPStatus = '○' | '◐' | '✓' | '⚠'

export function statusLabel(s: string): string {
  const m: Record<string, string> = {
    setup:'Setup', phase_0:'Phase 0',
    dp01:'DP01', dp02:'DP02', dp03:'DP03', dp04:'DP04', dp05:'DP05',
    dp06:'DP06', dp07:'DP07', dp08:'DP08', dp09:'DP09',
    complete:'Complete', paused:'Paused',
  }
  return m[s] || s
}

export function statusColor(s: string): string {
  const m: Record<string, string> = {
    setup:'#4A5A6A', phase_0:'#00B4D8',
    dp01:'#1A9DAA', dp02:'#1A9DAA', dp03:'#1A9DAA',
    dp04:'#1A9DAA', dp05:'#1A9DAA', dp06:'#1A9DAA',
    dp07:'#B8860B', dp08:'#B8860B', dp09:'#B8860B',
    complete:'#1A7A4A', paused:'#C0392B',
  }
  return m[s] || '#4A5A6A'
}

// ─── CANVAS COMPONENT ────────────────────────────────────────
export interface CanvasComponent {
  id: string
  client_id: string
  dp_id: string
  component_number: string
  title: string
  what_it_is: string
  why_it_matters: string
  coach_guidance: string
  action_trigger: string
  signal_to_look_for: string
  status: DPStatus
  evidence_recorded: string
  coach_notes: string
  evidence_url: string
  evidence_ref: string
  ceo_signed_off: boolean
  ceo_signed_off_at: string
  ceo_signed_off_by: string
  sort_order: number
}

// ─── CANVAS DECISION POINT ───────────────────────────────────
export interface CanvasDecisionPoint {
  id: string
  client_id: string
  dp_id: string
  label: string
  core_question: string
  commitment: string
  output_required: string
  session_time: string
  status: DPStatus
  ceo_signed_off: boolean
  ceo_signed_off_at: string
  completed_at: string
  sort_order: number
  components: CanvasComponent[]
}

// ─── EVIDENCE ────────────────────────────────────────────────
export interface EvidenceEntry {
  id: string
  client_id: string
  reference: string
  date: string
  dp_id: string
  type: 'document' | 'interview' | 'observation' | 'financial_data' | 'other'
  description: string
  url: string
  uploaded_by: string
  status: 'submitted' | 'accepted' | 'queried'
}

// ─── INTERVIEW ───────────────────────────────────────────────
export interface Interview {
  id: string
  client_id: string
  reference: string
  date: string
  dp_id: string
  respondent: string
  role: string
  organisation: string
  interviewer: string
  objective: string
  key_questions: string
  key_quotes: string
  observations: string
  follow_up: string
  evidence_ref: string
}

// ─── HYPOTHESIS ──────────────────────────────────────────────
export interface Hypothesis {
  id: string
  client_id: string
  reference: string
  dp_id: string
  date_formed: string
  hypothesis: string
  evidence_for: string
  evidence_against: string
  status: 'holding' | 'confirmed' | 'rejected'
  decision_made: string
}

// ─── CANVAS DECISION ─────────────────────────────────────────
export interface CanvasDecision {
  id: string
  client_id: string
  reference: string
  date: string
  dp_id: string
  decision: string
  made_by: string
  evidence_ref: string
  authorised_by: string
}

// ─── PILOT OBSERVATION ───────────────────────────────────────
export interface PilotObservation {
  id: string
  client_id: string
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

// ─── HANDOVER RECORD ─────────────────────────────────────────
export interface HandoverTest {
  id: string
  client_id: string
  test_number: number
  test_description: string
  status: 'yes' | 'no' | 'partial' | 'not_assessed'
  evidence: string
  ceo_confirmed: boolean
  ceo_confirmed_at: string
}

// ─── DIAGNOSTIC ──────────────────────────────────────────────
export interface EngagementDiagnostic {
  id: string
  client_id: string
  question_1: string
  question_2: string
  question_3: string
  ceo_signed: boolean
  ceo_signed_at: string
  ceo_signed_name: string
  coach_signed: boolean
  coach_signed_at: string
  readiness_answers: { id: string; question: string; answer: boolean | null }[]
  commitment_signed: boolean
  commitment_signed_at: string
  assumptions: { id: string; assumption: string; source: string; risk: 'high'|'medium'|'low'; how_to_test: string; outcome: string }[]
  stakeholders: { id: string; actor: string; role: string; influence: 'high'|'medium'|'low'; relationship: string; action_needed: string }[]
  data_gaps: { id: string; data_needed: string; why_it_matters: string; how_to_get: string; responsible: string; status: string }[]
}

// ─── ENGAGEMENT CLIENT (full) ─────────────────────────────────
export interface EngagementClient {
  id: string
  name: string
  slug: string
  type: ClientType
  engagement_mode: 'canvas' | 'financial'
  programme_id: string
  status: EngagementStatus
  country: string
  sector: string
  contact_name: string
  contact_email: string
  contact_phone: string
  clearview_active: boolean
  ceo_invited: boolean
  ceo_invited_at: string
  start_date: string
  expected_close: string
  notes: string
  // Loaded separately
  canvas?: CanvasDecisionPoint[]
  evidence?: EvidenceEntry[]
  interviews?: Interview[]
  hypotheses?: Hypothesis[]
  canvas_decisions?: CanvasDecision[]
  pilot_observations?: PilotObservation[]
  handover_tests?: HandoverTest[]
  diagnostic?: EngagementDiagnostic
  file_links?: { id: string; label: string; url: string; sort_order: number }[]
  notification_settings?: { enabled: boolean; recipients: any[] }
}

// ─── PROGRAMME ───────────────────────────────────────────────
export interface Programme {
  id: string
  name: string
  type: 'donor_programme' | 'direct_client' | 'blended'
  funder: string
  funder_email: string
  funder_invited: boolean
  country: string
  start_date: string
  end_date: string
  client_ids: string[]
  co_implementer_ids: string[]
  notes: string
}

// ─── CO-IMPLEMENTER ──────────────────────────────────────────
export interface CoImplementer {
  id: string
  name: string
  email: string
  phone: string
  country: string
  specialisation: string
  rate_per_day: number
  currency: string
  active: boolean
  programme_ids: string[]
  client_ids: string[]
  notes: string
}

// ─── TIMESHEET ───────────────────────────────────────────────
export interface Timesheet {
  id: string
  co_implementer_id: string
  client_id: string
  date: string
  hours: number
  description: string
  dp_id: string
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
  approved_by: string
  approved_at: string
  rejection_reason: string
}

// ─── NOTIFICATION RECIPIENT ──────────────────────────────────
export interface NotificationRecipient {
  name: string
  email: string
  role: string
  notify_gate_signed: boolean
  notify_gate_authorised: boolean
  notify_evidence_submitted: boolean
  notify_dp_complete: boolean
}

// ─── COACH STATE (in-memory, loaded from Supabase) ───────────
export interface CoachState {
  programmes: Programme[]
  clients: EngagementClient[]
  coImplementers: CoImplementer[]
  timesheets: Timesheet[]
  loading: boolean
  error: string | null
}

// ─── 25-TAB STRUCTURE ────────────────────────────────────────
export const CANVAS_TABS = [
  { id: 'cover',        label: 'Cover',                    number: 1,  phase: 'setup' },
  { id: 'how_to_start', label: 'How to Start',             number: 2,  phase: 'setup' },
  { id: 'coach_ref',    label: 'Coach Quick Reference',    number: 3,  phase: 'setup', coachOnly: true },
  { id: 'ip_framework', label: 'IP Framework Reference',   number: 4,  phase: 'setup' },
  { id: 'eng_setup',    label: 'Engagement Setup',         number: 5,  phase: 'setup' },
  { id: 'diagnostic',   label: 'Pre-Engagement Diagnostic',number: 6,  phase: 'setup' },
  { id: 'tracker',      label: 'Engagement Tracker',       number: 7,  phase: 'phase0' },
  { id: 'decisions',    label: 'Canvas Decision Record',   number: 8,  phase: 'phase0' },
  { id: 'evidence',     label: 'Evidence Library',         number: 9,  phase: 'phase0' },
  { id: 'handover',     label: 'Handover Record',          number: 10, phase: 'handover', lockedUntil: 'dp09' },
  { id: 'phase0',       label: 'Phase 0',                  number: 11, phase: 'phase0', dpId: 'phase_0' },
  { id: 'dp01',         label: 'DP01 — Service Reality',   number: 12, phase: 'dp01',   dpId: 'dp01' },
  { id: 'dp02',         label: 'DP02 — Customer Clarity',  number: 13, phase: 'dp02',   dpId: 'dp02' },
  { id: 'dp03',         label: 'DP03 — Value Proposition', number: 14, phase: 'dp03',   dpId: 'dp03' },
  { id: 'dp04',         label: 'DP04 — Viability Model',   number: 15, phase: 'dp04',   dpId: 'dp04' },
  { id: 'dp05',         label: 'DP05 — Market Entry',      number: 16, phase: 'dp05',   dpId: 'dp05' },
  { id: 'dp06',         label: 'DP06 — Identity & Partners',number: 17, phase: 'dp06',  dpId: 'dp06' },
  { id: 'dp07',         label: 'DP07 — Pilot Iteration 1', number: 18, phase: 'dp07',   dpId: 'dp07' },
  { id: 'dp08',         label: 'DP08 — Pilot Iteration 2', number: 19, phase: 'dp08',   dpId: 'dp08' },
  { id: 'dp09',         label: 'DP09 — Readiness Diagnostic',number: 20,phase: 'dp09',  dpId: 'dp09' },
  { id: 'int_brief',    label: 'Interview Briefing',       number: 21, phase: 'any' },
  { id: 'int_capture',  label: 'Interview Capture',        number: 22, phase: 'any' },
  { id: 'int_report',   label: 'Interview Reporting',      number: 23, phase: 'any' },
  { id: 'hypothesis',   label: 'Hypothesis Tracker',       number: 24, phase: 'any' },
  { id: 'pilot_obs',    label: 'Pilot Observation',        number: 25, phase: 'dp07' },
]

// ─── READINESS QUESTIONS ─────────────────────────────────────
export const READINESS_QUESTIONS = [
  { id: 'rq1',  question: 'We know who our paying customers are (not just beneficiaries)' },
  { id: 'rq2',  question: 'We have had direct conversations with at least 3 potential paying customers in the last 6 months' },
  { id: 'rq3',  question: 'We can describe what problem we solve for a paying customer in one sentence' },
  { id: 'rq4',  question: 'We have a price for at least one service' },
  { id: 'rq5',  question: 'We know what it costs us to deliver our main service' },
  { id: 'rq6',  question: 'We have at least one staff member who can lead business development' },
  { id: 'rq7',  question: 'Our leadership team supports moving towards commercial revenue' },
  { id: 'rq8',  question: 'We have time allocated for commercial viability work in the next 6 months' },
  { id: 'rq9',  question: 'We are willing to test our services with real paying clients during this engagement' },
  { id: 'rq10', question: 'We understand that the goal is financial independence, not more grant funding' },
]

// ─── COMPONENT TITLES PER DP ─────────────────────────────────
export const COMPONENT_TITLES: Record<string, string[]> = {
  phase_0: ['Assumption Log','Stakeholder Map','Data Gap Register','Readiness Self-Assessment','Engagement Commitment Form','','','',''],
  dp01: ['Service Inventory','Grant Logic vs Market Logic Sort','Service Delivery Evidence','Cost of Delivery','Service Readiness Assessment','Competitor and Substitute Map','Internal Capability Audit','Short-List of Commercial Services','DP01 Summary and Commitment'],
  dp02: ['Beneficiary vs Paying Customer Distinction','Customer Profile','Problem Statement','Budget Authority Confirmation','Customer Validation Plan','Customer Validation Results','Revised Customer Profile','Problem Prioritisation','DP02 Summary and Commitment'],
  dp03: ['Customer Gain and Pain Map','Value Proposition Statement','Evidence of Value','Differentiation from Alternatives','Service Bundle Design','Willingness to Pay Test','Service Tiers','Customer Outcome Statement','DP03 Summary and Commitment'],
  dp04: ['Full Cost of Delivery','Pricing Decision','Break-Even Volume','36-Month Revenue Projection','Funding Gap Analysis','Scenario Analysis','Capital Requirements','Financial Model Review','DP04 Summary and Commitment'],
  dp05: ['Customer Segmentation','Channel Map','Outreach Message','Sales Process Map','First 5 Customers Plan','Pricing and Proposal Template','A/B Test Design','Business Development Responsibility','DP05 Summary and Commitment'],
  dp06: ['Commercial Identity Statement','Service Profile Documents','Track Record Documentation','Partner Identification','Partnership Agreements','Digital and Offline Presence','Referral System','Commercial Readiness Baseline','DP06 Summary and Commitment'],
  dp07: ['Pilot Client Selection','Pilot Delivery Plan','Pilot Delivery','Client Feedback Collection','Iteration 1 Debrief','Revenue Confirmation','Service Adjustments','Mid-Point Commercial Readiness Diagnostic','DP07 Summary and Commitment'],
  dp08: ['Iteration 2 Client Selection','Client-Led Delivery','Client Feedback — Iteration 2','Renewal and Referral Evidence','Commercial Model Presentation','Scale Pathway Design','Financial Model Update','Handover Preparation','DP08 Summary and Commitment'],
  dp09: ['Final Commercial Readiness Diagnostic','Independence Tests Completion','Revenue Achieved vs Target','Customer Count vs Target','Post-Engagement Commercial Plan','Funder Reporting Package','Final Commercial Model Presentation','Engagement Learning Record','Formal Handover and Engagement Close'],
}

// ─── BUILD EMPTY CANVAS (for new canvas clients) ─────────────
export function buildEmptyCanvas(clientId: string): CanvasDecisionPoint[] {
  const dps = [
    { dp_id: 'phase_0', label: 'Phase 0 — Assumption Clearing', core_question: 'What assumptions must be cleared before canvas work begins?', commitment: 'Complete the five assumption-clearing tools before DP01 opens.', output_required: 'Completed assumption log, stakeholder map, data gap register, readiness self-assessment, and engagement commitment form.', session_time: '1 day on-site', sort_order: 0 },
    { dp_id: 'dp01', label: 'DP01 — Service Reality Audit', core_question: 'Which of our current services could a paying customer actually buy?', commitment: 'Produce a short-list of 2–3 market-logic services with evidence of delivery.', output_required: 'Service inventory, grant-logic vs market-logic sort, short-list of commercial services.', session_time: '3–4 hours', sort_order: 1 },
    { dp_id: 'dp02', label: 'DP02 — Customer and Problem Clarity', core_question: 'Who will pay for our services, and what problem are we solving for them?', commitment: 'Conduct direct conversations with at least 3 potential paying customers.', output_required: 'Validated customer profile, problem statement with direct customer quotes, budget authority confirmation.', session_time: '4–5 hours', sort_order: 2 },
    { dp_id: 'dp03', label: 'DP03 — Value Proposition Architecture', core_question: 'Why would this specific customer choose our service over any alternative?', commitment: 'Develop and test a value proposition statement with at least one real customer.', output_required: 'Value proposition statement, service bundle, willingness-to-pay evidence, service tiers.', session_time: '3–4 hours', sort_order: 3 },
    { dp_id: 'dp04', label: 'DP04 — Commercial Viability Model', core_question: 'Can we deliver this service at a price the customer will pay and a volume that sustains the organisation?', commitment: 'Build a full financial model with CEO and Finance Manager present.', output_required: 'Cost of delivery, pricing decision, break-even volume, 36-month projection, scenario analysis.', session_time: '5–6 hours', sort_order: 4 },
    { dp_id: 'dp05', label: 'DP05 — Market Entry Design', core_question: 'How will we reach and convert our first paying customers?', commitment: 'Name and assign responsibility for the first 5 paying customer targets.', output_required: 'Customer segmentation, channel map, first 5 customers plan, sales process map, business development responsibility.', session_time: '3–4 hours', sort_order: 5 },
    { dp_id: 'dp06', label: 'DP06 — Organisational Identity and Partner Architecture', core_question: 'How does the client present itself commercially, and who are the partners that strengthen their market position?', commitment: 'Produce a commercial identity statement and at least one partnership agreement.', output_required: 'Commercial identity statement, service profiles, track record, partner agreements, commercial readiness baseline.', session_time: '3–4 hours', sort_order: 6 },
    { dp_id: 'dp07', label: 'DP07 — Pilot: Iteration 1', core_question: 'Did our service work with real clients, and what did we learn?', commitment: 'Deliver the service to at least 2 paying or near-paying clients with structured feedback.', output_required: 'Pilot delivery records, client feedback verbatim, revenue confirmation, service adjustments, mid-point diagnostic.', session_time: '3 days on-site', sort_order: 7 },
    { dp_id: 'dp08', label: 'DP08 — Pilot: Iteration 2 and Commercial Handover', core_question: 'Can the client lead the service independently, and is the commercial model ready to scale?', commitment: 'Client leads Iteration 2 deliveries with consultant observing only.', output_required: 'Client-led delivery evidence, feedback, renewal or referral evidence, commercial model presentation, handover materials.', session_time: '3 days on-site', sort_order: 8 },
    { dp_id: 'dp09', label: 'DP09 — Commercial Readiness Diagnostic', core_question: 'Is the client ready to operate commercially without programme support?', commitment: 'Complete all five independence tests and the final commercial readiness diagnostic.', output_required: 'Final diagnostic scores, independence tests, revenue vs target, post-engagement plan, funder reporting package.', session_time: '4–5 hours', sort_order: 9 },
  ]

  return dps.map(dp => ({
    ...dp,
    id: `${clientId}_${dp.dp_id}`,
    client_id: clientId,
    status: '○' as DPStatus,
    ceo_signed_off: false,
    ceo_signed_off_at: '',
    completed_at: '',
    components: (COMPONENT_TITLES[dp.dp_id] || []).map((title, i) => ({
      id: `${clientId}_${dp.dp_id}_c${i + 1}`,
      client_id: clientId,
      dp_id: dp.dp_id,
      component_number: String(i + 1),
      title,
      what_it_is: '',
      why_it_matters: '',
      coach_guidance: '',
      action_trigger: '',
      signal_to_look_for: '',
      status: '○' as DPStatus,
      evidence_recorded: '',
      coach_notes: '',
      evidence_url: '',
      evidence_ref: '',
      ceo_signed_off: false,
      ceo_signed_off_at: '',
      ceo_signed_off_by: '',
      sort_order: i,
    })).filter(c => c.title),
  }))
}
