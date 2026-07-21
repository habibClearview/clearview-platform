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

    // 2) Re-derive role server-side. The co_implementers table is a single
    //    super_coach-scoped team (its RLS is `using (my_role() = 'super_coach')`,
    //    with no per-coach owner column), so the super_coach role IS the boundary
    //    here, consistent with every other co_implementers operation in the app.
    const { data: actor, error: actorErr } = await admin
      .from('user_profiles').select('role').eq('id', user.id).single()
    if (actorErr || !actor || actor.role !== 'super_coach') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // 3) PRE-FLIGHT (no mutations yet): refuse up front if any financial record
    //    references this person. Doing this first means we never start deleting
    //    only to hit a foreign-key wall halfway — either the whole removal is
    //    safe to proceed, or nothing is touched at all.
    const financialTables = ['coach_timesheet_entries', 'coach_expenses', 'coach_advances', 'coach_invoices']
    for (const table of financialTables) {
      const { count, error: countErr } = await admin
        .from(table).select('id', { count: 'exact', head: true }).eq('co_implementer_id', coImplementerId)
      if (countErr) { console.error(`remove-co-implementer: ${table} check failed`, countErr.message); return NextResponse.json({ error: 'Could not verify this team member’s records — please try again.' }, { status: 500 }) }
      if ((count || 0) > 0) {
        return NextResponse.json({
          error: 'This team member has timesheets, expenses, advances or invoices on record, so they can’t be permanently removed. Set them to Inactive instead.',
        }, { status: 409 })
      }
    }

    // 4) Safe to proceed. Remove any login issued to them FIRST (auth user, then
    //    profile row), because user_profiles.co_implementer_id references the
    //    record we delete last. If an auth deletion fails, we abort BEFORE
    //    deleting the record, leaving a consistent state (nothing removed).
    const { data: linked } = await admin
      .from('user_profiles').select('id').eq('co_implementer_id', coImplementerId)
    for (const p of (linked || [])) {
      const { error: authDelErr } = await admin.auth.admin.deleteUser(p.id)
      if (authDelErr && !/not found/i.test(authDelErr.message || '')) {
        console.error('remove-co-implementer: auth delete failed', authDelErr.message)
        return NextResponse.json({ error: 'Could not remove this team member’s login. Nothing was deleted — please try again.' }, { status: 500 })
      }
      // Remove the profile row too (a no-op if deleting the auth user already
      // cascaded it away).
      await admin.from('user_profiles').delete().eq('id', p.id)
    }

    // 5) Finally delete the record. Its blocking references are now gone.
    const { error: delErr } = await admin.from('co_implementers').delete().eq('id', coImplementerId)
    if (delErr) {
      console.error('remove-co-implementer: delete failed', delErr.message)
      return NextResponse.json({ error: 'Could not remove this team member. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('remove-co-implementer: unexpected error', e)
    return NextResponse.json({ error: 'Could not remove this team member' }, { status: 500 })
  }
}
