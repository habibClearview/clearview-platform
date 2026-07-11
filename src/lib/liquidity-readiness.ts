// Liquidity Readiness Score (LRS): "the extent to which an enterprise
// has the characteristics required for productive liquidity to flow
// into it." One core 0-100 score across seven weighted dimensions,
// rather than a separate, differently-formulated score for every kind
// of liquidity owner (bank, investor, buyer, programme). A "Fit Score"
// for any specific lens is simply the same seven dimension scores
// re-weighted -- see computeFitScore below.
//
// Roughly half of the 35 underlying indicators are directly computable
// from data the financial engine already produces (growth, margins,
// cash position, debt service, working capital, ROI via NPV/IRR). The
// other half -- TAM, repeat customers, audit trail, licences,
// registration, customer/supplier concentration, business continuity,
// and similar -- aren't derivable from any financial data this platform
// tracks; they're captured directly as qualitative Business Profile
// inputs (CoachAssessment) instead of estimated or defaulted, since
// fabricating a number here would be worse than being honest about
// what's actually known.
//
// Every indicator normalizes to 0-100 before being averaged into its
// dimension; every threshold band below is a reasonable, generalist
// default (documented inline), not a claim of precision -- a coach
// using this for a specific sector or lender relationship should expect
// to sanity-check the bands, not treat them as exact.

import type { CoachAssessment } from './scoring-engine'

export interface LRSInputs {
  annualRevenue: number
  annualEbitda: number
  annualGrossProfit: number
  cashClose: number[]
  monthlyOpex: number[]
  businessBreakeven: number
  totalEquity: number
  totalLiabilities: number
  dscrMin: number | null
  hasDebt: boolean
  cashGaps: number
  tradeCreditDpo: number
  monthsOfActualData: number
  monthsElapsed: number
  monthsClosed: number
  fieldAppMonths: number
  revenueGrowthRate: number
  customersAcquired: number
  irr: number | null
  revenuePerHead: number
  assess: CoachAssessment
}

export interface LRSDimensionScore {
  score: number
  indicators: { label: string; value: number; note: string }[]
}

export interface LRSResult {
  score: number
  dimensions: {
    marketOpportunity: LRSDimensionScore
    visibility: LRSDimensionScore
    trust: LRSDimensionScore
    profitability: LRSDimensionScore
    capacity: LRSDimensionScore
    resilience: LRSDimensionScore
    compliance: LRSDimensionScore
  }
}

export const LRS_WEIGHTS = {
  marketOpportunity: 0.20,
  visibility: 0.15,
  trust: 0.15,
  profitability: 0.15,
  capacity: 0.15,
  resilience: 0.10,
  compliance: 0.10,
} as const

function ramp(value: number, lo: number, hi: number): number {
  if (hi === lo) return value >= hi ? 100 : 0
  const t = (value - lo) / (hi - lo)
  return Math.max(0, Math.min(100, t * 100))
}
function inverseRamp(value: number, lo: number, hi: number): number {
  return 100 - ramp(value, lo, hi)
}
function qualitative(value: number): number {
  return Math.max(0, Math.min(100, (Number(value) || 0) / 5 * 100))
}
function average(values: number[]): number {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

// Shared by computeMarketOpportunity and computeProfitability -- both
// need the same gross-margin-as-percentage-of-revenue ramp, and having
// it in two places risked the threshold drifting apart between them.
function grossMarginScore(annualRevenue: number, annualGrossProfit: number): number {
  return annualRevenue > 0 ? ramp(annualGrossProfit / annualRevenue, 0, 0.40) : 0
}

export function computeMarketOpportunity(i: LRSInputs): LRSDimensionScore {
  const revenueGrowth = ramp(i.revenueGrowthRate, -0.20, 0.30)
  const grossMargin = grossMarginScore(i.annualRevenue, i.annualGrossProfit)
  // commercialModel/marketEvidence: whether there's a clear, well-
  // evidenced commercial opportunity here -- conceptually the same
  // ground a separate "Total Addressable Market" input would cover,
  // so reusing these (already collected for Going Concern/Investment
  // Readiness) rather than inventing a redundant new field.
  const commercialModel = qualitative(i.assess.commercialModel)
  const customerGrowth = i.customersAcquired <= 0 ? 0 : i.customersAcquired <= 5 ? 40 : i.customersAcquired <= 20 ? 70 : 100
  const marketEvidence = qualitative(i.assess.marketEvidence)
  return {
    score: average([revenueGrowth, grossMargin, commercialModel, customerGrowth, marketEvidence]),
    indicators: [
      { label: 'Revenue Growth', value: revenueGrowth, note: `${(i.revenueGrowthRate*100).toFixed(1)}% vs prior period` },
      { label: 'Gross Margin', value: grossMargin, note: i.annualRevenue > 0 ? `${((i.annualGrossProfit/i.annualRevenue)*100).toFixed(1)}%` : 'No revenue yet' },
      { label: 'Commercial Model Clarity', value: commercialModel, note: 'Business Profile input' },
      { label: 'Customer Growth', value: customerGrowth, note: `${i.customersAcquired} customers acquired (tracked events)` },
      { label: 'Market Evidence', value: marketEvidence, note: 'Business Profile input' },
    ],
  }
}

export function computeVisibility(i: LRSInputs): LRSDimensionScore {
  const digitallyCaptured = i.monthsOfActualData > 0 ? ramp(i.fieldAppMonths / i.monthsOfActualData, 0, 1) : 0
  const statementsComplete = i.monthsElapsed > 0 ? ramp(i.monthsOfActualData / i.monthsElapsed, 0, 1) : 0
  const recordsComplete = i.monthsElapsed > 0 ? ramp(i.monthsClosed / i.monthsElapsed, 0, 1) : 0
  const kpiReporting = qualitative(i.assess.kpiReporting)
  const historicalData = ramp(i.monthsOfActualData, 0, 12)
  return {
    score: average([digitallyCaptured, statementsComplete, recordsComplete, kpiReporting, historicalData]),
    indicators: [
      { label: 'Transactions Digitally Captured', value: digitallyCaptured, note: `${i.fieldAppMonths} of ${i.monthsOfActualData} actual months via Clearview Field` },
      { label: 'Financial Statements Complete', value: statementsComplete, note: `${i.monthsOfActualData} of ${i.monthsElapsed} elapsed months have actuals` },
      { label: 'Business Records Complete', value: recordsComplete, note: `${i.monthsClosed} of ${i.monthsElapsed} elapsed months formally closed` },
      { label: 'KPI Reporting', value: kpiReporting, note: 'Business Profile input' },
      { label: 'Historical Data Depth', value: historicalData, note: `${i.monthsOfActualData} months of actuals` },
    ],
  }
}

export function computeTrust(i: LRSInputs): LRSDimensionScore {
  const paymentBehaviour = i.tradeCreditDpo <= 0 ? 50 : inverseRamp(i.tradeCreditDpo, 30, 90)
  const supplierRelationships = qualitative(i.assess.supplierRelationships)
  const auditTrail = qualitative(i.assess.auditTrail)
  const governance = qualitative(i.assess.governance)
  const dataConsistency = i.cashGaps === 0 ? 100 : i.cashGaps <= 2 ? 60 : 20
  return {
    score: average([paymentBehaviour, supplierRelationships, auditTrail, governance, dataConsistency]),
    indicators: [
      { label: 'Payment Behaviour', value: paymentBehaviour, note: i.tradeCreditDpo > 0 ? `DPO ${i.tradeCreditDpo.toFixed(0)} days` : 'No trade credit data' },
      { label: 'Supplier Relationships', value: supplierRelationships, note: 'Business Profile input' },
      { label: 'Audit Trail', value: auditTrail, note: 'Business Profile input' },
      { label: 'Governance', value: governance, note: 'Business Profile input' },
      { label: 'Data Consistency', value: dataConsistency, note: `${i.cashGaps} cash-negative month(s)` },
    ],
  }
}

export function computeProfitability(i: LRSInputs): LRSDimensionScore {
  const netMargin = i.annualRevenue > 0 ? ramp(i.annualEbitda / i.annualRevenue, 0, 0.30) : 0
  const cashFlow = i.cashGaps === 0 && (i.cashClose[i.cashClose.length-1] ?? 0) >= 0 ? 100 : i.cashGaps <= 2 ? 50 : 10
  const roi = i.irr === null ? 50 : ramp(i.irr, 0, 0.40)
  const grossMargin = grossMarginScore(i.annualRevenue, i.annualGrossProfit)
  const breakeven = i.businessBreakeven > 0 ? ramp(i.annualRevenue / i.businessBreakeven, 0, 1.2) : (i.annualRevenue > 0 ? 100 : 0)
  return {
    score: average([netMargin, cashFlow, roi, grossMargin, breakeven]),
    indicators: [
      { label: 'Net Margin (EBITDA)', value: netMargin, note: i.annualRevenue > 0 ? `${((i.annualEbitda/i.annualRevenue)*100).toFixed(1)}%` : 'No revenue yet' },
      { label: 'Cash Flow', value: cashFlow, note: `${i.cashGaps} cash-negative month(s)` },
      { label: 'ROI (IRR)', value: roi, note: i.irr !== null ? `${(i.irr*100).toFixed(1)}% annualised` : 'Not computable' },
      { label: 'Gross Margin', value: grossMargin, note: i.annualRevenue > 0 ? `${((i.annualGrossProfit/i.annualRevenue)*100).toFixed(1)}%` : 'No revenue yet' },
      { label: 'Break-Even Position', value: breakeven, note: i.businessBreakeven > 0 ? `${((i.annualRevenue/i.businessBreakeven)*100).toFixed(0)}% of break-even revenue` : 'Break-even not computable' },
    ],
  }
}

export function computeCapacity(i: LRSInputs): LRSDimensionScore {
  const productionCapacity = qualitative(i.assess.productionCapacity)
  const managementSystems = qualitative(i.assess.managementCapability)
  const staffCapability = i.revenuePerHead > 0 ? ramp(i.revenuePerHead, 0, 20_000_000) : 0
  // The actual, discrete latest month's opex -- not an average across
  // the period. "Months of runway at the current rate of spend" is
  // meant to reflect what's really happening now, not a smoothed
  // estimate across months that may have looked very different.
  const latestMonthlyOpex = i.monthlyOpex[i.monthlyOpex.length-1] ?? 0
  const currentCash = i.cashClose[i.cashClose.length-1] ?? 0
  const workingCapital = latestMonthlyOpex > 0 ? ramp(currentCash / latestMonthlyOpex, 0, 3) : (currentCash > 0 ? 100 : 0)
  const inventoryAvailability = qualitative(i.assess.inventoryAvailability)
  return {
    score: average([productionCapacity, managementSystems, staffCapability, workingCapital, inventoryAvailability]),
    indicators: [
      { label: 'Production Capacity', value: productionCapacity, note: 'Business Profile input' },
      { label: 'Management Systems', value: managementSystems, note: 'Business Profile input' },
      { label: 'Staff Capability (Revenue/Head)', value: staffCapability, note: i.revenuePerHead > 0 ? `Revenue/head: ${Math.round(i.revenuePerHead).toLocaleString()}` : 'No headcount recorded' },
      { label: 'Working Capital (Cash Runway)', value: workingCapital, note: latestMonthlyOpex > 0 ? `${(currentCash/latestMonthlyOpex).toFixed(1)} months at latest month's opex` : 'Opex not computable' },
      { label: 'Inventory Availability', value: inventoryAvailability, note: 'Business Profile input' },
    ],
  }
}

export function computeResilience(i: LRSInputs): LRSDimensionScore {
  const latestMonthlyOpex = i.monthlyOpex[i.monthlyOpex.length-1] ?? 0
  const currentCash = i.cashClose[i.cashClose.length-1] ?? 0
  const cashReserve = latestMonthlyOpex > 0 ? ramp(currentCash / latestMonthlyOpex, 0, 6) : (currentCash > 0 ? 100 : 0)
  const customerDiversification = qualitative(i.assess.customerDiversification)
  const supplierDiversification = qualitative(i.assess.supplierDiversification)
  const deToEq = i.totalEquity > 0 ? i.totalLiabilities / i.totalEquity : 99
  const leverageScore = inverseRamp(deToEq, 0.5, 2.0)
  // Debt Exposure blends leverage (debt/equity) with actual coverage
  // ability (DSCR) when debt genuinely exists and DSCR is computable --
  // a highly-levered business that comfortably services its debt is a
  // different risk than one with the same leverage barely covering it.
  // With no debt, or debt too new for anything to be due yet (a grace
  // period), DSCR isn't meaningful, so leverage alone is used.
  const dscrScore = i.hasDebt && i.dscrMin !== null ? ramp(i.dscrMin, 0.5, 2.0) : null
  const debtExposure = dscrScore !== null ? (leverageScore + dscrScore) / 2 : leverageScore
  const businessContinuity = qualitative(i.assess.businessContinuity)
  return {
    score: average([cashReserve, customerDiversification, supplierDiversification, debtExposure, businessContinuity]),
    indicators: [
      { label: 'Cash Reserve (Runway)', value: cashReserve, note: latestMonthlyOpex > 0 ? `${(currentCash/latestMonthlyOpex).toFixed(1)} months at latest month's opex` : 'Opex not computable' },
      { label: 'Customer Diversification', value: customerDiversification, note: 'Business Profile input' },
      { label: 'Supplier Diversification', value: supplierDiversification, note: 'Business Profile input' },
      { label: 'Debt Exposure', value: debtExposure, note: i.totalEquity > 0
          ? `Debt/Equity ${deToEq.toFixed(2)}x${dscrScore !== null ? `, DSCR ${i.dscrMin!.toFixed(2)}x` : ''}`
          : 'Equity not available' },
      { label: 'Business Continuity', value: businessContinuity, note: 'Business Profile input' },
    ],
  }
}

export function computeCompliance(i: LRSInputs): LRSDimensionScore {
  const registration = qualitative(i.assess.registrationCompliance)
  const tax = qualitative(i.assess.taxCompliance)
  const licences = qualitative(i.assess.licenceCompliance)
  const financialReporting = i.monthsElapsed > 0 ? ramp(i.monthsClosed / i.monthsElapsed, 0, 1) : 0
  const policies = qualitative(i.assess.governance)
  return {
    score: average([registration, tax, licences, financialReporting, policies]),
    indicators: [
      { label: 'Registration', value: registration, note: 'Business Profile input' },
      { label: 'Tax Compliance', value: tax, note: 'Business Profile input' },
      { label: 'Licences', value: licences, note: 'Business Profile input' },
      { label: 'Financial Reporting', value: financialReporting, note: `${i.monthsClosed} of ${i.monthsElapsed} elapsed months formally closed` },
      { label: 'Policies', value: policies, note: 'Business Profile input (shared with Governance)' },
    ],
  }
}

export function computeLiquidityReadinessScore(i: LRSInputs): LRSResult {
  const dimensions = {
    marketOpportunity: computeMarketOpportunity(i),
    visibility: computeVisibility(i),
    trust: computeTrust(i),
    profitability: computeProfitability(i),
    capacity: computeCapacity(i),
    resilience: computeResilience(i),
    compliance: computeCompliance(i),
  }
  const score =
    dimensions.marketOpportunity.score * LRS_WEIGHTS.marketOpportunity +
    dimensions.visibility.score * LRS_WEIGHTS.visibility +
    dimensions.trust.score * LRS_WEIGHTS.trust +
    dimensions.profitability.score * LRS_WEIGHTS.profitability +
    dimensions.capacity.score * LRS_WEIGHTS.capacity +
    dimensions.resilience.score * LRS_WEIGHTS.resilience +
    dimensions.compliance.score * LRS_WEIGHTS.compliance
  return { score, dimensions }
}

export type FitScoreWeights = Partial<Record<keyof LRSResult['dimensions'], number>>

export function computeFitScore(result: LRSResult, weights: FitScoreWeights): number {
  const entries = Object.entries(weights) as [keyof LRSResult['dimensions'], number][]
  const totalWeight = entries.reduce((s, [, w]) => s + w, 0)
  if (totalWeight <= 0) return 0
  const weightedSum = entries.reduce((s, [dim, w]) => s + result.dimensions[dim].score * w, 0)
  return weightedSum / totalWeight
}

export const FIT_SCORE_PRESETS: Record<string, { label: string; weights: FitScoreWeights }> = {
  bank: { label: 'Bank Fit', weights: { marketOpportunity: 0.15, visibility: 0.20, trust: 0.25, profitability: 0.20, capacity: 0.10, resilience: 0.05, compliance: 0.05 } },
  investor: { label: 'Investor Fit', weights: { marketOpportunity: 0.30, visibility: 0.10, trust: 0.15, profitability: 0.15, capacity: 0.15, resilience: 0.05, compliance: 0.10 } },
}

// ── Time series, for the collapsible year/month presentation ────
// Matches computeScoresTimeSeries in scoring-engine.ts: one LRS score
// per calendar year (using that year's own months), and one per month
// within an expanded year (a trailing-twelve-month window). Qualitative
// Business Profile inputs have no history of their own -- there's only
// ever the current assessment -- so the same current values are used
// for every period, exactly as computeScoresTimeSeries already does for
// the coach assessment factor in Going Concern.
export interface LRSScoredPeriod {
  label: string
  monthIndices: number[]
  result: LRSResult
}

export interface LRSTimeSeriesInputs {
  rev: number[]; ebitda: number[]; grossProfit: number[]; cashClose: number[]; opex: number[]
  totalEquityByMonth: number[]; totalLiabilitiesByMonth: number[]
  businessBreakeven: number
  monthsWithActuals: boolean[]     // per month: does this month have any real actuals at all
  monthsClosed: boolean[]          // per month: is this month formally closed
  monthsWithFieldApp: boolean[]    // per month: did this month have any field-app-synced data
  customersAcquiredTotal: number   // whole-business total, from marketing events (not month-specific)
  irr: number | null               // whole-plan IRR (not month-specific -- capital deployment is a single event)
  revenuePerHead: number           // current headcount-derived figure (not month-specific)
  dscrMin: number | null; hasDebt: boolean; cashGaps: number; tradeCreditDpo: number
  assess: CoachAssessment
}

function lrsForRange(inputs: LRSTimeSeriesInputs, monthIndices: number[]): LRSResult {
  const pick = (arr: number[]) => monthIndices.map(i => arr[i] ?? 0)
  const lastIdx = monthIndices[monthIndices.length - 1]
  const firstIdx = monthIndices[0]
  const revInRange = pick(inputs.rev)
  const annualRevenue = revInRange.reduce((a, b) => a + b, 0)
  const annualEbitda = pick(inputs.ebitda).reduce((a, b) => a + b, 0)
  const annualGrossProfit = pick(inputs.grossProfit).reduce((a, b) => a + b, 0)
  const monthsElapsed = monthIndices.filter(i => inputs.monthsWithActuals[i] !== undefined).length
  const monthsOfActualData = monthIndices.filter(i => inputs.monthsWithActuals[i]).length
  const monthsClosedCount = monthIndices.filter(i => inputs.monthsClosed[i]).length
  const fieldAppMonths = monthIndices.filter(i => inputs.monthsWithFieldApp[i]).length
  // Growth rate: first vs last month actually in this range -- a simple,
  // transparent proxy rather than a compounding regression.
  const firstRev = inputs.rev[firstIdx] ?? 0
  const lastRev = inputs.rev[lastIdx] ?? 0
  const revenueGrowthRate = firstRev > 0 ? (lastRev - firstRev) / firstRev : 0
  return computeLiquidityReadinessScore({
    annualRevenue, annualEbitda, annualGrossProfit,
    cashClose: pick(inputs.cashClose), monthlyOpex: pick(inputs.opex),
    businessBreakeven: inputs.businessBreakeven,
    totalEquity: inputs.totalEquityByMonth[lastIdx] ?? 0,
    totalLiabilities: inputs.totalLiabilitiesByMonth[lastIdx] ?? 0,
    dscrMin: inputs.dscrMin, hasDebt: inputs.hasDebt, cashGaps: inputs.cashGaps,
    tradeCreditDpo: inputs.tradeCreditDpo,
    monthsOfActualData, monthsElapsed, monthsClosed: monthsClosedCount, fieldAppMonths,
    revenueGrowthRate, customersAcquired: inputs.customersAcquiredTotal,
    irr: inputs.irr, revenuePerHead: inputs.revenuePerHead,
    assess: inputs.assess,
  })
}

export function computeLRSTimeSeries(
  inputs: LRSTimeSeriesInputs, yearGroups: { year: number; label: string; monthIndices: number[] }[], monthLabels: string[],
): { years: LRSScoredPeriod[]; monthsByYear: Record<number, LRSScoredPeriod[]> } {
  const years: LRSScoredPeriod[] = yearGroups.map(g => ({
    label: g.label, monthIndices: g.monthIndices, result: lrsForRange(inputs, g.monthIndices),
  }))
  const monthsByYear: Record<number, LRSScoredPeriod[]> = {}
  yearGroups.forEach(g => {
    monthsByYear[g.year] = g.monthIndices.map(m => {
      const windowStart = Math.max(0, m - 11)
      const windowIndices = Array.from({ length: m - windowStart + 1 }, (_, i) => windowStart + i)
      return { label: monthLabels[m], monthIndices: windowIndices, result: lrsForRange(inputs, windowIndices) }
    })
  })
  return { years, monthsByYear }
}
