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
  /**
   * The co-implementer working alongside the lead practitioner, named in both
   * letters. Empty when the engagement is delivered by the lead alone.
   */
  coImplementer?: string
  /** The deliverables the ToR lists, in its own words. */
  deliverables?: string[]
  /**
   * Habib's own opening line, when he wants only the opening changed. Empty
   * means the generated opening stands.
   */
  welcomeIntro?: string
  /**
   * THE LETTERS THEMSELVES, EDITED. These go out over his name, so every word
   * of one has to be his to change. Each holds the full letter as plain text;
   * empty means the generated letter is used. See src/lib/letter.ts for the
   * three marks the text understands.
   */
  letterPayer?: string
  letterServed?: string
  /**
   * EVERYONE WHO GETS THE LETTER, BY NAME.
   *
   * An engagement is not two people. Tanager alone has the overall lead, the
   * procurement lead, the country representative and the finance lead for
   * invoicing, and all of them should receive it at the same time rather than
   * one of them forwarding it on. Each row carries who they are and which of
   * the two letters they get, because a funder's finance lead and the served
   * organisation's chief executive must not be sent the same words.
   */
  recipients?: Recipient[]
}

export interface Recipient {
  title?: string
  name?: string
  email: string
  role?: string
  audience: 'payer' | 'served'
  /**
   * WHO HAS ACTUALLY HAD THE LETTER. 8 September 2026.
   *
   * Nothing recorded this, so adding one person to an engagement and pressing
   * send posted a second copy to everybody who already had it, and there was
   * no way to know who those people were. Written by the send itself, as an
   * ISO timestamp, only when the provider accepted that person's letter.
   *
   * Absent means not sent, which is also the honest answer for every
   * recipient saved before this existed.
   */
  sentAt?: string
}

const CAP = { text: 300, list: 20, item: 400, intro: 2000, letter: 20000 }

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim().slice(0, max)
  return s || undefined
}

/**
 * The recipient list, believing none of it. A row with no usable address is
 * dropped rather than kept as an empty line that later sends to nobody.
 */
/**
 * AN ADDRESS PASTED OUT OF A MAIL CLIENT. 8 September 2026.
 *
 * Habib pasted kemiasuni@tanagerintl.org and the send came back "Unable to
 * validate email address: invalid format", which reads as nonsense next to
 * three addresses at the same domain that work. What was saved was
 * "kemiasuni@tanagerintl.org>", with a closing angle bracket on the end:
 * copying a name and address out of a mail client gives
 * "Kemi Asuni <kemiasuni@tanagerintl.org>", and what survived the paste was
 * the tail of it.
 *
 * The address was genuinely malformed. Nothing here said which character was
 * the problem, and the provider's own wording is no help to the person holding
 * the screen.
 *
 * So the brackets, quotes, stray commas and semicolons that come with a pasted
 * address are taken off before it is stored, and a display name in front of an
 * address in angle brackets is read as the address it contains rather than
 * refused.
 */
export function cleanEmail(raw: string): string {
  let e = raw.trim()
  // "Kemi Asuni <kemiasuni@tanagerintl.org>" is one address with a name on it.
  const angled = e.match(/<([^<>]+)>/)
  if (angled) e = angled[1]
  // Anything left over from a partial paste, at either end.
  e = e.replace(/^[\s<>"',;]+/, '').replace(/[\s<>"',;.]+$/, '')
  return e.toLowerCase()
}

/**
 * True for something that can actually be sent to. Deliberately plain: one @,
 * something either side, a dot in the domain, and no whitespace or brackets
 * anywhere. It is not trying to be the full grammar of an address, only to
 * catch what a person can see is wrong.
 */
export function emailLooksSendable(email: string): boolean {
  if (!email || email.length > 254) return false
  return /^[^\s<>@",;]+@[^\s<>@",;]+\.[^\s<>@",;]{2,}$/.test(email)
}

function readRecipients(v: unknown): Recipient[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: Recipient[] = []
  const seen = new Set<string>()
  for (const r of v.slice(0, 50)) {
    if (!r || typeof r !== 'object') continue
    const row = r as Record<string, unknown>
    const raw = str(row.email, 254)
    const email = raw ? cleanEmail(raw) : undefined
    if (!email || !emailLooksSendable(email) || seen.has(email)) continue
    seen.add(email)
    out.push({
      email,
      title: str(row.title, 16),
      name: str(row.name, 120),
      role: str(row.role, 120),
      audience: row.audience === 'payer' ? 'payer' : 'served',
      sentAt: isoStamp(row.sentAt),
    })
  }
  return out.length ? out : undefined
}

/**
 * A moment something happened, or nothing. Kept as the full timestamp rather
 * than a date, because two sends on the same day are a thing that happens and
 * "sent today" is not an answer to "did this person get it".
 */
function isoStamp(v: unknown): string | undefined {
  const s = str(v, 40)
  if (!s) return undefined
  const t = Date.parse(s)
  return Number.isNaN(t) ? undefined : new Date(t).toISOString()
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
    coImplementer: str(b.coImplementer, CAP.text),
    deliverables: deliverables && deliverables.length ? deliverables : undefined,
    welcomeIntro: str(b.welcomeIntro, CAP.intro),
    letterPayer: str(b.letterPayer, CAP.letter),
    letterServed: str(b.letterServed, CAP.letter),
    recipients: readRecipients(b.recipients),
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
 * HOW LONG, IN THE WORDS A PERSON USES. "six months", not a date arithmetic
 * result — the reader wants the shape of the commitment, not the arithmetic.
 */
export function durationInWords(brief: EngagementBrief): string | undefined {
  if (!brief.periodStart || !brief.periodEnd) return undefined
  const a = new Date(brief.periodStart)
  const b = new Date(brief.periodEnd)
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return undefined
  const months = Math.round((b.getTime() - a.getTime()) / (30.44 * 24 * 3600 * 1000))
  if (months < 1) return undefined
  if (months === 1) return 'a month'
  if (months < 12) return `${['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'][months] || months} months`
  return months === 12 ? 'a year' : `${Math.round(months / 12 * 10) / 10} years`
}

/**
 * A SALUTATION IS NOT A FIRST NAME. A client is written to by name and title —
 * "Dear Mr Morgan Mercer" — and a bare first name reads as talking down to
 * them. With no name at all this returns nothing, and the caller must not
 * invent one: no salutation is better than the wrong one.
 */
export function salutation(fullName?: string, title?: string): string | undefined {
  const name = (fullName || '').trim().replace(/\s+/g, ' ')
  if (!name) return undefined
  const t = (title || '').trim().replace(/\.$/, '')
  return `Dear ${t ? `${t} ` : ''}${name},`
}
