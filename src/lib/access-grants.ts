// External access grants (§ coach-managed access model). A coach hands an
// investor, programme officer, or subscriber a link to a client's
// Investment Readiness Brief without giving them a real login and without
// the client ever self-serving the document to a third party directly.
// Every grant is created, time-limited, and revocable by the coach who
// manages that client -- see supabase/migrations for the RLS that
// enforces this (client_access_grants, scoped via can_view_client()).
//
// Pure logic only, deliberately kept out of the DB layer and the route
// handler: whether a grant is still usable is a fact about its own
// fields (revoked_at, expires_at) at a point in time, not something that
// needs a database round-trip to decide.

export type GrantType = 'investor' | 'programme_officer' | 'subscriber' | 'other'

export const GRANT_TYPE_LABELS: Record<GrantType, string> = {
  investor: 'Investor',
  programme_officer: 'Programme Officer',
  subscriber: 'ClearView Subscriber',
  other: 'Other',
}

export interface AccessGrant {
  id: string
  client_id: string
  grantee_name: string
  grantee_email: string | null
  grant_type: GrantType
  access_token: string
  created_at: string
  expires_at: string | null
  revoked_at: string | null
  last_accessed_at: string | null
}

export type GrantStatus = 'active' | 'expired' | 'revoked'

export function grantStatus(grant: Pick<AccessGrant, 'revoked_at' | 'expires_at'>, nowIso: string): GrantStatus {
  if (grant.revoked_at) return 'revoked'
  if (grant.expires_at && grant.expires_at <= nowIso) return 'expired'
  return 'active'
}

export function isGrantActive(grant: Pick<AccessGrant, 'revoked_at' | 'expires_at'>, nowIso: string): boolean {
  return grantStatus(grant, nowIso) === 'active'
}

// 24 random bytes as hex -- opaque, unguessable, and carries no
// information about the client or grantee it belongs to. Uses the Web
// Crypto API (globalThis.crypto.getRandomValues), which is available in
// both the browser (grants are created client-side, matching this
// codebase's existing pattern for coach-only writes -- see
// TeamPayments.tsx) and in Node API routes -- unlike Node's 'crypto'
// module, it needs no import that would break a browser bundle, and
// unlike a DB-side default, it never depends on a Postgres extension
// being enabled in a given Supabase project.
export function generateAccessToken(): string {
  const bytes = new Uint8Array(24)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Converts a whole number of days (as entered by a coach in a simple
// "expires in N days" field) into the ISO timestamp to store. Returns
// null for "no expiry" (0, negative, or not provided) rather than
// defaulting to some arbitrary window -- a coach who doesn't set an
// expiry gets exactly that: no expiry, until they explicitly revoke.
export function expiryFromDays(days: number | null | undefined, nowMs: number): string | null {
  if (!days || days <= 0) return null
  return new Date(nowMs + days * 24 * 60 * 60 * 1000).toISOString()
}
