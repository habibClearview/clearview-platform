import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { friendlyDbError } from '@/lib/field-errors'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase environment variables not configured')
  return createClient(url, key)
}

async function validateToken(token: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('field_operator_tokens')
    .select('*, operator:field_operators(*)')
    .eq('token', token)
    .single()
  if (error || !data) return null
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null
  if (!data.operator?.active) return null
  return data.operator
}

// A bulk override is flagged if it deviates from the catalogue's standard
// price by more than this fraction -- surfaced back to the operator's app
// as a warning, and stored on the row for the CEO/coach to review later.
// Mirrors "Price alert" (spec section 8, item 4).
const PRICE_ALERT_THRESHOLD = 0.10

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, device_id, transactions = [], credit_transactions = [] } = body

    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

    const supabase = getSupabase()
    const operator = await validateToken(token)
    if (!operator) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })

    const errors: string[] = []
    // Kept separately for field_sync_log so you or I can actually diagnose
    // what happened later -- the operator only ever sees the friendly
    // versions pushed into `errors` above.
    const technicalErrors: string[] = []
    let txSynced = 0
    let creditSynced = 0
    const priceAlerts: string[] = []

    if (transactions.length > 0) {
      // Split into catalogue-driven sales (operator picked a product/service
      // and entered a volume -- price comes from the catalogue, never from
      // the operator) and manual cost/expense entries (operator picks a
      // cost line and enters an amount directly -- unchanged behaviour).
      const saleEntries = transactions.filter((t: any) => t.catalogue_item_id)
      const costEntries = transactions.filter((t: any) => !t.catalogue_item_id)

      const rows: any[] = []

      if (saleEntries.length > 0) {
        const catalogueIds = Array.from(new Set(saleEntries.map((t: any) => t.catalogue_item_id)))
        const { data: catalogueItems, error: catErr } = await supabase
          .from('field_catalogue')
          .select('id, name, price, plan_line_id')
          .in('id', catalogueIds)
          .eq('client_id', operator.client_id)
          .eq('business_unit_id', operator.business_unit_id)
        if (catErr) errors.push(`Catalogue lookup error: ${catErr.message}`)
        const catalogueById = new Map((catalogueItems || []).map((c: any) => [c.id, c]))

        for (const t of saleEntries) {
          const item = catalogueById.get(t.catalogue_item_id)
          if (!item) { errors.push(`Unknown or inactive catalogue item: ${t.catalogue_item_id}`); continue }
          if (t.quantity === undefined || t.quantity === null || Number(t.quantity) <= 0) {
            errors.push(`Sale of "${item.name}" missing a valid volume`); continue
          }
          const quantity = Number(t.quantity)
          const overridden = !!t.override_price
          const priceUsed = overridden ? Number(t.override_price) : Number(item.price)
          if (overridden && (isNaN(priceUsed) || priceUsed < 0)) {
            errors.push(`Sale of "${item.name}" has an invalid override price`); continue
          }
          const standardPrice = Number(item.price)
          const deviates = standardPrice > 0 && Math.abs(priceUsed - standardPrice) / standardPrice > PRICE_ALERT_THRESHOLD
          if (overridden && deviates) priceAlerts.push(`${item.name}: override ${priceUsed} vs standard ${standardPrice}`)

          rows.push({
            client_id: operator.client_id,
            business_unit_id: operator.business_unit_id,
            plan_line_id: item.plan_line_id,
            plan_line_name: item.name,
            transaction_type: 'sale',
            category: 'revenue',
            amount: quantity * priceUsed,
            quantity,
            unit_price: priceUsed,
            payment_method: t.payment_method || null,
            customer_id: t.customer_id || null,
            transaction_date: t.transaction_date || new Date().toISOString().split('T')[0],
            operator_id: operator.id,
            notes: t.notes || null,
            device_id: device_id || null,
            synced_at: new Date().toISOString(),
            catalogue_item_id: item.id,
            price_overridden: overridden,
            price_alert: overridden && deviates,
            // Stable per-entry id set client-side when the operator queued
            // this transaction. Lets the unique index on
            // (client_id, local_id) silently ignore a duplicate insert if
            // the same entry gets sent twice -- e.g. the manual "Sync Now"
            // button and a Background Sync firing for the same queued item.
            local_id: t.local_id || null,
          })
        }
      }

      const validCostEntries = costEntries.filter((t: any) => {
        if (!t.plan_line_id) { errors.push('Cost entry missing plan_line_id'); return false }
        if (t.amount === undefined || t.amount === null) { errors.push('Cost entry missing amount'); return false }
        if (!t.transaction_type) { errors.push('Cost entry missing transaction_type'); return false }
        if (!t.category) { errors.push('Cost entry missing category'); return false }
        return true
      })
      for (const t of validCostEntries) {
        rows.push({
          client_id: operator.client_id,
          business_unit_id: operator.business_unit_id,
          plan_line_id: t.plan_line_id,
          plan_line_name: t.plan_line_name || '',
          transaction_type: t.transaction_type,
          category: t.category,
          amount: Number(t.amount),
          quantity: t.quantity ? Number(t.quantity) : null,
          unit_price: t.unit_price ? Number(t.unit_price) : null,
          payment_method: t.payment_method || null,
          customer_id: t.customer_id || null,
          transaction_date: t.transaction_date || new Date().toISOString().split('T')[0],
          operator_id: operator.id,
          notes: t.notes || null,
          device_id: device_id || null,
          synced_at: new Date().toISOString(),
          local_id: t.local_id || null,
          // Explicit values, not omitted: when a batch upsert mixes rows
          // that set a key (sale rows set price_overridden/price_alert)
          // with rows that don't, PostgREST uses the union of keys across
          // the WHOLE batch as the column list -- rows missing a key get
          // an explicit NULL for it, not the column's default. price_overridden
          // is NOT NULL with no meaningful value for a cost entry, so it
          // must be set explicitly here or every cost row in a mixed
          // sale+cost batch fails the constraint.
          catalogue_item_id: null,
          price_overridden: false,
          price_alert: false,
        })
      }

      if (rows.length > 0) {
        // Upsert with ignoreDuplicates instead of a plain insert: if a row
        // with the same (client_id, local_id) already landed from an
        // earlier sync attempt, this silently skips it rather than
        // creating a duplicate transaction. Rows with local_id null (older
        // clients that haven't updated yet) always insert normally, since
        // the unique index excludes NULLs.
        // .select() after upsert returns only the rows actually written --
        // ignoreDuplicates means a repeat local_id is silently skipped and
        // won't appear here. Counting rows.length instead would overstate
        // how many records were really inserted on a retry.
        const { data: insertedTx, error: txErr } = await supabase
          .from('field_transactions')
          .upsert(rows, { onConflict: 'client_id,local_id', ignoreDuplicates: true })
          .select('id')
        if (txErr) { technicalErrors.push(`Transaction insert error: ${txErr.message}`); errors.push(friendlyDbError(txErr.message)) }
        else txSynced = insertedTx?.length ?? 0
      }
    }

    if (credit_transactions.length > 0) {
      const validCredit = credit_transactions.filter((c: any) => {
        if (!c.customer_id) { errors.push('Credit missing customer_id'); return false }
        if (!c.amount) { errors.push('Credit missing amount'); return false }
        if (!c.transaction_type) { errors.push('Credit missing transaction_type'); return false }
        return true
      })

      if (validCredit.length > 0) {
        const rows = validCredit.map((c: any) => ({
          client_id: operator.client_id,
          business_unit_id: operator.business_unit_id,
          customer_id: c.customer_id,
          plan_line_id: c.plan_line_id || null,
          plan_line_name: c.plan_line_name || null,
          transaction_type: c.transaction_type,
          amount: Number(c.amount),
          quantity: c.quantity ? Number(c.quantity) : null,
          unit_price: c.unit_price ? Number(c.unit_price) : null,
          season_name: c.season_name || null,
          transaction_date: c.transaction_date || new Date().toISOString().split('T')[0],
          operator_id: operator.id,
          notes: c.notes || null,
          device_id: device_id || null,
          synced_at: new Date().toISOString(),
          local_id: c.local_id || null,
        }))

        const { data: insertedCredit, error: creditErr } = await supabase
          .from('field_credit_transactions')
          .upsert(rows, { onConflict: 'client_id,local_id', ignoreDuplicates: true })
          .select('id')
        if (creditErr) { technicalErrors.push(`Credit insert error: ${creditErr.message}`); errors.push(friendlyDbError(creditErr.message)) }
        else creditSynced = insertedCredit?.length ?? 0
      }
    }

    // Runs whenever ANY transaction was attempted, not just newly-inserted
    // ones (txSynced > 0 would miss this). Why it matters: if aggregation
    // fails once (e.g. a transient DB error) after rows were successfully
    // inserted, a later retry of the exact same batch will have txSynced=0
    // -- every row already exists and gets silently skipped by the
    // idempotency dedup. Gating on txSynced > 0 would mean those rows can
    // never trigger aggregation again, permanently stranding them in
    // field_transactions without ever reaching generic_actuals.
    // aggregate_field_transactions() recomputes full sums each time, so
    // calling it again is always safe, never double-counts. Also covers a
    // sync that contains only credit_transactions with no regular
    // transactions -- must run after every sync, not just when standard
    // transactions happen to be present.
    if (transactions.length > 0 || credit_transactions.length > 0) {
      const { error: aggErr } = await supabase
        .rpc('aggregate_field_transactions', { p_client_id: operator.client_id })
      if (aggErr) { technicalErrors.push(`Aggregation error: ${aggErr.message}`); errors.push('Your entries were saved, but the summary figures haven\'t updated yet. They\'ll catch up automatically -- no need to re-enter anything.') }
    }

    await supabase.from('field_sync_log').insert({
      operator_id: operator.id,
      client_id: operator.client_id,
      device_id: device_id || null,
      sync_type: 'manual',
      transactions_synced: txSynced,
      credit_synced: creditSynced,
      errors: [...technicalErrors, ...priceAlerts.map(a => `Price alert: ${a}`)].join('; ') || null,
    })

    return NextResponse.json({
      success: true,
      transactions_synced: txSynced,
      credit_synced: creditSynced,
      errors: errors.length > 0 ? errors : undefined,
      price_alerts: priceAlerts.length > 0 ? priceAlerts : undefined,
      synced_at: new Date().toISOString(),
    })

  } catch (err: any) {
    console.error('Field sync error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
