// ============================================================
// API ROUTE: /api/investment-pitch
// AI-written investment brief, infographic/box style,
// Clearview branding, concise not text-heavy
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, BorderStyle, WidthType, AlignmentType, ShadingType,
} from 'docx'
import { runGenericModel, buildMonthLabels, buildYearGroups, type GenericModelConfig } from '@/lib/generic-engine'
import { computeScores, defaultCoachAssessment, computeTradeCredit, dscrLabel, dscrColor, dscrRating } from '@/lib/scoring-engine'
import { CLEARVIEW_STYLE } from '@/lib/ai-style'
import { computeLiquidityReadinessScore, computeLRSTimeSeries, computeFitScore, FIT_SCORE_PRESETS, LRS_WEIGHTS } from '@/lib/liquidity-readiness'
import { computeIRR, buildInvestmentCashFlows, computeCustomerGrowthSummary, monthlyRateToAnnualRate } from '@/lib/investment-metrics'
import { periodForMonthIndex } from '@/lib/month-end-close'
import { assessConfidence } from '@/lib/confidence'
import { buildPeriodSignals, partitionBadges, CONFIDENCE_DISPLAY, BADGE_DISPLAY, READINESS_DISPLAY, type ReadinessStatus } from '@/lib/verification-display'
import { computeSeasonalCashProjection } from '@/lib/seasonal-cash-projection'
import { computeCapitalAbsorptionCapacity, type CACTypeResult } from '@/lib/capital-absorption-capacity'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel environment variables.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ── Clearview brand colours ──
const NAVY   = '1B2A4A'
const CYAN   = '00B4D8'
const CREAM  = 'F8F4EE'
const WHITE  = 'FFFFFF'
const SLATE  = '4A5A6A'
const GREEN  = '1A7A4A'
const AMBER  = 'B8860B'
const RED    = 'C0392B'
const BORDER = 'D8E0E8'
const LBBLUE = 'EBF8FF'

function fmt(n: number, cc: string) {
  if (!n || isNaN(n)) return `${cc} 0`
  const v = Math.round(Math.abs(n))
  const s = v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v.toString()
  return `${cc} ${s}${n < 0 ? ' (deficit)' : ''}`
}
function pct(n: number) { return `${((n||0)*100).toFixed(1)}%` }

// ── Layout helpers ──
function spacer(before = 0, after = 0) {
  return new Paragraph({ children: [new TextRun('')], spacing: { before, after } })
}

// Full-width navy section header
function sectionHeader(text: string) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
    rows: [new TableRow({ children: [new TableCell({
      shading: { fill: NAVY, type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 200, right: 200 },
      children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: CYAN, size: 22, font: 'Arial', allCaps: true })] })],
    })] })],
  })
}

// Metric box: used in rows of 3-4
function metricBox(label: string, value: string, sub: string, color: string, width: number) {
  const b = { style: BorderStyle.SINGLE, size: 4, color: CYAN }
  const borders = { top: b, bottom: b, left: b, right: b }
  return new TableCell({
    borders,
    shading: { fill: LBBLUE, type: ShadingType.CLEAR },
    width: { size: width, type: WidthType.DXA },
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: value, bold: true, color, size: 36, font: 'Georgia' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: label, color: NAVY, size: 16, font: 'Arial', bold: true })] }),
      ...(sub ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: sub, color: SLATE, size: 14, font: 'Arial', italics: true })] })] : []),
    ],
  })
}

function metricRow(metrics: { label: string; value: string; sub: string; color: string }[]) {
  const cellWidth = Math.floor(9360 / metrics.length)
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: metrics.map(() => cellWidth),
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
    rows: [new TableRow({ children: metrics.map(m => metricBox(m.label, m.value, m.sub, m.color, cellWidth)) })],
  })
}

// Two-column info box
function infoBox(left: string[], right: string[], leftWidth = 4500, rightWidth = 4860) {
  const b = { style: BorderStyle.SINGLE, size: 2, color: BORDER }
  const borders = { top: b, bottom: b, left: b, right: b }
  const noBorder = { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [leftWidth, rightWidth],
    borders: noBorder,
    rows: [new TableRow({ children: [
      new TableCell({ borders, shading: { fill: CREAM, type: ShadingType.CLEAR }, width: { size: leftWidth, type: WidthType.DXA }, margins: { top: 120, bottom: 120, left: 160, right: 160 },
        children: left.map(t => new Paragraph({ children: [new TextRun({ text: t, size: 20, font: 'Arial', color: NAVY })] })) }),
      new TableCell({ borders, shading: { fill: WHITE, type: ShadingType.CLEAR }, width: { size: rightWidth, type: WidthType.DXA }, margins: { top: 120, bottom: 120, left: 160, right: 160 },
        children: right.map(t => new Paragraph({ children: [new TextRun({ text: t, size: 20, font: 'Arial', color: NAVY })] })) }),
    ]})],
  })
}

// Short bullet-style paragraph
function bullet(text: string, color = NAVY) {
  return new Paragraph({
    bullet: { level: 0 },
    children: [new TextRun({ text, size: 20, font: 'Arial', color })],
    spacing: { after: 60 },
  })
}

function note(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, size: 18, font: 'Arial', color: SLATE, italics: true })],
    spacing: { after: 80 },
  })
}

// Score badge row
function scoreBadge(label: string, score: string, rating: string, color: string, width: number) {
  const b = { style: BorderStyle.SINGLE, size: 2, color: BORDER }
  const borders = { top: b, bottom: b, left: b, right: b }
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: score, bold: true, color, size: 28, font: 'Georgia' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: label, color: NAVY, size: 16, bold: true, font: 'Arial' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: rating, color, size: 15, font: 'Arial', italics: true })] }),
    ],
  })
}

async function callClaude(prompt: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return ''
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 3000, system: CLEARVIEW_STYLE, messages: [{ role: 'user', content: prompt }] }),
  })
  const data = await response.json()
  return data.content?.[0]?.text || ''
}

function shortPara(text: string) {
  return new Paragraph({
    children: [new TextRun({ text: text.trim(), size: 20, font: 'Arial', color: NAVY })],
    spacing: { after: 120 },
    alignment: AlignmentType.JUSTIFIED,
  })
}

export async function POST(req: NextRequest) {
  try {
    const { clientId } = await req.json() as { clientId: string }
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()

    const [
      { data: client },
      { data: configRow },
      { data: coachBriefing },
      { data: events },
      { data: actualsRows },
      { data: periodCloseRows },
      { data: providerLinks },
      { data: providerTx },
    ] = await Promise.all([
      admin.from('engagement_clients').select('*').eq('id', clientId).single(),
      admin.from('generic_model_config').select('*').eq('client_id', clientId).single(),
      admin.from('coach_briefings').select('*').eq('client_id', clientId).order('generated_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('management_events').select('*').eq('client_id', clientId).order('date', { ascending: false }),
      admin.from('generic_actuals').select('period,field_line_values').eq('client_id', clientId),
      admin.from('generic_period_close').select('period,closed').eq('client_id', clientId).eq('closed', true),
      admin.from('provider_links').select('status').eq('client_id', clientId),
      admin.from('provider_transactions').select('amount,reconciliation_state').eq('client_id', clientId),
    ])

    if (!configRow) return NextResponse.json({ error: 'No financial model found. Set up the financial plan first.' }, { status: 404 })

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
    const cc = config.currency
    const m = result.metrics
    const s = result.scores
    const assess = config.settings.coach_assessment || defaultCoachAssessment()
    const cashWarnings = result.cf.close.filter((v: number) => v < 0).length
    const hasTradeCredit = (config.settings.trade_credit_lines || []).length > 0
    const hasMarketing = (events?.length || 0) > 0
    const hasDebt = (config.settings.debts || []).length > 0 || (config.settings.capital_structure?.bank_loan || 0) > 0

    // CAC by channel if marketing events exist
    const channelMap: Record<string, { cost: number; customers: number }> = {}
    ;(events || []).forEach((e: any) => {
      const ch = e.channel || 'Unspecified'
      if (!channelMap[ch]) channelMap[ch] = { cost: 0, customers: 0 }
      channelMap[ch].cost += e.cost || 0
      channelMap[ch].customers += e.customers_acquired || 0
    })
    const channels = Object.entries(channelMap).map(([ch, v]) => ({
      channel: ch, cac: v.customers > 0 ? v.cost / v.customers : null, ...v,
    })).sort((a, b) => (a.cac || 999999) - (b.cac || 999999))

    // Trade credit DSO/DPO
    const tc = s.tradeCredit
    const hasTCData = tc.dso > 0 || tc.dpo > 0

    // ── Liquidity Readiness Score: seven dimensions + Bank/Investor Fit ──
    // Same construction as the live Liquidity Readiness tab (GenericDashboard.tsx)
    // and VerificationRecognition.tsx -- built from real engine outputs and real
    // reconciliation tables, never estimated for the document.
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
      dscrMin: s.dscrMin, hasDebt: s.hasDebt, cashGaps: s.cashGaps, tradeCreditDpo: tc.dpo,
      assess,
    }, yearGroups, monthLabelsFull)
    const lrsCurrent = lrsSeries.years[lrsSeries.years.length - 1]?.result || computeLiquidityReadinessScore({
      annualRevenue: 0, annualEbitda: 0, annualGrossProfit: 0, cashClose: [0], monthlyOpex: [0], businessBreakeven: 0,
      totalEquity: 0, totalLiabilities: 0, dscrMin: null, hasDebt: false, cashGaps: 0, tradeCreditDpo: 0,
      monthsOfActualData: 0, monthsElapsed: 0, monthsClosed: 0, fieldAppMonths: 0, revenueGrowthRate: 0,
      customersAcquired: 0, irr: null, revenuePerHead: 0, assess,
    })
    const bankFit = computeFitScore(lrsCurrent, FIT_SCORE_PRESETS.bank.weights)
    const investorFit = computeFitScore(lrsCurrent, FIT_SCORE_PRESETS.investor.weights)
    const grantFit = computeFitScore(lrsCurrent, FIT_SCORE_PRESETS.grant.weights)
    const equityFit = computeFitScore(lrsCurrent, FIT_SCORE_PRESETS.equity.weights)
    const consignmentFit = computeFitScore(lrsCurrent, FIT_SCORE_PRESETS.consignment.weights)
    const recoverableFit = computeFitScore(lrsCurrent, FIT_SCORE_PRESETS.recoverable.weights)
    const lrsWord = lrsCurrent.score >= 70 ? 'Strong' : lrsCurrent.score >= 50 ? 'Building' : lrsCurrent.score >= 30 ? 'Developing' : 'Early'
    const scoreColorLRS = (v: number) => v >= 70 ? GREEN : v >= 50 ? CYAN : v >= 30 ? AMBER : RED

    // ── §SCP: Seasonal Cash Position Projection ──
    // Same inputs the calculation module expects: gross profit (not raw
    // revenue) as the cash driver, and a 12-month-cycle seasonal index
    // derived from this business's own closed actuals.
    const lastActualMonthIndex = Math.max(0, periodIsActual.lastIndexOf(true))
    const scp = computeSeasonalCashProjection({
      cfClose: result.cf.close,
      rev: result.con.rev,
      gp: result.con.gp,
      debtRepayment: result.debtSchedule.totalRepayment,
      monthsClosedFlags,
      currentMonthIndex: lastActualMonthIndex,
      latestMonthlyOpex: result.con.opex[lastActualMonthIndex] ?? 0,
    })

    // ── §CAC: Capital Absorption Capacity ──
    // Built on top of §SCP's stress test above. The input-shop unit is
    // resolved here by name (there is no dedicated "input shop" unit type
    // in the data model) -- consistent with how the calculation module
    // itself expects this classification to be done by the caller.
    const inputShopBusinessUnit = result.allocUnits.find((u: any) =>
      (u.name || '').toLowerCase().includes('input') || (u.short || '').toLowerCase().includes('input'))
    const inputShopUnitPL = inputShopBusinessUnit ? result.unitPL[inputShopBusinessUnit.id] : null
    const productionCapacityIndicator = lrsCurrent.dimensions.capacity.indicators.find(ind => ind.label === 'Production Capacity')
    const recordsCompletenessIndicator = lrsCurrent.dimensions.compliance.indicators.find(ind => ind.label === 'Financial Reporting')
    const cac = computeCapitalAbsorptionCapacity({
      stressClose_4wk: scp.stressClose_4wk,
      scpDataConfidence: scp.dataConfidence,
      existingAnnualRate: (config.settings.debts && config.settings.debts[0]?.annualRate) || undefined,
      cashConversionGapDays: tc.cashConversionGap,
      annualRevenue: m.total_revenue,
      annualGrossProfit: m.total_gp,
      annualEbitda: m.total_ebitda,
      annualNpat: m.total_npat,
      productionCapacityScore: productionCapacityIndicator?.value ?? 0,
      governanceScore: Number(assess.governance) || 0,
      revTrend: s.revTrend,
      inputShopUnit: inputShopUnitPL ? { annualRevenue: inputShopUnitPL.ann_rev, annualGrossProfit: inputShopUnitPL.ann_gp } : null,
      recordsCompletenessPct: recordsCompletenessIndicator?.value ?? 0,
    })

    // ── Verification & Recognition: readiness, confidence, badges ──
    // Same construction as VerificationRecognition.tsx -- reconciliation figures
    // default to zero for a cash-only/unlinked business, which the confidence
    // model treats as "no verification signal", never as a penalty.
    const STATUS_RANK: Record<ReadinessStatus, number> = { not_started: 0, wallet_activated: 1, link_pending: 2, tier1_active: 3 }
    let readiness: ReadinessStatus = 'not_started'
    ;(providerLinks || []).forEach((r: any) => {
      const st = (r.status as ReadinessStatus) || 'not_started'
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
    const { earned: earnedBadges, locked: lockedBadges } = partitionBadges(confidence.badges)
    const readinessInfo = READINESS_DISPLAY[readiness]
    const confInfo = CONFIDENCE_DISPLAY[confidence.label]

    // Unit summaries
    const unitLines = result.allocUnits.map((u: any) => {
      const pl = result.unitPL[u.id]
      if (!pl || pl.ann_rev === 0) return null
      return `${u.name}: ${fmt(pl.ann_rev, cc)} revenue · ${pct(pl.gp_margin)} gross margin`
    }).filter(Boolean)

    // ── AI narrative sections ──
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY

    let valueProposition = '', businessModel = '', scaleGrowth = '', riskMitigation = '', recommendation = ''

    if (hasApiKey) {
      const context = `
Business: ${config.business_name}, ${client?.sector || 'agribusiness'} sector, ${client?.country || 'Uganda'}
Revenue: ${fmt(m.total_revenue, cc)} | Gross Margin: ${pct(m.gross_margin)} | EBITDA: ${fmt(m.total_ebitda, cc)} (${pct(m.net_margin)})
Breakeven: ${fmt(m.business_breakeven, cc)} | Headroom: ${fmt(m.total_revenue - m.business_breakeven, cc)}
Investment Readiness: ${s.irScore}/30 (${s.irTier}) | Credit Risk: ${s.score}/100 (${s.classification}) | DSCR: ${dscrLabel(s)}
Liquidity Readiness: ${Math.round(lrsCurrent.score)}/100 (${lrsWord}) | Bank Fit: ${Math.round(bankFit)}/100 | Investor Fit: ${Math.round(investorFit)}/100
Visibility: ${Math.round(lrsCurrent.dimensions.visibility.score)}/100 | Trust: ${Math.round(lrsCurrent.dimensions.trust.score)}/100
Verification confidence this period: ${confInfo.title} (${confidence.score}/100)${earnedBadges.length > 0 ? `; badges earned: ${earnedBadges.map(b => BADGE_DISPLAY[b].title).join(', ')}` : '; no verification badges earned yet'}
Units: ${unitLines.join('; ')}
${hasMarketing ? `Top marketing channel by CAC: ${channels[0]?.channel} at ${channels[0]?.cac ? fmt(channels[0].cac, cc) : 'unquantified'} per customer` : ''}
${hasTCData ? `DSO: ${tc.dso.toFixed(0)} days | DPO: ${tc.dpo.toFixed(0)} days | Cash conversion gap: ${tc.cashConversionGap.toFixed(0)} days` : ''}
Coach assessment: Commercial model ${assess.commercialModel}/5 | Management ${assess.managementCapability}/4 | Market evidence ${assess.marketEvidence}/5 | Governance ${assess.governance}/5
${coachBriefing?.briefing_text ? `Coach narrative: ${coachBriefing.briefing_text.slice(0, 500)}` : ''}
`
      const [vp, bm, sg, rm, rec] = await Promise.all([
        callClaude(`Write 2 punchy sentences on the value proposition of ${config.business_name} for an investment brief. Who does it serve, what problem does it solve, and what makes it distinctive? No jargon. Data:\n${context}`),
        callClaude(`Write 2 or 3 sentences on how ${config.business_name} makes money, covering its revenue model, key customers, and channels. Mention the gross margin and what it says about the model. Data:\n${context}`),
        callClaude(`Write 2 sentences on the scale potential of ${config.business_name}. What is the current reach and what enables it to grow without rebuilding from scratch? Data:\n${context}`),
        callClaude(`Name 2 specific risks for ${config.business_name} and one mitigation for each. Be honest and concrete. Do not use dashes anywhere. Format as: Risk 1: [name]. [one sentence description]. Mitigation: [one sentence]. Risk 2: same format. Data:\n${context}`),
        callClaude(`Write 3 sentences giving an investment recommendation for ${config.business_name}. State clearly: is it investment-ready now, near-ready with conditions, or at an earlier stage? What is the single most important thing that would improve the case? Data:\n${context}`),
      ])
      valueProposition = vp
      businessModel = bm
      scaleGrowth = sg
      riskMitigation = rm
      recommendation = rec
    }

    // ── Build document ──
    const children: any[] = []

    // ── COVER BAND ──
    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [9360],
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      rows: [new TableRow({ children: [new TableCell({
        shading: { fill: NAVY, type: ShadingType.CLEAR },
        margins: { top: 200, bottom: 200, left: 280, right: 280 },
        children: [
          new Paragraph({ children: [new TextRun({ text: config.business_name, bold: true, color: WHITE, size: 48, font: 'Georgia' })] }),
          new Paragraph({ children: [new TextRun({ text: `${client?.sector || 'Agribusiness'} · ${client?.country || 'Uganda'}`, color: CYAN, size: 22, font: 'Arial' })] }),
          new Paragraph({ children: [new TextRun({ text: `Investment Readiness Brief · ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`, color: 'AAAAAA', size: 18, font: 'Arial', italics: true })] }),
        ],
      })] })],
    }))
    children.push(spacer(0, 200))

    // ── INVESTMENT READINESS SCORECARD ──
    children.push(sectionHeader('Investment Readiness Scorecard'))
    children.push(spacer(0, 80))
    const w4 = Math.floor(9360 / 4)
    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [w4, w4, w4, w4],
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      rows: [new TableRow({ children: [
        scoreBadge('Investment Readiness', `${s.irScore}/30`, s.irTier, s.irScore >= 24 ? GREEN : s.irScore >= 17 ? CYAN : AMBER, w4),
        scoreBadge('Credit Risk Score', `${s.score}/100`, s.classification, s.classification === 'Stable' ? GREEN : s.classification === 'At Risk' ? AMBER : RED, w4),
        scoreBadge('Going Concern', `${s.gcScore}/20`, s.gcRating, s.gcRating === 'Strong' ? GREEN : s.gcRating === 'Adequate' ? CYAN : AMBER, w4),
        scoreBadge('Debt Service (DSCR)', dscrLabel(s), dscrRating(s), dscrColor(s,{green:GREEN,amber:AMBER,red:RED,slate:SLATE}), w4),
      ]})],
    }))
    children.push(spacer(0, 200))

    // ── LIQUIDITY READINESS & LENDER FIT ──
    children.push(sectionHeader('Liquidity Readiness & Lender Fit'))
    children.push(spacer(0, 80))
    const w3 = Math.floor(9360 / 3)
    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [w3, w3, w3],
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      rows: [new TableRow({ children: [
        scoreBadge('Liquidity Readiness', `${Math.round(lrsCurrent.score)}/100`, lrsWord, scoreColorLRS(lrsCurrent.score), w3),
        scoreBadge(FIT_SCORE_PRESETS.bank.label, `${Math.round(bankFit)}/100`, bankFit >= 50 ? 'Fit' : 'Developing fit', scoreColorLRS(bankFit), w3),
        scoreBadge(FIT_SCORE_PRESETS.investor.label, `${Math.round(investorFit)}/100`, investorFit >= 50 ? 'Fit' : 'Developing fit', scoreColorLRS(investorFit), w3),
      ]})],
    }))
    children.push(spacer(0, 100))
    children.push(metricRow([
      { label: FIT_SCORE_PRESETS.grant.label, value: `${Math.round(grantFit)}/100`, sub: grantFit >= 50 ? 'Fit' : 'Developing fit', color: scoreColorLRS(grantFit) },
      { label: FIT_SCORE_PRESETS.equity.label, value: `${Math.round(equityFit)}/100`, sub: equityFit >= 50 ? 'Fit' : 'Developing fit', color: scoreColorLRS(equityFit) },
      { label: FIT_SCORE_PRESETS.consignment.label, value: `${Math.round(consignmentFit)}/100`, sub: consignmentFit >= 50 ? 'Fit' : 'Developing fit', color: scoreColorLRS(consignmentFit) },
      { label: FIT_SCORE_PRESETS.recoverable.label, value: `${Math.round(recoverableFit)}/100`, sub: recoverableFit >= 50 ? 'Fit' : 'Developing fit', color: scoreColorLRS(recoverableFit) },
    ]))
    children.push(spacer(0, 140))
    const lrsDims: { key: keyof typeof lrsCurrent.dimensions; label: string }[] = [
      { key: 'marketOpportunity', label: 'Market Opportunity' },
      { key: 'visibility', label: 'Visibility' },
      { key: 'trust', label: 'Trust' },
      { key: 'profitability', label: 'Profitability' },
      { key: 'capacity', label: 'Capacity' },
      { key: 'resilience', label: 'Resilience' },
      { key: 'compliance', label: 'Compliance' },
    ]
    children.push(metricRow(lrsDims.slice(0, 4).map(d => ({
      label: d.label, value: `${Math.round(lrsCurrent.dimensions[d.key].score)}/100`,
      sub: `${Math.round(LRS_WEIGHTS[d.key] * 100)}% weight`, color: scoreColorLRS(lrsCurrent.dimensions[d.key].score),
    }))))
    children.push(spacer(0, 80))
    children.push(metricRow(lrsDims.slice(4, 7).map(d => ({
      label: d.label, value: `${Math.round(lrsCurrent.dimensions[d.key].score)}/100`,
      sub: `${Math.round(LRS_WEIGHTS[d.key] * 100)}% weight`, color: scoreColorLRS(lrsCurrent.dimensions[d.key].score),
    }))))
    children.push(spacer(0, 160))
    // Visibility and Trust drilldown -- the two dimensions verification lifts directly
    children.push(infoBox(
      ['VISIBILITY', `${Math.round(lrsCurrent.dimensions.visibility.score)}/100`, '', ...lrsCurrent.dimensions.visibility.indicators.map(ind => `${ind.label}: ${ind.note}`)],
      ['TRUST', `${Math.round(lrsCurrent.dimensions.trust.score)}/100`, '', ...lrsCurrent.dimensions.trust.indicators.map(ind => `${ind.label}: ${ind.note}`)],
    ))
    children.push(spacer(0, 200))

    // ── FINANCIAL SNAPSHOT ──
    children.push(sectionHeader('Financial Snapshot'))
    children.push(spacer(0, 80))
    children.push(metricRow([
      { label: 'Revenue', value: fmt(m.total_revenue, cc), sub: 'planned period', color: NAVY },
      { label: 'Gross Margin', value: pct(m.gross_margin), sub: 'after direct costs', color: m.gross_margin > 0.3 ? GREEN : AMBER },
      { label: 'EBITDA', value: fmt(m.total_ebitda, cc), sub: pct(m.net_margin) + ' margin', color: m.total_ebitda >= 0 ? GREEN : RED },
      { label: 'Breakeven', value: fmt(m.business_breakeven, cc), sub: m.total_revenue >= m.business_breakeven ? `${fmt(m.total_revenue - m.business_breakeven, cc)} headroom` : 'not yet reached', color: m.total_revenue >= m.business_breakeven ? GREEN : RED },
    ]))
    children.push(spacer(0, 80))
    children.push(metricRow([
      { label: 'Cash Position', value: cashWarnings === 0 ? 'Positive' : `${cashWarnings} months at risk`, sub: cashWarnings === 0 ? 'no shortfall projected' : `lowest: ${fmt(m.min_cash, cc)}`, color: cashWarnings === 0 ? GREEN : RED },
      { label: 'Revenue Trend', value: s.revTrend, sub: 'across planning period', color: s.revTrend === 'Growing' ? GREEN : s.revTrend === 'Stable' ? AMBER : RED },
      { label: 'Staff Cost', value: pct(m.staff_cost_pct), sub: `${m.total_headcount} staff · ${fmt(m.revenue_per_head, cc)}/head`, color: m.staff_cost_pct < 0.35 ? GREEN : AMBER },
      { label: 'Business Units', value: String(config.business_units.filter((u: any) => u.active).length), sub: config.business_units.filter((u: any) => u.active).map((u: any) => u.short || u.name.slice(0,8)).join(' · '), color: NAVY },
    ]))
    children.push(spacer(0, 200))

    // ── SEASONAL CASH POSITION PROJECTION ──
    children.push(sectionHeader('Seasonal Cash Position Projection'))
    children.push(spacer(0, 80))
    if (scp.dataConfidence === 'insufficient') {
      children.push(note('Add 3+ months of closed actuals to unlock a seasonal cash projection for this business.'))
    } else {
      const troughStress = scp.troughMonthOffset ? scp.stressClose_4wk[scp.troughMonthOffset - 1] : null
      children.push(metricRow([
        { label: 'Tightest Point (12mo)', value: scp.troughValue !== null ? fmt(scp.troughValue, cc) : 'n/a', sub: scp.troughMonthOffset ? `in month ${scp.troughMonthOffset}` : '', color: (scp.troughValue ?? 0) >= 0 ? GREEN : RED },
        { label: 'With 4-Week Payment Delay', value: troughStress !== null ? fmt(troughStress, cc) : 'n/a', sub: 'stress-tested trough', color: (troughStress ?? 0) >= 0 ? AMBER : RED },
        { label: 'Data Confidence', value: scp.dataConfidence === 'reliable' ? 'Reliable' : 'Limited', sub: scp.dataConfidence === 'reliable' ? '6+ closed months' : '3-5 closed months', color: scp.dataConfidence === 'reliable' ? GREEN : AMBER },
      ]))
      children.push(spacer(0, 80))
      children.push(note('Projection is derived from this business\'s own historical seasonal pattern, not a generic assumption. Gross profit (not raw revenue) is the cash-generating driver, so cost of sales is already accounted for.'))
    }
    children.push(spacer(0, 200))

    // ── CAPITAL ABSORPTION CAPACITY ──
    children.push(sectionHeader('Capital Absorption Capacity'))
    children.push(spacer(0, 80))
    const cacDisplay = (t: CACTypeResult): { value: string; sub: string; color: string } => {
      if (t.capacity === null) return { value: 'Not yet available', sub: t.reason || 'Add 3+ months of actuals to unlock', color: AMBER }
      if (t.capacity === 0) return { value: fmt(0, cc), sub: t.reason || '', color: RED }
      return { value: `${fmt(t.low!, cc)} – ${fmt(t.high!, cc)}`, sub: 'confidence range', color: GREEN }
    }
    const creditD = cacDisplay(cac.credit), grantD = cacDisplay(cac.grant), equityD = cacDisplay(cac.equity), consignD = cacDisplay(cac.consignment)
    children.push(metricRow([
      { label: 'Credit (Debt)', value: creditD.value, sub: creditD.sub, color: creditD.color },
      { label: 'Grant (Non-Repayable)', value: grantD.value, sub: grantD.sub, color: grantD.color },
    ]))
    children.push(spacer(0, 80))
    children.push(metricRow([
      { label: 'Equity', value: equityD.value, sub: equityD.sub, color: equityD.color },
      { label: 'Consignment Stock', value: consignD.value, sub: consignD.sub, color: consignD.color },
    ]))
    children.push(spacer(0, 80))
    const recoverableD = cacDisplay(cac.recoverableGrant)
    children.push(metricRow([
      { label: 'Recoverable Grant (Blended)', value: recoverableD.value, sub: `${Math.round(cac.repayableFractionUsed * 100)}% repayable${cac.repayableFractionWasDefaulted ? ' — default assumption' : ''}`, color: recoverableD.color },
    ]))
    children.push(spacer(0, 140))
    const cacNotes = [cac.credit, cac.grant, cac.equity, cac.consignment, cac.recoverableGrant]
      .flatMap(t => [...(t.reason ? [t.reason] : []), ...t.conditions])
    if (cacNotes.length > 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: 'Conditions & Reasons', bold: true, color: NAVY, size: 18, font: 'Arial', allCaps: true })], spacing: { after: 80 } }))
      Array.from(new Set(cacNotes)).forEach(txt => children.push(bullet(txt, SLATE)))
    }
    children.push(spacer(0, 80))
    children.push(note('These figures size how much capital this business can absorb without creating financial distress — not whether it qualifies. Ranges reflect data confidence, not a false precision.'))
    children.push(spacer(0, 200))

    // ── VALUE PROPOSITION & BUSINESS MODEL ──
    if (valueProposition || businessModel) {
      children.push(sectionHeader('Value Proposition & Business Model'))
      children.push(spacer(0, 80))
      children.push(infoBox(
        ['VALUE PROPOSITION', '', ...(valueProposition ? valueProposition.split('\n').filter(Boolean) : ['Not provided'])],
        ['HOW IT MAKES MONEY', '', ...(businessModel ? businessModel.split('\n').filter(Boolean) : ['Not provided'])],
      ))
      children.push(spacer(0, 200))
    }

    // ── UNIT PERFORMANCE ──
    if (unitLines.length > 0) {
      children.push(sectionHeader('Business Unit Performance'))
      children.push(spacer(0, 80))
      const unitMetrics = result.allocUnits
        .filter((u: any) => { const pl = result.unitPL[u.id]; return pl && pl.ann_rev > 0 })
        .slice(0, 4)
        .map((u: any) => {
          const pl = result.unitPL[u.id]
          return { label: u.name, value: fmt(pl.ann_rev, cc), sub: `GP: ${pct(pl.gp_margin)}`, color: pl.gp_margin > 0.3 ? GREEN : AMBER }
        })
      if (unitMetrics.length > 0) children.push(metricRow(unitMetrics))
      children.push(spacer(0, 200))
    }

    // ── MARKETING & CUSTOMER ACQUISITION ──
    if (hasMarketing) {
      children.push(sectionHeader('Marketing Channels & Customer Acquisition'))
      children.push(spacer(0, 80))
      const cacMetrics = channels.slice(0, 4).map(ch => ({
        label: ch.channel,
        value: ch.cac ? fmt(ch.cac, cc) : 'No count',
        sub: `${ch.customers} customers · ${fmt(ch.cost, cc)} spend`,
        color: ch.cac && ch.cac < m.total_revenue / Math.max(1, m.total_headcount) ? GREEN : AMBER,
      }))
      if (cacMetrics.length > 0) children.push(metricRow(cacMetrics))
      children.push(spacer(0, 200))
    }

    // ── TRADE CREDIT ──
    if (hasTCData) {
      children.push(sectionHeader('Working Capital & Trade Credit'))
      children.push(spacer(0, 80))
      children.push(metricRow([
        { label: 'Days to Collect (DSO)', value: `${tc.dso.toFixed(0)}d`, sub: 'average receivable days', color: tc.dso < 30 ? GREEN : tc.dso < 60 ? AMBER : RED },
        { label: 'Days to Pay (DPO)', value: `${tc.dpo.toFixed(0)}d`, sub: 'average payable days', color: NAVY },
        { label: 'Cash Conversion Gap', value: `${Math.abs(tc.cashConversionGap).toFixed(0)}d`, sub: tc.cashConversionGap <= 0 ? 'supplier-financed (healthy)' : 'cash tied up', color: tc.cashConversionGap <= 0 ? GREEN : tc.cashConversionGap > 30 ? RED : AMBER },
        { label: 'Peak Receivable', value: fmt(tc.peakReceivable, cc), sub: 'highest outstanding', color: NAVY },
      ]))
      children.push(spacer(0, 200))
    }

    // ── SCALE & GROWTH ──
    if (scaleGrowth) {
      children.push(sectionHeader('Scale Potential & Growth Levers'))
      children.push(spacer(0, 80))
      scaleGrowth.split('\n').filter(Boolean).forEach(t => children.push(shortPara(t)))
      children.push(spacer(0, 200))
    }

    // ── GOVERNANCE & FOUNDATIONS ──
    const govScore = (Number(assess.commercialModel || 0) + Number(assess.managementCapability || 0) + Number(assess.marketEvidence || 0) + Number(assess.governance || 0))
    const govMax = 19
    children.push(sectionHeader('Governance & Business Foundations'))
    children.push(spacer(0, 80))
    children.push(metricRow([
      { label: 'Commercial Model', value: `${assess.commercialModel || 'n/a'}/5`, sub: 'clarity & viability', color: Number(assess.commercialModel) >= 4 ? GREEN : AMBER },
      { label: 'Management', value: `${assess.managementCapability || 'n/a'}/4`, sub: 'capability assessed', color: Number(assess.managementCapability) >= 3 ? GREEN : AMBER },
      { label: 'Market Evidence', value: `${assess.marketEvidence || 'n/a'}/5`, sub: 'demand & traction', color: Number(assess.marketEvidence) >= 4 ? GREEN : AMBER },
      { label: 'Governance & Records', value: `${assess.governance || 'n/a'}/5`, sub: 'systems & compliance', color: Number(assess.governance) >= 4 ? GREEN : AMBER },
    ]))
    children.push(spacer(0, 200))

    // ── VERIFICATION & RECOGNITION ──
    children.push(sectionHeader('Verification & Recognition'))
    children.push(spacer(0, 80))
    const w2 = Math.floor(9360 / 2)
    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [w2, w2],
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      rows: [new TableRow({ children: [
        scoreBadge('Verification Status', readinessInfo.title, readinessInfo.blurb, readinessInfo.tone === 'good' ? GREEN : readinessInfo.tone === 'warn' ? AMBER : SLATE, w2),
        scoreBadge('Confidence This Period', `${confidence.score}/100`, confInfo.title, confInfo.tone === 'good' ? GREEN : confInfo.tone === 'warn' ? AMBER : SLATE, w2),
      ]})],
    }))
    children.push(spacer(0, 160))
    if (earnedBadges.length > 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: 'Recognition Earned', bold: true, color: NAVY, size: 18, font: 'Arial', allCaps: true })], spacing: { after: 80 } }))
      earnedBadges.forEach(b => children.push(bullet(`${BADGE_DISPLAY[b].icon}  ${BADGE_DISPLAY[b].title} — ${BADGE_DISPLAY[b].earnedBlurb}`, GREEN)))
    } else {
      children.push(note('No recognition badges earned yet — keep recording each month and the first ones arrive quickly.'))
    }
    if (lockedBadges.length > 0) {
      children.push(spacer(80, 80))
      children.push(new Paragraph({ children: [new TextRun({ text: 'Still To Earn', bold: true, color: SLATE, size: 18, font: 'Arial', allCaps: true })], spacing: { after: 80 } }))
      lockedBadges.forEach(b => children.push(bullet(`${BADGE_DISPLAY[b].title} — ${BADGE_DISPLAY[b].howToEarn}`, SLATE)))
    }
    children.push(spacer(0, 200))

    // ── RISK ──
    if (riskMitigation) {
      children.push(sectionHeader('Key Risks & Mitigations'))
      children.push(spacer(0, 80))
      riskMitigation.split('\n').filter(Boolean).forEach(t => children.push(shortPara(t)))
      children.push(spacer(0, 200))
    }

    // ── RECOMMENDATION ──
    children.push(sectionHeader('Investment Recommendation'))
    children.push(spacer(0, 80))
    if (recommendation) {
      recommendation.split('\n').filter(Boolean).forEach(t => children.push(shortPara(t)))
    } else {
      children.push(shortPara(`Investment Readiness: ${s.irTier} (${s.irScore}/30). Credit Risk: ${s.classification} (${s.score}/100). ${s.irScore >= 17 ? 'The business demonstrates sufficient financial foundations for investment consideration.' : 'Further development is required before investment readiness can be confirmed.'}`))
    }
    if (!hasApiKey) {
      children.push(spacer(0, 80))
      children.push(note('Note: AI narrative sections require ANTHROPIC_API_KEY to be set in Vercel environment variables.'))
    }
    children.push(spacer(0, 200))

    // ── FOOTER ──
    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [9360],
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      rows: [new TableRow({ children: [new TableCell({
        shading: { fill: NAVY, type: ShadingType.CLEAR },
        margins: { top: 100, bottom: 100, left: 200, right: 200 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: 'Powered by ', color: 'AAAAAA', size: 16, font: 'Arial' }),
          new TextRun({ text: 'Canvas Coach Clearview', color: CYAN, size: 16, font: 'Arial', bold: true }),
          new TextRun({ text: '  ·  habibonifade.com  ·  Confidential. Not for circulation without permission', color: 'AAAAAA', size: 16, font: 'Arial' }),
        ] })],
      })] })],
    }))

    const doc = new Document({
      styles: { default: { document: { run: { font: 'Arial', size: 20, color: NAVY } } } },
      sections: [{
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
        children,
      }],
    })

    const buffer = await Packer.toBuffer(doc)
    const fileName = `${config.business_name.replace(/[^a-z0-9]+/gi, '_')}_Investment_Brief.docx`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (err: any) {
    console.error('Investment pitch error:', err)
    return NextResponse.json({ error: err.message || 'An unexpected error occurred' }, { status: 500 })
  }
}
