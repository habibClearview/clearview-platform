// Server-only: assembles one ClientSnapshot per financial client (the
// same LRS/SCP/FAC/confidence construction GenericDashboard.tsx and
// investment-brief-builder.ts already use) and the full portfolio
// aggregation on top of it. Factored out of app/api/portfolio-intelligence
// so BOTH the coach-authenticated portfolio dashboard and the token-based
// external access route (app/api/access-grant/[token]/route.ts) generate
// the exact same numbers from the exact same code -- no second copy to
// drift out of sync, the same principle already applied to the
// investment brief builder.
import type { SupabaseClient } from '@supabase/supabase-js'
import { runGenericModel, buildMonthLabels, buildYearGroups, type GenericModelConfig } from './generic-engine'
import { defaultCoachAssessment } from './scoring-engine'
import { computeLiquidityReadinessScore, computeLRSTimeSeries } from './liquidity-readiness'
import { computeIRR, buildInvestmentCashFlows, computeCustomerGrowthSummary, monthlyRateToAnnualRate } from './investment-metrics'
import { periodForMonthIndex } from './month-end-close'
import { assessConfidence } from './confidence'
import { buildPeriodSignals } from './verification-display'
import { computeSeasonalCashProjection } from './seasonal-cash-projection'
import { computeFundAbsorptionCapacity } from './fund-absorption-capacity'
import { revenueGrowthPctFromSeries, grossMarginPct, ebitdaMarginPct, netMarginPct, ruleOf40 } from './business-performance-metrics'
import { computePortfolioOverview, computeSegmentReport, buildAnonymisedProfile, matchesFilter, rankedDimensionFailures, computePerformanceSummary, type ClientSnapshot, type SegmentFilter, type PortfolioOverview, type SegmentReport, type AnonymisedProfile, type DimensionFailure, type PerformanceSummary } from './portfolio-intelligence'

async function buildClientSnapshot(admin: SupabaseClient, client: any, configRow: any): Promise<ClientSnapshot | null> {
  if (!configRow) return null

  const [{ data: events }, { data: actualsRows }, { data: periodCloseRows }, { data: providerLinks }, { data: providerTx }] = await Promise.all([
    admin.from('management_events').select('*').eq('client_id', client.id).order('date', { ascending: false }),
    admin.from('generic_actuals').select('period,field_line_values').eq('client_id', client.id),
    admin.from('generic_period_close').select('period,closed').eq('client_id', client.id).eq('closed', true),
    admin.from('provider_links').select('status').eq('client_id', client.id),
    admin.from('provider_transactions').select('amount,reconciliation_state').eq('client_id', client.id),
  ])

  const config: GenericModelConfig = {
    client_id: configRow.client_id,
    business_name: configRow.business_name,
    currency: configRow.currency,
    start_date: configRow.start_date,
    planning_months: configRow.planning_months,
    business_units: configRow.business_units || [],
    plan_lines: configRow.plan_lines || [],
    shared_lines: configRow.shared_lines || [],
    settings: configRow.settings || {},
  }

  const result = runGenericModel(config)
  const m = result.metrics
  const s = result.scores
  const assess = config.settings.coach_assessment || defaultCoachAssessment()

  const periodIsActual: boolean[] = result.con.act_ebitda.map((v: number | null) => v !== null)
  const monthsN = periodIsActual.length
  const closedPeriodsSet = new Set((periodCloseRows || []).map((r: any) => r.period))
  const fieldAppPeriodsSet = new Set<string>()
  ;(actualsRows || []).forEach((row: any) => {
    if (row.field_line_values && Object.keys(row.field_line_values).length > 0) fieldAppPeriodsSet.add(row.period)
  })
  const monthsClosedFlags = Array.from({ length: monthsN }, (_, i) => closedPeriodsSet.has(periodForMonthIndex(config.start_date, i)))
  const monthsWithFieldAppFlags = Array.from({ length: monthsN }, (_, i) => fieldAppPeriodsSet.has(periodForMonthIndex(config.start_date, i)))

  const yearGroups = buildYearGroups(config.start_date, config.planning_months)
  const monthLabelsFull = buildMonthLabels(config.start_date, config.planning_months)
  const capitalStructure = config.settings.capital_structure
  const capitalAtRisk = (capitalStructure?.shareholder_contribution || 0) + (capitalStructure?.grant_recoverable || 0)
  const lrsCashFlows = buildInvestmentCashFlows(capitalAtRisk, result.cf.op_cash, result.cf.inv_cash)
  const lrsMonthlyIrr = computeIRR(lrsCashFlows)
  const lrsAnnualIrr = lrsMonthlyIrr !== null ? monthlyRateToAnnualRate(lrsMonthlyIrr) : null
  const lrsCustomerGrowth = computeCustomerGrowthSummary(events || [])
  const lrsSeries = computeLRSTimeSeries({
    rev: result.con.rev, ebitda: result.con.ebitda, grossProfit: result.con.gp,
    cashClose: result.cf.close, opex: result.con.opex,
    totalEquityByMonth: result.bs.total_equity, totalLiabilitiesByMonth: result.bs.total_liabilities,
    businessBreakeven: result.metrics.business_breakeven,
    monthsWithActuals: periodIsActual, monthsClosed: monthsClosedFlags, monthsWithFieldApp: monthsWithFieldAppFlags,
    customersAcquiredTotal: lrsCustomerGrowth.totalCustomersAcquired,
    irr: lrsAnnualIrr, revenuePerHead: result.metrics.revenue_per_head,
    dscrMin: s.dscrMin, hasDebt: s.hasDebt, cashGaps: s.cashGaps, tradeCreditDpo: s.tradeCredit.dpo,
    assess,
  }, yearGroups, monthLabelsFull)
  const lrsCurrent = lrsSeries.years[lrsSeries.years.length - 1]?.result || computeLiquidityReadinessScore({
    annualRevenue: 0, annualEbitda: 0, annualGrossProfit: 0, cashClose: [0], monthlyOpex: [0], businessBreakeven: 0,
    totalEquity: 0, totalLiabilities: 0, dscrMin: null, hasDebt: false, cashGaps: 0, tradeCreditDpo: 0,
    monthsOfActualData: 0, monthsElapsed: 0, monthsClosed: 0, fieldAppMonths: 0, revenueGrowthRate: 0,
    customersAcquired: 0, irr: null, revenuePerHead: 0, assess,
  })

  const lastActualMonthIndex = Math.max(0, periodIsActual.lastIndexOf(true))
  const scp = computeSeasonalCashProjection({
    cfClose: result.cf.close, rev: result.con.rev, gp: result.con.gp,
    debtRepayment: result.debtSchedule.totalRepayment,
    monthsClosedFlags, currentMonthIndex: lastActualMonthIndex,
    latestMonthlyOpex: result.con.opex[lastActualMonthIndex] ?? 0,
  })

  const inputShopBusinessUnit = result.allocUnits.find((u: any) =>
    (u.name || '').toLowerCase().includes('input') || (u.short || '').toLowerCase().includes('input'))
  const inputShopUnitPL = inputShopBusinessUnit ? result.unitPL[inputShopBusinessUnit.id] : null
  const productionCapacityIndicator = lrsCurrent.dimensions.capacity.indicators.find(ind => ind.label === 'Production Capacity')
  const recordsCompletenessIndicator = lrsCurrent.dimensions.compliance.indicators.find(ind => ind.label === 'Financial Reporting')
  const fac = computeFundAbsorptionCapacity({
    stressClose_4wk: scp.stressClose_4wk,
    scpDataConfidence: scp.dataConfidence,
    existingAnnualRate: (config.settings.debts && config.settings.debts[0]?.annualRate) || undefined,
    cashConversionGapDays: s.tradeCredit.cashConversionGap,
    annualRevenue: m.total_revenue, annualGrossProfit: m.total_gp, annualEbitda: m.total_ebitda, annualNpat: m.total_npat,
    productionCapacityScore: productionCapacityIndicator?.value ?? 0,
    governanceScore: Number(assess.governance) || 0,
    revTrend: s.revTrend,
    inputShopUnit: inputShopUnitPL ? { annualRevenue: inputShopUnitPL.ann_rev, annualGrossProfit: inputShopUnitPL.ann_gp } : null,
    recordsCompletenessPct: recordsCompletenessIndicator?.value ?? 0,
  })

  const STATUS_RANK: Record<string, number> = { not_started: 0, wallet_activated: 1, link_pending: 2, tier1_active: 3 }
  let readiness = 'not_started'
  ;(providerLinks || []).forEach((r: any) => {
    const st = r.status || 'not_started'
    if (STATUS_RANK[st] > STATUS_RANK[readiness]) readiness = st
  })
  let matchedValue = 0, unattributedValue = 0
  ;(providerTx || []).forEach((t: any) => {
    if (t.reconciliation_state === 'matched') matchedValue += Number(t.amount) || 0
    else if (t.reconciliation_state === 'unattributed_inbound') unattributedValue += Number(t.amount) || 0
  })
  const monthsWithActualsCount = periodIsActual.filter(Boolean).length
  const monthsClosedCount = monthsClosedFlags.filter(Boolean).length
  const signals = buildPeriodSignals({
    declaredValue: m.total_revenue,
    matchedValue, unattributedInboundValue: unattributedValue,
    hasActuals: monthsWithActualsCount > 0,
    recordsComplete: monthsN > 0 && monthsWithActualsCount >= monthsN,
    cogsConsistent: false,
    internallyConsistent: true,
    monthsConsistentStreak: monthsWithActualsCount,
    monthClosedOnTime: monthsClosedCount > 0,
  })
  const confidence = assessConfidence(signals)

  const activeUnitsWithRevenue = result.allocUnits
    .map((u: any) => ({ name: u.name, ann_rev: result.unitPL[u.id]?.ann_rev || 0 }))
    .filter((u: any) => u.ann_rev > 0)
  const totalUnitRevenue = activeUnitsWithRevenue.reduce((s: number, u: any) => s + u.ann_rev, 0)
  const businessUnits = activeUnitsWithRevenue
    .map((u: any) => ({ name: u.name, revenuePct: totalUnitRevenue > 0 ? (u.ann_rev / totalUnitRevenue) * 100 : 0 }))
    .sort((a: any, b: any) => b.revenuePct - a.revenuePct)

  // Currency-neutral performance ratios, from the same engine run, so the
  // portfolio layer can benchmark them (see SnapshotPerformance). Cost ratio is
  // total operating costs / revenue = 1 - EBITDA margin. Nulls left as null.
  const ebitdaM = ebitdaMarginPct(m.total_ebitda, m.total_revenue)
  const growthPct = revenueGrowthPctFromSeries(result.con.rev)
  const performance = {
    revenueGrowthPct: growthPct,
    costRatioPct: ebitdaM === null ? null : Math.round(100 - ebitdaM),
    grossMarginPct: grossMarginPct(m.total_gp, m.total_revenue),
    ebitdaMarginPct: ebitdaM,
    netMarginPct: netMarginPct(m.total_npat, m.total_revenue),
    dscrMin: s.hasDebt ? (s.dscrMin ?? null) : null,
    ruleOf40: ruleOf40(growthPct, ebitdaM),
  }

  return {
    clientId: client.id,
    name: config.business_name,
    sector: client.sector ?? null,
    country: client.country ?? null,
    programmeId: client.programme_id ?? null,
    irScore: s.irScore,
    irTier: s.irTier,
    lrs: lrsCurrent,
    confidenceScore: confidence.score,
    confidenceBadges: confidence.badges,
    fac,
    currency: config.currency,
    annualRevenue: m.total_revenue,
    businessUnits,
    consentToBeNamed: !!client.portfolio_consent_named,
    performance,
  }
}

// Short-lived, single-slot, in-memory cache. Every filter click on the
// Portfolio Intelligence Hub (sector/country/programme/stage) was
// re-running this ENTIRE function from scratch -- a full DB round-trip
// and a complete financial-model run for every financial client on the
// platform -- even though only the cheap, pure aggregation step
// (buildPortfolioViewData) actually depends on the filter. That's the
// real cause of "the portfolio tab is slow": not the first load, but
// every subsequent click re-paying the same cost.
//
// This cache only helps a warm serverless instance (Vercel may spin up
// a fresh one at any time, in which case it's a no-op and behaves
// exactly as before) -- a best-effort speed-up, not a guarantee. The
// 60-second TTL trades a small amount of staleness (a client's numbers
// updated in the last minute might not show yet) for the common case of
// a coach clicking through several filters in one sitting -- acceptable
// for a bizdev/portfolio-review tool that was never real-time to begin
// with, and self-corrects on the very next request past the window.
let snapshotCache: { data: ClientSnapshot[]; expiresAt: number } | null = null
const SNAPSHOT_CACHE_TTL_MS = 60_000

// Loads and builds a ClientSnapshot for every financial client on the
// platform. The only DB-touching step -- both callers pass in their own
// admin (service-role) Supabase client.
export async function loadAllClientSnapshots(admin: SupabaseClient, forceRefresh = false): Promise<ClientSnapshot[]> {
  const now = Date.now()
  if (!forceRefresh && snapshotCache && snapshotCache.expiresAt > now) return snapshotCache.data

  const { data: clients } = await admin.from('engagement_clients').select('*').eq('engagement_mode', 'financial')
  const financialClients = clients || []
  if (financialClients.length === 0) return []

  const { data: configRows } = await admin.from('generic_model_config').select('*').in('client_id', financialClients.map((c: any) => c.id))
  const configByClient = Object.fromEntries((configRows || []).map((c: any) => [c.client_id, c]))

  const snapshots = (await Promise.all(
    financialClients.map((c: any) => buildClientSnapshot(admin, c, configByClient[c.id]).catch(() => null))
  )).filter((s): s is ClientSnapshot => s !== null)

  snapshotCache = { data: snapshots, expiresAt: now + SNAPSHOT_CACHE_TTL_MS }
  return snapshots
}

export interface PortfolioViewData {
  portfolio: PortfolioOverview
  segment: SegmentReport | null
  snapshotCount: number
  profiles: AnonymisedProfile[]
  filterOptions: { sectors: string[]; countries: string[]; programmeIds: string[] }
  portfolioDimensionFailures: DimensionFailure[]
  segmentDimensionFailures: DimensionFailure[] | null
  performanceSummary: PerformanceSummary
  segmentPerformanceSummary: PerformanceSummary | null
}

// Assembles the full response shape both /api/portfolio-intelligence (coach,
// any filter) and the token-based external-access route (fixed filter, or
// none for a whole-portfolio grant) need -- the only difference between
// the two callers is WHERE the filter comes from (a coach's live UI
// selection vs. a grant's fixed segment_filter).
export function buildPortfolioViewData(snapshots: ClientSnapshot[], filter: SegmentFilter | null): PortfolioViewData {
  const portfolio = computePortfolioOverview(snapshots)
  const segment = filter ? computeSegmentReport(snapshots, filter) : null

  const distinctValues = (pick: (s: ClientSnapshot) => string | null) =>
    Array.from(new Set(snapshots.map(pick).filter((v): v is string => !!v))).sort()

  const profileSnapshots = filter ? snapshots.filter(s => matchesFilter(s, filter)) : snapshots
  const profiles = profileSnapshots.map(s => buildAnonymisedProfile(s, snapshots))

  return {
    portfolio, segment, snapshotCount: snapshots.length, profiles,
    filterOptions: {
      sectors: distinctValues(s => s.sector),
      countries: distinctValues(s => s.country),
      programmeIds: distinctValues(s => s.programmeId),
    },
    portfolioDimensionFailures: rankedDimensionFailures(snapshots),
    segmentDimensionFailures: filter ? rankedDimensionFailures(profileSnapshots) : null,
    performanceSummary: computePerformanceSummary(snapshots),
    segmentPerformanceSummary: filter ? computePerformanceSummary(profileSnapshots) : null,
  }
}
