// ============================================================
// Applying a catalogue plan to the database.
//
// 20 September 2026. Separated from the planning in catalogue-import.ts so the
// rules stay testable without a database and this file stays small enough to
// read in one go.
// ============================================================
import type { CataloguePlan } from '@/lib/catalogue-import'

/**
 * The revenue line an imported product rolls up into until a coach files it
 * somewhere more specific.
 *
 * Their system has no idea how this business's revenue is broken down, and
 * asking for it per product would put the mapping work straight back. So
 * everything lands on the unit's first active revenue line and a coach moves
 * what needs moving. Once moved, later imports leave it alone.
 */
export async function defaultRevenueLineFor(
  supabase: any,
  clientId: string,
  businessUnitId: string,
): Promise<string | null> {
  const { data: config } = await supabase
    .from('generic_model_config')
    .select('plan_lines')
    .eq('client_id', clientId)
    .maybeSingle()
  const lines: any[] = (config?.plan_lines as any[]) || []
  const match = lines.find(
    (l) => l.active && l.category === 'revenue' && l.unit_id === businessUnitId,
  )
  return match ? match.id : null
}

export async function applyCataloguePlan(
  supabase: any,
  clientId: string,
  businessUnitId: string,
  plan: CataloguePlan,
): Promise<{ error?: string }> {
  if (plan.create.length > 0) {
    const { error } = await supabase.from('field_catalogue').insert(
      plan.create.map((row) => ({ ...row, client_id: clientId, business_unit_id: businessUnitId })),
    )
    if (error) return { error: error.message }
  }

  // Updated one at a time rather than as a batch upsert: each row changes a
  // different set of columns, and a batch upsert in PostgREST uses the union
  // of keys across the whole batch, writing an explicit null into every column
  // a row happened not to mention. That would wipe prices.
  for (const u of plan.update) {
    const { error } = await supabase
      .from('field_catalogue')
      .update(u.changes)
      .eq('id', u.id)
      .eq('client_id', clientId)
    if (error) return { error: error.message }
  }

  if (plan.deactivate.length > 0) {
    const { error } = await supabase
      .from('field_catalogue')
      .update({ active: false })
      .in('id', plan.deactivate)
      .eq('client_id', clientId)
    if (error) return { error: error.message }
  }

  return {}
}
