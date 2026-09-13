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
// ONE LETTER, WITH THE WAY IN. 14 September 2026. Habib: I do not want to send
// another email to the co-implementer, they should have the link to register
// and sign on to the platform. Until now this letter explained the platform
// and a separate button sent a separate Supabase invitation, so a new person
// received two messages from two senders and the one that explained anything
// could not be acted on.
//
// The letter now carries the sign-in itself. The link is minted at the moment
// of sending with generateLink, which creates the account without Supabase
// sending an email of its own, so exactly one message goes out. It is wrapped
// through /welcome so a mail scanner's GET cannot spend it.
//
// A LETTER IS NOT HOW ACCESS IS GRANTED; THE ROSTER IS. This route refuses
// anybody who is not the coach who manages the team, and the address is read
// from the co_implementers record rather than from the request. Putting
// somebody on that roster is the act of giving them access, and this letter
// follows it. The profile it creates is the same 'coach' role, scoped to the
// same co_implementer_id, that the invite button created.
//
// WHAT IT STILL DELIBERATELY DOES NOT SAY. It names no day rate and no fee.
// Those are on the person's record and are between them and the practice, not
// something to post into an inbox that may be read over a shoulder.
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
import { signInLinkFor } from '@/lib/signin-link'
import { appBaseUrl, scannerSafeSignIn } from '@/lib/app-url'

export const dynamic = 'force-dynamic'

// The one place the button's words are written, so the preview and the letter
// that goes cannot say two different things.
const SIGN_IN_LABEL = 'Set your password and sign in'

function getAdminClient() {
  const url = supabaseUrl()
  const key = supabaseServiceKey()
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * ONE RULE FOR "THE TABLE IS NOT THERE YET", STATED ONCE. The AI review found
 * the reading and the writing deciding this with two slightly different lists,
 * so one of them would have called a missing table a plain failure and said the
 * wrong thing about it. A rule written twice is a rule that drifts.
 */
function tableNotThereYet(error: { code?: string; message?: string } | null): boolean {
  const why = `${error?.code || ''} ${error?.message || ''}`
  return /coach_letters/i.test(why) && /(does not exist|schema cache|relation|42p01)/i.test(why)
}

/** What was read: the letter to use, and what was actually saved (if anything). */
type LetterRead =
  | { ok: true; body: string; saved: string; updatedAt: string | null }
  | { ok: false }

/**
 * The letter as it will be sent: whatever a super coach saved, or the generated
 * one when they have saved nothing.
 *
 * ONLY A MISSING TABLE COUNTS AS NOTHING SAVED. CodeRabbit: any database error
 * at all used to select the generated letter, so a timeout or a permission
 * problem would have posted the generated words to somebody in place of
 * Habib's own, and then claimed the one send that is allowed, leaving no way to
 * correct it. The table genuinely not existing yet is the one case where the
 * generated letter is the right answer. Everything else stops the request.
 */
async function readLetter(admin: ReturnType<typeof getAdminClient>): Promise<LetterRead> {
  const { data, error } = await admin.from('coach_letters')
    .select('body,updated_at').eq('key', CO_IMPLEMENTER_LETTER_KEY).maybeSingle()

  if (error) {
    if (!tableNotThereYet(error)) {
      console.error('co-implementer-welcome: could not read the letter', error)
      return { ok: false }
    }
    return { ok: true, body: DEFAULT_CO_IMPLEMENTER_LETTER, saved: '', updatedAt: null }
  }

  const saved = typeof data?.body === 'string' ? data.body.trim() : ''
  return { ok: true, body: saved || DEFAULT_CO_IMPLEMENTER_LETTER, saved, updatedAt: data?.updated_at || null }
}

/**
 * The sign-in this letter carries, and the profile behind it.
 *
 * generateLink creates the account when there is not one and returns a
 * one-time link WITHOUT Supabase emailing anything, so the only message the
 * co-implementer receives is this letter.
 *
 * A LINK WITHOUT A PROFILE IS A DOOR INTO AN EMPTY ROOM. The link signs them
 * in; without a user_profiles row saying who they are they arrive scoped to
 * nothing, see no clients, and a first impression is spent. The row written
 * here is exactly the one the invite button used to write: role 'coach',
 * scoped to this co_implementer_id, every other scope column explicitly null.
 *
 * An existing profile is never touched. Somebody who already has a login keeps
 * the role they have, so sending this letter can never change what a person
 * can reach.
 */
type SignInMade = { ok: true; url: string } | { ok: false; why: string }

async function signInForCoImplementer(
  admin: ReturnType<typeof getAdminClient>,
  ci: Record<string, unknown>,
  to: string,
): Promise<SignInMade> {
  const base = appBaseUrl()
  // NOTHING A DATABASE OR AN AUTH SERVICE SAID EVER REACHES THE ANSWER. Every
  // reason below is a fixed sentence written here. The real fault goes to the
  // server log, where configuration and column names belong.
  let linked
  try {
    linked = await signInLinkFor(admin, to, `${base}/coach`, { full_name: (ci.name as string) || null })
  } catch (e) {
    console.error('co-implementer-welcome: could not make the sign-in link', e)
    return { ok: false, why: 'their sign-in link could not be made, so nothing was sent' }
  }
  if (linked.userId) {
    const { data: already, error: lookErr } = await admin
      .from('user_profiles').select('id').eq('id', linked.userId).maybeSingle()
    // A lookup that failed is not proof there is no profile. Writing one on a
    // failed read could overwrite a live account's scope, so it stops instead.
    if (lookErr) {
      console.error('co-implementer-welcome: could not check the account', lookErr)
      return { ok: false, why: 'their account could not be checked, so nothing was sent' }
    }
    if (!already) {
      const profileRow: Record<string, unknown> = {
        id: linked.userId,
        role: 'coach',
        full_name: (ci.name as string) || null,
        email: to,
        engagement_client_id: null,
        assigned_unit_ids: [],
        co_implementer_id: ci.id,
        funder_programme_id: null,
      }
      // 'invited' is the accurate status for somebody who has not signed in
      // yet. Where the older CHECK constraint still rejects it (migration
      // 2026_07_22_user_profiles_allow_invited_status.sql not applied), the
      // column takes its own default rather than a made-up stand-in.
      let { error } = await admin.from('user_profiles').upsert({ ...profileRow, status: 'invited' })
      if (error && error.code === '23514' && /status/i.test(error.message || '')) {
        ;({ error } = await admin.from('user_profiles').upsert(profileRow))
      }
      if (error) {
        console.error('co-implementer-welcome: could not create the profile', error)
        return { ok: false, why: 'their login could not be set up, so nothing was sent' }
      }
    }
  }
  return { ok: true, url: scannerSafeSignIn(linked.link, base) }
}

const LETTER_UNREADABLE = NextResponse.json(
  { ok: false, reason: 'The letter could not be read just now, so nothing was sent. Please try again in a moment.' },
  { status: 503 },
)

/**
 * Authenticate, refuse anybody who may not manage the team, and hold the door
 * to a sensible number of knocks. Reading and editing are cheap, but an
 * unlimited endpoint is an unlimited endpoint, and this one is behind the same
 * service-role client the send is.
 */
async function requireSuperCoach(
  req: NextRequest,
  admin: ReturnType<typeof getAdminClient>,
  what: string,
) {
  const token = getBearerToken(req)
  if (!token) return { ok: false as const, res: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return { ok: false as const, res: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }

  const rl = await checkRateLimit(admin, `${what}:${user.id}`, 120, 3600)
  if (!rl.allowed) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: 'That has been asked for too many times recently.' }, {
        status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) },
      }),
    }
  }

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
    const gate = await requireSuperCoach(req, admin, 'co-implementer-letter:read')
    if (!gate.ok) return gate.res

    const read = await readLetter(admin)
    if (!read.ok) return LETTER_UNREADABLE
    const { body, saved } = read
    const html = brandedEmail({
      brand: 'canvas',
      preheader: 'What your role is, who you report to, and how the platform works.',
      heading: 'Welcome to the team',
      // A name nobody is addressed by, so the preview reads as a letter rather
      // than as a fragment. The real one carries the person's own name.
      paragraphs: [salutation('Your Name') || '', ...textToEmail(body)].filter(Boolean),
      // The preview shows the button in its place. The real letter carries a
      // one-time link minted for one person; this one goes to the page that
      // link opens, so nothing that signs anybody in is produced by a preview.
      ctaLabel: SIGN_IN_LABEL,
      ctaUrl: `${appBaseUrl()}/welcome`,
      footNote: 'Reply to this email with any question at all. There is no question too small in the first week.',
    })
    return NextResponse.json({
      ok: true,
      subject: CO_IMPLEMENTER_LETTER_SUBJECT,
      text: body,
      edited: !!saved,
      updatedAt: read.updatedAt,
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
    const gate = await requireSuperCoach(req, admin, 'co-implementer-letter:save')
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
      const missing = tableNotThereYet(error)
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
    // SENDING IT AGAIN IS DELIBERATE, NEVER ACCIDENTAL. A sign-in link expires,
    // and a letter that can only ever go once left a co-implementer whose link
    // had gone stale with no way back in. Asking again is a separate press
    // behind its own confirmation on the screen, and it mints a fresh link.
    const resend = asked.resend === true

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
    if (typeof alreadyAt === 'string' && alreadyAt && !resend) {
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
    const read = await readLetter(admin)
    if (!read.ok) return LETTER_UNREADABLE
    const letter = read.body

    // The way in, minted before anything is claimed or sent. If the account or
    // the profile cannot be set up, the letter does not go at all: a welcome
    // whose button does not work is worse than one that arrives a minute later.
    const wayIn = await signInForCoImplementer(admin, ci as Record<string, unknown>, to)
    if (!wayIn.ok) {
      return NextResponse.json({ ok: false, reason: `Nothing was sent: ${wayIn.why}.` }, { status: 502 })
    }

    const html = brandedEmail({
      brand: 'canvas',
      preheader: 'What your role is, who you report to, and how the platform works.',
      heading: 'Welcome to the team',
      paragraphs: [...(hello ? [hello] : []), ...textToEmail(letter)],
      ctaLabel: SIGN_IN_LABEL,
      ctaUrl: wayIn.url,
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
    // A deliberate resend is not racing anybody for the one send, so it writes
    // the new date outright. Everything else still has to win the claim.
    const claimQuery = admin.from('co_implementers')
      .update({ welcome_sent_at: claimedAt })
      .eq('id', ci.id)
    const { data: claim, error: claimErr } = await (resend ? claimQuery : claimQuery.is('welcome_sent_at', null))
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
          // A resend puts back the date the earlier send wrote, so a failed
          // second attempt cannot erase the record of the first.
          .update({ welcome_sent_at: resend && typeof alreadyAt === 'string' ? alreadyAt : null })
          .eq('id', ci.id)
          .eq('welcome_sent_at', claimedAt)
          .then(undefined, () => undefined)
      }
      return NextResponse.json({ ok: false, reason: sent.reason || 'The letter did not send' }, { status: 502 })
    }

    return NextResponse.json({ ok: true, sentTo: to, resent: resend })
  } catch (e) {
    // The real fault goes to the server log. What comes back says nothing
    // about the configuration or the database behind it.
    console.error('co-implementer-welcome failed', e)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
