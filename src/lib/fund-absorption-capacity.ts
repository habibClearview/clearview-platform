// Fund Absorption Capacity (§FAC). Answers, per capital type, how much
// a specific business can absorb and deploy without creating financial
// distress -- a sizing tool, not a creditworthiness score. Computed
// independently for five capital types, each with its own constraint:
// credit (cash position at the seasonal trough), grant (operational
// capacity to deploy funds), equity (stability/scale of projected profit),
// consignment stock (input shop margin and sales velocity), and
// recoverable grant (a blend of credit and grant, weighted by the
// repayable fraction).
//
// §SCP (seasonal-cash-projection.ts) must be computed first -- its 4-week
// delayed-repayment stress scenario is a direct input to credit capacity.
//
// Two corrections made relative to the first written version of this
// spec, both kept small and documented rather than silently applied:
//
// 1. repaymentMonths is floored at 1 month. The spec's own formula
//    (min(12, cashConversionGap_months * 2)) can reach zero or go
//    negative for a supplier-financed business (cashConversionGap <= 0),
//    which would divide by zero. The consignment formula elsewhere in
//    this same spec already applies exactly this floor
//    (max(1, cashConversionGap/30)) for the same reason -- this makes the
//    credit formula consistent with that established pattern.
//
// 2. recoverableGrantCapacity is null when creditCapacity is null (i.e.
//    §SCP data is insufficient), rather than silently treating the
//    missing credit figure as zero in the blend. A real "no debt
//    capacity, business is in stress" 0 and a genuine "we don't know yet"
//    null both come out of creditCapacity as different states -- only the
//    first should feed the blend as zero. Substituting 0 for "unknown"
//    would understate the blended figure without saying so.

import type { DataConfidence } from './seasonal-cash-projection'

export interface FACInputs {
  // From §SCP
  stressClose_4wk: number[]        // 12 entries, offsets 1..12 -- [] if scpDataConfidence is 'insufficient'
  scpDataConfidence: DataConfidence
  // Debt terms (§17) -- falls back to a generalist assumption if no debt is configured
  existingAnnualRate?: number       // settings.debts[0].annualRate; default 0.15 if absent
  // Trade credit (§18)
  cashConversionGapDays: number     // tradeCredit.cashConversionGap
  // Whole-business annual metrics
  annualRevenue: number
  annualGrossProfit: number
  annualEbitda: number
  annualNpat: number
  // Capacity dimension inputs (mirrors LRS's own qualitative treatment)
  productionCapacityScore: number   // 0-100 -- qualitative(assess.productionCapacity)
  governanceScore: number           // 0-5 raw -- assess.governance
  revTrend: 'Growing' | 'Stable' | 'Declining'
  // Pre-resolved by the caller: which unit (if any) is the input-shop /
  // consignment-eligible unit. Deliberately not resolved inside this pure
  // module -- classifying "which business unit is an input shop" is a
  // domain judgement (name/type matching against the client's own units),
  // not a calculation.
  inputShopUnit: { annualRevenue: number; annualGrossProfit: number } | null
  recordsCompletenessPct: number    // 0-100 -- monthsClosed / monthsElapsed
  repayableFraction?: number        // 0-1; defaults to 0.5 if not configured
}

export interface FACTypeResult {
  capacity: number | null
  low: number | null
  high: number | null
  reason: string | null
  conditions: string[]
}

export interface FACResult {
  credit: FACTypeResult
  grant: FACTypeResult
  equity: FACTypeResult
  consignment: FACTypeResult
  recoverableGrant: FACTypeResult
  dataConfidence: DataConfidence
  repayableFractionUsed: number
  repayableFractionWasDefaulted: boolean
}

const DEFAULT_ANNUAL_RATE = 0.15
const DEFAULT_REPAYABLE_FRACTION = 0.5
const EQUITY_TARGET_RETURN = 0.15
const GRANT_BASE_PCT_OF_REVENUE = 0.25
const GRANT_RECORDS_COMPLETENESS_THRESHOLD = 70

function noneType(reason: string, conditions: string[] = []): FACTypeResult {
  return { capacity: null, low: null, high: null, reason, conditions }
}
function zeroType(reason: string, conditions: string[] = []): FACTypeResult {
  return { capacity: 0, low: 0, high: 0, reason, conditions }
}

function computeCreditCapacity(i: FACInputs): FACTypeResult {
  if (i.scpDataConfidence === 'insufficient' || i.stressClose_4wk.length === 0) {
    return noneType('Add 3+ months of actuals to unlock — seasonal cash projection is not yet reliable enough to size credit capacity.')
  }
  const currentFloor = Math.min(...i.stressClose_4wk)
  if (currentFloor < 0) {
    return zeroType('Existing cash stress — resolve before taking on credit.')
  }

  const annualRate = i.existingAnnualRate ?? DEFAULT_ANNUAL_RATE
  const cashConversionGapMonths = i.cashConversionGapDays / 30
  const repaymentMonths = Math.max(1, Math.min(12, cashConversionGapMonths * 2))
  const monthlyRevenue = i.annualRevenue / 12
  const maxP = 10 * monthlyRevenue
  const STEPS = 50

  let creditCapacity = 0
  for (let s = 0; s <= STEPS; s++) {
    const P = (maxP * s) / STEPS
    const monthlyRepayment = P / repaymentMonths
    const additionalInterest = P * (annualRate / 12)
    const minProjectedClose = Math.min(...i.stressClose_4wk.map(v => v - monthlyRepayment - additionalInterest))
    if (minProjectedClose >= 0) creditCapacity = P
  }

  const confidenceDiscount = i.scpDataConfidence === 'reliable' ? 1.0 : 0.7
  const creditCapacityFinal = creditCapacity * confidenceDiscount

  return {
    capacity: creditCapacityFinal,
    low: creditCapacityFinal * 0.80,
    high: creditCapacityFinal * 1.20,
    reason: null,
    conditions: [],
  }
}

function computeGrantCapacity(i: FACInputs): FACTypeResult {
  const ebitdaMargin = i.annualRevenue > 0 ? i.annualEbitda / i.annualRevenue : 0
  if (ebitdaMargin < 0) {
    return zeroType('Business not yet profitable — grant would fund losses, not growth.')
  }
  if (i.governanceScore < 2) {
    return zeroType('Governance score too low — grant funds require minimum governance structures.')
  }
  const baseCapacity = i.annualRevenue * GRANT_BASE_PCT_OF_REVENUE
  const staffMultiplier = i.productionCapacityScore / 100
  const grantCapacity = baseCapacity * staffMultiplier

  const conditions: string[] = []
  if (i.recordsCompletenessPct < GRANT_RECORDS_COMPLETENESS_THRESHOLD) {
    conditions.push(`Records completeness must reach 70% before grant disbursement (currently ${Math.round(i.recordsCompletenessPct)}%).`)
  } else {
    conditions.push('Records completeness must reach 70% before grant disbursement — met.')
  }
  conditions.push('At least one qualified unit manager must be in place.')

  return {
    capacity: grantCapacity,
    low: grantCapacity * 0.70,
    high: grantCapacity * 1.30,
    reason: null,
    conditions,
  }
}

function computeEquityCapacity(i: FACInputs): FACTypeResult {
  if (i.annualNpat <= 0) {
    return zeroType('Business not yet profitable — equity investors require a return pathway.')
  }
  let equityCapacity = i.annualNpat / EQUITY_TARGET_RETURN
  let reason: string | null = null
  if (i.revTrend === 'Declining') {
    equityCapacity *= 0.6
    reason = 'Declining revenue — capacity discounted for trend risk.'
  }
  return {
    capacity: equityCapacity,
    low: equityCapacity * 0.70,
    high: equityCapacity * 1.30,
    reason,
    conditions: [],
  }
}

function computeConsignmentCapacity(i: FACInputs): FACTypeResult {
  if (!i.inputShopUnit) {
    return noneType('No input shop unit identified — consignment capacity cannot be computed.')
  }
  const { annualRevenue: shopRev, annualGrossProfit: shopGp } = i.inputShopUnit
  const inputShopMargin = shopRev > 0 ? shopGp / shopRev : 0
  if (inputShopMargin < 0) {
    return zeroType(
      'Input shop margin is negative — repricing required before consignment capacity can be estimated.',
      ['Restructure input shop pricing to achieve positive gross margin.'],
    )
  }
  const monthlyStockTurnover = shopRev / 12
  const ccgMonths = Math.max(1, i.cashConversionGapDays / 30)
  const consignmentCapacity = monthlyStockTurnover * ccgMonths
  return {
    capacity: consignmentCapacity,
    low: consignmentCapacity * 0.75,
    high: consignmentCapacity * 1.25,
    reason: null,
    conditions: [],
  }
}

function computeRecoverableGrantCapacity(grant: FACTypeResult, credit: FACTypeResult, repayableFraction: number): FACTypeResult {
  if (credit.capacity === null) {
    return noneType('Credit capacity is not yet computable — recoverable grant capacity depends on it.')
  }
  const grantAmount = grant.capacity ?? 0
  const capacity = grantAmount * (1 - repayableFraction) + credit.capacity * repayableFraction
  return {
    capacity,
    low: capacity * 0.75,
    high: capacity * 1.25,
    reason: null,
    conditions: [],
  }
}

export function computeFundAbsorptionCapacity(inputs: FACInputs): FACResult {
  const repayableFractionWasDefaulted = inputs.repayableFraction === undefined
  const repayableFractionUsed = inputs.repayableFraction ?? DEFAULT_REPAYABLE_FRACTION

  const credit = computeCreditCapacity(inputs)
  const grant = computeGrantCapacity(inputs)
  const equity = computeEquityCapacity(inputs)
  const consignment = computeConsignmentCapacity(inputs)
  const recoverableGrant = computeRecoverableGrantCapacity(grant, credit, repayableFractionUsed)

  return {
    credit, grant, equity, consignment, recoverableGrant,
    dataConfidence: inputs.scpDataConfidence,
    repayableFractionUsed,
    repayableFractionWasDefaulted,
  }
}
