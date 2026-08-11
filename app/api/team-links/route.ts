// ============================================================
// THE CLIENT TEAM'S PERSONAL LINKS  (R34, R36, R37)
//
// Issuing one link per person, handing back the words to paste into a
// messaging app, and withdrawing one when somebody leaves.
//
// NO EMAIL IS SENT FROM HERE, AND NONE SHOULD BE ADDED WITHOUT ASKING.
// Nothing in this platform sends email. Sending client names and their
// permanent links to an outside company is what Rule 9 forbids unless the
// specification names the service, and Stage 2 does not. Instructed 11 August
// 2026: "Do not send any email... Do not install or configure anything that
// sends mail." So R36's email half is NOT built and is reported as failing.
//
// MANAGE RIGHTS THROUGHOUT. Issuing somebody a standing link to a client's
// engagement is not a viewer's decision.
// ============================================================
import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'
import { PERSONAL_GRANT_TYPE } from '@/lib/stage2-personal-links'

export const dynamic = 'force-dynamic'

type Admin = ReturnType<typeof getAdminClient>

async function requireManager(req: NextRequest, admin: Admin, clientId: string) {
  return requireAccess(req, admin, clientId, 'manage', {
    deniedMessage: 'Only the lead consultant can issue personal links',
    rateLimit: { key: 'team-links', max: 120, windowSeconds: 3600 },
  })
}

/**
 * The team, and whether each person has a live link.
 *
 * THE TOKEN IS RETURNED, because the coach has to be able to copy the link to
 * send it. That is the whole point of R36, and this route already requires
 * manage rights on the engagement, so the token reaches nobody who could not
 * issue a new one anyway.
 */
export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('clientId')
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    const [{ data: parties }, { data: grants }] = await Promise.all([
      admin.from('engagement_parties')
        .select('id, name, party_role, organisation, title, email, mobile, sort_order')
        .eq('client_id', clientId)
        .order('sort_order', { ascending: true }),
      admin.from('client_access_grants')
        .select('id, party_id, access_token, created_at, last_accessed_at')
        .eq('client_id', clientId)
        .eq('grant_type', PERSONAL_GRANT_TYPE)
        .is('revoked_at', null),
    ])

    const byParty = new Map<string, { id: string; access_token: string; last_accessed_at: string | null }>()
    for (const g of grants || []) {
      if (g.party_id) byParty.set(g.party_id, g)
    }

    return NextResponse.json({
      team: (parties || []).map((p) => {
        const link = byParty.get(p.id)
        return {
          ...p,
          linkId: link?.id || null,
          token: link?.access_token || null,
          lastOpened: link?.last_accessed_at || null,
        }
      }),
    })
  } catch (e) {
    console.error('team-links GET: unexpected error', e)
    return NextResponse.json({ error: 'Could not load the team' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { clientId?: string; partyId?: string }
    const { clientId, partyId } = body
    if (!clientId || !partyId) return NextResponse.json({ error: 'Missing clientId or partyId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    // The person has to be on this engagement. Checked rather than trusted:
    // the pair is what stops a link being minted for somebody else's team.
    const { data: party } = await admin
      .from('engagement_parties').select('id, client_id, name').eq('id', partyId).maybeSingle()
    if (!party || party.client_id !== clientId) {
      return NextResponse.json({ error: 'That person is not on this engagement' }, { status: 404 })
    }

    // Already has one? Hand back the one they have. Issuing a second would
    // leave the first open, and revoking would then only close one of them,
    // which is R37 failing quietly.
    const { data: existing } = await admin
      .from('client_access_grants')
      .select('id, access_token')
      .eq('party_id', partyId)
      .eq('grant_type', PERSONAL_GRANT_TYPE)
      .is('revoked_at', null)
      .maybeSingle()
    if (existing) return NextResponse.json({ ok: true, token: existing.access_token, reused: true })

    // NO expires_at. R34 as amended: it lasts the life of the engagement, and
    // the engagement being finished is what closes it. That is decided at the
    // moment of use, in refusePersonalLink, not by a date written down now.
    const { data, error } = await admin
      .from('client_access_grants')
      .insert({
        client_id: clientId,
        party_id: partyId,
        grantee_name: party.name || 'Team member',
        grant_type: PERSONAL_GRANT_TYPE,
        access_token: randomBytes(32).toString('hex'),
        expires_at: null,
        granted_by: auth.userId,
      })
      .select('access_token')
      .single()

    if (error || !data) {
      console.error('team-links POST: write failed', error)
      return NextResponse.json({ error: 'Could not issue that link' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, token: data.access_token })
  } catch (e) {
    console.error('team-links POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not issue that link' }, { status: 500 })
  }
}

/**
 * R37. Withdraw one person's link.
 *
 * Revoked, never deleted, so the record still says a link existed and when it
 * stopped. Scoped to this engagement and to this person, so withdrawing one
 * cannot touch anybody else's — which is the half of R37's test that matters.
 *
 * It bites immediately because the participant route re-checks the grant on
 * every single request rather than only when somebody first opens their link.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { clientId, partyId } = (await req.json()) as { clientId?: string; partyId?: string }
    if (!clientId || !partyId) return NextResponse.json({ error: 'Missing clientId or partyId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    const { error } = await admin
      .from('client_access_grants')
      .update({ revoked_at: new Date().toISOString() })
      .eq('party_id', partyId)
      .eq('client_id', clientId)
      .eq('grant_type', PERSONAL_GRANT_TYPE)
      .is('revoked_at', null)

    if (error) {
      console.error('team-links DELETE: write failed', error)
      return NextResponse.json({ error: 'Could not withdraw that link' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('team-links DELETE: unexpected error', e)
    return NextResponse.json({ error: 'Could not withdraw that link' }, { status: 500 })
  }
}
