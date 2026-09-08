// ============================================================
// THE NINE, IN SEQUENCE
//
// The decision points as Habib describes them to a client, with the line he
// uses to say what each one settles. Written once here because both letters
// list them and the two must never drift: a funder and the organisation being
// coached reading different descriptions of the same gate is the fastest way
// to lose an argument about what was agreed.
//
// The served organisation's copy is written to them ("your services"), the
// funder's copy names the organisation ("Ikore's services"), so each line is a
// function of who is being addressed rather than two hand-maintained lists.
// ============================================================

export interface DecisionPointLine {
  name: string
  /** What it settles. `org` is the organisation being coached. */
  says: (org: string, addressed: boolean) => string
}

export const NINE_DECISION_POINTS: DecisionPointLine[] = [
  {
    name: 'Service Reality Audit',
    says: (org, you) => `which of ${you ? 'your' : `${org}'s`} services carry market logic and which carry grant logic`,
  },
  {
    name: 'Customer and Problem Clarity',
    says: () => 'the institution with budget authority, and the problem it will pay to solve',
  },
  {
    name: 'Value Proposition Architecture',
    says: () => 'why the service matters to that specific client',
  },
  {
    name: 'Commercial Viability Model',
    says: (_org, you) => `${you ? 'your ' : ''}cost structure, pricing, break-even and return`,
  },
  {
    name: 'Market Entry Design',
    says: () => 'segments, channels and outreach, tested in the market',
  },
  {
    name: 'Organisational Identity and Partner Architecture',
    says: (org) => `the commercial identity ${org} trades under and the partners it trades with`,
  },
  {
    name: 'Pilot and Learn Architecture',
    says: () => 'the model tested with real clients across two iterations',
  },
  {
    name: 'Scale and Expansion Pathway',
    says: () => 'the route beyond the founding clients',
  },
  {
    name: 'Commercial Readiness Diagnostic',
    says: (org) => `six fit tests confirming ${org} can run the model unassisted`,
  },
]

/** The three questions asked before inception, in the order they are asked. */
export const PRE_ENGAGEMENT_QUESTIONS = [
  'What does commercial success look like for your organisation in eighteen months?',
  'What is the biggest thing stopping you from earning commercial revenue right now?',
  'What would have to be true for your organisation to stop needing grant funding?',
]

export function ninePoints(org: string, addressed: boolean): string[] {
  return NINE_DECISION_POINTS.map((d) => `${d.name} — ${d.says(org, addressed)}`)
}
