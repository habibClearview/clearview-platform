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
import { sendEmail, emailAvailable, brandedEmail } from '@/lib/email'
import { textToEmail } from '@/lib/letter'
import {
  CO_IMPLEMENTER_LETTER_KEY, CO_IMPLEMENTER_LETTER_SUBJECT, DEFAULT_CO_IMPLEMENTER_LETTER,
} from '@/lib/co-implementer-letter'
import { cleanEmail, emailLooksSendable, salutation } from '@/lib/engagement-brief'
import { checkRateLimit } from '@/lib/rate-limit'
import { getBearerToken } from '@/lib/auth/api-authz'
import { canManageTeam } from '@/lib/coach-types'
import { supabaseServiceKey, supabaseUrl } from '@/lib/supabase-env'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = supabaseUrl()
  const key = supabaseServiceKey()
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * The letter as it will be sent: whatever a super coach saved, or the generated
 * one when they have saved nothing. A missing coach_letters table means the
 * migration is not applied yet, which is the same thing as nothing saved.
 */
async function letterBody(admin: ReturnType<typeof getAdminClient>): Promise<string> {
  const { data, error } = await admin.from('coach_letters')
    .select('body').eq('key', CO_IMPLEMENTER_LETTER_KEY).maybeSingle()
  if (error) return DEFAULT_CO_IMPLEMENTER_LETTER
  const saved = typeof data?.body === 'string' ? data.body.trim() : ''
  return saved || DEFAULT_CO_IMPLEMENTER_LETTER
}

/** Authenticate, and refuse anybody who may not manage the team. */
async function requireSuperCoach(req: NextRequest, admin: ReturnType<typeof getAdminClient>) {
  const token = getBearerToken(req)
  if (!token) return { ok: false as const, res: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return { ok: false as const, res: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  const { data: profile } = await admin.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !canManageTeam(profile.role)) {
    return { ok: false as const, res: NextResponse.json({ error: 'Only the coach who manages the team can do that.' }, { status: 403 }) }
  }
  return { ok: true as const, user }
}

/**
 * READ IT BEFORE IT GOES, AND CHANGE IT. The same three controls the engagement
 * welcome letters have: read it as it will arrive, edit the words, and start
 * again from the generated letter.
 *
 * GET returns the letter's text and the letter as it will look. No address is
 * touched and nothing is sent.
 */
export async function GET(req: NextRequest) {
  try {
    const admin = getAdminClient()
    const gate = await requireSuperCoach(req, admin)
    if (!gate.ok) return gate.res

    const { data } = await admin.from('coach_letters')
      .select('body,updated_at').eq('key', CO_IMPLEMENTER_LETTER_KEY).maybeSingle()
    const saved = typeof data?.body === 'string' ? data.body.trim() : ''
    const body = saved || DEFAULT_CO_IMPLEMENTER_LETTER
    const html = brandedEmail({
      brand: 'canvas',
      preheader: 'What your role is, who you report to, and how the platform works.',
      heading: 'Welcome to the team',
      // A name nobody is addressed by, so the preview reads as a letter rather
      // than as a fragment. The real one carries the person's own name.
      paragraphs: [salutation('Your Name') || '', ...textToEmail(body)].filter(Boolean),
      footNote: 'Reply to this email with any question at all. There is no question too small in the first week.',
    })
    return NextResponse.json({
      ok: true,
      subject: CO_IMPLEMENTER_LETTER_SUBJECT,
      text: body,
      edited: !!saved,
      updatedAt: data?.updated_at || null,
      html,
    })
  } catch (e) {
    console.error('co-implementer-welcome GET failed', e)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

/**
 * PATCH saves the edited letter, or clears it back to the generated one when
 * the text sent is empty. The words are stored as text and rendered as text:
 * what a person typed is never markup.
 */
export async function PATCH(req: NextRequest) {
  try {
    const admin = getAdminClient()
    const gate = await requireSuperCoach(req, admin)
    if (!gate.ok) return gate.res

    const sent = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const text = typeof sent.text === 'string' ? sent.text : ''
    // Long enough for a letter, short enough that this cannot become a store.
    if (text.length > 20000) {
      return NextResponse.json({ error: 'That letter is too long to save.' }, { status: 400 })
    }

    const { error } = await admin.from('coach_letters').upsert({
      key: CO_IMPLEMENTER_LETTER_KEY,
      body: text.trim(),
      updated_at: new Date().toISOString(),
      updated_by: gate.user.email || null,
    }, { onConflict: 'key' })

    if (error) {
      console.error('co-implementer-welcome PATCH failed', error)
      const missing = /coach_letters/i.test(`${error.code || ''} ${error.message || ''}`)
        && /(does not exist|schema cache|relation)/i.test(`${error.code || ''} ${error.message || ''}`)
      return NextResponse.json({
        error: missing
          ? 'The letters table is not in the database yet, so this could not be saved. Apply supabase/migrations/2026_09_13_coach_letters.sql and try again.'
          : 'That did not save. Please try again.',
      }, { status: missing ? 409 : 500 })
    }
    return NextResponse.json({ ok: true, cleared: !text.trim() })
  } catch (e) {
    console.error('co-implementer-welcome PATCH failed', e)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const asked = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const coImplementerId = String(asked.coImplementerId || '')
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

    // The same rule the screen itself uses, read from the same place, so the
    // two cannot drift apart if what "manages the team" means ever changes.
    const { data: profile } = await admin.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
    if (!profile || !canManageTeam(profile.role)) {
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
    const letter = await letterBody(admin)

    const html = brandedEmail({
      brand: 'canvas',
      preheader: 'What your role is, who you report to, and how the platform works.',
      heading: 'Welcome to the team',
      paragraphs: [...(hello ? [hello] : []), ...textToEmail(letter)],
      footNote: 'Reply to this email with any question at all. There is no question too small in the first week.',
    })

    // CLAIMED BEFORE IT IS SENT, NOT AFTER. The AI review on #260: reading
    // welcome_sent_at and writing it back after the send are two steps, so two
    // presses landing together both read null, both sent, and the person got
    // the letter twice. The claim is one conditional write instead: only the
    // request that turns the column from null to a time may send, which the
    // database decides rather than this code.
    //
    // Where the column is not there yet the write fails, nothing is claimed,
    // and the letter still goes. That is the honest degradation: a letter that
    // can be sent twice until the migration is applied, rather than a button
    // that stops working.
    let claimed = false
    const claimedAt = new Date().toISOString()
    const { data: claim, error: claimErr } = await admin.from('co_implementers')
      .update({ welcome_sent_at: claimedAt })
      .eq('id', ci.id)
      .is('welcome_sent_at', null)
      .select('id')

    if (claimErr) {
      // ONLY THE MISSING COLUMN IS FORGIVEN. The AI review: falling through on
      // ANY claim error meant a network blip or a permission problem also sent
      // the letter unclaimed, which is a second copy through somebody's door.
      // A letter held back can be sent again in a moment. A letter sent twice
      // cannot be taken back, so the doubt resolves the other way.
      const why = `${claimErr.code || ''} ${claimErr.message || ''}`
      const columnNotThereYet = /welcome_sent_at/i.test(why) && /(does not exist|schema cache|undefined column|42703)/i.test(why)
      if (!columnNotThereYet) {
        console.error('co-implementer-welcome: could not claim the send', claimErr)
        return NextResponse.json(
          { ok: false, reason: 'That letter could not be claimed for sending. Nothing was sent. Please try again.' },
          { status: 503 },
        )
      }
      // The migration is not applied yet, so there is nothing to claim with.
      // The letter still goes; it can go twice until the column exists.
    } else {
      if (!claim || claim.length === 0) {
        // Somebody else claimed it between the read above and here. Say when,
        // so the screen can name a date instead of showing "Invalid Date".
        const { data: current } = await admin.from('co_implementers')
          .select('welcome_sent_at').eq('id', ci.id).maybeSingle()
        const sentAt = (current as Record<string, unknown> | null)?.welcome_sent_at
        return NextResponse.json({ ok: true, alreadySent: true, sentAt: typeof sentAt === 'string' ? sentAt : null })
      }
      claimed = true
    }

    const sent = await sendEmail({
      to: [to],
      subject: CO_IMPLEMENTER_LETTER_SUBJECT,
      html,
    })
    if (!sent.sent) {
      // Give the claim back, so a letter that never went can be sent again.
      if (claimed) {
        await admin.from('co_implementers')
          .update({ welcome_sent_at: null })
          .eq('id', ci.id)
          .eq('welcome_sent_at', claimedAt)
          .then(undefined, () => undefined)
      }
      return NextResponse.json({ ok: false, reason: sent.reason || 'The letter did not send' }, { status: 502 })
    }

    return NextResponse.json({ ok: true, sentTo: to })
  } catch (e) {
    // The real fault goes to the server log. What comes back says nothing
    // about the configuration or the database behind it.
    console.error('co-implementer-welcome failed', e)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
