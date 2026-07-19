// ============================================================
// API ROUTE: /api/list-users
// Returns all users for a client — for the user management panel
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'

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
      .select('role, engagement_client_id')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

    // Only CEO, Finance Manager, and super_coach can list users
    if (!['ceo', 'finance_manager', 'super_coach'].includes(profile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // This route fans out to auth.admin.getUserById per member, so it's
    // relatively expensive — cap how often one requester can call it.
    const rl = await checkRateLimit(admin, `list-users:${user.id}`, 60, 60)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

    // Tenant scope: a ceo/finance_manager may only list THEIR OWN client's team.
    // Without this, the role check alone let any ceo/finance_manager read another
    // client's full roster (names, emails, sign-in status) just by passing that
    // client's engagement id. super_coach is the deliberate cross-client
    // exception (their engagement_client_id is null).
    if (profile.role !== 'super_coach' && profile.engagement_client_id !== clientId) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Get all profiles for this client. Scope by engagement_client_id (the TEXT
    // engagement_clients id the coach dashboard passes) — NOT the legacy client_id
    // UUID column, which throws "invalid input syntax for type uuid" when given an
    // engagement id like "client_1784012872580_46doj".
    const { data: profiles, error: profilesErr } = await admin
      .from('user_profiles')
      .select('id, role, full_name, assigned_unit_ids, engagement_client_id')
      .eq('engagement_client_id', clientId)
      .order('role')

    // Log the real DB error server-side; return a generic message so raw
    // PostgREST/schema detail is never leaked to the browser.
    if (profilesErr) { console.error('List users profiles query error:', profilesErr); return NextResponse.json({ error: 'Could not load the team.' }, { status: 500 }) }

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
