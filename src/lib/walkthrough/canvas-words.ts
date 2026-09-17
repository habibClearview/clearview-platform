// ============================================================
// THE CANVAS SPEAKS WITH CLEARVIEW'S WORDS.
//
// The walkthrough draws the same eleven decisions the coach and the client see
// inside ClearView, so it must not carry its own copy of their names. It reads
// them from src/lib/gtcv-blocks.ts, which is the one definition the journey
// canvas, the showcase link and the deliverable mapping already share. Rename a
// decision point there and it is renamed here, with nothing else to remember.
//
// What is NOT read from there is the narrative: who leads each decision, what
// it produces, and what the funder receives. That wording is the approved
// reference's, because ClearView does not hold a sentence for it.
//
// TWO SHORT FORMS ARE KEPT ON PURPOSE.
//   The tile badge says "DP 01", not "Decision Point 1". The badge is a chip
//   inside a fixed 280 by 160 box that also carries the name, the question, the
//   fit test and four progress dots; the full label does not fit and would run
//   under the dots. Every place with room for it, the narration panel, the
//   explore detail and the screen list on the remote, says "Decision Point 1".
//   On phones the tiles use the reference's short names, because at 120 pixels
//   wide "Organisational Identity & Partner Architecture" is unreadable.
// ============================================================
import { BLOCK, SPINE, dpLabel } from '@/lib/gtcv-blocks'

/** The four column colours, by the reference's own names for them. */
export type ColourKey = 'gold' | 'slate' | 'cyan' | 'lav'

/** ClearView's column tint class, translated to the walkthrough's colour key. */
const COLOUR_OF: Record<string, ColourKey> = {
  'c-gold': 'gold',
  'c-navy': 'slate',
  'c-teal': 'cyan',
  'c-purple': 'lav',
}

export interface CanvasEntry {
  /** The column colour, absent on the two book-end steps. */
  c?: ColourKey
  /** The badge on the tile. */
  num: string
  /** The full name, from ClearView. */
  name: string
  /** The short name used on phones. */
  tiny?: string
  /** The zone word printed beside the badge, where there is one. */
  kind?: string
  /** The question shown on the tile, clamped to two lines. */
  short: string
  /** Where this sits, in the explore detail's eyebrow. */
  col: string
  /** Who leads the work. Reference wording. */
  lead: string
  /** The fit test and its colour. */
  fit?: [string, ColourKey]
  /** The central question, in full. */
  q: string
  /** What the decision produces. Reference wording. */
  out: string
}

/** The zone words the tile prints beside the badge. Threshold is not printed. */
const PRINTED_ZONES = ['Transition', 'Diagnostic spine']

/** The short names used on phones, from the approved reference. */
const TINY: Record<string, string> = {
  d3: 'Value Proposition',
  d6: 'Identity & Partners',
  d7: 'Pilot & Learn',
  d8: 'Scale & Expansion',
  d9: 'Readiness Diagnostic',
}

/** dp01 in ClearView is d1 on the canvas drawing. */
const BLOCK_OF: Record<string, string> = {
  d1: 'dp01', d2: 'dp02', d3: 'dp03', d4: 'dp04', d5: 'dp05',
  d6: 'dp06', d7: 'dp07', d8: 'dp08', d9: 'dp09',
}

/** "DP 01" for the badge, from the decision point's own number. */
function badge(key: string): string {
  const id = BLOCK_OF[key]
  return id ? 'DP ' + id.slice(2) : ''
}

function entryFor(key: string): CanvasEntry {
  const b = BLOCK[BLOCK_OF[key]]
  const colour = COLOUR_OF[b.color] || 'cyan'
  const zone = PRINTED_ZONES.includes(b.sublab) ? b.sublab : undefined
  return {
    c: colour,
    num: badge(key),
    name: b.title,
    tiny: TINY[key],
    kind: b.sublab === 'Threshold' ? 'Threshold' : zone,
    short: key === 'd9' ? '' : b.q,
    col: b.sublab,
    lead: LEADS[key],
    // The spine carries no fit tag. It is 82 pixels tall and already holds the
    // four stage scale, three readings and its own name; a tag sits on top of
    // the name. Its fit test is named on screen 13 instead, with the other five.
    fit: key === 'd9' ? undefined : [b.fit, colour],
    q: b.q,
    out: OUTPUTS[key],
  }
}

/**
 * Who leads each decision. The reference's wording: ClearView records who
 * attends a session but has no sentence for who leads a decision point.
 */
const LEADS: Record<string, string> = {
  cg: 'Coach leads',
  d1: 'Coach leads',
  d2: 'Coach leads',
  d3: 'Coach designs, organisation builds',
  d4: 'Coach designs, organisation builds',
  d5: 'Coach designs, organisation builds',
  d6: 'Coach designs, organisation builds',
  d7: 'Iteration 1 coach-led, Iteration 2 organisation-led',
  d8: 'Organisation operates, coach reviews',
  d9: 'Read three times',
  ho: 'Organisation presents, coach confirms',
}

/** What each decision produces. The reference's wording. */
const OUTPUTS: Record<string, string> = {
  cg: 'Every assumption written down and sorted, using five tools: the Assumption Dump Canvas, the Problem, Owner and Budget Matrix, the Hypothesis Shortlist Board, the Signal vs Story Board, and the Continue, Pause or Kill Table. The baseline readiness reading is taken here.',
  d1: 'A clear, honest inventory: services with real market demand, separated from those that exist only because a grant funds them.',
  d2: 'Named customer segments with documented problem urgency and confirmed willingness to engage commercially.',
  d3: 'A client-tested value proposition for each service bundle, compelling to the identified paying customer.',
  d4: 'A working financial model with at least two pricing tiers, break-even calculated, and the cost-recovery threshold documented.',
  d5: 'A segmented outreach plan with tested messaging, client-facing materials, and a prioritised pipeline of target organisations.',
  d6: 'A clear commercial identity statement and a partner map that reinforces market positioning.',
  d7: 'Two rounds of live client engagement with documented feedback, service revisions, and evidence of what holds.',
  d8: 'A documented scale pathway naming at least two expansion segments and the channel logic for reaching them independently.',
  d9: `A readiness reading at kick-off, mid-point and close, on six fit tests, placed on four stages: ${SPINE.stages.map((s) => s.label).join(', ').replace(/, ([^,]*)$/, ' and $1')}.`,
  ho: 'A one-page written handover record, confirmed against five elements: the financial model, the value proposition, the outreach process, the client management process and the commercial identity.',
}

/** The order the canvas draws them in, book-ends included. */
export const ORDER = ['cg', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'ho'] as const

/** The eleven chips along the bottom, in the same order. */
export const CHIP: Record<string, string> = {
  cg: 'CG', d1: '01', d2: '02', d3: '03', d4: '04', d5: '05',
  d6: '06', d7: '07', d8: '08', d9: '09', ho: 'HO',
}

/** The three column bars, with ClearView's names in the reference's case. */
export const COLUMN_BARS: [string, string, string][] = [
  ['Internal capability', '#D9B268', '#0F1A2B'],
  ['Connecting layer', '#445C87', '#EEF2F8'],
  ['External market', '#70E8E9', '#0F1A2B'],
]

/** The four readiness stages, from ClearView, with the reference's colours. */
export const SCALE: [string, string, string][] = [
  [SPINE.stages[0].label, '#D9B268', '#0F1A2B'],
  [SPINE.stages[1].label, '#496D71', '#EEF2F8'],
  [SPINE.stages[2].label, '#70E8E9', '#0F1A2B'],
  [SPINE.stages[3].label, '#457B3C', '#EEF2F8'],
]

/** The six fit tests, from ClearView, for the closing reading. */
export const FIT_TESTS: string[] = SPINE.fits.map((f) => f.t)

/** "Decision Point 1", wherever there is room to say it in full. */
export function fullLabel(key: string): string {
  if (key === 'cg') return 'Clearing the ground'
  if (key === 'ho') return 'Handover'
  return dpLabel(BLOCK_OF[key] || key)
}

/** Everything the canvas needs to say, keyed the way the drawing keys it. */
export const INFO: Record<string, CanvasEntry> = {
  cg: {
    num: 'Before',
    name: 'Clearing the ground',
    short: 'What have we assumed, and what have we tested?',
    col: 'Before the canvas opens',
    lead: LEADS.cg,
    q: 'Which beliefs about what the service does, who benefits and who pays have been tested with real customers, and which have not?',
    out: OUTPUTS.cg,
  },
  d1: entryFor('d1'),
  d2: entryFor('d2'),
  d3: entryFor('d3'),
  d4: entryFor('d4'),
  d5: entryFor('d5'),
  d6: entryFor('d6'),
  d7: entryFor('d7'),
  d8: entryFor('d8'),
  d9: entryFor('d9'),
  ho: {
    num: 'At close',
    name: 'Handover',
    short: 'Can the organisation run the model alone?',
    col: 'At close',
    lead: LEADS.ho,
    q: 'Can the organisation operate its commercial model without the coach?',
    out: OUTPUTS.ho,
  },
}
