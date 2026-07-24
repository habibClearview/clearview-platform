import { NextRequest, NextResponse } from 'next/server'
import { getFieldSupabase } from '@/lib/field-auth'
import { resolveFieldAdminActor, actorMayAccessClient } from '@/lib/auth/field-admin-authz'

export const dynamic = 'force-dynamic'

// GET: the raw stock-movement ledger for a client (optionally one business
// unit), plus the name lookups the dashboard needs to render it — catalogue
// items, locations (a place-holder), operators (a person-holder) and loss
// reasons. Balances are NOT computed here: the ledger rows are returned as-is
// and the pure src/lib/stores-engine.ts derives balances / reconciliation /
// losses client-side, so the same tested engine drives both the UI and its
// unit tests (no second, drifting balance implementation on the server).
//
// This is a service-role route (RLS bypassed), so it is the trust boundary and
// authenticates the caller itself: any of the client's own staff may READ
// (they need to see balances to act on them); tenant scope is enforced so one
// client can never read another's ledger (super_coach is the cross-tenant
// exception). Read-only — no movement is written here.
export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('client_id')
    const businessUnitId = req.nextUrl.searchParams.get('business_unit_id')
    if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

    const supabase = getFieldSupabase()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!actorMayAccessClient(actor, clientId)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    let moveQuery = supabase
      .from('field_stock_movements')
      .select('id, business_unit_id, catalogue_item_id, movement_type, quantity, location_id, operator_id, reason_id, created_at')
      .eq('client_id', clientId)
    if (businessUnitId) moveQuery = moveQuery.eq('business_unit_id', businessUnitId)

    // Name lookups run alongside the ledger read. Items come from the shared
    // catalogue; locations and loss reasons from the client's value lists;
    // operators from the field roster. Each is scoped to this client.
    let valueListQuery = supabase
      .from('catalogue_value_lists')
      .select('id, name, kind, business_unit_id')
      .eq('client_id', clientId)
      .in('kind', ['location', 'loss_reason'])
    if (businessUnitId) valueListQuery = valueListQuery.eq('business_unit_id', businessUnitId)

    let catalogueQuery = supabase
      .from('field_catalogue')
      .select('id, name, unit_label, business_unit_id')
      .eq('client_id', clientId)
    if (businessUnitId) catalogueQuery = catalogueQuery.eq('business_unit_id', businessUnitId)

    let operatorQuery = supabase
      .from('field_operators')
      .select('id, display_name, business_unit_id')
      .eq('client_id', clientId)
    if (businessUnitId) operatorQuery = operatorQuery.eq('business_unit_id', businessUnitId)

    const [movesRes, valueListsRes, catalogueRes, operatorsRes] = await Promise.all([
      moveQuery, valueListQuery, catalogueQuery, operatorQuery,
    ])
    if (movesRes.error) throw movesRes.error
    if (valueListsRes.error) throw valueListsRes.error
    if (catalogueRes.error) throw catalogueRes.error
    if (operatorsRes.error) throw operatorsRes.error

    const valueLists = valueListsRes.data || []
    const locations = valueLists.filter(v => v.kind === 'location').map(v => ({ id: v.id, name: v.name }))
    const reasons = valueLists.filter(v => v.kind === 'loss_reason').map(v => ({ id: v.id, name: v.name }))
    const items = (catalogueRes.data || []).map(c => ({ id: c.id, name: c.name, unit_label: c.unit_label }))
    const operators = (operatorsRes.data || []).map(o => ({ id: o.id, name: o.display_name }))

    return NextResponse.json({
      movements: movesRes.data || [],
      items,
      locations,
      operators,
      reasons,
    })
  } catch (err: any) {
    console.error('Field movements admin GET error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
