// ============================================================
// API ROUTE: /api/charter-sign
// Records a signature on a charter version.
//
// WHO THE SIGNATURE SAYS IT IS. The role and the name written to the record
// come from the engagement's own party list, resolved server side from the
// session. They are never taken from the request body. Before this, an
// authenticated viewer could post a signature claiming to be the Executive
// Director, which would have made the whole signature chain worthless: the
// document exists to be defensible, and a record anybody can forge defends
// nothing. See src/lib/auth/signing-party.ts for the two paths that are
// allowed, signing as yourself and the lead consultant entering a signature
// given on paper in a session.
//
// WHICH VERSION IS BEING SIGNED. Only an issued charter can be signed. A
// draft can still be edited in place, so a signature on a draft could be
// attached to wording that changes afterwards. That is exactly the thing
// versioning exists to prevent, so it is refused.
//
// ONE SIGNATURE PER PARTY PER VERSION. Enforced in the database with a unique
// index, not only here, because two rows for the same party are not two
// signatures and would make the count of who has signed wrong.
//
// Non-login signers, for example a funder representative without an account,
// are handled through the access-grant token flow, not here.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'
import { isRefusal, resolveSigner } from '@/lib/auth/signing-party'
import { isCharterFullyExecuted } from '@/lib/engagement-types'


export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      clientId?: string
      charterId?: string
      /** What the screen believed the role to be. Checked, never trusted. */
      signerRole?: string
      signatureMethod?: 'click' | 'typed'
      typedName?: string
      /** Set only when the lead consultant enters a signature given in the room. */
      onBehalfOfPartyId?: string
    }
    if (!body.clientId || !body.charterId) {
      return NextResponse.json({ error: 'Missing clientId or charterId' }, { status: 400 })
    }
    const method = body.signatureMethod === 'typed' ? 'typed' : 'click'
    if (method === 'typed' && !body.typedName) {
      return NextResponse.json({ error: 'A typed signature needs a typed name' }, { status: 400 })
    }

    const admin = getAdminClient()
    const auth = await requireAccess(req, admin, body.clientId, 'view', {
      rateLimit: { key: 'charter-sign', max: 20, windowSeconds: 3600 },
    })
    if (!auth.ok) return refuseAccess(auth)

    // The charter must belong to this client and must be open for signature.
    const { data: charter } = await admin
      .from('engagement_charters')
      .select('id, client_id, status, version')
      .eq('id', body.charterId)
      .maybeSingle()
    if (!charter || charter.client_id !== body.clientId) {
      return NextResponse.json({ error: 'Charter not found for this client' }, { status: 404 })
    }
    if (charter.status === 'draft') {
      return NextResponse.json(
        { error: 'This version is still a draft. Issue it before it can be signed, so everyone signs the same wording.' },
        { status: 409 },
      )
    }
    if (charter.status === 'superseded') {
      return NextResponse.json(
        { error: 'This version has been superseded. Sign the current version instead.' },
        { status: 409 },
      )
    }

    const signer = await resolveSigner(admin, {
      clientId: body.clientId,
      userId: auth.userId,
      canManage: auth.canManage,
      onBehalfOfPartyId: body.onBehalfOfPartyId || null,
      expectedRole: body.signerRole || null,
    })
    if (isRefusal(signer)) {
      return NextResponse.json({ error: signer.error }, { status: signer.status })
    }

    // A typed signature is the signer writing their own name. If the typed
    // name is not theirs, it is not their signature.
    if (method === 'typed' && body.typedName!.trim().toLowerCase() !== signer.party.name.trim().toLowerCase()) {
      return NextResponse.json(
        { error: `Type your name exactly as it appears on the engagement: ${signer.party.name}` },
        { status: 400 },
      )
    }

    const { data, error } = await admin
      .from('charter_signatures')
      .insert({
        charter_id: body.charterId,
        client_id: body.clientId,
        party_id: signer.party.id,
        signer_role: signer.party.party_role,
        signer_name: signer.party.name,
        signer_email: signer.party.email,
        signer_user_id: signer.signerUserId,
        recorded_by_user_id: signer.recordedBy,
        signature_method: signer.mode === 'in_room' ? 'in_room' : method,
        typed_name: method === 'typed' ? body.typedName : null,
        signed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      // The unique index is the authority on duplicates, so a second attempt
      // gets a plain answer rather than a second row.
      if ((error as any).code === '23505') {
        return NextResponse.json(
          { error: 'This party has already signed this version.' },
          { status: 409 },
        )
      }
      console.error('charter-sign POST: write failed', error)
      return NextResponse.json({ error: 'Could not record the signature' }, { status: 500 })
    }

    // A signature that does not move the agreement is only a row in a table.
    // If this was the last signatory outstanding, the Charter itself becomes
    // signed here -- otherwise it would stay "issued for signature" forever,
    // on the screen and in the copy people download and file.
    const [{ data: parties }, { data: sigs }] = await Promise.all([
      admin.from('engagement_parties')
        .select('id, is_signatory').eq('client_id', body.clientId),
      admin.from('charter_signatures')
        .select('party_id').eq('charter_id', body.charterId),
    ])

    let charterStatus = charter.status
    if (isCharterFullyExecuted(parties || [], sigs || [])) {
      const now = new Date().toISOString()
      const { error: statusErr } = await admin
        .from('engagement_charters')
        .update({ status: 'signed', signed_at: now, updated_at: now })
        .eq('id', body.charterId)
        .eq('status', 'issued')   // never resurrect a superseded version
      if (statusErr) {
        // The signature is recorded and that is the part that must not be
        // lost. Say so plainly rather than failing the whole request.
        console.error('charter-sign: signature saved but status not moved', statusErr)
      } else {
        charterStatus = 'signed'
      }
    }

    return NextResponse.json({
      ok: true,
      id: data.id,
      signerRole: signer.party.party_role,
      signerName: signer.party.name,
      mode: signer.mode,
      charterStatus,
      fullyExecuted: charterStatus === 'signed',
    })
  } catch (e: any) {
    console.error('charter-sign POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not record the signature' }, { status: 500 })
  }
}
