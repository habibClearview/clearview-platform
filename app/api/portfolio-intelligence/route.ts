// ============================================================
// API ROUTE: /api/portfolio-intelligence
// Aggregated, portfolio-level view across every financial client on the
// platform -- see src/lib/portfolio-intelligence.ts for the aggregation
// math (pure, tested independently). This route's only job is to
// assemble one ClientSnapshot per client (the same LRS/FAC construction
// GenericDashboard.tsx and investment-brief-builder.ts already use,
// built independently here rather than refactored out of the shipped
// document builder to keep this addition low-risk) and hand the array
// to that module.
//
// Restricted to super_coach only for now -- this is Habib's own
// bizdev/programme-design tool (Product Development Specification §5.1),
// not a per-client view a scoped co-implementer or funder needs.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { runGenericModel, buildMonthLabels, buildYearGroups, type GenericModelConfig } from '@/lib/generic-engine'
import { computeScores, defaultCoachAssessment } from '@/lib/scoring-engine'
import { computeLiquidityReadinessScore, computeLRSTimeSeries } from '@/lib/liquidity-readiness'
import { computeIRR, buildInvestmentCashFlows, computeCustomerGrowthSummary, monthlyRateToAnnualRate } from '@/lib/investment-metrics'
import { periodForMonthIndex } from '@/lib/month-end-close'
import { assessConfidence } from '@/lib/confidence'
import { buildPeriodSignals } from '@/lib/verification-display'
import { computeSeasonalCashProjection } from '@/lib/seasonal-cash-projection'
import { computeFundAbsorptionCapacity } from '@/lib/fund-absorption-capacity'
import { computePortfolioOverview, computeSegmentReport, buildAnonymisedProfile, matchesFilter, type ClientSnapshot, type SegmentFilter } from '@/lib/portfolio-intelligence'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel environment variables.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function buildClientSnapshot(admin: ReturnType<typeof getAdminClient>, client: any, configRow: any): Promise<ClientSnapshot | null> {
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
  }
}

export async function POST(req: NextRequest) {
  try {
    const { requesterToken, filter } = await req.json() as { requesterToken: string; filter?: SegmentFilter }

    const admin = getAdminClient()
    const { data: { user }, error: authErr } = await admin.auth.getUser(requesterToken)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: profile } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role !== 'super_coach') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { data: clients } = await admin.from('engagement_clients').select('*').eq('engagement_mode', 'financial')
    const financialClients = clients || []
    if (financialClients.length === 0) {
      return NextResponse.json({ portfolio: computePortfolioOverview([]), segment: filter ? computeSegmentReport([], filter) : null, snapshotCount: 0, profiles: [], filterOptions: { sectors: [], countries: [], programmeIds: [] } })
    }

    const { data: configRows } = await admin.from('generic_model_config').select('*').in('client_id', financialClients.map(c => c.id))
    const configByClient = Object.fromEntries((configRows || []).map((c: any) => [c.client_id, c]))

    const snapshots = (await Promise.all(
      financialClients.map(c => buildClientSnapshot(admin, c, configByClient[c.id]).catch(() => null))
    )).filter((s): s is ClientSnapshot => s !== null)

    const portfolio = computePortfolioOverview(snapshots)
    const segment = filter ? computeSegmentReport(snapshots, filter) : null

    // Distinct, non-null values for each filterable field -- drives the
    // filter dropdowns without a second round-trip.
    const distinctValues = (pick: (s: ClientSnapshot) => string | null) =>
      Array.from(new Set(snapshots.map(pick).filter((v): v is string => !!v))).sort()

    // Level 3: anonymised individual profiles, matching the active
    // filter if any. Built server-side and sent AS the final shape --
    // the raw ClientSnapshot (which carries the real clientId and name)
    // never leaves this route. A non-consenting business's real name is
    // never present anywhere in this response, not just hidden in the UI.
    const profileSnapshots = filter ? snapshots.filter(s => matchesFilter(s, filter)) : snapshots
    const profiles = profileSnapshots.map(s => buildAnonymisedProfile(s, snapshots))

    return NextResponse.json({
      portfolio, segment, snapshotCount: snapshots.length, profiles,
      filterOptions: {
        sectors: distinctValues(s => s.sector),
        countries: distinctValues(s => s.country),
        programmeIds: distinctValues(s => s.programmeId),
      },
    })
  } catch (err: any) {
    console.error('Portfolio intelligence error:', err)
    return NextResponse.json({ error: err.message || 'An unexpected error occurred' }, { status: err.status || 500 })
  }
}
