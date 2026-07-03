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
    const { client_id, business_unit_id, plan_line_id, name, item_type, price, unit_label, created_by } = body

    if (!client_id) return NextResponse.json({ error: 'client_id required' }, { status: 400 })
    if (!business_unit_id) return NextResponse.json({ error: 'business_unit_id required' }, { status: 400 })
    if (!plan_line_id) return NextResponse.json({ error: 'plan_line_id required -- every catalogue item must roll up into a revenue line' }, { status: 400 })
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    if (price === undefined || price === null || Number(price) < 0) return NextResponse.json({ error: 'A valid price is required -- this is the number field operators will never have to enter themselves' }, { status: 400 })

    const supabase = getSupabase()
    const { data: item, error } = await supabase
      .from('field_catalogue')
      .insert({
        client_id, business_unit_id, plan_line_id,
        name: String(name).trim(),
        item_type: item_type === 'service' ? 'service' : 'product',
        price: Number(price),
        unit_label: unit_label || null,
        active: true,
        created_by: created_by || null,
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
    const { id, name, price, unit_label, active } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (name !== undefined) updates.name = String(name).trim()
    if (price !== undefined) {
      if (Number(price) < 0) return NextResponse.json({ error: 'Price cannot be negative' }, { status: 400 })
      updates.price = Number(price)
    }
    if (unit_label !== undefined) updates.unit_label = unit_label || null
    if (active !== undefined) updates.active = !!active

    const supabase = getSupabase()
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
