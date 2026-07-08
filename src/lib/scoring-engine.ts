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
  // 'amortising' (default, equal principal each period) | 'bullet' (full principal at term end)
  // | 'quarterly' (equal principal every 3rd month) | 'seasonal' (equal principal on the
  // specific plan months listed in seasonalMonths -- for harvest-cycle repayment)
  repaymentType?: string
  // Only used when repaymentType === 'seasonal'. 1-indexed months of the plan
  // (not calendar months) on which a repayment falls due, e.g. [6, 12] for a
  // twice-yearly harvest-linked schedule starting at drawdown.
  seasonalMonths?: number[]
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

// Slices an already-computed, full-plan-aligned DebtSchedule down to a
// specific set of month indices -- used when scoring one calendar year
// out of a longer plan. Never re-derives the schedule from these
// indices renumbered starting at 0: buildDebtSchedule keys drawdown,
// grace periods, and repayment due-dates off month 0 of whatever it's
// given, so slicing the OUTPUT (computed once, correctly, for the whole
// plan) is the only way to preserve correct timing for a loan that, say,
// draws down in month 14 and is being scored as part of year 3.
export function sliceDebtScheduleForRange(fullSchedule: DebtSchedule, monthIndices: number[]): DebtSchedule {
  const pick = (arr: number[]) => monthIndices.map(i => arr[i] ?? 0)
  const totalRepayment = pick(fullSchedule.totalRepayment)
  return {
    totalInterest: pick(fullSchedule.totalInterest),
    totalPrincipal: pick(fullSchedule.totalPrincipal),
    totalRepayment,
    totalOutstanding: pick(fullSchedule.totalOutstanding),
    annualY1: totalRepayment.reduce((a, b) => a + b, 0),
  }
}

// Recomputes trade credit's AGGREGATE stats (DPO, DSO, cash conversion
// gap, peaks) for a specific month range, from an already-simulated
// full-plan TradeCreditSummary -- never re-runs computeTradeCredit
// itself for the slice. Outstanding balances are a RUNNING balance
// carried forward month to month (new credit added, settlements
// subtracted); re-simulating from month 0 of a slice would lose
// whatever balance was actually carried in from the prior period,
// understating a mid-plan year's true outstanding position. The
// per-month running-balance arrays must come from a single full-plan
// simulation; only the range-specific averages/sums here change.
export function summarizeTradeCreditForRange(
  fullTradeCredit: TradeCreditSummary, fullCogs: number[], fullRev: number[], monthIndices: number[],
): TradeCreditSummary {
  const pick = (arr: number[]) => monthIndices.map(i => arr[i] ?? 0)
  const payableSlice = pick(fullTradeCredit.totalPayableOutstanding)
  const receivableSlice = pick(fullTradeCredit.totalReceivableOutstanding)
  const cashEffectSlice = pick(fullTradeCredit.monthlyCashEffect)
  const cogsSlice = pick(fullCogs)
  const revSlice = pick(fullRev)

  const n = Math.max(1, monthIndices.length)
  const avgPayable = payableSlice.reduce((a, b) => a + b, 0) / n
  const avgReceivable = receivableSlice.reduce((a, b) => a + b, 0) / n
  const rangeCogs = cogsSlice.reduce((a, b) => a + b, 0)
  const rangeRev = revSlice.reduce((a, b) => a + b, 0)

  const dpo = rangeCogs > 0 ? (avgPayable / rangeCogs) * 365 : 0
  const dso = rangeRev > 0 ? (avgReceivable / rangeRev) * 365 : 0

  return {
    totalPayableOutstanding: payableSlice,
    totalReceivableOutstanding: receivableSlice,
    monthlyCashEffect: cashEffectSlice,
    dpo, dso, cashConversionGap: dso - dpo,
    peakPayable: payableSlice.length > 0 ? Math.max(...payableSlice) : 0,
    peakReceivable: receivableSlice.length > 0 ? Math.max(...receivableSlice) : 0,
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
    const type = ob.repaymentType || 'monthly'
    const interestByMonth = Array(months).fill(0)
    const principalByMonth = Array(months).fill(0)
    const balanceByMonth = Array(months).fill(0)

    // Which months-since-start (mss) are actual principal due dates differs
    // by repayment type. Interest still accrues every month the loan is
    // outstanding regardless of type -- only principal due dates differ.
    const isDueMonth = (mss: number): boolean => {
      if (mss < grace || mss >= tenor) return false
      if (type === 'bullet') return mss === tenor - 1
      if (type === 'quarterly') return (mss - grace) % 3 === 0
      if (type === 'seasonal') return (ob.seasonalMonths || []).includes(mss + 1)
      return true // amortising (default): principal due every month
    }
    // Count due months across the FULL tenor, not capped at the visible
    // projection window -- a loan can run longer than the model shows
    // (e.g. a 36-month tenor on a 24-month projection). Capping this at
    // `months` would undercount installments, making each one too large
    // and paying the loan off inside the window faster than it actually
    // would be, which then distorts totalOutstanding and DSCR.
    let totalPP = 0
    for (let mss = 0; mss < tenor; mss++) {
      if (isDueMonth(mss)) totalPP++
    }

    let bal = ob.principal || 0
    let repayCount = 0
    for (let m = startIdx; m < months; m++) {
      if (bal <= 0.01) { balanceByMonth[m] = 0; continue }
      const mss = m - startIdx
      const interest = bal * monthlyRate
      interestByMonth[m] = interest
      let principal = 0
      if (isDueMonth(mss)) {
        if (type === 'bullet') {
          principal = bal
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
  // Reused across Going Concern, the old Investment Readiness, and now
  // Liquidity Readiness -- these four already existed and map naturally
  // onto LRS dimensions (commercialModel/marketEvidence -> Market
  // Opportunity; managementCapability -> Capacity; governance -> Trust
  // and Compliance).
  commercialModel: number
  managementCapability: number
  marketEvidence: number
  governance: number
  // New fields, added specifically for the Liquidity Readiness Score --
  // each covers an indicator the platform has no other way to know,
  // since it isn't derivable from any financial data already tracked.
  // All 0-5, matching the existing four for one consistent input pattern.
  totalAddressableMarket: number   // Market Opportunity: is there a genuinely large, scalable market?
  repeatCustomers: number          // Market Opportunity: how much revenue comes from repeat business?
  kpiReporting: number             // Visibility: does the business track and report its own KPIs?
  auditTrail: number                // Trust: are transactions recorded with supporting documentation?
  supplierRelationships: number    // Trust: quality of supplier relationships beyond payment timing alone
  productionCapacity: number       // Capacity: can the business scale production/service delivery?
  inventoryAvailability: number    // Capacity: is stock/inventory reliably available when needed?
  customerDiversification: number // Resilience: how concentrated is the customer base?
  supplierDiversification: number  // Resilience: how concentrated is the supplier base?
  businessContinuity: number       // Resilience: is there a succession/continuity plan?
  registrationCompliance: number   // Compliance: is the business properly registered?
  taxCompliance: number             // Compliance: is the business tax-compliant?
  licenceCompliance: number         // Compliance: does it hold the licences its operations require?
  immediateActions: string
  nearTermActions: string
  followUp: string
  coachNotes: string
}

export function defaultCoachAssessment(): CoachAssessment {
  return {
    commercialModel: 2, managementCapability: 2, marketEvidence: 2, governance: 2,
    totalAddressableMarket: 2, repeatCustomers: 2, kpiReporting: 2,
    auditTrail: 2, supplierRelationships: 2,
    productionCapacity: 2, inventoryAvailability: 2,
    customerDiversification: 2, supplierDiversification: 2, businessContinuity: 2,
    registrationCompliance: 2, taxCompliance: 2, licenceCompliance: 2,
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
  // Optional pre-computed schedules, ALREADY ALIGNED to the full plan's
  // actual month indices. When scoring a SLICE of a longer plan (e.g. one
  // calendar year out of a 5-year plan), debtObligations/tradeCreditLines
  // must NOT be re-derived from month 0 of the slice -- buildDebtSchedule
  // and computeTradeCredit both key off drawdownMonth/grace periods/etc
  // relative to month 0, so slicing rev/ebitda/cashClose to year 3 while
  // still recomputing the debt schedule from "month 0 of this slice" would
  // silently misalign a loan's grace period or drawdown timing. Supplying
  // these pre-computed (from a single, correctly-indexed full-plan run)
  // and slicing THEIR outputs instead avoids that entirely, while every
  // caller still goes through the exact same scoring formulas below.
  precomputedDebtSched?: DebtSchedule
  precomputedTradeCredit?: TradeCreditSummary
}

export interface ScoringResult {
  // Credit Risk
  score: number
  classification: 'Stable' | 'At Risk' | 'High Risk'
  classColor: string
  // Whether any debt obligation with principal > 0 exists at all. When false,
  // no DSCR figure should ever be shown -- there is nothing to service.
  hasDebt: boolean
  // The lowest DSCR across periods where a real repayment is actually due.
  // This is NOT an average -- blending real debt-service periods with
  // periods that have no repayment due produces a meaningless number.
  // Null when hasDebt is false, or when hasDebt is true but no repayment
  // has fallen due yet within the plan window (e.g. still in grace period).
  dscrMin: number | null
  // Per-period DSCR, one entry per month: null where no repayment is due
  // that month (not a fake filler value), a real ratio otherwise.
  dscrVals: (number | null)[]
  cashGaps: number
  revTrend: 'Growing' | 'Stable' | 'Declining'
  // Going Concern
  gcScore: number
  gcRating: 'Strong' | 'Adequate' | 'Marginal' | 'Concern'
  gcColor: string
  // Each of the five factors summed into gcScore, exposed individually so
  // the UI can show a genuine per-indicator trend rather than only the
  // combined total -- avoids a second, duplicated copy of these formulas
  // living in the UI layer.
  gcDebtServiceFactor: number
  gcLiquidityFactor: number
  gcRevenueSustainabilityFactor: number
  gcProfitabilityFactor: number
  gcManagementFactor: number
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
  // If a pre-computed, full-plan-aligned schedule was supplied (scoring a
  // slice of a longer plan), use it as-is rather than re-deriving from
  // month 0 of this slice, which would misalign grace periods/drawdown
  // timing relative to the plan's actual calendar.
  const debtSched = inputs.precomputedDebtSched || buildDebtSchedule(inputs.debtObligations || [], m)
  const hasDebt = (inputs.debtObligations || []).some(ob => (ob.principal || 0) > 0)
  // Real DSCR only exists for a period where a repayment is actually due.
  // No placeholder value for periods without a repayment due -- that
  // includes periods before drawdown, during a grace period, or after the
  // loan is fully repaid.
  const dscrVals: (number | null)[] = ebitda.map((e, i) => {
    const ds = debtSched.totalRepayment[i]
    return ds > 0 ? e / ds : null
  })
  const realDscrVals = dscrVals.filter((v): v is number => v !== null)
  // Minimum DSCR across periods with a real repayment due -- the standard
  // covenant-testing figure. Never an average of real and non-existent values.
  const dscrMin = realDscrVals.length > 0 ? Math.min(...realDscrVals) : null
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
  // If a pre-computed, correctly-summarized range was supplied (scoring a
  // slice of a longer plan), use it as-is -- computeTradeCredit's running
  // balance simulation restarts at zero from whatever it's given, so
  // recomputing it from a slice's own (possibly re-sliced or still full,
  // truncated) monthly_new/monthly_settled arrays would silently lose
  // whatever balance was actually carried in from a prior period.
  const tradeCredit = inputs.precomputedTradeCredit || computeTradeCredit(inputs.tradeCreditLines || [], cogs, rev, m)

  // ── Credit Risk Score (0-100) ──
  // Debt service is only scored when a real repayment obligation exists and
  // has actually fallen due. No debt at all is not a credit risk factor --
  // it's excluded from scoring, not defaulted to a fabricated "good" score.
  let score = 50
  if (hasDebt && dscrMin !== null) {
    if (dscrMin >= 1.5) score += 30
    else if (dscrMin >= 1.0) score += 15
    else if (dscrMin < 0.5) score -= 20
  }
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
  const gcRevenueSustainabilityFactor = (tradeCredit.dso > 0 || tradeCredit.dpo > 0)
    ? (tradeCredit.cashConversionGap <= 0 ? 4 : tradeCredit.cashConversionGap <= 30 ? 3 : tradeCredit.cashConversionGap <= 60 ? 2 : 1)
    : 3 // no trade credit data entered -- default adequate
  // Debt service factor: no debt at all scores the same as strong coverage
  // (4/4) since it carries no default risk -- but this is an explicit rule,
  // not a fabricated DSCR number standing in for "no debt."
  const gcDebtServiceFactor = !hasDebt ? 4
    : dscrMin === null ? 3 // debt exists but nothing due yet (grace period) -- treat as adequate, not scored as if failing
    : dscrMin >= 1.5 ? 4 : dscrMin >= 1.0 ? 3 : dscrMin >= 0.5 ? 2 : 1
  const gcLiquidityFactor = minCash >= 0 ? 4 : minCash > -10000000 ? 1 : 0
  const gcProfitabilityFactor = annualEbitda > 0 ? 3 : 2
  const gcManagementFactor = Number(assess.managementCapability) || 2
  const gcScore = Math.min(20,
    gcDebtServiceFactor + gcLiquidityFactor + gcRevenueSustainabilityFactor + gcProfitabilityFactor + gcManagementFactor
  )
  const gcRating: 'Strong'|'Adequate'|'Marginal'|'Concern' = gcScore >= 17 ? 'Strong' : gcScore >= 12 ? 'Adequate' : gcScore >= 7 ? 'Marginal' : 'Concern'
  const gcColor = gcRating === 'Strong' ? GREEN : gcRating === 'Adequate' ? TEAL : gcRating === 'Marginal' ? AMBER : RED

  // ── Investment Readiness Score (0-30) ──
  const ebitdaMargin = annualRevenue > 0 ? annualEbitda / annualRevenue : 0
  const deToEq = (totalEquity > 0) ? (totalLiabilities || 0) / totalEquity : 99
  const irFinancial = Math.min(5, (ebitdaMargin >= 0.2 ? 2 : ebitdaMargin >= 0.05 ? 1 : 0) + (annualEbitda > 0 ? 1 : 0) + (deToEq < 1 ? 2 : deToEq < 2 ? 1 : 0))
  // Same explicit no-debt rule as Going Concern above -- 5/5, not a fabricated ratio.
  const irDebt = !hasDebt ? 5
    : dscrMin === null ? 3
    : Math.min(5, Math.round(dscrMin >= 2 ? 5 : dscrMin >= 1.5 ? 4 : dscrMin >= 1 ? 3 : 2))
  const irScore = Math.min(30, irFinancial + irDebt + (Number(assess.commercialModel) || 2) + (Number(assess.managementCapability) || 2) + (Number(assess.marketEvidence) || 2) + (Number(assess.governance) || 2))
  const irTier: 'Investment Ready'|'Near Ready'|'Development Stage'|'Pre-Investment' = irScore >= 24 ? 'Investment Ready' : irScore >= 17 ? 'Near Ready' : irScore >= 10 ? 'Development Stage' : 'Pre-Investment'
  const irColor = irTier === 'Investment Ready' ? GREEN : irTier === 'Near Ready' ? TEAL : AMBER

  return {
    score, classification, classColor, hasDebt, dscrMin, dscrVals, cashGaps, revTrend,
    gcScore, gcRating, gcColor,
    gcDebtServiceFactor, gcLiquidityFactor, gcRevenueSustainabilityFactor, gcProfitabilityFactor, gcManagementFactor,
    irScore, irTier, irColor, irFinancial, irDebt,
    tradeCredit,
    annualRevenue, annualEbitda, minCash, ebitdaMargin, deToEq,
  }
}

// ── Time series of scores, for the collapsible year/month presentation ──
//
// computeScores (above) summarizes an entire window of months into one
// score -- this produces one of those per calendar year AND, for months
// within an expanded year, one per month using a trailing-twelve-month
// window ending at that month. This is what makes Credit Risk / Going
// Concern / Investment Readiness genuinely collapsible the same way
// P&L/BS/CF already are: every period gets a real, computed value, never
// a placeholder, whether that period is fully actual, fully planned, or
// (most importantly) a period with literally zero live data at all -- a
// brand-new prospective client's plan alone is enough to produce a full
// score at every year and month, since every input here already comes
// from the engine's own rev/ebitda/cash/balance-sheet arrays, which exist
// for every month regardless of whether any actuals have been entered.
//
// Debt schedule and trade credit are each computed ONCE for the full
// plan (preserving correct drawdown/grace-period timing and running
// trade-credit balances), then sliced/summarized per period -- see
// sliceDebtScheduleForRange and summarizeTradeCreditForRange above for
// why re-deriving them per-slice would silently corrupt both.

export interface ScoredPeriod {
  label: string        // e.g. "2026" for a year, "Jul 26" for a month
  monthIndices: number[]
  result: ScoringResult
}

export interface ScoresTimeSeriesInputs {
  rev: number[]; ebitda: number[]; cogs: number[]; cashClose: number[]
  totalEquityByMonth: number[]      // Balance Sheet total_equity, one entry per month
  totalLiabilitiesByMonth: number[] // Balance Sheet total_liabilities, one entry per month
  debtObligations?: DebtObligation[]
  tradeCreditLines?: TradeCreditLine[]
  assess: CoachAssessment
}

function scoreForRange(
  inputs: ScoresTimeSeriesInputs, monthIndices: number[],
  fullDebtSched: DebtSchedule, fullTradeCredit: TradeCreditSummary,
): ScoringResult {
  const pick = (arr: number[]) => monthIndices.map(i => arr[i] ?? 0)
  const lastIdx = monthIndices[monthIndices.length - 1]
  return computeScores({
    rev: pick(inputs.rev),
    ebitda: pick(inputs.ebitda),
    cogs: pick(inputs.cogs),
    cashClose: pick(inputs.cashClose),
    // Point-in-time balances, taken at the LAST month of the range --
    // matching how Balance Sheet itself collapses a year (endOfPeriod
    // aggregation in generic-engine.ts), never summed across the range.
    totalEquity: inputs.totalEquityByMonth[lastIdx] ?? 0,
    totalLiabilities: inputs.totalLiabilitiesByMonth[lastIdx] ?? 0,
    months: monthIndices.length,
    debtObligations: inputs.debtObligations,
    tradeCreditLines: inputs.tradeCreditLines,
    assess: inputs.assess,
    precomputedDebtSched: sliceDebtScheduleForRange(fullDebtSched, monthIndices),
    precomputedTradeCredit: summarizeTradeCreditForRange(fullTradeCredit, inputs.cogs, inputs.rev, monthIndices),
  })
}

export function computeScoresTimeSeries(
  inputs: ScoresTimeSeriesInputs, yearGroups: { year: number; label: string; monthIndices: number[] }[], monthLabels: string[],
): { years: ScoredPeriod[]; monthsByYear: Record<number, ScoredPeriod[]> } {
  const totalMonths = inputs.rev.length
  const fullDebtSched = buildDebtSchedule(inputs.debtObligations || [], totalMonths)
  const fullTradeCredit = computeTradeCredit(inputs.tradeCreditLines || [], inputs.cogs, inputs.rev, totalMonths)

  const years: ScoredPeriod[] = yearGroups.map(g => ({
    label: g.label,
    monthIndices: g.monthIndices,
    result: scoreForRange(inputs, g.monthIndices, fullDebtSched, fullTradeCredit),
  }))

  // Monthly granularity, for when a year is expanded: a trailing-twelve-
  // month window ending at that month (the standard TTM convention for
  // metrics that are inherently annual, like DSCR or annual revenue) --
  // or however many months are actually available from the start of the
  // plan if fewer than 12 exist yet.
  const monthsByYear: Record<number, ScoredPeriod[]> = {}
  yearGroups.forEach(g => {
    monthsByYear[g.year] = g.monthIndices.map(m => {
      const windowStart = Math.max(0, m - 11)
      const windowIndices = Array.from({ length: m - windowStart + 1 }, (_, i) => windowStart + i)
      return {
        label: monthLabels[m],
        monthIndices: windowIndices,
        result: scoreForRange(inputs, windowIndices, fullDebtSched, fullTradeCredit),
      }
    })
  })

  return { years, monthsByYear }
}


export function computeViabilityRating(gcScore: number, creditScore: number): string {
  if (gcScore >= 15 && creditScore >= 65) return 'Viable'
  if (gcScore >= 10 && creditScore >= 40) return 'Conditionally Viable'
  if (gcScore >= 7) return 'At Risk'
  return 'Not Viable'
}

// ── DSCR display helper, shared by every dashboard ──────────────
// Never invents a number. No debt, or debt with nothing due yet, gets a
// plain label -- there is no such thing as an "average DSCR" in this model.
export function dscrLabel(s: { hasDebt: boolean; dscrMin: number | null }): string {
  if (!s.hasDebt) return 'N/A — No Debt'
  if (s.dscrMin === null) return 'N/A — No Repayment Due Yet'
  return `${s.dscrMin.toFixed(2)}x`
}
// Single source of truth for the DSCR rating word shown alongside dscrLabel.
// Previously this same 1.5/1.0 threshold logic was copy-pasted separately
// into both investment-pitch routes -- if the thresholds ever changed, those
// copies would silently drift out of sync with dscrColor above.
export function dscrRating(s: { hasDebt: boolean; dscrMin: number | null }): string {
  if (!s.hasDebt) return 'No Debt'
  if (s.dscrMin === null) return 'Not Yet Due'
  return s.dscrMin >= 1.5 ? 'Strong' : s.dscrMin >= 1.0 ? 'Adequate' : 'Below threshold'
}
// dscrColor derives from dscrRating rather than re-checking the thresholds
// itself, so the wording and the colour can never drift apart.
export function dscrColor(s: { hasDebt: boolean; dscrMin: number | null }, colors: { green: string; amber: string; red: string; slate: string }): string {
  if (!s.hasDebt || s.dscrMin === null) return colors.slate
  const rating = dscrRating(s)
  return rating === 'Strong' ? colors.green : rating === 'Adequate' ? colors.amber : colors.red
}
