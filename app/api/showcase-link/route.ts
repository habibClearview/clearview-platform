// ============================================================
// API ROUTE: /api/showcase-link
// Issuing, listing and withdrawing the no-login showcase link.
//
// WHAT THE LINK IS. A page a prospect can open with no account, showing the
// method and one line about how far a real engagement has got. It is built
// from an allowlist in src/lib/showcase-loader.ts and cannot show anything the
// engagement recorded.
//
// TWO SWITCHES, DELIBERATELY. A token on its own is not enough: the engagement
// has to have showcasing switched on as well. That means one action turns off
// every link ever issued for an engagement, without having to find them, which
// is what you want at the moment somebody asks you to stop sharing.
//
// NAMING A CLIENT IS A SEPARATE DECISION AGAIN. A prospect who sees a named
// live engagement has learned that this organisation is a client, which is a
// disclosure the organisation has not necessarily agreed to. So it is off by
// default and turning it on is its own explicit act.
//
// Manage rights throughout, because deciding what leaves an engagement is not
// something a viewer should be able to do.
// ============================================================
import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'
import { SHOWCASE_GRANT_TYPE } from '@/lib/showcase-loader'

/** How long a link lasts unless the coach says otherwise. */
const DEFAULT_DAYS = 90
const MAX_DAYS = 365


type Admin = ReturnType<typeof getAdminClient>

/**
 * Manage rights on this engagement, through the one shared helper. This used
 * to be a local copy in every route, in slightly different shapes, which is
 * how a fix lands in one place and leaves the hole in six others.
 */
async function requireManager(req: NextRequest, admin: Admin, clientId: string) {
  return requireAccess(req, admin, clientId, 'manage', {
    deniedMessage: 'Only the lead consultant can share this engagement',
    rateLimit: { key: 'showcase-link', max: 40, windowSeconds: 3600 },
  })
}

export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('clientId')
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    const [{ data: config }, { data: links }] = await Promise.all([
      admin.from('engagement_config')
        .select('showcase_enabled, showcase_name_client').eq('client_id', clientId).maybeSingle(),
      admin.from('client_access_grants')
        .select('id, grantee_name, access_token, created_at, expires_at, revoked_at, last_accessed_at')
        .eq('client_id', clientId).eq('grant_type', SHOWCASE_GRANT_TYPE)
        .order('created_at', { ascending: false }),
    ])

    return NextResponse.json({
      enabled: Boolean(config?.showcase_enabled),
      nameClient: Boolean(config?.showcase_name_client),
      links: links || [],
    })
  } catch (e: any) {
    console.error('showcase-link GET: unexpected error', e)
    return NextResponse.json({ error: 'Could not load the sharing settings' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { clientId, action } = body as { clientId?: string; action?: string }
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    const now = new Date().toISOString()

    if (action === 'settings') {
      const patch: Record<string, unknown> = { updated_at: now }
      if (typeof body.enabled === 'boolean') patch.showcase_enabled = body.enabled
      if (typeof body.nameClient === 'boolean') patch.showcase_name_client = body.nameClient
      const { error } = await admin.from('engagement_config').update(patch).eq('client_id', clientId)
      if (error) {
        console.error('showcase-link settings: write failed', error)
        return NextResponse.json({ error: 'Could not save that setting' }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    if (action === 'issue') {
      const label = typeof body.label === 'string' && body.label.trim()
        ? body.label.trim().slice(0, 120)
        : 'Showcase link'
      const days = Number.isFinite(body.days)
        ? Math.min(MAX_DAYS, Math.max(1, Math.trunc(body.days)))
        : DEFAULT_DAYS

      // 32 bytes of real randomness. A guessable token is the same as no token,
      // and this one is the only thing gating the page.
      const token = randomBytes(32).toString('base64url')
      const expires = new Date(Date.now() + days * 86400000).toISOString()

      const { data, error } = await admin
        .from('client_access_grants')
        .insert({
          client_id: clientId,
          granted_by: auth.userId,
          grantee_name: label,
          grant_type: SHOWCASE_GRANT_TYPE,
          scope_type: 'client',
          access_token: token,
          expires_at: expires,
        })
        .select('id')
        .single()
      if (error) {
        console.error('showcase-link issue: write failed', error)
        return NextResponse.json({ error: 'Could not create the link' }, { status: 500 })
      }

      // Issuing a link without switching sharing on would produce a link that
      // does not work, which reads as a bug rather than as a setting.
      await admin.from('engagement_config')
        .update({ showcase_enabled: true, updated_at: now }).eq('client_id', clientId)

      return NextResponse.json({ ok: true, id: data.id, token, expiresAt: expires })
    }

    if (action === 'revoke') {
      const id = typeof body.id === 'string' ? body.id : ''
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
      const { data: existing } = await admin
        .from('client_access_grants').select('id, client_id, grant_type').eq('id', id).maybeSingle()
      if (!existing || existing.client_id !== clientId || existing.grant_type !== SHOWCASE_GRANT_TYPE) {
        return NextResponse.json({ error: 'That link is not on this engagement' }, { status: 404 })
      }
      const { error } = await admin
        .from('client_access_grants').update({ revoked_at: now }).eq('id', id)
      if (error) {
        console.error('showcase-link revoke: write failed', error)
        return NextResponse.json({ error: 'Could not withdraw that link' }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    console.error('showcase-link POST: unexpected error', e)
    return NextResponse.json({ error: 'That did not work' }, { status: 500 })
  }
}
