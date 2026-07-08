import { NextRequest, NextResponse } from 'next/server'
import { getFieldSupabase, validateFieldToken } from '@/lib/field-auth'
import { applyStockMovement, wouldGoNegative, type StockMovementType } from '@/lib/field-stock'

export const dynamic = 'force-dynamic'

// GET: current stock levels for the operator's own business unit.
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const token = headerToken || req.nextUrl.searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

    const operator = await validateFieldToken(token)
    if (!operator) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })

    const supabase = getFieldSupabase()
    const { data, error } = await supabase
      .from('field_stock_levels')
      .select('id, catalogue_item_id, quantity_on_hand, reorder_threshold, catalogue:field_catalogue(name, unit_label)')
      .eq('business_unit_id', operator.business_unit_id)

    if (error) {
      console.error('Field stock fetch error:', error.message)
      return NextResponse.json({ error: 'Could not load stock levels' }, { status: 500 })
    }
    return NextResponse.json({ stockLevels: data || [] })
  } catch (err: any) {
    console.error('Field stock GET error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST: record a stock movement (receiving new stock, or a manual
// adjustment for spoilage/loss/stocktake correction). Sales are NOT
// recorded through this route -- they're handled automatically by the
// sync route when a sale transaction is synced, so stock always
// reflects real recorded sales without an operator needing to remember
// a second step.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, catalogue_item_id, movement_type, quantity, notes } = body
    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

    const operator = await validateFieldToken(token)
    if (!operator) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })

    if (!catalogue_item_id) return NextResponse.json({ error: 'catalogue_item_id required' }, { status: 400 })
    if (movement_type !== 'stock_in' && movement_type !== 'adjustment') {
      return NextResponse.json({ error: 'This route only accepts stock_in or adjustment -- sales update stock automatically when synced' }, { status: 400 })
    }
    if (quantity === undefined || quantity === null || Number.isNaN(Number(quantity))) {
      return NextResponse.json({ error: 'A valid quantity is required' }, { status: 400 })
    }

    const supabase = getFieldSupabase()

    // Confirm the catalogue item genuinely belongs to this operator's
    // own unit -- the same cross-unit validation principle already
    // applied to sales and cost entries in the sync route.
    const { data: item, error: itemErr } = await supabase
      .from('field_catalogue')
      .select('id')
      .eq('id', catalogue_item_id)
      .eq('business_unit_id', operator.business_unit_id)
      .eq('client_id', operator.client_id)
      .single()
    if (itemErr || !item) return NextResponse.json({ error: 'Catalogue item not found for this business unit' }, { status: 404 })

    const { data: existingLevel } = await supabase
      .from('field_stock_levels')
      .select('id, quantity_on_hand')
      .eq('business_unit_id', operator.business_unit_id)
      .eq('catalogue_item_id', catalogue_item_id)
      .maybeSingle()

    const currentQuantity = existingLevel?.quantity_on_hand ?? 0
    const flagged = wouldGoNegative({ movementType: movement_type as StockMovementType, quantity: Number(quantity), currentQuantity })
    const newQuantity = applyStockMovement(currentQuantity, movement_type as StockMovementType, Number(quantity))

    const { error: movementErr } = await supabase.from('field_stock_movements').insert({
      client_id: operator.client_id, business_unit_id: operator.business_unit_id,
      catalogue_item_id, movement_type, quantity: Number(quantity),
      notes: notes || null, operator_id: operator.id,
    })
    if (movementErr) {
      console.error('Field stock movement insert error:', movementErr.message)
      return NextResponse.json({ error: 'Could not record stock movement' }, { status: 500 })
    }

    const { error: levelErr } = await supabase.from('field_stock_levels').upsert({
      id: existingLevel?.id, client_id: operator.client_id, business_unit_id: operator.business_unit_id,
      catalogue_item_id, quantity_on_hand: newQuantity, updated_at: new Date().toISOString(),
    }, { onConflict: 'business_unit_id,catalogue_item_id' })
    if (levelErr) {
      console.error('Field stock level upsert error:', levelErr.message)
      return NextResponse.json({ error: 'Movement recorded, but could not update the stock level. Please refresh.' }, { status: 500 })
    }

    return NextResponse.json({ quantity_on_hand: newQuantity, flagged })
  } catch (err: any) {
    console.error('Field stock POST error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
