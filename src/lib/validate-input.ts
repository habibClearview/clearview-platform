// ============================================================
// Small input checks shared by the engagement routes.
//
// Every one of these exists because something reached a database column, an
// email or a link without anybody asking whether it was the right shape. A
// route that trusts its body is a route that will one day store a hundred
// thousand recipients, a javascript: link, or a date the calendar cannot read.
//
// These deliberately return plain answers rather than throwing, so a route can
// refuse with a sentence the person reading it will understand.
// ============================================================

/** A cap on how many people one message may go to in a single send. */
export const MAX_RECIPIENTS = 25

/**
 * Keep only the entries that look like addresses, de-duplicate them, and
 * refuse a list longer than the cap. An unbounded list is a way to turn one
 * authorised send into a mailshot.
 */
export function cleanRecipients(input: unknown): { ok: true; recipients: string[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'Recipients must be a list' }

  const seen = new Set<string>()
  for (const entry of input) {
    if (typeof entry !== 'string') continue
    const value = entry.trim()
    if (!value) continue
    if (value.length > 254) return { ok: false, error: 'One of those addresses is not valid' }
    // Deliberately loose. This is a shape check, not an attempt to decide
    // whether a mailbox exists, which only sending can answer.
    if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(value)) {
      return { ok: false, error: `That is not an email address: ${value}` }
    }
    seen.add(value.toLowerCase())
  }

  const recipients = Array.from(seen)
  if (recipients.length === 0) return { ok: false, error: 'At least one recipient is required' }
  if (recipients.length > MAX_RECIPIENTS) {
    return { ok: false, error: `That is more than ${MAX_RECIPIENTS} recipients. Send it in smaller groups.` }
  }
  return { ok: true, recipients }
}

/**
 * A link is acceptable only when a browser will open it as a web page. A
 * javascript: or data: address in an email is a way to hand somebody something
 * that is not the page they think they are opening.
 */
export function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/** An ISO timestamp the calendar can actually read. */
export function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 40) return false
  const t = Date.parse(value)
  return Number.isFinite(t)
}

/** Trim to a maximum, so one field cannot carry a document. */
export function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

/**
 * Run a fetch with a ceiling on how long it may take.
 *
 * A call to somebody else's service with no timeout can hold a serverless
 * invocation open until the platform kills it, and the caller never learns
 * what happened. A timeout turns that into an answer.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: abort.signal })
  } finally {
    clearTimeout(timer)
  }
}
