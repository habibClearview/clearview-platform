// Seasonal Cash Position Projection (§SCP). Projects the business's cash
// position forward through one seasonal cycle (12 months), derived
// automatically from its OWN historical actuals -- never manually
// configured. The owner doesn't need to know what a "seasonal pattern"
// is; as more closed actuals accumulate over time, the projection gets
// more accurate on its own.
//
// This directly feeds Capital Absorption Capacity's credit-capacity
// calculation (the 4-week delayed-repayment stress scenario here is a
// required input there) -- build/verify this first.
//
// Two corrections made relative to the first written version of this
// spec, both to keep the result genuinely defensible rather than a
// literal transcription of a formula that didn't actually check out:
//
// 1. The seasonal index is grouped by MONTH-IN-CYCLE (month index mod
//    12), averaging every historical instance of that calendar position
//    together -- not indexed by the raw month number. The original spec
//    defined the index per raw month, then tried to look it up later
//    using a mod-12 "month in cycle" key; those two indexing schemes
//    don't actually match. Grouping by cycle position is what the
//    original spec's own confidence-band step already assumed ("all
//    historical instances of monthInCycle m"), so this makes the whole
//    calculation internally consistent instead of silently broken.
//
// 2. The cash-generating driver is GROSS PROFIT (revenue less cost of
//    sales), not raw revenue. The original formula was
//    revenue - opex - debtService, which silently assumes 100% gross
//    margin -- i.e. no cost of sales at all. For any business with real
//    COGS, which is most of this platform's actual client base (input
//    shops, aggregators, livestock traders), that would materially
//    overstate projected cash. Gross profit keeps the same lightweight,
//    one-season-ahead approach without that specific defect.
//
// Deliberately a LIGHTER model than the engine's own Cash Flow Statement
// (generic-engine.ts) -- it doesn't re-run tax or working-capital timing
// for 12 hypothetical future months, it extrapolates the business's own
// seasonal shape from its own history. It exists to show WHEN the tight
// point in the cycle falls and how deep it goes, not to replace the full
// statement.

export interface SeasonalProjectionInputs {
  cfClose: number[]             // cf.close -- actual/plan hybrid closing cash, per month
  rev: number[]                  // con.rev -- monthly revenue, per month
  gp: number[]                   // con.gp -- monthly gross profit, per month
  debtRepayment: number[]        // debtSchedule.totalRepayment -- per month
  monthsClosedFlags: boolean[]   // per month: formally closed (final, not just entered)
  currentMonthIndex: number      // last actual month's index -- the projection's starting point
  latestMonthlyOpex: number      // most recent month's total operating cost, held flat forward
}

export type DataConfidence = 'reliable' | 'limited' | 'insufficient'

export interface SeasonalProjectionResult {
  projectedClose: number[]
  projectedCloseUpperBand: number[]
  projectedCloseLowerBand: number[]
  troughMonthOffset: number | null   // 1-12: months ahead of currentMonthIndex
  troughValue: number | null
  stressClose_2wk: number[]          // delayed repayment, 14 days
  stressClose_4wk: number[]          // delayed repayment, 28 days -- feeds §CAC credit capacity
  stressClose_inputRise: number[]    // input costs +15%
  dataConfidence: DataConfidence
}

const HORIZON_MONTHS = 12
const MIN_MONTHS_TO_SHOW = 3
const MIN_MONTHS_RELIABLE = 6
// Assumed variation (as a fraction of average monthly revenue) for a
// cycle position with fewer than 2 historical instances -- an explicit,
// honest "we don't know yet" default rather than a computed statistic
// that would be meaningless from a single data point.
const DEFAULT_VARIATION = 0.3

function emptyResult(confidence: DataConfidence): SeasonalProjectionResult {
  return {
    projectedClose: [], projectedCloseUpperBand: [], projectedCloseLowerBand: [],
    troughMonthOffset: null, troughValue: null,
    stressClose_2wk: [], stressClose_4wk: [], stressClose_inputRise: [],
    dataConfidence: confidence,
  }
}

export function computeSeasonalCashProjection(inputs: SeasonalProjectionInputs): SeasonalProjectionResult {
  const { cfClose, rev, gp, debtRepayment, monthsClosedFlags, currentMonthIndex, latestMonthlyOpex } = inputs

  const closedMonths: number[] = []
  monthsClosedFlags.forEach((closed, i) => { if (closed) closedMonths.push(i) })

  // Fewer than 3 months of closed actuals: there's nothing real to derive
  // a pattern from yet. Return no projection at all rather than a
  // meaningless flat-line guess.
  if (closedMonths.length < MIN_MONTHS_TO_SHOW) return emptyResult('insufficient')
  const dataConfidence: DataConfidence = closedMonths.length >= MIN_MONTHS_RELIABLE ? 'reliable' : 'limited'

  // Step 1: seasonal index, one value per position in the 12-month cycle
  // (0 = the position currentMonthIndex+1 would land on a year later,
  // etc.), each the average of every historical closed month sharing
  // that position. A position with no historical instance at all
  // defaults to 1.0 (an "average" month), not zero.
  const avgMonthlyRev = closedMonths.reduce((s, i) => s + rev[i], 0) / closedMonths.length
  const revRatiosByPosition: number[][] = Array.from({ length: 12 }, () => [])
  closedMonths.forEach(i => {
    const pos = ((i % 12) + 12) % 12
    revRatiosByPosition[pos].push(avgMonthlyRev > 0 ? rev[i] / avgMonthlyRev : 1.0)
  })
  const seasonalIndex = revRatiosByPosition.map(ratios =>
    ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1.0
  )

  // Step 4 groundwork: variation per cycle position, as a fraction of
  // average monthly revenue.
  const revVariationByPosition = revRatiosByPosition.map(ratios => {
    if (ratios.length < 2) return DEFAULT_VARIATION
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length
    const variance = ratios.reduce((s, v) => s + (v - mean) ** 2, 0) / ratios.length
    return Math.sqrt(variance)
  })

  const latestMonthlyGP = gp[currentMonthIndex] ?? 0
  const startingCash = cfClose[currentMonthIndex] ?? 0

  // Steps 2 + 3: project forward, tracking the running trough as we go.
  const projectedClose: number[] = []
  const projectedCloseUpperBand: number[] = []
  const projectedCloseLowerBand: number[] = []
  const projectedGPByOffset: number[] = [] // kept for the stress overlays below
  let cum = startingCash, cumUpper = startingCash, cumLower = startingCash
  let troughMonthOffset: number | null = null
  let troughValue = Infinity

  for (let f = 1; f <= HORIZON_MONTHS; f++) {
    const pos = (((currentMonthIndex + f) % 12) + 12) % 12
    const indexForMonth = seasonalIndex[pos] ?? 1.0
    const projectedGP = latestMonthlyGP * indexForMonth
    const projectedDebtService = debtRepayment[currentMonthIndex + f] ?? 0
    const netCash = projectedGP - latestMonthlyOpex - projectedDebtService
    cum += netCash
    projectedClose.push(cum)
    projectedGPByOffset.push(projectedGP)

    const variation = revVariationByPosition[pos] * avgMonthlyRev
    cumUpper += netCash + variation
    cumLower += netCash - variation
    projectedCloseUpperBand.push(cumUpper)
    projectedCloseLowerBand.push(cumLower)

    if (cum < troughValue) { troughValue = cum; troughMonthOffset = f }
  }

  // Step 5, overlay 1: input price rise +15% -- unambiguous, applied to
  // every projected month's operating cost.
  const stressClose_inputRise: number[] = []
  let cumRise = startingCash
  for (let f = 1; f <= HORIZON_MONTHS; f++) {
    const projectedDebtService = debtRepayment[currentMonthIndex + f] ?? 0
    cumRise += projectedGPByOffset[f - 1] - latestMonthlyOpex * 1.15 - projectedDebtService
    stressClose_inputRise.push(cumRise)
  }

  // Step 5, overlays 2 + 3: delayed repayment. With no day-level
  // granularity in this model, a delay of N days is applied as that
  // fraction of a month's gross-profit inflow (N/30) shifted OUT of the
  // trough month and INTO the following month -- the trough dips
  // further by the delayed amount, and cash fully recovers the month
  // after (the payment arrives, just late). This captures the right
  // direction and rough scale of a payment delay without claiming a
  // precision this monthly model can't actually support.
  function delayedRepaymentStress(daysDelayed: number): number[] {
    const out = [...projectedClose]
    if (troughMonthOffset === null) return out
    const shiftIdx = troughMonthOffset - 1 // 0-based index into projectedClose
    const delayFraction = Math.min(1, daysDelayed / 30)
    const inflowAtTrough = Math.max(0, projectedGPByOffset[shiftIdx])
    const shiftedAmount = inflowAtTrough * delayFraction
    for (let i = shiftIdx; i < out.length; i++) out[i] -= shiftedAmount
    for (let i = shiftIdx + 1; i < out.length; i++) out[i] += shiftedAmount
    return out
  }
  const stressClose_2wk = delayedRepaymentStress(14)
  const stressClose_4wk = delayedRepaymentStress(28)

  return {
    projectedClose, projectedCloseUpperBand, projectedCloseLowerBand,
    troughMonthOffset, troughValue: troughMonthOffset !== null ? troughValue : null,
    stressClose_2wk, stressClose_4wk, stressClose_inputRise,
    dataConfidence,
  }
}
