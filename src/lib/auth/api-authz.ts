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
import type { NextRequest } from 'next/server'

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
