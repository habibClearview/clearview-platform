// ============================================================
// API ROUTE: /api/client-welcome
//
// The letter that goes to a business the moment its Clearview financial model
// is created. 12 September 2026.
//
// Habib: I would also like a similar email sent to the Clearview financial
// model when a client is created.
//
// Nothing went at all. Somebody filled in a long form about their business,
// pressed Submit, saw a thank you on the screen and then heard nothing, with
// no record in their own inbox that it had arrived and no idea what happens
// next. The session invitation had the same fault and this is the same fix:
// say what it is, say what happens next, and do not promise anything that does
// not exist yet.
//
// WHAT IT DELIBERATELY DOES NOT SAY. It does not hand over a sign in. A
// business that has just submitted an intake form has no account on the
// platform; the account is made later, by a coach, through /api/invite-user.
// Telling somebody to sign in when they cannot is worse than telling them
// nothing.
//
// WHY AN UNAUTHENTICATED CALLER IS SAFE HERE. The intake form is a public page
// and the person filling it in is, by definition, not signed in. So this route
// takes a client id and nothing else. The address is read from the client
// record, never from the request, so the caller cannot aim the letter
// anywhere. The wording is fixed, so the caller cannot put words in it. It
// sends once per client and refuses afterwards, so it cannot be used to post
// the same letter at somebody repeatedly, and it is rate limited on top.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, emailAvailable, brandedEmail, escapeHtml, raw } from '@/lib/email'
import { cleanEmail, emailLooksSendable, salutation } from '@/lib/engagement-brief'
import { checkRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const clientId = String(body.clientId || '')
    if (!clientId) return NextResponse.json({ error: 'Which client?' }, { status: 400 })

    const admin = getAdminClient()

    const rl = await checkRateLimit(admin, `client-welcome:${clientId}`, 3, 3600)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'That letter has been asked for too many times recently.' }, { status: 429 })
    }

    const { data: client } = await admin.from('engagement_clients')
      .select('id,name,contact_name,contact_email,welcome_sent_at,engagement_mode')
      .eq('id', clientId).maybeSingle()
    if (!client) return NextResponse.json({ error: 'That client is not on file' }, { status: 404 })

    // Once only. A second submission of the same form must not post the same
    // letter at somebody again.
    if (client.welcome_sent_at) {
      return NextResponse.json({ ok: true, alreadySent: true, sentAt: client.welcome_sent_at })
    }

    const to = cleanEmail(client.contact_email || '')
    if (!emailLooksSendable(to)) {
      return NextResponse.json({ ok: false, noAddress: true, reason: 'No usable contact address on this client' })
    }
    if (!emailAvailable()) {
      return NextResponse.json({ ok: false, notConfigured: true, reason: 'Email is not switched on' })
    }

    const business = client.name || 'your business'
    const hello = salutation(client.contact_name || undefined)

    const html = brandedEmail({
      preheader: `${business} is set up on Clearview. Here is what happens next.`,
      heading: 'Your Clearview model is being built',
      paragraphs: [
        ...(hello ? [hello] : []),
        raw(`Thank you. The details you sent for <b>${escapeHtml(business)}</b> have arrived and your Clearview financial model has been created from them.`),
        raw('<b>What Clearview is.</b>'),
        ...[
          'One place that holds your plan and what actually happened, side by side, month by month.',
          'Your field team records a sale or a cost on a phone, and it lands in the same set of books rather than in a notebook somebody has to type up later.',
          'It shows profit, cash and margin as they stand, so a decision about price, stock or credit rests on this month rather than on last year.',
        ].map((point) => raw(
          `<span style="color:#00767A;">&#9656;</span>&nbsp;&nbsp;${escapeHtml(point)}`,
        )),
        raw('<b>What happens next.</b>'),
        ...[
          'Your coach checks the figures you sent and sets up your business units, your price list and your revenue categories.',
          'You are then sent your own sign in, with a link that opens your dashboard. There is nothing to install.',
          'Field operators are set up after that. Each one gets their own link, which works on any phone.',
        ].map((point) => raw(
          `<span style="color:#00767A;">&#9656;</span>&nbsp;&nbsp;${escapeHtml(point)}`,
        )),
        'You do not need to do anything for now. If a figure you sent was wrong or something has changed, reply to this email and say so before the model is finished, because it is far easier to correct at this stage.',
      ],
      footNote: 'Sent by The Canvas Coach. Reply to this email if anything here is wrong.',
    })

    const sent = await sendEmail({
      to: [to],
      subject: `${business}: your Clearview model is being built`,
      html,
    })
    if (!sent.sent) {
      return NextResponse.json({ ok: false, reason: sent.reason || 'The letter did not send' }, { status: 502 })
    }

    await admin.from('engagement_clients')
      .update({ welcome_sent_at: new Date().toISOString() })
      .eq('id', client.id)

    return NextResponse.json({ ok: true, sentTo: to })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
  }
}
