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
// ============================================================

export interface CanvasBlock {
  /** The column tint class, from the journey canvas stylesheet. */
  color: string
  /** Which of the three columns this block sits in. */
  sublab: string
  title: string
  /** The question the block exists to answer. */
  q: string
  /** What the block actually does, in the order it does it. */
  bullets: string[]
  /** The fit test the block closes on. */
  fit: string
}

export const BLOCK: Record<string, CanvasBlock> = {
  dp01: {
    color: 'c-gold', sublab: 'Internal', title: 'Service Reality Audit',
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
    color: 'c-navy', sublab: 'Connecting centre', title: 'Customer & Problem Clarity',
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
    color: 'c-teal', sublab: 'External', title: 'Value Proposition Architecture',
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
    color: 'c-gold', sublab: 'Internal', title: 'Commercial Viability Model',
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
    color: 'c-purple', sublab: 'Threshold', title: 'Organisational Identity & Partner Architecture',
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
    color: 'c-teal', sublab: 'External', title: 'Market Entry Design',
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
    color: 'c-navy', sublab: 'Transition', title: 'Pilot & Learn Architecture',
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
    color: 'c-teal', sublab: 'Transition', title: 'Scale & Expansion Pathway',
    q: 'Where does this go after the engagement, and what infrastructure enables it?',
    bullets: [
      'Identify entry-point clients vs scale-pathway client segments',
      'Define investment or infrastructure that unlocks the next growth stage',
      'Regional pathway, from national to multi-country relevance',
      'Design the pilot to generate evidence the scale pathway requires',
    ],
    fit: 'Solution-Scale Channel Fit',
  },
}
