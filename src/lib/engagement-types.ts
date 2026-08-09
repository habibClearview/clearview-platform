// ============================================================
// GtCV engagement commercial layer -- shared types & constants.
//
// These mirror the tables in
// supabase/migrations/2026_08_08_gtcv_engagement_commercial_layer.sql
// (snake_case fields, to match the rows Supabase returns -- same
// convention as EngagementClient in coach-types.ts).
//
// This is the COMMERCIAL wrapper around a canvas engagement. The canvas
// itself (nine gates, evidence, diagnostic, handover) already lives in the
// existing canvas tables -- see docs/gtcv/gtcv-method-reference.md. Nothing
// here is client-specific: Tanager/Ikore is the first record, not the
// schema. See docs/gtcv/engagement-charter-and-online-gtcv-spec.md.
// ============================================================

// Decision-point / gate identifiers, using the app's RUNTIME values (note
// 'phase_0' with an underscore, as used in CoachDashboard.tsx -- the
// PhaseId type in canvas-types.ts writes 'phase0', a known discrepancy).
export type DpId =
  | 'setup' | 'phase_0'
  | 'dp01' | 'dp02' | 'dp03' | 'dp04' | 'dp05' | 'dp06' | 'dp07' | 'dp08' | 'dp09'
  | 'handover'

export const CANVAS_DP_IDS: DpId[] = [
  'setup', 'phase_0',
  'dp01', 'dp02', 'dp03', 'dp04', 'dp05', 'dp06', 'dp07', 'dp08', 'dp09',
  'handover',
]

// ─── engagement_config (1:1 per engagement_clients row) ──────
export type Terminology = 'zone' | 'dp'
export type MomentumStatus = 'green' | 'amber' | 'red'
export type IndependenceTestSet = 'engagement' | 'tools'

// Default DP02 validation-conversation minimum when engagement_config
// leaves it NULL. Handbook-canonical (>=3 of these must converge).
export const DEFAULT_VALIDATION_MIN_PER_SEGMENT = 5

export interface EngagementConfig {
  client_id: string
  tor_reference: string | null
  tor_uploaded: boolean
  terminology: Terminology
  momentum_status: MomentumStatus
  validation_min_per_segment: number | null
  independence_test_set: IndependenceTestSet
  brand_overrides: Record<string, unknown> | null
  showcase_enabled: boolean
  created_at: string
  updated_at: string
}

// ─── engagement_parties ──────────────────────────────────────
export type PartyRole =
  | 'client_funder' | 'funder_rep'
  | 'lsp_ed' | 'lsp_leadership' | 'lsp_finance' | 'lsp_field' | 'lsp_board'
  | 'lead_consultant' | 'co_implementer' | 'licensed_advisor' | 'other'

export const PARTY_ROLE_LABELS: Record<PartyRole, string> = {
  client_funder: 'Client / Funder',
  funder_rep: 'Funder representative',
  lsp_ed: 'Executive Director',
  lsp_leadership: 'Leadership Team',
  lsp_finance: 'Finance Lead',
  lsp_field: 'Field Team',
  lsp_board: 'Board',
  lead_consultant: 'Lead Consultant / Coach',
  co_implementer: 'Co-implementer',
  licensed_advisor: 'Licensed Advisor',
  other: 'Other',
}

export interface EngagementParty {
  id: string
  client_id: string
  party_role: PartyRole
  name: string
  email: string | null
  organisation: string | null
  title: string | null
  is_signatory: boolean
  user_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

// ─── engagement_deliverables ─────────────────────────────────
// The five statuses a deliverable moves through, on the way to being paid for.
// Written as a runtime list rather than only a type, because a type disappears
// at build time and the place this actually went wrong was a route writing a
// sixth value the database refused. A type could not have caught that; a list
// the route validates against can.
//
// This has to stay in step with the check constraint on
// engagement_deliverables.status. If a status is added here it needs adding
// there in a migration, and the other way round.
export const DELIVERABLE_STATUSES = [
  'pending', 'in_progress', 'accepted', 'invoiced', 'paid',
] as const

export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number]

export function isDeliverableStatus(value: unknown): value is DeliverableStatus {
  return typeof value === 'string' && (DELIVERABLE_STATUSES as readonly string[]).includes(value)
}

export interface EngagementDeliverable {
  id: string
  client_id: string
  code: string | null
  title: string
  description: string | null
  milestone_no: number | null
  milestone_label: string | null
  payment_amount: number | null
  payment_currency: string
  due_window: string | null
  sort_order: number
  status: DeliverableStatus
  accepted_at: string | null
  invoiced_at: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

// ─── deliverable_gate_map ────────────────────────────────────
export type GateMapSource = 'manual' | 'ai_proposed'

export interface DeliverableGateMap {
  id: string
  client_id: string
  deliverable_id: string
  dp_id: DpId
  required_evidence: string | null
  approved: boolean
  approved_by: string | null
  approved_at: string | null
  source: GateMapSource
  created_at: string
  updated_at: string
}

// ─── engagement_charters + charter_signatures ────────────────
export type CharterStatus = 'draft' | 'issued' | 'signed' | 'superseded'

export interface EngagementCharter {
  id: string
  client_id: string
  version: number
  title: string | null
  content: CharterContent | null
  status: CharterStatus
  issued_at: string | null
  created_at: string
  updated_at: string
}

// The structured Charter snapshot stored in engagement_charters.content.
// Three layers: commercial terms, responsibilities, governance.
export interface CharterContent {
  commercial_terms?: Record<string, unknown>
  responsibilities?: { party_role: PartyRole; responsibilities: string[] }[]
  governance?: Record<string, unknown>
  [key: string]: unknown
}

// How the signature reached the record. 'click' and 'typed' are the signer
// doing it themselves. 'in_room' is a signature given on paper in a session
// and entered afterwards by the lead consultant, which is the only way a
// signatory without a login is ever recorded. It is kept distinct so the
// Charter can say which one it was rather than implying everyone signed in.
export type SignatureMethod = 'click' | 'typed' | 'in_room'

export interface CharterSignature {
  id: string
  charter_id: string
  client_id: string
  party_id: string | null
  signer_role: string
  signer_name: string
  signer_email: string | null
  signer_user_id: string | null
  signature_method: SignatureMethod
  typed_name: string | null
  /** The account that entered the signature, which is the signer themselves
   *  unless it was given on paper and recorded by the lead consultant. */
  recorded_by_user_id: string | null
  signed_at: string
  created_at: string
}

// ─── charter_comments (review-before-signature) ──────────────
// Mirrors supabase/migrations/2026_08_08_charter_comments.sql. Comments and
// suggestions parties leave on a charter section before signing, each moving
// through a resolution status a manager sets.
export type CharterCommentKind = 'comment' | 'suggestion'
export type CharterCommentStatus = 'open' | 'accepted' | 'declined' | 'noted'

export interface CharterComment {
  id: string
  client_id: string
  charter_id: string
  section_key: string | null
  author_party_id: string | null
  author_name: string | null
  author_role: string | null
  kind: CharterCommentKind
  body: string
  status: CharterCommentStatus
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

// ─── engagement_meetings (scheduling) ────────────────────────
// Mirrors supabase/migrations/2026_08_08_engagement_meetings.sql. The
// proposed and confirmed meetings that run an engagement, optionally tied to
// the decision point they serve.
export type MeetingStatus = 'proposed' | 'confirmed' | 'done' | 'cancelled'

export interface EngagementMeeting {
  id: string
  client_id: string
  title: string | null
  purpose: string | null
  dp_id: string | null
  starts_at: string | null
  ends_at: string | null
  location: string | null
  meeting_url: string | null
  status: MeetingStatus
  created_by: string | null
  created_at: string
}

// ─── Handover independence tests (reconciled with Habib) ─────
// The two source workbooks describe the same five at two altitudes; see
// docs/gtcv/gtcv-method-reference.md §F. 'tools' is the default set. The
// per-engagement choice lives in engagement_config.independence_test_set.
export interface IndependenceTest {
  key: string
  label: string          // plain-language: "the org can do this without the coach"
  description: string
  category: string       // Engagement Workbook category
  step: string           // Handbook / Tools costable-operable step
}

// ─── EngagementView (assembled read model) ───────────────────
// The single typed object src/lib/engagement-loader.ts returns: the
// engagement_clients row plus every commercial-layer table and the per-DP
// gate status read from the existing canvas tables. Nothing here is
// client-specific; the names and content are all configuration.

// Plain-language gate status, derived from the canvas_decision_points
// DPStatus symbols (see coach-types.ts): '✓' complete, '◐' in
// progress, '⚠' blocked, '○' or missing not started.
export type GateStatusValue = 'not_started' | 'in_progress' | 'complete' | 'blocked'

export interface DpGateStatus {
  dp_id: DpId
  status: GateStatusValue
  // The raw canvas_decision_points row values, when a row exists.
  raw_symbol: string | null
  label: string | null
  ceo_signed_off: boolean
}

// The subset of engagement_clients the journey and Charter pages read. Fees
// and payment fields are deliberately NOT surfaced here (they live in a
// separate, private view).
export interface EngagementClientSummary {
  id: string
  slug: string | null
  name: string
  status: string | null
  programme_id: string | null
}

export interface EngagementView {
  client: EngagementClientSummary
  programme_name: string | null
  config: EngagementConfig | null
  parties: EngagementParty[]
  deliverables: EngagementDeliverable[]
  gate_map: DeliverableGateMap[]
  charter: EngagementCharter | null
  charter_comments: CharterComment[]
  signatures: CharterSignature[]
  meetings: EngagementMeeting[]
  // Per-DP gate status for every Dp in CANVAS_DP_IDS, defaulted to
  // 'not_started' when the client has no canvas_decision_points row for it.
  gate_status: Record<DpId, GateStatusValue>
  gate_detail: DpGateStatus[]
  // The DP the engagement is working now: the first in-progress gate, else the
  // first not-started gate that follows a completed one. null when nothing has
  // started or everything is complete.
  current_dp_id: DpId | null
  // Plain names of anything that failed to load, so a page can say the view is
  // incomplete rather than presenting a missing read as an empty engagement.
  // Empty when everything loaded.
  load_errors: string[]
}

export const INDEPENDENCE_TESTS: IndependenceTest[] = [
  {
    key: 'numbers',
    label: 'The numbers',
    description: 'Update a cost and recalculate the price / break-even, unaided.',
    category: 'Financial Model',
    step: 'Financial Model',
  },
  {
    key: 'pitch',
    label: 'The pitch',
    description: 'Present the value proposition and handle pushback, without notes.',
    category: 'Value Proposition',
    step: 'Value Proposition',
  },
  {
    key: 'pipeline',
    label: 'The pipeline',
    description: 'Run outreach and work the funnel to win clients, knowing the cost.',
    category: 'Commercial Model',
    step: 'Outreach Process (incl. cost of outreach)',
  },
  {
    key: 'delivery',
    label: 'The delivery',
    description: 'Plan, run, debrief and document a real client engagement.',
    category: 'Pipeline',
    step: 'Client Management Process',
  },
  {
    key: 'positioning_scale',
    label: 'Positioning & scale',
    description: 'State the commercial identity and use it to set the scale pathway.',
    category: 'Scale Pathway',
    step: 'Commercial Identity → Scale',
  },
]
