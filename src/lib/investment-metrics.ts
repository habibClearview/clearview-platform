// Investment metrics: NPV, IRR, and customer/growth-driver aggregation --
// the kind of analysis an investor or lender actually looks for beyond
// the P&L/BS/CF themselves. Deliberately a separate module from
// scoring-engine.ts, which produces the 0-100/0-20/0-30 composite
// scores (Credit Risk/Going Concern/Investment Readiness) -- these are
// raw financial metrics an analyst would compute directly, not scores.

// ── Converting between annual and monthly rates ──────────────
// computeNPV/computeIRR operate on whatever periodicity the cash flow
// series actually uses -- one entry per period, discounted by (1+r)^t.
// The cash flows this module builds (buildInvestmentCashFlows, from
// the engine's monthly op_cash/inv_cash arrays) are MONTHLY, so the
// rate fed into computeNPV must be the MONTHLY-equivalent rate, not
// the raw annual discount rate a user actually thinks in terms of --
// otherwise a 15% "annual" rate would compound to roughly (1.15)^12,
// over 400% annually, massively over-discounting later months.
// Likewise, computeIRR run on monthly cash flows returns a MONTHLY
// rate, which must be annualized before it's compared against an
// annual hurdle rate or shown to a user as an annual return.
export function annualRateToMonthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1
}
export function monthlyRateToAnnualRate(monthlyRate: number): number {
  return Math.pow(1 + monthlyRate, 12) - 1
}

// ── Net Present Value ────────────────────────────────────────
// Standard NPV formula: NPV = sum over t of CF[t] / (1+r)^t, where
// CF[0] is conventionally the initial investment (negative -- money
// going OUT to fund the business) and CF[1..n] are the subsequent
// returns (positive when the business generates more cash than it
// consumes). No judgment call in the formula itself; the judgment call
// is what belongs in the cash flow series, which buildInvestmentCashFlows
// below handles.
export function computeNPV(cashFlows: number[], discountRate: number): number {
  return cashFlows.reduce((npv, cf, t) => npv + cf / Math.pow(1 + discountRate, t), 0)
}

// ── Internal Rate of Return ──────────────────────────────────
// The discount rate at which NPV = 0. No closed-form solution exists
// for an arbitrary cash flow series, so this solves numerically via
// Newton-Raphson (fast, but can fail to converge or overshoot for some
// cash flow shapes), falling back to bisection (slower, but guaranteed
// to converge once a sign change is bracketed) if Newton-Raphson
// doesn't settle within tolerance.
//
// Returns null -- never a wrong or misleading number -- when:
//   - the cash flow series has no sign change at all (all cash flows
//     the same sign has no real IRR: e.g. an initial investment with
//     no returns ever, or returns with no investment), or
//   - neither method converges within the iteration budget.
export function computeIRR(cashFlows: number[], maxIterations = 100, tolerance = 1e-7): number | null {
  const hasPositive = cashFlows.some(cf => cf > 0)
  const hasNegative = cashFlows.some(cf => cf < 0)
  if (!hasPositive || !hasNegative) return null

  const npvAt = (r: number) => computeNPV(cashFlows, r)
  const derivativeAt = (r: number) => cashFlows.reduce((d, cf, t) => t === 0 ? d : d - t * cf / Math.pow(1 + r, t + 1), 0)

  // Newton-Raphson first
  let rate = 0.1
  for (let i = 0; i < maxIterations; i++) {
    const npv = npvAt(rate)
    if (Math.abs(npv) < tolerance) return rate
    const deriv = derivativeAt(rate)
    if (deriv === 0) break // avoid dividing by zero; fall through to bisection
    const nextRate = rate - npv / deriv
    if (!Number.isFinite(nextRate) || nextRate <= -1) break // outside the domain (1+r must stay positive); fall through
    rate = nextRate
  }
  if (Math.abs(npvAt(rate)) < tolerance) return rate

  // Bisection fallback: needs a bracketed sign change in NPV(r) across
  // a search range. Search widely (-99% to +1000%) since Newton-Raphson
  // struggling usually means the root is far from the 10% starting guess.
  let lo = -0.99, hi = 10
  let npvLo = npvAt(lo), npvHi = npvAt(hi)
  if (npvLo === 0) return lo
  if (npvHi === 0) return hi
  if ((npvLo > 0) === (npvHi > 0)) return null // no sign change in the bracket; no real IRR found
  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2
    const npvMid = npvAt(mid)
    if (Math.abs(npvMid) < tolerance) return mid
    if ((npvMid > 0) === (npvLo > 0)) { lo = mid; npvLo = npvMid } else { hi = mid }
  }
  return (lo + hi) / 2
}

// ── Building the investment cash flow series from the model ─────
// CF[0] is the capital an investor/funder actually put AT RISK for a
// RETURN -- shareholder contributions and recoverable (repayable) grants.
// Non-repayable grants are deliberately excluded: a grantor isn't
// expecting NPV/IRR on their money the way an equity investor or a
// recoverable-grant funder is, so including it would understate the
// investment's real return profile. Bank loan principal is also
// excluded here -- debt already has its own return (interest, captured
// in Credit Risk/DSCR), it isn't capital at risk for equity-style return
// the way NPV/IRR are conventionally used to assess.
//
// CF[1..n] is Free Cash Flow each period -- Operating Cash Flow minus
// what's spent on Fixed Assets (inv_cash is already a negative/outflow
// figure) -- the standard "cash flow to the firm" measure used in
// investment appraisal, representing cash genuinely available to
// return to investors, not just accounting profit.
export function buildInvestmentCashFlows(capitalAtRisk: number, opCash: number[], invCash: number[]): number[] {
  const freeCashFlow = opCash.map((oc, i) => oc + (invCash[i] ?? 0))
  return [-Math.abs(capitalAtRisk), ...freeCashFlow]
}

// ── Customer / growth-driver aggregation ─────────────────────
// Aggregates customers acquired and blended CAC across ALL marketing
// events recorded (management_events), not just the per-channel
// breakdown already shown in Clearview Intelligence's Marketing Events
// section -- this is the whole-business figure an investor would want:
// how many customers has this business actually acquired, and at what
// blended cost, growing the CUSTOMER BASE (not just revenue) over time.
export interface CustomerGrowthSummary {
  totalCustomersAcquired: number
  totalAcquisitionCost: number
  blendedCAC: number | null // null when zero customers acquired -- division by zero has no meaningful answer
  totalRevenueLift: number
}
export function computeCustomerGrowthSummary(events: {cost?: number; customers_acquired?: number; revenue_before?: number; revenue_after?: number}[]): CustomerGrowthSummary {
  let totalCustomersAcquired = 0, totalAcquisitionCost = 0, totalRevenueLift = 0
  for (const evt of events) {
    totalCustomersAcquired += evt.customers_acquired ?? 0
    totalAcquisitionCost += evt.cost ?? 0
    totalRevenueLift += Math.max(0, (evt.revenue_after ?? 0) - (evt.revenue_before ?? 0))
  }
  return {
    totalCustomersAcquired,
    totalAcquisitionCost,
    blendedCAC: totalCustomersAcquired > 0 ? totalAcquisitionCost / totalCustomersAcquired : null,
    totalRevenueLift,
  }
}
