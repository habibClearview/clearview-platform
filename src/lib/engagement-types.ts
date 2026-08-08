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
export type DeliverableStatus =
  | 'pending' | 'in_progress' | 'accepted' | 'invoiced' | 'paid'

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

export type SignatureMethod = 'click' | 'typed'

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
