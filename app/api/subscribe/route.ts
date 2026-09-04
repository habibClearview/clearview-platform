// ============================================================
// ROUTE: POST /api/subscribe
//
// The library unlock, the enquiry form, the newsletter and market
// intelligence interest all arrive here. The readiness score has its own
// route because it also has to score answers and send a report.
//
// The SOURCE decides the tag, and the source is checked against a fixed list
// rather than trusted: a visitor who posts source "founding-subscriber" should
// not be able to file themselves under a segment Habib sells from.
//
// An enquiry carries a message, which is not list data. It is emailed to
// Habib and never written to Kit.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { capture, validEmail, clean, SOURCE_TAGS, CaptureSource } from '@/lib/kit'
import { sendEmail, brandedEmail, emailAvailable } from '@/lib/email'

export const dynamic = 'force-dynamic'

const PER_CALLER_PER_HOUR = 15
const PER_ADDRESS_PER_DAY = 5

function limiterClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Send this as JSON.' }, { status: 400 })
  }

  const email = clean(body?.email, 254).toLowerCase()
  if (!validEmail(email)) {
    return NextResponse.json(
      { error: 'That does not look like an email address. Check it and try again.' },
      { status: 400 },
    )
  }

  const source = clean(body?.source, 40) as CaptureSource
  if (!Object.prototype.hasOwnProperty.call(SOURCE_TAGS, source)) {
    return NextResponse.json({ error: 'Unknown form.' }, { status: 400 })
  }

  const firstName = clean(body?.firstName, 80)
  const organisation = clean(body?.organisation, 160)
  const message = clean(body?.message, 4000)
  const referrer = clean(body?.referrer, 500)

  const limiter = limiterClient()
  if (limiter) {
    const byCaller = await checkRateLimit(limiter, `subscribe:ip:${clientIp(req)}`, PER_CALLER_PER_HOUR, 3600)
    if (!byCaller.allowed) {
      return NextResponse.json({ error: 'That is a lot of attempts from one place. Try again in an hour.' }, { status: 429 })
    }
    const byAddress = await checkRateLimit(limiter, `subscribe:email:${email}`, PER_ADDRESS_PER_DAY, 86400)
    if (!byAddress.allowed) {
      return NextResponse.json({ error: 'This address has already been used today. Check the inbox, and the spam folder.' }, { status: 429 })
    }
  }

  const result = await capture({
    email, firstName, organisation, source, referrer,
    fields: { interest: source === 'intel' ? 'Market Intelligence' : undefined },
  })

  // The message is not list data. It goes to Habib and nowhere else.
  if (message && emailAvailable()) {
    await sendEmail({
      to: 'habib@habibonifade.com',
      replyTo: email,
      subject: `Enquiry from ${email}${organisation ? ` — ${organisation}` : ''}`,
      html: brandedEmail({
        heading: 'Somebody wrote to you from the site',
        paragraphs: [
          `${firstName || 'They'} left this address: ${email}${organisation ? `, at ${organisation}` : ''}.`,
          message,
          'Reply to this email and it goes straight back to them.',
        ],
      }),
    }).catch(() => undefined)
  }

  // A subscriber earned before the plumbing is finished is still a subscriber.
  if (!result.added && emailAvailable()) {
    await sendEmail({
      to: 'habib@habibonifade.com',
      subject: `Signup not added to the list (${email})`,
      html: brandedEmail({
        heading: 'The list would not take an address from the site',
        paragraphs: [
          `${email}${organisation ? `, ${organisation}` : ''} came in through ${source}.`,
          `Reason: ${result.reason || 'unknown'}`,
          'Add them by hand, then fix the configuration so the next one goes on by itself.',
        ],
      }),
    }).catch(() => undefined)
  }

  return NextResponse.json({ subscribed: result.added, tagged: result.tagged })
}
