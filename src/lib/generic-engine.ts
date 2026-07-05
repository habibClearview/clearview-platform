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
  // Actual Gross Profit: only computed when BOTH act_rev and act_cogs are
  // present for that month -- never blends an actual figure with a planned
  // one. Null means not enough actual data yet, not zero.
  act_gp: (number | null)[]
  // Actual EBITDA at the unit level -- treats Shared Costs using their
  // planned/allocated value always (that allocation is an internal
  // planning construct with no independent actual-tracking mechanism of
  // its own, unlike revenue/COGS/staff/opex which get real transaction
  // data). Staff and opex are treated as zero, not "missing", when this
  // unit genuinely has no plan line in that category at all.
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

  // Used everywhere multiple units' actual data gets merged together
  // (parent rollups from sub-units, and the top-level consolidated
  // total across all units). merge()/mergeAct() only add a unit's
  // contribution when THAT unit actually reported non-null for a given
  // month -- so if Unit A (which has a cost_of_sales line) reports 100
  // this month but Unit B (which ALSO has a cost_of_sales line) reports
  // nothing, the combined total would show only Unit A's 100, silently
  // treating Unit B's real, unreported cost as zero rather than as
  // "still missing". This checks EVERY unit that has an active line in
  // the given category individually, so a rollup with one
  // incompletely-reporting unit correctly stays incomplete rather than
  // understating the true cost.
  function categoryCompleteAcrossUnits(unitIds: string[], category: string, m: number): boolean {
    const actKey = category === 'cost_of_sales' ? 'act_cogs' : category === 'staff' ? 'act_staff' : category === 'direct_opex' ? 'act_opex' : null
    if (!actKey) return true
    return unitIds.every(uid => {
      const hasLine = config.plan_lines.some(l => l.active && l.unit_id === uid && l.category === category)
      if (!hasLine) return true
      const r = unitPL[uid]
      return !r || (r as any)[actKey][m] !== null
    })
  }

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
    const hasCogsLines = lines.some(l => l.category === 'cost_of_sales')
    // Actual Gross Profit: only when both act_rev and act_cogs exist for
    // that month -- this is the exact class of bug already fixed once
    // (mixing actual revenue with planned cost) and must not be
    // reintroduced here. Null means "not enough actual data yet", not
    // zero. A unit with ZERO cost_of_sales plan lines at all is treated
    // as zero cost, not "missing" -- otherwise a unit with no COGS line
    // could never get an actual Gross Profit (or the actual EBITDA that
    // depends on it below) no matter how complete its real revenue data is.
    const act_gp = act_rev.map((r, m) => (r !== null && (act_cogs[m] !== null || !hasCogsLines)) ? r - ((hasCogsLines ? act_cogs[m] : 0) as number) : null)

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
    // Same "zero when genuinely absent, not missing" treatment as
    // calcUnit's own act_gp -- checked across every sub-unit's plan
    // lines, since a parent rollup's cost_of_sales could live entirely
    // on one particular sub-unit rather than the parent itself.
    //
    // Critically, this must NOT stop at "does the combined c.act_cogs[m]
    // have any value at all" -- merge() only adds a sub's contribution
    // when that sub actually reported for this month, so if Sub A (which
    // has a cogs line) reports 100 and Sub B (which ALSO has a cogs line)
    // reports nothing this month, c.act_cogs[m] would show only Sub A's
    // 100 -- silently treating Sub B's real, unreported cost as zero,
    // not as "still missing". cogsCompleteByMonth checks EVERY qualifying
    // sub individually, so a parent with an incompletely-reporting sub
    // correctly stays null rather than understating cost.
    const parentHasCogsLines = subs.some(su => config.plan_lines.some(l => l.active && l.unit_id === su.id && l.category === 'cost_of_sales'))
    const subIds = subs.map(su => su.id)
    const act_gp = c.act_rev.map((r, m) => {
      if (r === null) return null
      if (!parentHasCogsLines) return r
      if (!categoryCompleteAcrossUnits(subIds, 'cost_of_sales', m)) return null
      return r - (c.act_cogs[m] as number)
    })
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
    // For a parent unit, its own plan lines AND every sub-unit's plan
    // lines are all relevant to "does staff/opex apply here" -- a parent
    // rollup's staff cost could live entirely on a sub-unit's own lines.
    const relevantIds = new Set([uid, ...(subUnitsByParent[uid] || []).map(su => su.id)])
    const relevantLines = config.plan_lines.filter(l => l.active && relevantIds.has(l.unit_id))
    const unitHasStaffLines = relevantLines.some(l => l.category === 'staff')
    const unitHasOpexLines  = relevantLines.some(l => l.category === 'direct_opex')
    for (let m = 0; m < months; m++) {
      r.total_opex[m] = r.staff[m] + r.opex[m] + r.shared[m]
      r.ebitda[m]     = r.gp[m] - r.total_opex[m]
      // Actual EBITDA: same "zero when the category genuinely doesn't
      // apply, not blocking" treatment already fixed at the consolidated
      // level -- found and fixed there first, but this exact tab (By
      // Business Unit) was still showing a stale planned EBITDA for any
      // unit with no staff line, regardless of that fix, since unit-level
      // EBITDA was never actually computed as hybrid at all until now.
      // Shared Costs use their planned/allocated value unconditionally --
      // that allocation is an internal planning mechanism with no
      // independent actual-tracking source of its own.
      //
      // Uses categoryCompleteAcrossUnits rather than a bare
      // r.act_staff[m] !== null check -- for a standalone unit these are
      // equivalent (relevantIds is just {uid}), but for a PARENT unit
      // r.act_staff[m] was itself populated by merging multiple
      // sub-units together, and a bare null check can't tell "no sub has
      // a staff line" apart from "one sub with a staff line just hasn't
      // reported this month" -- the second case must stay incomplete,
      // not silently understate cost.
      const staffOk = categoryCompleteAcrossUnits(Array.from(relevantIds), 'staff', m)
      const opexOk  = categoryCompleteAcrossUnits(Array.from(relevantIds), 'direct_opex', m)
      if (r.act_gp[m] !== null && staffOk && opexOk) {
        r.act_ebitda[m] = (r.act_gp[m] as number)
          - ((unitHasStaffLines ? r.act_staff[m] : 0) as number)
          - ((unitHasOpexLines ? r.act_opex[m] : 0) as number)
          - r.shared[m]
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

  // Which categories genuinely exist anywhere in this business at all --
  // a real bug found from live data: a unit (or an entire business) with
  // no 'staff' category plan line at all would NEVER get an actual
  // EBITDA/NPAT, regardless of how complete its real revenue/cost/opex
  // data is, because the gate below required ALL FOUR categories to be
  // non-null unconditionally. If a category has zero active plan lines
  // anywhere in the consolidation, there is genuinely nothing to wait
  // for -- its contribution is correctly zero, not "missing".
  // Every leaf-level (atomic) unit -- standalone top-level units AND
  // sub-units, but explicitly excluding parent ids. A parent's own
  // unitPL[id] is already a merged rollup from its sub-units, not an
  // atomic per-unit figure -- passing a parent id into
  // categoryCompleteAcrossUnits would check the already-summed total
  // instead of a real leaf unit's own reporting, defeating the point of
  // checking each contributor individually.
  const parentIds = new Set(Object.keys(subUnitsByParent))
  const allAtomicUnitIds = activeUnits.filter(u => !parentIds.has(u.id)).map(u => u.id)
  // activeLinesInScope MUST use this same atomic unit set, not the
  // broader activeUnits (which includes parent ids) -- otherwise a plan
  // line attached directly to a parent unit could make hasStaffLines/
  // hasOpexLines true, while categoryCompleteAcrossUnits (which only
  // ever iterates atomic units) would find no matching line on any of
  // them and vacuously report "complete", letting actual EBITDA compute
  // without ever checking whether that parent-attached line's actual
  // data was reported at all.
  const activeLinesInScope = config.plan_lines.filter(l => l.active && allAtomicUnitIds.includes(l.unit_id))
  const hasCogsLines  = activeLinesInScope.some(l => l.category === 'cost_of_sales')
  const hasStaffLines = activeLinesInScope.some(l => l.category === 'staff')
  const hasOpexLines  = activeLinesInScope.some(l => l.category === 'direct_opex')

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
    // Actual Gross Profit: only when both act_rev and act_cogs exist
    // (or cost_of_sales genuinely doesn't apply anywhere in this business).
    // categoryCompleteAcrossUnits checks every ATOMIC unit individually
    // (not just whether the combined con.act_cogs[m] happens to be
    // non-null) -- two units can both have cogs lines, and if only one
    // reports this month, the combined total would otherwise silently
    // look complete while actually missing the other unit's real cost.
    const cogsCompleteThisMonth = categoryCompleteAcrossUnits(allAtomicUnitIds, 'cost_of_sales', m)
    if (con.act_rev[m] !== null && (cogsCompleteThisMonth || !hasCogsLines)) {
      con.act_gp[m] = (con.act_rev[m] as number) - ((hasCogsLines ? con.act_cogs[m] : 0) as number)
    }
    // Actual EBITDA: only when every category that ACTUALLY APPLIES to
    // this business has actual data for this month -- never substitutes
    // a planned figure for a missing actual one. If, say, actual revenue
    // has synced from the field but actual opex hasn't been entered yet
    // (and opex genuinely does apply), this stays null rather than
    // showing a number that's part real, part invented. A category with
    // ZERO active plan lines anywhere in the business (e.g. no staff
    // line at all) is treated as zero, not "missing" -- there's nothing
    // to wait for, and requiring it unconditionally would mean actual
    // EBITDA could never compute at all for a business with no staff
    // costs, no matter how complete its real data otherwise is.
    const revOk   = con.act_rev[m] !== null
    const cogsOk  = !hasCogsLines  || cogsCompleteThisMonth
    const staffOk = !hasStaffLines || categoryCompleteAcrossUnits(allAtomicUnitIds, 'staff', m)
    const opexOk  = !hasOpexLines  || categoryCompleteAcrossUnits(allAtomicUnitIds, 'direct_opex', m)
    if (revOk && cogsOk && staffOk && opexOk) {
      con.act_ebitda[m] = (con.act_rev[m] as number)
        - ((hasCogsLines ? con.act_cogs[m] : 0) as number)
        - ((hasStaffLines ? con.act_staff[m] : 0) as number)
        - ((hasOpexLines ? con.act_opex[m] : 0) as number)
        - sharedPoolThisMonth
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
  // Per-month: does THIS month's operating cash reflect real data?
  const npatIsActual = con.act_npat.map(v => v !== null)

  const cf = {
    op_cash:  zero(), fin_cash: zero(), inv_cash: zero(), net: zero(),
    open: zero(), close: zero(),
    working_capital_adj: tradeCreditCashEffect,
    // Cash is cumulative -- once one month's operating cash reflects real
    // data, every month from there onward carries that real figure
    // forward into its opening balance, even if that later month's OWN
    // op_cash hasn't been closed yet. act_mask marks exactly that: true
    // from the first actual month through to the end, not just the
    // individual months that each have their own actual data.
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
  let cashIsActualFromHere = false
  for (let m = 0; m < months; m++) {
    // Loan principal repayment is a financing outflow -- no P&L impact, since
    // it's not an expense, just cash moving from the business to the lender.
    // Interest is already reflected in npat above (deducted before tax).
    cf.fin_cash[m] -= debtSchedule.totalPrincipal[m] ?? 0
    cf.op_cash[m] = hybridNpat[m] + (tradeCreditCashEffect[m] ?? 0)
    cf.net[m]     = cf.op_cash[m] + cf.fin_cash[m] + cf.inv_cash[m]
    cf.open[m]    = m === 0 ? (settings.opening_cash_balance ?? 0) : cf.close[m - 1]
    cf.close[m]   = cf.open[m] + cf.net[m]
    if (npatIsActual[m]) cashIsActualFromHere = true
    cf.act_mask[m] = cashIsActualFromHere
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
    // Same cumulative reasoning as cf.act_mask -- retained earnings (and
    // everything derived from it: total assets, total equity, total
    // equity+liabilities) carries real data forward from the first
    // actual month onward.
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
