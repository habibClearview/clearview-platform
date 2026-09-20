// ============================================================
// API ROUTE: /api/catalogue-source
//
// Where a coach records the address of a business's own price list, and where
// they can paste one in directly for a system that cannot publish to the web.
//
// 20 September 2026.
//
// THE PASTE-IN ROUTE MATTERS MORE THAN IT LOOKS. Plenty of small businesses
// run software on one computer behind a counter with no address the internet
// can reach. There is nothing for ClearView to pull from, and saying "ask your
// developer to build us an endpoint" means it never happens. Every such system
// can export a file. So a coach exports it, pastes it in, and the catalogue is
// built by exactly the same code the scheduled read uses.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/auth/api-authz'
import { resolveFieldAdminActor, actorMayAccessClient, actorMayManageTeam } from '@/lib/auth/field-admin-authz'
import { checkSourceUrl } from '@/lib/catalogue-pull'
import { parseCatalogue, planCatalogueImport, type ExistingItem } from '@/lib/catalogue-import'
import { applyCataloguePlan, defaultRevenueLineFor } from '@/lib/catalogue-import-runner'

export const dynamic = 'force-dynamic'

/** The recorded addresses for one client. Never returns a stored password. */
export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('client_id')
    if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

    const supabase = getAdminClient()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!actorMayAccessClient(actor, clientId)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // auth_header is deliberately absent from this list. It is a password for
    // somebody else's system and nothing needs to read it back.
    const { data, error } = await supabase
      .from('catalogue_sources')
      .select('id, business_unit_id, url, format, active, last_run_at, last_status, last_detail, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) throw error

    return NextResponse.json({ sources: data || [] })
  } catch (e) {
    console.error('GET /api/catalogue-source failed:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/** Record or replace the address ClearView reads a price list from. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const clientId = body?.client_id
    const businessUnitId = body?.business_unit_id
    if (!clientId || !businessUnitId) {
      return NextResponse.json({ error: 'client_id and business_unit_id required' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!actorMayAccessClient(actor, clientId) || !actorMayManageTeam(actor)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const check = checkSourceUrl(body?.url)
    if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 })

    const planLineId = await defaultRevenueLineFor(supabase, clientId, businessUnitId)
    if (!planLineId) {
      return NextResponse.json({
        error: 'This business unit has no active revenue line yet. Add one before connecting a price list.',
      }, { status: 409 })
    }

    const row: Record<string, unknown> = {
      client_id: clientId,
      business_unit_id: businessUnitId,
      default_plan_line_id: planLineId,
      url: String(body.url).trim(),
      format: 'json',
      active: true,
    }
    // An absent password leaves whatever is stored alone, so editing the
    // address does not silently wipe the password that goes with it. An empty
    // string clears it, which is how a coach removes one deliberately.
    if (typeof body?.auth_header === 'string') {
      row.auth_header = body.auth_header.trim() || null
    }

    const { data, error } = await supabase
      .from('catalogue_sources')
      .upsert(row, { onConflict: 'client_id,business_unit_id' })
      .select('id, business_unit_id, url, active, last_run_at, last_status, last_detail')
      .single()
    if (error) throw error

    return NextResponse.json({ source: data })
  } catch (e) {
    console.error('POST /api/catalogue-source failed:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/**
 * A price list pasted in by hand, for a system with nothing on the internet to
 * read. Goes through exactly the same rules as a scheduled read.
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const clientId = body?.client_id
    const businessUnitId = body?.business_unit_id
    if (!clientId || !businessUnitId) {
      return NextResponse.json({ error: 'client_id and business_unit_id required' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!actorMayAccessClient(actor, clientId) || !actorMayManageTeam(actor)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const parsed = parseCatalogue(body?.payload)
    if (parsed.items.length === 0) {
      return NextResponse.json({
        error: 'No products were found in that. It should be the product list your system exports, as JSON. Each product needs at least a name.',
      }, { status: 400 })
    }

    const planLineId = await defaultRevenueLineFor(supabase, clientId, businessUnitId)
    if (!planLineId) {
      return NextResponse.json({
        error: 'This business unit has no active revenue line yet. Add one before loading a price list.',
      }, { status: 409 })
    }

    const { data: existingRows } = await supabase
      .from('field_catalogue')
      .select('id, external_id, name, price, plan_line_id, active, needs_price')
      .eq('client_id', clientId)
      .eq('business_unit_id', businessUnitId)

    const plan = planCatalogueImport(
      parsed.items, (existingRows || []) as ExistingItem[], planLineId, 'pasted', new Date().toISOString(),
    )
    const applied = await applyCataloguePlan(supabase, clientId, businessUnitId, plan)
    if (applied.error) {
      console.error('Pasted catalogue failed to apply:', applied.error)
      return NextResponse.json({ error: 'The price list could not be stored. Nothing was changed.' }, { status: 500 })
    }

    return NextResponse.json({
      read: parsed.items.length,
      created: plan.create.length,
      updated: plan.update.length,
      switched_off: plan.deactivate.length,
      unchanged: plan.unchanged,
      needing_a_price: plan.create.filter((c) => c.needs_price).length,
      problems: parsed.problems.slice(0, 50).map((p) => p.reason),
    })
  } catch (e) {
    console.error('PUT /api/catalogue-source failed:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
