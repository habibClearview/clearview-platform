// ============================================================
// ROUTE: POST /api/readiness
//
// One public, unauthenticated endpoint. Somebody who has never heard of the
// method answers ten questions on the website, and this scores them, puts them
// on the mailing list and emails them the result.
//
// WHAT IT WILL NOT DO. It will not take a score from the browser. The page
// sends answers; the score is worked out here. A number posted from a page is
// a number a stranger chose, and this one decides what the email says and
// which tag the subscriber carries for the rest of their life on the list.
//
// NOTHING IS LOST WHEN SOMETHING IS NOT CONFIGURED YET. Kit may have no key,
// Resend may have no key, and neither is a reason to tell a visitor their
// answers failed. When the list is unreachable the address is emailed to
// Habib instead, so a subscriber earned before the plumbing was finished is
// still a subscriber. The visitor sees their score either way, because the
// score is rendered by the page from this response, not by the email.
//
// IT IS RATE LIMITED PER ADDRESS AND PER CALLER. This endpoint sends email to
// an address a stranger types, which is the shape of thing that gets used to
// send mail to somebody else. Both limits are deliberately low.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { capture, BAND_TAGS, validEmail, clean } from '@/lib/kit'
import { scoreReadiness, READINESS } from '@/lib/readiness-score'
import { sendEmail, brandedEmail, escapeHtml, raw, emailAvailable } from '@/lib/email'

export const dynamic = 'force-dynamic'

const PER_CALLER_PER_HOUR = 12
const PER_ADDRESS_PER_DAY = 3
const HOUR = 3600
const DAY = 86400

function limiterClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Send the answers as JSON.' }, { status: 400 })
  }

  const email = clean(body?.email, 254).toLowerCase()
  if (!validEmail(email)) {
    return NextResponse.json(
      { error: 'That does not look like an email address. Check it and try again.' },
      { status: 400 },
    )
  }
  const firstName = clean(body?.firstName, 80)
  const organisation = clean(body?.organisation, 160)
  const referrer = clean(body?.referrer, 500)

  const answers = body?.answers
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return NextResponse.json({ error: 'The answers are missing.' }, { status: 400 })
  }

  // Both limits, before any email is sent or any list is written to.
  const limiter = limiterClient()
  if (limiter) {
    const byCaller = await checkRateLimit(limiter, `readiness:ip:${clientIp(req)}`, PER_CALLER_PER_HOUR, HOUR)
    if (!byCaller.allowed) {
      return NextResponse.json(
        { error: 'That is a lot of attempts from one place. Try again in an hour.' },
        { status: 429 },
      )
    }
    const byAddress = await checkRateLimit(limiter, `readiness:email:${email}`, PER_ADDRESS_PER_DAY, DAY)
    if (!byAddress.allowed) {
      return NextResponse.json(
        { error: 'This address has already been sent its score today. Check the inbox, and the spam folder.' },
        { status: 429 },
      )
    }
  }

  const result = scoreReadiness(answers as Record<string, unknown>)

  const kit = await capture({
    email, firstName, organisation, source: 'score', referrer,
    extraTags: [BAND_TAGS[result.band]].filter(Boolean),
    fields: {
      readiness_score: String(result.score),
      readiness_band: result.bandLabel,
    },
  })

  // The report. The gaps are the substance of it: a score on its own tells
  // somebody how they did, and the gaps tell them what to do on Monday.
  const gapMarkup = result.gaps.length
    ? `<ul style="margin:0 0 14px;padding-left:18px;">${
        result.gaps.map((g) => (
          `<li style="margin-bottom:12px;">`
          + `<strong>${escapeHtml(g.question)}</strong><br/>`
          + `<span style="color:#4C5A6B;">${escapeHtml(g.ifNot)}</span><br/>`
          + `<span style="color:#00767A;font-size:13px;">Settled at: ${escapeHtml(g.settledAt)}</span>`
          + `</li>`
        )).join('')
      }</ul>`
    : '<p style="margin:0 0 14px;">You answered yes to all ten.</p>'

  const html = brandedEmail({
    heading: result.headline,
    paragraphs: [
      `${result.bandLabel}. ${result.meaning}`,
      raw(`<strong>Where the gaps are</strong>`),
      raw(gapMarkup),
      raw(`<strong>What to do next</strong>`),
      result.nextStep,
    ],
    ctaLabel: 'See the whole method on one canvas',
    ctaUrl: 'https://habibonifade.com',
    footNote:
      'You are getting this because you asked for your score at habibonifade.com. '
      + 'Every email has an unsubscribe link and the list is never shared.',
  })

  const sent = await sendEmail({
    to: email,
    subject: `Your commercial readiness score: ${result.score} out of ${result.total}`,
    html,
    replyTo: 'habib@habibonifade.com',
  })

  // A subscriber earned before the plumbing was finished is still a
  // subscriber. If the list could not take the address, it goes to Habib.
  if (!kit.added && emailAvailable()) {
    await sendEmail({
      to: 'habib@habibonifade.com',
      subject: `Readiness assessment completed — not added to the list (${email})`,
      html: brandedEmail({
        heading: 'Someone finished the assessment and the list did not take them',
        paragraphs: [
          `${email}${firstName ? ` (${firstName})` : ''}${organisation ? `, ${organisation}` : ''} scored ${result.score} of ${result.total}, ${result.bandLabel}.`,
          `Reason the list refused it: ${kit.reason || 'unknown'}`,
          'Add them by hand, then fix the configuration so the next one goes on by itself.',
        ],
      }),
    }).catch(() => undefined)
  }

  return NextResponse.json({
    score: result.score,
    total: result.total,
    band: result.band,
    bandLabel: result.bandLabel,
    headline: result.headline,
    meaning: result.meaning,
    nextStep: result.nextStep,
    gaps: result.gaps.map((g) => ({ question: g.question, ifNot: g.ifNot, settledAt: g.settledAt })),
    // Said plainly so the page can be honest about what did and did not happen.
    emailed: sent.sent,
    subscribed: kit.added,
    tagged: kit.tagged,
  })
}

/** The questions, so the page and the scoring can never hold different lists. */
export async function GET() {
  return NextResponse.json({
    questions: READINESS.map((q) => ({ id: q.id, question: q.question })),
  })
}
