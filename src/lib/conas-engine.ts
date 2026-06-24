// ============================================================
// CONAS AGRICULTURAL HUB — CALCULATION ENGINE v3
// Key principles:
// - No date restrictions: any month accepts plan or actual entry
// - Spending approvals post directly to unit P&L and cash flow
// - Season lock freezes plan figures only; actuals always editable
// - All numbers flow: change one input → everything recalculates
// ============================================================

export const MONTHS = 12

// ---- Formatters ----
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
export function pct(n: number): string { return `${(n*100).toFixed(1)}%` }
export function buildMonthLabels(startDate: string): string[] {
  const d = new Date(startDate)
  return Array.from({length: MONTHS}, (_, i) => {
    const m = new Date(d.getFullYear(), d.getMonth()+i, 1)
    return m.toLocaleString('en-GB', {month:'short', year:'2-digit'})
  })
}

// ============================================================
// TYPES
// ============================================================
export interface PlanLine {
  id: string
  name: string
  category: 'revenue' | 'cost_of_sales' | 'staff' | 'direct_opex' | 'shared'
  monthlyPlan: number[]          // 12 values — editable any time
  monthlyActual: (number|null)[] // null = not yet entered
  // Approval status per month for actuals
  actualStatus: ('draft'|'submitted'|'approved'|'rejected')[]
  rejectionNote: string[]
  isShared: boolean
}

export interface SpendingRequest {
  id: string
  requestedBy: string       // role label
  description: string
  unitId: string
  category: 'cost_of_sales'|'staff'|'direct_opex'|'shared'
  month: number             // 0-indexed
  amount: number
  status: 'pending'|'approved'|'declined'
  ceoNote: string
  createdAt: string
  resolvedAt: string
}

export interface Season {
  id: string
  name: string
  startMonth: number   // 0-indexed
  endMonth: number     // 0-indexed
  planLocked: boolean
  lockedAt: string
  lockedBy: string
}

export interface BusinessUnit {
  id: string
  name: string
  short: string
  color: string
  headcount: number
  active: boolean
  lines: PlanLine[]
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
  scenarios: {id:string; label:string; fgeCount:number; revMult:number; costMult:number}[]
  capitalStructure: {
    shareholderContribution: number
    grantNonRepayable: number
    grantRecoverable: number
    bankLoan: number
    annualInterestRate: number
    loanTenorYears: number
  }
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
    id, name, category,
    monthlyPlan: plan,
    monthlyActual: Array(MONTHS).fill(null),
    actualStatus: Array(MONTHS).fill('draft'),
    rejectionNote: Array(MONTHS).fill(''),
    isShared,
  }
}
function flat(v: number): number[] { return Array(MONTHS).fill(v) }
function seas(vals: number[]): number[] { return vals }

// ============================================================
// DEFAULT INPUTS — seeded from CONAS Excel v11
// ============================================================
export function defaultCONASInputs(): CONASInputs {
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

    // ── BUSINESS UNITS ─────────────────────────────────────
    units: [

      // 1. INPUT PROFIT CENTRES
      { id:'input_centres', name:'Input Profit Centres (×5)', short:'Inputs', color:'#1B2A4A', headcount:12, active:true, lines:[
        line('ip_walkin',    'Walk-in Farmer Sales',          'revenue',
          seas([24e6,48e6,8e6,8e6,8e6,24e6,48e6,8e6,8e6,24e6,8e6,8e6])),
        line('ip_fge',       'Input Supply to FGEs (internal)','revenue',
          seas([54.4e6,325.4e6,0,0,0,54.4e6,325.4e6,0,0,0,0,0])),
        line('ip_network',   'Input Supplier Network',        'revenue', flat(0)),
        line('ip_other',     'Other Revenue — add line',      'revenue', flat(0)),

        line('ic_walkin',    'Walk-in Procurement Cost',      'cost_of_sales',
          seas([18.2e6,36.5e6,6.1e6,6.1e6,6.1e6,18.2e6,36.5e6,6.1e6,6.1e6,18.2e6,6.1e6,6.1e6])),
        line('ic_fge',       'FGE Input Procurement Cost',    'cost_of_sales',
          seas([43.9e6,263.1e6,0,0,0,43.9e6,263.1e6,0,0,0,0,0])),

        line('is_mgrs',      'Input Centre Managers ×5 (500K each)','staff', flat(2_500_000)),
        line('is_proc',      'Procurement Officer (500K)',    'staff', flat(500_000)),
        line('is_add',       'Add staff role',                'staff', flat(0)),

        line('io_rent',      'Store Rent ×5',                 'direct_opex',
          seas([0,0,0,1_750_000,1_750_000,1_750_000,1_750_000,1_750_000,1_750_000,1_750_000,1_750_000,1_750_000])),
        line('io_del',       'Input Delivery & Handling',     'direct_opex',
          seas([300_000,0,0,0,200_000,0,100_000,0,200_000,0,0,0])),
        line('io_add1',      'Add overhead — e.g. Farmer Day','direct_opex', flat(0)),
        line('io_add2',      'Add overhead',                  'direct_opex', flat(0)),
      ]},

      // 2. FGE PRODUCTION & MARKETING
      { id:'fge', name:'FGE Production & Marketing', short:'FGE', color:'#00B4D8', headcount:8, active:true, lines:[
        line('fr_tom',  'Tomatoes — Produce Sales to Market', 'revenue',
          seas([0,0,0,735e6,0,0,0,0,735e6,0,0,0])),
        line('fr_wm',   'Watermelon — Produce Sales to Market','revenue',
          seas([0,0,0,0,800e6,0,0,0,0,800e6,0,0])),
        line('fr_cab',  'Cabbages — Produce Sales to Market', 'revenue',
          seas([0,0,0,0,255e6,0,0,0,255e6,0,0,0])),
        line('fr_add',  'Add revenue line',                   'revenue', flat(0)),

        line('fc_tom',  'Payment to FGEs — Tomatoes',         'cost_of_sales',
          seas([0,0,0,660e6,0,0,0,0,660e6,0,0,0])),
        line('fc_wm',   'Payment to FGEs — Watermelon',       'cost_of_sales',
          seas([0,0,0,0,352e6,0,0,0,0,352e6,0,0])),
        line('fc_cab',  'Payment to FGEs — Cabbages',         'cost_of_sales',
          seas([0,0,0,0,170e6,0,0,0,170e6,0,0,0])),
        line('fc_ins',  'Crop Insurance (10% of input costs)','cost_of_sales',
          seas([10.2e6,24e6,0,0,0,17.8e6,13.2e6,0,0,10.9e6,0,0])),
        line('fc_hdl',  'Produce Delivery, Handling & Taxes', 'cost_of_sales',
          seas([0,0,0,26e6,13e6,0,0,13e6,13e6,13e6,0,13e6])),

        line('fs_mgr',  'FGE Services Manager (600K)',         'staff', flat(600_000)),
        line('fs_fld',  'Field Officers ×5 (400K each)',       'staff', flat(2_000_000)),
        line('fs_log',  'Fleet & Logistics Manager (500K)',    'staff', flat(500_000)),
        line('fs_add',  'Add staff role',                      'staff', flat(0)),

        line('fo_reg',  'FGE Registration (Month 1 one-off)', 'direct_opex',
          seas([11e6,0,0,0,0,0,0,0,0,0,0,0])),
        line('fo_fuel', 'Fuel — Extension Officers',           'direct_opex', flat(1_650_000)),
        line('fo_lub',  'Lubricants — Extension',              'direct_opex', flat(270_000)),
        line('fo_rm',   'R&M — FGE Equipment',                 'direct_opex',
          seas([0,0,0,750_000,750_000,0,0,750_000,750_000,750_000,0,750_000])),
        line('fo_trays','Fruit Trays & Pallets (harvest months)','direct_opex',
          seas([0,0,0,283_333,283_333,0,0,283_333,283_333,283_333,0,283_333])),
        line('fo_comm', 'FGE Communications (10K/FGE/month)',  'direct_opex', flat(200_000)),
        line('fo_add',  'Add overhead',                        'direct_opex', flat(0)),
      ]},

      // 3. OWN FARM
      { id:'own_farm', name:"CONAS Own Farm", short:'Farm', color:'#1A7A4A', headcount:5, active:true, lines:[
        line('or_tom',  'Own Farm — Tomato Sales',   'revenue', seas([0,0,0,15e6,0,0,0,0,15e6,0,0,0])),
        line('or_wm',   'Own Farm — Watermelon',     'revenue', seas([0,0,0,0,20e6,0,0,0,0,20e6,0,0])),
        line('or_cab',  'Own Farm — Cabbages',       'revenue', seas([0,0,0,0,0,0,0,0,3e6,2e6,0,0])),
        line('or_goat', 'Own Farm — Goats',          'revenue', flat(0)),
        line('or_add',  'Add revenue line',          'revenue', flat(0)),

        line('oc_seed', 'Seeds & Planting Material', 'cost_of_sales',
          seas([800_000,800_000,800_000,0,0,800_000,800_000,800_000,0,0,800_000,800_000])),
        line('oc_fert', 'Fertiliser',                'cost_of_sales', seas([0,2e6,0,0,0,0,2e6,0,0,0,0,0])),
        line('oc_chem', 'Chemicals & Pesticides',    'cost_of_sales', flat(500_000)),

        line('os_mgr',  'Farm Manager (600K)',        'staff', flat(600_000)),
        line('os_lab',  'Farm Labourers ×4 (200K)',   'staff', flat(800_000)),
        line('os_add',  'Add staff role',             'staff', flat(0)),

        line('oo_rent', 'Farm Rent',                  'direct_opex',
          seas([0,0,0,350_000,350_000,0,0,350_000,350_000,350_000,0,350_000])),
        line('oo_irr',  'Irrigation',                 'direct_opex', flat(30_000)),
        line('oo_ghs',  'Greenhouse Depreciation',    'direct_opex', flat(183_333)),
        line('oo_add',  'Add overhead',               'direct_opex', flat(0)),
      ]},

      // 4. ADVISORY SERVICES
      { id:'advisory', name:'Advisory Services', short:'Advisory', color:'#B8860B', headcount:3, active:true, lines:[
        line('ar_ext',  'Extension & Advisory Fees', 'revenue',
          seas([2e6,2e6,2.5e6,3e6,3e6,3.5e6,3.5e6,4e6,4e6,4.5e6,4.5e6,5e6])),
        line('ar_don',  'Donor Programme Income',    'revenue', flat(1_500_000)),
        line('ar_trn',  'Training & Capacity',       'revenue', flat(0)),
        line('ar_add',  'Add revenue line',          'revenue', flat(0)),

        line('as_team', 'Advisory Team ×3 (500K)',   'staff', flat(1_500_000)),
        line('as_dpo',  'Donor Programme Officer',   'staff', flat(500_000)),
        line('as_add',  'Add staff role',            'staff', flat(0)),

        line('ao_trn',  'Training Materials & Costs','direct_opex', flat(267_500)),
        line('ao_mtg',  'Meetings & Travel',         'direct_opex', flat(150_000)),
        line('ao_add',  'Add overhead',              'direct_opex', flat(0)),
      ]},

      // 5. CUSTOMER ACQUISITION & MANAGEMENT
      { id:'customer', name:'Customer Acquisition & Management', short:'Customer', color:'#6B4A8B', headcount:2, active:true, lines:[
        line('cr_ref',  'Referral & Outreach Income', 'revenue', flat(0)),
        line('cr_data', 'Farmer Data Services',       'revenue', flat(0)),
        line('cr_add',  'Add revenue line',           'revenue', flat(0)),

        line('cs_acq',  'Customer Acquisition Officer (450K)','staff', flat(450_000)),
        line('cs_mgr',  'Customer Management Officer (400K)', 'staff', flat(400_000)),
        line('cs_add',  'Add staff role',                     'staff', flat(0)),

        line('co_promo','Promotions & Communications','direct_opex',
          seas([1e6,0,0,1.565e6,1.5e6,0,0,0,1.565e6,1.5e6,0,0])),
        line('co_evt',  'Farmer Day Events',          'direct_opex',
          seas([500_000,0,500_000,0,500_000,0,500_000,0,500_000,0,500_000,0])),
        line('co_ref',  'Lead Farmer & Boda Referrer Payouts','direct_opex', flat(0)),
        line('co_add',  'Add overhead',               'direct_opex', flat(0)),
      ]},

      // 6. LICENSING (inactive until Season 4)
      { id:'licensing', name:'Input Supplier Network — Licensing', short:'Licensing', color:'#8B2E2E', headcount:0, active:false, lines:[
        line('lr_fee',  'Licence Fees',              'revenue', flat(0)),
        line('ls_mgr',  'Licensing Manager',         'staff',   flat(0)),
        line('lo_add',  'Agent Support',             'direct_opex', flat(0)),
      ]},
    ],

    // ── SHARED / CENTRAL COSTS ─────────────────────────────
    sharedLines: [
      line('sh_ceo',  'CEO',                           'shared', flat(1_500_000), true),
      line('sh_fin',  'Finance Manager',               'shared', flat(1_200_000), true),
      line('sh_ops',  'Operations Manager',            'shared', flat(1_000_000), true),
      line('sh_bd',   'Business Development Manager',  'shared', flat(1_000_000), true),
      line('sh_cash', 'Cashier',                       'shared', flat(350_000),   true),
      line('sh_fuel', 'Fuel & Transport (central)',    'shared', flat(2_320_000), true),
      line('sh_off',  'Office Running Costs',          'shared', flat(400_000),   true),
      line('sh_rep',  'Spares & Repairs (central)',    'shared', flat(991_667),   true),
      line('sh_dep',  'Motor Bike Depreciation',       'shared', flat(325_000),   true),
      line('sh_ins',  'Motor Bike Insurance',          'shared', flat(270_833),   true),
      line('sh_add1', 'Add shared cost',               'shared', flat(0),         true),
      line('sh_add2', 'Add shared cost',               'shared', flat(0),         true),
    ],

    scenarios: [
      {id:'conservative', label:'Conservative (−20% rev, +10% costs)', fgeCount:16, revMult:0.80, costMult:1.10},
      {id:'base',         label:'Base Case',                            fgeCount:20, revMult:1.00, costMult:1.00},
      {id:'optimistic',   label:'Optimistic (+20% rev, −5% costs)',    fgeCount:20, revMult:1.20, costMult:0.95},
      {id:'stress',       label:'Stress Test (−30% rev, +20% costs)',  fgeCount:12, revMult:0.70, costMult:1.20},
      {id:'scale_40',     label:'Scale — 40 FGEs',                     fgeCount:40, revMult:1.00, costMult:1.00},
      {id:'scale_60',     label:'Scale — 60 FGEs',                     fgeCount:60, revMult:1.00, costMult:1.00},
    ],

    capitalStructure: {
      shareholderContribution:0, grantNonRepayable:0, grantRecoverable:0,
      bankLoan:0, annualInterestRate:0.18, loanTenorYears:2,
    },

    seasons: [{
      id:'s1', name:'Season 1 — Jul–Sep 2026',
      startMonth:0, endMonth:11,
      planLocked:false, lockedAt:'', lockedBy:'',
    }],

    spendingRequests: [],
    monthlyNotes: Array(MONTHS).fill(''),
  }
}

// ============================================================
// MAIN ENGINE
// ============================================================
export function runCONASModel(inputs: CONASInputs) {
  const sc = inputs.scenarios.find(s => s.id === inputs.global.activeScenarioId) || inputs.scenarios[1]
  const {revMult, costMult, fgeCount} = sc
  const cc = inputs.global.currency
  const activeUnits = inputs.units.filter(u => u.active)

  // ---- Approved spending requests → post to relevant unit lines ----
  // We inject approved requests as additional actuals entries on the
  // relevant unit's cost lines. They appear in the actuals column and
  // flow through to the P&L and cash flow automatically.
  const approvedSpend: Record<string, Record<number, number>> = {}  // unitId → month → total
  inputs.spendingRequests
    .filter(r => r.status === 'approved')
    .forEach(r => {
      if (!approvedSpend[r.unitId]) approvedSpend[r.unitId] = {}
      approvedSpend[r.unitId][r.month] = (approvedSpend[r.unitId][r.month] || 0) + r.amount
    })

  // ---- Per-unit calculation ----
  interface UnitCalc {
    plan:   {rev:number[]; cogs:number[]; staff:number[]; opex:number[]; gp:number[]; ebitda:number[]}
    actual: {rev:(number|null)[]; cogs:(number|null)[]; staff:(number|null)[]; opex:(number|null)[]}
    shared: number[]
    totalOpex: number[]
    finalEbitda: number[]
  }

  const uc: Record<string, UnitCalc> = {}

  activeUnits.forEach(u => {
    const P = {
      rev:   Array(MONTHS).fill(0) as number[],
      cogs:  Array(MONTHS).fill(0) as number[],
      staff: Array(MONTHS).fill(0) as number[],
      opex:  Array(MONTHS).fill(0) as number[],
      gp:    Array(MONTHS).fill(0) as number[],
      ebitda:Array(MONTHS).fill(0) as number[],
    }
    const A = {
      rev:   Array(MONTHS).fill(null) as (number|null)[],
      cogs:  Array(MONTHS).fill(null) as (number|null)[],
      staff: Array(MONTHS).fill(null) as (number|null)[],
      opex:  Array(MONTHS).fill(null) as (number|null)[],
    }

    u.lines.forEach(l => {
      const mult = l.category === 'revenue' ? revMult : costMult
      l.monthlyPlan.forEach((v, m) => {
        const val = v * mult
        if (l.category === 'revenue')      P.rev[m]   += val
        else if (l.category === 'cost_of_sales') P.cogs[m] += val
        else if (l.category === 'staff')   P.staff[m] += val
        else if (l.category === 'direct_opex') P.opex[m] += val
      })
      // Actuals — only approved entries count
      l.monthlyActual.forEach((v, m) => {
        if (v === null || l.actualStatus[m] !== 'approved') return
        const key = l.category === 'revenue' ? 'rev' : l.category === 'cost_of_sales' ? 'cogs' : l.category === 'staff' ? 'staff' : 'opex'
        if (A[key][m] === null) A[key][m] = 0
        ;(A[key][m] as number) += v
      })
    })

    // Inject approved spending requests as actual cost entries
    if (approvedSpend[u.id]) {
      Object.entries(approvedSpend[u.id]).forEach(([mStr, amt]) => {
        const m = Number(mStr)
        if (A.opex[m] === null) A.opex[m] = 0
        ;(A.opex[m] as number) += amt
      })
    }

    for (let m = 0; m < MONTHS; m++) {
      P.gp[m]     = P.rev[m] - P.cogs[m]
      P.ebitda[m] = P.gp[m] - P.staff[m] - P.opex[m]
    }

    uc[u.id] = { plan:P, actual:A, shared:Array(MONTHS).fill(0), totalOpex:Array(MONTHS).fill(0), finalEbitda:Array(MONTHS).fill(0) }
  })

  // ---- Shared cost pool + hybrid allocation ----
  const sharedPool = Array(MONTHS).fill(0) as number[]
  inputs.sharedLines.forEach(l => l.monthlyPlan.forEach((v,m) => { sharedPool[m] += v * costMult }))

  const totalHC = activeUnits.reduce((s,u) => s+u.headcount, 0) || 1
  const fixedPct = inputs.global.sharedCostFixedPct

  for (let m = 0; m < MONTHS; m++) {
    const totalRev = activeUnits.reduce((s,u) => s + uc[u.id].plan.rev[m], 0)
    activeUnits.forEach(u => {
      const hcShare  = u.headcount / totalHC
      const revShare = totalRev > 0 ? uc[u.id].plan.rev[m] / totalRev : 0
      uc[u.id].shared[m] = sharedPool[m] * (fixedPct*hcShare + (1-fixedPct)*revShare)
    })
  }

  // ---- Final unit P&L ----
  activeUnits.forEach(u => {
    const r = uc[u.id]
    for (let m = 0; m < MONTHS; m++) {
      r.totalOpex[m]   = r.plan.staff[m] + r.plan.opex[m] + r.shared[m]
      r.finalEbitda[m] = r.plan.gp[m] - r.totalOpex[m]
    }
  })

  // ---- Consolidated P&L ----
  const con = {
    rev:        Array(MONTHS).fill(0) as number[],
    cogs:       Array(MONTHS).fill(0) as number[],
    gp:         Array(MONTHS).fill(0) as number[],
    opex:       Array(MONTHS).fill(0) as number[],
    ebitda:     Array(MONTHS).fill(0) as number[],
    nbt:        Array(MONTHS).fill(0) as number[],
    tax:        Array(MONTHS).fill(0) as number[],
    npat:       Array(MONTHS).fill(0) as number[],
    // Actual consolidated (for months with approved actuals)
    actRev:     Array(MONTHS).fill(null) as (number|null)[],
    actCogs:    Array(MONTHS).fill(null) as (number|null)[],
    actEbitda:  Array(MONTHS).fill(null) as (number|null)[],
  }

  for (let m = 0; m < MONTHS; m++) {
    activeUnits.forEach(u => {
      const r = uc[u.id]
      con.rev[m]    += r.plan.rev[m]
      con.cogs[m]   += r.plan.cogs[m]
      con.gp[m]     += r.plan.gp[m]
      con.opex[m]   += r.totalOpex[m]
      con.ebitda[m] += r.finalEbitda[m]
      if (r.actual.rev[m]  !== null) { if (con.actRev[m]  === null) con.actRev[m]  = 0; (con.actRev[m]  as number) += r.actual.rev[m]  as number }
      if (r.actual.cogs[m] !== null) { if (con.actCogs[m] === null) con.actCogs[m] = 0; (con.actCogs[m] as number) += r.actual.cogs[m] as number }
    })
    con.nbt[m]  = con.ebitda[m]
    con.tax[m]  = con.nbt[m] > 0 ? con.nbt[m] * inputs.global.corporateTaxRate : 0
    con.npat[m] = con.nbt[m] - con.tax[m]
    if (con.actRev[m] !== null || con.actCogs[m] !== null) {
      const aRev  = con.actRev[m]  ?? con.rev[m]
      const aCogs = con.actCogs[m] ?? con.cogs[m]
      con.actEbitda[m] = aRev - aCogs - con.opex[m]
    }
  }

  // ---- Cash flow ----
  // Approved spending requests reduce cash directly in the month of approval
  const approvedCashOut = Array(MONTHS).fill(0) as number[]
  inputs.spendingRequests.filter(r => r.status === 'approved').forEach(r => {
    approvedCashOut[r.month] += r.amount
  })

  const irrigationOut = Array(MONTHS).fill(0) as number[]
  irrigationOut[0] = Math.round(fgeCount/2) * 8_000_000
  irrigationOut[1] = Math.ceil(fgeCount/2)  * 8_000_000

  const cap = inputs.capitalStructure
  const cf = {
    opCash: Array(MONTHS).fill(0) as number[],
    finCash:Array(MONTHS).fill(0) as number[],
    net:    Array(MONTHS).fill(0) as number[],
    open:   Array(MONTHS).fill(0) as number[],
    close:  Array(MONTHS).fill(0) as number[],
    irrigation: irrigationOut,
    approvedSpend: approvedCashOut,
  }
  cf.finCash[0] = cap.shareholderContribution + cap.grantNonRepayable + cap.grantRecoverable + cap.bankLoan
  for (let m = 0; m < MONTHS; m++) {
    cf.opCash[m] = con.npat[m] - irrigationOut[m] - approvedCashOut[m]
    cf.net[m]    = cf.opCash[m] + cf.finCash[m]
    cf.open[m]   = m === 0 ? inputs.global.openingCashBalance : cf.close[m-1]
    cf.close[m]  = cf.open[m] + cf.net[m]
  }

  // ---- Metrics ----
  const yr = (a:number[]) => a.reduce((s,v) => s+v, 0)
  const totRev = yr(con.rev)
  const metrics = {
    totalRevenue: totRev,
    totalGP:      yr(con.gp),
    totalEBITDA:  yr(con.ebitda),
    totalNPAT:    yr(con.npat),
    grossMargin:  totRev > 0 ? yr(con.gp)/totRev : 0,
    netMargin:    totRev > 0 ? yr(con.npat)/totRev : 0,
    minCash:      Math.min(...cf.close),
    minCashMonth: cf.close.indexOf(Math.min(...cf.close)) + 1,
    totalShared:  yr(sharedPool),
    irrigationTotal: yr(irrigationOut),
    approvedSpendTotal: yr(approvedCashOut),
    fgeCount,
    scenarioLabel: sc.label,
    pendingRequests: inputs.spendingRequests.filter(r => r.status === 'pending').length,
  }

  return {uc, con, cf, metrics, sharedPool, activeUnits}
}
