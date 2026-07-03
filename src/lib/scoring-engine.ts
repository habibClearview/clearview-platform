// ============================================================
// CLEARVIEW SHARED SCORING ENGINE
// Deterministic Credit Risk, Going Concern, and Investment
// Readiness scoring, usable by any client's financial result.
// Originally built for CONAS, now shared across all clients.
// ============================================================

export interface DebtObligation {
  drawdownMonth?: number
  annualRate?: number
  tenorMonths?: number
  gracePeriodMonths?: number
  principal?: number
  repaymentType?: string
}

export interface DebtSchedule {
  totalInterest: number[]
  totalPrincipal: number[]
  totalRepayment: number[]
  totalOutstanding: number[]
  annualY1: number
}

// ── Trade credit: supplier credit (payable) and customer/partner credit
// (receivable) -- tracked as MOVEMENTS, the way real bookkeeping works.
// Each month: new credit extended/received, and what was actually settled.
// The outstanding balance is a derived running total, never entered directly.
// This is standard working capital practice: AR/AP movements flow into the
// cash flow statement as operating adjustments (an AR increase consumes cash,
// an AP increase releases cash), and DSO/DPO are computed from the resulting
// balances over the period -- not typed in as a flat average.
export interface TradeCreditLine {
  id: string
  name: string               // e.g. "Input Supplier", "Licensing Partner", "FGE Advance"
  type: 'payable' | 'receivable'
  monthly_new: number[]      // new credit received (payable) or extended (receivable) this month
  monthly_settled: number[]  // amount actually paid (payable) or collected (receivable) this month
}

export interface TradeCreditSummary {
  totalPayableOutstanding: number[]    // monthly closing balance, summed across all payable lines
  totalReceivableOutstanding: number[] // monthly closing balance, summed across all receivable lines
  // Net monthly cash effect of trade credit movements -- this is what should
  // be added into the cash flow statement as a working capital adjustment.
  // Payable: new credit received delays a cash outflow (positive cash effect
  // in the month received, reversed when settled). Receivable: collecting
  // cash is a positive effect; extending new credit defers the inflow.
  monthlyCashEffect: number[]
  dpo: number   // Days Payable Outstanding -- average days to pay suppliers
  dso: number   // Days Sales Outstanding -- average days to collect from customers/partners
  cashConversionGap: number  // DSO - DPO. Positive = cash tied up; negative = supplier-financed
  peakPayable: number
  peakReceivable: number
}

export function computeTradeCredit(
  lines: TradeCreditLine[],
  monthlyCostOfSales: number[],  // used as denominator for DPO
  monthlyRevenue: number[],      // used as denominator for DSO
  months: number
): TradeCreditSummary {
  const totalPayableOutstanding = Array(months).fill(0)
  const totalReceivableOutstanding = Array(months).fill(0)
  const monthlyCashEffect = Array(months).fill(0)

  ;(lines || []).forEach(line => {
    const isPayable = line.type === 'payable'
    const balanceTarget = isPayable ? totalPayableOutstanding : totalReceivableOutstanding
    let runningBalance = 0
    for (let i = 0; i < months; i++) {
      const newAmt = line.monthly_new?.[i] || 0
      const rawSettledAmt = line.monthly_settled?.[i] || 0
      // Settlement can never exceed what's actually outstanding (opening
      // balance + this month's new amount). Without this cap, an over-entered
      // settled figure would move more cash than the balance can account for --
      // the outstanding balance floors at zero via Math.max below, but the
      // cash effect would still book the full over-settlement, unbalancing
      // the balance sheet.
      const settledAmt = Math.min(rawSettledAmt, runningBalance + newAmt)
      runningBalance = Math.max(0, runningBalance + newAmt - settledAmt)
      balanceTarget[i] += runningBalance

      // Cash effect: for a payable, receiving new credit defers a cash outflow
      // (positive effect that month); settling it is the actual outflow (negative).
      // For a receivable, extending new credit defers a cash inflow (negative
      // effect -- revenue was earned but not yet collected); settling it is the
      // actual inflow (positive).
      if (isPayable) {
        monthlyCashEffect[i] += newAmt - settledAmt
      } else {
        monthlyCashEffect[i] += settledAmt - newAmt
      }
    }
  })

  const avgPayable = totalPayableOutstanding.reduce((a,b)=>a+b,0) / Math.max(1,months)
  const avgReceivable = totalReceivableOutstanding.reduce((a,b)=>a+b,0) / Math.max(1,months)
  const annualCogs = monthlyCostOfSales.reduce((a,b)=>a+b,0)
  const annualRev = monthlyRevenue.reduce((a,b)=>a+b,0)

  // Standard formulas: DPO = (Avg Payables / COGS) × 365, DSO = (Avg Receivables / Revenue) × 365
  const dpo = annualCogs > 0 ? (avgPayable / annualCogs) * 365 : 0
  const dso = annualRev > 0 ? (avgReceivable / annualRev) * 365 : 0
  const cashConversionGap = dso - dpo

  return {
    totalPayableOutstanding, totalReceivableOutstanding, monthlyCashEffect,
    dpo, dso, cashConversionGap,
    peakPayable: totalPayableOutstanding.length>0 ? Math.max(...totalPayableOutstanding) : 0,
    peakReceivable: totalReceivableOutstanding.length>0 ? Math.max(...totalReceivableOutstanding) : 0,
  }
}

export function buildDebtSchedule(obligations: DebtObligation[], months: number): DebtSchedule {
  months = months || 12
  const totalInterest = Array(months).fill(0)
  const totalPrincipal = Array(months).fill(0)
  const totalRepayment = Array(months).fill(0)
  const totalOutstanding = Array(months).fill(0)
  ;(obligations || []).forEach((ob) => {
    const startIdx = Math.max(0, (ob.drawdownMonth || 1) - 1)
    const monthlyRate = (ob.annualRate || 0) / 12
    const tenor = ob.tenorMonths || 12
    const grace = ob.gracePeriodMonths || 0
    const interestByMonth = Array(months).fill(0)
    const principalByMonth = Array(months).fill(0)
    const balanceByMonth = Array(months).fill(0)
    let totalPP = 0
    for (let m = startIdx; m < Math.min(startIdx + tenor, months); m++) {
      if ((m - startIdx) >= grace) totalPP++
    }
    let bal = ob.principal || 0
    let repayCount = 0
    for (let m = startIdx; m < months; m++) {
      if (bal <= 0.01) { balanceByMonth[m] = 0; continue }
      const mss = m - startIdx
      const interest = bal * monthlyRate
      interestByMonth[m] = interest
      let principal = 0
      if (mss < tenor && mss >= grace) {
        if (ob.repaymentType === 'bullet') {
          if (mss === tenor - 1) principal = bal
        } else {
          principal = Math.min(bal / Math.max(1, totalPP - repayCount), bal)
          repayCount++
        }
      }
      principalByMonth[m] = principal
      bal = Math.max(0, bal - principal)
      balanceByMonth[m] = bal
    }
    for (let m = 0; m < months; m++) {
      totalInterest[m] += interestByMonth[m]
      totalPrincipal[m] += principalByMonth[m]
      totalRepayment[m] += interestByMonth[m] + principalByMonth[m]
      totalOutstanding[m] += balanceByMonth[m]
    }
  })
  return { totalInterest, totalPrincipal, totalRepayment, totalOutstanding,
    annualY1: totalRepayment.reduce((a,b)=>a+b,0) }
}

export interface CoachAssessment {
  commercialModel: number
  managementCapability: number
  marketEvidence: number
  governance: number
  immediateActions: string
  nearTermActions: string
  followUp: string
  coachNotes: string
}

export function defaultCoachAssessment(): CoachAssessment {
  return {
    commercialModel: 2, managementCapability: 2, marketEvidence: 2, governance: 2,
    immediateActions: '', nearTermActions: '', followUp: '', coachNotes: '',
  }
}

export interface ScoringInputs {
  rev: number[]       // monthly consolidated revenue
  ebitda: number[]     // monthly consolidated EBITDA
  cogs?: number[]      // monthly consolidated cost of sales -- needed for DPO
  cashClose: number[]  // monthly closing cash balance
  totalEquity: number  // latest period total equity
  totalLiabilities: number // latest period total liabilities
  months: number
  debtObligations?: DebtObligation[]   // supports multiple: bank loans, non-bank facilities, etc
  tradeCreditLines?: TradeCreditLine[] // supports multiple: supplier credit, partner/customer credit
  assess: CoachAssessment
}

export interface ScoringResult {
  // Credit Risk
  score: number
  classification: 'Stable' | 'At Risk' | 'High Risk'
  classColor: string
  dscrAvg: number
  dscrVals: number[]
  cashGaps: number
  revTrend: 'Growing' | 'Stable' | 'Declining'
  // Going Concern
  gcScore: number
  gcRating: 'Strong' | 'Adequate' | 'Marginal' | 'Concern'
  gcColor: string
  // Investment Readiness
  irScore: number
  irTier: 'Investment Ready' | 'Near Ready' | 'Development Stage' | 'Pre-Investment'
  irColor: string
  irFinancial: number
  irDebt: number
  // Trade credit / working capital management
  tradeCredit: TradeCreditSummary
  // Shared raw figures used across all three
  annualRevenue: number
  annualEbitda: number
  minCash: number
  ebitdaMargin: number
  deToEq: number
}

const GREEN = '#1A7A4A', AMBER = '#B8860B', RED = '#C0392B', TEAL = '#1A9DAA'

export function computeScores(inputs: ScoringInputs): ScoringResult {
  const { rev, ebitda, cashClose, totalEquity, totalLiabilities, months, assess } = inputs
  const m = months || rev.length
  const cogs = inputs.cogs || rev.map(() => 0)

  // Supports multiple debt obligations (bank loans, non-bank facilities, etc) --
  // each contributes its own interest/principal schedule, summed together.
  const debtSched = buildDebtSchedule(inputs.debtObligations || [], m)
  const dscrVals = ebitda.map((e, i) => {
    const ds = debtSched.totalRepayment[i]
    return ds > 0 ? e / ds : (e > 0 ? 3 : 0)
  })
  const dscrAvg = dscrVals.reduce((a, b) => a + b, 0) / Math.max(1, m)
  const cashGaps = cashClose.filter(v => v < 0).length
  const annualRevenue = rev.reduce((a, b) => a + b, 0)
  const annualEbitda = ebitda.reduce((a, b) => a + b, 0)
  const minCash = cashClose.length > 0 ? Math.min(...cashClose) : 0
  const quarterLen = Math.max(1, Math.floor(m / 4))
  const q1Rev = rev.slice(0, quarterLen).reduce((a, b) => a + b, 0)
  const q4Rev = rev.slice(Math.max(0, m - quarterLen), m).reduce((a, b) => a + b, 0)
  const revTrend: 'Growing'|'Stable'|'Declining' = q4Rev > q1Rev * 1.05 ? 'Growing' : q4Rev < q1Rev * 0.95 ? 'Declining' : 'Stable'

  // ── Trade credit: supplier payables (e.g. input credit) and customer/partner
  // receivables (e.g. licensing partner credit). Tracks how effectively the
  // client manages credit it gives and receives -- collection speed vs payment speed.
  const tradeCredit = computeTradeCredit(inputs.tradeCreditLines || [], cogs, rev, m)

  // ── Credit Risk Score (0-100) ──
  let score = 50
  if (dscrAvg >= 1.5) score += 30
  else if (dscrAvg >= 1.0) score += 15
  else if (dscrAvg < 0.5) score -= 20
  if (cashGaps === 0) score += 20
  else if (cashGaps > 2) score -= 10
  if (revTrend === 'Growing') score += 10
  else if (revTrend === 'Declining') score -= 5
  // Trade credit quality: collecting faster than paying (negative gap) is a
  // positive signal -- the business is effectively financed by supplier credit
  // rather than tying up its own cash. A large positive gap (slow collection,
  // fast payment) strains cash and is penalised.
  if (tradeCredit.dso > 0 || tradeCredit.dpo > 0) {
    if (tradeCredit.cashConversionGap <= 0) score += 5
    else if (tradeCredit.cashConversionGap > 60) score -= 10
    else if (tradeCredit.cashConversionGap > 30) score -= 5
  }
  score = Math.max(0, Math.min(100, score))
  const classification: 'Stable'|'At Risk'|'High Risk' = score >= 65 ? 'Stable' : score >= 40 ? 'At Risk' : 'High Risk'
  const classColor = classification === 'Stable' ? GREEN : classification === 'At Risk' ? AMBER : RED

  // ── Going Concern Score (0-20) ──
  // Revenue sustainability factor now reflects trade credit management quality
  // when data is available, rather than a flat default.
  const revenueSustainabilityScore = (tradeCredit.dso > 0 || tradeCredit.dpo > 0)
    ? (tradeCredit.cashConversionGap <= 0 ? 4 : tradeCredit.cashConversionGap <= 30 ? 3 : tradeCredit.cashConversionGap <= 60 ? 2 : 1)
    : 3 // no trade credit data entered -- default adequate
  const gcScore = Math.min(20,
    (dscrAvg >= 1.5 ? 4 : dscrAvg >= 1.0 ? 3 : dscrAvg >= 0.5 ? 2 : 1) +
    (minCash >= 0 ? 4 : minCash > -10000000 ? 1 : 0) +
    revenueSustainabilityScore +
    (annualEbitda > 0 ? 3 : 2) +
    (Number(assess.managementCapability) || 2)
  )
  const gcRating: 'Strong'|'Adequate'|'Marginal'|'Concern' = gcScore >= 17 ? 'Strong' : gcScore >= 12 ? 'Adequate' : gcScore >= 7 ? 'Marginal' : 'Concern'
  const gcColor = gcRating === 'Strong' ? GREEN : gcRating === 'Adequate' ? TEAL : gcRating === 'Marginal' ? AMBER : RED

  // ── Investment Readiness Score (0-30) ──
  const ebitdaMargin = annualRevenue > 0 ? annualEbitda / annualRevenue : 0
  const deToEq = (totalEquity > 0) ? (totalLiabilities || 0) / totalEquity : 99
  const irFinancial = Math.min(5, (ebitdaMargin >= 0.2 ? 2 : ebitdaMargin >= 0.05 ? 1 : 0) + (annualEbitda > 0 ? 1 : 0) + (deToEq < 1 ? 2 : deToEq < 2 ? 1 : 0))
  const irDebt = Math.min(5, Math.round(dscrAvg >= 2 ? 5 : dscrAvg >= 1.5 ? 4 : dscrAvg >= 1 ? 3 : 2))
  const irScore = Math.min(30, irFinancial + irDebt + (Number(assess.commercialModel) || 2) + (Number(assess.managementCapability) || 2) + (Number(assess.marketEvidence) || 2) + (Number(assess.governance) || 2))
  const irTier: 'Investment Ready'|'Near Ready'|'Development Stage'|'Pre-Investment' = irScore >= 24 ? 'Investment Ready' : irScore >= 17 ? 'Near Ready' : irScore >= 10 ? 'Development Stage' : 'Pre-Investment'
  const irColor = irTier === 'Investment Ready' ? GREEN : irTier === 'Near Ready' ? TEAL : AMBER

  return {
    score, classification, classColor, dscrAvg, dscrVals, cashGaps, revTrend,
    gcScore, gcRating, gcColor,
    irScore, irTier, irColor, irFinancial, irDebt,
    tradeCredit,
    annualRevenue, annualEbitda, minCash, ebitdaMargin, deToEq,
  }
}

// ── Engagement Close viability rating, shared logic ──
export function computeViabilityRating(gcScore: number, creditScore: number): string {
  if (gcScore >= 15 && creditScore >= 65) return 'Viable'
  if (gcScore >= 10 && creditScore >= 40) return 'Conditionally Viable'
  if (gcScore >= 7) return 'At Risk'
  return 'Not Viable'
}
