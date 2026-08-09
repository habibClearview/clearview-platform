// ============================================================
// Server-side engagement access resolution.
//
// Re-derives, for a given user and client, the same rules the database
// helpers can_view_client(text) and can_manage_client_access(text) enforce,
// so service-role API routes can authorize a caller without RLS.
//
//   canView   : super_coach, the client's own users (user_profiles
//               .engagement_client_id), an assigned co-implementer, or the
//               programme funder.
//   canManage : super_coach or an assigned co-implementer only (never a
//               funder, never the client). Matches can_manage_client_access.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ClientAccess {
  role: string | null
  fullName: string | null
  canView: boolean
  canManage: boolean
}

export async function resolveClientAccess(
  admin: SupabaseClient,
  userId: string,
  clientId: string,
): Promise<ClientAccess> {
  const { data: actor } = await admin
    .from('user_profiles')
    .select('role, full_name, co_implementer_id, engagement_client_id, funder_programme_id')
    .eq('id', userId)
    .single()

  if (!actor) return { role: null, fullName: null, canView: false, canManage: false }

  const role: string | null = actor.role ?? null
  const fullName: string | null = actor.full_name ?? null

  if (role === 'super_coach') {
    return { role, fullName, canView: true, canManage: true }
  }

  let canView = false
  let canManage = false

  // The client's own users (for example the Executive Director).
  if (actor.engagement_client_id && actor.engagement_client_id === clientId) {
    canView = true
  }

  // An assigned co-implementer manages their own clients.
  if (role === 'coach' && actor.co_implementer_id) {
    const { data: ci } = await admin
      .from('co_implementers')
      .select('client_ids')
      .eq('id', actor.co_implementer_id)
      .single()
    if (Array.isArray(ci?.client_ids) && ci!.client_ids.includes(clientId)) {
      canView = true
      canManage = true
    }
  }

  // The programme funder can view, but never manage.
  if (role === 'funder' && actor.funder_programme_id) {
    const { data: client } = await admin
      .from('engagement_clients')
      .select('programme_id')
      .eq('id', clientId)
      .maybeSingle()
    if (client?.programme_id && client.programme_id === actor.funder_programme_id) {
      canView = true
    }
  }

  return { role, fullName, canView, canManage }
}
