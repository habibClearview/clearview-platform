// ============================================================
// API ROUTE: /api/gate-signoff
// Records one sign-off action on a decision gate.
//
// The method gives each action to a specific person:
//   'signed'     the Executive Director signs the decision output. The
//                Delivery Guide repeats the same pattern at every zone
//                close: the co-implementer drafts, the lead consultant
//                reviews, the Executive Director signs. The funder
//                co-signs two records only, the pre-engagement diagnostic
//                record and the engagement completion record, and uses
//                this same action.
//   'authorised' the lead consultant authorises the next zone to open. No
//                zone opens until the previous gate is closed, and that
//                authority sits with the lead consultant alone.
//   'returned'   the gate goes back with the gap named instead of closing.
//                Also the lead consultant's call.
//
// So: signing is open to a signatory who can view the engagement, and is
// always recorded as the authenticated user. Authorising and returning
// require manage rights, which is what resolveClientAccess grants to the
// super coach and the assigned co-implementer.
//
// Service-role route, so it authenticates the caller and authorizes with
// resolveClientAccess before writing. Database errors are logged server
// side and answered with a generic message.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken } from '@/lib/auth/api-authz'
import { resolveClientAccess } from '@/lib/auth/engagement-access'
import { checkRateLimit } from '@/lib/rate-limit'

// The three actions a gate record can carry.
const DECISIONS = ['signed', 'authorised', 'returned']

// Actions only someone with manage rights may take. Authorising the next
// zone and returning a gate are both the lead consultant's, per the method.
const MANAGE_ONLY = ['authorised', 'returned']

// The role that signs a gate. Party roles come from engagement_parties;
// 'lsp_ed' is the Executive Director. The funder representative co-signs
// the diagnostic and completion records.
const SIGNING_ROLES = ['lsp_ed', 'funder_rep', 'lsp_board']

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  try {
    const { clientId, dpId, decision, signerRole, signerName, note } = (await req.json()) as {
      clientId?: string; dpId?: string; decision?: string
      signerRole?: string; signerName?: string; note?: string
    }

    if (!clientId || !dpId) {
      return NextResponse.json({ error: 'Missing clientId or dpId' }, { status: 400 })
    }
    if (!decision || !DECISIONS.includes(decision)) {
      return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })
    }
    if (!signerRole || !signerName) {
      return NextResponse.json({ error: 'Signer role and name are required' }, { status: 400 })
    }

    const admin = getAdminClient()
    const token = getBearerToken(req)
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const access = await resolveClientAccess(admin, user.id, clientId)
    if (!access.canView) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Authorising the next zone and returning a gate are the lead
    // consultant's alone.
    if (MANAGE_ONLY.includes(decision) && !access.canManage) {
      return NextResponse.json(
        { error: 'Only the lead consultant can authorise or return a gate' },
        { status: 403 },
      )
    }

    // Signing is the Executive Director's, with the funder representative
    // co-signing the diagnostic and completion records. Someone with manage
    // rights may also record a signature taken in the room.
    if (decision === 'signed' && !SIGNING_ROLES.includes(signerRole) && !access.canManage) {
      return NextResponse.json({ error: 'That role does not sign this gate' }, { status: 403 })
    }

    const rl = await checkRateLimit(admin, `gate-signoff:${user.id}`, 60, 3600)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts recently. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

    // One record per role per action per gate: repeating an action updates
    // the row rather than stacking duplicates. signer_user_id always comes
    // from the authenticated session, never from the request body.
    const now = new Date().toISOString()
    const { data, error } = await admin
      .from('gtcv_gate_signoffs')
      .upsert({
        client_id: clientId,
        dp_id: dpId,
        signer_role: signerRole,
        signer_name: signerName,
        signer_user_id: user.id,
        decision,
        note: note || null,
        signed_at: now,
      }, { onConflict: 'client_id,dp_id,signer_role,decision' })
      .select('id')
      .single()

    if (error) {
      console.error('gate-signoff POST: write failed', error)
      return NextResponse.json({ error: 'Could not record the sign-off' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, id: data.id, dpId, decision })
  } catch (e: any) {
    console.error('gate-signoff POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not record the sign-off' }, { status: 500 })
  }
}
