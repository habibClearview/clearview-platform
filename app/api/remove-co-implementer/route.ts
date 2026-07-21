// ============================================================
// API ROUTE: /api/remove-co-implementer
// Permanently removes a co-implementer (a member of the COACH's own team) from
// the system, and any login that was issued to them.
//
// Coach-team membership is owner-level: only a super_coach may manage it (see
// canManageTeam). This route is the gatekeeper — it authenticates the caller,
// re-derives their role from the database (never trusts the browser), and only
// a super_coach may proceed. It deliberately does NOT touch any client's team;
// removing a client's people is the client's own permission, not the coach's.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken } from '@/lib/auth/api-authz'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  try {
    const { coImplementerId } = (await req.json()) as { coImplementerId?: string }
    if (!coImplementerId) return NextResponse.json({ error: 'Missing coImplementerId' }, { status: 400 })

    const token = getBearerToken(req)
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const admin = getAdminClient()

    // 1) Authenticate the caller.
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // 2) Re-derive role server-side; only the owning coach (super_coach) may remove team members.
    const { data: actor, error: actorErr } = await admin
      .from('user_profiles').select('role').eq('id', user.id).single()
    if (actorErr || !actor || actor.role !== 'super_coach') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // 3) Remove any login issued to this co-implementer (their auth user + profile).
    const { data: linked } = await admin
      .from('user_profiles').select('id').eq('co_implementer_id', coImplementerId)
    for (const p of (linked || [])) {
      await admin.auth.admin.deleteUser(p.id).catch((e: any) => console.error('remove-co-implementer: auth delete failed', e?.message))
      await admin.from('user_profiles').delete().eq('id', p.id)
    }

    // 4) Remove the co-implementer record itself. If financial records reference
    //    it (timesheets/invoices with a foreign key), the delete is refused —
    //    surface that plainly rather than silently orphaning money records.
    const { error: delErr } = await admin.from('co_implementers').delete().eq('id', coImplementerId)
    if (delErr) {
      console.error('remove-co-implementer: delete failed', delErr.message)
      return NextResponse.json({
        error: 'Could not remove this team member — they may have timesheets, expenses or invoices on record. Set them to Inactive instead.',
      }, { status: 409 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('remove-co-implementer: unexpected error', e)
    return NextResponse.json({ error: 'Could not remove this team member' }, { status: 500 })
  }
}
