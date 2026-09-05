// ============================================================
// THE ENGAGEMENT BRIEF
//
// What a signed Scope of Work and Purchase Order tell you, held in one place
// so the welcome email, the Charter and the engagement screens can all say the
// same thing without anybody retyping it.
//
// WHY IT LIVES IN engagement_config.brand_overrides.brief RATHER THAN ITS OWN
// TABLE. Not because that is where it belongs — it is not — but because a new
// table needs a migration run against production, and the Supabase token in
// this environment is refused. brand_overrides is jsonb, engagement_config is
// created by /api/engagement-setup for every engagement, and a namespaced key
// inside it collides with nothing. When a migration can be run, this moves to
// engagement_brief and briefFromConfig is the only thing that has to change.
//
// THE TWO CLIENTS ARE NOT THE SAME CLIENT. A programme can pay for work
// delivered to a different organisation — Tanager pays for the work done with
// Ikore under IGNITE+ — and both of them read the welcome. Conflating them
// tells the payer they are about to do the exercises and tells the served
// organisation they are about to be invoiced.
// ============================================================

/** The four services, matching service_engagements.service_type. */
export const SERVICE_TYPES = ['canvas', 'financial', 'advisory', 'portfolio_intelligence'] as const
export type ServiceType = (typeof SERVICE_TYPES)[number]

export const SERVICE_LABEL: Record<ServiceType, string> = {
  canvas: 'Grant-to-Commercial Viability',
  financial: 'Clearview financial model',
  advisory: 'Advisory',
  portfolio_intelligence: 'Portfolio Intelligence',
}

/** One line saying what each service actually delivers, for the welcome. */
export const SERVICE_SUMMARY: Record<ServiceType, string> = {
  canvas:
    'Nine Decision Points worked in order, each one closing only when the evidence behind it holds and the people who have to sign it have signed.',
  financial:
    'A financial model with the actuals recorded against it, and the statements that come out of them.',
  advisory:
    'Structured advisory support, recorded against the engagement so the reasoning survives the meeting.',
  portfolio_intelligence:
    'Portfolio-level intelligence across the engagements in the programme.',
}

export interface EngagementBrief {
  /** Who pays. The organisation on the purchase order. */
  payerName?: string
  /** The programme the work sits under, if any. */
  payerProgramme?: string
  /** Who the work is delivered to. Defaults to the engagement's own client. */
  servedName?: string
  /** Which of the four services this engagement is. */
  services?: ServiceType[]
  /** Period of performance, as the purchase order states it. */
  periodStart?: string
  periodEnd?: string
  /** The contract or ToR this came from, e.g. "Purchase Order 149". */
  reference?: string
  /** The deliverables the ToR lists, in its own words. */
  deliverables?: string[]
  /**
   * Habib's own opening line. The generated welcome is correct but it is not
   * his voice, and the first thing a new client reads should be. Empty means
   * the generated opening stands.
   */
  welcomeIntro?: string
}

const CAP = { text: 300, list: 20, item: 400, intro: 2000 }

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim().slice(0, max)
  return s || undefined
}

/** A date the purchase order stated, or nothing. Never a guess. */
function isoDate(v: unknown): string | undefined {
  const s = str(v, 40)
  if (!s) return undefined
  const t = Date.parse(s)
  return Number.isFinite(t) ? s : undefined
}

/**
 * Read a brief out of whatever is stored, believing none of it. The column is
 * jsonb written by an authorised route, but a value that is the wrong shape is
 * a value that would render as "undefined" in an email to a client.
 */
export function briefFromConfig(brandOverrides: unknown): EngagementBrief {
  const raw = (brandOverrides as { brief?: unknown } | null)?.brief
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const b = raw as Record<string, unknown>
  const services = Array.isArray(b.services)
    ? (b.services.filter((s): s is ServiceType =>
        typeof s === 'string' && (SERVICE_TYPES as readonly string[]).includes(s)))
    : undefined
  const deliverables = Array.isArray(b.deliverables)
    ? b.deliverables.map((d) => str(d, CAP.item)).filter((d): d is string => !!d).slice(0, CAP.list)
    : undefined
  return {
    payerName: str(b.payerName, CAP.text),
    payerProgramme: str(b.payerProgramme, CAP.text),
    servedName: str(b.servedName, CAP.text),
    services: services && services.length ? Array.from(new Set(services)) : undefined,
    periodStart: isoDate(b.periodStart),
    periodEnd: isoDate(b.periodEnd),
    reference: str(b.reference, CAP.text),
    deliverables: deliverables && deliverables.length ? deliverables : undefined,
    welcomeIntro: str(b.welcomeIntro, CAP.intro),
  }
}

/** Merge a brief into an existing brand_overrides object without losing the rest of it. */
export function briefIntoConfig(brandOverrides: unknown, brief: EngagementBrief): Record<string, unknown> {
  const base = (brandOverrides && typeof brandOverrides === 'object' && !Array.isArray(brandOverrides))
    ? { ...(brandOverrides as Record<string, unknown>) }
    : {}
  base.brief = briefFromConfig({ brief })
  return base
}

/** "7 September 2026 to 15 March 2027", or nothing when the dates are not both known. */
export function periodInWords(brief: EngagementBrief): string | undefined {
  const fmt = (iso?: string) => {
    if (!iso) return undefined
    const d = new Date(iso)
    if (!Number.isFinite(d.getTime())) return undefined
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  }
  const a = fmt(brief.periodStart)
  const b = fmt(brief.periodEnd)
  if (a && b) return `${a} to ${b}`
  return a || b
}

/**
 * WHO SEES WHAT, IN THE WORDS THE READER NEEDS.
 *
 * The payer and the served organisation get the same email and must not get the
 * same paragraph: one is doing the work, the other is watching it and paying
 * for it. This returns the access lines for a given audience.
 */
export function accessLines(audience: 'payer' | 'served'): string[] {
  if (audience === 'payer') {
    return [
      'The progress report at each Decision Point, signed off before it reaches you',
      'Every Decision Point and the evidence behind it, read only',
      'A comment on anything you want to question, answered on the record',
      'Sight of the live sessions as they run, and an invitation to join any remote one',
    ]
  }
  return [
    'The whole engagement on one canvas, and where the work stands on each Decision Point',
    'The Engagement Charter to read, comment on, and sign when it is issued',
    'The working sessions, from a link sent for each one',
    'Your Executive Director signs off each Decision Point once the work behind it holds',
  ]
}

/**
 * The three things that happen first, in order. Written here rather than in the
 * email builder because the Charter and the engagement screens say it too, and
 * a client told two different orders trusts neither.
 */
export function openingSequence(brief: EngagementBrief): string[] {
  const payer = brief.payerName
  const served = brief.servedName
  const both = payer && served ? `${payer} and ${served}` : (payer || served || 'both organisations')
  return [
    `A first meeting with ${both} together, to answer the pre-engagement questions. Those answers decide whether the engagement starts, so it is the one meeting nothing moves without.`,
    'The inception meeting, where the Engagement Charter is agreed and signed and the rhythm of the work is set.',
    'Then the Decision Points in order, each one signed off before the next opens, with a progress report at every one.',
  ]
}
