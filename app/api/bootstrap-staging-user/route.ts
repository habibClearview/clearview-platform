// ============================================================
// TEMPORARY ROUTE: /api/bootstrap-staging-user
//
// Creates (or resets) a single sign in on a NON PRODUCTION environment so a
// freshly seeded staging database can be opened at all. Staging uses its own
// Supabase project with throwaway data, so no account exists there yet and
// there is no way in without one.
//
// Three guards, all required:
//   1. Refuses to run when the environment is production.
//   2. Requires a shared secret in the x-bootstrap-secret header, compared
//      with a length safe constant time comparison.
//   3. Only ever touches the single email address passed to it, and only
//      ever grants the super_coach role on this staging data.
//
// DELETE THIS FILE once the login exists. It is a bootstrap, not a feature.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { bootstrapAuthorised, nonProductionOnly } from '@/lib/auth/bootstrap-authz'

export async function POST(req: NextRequest) {
  // Guard 1: never on production.
  if (!nonProductionOnly()) {
    return NextResponse.json({ error: 'Not available on production' }, { status: 403 })
  }

  // Guard 2: shared secret, constant time.
  if (!bootstrapAuthorised(req.headers.get('x-bootstrap-secret'))) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }

  const { email, password, fullName } = (await req.json()) as {
    email?: string; password?: string; fullName?: string
  }
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase is not configured here' }, { status: 500 })
  }
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  // Create the user, or reset the password if the address already exists.
  let userId: string | null = null
  let created = false
  const { data: made, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (made?.user) {
    userId = made.user.id
    created = true
  } else {
    // Already registered: find them and set the password.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const found = list?.users?.find((u) => (u.email || '').toLowerCase() === email.toLowerCase())
    if (!found) {
      return NextResponse.json({ error: createErr?.message || 'Could not create the user' }, { status: 500 })
    }
    userId = found.id
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true })
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // Grant the coach role so the seeded engagement is visible.
  const { error: profErr } = await admin
    .from('user_profiles')
    .upsert({ id: userId, role: 'super_coach', full_name: fullName || 'Coach', status: 'active' }, { onConflict: 'id' })
  if (profErr) {
    return NextResponse.json({ ok: true, created, warning: `Sign in works, but the role was not set: ${profErr.message}` })
  }

  return NextResponse.json({ ok: true, created, email, role: 'super_coach' })
}
