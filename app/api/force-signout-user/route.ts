// ============================================================
// API ROUTE: /api/force-signout-user
// Force-revokes EVERY active session for one chosen user (lost device,
// offboarding). Reversible — the user can simply sign in again.
//
// The actual revoke runs in the SECURITY DEFINER function
// public.admin_force_signout (see the 2026_07_19 migration), which is the
// only path able to touch auth.sessions and is granted to service_role
// alone. This route is the gatekeeper: it authenticates the requester,
// resolves BOTH the requester and the target from the database (never
// trusting a role or tenant sent by the browser), and only then calls it.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { canForceSignout } from '@/lib/auth/force-signout-authz'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const { targetUserId, requesterToken } = await req.json() as { targetUserId: string; requesterToken: string }
    if (!targetUserId || !requesterToken) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const admin = getAdminClient()

    // 1) Authenticate the requester from their token.
    const { data: { user }, error: authErr } = await admin.auth.getUser(requesterToken)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // 2) Resolve requester and target profiles server-side.
    const { data: actor } = await admin
      .from('user_profiles')
      .select('role, engagement_client_id')
      .eq('id', user.id)
      .single()
    if (!actor) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

    const { data: target } = await admin
      .from('user_profiles')
      .select('role, engagement_client_id')
      .eq('id', targetUserId)
      .single()
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // 3) Authorise (super_coach anywhere; ceo/finance_manager within their own
    //    organisation only — see canForceSignout for the exact rule).
    if (!canForceSignout(actor, target)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // 4) Revoke every session for the target.
    const { data: revoked, error: rpcErr } = await admin.rpc('admin_force_signout', { target_user_id: targetUserId })
    if (rpcErr) {
      // Log the real cause server-side; return a generic message to the browser.
      console.error('Force signout RPC error:', rpcErr)
      return NextResponse.json({ error: 'Could not sign this user out.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, sessionsRevoked: typeof revoked === 'number' ? revoked : 0 })
  } catch (err) {
    console.error('Force signout error:', err)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
