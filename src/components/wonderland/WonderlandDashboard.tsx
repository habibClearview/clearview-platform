// @ts-nocheck
'use client'
import { useState, useMemo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// ============================================================
// CLEARVIEW — WONDERLAND FARM SERVICES
// Ported from Clearview Planner artifact
// Supabase persistence replacing window.storage
// ============================================================

const MONTHS_HORIZON = 24
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function buildMonthLabels(modelStartDate) {
  const start = new Date(modelStartDate)
  const labels = []
  for (let i = 0; i < MONTHS_HORIZON; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    labels.push(`${MONTH_ABBR[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`)
  }
  return labels
}

function creditTermToMonths(creditTerm, cycleMonths) {
  if (!creditTerm) return cycleMonths
  if (creditTerm.unit === 'days') return creditTerm.value / 30.4
  if (creditTerm.unit === 'weeks') return creditTerm.value / 4.33
  if (creditTerm.unit === 'after_harvest') return cycleMonths
  if (creditTerm.unit === 'months') return creditTerm.value
  return cycleMonths
}

function wonderlandConfig() {
  return {
    meta: {
      businessName: 'Wonderland Farm Services',
      ownerName: 'Bernard',
      modelStartDate: '2026-06-01',
      currency: 'UGX',
      corporateTaxRate: 0.30,
      costOfCapital: 0.10,
      openingCashBeforeFinancing: 6_080_000,
    },
    units: [
      { id: 'input_shop', name: 'Input Shop', color: '#8B5E3C', short: 'Shop' },
      { id: 'fge', name: 'Farmer Group Enterprises (FGE)', color: '#5B7B3A', short: 'FGE' },
      { id: 'extension', name: 'Extension Services', color: '#C99A3B', short: 'Extension' },
      { id: 'farm', name: "Wonderland's Own Farm", color: '#6B6259', short: 'Farm' },
    ],
    productionLines: {
      tomatoes: { name: 'Tomatoes', yieldPerUnit: 70, allocationUnit: 'acre', outputUnit: 'Crates', farmgateBuyPrice: 200_000, marketSellPrice: 200_000, inputCreditPricePerAllocationUnit: 830_000, cycleMonths: 4 },
      onions: { name: 'Onions', yieldPerUnit: 10_000, allocationUnit: 'acre', outputUnit: 'kg', farmgateBuyPrice: 2_000, marketSellPrice: 2_000, inputCreditPricePerAllocationUnit: 945_000, cycleMonths: 5 },
    },
    revenueStreams: [
      { id: 'shop_seeds', unit: 'input_shop', name: 'Seeds & planting material', type: 'simple', monthlyAmount: 4_897_821, marginPct: 0.25, startMonth: 1, endMonth: null },
      { id: 'shop_fert', unit: 'input_shop', name: 'Fertilisers & soil amendments', type: 'simple', monthlyAmount: 7_836_513, marginPct: 0.22, startMonth: 1, endMonth: null },
      { id: 'shop_chem', unit: 'input_shop', name: 'Chemicals & pesticides', type: 'simple', monthlyAmount: 2_938_692, marginPct: 0.28, startMonth: 1, endMonth: null },
      { id: 'shop_equip', unit: 'input_shop', name: 'Equipment & tools', type: 'simple', monthlyAmount: 1_959_128, marginPct: 0.20, startMonth: 1, endMonth: null },
      { id: 'shop_consumables', unit: 'input_shop', name: 'Consumables & PPE', type: 'simple', monthlyAmount: 1_469_346, marginPct: 0.30, startMonth: 1, endMonth: null },
      { id: 'ext_external', unit: 'extension', name: 'External extension clients', type: 'simple', monthlyAmount: 11 * 80_000, marginPct: 1.0, startMonth: 2, endMonth: null },
      { id: 'ext_training', unit: 'extension', name: 'Training & advisory sessions', type: 'simple', monthlyAmount: 10 * 100_000, marginPct: 1.0, startMonth: 2, endMonth: null },
    ],
    counterpartyGroupDefaults: {
      relationshipType: 'input_credit_and_offtake',
      linkedUnit: 'fge',
      commissionPct: 0.10,
      defaultCreditTerm: { value: 14, unit: 'weeks' },
      inputSupplyMarginPct: 0.214,
    },
    counterpartyGroups: buildWonderlandFgeRoster(),
    staff: [
      { id: 's1', name: 'Project Coordinator', role: 'Project Coordinator', monthlyCost: 260_000, startMonth: 1, endMonth: null, timeSplit: { input_shop: 0, fge: 100, extension: 0, farm: 0, admin: 0 } },
      { id: 's2', name: 'Accounts Assistant (Agg)', role: 'Accounts Assistant', monthlyCost: 240_000, startMonth: 1, endMonth: null, timeSplit: { input_shop: 20, fge: 60, extension: 0, farm: 0, admin: 20 } },
      { id: 's3', name: 'Field Assistant 1', role: 'Field Assistant', monthlyCost: 550_000, startMonth: 1, endMonth: null, timeSplit: { input_shop: 0, fge: 70, extension: 30, farm: 0, admin: 0 } },
      { id: 's4', name: 'Field Assistant 2', role: 'Field Assistant', monthlyCost: 550_000, startMonth: 1, endMonth: null, timeSplit: { input_shop: 0, fge: 70, extension: 30, farm: 0, admin: 0 } },
      { id: 's5', name: 'Produce Marketing Cashier', role: 'Cashier', monthlyCost: 450_000, startMonth: 4, endMonth: null, timeSplit: { input_shop: 0, fge: 100, extension: 0, farm: 0, admin: 0 } },
      { id: 's6', name: 'Produce Marketing Assistant', role: 'Marketing Assistant', monthlyCost: 500_000, startMonth: 4, endMonth: null, timeSplit: { input_shop: 0, fge: 100, extension: 0, farm: 0, admin: 0 } },
      { id: 's7', name: 'Security 1', role: 'Security', monthlyCost: 350_000, startMonth: 4, endMonth: null, timeSplit: { input_shop: 40, fge: 60, extension: 0, farm: 0, admin: 0 } },
      { id: 's8', name: 'Security 2', role: 'Security', monthlyCost: 350_000, startMonth: 4, endMonth: null, timeSplit: { input_shop: 40, fge: 60, extension: 0, farm: 0, admin: 0 } },
      { id: 's9', name: 'Tricycle Operator', role: 'Tricycle Operator', monthlyCost: 400_000, startMonth: 4, endMonth: null, timeSplit: { input_shop: 50, fge: 50, extension: 0, farm: 0, admin: 0 } },
      { id: 's10', name: 'Farm Manager', role: 'Farm Manager', monthlyCost: 400_000, startMonth: 1, endMonth: null, timeSplit: { input_shop: 0, fge: 0, extension: 0, farm: 100, admin: 0 } },
      { id: 's11', name: 'Farm Labourers (x8)', role: 'Farm Labourer', monthlyCost: 2_400_000, startMonth: 1, endMonth: null, timeSplit: { input_shop: 0, fge: 0, extension: 0, farm: 100, admin: 0 } },
      { id: 's12', name: 'Managing Director', role: 'Managing Director', monthlyCost: 650_000, startMonth: 1, endMonth: null, timeSplit: { input_shop: 0, fge: 0, extension: 0, farm: 0, admin: 100 } },
      { id: 's13', name: 'Accounts Assistant (Central)', role: 'Accounts Assistant', monthlyCost: 550_000, startMonth: 1, endMonth: null, timeSplit: { input_shop: 0, fge: 0, extension: 0, farm: 0, admin: 100 } },
      { id: 's14', name: 'Input Operations Assistant', role: 'Input Ops Assistant', monthlyCost: 400_000, startMonth: 1, endMonth: null, timeSplit: { input_shop: 60, fge: 0, extension: 0, farm: 0, admin: 40 } },
    ],
    overheads: [
      { id: 'oh1', name: 'Office Rent - Business', monthlyAmount: 500_000, unit: 'fge', startMonth: 1, endMonth: null },
      { id: 'oh2', name: 'Fuel & Transport - FGE visits', monthlyAmount: 384_000, unit: 'fge', startMonth: 1, endMonth: null },
      { id: 'oh3', name: 'Input Delivery Cost', monthlyAmount: 200_000, unit: 'input_shop', startMonth: 1, endMonth: null },
      { id: 'oh4', name: 'R&M - Equipment', monthlyAmount: 300_000, unit: 'fge', startMonth: 1, endMonth: null },
      { id: 'oh5', name: 'Farm Rent / Land Access', monthlyAmount: 50_000, unit: 'farm', startMonth: 1, endMonth: null },
      { id: 'oh6', name: 'Irrigation - Own Farm', monthlyAmount: 30_000, unit: 'farm', startMonth: 1, endMonth: null },
      { id: 'oh7', name: 'Farm Tools & Maintenance', monthlyAmount: 40_000, unit: 'farm', startMonth: 1, endMonth: null },
      { id: 'oh8', name: 'Farm Staff Welfare', monthlyAmount: 40_000, unit: 'farm', startMonth: 1, endMonth: null },
      { id: 'oh9', name: 'Office Running Costs', monthlyAmount: 580_000, unit: 'admin', startMonth: 1, endMonth: null },
      { id: 'oh10', name: 'Communications & Data', monthlyAmount: 200_000, unit: 'admin', startMonth: 1, endMonth: null },
      { id: 'oh11', name: 'Professional Fees', monthlyAmount: 100_000, unit: 'admin', startMonth: 1, endMonth: null },
    ],
    capitalStructure: {
      shareholderContribution: 33_500_000,
      grants: [
        { id: 'csj_nonrepayable', name: 'CSJ Grant (Non-Repayable)', amount: 147_680_000, repayable: false },
        { id: 'csj_recoverable', name: 'CSJ Grant (Recoverable)', amount: 62_320_000, repayable: true,
          schedule: { instalments: [{ month: 3, amount: 10_000_000 },{ month: 4, amount: 10_000_000 },{ month: 5, amount: 42_320_000 }], deferralEnabled: true, deferredMonth: 5 },
          defaultForgivenessPct: 0.33 },
      ],
      loans: [],
      defaultAnnualInterestRate: 0.18,
      defaultLoanTenorYears: 2,
    },
    rollingFunds: [
      { id: 'irrigation_kit_fund', name: 'Irrigation Kit Fund', assetCostPerNewMember: 8_000_000, contributionPerMember: { amount: 4_000_000, periods: 2, periodLengthSource: 'firstProductionLineCycle' }, openingFundBalance: 0, contributionSource: 'external', appliesTo: 'counterpartyGroups' },
    ],
  }
}

function buildWonderlandFgeRoster() {
  const roster = []
  for (let i = 1; i <= 10; i++) {
    roster.push({ id: `fge_b1_${i}`, name: `FGE B1-${i}`, location: 'Batch 1 area', memberCount: 15, assetStatus: 'saving', recruitedMonth: 1, creditTerm: { value: 14, unit: 'weeks' }, allocationPeriods: [{ label: 'Season 1 (Cycle 1)', startMonth: 1, allocations: { tomatoes: 3, onions: 2 } }] })
  }
  for (let i = 1; i <= 10; i++) {
    roster.push({ id: `fge_b2_${i}`, name: `FGE B2-${i}`, location: 'Batch 2 area', memberCount: 15, assetStatus: 'saving', recruitedMonth: 2, creditTerm: { value: 14, unit: 'weeks' }, allocationPeriods: [{ label: 'Season 1 (Cycle 1)', startMonth: 2, allocations: { tomatoes: 3, onions: 2 } }] })
  }
  return roster
}

function currency(n, cc = 'UGX') {
  const v = Math.round(n || 0)
  const sign = v < 0 ? '-' : ''
  return `${sign}${cc} ${Math.abs(v).toLocaleString('en-US')}`
}

function compactCurrency(n, cc = 'UGX') {
  const v = Math.round(n || 0)
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}${cc} ${(abs/1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `${sign}${cc} ${(abs/1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}${cc} ${(abs/1_000).toFixed(0)}K`
  return `${sign}${cc} ${abs}`
}

function pct(n) { return `${(n*100).toFixed(1)}%` }

function isActiveInMonth(startMonth, endMonth, month) {
  if (month < (startMonth || 1)) return false
  if (endMonth && month > endMonth) return false
  return true
}

function applyScenario(config, scenario) {
  const overrides = scenario?.overrides || {}
  return {
    presetLabel: 'Base Case',
    productionLineOverrides: overrides.productionLineOverrides || {},
    marginMultiplier: overrides.marginMultiplier ?? 1,
    revenueStreamOverrides: overrides.revenueStreamOverrides || {},
    aggregationModel: overrides.aggregationModel ?? 'commission',
    commissionPctOverride: overrides.commissionPctOverride ?? null,
    globalCreditTermOverride: overrides.creditTerm ?? null,
    grantForgivenessOverrides: overrides.grantForgivenessOverrides || {},
    additionalStaff: overrides.additionalStaff || [],
    additionalGroups: overrides.additionalGroups || [],
    financingOverrides: overrides.financingOverrides || {},
    rollingFundOverrides: overrides.rollingFundOverrides || {},
  }
}

function runModel(config, scenario) {
  const s = applyScenario(config, scenario)
  const months = MONTHS_HORIZON
  const meta = config.meta

  const unit = {}
  config.units.forEach((u) => {
    unit[u.id] = { revenue: Array(months).fill(0), revenueLines: {}, cogs: Array(months).fill(0), cogsLines: {}, directOpex: Array(months).fill(0), staffCost: Array(months).fill(0), adminAllocated: Array(months).fill(0) }
  })

  function addRevenue(unitId, lineName, monthIdx, amount) {
    if (!unit[unitId] || monthIdx < 0 || monthIdx >= months || amount === 0) return
    unit[unitId].revenue[monthIdx] += amount
    unit[unitId].revenueLines[lineName] = unit[unitId].revenueLines[lineName] || Array(months).fill(0)
    unit[unitId].revenueLines[lineName][monthIdx] += amount
  }
  function addCogs(unitId, lineName, monthIdx, amount) {
    if (!unit[unitId] || monthIdx < 0 || monthIdx >= months || amount === 0) return
    unit[unitId].cogs[monthIdx] += amount
    unit[unitId].cogsLines[lineName] = unit[unitId].cogsLines[lineName] || Array(months).fill(0)
    unit[unitId].cogsLines[lineName][monthIdx] += amount
  }

  ;(config.revenueStreams || []).forEach((stream) => {
    const override = s.revenueStreamOverrides[stream.id] || {}
    const monthlyAmount = override.monthlyAmount ?? stream.monthlyAmount
    let marginPct = override.marginPct ?? stream.marginPct
    if (override.marginPct === undefined) marginPct = marginPct * s.marginMultiplier
    for (let m = 0; m < months; m++) {
      if (!isActiveInMonth(stream.startMonth, stream.endMonth, m + 1)) continue
      addRevenue(stream.unit, stream.name, m, monthlyAmount)
      const cost = monthlyAmount - monthlyAmount * marginPct
      if (cost !== 0) addCogs(stream.unit, `${stream.name} - Cost`, m, cost)
    }
  })

  const groupDefaults = config.counterpartyGroupDefaults || {}
  const allGroups = [...(config.counterpartyGroups || []), ...s.additionalGroups]
  const creditAdvances = Array(months).fill(0)
  const creditRepayments = Array(months).fill(0)
  const productionLineTotals = {}

  allGroups.forEach((group) => {
    const relType = group.relationshipType || groupDefaults.relationshipType
    const linkedUnit = group.linkedUnit || groupDefaults.linkedUnit
    const commissionPct = s.commissionPctOverride ?? (group.commissionPct ?? groupDefaults.commissionPct ?? 0)
    const creditTerm = s.globalCreditTermOverride || group.creditTerm || groupDefaults.defaultCreditTerm
    ;(group.allocationPeriods || []).forEach((period) => {
      const periodStart = period.startMonth
      Object.entries(period.allocations || {}).forEach(([lineId, allocUnits]) => {
        if (!allocUnits || allocUnits <= 0) return
        const lineBase = config.productionLines[lineId]
        if (!lineBase) return
        const lineOverride = s.productionLineOverrides[lineId] || {}
        const inputCreditPrice = lineOverride.inputCreditPricePerAllocationUnit ?? lineBase.inputCreditPricePerAllocationUnit
        const farmgateBuyPrice = lineOverride.farmgateBuyPrice ?? lineBase.farmgateBuyPrice
        const marketSellPrice = lineOverride.marketSellPrice ?? lineBase.marketSellPrice
        const yieldMult = lineOverride.yieldMultiplier ?? 1
        const effectiveYield = lineBase.yieldPerUnit * yieldMult
        const cycleMonths = lineBase.cycleMonths
        productionLineTotals[lineId] = productionLineTotals[lineId] || { volume: Array(months).fill(0) }

        if (relType === 'input_credit_and_offtake') {
          const advanceAmount = allocUnits * inputCreditPrice
          const advanceMonthIdx = periodStart - 1
          if (advanceMonthIdx >= 0 && advanceMonthIdx < months) {
            creditAdvances[advanceMonthIdx] += advanceAmount
            addRevenue(linkedUnit, `${lineBase.name} Input Supply Revenue`, advanceMonthIdx, advanceAmount)
            const inputMarginPct = groupDefaults.inputSupplyMarginPct ?? 0.214
            addCogs(linkedUnit, `${lineBase.name} Input Procurement Cost`, advanceMonthIdx, advanceAmount * (1 - inputMarginPct))
          }
          const harvestMonth = periodStart + cycleMonths - 1
          const harvestMonthIdx = harvestMonth - 1
          const termMonths = creditTermToMonths(creditTerm, cycleMonths)
          let repaymentMonth = Math.round(periodStart - 1 + termMonths) + 1
          repaymentMonth = Math.max(repaymentMonth, harvestMonth)
          repaymentMonth = Math.min(repaymentMonth, months)
          const repaymentMonthIdx = repaymentMonth - 1
          if (repaymentMonthIdx >= 0 && repaymentMonthIdx < months && advanceMonthIdx >= 0 && advanceMonthIdx < months) {
            creditRepayments[repaymentMonthIdx] += advanceAmount
          }
          const volume = allocUnits * effectiveYield
          const farmgateValue = volume * farmgateBuyPrice
          const marketValue = volume * marketSellPrice
          if (harvestMonthIdx >= 0 && harvestMonthIdx < months) {
            productionLineTotals[lineId].volume[harvestMonthIdx] += volume
            if (s.aggregationModel === 'commission') {
              addRevenue(linkedUnit, `${lineBase.name} Aggregation Commission`, harvestMonthIdx, farmgateValue * commissionPct)
            } else if (s.aggregationModel === 'spread') {
              addRevenue(linkedUnit, `${lineBase.name} Produce Sales`, harvestMonthIdx, marketValue)
              addCogs(linkedUnit, `${lineBase.name} Produce Purchase Cost`, harvestMonthIdx, farmgateValue * (1 - commissionPct))
            } else {
              addRevenue(linkedUnit, `${lineBase.name} Aggregation Commission`, harvestMonthIdx, farmgateValue * commissionPct)
              addRevenue(linkedUnit, `${lineBase.name} Produce Sales`, harvestMonthIdx, marketValue)
              addCogs(linkedUnit, `${lineBase.name} Produce Purchase Cost`, harvestMonthIdx, farmgateValue * (1 - commissionPct))
            }
          }
        }
      })
    })
  })

  const creditReceivables = Array(months).fill(0)
  let cumAdv = 0, cumRep = 0
  for (let m = 0; m < months; m++) {
    cumAdv += creditAdvances[m]; cumRep += creditRepayments[m]
    creditReceivables[m] = Math.max(0, cumAdv - cumRep)
  }

  const allStaff = [...(config.staff || []), ...s.additionalStaff]
  const adminStaffCost = Array(months).fill(0)
  const unitIds = config.units.map((u) => u.id)

  allStaff.forEach((person) => {
    const split = person.timeSplit || {}
    const adminPct = split.admin || 0
    for (let m = 0; m < months; m++) {
      if (!isActiveInMonth(person.startMonth, person.endMonth, m + 1)) continue
      unitIds.forEach((id) => { unit[id].staffCost[m] += person.monthlyCost * ((split[id] || 0) / 100) })
      adminStaffCost[m] += person.monthlyCost * (adminPct / 100)
    }
  })

  const adminOverheadCost = Array(months).fill(0)
  ;(config.overheads || []).forEach((ov) => {
    for (let m = 0; m < months; m++) {
      if (!isActiveInMonth(ov.startMonth, ov.endMonth, m + 1)) continue
      if (ov.unit === 'admin') adminOverheadCost[m] += ov.monthlyAmount
      else if (unit[ov.unit]) unit[ov.unit].directOpex[m] += ov.monthlyAmount
    }
  })

  const totalAdminCost = Array(months).fill(0)
  for (let m = 0; m < months; m++) totalAdminCost[m] = adminStaffCost[m] + adminOverheadCost[m]
  for (let m = 0; m < months; m++) {
    const totalOpStaffCost = unitIds.reduce((sum, id) => sum + unit[id].staffCost[m], 0)
    unitIds.forEach((id) => {
      const share = totalOpStaffCost > 0 ? unit[id].staffCost[m] / totalOpStaffCost : 1 / unitIds.length
      unit[id].adminAllocated[m] = totalAdminCost[m] * share
    })
  }

  unitIds.forEach((id) => {
    const u = unit[id]
    u.grossProfit = Array(months).fill(0)
    u.totalOpex = Array(months).fill(0)
    u.ebitda = Array(months).fill(0)
    for (let m = 0; m < months; m++) {
      u.grossProfit[m] = u.revenue[m] - u.cogs[m]
      u.totalOpex[m] = u.directOpex[m] + u.staffCost[m] + u.adminAllocated[m]
      u.ebitda[m] = u.grossProfit[m] - u.totalOpex[m]
    }
  })

  const consolidated = { revenue: Array(months).fill(0), cogs: Array(months).fill(0), grossProfit: Array(months).fill(0), opex: Array(months).fill(0), ebitda: Array(months).fill(0), interest: Array(months).fill(0), nptBeforeTax: Array(months).fill(0), tax: Array(months).fill(0), nptAfterTax: Array(months).fill(0) }
  for (let m = 0; m < months; m++) {
    unitIds.forEach((id) => {
      consolidated.revenue[m] += unit[id].revenue[m]
      consolidated.cogs[m] += unit[id].cogs[m]
      consolidated.grossProfit[m] += unit[id].grossProfit[m]
      consolidated.opex[m] += unit[id].totalOpex[m]
      consolidated.ebitda[m] += unit[id].ebitda[m]
    })
  }

  const cap = config.capitalStructure || {}
  const loans = [...(cap.loans || [])]
  if (s.financingOverrides.bankLoan) {
    loans.push({ id: 'scenario_loan', amount: s.financingOverrides.bankLoan, annualInterestRate: s.financingOverrides.annualInterestRate ?? cap.defaultAnnualInterestRate ?? 0, tenorYears: s.financingOverrides.loanTenorYears ?? cap.defaultLoanTenorYears ?? 1, startMonth: s.financingOverrides.loanStartMonth ?? 1 })
  }

  const loanInterestByMonth = Array(months).fill(0)
  const loanPrincipalByMonth = Array(months).fill(0)
  const loanDrawdownByMonth = Array(months).fill(0)
  const loanBalances = {}

  loans.forEach((loan) => {
    const startIdx = (loan.startMonth || 1) - 1
    if (startIdx >= 0 && startIdx < months) loanDrawdownByMonth[startIdx] += loan.amount
    const monthlyRate = (loan.annualInterestRate || 0) / 12
    const tenorMonths = (loan.tenorYears || 1) * 12
    const monthlyPrincipal = tenorMonths > 0 ? loan.amount / tenorMonths : 0
    let balance = loan.amount
    for (let m = startIdx; m < months; m++) {
      if (m < 0 || balance <= 0) continue
      loanInterestByMonth[m] += balance * monthlyRate
      const principal = Math.min(monthlyPrincipal, balance)
      loanPrincipalByMonth[m] += principal
      balance -= principal
    }
    loanBalances[loan.id] = { startIdx, amount: loan.amount, monthlyPrincipal, tenorMonths }
  })

  for (let m = 0; m < months; m++) consolidated.interest[m] = loanInterestByMonth[m]

  const grants = cap.grants || []
  const grantRepaymentByMonth = Array(months).fill(0)
  const grantForgivenessGainByMonth = Array(months).fill(0)
  const grantInflowByMonth = Array(months).fill(0)
  const grantState = {}
  grants.forEach((g) => { grantInflowByMonth[0] += g.amount })

  grants.forEach((grant) => {
    if (!grant.repayable) { grantState[grant.id] = { totalAmount: grant.amount, netRepayable: 0, forgivenAmount: 0, repayable: false }; return }
    const forgivenessPct = s.grantForgivenessOverrides[grant.id] ?? grant.defaultForgivenessPct ?? 0
    const netRepayable = grant.amount * (1 - forgivenessPct)
    const forgivenAmount = grant.amount - netRepayable
    grantState[grant.id] = { totalAmount: grant.amount, netRepayable, forgivenAmount, repayable: true, forgivenessPct }
    const schedule = grant.schedule
    if (schedule) {
      const totalScheduled = schedule.instalments.reduce((sum, i) => sum + i.amount, 0)
      schedule.instalments.forEach((inst) => {
        const share = totalScheduled > 0 ? inst.amount / totalScheduled : 0
        const month = schedule.deferralEnabled ? schedule.deferredMonth : inst.month
        if (month >= 1 && month <= months) {
          grantRepaymentByMonth[month-1] += netRepayable * share
          grantForgivenessGainByMonth[month-1] += forgivenAmount * share
        }
      })
    }
  })

  for (let m = 0; m < months; m++) {
    consolidated.nptBeforeTax[m] = consolidated.ebitda[m] - consolidated.interest[m]
    consolidated.tax[m] = consolidated.nptBeforeTax[m] > 0 ? consolidated.nptBeforeTax[m] * (meta.corporateTaxRate || 0) : 0
    consolidated.nptAfterTax[m] = consolidated.nptBeforeTax[m] - consolidated.tax[m] + grantForgivenessGainByMonth[m]
  }
  consolidated.grantForgivenessGain = grantForgivenessGainByMonth
  consolidated.grantState = grantState

  const rollingFundResults = {}
  const wonderlandLoanOutflowsTotal = Array(months).fill(0)
  const wonderlandLoanRepaymentsTotal = Array(months).fill(0)

  ;(config.rollingFunds || []).forEach((fund) => {
    const fundOverride = s.rollingFundOverrides[fund.id] || {}
    const contributionSource = fundOverride.contributionSource ?? fund.contributionSource ?? 'external'
    const wonderlandLoans = fundOverride.wonderlandLoans || []
    const fundContributions = Array(months).fill(0)
    const fundDisbursements = Array(months).fill(0)
    const wonderlandLoanOutflows = Array(months).fill(0)
    const wonderlandLoanRepayments = Array(months).fill(0)

    if (fund.appliesTo === 'counterpartyGroups') {
      ;(config.counterpartyGroups || []).forEach((group) => {
        const recruitMonthIdx = Math.max(0, (group.recruitedMonth || 1) - 1)
        let periodLengthMonths = 4
        const firstPeriod = (group.allocationPeriods || [])[0]
        if (firstPeriod && fund.contributionPerMember.periodLengthSource === 'firstProductionLineCycle') {
          const lineIds = Object.keys(firstPeriod.allocations || {})
          if (lineIds.length > 0 && config.productionLines[lineIds[0]]) periodLengthMonths = config.productionLines[lineIds[0]].cycleMonths
        }
        for (let period = 0; period < fund.contributionPerMember.periods; period++) {
          const contribMonthIdx = recruitMonthIdx + period * periodLengthMonths + (periodLengthMonths - 1)
          if (contribMonthIdx >= 0 && contribMonthIdx < months) fundContributions[contribMonthIdx] += fund.contributionPerMember.amount
        }
      })
    }

    wonderlandLoans.forEach((loan) => {
      const loanMonthIdx = Math.max(0, (loan.month || 1) - 1)
      if (loanMonthIdx < months) { wonderlandLoanOutflows[loanMonthIdx] += loan.amount; fundContributions[loanMonthIdx] += loan.amount }
      if (loan.repaymentMonth) {
        const repayIdx = Math.max(0, loan.repaymentMonth - 1)
        if (repayIdx < months) { wonderlandLoanRepayments[repayIdx] += loan.amount; fundDisbursements[repayIdx] += loan.amount }
      }
    })

    const fundShortfallMonths = []
    let runningFundBalance = fund.openingFundBalance || 0
    const fundBalanceByMonth = Array(months).fill(0)

    if (fund.appliesTo === 'counterpartyGroups') {
      const newMemberAssetNeeds = Array(months).fill(0)
      s.additionalGroups.forEach((group) => {
        const recruitMonthIdx = Math.max(0, (group.recruitedMonth || 1) - 1)
        if (recruitMonthIdx < months) newMemberAssetNeeds[recruitMonthIdx] += fund.assetCostPerNewMember
      })
      for (let m = 0; m < months; m++) {
        runningFundBalance += fundContributions[m]
        runningFundBalance -= fundDisbursements[m]
        if (newMemberAssetNeeds[m] > 0) {
          if (runningFundBalance >= newMemberAssetNeeds[m]) { runningFundBalance -= newMemberAssetNeeds[m]; fundDisbursements[m] += newMemberAssetNeeds[m] }
          else { fundShortfallMonths.push({ month: m+1, shortfall: newMemberAssetNeeds[m] - runningFundBalance }); fundDisbursements[m] += runningFundBalance; runningFundBalance = 0 }
        }
        fundBalanceByMonth[m] = runningFundBalance
      }
    }

    rollingFundResults[fund.id] = { name: fund.name, fundBalanceByMonth, fundContributions, fundDisbursements, fundShortfallMonths, contributionSource }
    for (let m = 0; m < months; m++) { wonderlandLoanOutflowsTotal[m] += wonderlandLoanOutflows[m]; wonderlandLoanRepaymentsTotal[m] += wonderlandLoanRepayments[m] }
  })

  const cashFlow = { operatingCash: Array(months).fill(0), investingCash: Array(months).fill(0), financingCash: Array(months).fill(0), netChange: Array(months).fill(0), openingCash: Array(months).fill(0), closingCash: Array(months).fill(0), workingCapitalMovement: Array(months).fill(0) }

  let prevReceivable = 0
  for (let m = 0; m < months; m++) { cashFlow.workingCapitalMovement[m] = -(creditReceivables[m] - prevReceivable); prevReceivable = creditReceivables[m] }
  for (let m = 0; m < months; m++) cashFlow.operatingCash[m] = consolidated.nptAfterTax[m] - grantForgivenessGainByMonth[m] + cashFlow.workingCapitalMovement[m]
  for (let m = 0; m < months; m++) { cashFlow.investingCash[m] -= wonderlandLoanOutflowsTotal[m]; cashFlow.investingCash[m] += wonderlandLoanRepaymentsTotal[m] }

  cashFlow.financingCash[0] += cap.shareholderContribution || 0
  for (let m = 0; m < months; m++) {
    cashFlow.financingCash[m] += grantInflowByMonth[m]
    cashFlow.financingCash[m] -= grantRepaymentByMonth[m]
    cashFlow.financingCash[m] += loanDrawdownByMonth[m]
    cashFlow.financingCash[m] -= loanPrincipalByMonth[m]
  }
  for (let m = 0; m < months; m++) {
    cashFlow.netChange[m] = cashFlow.operatingCash[m] + cashFlow.investingCash[m] + cashFlow.financingCash[m]
    cashFlow.openingCash[m] = m === 0 ? meta.openingCashBeforeFinancing : cashFlow.closingCash[m-1]
    cashFlow.closingCash[m] = cashFlow.openingCash[m] + cashFlow.netChange[m]
  }

  const balanceSheet = { loanToRollingFunds: Array(months).fill(0), cash: cashFlow.closingCash, creditReceivables, totalAssets: Array(months).fill(0), shareCapital: Array(months).fill(0), grantEquity: Array(months).fill(0), retainedEarnings: Array(months).fill(0), totalEquity: Array(months).fill(0), grantsOutstanding: Array(months).fill(0), loansOutstanding: Array(months).fill(0), totalLiabilities: Array(months).fill(0) }

  let cumNPAT = 0, cumLoanToFund = 0
  const cumGrantRepaid = {}
  const cumGrantForgiven = {}
  grants.forEach((g) => { cumGrantRepaid[g.id] = 0; cumGrantForgiven[g.id] = 0 })
  const repayableGrants = grants.filter((g) => g.repayable)
  const totalRepayableAmount = repayableGrants.reduce((sum, g) => sum + g.amount, 0)
  const nonRepayableTotal = grants.filter((g) => !g.repayable).reduce((sum, g) => sum + g.amount, 0)
  const loanBal2 = {}
  loans.forEach((l) => { loanBal2[l.id] = l.amount })

  for (let m = 0; m < months; m++) {
    cumLoanToFund += wonderlandLoanOutflowsTotal[m] - wonderlandLoanRepaymentsTotal[m]
    balanceSheet.loanToRollingFunds[m] = Math.max(0, cumLoanToFund)
    cumNPAT += consolidated.nptAfterTax[m]
    balanceSheet.retainedEarnings[m] = cumNPAT + (meta.openingCashBeforeFinancing || 0)
    balanceSheet.shareCapital[m] = cap.shareholderContribution || 0
    balanceSheet.grantEquity[m] = nonRepayableTotal
    balanceSheet.totalEquity[m] = balanceSheet.shareCapital[m] + balanceSheet.grantEquity[m] + balanceSheet.retainedEarnings[m]
    let grantsOutstanding = 0
    repayableGrants.forEach((g) => {
      const share = totalRepayableAmount > 0 ? g.amount / totalRepayableAmount : 0
      cumGrantRepaid[g.id] += grantRepaymentByMonth[m] * share
      cumGrantForgiven[g.id] += grantForgivenessGainByMonth[m] * share
      grantsOutstanding += Math.max(0, g.amount - cumGrantRepaid[g.id] - cumGrantForgiven[g.id])
    })
    balanceSheet.grantsOutstanding[m] = grantsOutstanding
    balanceSheet.loansOutstanding[m] = loans.length > 0 ? Object.values(loanBal2).reduce((s,v)=>s+Math.max(0,v),0) : 0
    balanceSheet.totalAssets[m] = balanceSheet.loanToRollingFunds[m] + balanceSheet.cash[m] + balanceSheet.creditReceivables[m]
    balanceSheet.totalLiabilities[m] = balanceSheet.grantsOutstanding[m] + balanceSheet.loansOutstanding[m]
  }

  const year1 = (arr) => arr.slice(0,12).reduce((a,b)=>a+b,0)
  const year2 = (arr) => arr.slice(12,24).reduce((a,b)=>a+b,0)
  const metrics = {
    year1Revenue: year1(consolidated.revenue), year1GrossProfit: year1(consolidated.grossProfit), year1EBITDA: year1(consolidated.ebitda), year1NPAT: year1(consolidated.nptAfterTax),
    year2Revenue: year2(consolidated.revenue), year2GrossProfit: year2(consolidated.grossProfit), year2EBITDA: year2(consolidated.ebitda), year2NPAT: year2(consolidated.nptAfterTax),
    grossMarginY1: year1(consolidated.revenue) !== 0 ? year1(consolidated.grossProfit)/year1(consolidated.revenue) : 0,
    netMarginY1: year1(consolidated.revenue) !== 0 ? year1(consolidated.nptAfterTax)/year1(consolidated.revenue) : 0,
    maxWorkingCapitalRequirement: Math.max(...creditReceivables),
    avgWorkingCapitalRequirement: creditReceivables.reduce((a,b)=>a+b,0)/months,
    minCashBalance: Math.min(...cashFlow.closingCash),
    minCashMonth: cashFlow.closingCash.indexOf(Math.min(...cashFlow.closingCash))+1,
    totalCounterpartyGroups: allGroups.length,
    grantState,
  }

  return { scenario: s, counterpartyGroups: allGroups, unit, consolidated, cashFlow, balanceSheet, workingCapitalRequirement: creditReceivables, creditReceivables, rollingFunds: rollingFundResults, productionLineTotals, metrics }
}

// ─── UI ──────────────────────────────────────────────────────
const CC = { navy:'#1B2A4A', cyan:'#00B4D8', cream:'#F8F4EE', white:'#FFFFFF', slate:'#4A5A6A', border:'#D8E0E8', teal:'#1A9DAA', red:'#C0392B', green:'#1A7A4A', amber:'#B8860B' }

function HeroCard({label,value,sub,color}){
  return(
    <div style={{background:CC.white,border:`1px solid ${CC.border}`,borderRadius:6,padding:'1rem 1.1rem'}}>
      <div style={{fontFamily:'monospace',fontSize:'0.65rem',letterSpacing:'0.1em',color:CC.slate,textTransform:'uppercase',marginBottom:'0.35rem'}}>{label}</div>
      <div style={{fontFamily:'Georgia,serif',fontSize:'1.35rem',fontWeight:700,color:color||CC.navy,marginBottom:'0.2rem'}}>{value}</div>
      {sub&&<div style={{fontSize:'0.74rem',color:CC.slate}}>{sub}</div>}
    </div>
  )
}

function MonthlyTable({title,rows,months,footnote}){
  return(
    <div style={{background:CC.white,border:`1px solid ${CC.border}`,borderRadius:6,padding:'1rem 1.1rem',marginBottom:'1.25rem'}}>
      {title&&<div style={{fontFamily:'Georgia,serif',fontSize:'1rem',fontWeight:700,marginBottom:'0.8rem',color:CC.navy}}>{title}</div>}
      <div style={{overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.75rem',fontFamily:'monospace'}}>
          <thead><tr><th style={{textAlign:'left',padding:'0.3rem 0.5rem',borderBottom:`1px solid ${CC.border}`,minWidth:180,fontFamily:"'Segoe UI',system-ui,sans-serif",fontSize:'0.78rem'}}></th>
            {months.map((m,i)=><th key={i} style={{textAlign:'right',padding:'0.3rem 0.5rem',color:CC.slate,fontWeight:500,borderBottom:`1px solid ${CC.border}`,whiteSpace:'nowrap'}}>{m}</th>)}
          </tr></thead>
          <tbody>{rows.map((row,ri)=>(
            <tr key={ri} style={{background:row.highlight?'#EBF8FF':undefined}}>
              <td style={{textAlign:'left',padding:'0.28rem 0.5rem',borderBottom:`1px solid #F0F4F8`,fontFamily:"'Segoe UI',system-ui,sans-serif",fontSize:'0.8rem',fontWeight:row.bold?700:400}}>{row.label}</td>
              {row.values.map((v,vi)=><td key={vi} style={{textAlign:'right',padding:'0.28rem 0.5rem',borderBottom:`1px solid #F0F4F8`,fontWeight:row.bold?700:400,color:v<0?CC.red:CC.navy,whiteSpace:'nowrap'}}>{compactCurrency(v,row.cc)}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {footnote&&<div style={{marginTop:'0.6rem',fontSize:'0.74rem',color:CC.slate,lineHeight:1.4}}>{footnote}</div>}
    </div>
  )
}

function Flag({type,children}){
  const color=type==='warn'?CC.red:type==='ok'?CC.green:CC.amber
  return(
    <div style={{display:'flex',alignItems:'flex-start',gap:'0.5rem',fontSize:'0.84rem',lineHeight:1.5}}>
      <span style={{width:8,height:8,borderRadius:'50%',background:color,marginTop:'0.45rem',flexShrink:0,display:'inline-block'}}/>
      <span>{children}</span>
    </div>
  )
}

function defaultOverrides(){
  return { aggregationModel:'commission', commissionPctOverride:0.10, grantForgivenessOverrides:{csj_recoverable:0.33}, creditTerm:null, additionalStaff:[], additionalGroups:[], financingOverrides:{}, rollingFundOverrides:{}, productionLineOverrides:{} }
}

export default function WonderlandDashboard(){
  const config = useMemo(()=>wonderlandConfig(),[])
  const monthLabels = useMemo(()=>buildMonthLabels(config.meta.modelStartDate),[config])
  const cc = config.meta.currency

  const [overrides,setOverrides] = useState(defaultOverrides())
  const [view,setView] = useState('overview')
  const [activeUnit,setActiveUnit] = useState('fge')
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)

  // Load saved overrides from Supabase
  useEffect(()=>{
    async function load(){
      try{
        const {data:{user}} = await supabase.auth.getUser()
        if(user){
          const {data} = await supabase.from('model_config').select('config_data').eq('client_id','client_wonderland').eq('config_type','scenario_overrides').single()
          if(data?.config_data) setOverrides({...defaultOverrides(),...data.config_data})
        }
      }catch(e){}
      finally{ setLoading(false) }
    }
    load()
  },[])

  async function persist(nextOverrides){
    setOverrides(nextOverrides)
    setSaving(true)
    try{
      await supabase.from('model_config').upsert({ client_id:'client_wonderland', config_type:'scenario_overrides', config_data:nextOverrides, updated_at:new Date().toISOString() },{ onConflict:'client_id,config_type' })
    }catch(e){}
    setSaving(false)
  }

  const baseOverrides = useMemo(()=>({aggregationModel:'commission',commissionPctOverride:0.10,grantForgivenessOverrides:{csj_recoverable:0.33}}),[])
  const result = useMemo(()=>runModel(config,{overrides}),[config,overrides])
  const baseResult = useMemo(()=>runModel(config,{overrides:baseOverrides}),[config,baseOverrides])

  if(loading) return <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",padding:'3rem',color:CC.navy,background:CC.cream,minHeight:'100vh'}}>Loading Wonderland…</div>

  const {consolidated,metrics} = result

  const navItems = [['overview','Overview'],['units','Business Units'],['cashflow','Cash Flow'],['workingcapital','Working Capital'],['balancesheet','Balance Sheet'],['fges','FGE Roster'],['scenarios','Scenario Builder']]

  return(
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:CC.cream,color:CC.navy,minHeight:'100vh'}}>
      <header style={{background:CC.navy,borderBottom:`3px solid ${CC.cyan}`}}>
        <div style={{maxWidth:1400,margin:'0 auto',padding:'1.25rem 1.5rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'1rem',marginBottom:'1rem'}}>
            <div>
              <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.15em',color:CC.cyan,marginBottom:'0.25rem'}}>CANVAS COACH — CLEARVIEW PLANNER</div>
              <h1 style={{fontFamily:'Georgia,serif',fontSize:'1.5rem',fontWeight:700,color:CC.white,margin:'0 0 0.18rem'}}>Wonderland Farm Services</h1>
              <div style={{fontSize:'0.77rem',color:'rgba(255,255,255,0.6)'}}>Multi-unit agri-aggregator · 24-month projection · {saving?'Saving…':'All data saved'}</div>
            </div>
            <div style={{background:'rgba(255,255,255,0.1)',border:'1px solid rgba(0,180,216,0.4)',borderRadius:6,padding:'0.7rem 1rem',textAlign:'right'}}>
              <div style={{fontFamily:'monospace',fontSize:'0.62rem',color:CC.cyan,letterSpacing:'0.1em',marginBottom:'0.22rem'}}>YEAR 1 REVENUE</div>
              <div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:CC.white}}>{compactCurrency(metrics.year1Revenue,cc)}</div>
              <div style={{fontSize:'0.72rem',color:'rgba(255,255,255,0.6)',marginTop:'0.15rem'}}>EBITDA {compactCurrency(metrics.year1EBITDA,cc)}</div>
            </div>
          </div>
          <nav style={{display:'flex',gap:'0.3rem',flexWrap:'wrap'}}>
            {navItems.map(([id,label])=>(
              <button key={id} onClick={()=>setView(id)} style={{fontFamily:'monospace',fontSize:'0.7rem',padding:'0.5rem 0.9rem',border:'none',background:'transparent',color:view===id?CC.cyan:'rgba(255,255,255,0.55)',cursor:'pointer',borderBottom:view===id?`2px solid ${CC.cyan}`:'2px solid transparent',fontWeight:view===id?700:400}}>{label}</button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{maxWidth:1400,margin:'0 auto',padding:'1.5rem'}}>

        {view==='overview'&&(
          <div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
              <HeroCard label="Year 1 Revenue" value={compactCurrency(metrics.year1Revenue,cc)} sub={`Gross margin ${pct(metrics.grossMarginY1)}`}/>
              <HeroCard label="Year 1 EBITDA" value={compactCurrency(metrics.year1EBITDA,cc)} color={metrics.year1EBITDA>=0?CC.green:CC.red} sub={`Net profit ${compactCurrency(metrics.year1NPAT,cc)}`}/>
              <HeroCard label="Year 2 Revenue" value={compactCurrency(metrics.year2Revenue,cc)} sub={`EBITDA ${compactCurrency(metrics.year2EBITDA,cc)}`}/>
              <HeroCard label="FGE Count" value={metrics.totalCounterpartyGroups}/>
              <HeroCard label="Min Cash (24mo)" value={compactCurrency(metrics.minCashBalance,cc)} color={metrics.minCashBalance<0?CC.red:CC.navy} sub={`Month ${metrics.minCashMonth}`}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
              {config.units.map((u)=>{
                const ud=result.unit[u.id]
                const y1Rev=ud.revenue.slice(0,12).reduce((a,b)=>a+b,0)
                const y1Ebitda=ud.ebitda.slice(0,12).reduce((a,b)=>a+b,0)
                return(<div key={u.id} style={{background:CC.white,border:`1px solid ${CC.border}`,borderTop:`4px solid ${u.color}`,borderRadius:6,padding:'1rem 1.1rem'}}>
                  <div style={{fontWeight:700,fontSize:'0.88rem',marginBottom:'0.35rem'}}>{u.name}</div>
                  <div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:y1Ebitda>=0?CC.green:CC.red,marginBottom:'0.2rem'}}>{compactCurrency(y1Ebitda,cc)}</div>
                  <div style={{fontSize:'0.74rem',color:CC.slate}}>Y1 EBITDA · Rev {compactCurrency(y1Rev,cc)}</div>
                </div>)
              })}
            </div>
            <div style={{background:CC.navy,borderRadius:8,padding:'1rem 1.25rem',marginBottom:'1.5rem',display:'flex',flexDirection:'column',gap:'0.55rem'}}>
              <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.12em',color:CC.cyan,marginBottom:'0.35rem'}}>READING THE PICTURE</div>
              {metrics.minCashBalance<0?<Flag type="warn">Cash goes negative at {currency(metrics.minCashBalance,cc)} in Month {metrics.minCashMonth}.</Flag>:<Flag type="ok">Cash stays positive throughout — lowest point {currency(metrics.minCashBalance,cc)}.</Flag>}
              {metrics.year1EBITDA<0?<Flag type="warn">Year 1 EBITDA is negative at {currency(metrics.year1EBITDA,cc)}.</Flag>:<Flag type="ok">Year 1 EBITDA positive at {currency(metrics.year1EBITDA,cc)} — gross margin {pct(metrics.grossMarginY1)}.</Flag>}
              <Flag type="info">Average working capital tied in FGE input credit: {currency(metrics.avgWorkingCapitalRequirement,cc)}, peaking at {currency(metrics.maxWorkingCapitalRequirement,cc)}.</Flag>
            </div>
            <MonthlyTable title="Consolidated P&L — Year 1" rows={[
              {label:'Revenue',values:consolidated.revenue.slice(0,12),cc},{label:'Cost of Sales',values:consolidated.cogs.slice(0,12),cc},
              {label:'Gross Profit',values:consolidated.grossProfit.slice(0,12),bold:true,cc},{label:'Operating Expenses',values:consolidated.opex.slice(0,12),cc},
              {label:'EBITDA',values:consolidated.ebitda.slice(0,12),bold:true,cc},{label:'Grant Forgiveness Gain',values:consolidated.grantForgivenessGain.slice(0,12),cc},
              {label:'Net Profit After Tax',values:consolidated.nptAfterTax.slice(0,12),bold:true,highlight:true,cc},
            ]} months={monthLabels.slice(0,12)}/>
          </div>
        )}

        {view==='units'&&(
          <div>
            <div style={{display:'flex',gap:'0.5rem',marginBottom:'1.25rem',flexWrap:'wrap'}}>
              {config.units.map((u)=><button key={u.id} onClick={()=>setActiveUnit(u.id)} style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.45rem 0.9rem',border:`2px solid ${activeUnit===u.id?u.color:CC.border}`,borderRadius:4,background:activeUnit===u.id?CC.navy:CC.white,color:activeUnit===u.id?CC.white:CC.slate,cursor:'pointer'}}>{u.short}</button>)}
            </div>
            {(()=>{
              const u=result.unit[activeUnit]
              const unitMeta=config.units.find(x=>x.id===activeUnit)
              const y1Rev=u.revenue.slice(0,12).reduce((a,b)=>a+b,0)
              const y1GP=u.grossProfit.slice(0,12).reduce((a,b)=>a+b,0)
              const y1Opex=u.totalOpex.slice(0,12).reduce((a,b)=>a+b,0)
              const y1Ebitda=u.ebitda.slice(0,12).reduce((a,b)=>a+b,0)
              return(<>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
                  <HeroCard label="Year 1 Revenue" value={compactCurrency(y1Rev,cc)}/>
                  <HeroCard label="Year 1 Gross Profit" value={compactCurrency(y1GP,cc)} sub={y1Rev!==0?`Margin ${pct(y1GP/y1Rev)}`:''}/>
                  <HeroCard label="Year 1 Opex" value={compactCurrency(y1Opex,cc)}/>
                  <HeroCard label="Year 1 EBITDA" value={compactCurrency(y1Ebitda,cc)} color={y1Ebitda>=0?CC.green:CC.red}/>
                </div>
                {Object.keys(u.revenueLines).length>0&&<MonthlyTable title={`${unitMeta.name} — Revenue lines (Year 1)`} rows={Object.entries(u.revenueLines).map(([name,values])=>({label:name,values:values.slice(0,12),cc}))} months={monthLabels.slice(0,12)}/>}
                <MonthlyTable title={`${unitMeta.name} — Full P&L (Year 1)`} rows={[
                  {label:'Revenue',values:u.revenue.slice(0,12),cc},{label:'Cost of Sales',values:u.cogs.slice(0,12),cc},
                  {label:'Gross Profit',values:u.grossProfit.slice(0,12),bold:true,cc},{label:'Staff Cost',values:u.staffCost.slice(0,12),cc},
                  {label:'Admin Allocated',values:u.adminAllocated.slice(0,12),cc},{label:'Direct Opex',values:u.directOpex.slice(0,12),cc},
                  {label:'EBITDA',values:u.ebitda.slice(0,12),bold:true,highlight:true,cc},
                ]} months={monthLabels.slice(0,12)}/>
              </>)
            })()}
          </div>
        )}

        {view==='cashflow'&&(
          <div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
              <HeroCard label="Opening Cash" value={compactCurrency(result.cashFlow.openingCash[0],cc)}/>
              <HeroCard label="Closing Cash M12" value={compactCurrency(result.cashFlow.closingCash[11],cc)}/>
              <HeroCard label="Closing Cash M24" value={compactCurrency(result.cashFlow.closingCash[23],cc)}/>
              <HeroCard label="Lowest Point" value={compactCurrency(Math.min(...result.cashFlow.closingCash),cc)} color={Math.min(...result.cashFlow.closingCash)<0?CC.red:CC.navy} sub={`Month ${result.cashFlow.closingCash.indexOf(Math.min(...result.cashFlow.closingCash))+1}`}/>
            </div>
            <MonthlyTable title="Cash Flow — Year 1" rows={[
              {label:'Opening Cash',values:result.cashFlow.openingCash.slice(0,12),cc},{label:'Operating Cash Flow',values:result.cashFlow.operatingCash.slice(0,12),cc},
              {label:'Investing Cash Flow',values:result.cashFlow.investingCash.slice(0,12),cc},{label:'Financing Cash Flow',values:result.cashFlow.financingCash.slice(0,12),cc},
              {label:'Net Change',values:result.cashFlow.netChange.slice(0,12),bold:true,cc},{label:'Closing Cash',values:result.cashFlow.closingCash.slice(0,12),bold:true,highlight:true,cc},
            ]} months={monthLabels.slice(0,12)}/>
            <MonthlyTable title="Cash Flow — Year 2" rows={[
              {label:'Opening Cash',values:result.cashFlow.openingCash.slice(12,24),cc},{label:'Operating Cash Flow',values:result.cashFlow.operatingCash.slice(12,24),cc},
              {label:'Financing Cash Flow',values:result.cashFlow.financingCash.slice(12,24),cc},{label:'Net Change',values:result.cashFlow.netChange.slice(12,24),bold:true,cc},
              {label:'Closing Cash',values:result.cashFlow.closingCash.slice(12,24),bold:true,highlight:true,cc},
            ]} months={monthLabels.slice(12,24)}/>
          </div>
        )}

        {view==='workingcapital'&&(
          <div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
              <HeroCard label="Peak Working Capital" value={compactCurrency(metrics.maxWorkingCapitalRequirement,cc)} sub="FGE input credit peak"/>
              <HeroCard label="Average Outstanding" value={compactCurrency(metrics.avgWorkingCapitalRequirement,cc)} sub="Across 24 months"/>
              <HeroCard label="FGE Count" value={metrics.totalCounterpartyGroups}/>
            </div>
            <MonthlyTable title="FGE Input Credit Outstanding — Year 1" rows={[
              {label:'Input Credit Outstanding',values:result.creditReceivables.slice(0,12),bold:true,highlight:true,cc},
              {label:'Working Capital Movement',values:result.cashFlow.workingCapitalMovement.slice(0,12),cc},
            ]} months={monthLabels.slice(0,12)}/>
            {Object.entries(result.rollingFunds).map(([fundId,fund])=>(
              <MonthlyTable key={fundId} title={`${fund.name} — Year 1`} rows={[
                {label:'Fund Balance',values:fund.fundBalanceByMonth.slice(0,12),bold:true,highlight:true,cc},
                {label:'Contributions In',values:fund.fundContributions.slice(0,12),cc},
                {label:'Disbursements Out',values:fund.fundDisbursements.slice(0,12),cc},
              ]} months={monthLabels.slice(0,12)} footnote={fund.fundShortfallMonths.length>0?`Shortfall in: ${fund.fundShortfallMonths.map(s=>`Month ${s.month}`).join(', ')}`:'Rolling fund not a Wonderland asset — managed for FGE benefit.'}/>
            ))}
          </div>
        )}

        {view==='balancesheet'&&(
          <div>
            <MonthlyTable title="Balance Sheet — Year 1" rows={[
              {label:'Loan to Rolling Funds',values:result.balanceSheet.loanToRollingFunds.slice(0,12),cc},{label:'Cash & Bank',values:result.balanceSheet.cash.slice(0,12),cc},
              {label:'FGE Input Receivables',values:result.balanceSheet.creditReceivables.slice(0,12),cc},{label:'Total Assets',values:result.balanceSheet.totalAssets.slice(0,12),bold:true,cc},
              {label:'Share Capital',values:result.balanceSheet.shareCapital.slice(0,12),cc},{label:'Non-Repayable Grant (Equity)',values:result.balanceSheet.grantEquity.slice(0,12),cc},
              {label:'Retained Earnings',values:result.balanceSheet.retainedEarnings.slice(0,12),cc},{label:'Total Equity',values:result.balanceSheet.totalEquity.slice(0,12),bold:true,cc},
              {label:'Recoverable Grant Outstanding',values:result.balanceSheet.grantsOutstanding.slice(0,12),cc},{label:'Loans Outstanding',values:result.balanceSheet.loansOutstanding.slice(0,12),cc},
              {label:'Total Liabilities',values:result.balanceSheet.totalLiabilities.slice(0,12),bold:true,highlight:true,cc},
            ]} months={monthLabels.slice(0,12)} footnote="Total Assets = Total Equity + Total Liabilities in every month."/>
          </div>
        )}

        {view==='fges'&&(
          <div style={{background:CC.white,border:`1px solid ${CC.border}`,borderRadius:8,padding:'1.25rem'}}>
            <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,marginBottom:'1rem'}}>FGE Roster ({config.counterpartyGroups.length} groups)</div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'}}>
                <thead><tr style={{background:CC.navy,color:CC.white}}>{['Name','Location','Members','Recruited','Tomatoes (acres)','Onions (acres)','Credit Term','Asset Status'].map(h=><th key={h} style={{padding:'8px 10px',textAlign:'left',fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
                <tbody>{config.counterpartyGroups.map((g,i)=>{
                  const period=(g.allocationPeriods||[])[0]
                  return(<tr key={g.id} style={{background:i%2===0?CC.cream:CC.white}}>
                    <td style={{padding:'7px 10px',fontWeight:600}}>{g.name}</td>
                    <td style={{padding:'7px 10px'}}>{g.location}</td>
                    <td style={{padding:'7px 10px'}}>{g.memberCount}</td>
                    <td style={{padding:'7px 10px'}}>Month {g.recruitedMonth}</td>
                    <td style={{padding:'7px 10px'}}>{period?.allocations?.tomatoes||0}</td>
                    <td style={{padding:'7px 10px'}}>{period?.allocations?.onions||0}</td>
                    <td style={{padding:'7px 10px'}}>{g.creditTerm.value} {g.creditTerm.unit}</td>
                    <td style={{padding:'7px 10px',textTransform:'capitalize'}}>{g.assetStatus}</td>
                  </tr>)
                })}</tbody>
              </table>
            </div>
          </div>
        )}

        {view==='scenarios'&&(
          <div>
            <ScenarioBuilder config={config} overrides={overrides} result={result} baseResult={baseResult} onApply={persist} monthLabels={monthLabels} cc={cc}/>
          </div>
        )}

      </main>
      <footer style={{textAlign:'center',padding:'1.5rem',fontFamily:'monospace',fontSize:'0.67rem',color:CC.slate,borderTop:`1px solid ${CC.border}`}}>Canvas Coach · Clearview · Wonderland Farm Services · habibonifade.com</footer>
    </div>
  )
}

function ScenarioBuilder({config,overrides,result,baseResult,onApply,monthLabels,cc}){
  const [local,setLocal] = useState(overrides)
  const liveResult = useMemo(()=>runModel(config,{overrides:local}),[config,local])
  function update(field,value){setLocal(p=>({...p,[field]:value}))}

  const m=liveResult.metrics,bm=baseResult.metrics
  const deltaEbitda=m.year1EBITDA-bm.year1EBITDA

  const inp={width:'100%',padding:'0.45rem 0.6rem',border:`1px solid ${CC.border}`,borderRadius:4,fontSize:'0.85rem',fontFamily:'inherit',background:'#F4F8FC',color:CC.navy,boxSizing:'border-box'}
  const lbl={display:'block',fontWeight:600,fontSize:'0.8rem',marginBottom:'0.22rem',color:CC.navy}
  const card={background:CC.white,border:`1px solid ${CC.border}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}

  return(
    <div>
      <div style={card}>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,marginBottom:'1rem'}}>Grant Negotiation</div>
        {config.capitalStructure.grants.filter(g=>g.repayable).map(grant=>(
          <div key={grant.id}>
            <label style={lbl}>{grant.name} — Forgiveness %</label>
            <div style={{display:'flex',alignItems:'center',gap:'1rem',marginBottom:'0.5rem'}}>
              <input type="range" min="0" max="100" step="1" value={(local.grantForgivenessOverrides[grant.id]??0)*100} onChange={e=>update('grantForgivenessOverrides',{...local.grantForgivenessOverrides,[grant.id]:Number(e.target.value)/100})} style={{flex:1,accentColor:CC.cyan}}/>
              <span style={{fontFamily:'monospace',fontWeight:700,minWidth:'3.5rem'}}>{pct(local.grantForgivenessOverrides[grant.id]??0)}</span>
            </div>
            <div style={{fontSize:'0.78rem',color:CC.slate,marginBottom:'1rem'}}>Net repayable: {currency(grant.amount*(1-(local.grantForgivenessOverrides[grant.id]??0)),cc)}</div>
          </div>
        ))}
      </div>
      <div style={card}>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,marginBottom:'1rem'}}>Credit Terms & Model</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'1rem'}}>
          <div>
            <label style={lbl}>Aggregation model</label>
            <select style={inp} value={local.aggregationModel} onChange={e=>update('aggregationModel',e.target.value)}>
              <option value="commission">Commission only</option>
              <option value="spread">Spread only</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Commission %</label>
            <input type="number" style={inp} value={(local.commissionPctOverride??0.10)*100} onChange={e=>update('commissionPctOverride',Number(e.target.value)/100)}/>
          </div>
          <div>
            <label style={lbl}>Bank loan (UGX)</label>
            <input type="number" style={inp} value={(local.financingOverrides||{}).bankLoan??0} onChange={e=>update('financingOverrides',{...local.financingOverrides,bankLoan:Number(e.target.value)})}/>
          </div>
        </div>
      </div>
      <div style={{background:CC.navy,borderRadius:8,padding:'1rem 1.25rem',marginBottom:'1.25rem'}}>
        <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.12em',color:CC.cyan,marginBottom:'0.5rem'}}>IMPACT VS BASE CASE</div>
        <Flag type={deltaEbitda>=0?'ok':'warn'}>Year 1 EBITDA {deltaEbitda>=0?'improves':'worsens'} by {currency(Math.abs(deltaEbitda),cc)}, from {currency(bm.year1EBITDA,cc)} to {currency(m.year1EBITDA,cc)}.</Flag>
        <div style={{marginTop:'0.4rem'}}><Flag type={m.minCashBalance>=0?'ok':'warn'}>Lowest cash point: {currency(m.minCashBalance,cc)} at Month {m.minCashMonth}.</Flag></div>
      </div>
      <MonthlyTable title="Scenario vs Base Case — Year 1 Cash" rows={[
        {label:'This Scenario',values:liveResult.cashFlow.closingCash.slice(0,12),bold:true,cc},
        {label:'Base Case',values:baseResult.cashFlow.closingCash.slice(0,12),cc},
      ]} months={monthLabels.slice(0,12)}/>
      <button onClick={()=>onApply(local)} style={{fontFamily:'monospace',fontSize:'0.8rem',fontWeight:700,padding:'0.65rem 1.5rem',border:'none',borderRadius:4,background:CC.cyan,color:CC.navy,cursor:'pointer'}}>Apply as active scenario</button>
    </div>
  )
}
