// ============================================================
// API ROUTE: /api/admin-reset-link
// Server-side only — uses the service role key (never in browser).
//
// Best-practice "reset on behalf of a user": generates a one-time password
// RECOVERY link that the manager can hand to the user through any channel
// (WhatsApp, SMS, read out in person). The user clicks it and sets THEIR OWN
// password on /reset-password — the manager never sees or sets the password.
// This also solves the real-world case the emailed "Forgot password?" flow
// can't: when the recovery email simply isn't reaching the user, the manager
// delivers the link directly.
//
// The invite route already tells users "ask your Clearview coach to reset it";
// this is that mechanism, done the right way (no admin-known credential).
//
// Authz mirrors /api/invite-user exactly:
//   * super_coach may reset anyone
//   * CEO / Finance Manager may reset only CLIENT-role users in their OWN
//     engagement client (never a coach / funder / super_coach, never a
//     different organisation)
//   * never yourself (use the normal Settings flow for your own password)
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog, auditIp } from '@/lib/audit-log'
import { checkRateLimit } from '@/lib/rate-limit'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Where the recovery link lands after the user clicks it — the same
// /reset-password page the login "Forgot password?" uses. Mirrors
// invite-user's base-URL resolution so a staging deploy never points at
// production and vice-versa.
function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/+$/, '')
  const vercelEnv = process.env.VERCEL_ENV
  const vercelUrl = process.env.VERCEL_URL
  if (vercelEnv && vercelEnv !== 'production' && vercelUrl) return `https://${vercelUrl}`
  return 'https://clearview.habibonifade.com'
}

const CLIENT_ROLES = ['ceo', 'finance_manager', 'unit_head', 'accounts_assistant']

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { targetUserId: string; requesterToken: string }
    const { targetUserId, requesterToken } = body
    if (!targetUserId || !requesterToken) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const admin = getAdminClient()

    const { data: { user: actor }, error: authErr } = await admin.auth.getUser(requesterToken)
    if (authErr || !actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const rl = await checkRateLimit(admin, `admin-reset-link:${actor.id}`, 20, 3600)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many reset links generated. Please wait a while before doing more.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

    if (actor.id === targetUserId) {
      return NextResponse.json({ error: 'Use Settings to change your own password.' }, { status: 400 })
    }

    const { data: actorProfile } = await admin
      .from('user_profiles').select('role, engagement_client_id').eq('id', actor.id).single()
    if (!actorProfile) return NextResponse.json({ error: 'Requester profile not found' }, { status: 403 })

    const { data: targetProfile } = await admin
      .from('user_profiles').select('role, engagement_client_id, email, full_name').eq('id', targetUserId).single()
    if (!targetProfile) return NextResponse.json({ error: 'That user was not found' }, { status: 404 })
    if (!targetProfile.email) return NextResponse.json({ error: 'That user has no email on file.' }, { status: 400 })

    const actorRole = actorProfile.role
    const canReset =
      actorRole === 'super_coach' ||
      ((actorRole === 'ceo' || actorRole === 'finance_manager')
        && !!actorProfile.engagement_client_id
        && actorProfile.engagement_client_id === targetProfile.engagement_client_id
        && CLIENT_ROLES.includes(targetProfile.role))
    if (!canReset) {
      return NextResponse.json({ error: 'You do not have permission to reset this user’s password.' }, { status: 403 })
    }

    // Generate (do NOT auto-email) a one-time recovery link the manager delivers
    // themselves. The user sets their own password when they open it.
    const { data, error: genErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: targetProfile.email,
      options: { redirectTo: `${appBaseUrl()}/reset-password` },
    })
    if (genErr || !data?.properties?.action_link) {
      return NextResponse.json({ error: `Could not generate a reset link${genErr ? `: ${genErr.message}` : ''}` }, { status: 400 })
    }

    await writeAuditLog(admin, {
      actorId: actor.id, actorEmail: actor.email, actorRole,
      action: 'user.reset_link_generated',
      targetId: targetUserId, targetEmail: targetProfile.email,
      detail: { engagement_client_id: targetProfile.engagement_client_id ?? null },
      ip: auditIp(req.headers),
    })

    return NextResponse.json({
      success: true,
      link: data.properties.action_link,
      email: targetProfile.email,
      name: targetProfile.full_name,
    })
  } catch (err) {
    console.error('admin-reset-link error:', err)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
