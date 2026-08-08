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
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken } from '@/lib/auth/api-authz'
import { resolveClientAccess } from '@/lib/auth/engagement-access'
import { checkRateLimit } from '@/lib/rate-limit'

const ALLOWED = ['not_started', 'in_progress', 'evidence_submitted', 'complete', 'needs_revisiting']

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

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
    const token = getBearerToken(req)
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const access = await resolveClientAccess(admin, user.id, clientId)
    if (!access.canManage) {
      return NextResponse.json({ error: 'Only the lead consultant can move a gate' }, { status: 403 })
    }

    const rl = await checkRateLimit(admin, `gate-status:${user.id}`, 120, 3600)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many changes recently. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

    const now = new Date().toISOString()
    const { error } = await admin
      .from('canvas_decision_points')
      .upsert({
        id: `${clientId}-${dpId}`,
        client_id: clientId,
        dp_id: dpId,
        label: label ?? null,
        status,
        completed_at: status === 'complete' ? now : null,
        updated_at: now,
      }, { onConflict: 'id' })
    if (error) return NextResponse.json({ error: 'Could not update the gate' }, { status: 500 })

    return NextResponse.json({ ok: true, dpId, status })
  } catch (e: any) {
    console.error('gate-status POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not update the gate' }, { status: 500 })
  }
}
