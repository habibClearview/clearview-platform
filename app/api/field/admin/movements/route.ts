import { NextRequest, NextResponse } from 'next/server'
import { getFieldSupabase } from '@/lib/field-auth'
import { resolveFieldAdminActor, actorMayAccessClient, type FieldAdminActor } from '@/lib/auth/field-admin-authz'
import { movementDelta } from '@/lib/stores-engine'

export const dynamic = 'force-dynamic'

// The movement types a manager may record BY HAND from the dashboard. Sales come
// from the field app / actuals (they carry channel + customer), and transfers
// have their own two-sided endpoint — so both are deliberately excluded here to
// keep this recorder unambiguous.
const RECORDABLE_TYPES = new Set(['stock_in', 'produced', 'issue', 'loss', 'adjustment'])

// Role gate for WRITES, mirroring the value-lists route hardened in #245:
// recording stock is a management action, so only a super_coach or the client's
// own CEO / Finance Manager may do it from the dashboard. (Field operators record
// through their own token-authenticated field-app path, not this route.)
const WRITE_ROLES = new Set(['ceo', 'finance_manager'])
function actorMayWrite(actor: FieldAdminActor): boolean {
  return actor.role === 'super_coach' || WRITE_ROLES.has(actor.role)
}

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

// POST: record ONE stock movement by hand from the dashboard — a delivery
// received (stock_in), stock produced/collected (produced), stock issued to
// production (issue), a loss (loss), or a stocktake correction (adjustment).
//
// The inserted field_stock_movements row is the source of truth: the "Stock on
// hand" view derives every balance from the ledger via the pure stores-engine,
// so a recorded movement shows up immediately with no separate balance to keep
// in sync. We ALSO nudge the per-unit field_stock_levels.quantity_on_hand (the
// number the field app shows) using the SAME canonical movementDelta, so the two
// views never disagree. quantity_on_hand is floored at 0 — a movement is never
// rejected or rewritten, but the displayed on-hand can't go impossibly negative.
//
// Service-role route ⇒ the trust boundary: authenticates the caller, enforces
// tenant scope (actorMayAccessClient) AND write role (actorMayWrite), and
// confirms the item belongs to this client before writing.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { client_id, business_unit_id, catalogue_item_id, movement_type, quantity, location_id, operator_id, reason_id, notes } = body

    if (!client_id) return NextResponse.json({ error: 'client_id required' }, { status: 400 })
    if (!business_unit_id) return NextResponse.json({ error: 'Choose a business unit' }, { status: 400 })
    if (!catalogue_item_id) return NextResponse.json({ error: 'Choose an item' }, { status: 400 })
    if (!RECORDABLE_TYPES.has(movement_type)) return NextResponse.json({ error: 'Unsupported movement type' }, { status: 400 })
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty === 0) return NextResponse.json({ error: 'Enter a quantity' }, { status: 400 })
    // Only an adjustment may be negative (a downward correction); every other
    // type takes a positive amount and gets its direction from the type.
    if (movement_type !== 'adjustment' && qty < 0) return NextResponse.json({ error: 'Quantity must be a positive number' }, { status: 400 })
    // A movement has exactly one holder — a place OR a person, never both
    // (also enforced by a DB CHECK). Either may be omitted (unassigned).
    if (location_id && operator_id) return NextResponse.json({ error: 'A movement sits with a place or a person, not both' }, { status: 400 })

    const supabase = getFieldSupabase()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!actorMayAccessClient(actor, client_id)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (!actorMayWrite(actor)) return NextResponse.json({ error: 'Only a CEO or Finance Manager can record stock movements.' }, { status: 403 })

    // The item must belong to THIS client — guards against a stale/mismatched id
    // creating an orphan ledger row.
    const { data: item } = await supabase
      .from('field_catalogue').select('id, client_id').eq('id', catalogue_item_id).maybeSingle()
    if (!item || item.client_id !== client_id) return NextResponse.json({ error: 'Item not found for this business' }, { status: 400 })

    // Store the signed amount only for an adjustment; magnitude for the rest, so
    // the ledger reads cleanly and movementDelta derives the right direction.
    const storedQty = movement_type === 'adjustment' ? qty : Math.abs(qty)

    const { error: moveErr } = await supabase.from('field_stock_movements').insert({
      client_id,
      business_unit_id,
      catalogue_item_id,
      movement_type,
      quantity: storedQty,
      location_id: location_id || null,
      operator_id: operator_id || null,
      reason_id: reason_id || null,
      notes: notes || null,
    })
    if (moveErr) throw moveErr

    // Keep the field app's per-unit on-hand number in step, using the same
    // canonical delta the balances view uses.
    const { data: level } = await supabase
      .from('field_stock_levels')
      .select('id, quantity_on_hand')
      .eq('client_id', client_id)
      .eq('business_unit_id', business_unit_id)
      .eq('catalogue_item_id', catalogue_item_id)
      .maybeSingle()
    const current = level?.quantity_on_hand ?? 0
    const delta = movementDelta({ catalogue_item_id, movement_type, quantity: storedQty })
    const next = Math.max(0, current + delta)
    const { error: lvlErr } = await supabase.from('field_stock_levels').upsert({
      id: level?.id, client_id, business_unit_id, catalogue_item_id,
      quantity_on_hand: next, updated_at: new Date().toISOString(),
    }, { onConflict: 'business_unit_id,catalogue_item_id' })
    if (lvlErr) throw lvlErr

    return NextResponse.json({ success: true, quantity_on_hand: next })
  } catch (err: any) {
    console.error('Field movements admin POST error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
