import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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
    const canRole = ['ceo', 'super_coach'].includes(rp.role)
    const canUnits = ['ceo', 'super_coach', 'finance_manager'].includes(rp.role)
    const updateData: Record<string, unknown> = {}
    if (updates.full_name) updateData.full_name = updates.full_name
    if (updates.assigned_unit_ids !== undefined && canUnits) updateData.assigned_unit_ids = updates.assigned_unit_ids
    if (updates.role && canRole) updateData.role = updates.role
    // Scope by engagement_client_id (TEXT), not the legacy client_id UUID. A
    // super_coach isn't tied to one client (engagement_client_id is null for
    // them), so they may edit any user; everyone else is confined to their own
    // organisation's users.
    let upd = admin.from('user_profiles').update(updateData).eq('id', targetUserId)
    if (rp.role !== 'super_coach') upd = upd.eq('engagement_client_id', rp.engagement_client_id)
    const { error: ue } = await upd
    if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })
    if (updates.active === false && canRole) await admin.auth.admin.updateUserById(targetUserId, { ban_duration: '876000h' })
    if (updates.active === true && canRole) await admin.auth.admin.updateUserById(targetUserId, { ban_duration: 'none' })
    return NextResponse.json({ success: true })
  } catch (err) { console.error(err); return NextResponse.json({ error: 'Unexpected error' }, { status: 500 }) }
}
