import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Lazy init -- must never call createClient() at module level on Vercel.
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase environment variables not configured')
  return createClient(url, key)
}

// ── GET: list catalogue items for a client (optionally one unit) ──
export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('client_id')
    const businessUnitId = req.nextUrl.searchParams.get('business_unit_id')
    if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

    const supabase = getSupabase()
    let query = supabase.from('field_catalogue').select('*').eq('client_id', clientId).order('name')
    if (businessUnitId) query = query.eq('business_unit_id', businessUnitId)

    const { data: items, error } = await query
    if (error) throw error
    return NextResponse.json({ items: items || [] })
  } catch (err: any) {
    console.error('Catalogue admin GET error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ── POST: create a catalogue item ──
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { client_id, business_unit_id, plan_line_id, name, item_type, price, unit_label, created_by, cost_price, cogs_plan_line_id } = body

    if (!client_id) return NextResponse.json({ error: 'client_id required' }, { status: 400 })
    if (!business_unit_id) return NextResponse.json({ error: 'business_unit_id required' }, { status: 400 })
    if (!plan_line_id) return NextResponse.json({ error: 'plan_line_id required -- every catalogue item must roll up into a revenue line' }, { status: 400 })
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    const parsedPrice = Number(price)
    if (price === undefined || price === null || !Number.isFinite(parsedPrice) || parsedPrice < 0) return NextResponse.json({ error: 'A valid price is required -- this is the number field operators will never have to enter themselves' }, { status: 400 })
    // cost_price is optional -- if provided, a matching cogs_plan_line_id
    // is required too, since automatic COGS entries need somewhere to post
    // (see docs/ACCOUNTING_ARCHITECTURE.md section 3). If cost_price is
    // never set, no COGS is fabricated for this item -- that's deliberate.
    let parsedCostPrice: number | null = null
    if (cost_price !== undefined && cost_price !== null) {
      parsedCostPrice = Number(cost_price)
      if (!Number.isFinite(parsedCostPrice) || parsedCostPrice < 0) return NextResponse.json({ error: 'Cost price must be a valid, non-negative number' }, { status: 400 })
      if (!cogs_plan_line_id) return NextResponse.json({ error: 'A COGS category is required when setting a cost price' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data: item, error } = await supabase
      .from('field_catalogue')
      .insert({
        client_id, business_unit_id, plan_line_id,
        name: String(name).trim(),
        item_type: item_type === 'service' ? 'service' : 'product',
        price: parsedPrice,
        unit_label: unit_label || null,
        active: true,
        created_by: created_by || null,
        cost_price: parsedCostPrice,
        cogs_plan_line_id: cogs_plan_line_id || null,
        cost_price_updated_at: (cost_price !== undefined && cost_price !== null) ? new Date().toISOString() : null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ item }, { status: 201 })
  } catch (err: any) {
    console.error('Catalogue admin POST error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ── PATCH: update a catalogue item's price/name/active status ──
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, name, price, unit_label, active, cost_price, cogs_plan_line_id, item_type, plan_line_id, business_unit_id } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const supabase = getSupabase()

    // Fetch current state first: cost_price and cogs_plan_line_id must
    // stay atomic (a costed item always has a COGS category, never one
    // without the other) -- validating only the fields present in THIS
    // request would miss the case where, say, cogs_plan_line_id is being
    // cleared while a cost_price from an earlier PATCH still remains, or
    // vice versa. Validate the EFFECTIVE state after this update applies.
    const { data: existing, error: fetchErr } = await supabase
      .from('field_catalogue').select('cost_price, cogs_plan_line_id').eq('id', id).single()
    if (fetchErr) return NextResponse.json({ error: 'Catalogue item not found' }, { status: 404 })

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (name !== undefined) updates.name = String(name).trim()
    if (price !== undefined) {
      const parsedPrice = Number(price)
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) return NextResponse.json({ error: 'Price must be a valid, non-negative number' }, { status: 400 })
      updates.price = parsedPrice
    }
    if (unit_label !== undefined) updates.unit_label = unit_label || null
    if (active !== undefined) updates.active = !!active
    if (item_type !== undefined) updates.item_type = item_type === 'service' ? 'service' : 'product'

    let effectiveCostPrice = existing.cost_price
    let effectiveCogsLine = existing.cogs_plan_line_id

    // plan_line_id (the revenue category) and business_unit_id can move
    // together -- moving an item to a different unit requires re-picking
    // a category that actually belongs to that unit, so the client sends
    // both together whenever business_unit_id changes. plan_line_id can
    // also change on its own (recategorising within the same unit).
    if (plan_line_id !== undefined) {
      if (!plan_line_id) return NextResponse.json({ error: 'A category is required -- every catalogue item must roll up into a revenue line' }, { status: 400 })
      updates.plan_line_id = plan_line_id
    }
    if (business_unit_id !== undefined) {
      if (!business_unit_id) return NextResponse.json({ error: 'A business unit is required' }, { status: 400 })
      updates.business_unit_id = business_unit_id
      // Moving an item to a different unit invalidates any existing
      // cogs_plan_line_id (a COGS category belongs to one specific unit's
      // plan lines) -- clearing both rather than silently leaving a cost
      // price pointing at a COGS category from the unit it just left.
      // Updates the effective-state tracking variables too (not just
      // `updates` directly), so the atomic invariant check below
      // correctly reflects this auto-clear even when the request body
      // itself never mentions cost_price/cogs_plan_line_id at all.
      if (effectiveCostPrice !== null) {
        updates.cost_price = null
        updates.cogs_plan_line_id = null
        updates.cost_price_updated_at = null
        effectiveCostPrice = null
        effectiveCogsLine = null
      }
    }

    // cost_price_updated_at is set here automatically, never passed in by
    // the caller -- this is the timestamp the eventual 90-day staleness
    // check reads, so it must reflect exactly when the price was actually
    // changed, not something the client could set to whatever it wants.
    if (cost_price !== undefined) {
      if (cost_price !== null) {
        const parsedCost = Number(cost_price)
        if (!Number.isFinite(parsedCost) || parsedCost < 0) return NextResponse.json({ error: 'Cost price must be a valid, non-negative number' }, { status: 400 })
        updates.cost_price = parsedCost
        effectiveCostPrice = parsedCost
      } else {
        updates.cost_price = null
        effectiveCostPrice = null
      }
      updates.cost_price_updated_at = cost_price === null ? null : new Date().toISOString()
    }
    if (cogs_plan_line_id !== undefined) {
      updates.cogs_plan_line_id = cogs_plan_line_id || null
      effectiveCogsLine = cogs_plan_line_id || null
    }

    // The atomic invariant, checked against the state this update would
    // actually produce: a set cost price always needs a COGS category to
    // post against, or sync silently skips generating COGS for a costed
    // item with no obvious symptom until someone notices margins are wrong.
    if (effectiveCostPrice !== null && effectiveCostPrice !== undefined && !effectiveCogsLine) {
      return NextResponse.json({ error: 'A COGS category is required whenever a cost price is set' }, { status: 400 })
    }

    const { data: item, error } = await supabase
      .from('field_catalogue')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ item })
  } catch (err: any) {
    console.error('Catalogue admin PATCH error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
