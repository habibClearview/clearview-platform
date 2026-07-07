// Shared catalogue/plan-line validation logic. Extracted out of
// app/api/field/admin/catalogue/route.ts because Next.js App Router
// route files can ONLY export specific named handlers (GET, POST,
// PATCH, etc.) -- any other named export breaks the build ("is not a
// valid Route export field"). Also used by app/api/field/sync/route.ts
// to validate cost-entry plan_line_ids, which needs a category other
// than revenue.

// Checks that a plan_line_id genuinely belongs to a given
// business_unit_id, is active, and matches the expected category.
// Defaults to 'revenue' -- the only kind a catalogue item can roll up
// into -- so the existing catalogue-editing caller is unaffected.
export function isPlanLineValidForUnit(planLines: any[], planLineId: string, unitId: string, expectedCategory: string = 'revenue'): boolean {
  const matchingLine = (planLines || []).find((l: any) => l.id === planLineId)
  return !!matchingLine && !!matchingLine.active && matchingLine.category === expectedCategory && matchingLine.unit_id === unitId
}

// The only categories a manual cost/expense entry (field sync's
// cost-entry path) is legitimately allowed to claim. Restricting this
// before trusting a caller-supplied category as the "expected category"
// passed to isPlanLineValidForUnit above matters: without it, a direct
// API caller (not the actual field app client, which only ever sends
// direct_opex) could submit category: 'revenue' alongside a
// plan_line_id that genuinely IS a revenue line belonging to their own
// unit -- isPlanLineValidForUnit would correctly report that pairing as
// valid FOR THAT CATEGORY, letting a revenue line through the "cost"
// insert path and misclassifying real revenue as an expense.
export function isValidCostCategory(category: string): boolean {
  return category === 'cost_of_sales' || category === 'direct_opex'
}
