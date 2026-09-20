// ============================================================
// POST /api/v1/costs
//
// Individual costs, as they happen. The sister of /api/v1/sales.
//
// The heading a cost is filed under is read off the cost line itself, never
// taken from the sender. A sender who guesses cannot put an amount under the
// wrong heading, which is a mistake that is invisible in a total and expensive
// in a margin.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { requireApiKey, noteKeyUse, readJson, itemsFrom, apiError, MAX_BATCH } from '@/lib/api-gate'
import { decideCost, PlanLine } from '@/lib/api-writes'
import { park } from '@/lib/api-inbox'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const gate = await requireApiKey(req, 'costs.write')
  if (gate instanceof NextResponse) return gate
  const { key, supabase } = gate

  const body = await readJson(req)
  const items = itemsFrom(body, 'costs')
  if (!items) {
    return apiError(400, 'bad_request',
      'Send a JSON body shaped { "costs": [ ... ] }, or a bare array of costs.')
  }
  if (items.length === 0) {
    return NextResponse.json({ accepted: 0, parked: 0, accepted_refs: [], parked_items: [] })
  }
  if (items.length > MAX_BATCH) {
    return apiError(413, 'batch_too_large',
      `One call may carry ${MAX_BATCH} costs. Send them in smaller batches.`)
  }

  try {
    const { data: config } = await supabase
      .from('generic_model_config')
      .select('plan_lines')
      .eq('client_id', key.client_id)
      .maybeSingle()

    if (!config) {
      return apiError(409, 'no_model',
        'This business has no financial model set up yet, so there are no headings to file a cost under.')
    }

    const lines = new Map<string, PlanLine>(
      ((config.plan_lines as any[]) || []).map((l: any) => [l.id, l as PlanLine]),
    )

    const today = new Date().toISOString().slice(0, 10)
    const rows: any[] = []
    const parked: { external_ref: string | null; reason: string }[] = []
    const toPark: any[] = []
    const acceptedRefs: string[] = []

    for (const item of items) {
      const decision = decideCost(item, lines, key.business_unit_id, today)
      if (decision.parked) {
        parked.push({ external_ref: decision.parked.external_ref, reason: decision.parked.reason })
        toPark.push(decision.parked)
        continue
      }
      const row = decision.row as any
      rows.push({
        client_id: key.client_id,
        business_unit_id: key.business_unit_id,
        operator_id: key.operator_id,
        device_id: `api:${key.label}`.slice(0, 100),
        synced_at: new Date().toISOString(),
        ...row,
      })
      if (row.local_id) acceptedRefs.push(row.local_id)
    }

    let written: any[] = []
    if (rows.length > 0) {
      const { data, error } = await supabase
        .from('field_transactions')
        .upsert(rows, { onConflict: 'client_id,local_id', ignoreDuplicates: true })
        .select('local_id')
      if (error) {
        console.error('POST /api/v1/costs write failed:', error.message)
        return apiError(500, 'write_failed',
          'The costs could not be stored. Nothing was saved. Send them again.')
      }
      written = data || []

      const { error: aggErr } = await supabase
        .rpc('aggregate_field_transactions', { p_client_id: key.client_id })
      if (aggErr) {
        const closed = aggErr.message.includes('is closed and cannot be edited')
        if (toPark.length > 0) await park(supabase, key, 'cost', toPark)
        return NextResponse.json({
          accepted: acceptedRefs.length,
          parked: parked.length,
          accepted_refs: acceptedRefs,
          parked_items: parked,
          warning: closed
            ? 'The costs were stored, but the month they belong to has already been closed by this business. They will not appear in the figures until it is reopened.'
            : 'The costs were stored, but the summary figures have not caught up yet. They will. Do not send them again.',
        })
      }
    }

    if (toPark.length > 0) await park(supabase, key, 'cost', toPark)
    await noteKeyUse(supabase, key.id)

    const duplicates = acceptedRefs.length - written.filter((w: any) => w.local_id).length
    return NextResponse.json({
      accepted: acceptedRefs.length,
      duplicates: duplicates > 0 ? duplicates : 0,
      parked: parked.length,
      accepted_refs: acceptedRefs,
      parked_items: parked,
    })
  } catch (e) {
    console.error('POST /api/v1/costs failed:', e)
    return apiError(500, 'server_error', 'Something failed at our end. Try again.')
  }
}
