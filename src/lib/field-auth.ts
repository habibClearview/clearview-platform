import { createClient } from '@supabase/supabase-js'

// Lazy init -- must never call createClient() at module level on Vercel.
export function getFieldSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase environment variables not configured')
  return createClient(url, key)
}

// Validates a field operator's token, checking expiry and that the
// operator is still active. Shared between every field API route that
// needs to authenticate a request (sync, history, etc.) -- extracted
// here rather than duplicated per-route, and rather than exported
// directly from a route file, since Next.js App Router route files can
// only export the specific handler names (GET, POST, etc.) and break
// the build on any other export.
// Pure decision so the auth gate can be unit-tested without a DB or
// HTTP request -- extracted from validateFieldToken specifically
// because this security-critical logic (expiry, missing operator
// embed, inactive operator) previously had no direct test coverage at
// all, only whatever incidentally exercised it through other routes.
export function isTokenRowValid(
  row: { expires_at?: string | null; operator?: { active?: boolean } | null } | null,
  now: Date = new Date(),
): boolean {
  if (!row) return false
  if (row.expires_at && new Date(row.expires_at) < now) return false
  return !!row.operator?.active
}

export async function validateFieldToken(token: string) {
  const supabase = getFieldSupabase()
  const { data, error } = await supabase
    .from('field_operator_tokens')
    .select('*, operator:field_operators(*)')
    .eq('token', token)
    .single()
  if (error || !isTokenRowValid(data)) return null
  return data.operator
}

// Clamps a requested history page size to a sane range (1-200,
// defaulting to 50 if unspecified, non-numeric, or non-positive).
export function clampHistoryLimit(requested: string | null): number {
  const n = Number(requested)
  if (!Number.isFinite(n) || n <= 0) return 50
  return Math.min(Math.floor(n), 200)
}

// An operator can have multiple tokens over time (each "issue new
// token" action adds another) -- last_used_at lives on each token
// record, not on the operator itself. The operator's own "last synced"
// moment is the most recent last_used_at across all of them.
export function mostRecentTokenUse(tokens: {last_used_at?: string | null}[] | undefined): string | null {
  const timestamps = (tokens || []).map(t => t.last_used_at).filter((t): t is string => !!t)
  if (timestamps.length === 0) return null
  return timestamps.reduce((latest, t) => new Date(t).getTime() > new Date(latest).getTime() ? t : latest)
}
