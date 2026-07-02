// POST /api/field/auth
// Validates field operator token and returns:
// - operator details
// - business unit info
// - product catalogue (revenue plan lines for that unit)
// - customer list
// - last sync timestamp

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { token, device_id } = await req.json()
    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

    // 1. Validate token
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('field_operator_tokens')
      .select('*, operator:field_operators(*)')
      .eq('token', token)
      .single()

    if (tokenErr || !tokenRow) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    // Check expiry
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token has expired' }, { status: 401 })
    }

    const operator = tokenRow.operator
    if (!operator || !operator.active) {
      return NextResponse.json({ error: 'Operator account is not active' }, { status: 403 })
    }

    // 2. Update last_used_at
    await supabase
      .from('field_operator_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token', token)

    // 3. Get the client's model config to build the product catalogue
    const { data: config, error: configErr } = await supabase
      .from('generic_model_config')
      .select('business_units, plan_lines, settings, currency, business_name, start_date')
      .eq('client_id', operator.client_id)
      .single()

    if (configErr || !config) {
      return NextResponse.json({ error: 'No financial model found for this client' }, { status: 404 })
    }

    // 4. Find this operator's business unit
    const businessUnits: any[] = config.business_units || []
    const unit = businessUnits.find((u: any) => u.id === operator.business_unit_id)

    // 5. Build product catalogue: plan lines for this unit
    const planLines: any[] = config.plan_lines || []
    const catalogue = planLines
      .filter((l: any) => l.unit_id === operator.business_unit_id && l.active)
      .map((l: any) => ({
        id: l.id,
        name: l.name,
        category: l.category,
        line_type: l.line_type || 'standard',
        // Standard price: average of future monthly plan values (non-zero)
        standard_price: (() => {
          const vals: number[] = l.monthly_plan || []
          const nonZero = vals.filter((v: number) => v > 0)
          return nonZero.length > 0
            ? Math.round(nonZero.reduce((a: number, b: number) => a + b, 0) / nonZero.length)
            : 0
        })(),
      }))

    // 6. Get customers for this unit
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
      catalogue,
      customers: customers || [],
      authenticated_at: new Date().toISOString(),
    })

  } catch (err: any) {
    console.error('Field auth error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
