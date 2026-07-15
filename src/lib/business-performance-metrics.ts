// ============================================================
// BUSINESS PERFORMANCE METRICS
// Pure, dependency-free calculations for the enterprise
// "Performance & Growth" page and the Market Intelligence
// roll-up. Every function is a plain number-in / number-out
// calculation so it can be unit-tested exactly and reused on
// the enterprise dashboard, the coach dashboard, and the
// portfolio intelligence layer without pulling in the engine.
//
// Design rules:
//  - Any ratio whose denominator is zero/absent returns null,
//    never NaN or Infinity — callers render null as "—".
//  - Percentages are returned as whole numbers (e.g. 22 for 22%),
//    matching how they are displayed.
//  - Amounts (CAC, CLV, MRR) stay in the caller's currency and
//    are NEVER mixed across currencies by anything here.
//
// Two clusters:
//  - "Free" metrics derive from the financial model we already
//    run (margins, growth, Rule of 40, burn).
//  - "Customer" metrics (CAC, CLV, churn, NRR ...) need a small
//    per-period input the enterprise supplies; until then their
//    inputs are absent and the functions return null.
// ============================================================

/** Safe division: returns null when the denominator is 0 or either input is not finite. */
function safeDiv(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null
  return numerator / denominator
}

/** Round to `dp` decimal places (default 1). Keeps display tidy without floating dust. */
export function round(value: number, dp = 1): number {
  const f = Math.pow(10, dp)
  return Math.round(value * f) / f
}

// ── Free cluster: derives from the financial model ───────────

/** Gross margin as a whole-number percentage. (revenue − cost of goods) ÷ revenue. */
export function grossMarginPct(grossProfit: number, revenue: number): number | null {
  const r = safeDiv(grossProfit, revenue)
  return r === null ? null : round(r * 100)
}

/** EBITDA margin as a whole-number percentage. EBITDA ÷ revenue. */
export function ebitdaMarginPct(ebitda: number, revenue: number): number | null {
  const r = safeDiv(ebitda, revenue)
  return r === null ? null : round(r * 100)
}

/** Operating (EBIT) margin as a whole-number percentage. (EBITDA − depreciation) ÷ revenue. */
export function operatingMarginPct(ebitda: number, depreciation: number, revenue: number): number | null {
  const r = safeDiv(ebitda - depreciation, revenue)
  return r === null ? null : round(r * 100)
}

/** Net margin as a whole-number percentage. Net profit after tax ÷ revenue. */
export function netMarginPct(netProfitAfterTax: number, revenue: number): number | null {
  const r = safeDiv(netProfitAfterTax, revenue)
  return r === null ? null : round(r * 100)
}

/**
 * Year-on-year revenue growth as a whole-number percentage, taken from a
 * monthly revenue series: (year-2 total − year-1 total) ÷ year-1 total.
 * Returns null if there isn't a full second year, or year-1 revenue is 0.
 */
export function revenueGrowthPctFromSeries(monthlyRevenue: number[], monthsPerYear = 12): number | null {
  if (!Array.isArray(monthlyRevenue) || monthlyRevenue.length < monthsPerYear * 2) return null
  const y1 = monthlyRevenue.slice(0, monthsPerYear).reduce((a, b) => a + (b || 0), 0)
  const y2 = monthlyRevenue.slice(monthsPerYear, monthsPerYear * 2).reduce((a, b) => a + (b || 0), 0)
  const r = safeDiv(y2 - y1, y1)
  return r === null ? null : round(r * 100)
}

/** Simple period-over-period growth %, when you already have two totals. */
export function revenueGrowthPct(previousRevenue: number, currentRevenue: number): number | null {
  const r = safeDiv(currentRevenue - previousRevenue, previousRevenue)
  return r === null ? null : round(r * 100)
}

/**
 * Rule of 40: revenue-growth% + profit-margin%. A combined efficiency score;
 * 40 and over is considered strong. Both inputs are whole-number percentages.
 * Returns null if either input is missing (null), so a business without a
 * second year of revenue doesn't get a misleading score.
 */
export function ruleOf40(revenueGrowthPercent: number | null, profitMarginPercent: number | null): number | null {
  if (revenueGrowthPercent === null || profitMarginPercent === null) return null
  if (!Number.isFinite(revenueGrowthPercent) || !Number.isFinite(profitMarginPercent)) return null
  return round(revenueGrowthPercent + profitMarginPercent)
}

/** True when a Rule-of-40 score clears the "strong" threshold of 40. */
export function isRuleOf40Strong(score: number | null): boolean {
  return score !== null && score >= 40
}

/**
 * Burn multiple: net cash burned ÷ net new revenue in the same period.
 * Lower is more efficient; under 1× is good. Returns null if the business
 * is cash-generative (no burn) or added no new revenue — the metric only
 * has meaning for a business that is burning cash to grow.
 */
export function burnMultiple(netCashBurned: number, netNewRevenue: number): number | null {
  if (!Number.isFinite(netCashBurned) || netCashBurned <= 0) return null
  const r = safeDiv(netCashBurned, netNewRevenue)
  if (r === null || r < 0) return null
  return round(r, 2)
}

/** Return on investment as a whole-number percentage. Net profit ÷ capital invested. */
export function roiPct(netProfit: number, capitalInvested: number): number | null {
  const r = safeDiv(netProfit, capitalInvested)
  return r === null ? null : round(r * 100)
}

// ── Customer cluster: needs the per-period customer input ────

/** Customer acquisition cost: sales & marketing spend ÷ new customers won. In currency. */
export function cac(salesAndMarketingSpend: number, newCustomers: number): number | null {
  const r = safeDiv(salesAndMarketingSpend, newCustomers)
  return r === null ? null : round(r, 2)
}

/** Customer lifetime value: avg purchase × purchases per year × avg lifespan (years). In currency. */
export function clv(avgPurchaseValue: number, purchasesPerYear: number, avgLifespanYears: number): number | null {
  if (![avgPurchaseValue, purchasesPerYear, avgLifespanYears].every(Number.isFinite)) return null
  return round(avgPurchaseValue * purchasesPerYear * avgLifespanYears, 2)
}

/** LTV:CAC ratio. Lifetime value ÷ acquisition cost. Healthy above 3×. */
export function ltvToCac(lifetimeValue: number, acquisitionCost: number): number | null {
  const r = safeDiv(lifetimeValue, acquisitionCost)
  return r === null ? null : round(r, 1)
}

/** CAC payback in months: CAC ÷ monthly gross profit per customer. Lower is better. */
export function cacPaybackMonths(acquisitionCost: number, monthlyGrossProfitPerCustomer: number): number | null {
  const r = safeDiv(acquisitionCost, monthlyGrossProfitPerCustomer)
  if (r === null || r < 0) return null
  return round(r, 1)
}

/** Churn as a whole-number percentage: customers lost ÷ customers at the start of the period. */
export function churnRatePct(customersLost: number, customersAtStart: number): number | null {
  const r = safeDiv(customersLost, customersAtStart)
  if (r === null || r < 0) return null
  return round(r * 100)
}

/**
 * Net revenue retention as a whole-number percentage: this period's revenue from
 * customers who existed at the start ÷ their revenue last period. Over 100% means
 * the existing base is growing without any new customers.
 */
export function netRevenueRetentionPct(startRevenueFromExisting: number, endRevenueFromExisting: number): number | null {
  const r = safeDiv(endRevenueFromExisting, startRevenueFromExisting)
  return r === null ? null : round(r * 100)
}

/** Monthly recurring revenue: active subscribers × average revenue per user. In currency. */
export function mrr(activeSubscribers: number, avgRevenuePerUser: number): number | null {
  if (![activeSubscribers, avgRevenuePerUser].every(Number.isFinite)) return null
  return round(activeSubscribers * avgRevenuePerUser, 2)
}

/** Annual recurring revenue: MRR × 12. In currency. */
export function arr(monthlyRecurringRevenue: number): number | null {
  if (!Number.isFinite(monthlyRecurringRevenue)) return null
  return round(monthlyRecurringRevenue * 12, 2)
}

// ── Assembled free-cluster snapshot from an engine result ────

export interface EngineMetricsLike {
  total_revenue: number
  total_gp: number
  total_ebitda: number
  total_npat: number
}

export interface FreePerformance {
  revenueGrowthPct: number | null
  grossMarginPct: number | null
  ebitdaMarginPct: number | null
  netMarginPct: number | null
  ruleOf40: number | null
  ruleOf40Strong: boolean
  burnMultiple: number | null
  revenue: number
}

/**
 * Assemble the "free" performance cluster from the parts of an engine run we
 * already compute: the yearly metrics block plus the monthly revenue series
 * (for growth) and the monthly cash-close series (for burn). Everything that
 * can't be computed from the inputs comes back as null — never guessed.
 */
export function computeFreePerformance(args: {
  metrics: EngineMetricsLike
  monthlyRevenue: number[]
  monthlyCashClose?: number[]
  monthsPerYear?: number
}): FreePerformance {
  const { metrics, monthlyRevenue, monthlyCashClose, monthsPerYear = 12 } = args
  const rev = metrics.total_revenue || 0
  const growth = revenueGrowthPctFromSeries(monthlyRevenue, monthsPerYear)
  const ebitdaM = ebitdaMarginPct(metrics.total_ebitda, rev)
  const r40 = ruleOf40(growth, ebitdaM)

  // Burn: only meaningful if the cash balance fell over the first year and
  // revenue grew. Net cash burned = opening − lowest close within the year.
  let burn: number | null = null
  if (Array.isArray(monthlyCashClose) && monthlyCashClose.length >= monthsPerYear && growth !== null) {
    const opening = monthlyCashClose[0] || 0
    const trough = Math.min(...monthlyCashClose.slice(0, monthsPerYear))
    const burned = opening - trough
    const y1 = monthlyRevenue.slice(0, monthsPerYear).reduce((a, b) => a + (b || 0), 0)
    const y2 = monthlyRevenue.slice(monthsPerYear, monthsPerYear * 2).reduce((a, b) => a + (b || 0), 0)
    burn = burnMultiple(burned, y2 - y1)
  }

  return {
    revenueGrowthPct: growth,
    grossMarginPct: grossMarginPct(metrics.total_gp, rev),
    ebitdaMarginPct: ebitdaM,
    netMarginPct: netMarginPct(metrics.total_npat, rev),
    ruleOf40: r40,
    ruleOf40Strong: isRuleOf40Strong(r40),
    burnMultiple: burn,
    revenue: rev,
  }
}
