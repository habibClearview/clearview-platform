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
  // Actuals (null = not yet entered)
  act_rev: (number | null)[]
  act_cogs: (number | null)[]
  act_staff: (number | null)[]
  act_opex: (number | null)[]
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
        plan = l.volume.map((v, m) => (l.sell_price![m] - l.buy_price![m]) * v)
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

    // Break-even per revenue line
    const breakeven: GenericUnitPL['breakeven'] = []
    const rev_lines = lines.filter(l => l.category === 'revenue')
    const total_fixed = yr(staff) + yr(opex)
    rev_lines.filter(l => !l.name.startsWith('Add ')).forEach(l => {
      const line_rev = l.line_type === 'spread' && l.volume && l.sell_price && l.buy_price
        ? l.volume.reduce((s, v, m) => s + (l.sell_price![m] - l.buy_price![m]) * v * rev_mult, 0)
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
      act_rev, act_cogs, act_staff, act_opex,
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
    const ann_rev = yr(c.rev), ann_cogs = yr(c.cogs), ann_gp = yr(c.gp)
    const ann_staff = yr(c.staff), ann_opex = yr(c.opex)
    const parentUnit = activeUnits.find(u => u.id === parentId)
    unitPL[parentId] = {
      ...c, shared: zero(), total_opex: zero(), ebitda: zero(),
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

  const con = {
    rev: zero(), cogs: zero(), gp: zero(), opex: zero(),
    ebitda: zero(), nbt: zero(), tax: zero(), npat: zero(),
    act_rev: nullArr(), act_ebitda: nullArr(),
  }

  for (let m = 0; m < months; m++) {
    consolidatedIds.forEach(uid => {
      const r = unitPL[uid]
      if (!r) return
      con.rev[m]    += r.rev[m]
      con.cogs[m]   += r.cogs[m]
      con.gp[m]     += r.gp[m]
      con.opex[m]   += r.total_opex[m]
      con.ebitda[m] += r.ebitda[m]
      if (r.act_rev[m] !== null) {
        if (con.act_rev[m] === null) con.act_rev[m] = 0
        ;(con.act_rev[m] as number) += r.act_rev[m] as number
      }
    })
    con.nbt[m]  = con.ebitda[m]
    con.tax[m]  = con.nbt[m] > 0 ? con.nbt[m] * (settings.corporate_tax_rate ?? 0.30) : 0
    con.npat[m] = con.nbt[m] - con.tax[m]
    if (con.act_rev[m] !== null) {
      con.act_ebitda[m] = (con.act_rev[m] as number) - con.cogs[m] - con.opex[m]
    }
  }

  // ── Trade credit working capital adjustment ────────────────
  // Computed before cash flow so its cash effect can be added as a proper
  // working capital line, the way real accounting treats AR/AP movements.
  const tradeCreditCashEffect = computeTradeCredit(
    settings.trade_credit_lines || [], con.cogs, con.rev, months
  ).monthlyCashEffect

  // ── Cash flow ─────────────────────────────────────────────
  const cap = settings.capital_structure || { shareholder_contribution: 0, grant_non_repayable: 0, grant_recoverable: 0, bank_loan: 0, annual_interest_rate: 0.18, loan_tenor_years: 2, fixed_assets: 0 }
  const cf = {
    op_cash:  zero(), fin_cash: zero(), inv_cash: zero(), net: zero(),
    open: zero(), close: zero(),
    working_capital_adj: tradeCreditCashEffect,
  }
  cf.fin_cash[0] = cap.shareholder_contribution + cap.grant_non_repayable + cap.grant_recoverable + cap.bank_loan
  // Fixed assets purchased with cash are an investing outflow in month 0 --
  // without this, fixed assets appear on the balance sheet with no cash
  // consequence, breaking the fundamental accounting identity (Assets = Equity + Liabilities).
  cf.inv_cash[0] = -(cap.fixed_assets || 0)
  for (let m = 0; m < months; m++) {
    cf.op_cash[m] = con.npat[m] + (cf.working_capital_adj[m] || 0)
    cf.net[m]     = cf.op_cash[m] + cf.fin_cash[m] + cf.inv_cash[m]
    cf.open[m]    = m === 0 ? (settings.opening_cash_balance || 0) : cf.close[m - 1]
    cf.close[m]   = cf.open[m] + cf.net[m]
  }

  // ── Balance sheet ─────────────────────────────────────────
  const bs = {
    cash: cf.close,
    fixed_assets: Array(months).fill(cap.fixed_assets) as number[],
    total_assets: zero(),
    share_capital: Array(months).fill(cap.shareholder_contribution) as number[],
    grant_equity: Array(months).fill(cap.grant_non_repayable) as number[],
    retained_earnings: zero(),
    total_equity: zero(),
    grant_liability: Array(months).fill(cap.grant_recoverable) as number[],
    loan_liability: Array(months).fill(cap.bank_loan) as number[],
    total_liabilities: zero(),
    total_equity_and_liabilities: zero(),
  }
  // Opening cash balance represents pre-existing capital from before the
  // planning period -- without a source on the balance sheet, cash exists
  // with no matching equity, breaking Assets = Equity + Liabilities.
  let cum_npat = settings.opening_cash_balance || 0
  for (let m = 0; m < months; m++) {
    cum_npat += con.npat[m]
    bs.retained_earnings[m] = cum_npat
    bs.total_assets[m]       = bs.cash[m] + bs.fixed_assets[m]
    bs.total_equity[m]       = bs.share_capital[m] + bs.grant_equity[m] + bs.retained_earnings[m]
    bs.total_liabilities[m]  = bs.grant_liability[m] + bs.loan_liability[m]
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
  // Multiple debt obligations: use the explicit `debts` list if provided (supports
  // bank loans + non-bank facilities together), otherwise fall back to the single
  // bank_loan field for clients with simple one-loan structures.
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
    coachAssessment,
    sharedPool,
    allocUnits,
    subUnitsByParent,
    consolidatedIds: Array.from(consolidatedIds),
    months,
  }
}
