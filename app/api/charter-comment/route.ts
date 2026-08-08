// ============================================================
// API ROUTE: /api/charter-comment
// The review-before-signature flow on the Engagement Charter.
//   POST  : any party who can view the client adds a comment or a suggestion
//           on a charter section.
//   PATCH : a manager (super_coach or assigned co-implementer) resolves a
//           comment by setting its status to accepted, declined or noted.
//
// Service-role route, so it authenticates the caller and authorizes via
// resolveClientAccess (the same rules as can_view_client / can_manage_client_access).
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

async function authed(req: NextRequest, admin: ReturnType<typeof getAdminClient>) {
  const token = getBearerToken(req)
  if (!token) return null
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return null
  return user
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      clientId?: string; charterId?: string; sectionKey?: string
      kind?: 'comment' | 'suggestion'; body?: string
    }
    if (!body.clientId || !body.charterId) {
      return NextResponse.json({ error: 'Missing clientId or charterId' }, { status: 400 })
    }
    if (!body.body || !body.body.trim()) {
      return NextResponse.json({ error: 'A comment cannot be empty' }, { status: 400 })
    }
    const kind = body.kind === 'suggestion' ? 'suggestion' : 'comment'

    const admin = getAdminClient()
    const user = await authed(req, admin)
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const access = await resolveClientAccess(admin, user.id, body.clientId)
    if (!access.canView) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const rl = await checkRateLimit(admin, `charter-comment:${user.id}`, 60, 3600)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many comments recently. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

    const { data, error } = await admin
      .from('charter_comments')
      .insert({
        client_id: body.clientId,
        charter_id: body.charterId,
        section_key: body.sectionKey ?? null,
        author_name: access.fullName,
        author_role: access.role,
        kind,
        body: body.body.trim(),
        status: 'open',
      })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: 'Could not save the comment' }, { status: 500 })

    return NextResponse.json({ ok: true, id: data.id })
  } catch (e: any) {
    console.error('charter-comment POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not save the comment' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string; clientId?: string; status?: 'open' | 'accepted' | 'declined' | 'noted'
    }
    if (!body.id || !body.clientId) {
      return NextResponse.json({ error: 'Missing id or clientId' }, { status: 400 })
    }
    const allowedStatus = ['open', 'accepted', 'declined', 'noted']
    if (!body.status || !allowedStatus.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const admin = getAdminClient()
    const user = await authed(req, admin)
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const access = await resolveClientAccess(admin, user.id, body.clientId)
    if (!access.canManage) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const { error } = await admin
      .from('charter_comments')
      .update({ status: body.status, resolved_by: user.id, resolved_at: new Date().toISOString() })
      .eq('id', body.id)
      .eq('client_id', body.clientId)
    if (error) return NextResponse.json({ error: 'Could not update the comment' }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('charter-comment PATCH: unexpected error', e)
    return NextResponse.json({ error: 'Could not update the comment' }, { status: 500 })
  }
}
