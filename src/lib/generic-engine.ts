import { computeScores, buildDebtSchedule, computeTradeCredit, defaultCoachAssessment, type CoachAssessment, type ScoringResult, type DebtObligation, type TradeCreditLine } from './scoring-engine'

// ============================================================
// CLEARVIEW GENERIC ENGINE v1
// Database-driven financial model for any client type
// Draws directly from CONAS engine pattern
// ============================================================

// ── Formatting helpers (same as CONAS) ──────────────────────
export function fmt(n: number, cc = 'UGX'): string {
  const v = Math.round(n || 0), s = v < 0 ? '-' : '', a = Math.abs(v)
  if (a >= 1_000_000_000) return `${s}${cc} ${(a/1e9).toFixed(1)}B`
  if (a >= 1_000_000)     return `${s}${cc} ${(a/1e6).toFixed(1)}M`
  if (a >= 1_000)         return `${s}${cc} ${(a/1e3).toFixed(0)}K`
  return `${s}${cc} ${a.toLocaleString('en-US')}`
}
export function fmtFull(n: number, cc = 'UGX'): string {
  const v = Math.round(n || 0)
  return `${v < 0 ? '-' : ''}${cc} ${Math.abs(v).toLocaleString('en-US')}`
}
export function pct(n: number): string { return `${(n * 100).toFixed(1)}%` }

export function buildMonthLabels(startDate: string, months = 24): string[] {
  const d = new Date(startDate)
  return Array.from({ length: months }, (_, i) => {
    const m = new Date(d.getFullYear(), d.getMonth() + i, 1)
    return m.toLocaleString('en-GB', { month: 'short', year: '2-digit' })
  })
}

// Groups month indices by calendar year. Deliberately data-driven -- the
// number of years returned is however many calendar years the model's
// start_date + months span, not a fixed list. A model with 24 planning
// months produces however many year-groups that spans (partial first
// year if start_date isn't January, partial last year if the window
// doesn't end in December); a model later extended to 60+ months
// produces more year-groups automatically, with no separate code path
// needed. This is what makes "add another year" a data change rather
// than a UI change -- the collapsible column UI just renders however
// many groups this returns.
export interface YearGroup {
  year: number
  label: string
  monthIndices: number[]
}
export function buildYearGroups(startDate: string, months: number): YearGroup[] {
  const start = new Date(startDate)
  const startYear = start.getUTCFullYear()
  const startMonth = start.getUTCMonth()
  const byYear: Record<number, number[]> = {}
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(startYear, startMonth + i, 1))
    const y = d.getUTCFullYear()
    if (!byYear[y]) byYear[y] = []
    byYear[y].push(i)
  }
  return Object.keys(byYear).map(Number).sort((a, b) => a - b)
    .map(year => ({ year, label: String(year), monthIndices: byYear[year] }))
}

// Collapses one row's per-month values into a single year total, plus
// whether that year is fully actual, fully plan, or -- for the year
// currently in progress -- a mix of both (some months closed/actual,
// the rest still forecast). The partial case needs its own status
// rather than being forced into "actual" or "plan": a year that's
// half real and half forecast is neither, and showing it as one or
// the other would misrepresent it the same way a single blended
// month once did.
export interface YearCollapsedCell {
  value: number
  isFullyActual: boolean
  isPartiallyActual: boolean
  isFullyPlan: boolean
}
// Which kind of figure a row is, for collapsing a year down to one
// value:
// - 'sum' (default): a FLOW over the period -- revenue, costs, cash
//   movements. The year total is the sum of its months. Correct for
//   every P&L row and most Cash Flow rows.
// - 'endOfPeriod': a STOCK, a balance AT A POINT IN TIME -- every
//   Balance Sheet row, and Closing Cash. Summing 12 months of "Total
//   Assets" would produce a meaningless, wildly inflated number; the
//   only sensible collapsed value is the balance as of the last month
//   in that year.
// - 'startOfPeriod': also a point-in-time balance, but as of the START
//   of the year -- specifically Opening Cash, which is genuinely the
//   prior year's closing balance carried forward, not a mid-year or
//   end-of-year figure.
// - 'average': a per-unit PRICE or RATE -- Buy Price, Sell Price, Fee
//   per Engagement. Neither summing (a "total price" for the year is
//   meaningless) nor a single endpoint month (which would discard the
//   year's actual pricing pattern) makes sense; the collapsed value is
//   the mean across months that actually had activity, matching the
//   same "average of non-zero months" convention already used
//   elsewhere in this codebase for these exact figures.
export type YearAggregation = 'sum' | 'endOfPeriod' | 'startOfPeriod' | 'average'

export function collapseYear(values: number[], actualMask: boolean[] | undefined, monthIndices: number[], aggregation: YearAggregation = 'sum'): YearCollapsedCell {
  if (aggregation === 'endOfPeriod' || aggregation === 'startOfPeriod') {
    // A point-in-time balance has no "partial" state the way a sum of
    // flows over a part-actual, part-plan year does -- it's simply the
    // balance as of one specific month, which is either a real, closed
    // figure or a projected one, never a blend of both.
    const relevantIdx = aggregation === 'endOfPeriod' ? monthIndices[monthIndices.length - 1] : monthIndices[0]
    const value = values[relevantIdx] ?? 0
    if (!actualMask) return { value, isFullyActual: false, isPartiallyActual: false, isFullyPlan: true }
    const isActual = !!actualMask[relevantIdx]
    return { value, isFullyActual: isActual, isPartiallyActual: false, isFullyPlan: !isActual }
  }
  let value: number
  if (aggregation === 'average') {
    const nonZero = monthIndices.map(i => values[i] ?? 0).filter(v => v !== 0)
    value = nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0
  } else {
    value = monthIndices.reduce((s, i) => s + (values[i] ?? 0), 0)
  }
  if (!actualMask) return { value, isFullyActual: false, isPartiallyActual: false, isFullyPlan: true }
  const maskSlice = monthIndices.map(i => actualMask[i])
  const allActual = maskSlice.length > 0 && maskSlice.every(Boolean)
  const allPlan = maskSlice.every(v => !v)
  return { value, isFullyActual: allActual, isPartiallyActual: !allActual && !allPlan, isFullyPlan: allPlan }
}

// Which year should start expanded: the one containing today's date, so
// whoever opens the P&L sees the year they're currently living through
// broken out by month by default. If today's calendar year isn't in the
// model's range at all (a fully-future plan, or a historical archive),
// falls back to the first year rather than leaving every year collapsed
// with no detail visible until the user clicks something.
export function defaultExpandedYears(yearGroups: YearGroup[], currentYear: number): Record<number, boolean> {
  const init: Record<number, boolean> = {}
  const hasCurrentYear = yearGroups.some(g => g.year === currentYear)
  yearGroups.forEach((g, idx) => { init[g.year] = hasCurrentYear ? g.year === currentYear : idx === 0 })
  return init
}

// ── Types ────────────────────────────────────────────────────

// Unit types
export type UnitType = 'product' | 'service' | 'aggregator' | 'mixed'

// Line categories
export type LineCategory = 'revenue' | 'cost_of_sales' | 'staff' | 'direct_opex' | 'shared'

// Line types -- drives spread analysis
export type LineType = 'standard' | 'spread' | 'service_fee'

export interface GenericPlanLine {
  id: string
  unit_id: string
  name: string
  category: LineCategory
  line_type: LineType
  // For spread lines: buy price, sell price, volume
  buy_price?: number[]      // monthly buy price
  sell_price?: number[]     // monthly sell price
  volume?: number[]         // monthly volume (units)
  // For service lines: fee per engagement, cost per engagement
  fee_per_engagement?: number[]
  cost_per_engagement?: number[]
  engagements?: number[]    // monthly number of engagements
  // Standard plan: monthly amounts (24 months)
  monthly_plan: number[]
  active: boolean
}

export interface GenericBusinessUnit {
  id: string
  name: string
  short: string
  type: UnitType
  color: string
  headcount: number
  active: boolean
  parent_id?: string        // for FGE groups under a parent aggregator
  sort_order: number
}

export interface GenericModelConfig {
  client_id: string
  business_name: string
  currency: string
  start_date: string        // ISO date string
  planning_months: number   // 12 or 24
  business_units: GenericBusinessUnit[]
  plan_lines: GenericPlanLine[]
  shared_lines: GenericPlanLine[]
  settings: {
    shared_cost_fixed_pct: number    // % allocated by headcount vs revenue
    corporate_tax_rate: number
    opening_cash_balance: number
    transfer_price_margin?: number
    scenarios?: GenericScenario[]
    capital_structure?: GenericCapital
    coach_assessment?: CoachAssessment
    // Multiple debt obligations (bank loans, non-bank facilities/SACCOs, etc) --
    // each with its own rate, tenor and drawdown. Supplements capital_structure.bank_loan
    // for clients who only have one simple loan; use this list when there is more than one.
    debts?: DebtObligation[]
    // Trade credit: supplier credit received (payable) and customer/partner
    // credit given (receivable), tracked monthly per line.
    trade_credit_lines?: TradeCreditLine[]
  }
}

export interface GenericScenario {
  id: string
  label: string
  rev_mult: number
  cost_mult: number
  active: boolean
}

export interface GenericCapital {
  shareholder_contribution: number
  grant_non_repayable: number
  grant_recoverable: number
  bank_loan: number
  annual_interest_rate: number
  loan_tenor_years: number
  fixed_assets: number
}

// ── Default empty config ────────────────────────────────────
export function defaultGenericConfig(overrides: Partial<GenericModelConfig> = {}): GenericModelConfig {
  return {
    client_id: '',
    business_name: '',
    currency: 'UGX',
    start_date: new Date().toISOString().split('T')[0],
    planning_months: 24,
    business_units: [],
    plan_lines: [],
    shared_lines: [],
    settings: {
      shared_cost_fixed_pct: 0.50,
      corporate_tax_rate: 0.30,
      opening_cash_balance: 0,
      scenarios: [
        { id: 'conservative', label: 'Conservative (−20% rev, +10% costs)', rev_mult: 0.80, cost_mult: 1.10, active: false },
        { id: 'base',         label: 'Base Case',                            rev_mult: 1.00, cost_mult: 1.00, active: true  },
        { id: 'optimistic',   label: 'Optimistic (+20% rev, −5% costs)',    rev_mult: 1.20, cost_mult: 0.95, active: false },
        { id: 'stress',       label: 'Stress Test (−30% rev, +20% costs)',  rev_mult: 0.70, cost_mult: 1.20, active: false },
      ],
      capital_structure: {
        shareholder_contribution: 0,
        grant_non_repayable: 0,
        grant_recoverable: 0,
        bank_loan: 0,
        annual_interest_rate: 0.18,
        loan_tenor_years: 2,
        fixed_assets: 0,
      },
    },
    ...overrides,
  }
}

// Extends every month-sized array in the config by additionalMonths,
// all together, in one operation -- this is what makes "add another
// year" safe. There are five distinct places a monthly array lives in
// this config, and if even one were missed, the engine would either
// error (mismatched array lengths) or silently produce wrong figures
// for the newly-added months in whichever array wasn't extended:
//   1. plan_lines[].monthly_plan (every line, every business unit)
//   2. plan_lines[].buy_price/sell_price/volume (spread-type lines only)
//   3. plan_lines[].fee_per_engagement/cost_per_engagement/engagements
//      (service_fee-type lines only)
//   4. shared_lines[].monthly_plan
//   5. settings.trade_credit_lines[].monthly_new/monthly_settled
// Debt obligations and capital structure are deliberately NOT touched --
// they're scalar (a single rate, tenor, principal), with the actual
// month-by-month repayment schedule computed dynamically by
// buildDebtSchedule() for however many months exist, so they're already
// compatible with any horizon with no changes needed.
//
// Pure: returns a new config object, never mutates the one passed in
// (matching how the rest of this file and the React state that holds
// this config expect immutability). New months are always zero-filled;
// every existing month's value is preserved exactly as-is -- this is
// purely additive, never a truncation or edit of anything already there.
//
// Throws if any array is already out of sync with config.planning_months
// -- see the mismatch check below -- rather than silently compounding a
// pre-existing corruption by appending to whatever length happens to be
// there.
export function extendPlanningHorizon(config: GenericModelConfig, additionalMonths: number): GenericModelConfig {
  if (!Number.isInteger(additionalMonths)) throw new Error(`additionalMonths must be a whole number, got ${additionalMonths}`)
  if (additionalMonths <= 0) return config

  // Refuses to extend a config that's already inconsistent -- appending
  // additionalMonths to whatever length an array currently happens to
  // be would silently carry a pre-existing corruption forward (and
  // potentially mask it further, since the array would now be a
  // different, but still wrong, length). Throwing here surfaces the
  // problem clearly, with exactly which array is mismatched, rather
  // than compounding it invisibly.
  const mismatches: string[] = []
  const checkLen = (label: string, arr: number[] | undefined) => {
    if (arr && arr.length !== config.planning_months) mismatches.push(`${label} (${arr.length} months, expected ${config.planning_months})`)
  }
  config.plan_lines.forEach(l => {
    checkLen(`plan line "${l.name}"`, l.monthly_plan)
    checkLen(`plan line "${l.name}" buy_price`, l.buy_price)
    checkLen(`plan line "${l.name}" sell_price`, l.sell_price)
    checkLen(`plan line "${l.name}" volume`, l.volume)
    checkLen(`plan line "${l.name}" fee_per_engagement`, l.fee_per_engagement)
    checkLen(`plan line "${l.name}" cost_per_engagement`, l.cost_per_engagement)
    checkLen(`plan line "${l.name}" engagements`, l.engagements)
  })
  config.shared_lines.forEach(l => checkLen(`shared line "${l.name}"`, l.monthly_plan))
  config.settings.trade_credit_lines?.forEach(t => {
    checkLen(`trade credit line "${t.name}" monthly_new`, t.monthly_new)
    checkLen(`trade credit line "${t.name}" monthly_settled`, t.monthly_settled)
  })
  if (mismatches.length > 0) {
    throw new Error(`Cannot extend planning horizon: the following are already out of sync with planning_months (${config.planning_months}) and must be fixed first: ${mismatches.join('; ')}`)
  }

  const extendArr = (arr: number[] | undefined): number[] | undefined =>
    arr ? [...arr, ...Array(additionalMonths).fill(0)] : arr

  const extendLine = (l: GenericPlanLine): GenericPlanLine => ({
    ...l,
    monthly_plan: extendArr(l.monthly_plan) as number[],
    buy_price: extendArr(l.buy_price),
    sell_price: extendArr(l.sell_price),
    volume: extendArr(l.volume),
    fee_per_engagement: extendArr(l.fee_per_engagement),
    cost_per_engagement: extendArr(l.cost_per_engagement),
    engagements: extendArr(l.engagements),
  })

  return {
    ...config,
    planning_months: config.planning_months + additionalMonths,
    plan_lines: config.plan_lines.map(extendLine),
    shared_lines: config.shared_lines.map(extendLine),
    settings: {
      ...config.settings,
      trade_credit_lines: config.settings.trade_credit_lines?.map(t => ({
        ...t,
        monthly_new: extendArr(t.monthly_new) as number[],
        monthly_settled: extendArr(t.monthly_settled) as number[],
      })),
    },
  }
}

// ── Helper: create a blank plan line ────────────────────────
export function blankLine(
  id: string, unit_id: string, name: string,
  category: LineCategory, months = 24,
  line_type: LineType = 'standard'
): GenericPlanLine {
  return {
    id, unit_id, name, category, line_type,
    monthly_plan: Array(months).fill(0),
    active: true,
  }
}

// ── Helper: create a spread line ────────────────────────────
export function spreadLine(
  id: string, unit_id: string, name: string, months = 24
): GenericPlanLine {
  return {
    id, unit_id, name,
    category: 'revenue',
    line_type: 'spread',
    buy_price: Array(months).fill(0),
    sell_price: Array(months).fill(0),
    volume: Array(months).fill(0),
    monthly_plan: Array(months).fill(0), // computed from spread
    active: true,
  }
}

// ── Helper: create a service fee line ───────────────────────
export function serviceFeeLine(
  id: string, unit_id: string, name: string, months = 24
): GenericPlanLine {
  return {
    id, unit_id, name,
    category: 'revenue',
    line_type: 'service_fee',
    fee_per_engagement: Array(months).fill(0),
    cost_per_engagement: Array(months).fill(0),
    engagements: Array(months).fill(0),
    monthly_plan: Array(months).fill(0), // computed from fee × engagements
    active: true,
  }
}

// ── Unit P&L result ─────────────────────────────────────────
export interface GenericUnitPL {
  rev: number[]
  cogs: number[]
  gp: number[]
  staff: number[]
  opex: number[]
  shared: number[]
  total_opex: number[]
  ebitda: number[]
  // Actuals under the calendar rule: non-null for a past/current month
  // (actual value, zero if nothing was entered for that category), null
  // for a future month (meaning "use the plan" at display time).
  act_rev: (number | null)[]
  act_cogs: (number | null)[]
  act_staff: (number | null)[]
  act_opex: (number | null)[]
  // Actual Gross Profit: for a past/current month, act_rev minus act_cogs
  // (each already zero rather than null where nothing was entered for
  // that category this month). Null for a future month -- display falls
  // back to the plan.
  act_gp: (number | null)[]
  // Actual EBITDA at the unit level: for a past/current month, act_gp
  // minus act_staff minus act_opex minus Shared Costs. Shared Costs always
  // use their planned/allocated value -- that allocation is an internal
  // planning construct with no independent actual-tracking mechanism of
  // its own, unlike revenue/COGS/staff/opex. Null for a future month.
  act_ebitda: (number | null)[]
  // Spread analysis per line
  spread_analysis: {
    line_id: string
    name: string
    buy_price: number[]
    sell_price: number[]
    volume: number[]
    spread_per_unit: number[]
    total_spread: number[]
    spread_margin_pct: number[]
  }[]
  // Service margin per line
  service_margins: {
    line_id: string
    name: string
    fee: number[]
    cost: number[]
    margin: number[]
    margin_pct: number[]
    engagements: number[]
  }[]
  // Break-even per revenue line
  breakeven: {
    line_id: string
    name: string
    monthly_fixed_cost: number
    variable_cost_pct: number
    breakeven_revenue: number
    breakeven_units?: number
    current_revenue: number
    gap: number
  }[]
  // Annual totals
  ann_rev: number
  ann_cogs: number
  ann_gp: number
  ann_staff: number
  ann_opex: number
  ann_shared: number
  ann_ebitda: number
  gp_margin: number
  ebitda_margin: number
  // Staff efficiency
  staff_efficiency: {
    revenue_per_head: number
    staff_cost_pct: number
    headcount: number
  }
}

// ── Main engine ─────────────────────────────────────────────
export function runGenericModel(
  config: GenericModelConfig,
  actuals?: Record<string, Record<string, Record<string, number>>> // unit_id -> period -> line_id -> value
) {
  const months = config.planning_months || 24
  const settings = config.settings
  const activeScenario = settings.scenarios?.find(s => s.active) || { rev_mult: 1, cost_mult: 1 }
  const { rev_mult, cost_mult } = activeScenario

  const activeUnits = config.business_units.filter(u => u.active)
  const topUnits = activeUnits.filter(u => !u.parent_id)
  const subUnitsByParent: Record<string, GenericBusinessUnit[]> = {}
  activeUnits.filter(u => u.parent_id).forEach(u => {
    if (!subUnitsByParent[u.parent_id!]) subUnitsByParent[u.parent_id!] = []
    subUnitsByParent[u.parent_id!].push(u)
  })

  const yr = (a: number[]) => a.reduce((s, v) => s + v, 0)
  const zero = () => Array(months).fill(0) as number[]
  const nullArr = () => Array(months).fill(null) as (number | null)[]

  // The ONE rule for actual vs. plan, everywhere in this model: a month
  // at or before the current calendar month shows whatever actual data
  // was entered (zero if none was -- never silently substituted with
  // plan). A future month shows the planned figure. This is a pure
  // calendar fact, computed once and used identically for every unit,
  // the consolidated total, cash flow, and the balance sheet -- there is
  // no separate "is the data complete enough" question. If nothing was
  // entered for a past or current month, that month is empty/zero: it
  // is real information (nothing has been recorded yet), not something
  // to paper over with a forecast.
  const startD = new Date(config.start_date)
  const today = new Date()
  const todayMonthIndex = (today.getUTCFullYear() - startD.getUTCFullYear()) * 12 + (today.getUTCMonth() - startD.getUTCMonth())
  const isPastOrCurrentMonth: boolean[] = Array.from({length: months}, (_, m) => m <= todayMonthIndex)

  // ── Calculate unit P&L ────────────────────────────────────
  function calcUnit(unit: GenericBusinessUnit): GenericUnitPL {
    const lines = config.plan_lines.filter(l => l.unit_id === unit.id && l.active)
    const rev = zero(), cogs = zero(), staff = zero(), opex = zero()
    const act_rev = nullArr(), act_cogs = nullArr(), act_staff = nullArr(), act_opex = nullArr()
    const spread_analysis: GenericUnitPL['spread_analysis'] = []
    const service_margins: GenericUnitPL['service_margins'] = []

    lines.forEach(l => {
      // Compute monthly_plan for spread and service lines
      let plan = [...l.monthly_plan]

      if (l.line_type === 'spread' && l.buy_price && l.sell_price && l.volume) {
        // Revenue is the gross sale value (sell price x volume) -- these clients
        // buy and resell as principals, bearing inventory and price risk, so
        // standard revenue recognition is gross sales, not net margin. Buy cost
        // is booked separately below as cost of sales. Using net margin here
        // would double-count the buy cost: once implicitly (revenue already net)
        // and once explicitly in COGS, understating both revenue and gross profit.
        plan = l.volume.map((v, m) => (l.sell_price![m] || 0) * v)
        // Build spread analysis
        const spread_per_unit = l.volume.map((_, m) => (l.sell_price![m] || 0) - (l.buy_price![m] || 0))
        const total_spread = l.volume.map((v, m) => spread_per_unit[m] * v)
        const spread_margin_pct = l.sell_price.map((sp, m) => sp > 0 ? spread_per_unit[m] / sp : 0)
        spread_analysis.push({
          line_id: l.id, name: l.name,
          buy_price: l.buy_price, sell_price: l.sell_price, volume: l.volume,
          spread_per_unit, total_spread, spread_margin_pct,
        })
        // Also add cost of sales line for buy price × volume
        const buy_cost = l.volume.map((v, m) => (l.buy_price![m] || 0) * v)
        buy_cost.forEach((v, m) => cogs[m] += v * cost_mult)
      }

      if (l.line_type === 'service_fee' && l.fee_per_engagement && l.cost_per_engagement && l.engagements) {
        plan = l.engagements.map((e, m) => (l.fee_per_engagement![m] || 0) * e)
        const cost_plan = l.engagements.map((e, m) => (l.cost_per_engagement![m] || 0) * e)
        cost_plan.forEach((v, m) => cogs[m] += v * cost_mult)
        const margin = l.engagements.map((e, m) => ((l.fee_per_engagement![m] || 0) - (l.cost_per_engagement![m] || 0)) * e)
        const margin_pct = l.fee_per_engagement.map((f, m) => f > 0 ? ((f - (l.cost_per_engagement![m] || 0)) / f) : 0)
        service_margins.push({
          line_id: l.id, name: l.name,
          fee: l.fee_per_engagement, cost: l.cost_per_engagement, margin, margin_pct,
          engagements: l.engagements,
        })
      }

      // Add to plan totals
      plan.forEach((v, m) => {
        const val = v * (l.category === 'revenue' ? rev_mult : cost_mult)
        if (l.category === 'revenue')          rev[m]   += val
        else if (l.category === 'cost_of_sales') cogs[m] += val
        else if (l.category === 'staff')        staff[m] += val
        else if (l.category === 'direct_opex')  opex[m]  += val
      })

      // Add actuals if available
      if (actuals?.[unit.id]) {
        Object.entries(actuals[unit.id]).forEach(([period, lineVals]) => {
          const d = new Date(period)
          const startD = new Date(config.start_date)
          const mIdx = (d.getFullYear() - startD.getFullYear()) * 12 + (d.getMonth() - startD.getMonth())
          if (mIdx < 0 || mIdx >= months) return
          const val = lineVals[l.id]
          if (val === undefined) return
          if (l.category === 'revenue') { if (act_rev[mIdx] === null) act_rev[mIdx] = 0; (act_rev[mIdx] as number) += val }
          else if (l.category === 'cost_of_sales') { if (act_cogs[mIdx] === null) act_cogs[mIdx] = 0; (act_cogs[mIdx] as number) += val }
          else if (l.category === 'staff') { if (act_staff[mIdx] === null) act_staff[mIdx] = 0; (act_staff[mIdx] as number) += val }
          else if (l.category === 'direct_opex') { if (act_opex[mIdx] === null) act_opex[mIdx] = 0; (act_opex[mIdx] as number) += val }
        })
      }
    })

    const gp = rev.map((r, m) => r - cogs[m])
    // Actual Gross Profit: a past or current month uses whatever actual
    // was entered, treating anything not entered as zero -- never
    // silently substituting the planned figure. A future month is null
    // here, meaning "use the plan" at display time. There is no
    // "complete enough" question; it's purely which side of today the
    // month falls on.
    const act_gp = rev.map((_, m) => isPastOrCurrentMonth[m] ? (act_rev[m] ?? 0) - (act_cogs[m] ?? 0) : null)


    // Break-even per revenue line
    const breakeven: GenericUnitPL['breakeven'] = []
    const rev_lines = lines.filter(l => l.category === 'revenue')
    const total_fixed = yr(staff) + yr(opex)
    rev_lines.filter(l => !l.name.startsWith('Add ')).forEach(l => {
      const line_rev = l.line_type === 'spread' && l.volume && l.sell_price && l.buy_price
        ? l.volume.reduce((s, v, m) => s + (l.sell_price![m] || 0) * v * rev_mult, 0)
        : yr(l.monthly_plan) * rev_mult
      const line_share = yr(rev) > 0 ? line_rev / yr(rev) : 1 / Math.max(1, rev_lines.length)
      const allocated_fixed = total_fixed * line_share
      const cogs_pct = line_rev > 0 ? (yr(cogs) * line_share) / line_rev : 0
      const be_rev = cogs_pct < 1 ? allocated_fixed / (1 - cogs_pct) : 0
      breakeven.push({
        line_id: l.id,
        name: l.name,
        monthly_fixed_cost: allocated_fixed / months,
        variable_cost_pct: cogs_pct,
        breakeven_revenue: be_rev,
        current_revenue: line_rev,
        gap: line_rev - be_rev,
      })
    })

    const ann_rev = yr(rev), ann_cogs = yr(cogs), ann_gp = yr(gp)
    const ann_staff = yr(staff), ann_opex = yr(opex)

    return {
      rev, cogs, gp, staff, opex,
      shared: zero(), total_opex: zero(), ebitda: zero(),
      act_rev, act_cogs, act_staff, act_opex, act_gp, act_ebitda: nullArr(),
      spread_analysis, service_margins, breakeven,
      ann_rev, ann_cogs, ann_gp, ann_staff, ann_opex,
      ann_shared: 0, ann_ebitda: 0,
      gp_margin: ann_rev > 0 ? ann_gp / ann_rev : 0,
      ebitda_margin: 0,
      staff_efficiency: {
        revenue_per_head: unit.headcount > 0 ? ann_rev / unit.headcount : 0,
        staff_cost_pct: ann_rev > 0 ? ann_staff / ann_rev : 0,
        headcount: unit.headcount,
      },
    }
  }

  // ── Build all unit P&Ls ───────────────────────────────────
  const unitPL: Record<string, GenericUnitPL> = {}
  activeUnits.forEach(u => { unitPL[u.id] = calcUnit(u) })

  // Consolidate parent units from sub-units
  Object.entries(subUnitsByParent).forEach(([parentId, subs]) => {
    const c = {
      rev: zero(), cogs: zero(), gp: zero(), staff: zero(), opex: zero(),
      act_rev: nullArr(), act_cogs: nullArr(), act_staff: nullArr(), act_opex: nullArr(),
      spread_analysis: [] as GenericUnitPL['spread_analysis'],
      service_margins: [] as GenericUnitPL['service_margins'],
      breakeven: [] as GenericUnitPL['breakeven'],
    }
    subs.forEach(su => {
      const r = unitPL[su.id]
      for (let m = 0; m < months; m++) {
        c.rev[m] += r.rev[m]; c.cogs[m] += r.cogs[m]
        c.staff[m] += r.staff[m]; c.opex[m] += r.opex[m]
        const merge = (a: (number|null)[], b: (number|null)[]) => {
          if (b[m] !== null) { if (a[m] === null) a[m] = 0; (a[m] as number) += b[m] as number }
        }
        merge(c.act_rev, r.act_rev); merge(c.act_cogs, r.act_cogs)
        merge(c.act_staff, r.act_staff); merge(c.act_opex, r.act_opex)
      }
      c.spread_analysis.push(...r.spread_analysis)
      c.service_margins.push(...r.service_margins)
    })
    c.gp = c.rev.map((r, m) => r - c.cogs[m])
    // Actual Gross Profit: same calendar rule as everywhere else -- a
    // past or current month sums whatever actual was entered across all
    // sub-units, treating anything not entered as zero. A future month
    // is null here, meaning "use the plan" at display time.
    const act_gp = c.act_rev.map((_, m) => isPastOrCurrentMonth[m] ? (c.act_rev[m] ?? 0) - (c.act_cogs[m] ?? 0) : null)
    const ann_rev = yr(c.rev), ann_cogs = yr(c.cogs), ann_gp = yr(c.gp)
    const ann_staff = yr(c.staff), ann_opex = yr(c.opex)
    const parentUnit = activeUnits.find(u => u.id === parentId)
    unitPL[parentId] = {
      ...c, act_gp, act_ebitda: nullArr(), shared: zero(), total_opex: zero(), ebitda: zero(),
      ann_rev, ann_cogs, ann_gp, ann_staff, ann_opex,
      ann_shared: 0, ann_ebitda: 0,
      gp_margin: ann_rev > 0 ? ann_gp / ann_rev : 0, ebitda_margin: 0,
      staff_efficiency: {
        revenue_per_head: (parentUnit?.headcount || 0) > 0 ? ann_rev / (parentUnit?.headcount || 1) : 0,
        staff_cost_pct: ann_rev > 0 ? ann_staff / ann_rev : 0,
        headcount: subs.reduce((s, su) => s + su.headcount, 0),
      },
    }
  })

  // ── Shared cost allocation ────────────────────────────────
  const sharedPool = zero()
  config.shared_lines.forEach(l => l.monthly_plan.forEach((v, m) => { sharedPool[m] += v * cost_mult }))

  const allocUnits = topUnits.filter(u => unitPL[u.id])
  const totalHC = allocUnits.reduce((s, u) => s + u.headcount, 0) || 1
  const fixedPct = settings.shared_cost_fixed_pct ?? 0.5

  for (let m = 0; m < months; m++) {
    const totalRev = allocUnits.reduce((s, u) => s + (unitPL[u.id]?.rev[m] || 0), 0)
    allocUnits.forEach(u => {
      if (!unitPL[u.id]) return
      const hcShare  = u.headcount / totalHC
      const revShare = totalRev > 0 ? unitPL[u.id].rev[m] / totalRev : 0
      unitPL[u.id].shared[m] = sharedPool[m] * (fixedPct * hcShare + (1 - fixedPct) * revShare)
    })
  }

  // Distribute parent shared to subs
  Object.entries(subUnitsByParent).forEach(([parentId, subs]) => {
    for (let m = 0; m < months; m++) {
      const parentShared = unitPL[parentId]?.shared[m] || 0
      const parentRev = unitPL[parentId]?.rev[m] || 0
      subs.forEach(su => {
        unitPL[su.id].shared[m] = parentRev > 0
          ? parentShared * (unitPL[su.id].rev[m] / parentRev)
          : parentShared / subs.length
      })
    }
  })

  // Finalise EBITDA
  const allUnitIds = new Set([...activeUnits.map(u => u.id), ...Object.keys(subUnitsByParent)])
  allUnitIds.forEach(uid => {
    const r = unitPL[uid]
    if (!r) return
    for (let m = 0; m < months; m++) {
      r.total_opex[m] = r.staff[m] + r.opex[m] + r.shared[m]
      r.ebitda[m]     = r.gp[m] - r.total_opex[m]
      // Actual EBITDA: same calendar rule as act_gp -- a past or current
      // month uses whatever actual was entered (zero if nothing was),
      // never falling back to plan. Shared Costs always use their
      // planned/allocated value -- that internal allocation has no
      // independent actual-tracking source of its own.
      if (isPastOrCurrentMonth[m] && r.act_gp[m] !== null) {
        r.act_ebitda[m] = (r.act_gp[m] as number) - (r.act_staff[m] ?? 0) - (r.act_opex[m] ?? 0) - r.shared[m]
      }
    }
    r.ann_shared  = yr(r.shared)
    r.ann_ebitda  = yr(r.ebitda)
    r.ebitda_margin = r.ann_rev > 0 ? r.ann_ebitda / r.ann_rev : 0
  })

  // ── Consolidated P&L ─────────────────────────────────────
  const consolidatedIds = new Set<string>()
  topUnits.forEach(u => consolidatedIds.add(u.id))
  Object.keys(subUnitsByParent).forEach(pid => consolidatedIds.add(pid))
  activeUnits.filter(u => u.parent_id).forEach(u => consolidatedIds.delete(u.id))

  // ── Debt schedule ────────────────────────────────────────
  // Built ahead of the P&L consolidation loop so interest can be deducted
  // as a real cost before tax, and principal repayment can be booked as a
  // real financing cash outflow. Uses the same buildDebtSchedule() already
  // relied on for DSCR scoring -- no new calculation logic, just wiring the
  // existing schedule into the actual P&L and cash flow instead of only
  // the scoring metric.
  const cap = settings.capital_structure || { shareholder_contribution: 0, grant_non_repayable: 0, grant_recoverable: 0, bank_loan: 0, annual_interest_rate: 0.18, loan_tenor_years: 2, fixed_assets: 0 }
  const debtObligations: DebtObligation[] = (settings.debts && settings.debts.length > 0)
    ? settings.debts
    : (cap.bank_loan > 0 ? [{
        drawdownMonth: 1,
        annualRate: cap.annual_interest_rate ?? 0.18,
        tenorMonths: (cap.loan_tenor_years ?? 2) * 12,
        gracePeriodMonths: 0,
        principal: cap.bank_loan,
        repaymentType: 'amortising',
      }] : [])
  const debtSchedule = buildDebtSchedule(debtObligations, months)

  const con = {
    rev: zero(), cogs: zero(), gp: zero(), opex: zero(),
    ebitda: zero(), interest: debtSchedule.totalInterest, nbt: zero(), tax: zero(), npat: zero(),
    act_rev: nullArr(), act_cogs: nullArr(), act_staff: nullArr(), act_opex: nullArr(),
    act_gp: nullArr(), act_ebitda: nullArr(),
    act_nbt: nullArr(), act_tax: nullArr(), act_npat: nullArr(),
  }

  for (let m = 0; m < months; m++) {
    let sharedPoolThisMonth = 0
    consolidatedIds.forEach(uid => {
      const r = unitPL[uid]
      if (!r) return
      con.rev[m]    += r.rev[m]
      con.cogs[m]   += r.cogs[m]
      con.gp[m]     += r.gp[m]
      con.opex[m]   += r.total_opex[m]
      con.ebitda[m] += r.ebitda[m]
      // Consolidate EVERY actual category, not just revenue -- the
      // previous version only summed act_rev, then computed act_ebitda
      // as act_rev minus PLANNED cogs/opex. That silently blended a real
      // actual figure with a fabricated one. Fixed: all four actual
      // categories are now consolidated the same way, and act_ebitda
      // below only computes once all of them are genuinely present.
      const mergeAct = (key: 'act_rev'|'act_cogs'|'act_staff'|'act_opex') => {
        if (r[key][m] !== null) {
          if (con[key][m] === null) con[key][m] = 0
          ;(con[key][m] as number) += r[key][m] as number
        }
      }
      mergeAct('act_rev'); mergeAct('act_cogs'); mergeAct('act_staff'); mergeAct('act_opex')
      // Shared Costs always use their planned/allocated value -- that
      // internal allocation (headcount/revenue-share split of a pooled
      // cost) has no independent actual-tracking source of its own,
      // unlike revenue/COGS/staff/opex. Summed here the same way
      // con.ebitda[m] already implicitly includes it via r.ebitda[m]
      // above, so the actual and planned consolidated views treat
      // shared costs identically -- matching the per-unit actual
      // EBITDA treatment exactly, rather than diverging by the whole
      // shared pool between the two views.
      sharedPoolThisMonth += r.shared[m]
    })
    // Interest is deducted before tax (standard treatment -- interest is a
    // tax-deductible finance cost). Principal is NOT deducted here: repaying
    // loan principal isn't an expense, it's a financing cash outflow with no
    // P&L impact -- that's handled separately in the cash flow section below.
    con.nbt[m]  = con.ebitda[m] - (con.interest[m] ?? 0)
    con.tax[m]  = con.nbt[m] > 0 ? con.nbt[m] * (settings.corporate_tax_rate ?? 0.30) : 0
    con.npat[m] = con.nbt[m] - con.tax[m]
    // Actual Gross Profit and EBITDA: the same calendar rule as
    // everywhere else in this model -- a past or current month sums
    // whatever actual was entered across every unit (zero where nothing
    // was), never falling back to plan. A future month is null here,
    // meaning "use the plan" at display time. Shared Costs always use
    // their planned/allocated value -- that internal allocation has no
    // independent actual-tracking source of its own.
    if (isPastOrCurrentMonth[m]) {
      con.act_gp[m] = (con.act_rev[m] ?? 0) - (con.act_cogs[m] ?? 0)
      con.act_ebitda[m] = con.act_gp[m]! - (con.act_staff[m] ?? 0) - (con.act_opex[m] ?? 0) - sharedPoolThisMonth
    }
    // Actual NBT/tax/NPAT cascade from act_ebitda the same way the planned
    // figures cascade from planned ebitda -- interest itself is NOT a
    // plan-vs-actual figure (it's computed from the real loan's actual
    // terms regardless of which month is "closed"), so it's safe to
    // reuse con.interest[m] here rather than needing a separate actual
    // interest concept. Cash Flow and Balance Sheet below both derive
    // from NPAT, so making NPAT hybrid here is what makes them hybrid
    // too, without needing a separate parallel calculation for each.
    if (con.act_ebitda[m] !== null) {
      con.act_nbt[m] = (con.act_ebitda[m] as number) - (con.interest[m] ?? 0)
      con.act_tax[m] = con.act_nbt[m]! > 0 ? con.act_nbt[m]! * (settings.corporate_tax_rate ?? 0.30) : 0
      con.act_npat[m] = con.act_nbt[m]! - con.act_tax[m]!
    }
  }

  // ── Trade credit working capital adjustment ────────────────
  // Computed before cash flow so its cash effect can be added as a proper
  // working capital line, the way real accounting treats AR/AP movements.
  // Outstanding payable/receivable balances are kept alongside the cash
  // effect so the balance sheet can carry matching AR/AP lines -- without
  // these, the cash effect moves cash with no offsetting entry and the
  // balance sheet stops balancing as soon as any trade credit line has
  // non-zero movement.
  const tradeCredit = computeTradeCredit(
    settings.trade_credit_lines || [], con.cogs, con.rev, months
  )
  const tradeCreditCashEffect = tradeCredit.monthlyCashEffect

  // ── Cash flow ─────────────────────────────────────────────
  // Hybrid NPAT: actual where available, planned otherwise. This single
  // substitution is what makes Cash Flow and Balance Sheet hybrid too --
  // both are built directly from NPAT below, the same way they're built
  // from planned NPAT today, so correctness cascades automatically
  // rather than needing a separate parallel actual calculation for each.
  const hybridNpat = con.npat.map((v, m) => con.act_npat[m] !== null ? (con.act_npat[m] as number) : v)

  const cf = {
    op_cash:  zero(), fin_cash: zero(), inv_cash: zero(), net: zero(),
    open: zero(), close: zero(),
    working_capital_adj: tradeCreditCashEffect,
    // act_mask marks which months are actual (past/current) vs plan
    // (future) under the single calendar rule used throughout the model.
    act_mask: Array(months).fill(false) as boolean[],
  }
  cf.fin_cash[0] = cap.shareholder_contribution + cap.grant_non_repayable + cap.grant_recoverable
  // Fixed assets purchased with cash are an investing outflow in month 0 --
  // without this, fixed assets appear on the balance sheet with no cash
  // consequence, breaking the fundamental accounting identity (Assets = Equity + Liabilities).
  cf.inv_cash[0] = -(cap.fixed_assets ?? 0)
  // Each debt obligation's principal enters financing cash flow in its own
  // drawdown month, not always lumped into month 0 -- settings.debts supports
  // multiple loans with different start dates via a real UI (coach dashboard
  // debt obligations form). Using a flat cap.bank_loan here would show a debt
  // schedule (interest/principal/liability) that doesn't match the actual
  // cash drawdown for any client with more than one loan, or a loan starting
  // after month 1.
  debtObligations.forEach(ob => {
    const idx = Math.max(0, (ob.drawdownMonth ?? 1) - 1)
    if (idx < months) cf.fin_cash[idx] += ob.principal ?? 0
  })
  for (let m = 0; m < months; m++) {
    // Loan principal repayment is a financing outflow -- no P&L impact, since
    // it's not an expense, just cash moving from the business to the lender.
    // Interest is already reflected in npat above (deducted before tax).
    cf.fin_cash[m] -= debtSchedule.totalPrincipal[m] ?? 0
    cf.op_cash[m] = hybridNpat[m] + (tradeCreditCashEffect[m] ?? 0)
    cf.net[m]     = cf.op_cash[m] + cf.fin_cash[m] + cf.inv_cash[m]
    cf.open[m]    = m === 0 ? (settings.opening_cash_balance ?? 0) : cf.close[m - 1]
    cf.close[m]   = cf.open[m] + cf.net[m]
    // act_mask marks which months are actual under the calendar rule --
    // exactly the past/current months. Cash figures still flow
    // continuously across the actual/plan boundary (each month's opening
    // balance is the prior month's close, always), but the mask itself
    // reflects the real data-vs-plan status of each month, not a
    // cumulative "actual from here on" bleed-forward.
    cf.act_mask[m] = isPastOrCurrentMonth[m]
  }

  // ── Balance sheet ─────────────────────────────────────────
  const bs = {
    cash: cf.close,
    fixed_assets: Array(months).fill(cap.fixed_assets ?? 0) as number[],
    accounts_receivable: tradeCredit.totalReceivableOutstanding,
    total_assets: zero(),
    share_capital: Array(months).fill(cap.shareholder_contribution) as number[],
    grant_equity: Array(months).fill(cap.grant_non_repayable) as number[],
    retained_earnings: zero(),
    total_equity: zero(),
    grant_liability: Array(months).fill(cap.grant_recoverable) as number[],
    loan_liability: debtSchedule.totalOutstanding,
    accounts_payable: tradeCredit.totalPayableOutstanding,
    total_liabilities: zero(),
    total_equity_and_liabilities: zero(),
    // Same calendar-rule mask as cash flow -- past/current months are
    // actual, future months are plan.
    act_mask: cf.act_mask,
  }
  // Opening cash balance represents pre-existing capital from before the
  // planning period -- without a source on the balance sheet, cash exists
  // with no matching equity, breaking Assets = Equity + Liabilities.
  let cum_npat = settings.opening_cash_balance ?? 0
  for (let m = 0; m < months; m++) {
    cum_npat += hybridNpat[m]
    bs.retained_earnings[m] = cum_npat
    bs.total_assets[m]       = bs.cash[m] + bs.fixed_assets[m] + bs.accounts_receivable[m]
    bs.total_equity[m]       = bs.share_capital[m] + bs.grant_equity[m] + bs.retained_earnings[m]
    bs.total_liabilities[m]  = bs.grant_liability[m] + bs.loan_liability[m] + bs.accounts_payable[m]
    bs.total_equity_and_liabilities[m] = bs.total_equity[m] + bs.total_liabilities[m]
  }

  // ── Whole-business break-even ─────────────────────────────
  const total_fixed_annual = yr(sharedPool) + allocUnits.reduce((s, u) => s + yr(unitPL[u.id]?.staff || []) + yr(unitPL[u.id]?.opex || []), 0)
  const total_cogs = yr(con.cogs)
  const total_rev = yr(con.rev)
  const variable_cost_pct = total_rev > 0 ? total_cogs / total_rev : 0
  const business_breakeven = variable_cost_pct < 1 ? total_fixed_annual / (1 - variable_cost_pct) : 0

  // ── Metrics ───────────────────────────────────────────────
  const metrics = {
    total_revenue:    total_rev,
    total_gp:         yr(con.gp),
    total_ebitda:     yr(con.ebitda),
    total_npat:       yr(con.npat),
    gross_margin:     total_rev > 0 ? yr(con.gp) / total_rev : 0,
    net_margin:       total_rev > 0 ? yr(con.npat) / total_rev : 0,
    min_cash:         Math.min(...cf.close),
    min_cash_month:   cf.close.indexOf(Math.min(...cf.close)) + 1,
    total_shared:     yr(sharedPool),
    business_breakeven,
    variable_cost_pct,
    // Staff efficiency across all units
    total_headcount: activeUnits.reduce((s, u) => s + u.headcount, 0),
    revenue_per_head: activeUnits.reduce((s, u) => s + u.headcount, 0) > 0
      ? total_rev / activeUnits.reduce((s, u) => s + u.headcount, 0) : 0,
    total_staff_cost: allocUnits.reduce((s, u) => s + yr(unitPL[u.id]?.staff || []), 0),
    staff_cost_pct: total_rev > 0
      ? allocUnits.reduce((s, u) => s + yr(unitPL[u.id]?.staff || []), 0) / total_rev : 0,
  }

  // ── Deterministic scoring: Credit Risk, Going Concern, Investment Readiness ──
  // Uses the same shared engine as CONAS, so every client gets the same
  // rigorous methodology, not just an AI estimate.
  const coachAssessment: CoachAssessment = settings.coach_assessment || defaultCoachAssessment()
  // debtObligations is built earlier (ahead of the balance sheet) and reused
  // here so scoring and the balance sheet always agree on the same debt schedule.
  const scores: ScoringResult = computeScores({
    rev: con.rev,
    ebitda: con.ebitda,
    cogs: con.cogs,
    cashClose: cf.close,
    totalEquity: bs.total_equity[bs.total_equity.length - 1] || 0,
    totalLiabilities: bs.total_liabilities[bs.total_liabilities.length - 1] || 0,
    months,
    debtObligations,
    tradeCreditLines: settings.trade_credit_lines || [],
    assess: coachAssessment,
  })

  return {
    unitPL,
    con,
    cf,
    bs,
    metrics,
    scores,
    debtSchedule,
    coachAssessment,
    sharedPool,
    allocUnits,
    subUnitsByParent,
    consolidatedIds: Array.from(consolidatedIds),
    months,
  }
}
