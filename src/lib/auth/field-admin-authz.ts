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
  /** The "Manage Field Catalogue" delegation flag a CEO can grant to a non-CEO/FM. */
  can_manage_catalogue?: boolean | null
}

/**
 * Verify the request's Bearer token and return the caller's profile
 * (role + engagement_client_id + delegation flag), or null if unauthenticated
 * / no profile. can_manage_catalogue is loaded too so the write-role helpers
 * below can honour the same delegation the dashboard UI grants.
 */
export async function resolveFieldAdminActor(admin: SupabaseClient, req: NextRequest): Promise<FieldAdminActor | null> {
  const header = req.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) return null
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await admin
    .from('user_profiles')
    .select('role, engagement_client_id, can_manage_catalogue')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  return profile as FieldAdminActor
}

/**
 * True when this actor may act on the given business (engagement client id).
 * A super_coach may act on any business; everyone else only on their own.
 *
 * This is TENANT SCOPE only (which business) — NOT a role/operation check.
 * Whether the caller may WRITE (vs merely belong to the client) is a separate
 * decision made by the helpers below, matching the dashboard's own permission
 * model in app/dashboard/[slug]/page.tsx. A service-role write route must pass
 * BOTH: actorMayAccessClient (right tenant) AND the relevant write-role helper.
 */
export function actorMayAccessClient(actor: FieldAdminActor, clientId: string | null | undefined): boolean {
  if (actor.role === 'super_coach') return true
  return !!clientId && !!actor.engagement_client_id && actor.engagement_client_id === clientId
}

// ── Operation-level write-role gates ────────────────────────────────────────
// These mirror, server-side, the exact capability sets the dashboard derives in
// app/dashboard/[slug]/page.tsx, so a route never rejects a caller the UI shows
// the control to, and never accepts one it doesn't. Tenant scope is checked
// separately (actorMayAccessClient) — these answer "may this role do THIS?".

const TEAM_ROLES = new Set(['super_coach', 'ceo'])
const CATALOGUE_ROLES = new Set(['super_coach', 'ceo', 'finance_manager'])
const ACTUALS_ROLES = new Set(['super_coach', 'coach', 'ceo', 'finance_manager', 'unit_head', 'accounts_assistant'])

/** Manage team / operators — page.tsx canManageTeam: super_coach or ceo. */
export function actorMayManageTeam(actor: FieldAdminActor): boolean {
  return TEAM_ROLES.has(actor.role)
}

/**
 * Manage the field catalogue and its sibling client-config lists (catalogue
 * items, segments, locations, loss reasons, stock movements) — page.tsx
 * canManageCatalogue: super_coach / ceo / finance_manager, OR any user granted
 * the "Manage Field Catalogue" delegation flag.
 */
export function actorMayManageCatalogue(actor: FieldAdminActor): boolean {
  return CATALOGUE_ROLES.has(actor.role) || actor.can_manage_catalogue === true
}

/** Enter / categorise actuals & costs — page.tsx canEnterActuals. */
export function actorMayEnterActuals(actor: FieldAdminActor): boolean {
  return ACTUALS_ROLES.has(actor.role)
}
