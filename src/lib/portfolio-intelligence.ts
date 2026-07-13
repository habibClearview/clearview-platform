// Portfolio Intelligence: the aggregated, market-level view across every
// client on the platform -- Habib's own bizdev/programme-design tool (see
// the Product Development Specification, §5). Levels 1 (portfolio
// overview) and 2 (segment drilldown) only; Level 3 (anonymised
// individual profile with naming consent) needs a new consent field this
// pass doesn't add, and export/share/presentation-mode are deliberately
// out of scope until the visual presentation layer is worked on.
//
// Pure aggregation over an array of per-client snapshots -- the snapshot
// assembly itself (running the financial engine, LRS, CAC, confidence for
// every client) lives in app/api/portfolio-intelligence/route.ts, which
// is the only place with database access. This module never touches a
// client's raw identity beyond what's passed in.
//
// Three corrections made relative to the first written version of this
// spec, all because the literal request isn't something this platform
// can honestly compute yet:
//
// 1. "Readiness pipeline: ... within 6 months of readiness" assumes a
//    time-to-readiness projection model. No such model exists anywhere
//    in this codebase (it would be the still-unbuilt "Pathway to
//    Readiness Report"). Readiness pipeline here buckets by CURRENT
//    Investment Readiness tier only (Investment Ready / Near Ready /
//    Development Stage / Pre-Investment), not a time estimate.
//
// 2. "Capital gap estimate: the total capital the segment could absorb
//    IF ALL businesses reached investment readiness" is a hypothetical
//    re-scored future state -- there's no defensible way to recompute
//    what a business's financials would look like once "ready" without
//    fabricating numbers. This instead sums each business's CURRENT
//    Capital Absorption Capacity by type -- the real capacity today,
//    clearly labelled as such, not a hypothetical ceiling.
//
// 3. "Time to readiness distribution" is dropped entirely for the same
//    reason as (1) -- no data to honestly compute it from.

import type { LRSResult } from './liquidity-readiness'
import type { CACResult } from './capital-absorption-capacity'

export type ReadinessStage = 'pre_investment' | 'development_stage' | 'near_ready' | 'investment_ready'

const IR_TIER_TO_STAGE: Record<string, ReadinessStage> = {
  'Pre-Investment': 'pre_investment',
  'Development Stage': 'development_stage',
  'Near Ready': 'near_ready',
  'Investment Ready': 'investment_ready',
}

export const READINESS_STAGE_LABELS: Record<ReadinessStage, string> = {
  pre_investment: 'Pre-Investment',
  development_stage: 'Development Stage',
  near_ready: 'Near Ready',
  investment_ready: 'Investment Ready',
}

export interface ClientSnapshot {
  clientId: string
  name: string
  sector: string | null
  country: string | null
  programmeId: string | null
  irScore: number
  irTier: string  // 'Investment Ready' | 'Near Ready' | 'Development Stage' | 'Pre-Investment'
  lrs: LRSResult
  confidenceScore: number  // 0-100
  cac: CACResult
  currency: string  // e.g. 'UGX', 'KES', 'USD' -- the client's GenericModelConfig.currency.
    // CAC figures are monetary and denominated in this currency; they must
    // never be averaged across snapshots with different currencies (see
    // currentCapitalAbsorption below).
}

export interface SegmentFilter {
  sector?: string
  country?: string
  programmeId?: string
  readinessStage?: ReadinessStage
  minConfidence?: number
  maxConfidence?: number
}

const LRS_DIMENSION_KEYS: (keyof LRSResult['dimensions'])[] = [
  'marketOpportunity', 'visibility', 'trust', 'profitability', 'capacity', 'resilience', 'compliance',
]

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

export function readinessStage(irTier: string): ReadinessStage {
  return IR_TIER_TO_STAGE[irTier] ?? 'pre_investment'
}

export function matchesFilter(snapshot: ClientSnapshot, filter: SegmentFilter): boolean {
  if (filter.sector && snapshot.sector !== filter.sector) return false
  if (filter.country && snapshot.country !== filter.country) return false
  if (filter.programmeId && snapshot.programmeId !== filter.programmeId) return false
  if (filter.readinessStage && readinessStage(snapshot.irTier) !== filter.readinessStage) return false
  if (filter.minConfidence !== undefined && snapshot.confidenceScore < filter.minConfidence) return false
  if (filter.maxConfidence !== undefined && snapshot.confidenceScore > filter.maxConfidence) return false
  return true
}

export interface ReadinessPipeline {
  pre_investment: number
  development_stage: number
  near_ready: number
  investment_ready: number
}

export interface VerificationBand {
  label: string  // e.g. '0-20'
  min: number
  max: number
  count: number
}

export interface CapitalAbsorptionSummary {
  credit: number | null
  grant: number | null
  equity: number | null
  consignment: number | null
  recoverableGrant: number | null
}

export interface PortfolioOverview {
  totalBusinesses: number
  avgIRScore: number
  avgConfidenceScore: number
  avgLRSScore: number
  readinessPipeline: ReadinessPipeline
  readinessPipelinePct: ReadinessPipeline
  mostCommonWeakDimension: keyof LRSResult['dimensions'] | null
  dimensionAverages: Record<keyof LRSResult['dimensions'], number>
  verificationDistribution: VerificationBand[]
  // Keyed by currency code (e.g. 'UGX', 'USD') -- one summary per currency
  // present in the snapshot set, each computed only from snapshots in that
  // currency. Averaging monetary CAC figures across clients denominated in
  // different currencies would produce a meaningless blended number (e.g.
  // mixing tens-of-millions UGX with thousands USD), so this is never a
  // single flat summary.
  currentCapitalAbsorption: Record<string, CapitalAbsorptionSummary>
}

// Averages a CAC figure across every snapshot where that type resolved to
// a real number (not null) -- a business with "no input shop unit" (null
// consignment capacity) is excluded from the consignment average, not
// counted as a zero, which would understate the real average for
// businesses that DO have one.
function avgCacType(snapshots: ClientSnapshot[], pick: (cac: CACResult) => number | null): number | null {
  const values = snapshots.map(s => pick(s.cac)).filter((v): v is number => v !== null)
  return values.length > 0 ? average(values) : null
}

// Groups snapshots by currency and computes one CapitalAbsorptionSummary
// per currency, so a CAC figure is only ever averaged against other
// figures denominated in the same currency.
function capitalAbsorptionByCurrency(snapshots: ClientSnapshot[]): Record<string, CapitalAbsorptionSummary> {
  const byCurrency = new Map<string, ClientSnapshot[]>()
  snapshots.forEach(s => {
    const group = byCurrency.get(s.currency)
    if (group) group.push(s)
    else byCurrency.set(s.currency, [s])
  })
  const result: Record<string, CapitalAbsorptionSummary> = {}
  byCurrency.forEach((group, currency) => {
    result[currency] = {
      credit: avgCacType(group, c => c.credit.capacity),
      grant: avgCacType(group, c => c.grant.capacity),
      equity: avgCacType(group, c => c.equity.capacity),
      consignment: avgCacType(group, c => c.consignment.capacity),
      recoverableGrant: avgCacType(group, c => c.recoverableGrant.capacity),
    }
  })
  return result
}

export function computePortfolioOverview(snapshots: ClientSnapshot[]): PortfolioOverview {
  const total = snapshots.length
  const pipeline: ReadinessPipeline = { pre_investment: 0, development_stage: 0, near_ready: 0, investment_ready: 0 }
  snapshots.forEach(s => { pipeline[readinessStage(s.irTier)]++ })
  const pipelinePct: ReadinessPipeline = total > 0
    ? {
        pre_investment: (pipeline.pre_investment / total) * 100,
        development_stage: (pipeline.development_stage / total) * 100,
        near_ready: (pipeline.near_ready / total) * 100,
        investment_ready: (pipeline.investment_ready / total) * 100,
      }
    : { pre_investment: 0, development_stage: 0, near_ready: 0, investment_ready: 0 }

  const dimensionAverages = Object.fromEntries(
    LRS_DIMENSION_KEYS.map(key => [key, average(snapshots.map(s => s.lrs.dimensions[key].score))])
  ) as Record<keyof LRSResult['dimensions'], number>

  const mostCommonWeakDimension = total > 0
    ? LRS_DIMENSION_KEYS.reduce((weakest, key) =>
        dimensionAverages[key] < dimensionAverages[weakest] ? key : weakest, LRS_DIMENSION_KEYS[0])
    : null

  const bands: [number, number][] = [[0, 20], [20, 40], [40, 60], [60, 80], [80, 100]]
  const verificationDistribution: VerificationBand[] = bands.map(([min, max]) => ({
    label: `${min}-${max}`,
    min, max,
    // Top band is inclusive of 100 at both ends; every other band is
    // inclusive of its low end, exclusive of its high end, so a score of
    // exactly 20 counts once (in the 20-40 band), never twice.
    count: snapshots.filter(s => max === 100 ? s.confidenceScore >= min && s.confidenceScore <= max : s.confidenceScore >= min && s.confidenceScore < max).length,
  }))

  return {
    totalBusinesses: total,
    avgIRScore: average(snapshots.map(s => s.irScore)),
    avgConfidenceScore: average(snapshots.map(s => s.confidenceScore)),
    avgLRSScore: average(snapshots.map(s => s.lrs.score)),
    readinessPipeline: pipeline,
    readinessPipelinePct: pipelinePct,
    mostCommonWeakDimension,
    dimensionAverages,
    verificationDistribution,
    currentCapitalAbsorption: capitalAbsorptionByCurrency(snapshots),
  }
}

export interface DimensionComparison {
  dimension: keyof LRSResult['dimensions']
  segmentAvg: number
  portfolioAvg: number
  delta: number  // segmentAvg - portfolioAvg; negative means the segment lags the portfolio
}

export interface SegmentReport {
  segment: PortfolioOverview
  portfolio: PortfolioOverview
  dimensionComparison: DimensionComparison[]
  weakestDimensionsInSegment: (keyof LRSResult['dimensions'])[]  // ranked, weakest first
}

export function computeSegmentReport(allSnapshots: ClientSnapshot[], filter: SegmentFilter): SegmentReport {
  const segmentSnapshots = allSnapshots.filter(s => matchesFilter(s, filter))
  const segment = computePortfolioOverview(segmentSnapshots)
  const portfolio = computePortfolioOverview(allSnapshots)
  const dimensionComparison: DimensionComparison[] = LRS_DIMENSION_KEYS.map(dimension => ({
    dimension,
    segmentAvg: segment.dimensionAverages[dimension],
    portfolioAvg: portfolio.dimensionAverages[dimension],
    delta: segment.dimensionAverages[dimension] - portfolio.dimensionAverages[dimension],
  }))
  const weakestDimensionsInSegment = [...LRS_DIMENSION_KEYS].sort(
    (a, b) => segment.dimensionAverages[a] - segment.dimensionAverages[b]
  )
  return { segment, portfolio, dimensionComparison, weakestDimensionsInSegment }
}
