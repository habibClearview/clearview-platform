// ============================================================
// WHAT EACH ZONE IS FOR
//
// WHY THIS EXISTS. Opening a zone showed the tools and nothing else: a set of
// tables with no statement of what the zone is trying to settle or what has to
// exist before it can close. The person running the session then had to
// remember it, or go and find the delivery document, in front of the room.
//
// The answers were already written down. Every line below is lifted from
// docs/gtcv/gtcv-method-reference.md, which is itself taken from the Handbook
// and the two workbooks. Nothing here is invented, and nothing here is a
// second opinion about the method: if the reference changes, this changes with
// it and the screen follows.
//
// THREE THINGS PER ZONE, and they are the three the method itself gives:
//   question  the one thing the zone exists to settle
//   outputs   what has to exist before it can close. This is also the answer
//             to "what evidence does this gate want", which until now was
//             nowhere on the screen.
//   signal    how you know the answer is real rather than agreed to be polite.
//             The method calls this the signal of genuine completion, and it
//             is the most useful line in the room.
//
// The signal is deliberately kept in the same words the method uses, including
// where those words are an observation about a team's behaviour rather than a
// test that can be ticked.
// ============================================================

export interface ZoneBrief {
  /** The one question the zone exists to settle. */
  question: string
  /** What has to exist before the gate can close. */
  outputs: string[]
  /** How you know the answer is real. */
  signal: string
}

export const ZONE_BRIEFS: Record<string, ZoneBrief> = {
  setup: {
    question: 'Is this engagement ready to start, and does everyone agree what it is?',
    outputs: [
      'The parties named, with whoever signs each gate identified',
      'The Charter issued and signed by every signatory',
      'The deliverables and their payment milestones recorded against the contract',
    ],
    signal: 'The Charter is signed by all parties without anyone qualifying what they are signing.',
  },
  phase_0: {
    question: 'What are we actually operating on, and which assumptions have commercial signal?',
    outputs: [
      'Continue, Pause or Kill recorded against every activity',
      'A named problem owner and budget holder on every hypothesis that proceeds',
    ],
    signal: 'The team pauses silently before classifying an activity.',
  },
  dp01: {
    question: 'What do we actually deliver, and what exists only because of the grant?',
    outputs: [
      'Service Inventory, separating grant logic from market logic',
      'Hidden Cost Map',
      'Stop, Pause and Redesign Register',
    ],
    signal: 'The leadership team will share the Stop/Pause/Redesign Register with its board, and the debate about it is honest.',
  },
  dp02: {
    question: 'Who will pay, for what problem, and how do we know?',
    outputs: [
      'At least two named segments, each with urgency and a named budget holder',
      'Three-Stage Adoption Test for each segment',
      'Budget Access Map',
    ],
    signal: 'At least one assumption about the customer profile has been changed by real conversations.',
  },
  dp03: {
    question: 'Why does this matter to this client, and can we prove it?',
    outputs: [
      'A four-part value proposition per segment, tested with clients and signed',
    ],
    signal: 'The leadership team signs it off without qualifying, and the revision is shorter and more specific than the draft.',
  },
  dp04: {
    question: 'Does this sustain the organisation, with numbers that hold?',
    outputs: [
      'A working model covering the five cost categories',
      'A price floor, and at least two pricing tiers',
      'Break-even',
      'A market reference drawing on at least three sources',
      'The model operable by non-technical staff',
    ],
    signal: 'A non-technical member of staff updates the model and says "I can do this".',
  },
  dp05: {
    question: 'The right clients, the right message, the right channels, in the right order?',
    outputs: [
      'Priority Client List',
      'A/B tested messaging, with the winner at least 50 per cent higher in response',
      'Service Brief',
      'A live Pipeline Tracker, and a launch date',
    ],
    signal: 'The leadership team names the launch date without hesitating.',
  },
  dp06: {
    question: 'Who are we, and who stands with us?',
    outputs: [
      'A two-sentence Commercial Identity Statement',
      'Partner Type Map',
      'Positioning',
      'The Commercial Vehicle option considered',
    ],
    signal: 'The leadership team uses the Identity Statement spontaneously, without being prompted.',
  },
  dp07: {
    question: 'Does the model work under real conditions?',
    outputs: [
      'Two iterations across two real clients: the first consultant-led, the second led by the organisation',
      'Revision Log',
      'Comparative Analysis',
      'Pilot Learning Summary',
      'A mid-point diagnostic sent to the funder',
    ],
    signal: 'The leadership team makes a revision the coach did not identify, and is proud enough of the summary to share it.',
  },
  dp08: {
    question: 'What does growth look like, and what does it need?',
    outputs: [
      'Scale Pathway Map covering at least two segments, with independent channels',
      'A 36-month projection across three scenarios',
      'A Scale Pathway Commitment approved by the board',
    ],
    signal: 'The leadership team cites the Scale Commitment when making a decision nobody planned for.',
  },
  dp09: {
    question: 'Where are we, and what does the evidence show?',
    outputs: [
      'The Commercial Readiness Diagnostic scored three times: baseline, mid-point and close',
      'Close Investment Case',
      'A Handover Presentation given unassisted',
    ],
    signal: 'The organisation shares the Investment Case with a funder and gets a follow-up request.',
  },
  handover: {
    question: 'Can the organisation run this without us?',
    outputs: [
      'Financial model: the finance lead updates a cost item and recalculates break-even live, unassisted',
      'Value proposition: a leadership team member presents it unscripted and handles two challenge questions',
      'Commercial model: the team explains pricing rationale, cost floor and break-even to a non-specialist',
      'Pipeline: the team names the top three clients, their stage, last action, and next action with a date',
      'Scale pathway: the team presents entry and scale segments, independent channel logic and the sustainability threshold, unprompted',
    ],
    signal: 'The engagement closes when the organisation can operate independently, not when the months are up.',
  },
}

/** The brief for a zone, or null where the method does not define one. */
export function zoneBrief(gateId: string): ZoneBrief | null {
  return ZONE_BRIEFS[gateId] ?? null
}
