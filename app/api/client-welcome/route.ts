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
      brand: 'clearview',
      preheader: `${business} is being set up on Clearview. Here is what you will have.`,
      heading: 'Your Clearview is being set up',
      paragraphs: [
        ...(hello ? [hello] : []),
        raw(`Thank you. The details you sent for <b>${escapeHtml(business)}</b> have arrived, and Clearview is being set up for the business from them.`),
        'Clearview is one place that holds your price list, everything your team sells and spends, and a full set of accounts built from it. Here is what you will have.',

        raw('<b>Your price list.</b>'),
        ...[
          'Everything you sell, product or service, with its price and its unit, whether that is a bag, a kilo or a session.',
          'Your team picks an item from the list and says how much went. Nobody types a price in, so the same thing cannot be sold at two prices by two people.',
          'What each item costs you to buy can be held against it, out of sight of your team, so your margin is worked out for you on every sale.',
        ].map((point) => raw(
          `<span style="color:#00767A;">&#9656;</span>&nbsp;&nbsp;${escapeHtml(point)}`,
        )),

        raw('<b>A full set of accounts, compiled for you.</b>'),
        ...[
          'Profit and Loss, Cash Flow and Balance Sheet, built from what your team records as they record it.',
          'No bookkeeping evening and no spreadsheet to reconcile at the end of the month.',
          'Your plan and what actually happened sit side by side, month by month, so you can see where the business is against where you said it would be.',
          'Figures a member of staff enters can be sent for approval before they count, so the books are not changed by accident.',
        ].map((point) => raw(
          `<span style="color:#00767A;">&#9656;</span>&nbsp;&nbsp;${escapeHtml(point)}`,
        )),

        raw('<b>Your field team, on any phone.</b>'),
        ...[
          'They record a sale by tapping the item and the quantity, with the customer, how it was paid for and which member of staff brought it in.',
          'They record a cost the same way, including one they cannot put a name to, so the money is captured now and sorted later rather than forgotten.',
          'They receive stock and see what is left, so what is on the shelf and what is in the books are the same number.',
          'It keeps working with no signal. Everything waits on the phone and goes up the moment there is a connection.',
          'The buttons read the words out loud, so somebody who does not read easily can still use it.',
          'Each operator gets their own link, which opens on any phone. There is no app to install and no password to remember.',
        ].map((point) => raw(
          `<span style="color:#00767A;">&#9656;</span>&nbsp;&nbsp;${escapeHtml(point)}`,
        )),

        raw('<b>And the rest of the business as you need it.</b> Customers and marketing, staff with attendance and scorecards, deliveries and complaints, and stores and stock.'),

        raw('<b>What happens next.</b>'),
        ...[
          'Your coach checks the figures you sent and sets up your business units, your price list and your revenue categories.',
          'You are then sent your own sign in, with a link that opens your dashboard. There is nothing to install.',
          'Your field operators are set up after that, and each one is sent their own link.',
        ].map((point) => raw(
          `<span style="color:#00767A;">&#9656;</span>&nbsp;&nbsp;${escapeHtml(point)}`,
        )),

        'You do not need to do anything for now. If a figure you sent was wrong or something has changed, reply to this email and say so before the setup is finished, because it is far easier to correct at this stage.',
      ],
      footNote: 'Sent by The Canvas Coach. Reply to this email if anything here is wrong.',
    })

    const sent = await sendEmail({
      to: [to],
      subject: `${business}: your Clearview is being set up`,
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
