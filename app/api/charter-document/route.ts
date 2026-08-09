// ============================================================
// API ROUTE: /api/charter-document
// The Engagement Charter as a file somebody can keep.
//
// WHY IT EXISTS. Three parties sign this agreement and none of them could hold
// a copy: it lived on a screen behind a login. The Executive Director who signed
// had nothing to file, the funder had nothing to attach, and nobody outside the
// platform could read what had been agreed.
//
// VIEW RIGHTS, NOT MANAGE RIGHTS, and deliberately so. Everybody on the
// engagement is a party to this agreement or works under it, and a party who
// cannot obtain the agreement they signed is being asked to take it on trust.
// It carries nothing a person on the engagement is not already entitled to see:
// the terms, the parties, and the signatures. No fee, no evidence, no claim.
//
// The document is built from the stored Charter and its signatures, so what
// downloads is what was agreed rather than a fresh reading of anything.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'
import { buildCharter } from '@/lib/charter-builder'

export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('clientId')
    const charterId = req.nextUrl.searchParams.get('charterId')
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireAccess(req, admin, clientId, 'view', {
      rateLimit: { key: 'charter-document', max: 60, windowSeconds: 3600 },
    })
    if (!auth.ok) return refuseAccess(auth)

    // Named charter, or the latest one. Scoped to the engagement in the same
    // query, so an identifier from elsewhere matches nothing.
    let q = admin
      .from('engagement_charters')
      .select('id, version, title, status, issued_at, content')
      .eq('client_id', clientId)
    q = charterId ? q.eq('id', charterId) : q.order('version', { ascending: false })
    const { data: charter, error } = await q.limit(1).maybeSingle()

    if (error) {
      console.error('charter-document: read failed', error)
      return NextResponse.json({ error: 'Could not read the Charter' }, { status: 500 })
    }
    if (!charter) return NextResponse.json({ error: 'There is no Charter on this engagement yet' }, { status: 404 })

    const [{ data: parties }, { data: signatures }, { data: client }, { data: config }] = await Promise.all([
      admin.from('engagement_parties')
        .select('id, party_role, name, organisation, title, is_signatory')
        .eq('client_id', clientId).order('sort_order', { ascending: true }),
      admin.from('charter_signatures')
        .select('party_id, signer_role, signer_name, signature_method, signed_at, recorded_by_user_id')
        .eq('charter_id', charter.id).eq('client_id', clientId).order('signed_at', { ascending: true }),
      admin.from('engagement_clients').select('name, programme_id').eq('id', clientId).maybeSingle(),
      admin.from('engagement_config').select('tor_reference').eq('client_id', clientId).maybeSingle(),
    ])

    let programme: string | null = null
    if (client?.programme_id) {
      const { data: p } = await admin.from('programmes').select('name').eq('id', client.programme_id).maybeSingle()
      programme = p?.name ?? null
    }

    // Who entered a signature given on paper. Looked up by name so the document
    // can say "recorded by" a person rather than an identifier nobody can read.
    const recorders = Array.from(new Set(
      (signatures || []).map((s) => s.recorded_by_user_id).filter(Boolean) as string[],
    ))
    const recordedByName: Record<string, string> = {}
    if (recorders.length > 0) {
      const { data: people } = await admin
        .from('user_profiles').select('id, full_name').in('id', recorders)
      for (const person of people || []) {
        if (person.full_name) recordedByName[person.id] = person.full_name
      }
    }

    const { buffer, fileName } = await buildCharter(
      charter as any,
      (parties || []) as any,
      (signatures || []) as any,
      {
        organisation: client?.name || 'This engagement',
        programme,
        torReference: config?.tor_reference || null,
        recordedByName,
      },
    )

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    console.error('charter-document: unexpected error', e)
    return NextResponse.json({ error: 'Could not produce the Charter document' }, { status: 500 })
  }
}
