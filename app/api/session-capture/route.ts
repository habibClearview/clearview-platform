// ============================================================
// API ROUTE: /api/session-capture
// What the room types in, and what the room can read back.
//
// THIS IS THE ONE ROUTE IN THE PLATFORM THAT WRITES WITHOUT A LOGIN, so it is
// worth being explicit about what makes that safe.
//
// The token decides everything. The client, the block and the session are read
// from the grant, server side, and never from the request. A caller can send
// any clientId they like and it is ignored: the row is written against the
// engagement the token belongs to, or not at all. That is the same rule the
// signature routes follow, for the same reason.
//
// The token is scoped to one block of one engagement and expires. Revoking the
// grant, or switching the engagement's links off, closes it immediately.
//
// It can add and it can read what this session has added. It cannot edit or
// delete anything, including its own contribution, because a link passed round
// a room is held by more people than the person who typed. Correcting is the
// coach's, through the normal authenticated path.
//
// It cannot read the block's working tables, the evidence, the Charter, the
// parties or anything commercial. Nothing here queries them.
//
// Rate limited by token, because a link that reaches a group chat should cost
// somebody a rate limit rather than the engagement its record.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/auth/api-authz'
import { checkRateLimit } from '@/lib/rate-limit'
import { loadSessionLink } from '@/lib/session-link'

const MAX_NAME = 120
const MAX_CONTRIBUTION = 4000

function readToken(req: NextRequest): string | null {
  const t = req.nextUrl.searchParams.get('token')
  return t && t.length >= 16 && t.length <= 200 ? t : null
}

export async function GET(req: NextRequest) {
  try {
    const token = readToken(req)
    if (!token) return NextResponse.json({ error: 'This link is not open' }, { status: 404 })

    const link = await loadSessionLink(token)
    if (!link) return NextResponse.json({ error: 'This link is not open' }, { status: 404 })

    const admin = getAdminClient()
    let q = admin
      .from('gtcv_session_contributions')
      .select('id, contributor_name, contributor_role, contribution, created_at')
      .eq('client_id', link.clientId)
      .eq('dp_id', link.dpId)
      .order('created_at', { ascending: false })
      .limit(200)
    // Scoped to the session when the link names one, so two sessions on the
    // same block do not read each other's room.
    q = link.sessionId ? q.eq('session_id', link.sessionId) : q.is('session_id', null)

    const { data, error } = await q
    if (error) {
      console.error('session-capture GET: read failed', error)
      return NextResponse.json({ error: 'Could not load what the room has added' }, { status: 500 })
    }

    return NextResponse.json({ link, contributions: data || [] })
  } catch (e: any) {
    console.error('session-capture GET: unexpected error', e)
    return NextResponse.json({ error: 'Could not open this link' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      token?: string
      contributorName?: string
      contributorRole?: string
      contribution?: string
    }
    const token = typeof body.token === 'string' && body.token.length >= 16 && body.token.length <= 200
      ? body.token
      : null
    if (!token) return NextResponse.json({ error: 'This link is not open' }, { status: 404 })

    // Rate limited on the token rather than the caller, because there is no
    // caller to speak of. A link that reaches a group chat costs the link its
    // budget, not the engagement its record.
    const admin = getAdminClient()
    const limit = await checkRateLimit(admin, `session-capture:${token}`, 300, 3600)
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'This link has taken a lot of entries in the last hour. Try again shortly.' },
        { status: 429 },
      )
    }

    const link = await loadSessionLink(token)
    if (!link) return NextResponse.json({ error: 'This link is not open' }, { status: 404 })

    const name = (body.contributorName || '').trim().slice(0, MAX_NAME)
    const contribution = (body.contribution || '').trim().slice(0, MAX_CONTRIBUTION)
    if (!name) return NextResponse.json({ error: 'Put your name on it, so it can be followed up' }, { status: 400 })
    if (!contribution) return NextResponse.json({ error: 'There is nothing to add yet' }, { status: 400 })

    // Every scoping column comes from the link, not from the request.
    const { data, error } = await admin
      .from('gtcv_session_contributions')
      .insert({
        client_id: link.clientId,
        dp_id: link.dpId,
        session_id: link.sessionId,
        contributor_name: name,
        contributor_role: (body.contributorRole || '').trim().slice(0, MAX_NAME) || null,
        contribution,
      })
      .select('id, contributor_name, contributor_role, contribution, created_at')
      .single()

    if (error) {
      console.error('session-capture POST: write failed', error)
      return NextResponse.json({ error: 'Could not add that' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, contribution: data })
  } catch (e: any) {
    console.error('session-capture POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not add that' }, { status: 500 })
  }
}
