// ============================================================
// POST /api/v1/catalogue
//
// Send your price list. ClearView builds its catalogue from it.
//
// This is the call that removes the mapping step. Before it existed, somebody
// had to pair every product in their system with a product in ours before a
// single sale could be sent. Now their list becomes our catalogue, each item
// keeps the code their system already uses for it, and sales arrive under
// those codes with nothing mapped by hand.
//
// Send whatever your system exports. Column names are matched by meaning, not
// by spelling: sku, code, item_number and product_id all mean the same thing
// here, and so do price, unit_price and selling_price.
//
// Safe to send the whole list every time. It is worked out as a difference:
// new products are created, changed prices are updated, and a product you stop
// sending is switched off rather than deleted, so its sales history survives.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { requireApiKey, noteKeyUse, readJson, apiError } from '@/lib/api-gate'
import { parseCatalogue, planCatalogueImport, type ExistingItem } from '@/lib/catalogue-import'
import { applyCataloguePlan, defaultRevenueLineFor } from '@/lib/catalogue-import-runner'

export const dynamic = 'force-dynamic'

/** A price list can be long. A veterinary business runs to several hundred. */
const MAX_ITEMS = 5000

export async function POST(req: NextRequest) {
  const gate = await requireApiKey(req, 'catalogue.write')
  if (gate instanceof NextResponse) return gate
  const { key, supabase } = gate

  const body = await readJson(req)
  if (body === null) {
    return apiError(400, 'bad_request',
      'The body was not readable as JSON. Send your price list as a JSON array, or as an object with the list under "items".')
  }

  const parsed = parseCatalogue(body)
  if (parsed.items.length === 0) {
    return apiError(400, 'no_items',
      'No product records were found. Send a JSON array of products, or an object with the list under "items". Each product needs at least a name.')
  }
  if (parsed.items.length > MAX_ITEMS) {
    return apiError(413, 'too_many_items',
      `A price list may carry ${MAX_ITEMS} products in one call.`)
  }

  try {
    const planLineId = await defaultRevenueLineFor(supabase, key.client_id, key.business_unit_id)
    if (!planLineId) {
      return apiError(409, 'no_revenue_line',
        'This business unit has no active revenue line for products to roll up into. A coach adds one in the workspace before a price list can be read.')
    }

    const { data: existingRows } = await supabase
      .from('field_catalogue')
      .select('id, external_id, name, price, plan_line_id, active, needs_price')
      .eq('client_id', key.client_id)
      .eq('business_unit_id', key.business_unit_id)

    const plan = planCatalogueImport(
      parsed.items,
      (existingRows || []) as ExistingItem[],
      planLineId,
      `api:${key.label}`,
      new Date().toISOString(),
    )

    const applied = await applyCataloguePlan(supabase, key.client_id, key.business_unit_id, plan)
    if (applied.error) {
      console.error('POST /api/v1/catalogue failed to apply:', applied.error)
      return apiError(500, 'write_failed',
        'The price list could not be stored. Nothing was changed. Send it again.')
    }

    await noteKeyUse(supabase, key.id)

    return NextResponse.json({
      read: parsed.items.length,
      created: plan.create.length,
      updated: plan.update.length,
      switched_off: plan.deactivate.length,
      unchanged: plan.unchanged,
      needing_a_price: plan.create.filter((c) => c.needs_price).length,
      problems: parsed.problems.slice(0, 50).map((p) => p.reason),
      note: 'Send sales using your own product codes in external_item_id. Nothing needs mapping by hand. A product with no readable price was created but cannot be sold until somebody in the workspace prices it.',
    })
  } catch (e) {
    console.error('POST /api/v1/catalogue failed:', e)
    return apiError(500, 'server_error', 'Something failed at our end. Try again.')
  }
}
