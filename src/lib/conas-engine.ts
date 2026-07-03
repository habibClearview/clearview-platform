// ============================================================
// CONAS ENGINE v4
// - Five individual Input Profit Centres + consolidation
// - Full unit P&L per business unit
// - Balance sheet
// - All figures flow: plan → unit P&L → consolidated → cash flow → balance sheet
// ============================================================

import { computeTradeCredit, buildDebtSchedule, type DebtObligation } from './scoring-engine'

export const MONTHS = 12

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
export function buildMonthLabels(startDate: string): string[] {
  const d = new Date(startDate)
  return Array.from({ length: MONTHS }, (_, i) => {
    const m = new Date(d.getFullYear(), d.getMonth() + i, 1)
    return m.toLocaleString('en-GB', { month: 'short', year: '2-digit' })
  })
}

// ============================================================
// TYPES
// ============================================================
export interface PlanLine {
  id: string
  name: string
  category: 'revenue' | 'cost_of_sales' | 'staff' | 'direct_opex' | 'shared'
  monthlyPlan: number[]
  monthlyActual: (number | null)[]
  actualStatus: ('draft' | 'submitted' | 'approved' | 'rejected')[]
  rejectionNote: string[]
  isShared: boolean
}

export interface BusinessUnit {
  id: string
  name: string
  short: string
  color: string
  headcount: number
  active: boolean
  lines: PlanLine[]
  // For sub-units (Input Profit Centres): parent unit id
  parentId?: string
}

export interface SpendingRequest {
  id: string
  requestedBy: string
  description: string
  unitId: string
  category: 'cost_of_sales' | 'staff' | 'direct_opex' | 'shared'
  month: number
  amount: number
  status: 'pending' | 'approved' | 'declined'
  ceoNote: string
  createdAt: string
  resolvedAt: string
}

export interface Season {
  id: string
  name: string
  startMonth: number
  endMonth: number
  planLocked: boolean
  lockedAt: string
  lockedBy: string
}

export interface CONASInputs {
  global: {
    businessName: string
    currency: string
    modelStartDate: string
    activeScenarioId: string
    openingCashBalance: number
    transferPriceMargin: number
    sharedCostFixedPct: number
    corporateTaxRate: number
  }
  units: BusinessUnit[]
  sharedLines: PlanLine[]
  scenarios: { id: string; label: string; fgeCount: number; revMult: number; costMult: number }[]
  capitalStructure: {
    shareholderContribution: number
    grantNonRepayable: number
    grantRecoverable: number
    bankLoan: number
    annualInterestRate: number
    loanTenorYears: number
    fixedAssets: number
  }
  // Multiple debt obligations (bank + non-bank facilities) -- supplements
  // capitalStructure.bankLoan for clients with more than one loan.
  debts?: { drawdownMonth?: number; annualRate?: number; tenorMonths?: number; gracePeriodMonths?: number; principal?: number; repaymentType?: string; name?: string; seasonalMonths?: number[] }[]
  // Trade credit: supplier credit received and customer/partner credit given, monthly.
  tradeCreditLines?: { id: string; name: string; type: 'payable'|'receivable'; monthlyNew: number[]; monthlySettled: number[] }[]
  seasons: Season[]
  spendingRequests: SpendingRequest[]
  monthlyNotes: string[]
}

// ============================================================
// HELPERS
// ============================================================
function line(
  id: string, name: string,
  category: PlanLine['category'],
  plan: number[],
  isShared = false
): PlanLine {
  return {
    id, name, category, monthlyPlan: plan,
    monthlyActual: Array(MONTHS).fill(null),
    actualStatus: Array(MONTHS).fill('draft'),
    rejectionNote: Array(MONTHS).fill(''),
    isShared,
  }
}
function flat(v: number): number[] { return Array(MONTHS).fill(v) }
function seas(vals: number[]): number[] { return vals }

// ============================================================
// DEFAULT INPUTS
// Five individual Input Profit Centres + 5 other business units
// ============================================================
export function defaultCONASInputs(): CONASInputs {

  // Helper: create one Input Profit Centre shop
  function makeShop(num: number, revScale = 1): BusinessUnit {
    return {
      id: `shop_${num}`, name: `Input Profit Centre ${num}`, short: `Shop ${num}`,
      color: '#1B2A4A', headcount: 2, active: true, parentId: 'input_centres',
      lines: [
        line(`s${num}_walkin`, 'Walk-in Farmer Sales', 'revenue',
          seas([4_800_000, 9_600_000, 1_600_000, 1_600_000, 1_600_000, 4_800_000,
                9_600_000, 1_600_000, 1_600_000, 4_800_000, 1_600_000, 1_600_000].map(v => Math.round(v * revScale)))),
        line(`s${num}_fge`, 'Input Supply to FGEs (internal)', 'revenue',
          seas([10_880_000, 65_080_000, 0, 0, 0, 10_880_000, 65_080_000, 0, 0, 0, 0, 0])),
        line(`s${num}_net`, 'Input Supplier Network', 'revenue', flat(0)),
        line(`s${num}_other`, 'Add revenue line', 'revenue', flat(0)),

        line(`s${num}_wc`, 'Walk-in Procurement Cost', 'cost_of_sales',
          seas([3_648_000, 7_296_000, 1_216_000, 1_216_000, 1_216_000, 3_648_000,
                7_296_000, 1_216_000, 1_216_000, 3_648_000, 1_216_000, 1_216_000].map(v => Math.round(v * revScale)))),
        line(`s${num}_fc`, 'FGE Input Procurement Cost', 'cost_of_sales',
          seas([8_780_000, 52_612_000, 0, 0, 0, 8_780_000, 52_612_000, 0, 0, 0, 0, 0])),

        line(`s${num}_mgr`, `Shop ${num} Manager (500K)`, 'staff', flat(500_000)),
        line(`s${num}_asst`, `Shop ${num} Assistant (300K)`, 'staff', flat(300_000)),
        line(`s${num}_add`, 'Add staff role', 'staff', flat(0)),

        line(`s${num}_rent`, 'Store Rent', 'direct_opex',
          seas([0, 0, 0, 350_000, 350_000, 350_000, 350_000, 350_000, 350_000, 350_000, 350_000, 350_000])),
        line(`s${num}_del`, 'Delivery & Handling', 'direct_opex',
          seas([60_000, 0, 0, 0, 40_000, 0, 20_000, 0, 40_000, 0, 0, 0])),
        line(`s${num}_add_oh`, 'Add overhead', 'direct_opex', flat(0)),
      ],
    }
  }

  return {
    global: {
      businessName: 'CONAS Agricultural Hub',
      currency: 'UGX',
      modelStartDate: '2026-07-01',
      activeScenarioId: 'base',
      openingCashBalance: 0,
      transferPriceMargin: 0.055,
      sharedCostFixedPct: 0.50,
      corporateTaxRate: 0.30,
    },

    units: [
      // ── Five individual Input Profit Centres ────────────
      makeShop(1, 1.2),
      makeShop(2, 1.0),
      makeShop(3, 0.9),
      makeShop(4, 0.8),
      makeShop(5, 0.7),

      // ── FGE Production & Marketing ──────────────────────
      {
        id: 'fge', name: 'FGE Production & Marketing', short: 'FGE',
        color: '#00B4D8', headcount: 8, active: true, lines: [
          line('fr_tom',  'Tomatoes — Produce Sales to Market', 'revenue',
            seas([0,0,0,735e6,0,0,0,0,735e6,0,0,0])),
          line('fr_wm',   'Watermelon — Produce Sales to Market', 'revenue',
            seas([0,0,0,0,800e6,0,0,0,0,800e6,0,0])),
          line('fr_cab',  'Cabbages — Produce Sales to Market', 'revenue',
            seas([0,0,0,0,255e6,0,0,0,255e6,0,0,0])),
          line('fr_add',  'Add revenue line', 'revenue', flat(0)),

          line('fc_tom',  'Payment to FGEs — Tomatoes', 'cost_of_sales',
            seas([0,0,0,660e6,0,0,0,0,660e6,0,0,0])),
          line('fc_wm',   'Payment to FGEs — Watermelon', 'cost_of_sales',
            seas([0,0,0,0,352e6,0,0,0,0,352e6,0,0])),
          line('fc_cab',  'Payment to FGEs — Cabbages', 'cost_of_sales',
            seas([0,0,0,0,170e6,0,0,0,170e6,0,0,0])),
          line('fc_ins',  'Crop Insurance', 'cost_of_sales',
            seas([10.2e6,24e6,0,0,0,17.8e6,13.2e6,0,0,10.9e6,0,0])),
          line('fc_hdl',  'Produce Delivery, Handling & Taxes', 'cost_of_sales',
            seas([0,0,0,26e6,13e6,0,0,13e6,13e6,13e6,0,13e6])),

          line('fs_mgr',  'FGE Services Manager (600K)', 'staff', flat(600_000)),
          line('fs_fld',  'Field Officers ×5 (400K each)', 'staff', flat(2_000_000)),
          line('fs_log',  'Fleet & Logistics Manager (500K)', 'staff', flat(500_000)),
          line('fs_add',  'Add staff role', 'staff', flat(0)),

          line('fo_reg',  'FGE Registration (Month 1 one-off)', 'direct_opex',
            seas([11e6,0,0,0,0,0,0,0,0,0,0,0])),
          line('fo_fuel', 'Fuel — Extension Officers', 'direct_opex', flat(1_650_000)),
          line('fo_lub',  'Lubricants', 'direct_opex', flat(270_000)),
          line('fo_rm',   'R&M — Equipment', 'direct_opex',
            seas([0,0,0,750_000,750_000,0,0,750_000,750_000,750_000,0,750_000])),
          line('fo_trays','Fruit Trays & Pallets', 'direct_opex',
            seas([0,0,0,283_333,283_333,0,0,283_333,283_333,283_333,0,283_333])),
          line('fo_comm', 'FGE Communications', 'direct_opex', flat(200_000)),
          line('fo_add',  'Add overhead', 'direct_opex', flat(0)),
        ],
      },

      // ── Own Farm ────────────────────────────────────────
      {
        id: 'own_farm', name: "CONAS Own Farm", short: 'Farm',
        color: '#1A7A4A', headcount: 5, active: true, lines: [
          line('or_tom',  'Tomato Sales', 'revenue', seas([0,0,0,15e6,0,0,0,0,15e6,0,0,0])),
          line('or_wm',   'Watermelon Sales', 'revenue', seas([0,0,0,0,20e6,0,0,0,0,20e6,0,0])),
          line('or_cab',  'Cabbage Sales', 'revenue', seas([0,0,0,0,0,0,0,0,3e6,2e6,0,0])),
          line('or_goat', 'Goat Sales', 'revenue', flat(0)),
          line('or_add',  'Add revenue line', 'revenue', flat(0)),

          line('oc_seed', 'Seeds & Planting', 'cost_of_sales',
            seas([800_000,800_000,800_000,0,0,800_000,800_000,800_000,0,0,800_000,800_000])),
          line('oc_fert', 'Fertiliser', 'cost_of_sales', seas([0,2e6,0,0,0,0,2e6,0,0,0,0,0])),
          line('oc_chem', 'Chemicals', 'cost_of_sales', flat(500_000)),

          line('os_mgr',  'Farm Manager (600K)', 'staff', flat(600_000)),
          line('os_lab',  'Farm Labourers ×4 (200K)', 'staff', flat(800_000)),
          line('os_add',  'Add staff role', 'staff', flat(0)),

          line('oo_rent', 'Farm Rent', 'direct_opex',
            seas([0,0,0,350_000,350_000,0,0,350_000,350_000,350_000,0,350_000])),
          line('oo_irr',  'Irrigation', 'direct_opex', flat(30_000)),
          line('oo_ghs',  'Greenhouse Depreciation', 'direct_opex', flat(183_333)),
          line('oo_add',  'Add overhead', 'direct_opex', flat(0)),
        ],
      },

      // ── Advisory Services ───────────────────────────────
      {
        id: 'advisory', name: 'Advisory Services', short: 'Advisory',
        color: '#B8860B', headcount: 3, active: true, lines: [
          line('ar_ext',  'Extension & Advisory Fees', 'revenue',
            seas([2e6,2e6,2.5e6,3e6,3e6,3.5e6,3.5e6,4e6,4e6,4.5e6,4.5e6,5e6])),
          line('ar_don',  'Donor Programme Income', 'revenue', flat(1_500_000)),
          line('ar_add',  'Add revenue line', 'revenue', flat(0)),

          line('as_team', 'Advisory Team ×3 (500K)', 'staff', flat(1_500_000)),
          line('as_dpo',  'Donor Programme Officer (500K)', 'staff', flat(500_000)),
          line('as_add',  'Add staff role', 'staff', flat(0)),

          line('ao_trn',  'Training Materials & Costs', 'direct_opex', flat(267_500)),
          line('ao_mtg',  'Meetings & Travel', 'direct_opex', flat(150_000)),
          line('ao_add',  'Add overhead', 'direct_opex', flat(0)),
        ],
      },

      // ── Customer Acquisition & Management ───────────────
      {
        id: 'customer', name: 'Customer Acquisition & Management', short: 'Customer',
        color: '#6B4A8B', headcount: 2, active: true, lines: [
          line('cr_ref',  'Referral & Outreach Income', 'revenue', flat(0)),
          line('cr_add',  'Add revenue line', 'revenue', flat(0)),

          line('cs_acq',  'Customer Acquisition Officer (450K)', 'staff', flat(450_000)),
          line('cs_mgr',  'Customer Management Officer (400K)', 'staff', flat(400_000)),
          line('cs_add',  'Add staff role', 'staff', flat(0)),

          line('co_promo','Promotions & Communications', 'direct_opex',
            seas([1e6,0,0,1.565e6,1.5e6,0,0,0,1.565e6,1.5e6,0,0])),
          line('co_evt',  'Farmer Day Events', 'direct_opex',
            seas([500_000,0,500_000,0,500_000,0,500_000,0,500_000,0,500_000,0])),
          line('co_ref',  'Lead Farmer & Boda Referrer Payouts', 'direct_opex', flat(0)),
          line('co_add',  'Add overhead', 'direct_opex', flat(0)),
        ],
      },

      // ── Licensing (inactive) ────────────────────────────
      {
        id: 'licensing', name: 'Input Supplier Network — Licensing', short: 'Licensing',
        color: '#8B2E2E', headcount: 0, active: false, lines: [
          line('lr_fee',  'Licence Fees', 'revenue', flat(0)),
          line('ls_mgr',  'Licensing Manager', 'staff', flat(0)),
          line('lo_add',  'Agent Support', 'direct_opex', flat(0)),
        ],
      },
    ],

    sharedLines: [
      line('sh_ceo',  'CEO', 'shared', flat(1_500_000), true),
      line('sh_fin',  'Finance Manager', 'shared', flat(1_200_000), true),
      line('sh_ops',  'Operations Manager', 'shared', flat(1_000_000), true),
      line('sh_bd',   'Business Development Manager', 'shared', flat(1_000_000), true),
      line('sh_cash', 'Cashier', 'shared', flat(350_000), true),
      line('sh_fuel', 'Fuel & Transport (central)', 'shared', flat(2_320_000), true),
      line('sh_off',  'Office Running Costs', 'shared', flat(400_000), true),
      line('sh_rep',  'Spares & Repairs', 'shared', flat(991_667), true),
      line('sh_dep',  'Motor Bike Depreciation', 'shared', flat(325_000), true),
      line('sh_ins',  'Motor Bike Insurance', 'shared', flat(270_833), true),
      line('sh_add1', 'Add shared cost', 'shared', flat(0), true),
      line('sh_add2', 'Add shared cost', 'shared', flat(0), true),
    ],

    scenarios: [
      { id: 'conservative', label: 'Conservative (−20% rev, +10% costs)', fgeCount: 16, revMult: 0.80, costMult: 1.10 },
      { id: 'base',         label: 'Base Case',                            fgeCount: 20, revMult: 1.00, costMult: 1.00 },
      { id: 'optimistic',   label: 'Optimistic (+20% rev, −5% costs)',    fgeCount: 20, revMult: 1.20, costMult: 0.95 },
      { id: 'stress',       label: 'Stress Test (−30% rev, +20% costs)',  fgeCount: 12, revMult: 0.70, costMult: 1.20 },
      { id: 'scale_40',     label: 'Scale — 40 FGEs',                     fgeCount: 40, revMult: 1.00, costMult: 1.00 },
      { id: 'scale_60',     label: 'Scale — 60 FGEs',                     fgeCount: 60, revMult: 1.00, costMult: 1.00 },
    ],

    capitalStructure: {
      shareholderContribution: 0,
      grantNonRepayable: 0,
      grantRecoverable: 0,
      bankLoan: 0,
      annualInterestRate: 0.18,
      loanTenorYears: 2,
      fixedAssets: 0,
    },
    debts: [],
    tradeCreditLines: [],

    seasons: [{
      id: 's1', name: 'Season 1 — Jul–Sep 2026',
      startMonth: 0, endMonth: 11,
      planLocked: false, lockedAt: '', lockedBy: '',
    }],

    spendingRequests: [],
    monthlyNotes: Array(MONTHS).fill(''),
  }
}

// ============================================================
// UNIT P&L RESULT TYPE
// ============================================================
export interface UnitPL {
  rev: number[]
  cogs: number[]
  gp: number[]
  staff: number[]
  opex: number[]
  shared: number[]
  totalOpex: number[]
  ebitda: number[]
  // Actuals
  actRev: (number | null)[]
  actCogs: (number | null)[]
  actStaff: (number | null)[]
  actOpex: (number | null)[]
  // Annual totals
  annRev: number
  annCogs: number
  annGP: number
  annStaff: number
  annOpex: number
  annShared: number
  annEbitda: number
  gpMargin: number
  ebitdaMargin: number
}

// ============================================================
// MAIN ENGINE
// ============================================================
export function runCONASModel(inputs: CONASInputs) {
  const sc = inputs.scenarios.find(s => s.id === inputs.global.activeScenarioId) || inputs.scenarios[1]
  const { revMult, costMult, fgeCount } = sc
  const cc = inputs.global.currency

  const allUnits = inputs.units.filter(u => u.active)

  // Top-level units (no parent) — these are what get shared cost allocated
  const topUnits = allUnits.filter(u => !u.parentId)

  // Sub-units grouped by parent
  const subUnitsByParent: Record<string, BusinessUnit[]> = {}
  allUnits.filter(u => u.parentId).forEach(u => {
    if (!subUnitsByParent[u.parentId!]) subUnitsByParent[u.parentId!] = []
    subUnitsByParent[u.parentId!].push(u)
  })

  // Approved spending → inject into relevant unit actual costs
  const approvedSpend: Record<string, Record<number, number>> = {}
  inputs.spendingRequests.filter(r => r.status === 'approved').forEach(r => {
    if (!approvedSpend[r.unitId]) approvedSpend[r.unitId] = {}
    approvedSpend[r.unitId][r.month] = (approvedSpend[r.unitId][r.month] || 0) + r.amount
  })

  // ── Calculate raw P&L for any unit (or sub-unit) ──────────
  function calcUnitRaw(u: BusinessUnit): Omit<UnitPL, 'shared' | 'totalOpex' | 'ebitda' | 'annShared' | 'annEbitda' | 'ebitdaMargin'> {
    const rev   = Array(MONTHS).fill(0) as number[]
    const cogs  = Array(MONTHS).fill(0) as number[]
    const staff = Array(MONTHS).fill(0) as number[]
    const opex  = Array(MONTHS).fill(0) as number[]
    const actRev   = Array(MONTHS).fill(null) as (number | null)[]
    const actCogs  = Array(MONTHS).fill(null) as (number | null)[]
    const actStaff = Array(MONTHS).fill(null) as (number | null)[]
    const actOpex  = Array(MONTHS).fill(null) as (number | null)[]

    u.lines.forEach(l => {
      const mult = l.category === 'revenue' ? revMult : costMult
      l.monthlyPlan.forEach((v, m) => {
        const val = v * mult
        if (l.category === 'revenue')        rev[m]   += val
        else if (l.category === 'cost_of_sales') cogs[m] += val
        else if (l.category === 'staff')     staff[m] += val
        else if (l.category === 'direct_opex')   opex[m]  += val
      })
      l.monthlyActual.forEach((v, m) => {
        if (v === null || l.actualStatus[m] !== 'approved') return
        const key = l.category === 'revenue' ? 'actRev' : l.category === 'cost_of_sales' ? 'actCogs' : l.category === 'staff' ? 'actStaff' : 'actOpex'
        const target = key === 'actRev' ? actRev : key === 'actCogs' ? actCogs : key === 'actStaff' ? actStaff : actOpex
        if (target[m] === null) target[m] = 0
        ;(target[m] as number) += v
      })
    })

    // Inject approved spending
    if (approvedSpend[u.id]) {
      Object.entries(approvedSpend[u.id]).forEach(([mStr, amt]) => {
        const m = Number(mStr)
        if (actOpex[m] === null) actOpex[m] = 0
        ;(actOpex[m] as number) += amt
      })
    }

    const gp = rev.map((r, m) => r - cogs[m])
    const yr = (a: number[]) => a.reduce((s, v) => s + v, 0)
    const annRev = yr(rev), annCogs = yr(cogs), annGP = yr(gp)
    const annStaff = yr(staff), annOpex = yr(opex)

    return { rev, cogs, gp, staff, opex, actRev, actCogs, actStaff, actOpex, annRev, annCogs, annGP, annStaff, annOpex, gpMargin: annRev > 0 ? annGP / annRev : 0 }
  }

  // ── Build per-unit results ─────────────────────────────────
  // For parent units that have sub-units: consolidate sub-units then add shared
  // For leaf units: calculate directly

  const unitPL: Record<string, UnitPL> = {}

  // First pass: calculate all individual units (including sub-units)
  allUnits.forEach(u => {
    const raw = calcUnitRaw(u)
    unitPL[u.id] = {
      ...raw,
      shared: Array(MONTHS).fill(0),
      totalOpex: Array(MONTHS).fill(0),
      ebitda: Array(MONTHS).fill(0),
      annShared: 0, annEbitda: 0, ebitdaMargin: 0,
    }
  })

  // For Input Profit Centres parent: consolidate from sub-units
  // We create a virtual consolidated unit entry
  Object.entries(subUnitsByParent).forEach(([parentId, subs]) => {
    const consolidated = {
      rev:   Array(MONTHS).fill(0) as number[],
      cogs:  Array(MONTHS).fill(0) as number[],
      gp:    Array(MONTHS).fill(0) as number[],
      staff: Array(MONTHS).fill(0) as number[],
      opex:  Array(MONTHS).fill(0) as number[],
      actRev:   Array(MONTHS).fill(null) as (number|null)[],
      actCogs:  Array(MONTHS).fill(null) as (number|null)[],
      actStaff: Array(MONTHS).fill(null) as (number|null)[],
      actOpex:  Array(MONTHS).fill(null) as (number|null)[],
    }
    subs.forEach(su => {
      const r = unitPL[su.id]
      for (let m = 0; m < MONTHS; m++) {
        consolidated.rev[m]   += r.rev[m]
        consolidated.cogs[m]  += r.cogs[m]
        consolidated.gp[m]    += r.gp[m]
        consolidated.staff[m] += r.staff[m]
        consolidated.opex[m]  += r.opex[m]
        if (r.actRev[m]   !== null) { if (consolidated.actRev[m]   === null) consolidated.actRev[m]   = 0; (consolidated.actRev[m]   as number) += r.actRev[m]   as number }
        if (r.actCogs[m]  !== null) { if (consolidated.actCogs[m]  === null) consolidated.actCogs[m]  = 0; (consolidated.actCogs[m]  as number) += r.actCogs[m]  as number }
        if (r.actStaff[m] !== null) { if (consolidated.actStaff[m] === null) consolidated.actStaff[m] = 0; (consolidated.actStaff[m] as number) += r.actStaff[m] as number }
        if (r.actOpex[m]  !== null) { if (consolidated.actOpex[m]  === null) consolidated.actOpex[m]  = 0; (consolidated.actOpex[m]  as number) += r.actOpex[m]  as number }
      }
    })
    const yr = (a: number[]) => a.reduce((s, v) => s + v, 0)
    unitPL[parentId] = {
      ...consolidated,
      shared: Array(MONTHS).fill(0),
      totalOpex: Array(MONTHS).fill(0),
      ebitda: Array(MONTHS).fill(0),
      annRev: yr(consolidated.rev), annCogs: yr(consolidated.cogs), annGP: yr(consolidated.gp),
      annStaff: yr(consolidated.staff), annOpex: yr(consolidated.opex),
      gpMargin: yr(consolidated.rev) > 0 ? yr(consolidated.gp) / yr(consolidated.rev) : 0,
      annShared: 0, annEbitda: 0, ebitdaMargin: 0,
    }
  })

  // ── Shared cost pool ──────────────────────────────────────
  const sharedPool = Array(MONTHS).fill(0) as number[]
  inputs.sharedLines.forEach(l => l.monthlyPlan.forEach((v, m) => { sharedPool[m] += v * costMult }))

  // Hybrid allocation across TOP-LEVEL units only
  // (sub-units share via their parent's allocation)
  const allocUnits = topUnits.filter(u => unitPL[u.id])
  const totalHC = allocUnits.reduce((s, u) => s + u.headcount, 0) || 1
  const fixedPct = inputs.global.sharedCostFixedPct

  for (let m = 0; m < MONTHS; m++) {
    const totalRev = allocUnits.reduce((s, u) => s + unitPL[u.id].rev[m], 0)
    allocUnits.forEach(u => {
      const hcShare  = u.headcount / totalHC
      const revShare = totalRev > 0 ? unitPL[u.id].rev[m] / totalRev : 0
      unitPL[u.id].shared[m] = sharedPool[m] * (fixedPct * hcShare + (1 - fixedPct) * revShare)
    })
  }

  // Distribute parent's shared cost to sub-units proportionally by revenue
  Object.entries(subUnitsByParent).forEach(([parentId, subs]) => {
    for (let m = 0; m < MONTHS; m++) {
      const parentShared = unitPL[parentId].shared[m]
      const parentRev = unitPL[parentId].rev[m]
      subs.forEach(su => {
        const share = parentRev > 0 ? unitPL[su.id].rev[m] / parentRev : 1 / subs.length
        unitPL[su.id].shared[m] = parentShared * share
      })
    }
  })

  // Finalise EBITDA for all units
  const yr = (a: number[]) => a.reduce((s, v) => s + v, 0)
  allUnits.concat(topUnits).forEach(u => {
    // avoid double-processing (topUnits may overlap with allUnits)
    if (!unitPL[u.id]) return
    const r = unitPL[u.id]
    for (let m = 0; m < MONTHS; m++) {
      r.totalOpex[m] = r.staff[m] + r.opex[m] + r.shared[m]
      r.ebitda[m]    = r.gp[m] - r.totalOpex[m]
    }
    r.annShared  = yr(r.shared)
    r.annEbitda  = yr(r.ebitda)
    r.ebitdaMargin = r.annRev > 0 ? r.annEbitda / r.annRev : 0
  })

  // Also compute for parent consolidated units
  Object.keys(subUnitsByParent).forEach(parentId => {
    const r = unitPL[parentId]
    if (!r) return
    for (let m = 0; m < MONTHS; m++) {
      r.totalOpex[m] = r.staff[m] + r.opex[m] + r.shared[m]
      r.ebitda[m]    = r.gp[m] - r.totalOpex[m]
    }
    r.annShared  = yr(r.shared)
    r.annEbitda  = yr(r.ebitda)
    r.ebitdaMargin = r.annRev > 0 ? r.annEbitda / r.annRev : 0
  })

  // ── Debt schedule ────────────────────────────────────────
  // Built ahead of the P&L consolidation loop so interest can be deducted
  // as a real cost before tax, and principal repayment can be booked as a
  // real financing cash outflow below -- same treatment as the generic
  // engine (generic-engine.ts). Uses the existing buildDebtSchedule(), which
  // was already relied on for DSCR scoring elsewhere -- no new calculation
  // logic, just wiring the schedule into the actual P&L and cash flow.
  const cap = inputs.capitalStructure
  const debtObligations: DebtObligation[] = (inputs.debts && inputs.debts.length > 0)
    ? inputs.debts.map(d => ({
        drawdownMonth: d.drawdownMonth ?? 1,
        annualRate: d.annualRate ?? cap.annualInterestRate ?? 0.18,
        tenorMonths: d.tenorMonths ?? (cap.loanTenorYears ?? 2) * 12,
        gracePeriodMonths: d.gracePeriodMonths ?? 0,
        principal: d.principal ?? 0,
        repaymentType: d.repaymentType ?? 'amortising',
      }))
    : (cap.bankLoan > 0 ? [{
        drawdownMonth: 1,
        annualRate: cap.annualInterestRate ?? 0.18,
        tenorMonths: (cap.loanTenorYears ?? 2) * 12,
        gracePeriodMonths: 0,
        principal: cap.bankLoan,
        repaymentType: 'amortising' as const,
      }] : [])
  const debtSchedule = buildDebtSchedule(debtObligations, MONTHS)

  // ── Consolidated P&L ─────────────────────────────────────
  // Sum top-level units only (sub-units are included via parent consolidation)
  const con = {
    rev: Array(MONTHS).fill(0) as number[], cogs: Array(MONTHS).fill(0) as number[],
    gp:  Array(MONTHS).fill(0) as number[], opex: Array(MONTHS).fill(0) as number[],
    ebitda: Array(MONTHS).fill(0) as number[], interest: debtSchedule.totalInterest,
    nbt: Array(MONTHS).fill(0) as number[],
    tax: Array(MONTHS).fill(0) as number[], npat: Array(MONTHS).fill(0) as number[],
    actRev: Array(MONTHS).fill(null) as (number|null)[],
    actEbitda: Array(MONTHS).fill(null) as (number|null)[],
  }

  // We need to know which unit ids to sum for consolidated
  // These are top-level units + the parent virtual units (input_centres)
  const consolidatedUnitIds = new Set<string>()
  topUnits.forEach(u => consolidatedUnitIds.add(u.id))
  Object.keys(subUnitsByParent).forEach(pid => consolidatedUnitIds.add(pid))
  // Remove sub-units that would be double-counted
  allUnits.filter(u => u.parentId).forEach(u => consolidatedUnitIds.delete(u.id))

  // Approved spending requests are real, immediate expenses -- computed here
  // (ahead of the P&L roll-up) so they can reduce npat the same month they
  // hit cash. Previously this only reduced cash (via cf.opCash below) with
  // no matching reduction in profit, so retained earnings never moved and
  // the balance sheet permanently unbalanced by the approved amount.
  const approvedCashOut = Array(MONTHS).fill(0) as number[]
  inputs.spendingRequests.filter(r => r.status === 'approved').forEach(r => {
    approvedCashOut[r.month] += r.amount
  })

  for (let m = 0; m < MONTHS; m++) {
    consolidatedUnitIds.forEach(uid => {
      const r = unitPL[uid]
      if (!r) return
      con.rev[m]    += r.rev[m]
      con.cogs[m]   += r.cogs[m]
      con.gp[m]     += r.gp[m]
      con.opex[m]   += r.totalOpex[m]
      con.ebitda[m] += r.ebitda[m]
      if (r.actRev[m] !== null) {
        if (con.actRev[m] === null) con.actRev[m] = 0
        ;(con.actRev[m] as number) += r.actRev[m] as number
      }
    })
    con.ebitda[m] -= approvedCashOut[m]
    // Interest is deducted before tax (tax-deductible finance cost). Principal
    // is NOT deducted here -- repaying loan principal isn't an expense, it's a
    // financing cash outflow with no P&L impact, handled below in cash flow.
    con.nbt[m]  = con.ebitda[m] - (con.interest[m] ?? 0)
    con.tax[m]  = con.nbt[m] > 0 ? con.nbt[m] * inputs.global.corporateTaxRate : 0
    con.npat[m] = con.nbt[m] - con.tax[m]
    if (con.actRev[m] !== null) con.actEbitda[m] = (con.actRev[m] as number) - con.cogs[m] - con.opex[m] - approvedCashOut[m]
  }

  // ── Cash flow ─────────────────────────────────────────────

  const irrigationOut = Array(MONTHS).fill(0) as number[]
  irrigationOut[0] = Math.round(fgeCount / 2) * 8_000_000
  irrigationOut[1] = Math.ceil(fgeCount / 2)  * 8_000_000

  // Trade credit working capital adjustment -- computed from real monthly
  // movements (new credit + amounts settled), not a flat estimate, and fed
  // directly into operating cash flow the way AR/AP movements work in practice.
  // Outstanding payable/receivable balances are kept alongside the cash effect
  // so the balance sheet can carry matching AR/AP lines -- without these, the
  // cash effect moves cash with no offsetting entry and the balance sheet
  // stops balancing as soon as any trade credit line has non-zero movement.
  const conasTradeCreditLines = (inputs.tradeCreditLines || []).map(l => ({
    id: l.id, name: l.name, type: l.type,
    monthly_new: l.monthlyNew || Array(MONTHS).fill(0),
    monthly_settled: l.monthlySettled || Array(MONTHS).fill(0),
  }))
  const conasTradeCredit = computeTradeCredit(conasTradeCreditLines, con.cogs, con.rev, MONTHS)
  const tradeCreditCashEffect = conasTradeCredit.monthlyCashEffect

  const cf = {
    opCash:  Array(MONTHS).fill(0) as number[],
    finCash: Array(MONTHS).fill(0) as number[],
    invCash: Array(MONTHS).fill(0) as number[],
    net:     Array(MONTHS).fill(0) as number[],
    open:    Array(MONTHS).fill(0) as number[],
    close:   Array(MONTHS).fill(0) as number[],
    irrigation: irrigationOut,
    approvedSpend: approvedCashOut,
    workingCapitalAdj: tradeCreditCashEffect,
  }
  cf.finCash[0] = cap.shareholderContribution + cap.grantNonRepayable + cap.grantRecoverable
  // Fixed assets purchased with cash are an investing outflow in month 0 --
  // without this, fixed assets appear on the balance sheet with no cash
  // consequence, breaking Assets = Equity + Liabilities.
  cf.invCash[0] = -(cap.fixedAssets || 0)
  // Each debt obligation's principal enters financing cash flow in its own
  // drawdown month, not always lumped into month 0 -- mirrors generic-engine.ts
  // so a loan starting after month 1 (or multiple loans) is represented correctly.
  debtObligations.forEach(ob => {
    const idx = Math.max(0, (ob.drawdownMonth ?? 1) - 1)
    if (idx < MONTHS) cf.finCash[idx] += ob.principal ?? 0
  })
  for (let m = 0; m < MONTHS; m++) {
    // Loan principal repayment is a financing outflow -- no P&L impact.
    // Interest is already reflected in npat above (deducted before tax).
    cf.finCash[m] -= debtSchedule.totalPrincipal[m] ?? 0
    // approvedCashOut is no longer subtracted here -- it is already folded
    // into con.npat[m] above, which is what op_cash is built from. Subtracting
    // it again here double-counted it: cash dropped by 2x the approved amount
    // while equity only dropped by 1x, unbalancing the balance sheet.
    cf.opCash[m] = con.npat[m] - irrigationOut[m] + (tradeCreditCashEffect[m] || 0)
    cf.net[m]    = cf.opCash[m] + cf.finCash[m] + cf.invCash[m]
    cf.open[m]   = m === 0 ? inputs.global.openingCashBalance : cf.close[m - 1]
    cf.close[m]  = cf.open[m] + cf.net[m]
  }

  // ── Balance sheet ─────────────────────────────────────────
  // Assets: Fixed assets + irrigation kits + cash + receivables
  // Equity: Capital + retained earnings
  // Liabilities: Grants (recoverable) + loans
  const totalIrrigation = yr(irrigationOut)
  // Cumulative irrigation deployed by each month, not the full-year total
  // applied retroactively to every month -- the asset only exists once cash
  // has actually been spent on it.
  const cumIrrigation: number[] = []
  let runningIrrigation = 0
  for (let m = 0; m < MONTHS; m++) { runningIrrigation += irrigationOut[m]; cumIrrigation.push(runningIrrigation) }
  const totalCapital = cap.shareholderContribution + cap.grantNonRepayable + cap.grantRecoverable + cap.bankLoan + cap.fixedAssets

  const bs = {
    cash:           cf.close,
    irrigationKits: cumIrrigation, // cumulative kits actually deployed and paid for by each month
    fixedAssets:    Array(MONTHS).fill(cap.fixedAssets) as number[],
    accountsReceivable: conasTradeCredit.totalReceivableOutstanding,
    totalAssets:    Array(MONTHS).fill(0) as number[],
    shareCapital:   Array(MONTHS).fill(cap.shareholderContribution) as number[],
    grantEquity:    Array(MONTHS).fill(cap.grantNonRepayable) as number[],
    retainedEarnings: Array(MONTHS).fill(0) as number[],
    totalEquity:    Array(MONTHS).fill(0) as number[],
    grantLiability: Array(MONTHS).fill(cap.grantRecoverable) as number[],
    loanLiability:  debtSchedule.totalOutstanding,
    accountsPayable: conasTradeCredit.totalPayableOutstanding,
    totalLiabilities: Array(MONTHS).fill(0) as number[],
    totalEquityAndLiabilities: Array(MONTHS).fill(0) as number[],
  }

  // Opening cash balance is pre-existing capital from before the season --
  // without a balance sheet source, cash exists with no matching equity.
  let cumNPAT = inputs.global.openingCashBalance || 0
  for (let m = 0; m < MONTHS; m++) {
    cumNPAT += con.npat[m]
    bs.retainedEarnings[m] = cumNPAT
    bs.totalAssets[m]       = bs.cash[m] + bs.irrigationKits[m] + bs.fixedAssets[m] + bs.accountsReceivable[m]
    bs.totalEquity[m]       = bs.shareCapital[m] + bs.grantEquity[m] + bs.retainedEarnings[m]
    bs.totalLiabilities[m]  = bs.grantLiability[m] + bs.loanLiability[m] + bs.accountsPayable[m]
    bs.totalEquityAndLiabilities[m] = bs.totalEquity[m] + bs.totalLiabilities[m]
  }

  // ── Metrics ───────────────────────────────────────────────
  const totRev = yr(con.rev)
  const metrics = {
    totalRevenue: totRev,
    totalGP:      yr(con.gp),
    totalEBITDA:  yr(con.ebitda),
    totalNPAT:    yr(con.npat),
    grossMargin:  totRev > 0 ? yr(con.gp) / totRev : 0,
    netMargin:    totRev > 0 ? yr(con.npat) / totRev : 0,
    minCash:      Math.min(...cf.close),
    minCashMonth: cf.close.indexOf(Math.min(...cf.close)) + 1,
    totalShared:  yr(sharedPool),
    irrigationTotal: yr(irrigationOut),
    approvedSpendTotal: yr(approvedCashOut),
    fgeCount,
    scenarioLabel: sc.label,
    pendingRequests: inputs.spendingRequests.filter(r => r.status === 'pending').length,
  }

  return {
    unitPL, con, cf, bs, metrics, sharedPool,
    allocUnits,
    subUnitsByParent,
    consolidatedUnitIds: Array.from(consolidatedUnitIds),
    debtSchedule,
  }
}
