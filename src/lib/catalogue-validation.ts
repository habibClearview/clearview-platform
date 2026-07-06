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
