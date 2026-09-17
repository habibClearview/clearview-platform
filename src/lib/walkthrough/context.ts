// ============================================================
// WHAT THE WALKTHROUGH KNOWS ABOUT AN ENGAGEMENT.
//
// The reference build reads eight values off the end of its own web address so
// that one file can be shown as a generic explanation or as a named client's
// version. Nothing else in it changes. That is deliberately the whole seam, so
// the product works the same way: one component, one context object, two modes.
//
// Everything here is wording that is going on a screen in front of a funder, so
// every field has a fallback that reads as a sentence. An engagement with no
// funder recorded says "the funder", not an empty gap, and never a placeholder
// that looks like a mistake.
// ============================================================

/** Everything the walkthrough needs in order to speak about one engagement. */
export interface WalkthroughContext {
  /** Who is paying for the programme. Screens 1, 8, 15, 16 and 19. */
  funder: string
  /** The organisation being coached, as it is said in a sentence. */
  org: string
  /** The service being commercialised, as it is said in a sentence. */
  service: string
  /** The same, empty when the engagement has not named one. The three
   *  questions need to know the difference: a named service reads "the gender
   *  and nutrition service" and an unnamed one reads "this service". */
  serviceGiven: string
  /** The programme this engagement sits under. The eyebrow on screen 1. */
  programme: string
  /** The line under the title in the header. */
  prepared: string
  /** Who pays for the service. One sentence on screen 9, omitted when empty. */
  market: string
  /** How the last screen refers to the end of the engagement. */
  close: string
  /** How the last screen refers to the funder's other organisations. */
  portfolio: string
  /** True when this is a named engagement rather than the generic version. */
  named: boolean
  /** The engagement's timeline, or null when there are no contract dates. */
  timeline: WalkthroughTimeline | null
  /** Where screen 18 sends the presenter. Empty means no button is drawn. */
  workspaceUrl: string
}

export interface WalkthroughMilestone {
  title: string
  detail: string
}

export interface WalkthroughTimeline {
  /** The contract start, written the way the axis shows it. */
  start: string
  /** The middle label on the axis. */
  middle: string
  /** The contract end. */
  end: string
  /** How long the engagement runs, for the heading. */
  span: string
  milestones: WalkthroughMilestone[]
}

/** What each field says when the engagement has not recorded it. */
export const FALLBACK = {
  funder: 'the funder',
  org: 'the organisation',
  service: 'the service',
  close: 'At close',
  portfolio: 'your portfolio',
  prepared: 'How the work runs',
} as const

/** The generic walkthrough: no client data, and it says so in every sentence. */
export const GENERIC_CONTEXT: WalkthroughContext = {
  funder: FALLBACK.funder,
  org: FALLBACK.org,
  service: FALLBACK.service,
  serviceGiven: '',
  programme: '',
  prepared: FALLBACK.prepared,
  market: '',
  close: FALLBACK.close,
  portfolio: FALLBACK.portfolio,
  named: false,
  timeline: null,
  workspaceUrl: '',
}

/** A capital first letter, for a name at the start of a sentence. */
export function cap(s: string): string {
  const t = String(s ?? '')
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t
}

/**
 * The header's second line. A named engagement says who it is for; the generic
 * version says what it is.
 */
export function preparedLine(funder: string, org: string, programme: string): string {
  const named = [funder, org].filter(Boolean)
  if (named.length === 2) {
    const line = `Prepared for ${cap(funder)} and ${cap(org)}`
    return programme ? `${line} · ${programme}` : line
  }
  if (named.length === 1) {
    const line = `Prepared for ${cap(named[0])}`
    return programme ? `${line} · ${programme}` : line
  }
  return FALLBACK.prepared
}

/** Blank, whitespace and the string "null" all count as not recorded. */
function clean(v: unknown): string {
  const s = String(v ?? '').trim()
  return s === 'null' || s === 'undefined' ? '' : s
}

/**
 * Build the context from whatever the engagement has recorded. Anything
 * missing falls back to wording that still reads as a sentence, which is why
 * this never returns an empty string for the three names.
 */
export function buildContext(input: {
  funder?: string | null
  org?: string | null
  service?: string | null
  programme?: string | null
  market?: string | null
  close?: string | null
  portfolio?: string | null
  timeline?: WalkthroughTimeline | null
  workspaceUrl?: string | null
}): WalkthroughContext {
  const funder = clean(input.funder)
  const org = clean(input.org)
  const service = clean(input.service)
  const programme = clean(input.programme)
  return {
    funder: funder || FALLBACK.funder,
    org: org || FALLBACK.org,
    service: service || FALLBACK.service,
    serviceGiven: service,
    programme,
    prepared: preparedLine(funder, org, programme),
    market: clean(input.market),
    close: clean(input.close) || FALLBACK.close,
    portfolio: clean(input.portfolio) || FALLBACK.portfolio,
    named: !!(funder && org),
    timeline: input.timeline ?? null,
    workspaceUrl: clean(input.workspaceUrl),
  }
}
