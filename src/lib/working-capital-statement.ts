// ============================================================
// WORKING CAPITAL — PERIOD CASH-COVERAGE STATEMENT
//
// A finance app must never answer "can I meet my obligations?" with an
// AVERAGE. DSO/DPO days are averages and they hide the month a business
// actually runs dry. This module produces the figure a CEO / finance
// manager actually needs: for EACH period, the real cash expected to come
// IN, every cash obligation going OUT (supplier payments, operating costs,
// loan interest, loan principal repayment, tax, capital purchases), the
// resulting surplus or shortfall, the closing cash position, and — across
// the whole horizon — the peak funding the business must have on hand to
// never run out.
//
// It is a pure re-presentation (direct method) of figures the engine has
// ALREADY computed, so it reconciles EXACTLY to the cash-flow statement and
// balance sheet:
//
//   collections − supplierPayments − operatingCosts − interest − tax
//     + financingIn − principalRepayment − capex  ==  cf.net   (every month)
//   opening + surplus                              ==  cf.close (every month)
//
// Derivation (all identities, no new assumptions):
//   collections       = revenue      − Δ receivables      (cash actually collected)
//   supplierPayments  = cost of sales − Δ payables         (cash actually paid to suppliers)
//   operatingCosts    = staff + overheads + shared costs
//   financingIn       = equity/grants drawn + new loan drawdowns  (cf.fin_cash + principal)
//   capex             = cash spent on fixed assets          (−cf.inv_cash)
// Any residual between the derived operating cash and the engine's own
// op_cash (a partial-actual month can blend an actual revenue with a plan
// cost) is booked to `otherAdj` so the statement ALWAYS ties to cf.close.
// ============================================================

export interface WorkingCapitalMonth {
  monthIndex: number      // 0-based
  isActual: boolean       // past/current (real) vs future (plan)
  opening: number         // cash at start of the period (== prior close)
  // ── Cash IN ──
  collections: number     // collected from customers this period
  financingIn: number     // equity/grants/new loan drawdowns received this period
  totalIn: number
  // ── Cash OUT (obligations) ──
  supplierPayments: number
  operatingCosts: number  // staff + overheads + shared
  interest: number        // loan interest due
  tax: number             // corporate tax due
  principalRepayment: number // loan principal repaid
  capex: number           // capital purchases
  otherAdj: number        // reconciliation residual (usually ~0); + = extra outflow
  totalObligations: number
  // ── IAS 7 section subtotals (each reconciles to the engine cash flow) ──
  netOperating: number    // collections − suppliers − opex − interest − tax  (== cf.op_cash)
  netInvesting: number    // − capex                                          (== cf.inv_cash)
  netFinancing: number    // financing in − principal repaid                  (== cf.fin_cash)
  // ── Result ──
  surplus: number         // netOperating + netInvesting + netFinancing  (== engine cf.net for the month)
  closing: number         // opening + surplus                           (== engine cf.close for the month)
}

export interface WorkingCapitalStatement {
  months: WorkingCapitalMonth[]
  // Largest amount of cash the business must have available so its closing
  // position never goes below zero across the whole horizon. This IS the
  // working capital the CEO needs to secure. 0 when cash never runs negative.
  peakFundingNeed: number
  peakFundingMonthIndex: number   // 0-based month of the worst closing position, or -1
  worstClosing: number            // the lowest closing cash across the horizon
  shortfallMonths: number         // how many periods close below zero
}

// Loosely-typed view of the runGenericModel result — only the arrays this
// statement reads. Accepting a narrow shape (rather than the whole result
// type) keeps the module independently unit-testable.
export interface WorkingCapitalInput {
  months: number
  con: {
    // At the consolidated level `opex` is the FULL operating cost — staff +
    // overheads + shared are already summed into it (there is no separate
    // con.staff / con.shared array), and act_opex is its actual counterpart.
    rev: number[]; cogs: number[]; opex: number[]
    act_rev: (number | null)[]; act_cogs: (number | null)[]; act_opex: (number | null)[]
    interest: number[]; hybrid_tax: number[]
  }
  cf: {
    op_cash: number[]; fin_cash: number[]; inv_cash: number[]
    open: number[]; close: number[]; act_mask: boolean[]
  }
  bs: { accounts_receivable: number[]; accounts_payable: number[] }
  debtSchedule: { totalPrincipal: number[] }
}

const n = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function computeWorkingCapitalStatement(input: WorkingCapitalInput): WorkingCapitalStatement {
  const { months, con, cf, bs, debtSchedule } = input
  const out: WorkingCapitalMonth[] = []

  for (let m = 0; m < months; m++) {
    // effective = actual figure where the month is closed, else the plan.
    const rev  = con.act_rev[m]  != null ? (con.act_rev[m]  as number) : n(con.rev[m])
    const cogs = con.act_cogs[m] != null ? (con.act_cogs[m] as number) : n(con.cogs[m])
    // Full operating cost (staff + overheads + shared) — already consolidated
    // into con.opex; use the actual where the month is closed, else the plan.
    const operating = con.act_opex[m] != null ? (con.act_opex[m] as number) : n(con.opex[m])

    const AR = n(bs.accounts_receivable[m]); const prevAR = m > 0 ? n(bs.accounts_receivable[m - 1]) : 0
    const AP = n(bs.accounts_payable[m]);    const prevAP = m > 0 ? n(bs.accounts_payable[m - 1]) : 0
    const dAR = AR - prevAR
    const dAP = AP - prevAP

    const collections      = rev - dAR          // cash in from customers
    const supplierPayments = cogs - dAP          // cash out to suppliers
    const operatingCosts   = operating           // staff + overheads + shared (consolidated)
    const interest         = n(con.interest[m])
    const tax              = n(con.hybrid_tax[m])
    const principalRepayment = n(debtSchedule.totalPrincipal[m])
    const capex            = Math.max(0, -n(cf.inv_cash[m]))          // fixed-asset purchases
    const financingIn      = n(cf.fin_cash[m]) + principalRepayment  // gross financing inflow (drawdowns/equity/grants)

    // Reconcile to the engine's own operating cash: a partial-actual month
    // can blend actual revenue with plan costs, so the effective figures
    // above may differ slightly from op_cash. Book the difference so the
    // statement always ties to cf.close exactly.
    const opDerived = collections - supplierPayments - operatingCosts - interest - tax
    const otherAdj  = opDerived - n(cf.op_cash[m])   // + = derived overstated op cash → extra outflow to correct

    const totalIn = collections + financingIn
    const totalObligations = supplierPayments + operatingCosts + interest + tax
      + principalRepayment + capex + otherAdj

    // IAS 7 section subtotals — the direct-method classification.
    // Operating = cash from trading (receipts − payments − interest − tax),
    // Investing = capital expenditure, Financing = proceeds − repayments.
    const netOperating = collections - supplierPayments - operatingCosts - interest - tax - otherAdj // == cf.op_cash[m]
    const netInvesting = -capex                                                                      // == cf.inv_cash[m]
    const netFinancing = financingIn - principalRepayment                                            // == cf.fin_cash[m]

    const surplus = netOperating + netInvesting + netFinancing   // == cf.net[m]
    const opening = n(cf.open[m])
    const closing = opening + surplus                            // == cf.close[m]

    out.push({
      monthIndex: m,
      isActual: !!cf.act_mask[m],
      opening,
      collections, financingIn, totalIn,
      supplierPayments, operatingCosts, interest, tax, principalRepayment, capex, otherAdj,
      totalObligations,
      netOperating, netInvesting, netFinancing,
      surplus, closing,
    })
  }

  let worstClosing = out.length ? out[0].closing : 0
  let peakFundingMonthIndex = out.length ? 0 : -1
  let shortfallMonths = 0
  out.forEach(mo => {
    if (mo.closing < worstClosing) { worstClosing = mo.closing; peakFundingMonthIndex = mo.monthIndex }
    if (mo.closing < 0) shortfallMonths++
  })
  const peakFundingNeed = worstClosing < 0 ? -worstClosing : 0

  return { months: out, peakFundingNeed, peakFundingMonthIndex, worstClosing, shortfallMonths }
}
