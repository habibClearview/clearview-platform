// ============================================================
// THE FACILITATOR'S ROUTE
//
// Everything the person at the front of the room does: writing the starting
// question set into the engagement, opening one question, revealing it,
// running the timer, setting the room size, and turning what the room sent
// into rows in the block's own table.
//
// MANAGE RIGHTS THROUGHOUT. Opening a question to a room, and accepting what
// the room said into an engagement's working tables, are not a viewer's
// decisions. requireAccess is the platform's existing check and is used here
// rather than copied.
//
// R14 IS ENFORCED BY NOT SENDING. Before a reveal, the facilitator is told how
// many people have answered a score or classify question and is not told what
// any of them said. That is not a matter of hiding values on the screen: the
// values never leave the server. A screen that has never received a number
// cannot leak one.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'
import { classifySplit, scoreDistribution, type Submission } from '@/lib/stage1-questions'
import { mayShowAnswers, mayShowNames } from '@/lib/service-anchor'
import { startingQuestionSet } from '@/lib/stage1-question-sets'
// Where an accepted answer goes: a new row for the two questions that NAME
// something, the row already named for every question that describes it.
import { isRefusal, planAccept } from '@/lib/stage1-accept'

export const dynamic = 'force-dynamic'

type Admin = ReturnType<typeof getAdminClient>

/** The block tables Stage 1 writes into, and nothing else. */
const BLOCK_TABLE: Record<string, string> = {
  phase_0: 'gtcv_assumptions',
  dp01: 'gtcv_service_inventory',
}

/**
 * WHICH COLUMN TIES A ROW TO THE ANCHORED SERVICE. 13 August 2026.
 *
 * Tool 1 shows the anchored service's activities and NOTHING ELSE: it filters on
 * service_id (T1.2, PhaseZeroWorkspace). A row written without one is invisible
 * there under every service — it is not lost, but it cannot be seen, which to
 * the person who pressed the button is the same thing.
 *
 * Accept was writing exactly that row. It copied the question's target fields
 * and nothing else, so every answer the room agreed would have landed outside
 * the service the room was discussing. This is the SECOND time this exact
 * mistake has been made here — see the comment on addActivity in
 * PhaseZeroWorkspace, which fixed it for the manual button and left this path
 * alone. Hence a named map rather than a line of code inside the handler.
 *
 * A table absent from this map takes no service link, and that is a correct
 * answer for gtcv_service_inventory: it IS the list of services.
 */
const BLOCK_SERVICE_COLUMN: Record<string, string> = {
  gtcv_assumptions: 'service_id',
  // 14 August. A problem belongs to the service the room was anchored on when
  // the room named it — the same rule, one level up.
  gtcv_problem_owner_budget: 'service_id',
}

/** The columns each of those tables will accept a value into. Named here so a
 *  column name arriving in a request can never reach the database unchecked. */
const BLOCK_COLUMNS: Record<string, string[]> = {
  gtcv_assumptions: ['service_name', 'activity', 'delivers', 'who_pays', 'assumption', 'disproof'],
  // 15 August. Tool 2's own five, so its questions can fill the problem Tool 1
  // already stated instead of making a second copy of it.
  gtcv_problem_owner_budget: [
    'problem', 'experienced_by', 'accountable', 'budget_holder',
    'cost_of_not_solving', 'budget_mechanism',
  ],
  gtcv_service_inventory: [
    'service_name', 'what_it_delivers', 'logic_type', 'has_demand',
    'hidden_delivery_costs', 'delivery_quality_risk', 'decision', 'notes',
  ],
}

/**
 * THE CAP HAS TO BE ARITHMETIC, NOT A ROUND NUMBER. 13 August 2026.
 *
 * This route is POLLED, and 600 an hour was set as though it were pressed. The
 * cost of getting that wrong was a whole session: the room answered, the rows
 * landed in gtcv_submissions, and the block showed nothing, because every read
 * after the budget ran out came back 429 and every poller discards a failed
 * response in silence. Proved from the counter (965 against 600 in one hour)
 * and from the request log (last read served 09:25:05, the phone submitted at
 * 09:27:22 into a screen that had stopped asking).
 *
 * What one facilitator legitimately spends in an hour, at the intervals the
 * components actually use:
 *
 *   RoomControlBar      every 1500ms   2,400
 *   PendingRows         every 3000ms   1,200
 *   the projected view  every 1500ms   2,400   (second tab, C46)
 *                                      -----
 *   one block open, projecting          6,000
 *   a second block tab open            +3,600   9,600
 *
 * So anything at or below ten thousand is a cap on WORKING, not on abuse. This
 * is set at double the two-tab figure: a runaway loop does hundreds a second
 * and is still stopped, and a facilitator running a room all afternoon never
 * comes near it.
 *
 * IF YOU CHANGE A POLL INTERVAL, COME BACK AND REDO THIS SUM.
 */
const FACILITATE_READS_PER_HOUR = 20000

async function requireManager(req: NextRequest, admin: Admin, clientId: string) {
  return requireAccess(req, admin, clientId, 'manage', {
    deniedMessage: 'Only the lead consultant can run a question with the room',
    rateLimit: { key: 'facilitate', max: FACILITATE_READS_PER_HOUR, windowSeconds: 3600 },
  })
}

/**
 * The questions of a block, creating the starting set the first time the block
 * is opened to a room.
 *
 * R1 says questions are stored as data, not written into a page, so the set in
 * src/lib/stage1-question-sets.ts is a STARTING POINT that becomes rows. After
 * this has run once they are ordinary rows and editing them never comes back
 * here. R4's nine other blocks seed nothing and that is a correct answer.
 */
async function questionsFor(admin: Admin, clientId: string, gateId: string) {
  const columns = 'id, gate_id, sort_order, question_text, question_type, is_named, answers_visible, authors_visible, target_fields, options, suggested_minutes, scale_min, scale_max, agreed_value, agreed_column, agreed_row_id, agreed_distribution, agreed_at'

  const { data: existing } = await admin
    .from('gtcv_questions')
    .select(columns)
    .eq('client_id', clientId)
    .eq('gate_id', gateId)
    .order('sort_order', { ascending: true })

  if (existing && existing.length > 0) return existing

  const seeds = startingQuestionSet(gateId)
  if (seeds.length === 0) return []

  // Written once. A second facilitator opening the same block a moment later
  // finds the rows already there and adds nothing, because the read above runs
  // first and this only ever runs on an empty block.
  const { data: created, error } = await admin
    .from('gtcv_questions')
    .insert(seeds.map((s) => ({ ...s, client_id: clientId })))
    .select(columns)
  if (error) {
    console.error('facilitate: seeding the question set failed', error)
    return []
  }
  return (created || []).sort((a, b) => a.sort_order - b.sort_order)
}

export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('clientId')
    const gateId = req.nextUrl.searchParams.get('gateId')
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    const questions = gateId ? await questionsFor(admin, clientId, gateId) : []

    const { data: state } = await admin
      .from('gtcv_room_state')
      .select('open_question_id, revealed, timer_started_at, timer_seconds, timer_paused_with_seconds_left, room_size, current_service_id, current_problem_id, current_activity_id')
      .eq('client_id', clientId)
      .maybeSingle()

    const open = questions.find((q) => q.id === state?.open_question_id) || null

    // What the room has sent to the question that is open. On a question from
    // another block, nothing: the facilitator is looking at this block.
    let answered = 0
    let cards: { id: string; values: Record<string, string>; name: string | null }[] = []
    let distribution: { value: number; count: number }[] = []
    let split: { option: string; count: number }[] = []
    let extremesSource: Submission[] = []

    if (open) {
      const { data: rows } = await admin
        .from('gtcv_submissions')
        .select('id, question_id, participant_id, participant_name, values, score_value, option_value, submitted_at, disposition')
        .eq('question_id', open.id)
        .neq('disposition', 'discarded')
        .order('submitted_at', { ascending: true })
        .limit(1000)

      const subs = (rows || []) as Submission[]
      answered = open.question_type === 'collect'
        ? subs.length
        // One person, one answer, however many times they changed it.
        : new Set(subs.map((s) => s.participant_id)).size

      if (open.question_type === 'collect') {
        cards = subs.map((s) => ({
          id: s.id,
          values: s.values || {},
          // C58. The AUTHORS switch decides, not is_named. Where authors are
          // hidden no name leaves the server, so nothing downstream can show
          // one by accident.
          name: mayShowNames({ answersVisible: !!open.answers_visible, authorsVisible: !!open.authors_visible })
            ? s.participant_name : null,
        }))
      } else if (state?.revealed) {
        // R14. Only after the reveal do any values leave the server.
        if (open.question_type === 'score') {
          distribution = scoreDistribution(subs, open.scale_min, open.scale_max)
        } else {
          split = classifySplit(subs, open.options || [])
        }
        // R18. Names travel only on a named question; scoreExtremes refuses to
        // return any on an anonymous one, and it is given the rows only here.
        extremesSource = mayShowNames({ answersVisible: !!open.answers_visible, authorsVisible: !!open.authors_visible })
          ? subs : []
      }
    }

    // R20. Everything the room has sent to this block that the facilitator has
    // not yet dealt with, whichever question it came from and whether or not
    // that question is still open. A pending answer does not stop being pending
    // because the room moved on.
    let pending: Submission[] = []
    if (questions.length > 0) {
      const { data } = await admin
        .from('gtcv_submissions')
        .select('id, question_id, participant_id, participant_name, values, score_value, option_value, submitted_at, disposition, is_guest')
        .eq('client_id', clientId)
        .eq('disposition', 'pending')
        .in('question_id', questions.map((q) => q.id))
        .order('submitted_at', { ascending: true })
        .limit(1000)
      // Only collect answers become rows. A score or a classify answer becomes
      // an agreed value through R23, not a row of its own.
      const collectIds = new Set(questions.filter((q) => q.question_type === 'collect').map((q) => q.id))
      pending = ((data || []) as Submission[]).filter((s) => collectIds.has(s.question_id))
    }

    // ─────────────────────────────────────────────────────────
    // WHAT A PENDING ANSWER WILL FILL, AND WHAT ELSE IT COULD FILL.
    // 15 August 2026.
    //
    // Accept now fills the row an answer is about. The facilitator has to be
    // able to see WHICH row before pressing, and to point the answer somewhere
    // else when the room named three activities and this one is about the
    // second. Both lists are the chain the room is working through, so the
    // chooser beside an answer offers real rows and never free text.
    // ─────────────────────────────────────────────────────────
    let chain: {
      serviceId: string | null
      problemId: string | null
      activityId: string | null
      problems: { id: string; label: string }[]
      activities: { id: string; label: string; problemId: string | null }[]
    } | null = null
    if (gateId === 'phase_0' && pending.length > 0) {
      const serviceId = state?.current_service_id || null
      // Only the anchored service's rows: the question was asked about one
      // service, and a chooser listing the whole engagement would make it easy
      // to file an answer under the service nobody was talking about.
      const [{ data: probs }, { data: acts }] = await Promise.all([
        admin.from('gtcv_problem_owner_budget')
          .select('id, problem, service_id, parked_at')
          .eq('client_id', clientId).order('created_at', { ascending: true }).limit(500),
        admin.from('gtcv_assumptions')
          .select('id, activity, service_id, problem_id, parked_at')
          .eq('client_id', clientId).order('created_at', { ascending: true }).limit(500),
      ])
      const mine = <T extends { service_id?: string | null; parked_at?: string | null }>(r: T) =>
        !r.parked_at && (!serviceId || r.service_id === serviceId)
      chain = {
        serviceId,
        problemId: state?.current_problem_id || null,
        activityId: state?.current_activity_id || null,
        problems: (probs || []).filter(mine)
          .map((p) => ({ id: p.id, label: (p.problem || '').trim() || 'Problem with no words yet' })),
        activities: (acts || []).filter(mine)
          .map((a) => ({
            id: a.id,
            label: (a.activity || '').trim() || 'Activity with no words yet',
            problemId: a.problem_id || null,
          })),
      }
    }

    // R21. The rows already in the block's table, so a pending answer can be
    // merged into one of them. Only the identifier and enough words to
    // recognise the row by: this list is for choosing, not for reading.
    let blockRows: { id: string; label: string }[] = []
    const table = gateId ? BLOCK_TABLE[gateId] : null
    if (table && pending.length > 0) {
      // The column that NAMES the row, which is not always the first one this
      // table accepts: gtcv_assumptions takes service_name first, so every row
      // in the list read as the service and they were impossible to tell apart.
      const first = table === 'gtcv_assumptions' ? 'activity' : (BLOCK_COLUMNS[table] || [])[0]
      const { data } = await admin
        .from(table)
        .select(`id, ${first}`)
        .eq('client_id', clientId)
        .order('sort_order', { ascending: true })
        .limit(500)
      // The column name is chosen from BLOCK_COLUMNS above rather than from the
      // request, so it is known to be a real column; the type checker cannot
      // see that from a name held in a variable, hence the cast.
      blockRows = ((data || []) as unknown as Record<string, string>[])
        .map((r) => ({ id: r.id, label: r[first] || '(no name yet)' }))
    }

    // How many phones are still listening. Sent as its own number and never
    // mixed into `answered`: a device dropping off the network must not read
    // as a person who has finished answering.
    const cutoff = new Date(Date.now() - 15000).toISOString()
    const { count: connected } = await admin
      .from('gtcv_room_presence')
      .select('participant_id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .gte('last_seen_at', cutoff)

    return NextResponse.json({
      questions,
      state: state || null,
      answered,
      pending,
      blockRows,
      chain,
      connectedDevices: connected || 0,
      cards,
      distribution,
      split,
      scored: extremesSource.map((s) => ({
        score_value: s.score_value,
        participant_name: s.participant_name,
      })),
    })
  } catch (e) {
    console.error('facilitate GET: unexpected error', e)
    return NextResponse.json({ error: 'Could not load the room' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      clientId?: string
      gateId?: string
      action?: string
      questionId?: string
      seconds?: number
      roomSize?: number | null
      isNamed?: boolean
      agreedValue?: string
      agreedColumn?: string
      agreedRowId?: string
      dissent?: { note?: string; name?: string }[]
      submissionIds?: string[]
      intoRowId?: string
      /** The row the facilitator pointed this answer at, overriding the anchor. */
      targetRowId?: string
      answersVisible?: boolean
      authorsVisible?: boolean
    }
    const clientId = body.clientId
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    /** Every write to the room's state goes through here, so client_id is
     *  always the one that was authorised and never one from the body. */
    const setState = async (patch: Record<string, unknown>) => {
      const { error } = await admin
        .from('gtcv_room_state')
        .upsert({ client_id: clientId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
      if (error) throw error
    }

    /** A question of this engagement, or null. Never one from another. */
    const ownQuestion = async (id: string | undefined) => {
      if (!id) return null
      const { data } = await admin
        .from('gtcv_questions')
        .select('id, gate_id, sort_order, question_text, question_type, is_named, answers_visible, authors_visible, options, scale_min, scale_max, target_fields')
        .eq('id', id)
        .eq('client_id', clientId)
        .maybeSingle()
      return data
    }

    switch (body.action) {
      // R3. One question, never a block. There is no action here that opens
      // more than one, which is what makes the absence checkable.
      case 'open': {
        const q = await ownQuestion(body.questionId)
        if (!q) return NextResponse.json({ error: 'That question is not on this engagement' }, { status: 404 })
        // C43. Remember what the room is leaving, and whether it had been
        // revealed, so somebody part way through an answer can still finish.
        const { data: leaving } = await admin
          .from('gtcv_room_state')
          .select('open_question_id, revealed')
          .eq('client_id', clientId)
          .maybeSingle()
        await setState({
          previous_question_id: leaving?.open_question_id || null,
          previous_revealed: Boolean(leaving?.revealed),
          open_question_id: q.id,
          revealed: false,
          timer_started_at: null,
          timer_seconds: null,
          timer_paused_with_seconds_left: null,
        })
        return NextResponse.json({ ok: true })
      }

      case 'close': {
        await setState({ open_question_id: null, revealed: false })
        return NextResponse.json({ ok: true })
      }

      case 'reveal': {
        await setState({ revealed: true })
        return NextResponse.json({ ok: true })
      }

      // R30. Started, paused and reset. What is stored is when it started and
      // how long it was set for, never a number counting down, so the phone and
      // the projector cannot drift apart.
      case 'timerStart': {
        const seconds = Number(body.seconds)
        if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60 * 60) {
          return NextResponse.json({ error: 'Enter a number of minutes' }, { status: 400 })
        }
        await setState({
          timer_started_at: new Date().toISOString(),
          timer_seconds: Math.round(seconds),
          timer_paused_with_seconds_left: null,
        })
        return NextResponse.json({ ok: true })
      }

      case 'timerPause': {
        const left = Number(body.seconds)
        await setState({
          timer_paused_with_seconds_left: Number.isFinite(left) ? Math.max(0, Math.round(left)) : 0,
        })
        return NextResponse.json({ ok: true })
      }

      case 'timerReset': {
        await setState({
          timer_started_at: null,
          timer_seconds: null,
          timer_paused_with_seconds_left: null,
        })
        return NextResponse.json({ ok: true })
      }

      // Amendment to R25. Room size is a number the facilitator sets, never one
      // the system counts, and empty is a correct state rather than a missing
      // one: the counter then shows the answers with no denominator.
      case 'roomSize': {
        const n = body.roomSize
        if (n === null || n === undefined || n === 0) {
          await setState({ room_size: null })
          return NextResponse.json({ ok: true })
        }
        if (!Number.isInteger(n) || n < 1 || n > 500) {
          return NextResponse.json({ error: 'Enter how many people are in the room' }, { status: 400 })
        }
        await setState({ room_size: n })
        return NextResponse.json({ ok: true })
      }

      // R19. The facilitator can change named or anonymous per question BEFORE
      // opening it. Refused afterwards, because turning an anonymous question
      // named once people have answered would put names on answers given on the
      // understanding that there would be none.
      case 'setNamed': {
        const q = await ownQuestion(body.questionId)
        if (!q) return NextResponse.json({ error: 'That question is not on this engagement' }, { status: 404 })

        const { count } = await admin
          .from('gtcv_submissions')
          .select('id', { count: 'exact', head: true })
          .eq('question_id', q.id)
        if ((count || 0) > 0) {
          return NextResponse.json(
            { error: 'This question has been answered already, so whether it is named can no longer be changed' },
            { status: 409 },
          )
        }

        const { error } = await admin
          .from('gtcv_questions')
          .update({ is_named: Boolean(body.isNamed), updated_at: new Date().toISOString() })
          .eq('id', q.id)
          .eq('client_id', clientId)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      // C56, C60. Either switch, before the question opens or while it is
      // open. Every device sees it on its next read, which is within two
      // seconds, and none of them has to reload.
      case 'setVisibility': {
        const q = await ownQuestion(body.questionId)
        if (!q) return NextResponse.json({ error: 'That question is not on this engagement' }, { status: 404 })
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (typeof body.answersVisible === 'boolean') patch.answers_visible = body.answersVisible
        if (typeof body.authorsVisible === 'boolean') {
          patch.authors_visible = body.authorsVisible
          // is_named is what Stage 1 wrote and what the consent sentence keys
          // off. Kept in step so the two can never disagree about whether a
          // name may be shown.
          patch.is_named = body.authorsVisible
        }
        const { error } = await admin.from('gtcv_questions')
          .update(patch).eq('id', q.id).eq('client_id', clientId)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      // R23. The agreed value, and the distribution kept beside it.
      case 'agree': {
        const q = await ownQuestion(body.questionId)
        if (!q) return NextResponse.json({ error: 'That question is not on this engagement' }, { status: 404 })

        const value = (body.agreedValue || '').trim()
        if (!value) return NextResponse.json({ error: 'Enter what the room agreed' }, { status: 400 })

        const { data: rows } = await admin
          .from('gtcv_submissions')
          .select('id, question_id, participant_id, participant_name, values, score_value, option_value, submitted_at, disposition')
          .eq('question_id', q.id)
          .neq('disposition', 'discarded')
          .limit(1000)
        const subs = (rows || []) as Submission[]

        // A snapshot, not a query to be run again later. If the answers change
        // afterwards, what the room decided on is still what it decided on.
        const snapshot = q.question_type === 'score'
          ? { kind: 'score', rows: scoreDistribution(subs, q.scale_min, q.scale_max) }
          : { kind: 'classify', rows: classifySplit(subs, q.options || []) }

        // The column, where the question has a home in the block's table. It is
        // checked against the list at the top of this file: a column name that
        // arrives in a request never reaches the database unchecked.
        const table = BLOCK_TABLE[q.gate_id]
        const column = body.agreedColumn
        const rowId = body.agreedRowId
        if (column && rowId) {
          if (!table || !(BLOCK_COLUMNS[table] || []).includes(column)) {
            return NextResponse.json({ error: 'That is not a field of this block' }, { status: 400 })
          }
          const { error: wErr } = await admin
            .from(table)
            .update({ [column]: value, updated_at: new Date().toISOString() })
            .eq('id', rowId)
            .eq('client_id', clientId)
          if (wErr) {
            console.error('facilitate: writing the agreed value failed', wErr)
            return NextResponse.json({ error: 'Could not write that into the table' }, { status: 500 })
          }
        }

        // C61 to C63. THE WHOLE PATH, snapshotted at agreement, because a
        // conclusion without its path cannot be defended to a funder six months
        // later. C62: where authors were hidden they stay hidden here and in
        // every export, permanently — so no name is written at all.
        const authorsVisible = mayShowNames({
          answersVisible: !!q.answers_visible, authorsVisible: !!q.authors_visible,
        })
        await admin.from('gtcv_question_records').insert({
          client_id: clientId,
          question_id: q.id,
          gate_id: q.gate_id,
          question_text: (q as { question_text?: string }).question_text || null,
          question_type: q.question_type,
          submissions: subs.map((s) => ({
            values: s.values || {},
            score: s.score_value,
            option: s.option_value,
            at: s.submitted_at,
            // A promise made in the room is not undone by a later report.
            name: authorsVisible ? s.participant_name : null,
          })),
          distribution: snapshot,
          authors_were_visible: authorsVisible,
          revealed_at: new Date().toISOString(),
          agreed_value: value,
          dissent: (body.dissent || []).slice(0, 50).map((d) => ({
            note: String(d?.note || '').slice(0, 500),
            name: authorsVisible ? String(d?.name || '').slice(0, 120) : null,
          })),
          locked_by_user_id: auth.userId,
          locked_by_name: auth.fullName || null,
        }).then(({ error }) => { if (error) console.error('facilitate: record write failed', error) })

        // C63. Filed against the gate through the mechanism that already
        // exists, so nothing about the Evidence Library changes.
        await admin.from('evidence_library').insert({
          client_id: clientId,
          dp_id: q.gate_id,
          title: `Room decision: ${String((q as { question_text?: string }).question_text || '').slice(0, 120)}`,
          source: 'Workshop room',
          notes: `Agreed: ${value}`,
        }).then(({ error }) => { if (error) console.error('facilitate: evidence filing failed', error) })

        const { error } = await admin
          .from('gtcv_questions')
          .update({
            agreed_value: value,
            agreed_column: column || null,
            agreed_row_id: rowId || null,
            agreed_distribution: snapshot,
            agreed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', q.id)
          .eq('client_id', clientId)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      // R21. Accept, merge, discard.
      //
      // ACCEPT FILLS THE ROW THE ANSWER IS ABOUT. 15 August 2026.
      //
      // It used to insert, always, whatever the question asked. Six questions
      // answered gave six rows with one cell each and nothing joining them,
      // which is what Habib saw and reported. The rule is in
      // src/lib/stage1-accept.ts: naming a problem or an activity makes a row,
      // and everything else FILLS the row already named.
      //
      // Nothing is thrown away when the chain is not there yet. A refusal
      // leaves the answer PENDING and says which press is missing, so the
      // facilitator accepts the activity and then comes back to this.
      case 'accept': {
        const ids = (body.submissionIds || []).filter((s) => typeof s === 'string').slice(0, 200)
        if (ids.length === 0) return NextResponse.json({ error: 'Nothing to accept' }, { status: 400 })

        const { data: rows } = await admin
          .from('gtcv_submissions')
          .select('id, values, question_id')
          .in('id', ids)
          .eq('client_id', clientId)
          .eq('disposition', 'pending')
        if (!rows || rows.length === 0) {
          return NextResponse.json({ error: 'Those answers have already been dealt with' }, { status: 409 })
        }

        const q = await ownQuestion(rows[0].question_id)
        if (!q) return NextResponse.json({ error: 'That block does not take answers yet' }, { status: 400 })

        const fields = (q.target_fields || []) as { column: string }[]

        // What the room is working through. The service has always been here;
        // the problem and the activity are what accept was missing.
        const { data: room } = await admin
          .from('gtcv_room_state')
          .select('current_service_id, current_problem_id, current_activity_id')
          .eq('client_id', clientId)
          .maybeSingle()

        // The facilitator may point one answer at a different row before
        // pressing Accept — the room named three activities and this "who pays"
        // belongs to the second. Checked against this engagement below, never
        // trusted from the request.
        const targetRowId = typeof body.targetRowId === 'string' && body.targetRowId ? body.targetRowId : null

        const plan = planAccept(
          fields.map((f) => f.column),
          {
            serviceId: room?.current_service_id || null,
            problemId: room?.current_problem_id || null,
            activityId: room?.current_activity_id || null,
          },
          BLOCK_TABLE[q.gate_id] || null,
          targetRowId,
        )
        if (isRefusal(plan)) {
          return NextResponse.json({ error: plan.refusal }, { status: 409 })
        }

        // Every submission in the group is the same answer, so one value is
        // written, not one per person. The people are already recorded on the
        // submissions themselves.
        const allowed = BLOCK_COLUMNS[plan.table] || []
        const values: Record<string, string> = {}
        for (const f of fields) {
          if (!allowed.includes(f.column)) continue
          const v = (rows[0].values || {})[f.column]
          if (typeof v === 'string' && v.trim()) values[f.column] = v
        }
        if (Object.keys(values).length === 0) {
          return NextResponse.json({ error: 'There is nothing in that answer to accept' }, { status: 400 })
        }

        /** A row named in the request has to be on this engagement. */
        const ownsRow = async (table: string, id: string) => {
          const { data } = await admin.from(table)
            .select('id').eq('id', id).eq('client_id', clientId).maybeSingle()
          return Boolean(data)
        }

        const stamp = new Date().toISOString()
        // What the room moves on to once this lands, so the next question's
        // answer has somewhere to go without anybody choosing anything.
        const nextAnchor: Record<string, unknown> = {}

        if (plan.mode === 'fillActivityValue' || plan.mode === 'fillProblemColumn') {
          const table = plan.mode === 'fillActivityValue' ? 'gtcv_assumptions' : 'gtcv_problem_owner_budget'
          if (!(await ownsRow(table, plan.rowId!))) {
            // The row was parked or deleted between the answer and the press.
            return NextResponse.json({
              error: 'The row this was going to fill is no longer there. Choose another beside the answer.',
            }, { status: 409 })
          }
        }

        if (plan.mode === 'fillActivityValue') {
          // T1.21. THE FOUR FIELDS HOLD MORE THAN ONE VALUE, so a second
          // "who pays" from the room is a second value, not a replacement. A
          // second funder is a fact about the activity, and overwriting the
          // first would delete what the room already agreed.
          const field = plan.field!
          const value = values[field]
          const { data: existing } = await admin.from('gtcv_activity_values')
            .select('id').eq('activity_id', plan.rowId!).eq('field', field)
            .order('sort_order', { ascending: true })

          // THE CARRY-ACROSS. Where a field has no value rows yet, the original
          // column still holds what somebody typed into the table by hand. The
          // moment a value row exists that column stops being read, so the typed
          // answer has to come across as the first value or the room's answer
          // would silently erase it.
          let nextSort = (existing || []).length
          if (nextSort === 0) {
            const { data: act } = await admin.from('gtcv_assumptions')
              .select(field).eq('id', plan.rowId!).eq('client_id', clientId).maybeSingle()
            const typed = String((act as Record<string, unknown> | null)?.[field] ?? '').trim()
            if (typed && typed !== value.trim()) {
              const { error: cErr } = await admin.from('gtcv_activity_values').insert({
                client_id: clientId, activity_id: plan.rowId, field, value: typed, sort_order: 0,
              })
              if (cErr) throw cErr
              nextSort = 1
            }
          }

          const { error: vErr } = await admin.from('gtcv_activity_values').insert({
            client_id: clientId, activity_id: plan.rowId, field, value, sort_order: nextSort,
          })
          if (vErr) {
            console.error('facilitate: filling the activity failed', vErr)
            return NextResponse.json({ error: 'Could not fill that row' }, { status: 500 })
          }
          // The first value is mirrored back into the original column, which is
          // what the table, the exports and this route all still read.
          if (nextSort === 0) {
            await admin.from('gtcv_assumptions')
              .update({ [field]: value, updated_at: stamp })
              .eq('id', plan.rowId!).eq('client_id', clientId)
          }
        } else if (plan.mode === 'fillProblemColumn') {
          // Tool 2's columns hold one answer each — one budget holder, one
          // mechanism — so these fill the column itself.
          const { error: uErr } = await admin.from('gtcv_problem_owner_budget')
            .update({ [plan.field!]: values[plan.field!], updated_at: stamp })
            .eq('id', plan.rowId!).eq('client_id', clientId)
          if (uErr) {
            console.error('facilitate: filling the problem failed', uErr)
            return NextResponse.json({ error: 'Could not fill that row' }, { status: 500 })
          }
        } else if (plan.mode === 'createProblem') {
          const { data: made, error: iErr } = await admin.from('gtcv_problem_owner_budget')
            .insert({ client_id: clientId, ...values, service_id: plan.serviceId })
            .select('id').single()
          if (iErr) {
            console.error('facilitate: accepting the problem failed', iErr)
            return NextResponse.json({ error: 'Could not add that row' }, { status: 500 })
          }
          // The room has just named the problem it is working through, so the
          // activity that answers the next question hangs off this one.
          nextAnchor.current_problem_id = made.id
          nextAnchor.current_activity_id = null
        } else if (plan.mode === 'createActivity') {
          if (!(await ownsRow('gtcv_problem_owner_budget', plan.problemId!))) {
            return NextResponse.json({
              error: 'That problem is no longer there. Choose another beside the answer.',
            }, { status: 409 })
          }
          // The service is taken from the problem the activity solves, so the
          // two can never disagree about which service this row is in.
          const { data: parent } = await admin.from('gtcv_problem_owner_budget')
            .select('service_id').eq('id', plan.problemId!).maybeSingle()
          const serviceId = parent?.service_id || plan.serviceId || null
          const { data: svc } = serviceId
            ? await admin.from('gtcv_service_inventory').select('service_name').eq('id', serviceId).maybeSingle()
            : { data: null }
          const { data: made, error: iErr } = await admin.from('gtcv_assumptions')
            .insert({
              client_id: clientId, ...values,
              service_id: serviceId, service_name: svc?.service_name || null,
              problem_id: plan.problemId,
            })
            .select('id').single()
          if (iErr) {
            console.error('facilitate: accepting the activity failed', iErr)
            return NextResponse.json({ error: 'Could not add that row' }, { status: 500 })
          }
          // The next four questions are about THIS activity.
          nextAnchor.current_activity_id = made.id
          nextAnchor.current_problem_id = plan.problemId
        } else {
          // Every other block. The answer is a row of that block's own table,
          // carrying the anchored service where the table has one.
          const serviceColumn = BLOCK_SERVICE_COLUMN[plan.table]
          const link: Record<string, unknown> = {}
          if (serviceColumn && room?.current_service_id) link[serviceColumn] = room.current_service_id
          const { error: iErr } = await admin.from(plan.table).insert({ client_id: clientId, ...values, ...link })
          if (iErr) {
            console.error('facilitate: accepting into the block table failed', iErr)
            return NextResponse.json({ error: 'Could not add that row' }, { status: 500 })
          }
        }

        // A filled row the facilitator pointed at becomes what the room is on,
        // so the questions after it follow the answer rather than the anchor it
        // was redirected away from.
        if (targetRowId && plan.mode === 'fillActivityValue') nextAnchor.current_activity_id = targetRowId
        if (targetRowId && plan.mode === 'fillProblemColumn') nextAnchor.current_problem_id = targetRowId

        if (Object.keys(nextAnchor).length > 0) {
          await admin.from('gtcv_room_state')
            .upsert({ client_id: clientId, ...nextAnchor, updated_at: stamp }, { onConflict: 'client_id' })
        }

        const { error } = await admin
          .from('gtcv_submissions')
          .update({ disposition: 'accepted', updated_at: stamp })
          .in('id', rows.map((r) => r.id))
          .eq('client_id', clientId)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      case 'merge': {
        const ids = (body.submissionIds || []).filter((s) => typeof s === 'string').slice(0, 200)
        const into = body.intoRowId
        if (ids.length === 0 || !into) {
          return NextResponse.json({ error: 'Choose a row to merge into' }, { status: 400 })
        }
        // Merging records that these answers were folded into an existing row.
        // The existing row is NOT overwritten: the row is what it is, and the
        // merge is the statement that the room said the same thing again.
        const { error } = await admin
          .from('gtcv_submissions')
          .update({ disposition: 'merged', merged_into_row_id: into, updated_at: new Date().toISOString() })
          .in('id', ids)
          .eq('client_id', clientId)
          .eq('disposition', 'pending')
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      case 'discard': {
        const ids = (body.submissionIds || []).filter((s) => typeof s === 'string').slice(0, 200)
        if (ids.length === 0) return NextResponse.json({ error: 'Nothing to discard' }, { status: 400 })
        // Marked, never deleted. What the room said is a record of the session
        // even where the facilitator did not take it forward.
        const { error } = await admin
          .from('gtcv_submissions')
          .update({ disposition: 'discarded', updated_at: new Date().toISOString() })
          .in('id', ids)
          .eq('client_id', clientId)
          .eq('disposition', 'pending')
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e) {
    console.error('facilitate POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not do that' }, { status: 500 })
  }
}
