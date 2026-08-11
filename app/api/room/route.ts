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

export const dynamic = 'force-dynamic'

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
      .select('open_question_id, revealed, timer_started_at, timer_seconds, timer_paused_with_seconds_left')
      .eq('client_id', me.clientId)
      .maybeSingle()

    if (!state?.open_question_id) {
      return NextResponse.json({ joined: true, question: null, state: state || null })
    }

    const { data: question } = await db
      .from('gtcv_questions')
      .select('id, question_text, question_type, is_named, target_fields, options, scale_min, scale_max')
      .eq('id', state.open_question_id)
      .eq('client_id', me.clientId)
      .maybeSingle()

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
    let everyones: { values: Record<string, string> }[] = []
    if (question?.question_type === 'collect') {
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
      values?: Record<string, unknown>
      score?: unknown
      option?: unknown
      submissionId?: string
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
    if (body.action === 'join') {
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

    // ---- submitting ---------------------------------------------------
    const me = decodeIdentity(req.cookies.get(ROOM_COOKIE)?.value)
    if (!me) return NextResponse.json({ error: 'This device has not joined a room' }, { status: 401 })

    const db = admin()

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
      .select('open_question_id, revealed')
      .eq('client_id', me.clientId)
      .maybeSingle()

    // GUARDS 1 AND 2, both decided in src/lib/stage1-questions.ts so they can
    // be exercised by a test without a server and a database standing behind
    // it. The route's job is to fetch the state and answer with the verdict.
    const refused = refuseSubmission(state, body.questionId)
    if (refused) {
      return NextResponse.json({ error: refused.error }, { status: refused.status })
    }

    const { data: question } = await db
      .from('gtcv_questions')
      .select('id, question_type, is_named, target_fields, options, scale_min, scale_max')
      .eq('id', state!.open_question_id)
      .eq('client_id', me.clientId)
      .maybeSingle()
    if (!question) {
      return NextResponse.json({ error: 'That question is no longer open' }, { status: 409 })
    }

    // R18: a name is stored ONLY on a named question. On an anonymous one
    // there is no name in the row at all, so there is none to leak later.
    const nameToStore = question.is_named ? me.personName : null

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
      participant_name: nameToStore,
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
