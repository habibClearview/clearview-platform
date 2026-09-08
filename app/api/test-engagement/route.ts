// ============================================================
// API ROUTE: /api/test-engagement
//
// Creates, checks and removes the engagement that exists to be broken, so no
// check ever runs against a client's own record again. See
// src/lib/test-engagement.ts for why it exists and what the rule is.
//
// THREE ACTIONS.
//   create  makes the test programme, the test engagement and the three test
//           logins, and returns each login's one-time link once. Everything is
//           create-if-absent, so pressing it twice is safe.
//   check   signs in as each test login against the real database with the
//           public key, walks what they are supposed to be able to read, and
//           attempts every write they must not be able to make. It reports
//           each attempt as safe or as a hole. This is the check that found
//           three real holes on 8 September, pointed somewhere it can do no
//           harm.
//   remove  deletes the three logins and the test engagement.
//
// IT CANNOT BE POINTED AT A CLIENT. Every action resolves the engagement by
// the fixed test slug and refuses anything else, and remove refuses to delete
// an account whose address is not one of the three.
//
// Lead consultant only.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient, getBearerToken } from '@/lib/auth/api-authz'
import { GATES } from '@/lib/gtcv-gates'
import {
  TEST_SLUG, TEST_CLIENT_NAME, TEST_PROGRAMME_NAME, TEST_LOGINS,
  isTestLogin, refuseUnlessTestEngagement, testPassword,
} from '@/lib/test-engagement'

export const dynamic = 'force-dynamic'

type Action = 'create' | 'check' | 'remove'

/** The lead consultant, and nobody else. */
async function requireSuperCoach(req: NextRequest, admin: ReturnType<typeof getAdminClient>) {
  const token = getBearerToken(req)
  if (!token) return { ok: false as const, error: 'Not authenticated', status: 401 }
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return { ok: false as const, error: 'Not authenticated', status: 401 }
  const { data: profile } = await admin
    .from('user_profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'super_coach') {
    return { ok: false as const, error: 'Only the lead consultant can run the test engagement', status: 403 }
  }
  return { ok: true as const, userId: user.id }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { action?: Action }
    const action: Action = body.action === 'check' || body.action === 'remove' ? body.action : 'create'

    const admin = getAdminClient()
    const auth = await requireSuperCoach(req, admin)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    // The rule, stated before anything is touched, every time.
    const refusal = refuseUnlessTestEngagement(TEST_SLUG)
    if (refusal) return NextResponse.json({ error: refusal }, { status: 400 })

    if (action === 'create') return NextResponse.json(await create(admin))
    if (action === 'remove') return NextResponse.json(await remove(admin))
    return NextResponse.json(await check(admin))
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Something went wrong'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─── create ──────────────────────────────────────────────────

async function create(admin: ReturnType<typeof getAdminClient>) {
  const made: string[] = []

  // The programme, so a funder login has something to be scoped to.
  let { data: programme } = await admin
    .from('programmes').select('id').eq('name', TEST_PROGRAMME_NAME).maybeSingle()
  if (!programme) {
    const { data, error } = await admin
      .from('programmes').insert({ name: TEST_PROGRAMME_NAME }).select('id').single()
    if (error) throw new Error(`the test programme could not be made (${error.message})`)
    programme = data
    made.push('programme')
  }

  // The engagement.
  let { data: client } = await admin
    .from('engagement_clients').select('id, slug').eq('slug', TEST_SLUG).maybeSingle()
  if (!client) {
    const { data, error } = await admin.from('engagement_clients').insert({
      name: TEST_CLIENT_NAME,
      slug: TEST_SLUG,
      engagement_mode: 'canvas',
      programme_id: programme?.id || null,
      status: 'active',
    }).select('id, slug').single()
    if (error) throw new Error(`the test engagement could not be made (${error.message})`)
    client = data
    made.push('engagement')
  }

  // The gates, so there is something a client must not be able to move.
  const { data: existingGates } = await admin
    .from('canvas_decision_points').select('dp_id').eq('client_id', client.id)
  if (!existingGates || existingGates.length === 0) {
    // The same shape /api/engagement-setup writes, so the fixture and a real
    // engagement are the same thing to every query underneath.
    const rows = GATES.map((g, i) => ({
      id: `${client!.id}-${g.id}`,
      client_id: client!.id,
      dp_id: g.id,
      label: g.label,
      status: 'not_started',
      sort_order: i + 1,
    }))
    const { error } = await admin.from('canvas_decision_points').insert(rows)
    if (error) throw new Error(`the test gates could not be made (${error.message})`)
    made.push(`${rows.length} gates`)
  }

  // The three logins.
  const logins: { email: string; role: string; password: string; proves: string; created: boolean }[] = []
  for (const person of TEST_LOGINS) {
    const password = testPassword()
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existing = (list?.users || []).find(
      (u: { email?: string }) => (u.email || '').toLowerCase() === person.email,
    ) as { id: string } | undefined

    let userId = existing?.id
    let created = false
    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({
        email: person.email,
        password,
        email_confirm: true,
      })
      if (error) throw new Error(`${person.email} could not be created (${error.message})`)
      userId = data.user?.id
      created = true
    } else {
      // A login left behind by an earlier run gets a fresh password rather than
      // a guessable one.
      await admin.auth.admin.updateUserById(userId, { password })
    }

    const { error: profErr } = await admin.from('user_profiles').upsert({
      id: userId,
      role: person.role,
      full_name: person.fullName,
      email: person.email,
      engagement_client_id: person.role === 'funder' ? null : client.id,
      funder_programme_id: person.role === 'funder' ? programme?.id || null : null,
      assigned_unit_ids: [],
      co_implementer_id: null,
      status: 'active',
    }, { onConflict: 'id' })
    if (profErr) throw new Error(`${person.email} has no profile (${profErr.message})`)

    logins.push({ email: person.email, role: person.role, password, proves: person.proves, created })
  }

  return {
    ok: true,
    slug: TEST_SLUG,
    clientId: client.id,
    made: made.length ? made : ['nothing, it was all already there'],
    logins,
    note: 'These passwords are shown once and stored nowhere. Run create again for new ones.',
  }
}

// ─── check ───────────────────────────────────────────────────

interface Attempt { what: string; safe: boolean; detail: string }

async function check(admin: ReturnType<typeof getAdminClient>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('The public keys are not configured, so a real sign-in cannot be made')

  const { data: client } = await admin
    .from('engagement_clients').select('id, name, status').eq('slug', TEST_SLUG).maybeSingle()
  if (!client) {
    return { ok: false, error: 'The test engagement does not exist yet. Press Create first.' }
  }

  // A fresh password, so this can run without anybody holding one.
  const password = testPassword()
  const person = TEST_LOGINS[0]
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  const existing = (list?.users || []).find(
    (u: { email?: string }) => (u.email || '').toLowerCase() === person.email,
  ) as { id: string } | undefined
  if (!existing) return { ok: false, error: 'The test logins do not exist yet. Press Create first.' }
  await admin.auth.admin.updateUserById(existing.id, { password })

  const asClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: signInError } = await asClient.auth.signInWithPassword({ email: person.email, password })
  if (signInError) return { ok: false, error: `The test client could not sign in (${signInError.message})` }

  const reads: Attempt[] = []
  const writes: Attempt[] = []

  // What they must be able to read.
  const engagement = await asClient.from('engagement_clients').select('id, name').eq('id', client.id)
  reads.push({
    what: 'they can read their own engagement',
    safe: !engagement.error && (engagement.data?.length || 0) === 1,
    detail: engagement.error?.message || `${engagement.data?.length || 0} row(s)`,
  })

  const gates = await asClient.from('canvas_decision_points').select('dp_id, status').eq('client_id', client.id)
  reads.push({
    what: 'they can read their decision gates',
    safe: !gates.error && (gates.data?.length || 0) > 0,
    detail: gates.error?.message || `${gates.data?.length || 0} gate(s)`,
  })

  const others = await asClient.from('engagement_clients').select('id').neq('id', client.id)
  reads.push({
    what: 'they cannot see anybody else’s engagement',
    safe: !others.error && (others.data?.length || 0) === 0,
    detail: others.error?.message || `${others.data?.length || 0} other engagement(s) visible`,
  })

  // What they must not be able to write. Each is attempted for real and the
  // result read back, because an update that changes no rows returns no error.
  const firstGate = gates.data?.[0]?.dp_id
  if (firstGate) {
    await asClient.from('canvas_decision_points')
      .update({ status: 'complete' }).eq('client_id', client.id).eq('dp_id', firstGate)
    const after = await admin.from('canvas_decision_points')
      .select('status').eq('client_id', client.id).eq('dp_id', firstGate).maybeSingle()
    const moved = after.data?.status === 'complete'
    writes.push({
      what: 'they cannot mark their own decision gate complete',
      safe: !moved,
      detail: moved ? `HOLE: ${firstGate} is now complete` : `${firstGate} stayed ${after.data?.status}`,
    })
    if (moved) {
      await admin.from('canvas_decision_points')
        .update({ status: 'not_started' }).eq('client_id', client.id).eq('dp_id', firstGate)
    }
  }

  await asClient.from('engagement_clients').update({ name: 'renamed by the client' }).eq('id', client.id)
  const afterName = await admin.from('engagement_clients').select('name').eq('id', client.id).maybeSingle()
  const renamed = afterName.data?.name !== client.name
  writes.push({
    what: 'they cannot rename their engagement',
    safe: !renamed,
    detail: renamed ? 'HOLE: the name changed' : 'the name held',
  })
  if (renamed) await admin.from('engagement_clients').update({ name: client.name }).eq('id', client.id)

  await asClient.from('engagement_clients').update({ status: 'complete' }).eq('id', client.id)
  const afterStatus = await admin.from('engagement_clients').select('status').eq('id', client.id).maybeSingle()
  const restatused = afterStatus.data?.status !== client.status
  writes.push({
    what: 'they cannot change their engagement status',
    safe: !restatused,
    detail: restatused ? 'HOLE: the status changed' : 'the status held',
  })
  if (restatused) await admin.from('engagement_clients').update({ status: client.status }).eq('id', client.id)

  await asClient.auth.signOut()

  const holes = writes.filter((w) => !w.safe)
  const unreadable = reads.filter((r) => !r.safe)
  return {
    ok: holes.length === 0 && unreadable.length === 0,
    slug: TEST_SLUG,
    reads,
    writes,
    summary: holes.length
      ? `${holes.length} hole(s): ${holes.map((h) => h.what).join('; ')}`
      : unreadable.length
        ? `every forbidden write was refused, but ${unreadable.length} thing(s) they should be able to read came back empty`
        : 'every read worked and every forbidden write was refused',
  }
}

// ─── remove ──────────────────────────────────────────────────

async function remove(admin: ReturnType<typeof getAdminClient>) {
  const removed: string[] = []
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  for (const user of list?.users || []) {
    const email = (user as { email?: string }).email || ''
    // The guard that matters: never delete an account this fixture did not make.
    if (!isTestLogin(email)) continue
    await admin.from('user_profiles').delete().eq('id', (user as { id: string }).id)
    await admin.auth.admin.deleteUser((user as { id: string }).id)
    removed.push(email)
  }

  const { data: client } = await admin
    .from('engagement_clients').select('id').eq('slug', TEST_SLUG).maybeSingle()
  if (client) {
    await admin.from('canvas_decision_points').delete().eq('client_id', client.id)
    await admin.from('engagement_clients').delete().eq('id', client.id)
    removed.push(TEST_SLUG)
  }

  return { ok: true, removed: removed.length ? removed : ['nothing, there was nothing there'] }
}
