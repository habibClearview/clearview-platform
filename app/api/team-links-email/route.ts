// ============================================================
// SENDING A PERSONAL LINK BY EMAIL  (R36, the half that was not built)
//
// AUTHORISED 12 AUGUST 2026, when Resend was named. Until then this did not
// exist, because Rule 9 forbids sending client data to a service the
// specification has not named, and R36's email route named none.
//
// WHAT LEAVES THIS SYSTEM, and it is worth being exact because it is a real
// person's name and a standing key to a client's engagement:
//   the recipient's email address, their name, and their personal link.
// Nothing else. No other party, no engagement data, no answers.
//
// IT FAILS LOUDLY. Where the key is absent it says so rather than reporting
// success, because a link somebody believes was sent and was not is worse than
// one that plainly failed.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'
import { PERSONAL_GRANT_TYPE, personalLinkMessage, personalLinkUrl } from '@/lib/stage2-personal-links'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { clientId, partyId, origin } = (await req.json()) as
      { clientId?: string; partyId?: string; origin?: string }
    if (!clientId || !partyId) return NextResponse.json({ error: 'Missing clientId or partyId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireAccess(req, admin, clientId, 'manage', {
      deniedMessage: 'Only the lead consultant can send a personal link',
      rateLimit: { key: 'team-links-email', max: 60, windowSeconds: 3600 },
    })
    if (!auth.ok) return refuseAccess(auth)

    // TRIMMED, and it matters. The key stored on Vercel on 12 August 2026 began
    // with two newlines. A newline cannot go in an HTTP header, so the send
    // threw before it ever reached Resend and this route answered "That did not
    // send" for a key that was perfectly valid. src/lib/email.ts already
    // guarded against exactly this; this route did not. Proven 12 August 2026:
    // untrimmed the provider says "API key is invalid", trimmed it returns 200.
    const key = (process.env.RESEND_API_KEY || '').trim()
    if (!key) {
      // Said plainly. A button that reports success without sending anything is
      // how somebody turns up to a workshop with no link.
      return NextResponse.json(
        { error: 'Email is not switched on yet. Copy the link and send it by message instead.' },
        { status: 503 },
      )
    }

    const { data: party } = await admin
      .from('engagement_parties')
      .select('id, client_id, name, email, organisation')
      .eq('id', partyId).maybeSingle()
    if (!party || party.client_id !== clientId) {
      return NextResponse.json({ error: 'That person is not on this engagement' }, { status: 404 })
    }
    if (!party.email) {
      return NextResponse.json({ error: 'That person has no email address. Use the mobile number and copy the link.' }, { status: 400 })
    }

    const { data: grant } = await admin
      .from('client_access_grants')
      .select('access_token')
      .eq('party_id', partyId).eq('grant_type', PERSONAL_GRANT_TYPE)
      .is('revoked_at', null).maybeSingle()
    if (!grant?.access_token) {
      return NextResponse.json({ error: 'Create the personal link first' }, { status: 400 })
    }

    const url = personalLinkUrl(origin || '', grant.access_token)
    const message = personalLinkMessage(party.name || '', party.organisation || null, url)

    const { Resend } = await import('resend')
    const resend = new Resend(key)
    const sent = await resend.emails.send({
      from: process.env.RESEND_FROM || 'onboarding@resend.dev',
      to: party.email,
      subject: 'Your link for the sessions',
      text: message,
    })
    if ((sent as { error?: unknown }).error) {
      console.error('team-links-email: send failed', (sent as { error?: unknown }).error)
      return NextResponse.json({ error: 'That did not send. Copy the link and send it by message.' }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('team-links-email: unexpected error', e)
    return NextResponse.json({ error: 'That did not send. Copy the link and send it by message.' }, { status: 500 })
  }
}
