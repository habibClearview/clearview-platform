import { NextRequest, NextResponse } from 'next/server'
import { getFieldSupabase } from '@/lib/field-auth'
import { applyStockMovement } from '@/lib/field-stock'
import { randomUUID } from 'crypto'
import { resolveFieldAdminActor, actorMayAccessClient } from '@/lib/auth/field-admin-authz'

export const dynamic = 'force-dynamic'

// GET: every stock level for a client, across all business units --
// the dashboard view, unlike the field app's GET which only ever shows
// one operator's own unit.
export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('client_id')
    if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

    const supabase = getFieldSupabase()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!actorMayAccessClient(actor, clientId)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const { data, error } = await supabase
      .from('field_stock_levels')
      .select('id, business_unit_id, catalogue_item_id, quantity_on_hand, reorder_threshold, catalogue:field_catalogue(name, unit_label)')
      .eq('client_id', clientId)

    if (error) throw error
    return NextResponse.json({ stockLevels: data || [] })
  } catch (err: any) {
    console.error('Field stock admin GET error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH: set a reorder threshold on an existing stock level.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { stock_level_id, reorder_threshold } = body
    if (!stock_level_id) return NextResponse.json({ error: 'stock_level_id required' }, { status: 400 })

    const supabase = getFieldSupabase()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: level, error: lvlErr } = await supabase
      .from('field_stock_levels').select('client_id').eq('id', stock_level_id).single()
    if (lvlErr || !level) return NextResponse.json({ error: 'Stock level not found' }, { status: 404 })
    if (!actorMayAccessClient(actor, level.client_id)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const { error } = await supabase
      .from('field_stock_levels')
      .update({ reorder_threshold, updated_at: new Date().toISOString() })
      .eq('id', stock_level_id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Field stock admin PATCH error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST: record an intra-store transfer -- moving inventory from one
// business unit's catalogue item to another. Deliberately a
// coach/CEO-level dashboard action, not something an individual field
// operator does from their own limited-scope phone view -- moving
// stock between units is an administrative decision. Writes BOTH sides
// of the transfer as linked ledger entries (transfer_out on the source,
// transfer_in on the destination) sharing one transfer_pair_id, so the
// two halves are always traceable back to each other, and updates both
// units' stock levels together.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { client_id, from_business_unit_id, from_catalogue_item_id, to_business_unit_id, to_catalogue_item_id, quantity, notes } = body
    if (!client_id) return NextResponse.json({ error: 'client_id required' }, { status: 400 })
    if (!from_business_unit_id || !from_catalogue_item_id) return NextResponse.json({ error: 'Source unit and item required' }, { status: 400 })
    if (!to_business_unit_id || !to_catalogue_item_id) return NextResponse.json({ error: 'Destination unit and item required' }, { status: 400 })
    if (quantity === undefined || quantity === null || Number(quantity) <= 0) return NextResponse.json({ error: 'A positive quantity is required' }, { status: 400 })

    const supabase = getFieldSupabase()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!actorMayAccessClient(actor, client_id)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const qty = Number(quantity)
    const transferPairId = randomUUID()

    // Fetch both sides' current levels (each may not exist yet -- a
    // destination item that has never been stocked starts at 0).
    const { data: levels } = await supabase
      .from('field_stock_levels')
      .select('id, business_unit_id, catalogue_item_id, quantity_on_hand')
      .eq('client_id', client_id)
      .in('business_unit_id', [from_business_unit_id, to_business_unit_id])
      .in('catalogue_item_id', [from_catalogue_item_id, to_catalogue_item_id])

    const sourceLevel = (levels || []).find(l => l.business_unit_id === from_business_unit_id && l.catalogue_item_id === from_catalogue_item_id)
    const destLevel = (levels || []).find(l => l.business_unit_id === to_business_unit_id && l.catalogue_item_id === to_catalogue_item_id)

    const sourceCurrent = sourceLevel?.quantity_on_hand ?? 0
    const destCurrent = destLevel?.quantity_on_hand ?? 0
    const sourceNext = applyStockMovement(sourceCurrent, 'transfer_out', qty)
    const destNext = applyStockMovement(destCurrent, 'transfer_in', qty)

    const { error: movementErr } = await supabase.from('field_stock_movements').insert([
      { client_id, business_unit_id: from_business_unit_id, catalogue_item_id: from_catalogue_item_id, movement_type: 'transfer_out', quantity: qty, transfer_pair_id: transferPairId, notes: notes || null },
      { client_id, business_unit_id: to_business_unit_id, catalogue_item_id: to_catalogue_item_id, movement_type: 'transfer_in', quantity: qty, transfer_pair_id: transferPairId, notes: notes || null },
    ])
    if (movementErr) throw movementErr

    const { error: sourceLevelErr } = await supabase.from('field_stock_levels').upsert({
      id: sourceLevel?.id, client_id, business_unit_id: from_business_unit_id, catalogue_item_id: from_catalogue_item_id,
      quantity_on_hand: sourceNext, updated_at: new Date().toISOString(),
    }, { onConflict: 'business_unit_id,catalogue_item_id' })
    if (sourceLevelErr) throw sourceLevelErr

    const { error: destLevelErr } = await supabase.from('field_stock_levels').upsert({
      id: destLevel?.id, client_id, business_unit_id: to_business_unit_id, catalogue_item_id: to_catalogue_item_id,
      quantity_on_hand: destNext, updated_at: new Date().toISOString(),
    }, { onConflict: 'business_unit_id,catalogue_item_id' })
    if (destLevelErr) throw destLevelErr

    return NextResponse.json({ success: true, source_quantity_on_hand: sourceNext, dest_quantity_on_hand: destNext })
  } catch (err: any) {
    console.error('Field stock transfer error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
