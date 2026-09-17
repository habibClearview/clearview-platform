// ============================================================
// THE ENGAGEMENT CHARTER, AS TEN NUMBERED SECTIONS
//
// Habib rewrote the Charter on 17 September 2026. The old one was six sections
// of principle: what the method rests on, what it asks, who owns what. Good to
// read once and impossible to hold anybody to. The new one is an agreement:
// who commits what, how a decision is made, how a decision is CHANGED, what
// the funder sees, and when the engagement is finished.
//
// WHY THE SHAPE CHANGED. The old section 2 listed roles by seniority and asked
// for "senior engagement". This one names roles by function and asks each for a
// specific act and a time commitment, because an agreement that says "senior
// engagement" commits nobody to anything. Roles are named by function and never
// by headcount: an organisation with one person doing finance and outreach
// signs the same charter as one with two.
//
// FIXED COPY AND FIELDS. Everything here is the same for every engagement.
// Anything in square brackets in Habib's specification is a FIELD, filled in
// per engagement and editable by the coach, and those are listed beside each
// section as `fields` rather than written into the sentences. The screen and
// the downloaded document both read this file, so a signed copy cannot say
// something different from the screen somebody signed.
//
// {organisation}, {service} and {funder} are filled in from the engagement by
// src/lib/engagement-words.ts, so the Charter and the Three Questions name the
// same things the same way.
// ============================================================

export interface CharterField {
  /** Stored under this key on the engagement's charter record. */
  key: string
  /** What the coach sees above the box. */
  label: string
  /** 'text' is one line, 'lines' is a list, 'table' is the section's own table. */
  kind: 'text' | 'lines' | 'date' | 'number' | 'table'
}

export interface CharterSection {
  number: number
  title: string
  /** Fixed sentences, in order. {organisation}, {service} and {funder} fill in. */
  body: string[]
  fields?: CharterField[]
  /** Shown only when at least one of its fields is filled in. */
  optional?: boolean
}

/**
 * Who commits what.
 *
 * The coach may add, remove and rename rows, so these are the starting rows
 * rather than the only ones. Time committed is a field on every row because an
 * agreement without it is a list of good intentions.
 */
export const CHARTER_ROLES = [
  {
    role: 'Chief executive',
    commits: 'Answers the three questions at Set Up, attends the session that closes each decision point, and signs or returns each decision within the agreed window.',
  },
  {
    role: 'Service lead',
    commits: 'Owns the service content and the client relationships used in validation and pilots.',
  },
  {
    role: 'Finance lead',
    commits: 'Builds and runs the financial model from Decision Point 04 onwards.',
  },
  {
    role: 'Business development lead',
    commits: 'Owns outreach and the pipeline from Decision Point 05 onwards.',
  },
  {
    role: 'Lead practitioner (coach)',
    commits: 'Designs and facilitates each decision point, holds the evidence standard, and prepares each progress report.',
  },
  {
    role: 'Co-implementer',
    commits: 'Provides in-country continuity between sessions.',
  },
  {
    role: 'Funder',
    commits: 'Reviews this charter before it is signed, reads the record, and comments at any decision point.',
  },
]

/** The five elements independence is confirmed on at close. */
export const INDEPENDENCE_ELEMENTS = [
  'the financial model',
  'the value proposition',
  'the outreach process',
  'the client management process',
  'the commercial identity',
]

export const CHARTER_SECTIONS: CharterSection[] = [
  {
    number: 1,
    title: 'What this engagement is for',
    body: [
      'This charter records how {organisation} and the coach will commercialise {service}, what each party commits, and how decisions are made, recorded and changed.',
    ],
    fields: [
      { key: 'organisation', label: 'Organisation', kind: 'text' },
      { key: 'service', label: 'Service', kind: 'text' },
      { key: 'funder', label: 'Funder', kind: 'text' },
      { key: 'start_date', label: 'Start date', kind: 'date' },
      { key: 'end_date', label: 'End date', kind: 'date' },
      { key: 'contracted_outputs', label: 'Contracted outputs', kind: 'lines' },
    ],
  },
  {
    number: 2,
    title: 'Who is involved and what each commits',
    body: [],
    fields: [{ key: 'roles', label: 'Role, Commits to, Time committed', kind: 'table' }],
  },
  {
    number: 3,
    title: 'How the work runs',
    body: [
      'The work moves through eleven decision points in order: Clearing the Ground, the nine decision points on the canvas, and Handover.',
      'A decision point opens only when the one before it is signed.',
      'Working sessions take place in person and remotely, and ClearView is the single record of the work.',
    ],
    fields: [
      { key: 'in_person_visits', label: 'In-person visits', kind: 'text' },
      { key: 'remote_rhythm', label: 'Remote session rhythm', kind: 'text' },
    ],
  },
  {
    number: 4,
    title: 'How decisions are made',
    body: [
      'Each decision point closes in four steps.',
      'Evidence: the working output the decision rests on is uploaded.',
      'Decision: a written recommendation is set against that evidence.',
      'Sign-off: the chief executive signs, or returns the decision with reasons.',
      'Record: the signed decision, its evidence and the progress report become visible to the funder.',
      'If a decision is not signed or returned within this window, the coach raises it with the chief executive and notes the delay on the record.',
    ],
    fields: [{ key: 'signoff_window_days', label: 'Sign-off window in working days', kind: 'number' }],
  },
  {
    number: 5,
    title: 'How decisions change',
    body: [
      'Any party may bring new evidence that affects a signed decision.',
      'The coach reopens the decision point, the revised decision is evidenced and signed again, and the original decision stays on the record with the reason it changed.',
      'Later decision points that depend on it are reviewed and the review is noted.',
    ],
  },
  {
    number: 6,
    title: 'What the funder sees and does',
    body: [
      'The funder has read-only access to each progress report and its supporting evidence, can comment on the record, can request an invitation to any remote working session, and can add team members.',
    ],
  },
  {
    number: 7,
    title: 'How progress is measured',
    body: [
      'Commercial readiness is read three times on six fit tests: at the start, at the mid-point after Decision Point 06, and at close.',
    ],
  },
  {
    number: 8,
    title: 'Handover and close',
    body: [
      'The engagement closes when {organisation} presents its commercial model without the coach and independence is confirmed on five elements: the financial model, the value proposition, the outreach process, the client management process and the commercial identity.',
      'A handover record and a close-out report complete the engagement.',
    ],
  },
  {
    number: 9,
    title: 'How this maps to the contract',
    body: [],
    optional: true,
    fields: [{ key: 'contract_map', label: 'Contract milestone, Outputs, Decision points', kind: 'table' }],
  },
  {
    number: 10,
    title: 'Signatures',
    // THREE SIGNATURES, NOT TWO AND AN ACKNOWLEDGEMENT. 17 September 2026.
    // The specification had the funder tick "Reviewed" rather than sign.
    // Habib, on reading it back: "the charter does not have anywhere for the
    // lead coach and Tanager to sign, these are the 3 parties including Ikore
    // that must sign the charter so all parties have witness at the meeting."
    //
    // That is a different thing from a review, and the reason is in his last
    // six words. A charter signed by one party and acknowledged by another is
    // a document with one person's name on it. Signed by all three in the same
    // room, each party has witnessed the other two agreeing, and none of them
    // can later have understood it differently.
    body: [
      'All three parties sign this charter: the organisation, the coach and the funder.',
      'Signing in the same meeting means each party has witnessed the others agree to it.',
    ],
    fields: [
      { key: 'sig_chief_executive', label: 'Chief executive, for the organisation', kind: 'text' },
      { key: 'sig_lead_practitioner', label: 'Lead practitioner, for the coach', kind: 'text' },
      { key: 'sig_funder', label: 'Funder representative', kind: 'text' },
    ],
  },
]

/**
 * The three parties who must sign, by the role each is recorded under on the
 * engagement. Used to check that all three are marked as signing before the
 * charter goes out, rather than discovering it in the room.
 */
export const CHARTER_SIGNING_ROLES = [
  { role: 'lsp_ed', who: 'the organisation' },
  { role: 'lead_consultant', who: 'the coach' },
  { role: 'funder_rep', who: 'the funder' },
]

/**
 * Put this engagement's own words into a fixed sentence.
 *
 * Only these three, and each has a fallback, because a charter with a hole
 * where a name should be is a charter somebody has to ask about before they
 * can sign it.
 */
export function fillCharter(
  sentence: string,
  words: { organisation?: string | null; service?: string | null; funder?: string | null },
): string {
  return sentence
    .replace(/\{organisation\}/g, (words.organisation || '').trim() || 'the organisation')
    // The article travels with the name, so "the gender and nutrition
    // service" and "this service" both read correctly in the same sentence.
    .replace(/\{service\}/g, (words.service || '').trim() ? `the ${(words.service || '').trim()}` : 'this service')
    .replace(/\{funder\}/g, (words.funder || '').trim() || 'the funder')
}
