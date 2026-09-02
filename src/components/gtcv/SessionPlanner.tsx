// @ts-nocheck
'use client'
// ============================================================
// SESSION PLANNER
//
// The delivery plan as the method actually specifies it: a sequence of
// sessions per decision point, each with a room. The room is not an
// administrative detail. The Delivery Guide names who must be present for
// every session, and three of those rules change what the session is:
//
//   PLENARY            the whole client team in the room. The service
//                      listing plenary, the customer segment opening
//                      plenary, the validation debrief, the A/B debrief,
//                      the pilot debriefs.
//   JOINT WITH FUNDER  the programme funder in the room. The
//                      pre-engagement diagnostic, and all three
//                      Commercial Readiness diagnostics plus the formal
//                      handover, which the guide calls joint sessions
//                      where the evidence is reviewed together and the
//                      score is agreed.
//   CLIENT TEAM ONLY   worked with the leadership team, funder not present.
//   FINANCE RESTRICTED the Decision Point 4 cost mapping sessions. The privacy
//                      protocol is explicit: finance, HR and leadership
//                      only, and the field team does not attend. The field
//                      team validates delivery time in a separate session
//                      and never sees the cost totals.
//   FIELD TEAM         the delivery staff: conversation training,
//                      fieldwork, delivery time validation, pilot sessions.
//   ONE TO ONE         the drafting and review pairs the guide names
//                      directly, and the gate reviews where the lead
//                      consultant sits with the Executive Director.
//
// Choosing a kind prefills the attendees the method requires for that room,
// and the planner warns when a required attendee is not ticked, or when
// someone the method keeps out of the room is.
//
// Writes to gtcv_sessions and gtcv_session_attendance (see
// supabase/migrations/2026_08_09_gtcv_sessions.sql). Attendance is recorded
// against engagement_parties, so a funder representative without a login is
// covered like anyone else. Reads and writes go through the browser
// Supabase client, so RLS scopes everything to the signed-in viewer.
// canManage=false renders the same plan read only.
//
// CLIENT AGNOSTIC: no organisation, funder or person is named here. The
// session catalogue is the method; the people come from the engagement.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const SESSIONS_TABLE = 'gtcv_sessions'
const ATTENDANCE_TABLE = 'gtcv_session_attendance'
const PARTIES_TABLE = 'engagement_parties'

const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', white: 'var(--cv-card)',
  slate: 'var(--cv-slate)', border: 'var(--cv-border)', teal: 'var(--cv-teal)',
  red: 'var(--cv-red)', green: 'var(--cv-green)', amber: 'var(--cv-amber)',
  purple: 'var(--cv-purple)', alt: 'var(--cv-alt)',
}
const card = { background: C.white, border: '1px solid var(--cv-border-soft)', borderRadius: 14, padding: '1.35rem 1.5rem', marginBottom: '1.25rem', boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)' }
const secH = { fontFamily: 'var(--cv-font)', fontSize: '1.32rem', fontWeight: 700, color: C.navy, margin: 0 }
const hint = { fontSize: '1.01rem', color: C.slate, lineHeight: 1.4 }
const mono = { fontFamily: 'var(--cv-font-mono)', fontSize: '0.85rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.slate }
const cell = { width: '100%', padding: '0.4rem 0.55rem', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: '1.01rem', fontFamily: 'inherit', background: 'var(--cv-bg-2)', color: C.navy, boxSizing: 'border-box' }
const readCell = { fontSize: '1.01rem', color: C.navy, lineHeight: 1.4, padding: '0.4rem 0.2rem', whiteSpace: 'pre-wrap' }
const ghostBtn = { fontFamily: 'var(--cv-font-mono)', fontSize: '0.91rem', padding: '0.3rem 0.7rem', border: `1px solid ${C.cyan}`, borderRadius: 6, background: 'transparent', color: C.cyan, cursor: 'pointer' }
const solidBtn = { fontFamily: 'var(--cv-font-mono)', fontSize: '0.95rem', fontWeight: 700, padding: '0.38rem 0.9rem', border: 'none', borderRadius: 6, background: C.cyan, color: 'var(--cv-on-accent)', cursor: 'pointer' }
const delBtn = { fontFamily: 'var(--cv-font-mono)', fontSize: '0.91rem', padding: '0.25rem 0.5rem', border: `1px solid ${C.border}`, borderRadius: 6, background: 'transparent', color: C.red, cursor: 'pointer' }

// ─── Party roles, as engagement_parties stores them ──────────
const ROLE_LABEL = {
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
function roleLabel(role) { return ROLE_LABEL[role] || role || 'Unassigned role' }

// ─── The rooms, and who the method puts in each one ──────────
// required: the method expects these roles present.
// excluded: the method deliberately keeps these roles out.
const KINDS = [
  {
    v: 'plenary', l: 'Plenary',
    blurb: 'The whole client team in the room.',
    required: ['lead_consultant', 'lsp_ed', 'lsp_leadership', 'lsp_field'],
    excluded: [],
    color: C.teal,
  },
  {
    v: 'joint_with_funder', l: 'Joint with funder',
    blurb: 'The funder in the room with the client team. The evidence is reviewed together and the record is signed by all parties.',
    required: ['lead_consultant', 'funder_rep', 'lsp_ed', 'co_implementer'],
    excluded: [],
    color: C.purple,
  },
  {
    v: 'client_team_only', l: 'Client team only',
    blurb: 'Worked with the leadership team. The funder is not in this room.',
    required: ['lsp_leadership'],
    excluded: ['funder_rep'],
    color: C.navy,
  },
  {
    v: 'finance_restricted', l: 'Finance restricted',
    blurb: 'Finance and leadership only. The field team does not attend, and cost totals are not shared with them.',
    required: ['lead_consultant', 'lsp_finance', 'lsp_leadership'],
    excluded: ['lsp_field', 'funder_rep'],
    color: C.red,
  },
  {
    v: 'field_team', l: 'Field team',
    blurb: 'The delivery staff. Training, fieldwork, delivery time validation and pilot sessions.',
    required: ['co_implementer', 'lsp_field'],
    excluded: [],
    color: C.amber,
  },
  {
    v: 'one_to_one', l: 'One to one',
    blurb: 'A drafting or review pair, or a gate review between the lead consultant and the Executive Director.',
    required: ['lead_consultant'],
    excluded: [],
    color: C.slate,
  },
]
function kindDef(v) { return KINDS.find((k) => k.v === v) || null }

// ─── The decision points, in delivery order ──────────────────
const DPS = [
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
const METHOD_SESSIONS = {
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

const STATUS_OPTIONS = [
  { v: 'planned', l: 'Planned', color: C.slate },
  { v: 'held', l: 'Held', color: C.green },
  { v: 'cancelled', l: 'Cancelled', color: C.red },
]
function statusColor(v) {
  const s = STATUS_OPTIONS.find((o) => o.v === v)
  return s ? s.color : C.slate
}

function durationLabel(mins) {
  if (mins === null || mins === undefined || mins === '') return ''
  const n = Number(mins)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 60) return `${n} min`
  const h = n / 60
  if (h >= 8 && n % 480 === 0) return `${n / 480} full day${n / 480 === 1 ? '' : 's'}`
  if (n === 240) return 'half day'
  return `${Number.isInteger(h) ? h : h.toFixed(1)} hr`
}

export default function SessionPlanner({ clientId, canManage }) {
  const [sessions, setSessions] = useState([])
  const [parties, setParties] = useState([])
  const [attendance, setAttendance] = useState([])   // flat rows, grouped in render
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [status, setStatus] = useState('idle')       // idle | saving | saved
  const [dirty, setDirty] = useState({})
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState(null)         // session with attendance expanded
  const [pickerDp, setPickerDp] = useState(null)     // dp showing the method catalogue

  const sessionsRef = useRef([])
  const dirtyRef = useRef({})
  useEffect(() => { sessionsRef.current = sessions }, [sessions])
  useEffect(() => { dirtyRef.current = dirty }, [dirty])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!clientId) { setSessions([]); setParties([]); setAttendance([]); setLoading(false); return }
      setLoading(true)
      const [sRes, pRes, aRes] = await Promise.all([
        supabase.from(SESSIONS_TABLE).select('*').eq('client_id', clientId)
          .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
        supabase.from(PARTIES_TABLE).select('id, party_role, name, organisation, title, sort_order')
          .eq('client_id', clientId).order('sort_order', { ascending: true }),
        supabase.from(ATTENDANCE_TABLE).select('*').eq('client_id', clientId),
      ])
      if (cancelled) return
      const firstErr = sRes.error || pRes.error || aRes.error
      if (firstErr) setErr('Could not load the session plan: ' + firstErr.message)
      else setErr(null)
      setSessions(sRes.data || [])
      setParties(pRes.data || [])
      setAttendance(aRes.data || [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [clientId])

  // Attendance rows keyed by session, so each card reads its own list.
  const attBySession = useMemo(() => {
    const out = {}
    attendance.forEach((a) => {
      if (!out[a.session_id]) out[a.session_id] = []
      out[a.session_id].push(a)
    })
    return out
  }, [attendance])

  const partiesByRole = useMemo(() => {
    const out = {}
    parties.forEach((p) => {
      if (!out[p.party_role]) out[p.party_role] = []
      out[p.party_role].push(p)
    })
    return out
  }, [parties])

  const byDp = useMemo(() => {
    const out = {}
    DPS.forEach((d) => { out[d.id] = [] })
    out.__unassigned = []
    sessions.forEach((s) => {
      const key = s.dp_id && out[s.dp_id] ? s.dp_id : '__unassigned'
      out[key].push(s)
    })
    return out
  }, [sessions])

  const pendingCount = useMemo(
    () => Object.keys(dirty).filter((id) => Object.keys(dirty[id] || {}).length > 0).length,
    [dirty]
  )

  // ─── What the method requires in this room ─────────────────
  // The room's own required roles, plus any the session itself was created
  // with (stored as required rows on the attendance table).
  function requiredRolesFor(session) {
    const def = kindDef(session.session_kind)
    const base = def ? def.required : []
    const marked = (attBySession[session.id] || [])
      .filter((a) => a.required && a.party_role)
      .map((a) => a.party_role)
    return Array.from(new Set([...base, ...marked]))
  }

  function excludedRolesFor(session) {
    const def = kindDef(session.session_kind)
    return def ? def.excluded : []
  }

  // Required roles with nobody ticked as attending, and excluded roles that
  // someone is ticked for. Both are shown, never blocked.
  function warningsFor(session) {
    const rows = attBySession[session.id] || []
    const attendedRoles = new Set(rows.filter((a) => a.attended).map((a) => a.party_role))
    const missing = requiredRolesFor(session).filter((r) => !attendedRoles.has(r))
    const intruders = excludedRolesFor(session).filter((r) => attendedRoles.has(r))
    const unnamed = requiredRolesFor(session).filter((r) => !(partiesByRole[r] || []).length)
    return { missing, intruders, unnamed }
  }

  // ─── Writes ────────────────────────────────────────────────
  function setField(id, field, value) {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)))
    setDirty((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: true } }))
    setStatus('idle')
  }

  // Database error text is for the log, not for the coach. It names tables and
  // columns, which tells them nothing and tells anyone watching too much.
  function reportError(what, error) {
    console.error('SessionPlanner: ' + what, error)
    setErr(what + '. Try again.')
  }

  async function saveSession(id) {
    const fields = Object.keys(dirtyRef.current[id] || {})
    if (!fields.length) return
    const row = sessionsRef.current.find((s) => s.id === id)
    if (!row) return
    const patch = { updated_at: new Date().toISOString() }
    fields.forEach((f) => {
      const v = row[f]
      if (f === 'duration_minutes') patch[f] = v === '' || v === null ? null : Number(v)
      else patch[f] = v === '' ? null : v
    })
    // The session stays marked unsaved until the write comes back, so a failed
    // write leaves something to retry rather than removing the Save button and
    // losing the edit on reload.
    setStatus('saving')
    const { error } = await supabase.from(SESSIONS_TABLE).update(patch).eq('id', id)
    if (error) {
      setErr('Could not save the session. Your changes are still here, try again.')
      setStatus('idle')
      return
    }
    setDirty((prev) => { const next = { ...prev }; delete next[id]; return next })
    dirtyRef.current = (() => { const n = { ...dirtyRef.current }; delete n[id]; return n })()
    setErr(null); setStatus('saved')
  }

  async function saveAll() {
    // Snapshot the list first. A row that fails to save stays dirty now, so
    // reading the live keys mid-loop would revisit it forever.
    const ids = Object.keys(dirtyRef.current)
    for (const id of ids) await saveSession(id)
  }

  // Insert the required attendance rows for a room, so the coach sees who
  // the method expects before the session runs. Roles with no named party
  // still get a row, marked required, so the gap is visible.
  async function applyRequiredAttendance(session, kind, extraRoles) {
    const def = kindDef(kind)
    const roles = Array.from(new Set([...(def ? def.required : []), ...(extraRoles || [])]))

    // Read what is actually recorded rather than trusting local state. Two
    // room changes in quick succession both used to see the same stale list
    // and both inserted, leaving the session with the same person required
    // twice. Reading first, plus the unique index the database now carries,
    // means running this again changes nothing.
    const { data: fresh, error: readErr } = await supabase
      .from(ATTENDANCE_TABLE).select('*').eq('session_id', session.id)
    if (readErr) { reportError('Could not read the attendance for this session', readErr); return }
    const existing = fresh || []

    const toInsert = []
    const toMark = []

    roles.forEach((role) => {
      const named = partiesByRole[role] || []
      if (named.length === 0) {
        const row = existing.find((a) => a.party_role === role && !a.party_id)
        if (row) { if (!row.required) toMark.push(row.id) }
        else toInsert.push({ client_id: clientId, session_id: session.id, party_id: null, party_role: role, required: true })
        return
      }
      named.forEach((p) => {
        const row = existing.find((a) => a.party_id === p.id)
        if (row) { if (!row.required) toMark.push(row.id) }
        else toInsert.push({ client_id: clientId, session_id: session.id, party_id: p.id, party_role: role, required: true })
      })
    })

    // Roles the new room no longer requires stop being required, but the row
    // stays so an attendance already recorded is not lost.
    const noLonger = existing.filter((a) => a.required && !roles.includes(a.party_role)).map((a) => a.id)

    let inserted = []
    if (toInsert.length) {
      const { data, error } = await supabase.from(ATTENDANCE_TABLE).insert(toInsert).select()
      if (error) {
        // A unique violation means somebody else got there first and the row
        // is already present, which is the end state this function wants. Any
        // other error is real.
        if (error.code !== '23505') { reportError('Could not set the required attendees', error); return }
        const { data: after } = await supabase
          .from(ATTENDANCE_TABLE).select('*').eq('session_id', session.id)
        inserted = (after || []).filter((r) => !existing.some((e) => e.id === r.id))
      } else {
        inserted = data || []
      }
    }
    if (toMark.length) {
      const { error } = await supabase.from(ATTENDANCE_TABLE).update({ required: true }).in('id', toMark)
      if (error) { reportError('Could not set the required attendees', error); return }
    }
    if (noLonger.length) {
      const { error } = await supabase.from(ATTENDANCE_TABLE).update({ required: false }).in('id', noLonger)
      if (error) { reportError('Could not clear the previous requirement', error); return }
    }

    setErr(null)
    setAttendance((prev) => {
      const next = prev.map((a) => {
        if (toMark.includes(a.id)) return { ...a, required: true }
        if (noLonger.includes(a.id)) return { ...a, required: false }
        return a
      })
      return [...next, ...inserted]
    })
  }

  async function changeKind(session, kind) {
    setField(session.id, 'session_kind', kind)
    const { error } = await supabase
      .from(SESSIONS_TABLE)
      .update({ session_kind: kind || null, updated_at: new Date().toISOString() })
      .eq('id', session.id)
    if (error) { reportError('Could not change the session kind', error); return }
    // Copy the nested object before changing it. Deleting straight out of
    // next[session.id] edits the object the previous state still holds, and
    // React may call this updater more than once. Clearing it only after the
    // write succeeds also means a failed change stays marked unsaved.
    setDirty((prev) => {
      const row = prev[session.id]
      if (!row) return prev
      const { session_kind, ...rest } = row
      const next = { ...prev }
      if (Object.keys(rest).length) next[session.id] = rest
      else delete next[session.id]
      return next
    })
    if (dirtyRef.current[session.id]) {
      const { session_kind, ...rest } = dirtyRef.current[session.id]
      const n = { ...dirtyRef.current }
      if (Object.keys(rest).length) n[session.id] = rest
      else delete n[session.id]
      dirtyRef.current = n
    }
    if (kind) await applyRequiredAttendance(session, kind, [])
  }

  async function addSession(dpId, template) {
    if (!clientId || busy) return
    setBusy(true)
    const inDp = (byDp[dpId] || [])
    const nextOrder = sessions.reduce((m, s) => Math.max(m, Number(s.sort_order) || 0), 0) + 1
    const payload = {
      client_id: clientId,
      dp_id: dpId === '__unassigned' ? null : dpId,
      sort_order: nextOrder,
      status: 'planned',
      title: template ? template.title : `Session ${inDp.length + 1}`,
      session_kind: template ? template.kind : null,
      duration_minutes: template ? template.mins : null,
      purpose: template ? template.purpose : null,
    }
    const { data, error } = await supabase.from(SESSIONS_TABLE).insert([payload]).select().single()
    setBusy(false)
    if (error) { reportError('Could not add the session', error); return }
    setErr(null)
    setSessions((prev) => [...prev, data])
    setPickerDp(null)
    if (data.session_kind) await applyRequiredAttendance(data, data.session_kind, template ? template.extra : [])
    setOpenId(data.id)
  }

  async function removeSession(id) {
    const s = sessions.find((x) => x.id === id)
    const name = s && s.title ? s.title : 'this session'
    if (typeof window !== 'undefined' && !window.confirm(`Delete ${name} from the plan?`)) return
    // Hide it at once so the plan feels responsive, but keep what was removed.
    // A failed delete used to leave the session hidden while the row was still
    // in the database, so the coach saw an error and a plan that disagreed with
    // it until they reloaded.
    const removedSession = s
    const removedAttendance = attendance.filter((a) => a.session_id === id)
    const removedDirty = dirty[id]

    setSessions((prev) => prev.filter((x) => x.id !== id))
    setAttendance((prev) => prev.filter((a) => a.session_id !== id))
    setDirty((prev) => { const next = { ...prev }; delete next[id]; return next })

    const { error } = await supabase.from(SESSIONS_TABLE).delete().eq('id', id)
    if (error) {
      if (removedSession) setSessions((prev) => [...prev, removedSession])
      if (removedAttendance.length) setAttendance((prev) => [...prev, ...removedAttendance])
      if (removedDirty) setDirty((prev) => ({ ...prev, [id]: removedDirty }))
      reportError('Could not delete the session', error)
    }
    else setErr(null)
  }

  // Tick or untick one person for one session.
  async function toggleAttended(session, party) {
    const rows = attBySession[session.id] || []
    const row = rows.find((a) => a.party_id === party.id)
    if (row) {
      const nextVal = row.attended ? null : true
      setAttendance((prev) => prev.map((a) => (a.id === row.id ? { ...a, attended: nextVal } : a)))
      const { error } = await supabase.from(ATTENDANCE_TABLE).update({ attended: nextVal }).eq('id', row.id)
      if (error) reportError('Could not record attendance', error)
      else setErr(null)
      return
    }
    const insert = {
      client_id: clientId, session_id: session.id, party_id: party.id,
      party_role: party.party_role, required: false, attended: true,
    }
    const { data, error } = await supabase.from(ATTENDANCE_TABLE).insert([insert]).select().single()
    if (error) { reportError('Could not record attendance', error); return }
    setErr(null)
    setAttendance((prev) => [...prev, data])
  }

  function pill() {
    if (status === 'saving') return { text: 'Saving', color: C.amber }
    if (pendingCount > 0) return { text: `${pendingCount} unsaved session${pendingCount === 1 ? '' : 's'}`, color: C.amber }
    if (status === 'saved') return { text: 'Saved', color: C.green }
    return null
  }
  const p = pill()

  // ─── Render ────────────────────────────────────────────────
  function renderAttendance(session) {
    const rows = attBySession[session.id] || []
    const required = requiredRolesFor(session)
    const excluded = excludedRolesFor(session)
    const w = warningsFor(session)

    return (
      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: '0.7rem', paddingTop: '0.7rem' }}>
        <div style={{ ...mono, marginBottom: '0.45rem' }}>Attendance</div>

        {(w.missing.length > 0 || w.intruders.length > 0 || w.unnamed.length > 0) && (
          <div style={{ border: `1px solid ${C.amber}`, background: C.alt, borderRadius: 8, padding: '0.6rem 0.8rem', marginBottom: '0.7rem' }}>
            {w.missing.length > 0 && (
              <div style={{ fontSize: '1.01rem', color: C.amber, lineHeight: 1.45 }}>
                The method requires {w.missing.map(roleLabel).join(', ')} in this room, and {w.missing.length === 1 ? 'that attendee is' : 'those attendees are'} not ticked.
              </div>
            )}
            {w.intruders.length > 0 && (
              <div style={{ fontSize: '1.01rem', color: C.red, lineHeight: 1.45, marginTop: w.missing.length ? '0.35rem' : 0 }}>
                {w.intruders.map(roleLabel).join(', ')} {w.intruders.length === 1 ? 'is' : 'are'} ticked, and the method keeps that role out of this room.
              </div>
            )}
            {w.unnamed.length > 0 && (
              <div style={{ ...hint, marginTop: '0.35rem' }}>
                No one is named for {w.unnamed.map(roleLabel).join(', ')} in this engagement yet.
              </div>
            )}
          </div>
        )}

        {parties.length === 0 ? (
          <div style={hint}>No parties are recorded for this engagement yet, so there is nobody to tick.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {parties.map((party) => {
              const row = rows.find((a) => a.party_id === party.id)
              const isRequired = required.includes(party.party_role)
              const isExcluded = excluded.includes(party.party_role)
              const attended = !!(row && row.attended)
              const tone = isExcluded ? C.red : isRequired ? C.teal : C.border
              return (
                <label
                  key={party.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.45rem',
                    border: `1px solid ${tone}`, borderRadius: 8,
                    padding: '0.35rem 0.6rem', minWidth: 190,
                    background: attended ? C.alt : 'transparent',
                    cursor: canManage ? 'pointer' : 'default',
                  }}
                >
                  <input
                    type="checkbox"
                    aria-label={`${party.name} attended`}
                    checked={attended}
                    disabled={!canManage}
                    onChange={() => canManage && toggleAttended(session, party)}
                  />
                  <span>
                    <span style={{ fontSize: '1.01rem', color: C.navy }}>{party.name}</span>
                    <span style={{ display: 'block', fontFamily: 'var(--cv-font-mono)', fontSize: '0.8rem', color: isExcluded ? C.red : C.slate }}>
                      {roleLabel(party.party_role)}
                      {isRequired ? ' . required' : ''}
                      {isExcluded ? ' . not in this room' : ''}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  function renderSession(session) {
    const def = kindDef(session.session_kind)
    const w = warningsFor(session)
    const flagged = w.missing.length > 0 || w.intruders.length > 0
    const open = openId === session.id
    return (
      <div
        key={session.id}
        style={{
          border: `1px solid ${flagged ? C.amber : 'var(--cv-border-soft)'}`,
          borderLeft: `4px solid ${def ? def.color : C.border}`,
          borderRadius: 10, padding: '0.75rem 0.9rem', marginBottom: '0.6rem', background: C.white,
        }}
      >
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 260px', minWidth: 220 }}>
            {canManage ? (
              <input
                style={{ ...cell, fontWeight: 600 }}
                value={session.title || ''}
                placeholder="Session name"
                aria-label="Session name"
                onChange={(e) => setField(session.id, 'title', e.target.value)}
                onBlur={() => saveSession(session.id)}
              />
            ) : (
              <div style={{ ...readCell, fontWeight: 600 }}>{session.title || 'Untitled session'}</div>
            )}
          </div>

          <div style={{ flex: '0 1 190px', minWidth: 170 }}>
            <div style={mono}>Room</div>
            {canManage ? (
              <select
                style={cell}
                value={session.session_kind || ''}
                aria-label="Room for this session"
                onChange={(e) => changeKind(session, e.target.value)}
              >
                <option value="">Not set</option>
                {KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
              </select>
            ) : (
              <div style={readCell}>{def ? def.l : 'Not set'}</div>
            )}
          </div>

          <div style={{ flex: '0 1 140px', minWidth: 130 }}>
            <div style={mono}>Planned</div>
            {canManage ? (
              <input
                type="date" style={cell} value={session.planned_date || ''}
                aria-label="Planned date"
                onChange={(e) => setField(session.id, 'planned_date', e.target.value)}
                onBlur={() => saveSession(session.id)}
              />
            ) : <div style={readCell}>{session.planned_date || ''}</div>}
          </div>

          <div style={{ flex: '0 1 140px', minWidth: 130 }}>
            <div style={mono}>Held</div>
            {canManage ? (
              <input
                type="date" style={cell} value={session.held_date || ''}
                aria-label="Date it was held"
                onChange={(e) => setField(session.id, 'held_date', e.target.value)}
                onBlur={() => saveSession(session.id)}
              />
            ) : <div style={readCell}>{session.held_date || ''}</div>}
          </div>

          <div style={{ flex: '0 1 120px', minWidth: 110 }}>
            <div style={mono}>Minutes</div>
            {canManage ? (
              <input
                type="number" min="0" style={cell} value={session.duration_minutes ?? ''}
                placeholder="e.g. 120"
                aria-label="Length in minutes"
                onChange={(e) => setField(session.id, 'duration_minutes', e.target.value)}
                onBlur={() => saveSession(session.id)}
              />
            ) : <div style={readCell}>{durationLabel(session.duration_minutes)}</div>}
          </div>

          <div style={{ flex: '0 1 130px', minWidth: 120 }}>
            <div style={mono}>Status</div>
            {canManage ? (
              <select
                style={{ ...cell, color: statusColor(session.status) }}
                value={session.status || 'planned'}
                aria-label="Session status"
                onChange={(e) => { setField(session.id, 'status', e.target.value); setTimeout(() => saveSession(session.id), 0) }}
              >
                {STATUS_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            ) : (
              <div style={{ ...readCell, color: statusColor(session.status) }}>
                {(STATUS_OPTIONS.find((o) => o.v === session.status) || {}).l || 'Planned'}
              </div>
            )}
          </div>

          {canManage && (
            <div style={{ paddingTop: '1.1rem' }}>
              <button type="button" style={delBtn} onClick={() => removeSession(session.id)} title="Delete this session">x</button>
            </div>
          )}
        </div>

        {def && <div style={{ ...hint, marginTop: '0.45rem' }}>{def.blurb}</div>}

        <div style={{ marginTop: '0.5rem' }}>
          <div style={mono}>Purpose</div>
          {canManage ? (
            <textarea
              style={{ ...cell, minHeight: 54, resize: 'vertical', lineHeight: 1.35 }}
              value={session.purpose || ''}
              placeholder="What this session must produce"
              aria-label="What this session is for"
                onChange={(e) => setField(session.id, 'purpose', e.target.value)}
              onBlur={() => saveSession(session.id)}
            />
          ) : <div style={readCell}>{session.purpose || ''}</div>}
        </div>

        <div style={{ marginTop: '0.5rem' }}>
          <div style={mono}>Notes</div>
          {canManage ? (
            <textarea
              style={{ ...cell, minHeight: 44, resize: 'vertical', lineHeight: 1.35 }}
              value={session.notes || ''}
              placeholder=""
              aria-label="Session notes"
                onChange={(e) => setField(session.id, 'notes', e.target.value)}
              onBlur={() => saveSession(session.id)}
            />
          ) : <div style={readCell}>{session.notes || ''}</div>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
          <button type="button" style={ghostBtn} onClick={() => setOpenId(open ? null : session.id)}>
            {open ? 'Hide attendance' : 'Attendance'}
          </button>
          {flagged && (
            <span style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.87rem', color: C.amber, border: `1px solid ${C.amber}`, borderRadius: 999, padding: '0.15rem 0.6rem' }}>
              Required attendee not ticked
            </span>
          )}
        </div>

        {open && renderAttendance(session)}
      </div>
    )
  }

  function renderPicker(dpId) {
    const templates = METHOD_SESSIONS[dpId] || []
    const used = new Set((byDp[dpId] || []).map((s) => (s.title || '').trim()))
    return (
      <div style={{ border: `1px dashed ${C.cyan}`, borderRadius: 10, padding: '0.8rem 0.9rem', marginBottom: '0.6rem' }}>
        <div style={{ ...mono, marginBottom: '0.5rem' }}>Sessions the method specifies here</div>
        {templates.length === 0 ? (
          <div style={hint}>The guide does not specify sessions for this stage. Add a session and set the room.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {templates.map((t) => {
              const already = used.has(t.title)
              const k = kindDef(t.kind)
              return (
                <div key={t.title} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 340px' }}>
                    <div style={{ fontSize: '1.01rem', color: C.navy, fontWeight: 600 }}>{t.title}</div>
                    <div style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.82rem', color: k ? k.color : C.slate }}>
                      {k ? k.l : 'Room not set'}{t.mins ? ` . ${durationLabel(t.mins)}` : ''}
                    </div>
                    <div style={{ ...hint, marginTop: '0.15rem' }}>{t.purpose}</div>
                  </div>
                  <button type="button"
                    style={already ? { ...ghostBtn, opacity: 0.5, cursor: 'default' } : ghostBtn}
                    disabled={already || busy}
                    onClick={() => addSession(dpId, t)}
                  >
                    {already ? 'In the plan' : '+ Add'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ marginTop: '0.7rem', display: 'flex', gap: '0.5rem' }}>
          <button type="button" style={ghostBtn} onClick={() => addSession(dpId, null)} disabled={busy}>+ Blank session</button>
          <button type="button" style={ghostBtn} onClick={() => setPickerDp(null)}>Close</button>
        </div>
      </div>
    )
  }

  const groups = [...DPS, { id: '__unassigned', label: 'Not yet assigned to a decision point' }]

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
        <div>
          <div style={secH}>Session Plan</div>
          <div style={{ ...hint, marginTop: '0.25rem' }}>
            Every session in the engagement, grouped by decision point, with the room the
            method puts it in. Choosing a room sets the attendees the method requires, and
            the plan flags a session where a required attendee is missing.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {p && (
            <span style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.87rem', color: p.color, border: `1px solid ${p.color}`, borderRadius: 999, padding: '0.15rem 0.6rem' }}>
              {p.text}
            </span>
          )}
          {canManage && pendingCount > 0 && <button type="button" style={solidBtn} onClick={saveAll}>Save</button>}
        </div>
      </div>

      {err && <div style={{ fontSize: '1.01rem', color: C.red, margin: '0.5rem 0' }}>{err}</div>}

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '0.85rem 0 1.1rem' }}>
        {KINDS.map((k) => (
          <div key={k.v} style={{ borderTop: `3px solid ${k.color}`, background: C.alt, borderRadius: 8, padding: '0.45rem 0.75rem', minWidth: 132 }}>
            <div style={mono}>{k.l}</div>
            <div style={{ fontFamily: 'var(--cv-font)', fontSize: '1.4rem', fontWeight: 700, color: k.color, lineHeight: 1.1 }}>
              {sessions.filter((s) => s.session_kind === k.v).length}
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={hint}>Loading the session plan...</div>
      ) : (
        groups.map((g) => {
          const list = byDp[g.id] || []
          if (!list.length && !canManage) return null
          if (g.id === '__unassigned' && !list.length) return null
          return (
            <div key={g.id} style={{ marginBottom: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                <div style={{ fontFamily: 'var(--cv-font)', fontSize: '1.1rem', fontWeight: 700, color: C.navy }}>
                  {g.label}
                  <span style={{ ...mono, marginLeft: '0.6rem' }}>{list.length} session{list.length === 1 ? '' : 's'}</span>
                </div>
                {canManage && g.id !== '__unassigned' && (
                  <button type="button" style={ghostBtn} onClick={() => setPickerDp(pickerDp === g.id ? null : g.id)}>
                    {pickerDp === g.id ? 'Close' : '+ Add session'}
                  </button>
                )}
              </div>

              {canManage && pickerDp === g.id && renderPicker(g.id)}

              {list.length === 0 ? (
                <div style={{ ...hint, border: `1px dashed ${C.border}`, borderRadius: 8, padding: '0.7rem 0.9rem' }}>
                  No sessions planned here yet.
                </div>
              ) : (
                list.map((s) => renderSession(s))
              )}
            </div>
          )
        })
      )}

      {!canManage && sessions.length > 0 && (
        <div style={{ ...hint, marginTop: '0.7rem' }}>Read only. Ask the engagement coach to edit the plan.</div>
      )}
    </div>
  )
}
