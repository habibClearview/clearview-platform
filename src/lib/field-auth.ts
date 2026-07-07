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
export async function validateFieldToken(token: string) {
  const supabase = getFieldSupabase()
  const { data, error } = await supabase
    .from('field_operator_tokens')
    .select('*, operator:field_operators(*)')
    .eq('token', token)
    .single()
  if (error || !data) return null
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null
  if (!data.operator?.active) return null
  return data.operator
}

// Clamps a requested history page size to a sane range (1-200,
// defaulting to 50 if unspecified, non-numeric, or non-positive).
export function clampHistoryLimit(requested: string | null): number {
  const n = Number(requested)
  if (!Number.isFinite(n) || n <= 0) return 50
  return Math.min(Math.floor(n), 200)
}
