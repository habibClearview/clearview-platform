// ============================================================
// API ROUTE: /api/charter-record
//
// The chain of custody for one Charter version, in a form a person can read:
// who signed, when, from where, what they agreed to, the fingerprint of the
// wording they agreed to, and who last edited it.
//
// WHY IT IS A READ ROUTE AND NOT A JOIN IN THE PAGE. The signature rows are
// visible to anyone who can view the client, but the audit log is not, and
// should not be: it carries addresses and user agents. This route is the one
// place that decides what of it a client may see, and it returns the facts
// that make the record trustworthy while leaving out the ones that are nobody
// else's business.
//
// Anyone who can VIEW the engagement can read this. Transparency is the whole
// point: a record only earns trust if the people relying on it can see it.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken } from '@/lib/auth/api-authz'
import { resolveClientAccess } from '@/lib/auth/engagement-access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** An address is evidence for a dispute, not something to publish on a page. */
function maskIp(ip: unknown): string | null {
  const s = typeof ip === 'string' ? ip.trim() : ''
  if (!s) return null
  if (s.includes(':')) return `${s.split(':').slice(0, 2).join(':')}:…`
  const parts = s.split('.')
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.…` : null
}

export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('clientId') || ''
    const charterId = req.nextUrl.searchParams.get('charterId') || ''
    if (!clientId || !charterId) {
      return NextResponse.json({ error: 'Missing clientId or charterId' }, { status: 400 })
    }

    const token = getBearerToken(req)
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const admin = getAdminClient()
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const access = await resolveClientAccess(admin, user.id, clientId)
    if (!access.canView) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const { data: signatures } = await admin
      .from('charter_signatures')
      .select('id, signer_name, signer_role, signer_email, signature_method, typed_name, signed_at, ip_address, user_agent, content_sha256')
      .eq('charter_id', charterId)
      .order('signed_at', { ascending: true })

    const { data: events } = await admin
      .from('admin_audit_log')
      .select('action, actor_role, detail, ip, created_at')
      .eq('target_id', charterId)
      .in('action', ['charter.signed', 'charter.edited'])
      .order('created_at', { ascending: false })
      .limit(200)

    const rows = events || []
    const signedEvents = rows.filter((e) => e.action === 'charter.signed')
    const lastEdit = rows.find((e) => e.action === 'charter.edited') || null

    // Each signature, joined to the evidence recorded for it.
    const signed = (signatures || []).map((sig) => {
      const ev = signedEvents.find((e) => (e.detail as { signature_id?: string })?.signature_id === sig.id)
      const d = (ev?.detail || {}) as Record<string, unknown>
      return {
        name: sig.signer_name,
        role: sig.signer_role,
        email: sig.signer_email,
        method: sig.signature_method,
        typedName: sig.typed_name,
        signedAt: sig.signed_at,
        attestation: typeof d.attestation === 'string' ? d.attestation : null,
        // The row is the record; the audit log is the corroborating copy.
        contentSha256: (sig as { content_sha256?: string }).content_sha256
          || (typeof d.content_sha256 === 'string' ? d.content_sha256 : null),
        charterVersion: typeof d.charter_version === 'number' ? d.charter_version : null,
        fromAddress: maskIp((sig as { ip_address?: string }).ip_address || ev?.ip),
        device: ((sig as { user_agent?: string }).user_agent
          || (typeof d.user_agent === 'string' ? d.user_agent : '') || '').slice(0, 180) || null,
      }
    })

    return NextResponse.json({
      signed,
      lastEdit: lastEdit ? {
        at: (lastEdit.detail as { edited_at?: string })?.edited_at || lastEdit.created_at,
        by: (lastEdit.detail as { edited_by?: string })?.edited_by || null,
        role: lastEdit.actor_role,
        changed: (lastEdit.detail as { changed?: string[] })?.changed || [],
        version: (lastEdit.detail as { charter_version?: number })?.charter_version ?? null,
      } : null,
    })
  } catch (e: unknown) {
    console.error('charter-record GET: unexpected error', e)
    return NextResponse.json({ error: 'Could not load the record' }, { status: 500 })
  }
}
