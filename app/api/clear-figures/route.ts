// ============================================================
// API ROUTE: /api/clear-figures
// Lets a client reset their own figures in-app (no SQL), or the coach do it for
// them. Two scopes:
//   * 'actuals' — delete every recorded monthly actual, KEEP the planning model,
//                 business units and catalogue. "The recorded numbers got messy,
//                 start the real figures fresh."
//   * 'model'   — reset the whole financial model: clear plan lines, business
//                 units and shared lines AND the actuals AND the marketing
//                 events that reference them, back to an empty model. Keeps the
//                 organisation record, currency and settings.
// Field-app sales, stock and catalogue are never touched here.
//
// Destructive, so: service-role route that authenticates the caller and only
// allows a super_coach, or the client's OWN ceo / finance_manager, and writes
// an audit-log entry of exactly what was cleared.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken } from '@/lib/auth/api-authz'
import { writeAuditLog, auditIp } from '@/lib/audit-log'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  try {
    const { clientId, scope } = (await req.json()) as { clientId?: string; scope?: 'actuals' | 'model' }
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })
    if (scope !== 'actuals' && scope !== 'model') return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })

    const token = getBearerToken(req)
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const admin = getAdminClient()
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: actor } = await admin.from('user_profiles').select('role, engagement_client_id, email').eq('id', user.id).single()
    // super_coach may clear any client; a client's own CEO / Finance Manager may
    // clear only their own client. Nobody else.
    const allowed = !!actor && (
      actor.role === 'super_coach' ||
      (['ceo', 'finance_manager'].includes(actor.role) && actor.engagement_client_id === clientId)
    )
    if (!allowed) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    // Do the whole reset ATOMICALLY via a single-transaction DB function. This
    // is the ONLY path — there is deliberately no sequential fallback, so a
    // partial/half-cleared state is impossible: either the function ran (all or
    // nothing) or nothing changed. If the function isn't installed on this
    // environment yet, fail clearly and tell the coach to run the one-time
    // migration rather than doing a risky non-atomic wipe.
    const { error: rpcErr } = await admin.rpc('clear_client_figures', { p_client_id: clientId, p_scope: scope })
    if (rpcErr) {
      const missingFn = ['PGRST202', '42883'].includes((rpcErr as any).code) || /clear_client_figures/i.test(rpcErr.message || '')
      console.error('clear-figures: rpc failed', (rpcErr as any).code, rpcErr.message)
      if (missingFn) {
        return NextResponse.json({
          error: 'In-app clearing needs a one-time database setup that has not been applied yet. Please ask your coach to run the clear_client_figures migration, then try again. Nothing was changed.',
        }, { status: 409 })
      }
      return NextResponse.json({ error: 'Could not clear the figures. Nothing was changed — please try again.' }, { status: 500 })
    }

    // Audit the destructive action. The clear has already happened, so a failed
    // log must NOT flip the response to an error — log it and move on.
    try {
      await writeAuditLog(admin, {
        actorId: user.id, actorEmail: (actor as any)?.email || user.email, actorRole: (actor as any)?.role,
        action: 'client.figures_cleared',
        targetId: clientId, targetEmail: null,
        detail: { scope },
        ip: auditIp(req.headers),
      })
    } catch (logErr) { console.error('clear-figures: audit log failed (clear already applied)', logErr) }

    return NextResponse.json({ ok: true, scope })
  } catch (e: any) {
    console.error('clear-figures: unexpected error', e)
    return NextResponse.json({ error: 'Could not clear the figures' }, { status: 500 })
  }
}
