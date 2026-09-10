// ============================================================
// API ROUTE: /api/call-token
//
// THE PLATFORM CARRIES THE CALL. Habib's requirement was exact: the only brand
// anybody sees is Clearview, there is no third party login, and nothing that
// causes friction. So the call is not a link to somebody else's product. It
// runs inside the engagement's own page, and this route is what lets a person
// into it.
//
// WHAT A TOKEN IS. A short lived pass, signed by the platform, naming one
// person and one room. The media service will not admit anybody without one.
// The pass is minted only after the same check every other route makes: are
// you on this engagement. Nothing in the request body decides who you are.
//
// THE ROOM NAME IS DERIVED, NEVER SUPPLIED. It is built from the engagement
// and the session, so a person cannot ask for a pass into a room belonging to
// another client by typing its name.
//
// WITHOUT THE KEYS THIS SAYS SO PLAINLY. Until the LiveKit keys are in the
// environment the call cannot run, and this returns a sentence saying that
// rather than a stack trace. Nothing else on the session breaks: the recording
// works whether or not the call is carried here, because a room of people
// sitting together needs no call at all.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { AccessToken } from 'livekit-server-sdk'
import { getAdminClient, requireAccess, refuseAccess } from '@/lib/auth/api-authz'
import { callRoomName, callConfigured } from '@/lib/call'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const clientId = String(body.clientId || '')
    const sessionId = body.sessionId ? String(body.sessionId) : null
    if (!clientId) return NextResponse.json({ error: 'Which engagement is this call for?' }, { status: 400 })

    if (!callConfigured()) {
      return NextResponse.json({
        error: 'The call is not switched on yet. The three LiveKit settings are not in the environment.',
        notConfigured: true,
      }, { status: 503 })
    }

    const admin = getAdminClient()
    const access = await requireAccess(req, admin, clientId, 'view', {
      deniedMessage: 'You are not on this engagement',
      rateLimit: { key: 'call-token', max: 120, windowSeconds: 3600 },
    })
    if (!access.ok) return refuseAccess(access)

    const room = callRoomName(clientId, sessionId)

    // ONE PERSON, TWO DEVICES. 10 September 2026.
    //
    // This was the account id alone, and the comment here called that a feature:
    // one person cannot appear twice. It is not a feature, it is the bug. The
    // media service treats identity as unique in a room and removes the older
    // connection when a second one arrives with the same one. So joining on a
    // phone silently threw the laptop out, and a page that reconnected threw
    // itself out, which is why pressing Join the call put the button straight
    // back with nothing said.
    //
    // The account id still comes from the verified session and is still the
    // front of the identity, so nobody can present as anybody else. The device
    // only distinguishes one of that person's own connections from another.
    const device = String(body.deviceId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)
      || Math.random().toString(36).slice(2, 12)

    const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity: `${access.userId}::${device}`,
      // What everybody in the room actually sees. The identity is plumbing.
      name: access.fullName || 'Participant',
      // Two hours. A session is an afternoon, and the page renews it quietly.
      ttl: 60 * 60 * 2,
    })
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // Only the coaching team may remove somebody from the room.
      roomAdmin: access.canManage,
    })

    return NextResponse.json({
      token: await at.toJwt(),
      url: process.env.NEXT_PUBLIC_LIVEKIT_URL,
      room,
      name: access.fullName || 'Participant',
      canManage: access.canManage,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
  }
}
