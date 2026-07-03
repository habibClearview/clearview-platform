import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json()
    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

    const supabase = getSupabase()
    const operator = await validateToken(token)
    if (!operator) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })

    await supabase
      .from('field_operator_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token', token)

    const { data: config, error: configErr } = await supabase
      .from('generic_model_config')
      .select('business_units, plan_lines, settings, currency, business_name, start_date')
      .eq('client_id', operator.client_id)
      .single()

    if (configErr || !config) {
      return NextResponse.json({ error: 'No financial model found for this client' }, { status: 404 })
    }

    const businessUnits: any[] = config.business_units || []
    const unit = businessUnits.find((u: any) => u.id === operator.business_unit_id)

    // Sales catalogue: priced products/services from field_catalogue. The
    // operator only ever picks one of these and enters a volume -- price
    // and amount are computed server-side in /api/field/sync, never
    // entered by the operator. See supabase/migrations/2026_07_04_field_catalogue.sql.
    const { data: catalogueItems, error: catalogueErr } = await supabase
      .from('field_catalogue')
      .select('id, name, item_type, price, unit_label, plan_line_id')
      .eq('client_id', operator.client_id)
      .eq('business_unit_id', operator.business_unit_id)
      .eq('active', true)
      .order('name')
    if (catalogueErr) throw catalogueErr

    // Cost/expense lines: still sourced directly from the plan, unchanged --
    // pricing the cost side of the catalogue is a separate, later piece of
    // work, not part of this change.
    const planLines: any[] = config.plan_lines || []
    const costLines = planLines
      .filter((l: any) => l.unit_id === operator.business_unit_id && l.active && l.category !== 'revenue')
      .map((l: any) => ({ id: l.id, name: l.name, category: l.category }))

    const { data: customers } = await supabase
      .from('field_customers')
      .select('id, name, phone, village')
      .eq('client_id', operator.client_id)
      .eq('business_unit_id', operator.business_unit_id)
      .eq('active', true)
      .order('name')

    return NextResponse.json({
      operator: {
        id: operator.id,
        display_name: operator.display_name,
        phone: operator.phone,
        role: operator.role,
        sync_frequency: operator.sync_frequency,
      },
      client: {
        id: operator.client_id,
        name: config.business_name,
        currency: config.currency,
        start_date: config.start_date,
      },
      unit: unit || { id: operator.business_unit_id, name: 'My Unit' },
      catalogue: catalogueItems || [],
      cost_lines: costLines,
      customers: customers || [],
      authenticated_at: new Date().toISOString(),
    })

  } catch (err: any) {
    console.error('Field auth error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
