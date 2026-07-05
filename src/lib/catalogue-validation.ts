// Shared catalogue validation logic. Extracted out of
// app/api/field/admin/catalogue/route.ts because Next.js App Router
// route files can ONLY export specific named handlers (GET, POST,
// PATCH, etc.) -- any other named export breaks the build ("is not a
// valid Route export field").

// Checks that a plan_line_id genuinely belongs to a given
// business_unit_id, is active, and is a revenue-category line (the
// only kind a catalogue item can roll up into).
export function isPlanLineValidForUnit(planLines: any[], planLineId: string, unitId: string): boolean {
  const matchingLine = (planLines || []).find((l: any) => l.id === planLineId)
  return !!matchingLine && !!matchingLine.active && matchingLine.category === 'revenue' && matchingLine.unit_id === unitId
}
