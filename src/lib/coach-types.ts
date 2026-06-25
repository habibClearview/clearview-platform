// @ts-nocheck
// ============================================================
// COACH TYPES — Clearview Platform
// Canvas Coach | habibonifade.com
// ============================================================

export type ClientType =
  | 'crop_aggregator'
  | 'livestock_aggregator'
  | 'farmer_group_enterprise'
  | 'service_lsp'

export type EngagementStatus =
  | 'setup'
  | 'phase_0'
  | 'dp01' | 'dp02' | 'dp03' | 'dp04' | 'dp05'
  | 'dp06' | 'dp07' | 'dp08' | 'dp09'
  | 'complete'
  | 'paused'

export type DPStatus = '○' | '◐' | '✓' | '⚠'

export interface DecisionComponent {
  id: string
  number: string
  title: string
  whatItIs: string
  whyItMatters: string
  coachGuidance: string
  actionTrigger: string
  signalToLookFor: string
  status: DPStatus
  evidenceRecorded: string
  coachNotes: string
  ceoSignedOff: boolean
  ceoSignedOffAt: string
  ceoSignedOffBy: string
}

export interface DecisionPoint {
  id: string
  label: string
  coreQuestion: string
  commitment: string
  outputRequired: string
  sessionTime: string
  status: DPStatus
  ceoSignedOff: boolean
  ceoSignedOffAt: string
  completedAt: string
  components: DecisionComponent[]
}

export interface FinancialHeadline {
  currency: string
  revenue: number
  ebitda: number
  cash: number
  lastUpdated: string
}

export interface EngagementClient {
  id: string
  name: string
  slug: string
  type: ClientType
  engagementMode: 'canvas' | 'financial'
  programmeId: string
  status: EngagementStatus
  country: string
  sector: string
  contactName: string
  contactEmail: string
  contactPhone: string
  clearviewActive: boolean
  ceoInvited: boolean
  ceoInvitedAt: string
  startDate: string
  expectedClose: string
  notes: string
  canvas: DecisionPoint[]
  financialHeadline?: FinancialHeadline
}

export interface Programme {
  id: string
  name: string
  type: 'donor_programme' | 'direct_client' | 'blended'
  funder: string
  funderEmail: string
  funderInvited: boolean
  country: string
  startDate: string
  endDate: string
  clientIds: string[]
  coImplementerIds: string[]
  notes: string
}

export interface CoImplementer {
  id: string
  name: string
  email: string
  phone: string
  country: string
  specialisation: string
  ratePerDay: number
  currency: string
  active: boolean
  programmeIds: string[]
  clientIds: string[]
  notes: string
}

export interface TimesheetEntry {
  id: string
  coImplementerId: string
  clientId: string
  date: string
  hours: number
  description: string
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
  approvedAt: string
}

export interface CoachState {
  clients: EngagementClient[]
  programmes: Programme[]
  coImplementers: CoImplementer[]
  timesheets: TimesheetEntry[]
}

// ── CONSTANTS ────────────────────────────────────────────────
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

// ── HELPERS ──────────────────────────────────────────────────
export function statusLabel(status: EngagementStatus | string): string {
  const map: Record<string, string> = {
    setup: 'Setup',
    phase_0: 'Phase 0',
    dp01: 'DP01', dp02: 'DP02', dp03: 'DP03',
    dp04: 'DP04', dp05: 'DP05', dp06: 'DP06',
    dp07: 'DP07', dp08: 'DP08', dp09: 'DP09',
    complete: 'Complete',
    paused: 'Paused',
  }
  return map[status] || status
}

export function statusColor(status: EngagementStatus | string): string {
  const map: Record<string, string> = {
    setup: '#4A5A6A',
    phase_0: '#00B4D8',
    dp01: '#1A9DAA', dp02: '#1A9DAA', dp03: '#1A9DAA',
    dp04: '#1A9DAA', dp05: '#1A9DAA', dp06: '#1A9DAA',
    dp07: '#B8860B', dp08: '#B8860B', dp09: '#B8860B',
    complete: '#1A7A4A',
    paused: '#C0392B',
  }
  return map[status] || '#4A5A6A'
}

// ── BUILD EMPTY CANVAS ───────────────────────────────────────
export function buildEmptyCanvas(): DecisionPoint[] {
  const dps = [
    { id: 'phase_0', label: 'Phase 0 — Assumption Clearing', coreQuestion: 'What assumptions must be cleared before canvas work begins?', commitment: 'Complete the five assumption-clearing tools before DP01 opens.', outputRequired: 'Completed assumption log, stakeholder map, data gap register, readiness self-assessment, and engagement commitment form.', sessionTime: '1 day on-site' },
    { id: 'dp01', label: 'DP01 — Service Reality Audit', coreQuestion: 'Which of our current services could a paying customer actually buy?', commitment: 'Produce a short-list of 2–3 market-logic services with evidence of delivery.', outputRequired: 'Service inventory, grant-logic vs market-logic sort, short-list of commercial services.', sessionTime: '3–4 hours across two sessions' },
    { id: 'dp02', label: 'DP02 — Customer and Problem Clarity', coreQuestion: 'Who will pay for our services, and what problem are we solving for them?', commitment: 'Conduct direct conversations with at least 3 potential paying customers.', outputRequired: 'Validated customer profile, problem statement with direct customer quotes, budget authority confirmation.', sessionTime: '4–5 hours including customer visits' },
    { id: 'dp03', label: 'DP03 — Value Proposition Architecture', coreQuestion: 'Why would this specific customer choose our service over any alternative?', commitment: 'Develop and test a value proposition statement with at least one real customer.', outputRequired: 'Value proposition statement, service bundle description, willingness-to-pay evidence, service tiers.', sessionTime: '3–4 hours' },
    { id: 'dp04', label: 'DP04 — Commercial Viability Model', coreQuestion: 'Can we deliver this service at a price the customer will pay and a volume that sustains the organisation?', commitment: 'Build a full financial model with CEO and Finance Manager present.', outputRequired: 'Cost of delivery, pricing decision, break-even volume, 36-month projection, scenario analysis.', sessionTime: '5–6 hours including model build' },
    { id: 'dp05', label: 'DP05 — Market Entry Design', coreQuestion: 'How will we reach and convert our first paying customers?', commitment: 'Name and assign responsibility for the first 5 paying customer targets.', outputRequired: 'Customer segmentation, channel map, first 5 customers plan, sales process map, business development responsibility.', sessionTime: '3–4 hours' },
    { id: 'dp06', label: 'DP06 — Organisational Identity and Partner Architecture', coreQuestion: 'How does the client present itself commercially, and who are the partners that strengthen their market position?', commitment: 'Produce a commercial identity statement and at least one partnership agreement.', outputRequired: 'Commercial identity statement, service profiles, track record documentation, partner agreements, commercial readiness baseline.', sessionTime: '3–4 hours' },
    { id: 'dp07', label: 'DP07 — Pilot: Iteration 1', coreQuestion: 'Did our service work with real clients, and what did we learn?', commitment: 'Deliver the service to at least 2 paying or near-paying clients with structured feedback collection.', outputRequired: 'Pilot delivery records, client feedback verbatim, revenue confirmation, service adjustments, mid-point commercial readiness diagnostic.', sessionTime: '3 days on-site with lead consultant' },
    { id: 'dp08', label: 'DP08 — Pilot: Iteration 2 and Commercial Handover', coreQuestion: 'Can the client lead the service independently, and is the commercial model ready to scale?', commitment: 'Client leads Iteration 2 deliveries with consultant observing only.', outputRequired: 'Ikore-led delivery evidence, client feedback collected by Ikore, renewal or referral evidence, commercial model presentation by Ikore, handover materials.', sessionTime: '3 days on-site with lead consultant' },
    { id: 'dp09', label: 'DP09 — Commercial Readiness Diagnostic', coreQuestion: 'Is the client ready to operate commercially without programme support?', commitment: 'Complete all five independence tests and the final commercial readiness diagnostic.', outputRequired: 'Final diagnostic scores, independence tests completed, revenue vs target, post-engagement commercial plan, funder reporting package.', sessionTime: '4–5 hours including final presentation' },
  ]

  const componentTitles = [
    'Service Inventory / Baseline Assessment',
    'Customer Profile and Problem Statement',
    'Value Proposition and Differentiation',
    'Cost and Pricing',
    'Market Entry and Sales',
    'Commercial Identity and Partners',
    'Pilot Planning and Delivery',
    'Evidence and Feedback',
    'Sign-Off and Commitment',
  ]

  return dps.map(dp => ({
    ...dp,
    status: '○' as DPStatus,
    ceoSignedOff: false,
    ceoSignedOffAt: '',
    completedAt: '',
    components: componentTitles.map((title, i) => ({
      id: `${dp.id}_c${i + 1}`,
      number: `${i + 1}`,
      title,
      whatItIs: '',
      whyItMatters: '',
      coachGuidance: '',
      actionTrigger: '',
      signalToLookFor: '',
      status: '○' as DPStatus,
      evidenceRecorded: '',
      coachNotes: '',
      ceoSignedOff: false,
      ceoSignedOffAt: '',
      ceoSignedOffBy: '',
    })),
  }))
}

// ── DEFAULT STATE ────────────────────────────────────────────
export function defaultCoachState(): CoachState {
  return {
    clients: [],
    programmes: [],
    coImplementers: [],
    timesheets: [],
  }
}
