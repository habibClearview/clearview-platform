// ============================================================
// POST /api/v1/actuals
//
// A month's figures, one total per line. The route for a business whose
// bookkeeper closes a month, rather than a till that rings every sale.
//
// WHY THIS DOES NOT WRITE TO THE ACTUALS TABLE DIRECTLY.
//
// generic_actuals deliberately keeps hand-entered figures and field-derived
// figures in separate columns that only one writer each ever touches, so
// neither can erase the other (docs/ACCOUNTING_ARCHITECTURE.md section 4). A
// third writer would need a third column, and every screen that adds the first
// two together would have to learn about it. Miss one and a figure quietly
// disappears from a report.
//
// So a month's total is written as one transaction per line, dated to the last
// day of that month, and the existing aggregation rolls it up. Nothing that
// reads a figure changes at all.
//
// SENDING A MONTH AGAIN CORRECTS IT.
//
// Unlike a sale, a restated month is normal: a bookkeeper finds an invoice
// late and the total moves. Each line's row carries a fixed reference built
// from the month and the line, so sending March again replaces March rather
// than adding to it. A line left out of the second send keeps its earlier
// figure, which is why the answer names every line it wrote.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { requireApiKey, noteKeyUse, readJson, apiError, MAX_BATCH } from '@/lib/api-gate'
import { decideActuals, monthKey, PlanLine } from '@/lib/api-writes'
import { park } from '@/lib/api-inbox'

export const dynamic = 'force-dynamic'

/** The last day of a month, which is the day a month's total belongs to. */
function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

export async function POST(req: NextRequest) {
  const gate = await requireApiKey(req, 'actuals.write')
  if (gate instanceof NextResponse) return gate
  const { key, supabase } = gate

  const body = await readJson(req)
  const month = monthKey(body?.month)
  if (!month) {
    return apiError(400, 'bad_request',
      'Send a JSON body shaped { "month": "2026-03", "lines": [ { "line_id": "...", "amount": 0 } ] }. The month may be written as 2026-03 or as any date inside it.')
  }
  const entries = Array.isArray(body?.lines) ? body.lines : null
  if (!entries) {
    return apiError(400, 'bad_request', 'The body needs a "lines" list, even if it is empty.')
  }
  if (entries.length > MAX_BATCH) {
    return apiError(413, 'batch_too_large', `One call may carry ${MAX_BATCH} lines.`)
  }

  try {
    const { data: config } = await supabase
      .from('generic_model_config')
      .select('plan_lines')
      .eq('client_id', key.client_id)
      .maybeSingle()

    if (!config) {
      return apiError(409, 'no_model',
        'This business has no financial model set up yet, so there are no lines to file figures against.')
    }

    const lines = new Map<string, PlanLine>(
      ((config.plan_lines as any[]) || []).map((l: any) => [l.id, l as PlanLine]),
    )

    const decision = decideActuals(month, entries, lines, key.business_unit_id)
    const transactionDate = lastDayOf(month)
    const now = new Date().toISOString()

    const rows = Object.entries(decision.values).map(([lineId, amount]) => {
      const line = lines.get(lineId)!
      const isRevenue = line.category === 'revenue'
      return {
        client_id: key.client_id,
        business_unit_id: key.business_unit_id,
        operator_id: key.operator_id,
        plan_line_id: line.id,
        plan_line_name: line.name,
        transaction_type: isRevenue ? 'sale' : (line.category === 'cost_of_sales' ? 'cost' : 'expense'),
        category: line.category,
        amount,
        quantity: null,
        unit_price: null,
        payment_method: null,
        transaction_date: transactionDate,
        captured_at: null,
        notes: `Monthly total sent for ${month}`,
        catalogue_item_id: null,
        price_overridden: false,
        price_alert: false,
        device_id: `api:${key.label}`.slice(0, 100),
        synced_at: now,
        // Fixed per month and line, so a restated month replaces itself.
        local_id: `api:actual:${month}:${line.id}`,
      }
    })

    if (rows.length > 0) {
      // ignoreDuplicates is false here, unlike sales: sending a month again is
      // a correction and must overwrite. A sale sent again is a retry and must
      // not.
      const { error } = await supabase
        .from('field_transactions')
        .upsert(rows, { onConflict: 'client_id,local_id', ignoreDuplicates: false })
      if (error) {
        console.error('POST /api/v1/actuals write failed:', error.message)
        return apiError(500, 'write_failed',
          'The figures could not be stored. Nothing was saved. Send them again.')
      }

      const { error: aggErr } = await supabase
        .rpc('aggregate_field_transactions', { p_client_id: key.client_id })
      if (aggErr) {
        if (decision.parked.length > 0) await park(supabase, key, 'actual', decision.parked)
        const closed = aggErr.message.includes('is closed and cannot be edited')
        return NextResponse.json({
          month,
          written: rows.map((r) => ({ line_id: r.plan_line_id, amount: r.amount })),
          parked: decision.parked.length,
          parked_items: decision.parked.map((p) => ({ external_ref: p.external_ref, reason: p.reason })),
          warning: closed
            ? `${month} has already been closed by this business. The figures were stored but will not appear until it is reopened.`
            : 'The figures were stored, but the summary has not caught up yet. It will. Do not send them again.',
        })
      }
    }

    if (decision.parked.length > 0) await park(supabase, key, 'actual', decision.parked)
    await noteKeyUse(supabase, key.id)

    return NextResponse.json({
      month,
      written: rows.map((r) => ({ line_id: r.plan_line_id, amount: r.amount })),
      parked: decision.parked.length,
      parked_items: decision.parked.map((p) => ({ external_ref: p.external_ref, reason: p.reason })),
    })
  } catch (e) {
    console.error('POST /api/v1/actuals failed:', e)
    return apiError(500, 'server_error', 'Something failed at our end. Try again.')
  }
}
