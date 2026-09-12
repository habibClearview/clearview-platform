// ============================================================
// API ROUTE: /api/session-invite
//
// The calendar invitation for a planned session. Habib asked whether the
// planned session dates send one. They did not, and this is what makes them.
//
// WHO IT GOES TO. The attendees the planner already records against that
// session, and nobody else. The method decides who is in a room, and the
// invitation follows the method rather than being a second list of people to
// keep in step with the first.
//
// WHAT IT CARRIES. One absolute moment, so three people in three countries
// each see it in their own time, and the session's own page as the location,
// so the calendar entry is the thing you press at the right moment rather than
// a reminder to go and find the link.
//
// SENDING IT AGAIN UPDATES WHAT IS ALREADY IN THEIR CALENDAR. The identifier
// is the session's own, and the sequence number is raised each time, so a
// changed time replaces the entry instead of leaving two.
//
// IT REFUSES RATHER THAN GUESSES. A session with a date and no time cannot be
// sent, because putting nine in the morning in somebody's calendar because
// nobody said otherwise is worse than sending nothing.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, requireAccess, refuseAccess } from '@/lib/auth/api-authz'
import { buildIcs, sessionUid } from '@/lib/calendar'
import { sendEmail, emailAvailable, brandedEmail, escapeHtml, raw } from '@/lib/email'
import { cleanEmail, emailLooksSendable } from '@/lib/engagement-brief'

export const dynamic = 'force-dynamic'

function whenInWords(iso: string, minutes: number): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  const length = minutes >= 60
    ? `${Math.round((minutes / 60) * 10) / 10} hours`.replace('1 hours', '1 hour')
    : `${minutes} minutes`
  return `${date} at ${time} UTC, for ${length}`
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const sessionId = String(body.sessionId || '')
    if (!sessionId) return NextResponse.json({ error: 'Which session?' }, { status: 400 })

    const admin = getAdminClient()
    const { data: session } = await admin.from('gtcv_sessions')
      .select('id,client_id,title,purpose,planned_at,duration_minutes,invite_sent_at,invite_sequence')
      .eq('id', sessionId).maybeSingle()
    if (!session) return NextResponse.json({ error: 'That session is not on file' }, { status: 404 })

    const access = await requireAccess(req, admin, session.client_id, 'manage', {
      deniedMessage: 'Only the coaching team can send a session invitation',
      rateLimit: { key: 'session-invite', max: 60, windowSeconds: 3600 },
    })
    if (!access.ok) return refuseAccess(access)

    if (!session.planned_at) {
      return NextResponse.json({
        error: 'This session has a date but no time. Give it a start time and the invitation can go.',
        needsTime: true,
      }, { status: 409 })
    }

    // The attendees the planner records for this session, resolved to the
    // people themselves. A session with nobody ticked has nobody to invite,
    // and saying so beats sending an invitation into the dark.
    const { data: attendance } = await admin.from('gtcv_session_attendance')
      .select('party_id').eq('session_id', session.id)
    const partyIds = (attendance || []).map((a) => a.party_id).filter(Boolean)
    if (!partyIds.length) {
      // WHICH OF THE TWO IT IS. 12 September 2026. Habib, on an engagement
      // with nobody on it: this is confusing, where are the attendees to tick.
      // The old message said nobody was ticked, which is true and useless when
      // the real reason is that nobody is on the engagement to tick.
      const { count } = await admin.from('engagement_parties')
        .select('id', { count: 'exact', head: true }).eq('client_id', session.client_id)
      return NextResponse.json({
        error: count
          ? 'Nobody is ticked as attending this session, so there is nobody to invite. Tick them under Attendance on this session.'
          : 'Nobody has been added to this engagement yet, so there is nobody to invite. Add them under Who is on it, and settings, then tick them under Attendance on this session.',
      }, { status: 409 })
    }

    const { data: parties } = await admin.from('engagement_parties')
      .select('id,name,email').eq('client_id', session.client_id).in('id', partyIds)

    const recipients = (parties || [])
      .map((p) => ({ name: p.name as string | null, email: cleanEmail(p.email || '') }))
      .filter((p) => emailLooksSendable(p.email))
    const withoutAddress = (parties || [])
      .filter((p) => !emailLooksSendable(cleanEmail(p.email || '')))
      .map((p) => p.name || 'somebody')

    if (!recipients.length) {
      return NextResponse.json({
        error: `Nobody attending this session has a usable email address. ${withoutAddress.join(', ')} would need one adding in Engagement Setup.`,
      }, { status: 409 })
    }

    const { data: client } = await admin.from('engagement_clients')
      .select('name').eq('id', session.client_id).maybeSingle()

    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin
    const url = `${origin}/call/${session.id}`
    const minutes = session.duration_minutes || 60
    const title = session.title || 'Working session'

    // Each send raises the sequence, which is what tells a calendar the newer
    // invitation replaces the entry it already holds rather than sitting
    // beside it.
    const sequence = (session.invite_sequence || 0) + (session.invite_sent_at ? 1 : 0)

    const ics = buildIcs({
      uid: sessionUid(session.id),
      startsAt: session.planned_at,
      minutes,
      title: `${title}${client?.name ? ` with ${client.name}` : ''}`,
      description: session.purpose || undefined,
      url,
      organiserName: access.fullName || 'The Canvas Coach',
      attendees: recipients,
      sequence,
    })

    if (!emailAvailable()) {
      return NextResponse.json({
        error: 'Email is not switched on, so the invitation cannot be sent. The session page is still at the link below.',
        url, notConfigured: true,
      }, { status: 503 })
    }

    const html = brandedEmail({
      heading: title,
      paragraphs: [
        raw(`You are invited to a session${client?.name ? ` with <b>${escapeHtml(client.name)}</b>` : ''}.`),
        whenInWords(session.planned_at, minutes),
        ...(session.purpose ? [String(session.purpose)] : []),
        'The session is held on the platform. Open the link below at the time and you are in it. There is nothing to install and no second sign in.',
        'The invitation is attached, so it can be accepted into your calendar.',
      ],
      ctaLabel: 'Open the session',
      ctaUrl: url,
      footNote: `Sent by ${access.fullName || 'The Canvas Coach'}.`,
    })

    const sent = await sendEmail({
      to: recipients.map((r) => r.email),
      subject: `${title}: ${whenInWords(session.planned_at, minutes)}`,
      html,
      attachments: [{
        filename: 'session.ics',
        content: Buffer.from(ics, 'utf8').toString('base64'),
        contentType: 'text/calendar; method=REQUEST',
      }],
    })

    if (!sent.sent) return NextResponse.json({ error: sent.reason || 'The invitation did not send' }, { status: 502 })

    await admin.from('gtcv_sessions')
      .update({ invite_sent_at: new Date().toISOString(), invite_sequence: sequence, updated_at: new Date().toISOString() })
      .eq('id', session.id)

    return NextResponse.json({
      ok: true,
      sentTo: recipients.map((r) => r.name || r.email),
      withoutAddress,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
  }
}
