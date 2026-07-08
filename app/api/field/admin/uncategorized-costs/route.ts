import { NextRequest, NextResponse } from 'next/server'
import { getFieldSupabase } from '@/lib/field-auth'
import { isPlanLineValidForUnit } from '@/lib/catalogue-validation'

export const dynamic = 'force-dynamic'

// GET: every pending (not yet categorized) uncategorized cost for a client.
export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('client_id')
    if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

    const supabase = getFieldSupabase()
    const { data, error } = await supabase
      .from('field_uncategorized_costs')
      .select('*')
      .eq('client_id', clientId)
      .eq('categorized', false)
      .order('synced_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ pendingCosts: data || [] })
  } catch (err: any) {
    console.error('Uncategorized costs GET error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST: categorize a pending cost -- assign it a real plan_line_id,
// promoting it into an actual field_transactions row (so it flows into
// the normal actuals aggregation), and mark this record resolved. The
// uncategorized record itself is kept (categorized=true), not deleted,
// so there's a permanent trail of what was originally unclear and who
// resolved it.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { uncategorized_cost_id, plan_line_id, plan_line_name, category, categorized_by } = body
    if (!uncategorized_cost_id) return NextResponse.json({ error: 'uncategorized_cost_id required' }, { status: 400 })
    if (!plan_line_id || !plan_line_name) return NextResponse.json({ error: 'A plan line must be selected' }, { status: 400 })
    if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 })

    const supabase = getFieldSupabase()
    const { data: pending, error: fetchErr } = await supabase
      .from('field_uncategorized_costs')
      .select('*')
      .eq('id', uncategorized_cost_id)
      .eq('categorized', false)
      .single()
    if (fetchErr || !pending) return NextResponse.json({ error: 'Pending cost not found, or already categorized' }, { status: 404 })

    // Confirm the chosen plan line genuinely belongs to this cost's own
    // unit and is a real cost category -- the same validation principle
    // already applied to every other cost entry path.
    const { data: config } = await supabase
      .from('generic_model_config')
      .select('plan_lines')
      .eq('client_id', pending.client_id)
      .single()
    const planLines = config?.plan_lines || []
    if (!isPlanLineValidForUnit(planLines, plan_line_id, pending.business_unit_id, category)) {
      return NextResponse.json({ error: 'That plan line does not belong to this cost\'s business unit, or is not a cost category' }, { status: 400 })
    }

    const { data: insertedTx, error: txErr } = await supabase
      .from('field_transactions')
      .insert({
        client_id: pending.client_id, business_unit_id: pending.business_unit_id,
        plan_line_id, plan_line_name, transaction_type: 'expense', category,
        amount: pending.amount, transaction_date: pending.transaction_date,
        operator_id: pending.operator_id, notes: `Categorized from: ${pending.description}`,
        synced_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (txErr) throw txErr

    const { error: updateErr } = await supabase
      .from('field_uncategorized_costs')
      .update({
        categorized: true, categorized_plan_line_id: plan_line_id,
        categorized_transaction_id: insertedTx.id, categorized_at: new Date().toISOString(),
        categorized_by: categorized_by || null,
      })
      .eq('id', uncategorized_cost_id)
    if (updateErr) throw updateErr

    return NextResponse.json({ success: true, transaction_id: insertedTx.id })
  } catch (err: any) {
    console.error('Uncategorized costs POST error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
