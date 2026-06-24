// ============================================================
// API ROUTE: /api/list-users
// Returns all users for a client — for the user management panel
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const { clientId, requesterToken } = await req.json() as { clientId: string; requesterToken: string }

    const admin = getAdminClient()

    // Verify requester
    const { data: { user }, error: authErr } = await admin.auth.getUser(requesterToken)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: profile } = await admin
      .from('user_profiles')
      .select('role, client_id')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

    // Only CEO, Finance Manager, and super_coach can list users
    if (!['ceo', 'finance_manager', 'super_coach'].includes(profile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Get all profiles for this client
    const { data: profiles, error: profilesErr } = await admin
      .from('user_profiles')
      .select('id, role, full_name, assigned_unit_ids, client_id')
      .eq('client_id', clientId)
      .order('role')

    if (profilesErr) return NextResponse.json({ error: profilesErr.message }, { status: 500 })

    // Get emails from auth.users for each profile
    const userIds = (profiles || []).map(p => p.id)
    const usersWithEmails = await Promise.all(
      userIds.map(async (uid) => {
        const { data: { user: u } } = await admin.auth.admin.getUserById(uid)
        return { id: uid, email: u?.email || '', confirmed: !!u?.email_confirmed_at, lastSignIn: u?.last_sign_in_at }
      })
    )

    const emailMap = Object.fromEntries(usersWithEmails.map(u => [u.id, u]))

    const result = (profiles || []).map(p => ({
      ...p,
      email: emailMap[p.id]?.email || '',
      confirmed: emailMap[p.id]?.confirmed || false,
      lastSignIn: emailMap[p.id]?.lastSignIn || null,
    }))

    return NextResponse.json({ users: result })
  } catch (err) {
    console.error('List users error:', err)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
