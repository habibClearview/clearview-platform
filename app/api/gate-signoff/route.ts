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
// WHO THE RECORD SAYS SIGNED. The role and name come from the engagement's
// own party list, resolved server side from the session, and never from the
// request body. This matters more here than almost anywhere else in the
// platform: the write is an upsert keyed on the role, so a caller who could
// choose their own role could overwrite the Executive Director's signature
// with their own and leave no trace of the original. Resolving the role from
// the party record closes both holes at once, because only the actual
// Executive Director, or the lead consultant explicitly recording a signature
// given in the room, can ever write the Executive Director's row.
//
// Service-role route, so it authenticates the caller and authorizes with
// resolveClientAccess before writing. Database errors are logged server
// side and answered with a generic message.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken } from '@/lib/auth/api-authz'
import { resolveClientAccess } from '@/lib/auth/engagement-access'
import { isRefusal, resolveSigner } from '@/lib/auth/signing-party'
import { checkRateLimit } from '@/lib/rate-limit'

// The three actions a gate record can carry.
const DECISIONS = ['signed', 'authorised', 'returned']

// Actions only someone with manage rights may take. Authorising the next
// zone and returning a gate are both the lead consultant's, per the method.
const MANAGE_ONLY = ['authorised', 'returned']

// The roles that sign a gate. Party roles come from engagement_parties;
// 'lsp_ed' is the Executive Director. The funder representative co-signs
// the diagnostic and completion records, and the board chair signs the
// pre-engagement diagnostic and the scale pathway commitment.
const SIGNING_ROLES = ['lsp_ed', 'funder_rep', 'lsp_board']

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  try {
    const { clientId, dpId, decision, signerRole, note, onBehalfOfPartyId } = (await req.json()) as {
      clientId?: string
      dpId?: string
      decision?: string
      /** What the screen believed the role to be. Checked, never trusted. */
      signerRole?: string
      note?: string
      /** Set only when the lead consultant enters a signature given in the room. */
      onBehalfOfPartyId?: string
    }

    if (!clientId || !dpId) {
      return NextResponse.json({ error: 'Missing clientId or dpId' }, { status: 400 })
    }
    if (!decision || !DECISIONS.includes(decision)) {
      return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })
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

    const rl = await checkRateLimit(admin, `gate-signoff:${user.id}`, 60, 3600)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts recently. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

    const now = new Date().toISOString()

    // Authorising and returning are the lead consultant acting as themselves
    // in their platform role, not a party signature, so they are recorded
    // against the caller directly.
    if (decision !== 'signed') {
      const { data, error } = await admin
        .from('gtcv_gate_signoffs')
        .upsert({
          client_id: clientId,
          dp_id: dpId,
          signer_role: 'lead_consultant',
          signer_name: access.fullName || 'Lead consultant',
          signer_user_id: user.id,
          recorded_by_user_id: user.id,
          signature_method: 'self',
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
    }

    // Signing. The identity comes from the party list, so nobody can sign as
    // anybody else and nobody can overwrite another party's row.
    const signer = await resolveSigner(admin, {
      clientId,
      userId: user.id,
      canManage: access.canManage,
      onBehalfOfPartyId: onBehalfOfPartyId || null,
      expectedRole: signerRole || null,
    })
    if (isRefusal(signer)) {
      return NextResponse.json({ error: signer.error }, { status: signer.status })
    }

    if (!SIGNING_ROLES.includes(signer.party.party_role)) {
      return NextResponse.json({ error: 'That role does not sign a gate' }, { status: 403 })
    }

    const { data, error } = await admin
      .from('gtcv_gate_signoffs')
      .upsert({
        client_id: clientId,
        dp_id: dpId,
        signer_role: signer.party.party_role,
        signer_name: signer.party.name,
        signer_user_id: signer.signerUserId,
        recorded_by_user_id: signer.recordedBy,
        signature_method: signer.mode,
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

    return NextResponse.json({
      ok: true,
      id: data.id,
      dpId,
      decision,
      signerRole: signer.party.party_role,
      signerName: signer.party.name,
      mode: signer.mode,
    })
  } catch (e: any) {
    console.error('gate-signoff POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not record the sign-off' }, { status: 500 })
  }
}
