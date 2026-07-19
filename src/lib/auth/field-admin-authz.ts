// ============================================================
// Authorization for the field-admin API routes
// (/api/field/admin/operators | catalogue | stock | uncategorized-costs).
//
// These routes use the service-role key (RLS is bypassed), so they are the
// real trust boundary and MUST authenticate the caller themselves. Before
// this, they had no auth at all — anyone who supplied a client_id could
// read or mutate any business's field data and read operator tokens.
//
// resolveFieldAdminActor() verifies the Bearer token and loads the caller's
// role + tenant; actorMayAccessClient() enforces that the caller belongs to
// the business being acted on (super_coach is the cross-tenant exception).
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

export interface FieldAdminActor {
  role: string
  engagement_client_id: string | null
}

/**
 * Verify the request's Bearer token and return the caller's profile
 * (role + engagement_client_id), or null if unauthenticated / no profile.
 */
export async function resolveFieldAdminActor(admin: SupabaseClient, req: NextRequest): Promise<FieldAdminActor | null> {
  const header = req.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) return null
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await admin
    .from('user_profiles')
    .select('role, engagement_client_id')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  return profile as FieldAdminActor
}

/**
 * True when this actor may act on the given business (engagement client id).
 * A super_coach may act on any business; everyone else only on their own.
 */
export function actorMayAccessClient(actor: FieldAdminActor, clientId: string | null | undefined): boolean {
  if (actor.role === 'super_coach') return true
  return !!clientId && !!actor.engagement_client_id && actor.engagement_client_id === clientId
}
