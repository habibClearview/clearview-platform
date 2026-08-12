// ============================================================
// THE PARTICIPANT ROUTE
//
// Everything a phone in the room does goes through here. The browser never
// writes to the database directly: it has no grant on these tables, and the
// push channel check could not be run in this container, so nothing is built
// on the assumption that the public key is safely fenced.
//
// THREE GUARDS ON A SUBMISSION, all of them refusals rather than corrections:
//
//   1. The question must be the one currently open for this engagement. Not a
//      question that was open earlier, not the next one, not one from another
//      block.
//   2. It must not have been revealed. R11 locks an answer at reveal, and a
//      route that accepted a late answer would quietly change a distribution
//      the room had already read off the wall.
//   3. The rate limit must not be spent, so one device cannot flood a room.
//
// WHO IS SUBMITTING is taken from the signed cookie and NEVER from the body.
// See src/lib/stage1-room-identity.ts for why that distinction carries the
// whole of the security here.
//
// WHAT IS STORED IS WHAT WAS TYPED. No markup is stripped, escaped or
// interpreted on the way in. A participant who types a script tag has typed
// eight characters of text, and the screens render it as text; mangling it
// here would corrupt a legitimate answer containing a less-than sign while
// doing nothing the display does not already do.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { loadSessionLink, resolveJoinCode } from '@/lib/session-link'
import { isRefusal, readAnswer, refuseSubmission } from '@/lib/stage1-questions'
import { ROOM_COOKIE, decodeIdentity, encodeIdentity, newIdentity } from '@/lib/stage1-room-identity'
import { gateLabel } from '@/lib/gtcv-gates'
import { LATE_ANSWER_REFUSED, acceptsLateAnswer, identityLine, mayShowAnswers, questionPosition } from '@/lib/service-anchor'
import {
  LINK_CLOSED,
  PERSONAL_GRANT_TYPE,
  refusePersonalLink,
  showsAnonymousNotice,
  submissionIdentity,
} from '@/lib/stage2-personal-links'

export const dynamic = 'force-dynamic'

/**
 * R37. Is this person still allowed in?
 *
 * CHECKED ON EVERY REQUEST, not only when they first opened their link. A
 * browser handed a cookie an hour ago cannot be reached to take it back, so
 * revocation only bites if it is asked about at the moment the answer arrives.
 * That is the whole of R37 and it is the only expensive part of Stage 2.
 *
 * Somebody who came in on the room code has no person to check, and is let
 * through: R38 says the code path keeps working exactly as it did.
 */
async function personStillAllowed(
  db: ReturnType<typeof admin>,
  personId: string | null,
  clientId: string,
): Promise<boolean> {
  if (!personId) return true

  const [{ data: grant }, { data: client }] = await Promise.all([
    db.from('client_access_grants')
      .select('grant_type, revoked_at, expires_at, party_id, client_id')
      .eq('party_id', personId)
      .eq('client_id', clientId)
      .is('revoked_at', null)
      .maybeSingle(),
    db.from('engagement_clients').select('status').eq('id', clientId).maybeSingle(),
  ])

  const refusal = refusePersonalLink(grant, client?.status ?? null, Date.now())
  if (refusal) {
    // Logged with the reason, because a coach asking "why did Grace's link
    // stop" deserves an answer. The person holding it is told only the one
    // sentence; the reason never reaches them.
    console.error('room: personal link refused', { reason: refusal })
    return false
  }
  return true
}

/** The one sentence a refused person sees, whatever the reason. */
function linkClosed() {
  return NextResponse.json({ joined: false, linkClosed: true, error: LINK_CLOSED }, { status: 401 })
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/**
 * What the Participant Page shows: the open question and this browser's own
 * answer to it. Never anybody else's answer to a hidden question, and never a
 * name on an anonymous one.
 */
export async function GET(req: NextRequest) {
  try {
    const me = decodeIdentity(req.cookies.get(ROOM_COOKIE)?.value)
    if (!me) return NextResponse.json({ joined: false })

    const db = admin()

    // R37, before anything is read. A revoked person is not shown the room and
    // then refused when they answer; they are refused now.
    if (!(await personStillAllowed(db, me.personId, me.clientId))) return linkClosed()

    // This device is still listening. Recorded here because this is the one
    // thing every phone in the room does every second and a half, so it is the
    // only honest evidence of who is still there. It is NEVER folded into the
    // answer counter: see the comment at the top of the presence migration for
    // why that separation matters on a projector.
    await db
      .from('gtcv_room_presence')
      .upsert(
        { client_id: me.clientId, participant_id: me.participantId, last_seen_at: new Date().toISOString() },
        { onConflict: 'client_id,participant_id' },
      )
      .then(({ error }) => {
        // Never a reason to refuse the page. A participant whose presence was
        // not recorded can still answer.
        if (error) console.error('room GET: presence stamp failed', error)
      })

    const { data: state } = await db
      .from('gtcv_room_state')
      .select('open_question_id, revealed, timer_started_at, timer_seconds, timer_paused_with_seconds_left, current_service_id')
      .eq('client_id', me.clientId)
      .maybeSingle()

    if (!state?.open_question_id) {
      return NextResponse.json({ joined: true, question: null, state: state || null })
    }

    const { data: question } = await db
      .from('gtcv_questions')
      .select('id, gate_id, sort_order, question_text, question_type, is_named, answers_visible, authors_visible, target_fields, options, scale_min, scale_max')
      .eq('id', state.open_question_id)
      .eq('client_id', me.clientId)
      .maybeSingle()

    // C37 and C38. A question with nothing to say which block it belongs to or
    // where it sits in the set is the fault this whole correction opens with.
    // Worked out here so a page cannot forget to ask.
    let context: Record<string, unknown> = {}
    if (question) {
      const { data: siblings } = await db
        .from('gtcv_questions')
        .select('id, sort_order')
        .eq('client_id', me.clientId)
        .eq('gate_id', question.gate_id)
        .order('sort_order', { ascending: true })
      const list = siblings || []
      const at = list.findIndex((q) => q.id === question.id)

      // C6, C37. The service the room is working inside.
      const { data: svc } = state.current_service_id
        ? await db.from('gtcv_service_inventory')
            .select('service_name').eq('id', state.current_service_id).maybeSingle()
        : { data: null }

      context = {
        blockName: gateLabel(question.gate_id),
        canvasNumber: question.gate_id === 'phase_0' ? 'Phase 0' : question.gate_id.toUpperCase(),
        serviceName: svc?.service_name || null,
        position: at >= 0 && list.length > 0 ? questionPosition(at, list.length) : null,
      }
    }

    // This browser's own answers only. R14 hides other people's answers to a
    // score or classify question until reveal, and the simplest way to be sure
    // of that is never to send them.
    const { data: mine } = await db
      .from('gtcv_submissions')
      .select('id, values, score_value, option_value, submitted_at')
      .eq('question_id', state.open_question_id)
      .eq('participant_id', me.participantId)
      .order('submitted_at', { ascending: true })

    // R12: on a collect question every participant sees all answers as they
    // arrive, so those are sent. On score and classify they are not.
    // C60 with C56. The ANSWERS switch decides, and a reveal opens it. Not the
    // question type: a collect question with answers hidden is exactly how a
    // facilitator stops the first answer anchoring everybody else's.
    let everyones: { values: Record<string, string> }[] = []
    const showOthers = question
      ? mayShowAnswers(
          { answersVisible: !!question.answers_visible, authorsVisible: !!question.authors_visible },
          Boolean(state.revealed),
        )
      : false
    if (question?.question_type === 'collect' && showOthers) {
      const { data } = await db
        .from('gtcv_submissions')
        .select('values, submitted_at')
        .eq('question_id', state.open_question_id)
        .neq('disposition', 'discarded')
        .order('submitted_at', { ascending: true })
        .limit(500)
      everyones = (data || []).map((r) => ({ values: r.values || {} }))
    }

    return NextResponse.json({
      joined: true,
      question: question || null,
      state,
      mine: mine || [],
      everyones,
      // The name this browser is known by, so a personal link can say who it
      // thinks you are. Empty for somebody who came in on the room code.
      // C33, C34, C35. Who this browser is, as ONE LINE, worked out on the
      // server so every screen says it the same way. Empty until a guest has
      // given it once; a personal link fills it before they ever see a box.
      me: {
        name: me.personName,
        line: identityLine(me.personOrg, me.personName, me.personRole),
        knowsWho: Boolean((me.personName || '').trim()),
        isGuest: !me.personId,
      },
      context,
      // R39. Whether the consent sentence has to be on screen. Decided on the
      // server so a page cannot forget to ask.
      showAnonymousNotice: showsAnonymousNotice(question ? question.is_named : null),
    })
  } catch (e) {
    console.error('room GET: unexpected error', e)
    return NextResponse.json({ error: 'Could not load the room' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: string
      code?: string
      questionId?: string
      token?: string
      name?: string
      role?: string
      organisation?: string
      values?: Record<string, unknown>
      score?: unknown
      option?: unknown
      submissionId?: string
    }

    // ---- opening a personal link (R34, R35) ----------------------------
    // The link carries a value in the address. It is exchanged here, ONCE, for
    // the same signed cookie the code path issues, and the page then removes
    // it from the address so that from then on the address reads exactly
    // /room. That is the amendment to R5, and the cookie has carried empty
    // slots for a person since Stage 1 precisely so this needed no re-issue.
    if (body.action === 'personal') {
      const db = admin()
      const token = typeof body.token === 'string' ? body.token : ''
      // Short enough to be a mistake, long enough to be worth a lookup.
      if (token.length < 16 || token.length > 200) return linkClosed()

      // Rate limited on the address, because a personal link never expires and
      // so is worth more to a guesser than a session code that dies at teatime.
      const limit = await checkRateLimit(db, `room-personal:${clientIp(req)}`, 30, 3600)
      if (!limit.allowed) {
        return NextResponse.json(
          { error: 'Too many tries. Wait a few minutes.' },
          { status: 429 },
        )
      }

      const { data: grant } = await db
        .from('client_access_grants')
        .select('grant_type, revoked_at, expires_at, party_id, client_id')
        .eq('access_token', token)
        .maybeSingle()

      const { data: client } = grant?.client_id
        ? await db.from('engagement_clients').select('status').eq('id', grant.client_id).maybeSingle()
        : { data: null }

      // Every failure looks the same to the person holding it: a link that
      // never existed, one that was withdrawn, and one whose engagement has
      // finished all read alike. Telling a stranger which it was tells them
      // something about a link they do not hold.
      if (refusePersonalLink(grant, client?.status ?? null, Date.now())) return linkClosed()

      const { data: party } = await db
        .from('engagement_parties')
        .select('id, name, client_id')
        .eq('id', grant!.party_id!)
        .maybeSingle()
      // A party on a different engagement from the grant is not this one's,
      // whatever the grant says. Checked rather than trusted.
      if (!party || party.client_id !== grant!.client_id) return linkClosed()

      const identity = newIdentity(grant!.client_id!, { id: party.id, name: party.name || '' })
      const res = NextResponse.json({ joined: true, name: party.name || '' })
      res.cookies.set(ROOM_COOKIE, encodeIdentity(identity), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        // R34: it lasts the engagement, not the afternoon. The grant is what
        // actually decides, and it is re-checked on every request, so a long
        // cookie is a convenience and never an authority.
        maxAge: 60 * 60 * 24 * 200,
      })

      await db
        .from('client_access_grants')
        .update({ last_accessed_at: new Date().toISOString() })
        .eq('access_token', token)
        .then(({ error }) => { if (error) console.error('room: personal link stamp failed', error) })

      return res
    }

    // ---- joining ------------------------------------------------------
    // A code identifies the room. /join is left exactly as it is and still
    // sends people to /session/[token], so /room takes a code itself when it
    // has no cookie yet. See PROGRESS.md, Q4, for why both are true.
    //
    // THE CODE IS NOT RESOLVED HERE. resolveJoinCode and loadSessionLink
    // already decide what a code opens, and they check the shape, the grant
    // type, the block, the withdrawal and the expiry, answering the same null
    // for every one. Writing a second lookup would mean a rule could be
    // tightened in one place and forgotten in the other.
    // C54. The QR carries everything. Scanning opens /room with the session
    // already identified, and no code is typed. Same door as the typed code —
    // the same resolver, the same limits — so it can never open more.
    if (body.action === 'join' || body.action === 'scan') {
      const db = admin()

      // The same two limits as /api/session-join, and DELIBERATELY THE SAME
      // KEYS. Two doors onto one code must share one budget, or a guesser gets
      // twice the tries by alternating between them.
      const ip = clientIp(req)
      const TOO_MANY = () => NextResponse.json(
        { error: 'Too many tries. Wait a few minutes, or use the link instead.' },
        { status: 429 },
      )
      const mine = await checkRateLimit(db, `session-join:${ip}`, 20, 3600)
      if (!mine.allowed) return TOO_MANY()
      const everybody = await checkRateLimit(db, 'session-join:all', 400, 3600)
      if (!everybody.allowed) return TOO_MANY()

      // One answer for every kind of failure, exactly as /api/session-join
      // answers, so a guesser learns nothing from which one they hit.
      const token = await resolveJoinCode(typeof body.code === 'string' ? body.code : '')
      const link = token ? await loadSessionLink(token) : null
      if (!link?.clientId) {
        return NextResponse.json(
          { error: 'That code does not open anything. Check it on the screen and try again.' },
          { status: 404 },
        )
      }

      const identity = newIdentity(link.clientId)
      const res = NextResponse.json({ joined: true })
      res.cookies.set(ROOM_COOKIE, encodeIdentity(identity), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 12,
      })
      return res
    }

    // ---- C33. Who a guest is, given once and never asked again ---------
    // Kept in the same signed cookie as everything else, so it survives the
    // page being closed and is never re-asked. C36: there is no route here for
    // changing it afterwards — identity is corrected on the coach dashboard,
    // so nobody becomes somebody else halfway through a session.
    if (body.action === 'whoAmI') {
      const me0 = decodeIdentity(req.cookies.get(ROOM_COOKIE)?.value)
      if (!me0) return NextResponse.json({ error: 'This device has not joined a room' }, { status: 401 })
      const name = (body.name || '').slice(0, 120).trim()
      const role = (body.role || '').slice(0, 120).trim()
      const org = (body.organisation || '').slice(0, 160).trim()
      if (!name) return NextResponse.json({ error: 'Enter your name' }, { status: 400 })

      const res = NextResponse.json({ ok: true })
      res.cookies.set(ROOM_COOKIE, encodeIdentity({
        ...me0,
        personName: name,
        personRole: role || null,
        personOrg: org || null,
      }), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 200,
      })
      return res
    }

    // ---- submitting ---------------------------------------------------
    const me = decodeIdentity(req.cookies.get(ROOM_COOKIE)?.value)
    if (!me) return NextResponse.json({ error: 'This device has not joined a room' }, { status: 401 })

    const db = admin()

    // R37. A revoked person cannot submit, and this is where it matters most:
    // their browser still holds a valid cookie and will keep trying.
    if (!(await personStillAllowed(db, me.personId, me.clientId))) return linkClosed()

    // GUARD 3 first, because it is the cheapest and the one that protects the
    // other two from being asked ten thousand times.
    const limit = await checkRateLimit(db, `room-submit:${me.participantId}`, 120, 300)
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'That is a lot of answers in a few minutes. Give it a moment.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      )
    }

    const { data: state } = await db
      .from('gtcv_room_state')
      .select('open_question_id, revealed, previous_question_id, previous_revealed')
      .eq('client_id', me.clientId)
      .maybeSingle()

    // GUARDS 1 AND 2, both decided in src/lib/stage1-questions.ts so they can
    // be exercised by a test without a server and a database standing behind
    // it. The route's job is to fetch the state and answer with the verdict.
    //
    // C43 SOFTENS GUARD 1 BY EXACTLY ONE QUESTION. Somebody part way through an
    // answer when the facilitator moves on is allowed to finish, and their
    // answer counts against the question they were answering. Never after that
    // question was revealed: a reveal is the moment the room reads the numbers
    // off the wall.
    const refused = refuseSubmission(state, body.questionId)
    const late = refused
      ? acceptsLateAnswer(body.questionId, state?.previous_question_id, Boolean(state?.previous_revealed))
      : false
    if (refused && !late) {
      // C43's addition: it SAYS SO. Never fail silently.
      const message = state?.open_question_id ? LATE_ANSWER_REFUSED : refused.error
      return NextResponse.json({ error: message }, { status: refused.status })
    }

    const { data: question } = await db
      .from('gtcv_questions')
      .select('id, question_type, is_named, target_fields, options, scale_min, scale_max')
      .eq('id', late ? body.questionId! : state!.open_question_id)
      .eq('client_id', me.clientId)
      .maybeSingle()
    if (!question) {
      return NextResponse.json({ error: 'That question is no longer open' }, { status: 409 })
    }

    // R18 AND R39 TOGETHER, and they are different columns on purpose.
    //
    // participant_name is what interfaces read, and it stays empty on an
    // anonymous question exactly as Stage 1 left it, so an interface cannot
    // show what is not there.
    //
    // identity_party_id is recorded ALWAYS, and no route may ever select it.
    // The room is told this is happening, in plain words, on their own screen
    // before they answer — see ANONYMOUS_NOTICE. That sentence is the consent
    // and it is not optional.
    const who = submissionIdentity(me, Boolean(question.is_named))

    // What the answer writes, or the refusal that stops it. Also decided away
    // from the route, for the same reason as the guards above.
    const answer = readAnswer(question, body)
    if (isRefusal(answer)) {
      return NextResponse.json({ error: answer.error }, { status: answer.status })
    }

    const row: Record<string, unknown> = {
      client_id: me.clientId,
      question_id: question.id,
      participant_id: me.participantId,
      participant_name: who.displayName,
      identity_party_id: who.identityPartyId,
      is_guest: who.isGuest,
      values: answer.values,
      score_value: answer.score_value,
      option_value: answer.option_value,
    }

    // R10: a collect question keeps every submission separately.
    // R11: a score or classify answer is the person's one answer, changed
    // until reveal. Which row is changed is decided by the cookie's
    // participant identifier, never by an identifier in the request, so a
    // participant can only ever change their own.
    if (question.question_type === 'collect') {
      const { error } = await db.from('gtcv_submissions').insert(row)
      if (error) {
        console.error('room POST: insert failed', error)
        return NextResponse.json({ error: 'Could not send that' }, { status: 500 })
      }
    } else {
      const { data: existing } = await db
        .from('gtcv_submissions')
        .select('id')
        .eq('question_id', question.id)
        .eq('participant_id', me.participantId)
        .maybeSingle()

      const { error } = existing
        ? await db.from('gtcv_submissions')
            .update({ ...row, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
            .eq('participant_id', me.participantId)
        : await db.from('gtcv_submissions').insert(row)

      if (error) {
        console.error('room POST: save failed', error)
        return NextResponse.json({ error: 'Could not send that' }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('room POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not send that' }, { status: 500 })
  }
}
