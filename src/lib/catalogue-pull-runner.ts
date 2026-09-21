// ============================================================
// Reading one business's price list from their own system.
//
// 20 September 2026. Lives here rather than in the route because a Next.js
// route file may only export its handlers, and this is called both by the
// nightly schedule and by a coach pressing "Read now".
// ============================================================
import { fetchCatalogue } from '@/lib/catalogue-pull'
import { parseCatalogue, planCatalogueImport, type ExistingItem } from '@/lib/catalogue-import'
import { applyCataloguePlan, defaultRevenueLineFor } from '@/lib/catalogue-import-runner'

export interface SourceRow {
  id: string
  client_id: string
  business_unit_id: string
  default_plan_line_id: string
  url: string
  auth_header: string | null
}

export interface PullOutcome {
  client_id: string
  business_unit_id: string
  status: string
  detail: string
  created?: number
  updated?: number
  switched_off?: number
}

/** Reads one business's price list and files what came back. */
export async function pullOneSource(supabase: any, source: SourceRow): Promise<PullOutcome> {
  const base = { client_id: source.client_id, business_unit_id: source.business_unit_id }

  const got = await fetchCatalogue(source.url, source.auth_header)
  if (!got.ok) return { ...base, status: got.status, detail: got.detail }

  const parsed = parseCatalogue(got.payload)
  if (parsed.items.length === 0) {
    return { ...base, status: 'no_items', detail: 'Their system answered, but no products were found in what it sent.' }
  }

  // The line recorded on the source is used when it is still a real active
  // revenue line, and the unit's first one otherwise, so a line deleted in the
  // workspace makes the read fall back rather than fail.
  const fallback = await defaultRevenueLineFor(supabase, source.client_id, source.business_unit_id)
  const planLineId = source.default_plan_line_id || fallback
  if (!planLineId) {
    return { ...base, status: 'no_revenue_line', detail: 'This business unit has no active revenue line for products to roll up into.' }
  }

  const { data: existingRows } = await supabase
    .from('field_catalogue')
    .select('id, external_id, name, price, plan_line_id, active, needs_price')
    .eq('client_id', source.client_id)
    .eq('business_unit_id', source.business_unit_id)

  const plan = planCatalogueImport(
    parsed.items,
    (existingRows || []) as ExistingItem[],
    planLineId,
    'pull',
    new Date().toISOString(),
  )

  const applied = await applyCataloguePlan(supabase, source.client_id, source.business_unit_id, plan)
  if (applied.error) {
    return { ...base, status: 'write_failed', detail: 'Their price list was read, but it could not be stored. Nothing was changed.' }
  }

  return {
    ...base,
    status: 'ok',
    detail: `Read ${parsed.items.length} products. ${plan.create.length} new, ${plan.update.length} changed, ${plan.deactivate.length} no longer sold.`,
    created: plan.create.length,
    updated: plan.update.length,
    switched_off: plan.deactivate.length,
  }
}


export async function recordPullOutcome(supabase: any, id: string, outcome: PullOutcome) {
  await supabase.from('catalogue_sources').update({
    last_run_at: new Date().toISOString(),
    last_status: outcome.status,
    last_detail: outcome.detail,
  }).eq('id', id)
}
