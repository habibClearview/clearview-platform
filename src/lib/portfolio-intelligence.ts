// Portfolio Intelligence: the aggregated, market-level view across every
// client on the platform -- Habib's own bizdev/programme-design tool (see
// the Product Development Specification, §5). Levels 1 (portfolio
// overview), 2 (segment drilldown), and 3 (anonymised individual profile)
// are built; export/share/presentation-mode are deliberately out of
// scope until the visual presentation layer is worked on.
//
// Level 3 profiles are identified by a deterministic reference code
// derived from clientId, never the raw clientId or business name -- the
// real name is only ever attached server-side (see
// app/api/portfolio-intelligence/route.ts) when the business has
// consented (engagement_clients.portfolio_consent_named), and this
// module never receives clientId->name mappings it isn't explicitly
// given. "Pathway to readiness" (specific improvements and estimated
// timescales) is NOT built here -- it's the still-unbuilt "Pathway to
// Readiness Report" (Product Development Specification §6.1, Report Type
// 2), a real, separate calculation in its own right, not something to
// bolt onto this profile with a fabricated timescale.
//
// Pure aggregation over an array of per-client snapshots -- the snapshot
// assembly itself (running the financial engine, LRS, FAC, confidence for
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
//    Fund Absorption Capacity by type -- the real capacity today,
//    clearly labelled as such, not a hypothetical ceiling.
//
// 3. "Time to readiness distribution" is dropped entirely for the same
//    reason as (1) -- no data to honestly compute it from.

import type { LRSResult } from './liquidity-readiness'
import type { FACResult } from './fund-absorption-capacity'

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

export interface BusinessUnitContribution {
  name: string
  revenuePct: number  // 0-100, share of this client's total revenue
}

// Per-business financial performance ratios, carried onto the snapshot so the
// portfolio layer can benchmark them. All are currency-neutral (percentages /
// multiples) and therefore safe to average/median ACROSS currencies, unlike the
// monetary FAC figures. Any value that cannot be computed for a business
// (e.g. growth without a second year, DSCR without debt) is null, never guessed.
export interface SnapshotPerformance {
  revenueGrowthPct: number | null   // year-on-year, whole-number %
  costRatioPct: number | null       // total operating costs ÷ revenue, %
  grossMarginPct: number | null
  ebitdaMarginPct: number | null
  netMarginPct: number | null
  dscrMin: number | null            // lowest debt-service coverage; null if no debt
  ruleOf40: number | null           // growth% + ebitda margin%
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
  confidenceBadges: string[]  // earned badge ids -- the "evidence base" Level 3 shows
  fac: FACResult
  currency: string  // e.g. 'UGX', 'KES', 'USD' -- the client's GenericModelConfig.currency.
    // FAC figures are monetary and denominated in this currency; they must
    // never be averaged across snapshots with different currencies (see
    // currentFundAbsorption below).
  annualRevenue: number  // raw revenue, for size-bracketing only -- never shown as an exact figure
  businessUnits: BusinessUnitContribution[]  // active units with real revenue, by contribution share
  consentToBeNamed: boolean
  performance?: SnapshotPerformance | null  // currency-neutral ratios for portfolio benchmarking (optional: older snapshots/fixtures may omit it)
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

/** Median of a numeric list (ignores non-finite); null if the list is empty. */
export function median(values: number[]): number | null {
  const v = values.filter(x => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

export interface MetricSummary {
  median: number | null
  count: number      // how many businesses had a value for this metric
  values: number[]   // the raw present values, for a distribution
}
export interface PerformanceSummary {
  revenueGrowth: MetricSummary
  costRatio: MetricSummary
  ebitdaMargin: MetricSummary
  netMargin: MetricSummary
  ruleOf40: MetricSummary
  dscr: MetricSummary
  bankableCount: number        // DSCR >= 1.5 (the usual lender comfort line)
  ruleOf40StrongCount: number  // Rule of 40 >= 40
  total: number
}

function summariseMetric(values: (number | null)[]): MetricSummary {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v))
  return { median: median(present), count: present.length, values: present }
}

/**
 * Portfolio-level medians and counts for the currency-neutral performance
 * ratios. Medians (not means) so one outlier can't distort the picture, and
 * only businesses that actually have a value for a metric are counted.
 */
export function computePerformanceSummary(snapshots: ClientSnapshot[]): PerformanceSummary {
  const perfs = snapshots.map(s => s.performance).filter((p): p is SnapshotPerformance => !!p)
  const dscrVals = perfs.map(p => p.dscrMin).filter((v): v is number => v !== null && Number.isFinite(v))
  const r40Vals = perfs.map(p => p.ruleOf40).filter((v): v is number => v !== null && Number.isFinite(v))
  return {
    revenueGrowth: summariseMetric(perfs.map(p => p.revenueGrowthPct)),
    costRatio: summariseMetric(perfs.map(p => p.costRatioPct)),
    ebitdaMargin: summariseMetric(perfs.map(p => p.ebitdaMarginPct)),
    netMargin: summariseMetric(perfs.map(p => p.netMarginPct)),
    ruleOf40: summariseMetric(perfs.map(p => p.ruleOf40)),
    dscr: summariseMetric(perfs.map(p => p.dscrMin)),
    bankableCount: dscrVals.filter(v => v >= 1.5).length,
    ruleOf40StrongCount: r40Vals.filter(v => v >= 40).length,
    total: snapshots.length,
  }
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

export interface FundAbsorptionSummary {
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
  // currency. Averaging monetary FAC figures across clients denominated in
  // different currencies would produce a meaningless blended number (e.g.
  // mixing tens-of-millions UGX with thousands USD), so this is never a
  // single flat summary.
  currentFundAbsorption: Record<string, FundAbsorptionSummary>
  // Same currency-scoping rule as above, but SUMMED rather than averaged
  // -- "the portfolio's total current credit capacity in UGX today", a
  // real sum over every UGX business with a non-null figure (nulls
  // excluded, not treated as zero -- same rule as the average).
  currentFundAbsorptionTotal: Record<string, FundAbsorptionSummary>
}

// Averages a FAC figure across every snapshot where that type resolved to
// a real number (not null) -- a business with "no input shop unit" (null
// consignment capacity) is excluded from the consignment average, not
// counted as a zero, which would understate the real average for
// businesses that DO have one.
function avgFacType(snapshots: ClientSnapshot[], pick: (fac: FACResult) => number | null): number | null {
  const values = snapshots.map(s => pick(s.fac)).filter((v): v is number => v !== null)
  return values.length > 0 ? average(values) : null
}

// Same null-exclusion rule as avgFacType, but summed -- a business with no
// consignment unit is left out of the total entirely, not counted as 0.
function sumFacType(snapshots: ClientSnapshot[], pick: (fac: FACResult) => number | null): number | null {
  const values = snapshots.map(s => pick(s.fac)).filter((v): v is number => v !== null)
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) : null
}

// Groups snapshots by currency and computes one FundAbsorptionSummary per
// currency (using `reduce`), so a FAC figure is only ever combined with
// other figures denominated in the same currency.
function fundAbsorptionByCurrency(
  snapshots: ClientSnapshot[],
  reduceFn: (group: ClientSnapshot[], pick: (fac: FACResult) => number | null) => number | null
): Record<string, FundAbsorptionSummary> {
  const byCurrency = new Map<string, ClientSnapshot[]>()
  snapshots.forEach(s => {
    const group = byCurrency.get(s.currency)
    if (group) group.push(s)
    else byCurrency.set(s.currency, [s])
  })
  const result: Record<string, FundAbsorptionSummary> = {}
  byCurrency.forEach((group, currency) => {
    result[currency] = {
      credit: reduceFn(group, c => c.credit.capacity),
      grant: reduceFn(group, c => c.grant.capacity),
      equity: reduceFn(group, c => c.equity.capacity),
      consignment: reduceFn(group, c => c.consignment.capacity),
      recoverableGrant: reduceFn(group, c => c.recoverableGrant.capacity),
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
    currentFundAbsorption: fundAbsorptionByCurrency(snapshots, avgFacType),
    currentFundAbsorptionTotal: fundAbsorptionByCurrency(snapshots, sumFacType),
  }
}

// "Most common failure points" -- the dimensions where the group scores
// worst, ranked weakest-first, each with the real count of businesses
// scoring below `threshold` on that dimension. This is a straight ranking
// of ALL SEVEN dimension averages (LRS_DIMENSION_KEYS), not a filtered
// subset -- "top 3" just means the slice happens after sorting.
export interface DimensionFailure {
  dimension: keyof LRSResult['dimensions']
  avgScore: number
  countBelowThreshold: number
  totalCount: number
  threshold: number
}

export function rankedDimensionFailures(snapshots: ClientSnapshot[], threshold = 50, top = 3): DimensionFailure[] {
  if (snapshots.length === 0) return []
  return LRS_DIMENSION_KEYS.map(dimension => {
    const scores = snapshots.map(s => s.lrs.dimensions[dimension].score)
    return {
      dimension,
      avgScore: average(scores),
      countBelowThreshold: scores.filter(v => v < threshold).length,
      totalCount: snapshots.length,
      threshold,
    }
  }).sort((a, b) => a.avgScore - b.avgScore).slice(0, top)
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

// ── Level 3: Anonymised Individual Profile ─────────────────────────

// A short, stable, non-reversible-looking reference code derived from
// clientId -- the SAME client always produces the SAME code (so a
// coach can recognise "AG-4K7Q" as the same business across sessions),
// but the code itself gives no way to recover the clientId. Not
// cryptographic (doesn't need to be -- this is de-identification for
// display, not a security boundary; the real access control is that
// buildAnonymisedProfile below only receives a real name when the
// route has already confirmed consent).
// Murmur3-style finalizer -- scrambles a 32-bit integer's bits thoroughly
// regardless of how structured the input hash was. Needed because the
// raw FNV-1a hash below, on its own, under-diffuses for short, similar
// inputs (e.g. "client-0" .. "client-199", differing only in their last
// 1-3 characters) -- verified empirically: without this finalizer step,
// 200 sequential clientIds collided down to as few as 19-46 unique codes.
function fmix32(hash: number): number {
  let h = hash
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

function fnv1a(str: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function anonymizedRefCode(clientId: string): string {
  const combined = fmix32(fnv1a(clientId))
  const code = combined.toString(36).toUpperCase().padStart(5, '0').slice(-5)
  return `BIZ-${code}`
}

export type SizeBracket = 'Small' | 'Medium' | 'Large' | 'Very Large' | 'Not enough peers to bracket'

// Quartile-based, computed from the OTHER businesses denominated in the
// SAME currency -- comparing a UGX revenue figure against a fixed
// absolute threshold designed for USD amounts (or vice versa) would be
// the exact currency-mixing mistake already fixed in
// currentFundAbsorption above. With fewer than 4 same-currency peers
// there isn't a meaningful quartile split, so this says so rather than
// forcing a bracket.
export function revenueSizeBracket(target: ClientSnapshot, allSnapshots: ClientSnapshot[]): SizeBracket {
  const peers = allSnapshots.filter(s => s.currency === target.currency).map(s => s.annualRevenue).sort((a, b) => a - b)
  if (peers.length < 4) return 'Not enough peers to bracket'
  const q = (p: number) => peers[Math.min(peers.length - 1, Math.floor(p * (peers.length - 1)))]
  const q1 = q(0.25), q2 = q(0.5), q3 = q(0.75)
  if (target.annualRevenue <= q1) return 'Small'
  if (target.annualRevenue <= q2) return 'Medium'
  if (target.annualRevenue <= q3) return 'Large'
  return 'Very Large'
}

export interface AnonymisedProfile {
  refCode: string
  displayName: string  // refCode unless consentToBeNamed, in which case the real name
  isNamed: boolean
  sector: string | null
  country: string | null
  sizeBracket: SizeBracket
  irScore: number
  irTier: string
  lrs: LRSResult
  confidenceScore: number
  confidenceBadges: string[]
  fac: FACResult
  currency: string
  businessUnits: BusinessUnitContribution[]
}

export function buildAnonymisedProfile(snapshot: ClientSnapshot, allSnapshots: ClientSnapshot[]): AnonymisedProfile {
  const refCode = anonymizedRefCode(snapshot.clientId)
  return {
    refCode,
    displayName: snapshot.consentToBeNamed ? snapshot.name : refCode,
    isNamed: snapshot.consentToBeNamed,
    sector: snapshot.sector,
    country: snapshot.country,
    sizeBracket: revenueSizeBracket(snapshot, allSnapshots),
    irScore: snapshot.irScore,
    irTier: snapshot.irTier,
    lrs: snapshot.lrs,
    confidenceScore: snapshot.confidenceScore,
    confidenceBadges: snapshot.confidenceBadges,
    fac: snapshot.fac,
    currency: snapshot.currency,
    businessUnits: snapshot.businessUnits,
  }
}
