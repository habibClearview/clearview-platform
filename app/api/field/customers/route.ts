import { NextRequest, NextResponse } from 'next/server'
import { getFieldSupabase as getSupabase, validateFieldToken as validateToken } from '@/lib/field-auth'

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

    const supabase = getSupabase()
    const operator = await validateToken(token)
    if (!operator) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const { data: customers, error } = await supabase
      .from('field_customers')
      .select('id, name, phone, village, location_notes, created_at')
      .eq('client_id', operator.client_id)
      .eq('business_unit_id', operator.business_unit_id)
      .eq('active', true)
      .order('name')

    if (error) throw error
    return NextResponse.json({ customers: customers || [] })

  } catch (err: any) {
    console.error('Field customers GET error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, name, phone, village, location_notes } = body

    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })
    if (!name) return NextResponse.json({ error: 'Customer name required' }, { status: 400 })

    const supabase = getSupabase()
    const operator = await validateToken(token)
    if (!operator) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const { data: customer, error } = await supabase
      .from('field_customers')
      .insert({
        client_id: operator.client_id,
        business_unit_id: operator.business_unit_id,
        name: name.trim(),
        phone: phone || null,
        village: village || null,
        location_notes: location_notes || null,
        created_by: operator.id,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ customer }, { status: 201 })

  } catch (err: any) {
    console.error('Field customers POST error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
