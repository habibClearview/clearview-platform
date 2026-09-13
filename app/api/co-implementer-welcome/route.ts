// ============================================================
// API ROUTE: /api/co-implementer-welcome
//
// The letter that goes to a GtCV co-implementer when they join. 13 September
// 2026.
//
// Habib: we need to develop a welcome email for the GtCV co-implementer, one
// that tells the co-implementer exactly what their role is, reporting, and how
// to use the platform and where to find things, instructions and other useful
// things on the platform.
//
// Until now a co-implementer received the Supabase sign-in invitation and
// nothing else: a button, a password box, and no account of what they had
// joined, who they answer to, or what the two sections in front of them are
// for. The first day was spent guessing.
//
// WHAT IT DELIBERATELY DOES NOT SAY. It does not carry a sign-in link of its
// own. The sign-in comes from /api/invite-user, which is a different act by a
// different button, and a second link in a second letter is how somebody ends
// up with two half-made accounts. It names no day rate and no fee. Those are
// on the person's record and are between them and the practice, not something
// to post into an inbox that may be read over a shoulder.
//
// WHO MAY ASK FOR IT. A signed-in super coach, which is the only role that may
// manage the team at all (canManageTeam in src/lib/coach-types.ts). The
// address is read from the co_implementers record and never from the request,
// the wording is fixed in this file, it sends once per person, and it is rate
// limited.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, emailAvailable, brandedEmail, escapeHtml, raw } from '@/lib/email'
import { cleanEmail, emailLooksSendable, salutation } from '@/lib/engagement-brief'
import { checkRateLimit } from '@/lib/rate-limit'
import { getBearerToken } from '@/lib/auth/api-authz'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** A bullet in the house style: the teal marker, then escaped text. */
function point(text: string) {
  return raw(`<span style="color:#00767A;">&#9656;</span>&nbsp;&nbsp;${escapeHtml(text)}`)
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const coImplementerId = String(body.coImplementerId || '')
    if (!coImplementerId) return NextResponse.json({ error: 'Which co-implementer?' }, { status: 400 })

    const admin = getAdminClient()

    const token = getBearerToken(req)
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // Rate limited on the caller, before anything is read, so the route cannot
    // be used to knock on one roster id after another and watch which answer.
    const rl = await checkRateLimit(admin, `co-implementer-welcome:${user.id}`, 10, 3600)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'That letter has been asked for too many times recently.' }, { status: 429 })
    }

    const { data: profile } = await admin.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
    if (!profile || profile.role !== 'super_coach') {
      return NextResponse.json({ error: 'Only the coach who manages the team can send this letter.' }, { status: 403 })
    }

    const { data: ci } = await admin.from('co_implementers').select('*').eq('id', coImplementerId).maybeSingle()
    if (!ci) return NextResponse.json({ error: 'That co-implementer is not on file' }, { status: 404 })

    // Once only. welcome_sent_at arrives with supabase/migrations/
    // 2026_09_13_co_implementer_welcome_sent.sql; until that is applied the
    // column is simply absent, and a letter that can be sent twice is a far
    // smaller fault than a button that fails outright, so it is read as
    // whatever is there and no more.
    const alreadyAt = (ci as Record<string, unknown>).welcome_sent_at
    if (typeof alreadyAt === 'string' && alreadyAt) {
      return NextResponse.json({ ok: true, alreadySent: true, sentAt: alreadyAt })
    }

    const to = cleanEmail(ci.email || '')
    if (!emailLooksSendable(to)) {
      return NextResponse.json({ ok: false, noAddress: true, reason: 'No usable email address on this co-implementer' })
    }
    if (!emailAvailable()) {
      return NextResponse.json({ ok: false, notConfigured: true, reason: 'Email is not switched on' })
    }

    const hello = salutation(ci.name || undefined)

    const html = brandedEmail({
      brand: 'canvas',
      preheader: 'Your role as co-implementer, who you report to, and how the platform works.',
      heading: 'Welcome to the Canvas Coach team',
      paragraphs: [
        ...(hello ? [hello] : []),
        'Welcome. You are joining as a co-implementer on Grant-to-Commercial Viability engagements. This note sets out what the role is, who you report to, and how to use the platform, so that your first week is spent on the work rather than on finding your way around.',

        raw('<b>What the role is.</b>'),
        point('You run the engagement day to day with the lead coach: preparing each decision point, gathering the commercial evidence it calls for, and keeping the record as the work proceeds.'),
        point('The method is the Grant-to-Commercial Viability Canvas. It has nine sequential decision points, and the engagement moves to the next one once the evidence, internal and external, has been collected and judged to support that decision.'),
        point('Every decision belongs to the client. Your work is to put the evidence in front of them in a form they can decide on, and to record what they decided and why.'),
        point('You are assigned to named clients. You see those clients and no others, which is a rule held by the database itself rather than by the screen.'),

        raw('<b>Who you report to.</b>'),
        point('You report to the lead coach on the engagement, who is the super coach on the platform.'),
        point('Your time and your expenses are submitted by you and approved by the lead coach. Nothing counts towards an invoice until it has been approved.'),
        point('Anything that changes the shape of an engagement, its scope, its timing, or what a client is promised, goes to the lead coach before it goes to the client.'),

        raw('<b>Signing in.</b>'),
        point('Your sign-in arrives in a separate email from the platform, with a button that invites you to set your own password.'),
        point('After that the platform is at clearview.habibonifade.com whenever you return to it. There is nothing to install.'),

        raw('<b>What you will see when you sign in.</b> Two sections, and no others.'),
        point('Clients. Every client assigned to you, as a card. Opening one takes you into that engagement at the decision point it has reached.'),
        point('My Timesheet and Expenses. Your own record: Timesheets, Expenses, Advances, and Invoice.'),

        raw('<b>Inside a client.</b>'),
        point('The Cover holds who is on the engagement, the Charter, and the documents that govern it. Start here on a client you have not opened before.'),
        point('Each decision point holds the question being decided, the evidence gathered for it, and the decision once it is taken.'),
        point('The client and their own team see the same engagement from their side, so what you record is what they read.'),

        raw('<b>Your time, your expenses, and getting paid.</b>'),
        point('Record your time as you work rather than at the end of the month. Each entry names the client, the date, the hours, and what was done.'),
        point('Expenses are entered against a client with the amount and the date, and are reclaimed once approved.'),
        point('An advance drawn against work not yet invoiced appears under Advances and is set against your next invoice, so nothing is claimed twice.'),
        point('Your invoice for a month is compiled from your approved time and approved expenses, less any advance. You do not write it yourself.'),

        raw('<b>In your first week.</b>'),
        point('Sign in and set your password.'),
        point('Check the details held on you: your name, your email, your phone, your country, and your specialisation. Tell the lead coach if any of it is wrong.'),
        point('Open each client assigned to you and read the Cover and the Charter before anything else.'),
        point('Enter your first timesheet on the day you do the work, so the habit is set from the start.'),

        'If anything on the platform does not do what this letter says it does, say so rather than working around it. That is how it gets fixed.',
      ],
      footNote: 'Reply to this email with any question at all. There is no question too small in the first week.',
    })

    const sent = await sendEmail({
      to: [to],
      subject: 'Welcome to the Canvas Coach team: your role and the platform',
      html,
    })
    if (!sent.sent) {
      return NextResponse.json({ ok: false, reason: sent.reason || 'The letter did not send' }, { status: 502 })
    }

    // Best effort. If the column is not there yet the letter has still gone,
    // and reporting a failure for a letter that was delivered would be a lie.
    await admin.from('co_implementers')
      .update({ welcome_sent_at: new Date().toISOString() })
      .eq('id', ci.id)
      .then(undefined, () => undefined)

    return NextResponse.json({ ok: true, sentTo: to })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
  }
}
