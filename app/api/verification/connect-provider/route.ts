// ============================================================
// API ROUTE: /api/verification/connect-provider
// Server-side only -- provider adapters (src/lib/providers/*) import
// provider-specific logic that has no business running in the browser,
// and writing provider_links needs the service role since a client's own
// session isn't necessarily the right actor to grant itself a new RLS row.
//
// GET  -> the real list of providers actually registered server-side
//         (src/lib/providers/registry.ts), never a hardcoded list. Today
//         that's just MTN Uganda, but Airtel/M-Pesa/others appear here
//         automatically the moment their adapter is registered -- no
//         client-side change needed when a new one is added.
// POST -> begin linking one client's wallet with one provider. Calls that
//         provider's real initiateLink() (see src/lib/providers/types.ts).
//         Every provider today returns 'pending' with real, honest
//         instructions ("waiting on MTN's approval") rather than actually
//         completing a connection -- see the TODO(mtn-credentials) notes
//         in mtn-ug.ts. This route works correctly today; what's still
//         missing is the mobile-money company's own API credentials,
//         which is a business step (registering with them), not a code
//         change.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken, requesterCanViewClient } from '@/lib/auth/api-authz'
import { listProviders, getProvider } from '@/lib/providers/registry'
import type { LinkStatus } from '@/lib/providers/types'

// Human-facing label per provider id. Falls back to the raw id for any
// provider registered without an entry here, so a new adapter never
// silently disappears from the list for lack of a display name.
const PROVIDER_LABELS: Record<string, string> = {
  mtn_ug_momo: 'MTN Mobile Money (Uganda)',
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// LinkStatus (the adapter's own, simple vocabulary) -> the readiness
// states provider_links.status and the UI (verification-display.ts)
// actually use. Kept as one small mapping here rather than asking every
// adapter to know the UI's vocabulary.
function toReadinessStatus(status: LinkStatus): string {
  if (status === 'active') return 'tier1_active'
  if (status === 'pending') return 'link_pending'
  return 'not_started'
}

export async function GET() {
  const providers = listProviders()
    .filter(p => p.providerId !== 'simulated')
    .map(p => ({ id: p.providerId, country: p.country, label: PROVIDER_LABELS[p.providerId] || p.providerId }))
  return NextResponse.json({ providers })
}

export async function POST(req: NextRequest) {
  try {
    const { clientId, providerId } = await req.json() as { clientId?: string; providerId?: string }
    if (!clientId || !providerId) {
      return NextResponse.json({ error: 'Missing clientId or providerId' }, { status: 400 })
    }
    // Only a caller who may view this client can create/alter its provider link.
    // Previously there was no auth — anyone could write provider_links for any client.
    if (!(await requesterCanViewClient(getBearerToken(req), clientId))) {
      return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
    }
    const adapter = getProvider(providerId)
    if (!adapter) {
      return NextResponse.json({ error: `Unknown provider "${providerId}"` }, { status: 400 })
    }

    const link = await adapter.initiateLink(clientId)
    const status = toReadinessStatus(link.status)

    const admin = getAdminClient()
    const { error } = await admin.from('provider_links').upsert({
      client_id: clientId,
      provider_id: providerId,
      country: adapter.country,
      status,
      config: link.metadata ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id,provider_id' })
    if (error) {
      console.error('connect-provider upsert error:', error)
      return NextResponse.json({ error: 'Could not save the link.' }, { status: 500 })
    }

    return NextResponse.json({ status, instructions: link.instructions })
  } catch (err: any) {
    console.error('connect-provider error:', err)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
