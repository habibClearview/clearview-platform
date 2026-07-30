// ============================================================
// API ROUTE: /api/admin-set-password
// Server-side only — uses the service role key (never in browser).
//
// Lets a manager set a TEMPORARY password for a user they administer, to be
// read out / sent to that user, for when the person cannot use the emailed
// "Forgot password?" link themselves (e.g. the email isn't reaching them).
// The invite route already tells users "ask your Clearview coach to reset it" —
// this is the mechanism that promise implied.
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
import { randomBytes } from 'crypto'
import { writeAuditLog, auditIp } from '@/lib/audit-log'
import { checkRateLimit } from '@/lib/rate-limit'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Readable, unambiguous temporary password: 3 groups of 4 (e.g. Kd7m-Rp9x-Tn4w).
// Excludes 0/O/1/l/I to avoid confusion when read out over the phone.
function genTempPassword(): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(12)
  let out = ''
  for (let i = 0; i < 12; i++) out += charset[bytes[i] % charset.length]
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`
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

    // Verify the requester's identity via their JWT.
    const { data: { user: actor }, error: authErr } = await admin.auth.getUser(requesterToken)
    if (authErr || !actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // Rate-limit: a reset changes someone's credentials — cap per actor per hour.
    const rl = await checkRateLimit(admin, `admin-set-password:${actor.id}`, 20, 3600)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many password resets. Please wait a while before doing more.' },
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

    const tempPassword = genTempPassword()
    const { error: updErr } = await admin.auth.admin.updateUserById(targetUserId, { password: tempPassword })
    if (updErr) {
      return NextResponse.json({ error: `Could not set the password: ${updErr.message}` }, { status: 400 })
    }

    await writeAuditLog(admin, {
      actorId: actor.id, actorEmail: actor.email, actorRole,
      action: 'user.password_set_temp',
      targetId: targetUserId, targetEmail: targetProfile.email,
      detail: { engagement_client_id: targetProfile.engagement_client_id ?? null },
      ip: auditIp(req.headers),
    })

    return NextResponse.json({
      success: true,
      tempPassword,
      email: targetProfile.email,
      name: targetProfile.full_name,
    })
  } catch (err) {
    console.error('admin-set-password error:', err)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
