// Shared logic for combining manually-entered and field-app-derived
// actuals. Per docs/ACCOUNTING_ARCHITECTURE.md section 4: generic_actuals
// keeps these in separate columns (line_values = manual, field_line_values
// = written exclusively by aggregate_field_transactions()) so neither
// writer can ever overwrite the other. They're summed together only here,
// at read time.
//
// Extracted into its own module (rather than defined inline in
// GenericDashboard.tsx) so tests exercise the exact function the
// dashboard uses, not a separate copy that can silently drift out of sync.

export interface ActualsPlanLine {
  id: string
  category: string
}

export function combinedActual(
  lineId: string,
  lineValues: Record<string, number>,
  fieldLineValues: Record<string, number>
): number {
  return Number(lineValues[lineId] || 0) + Number(fieldLineValues[lineId] || 0)
}

export interface ActualsTotals {
  totalRev: number
  totalCOGS: number
  totalOtherCosts: number
  totalCost: number
  // True Gross Profit: revenue less cost of sales ONLY -- staff and
  // overheads are real costs but are not part of gross profit. Computing
  // this as revenue minus every non-revenue cost was an actively
  // misleading bug, not a naming nitpick -- see architecture doc.
  grossProfit: number
  netResult: number
}

export function computeActualsTotals(
  lines: ActualsPlanLine[],
  lineValues: Record<string, number>,
  fieldLineValues: Record<string, number>
): ActualsTotals {
  const c = (id: string) => combinedActual(id, lineValues, fieldLineValues)
  const totalRev = lines.filter(l => l.category === 'revenue').reduce((s, l) => s + c(l.id), 0)
  const totalCOGS = lines.filter(l => l.category === 'cost_of_sales').reduce((s, l) => s + c(l.id), 0)
  const totalOtherCosts = lines.filter(l => l.category !== 'revenue' && l.category !== 'cost_of_sales').reduce((s, l) => s + c(l.id), 0)
  const totalCost = totalCOGS + totalOtherCosts
  const grossProfit = totalRev - totalCOGS
  const netResult = totalRev - totalCost
  return { totalRev, totalCOGS, totalOtherCosts, totalCost, grossProfit, netResult }
}

// Used by the Consolidated P&L's Total Operating Costs row. Must derive
// from the HYBRID (actual-or-plan) Gross Profit figure, not raw act_gp
// directly -- if a caller passed act_gp instead of the hybrid row's
// value, a future case where they diverge would silently regress back
// to a planned figure without this being caught. Deriving via
// hybridGrossProfit - actEbitda (both already correctly treat a
// category with zero plan lines anywhere as zero, not "missing") means
// this always reconciles exactly by construction: GP - Operating Costs
// = EBITDA, with no separate category-presence check of its own that
// could drift out of sync with the engine's.
export function deriveActualOperatingCosts(hybridGrossProfit: number, actEbitda: number | null): number | null {
  return actEbitda !== null ? hybridGrossProfit - actEbitda : null
}
