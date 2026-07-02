// POST /api/field/sync
// Receives a batch of transactions from the device
// Writes to field_transactions and field_credit_transactions
// Then calls aggregate_field_transactions() to update generic_actuals
//
// Request body:
// {
//   token: string,
//   device_id: string,
//   transactions: FieldTransaction[],
//   credit_transactions: FieldCreditTransaction[]
// }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Validate token and return operator -- shared helper
async function validateToken(token: string) {
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, device_id, transactions = [], credit_transactions = [] } = body

    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

    // 1. Validate token
    const operator = await validateToken(token)
    if (!operator) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const errors: string[] = []
    let txSynced = 0
    let creditSynced = 0

    // 2. Insert transactions
    if (transactions.length > 0) {
      // Validate required fields on each transaction
      const validTx = transactions.filter((t: any) => {
        if (!t.plan_line_id) { errors.push(`Transaction missing plan_line_id`); return false }
        if (!t.amount && t.amount !== 0) { errors.push(`Transaction missing amount`); return false }
        if (!t.transaction_type) { errors.push(`Transaction missing transaction_type`); return false }
        if (!t.category) { errors.push(`Transaction missing category`); return false }
        return true
      })

      if (validTx.length > 0) {
        const rows = validTx.map((t: any) => ({
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
        }))

        const { error: txErr } = await supabase
          .from('field_transactions')
          .insert(rows)

        if (txErr) {
          errors.push(`Transaction insert error: ${txErr.message}`)
        } else {
          txSynced = rows.length
        }
      }
    }

    // 3. Insert credit transactions
    if (credit_transactions.length > 0) {
      const validCredit = credit_transactions.filter((c: any) => {
        if (!c.customer_id) { errors.push(`Credit transaction missing customer_id`); return false }
        if (!c.amount) { errors.push(`Credit transaction missing amount`); return false }
        if (!c.transaction_type) { errors.push(`Credit transaction missing transaction_type`); return false }
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
        }))

        const { error: creditErr } = await supabase
          .from('field_credit_transactions')
          .insert(rows)

        if (creditErr) {
          errors.push(`Credit insert error: ${creditErr.message}`)
        } else {
          creditSynced = rows.length
        }
      }
    }

    // 4. Aggregate transactions into generic_actuals
    // Only run if we actually inserted something
    if (txSynced > 0) {
      const { error: aggErr } = await supabase
        .rpc('aggregate_field_transactions', { p_client_id: operator.client_id })
      if (aggErr) {
        errors.push(`Aggregation error: ${aggErr.message}`)
      }
    }

    // 5. Log the sync
    await supabase.from('field_sync_log').insert({
      operator_id: operator.id,
      client_id: operator.client_id,
      device_id: device_id || null,
      sync_type: 'manual',
      transactions_synced: txSynced,
      credit_synced: creditSynced,
      errors: errors.length > 0 ? errors.join('; ') : null,
    })

    return NextResponse.json({
      success: true,
      transactions_synced: txSynced,
      credit_synced: creditSynced,
      errors: errors.length > 0 ? errors : undefined,
      synced_at: new Date().toISOString(),
    })

  } catch (err: any) {
    console.error('Field sync error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
