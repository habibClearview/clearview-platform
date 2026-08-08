// ============================================================
// API ROUTE: /api/gate-status
// Moves one decision gate along its lifecycle for an engagement.
//
// The gate rows live in the existing canvas_decision_points table. Only
// someone who manages the client (super_coach or the assigned co-implementer)
// may change a gate, which matches the method: the lead consultant holds the
// gate and decides when it opens or closes.
//
// Service-role route, so it authenticates the caller and authorizes with
// resolveClientAccess before writing.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'

const ALLOWED = ['not_started', 'in_progress', 'evidence_submitted', 'complete', 'needs_revisiting']


export async function POST(req: NextRequest) {
  try {
    const { clientId, dpId, status, label } = (await req.json()) as {
      clientId?: string; dpId?: string; status?: string; label?: string
    }
    if (!clientId || !dpId) {
      return NextResponse.json({ error: 'Missing clientId or dpId' }, { status: 400 })
    }
    if (!status || !ALLOWED.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const admin = getAdminClient()
    const auth = await requireAccess(req, admin, clientId, 'manage', {
      deniedMessage: 'Only the coaching team can move a gate',
      rateLimit: { key: 'gate-status', max: 120, windowSeconds: 3600 },
    })
    if (!auth.ok) return refuseAccess(auth)

    const now = new Date().toISOString()
    const { error } = await admin
      .from('canvas_decision_points')
      .upsert({
        // The pair (client_id, dp_id) is what identifies a gate, and there is
        // now a unique index on it, so the upsert conflicts on the pair rather
        // than on a string that happens to encode it. The id column is text
        // and stays the primary key, so it is still supplied for a new row;
        // for an existing one the conflict target decides the match and this
        // value is not what is compared.
        id: `${clientId}-${dpId}`,
        client_id: clientId,
        dp_id: dpId,
        label: label ?? null,
        status,
        completed_at: status === 'complete' ? now : null,
        updated_at: now,
      }, { onConflict: 'client_id,dp_id' })
    if (error) {
      console.error('gate-status POST: write failed', error)
      return NextResponse.json({ error: 'Could not update the gate' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, dpId, status })
  } catch (e: any) {
    console.error('gate-status POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not update the gate' }, { status: 500 })
  }
}
