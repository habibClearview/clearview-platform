// ============================================================
// Rate limiting helper for API routes.
//
// Wraps the check_rate_limit() Postgres function (see
// supabase/migrations/2026_07_19_rate_limits.sql). Call it from a route with a
// SERVICE-ROLE Supabase client and a key that identifies the caller (user id,
// or client IP for pre-auth endpoints).
//
// Design choices:
//  * Fixed-window counting in Postgres so all serverless instances share state.
//  * FAILS OPEN: if the limiter check itself errors (DB blip), the request is
//    allowed rather than blocked — a broken limiter must not take the whole
//    endpoint down. The error is logged.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

export interface RateLimitResult {
  allowed: boolean
  /** Seconds the caller should wait before retrying (the window length). */
  retryAfter: number
  /**
   * True when the limiter could NOT be evaluated (DB error / RPC missing / threw).
   * The default behaviour still ALLOWS the request (fail-open) so a limiter blip
   * can't take an endpoint down — but a destructive route can read this flag and
   * choose to fail CLOSED instead (block until the limiter is healthy again).
   */
  errored?: boolean
}

/**
 * Record one hit for `key` and report whether the caller is still within
 * `max` hits per `windowSeconds`.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    })
    if (error) {
      console.error('Rate limit check failed (allowing request):', error.message)
      return { allowed: true, retryAfter: 0, errored: true }
    }
    return { allowed: data === true, retryAfter: windowSeconds }
  } catch (e) {
    console.error('Rate limit check threw (allowing request):', e)
    return { allowed: true, retryAfter: 0, errored: true }
  }
}

/**
 * Best-effort client IP for keying pre-auth endpoints. Uses the left-most
 * x-forwarded-for entry (the original client on Vercel), falling back to
 * x-real-ip, then a constant so the limiter still groups unknown callers.
 */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}
