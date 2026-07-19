import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { canAssignRole } from '@/lib/auth/assignable-roles'

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  try {
    const { targetUserId, updates, requesterToken } = await req.json() as { targetUserId: string; updates: { role?: string; assigned_unit_ids?: string[]; full_name?: string; active?: boolean }; requesterToken: string }
    const admin = getAdminClient()
    const { data: { user }, error: authErr } = await admin.auth.getUser(requesterToken)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: rp } = await admin.from('user_profiles').select('role, engagement_client_id').eq('id', user.id).single()
    if (!rp) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

    // Resolve the TARGET server-side and enforce tenant scope on every action.
    // A super_coach may act on anyone; everyone else is confined to a target in
    // their own organisation. (Previously the profile UPDATE was scoped but the
    // deactivate/ban action below was not, so a CEO could ban a user in another
    // organisation by passing their id.)
    const { data: tp, error: tpErr } = await admin.from('user_profiles').select('engagement_client_id').eq('id', targetUserId).single()
    if (tpErr || !tp) { if (tpErr) console.error('Update user target lookup error:', tpErr); return NextResponse.json({ error: 'User not found' }, { status: 404 }) }
    const sameTenant = rp.role === 'super_coach' || (!!rp.engagement_client_id && rp.engagement_client_id === tp.engagement_client_id)
    if (!sameTenant) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const canUnits = ['ceo', 'super_coach', 'finance_manager'].includes(rp.role)
    const canDeactivate = ['ceo', 'super_coach'].includes(rp.role)
    const updateData: Record<string, unknown> = {}
    if (updates.full_name) updateData.full_name = updates.full_name
    if (updates.assigned_unit_ids !== undefined && canUnits) updateData.assigned_unit_ids = updates.assigned_unit_ids
    // Role changes are the privilege-escalation surface: validate the TARGET
    // role against what this actor is actually allowed to assign (a CEO can
    // staff their org but never mint a peer CEO or a super_coach), and never
    // let anyone change their own role. Previously any role string was accepted
    // for a ceo/super_coach actor, so a CEO could set someone — or themselves —
    // to super_coach and gain cross-tenant platform admin.
    if (updates.role) {
      if (targetUserId === user.id) {
        return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 403 })
      }
      if (!canAssignRole(rp.role, updates.role)) {
        return NextResponse.json({ error: 'You are not permitted to assign this role.' }, { status: 403 })
      }
      updateData.role = updates.role
    }
    // Scope by engagement_client_id (TEXT), not the legacy client_id UUID.
    let upd = admin.from('user_profiles').update(updateData).eq('id', targetUserId)
    if (rp.role !== 'super_coach') upd = upd.eq('engagement_client_id', rp.engagement_client_id)
    const { error: ue } = await upd
    if (ue) { console.error('Update user error:', ue); return NextResponse.json({ error: 'Could not update this user.' }, { status: 500 }) }
    if (updates.active === false && canDeactivate) await admin.auth.admin.updateUserById(targetUserId, { ban_duration: '876000h' })
    if (updates.active === true && canDeactivate) await admin.auth.admin.updateUserById(targetUserId, { ban_duration: 'none' })
    return NextResponse.json({ success: true })
  } catch (err) { console.error(err); return NextResponse.json({ error: 'Unexpected error' }, { status: 500 }) }
}
