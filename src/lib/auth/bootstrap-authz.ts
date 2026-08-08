// ============================================================
// Shared secret authorisation for the temporary staging bootstrap route.
//
// Same shape as the cron secret check: a caller proves it holds a secret that
// only the environment owner has, compared in constant time. It is not a user
// session, so it is only ever acceptable on a non production environment for
// creating the very first sign in on a fresh staging database.
//
// DELETE THIS FILE together with app/api/bootstrap-staging-user once the
// staging login exists.
// ============================================================
import { timingSafeEqual } from 'crypto'

/** True only on a non production environment. */
export function nonProductionOnly(): boolean {
  const appEnv = (process.env.NEXT_PUBLIC_APP_ENV || '').toLowerCase()
  const vercelEnv = (process.env.VERCEL_ENV || '').toLowerCase()
  return appEnv !== 'production' && vercelEnv !== 'production'
}

/**
 * Constant time check of the x-bootstrap-secret header against BOOTSTRAP_SECRET.
 * Returns false when either side is missing, so an unset secret cannot be
 * satisfied by an empty header.
 */
export function bootstrapAuthorised(headerValue: string | null): boolean {
  const expected = (process.env.BOOTSTRAP_SECRET || '').trim()
  const given = (headerValue || '').trim()
  if (!expected || !given) return false
  const a = Buffer.from(expected)
  const b = Buffer.from(given)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
