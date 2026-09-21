// ============================================================
// GET /api/v1/model
//
// The first call any outside system makes. Answers: which business am I
// writing to, in what currency, what does it sell, and what headings does it
// file spending under.
//
// This is the map. Nothing else in the API accepts a name -- a sale names a
// catalogue item by the id it finds here, a cost names a line by the id it
// finds here. An integrator maps their own product list to this once and
// stores the result.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { requireApiKey, noteKeyUse } from '@/lib/api-gate'
import { describeKey } from '@/lib/api-keys'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireApiKey(req, 'model.read')
  if (gate instanceof NextResponse) return gate
  const { key, supabase } = gate

  try {
    const { data: config } = await supabase
      .from('generic_model_config')
      .select('business_name, currency, start_date, planning_months, business_units, plan_lines')
      .eq('client_id', key.client_id)
      .maybeSingle()

    if (!config) {
      return NextResponse.json({
        error: 'no_model',
        detail: 'This business has no financial model set up yet, so there is nothing to write figures against. The coach sets one up in the workspace before this key can be used.',
      }, { status: 409 })
    }

    const allUnits: any[] = (config.business_units as any[]) || []
    const unit = allUnits.find((u) => u.id === key.business_unit_id)
    if (!unit || !unit.active) {
      return NextResponse.json({
        error: 'unit_unavailable',
        detail: 'The business unit this key writes to no longer exists or has been switched off. Ask the coach who issued the key.',
      }, { status: 409 })
    }

    const lines: any[] = (config.plan_lines as any[]) || []
    const visible = lines.filter((l) => l.active && l.unit_id === key.business_unit_id)

    const revenue_lines = visible
      .filter((l) => l.category === 'revenue')
      .map((l) => ({ id: l.id, name: l.name }))

    // Everything that is not revenue is somewhere money goes out. The
    // category travels with the line so a sender can group its own accounts
    // sensibly, but it is never sent back to us -- we take the line's own.
    const cost_lines = visible
      .filter((l) => l.category !== 'revenue')
      .map((l) => ({ id: l.id, name: l.name, category: l.category }))

    const { data: catalogue } = await supabase
      .from('field_catalogue')
      .select('id, name, item_type, price, unit_label, plan_line_id')
      .eq('client_id', key.client_id)
      .eq('business_unit_id', key.business_unit_id)
      .eq('active', true)
      .eq('needs_price', false)
      .order('name')

    await noteKeyUse(supabase, key.id)

    return NextResponse.json({
      key: describeKey(key, unit.name),
      business: {
        name: config.business_name,
        currency: config.currency,
        start_date: config.start_date,
        planning_months: config.planning_months,
      },
      catalogue: catalogue || [],
      revenue_lines,
      cost_lines,
    })
  } catch (e) {
    console.error('GET /api/v1/model failed:', e)
    return NextResponse.json({ error: 'server_error', detail: 'Something failed at our end. Try again.' }, { status: 500 })
  }
}
