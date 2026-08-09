// ============================================================
// API ROUTE: /api/session-contributions
// What the room typed, read by the coach, and marked once it has been used.
//
// The room writes through /api/session-capture with a scoped token. This is the
// other side: the coaching team reading everything a room has added, deciding
// what becomes part of the record, and marking each sentence once it has.
//
// WHY MARKING MATTERS MORE THAN IT LOOKS. A session produces forty sentences
// and eight of them become rows. Without a mark, the coach re-reads all forty
// every time and either misses one or uses one twice, and both of those are
// invisible afterwards. promoted_at is what makes the pile shrink honestly.
//
// Marking is not deleting. The sentence stays, with who said it, because the
// point of going back to a contribution later is usually to go back to the
// person.
//
// View rights to read, manage rights to mark. Reading what the room said is
// part of the engagement; deciding what counts is the coaching team's.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'
import { GATE_IDS } from '@/lib/gtcv-gates'
import { promotionRow, promotionTargetFor } from '@/lib/session-promotion'

export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('clientId')
    const dpId = req.nextUrl.searchParams.get('dpId')
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })
    if (dpId && !GATE_IDS.includes(dpId)) {
      return NextResponse.json({ error: 'That is not a block' }, { status: 400 })
    }

    const admin = getAdminClient()
    const auth = await requireAccess(req, admin, clientId, 'view', {
      rateLimit: { key: 'session-contributions', max: 240, windowSeconds: 3600 },
    })
    if (!auth.ok) return refuseAccess(auth)

    let q = admin
      .from('gtcv_session_contributions')
      .select('id, dp_id, session_id, contributor_name, contributor_role, contribution, promoted_at, promoted_to_table, promoted_to_id, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(500)
    if (dpId) q = q.eq('dp_id', dpId)

    const { data, error } = await q
    if (error) {
      console.error('session-contributions GET: read failed', error)
      return NextResponse.json({ error: 'Could not load what the rooms have added' }, { status: 500 })
    }

    return NextResponse.json({ contributions: data || [] })
  } catch (e: any) {
    console.error('session-contributions GET: unexpected error', e)
    return NextResponse.json({ error: 'Could not load what the rooms have added' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { clientId, id, used } = (await req.json()) as {
      clientId?: string; id?: string; used?: boolean
    }
    if (!clientId || !id) return NextResponse.json({ error: 'Missing clientId or id' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireAccess(req, admin, clientId, 'manage', {
      deniedMessage: 'Only the coaching team decides what becomes part of the record',
      rateLimit: { key: 'session-contributions', max: 240, windowSeconds: 3600 },
    })
    if (!auth.ok) return refuseAccess(auth)

    const now = new Date().toISOString()

    // Putting one back on the pile has to deal with the row it became, if it
    // became one. Deleting the coach's work would be wrong, so an edited row
    // stays and is reported; a draft nobody has touched goes, because leaving
    // an orphan behind is how a table fills with rows nobody meant to keep.
    let keptRow = false
    if (used === false) {
      const { data: existing } = await admin
        .from('gtcv_session_contributions')
        .select('promoted_to_table, promoted_to_id')
        .eq('id', id)
        .eq('client_id', clientId)
        .maybeSingle()

      const table = existing?.promoted_to_table
      const rowId = existing?.promoted_to_id
      if (table && rowId) {
        const { data: target } = await admin
          .from(table)
          .select('created_at, updated_at')
          .eq('id', rowId)
          .eq('client_id', clientId)
          .maybeSingle()

        if (!target) {
          // Already gone. Nothing to do, and not an error: a coach deleting a
          // row they did not want is ordinary work.
        } else if (target.updated_at && target.created_at && target.updated_at !== target.created_at) {
          keptRow = true
        } else {
          await admin.from(table).delete().eq('id', rowId).eq('client_id', clientId)
        }
      }
    }

    // Scoped to the engagement in the same statement, so an id from another
    // engagement matches nothing rather than being marked.
    const { error } = await admin
      .from('gtcv_session_contributions')
      .update(used === false
        ? {
            promoted_at: null,
            promoted_by: null,
            updated_at: now,
            // The trail goes when the mark goes, unless the row survived,
            // in which case it is still the honest answer to where it went.
            ...(keptRow ? {} : { promoted_to_table: null, promoted_to_id: null }),
          }
        : { promoted_at: now, promoted_by: auth.userId, updated_at: now })
      .eq('id', id)
      .eq('client_id', clientId)

    if (error) {
      console.error('session-contributions PATCH: write failed', error)
      return NextResponse.json({ error: 'Could not mark that' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, keptRow })
  } catch (e: any) {
    console.error('session-contributions PATCH: unexpected error', e)
    return NextResponse.json({ error: 'Could not mark that' }, { status: 500 })
  }
}

/**
 * Turn a sentence said in the room into a row in the block's own table.
 *
 * WHAT IT WRITES. The engagement, and the sentence, in the one column where a
 * sentence belongs for that block. Nothing else. A row arriving with a score or
 * a decision already filled in would be indistinguishable from a score or a
 * decision somebody actually made, and the whole value of a verbatim record is
 * that you can tell those apart.
 *
 * WHICH BLOCKS. Only the ones where a sentence has an unambiguous home. Four
 * blocks hold numbers or a fixed list, and those keep marking, which is what
 * they had. src/lib/session-promotion.ts says which and why.
 *
 * WHY THE TABLE NAME CANNOT COME FROM THE REQUEST. The caller sends a
 * contribution id and nothing else about the destination. The block is read
 * from the stored row and the table is looked up from a fixed map, so there is
 * no path from anything typed by anybody to the name of a table this writes to.
 *
 * Manage rights, same as marking, and for the same reason: deciding what
 * becomes part of the record is the coaching team's.
 */
export async function POST(req: NextRequest) {
  try {
    const { clientId, id } = (await req.json()) as { clientId?: string; id?: string }
    if (!clientId || !id) return NextResponse.json({ error: 'Missing clientId or id' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireAccess(req, admin, clientId, 'manage', {
      deniedMessage: 'Only the coaching team decides what becomes part of the record',
      rateLimit: { key: 'session-contributions', max: 240, windowSeconds: 3600 },
    })
    if (!auth.ok) return refuseAccess(auth)

    const { data: row, error: readError } = await admin
      .from('gtcv_session_contributions')
      .select('id, dp_id, contribution, promoted_to_table, promoted_to_id')
      .eq('id', id)
      .eq('client_id', clientId)
      .maybeSingle()

    if (readError) {
      console.error('session-contributions POST: read failed', readError)
      return NextResponse.json({ error: 'Could not read that contribution' }, { status: 500 })
    }
    if (!row) return NextResponse.json({ error: 'No such contribution on this engagement' }, { status: 404 })

    if (row.promoted_to_table && row.promoted_to_id) {
      // Already a row. Saying so is better than making a second copy of the
      // same sentence, which is exactly the duplication the mark exists to stop.
      return NextResponse.json({ error: 'That one is already a row in the table' }, { status: 409 })
    }

    const target = promotionTargetFor(row.dp_id)
    if (!target) {
      return NextResponse.json(
        { error: 'This block holds numbers rather than sentences, so there is nowhere for this to go' },
        { status: 400 },
      )
    }

    const contribution = String(row.contribution || '').trim()
    if (!contribution) return NextResponse.json({ error: 'There is nothing written to move' }, { status: 400 })

    const { data: made, error: writeError } = await admin
      .from(target.table)
      .insert([promotionRow(target, clientId, contribution)])
      .select('id')
      .single()

    if (writeError || !made) {
      console.error('session-contributions POST: write failed', writeError)
      return NextResponse.json({ error: 'Could not add it to the table' }, { status: 500 })
    }

    const now = new Date().toISOString()
    const { error: linkError } = await admin
      .from('gtcv_session_contributions')
      .update({
        promoted_at: now,
        promoted_by: auth.userId,
        promoted_to_table: target.table,
        promoted_to_id: made.id,
        updated_at: now,
      })
      .eq('id', id)
      .eq('client_id', clientId)

    if (linkError) {
      // The row exists but the trail does not. Undo the row rather than leave
      // one nobody can trace back to who said it.
      await admin.from(target.table).delete().eq('id', made.id).eq('client_id', clientId)
      console.error('session-contributions POST: link failed', linkError)
      return NextResponse.json({ error: 'Could not add it to the table' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, table: target.table, id: made.id, describes: target.describes })
  } catch (e: any) {
    console.error('session-contributions POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not add it to the table' }, { status: 500 })
  }
}
