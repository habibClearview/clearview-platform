// ============================================================
// API ROUTE: /api/charter-sign
// Records a signature on a charter version. Any party who can view the
// client may sign, and always signs as themselves (signer_user_id is taken
// from the authenticated session, never from the request body). Signatures
// belong to a specific charter version; when the consultant issues a new
// version, the old signatures no longer apply, so re-signing is required.
//
// Non-login signers (for example a funder representative without an account)
// are handled separately through the access-grant token flow, not here.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken } from '@/lib/auth/api-authz'
import { resolveClientAccess } from '@/lib/auth/engagement-access'
import { checkRateLimit } from '@/lib/rate-limit'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      clientId?: string; charterId?: string; signerRole?: string
      signerName?: string; signatureMethod?: 'click' | 'typed'; typedName?: string
    }
    if (!body.clientId || !body.charterId) {
      return NextResponse.json({ error: 'Missing clientId or charterId' }, { status: 400 })
    }
    if (!body.signerRole || !body.signerName) {
      return NextResponse.json({ error: 'Signer role and name are required' }, { status: 400 })
    }
    const method = body.signatureMethod === 'typed' ? 'typed' : 'click'
    if (method === 'typed' && !body.typedName) {
      return NextResponse.json({ error: 'A typed signature needs a typed name' }, { status: 400 })
    }

    const admin = getAdminClient()
    const token = getBearerToken(req)
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const access = await resolveClientAccess(admin, user.id, body.clientId)
    if (!access.canView) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const rl = await checkRateLimit(admin, `charter-sign:${user.id}`, 20, 3600)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts recently. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

    // Confirm the charter belongs to this client before signing it.
    const { data: charter } = await admin
      .from('engagement_charters')
      .select('id, client_id')
      .eq('id', body.charterId)
      .maybeSingle()
    if (!charter || charter.client_id !== body.clientId) {
      return NextResponse.json({ error: 'Charter not found for this client' }, { status: 404 })
    }

    const { data, error } = await admin
      .from('charter_signatures')
      .insert({
        charter_id: body.charterId,
        client_id: body.clientId,
        signer_role: body.signerRole,
        signer_name: body.signerName,
        signer_user_id: user.id,
        signature_method: method,
        typed_name: method === 'typed' ? body.typedName : null,
        signed_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: 'Could not record the signature' }, { status: 500 })

    return NextResponse.json({ ok: true, id: data.id })
  } catch (e: any) {
    console.error('charter-sign POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not record the signature' }, { status: 500 })
  }
}
