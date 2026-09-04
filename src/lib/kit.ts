// ============================================================
// THE MAILING LIST, IN ONE PLACE.
//
// Every capture point on the public site comes through here: the readiness
// score, the library unlock, an enquiry, the newsletter, and market
// intelligence interest. They differ only in which tag the subscriber earns.
//
// WHY THE KEY IS SERVER SIDE. Kit publishes a public form endpoint that takes
// a form id and needs no key, and that is the usual way a marketing site does
// this. It is not used here, because the form ids have to be created by hand
// in Kit's interface and pasted into a setting, and because a public endpoint
// takes whatever the browser sends it. The v4 API with a server key lets the
// server decide the tag, which means a visitor cannot choose to be filed as
// something they are not.
//
// WHY TAGS AND NOT FORMS. Kit's API can create a tag and cannot create a form.
// A tag is also the thing that actually segments a list: a subscriber carries
// it for the life of the list, whether or not a form existed the day they
// signed up.
//
// NOTHING IS LOST WHEN IT IS NOT CONFIGURED. Every function reports why it did
// not happen rather than throwing. A mailing list being unreachable is not a
// reason to fail somebody who has just filled in a form.
// ============================================================

/** The tag each capture point writes. These exist in Habib's account. */
export const SOURCE_TAGS = {
  score: 'Readiness Score',
  library: 'Library',
  enquiry: 'Enquiry',
  newsletter: 'Viable by Design',
  intel: 'Market Intelligence',
} as const

export type CaptureSource = keyof typeof SOURCE_TAGS

export const BAND_TAGS: Record<string, string> = {
  below: 'readiness-below',
  moderate: 'readiness-moderate',
  strong: 'readiness-strong',
}

/** name -> id, resolved once per process rather than on every submission. */
let tagIdCache: Record<string, number> | null = null

export async function tagIds(key: string): Promise<Record<string, number>> {
  if (tagIdCache) return tagIdCache
  const res = await fetch('https://api.kit.com/v4/tags?per_page=500', {
    headers: { 'X-Kit-Api-Key': key },
  })
  if (!res.ok) return {}
  const body = await res.json().catch(() => ({}))
  const map: Record<string, number> = {}
  for (const t of body?.tags || []) {
    if (t?.name && t?.id) map[String(t.name).toLowerCase()] = t.id
  }
  tagIdCache = map
  return map
}

export interface CaptureInput {
  email: string
  firstName?: string
  organisation?: string
  /** Which capture point this came from. Decides the source tag. */
  source: CaptureSource
  /** Extra tags, e.g. the readiness band. Named, not numbered. */
  extraTags?: string[]
  /** Custom fields written on the subscriber record. */
  fields?: Record<string, string | undefined>
  referrer?: string
}

export interface CaptureResult {
  added: boolean
  tagged: string[]
  reason?: string
}

export function kitConfigured(): boolean {
  return !!(process.env.KIT_API_KEY || '').trim()
}

/**
 * Put an address on the list and tag it. Returns why it did not happen rather
 * than throwing.
 */
export async function capture(input: CaptureInput): Promise<CaptureResult> {
  const key = (process.env.KIT_API_KEY || '').trim()
  if (!key) return { added: false, tagged: [], reason: 'KIT_API_KEY is not configured' }

  const headers = { 'Content-Type': 'application/json', 'X-Kit-Api-Key': key }
  const fields: Record<string, string> = {}
  for (const [k, v] of Object.entries(input.fields || {})) if (v) fields[k] = v
  if (input.organisation) fields.organisation = input.organisation
  fields.signup_source = input.source

  try {
    // An upsert. Somebody who comes back through a second capture point has
    // their record updated rather than being rejected.
    const res = await fetch('https://api.kit.com/v4/subscribers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email_address: input.email,
        first_name: input.firstName || undefined,
        state: 'active',
        fields,
      }),
    })
    if (!(res.status === 200 || res.status === 201 || res.status === 202)) {
      const body = await res.text().catch(() => '')
      return { added: false, tagged: [], reason: `Kit returned ${res.status}: ${body.slice(0, 200)}` }
    }

    // Tagging happens after the subscriber exists, and a tag that will not
    // apply is reported rather than raised. On the list untagged beats not on
    // the list.
    const ids = await tagIds(key)
    const wanted = [SOURCE_TAGS[input.source], ...(input.extraTags || [])].filter(Boolean)
    const tagged: string[] = []
    for (const name of wanted) {
      const id = ids[name.toLowerCase()]
      if (!id) { console.error('kit: no tag named', name); continue }
      const t = await fetch(`https://api.kit.com/v4/tags/${id}/subscribers`, {
        method: 'POST', headers, body: JSON.stringify({ email_address: input.email }),
      })
      if (t.status === 200 || t.status === 201) tagged.push(name)
      else console.error('kit: tagging failed', name, t.status)
    }
    return { added: true, tagged }
  } catch (e: any) {
    return { added: false, tagged: [], reason: `Kit request threw: ${e?.message || 'unknown'}` }
  }
}

/** Deliberately conservative: what passes is unambiguously an address. */
export function validEmail(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 6 && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
}

export function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}
