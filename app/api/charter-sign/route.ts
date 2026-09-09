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
import { createHash } from 'crypto'
import { attestationText, ATTESTATION_VERSION } from '@/lib/charter-attestation'
import { writeAuditLog, auditIp } from '@/lib/audit-log'
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
      .select('id, client_id, status, version, content, title')
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
    // Compared on the letters alone, so a double space or a full stop after an
    // initial is not a refusal. It still has to be their name: this is the
    // check that stops one person signing as another.
    const loosely = (s: string) => String(s).toLowerCase().replace(/[^a-z]/g, '')
    if (method === 'typed' && loosely(body.typedName!) !== loosely(signer.party.name)) {
      return NextResponse.json(
        { error: `Type your name exactly as it appears on the engagement: ${signer.party.name}` },
        { status: 400 },
      )
    }

    // The wording being signed, fingerprinted before the row is written so the
    // signature itself carries proof of what it was given. The migration on
    // 8 September added the three columns; until then this went only to the
    // audit log, and it still goes there too as an independent second record.
    const signedBytes = JSON.stringify({
      title: charter.title ?? null,
      version: charter.version,
      content: charter.content ?? null,
    })
    const contentSha256 = createHash('sha256').update(signedBytes, 'utf8').digest('hex')
    const userAgent = (req.headers.get('user-agent') || '').slice(0, 400) || null
    const signerIp = auditIp(req.headers)

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
        ip_address: signerIp,
        user_agent: userAgent,
        content_sha256: contentSha256,
      })
      .select('id')
      .single()

    if (!error && data) {
      // ============================================================
      // WHAT WAS SIGNED, BY WHOM, FROM WHERE. 8 September 2026.
      //
      // The signature row already recorded who signed, in what capacity, by
      // which method, when, and against which version. That is a real
      // electronic signature. What it could not do was prove WHAT they signed
      // or FROM WHERE, which is the difference between a record and evidence.
      //
      // The hash is taken over the exact stored wording of the version at the
      // moment of signing. Reproduce the wording later, hash it again, and
      // either it matches or the document changed. The version itself cannot
      // be edited once issued, so the two facts corroborate each other.
      //
      // It goes to admin_audit_log rather than to new columns because new
      // columns need a migration, and a signature taken today should carry its
      // evidence today. The migration is written and waiting in
      // supabase/migrations for when it can be run.
      // ============================================================
      await writeAuditLog(admin, {
        actorId: signer.signerUserId ?? null,
        actorEmail: signer.party.email ?? null,
        actorRole: signer.party.party_role,
        action: 'charter.signed',
        targetId: body.charterId,
        targetEmail: signer.party.email ?? null,
        ip: signerIp,
        detail: {
          signature_id: data.id,
          client_id: body.clientId,
          charter_version: charter.version,
          signer_name: signer.party.name,
          signature_method: signer.mode === 'in_room' ? 'in_room' : method,
          typed_name: method === 'typed' ? body.typedName : null,
          recorded_by_user_id: signer.recordedBy ?? null,
          user_agent: userAgent,
          content_sha256: contentSha256,
          // The words the signer was shown at the moment they agreed, stored
          // with the signature rather than looked up later, so a change to the
          // wording cannot rewrite what somebody already agreed to.
          attestation: attestationText(
            charter.title || 'Engagement Charter',
            charter.version,
            signer.party.name,
          ),
          attestation_version: ATTESTATION_VERSION,
          signed_at: new Date().toISOString(),
        },
      })
    }

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
