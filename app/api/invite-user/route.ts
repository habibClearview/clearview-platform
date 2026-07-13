// ============================================================
// API ROUTE: /api/invite-user
// Server-side only — uses service role key (never in browser)
// Called by the CEO/Finance Manager when inviting a new user
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// This route runs on Vercel's server — the service key is safe here
function getAdminClient() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      email: string
      fullName: string
      role: string
      clientId: string | null
      assignedUnitIds: string[]
      // 'coach' invites: which co_implementers roster row this login is.
      coImplementerId: string | null
      // 'funder' invites: which programme this login is scoped to.
      funderProgrammeId: string | null
      inviterToken: string  // JWT of the person doing the inviting — we verify their role
    }

    const { email, fullName, role, clientId, assignedUnitIds, coImplementerId, funderProgrammeId, inviterToken } = body

    // Validate inputs. clientId is only required for the client-side
    // roles; coach/funder are scoped by coImplementerId/funderProgrammeId
    // instead (a coach/funder isn't "of" any one client).
    if (!email || !fullName || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (['ceo', 'finance_manager', 'unit_head', 'accounts_assistant'].includes(role) && !clientId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (role === 'coach' && !coImplementerId) {
      return NextResponse.json({ error: 'Select which co-implementer this login is for' }, { status: 400 })
    }
    if (role === 'funder' && !funderProgrammeId) {
      return NextResponse.json({ error: 'Select which programme this funder login is scoped to' }, { status: 400 })
    }

    const validRoles = ['ceo', 'finance_manager', 'unit_head', 'accounts_assistant', 'coach', 'funder']
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    const admin = getAdminClient()

    // Verify the inviter's identity and role using their JWT
    const { data: { user: inviter }, error: authErr } = await admin.auth.getUser(inviterToken)
    if (authErr || !inviter) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get inviter's profile to check their role
    const { data: inviterProfile } = await admin
      .from('user_profiles')
      .select('role, client_id')
      .eq('id', inviter.id)
      .single()

    if (!inviterProfile) {
      return NextResponse.json({ error: 'Inviter profile not found' }, { status: 403 })
    }

    // Permission check:
    // - super_coach can invite anyone, including coach (co-implementer)
    //   and funder logins -- only the coach hands those out
    // - CEO can invite finance_manager, unit_head, accounts_assistant (not another CEO)
    // - finance_manager can invite unit_head and accounts_assistant only
    const inviterRole = inviterProfile.role
    const canInvite =
      inviterRole === 'super_coach' ||
      (inviterRole === 'ceo' && ['finance_manager', 'unit_head', 'accounts_assistant'].includes(role)) ||
      (inviterRole === 'finance_manager' && ['unit_head', 'accounts_assistant'].includes(role))

    if (!canInvite) {
      return NextResponse.json({ error: 'You do not have permission to assign this role' }, { status: 403 })
    }

    // CEO/finance_manager can only invite within their own client
    if (inviterRole !== 'super_coach' && clientId && inviterProfile.client_id !== clientId) {
      return NextResponse.json({ error: 'Cannot invite users to a different organisation' }, { status: 403 })
    }

    // coach/funder logins land on the Coach Dashboard shell, not a
    // single client's /dashboard/conas -- everything else keeps its
    // existing redirect exactly as before.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clearview.habibonifade.com'
    const redirectTo = (role === 'coach' || role === 'funder') ? `${appUrl}/coach` : `${appUrl}/dashboard/conas`

    // Send the invitation email via Supabase Auth admin API
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        full_name: fullName,
        role,
        client_id: clientId,
      },
    })

    if (inviteErr) {
      // Handle "user already exists" gracefully
      if (inviteErr.message.includes('already been registered')) {
        return NextResponse.json({ error: 'This email address already has an account. Contact your administrator.' }, { status: 409 })
      }
      return NextResponse.json({ error: inviteErr.message }, { status: 400 })
    }

    if (!inviteData?.user) {
      return NextResponse.json({ error: 'Invitation failed — no user returned' }, { status: 500 })
    }

    // Create the user_profile record immediately
    // (the user can log in once they accept the invite)
    const { error: profileErr } = await admin
      .from('user_profiles')
      .upsert({
        id: inviteData.user.id,
        client_id: clientId || null,
        role,
        full_name: fullName,
        assigned_unit_ids: assignedUnitIds || [],
        co_implementer_id: role === 'coach' ? coImplementerId : null,
        funder_programme_id: role === 'funder' ? funderProgrammeId : null,
      })

    if (profileErr) {
      console.error('Profile creation error:', profileErr)
      // Don't fail — the invite was sent, profile can be fixed manually
    }

    return NextResponse.json({
      success: true,
      message: `Invitation sent to ${email}. They will receive an email to set their password.`,
      userId: inviteData.user.id,
    })

  } catch (err) {
    console.error('Invite error:', err)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
