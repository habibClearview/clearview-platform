// ============================================================
// API ROUTE: /api/field/admin/segments
// Manage the customer-segment value lists (catalogue_value_lists, kind =
// 'segment') for a client's business units — the "who bought this" options
// shown in the field app and on the platform. Service-role writes, so this
// route authenticates the caller and confirms they may act on the client
// (super_coach, or the client's own CEO/Finance Manager) before any change.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getFieldSupabase as getSupabase } from '@/lib/field-auth'
import { resolveFieldAdminActor, actorMayAccessClient } from '@/lib/auth/field-admin-authz'

// The common customer types seeded on request, so a coach doesn't have to type
// them for every client. Editable/removable afterwards like any other segment.
const DEFAULT_SEGMENTS = [
  'Walk-in farmers',
  'Retailers / agro-dealers',
  'Farmer Group Enterprises / cooperatives',
  'Development institutions',
  'Large farmers',
]

// ── GET: list segments for a client (optionally one unit) ──
export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('client_id')
    const businessUnitId = req.nextUrl.searchParams.get('business_unit_id')
    if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

    const supabase = getSupabase()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!actorMayAccessClient(actor, clientId)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    let query = supabase.from('catalogue_value_lists')
      .select('id, business_unit_id, name, active, sort_order')
      .eq('client_id', clientId).eq('kind', 'segment')
      .order('sort_order')
    if (businessUnitId) query = query.eq('business_unit_id', businessUnitId)

    const { data: items, error } = await query
    if (error) throw error
    return NextResponse.json({ items: items || [] })
  } catch (err: any) {
    console.error('Segments admin GET error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ── POST: add a segment, or seed the common defaults ──
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { client_id, business_unit_id, name, seedDefaults, created_by } = body
    if (!client_id) return NextResponse.json({ error: 'client_id required' }, { status: 400 })
    if (!business_unit_id) return NextResponse.json({ error: 'business_unit_id required' }, { status: 400 })

    const supabase = getSupabase()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!actorMayAccessClient(actor, client_id)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    // Tenant scoping: being allowed to act on client_id is not enough — the
    // business_unit_id must ALSO be one of THIS client's own (active) units.
    // Otherwise a caller for client A could tag a segment with a unit id from
    // client B (cross-tenant). Validate against the client's own model.
    const { data: cfg, error: cfgErr } = await supabase
      .from('generic_model_config').select('business_units').eq('client_id', client_id).single()
    if (cfgErr || !cfg) return NextResponse.json({ error: 'This client has no financial model yet.' }, { status: 400 })
    const unitOk = (cfg.business_units || []).some((u: any) => String(u.id) === String(business_unit_id) && u.active !== false)
    if (!unitOk) return NextResponse.json({ error: 'That business unit does not belong to this client.' }, { status: 400 })

    const names: string[] = seedDefaults
      ? DEFAULT_SEGMENTS
      : (typeof name === 'string' && name.trim() ? [name.trim()] : [])
    if (names.length === 0) return NextResponse.json({ error: 'A segment name is required' }, { status: 400 })

    // created_by is intentionally NOT taken from the request body (spoofable).
    // The row's provenance is the authenticated client scope already enforced
    // above; we don't attribute it to a client-supplied id.
    void created_by
    const rows = names.map((n, i) => ({
      client_id, business_unit_id, kind: 'segment', name: n, active: true,
      sort_order: i, created_by: null,
    }))
    // Upsert on the table's own unique key so re-seeding or a duplicate name is
    // a no-op rather than an error.
    const { data, error } = await supabase.from('catalogue_value_lists')
      .upsert(rows, { onConflict: 'client_id,business_unit_id,kind,name' })
      .select('id, business_unit_id, name, active, sort_order')
    if (error) throw error
    return NextResponse.json({ items: data || [] }, { status: 201 })
  } catch (err: any) {
    console.error('Segments admin POST error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ── PATCH: rename or activate/deactivate one segment ──
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, name, active } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const supabase = getSupabase()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // Authorize against the row's OWN client (the request carries only the id).
    const { data: existing, error: fetchErr } = await supabase
      .from('catalogue_value_lists').select('client_id, kind').eq('id', id).single()
    if (fetchErr || !existing) return NextResponse.json({ error: 'Segment not found' }, { status: 404 })
    if (existing.kind !== 'segment') return NextResponse.json({ error: 'Not a segment' }, { status: 400 })
    if (!actorMayAccessClient(actor, existing.client_id)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (name !== undefined) {
      if (!String(name).trim()) return NextResponse.json({ error: 'Segment name cannot be empty' }, { status: 400 })
      updates.name = String(name).trim()
    }
    if (active !== undefined) updates.active = !!active

    const { data, error } = await supabase.from('catalogue_value_lists')
      .update(updates).eq('id', id).select('id, business_unit_id, name, active, sort_order').single()
    if (error) throw error
    return NextResponse.json({ item: data })
  } catch (err: any) {
    console.error('Segments admin PATCH error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
