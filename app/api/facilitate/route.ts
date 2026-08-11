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
import { startingQuestionSet } from '@/lib/stage1-question-sets'

export const dynamic = 'force-dynamic'

type Admin = ReturnType<typeof getAdminClient>

/** The block tables Stage 1 writes into, and nothing else. */
const BLOCK_TABLE: Record<string, string> = {
  phase_0: 'gtcv_assumptions',
  dp01: 'gtcv_service_inventory',
}

/** The columns each of those tables will accept a value into. Named here so a
 *  column name arriving in a request can never reach the database unchecked. */
const BLOCK_COLUMNS: Record<string, string[]> = {
  gtcv_assumptions: ['service_name', 'activity', 'delivers', 'who_pays', 'assumption', 'disproof'],
  gtcv_service_inventory: [
    'service_name', 'what_it_delivers', 'logic_type', 'has_demand',
    'hidden_delivery_costs', 'delivery_quality_risk', 'decision', 'notes',
  ],
}

async function requireManager(req: NextRequest, admin: Admin, clientId: string) {
  return requireAccess(req, admin, clientId, 'manage', {
    deniedMessage: 'Only the lead consultant can run a question with the room',
    rateLimit: { key: 'facilitate', max: 600, windowSeconds: 3600 },
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
  const columns = 'id, gate_id, sort_order, question_text, question_type, is_named, target_fields, options, suggested_minutes, scale_min, scale_max, agreed_value, agreed_column, agreed_row_id, agreed_distribution, agreed_at'

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
      .select('open_question_id, revealed, timer_started_at, timer_seconds, timer_paused_with_seconds_left, room_size')
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
          name: open.is_named ? s.participant_name : null,
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
        extremesSource = open.is_named ? subs : []
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

    // R21. The rows already in the block's table, so a pending answer can be
    // merged into one of them. Only the identifier and enough words to
    // recognise the row by: this list is for choosing, not for reading.
    let blockRows: { id: string; label: string }[] = []
    const table = gateId ? BLOCK_TABLE[gateId] : null
    if (table && pending.length > 0) {
      const first = (BLOCK_COLUMNS[table] || [])[0]
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
      submissionIds?: string[]
      intoRowId?: string
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
        .select('id, gate_id, sort_order, question_type, is_named, options, scale_min, scale_max, target_fields')
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
        await setState({
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

      // R21. Accept, merge, discard. Accepting converts a pending answer into a
      // normal row of the block's own table in one press, with no retyping.
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
        const table = q ? BLOCK_TABLE[q.gate_id] : null
        if (!q || !table) return NextResponse.json({ error: 'That block does not take answers yet' }, { status: 400 })

        // Every submission in the group is the same answer, so one row is
        // written, not one per person. The people are already recorded on the
        // submissions themselves.
        const allowed = BLOCK_COLUMNS[table] || []
        const values: Record<string, string> = {}
        for (const f of (q.target_fields || []) as { column: string }[]) {
          if (!allowed.includes(f.column)) continue
          const v = (rows[0].values || {})[f.column]
          if (typeof v === 'string' && v.trim()) values[f.column] = v
        }
        if (Object.keys(values).length === 0) {
          return NextResponse.json({ error: 'There is nothing in that answer to accept' }, { status: 400 })
        }

        const { error: iErr } = await admin.from(table).insert({ client_id: clientId, ...values })
        if (iErr) {
          console.error('facilitate: accepting into the block table failed', iErr)
          return NextResponse.json({ error: 'Could not add that row' }, { status: 500 })
        }

        const { error } = await admin
          .from('gtcv_submissions')
          .update({ disposition: 'accepted', updated_at: new Date().toISOString() })
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
