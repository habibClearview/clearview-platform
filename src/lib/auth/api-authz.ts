// ============================================================
// Shared authorization helpers for service-role API routes.
//
// A service-role route bypasses RLS, so it must authenticate & authorize the
// caller itself. requesterCanViewClient() reuses the EXISTING can_view_client
// RLS policy on engagement_clients by running a read AS the requester (their
// JWT), so we don't re-implement the visibility rule: if the requester may see
// the client's row, they may act on it. An invalid/expired token resolves to
// the anon role and is denied, so this also enforces authentication.
// ============================================================
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveClientAccess } from './engagement-access'
import { checkRateLimit } from '../rate-limit'

export function getBearerToken(req: NextRequest): string {
  const h = req.headers.get('authorization') || ''
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : ''
}

// A supabase client acting AS the requester (their JWT), so RLS applies.
function requesterClient(token: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/**
 * True iff the requester may view this engagement client — evaluated by the
 * database's own can_view_client RLS policy (super_coach, the owning client's
 * staff, or an assigned coach/funder). Fails closed on any error/anon token.
 */
export async function requesterCanViewClient(token: string, clientId: string): Promise<boolean> {
  if (!token || !clientId) return false
  const rc = requesterClient(token)
  const { data, error } = await rc.from('engagement_clients').select('id').eq('id', clientId).maybeSingle()
  if (error) return false
  return !!data
}


// ─── The shared way a service-role route lets somebody in ─────
//
// getAdminClient and the authenticate-then-authorize block were copied into
// every GtCV route, in three slightly different shapes. That is the classic
// way a security helper rots: a fix lands in one copy and the other six keep
// the hole, and nothing points at the difference. One definition, one place to
// fix, one place to read when somebody asks how access actually works.

/**
 * A client that bypasses row level security. Only for routes that authorise
 * the caller themselves, which is what requireAccess below is for.
 */
export function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** What a route needs the caller to be able to do. */
export type AccessLevel = 'view' | 'manage'

export interface AccessGranted {
  ok: true
  userId: string
  role: string | null
  fullName: string | null
  canView: boolean
  canManage: boolean
}

export interface AccessRefused {
  ok: false
  error: string
  status: 401 | 403 | 429
  retryAfter?: number
}

export type AccessResult = AccessGranted | AccessRefused

/**
 * Authenticate the caller and check they may act on this engagement.
 *
 * Identity comes from the bearer token and the rules come from
 * resolveClientAccess, never from the request body. A route that needs a
 * different message for a refusal passes one; the status codes are fixed,
 * because a caller learning whether they failed authentication or
 * authorisation is a small leak that adds up.
 *
 * Pass a rate limit and it is applied per user after authorisation succeeds,
 * so a refused caller cannot burn somebody else's allowance.
 */
export async function requireAccess(
  req: NextRequest,
  admin: SupabaseClient,
  clientId: string,
  level: AccessLevel,
  opts: { deniedMessage?: string; rateLimit?: { key: string; max: number; windowSeconds: number } } = {},
): Promise<AccessResult> {
  const token = getBearerToken(req)
  if (!token) return { ok: false, error: 'Not authenticated', status: 401 }

  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return { ok: false, error: 'Not authenticated', status: 401 }

  const access = await resolveClientAccess(admin, user.id, clientId)

  const allowed = level === 'manage' ? access.canManage : access.canView
  if (!allowed) {
    return {
      ok: false,
      error: opts.deniedMessage || 'Insufficient permissions',
      status: 403,
    }
  }

  if (opts.rateLimit) {
    const rl = await checkRateLimit(
      admin, `${opts.rateLimit.key}:${user.id}`, opts.rateLimit.max, opts.rateLimit.windowSeconds,
    )
    if (!rl.allowed) {
      return {
        ok: false,
        error: 'Too many requests recently. Please wait a moment.',
        status: 429,
        retryAfter: rl.retryAfter,
      }
    }
  }

  return {
    ok: true,
    userId: user.id,
    role: access.role,
    fullName: access.fullName,
    canView: access.canView,
    canManage: access.canManage,
  }
}

/** Turn a refusal into the response, with the Retry-After a 429 needs. */
export function refuseAccess(r: AccessRefused) {
  return NextResponse.json(
    { error: r.error },
    r.status === 429
      ? { status: 429, headers: { 'Retry-After': String(r.retryAfter ?? 60) } }
      : { status: r.status },
  )
}
