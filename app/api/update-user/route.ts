import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { canModifyUserRole, canManageUnits, canDeactivateUsers } from '@/lib/auth/assignable-roles'
import { writeAuditLog, auditIp } from '@/lib/audit-log'

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
    const { data: tp, error: tpErr } = await admin.from('user_profiles').select('role, engagement_client_id').eq('id', targetUserId).single()
    if (tpErr || !tp) { if (tpErr) console.error('Update user target lookup error:', tpErr); return NextResponse.json({ error: 'User not found' }, { status: 404 }) }
    const sameTenant = rp.role === 'super_coach' || (!!rp.engagement_client_id && rp.engagement_client_id === tp.engagement_client_id)
    if (!sameTenant) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const canUnits = canManageUnits(rp.role)
    const canDeactivate = canDeactivateUsers(rp.role)

    // Reject unauthorized requests explicitly rather than silently ignoring the
    // field and returning success (which would mislead the caller into thinking
    // the change applied).
    if (updates.active !== undefined && !canDeactivate) {
      return NextResponse.json({ error: 'You are not permitted to change this user’s active status.' }, { status: 403 })
    }
    if (updates.assigned_unit_ids !== undefined && !canUnits) {
      return NextResponse.json({ error: 'You are not permitted to change this user’s unit assignments.' }, { status: 403 })
    }

    const updateData: Record<string, unknown> = {}
    if (updates.full_name) updateData.full_name = updates.full_name
    if (updates.assigned_unit_ids !== undefined) updateData.assigned_unit_ids = updates.assigned_unit_ids
    // Role changes are the privilege-escalation surface. Validate BOTH the
    // target's current role and the requested new role against what this actor
    // may administer (a CEO can staff their org but never touch a peer CEO or a
    // super_coach, and never mint one), and never let anyone change their own
    // role. Previously any role string was accepted for a ceo/super_coach actor,
    // and the target's current role wasn't checked — so a CEO could make someone
    // super_coach, or a finance_manager could demote a CEO.
    if (updates.role) {
      if (targetUserId === user.id) {
        return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 403 })
      }
      if (!canModifyUserRole(rp.role, tp.role, updates.role)) {
        return NextResponse.json({ error: 'You are not permitted to change this user’s role.' }, { status: 403 })
      }
      updateData.role = updates.role
    }

    // Only write the profile when there is actually something to change — an
    // empty .update({}) is rejected by PostgREST. Scope by engagement_client_id
    // (TEXT), not the legacy client_id UUID.
    if (Object.keys(updateData).length > 0) {
      let upd = admin.from('user_profiles').update(updateData).eq('id', targetUserId)
      if (rp.role !== 'super_coach') upd = upd.eq('engagement_client_id', rp.engagement_client_id)
      const { error: ue } = await upd
      if (ue) { console.error('Update user error:', ue); return NextResponse.json({ error: 'Could not update this user.' }, { status: 500 }) }
      // Record the change. A role change is the privilege-sensitive one, so
      // capture the before/after explicitly.
      await writeAuditLog(admin, {
        actorId: user.id, actorEmail: user.email, actorRole: rp.role,
        action: updates.role ? 'user.role_changed' : 'user.updated',
        targetId: targetUserId,
        detail: {
          ...(updates.role ? { role_from: tp.role, role_to: updates.role } : {}),
          ...(updates.full_name ? { full_name_changed: true } : {}),
          ...(updates.assigned_unit_ids !== undefined ? { assigned_unit_ids: updates.assigned_unit_ids } : {}),
        },
        ip: auditIp(req.headers),
      })
    }

    // Deactivate / reactivate via a ban window. Surface a failure instead of
    // returning a false success if the Auth admin call errors.
    if (updates.active === false) {
      const { error: be } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: '876000h' })
      if (be) { console.error('Deactivate (ban) error:', be); return NextResponse.json({ error: 'Could not deactivate this user.' }, { status: 500 }) }
      await writeAuditLog(admin, {
        actorId: user.id, actorEmail: user.email, actorRole: rp.role,
        action: 'user.deactivated', targetId: targetUserId, ip: auditIp(req.headers),
      })
    }
    if (updates.active === true) {
      const { error: be } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: 'none' })
      if (be) { console.error('Reactivate (unban) error:', be); return NextResponse.json({ error: 'Could not reactivate this user.' }, { status: 500 }) }
      await writeAuditLog(admin, {
        actorId: user.id, actorEmail: user.email, actorRole: rp.role,
        action: 'user.reactivated', targetId: targetUserId, ip: auditIp(req.headers),
      })
    }
    return NextResponse.json({ success: true })
  } catch (err) { console.error(err); return NextResponse.json({ error: 'Unexpected error' }, { status: 500 }) }
}
