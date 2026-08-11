// ============================================================
// API ROUTE: /api/engagement-party
// Adding, editing and removing the people on an engagement.
//
// WHY THIS IS A SERVER ROUTE AND NOT A DIRECT TABLE WRITE. A party row is
// what the signing rules read: who may sign a gate, who may sign the Charter,
// and under whose name. One field in particular, user_id, is the link between
// a named party and a login, and it decides whose Sign button appears. That
// link must be established from the account system rather than typed in, so
// the route resolves it from the party's email address and never accepts a
// user id from the caller. Someone who could set user_id by hand could point
// the Executive Director's party row at their own account and then sign as
// the Executive Director entirely legitimately, which is the same hole the
// signing routes close from the other end.
//
//   POST   add a party
//   PATCH  edit a party
//   DELETE remove a party
//
// All three require manage rights, because the party list decides who holds
// authority on the engagement and that is the lead consultant's to set.
//
// Removing a party who has already signed something is refused. The
// signature is the record that they agreed; deleting the person afterwards
// would leave a signature belonging to nobody.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'

const PARTY_ROLES = [
  'client_funder', 'funder_rep',
  'lsp_ed', 'lsp_leadership', 'lsp_finance', 'lsp_field', 'lsp_board',
  'lead_consultant', 'co_implementer', 'licensed_advisor', 'other',
]


type Admin = ReturnType<typeof getAdminClient>

/**
 * Manage rights on this engagement, through the one shared helper. This used
 * to be a local copy in every route, in slightly different shapes, which is
 * how a fix lands in one place and leaves the hole in six others.
 */
async function requireManager(req: NextRequest, admin: Admin, clientId: string) {
  return requireAccess(req, admin, clientId, 'manage', {
    deniedMessage: 'Only the lead consultant can change who is on this engagement',
    rateLimit: { key: 'engagement-party', max: 120, windowSeconds: 3600 },
  })
}

/**
 * Find the account belonging to this email, if there is one. A party without
 * an account is normal and is not an error: a board chair who never logs in
 * still signs, through the lead consultant recording it in the room.
 */
async function findUserIdByEmail(admin: Admin, email: string): Promise<string | null> {
  const target = email.trim().toLowerCase()
  if (!target) return null
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    const users = data?.users || []
    const hit = users.find((u) => (u.email || '').toLowerCase() === target)
    if (hit) return hit.id
    if (users.length < 200) break
  }
  return null
}

function readBody(body: any) {
  const patch: Record<string, unknown> = {}
  if (typeof body.partyRole === 'string') patch.party_role = body.partyRole
  if (typeof body.name === 'string') patch.name = body.name.trim()
  if (typeof body.email === 'string') patch.email = body.email.trim() || null
  if (typeof body.organisation === 'string') patch.organisation = body.organisation.trim() || null
  if (typeof body.title === 'string') patch.title = body.title.trim() || null
  // R33. The mobile number, so a personal link can reach somebody who has no
  // email address. It is never used to resolve a login: the email is what
  // connects a person to an account and that is left exactly as it was.
  if (typeof body.mobile === 'string') patch.mobile = body.mobile.trim() || null
  if (typeof body.isSignatory === 'boolean') patch.is_signatory = body.isSignatory
  if (Number.isFinite(body.sortOrder)) patch.sort_order = Math.trunc(body.sortOrder)
  return patch
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { clientId } = body as { clientId?: string }
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    const patch = readBody(body)
    if (!patch.name) return NextResponse.json({ error: 'A party needs a name' }, { status: 400 })
    if (!patch.party_role || !PARTY_ROLES.includes(patch.party_role as string)) {
      return NextResponse.json({ error: 'Choose a role for this party' }, { status: 400 })
    }

    const userId = patch.email ? await findUserIdByEmail(admin, patch.email as string) : null

    const { data, error } = await admin
      .from('engagement_parties')
      .insert({ ...patch, client_id: clientId, user_id: userId })
      .select('id')
      .single()
    if (error) {
      console.error('engagement-party POST: write failed', error)
      return NextResponse.json({ error: 'Could not add the party' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, id: data.id, linkedToAccount: Boolean(userId) })
  } catch (e: any) {
    console.error('engagement-party POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not add the party' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { clientId, id } = body as { clientId?: string; id?: string }
    if (!clientId || !id) return NextResponse.json({ error: 'Missing clientId or id' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    const { data: existing } = await admin
      .from('engagement_parties')
      .select('id, client_id, email')
      .eq('id', id)
      .maybeSingle()
    if (!existing || existing.client_id !== clientId) {
      return NextResponse.json({ error: 'That party is not on this engagement' }, { status: 404 })
    }

    const patch = readBody(body)
    if (patch.party_role && !PARTY_ROLES.includes(patch.party_role as string)) {
      return NextResponse.json({ error: 'That is not a role on this engagement' }, { status: 400 })
    }
    if ('name' in patch && !patch.name) {
      return NextResponse.json({ error: 'A party needs a name' }, { status: 400 })
    }

    // The email is the link to an account, so a changed email re-resolves it.
    // Clearing the email clears the link, which is correct: a party with no
    // address has no account to sign from.
    if ('email' in patch && patch.email !== existing.email) {
      patch.user_id = patch.email ? await findUserIdByEmail(admin, patch.email as string) : null
    }
    patch.updated_at = new Date().toISOString()

    const { error } = await admin.from('engagement_parties').update(patch).eq('id', id)
    if (error) {
      console.error('engagement-party PATCH: write failed', error)
      return NextResponse.json({ error: 'Could not save the party' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, linkedToAccount: Boolean(patch.user_id ?? undefined) })
  } catch (e: any) {
    console.error('engagement-party PATCH: unexpected error', e)
    return NextResponse.json({ error: 'Could not save the party' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const { clientId, id } = body as { clientId?: string; id?: string }
    if (!clientId || !id) return NextResponse.json({ error: 'Missing clientId or id' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    const { data: existing } = await admin
      .from('engagement_parties')
      .select('id, client_id, party_role, user_id')
      .eq('id', id)
      .maybeSingle()
    if (!existing || existing.client_id !== clientId) {
      return NextResponse.json({ error: 'That party is not on this engagement' }, { status: 404 })
    }

    // A signature belongs to a person. Removing the person would leave the
    // record pointing at nobody, so the answer is to correct the party rather
    // than delete it.
    //
    // The check is by party id, not by role. A role can be changed: edit the
    // Executive Director's row to say Leadership Team and a check keyed on the
    // role stops matching the signature they already gave, so the party
    // becomes deletable and the signature is left pointing at somebody who is
    // no longer on the engagement. The party id does not change, and it is
    // what charter_signatures already carries.
    //
    // gtcv_gate_signoffs has no party_id column, so it is matched on the
    // signer's account where there is one and on the role otherwise. That is
    // the strongest link available for a gate sign off, and it errs towards
    // refusing the delete rather than allowing an orphan.
    const gateFilter = admin.from('gtcv_gate_signoffs')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
    const [{ count: charterSigs }, { count: gateSigs }] = await Promise.all([
      admin.from('charter_signatures').select('id', { count: 'exact', head: true })
        .eq('client_id', clientId).eq('party_id', existing.id),
      existing.user_id
        ? gateFilter.or(`signer_user_id.eq.${existing.user_id},signer_role.eq.${existing.party_role}`)
        : gateFilter.eq('signer_role', existing.party_role),
    ])
    if ((charterSigs || 0) > 0 || (gateSigs || 0) > 0) {
      return NextResponse.json(
        { error: 'This party has already signed something on this engagement, so they cannot be removed. Correct their details instead.' },
        { status: 409 },
      )
    }

    const { error } = await admin.from('engagement_parties').delete().eq('id', id)
    if (error) {
      console.error('engagement-party DELETE: write failed', error)
      return NextResponse.json({ error: 'Could not remove the party' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('engagement-party DELETE: unexpected error', e)
    return NextResponse.json({ error: 'Could not remove the party' }, { status: 500 })
  }
}
