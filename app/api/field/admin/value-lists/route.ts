// ============================================================
// API ROUTE: /api/field/admin/value-lists
// Manage a client's OWN configurable lists for the Stores & Production feature:
//   * kind = 'location'    — the client's places (Farm, Store, Warehouse…)
//   * kind = 'loss_reason' — the client's words for a loss (Breakage, Mortality…)
//
// Deliberately client-defined: NO options are seeded here — the client types
// their own. Stored in catalogue_value_lists, the same per-client table the
// catalogue/segments use. This is a service-role route (RLS bypassed), so it is
// the trust boundary and enforces BOTH:
//   * tenant scope  — actorMayAccessClient: the caller belongs to this client
//     (super_coach excepted), so one client can never touch another's lists; and
//   * role          — WRITES (add / rename / on-off) are a management action,
//     allowed only to a super_coach or the client's own CEO / Finance Manager.
//     READS stay open to any of the client's staff, who must see the options to
//     record movements against them.
//
// Channels are intentionally NOT handled here — they already live in the
// client's config.settings.channels list and are reused, never duplicated.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getFieldSupabase as getSupabase } from '@/lib/field-auth'
import { resolveFieldAdminActor, actorMayAccessClient, actorMayManageCatalogue } from '@/lib/auth/field-admin-authz'

// Only the two new Stores lists may be managed through this route. Other kinds
// (category/type/size/supplier/segment) have their own meaning and routes; an
// allowlist stops this endpoint from being pointed at them.
const ALLOWED_KINDS = new Set(['location', 'loss_reason'])

function kindOk(kind: unknown): kind is string {
  return typeof kind === 'string' && ALLOWED_KINDS.has(kind)
}

// Role gate for WRITES is actorMayManageCatalogue (shared) — tenant scope is
// checked separately (actorMayAccessClient / the row's own client on PATCH).
// These lists are part of the Stores setup the dashboard gates behind
// canManageCatalogue, so this honours the same "Manage Field Catalogue"
// delegation the UI grants — not every staff login tied to the client.

// ── GET: list a client's locations or loss reasons (optionally one unit) ──
export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('client_id')
    const kind = req.nextUrl.searchParams.get('kind')
    const businessUnitId = req.nextUrl.searchParams.get('business_unit_id')
    if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })
    if (!kindOk(kind)) return NextResponse.json({ error: 'Unsupported list' }, { status: 400 })

    const supabase = getSupabase()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!actorMayAccessClient(actor, clientId)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    let query = supabase.from('catalogue_value_lists')
      .select('id, business_unit_id, name, active, sort_order')
      .eq('client_id', clientId).eq('kind', kind)
      .order('sort_order')
    if (businessUnitId) query = query.eq('business_unit_id', businessUnitId)

    const { data: items, error } = await query
    if (error) throw error
    return NextResponse.json({ items: items || [] })
  } catch (err: any) {
    console.error('Value-lists admin GET error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ── POST: add one option to a client's list ──
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { client_id, business_unit_id, kind, name, created_by } = body
    if (!client_id) return NextResponse.json({ error: 'client_id required' }, { status: 400 })
    if (!business_unit_id) return NextResponse.json({ error: 'business_unit_id required' }, { status: 400 })
    if (!kindOk(kind)) return NextResponse.json({ error: 'Unsupported list' }, { status: 400 })

    const supabase = getSupabase()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!actorMayAccessClient(actor, client_id)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    // Role gate: tenant scope alone is not enough for a WRITE — only a
    // super_coach or the client's own CEO / Finance Manager may change the lists.
    if (!actorMayManageCatalogue(actor)) return NextResponse.json({ error: 'You do not have permission to change these lists.' }, { status: 403 })

    // Tenant scoping: being allowed to act on client_id is not enough — the
    // business_unit_id must ALSO be one of THIS client's own (active) units, so
    // a caller for client A can't attach a list to a unit id from client B.
    const { data: cfg, error: cfgErr } = await supabase
      .from('generic_model_config').select('business_units').eq('client_id', client_id).single()
    if (cfgErr || !cfg) return NextResponse.json({ error: 'This client has no financial model yet.' }, { status: 400 })
    const unitOk = (cfg.business_units || []).some((u: any) => String(u.id) === String(business_unit_id) && u.active !== false)
    if (!unitOk) return NextResponse.json({ error: 'That business unit does not belong to this client.' }, { status: 400 })

    if (typeof name !== 'string' || !name.trim()) return NextResponse.json({ error: 'A name is required' }, { status: 400 })
    const trimmed = name.trim()

    // created_by is intentionally NOT trusted from the request body (spoofable);
    // the row's provenance is the authenticated client scope enforced above.
    void created_by
    // Insert (NOT upsert): re-adding a name that already exists must be a no-op,
    // never an edit — an upsert would silently reset an existing option's active
    // flag / sort order / provenance. On a duplicate we return the existing row
    // UNCHANGED so the UI still gets the option it asked for.
    const { data, error } = await supabase.from('catalogue_value_lists')
      .insert({ client_id, business_unit_id, kind, name: trimmed, active: true, sort_order: 0, created_by: null })
      .select('id, business_unit_id, name, active, sort_order')
      .single()
    if (error) {
      if ((error as any).code === '23505') {
        const { data: existing } = await supabase.from('catalogue_value_lists')
          .select('id, business_unit_id, name, active, sort_order')
          .eq('client_id', client_id).eq('business_unit_id', business_unit_id)
          .eq('kind', kind).eq('name', trimmed).maybeSingle()
        return NextResponse.json({ item: existing, duplicate: true }, { status: 200 })
      }
      throw error
    }
    return NextResponse.json({ item: data }, { status: 201 })
  } catch (err: any) {
    console.error('Value-lists admin POST error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ── PATCH: rename or turn an option on/off ──
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, name, active } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const supabase = getSupabase()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // Authorize against the row's OWN client, and confirm it is one of the two
    // Stores lists this route is allowed to touch (never a segment/category/…).
    const { data: existing, error: fetchErr } = await supabase
      .from('catalogue_value_lists').select('client_id, kind').eq('id', id).single()
    if (fetchErr || !existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!kindOk(existing.kind)) return NextResponse.json({ error: 'Not an editable list here' }, { status: 400 })
    if (!actorMayAccessClient(actor, existing.client_id)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    // Same write-role gate as POST: only super_coach / CEO / Finance Manager.
    if (!actorMayManageCatalogue(actor)) return NextResponse.json({ error: 'You do not have permission to change these lists.' }, { status: 403 })

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (name !== undefined) {
      if (!String(name).trim()) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
      updates.name = String(name).trim()
    }
    if (active !== undefined) updates.active = !!active

    const { data, error } = await supabase.from('catalogue_value_lists')
      .update(updates).eq('id', id).select('id, business_unit_id, name, active, sort_order').single()
    if (error) throw error
    return NextResponse.json({ item: data })
  } catch (err: any) {
    console.error('Value-lists admin PATCH error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
