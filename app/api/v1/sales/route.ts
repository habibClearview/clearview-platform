// ============================================================
// POST /api/v1/sales
//
// Individual sales, as they happen. For a till, a clinic system or a shop
// system that knows about each transaction.
//
// A business whose bookkeeper works in monthly totals should use
// /api/v1/actuals instead. Both end up in the same figures.
//
// Nothing written here takes a private route. The rows go into
// field_transactions, exactly as a phone's entries do, and are aggregated by
// the same function, closed by the same month end and reconciled against the
// same payment records. A second write path would be a second set of rules to
// keep in step, and they would drift.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { requireApiKey, noteKeyUse, readJson, itemsFrom, apiError, MAX_BATCH, unitIsActive, unitUnavailable } from '@/lib/api-gate'
import { decideSale, CatalogueItem } from '@/lib/api-writes'
import { buildAutoCogsRow } from '@/lib/field-cogs'
import { park } from '@/lib/api-inbox'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const gate = await requireApiKey(req, 'sales.write')
  if (gate instanceof NextResponse) return gate
  const { key, supabase } = gate

  const body = await readJson(req)
  const items = itemsFrom(body, 'sales')
  if (!items) {
    return apiError(400, 'bad_request',
      'Send a JSON body shaped { "sales": [ ... ] }, or a bare array of sales.')
  }
  if (items.length === 0) {
    return NextResponse.json({ accepted: 0, parked: 0, duplicates: 0, accepted_refs: [], parked_items: [] })
  }
  if (items.length > MAX_BATCH) {
    return apiError(413, 'batch_too_large',
      `One call may carry ${MAX_BATCH} sales. Send them in smaller batches.`)
  }

  try {
    if (!await unitIsActive(supabase, key.client_id, key.business_unit_id)) return unitUnavailable()

    const { data: catalogueRows } = await supabase
      .from('field_catalogue')
      .select('id, external_id, name, price, plan_line_id, unit_label, cost_price, cogs_plan_line_id')
      .eq('client_id', key.client_id)
      .eq('business_unit_id', key.business_unit_id)
      .eq('active', true)
      .eq('needs_price', false)

    // Reachable by the code their own system uses AND by ours, so a sender
    // that imported a price list never has to learn our ids, and anything
    // already built against our ids keeps working.
    const catalogue = new Map<string, CatalogueItem>()
    for (const c of (catalogueRows || []) as any[]) {
      catalogue.set(c.id, c as CatalogueItem)
      if (c.external_id) catalogue.set(c.external_id, c as CatalogueItem)
    }

    const today = new Date().toISOString().slice(0, 10)
    const rows: any[] = []
    const parked: { external_ref: string | null; reason: string }[] = []
    const toPark: any[] = []
    const acceptedRefs: string[] = []
    const priceAlerts: string[] = []

    for (const item of items) {
      const decision = decideSale(item, catalogue, today)
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
      if (decision.priceAlert) priceAlerts.push(decision.priceAlert)

      // Standard costing: if the catalogue item carries a cost price, the
      // cost of what was sold is booked alongside the sale automatically,
      // using the STANDARD cost, never the price it happened to sell at.
      // Identical to the phone's behaviour, and reusing the same function so
      // the two cannot diverge.
      // row.catalogue_item_id is OUR id, set by decideSale from whichever
      // code the sender used, so this finds the item it priced. Checked
      // rather than asserted: if a later change to decideSale ever broke that,
      // asserting would throw a 500 over the whole batch, and the sale itself
      // is already valid without its cost entry.
      const source = catalogue.get(row.catalogue_item_id as string)
      const cogs = source ? buildAutoCogsRow(source, row.quantity as number, row.local_id as string | null) : null
      if (cogs) {
        rows.push({
          client_id: key.client_id,
          business_unit_id: key.business_unit_id,
          operator_id: key.operator_id,
          device_id: `api:${key.label}`.slice(0, 100),
          synced_at: new Date().toISOString(),
          transaction_date: row.transaction_date,
          captured_at: row.captured_at,
          notes: null,
          payment_method: null,
          price_overridden: false,
          price_alert: false,
          ...cogs,
        })
      }
    }

    let written: any[] = []
    if (rows.length > 0) {
      // Sending the same external_ref twice books it once. The unique index on
      // (client_id, local_id) does the work, and ignoreDuplicates means the
      // repeat is skipped rather than failing the whole batch -- which is what
      // makes it safe for a sender to retry after a timeout.
      const { data, error } = await supabase
        .from('field_transactions')
        .upsert(rows, { onConflict: 'client_id,local_id', ignoreDuplicates: true })
        .select('local_id')
      if (error) {
        console.error('POST /api/v1/sales write failed:', error.message)
        return apiError(500, 'write_failed',
          'The sales could not be stored. Nothing was saved. Send them again.')
      }
      written = data || []
    }

    if (toPark.length > 0) await park(supabase, key, 'sale', toPark)

    if (rows.length > 0) {
      const { error: aggErr } = await supabase
        .rpc('aggregate_field_transactions', { p_client_id: key.client_id })
      if (aggErr) {
        const closed = aggErr.message.includes('is closed and cannot be edited')
        return NextResponse.json({
          accepted: acceptedRefs.length,
          parked: parked.length,
          accepted_refs: acceptedRefs,
          parked_items: parked,
          price_alerts: priceAlerts,
          warning: closed
            ? 'The sales were stored, but the month they belong to has already been closed by this business. They will not appear in the figures until it is reopened.'
            : 'The sales were stored, but the summary figures have not caught up yet. They will. Do not send them again.',
        })
      }
    }

    await noteKeyUse(supabase, key.id)

    // A sender clears an item from its own queue when its reference appears in
    // accepted_refs. duplicates is how many were already here, which is normal
    // after a retry and is not an error.
    const duplicates = acceptedRefs.length - written.filter((w: any) => w.local_id).length
    return NextResponse.json({
      accepted: acceptedRefs.length,
      duplicates: duplicates > 0 ? duplicates : 0,
      parked: parked.length,
      accepted_refs: acceptedRefs,
      parked_items: parked,
      price_alerts: priceAlerts,
    })
  } catch (e) {
    console.error('POST /api/v1/sales failed:', e)
    return apiError(500, 'server_error', 'Something failed at our end. Try again.')
  }
}
