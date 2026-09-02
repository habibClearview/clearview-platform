// ============================================================
// The nine decision blocks, as the method defines them.
//
// Fixed intellectual property. The same for every engagement, every client and
// every country: the question each block asks, what it does, and which fit test
// it closes on. Nothing in here is configuration, and nothing in here should
// ever be read from a database.
//
// It lives in its own module because three places need it and any two of them
// holding a copy would eventually disagree: the journey canvas the coach works
// in, the showcase link a prospect opens, and the deliverable mapping that
// reads what each gate produces. One definition, three readers.
//
// THE NINTH WAS MISSING. 2 September 2026. This file said nine in its first
// line and defined eight. The showcase loops the nine identifiers and drops
// anything it cannot find, so a prospect opening the link read "The nine
// blocks" above eight boxes, and the client journey carried a hand-written
// copy of the ninth to paper over the same hole. A block that exists in the
// method, has a tab, a gate, a workspace and a sign-off, but no entry here,
// is a gap in the one definition three readers depend on. It is defined now,
// and SPINE below carries the extra scoring detail that only it has.
// ============================================================

export interface CanvasBlock {
  /** The column tint class, from the journey canvas stylesheet. */
  color: string
  /** Which of the three columns this block sits in. */
  sublab: string
  title: string
  /** One word for the progression path, where a full title will not fit. */
  short: string
  /** The question the block exists to answer. */
  q: string
  /** What the block actually does, in the order it does it. */
  bullets: string[]
  /** The fit test the block closes on. */
  fit: string
}

export const BLOCK: Record<string, CanvasBlock> = {
  dp01: {
    color: 'c-gold', sublab: 'Internal', title: 'Service Reality Audit', short: 'Audit',
    q: 'What do we actually deliver, versus what we think we deliver?',
    bullets: [
      'Separate grant-logic services from market-logic services',
      'Identify which services have genuine demand vs donor-driven supply',
      'Surface hidden delivery costs and capability constraints',
      'Name what must stop, pause, or be redesigned before packaging',
    ],
    fit: 'Problem-Provider Fit',
  },
  dp02: {
    color: 'c-navy', sublab: 'Connecting centre', title: 'Customer & Problem Clarity', short: 'Customer',
    q: 'Who owns this problem, and will they pay to solve it?',
    bullets: [
      'Identify the paying customer with budget responsibility',
      'Test problem urgency, not just acknowledgement of the issue',
      'Separate donor-as-funder from client-as-customer',
      'Apply Three-Stage Adoption Test: willing to able to prioritised',
    ],
    fit: 'Problem-Solution Fit',
  },
  dp03: {
    color: 'c-teal', sublab: 'External', title: 'Value Proposition Architecture', short: 'Value',
    q: 'Why does this matter to this specific client, in their language?',
    bullets: [
      'Move from "what we do" to "why it matters" for this client',
      'Articulate differentiation from competitors clearly',
      'Build credibility signals and institutional trust architecture',
      'Test the proposition directly with real institutional clients',
    ],
    fit: 'Solution-Problem Owner Fit',
  },
  dp04: {
    color: 'c-gold', sublab: 'Internal', title: 'Commercial Viability Model', short: 'Viability',
    q: 'What does it cost to deliver, and what must clients pay for this to survive?',
    bullets: [
      'Map full cost structure including hidden delivery costs',
      'Explore pricing models: fee-for-service, retainer, tiered packages',
      'Break-even, ROI, and sustainability threshold analysis',
      'Build a model a non-technical person can own and update',
    ],
    fit: 'Financial Sustainability · ClearView',
  },
  dp06: {
    color: 'c-purple', sublab: 'Threshold', title: 'Organisational Identity & Partner Architecture', short: 'Identity',
    q: 'What type of commercial entity are we becoming, and who do we partner with as that entity?',
    bullets: [
      'Define identity: specialist firm, training provider, systems integrator',
      'Internal identity determines external negotiating position',
      'Map partner types: referral, co-delivery, endorsement, consortium',
      'Identify relationships that amplify vs compromise positioning',
    ],
    fit: 'Identity + Partnership',
  },
  dp05: {
    color: 'c-teal', sublab: 'External', title: 'Market Entry Design', short: 'Market',
    q: 'Which clients do we pursue first, and how do we reach them?',
    bullets: [
      'Segment and prioritise institutional client targets',
      'Define outreach channels and engagement sequence',
      'Co-create promotional materials and client-facing messaging',
      'A/B test communication approaches with real client segments',
    ],
    fit: 'Solution-Market Fit',
  },
  dp07: {
    color: 'c-navy', sublab: 'Transition', title: 'Pilot & Learn Architecture', short: 'Pilot',
    q: 'What does success look like at small scale, before committing to full delivery?',
    bullets: [
      'Iteration 1: Consultant-led, coach observes and adjusts with the organisation in real time',
      'Iteration 2: Organisation-led, coach backstops, organisation takes full ownership of delivery',
      'Document lessons from both rounds, revise service bundles accordingly',
      'Define what must be true before scaling to the wider market',
    ],
    fit: 'Solution-Pilot Fit',
  },
  dp08: {
    color: 'c-teal', sublab: 'Transition', title: 'Scale & Expansion Pathway', short: 'Scale',
    q: 'Where does this go after the engagement, and what infrastructure enables it?',
    bullets: [
      'Identify entry-point clients vs scale-pathway client segments',
      'Define investment or infrastructure that unlocks the next growth stage',
      'Regional pathway, from national to multi-country relevance',
      'Design the pilot to generate evidence the scale pathway requires',
    ],
    fit: 'Solution-Scale Channel Fit',
  },
  // Block nine runs across the whole engagement instead of sitting in one of
  // the three columns, which is why it is drawn full width. It is still a
  // block: it has a question, it produces an output, and it does not close
  // until it is signed. SPINE below adds the four stages and the six fit
  // tests, which nothing else on the canvas has.
  dp09: {
    color: 'c-teal', sublab: 'Diagnostic spine', title: 'Commercial Readiness Diagnostic', short: 'Readiness',
    q: 'Where does this organisation sit on the journey from grant-dependency to commercial viability, right now?',
    bullets: [
      'Scored at kick-off, at mid-point and at close, so the movement is the finding rather than the score',
      'All six fit tests scored with the leadership team and the funder representative present',
      'Five independence tests done unaided, or the engagement does not close',
      'Revenue against target, and the plan for the period after the engagement ends',
    ],
    fit: 'Commercial Readiness',
  },
}

// ─── The diagnostic spine's own detail ──────────────────────
// Block nine is scored rather than described, and the four stages and six fit
// tests are the scoring. They were written out inside the client journey view,
// where the showcase could not reach them, so the prospect's page and the
// client's page drew the same block two different ways. One copy, both readers.
export const SPINE = {
  title: BLOCK.dp09.title,
  q: BLOCK.dp09.q,
  stages: [
    { c: 's1', label: 'Grant-dependent' },
    { c: 's2', label: 'Commercially aware' },
    { c: 's3', label: 'Market-ready' },
    { c: 's4', label: 'Commercially viable' },
  ],
  fits: [
    { n: 'Fit 01', t: 'Problem-Provider Fit', d: 'Do we have the capability and credibility to own this problem in this market?' },
    { n: 'Fit 02', t: 'Problem-Solution Fit', d: 'Does the service solve the problem as the client experiences it, not as we describe it?' },
    { n: 'Fit 03', t: 'Solution-Problem Owner Fit', d: 'Is it designed to reach a decision-maker with budget, not the client without it?' },
    { n: 'Fit 04', t: 'Solution-Pilot Fit', d: 'Is the service testable in a real client environment within the engagement timeline?' },
    { n: 'Fit 05', t: 'Solution-Market Fit', d: 'Is there willingness to pay at a price that covers full delivery cost?' },
    { n: 'Fit 06', t: 'Solution-Scale Channel Fit', d: 'Are there channels and partnerships to carry this beyond the founding clients?' },
  ],
}

// ─── Where each block sits on the canvas ────────────────────
// The canvas is not a list, it is a Business Model Canvas layout: internal
// capability on the left, the connecting centre, the external market on the
// right, then a transition row where the model meets real customers, then the
// diagnostic across the bottom. The client page drew it that way and the
// showcase drew a plain grid, so the same method looked like two methods.
export const CANVAS_COLUMNS = [
  { key: 'internal', label: '← Internal capability' },
  { key: 'connect', label: 'Connecting layer' },
  { key: 'external', label: 'External market →' },
]

export const CANVAS_ROWS: string[][] = [
  ['dp01', 'dp02', 'dp03'],
  ['dp04', 'dp06', 'dp05'],
]

/** The two transition blocks, drawn below the three columns. */
export const TRANSITION_ROW: string[] = ['dp07', 'dp08']

export const TRANSITION_LABEL =
  'Transition row · where the model is tested with real customers, then extended'

/** The block drawn full width beneath everything else. */
export const SPINE_BLOCK_ID = 'dp09'

/** Every block in the order the canvas draws them, ninth included. */
export const CANVAS_BLOCK_IDS: string[] = [
  ...CANVAS_ROWS.flat(), ...TRANSITION_ROW, SPINE_BLOCK_ID,
]

// ─── One name for a block, everywhere ───────────────────────
// The method calls these decision points. The screen called them Decision Point 1, Decision Point 4,
// Block 7 and Decision Point 3 depending on which file drew them, and an
// engagement set up before August still carries terminology 'zone' in its
// configuration, which is why production showed a prospect one word and the
// coach another. There is one word now and it is not configurable.
export function dpNumber(id: string): number | null {
  const m = /^dp(\d{1,2})$/.exec(id || '')
  return m ? Number(m[1]) : null
}

/** "Decision Point 7", or the step's own name for the steps that are not blocks. */
export function dpLabel(id: string): string {
  const n = dpNumber(id)
  if (n) return `Decision Point ${n}`
  if (id === 'phase_0') return 'Clearing the ground'
  if (id === 'setup') return 'Engagement set up'
  if (id === 'handover') return 'Handover'
  return id
}

// ─── What happens before the first decision point, and after the last ───
// A prospect reading the showcase link needs to see that the engagement does
// not begin with Decision Point 1. Two documents are agreed and signed first,
// the ground is cleared, and an evidence library runs underneath the whole
// thing. That is most of what makes this a method rather than a workshop, and
// it was the part the link did not show.
export interface JourneyStep {
  id: string
  label: string
  what: string
  signedBy: string | null
}

export const BEFORE_THE_CANVAS: JourneyStep[] = [
  {
    id: 'charter',
    label: 'Engagement Charter',
    what: 'What each side is committing to, in writing, before any work starts: the scope, who sits in the room, what the organisation has to bring, and what closing each decision point will require of them.',
    signedBy: 'Signed by the organisation and the coach',
  },
  {
    id: 'diagnostic',
    label: 'Pre-engagement diagnostic',
    what: 'Three questions asked of the Executive Director out loud, with all parties present, and recorded in their own words: what commercial success looks like in eighteen months, what is stopping them earning revenue now, and what would have to be true to stop needing grant funding. A readiness self-assessment is scored beside them.',
    signedBy: 'Signed by the CEO, confirmed by the coach',
  },
  {
    id: 'gate',
    label: 'Both signed, or nothing opens',
    what: 'Weak answers or a readiness score below the threshold mean Decision Point 1 does not open until there has been a further conversation with the funder present. The engagement can be stopped here, and that is a result rather than a failure.',
    signedBy: null,
  },
  {
    id: 'phase_0',
    label: 'Clearing the ground',
    what: 'Every service the organisation actually runs is written down before any of it is judged: the problems each one solves, the activities that solve them, what each delivers, who pays, and the assumption underneath it.',
    signedBy: null,
  },
]

export const RUNS_UNDERNEATH: JourneyStep[] = [
  {
    id: 'evidence',
    label: 'Evidence library',
    what: 'Every decision point closes on evidence, and every piece of it is filed against the decision it supports: interview records, cost figures, pricing tests, pilot results, client verbatim. A decision without evidence behind it does not close, and the library is what the organisation keeps at the end.',
    signedBy: null,
  },
  {
    id: 'handover',
    label: 'Handover',
    what: 'Five independence tests done unaided. The organisation runs the tools without the coach in the room, or the engagement does not close.',
    signedBy: 'Signed at close',
  },
]
