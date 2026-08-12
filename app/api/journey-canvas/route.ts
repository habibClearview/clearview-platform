// ============================================================
// THE JOURNEY CANVAS, READ  (PART K, C67 to C70)
//
// One read for the whole canvas: the decisions, the evidence and the
// signatures, assembled here rather than in the browser. Three separate
// requests could draw a gate as signed while its decisions had not arrived,
// which on a handover pack is the kind of wrongness nobody catches.
//
// C70 IS ENFORCED ON THE WAY OUT, HERE, not only on the screen. Where authors
// were hidden the name never leaves the server, so a browser holding the
// response — or anything that later reads it from a cache, a log or a saved
// page — has nothing to reveal. src/lib/journey-canvas.ts applies the rule and
// this route sends only what it returns.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'
import { journeyCanvas, type EvidenceEntry, type GateSignoff, type QuestionRecord } from '@/lib/journey-canvas'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('clientId')
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    // Viewing, not managing: the canvas is what an engagement shows the people
    // in it, and a coach who cannot change a gate can still read one.
    const auth = await requireAccess(req, admin, clientId, 'view', {
      deniedMessage: 'You do not have access to this engagement',
      rateLimit: { key: 'journey-canvas', max: 600, windowSeconds: 3600 },
    })
    if (!auth.ok) return refuseAccess(auth)

    const [records, signoffs, evidence] = await Promise.all([
      admin.from('gtcv_question_records')
        .select('id, gate_id, question_text, question_type, submissions, agreed_value, dissent, authors_were_visible, revealed_at, locked_by_name, locked_at')
        .eq('client_id', clientId)
        .order('locked_at', { ascending: true })
        .then((r) => r, () => ({ data: [] })),
      admin.from('gtcv_gate_signoffs')
        .select('dp_id, signer_role, signer_name, decision, note, signed_at')
        .eq('client_id', clientId)
        .order('signed_at', { ascending: true })
        .then((r) => r, () => ({ data: [] })),
      admin.from('evidence_library')
        .select('reference, dp_id, description, source_type')
        .eq('client_id', clientId)
        .order('reference', { ascending: true })
        .then((r) => r, () => ({ data: [] })),
    ])

    // The assembly, and with it C70. Nothing below this line touches a name.
    const gates = journeyCanvas(
      ((records as { data?: unknown[] }).data || []) as QuestionRecord[],
      ((signoffs as { data?: unknown[] }).data || []) as GateSignoff[],
      ((evidence as { data?: unknown[] }).data || []) as EvidenceEntry[],
    )

    return NextResponse.json({ gates })
  } catch (e) {
    console.error('journey-canvas GET: unexpected error', e)
    return NextResponse.json({ error: 'Could not load the journey canvas' }, { status: 500 })
  }
}
