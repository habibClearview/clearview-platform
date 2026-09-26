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
  // The Chapter 06 form on the home page, 26 September 2026. The name is the
  // one in Habib's brief, colon and all.
  website: 'source: website',
} as const

/**
 * A capture point that also files people into a Kit form. Kit's API cannot
 * create a form, so Habib creates it by hand and its id goes in the setting
 * named here. Until the setting exists, people are tagged but not filed.
 */
const SOURCE_FORM_ENV: Partial<Record<keyof typeof SOURCE_TAGS, string>> = {
  website: 'KIT_WEBSITE_FORM_ID',
}

export type CaptureSource = keyof typeof SOURCE_TAGS

export const BAND_TAGS: Record<string, string> = {
  below: 'readiness-below',
  moderate: 'readiness-moderate',
  strong: 'readiness-strong',
}

/** name -> id, resolved once per process rather than on every submission. */
let tagIdCache: Record<string, number> | null = null

/**
 * A tag that does not exist yet is created rather than skipped. Kit's create
 * call returns the existing tag when the name is already taken, so this is
 * safe to repeat.
 */
async function ensureTag(key: string, name: string, ids: Record<string, number>): Promise<number | undefined> {
  const known = ids[name.toLowerCase()]
  if (known) return known
  const res = await fetch('https://api.kit.com/v4/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Kit-Api-Key': key },
    body: JSON.stringify({ name }),
  })
  if (!(res.status === 200 || res.status === 201)) {
    console.error('kit: could not create tag', name, res.status)
    return undefined
  }
  const body = await res.json().catch(() => ({}))
  const id = body?.tag?.id
  if (id) ids[name.toLowerCase()] = id
  return id
}

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
  /** The Kit form id the subscriber was added to, if any. */
  form?: string
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
    // the list. But the SOURCE tag is how a sign-up is filed, so if that one
    // does not apply the capture is reported as failed: the route then emails
    // Habib, rather than a subscriber sitting unfiled with nobody told.
    const sourceTag = SOURCE_TAGS[input.source]
    const ids = await tagIds(key)
    const wanted = [sourceTag, ...(input.extraTags || [])].filter(Boolean)
    const tagged: string[] = []
    for (const name of wanted) {
      const id = await ensureTag(key, name, ids)
      let ok = false
      if (!id) console.error('kit: no tag named', name)
      else {
        const t = await fetch(`https://api.kit.com/v4/tags/${id}/subscribers`, {
          method: 'POST', headers, body: JSON.stringify({ email_address: input.email }),
        })
        ok = t.status === 200 || t.status === 201
        if (ok) tagged.push(name)
        else console.error('kit: tagging failed', name, t.status)
      }
      if (!ok && name === sourceTag) {
        return { added: false, tagged, reason: `Subscribed, but the tag "${name}" could not be applied` }
      }
    }

    // Filed into the source's Kit form as well, when one has been set up.
    const formEnv = SOURCE_FORM_ENV[input.source]
    const formId = formEnv ? (process.env[formEnv] || '').trim() : ''
    let form: string | undefined
    if (formId) {
      const f = await fetch(`https://api.kit.com/v4/forms/${encodeURIComponent(formId)}/subscribers`, {
        method: 'POST', headers,
        body: JSON.stringify({ email_address: input.email, referrer: input.referrer || undefined }),
      })
      if (f.status === 200 || f.status === 201) form = formId
      else {
        console.error('kit: adding to form failed', formId, f.status)
        return { added: false, tagged, reason: `Subscribed and tagged, but Kit form ${formId} returned ${f.status}` }
      }
    }
    return { added: true, tagged, form }
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
