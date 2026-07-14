// External access grants (§ coach-managed access model). A coach hands an
// investor, programme officer, DFI, or subscriber a link to either ONE
// client's Investment Readiness Brief, the WHOLE portfolio, or one
// filtered SEGMENT of the portfolio -- without giving them a real login,
// and without a client or the coach's own portfolio ever being
// self-served to a third party directly. Every grant is created,
// time-limited, and revocable by whoever manages the scope it covers --
// see supabase/migrations for the RLS that enforces this
// (client_access_grants, scoped via can_view_client() for a client grant,
// super_coach-only for a portfolio/segment grant -- see
// 2026_07_13_access_grants_portfolio_scope.sql).
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

export type GrantScope = 'client' | 'portfolio' | 'segment'

export const GRANT_SCOPE_LABELS: Record<GrantScope, string> = {
  client: 'One business (Investment Brief)',
  portfolio: 'Whole portfolio (Portfolio Intelligence)',
  segment: 'One segment (filtered Portfolio Intelligence)',
}

// Mirrors SegmentFilter in portfolio-intelligence.ts -- duplicated here
// (rather than imported) so this module has zero dependency on the
// portfolio aggregation code, matching its existing "pure, standalone"
// scope. Kept in sync manually; both are small and rarely change.
export interface GrantSegmentFilter {
  sector?: string
  country?: string
  programmeId?: string
  readinessStage?: 'pre_investment' | 'development_stage' | 'near_ready' | 'investment_ready'
  minConfidence?: number
  maxConfidence?: number
}

export interface AccessGrant {
  id: string
  client_id: string | null   // null unless scope_type === 'client'
  scope_type: GrantScope
  segment_filter: GrantSegmentFilter | null  // only meaningful when scope_type === 'segment'
  grantee_name: string
  grantee_email: string | null
  grant_type: GrantType
  access_token: string
  created_at: string
  expires_at: string | null
  revoked_at: string | null
  last_accessed_at: string | null
  email_confirmed_at: string | null
  otp_code: string | null
  otp_email: string | null
  otp_expires_at: string | null
  otp_attempts: number
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

// Whether a submitted email satisfies this grant's email gate. A grant
// created with no grantee_email at all has nothing to check against --
// treated as "no gate configured" (true) rather than permanently locked
// out, since the coach chose not to set one. Comparison is
// case-insensitive and trims whitespace -- an email typo in case only
// should never lock a legitimate recipient out.
export function emailSatisfiesGrant(grant: Pick<AccessGrant, 'grantee_email'>, submittedEmail: string): boolean {
  if (!grant.grantee_email) return true
  return grant.grantee_email.trim().toLowerCase() === submittedEmail.trim().toLowerCase()
}

// Whether this grant requires an email confirmation step at all before
// its content is revealed -- only when the coach actually entered one.
export function requiresEmailConfirmation(grant: Pick<AccessGrant, 'grantee_email'>): boolean {
  return !!grant.grantee_email
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

// ── One-time code verification ──────────────────────────────
// Stronger than a plain email match: a code only the recipient's inbox
// receives, that they have to type back in. It doesn't stop someone
// forwarding the actual content after they've legitimately received it
// (nothing can), but it stops a bare link -- or a link plus "here's the
// email to type in" -- from working for a stranger by itself. Every
// verification attempt needs a fresh code delivered to a real inbox.

export const OTP_EXPIRY_MINUTES = 15
export const OTP_MAX_ATTEMPTS = 5

// 6-digit numeric code. Uses Web Crypto (see generateAccessToken above
// for why) rather than Math.random() -- cheap to do properly, and this
// value is a real access-control secret, not a cosmetic ID.
export function generateOtpCode(): string {
  const bytes = new Uint8Array(4)
  globalThis.crypto.getRandomValues(bytes)
  const n = new DataView(bytes.buffer).getUint32(0)
  return String(100000 + (n % 900000))
}

export function otpExpiryFromNow(nowMs: number): string {
  return new Date(nowMs + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString()
}

// Whether a submitted code is the live, unexpired code for this grant.
// Does NOT check attempts here -- that's a separate, explicit check
// (otpAttemptsExceeded) so the route can tell "wrong code" apart from
// "too many wrong codes, request a new one" and message each correctly.
export function isOtpValid(grant: Pick<AccessGrant, 'otp_code' | 'otp_expires_at'>, submittedCode: string, nowIso: string): boolean {
  if (!grant.otp_code || !grant.otp_expires_at) return false
  if (grant.otp_expires_at <= nowIso) return false
  return grant.otp_code === submittedCode.trim()
}

export function otpAttemptsExceeded(grant: Pick<AccessGrant, 'otp_attempts'>): boolean {
  return (grant.otp_attempts || 0) >= OTP_MAX_ATTEMPTS
}
