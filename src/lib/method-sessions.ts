// @ts-nocheck
// ============================================================
// THE METHOD, AS ONE SOURCE BOTH SCREENS READ
//
// Habib, 16 September 2026: "the decision points are listed and sessions for
// each are planned in this tab. I am suggesting that all the planning and
// everything associated with each decision point is moved to that decision
// tab. The session and room should then draw the details of the sessions,
// planned or otherwise, into it so it works almost like a summary of the
// sessions for all decision points and looks like a workplan that can be
// shared or downloaded."
//
// So there are now two screens over one set of facts. The decision point is
// where sessions are planned, run and recorded. Sessions and rooms reads what
// every decision point holds and lays it out in order, and edits nothing.
//
// Both need the same things: which sessions the Delivery Guide prescribes at
// each decision point, which room each one is held in, and who the method
// requires in that room. Those facts were inside the planner component, which
// meant the decision point could not see them without importing a screen, and
// nothing about them could be tested without a browser. They are here instead.
//
// Nothing in this file touches the database or the browser. It is the method
// written down, plus the small amount of arithmetic that reads it.
//
// CLIENT AGNOSTIC: no organisation, funder or person is named here. The
// catalogue is the method; the people come from the engagement.
// ============================================================

// The room colours, as CSS variables rather than as one screen's palette, so
// both screens draw the same room the same way.
const TEAL = 'var(--cv-teal)'
const PURPLE = 'var(--cv-purple)'
const NAVY = 'var(--cv-navy)'
const RED = 'var(--cv-red)'
const AMBER = 'var(--cv-amber)'
const SLATE = 'var(--cv-slate)'
const GREEN = 'var(--cv-green)'

// ─── Party roles, as engagement_parties stores them ──────────
export const ROLE_LABEL = {
  client_funder: 'Programme funder',
  funder_rep: 'Funder representative',
  lsp_ed: 'Executive Director',
  lsp_leadership: 'Leadership team',
  lsp_finance: 'Finance lead',
  lsp_field: 'Field team',
  lsp_board: 'Board chair',
  lead_consultant: 'Lead consultant',
  co_implementer: 'Co-implementer',
  licensed_advisor: 'Licensed advisor',
  other: 'Other',
}
export function roleLabel(role) { return ROLE_LABEL[role] || role || 'Unassigned role' }

// ─── The rooms, and who the method puts in each one ──────────
// required: the method expects these roles present.
// excluded: the method deliberately keeps these roles out.
export const KINDS = [
  {
    v: 'plenary', l: 'Plenary',
    blurb: 'The whole client team in the room.',
    required: ['lead_consultant', 'lsp_ed', 'lsp_leadership', 'lsp_field'],
    excluded: [],
    color: TEAL,
  },
  {
    v: 'joint_with_funder', l: 'Joint with funder',
    blurb: 'The funder in the room with the client team. The evidence is reviewed together and the record is signed by all parties.',
    required: ['lead_consultant', 'funder_rep', 'lsp_ed', 'co_implementer'],
    excluded: [],
    color: PURPLE,
  },
  {
    v: 'client_team_only', l: 'Client team only',
    blurb: 'Worked with the leadership team. The funder is not in this room.',
    required: ['lsp_leadership'],
    excluded: ['funder_rep'],
    color: NAVY,
  },
  {
    v: 'finance_restricted', l: 'Finance restricted',
    blurb: 'Finance and leadership only. The field team does not attend, and cost totals are not shared with them.',
    required: ['lead_consultant', 'lsp_finance', 'lsp_leadership'],
    excluded: ['lsp_field', 'funder_rep'],
    color: RED,
  },
  {
    v: 'field_team', l: 'Field team',
    blurb: 'The delivery staff. Training, fieldwork, delivery time validation and pilot sessions.',
    required: ['co_implementer', 'lsp_field'],
    excluded: [],
    color: AMBER,
  },
  {
    v: 'one_to_one', l: 'One to one',
    blurb: 'A drafting or review pair, or a gate review between the lead consultant and the Executive Director.',
    required: ['lead_consultant'],
    excluded: [],
    color: SLATE,
  },
]
export function kindDef(v) { return KINDS.find((k) => k.v === v) || null }

// ─── The decision points, in delivery order ──────────────────
export const DPS = [
  { id: 'setup', label: 'Before Decision Point 1' },
  { id: 'phase_0', label: 'Phase 0, Assumption Clearing' },
  { id: 'dp01', label: 'Decision Point 1, Service Reality Audit' },
  { id: 'dp02', label: 'Decision Point 2, Customer and Problem Clarity' },
  { id: 'dp03', label: 'Decision Point 3, Value Proposition Architecture' },
  { id: 'dp04', label: 'Decision Point 4, Commercial Viability Model' },
  { id: 'dp05', label: 'Decision Point 5, Market Entry Design' },
  { id: 'dp06', label: 'Decision Point 6, Identity and Partner Architecture' },
  { id: 'dp07', label: 'Decision Point 7, Pilot and Learn Architecture' },
  { id: 'dp08', label: 'Decision Point 8, Scale and Expansion Pathway' },
  { id: 'dp09', label: 'Decision Point 9, Commercial Readiness Diagnostic' },
  { id: 'handover', label: 'Handover' },
]

// ─── The session catalogue, taken from the Delivery Guide ────
// One entry per session the guide names, with the owner line, the room and
// the duration as written. extra lists roles the method makes mandatory for
// that specific session on top of the roles its room already requires.
// Sessions that run over days rather than hours carry a null duration and
// state the span in the purpose.
export const METHOD_SESSIONS = {
  setup: [
    { title: 'Pre-engagement diagnostic', kind: 'joint_with_funder', mins: 120, extra: ['lsp_board'],
      purpose: 'The three questions asked of the Executive Director out loud with all parties present. The co-implementer records verbatim. All parties sign before leaving, and the signed record is filed with the funder. Weak answers mean no Decision Point 1 without a follow-up conversation with the funder present.' },
  ],
  phase_0: [
    { title: 'Assumption clearing, session 1', kind: 'plenary', mins: 180, extra: [],
      purpose: 'Assumption Dump Canvas, Problem Owner Budget Matrix, Hypothesis Shortlist Board. Run with leadership and the staff who deliver the programmes.' },
    { title: 'Assumption clearing, session 2', kind: 'plenary', mins: 180, extra: [],
      purpose: 'Signal vs Story Board and the Continue, Pause, Kill Table. Every activity must land somewhere.' },
  ],
  dp01: [
    { title: 'Service listing plenary', kind: 'plenary', mins: 180, extra: [],
      purpose: 'Lead consultant leads, all present. The full team lists every service the organisation delivers. Services first, no activity mapping yet.' },
    { title: 'Activity level analysis', kind: 'plenary', mins: 180, extra: [],
      purpose: 'Lead consultant facilitates, leadership team and field team. Expand each service into its activities and work through every column. One service at a time.' },
    { title: 'Activity survival decision', kind: 'field_team', mins: 120, extra: [],
      purpose: 'Co-implementer leads, field team present. One of nine decisions per activity: stay, transfer, kill, bundle, sweetener, spin off, redesign, defer, subsidise consciously.' },
    { title: 'Service synthesis rows', kind: 'client_team_only', mins: 120, extra: ['lsp_finance'],
      purpose: 'Finance lead leads, co-implementer supports. The eight synthesis rows per service, including the revised delivery cost that enters Decision Point 4.' },
    { title: 'Recalibrated commercial hypothesis', kind: 'one_to_one', mins: 120, extra: ['co_implementer'],
      purpose: 'Co-implementer drafts, lead consultant reviews. One testable hypothesis per surviving service, which is what enters Decision Point 2.' },
    { title: 'Gate review', kind: 'one_to_one', mins: 60, extra: ['lsp_ed'],
      purpose: 'Lead consultant leads, Executive Director present. The ED confirms the service survival decisions, the lead consultant approves every hypothesis. Nothing enters Decision Point 2 without that approval.' },
  ],
  dp02: [
    { title: 'Opening plenary, customer segments', kind: 'plenary', mins: 180, extra: [],
      purpose: 'Lead consultant leads, all present. Map segments from the revenue ready inventory. Separate paying clients from clients and programme officers. Name the budget holder for each segment.' },
    { title: 'Segment prioritisation', kind: 'client_team_only', mins: 120, extra: [],
      purpose: 'Lead consultant leads, leadership team present. Maximum three segments for validation. These are hypotheses, not conclusions.' },
    { title: 'Customer conversation training', kind: 'field_team', mins: 960, extra: ['lead_consultant'],
      purpose: 'Two full days, lead consultant present, field team mandatory. Day one is technique and scoring, day two is role play on real client scenarios.' },
    { title: 'Fieldwork', kind: 'field_team', mins: null, extra: [],
      purpose: 'Two weeks. Field team conducts, co-implementer supervises daily. Maximum two conversations per segment per interviewer per day, capture form completed within 30 minutes.' },
    { title: 'Validation synthesis', kind: 'one_to_one', mins: 480, extra: ['co_implementer'],
      purpose: 'One day. Co-implementer leads, lead consultant reviews. Compile the capture data, score believability and pain urgency, flag ambiguous responses.' },
    { title: 'Follow-up telephone confirmations', kind: 'field_team', mins: null, extra: [],
      purpose: 'Two to three days. Field team under co-implementer supervision. Budget confirmation questions only.' },
    { title: 'Validation debrief plenary', kind: 'plenary', mins: 120, extra: [],
      purpose: 'Lead consultant leads, all present. Present findings to full leadership and confirm or revise the segment prioritisation on the evidence.' },
    { title: 'Decision output drafting and gate review', kind: 'one_to_one', mins: 240, extra: ['co_implementer', 'lsp_ed'],
      purpose: 'Half day. Co-implementer drafts, lead consultant reviews, Executive Director signs.' },
  ],
  dp03: [
    { title: 'Value proposition workshop', kind: 'plenary', mins: 240, extra: [],
      purpose: 'Half day per segment. Lead consultant leads, leadership team and field team present. Build the four components using the exact language clients used in Decision Point 2.' },
    { title: 'Differentiation mapping', kind: 'client_team_only', mins: 180, extra: [],
      purpose: 'Co-implementer leads, leadership team present. Be honest about where the differentiation is weak.' },
    { title: 'Language translation', kind: 'field_team', mins: 240, extra: [],
      purpose: 'Half day. Co-implementer leads, field team supports. Rewrite every proposition in client facing language. No programme or development sector terminology.' },
    { title: 'Client proposition testing', kind: 'field_team', mins: null, extra: [],
      purpose: 'One week. Field team presents the draft proposition informally to one real contact per segment and captures the response.' },
    { title: 'Testing debrief plenary', kind: 'plenary', mins: 120, extra: [],
      purpose: 'Lead consultant leads, all present. What landed and what did not.' },
    { title: 'Proposition revision and gate review', kind: 'one_to_one', mins: 240, extra: ['co_implementer', 'lsp_ed'],
      purpose: 'Half day. Co-implementer revises, lead consultant reviews, Executive Director signs.' },
  ],
  dp04: [
    { title: 'Cost mapping session 1', kind: 'finance_restricted', mins: 120, extra: [],
      purpose: 'Direct labour and direct materials. Lead consultant leads, leadership team and finance lead present. Actual figures entered live, not estimates. Field team does not attend.' },
    { title: 'Cost mapping session 2', kind: 'finance_restricted', mins: 120, extra: [],
      purpose: 'Travel and logistics, quality assurance, overhead allocation. All five categories complete. Overhead is almost always undercounted, so challenge the allocation directly.' },
    { title: 'Field team delivery time validation', kind: 'field_team', mins: 120, extra: [],
      purpose: 'Co-implementer leads, field team present. Hours or days required per service. Total cost figures are not shared, only the delivery time assumptions.' },
    { title: 'Cost mapping session 3', kind: 'finance_restricted', mins: 120, extra: [],
      purpose: 'Full model review. Challenge every assumption, calculate cost per delivery cycle, confirm overhead at minimum 20 percent of direct costs.' },
    { title: 'Break-even calculation and pricing tiers', kind: 'finance_restricted', mins: 240, extra: [],
      purpose: 'Half day. Co-implementer leads, finance lead supports, lead consultant reviews. Market reference prices first, then minimum two tiers, then read the break-even.' },
    { title: 'Pricing stress test', kind: 'client_team_only', mins: 120, extra: ['lead_consultant'],
      purpose: 'Lead consultant leads, leadership team present. Compare each tier against the Decision Point 2 willingness to pay evidence. A gap above 20 percent means the service configuration needs review.' },
    { title: 'Financial model handover', kind: 'finance_restricted', mins: 120, extra: [],
      purpose: 'Co-implementer trains the finance lead to update the model. The finance lead then demonstrates a change unassisted while the co-implementer observes.' },
    { title: 'Gate review and sign-off', kind: 'one_to_one', mins: 60, extra: ['lsp_ed'],
      purpose: 'Lead consultant leads, Executive Director signs.' },
  ],
  dp05: [
    { title: 'Client segmentation and prioritisation', kind: 'client_team_only', mins: 180, extra: ['lead_consultant'],
      purpose: 'Lead consultant leads, leadership team present. Rank target institutions by urgency of pain, budget authority and accessibility.' },
    { title: 'Outreach channel mapping', kind: 'field_team', mins: 120, extra: [],
      purpose: 'Co-implementer leads, field team present. Preferred channel per segment: direct approach, referral, event, digital.' },
    { title: 'Promotional material development', kind: 'field_team', mins: null, extra: [],
      purpose: 'Three days. Co-implementer leads, field team supports. Brochure and two fact sheets in client language. No programme language, no jargon.' },
    { title: 'Lead consultant review of all materials', kind: 'one_to_one', mins: 120, extra: [],
      purpose: 'No material goes to a client without lead consultant sign-off.' },
    { title: 'A/B message testing', kind: 'field_team', mins: null, extra: [],
      purpose: 'One week. Two message versions tested with real contacts in each segment. Field team conducts, co-implementer supervises.' },
    { title: 'A/B test debrief', kind: 'plenary', mins: 120, extra: [],
      purpose: 'Lead consultant leads, all present. Review response rates and select the winning version with evidence.' },
    { title: 'Pipeline build', kind: 'client_team_only', mins: 240, extra: ['co_implementer'],
      purpose: 'Half day. Co-implementer leads, leadership team reviews. Minimum 10 target institutions with an outreach sequence.' },
    { title: 'Gate review and sign-off', kind: 'one_to_one', mins: 60, extra: ['lsp_ed'],
      purpose: 'Lead consultant leads, Executive Director signs.' },
  ],
  dp06: [
    { title: 'Commercial identity workshop', kind: 'client_team_only', mins: 180, extra: ['lead_consultant'],
      purpose: 'Lead consultant leads, leadership team present. One clear primary identity: specialist advisory firm, training provider, systems integrator, embedded coaching practice, or hybrid.' },
    { title: 'Identity stress test', kind: 'client_team_only', mins: 120, extra: ['co_implementer'],
      purpose: 'Co-implementer leads, leadership team present. Test the claimed identity against the Decision Point 2 segments. Does it speak to the budget holder being targeted?' },
    { title: 'Partner mapping', kind: 'client_team_only', mins: 120, extra: ['co_implementer'],
      purpose: 'Co-implementer leads, leadership team present. Every current and potential partner categorised as referral, co-delivery, endorsement or conflict.' },
    { title: 'Partner alignment review', kind: 'one_to_one', mins: 120, extra: ['co_implementer'],
      purpose: 'Co-implementer drafts, lead consultant reviews. Name the conflict partnerships and make a specific recommendation for each. These must be addressed before Decision Point 7 opens.' },
    { title: 'Commercial identity statement', kind: 'one_to_one', mins: 240, extra: ['co_implementer'],
      purpose: 'Half day. Co-implementer drafts, lead consultant reviews and approves. Client facing, used in all outreach materials.' },
    { title: 'Gate review and sign-off', kind: 'one_to_one', mins: 60, extra: ['lsp_ed'],
      purpose: 'Lead consultant leads, Executive Director signs. Runs in parallel with Decision Point 5.' },
  ],
  dp07: [
    { title: 'Iteration 1 preparation', kind: 'field_team', mins: 240, extra: ['lead_consultant'],
      purpose: 'Half day. Lead consultant leads, field team and co-implementer. Brief on session objectives, review the service bundle, confirm client logistics.' },
    { title: 'Iteration 1, client session 1', kind: 'field_team', mins: 150, extra: ['lead_consultant'],
      purpose: 'Lead consultant leads the session with a real client. The client team observes. Responses documented in real time.' },
    { title: 'Iteration 1, debrief 1', kind: 'field_team', mins: 60, extra: ['lead_consultant'],
      purpose: 'Immediate debrief. Capture what the client said and identify the service bundle revisions needed.' },
    { title: 'Iteration 1, client session 2', kind: 'field_team', mins: 150, extra: ['lead_consultant'],
      purpose: 'Lead consultant leads. Incorporate the immediate learning from session 1.' },
    { title: 'Iteration 1 full debrief', kind: 'plenary', mins: 120, extra: [],
      purpose: 'Lead consultant leads, all present. Compare responses across both sessions and agree the service bundle revisions.' },
    { title: 'Service bundle revision', kind: 'one_to_one', mins: 240, extra: ['co_implementer'],
      purpose: 'Half day. Co-implementer leads, lead consultant reviews. Update the bundle on Iteration 1 evidence before Iteration 2 opens.' },
    { title: 'Iteration 2 preparation', kind: 'field_team', mins: 240, extra: ['lead_consultant'],
      purpose: 'Half day. Brief the field team on leading the session. They lead, the lead consultant is backstop only.' },
    { title: 'Iteration 2, client session 1', kind: 'field_team', mins: 150, extra: ['lead_consultant'],
      purpose: 'The field team leads. The lead consultant does not intervene except for misrepresentation, client distress, or drift that makes the evidence unusable.' },
    { title: 'Iteration 2, debrief 1', kind: 'plenary', mins: 60, extra: [],
      purpose: 'Lead consultant leads, all present. Compare the client led session against Iteration 1. Be honest.' },
    { title: 'Iteration 2, client session 2', kind: 'field_team', mins: 150, extra: ['lead_consultant'],
      purpose: 'The field team leads, lead consultant backstop.' },
    { title: 'Iteration 2 full debrief and comparison', kind: 'plenary', mins: 120, extra: [],
      purpose: 'Lead consultant leads, all present. Document all four sessions: what changed and why.' },
    { title: 'Iteration comparison document', kind: 'one_to_one', mins: 480, extra: ['co_implementer'],
      purpose: 'One day. Co-implementer documents the findings, lead consultant reviews.' },
    { title: 'Gate review and sign-off', kind: 'one_to_one', mins: 60, extra: ['lsp_ed'],
      purpose: 'Lead consultant leads, Executive Director signs. This zone cannot be compressed, deferred or substituted.' },
  ],
  dp08: [
    { title: 'Pilot evidence review', kind: 'plenary', mins: 120, extra: [],
      purpose: 'Lead consultant leads, all present. Which segments showed the strongest commercial traction, using the iteration comparison document as the evidence base.' },
    { title: 'Scale segment identification', kind: 'client_team_only', mins: 120, extra: ['co_implementer'],
      purpose: 'Co-implementer leads, leadership team present. Name the entry point segment and the scale segment specifically.' },
    { title: 'Channel and infrastructure mapping', kind: 'client_team_only', mins: 120, extra: ['co_implementer'],
      purpose: 'Co-implementer leads, leadership team present. What is needed to reach the scale segments without programme facilitation. A route that runs only through the programme is not an independent channel.' },
    { title: 'Scale pathway document drafting', kind: 'one_to_one', mins: 240, extra: ['co_implementer'],
      purpose: 'Half day. Co-implementer drafts, lead consultant reviews.' },
    { title: 'Revenue projection update', kind: 'finance_restricted', mins: 120, extra: [],
      purpose: 'Finance lead updates, co-implementer supports. Three scenarios: conservative, base, optimistic.' },
    { title: 'Gate review and sign-off', kind: 'one_to_one', mins: 60, extra: ['lsp_ed'],
      purpose: 'Lead consultant leads, Executive Director signs. The board approves the scale pathway commitment.' },
  ],
  dp09: [
    { title: 'Baseline diagnostic', kind: 'joint_with_funder', mins: 120, extra: ['lsp_leadership'],
      purpose: 'End of Decision Point 1. Score all six fit tests with the full leadership team, the funder representative and the lead consultant present. Agree what progression looks like at mid point. Record and sign.' },
    { title: 'Mid-point diagnostic', kind: 'joint_with_funder', mins: 120, extra: ['lsp_leadership'],
      purpose: 'During Decision Point 7, after Iteration 1 and before Iteration 2. Score all six fit tests and identify where the engagement must accelerate. Shared with the funder. If the score shows significant gaps, adjust the plan now, not at close.' },
    { title: 'Close diagnostic', kind: 'joint_with_funder', mins: 180, extra: ['lsp_leadership'],
      purpose: 'After all zones complete. Score all six fit tests and document the full progression from baseline to close.' },
  ],
  handover: [
    { title: 'Formal handover session', kind: 'joint_with_funder', mins: 240, extra: ['lsp_leadership'],
      purpose: 'The leadership team presents the complete commercial model unassisted. The lead consultant and the funder representative are evaluators, not helpers. The model is accepted only when every decision can be defended independently.' },
  ],
}

export const STATUS_OPTIONS = [
  { v: 'planned', l: 'Planned', color: SLATE },
  { v: 'held', l: 'Held', color: GREEN },
  { v: 'cancelled', l: 'Cancelled', color: RED },
]
export function statusColor(v) {
  const s = STATUS_OPTIONS.find((o) => o.v === v)
  return s ? s.color : SLATE
}

export function durationLabel(mins) {
  if (mins === null || mins === undefined || mins === '') return ''
  const n = Number(mins)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 60) return `${n} min`
  const h = n / 60
  if (h >= 8 && n % 480 === 0) return `${n / 480} full day${n / 480 === 1 ? '' : 's'}`
  if (n === 240) return 'half day'
  return `${Number.isInteger(h) ? h : h.toFixed(1)} hr`
}

/** What a room is called, without needing the whole definition. */
export const KIND_LABEL = KINDS.reduce((out, k) => { out[k.v] = k.l; return out }, {})

/** The label for one decision point, or the id if it is not one we know. */
export function dpLabel(dpId) {
  const d = DPS.find((x) => x.id === dpId)
  return d ? d.label : (dpId || 'Not yet assigned to a decision point')
}

/** The sessions the Delivery Guide prescribes at one decision point. */
export function methodSessionsFor(dpId) {
  return METHOD_SESSIONS[dpId] || []
}

/**
 * The roles the method expects in a room: the room's own, plus any the
 * prescribed session adds on top of it.
 */
export function requiredRoles(kind, extra) {
  const def = kindDef(kind)
  return Array.from(new Set([...(def ? def.required : []), ...(extra || [])]))
}

/** The roles the method deliberately keeps out of a room. */
export function excludedRoles(kind) {
  const def = kindDef(kind)
  return def ? def.excluded : []
}

/**
 * What is wrong with the room, said rather than enforced.
 *
 *   missing    the method expects this role and nobody in it is in the session
 *   intruders  somebody is in the session whom the method keeps out of it
 *   unnamed    the method expects this role and the engagement has nobody in it
 *
 * Never blocks. A coach who knows why the finance lead is absent should not
 * be stopped from recording the session that actually happened.
 */
export function attendanceWarnings({ kind, extraRequired, presentRoles, namedRoles }) {
  const present = new Set(presentRoles || [])
  const named = new Set(namedRoles || [])
  const required = requiredRoles(kind, extraRequired)
  return {
    missing: required.filter((r) => !present.has(r)),
    intruders: excludedRoles(kind).filter((r) => present.has(r)),
    unnamed: required.filter((r) => !named.has(r)),
  }
}

/**
 * Every session on the engagement in delivery order, for the workplan.
 *
 * Decision points come in the order the method runs them, and a session with
 * no decision point on it is not dropped: it goes last, under its own heading,
 * because a session that exists and cannot be seen is worse than an untidy
 * list. Inside a decision point, sessions are ordered by when they are, and
 * anything with no date yet sits after the dated ones rather than at the top.
 */
export function workplanGroups(sessions) {
  const rows = sessions || []
  const known = new Set(DPS.map((d) => d.id))
  const groups = DPS.map((d) => ({
    id: d.id,
    label: d.label,
    sessions: rows.filter((s) => s.dp_id === d.id).sort(bySessionOrder),
  }))
  const loose = rows.filter((s) => !s.dp_id || !known.has(s.dp_id)).sort(bySessionOrder)
  if (loose.length) {
    groups.push({ id: '__unassigned', label: 'Not yet assigned to a decision point', sessions: loose })
  }
  return groups
}

function sessionStamp(s) {
  const raw = s.planned_at || s.held_date || s.planned_date
  if (!raw) return null
  const t = new Date(raw).getTime()
  return Number.isNaN(t) ? null : t
}

function bySessionOrder(a, b) {
  const ta = sessionStamp(a)
  const tb = sessionStamp(b)
  if (ta === null && tb === null) return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
  if (ta === null) return 1
  if (tb === null) return -1
  return ta - tb
}

/** One cell, with anything that would break a spreadsheet taken care of. */
function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  // A leading =, +, - or @ is read as a formula by Excel and Sheets, so a
  // session called "=cut the budget" would run as one. A single quote in front
  // makes it text again, and is not shown in the cell.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export const WORKPLAN_COLUMNS = [
  'Decision point', 'Session', 'Room', 'Planned', 'Held', 'Minutes', 'Status', 'Who is in it', 'Purpose',
]

/**
 * The workplan as a spreadsheet.
 *
 * Habib asked for "printable and spreadsheet for flexibility", so this is the
 * download: one row per session, in the same order the screen shows them, with
 * the people spelled out rather than counted.
 */
export function workplanCsv(sessions, whoFor = () => []) {
  const lines = [WORKPLAN_COLUMNS.map(csvCell).join(',')]
  workplanGroups(sessions).forEach((g) => {
    g.sessions.forEach((s) => {
      lines.push([
        g.label,
        s.title || 'Untitled session',
        s.session_kind ? (KIND_LABEL[s.session_kind] || s.session_kind) : '',
        s.planned_at || s.planned_date || '',
        s.held_date || '',
        s.duration_minutes ?? '',
        s.status || 'planned',
        (whoFor(s) || []).join('; '),
        s.purpose || '',
      ].map(csvCell).join(','))
    })
  })
  // A trailing newline, because a file without one loses its last row in some
  // readers.
  return lines.join('\r\n') + '\r\n'
}

/**
 * Which tab a decision point's sessions are actually planned on, so the
 * workplan can send you there. The ids are CANVAS_TABS ids in
 * src/lib/coach-types.ts. "setup" is the pre-engagement diagnostic, which is a
 * decision point in the method and a tab of its own on the screen.
 */
export const DP_TAB = {
  setup: 'diagnostic',
  phase_0: 'phase0',
  dp01: 'dp01', dp02: 'dp02', dp03: 'dp03', dp04: 'dp04', dp05: 'dp05',
  dp06: 'dp06', dp07: 'dp07', dp08: 'dp08', dp09: 'dp09',
  handover: 'handover',
}

/** Where to go to change a session, from the workplan that only reads it. */
export function dpHref(clientId, dpId) {
  const tab = DP_TAB[dpId]
  if (!tab || !clientId) return null
  return `/coach?client=${encodeURIComponent(clientId)}&zone=${tab}`
}
