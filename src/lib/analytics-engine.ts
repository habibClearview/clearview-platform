// @ts-nocheck
// ============================================================
// CLEARVIEW ANALYTICS ENGINE
// Canvas Coach | habibonifade.com
// Generic analytical modules for any client financial model
// ============================================================

export const MONTHS_HORIZON = 24

// ─── 1. DEBT SCHEDULE ────────────────────────────────────────

export function buildDebtSchedule(obligations, months) {
  months = months || MONTHS_HORIZON
  const schedules = {}
  const totalInterest = Array(months).fill(0)
  const totalPrincipal = Array(months).fill(0)
  const totalRepayment = Array(months).fill(0)
  const totalOutstanding = Array(months).fill(0)

  ;(obligations || []).forEach(ob => {
    const startIdx = Math.max(0, (ob.drawdownMonth || 1) - 1)
    const monthlyRate = (ob.annualRate || 0) / 12
    const tenor = ob.tenorMonths || 12
    const grace = ob.gracePeriodMonths || 0
    const freq = ob.frequency || 'monthly'
    const seasonalMonths = ob.seasonalMonths || []

    const interestByMonth = Array(months).fill(0)
    const principalByMonth = Array(months).fill(0)
    const balanceByMonth = Array(months).fill(0)

    function isPrincipalMonth(modelMonth) {
      const mss = modelMonth - (startIdx + 1)
      if (mss < 0 || mss < grace) return false
      const active = mss - grace + 1
      if (freq === 'monthly') return true
      if (freq === 'quarterly') return active % 3 === 1
      if (freq === 'seasonal') {
        const mo = modelMonth % 12 === 0 ? 12 : modelMonth % 12
        return seasonalMonths.includes(mo)
      }
      return true
    }

    let totalPP = 0
    for (let m = startIdx; m < Math.min(startIdx + tenor, months); m++) {
      if (isPrincipalMonth(m + 1) && (m - startIdx) >= grace) totalPP++
    }

    let runningBalance = ob.principal || 0
    let repayCount = 0

    for (let m = startIdx; m < months; m++) {
      if (runningBalance <= 0.01) { balanceByMonth[m] = 0; continue }
      const modelMonth = m + 1
      const mss = m - startIdx
      const inGrace = mss < grace
      const pastTenor = mss >= tenor
      const interest = runningBalance * monthlyRate
      interestByMonth[m] = interest
      let principal = 0

      if (!pastTenor && !inGrace) {
        if (ob.repaymentType === 'bullet') {
          if (mss === tenor - 1) principal = runningBalance
        } else if (ob.repaymentType === 'equal_instalment') {
          if (isPrincipalMonth(modelMonth)) {
            const rem = totalPP - repayCount
            if (rem > 0 && monthlyRate > 0) {
              const emi = runningBalance * monthlyRate * Math.pow(1 + monthlyRate, rem) / (Math.pow(1 + monthlyRate, rem) - 1)
              principal = Math.min(Math.max(0, emi - interest), runningBalance)
            } else {
              principal = Math.min(runningBalance / Math.max(1, rem), runningBalance)
            }
            repayCount++
          }
        } else {
          if (isPrincipalMonth(modelMonth)) {
            principal = Math.min(runningBalance / Math.max(1, totalPP - repayCount), runningBalance)
            repayCount++
          }
        }
      }

      principalByMonth[m] = principal
      runningBalance = Math.max(0, runningBalance - principal)
      balanceByMonth[m] = runningBalance
    }

    const totalInterestPaid = interestByMonth.reduce((a, b) => a + b, 0)
    const totalPrincipalPaid = principalByMonth.reduce((a, b) => a + b, 0)

    schedules[ob.id] = {
      ...ob,
      interestByMonth,
      principalByMonth,
      balanceByMonth,
      totalInterestPaid,
      totalPrincipalPaid,
      annualDebtService: interestByMonth.slice(0, 12).reduce((a, b) => a + b, 0) + principalByMonth.slice(0, 12).reduce((a, b) => a + b, 0),
    }

    for (let m = 0; m < months; m++) {
      totalInterest[m] += interestByMonth[m]
      totalPrincipal[m] += principalByMonth[m]
      totalRepayment[m] += interestByMonth[m] + principalByMonth[m]
      totalOutstanding[m] += balanceByMonth[m]
    }
  })

  return {
    schedules,
    totalInterest,
    totalPrincipal,
    totalRepayment,
    totalOutstanding,
    annualDebtServiceY1: totalRepayment.slice(0, 12).reduce((a, b) => a + b, 0),
    annualDebtServiceY2: totalRepayment.slice(12, 24).reduce((a, b) => a + b, 0),
  }
}

// ─── 2. CREDIT RISK ASSESSMENT ───────────────────────────────

export function buildCreditRiskAssessment(model, debtSchedule, coachOverride) {
  const months = model.revenue.length
  const flags = []

  const dscr = model.ebitda.map((e, m) => {
    const ds = debtSchedule.totalRepayment[m]
    if (ds === 0) return e > 0 ? 3.0 : 0
    return e / ds
  })
  const dscrAvgY1 = dscr.slice(0, 12).reduce((a, b) => a + b, 0) / 12

  const currentRatio = model.closingCash.map((cash, m) => {
    const monthlyDs = debtSchedule.totalRepayment[m]
    if (monthlyDs === 0) return cash > 0 ? 3.0 : 0
    return cash / (monthlyDs * 3)
  })
  const currentRatioAvgY1 = currentRatio.slice(0, 12).reduce((a, b) => a + b, 0) / 12

  const q1Rev = model.revenue.slice(0, 3).reduce((a, b) => a + b, 0)
  const q4Rev = model.revenue.slice(9, 12).reduce((a, b) => a + b, 0)
  const revenueGrowthTrend = q4Rev > q1Rev * 1.05 ? 'growing' : q4Rev < q1Rev * 0.95 ? 'declining' : 'stable'

  const liquidityGapMonths = model.closingCash.map((v, i) => i).filter(i => model.closingCash[i] < 0)

  let score = 50

  if (dscrAvgY1 >= 1.5) {
    score += 30
    flags.push({ type: 'green', message: `Strong debt service coverage — average DSCR ${dscrAvgY1.toFixed(2)}x across Year 1.` })
  } else if (dscrAvgY1 >= 1.0) {
    score += 15
    flags.push({ type: 'amber', message: `Adequate but tight debt service coverage — DSCR ${dscrAvgY1.toFixed(2)}x. Monitor closely.` })
  } else if (dscrAvgY1 >= 0.5) {
    score += 0
    flags.push({ type: 'red', message: `Weak debt service coverage — DSCR ${dscrAvgY1.toFixed(2)}x. Business does not generate enough cash to service debt comfortably.` })
  } else {
    score -= 20
    flags.push({ type: 'red', message: `Critical debt service coverage — DSCR ${dscrAvgY1.toFixed(2)}x. Serious repayment risk.` })
  }

  if (liquidityGapMonths.length === 0) {
    score += 20
    flags.push({ type: 'green', message: 'Cash position remains positive across the full 24-month projection.' })
  } else if (liquidityGapMonths.length <= 2) {
    score += 5
    flags.push({ type: 'amber', message: `Cash goes negative in ${liquidityGapMonths.length} month(s). Manageable with short-term facilities.` })
  } else {
    score -= 10
    flags.push({ type: 'red', message: `Cash goes negative in ${liquidityGapMonths.length} months. Liquidity risk is material.` })
  }

  if (revenueGrowthTrend === 'growing') {
    score += 10
    flags.push({ type: 'green', message: 'Revenue is growing across Year 1 — positive commercial momentum.' })
  } else if (revenueGrowthTrend === 'stable') {
    score += 5
    flags.push({ type: 'amber', message: 'Revenue is stable across Year 1. Growth needed to improve debt service headroom.' })
  } else {
    score -= 5
    flags.push({ type: 'red', message: 'Revenue is declining across Year 1. Investigate cause before next repayment period.' })
  }

  score = Math.max(0, Math.min(100, score))

  let classification
  if (coachOverride && coachOverride.classification) {
    classification = coachOverride.classification
  } else if (score >= 65) {
    classification = 'Stable'
  } else if (score >= 40) {
    classification = 'At Risk'
  } else {
    classification = 'High Risk'
  }

  const rationale = (coachOverride && coachOverride.note) ||
    `Score ${score}/100. DSCR ${dscrAvgY1.toFixed(2)}x. ${liquidityGapMonths.length} cash-negative months. Revenue trend: ${revenueGrowthTrend}.`

  return { classification, score, dscr, dscrAvgY1, currentRatio, currentRatioAvgY1, revenueGrowthTrend, liquidityGapMonths, flags, rationale }
}

// ─── 3. GOING CONCERN ASSESSMENT ─────────────────────────────

export function buildGoingConcernAssessment(model, debtSchedule, coachAssessments) {
  const flags = []
  const ca = coachAssessments || {}

  const y1Ebitda = model.ebitda.slice(0, 12).reduce((a, b) => a + b, 0)
  const y2Ebitda = model.ebitda.slice(12, 24).reduce((a, b) => a + b, 0)
  const y1Rev = model.revenue.slice(0, 12).reduce((a, b) => a + b, 0)
  const y2Rev = model.revenue.slice(12, 24).reduce((a, b) => a + b, 0)
  const minCash = Math.min(...model.closingCash)

  const dscrAvg = model.ebitda.slice(0, 12).map((e, m) => {
    const ds = debtSchedule.totalRepayment[m]
    return ds > 0 ? e / ds : e > 0 ? 2 : 0
  }).reduce((a, b) => a + b, 0) / 12

  const indicators = [
    {
      name: 'Debt Service Coverage',
      score: dscrAvg >= 1.5 ? 4 : dscrAvg >= 1.0 ? 3 : dscrAvg >= 0.5 ? 2 : dscrAvg > 0 ? 1 : 0,
      maxScore: 4,
      evidence: `Average DSCR ${dscrAvg.toFixed(2)}x in Year 1. ${dscrAvg >= 1.5 ? 'Strong coverage.' : dscrAvg >= 1.0 ? 'Adequate but watch closely.' : 'Insufficient — repayment risk is real.'}`,
    },
    {
      name: 'Liquidity Position',
      score: minCash >= 0 ? (model.closingCash[11] > model.closingCash[0] ? 4 : 3) : minCash > -10_000_000 ? 1 : 0,
      maxScore: 4,
      evidence: `Minimum cash balance: ${minCash.toLocaleString()} UGX. ${minCash >= 0 ? 'Positive throughout.' : 'Cash goes negative — liquidity concern.'}`,
    },
    {
      name: 'Revenue Sustainability',
      score: y2Rev > y1Rev * 1.1 ? 4 : y2Rev > y1Rev * 0.95 ? 3 : y2Rev > y1Rev * 0.8 ? 2 : 1,
      maxScore: 4,
      evidence: `Year 2 revenue ${y2Rev > y1Rev ? 'grows' : 'declines'} vs Year 1 by ${Math.abs(((y2Rev - y1Rev) / Math.max(1, y1Rev)) * 100).toFixed(1)}%.`,
    },
    {
      name: 'Operational Profitability',
      score: y1Ebitda > 0 && y2Ebitda > y1Ebitda ? 4 : y1Ebitda > 0 ? 3 : y1Ebitda > -5_000_000 ? 2 : 1,
      maxScore: 4,
      evidence: `Year 1 EBITDA: ${y1Ebitda.toLocaleString()} UGX. Year 2 EBITDA: ${y2Ebitda.toLocaleString()} UGX.`,
    },
    {
      name: 'Management & Governance',
      score: ca.management != null ? ca.management : 2,
      maxScore: 4,
      evidence: ca.management != null ? `Coach assessment: ${ca.management}/4.` : 'Coach assessment pending. Default score applied.',
      coachAssessment: ca.management != null ? ca.management : 2,
    },
  ]

  const overallScore = indicators.reduce((s, ind) => s + ind.score, 0)

  const scoredIndicators = indicators.map(ind => ({
    ...ind,
    rating: ind.score >= 3 ? 'Strong' : ind.score >= 2 ? 'Adequate' : ind.score >= 1 ? 'Marginal' : 'Concern',
  }))

  const overallRating = overallScore >= 17 ? 'Strong' : overallScore >= 12 ? 'Adequate' : overallScore >= 7 ? 'Marginal' : 'Concern'

  if (overallScore >= 17) flags.push({ type: 'green', message: 'Strong going concern indicators. No material concerns at this time.' })
  else if (overallScore >= 12) flags.push({ type: 'amber', message: 'Adequate going concern position. Monitor debt service and liquidity monthly.' })
  else if (overallScore >= 7) flags.push({ type: 'amber', message: 'Marginal going concern position. Active monitoring and corrective action required.' })
  else flags.push({ type: 'red', message: 'Going concern in doubt. Immediate management intervention required.' })

  return { overallRating, overallScore, indicators: scoredIndicators, flags }
}

// ─── 4. INVESTMENT READINESS ──────────────────────────────────

export function buildInvestmentReadiness(model, debtSchedule, coachAssessments) {
  const ca = coachAssessments || {}
  const y1Rev = model.revenue.slice(0, 12).reduce((a, b) => a + b, 0)
  const y1Ebitda = model.ebitda.slice(0, 12).reduce((a, b) => a + b, 0)
  const ebitdaMargin = y1Rev > 0 ? y1Ebitda / y1Rev : 0
  const dscrAvg = model.ebitda.slice(0, 12).map((e, m) => {
    const ds = debtSchedule.totalRepayment[m]
    return ds > 0 ? e / ds : e > 0 ? 2 : 0
  }).reduce((a, b) => a + b, 0) / 12
  const debtToEquity = model.totalEquity[11] > 0 ? model.totalLiabilities[11] / model.totalEquity[11] : 99

  const dimensions = [
    {
      name: 'Financial Viability',
      score: Math.min(5, Math.max(0,
        (ebitdaMargin >= 0.2 ? 2 : ebitdaMargin >= 0.05 ? 1 : 0) +
        (y1Ebitda > 0 ? 1 : 0) +
        (debtToEquity < 1 ? 2 : debtToEquity < 2 ? 1 : 0)
      )),
      maxScore: 5,
      evidence: `EBITDA margin ${(ebitdaMargin * 100).toFixed(1)}%. Debt-to-equity ${debtToEquity.toFixed(2)}x.`,
    },
    {
      name: 'Debt Serviceability',
      score: Math.min(5, Math.max(0, Math.round(
        dscrAvg >= 2.0 ? 5 : dscrAvg >= 1.5 ? 4 : dscrAvg >= 1.0 ? 3 : dscrAvg >= 0.5 ? 2 : 1
      ))),
      maxScore: 5,
      evidence: `Average DSCR ${dscrAvg.toFixed(2)}x. Total debt service Y1: ${debtSchedule.annualDebtServiceY1.toLocaleString()} UGX.`,
    },
    {
      name: 'Commercial Model Clarity',
      score: ca.commercialModel != null ? ca.commercialModel : 2,
      maxScore: 5,
      evidence: ca.commercialModel != null ? `Coach assessment: ${ca.commercialModel}/5.` : 'Pending coach assessment.',
      coachAssessment: ca.commercialModel != null ? ca.commercialModel : 2,
    },
    {
      name: 'Management Capability',
      score: ca.managementCapability != null ? ca.managementCapability : 2,
      maxScore: 5,
      evidence: ca.managementCapability != null ? `Coach assessment: ${ca.managementCapability}/5.` : 'Pending coach assessment.',
      coachAssessment: ca.managementCapability != null ? ca.managementCapability : 2,
    },
    {
      name: 'Market Evidence',
      score: ca.marketEvidence != null ? ca.marketEvidence : 2,
      maxScore: 5,
      evidence: ca.marketEvidence != null ? `Coach assessment: ${ca.marketEvidence}/5.` : 'Pending coach assessment.',
      coachAssessment: ca.marketEvidence != null ? ca.marketEvidence : 2,
    },
    {
      name: 'Governance & Record-Keeping',
      score: ca.governance != null ? ca.governance : 2,
      maxScore: 5,
      evidence: ca.governance != null ? `Coach assessment: ${ca.governance}/5.` : 'Pending coach assessment.',
      coachAssessment: ca.governance != null ? ca.governance : 2,
    },
  ]

  const overallScore = dimensions.reduce((s, d) => s + d.score, 0)
  const tier = overallScore >= 24 ? 'Investment Ready' : overallScore >= 17 ? 'Near Ready' : overallScore >= 10 ? 'Development Stage' : 'Pre-Investment'

  const flags = []
  if (tier === 'Investment Ready') flags.push({ type: 'green', message: `Score ${overallScore}/30. Organisation presents a credible investment case to financing partners.` })
  else if (tier === 'Near Ready') flags.push({ type: 'amber', message: `Score ${overallScore}/30. Close to investment ready. Address the lowest-scoring dimensions.` })
  else if (tier === 'Development Stage') flags.push({ type: 'amber', message: `Score ${overallScore}/30. Meaningful progress needed before approaching financing partners.` })
  else flags.push({ type: 'red', message: `Score ${overallScore}/30. Not yet ready for external financing. Focus on financial viability and commercial model first.` })

  const weakDimensions = dimensions.filter(d => d.score < 3)
  if (weakDimensions.length > 0) {
    flags.push({ type: 'amber', message: `Priority areas to improve: ${weakDimensions.map(d => d.name).join(', ')}.` })
  }

  return { overallScore, tier, dimensions, flags }
}

// ─── 5. 6-MONTH CASHFLOW PROJECTION ──────────────────────────

export function buildCashflowProjection(model, debtSchedule, grantRepayByMonth, startMonth, horizonMonths) {
  startMonth = startMonth || 0
  horizonMonths = horizonMonths || 6
  grantRepayByMonth = grantRepayByMonth || []

  const end = Math.min(startMonth + horizonMonths, model.revenue.length)
  const months = Array.from({ length: end - startMonth }, (_, i) => startMonth + i)

  const projectedCashIn = months.map(m => Math.max(0, model.ebitda[m] > 0 ? model.ebitda[m] : 0))
  const projectedCashOut = months.map(m =>
    (model.ebitda[m] < 0 ? Math.abs(model.ebitda[m]) : 0) +
    debtSchedule.totalRepayment[m] +
    (grantRepayByMonth[m] || 0)
  )
  const projectedNet = months.map((m, i) => projectedCashIn[i] - projectedCashOut[i])

  const openingCash = model.closingCash[startMonth > 0 ? startMonth - 1 : 0] || 0
  const projectedClosingCash = []
  let running = openingCash
  for (const net of projectedNet) { running += net; projectedClosingCash.push(running) }

  const gapMonths = projectedClosingCash
    .map((v, i) => ({ monthIdx: months[i], gap: v }))
    .filter(x => x.gap < 0)

  const recommendedFacility = gapMonths.length > 0
    ? Math.abs(Math.min(...gapMonths.map(g => g.gap))) * 1.2
    : 0

  return { months, projectedCashIn, projectedCashOut, projectedNet, projectedClosingCash, gapMonths, recommendedFacility }
}

// ─── 6. CLOSE-OUT RECOMMENDATION ─────────────────────────────

export function buildCloseOutRecommendation(creditRisk, goingConcern, investmentReadiness, coachInputs) {
  const ci = coachInputs || {}
  const stabilityStatus = creditRisk.classification

  const viabilityRating =
    goingConcern.overallScore >= 15 && creditRisk.score >= 65 ? 'Viable' :
    goingConcern.overallScore >= 10 && creditRisk.score >= 40 ? 'Conditionally Viable' :
    goingConcern.overallScore >= 7 ? 'At Risk' : 'Not Viable'

  const repaymentOutlook =
    creditRisk.dscrAvgY1 >= 1.5 && creditRisk.liquidityGapMonths.length === 0 ? 'On Track' :
    creditRisk.dscrAvgY1 >= 1.0 ? 'Watch' :
    creditRisk.dscrAvgY1 >= 0.5 ? 'At Risk' : 'Default Risk'

  const immediateActions = ci.immediateActions || [
    stabilityStatus === 'High Risk' ? 'Convene emergency management session to review cashflow and cost structure.' : null,
    creditRisk.liquidityGapMonths.length > 0 ? 'Identify short-term liquidity facility to cover cash-negative months.' : null,
    creditRisk.dscrAvgY1 < 1.0 ? 'Review and renegotiate repayment schedule with financing partners.' : null,
  ].filter(Boolean)

  const nearTermActions = ci.nearTermActions || [
    'Implement monthly cashflow tracking discipline.',
    'Establish formal management accounts review process.',
    investmentReadiness.overallScore < 17 ? 'Develop investment readiness improvement plan addressing key gaps.' : null,
  ].filter(Boolean)

  const requiredFollowUp = ci.requiredFollowUp || [
    'Monthly cashflow review for 6 months post-CSJ.',
    repaymentOutlook !== 'On Track' ? 'Quarterly financing partner engagement on repayment performance.' : null,
    'Annual commercial readiness reassessment.',
  ].filter(Boolean)

  const exitRecommendation =
    viabilityRating === 'Viable' ? 'Business is viable for independent operation post-CSJ. Maintain monitoring rhythm.' :
    viabilityRating === 'Conditionally Viable' ? 'Business can exit with conditions. Specific actions must be completed before full programme exit.' :
    viabilityRating === 'At Risk' ? 'Exit with active support plan. Business needs structured follow-on support for at least 6 months.' :
    'Do not exit without remediation plan. Business is not yet stable enough for independent operation.'

  return {
    viabilityRating,
    repaymentOutlook,
    stabilityStatus,
    immediateActions,
    nearTermActions,
    requiredFollowUp,
    exitRecommendation,
    coachNotes: ci.coachNotes || '',
  }
}

// ─── HELPERS ─────────────────────────────────────────────────

export function extractModelSnapshot(result) {
  const con = result.consolidated
  const bs = result.balanceSheet
  const cf = result.cashFlow
  return {
    revenue: con.revenue,
    cogs: con.cogs,
    grossProfit: con.grossProfit,
    opex: con.opex,
    ebitda: con.ebitda,
    nptAfterTax: con.nptAfterTax,
    closingCash: cf.closingCash,
    creditReceivables: result.creditReceivables,
    totalAssets: bs.totalAssets,
    totalEquity: bs.totalEquity,
    totalLiabilities: bs.totalLiabilities,
  }
}

export function extractGrantRepayments(cashFlow, months) {
  months = months || MONTHS_HORIZON
  return Array.from({ length: months }, (_, m) =>
    cashFlow.financingCash[m] < 0 ? Math.abs(cashFlow.financingCash[m]) : 0
  )
}

export function buildOperationalCashflow(model, debtSchedule, grantRepayByMonth, months) {
  months = months || MONTHS_HORIZON
  grantRepayByMonth = grantRepayByMonth || []
  const moneyIn = Array(months).fill(0)
  const moneyOut = Array(months).fill(0)
  const debtService = debtSchedule.totalRepayment
  const grantRepay = grantRepayByMonth

  for (let m = 0; m < months; m++) {
    const ebitda = model.ebitda[m]
    moneyIn[m] = Math.max(0, ebitda)
    const operatingLoss = ebitda < 0 ? Math.abs(ebitda) : 0
    moneyOut[m] = operatingLoss + debtService[m] + (grantRepay[m] || 0)
  }

  const net = moneyIn.map((v, i) => v - moneyOut[i])
  const cumulative = []
  let cum = 0
  for (let m = 0; m < months; m++) { cum += net[m]; cumulative.push(cum) }
  const pressureMonths = net.map((v, i) => ({ monthIdx: i, shortfall: v })).filter(x => x.shortfall < -50000)

  return { moneyIn, moneyOut, net, cumulative, debtService, grantRepay, pressureMonths }
}
