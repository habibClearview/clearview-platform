// ============================================================
// ClearView API keys: what a key is, what it may do, and how a request
// carrying one is judged.
//
// 20 September 2026.
//
// Every decision in this file is a pure function taking plain values, so the
// security rules can be tested without a database, an HTTP request or a live
// key. The only part that talks to Postgres is resolveApiKey at the bottom,
// and it does nothing but look a hash up and hand the row to these functions.
//
// THE KEY ITSELF.
//
//   cv_live_<43 characters of base64url>
//
//   The 43 characters carry 256 bits from crypto.getRandomValues. The prefix
//   is there so a key is recognisable on sight in a log, a config file or a
//   support message, which is what lets somebody notice one has been pasted
//   somewhere it should not be. GitHub, AWS and Stripe all do this for the
//   same reason and it is worth copying.
//
//   Only the SHA-256 of the whole string is ever stored. The key is shown
//   once, when it is created, and cannot be recovered afterwards.
// ============================================================
import { createHash, randomBytes, timingSafeEqual } from 'crypto'

export const KEY_PREFIX = 'cv_live_'
/** Bytes of randomness behind each key. 32 bytes is 256 bits. */
export const KEY_BYTES = 32
/** How much of the key is stored in the clear so a human can identify it. */
export const VISIBLE_PREFIX_LENGTH = KEY_PREFIX.length + 6

// ------------------------------------------------------------
// Scopes
// ------------------------------------------------------------

/**
 * What a key may do. Additive: a key holds a list, and holds nothing it was
 * not given. Deliberately coarse -- a scope a coach cannot explain to the
 * person receiving the key is a scope nobody will set correctly.
 */
export const SCOPES = [
  'model.read',      // the business: units, revenue lines, cost lines, catalogue
  'sales.write',     // individual sales, as they happen
  'costs.write',     // individual costs, as they happen
  'actuals.write',   // monthly totals per line, the bookkeeper's route
  'payments.write',  // money a payment provider confirms has moved
  'results.read',    // the worked-out figures: revenue, margin, cash, ratios
] as const

export type Scope = (typeof SCOPES)[number]

export function isScope(value: unknown): value is Scope {
  return typeof value === 'string' && (SCOPES as readonly string[]).includes(value)
}

/** Drops anything unrecognised rather than failing, and never returns duplicates. */
export function cleanScopes(value: unknown): Scope[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter(isScope)))
}

/** Plain words for a coach issuing a key, so the screen never shows a code. */
export const SCOPE_LABELS: Record<Scope, string> = {
  'model.read': 'Read the price list and the cost headings',
  'sales.write': 'Send sales as they happen',
  'costs.write': 'Send costs as they happen',
  'actuals.write': 'Send monthly totals',
  'payments.write': 'Send confirmed payments',
  'results.read': 'Read the worked-out figures',
}

// ------------------------------------------------------------
// Making and recognising a key
// ------------------------------------------------------------

/** A new key. Returned once; only the hash is ever stored. */
export function generateKey(): { key: string; hash: string; prefix: string } {
  const key = KEY_PREFIX + randomBytes(KEY_BYTES).toString('base64url')
  return { key, hash: hashKey(key), prefix: key.slice(0, VISIBLE_PREFIX_LENGTH) }
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex')
}

/**
 * Whether a string is shaped like one of our keys. Checked before any database
 * work so a flood of rubbish costs a hash and nothing else.
 */
export function looksLikeKey(value: unknown): value is string {
  return typeof value === 'string'
    && value.startsWith(KEY_PREFIX)
    && value.length >= KEY_PREFIX.length + 40
    && value.length <= KEY_PREFIX.length + 64
    && /^[A-Za-z0-9_-]+$/.test(value.slice(KEY_PREFIX.length))
}

/**
 * Compares two hex hashes without letting the time taken reveal how much of
 * them matched. The lookup itself is by indexed hash so this is belt and
 * braces, but a comparison of secrets should not be written the naive way in
 * a file people will copy from.
 */
export function hashesMatch(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}

/**
 * The key out of a request, from the Authorization header only.
 *
 * Deliberately NOT from the query string. A key in a URL is written into every
 * server log, proxy log and browser history it passes through, and that is how
 * keys leak in practice. The field endpoints accept one in the query string
 * because a phone opens a link; software has no such excuse.
 */
export function keyFromHeader(header: string | null | undefined): string | null {
  if (!header) return null
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim())
  if (!m) return null
  return looksLikeKey(m[1]) ? m[1] : null
}

// ------------------------------------------------------------
// Judging a key
// ------------------------------------------------------------

export interface ApiKeyRow {
  id: string
  client_id: string
  business_unit_id: string
  operator_id: string
  label: string
  scopes: string[] | null
  expires_at: string | null
  revoked_at: string | null
}

export type KeyRefusal = 'unknown' | 'revoked' | 'expired'

/**
 * Why a key cannot be used, or null if it can. Separated from the scope check
 * so a caller can tell a revoked key from one that simply lacks a permission,
 * and answer with the right status code.
 */
export function keyRefusal(row: ApiKeyRow | null, now: Date = new Date()): KeyRefusal | null {
  if (!row) return 'unknown'
  if (row.revoked_at) return 'revoked'
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) return 'expired'
  return null
}

export function hasScope(row: ApiKeyRow | null, scope: Scope): boolean {
  if (!row) return false
  return cleanScopes(row.scopes).includes(scope)
}

/** What a caller is told about their own key. Never includes the key. */
export function describeKey(row: ApiKeyRow, unitName?: string | null) {
  return {
    label: row.label,
    business_unit: { id: row.business_unit_id, name: unitName || null },
    scopes: cleanScopes(row.scopes),
    expires_at: row.expires_at,
  }
}

// ------------------------------------------------------------
// The one part that touches the database
// ------------------------------------------------------------

/**
 * Turns a request's Authorization header into the key's row, or null.
 *
 * Never throws on a bad key and never says which of the three refusals applied
 * in its return value -- the caller asks keyRefusal for that. Returns the row
 * even when revoked or expired so the caller can answer precisely; a caller
 * that forgets to check gets a row it must still pass to keyRefusal before
 * doing anything, which is why every route in this codebase goes through
 * requireApiKey rather than this.
 */
export async function resolveApiKey(
  supabase: { from: (t: string) => any },
  header: string | null | undefined,
): Promise<ApiKeyRow | null> {
  const key = keyFromHeader(header)
  if (!key) return null
  const hash = hashKey(key)
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, client_id, business_unit_id, operator_id, label, scopes, expires_at, revoked_at, key_hash')
    .eq('key_hash', hash)
    .maybeSingle()
  if (error || !data) return null
  // The lookup was by an indexed equality, so this can only fail if Postgres
  // handed back a row it should not have. Checked anyway, in constant time.
  if (!hashesMatch(data.key_hash, hash)) return null
  const { key_hash: _discard, ...row } = data
  return row as ApiKeyRow
}
