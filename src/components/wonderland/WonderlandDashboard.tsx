// @ts-nocheck
'use client'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import AnalyticsView from '@/components/analytics/AnalyticsView'
import { buildDebtSchedule } from '@/lib/analytics-engine'

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

// ─── DEBT SCHEDULE ENGINE ────────────────────────────────────
// ─── WONDERLAND CONFIG ───────────────────────────────────────
function wonderlandConfig() {
  return {
    meta: { businessName:'Wonderland Farm Services', ownerName:'Bernard', modelStartDate:'2026-06-01', currency:'UGX', corporateTaxRate:0.30, costOfCapital:0.10, openingCashBeforeFinancing:6_080_000 },
    units: [
      { id:'input_shop', name:'Input Shop', color:'#8B5E3C', short:'Shop' },
      { id:'fge', name:'Farmer Group Enterprises (FGE)', color:'#5B7B3A', short:'FGE' },
      { id:'extension', name:'Extension Services', color:'#C99A3B', short:'Extension' },
      { id:'farm', name:"Wonderland's Own Farm", color:'#6B6259', short:'Farm' },
    ],
    productionLines: {
      tomatoes: { name:'Tomatoes', yieldPerUnit:70, allocationUnit:'acre', outputUnit:'Crates', farmgateBuyPrice:200_000, marketSellPrice:200_000, inputCreditPricePerAllocationUnit:830_000, cycleMonths:4 },
      onions: { name:'Onions', yieldPerUnit:10_000, allocationUnit:'acre', outputUnit:'kg', farmgateBuyPrice:2_000, marketSellPrice:2_000, inputCreditPricePerAllocationUnit:945_000, cycleMonths:5 },
    },
    revenueStreams: [
      { id:'shop_seeds', unit:'input_shop', name:'Seeds & planting material', type:'simple', monthlyAmount:4_897_821, marginPct:0.25, startMonth:1, endMonth:null },
      { id:'shop_fert', unit:'input_shop', name:'Fertilisers & soil amendments', type:'simple', monthlyAmount:7_836_513, marginPct:0.22, startMonth:1, endMonth:null },
      { id:'shop_chem', unit:'input_shop', name:'Chemicals & pesticides', type:'simple', monthlyAmount:2_938_692, marginPct:0.28, startMonth:1, endMonth:null },
      { id:'shop_equip', unit:'input_shop', name:'Equipment & tools', type:'simple', monthlyAmount:1_959_128, marginPct:0.20, startMonth:1, endMonth:null },
      { id:'shop_consumables', unit:'input_shop', name:'Consumables & PPE', type:'simple', monthlyAmount:1_469_346, marginPct:0.30, startMonth:1, endMonth:null },
      { id:'ext_external', unit:'extension', name:'External extension clients', type:'simple', monthlyAmount:11*80_000, marginPct:1.0, startMonth:2, endMonth:null },
      { id:'ext_training', unit:'extension', name:'Training & advisory sessions', type:'simple', monthlyAmount:10*100_000, marginPct:1.0, startMonth:2, endMonth:null },
    ],
    counterpartyGroupDefaults: { relationshipType:'input_credit_and_offtake', linkedUnit:'fge', commissionPct:0.10, defaultCreditTerm:{value:14,unit:'weeks'}, inputSupplyMarginPct:0.214 },
    counterpartyGroups: buildWonderlandFgeRoster(),
    staff: [
      { id:'s1', name:'Project Coordinator', role:'Project Coordinator', monthlyCost:260_000, startMonth:1, endMonth:null, timeSplit:{input_shop:0,fge:100,extension:0,farm:0,admin:0} },
      { id:'s2', name:'Accounts Assistant (Agg)', role:'Accounts Assistant', monthlyCost:240_000, startMonth:1, endMonth:null, timeSplit:{input_shop:20,fge:60,extension:0,farm:0,admin:20} },
      { id:'s3', name:'Field Assistant 1', role:'Field Assistant', monthlyCost:550_000, startMonth:1, endMonth:null, timeSplit:{input_shop:0,fge:70,extension:30,farm:0,admin:0} },
      { id:'s4', name:'Field Assistant 2', role:'Field Assistant', monthlyCost:550_000, startMonth:1, endMonth:null, timeSplit:{input_shop:0,fge:70,extension:30,farm:0,admin:0} },
      { id:'s5', name:'Produce Marketing Cashier', role:'Cashier', monthlyCost:450_000, startMonth:4, endMonth:null, timeSplit:{input_shop:0,fge:100,extension:0,farm:0,admin:0} },
      { id:'s6', name:'Produce Marketing Assistant', role:'Marketing Assistant', monthlyCost:500_000, startMonth:4, endMonth:null, timeSplit:{input_shop:0,fge:100,extension:0,farm:0,admin:0} },
      { id:'s7', name:'Security 1', role:'Security', monthlyCost:350_000, startMonth:4, endMonth:null, timeSplit:{input_shop:40,fge:60,extension:0,farm:0,admin:0} },
      { id:'s8', name:'Security 2', role:'Security', monthlyCost:350_000, startMonth:4, endMonth:null, timeSplit:{input_shop:40,fge:60,extension:0,farm:0,admin:0} },
      { id:'s9', name:'Tricycle Operator', role:'Tricycle Operator', monthlyCost:400_000, startMonth:4, endMonth:null, timeSplit:{input_shop:50,fge:50,extension:0,farm:0,admin:0} },
      { id:'s10', name:'Farm Manager', role:'Farm Manager', monthlyCost:400_000, startMonth:1, endMonth:null, timeSplit:{input_shop:0,fge:0,extension:0,farm:100,admin:0} },
      { id:'s11', name:'Farm Labourers (x8)', role:'Farm Labourer', monthlyCost:2_400_000, startMonth:1, endMonth:null, timeSplit:{input_shop:0,fge:0,extension:0,farm:100,admin:0} },
      { id:'s12', name:'Managing Director', role:'Managing Director', monthlyCost:650_000, startMonth:1, endMonth:null, timeSplit:{input_shop:0,fge:0,extension:0,farm:0,admin:100} },
      { id:'s13', name:'Accounts Assistant (Central)', role:'Accounts Assistant', monthlyCost:550_000, startMonth:1, endMonth:null, timeSplit:{input_shop:0,fge:0,extension:0,farm:0,admin:100} },
      { id:'s14', name:'Input Operations Assistant', role:'Input Ops Assistant', monthlyCost:400_000, startMonth:1, endMonth:null, timeSplit:{input_shop:60,fge:0,extension:0,farm:0,admin:40} },
    ],
    overheads: [
      { id:'oh1', name:'Office Rent - Business', monthlyAmount:500_000, unit:'fge', startMonth:1, endMonth:null },
      { id:'oh2', name:'Fuel & Transport - FGE visits', monthlyAmount:384_000, unit:'fge', startMonth:1, endMonth:null },
      { id:'oh3', name:'Input Delivery Cost', monthlyAmount:200_000, unit:'input_shop', startMonth:1, endMonth:null },
      { id:'oh4', name:'R&M - Equipment', monthlyAmount:300_000, unit:'fge', startMonth:1, endMonth:null },
      { id:'oh5', name:'Farm Rent / Land Access', monthlyAmount:50_000, unit:'farm', startMonth:1, endMonth:null },
      { id:'oh6', name:'Irrigation - Own Farm', monthlyAmount:30_000, unit:'farm', startMonth:1, endMonth:null },
      { id:'oh7', name:'Farm Tools & Maintenance', monthlyAmount:40_000, unit:'farm', startMonth:1, endMonth:null },
      { id:'oh8', name:'Farm Staff Welfare', monthlyAmount:40_000, unit:'farm', startMonth:1, endMonth:null },
      { id:'oh9', name:'Office Running Costs', monthlyAmount:580_000, unit:'admin', startMonth:1, endMonth:null },
      { id:'oh10', name:'Communications & Data', monthlyAmount:200_000, unit:'admin', startMonth:1, endMonth:null },
      { id:'oh11', name:'Professional Fees', monthlyAmount:100_000, unit:'admin', startMonth:1, endMonth:null },
    ],
    capitalStructure: {
      shareholderContribution:33_500_000,
      grants: [
        { id:'csj_nonrepayable', name:'CSJ Grant (Non-Repayable)', amount:147_680_000, repayable:false },
        { id:'csj_recoverable', name:'CSJ Grant (Recoverable)', amount:62_320_000, repayable:true, schedule:{instalments:[{month:3,amount:10_000_000},{month:4,amount:10_000_000},{month:5,amount:42_320_000}],deferralEnabled:true,deferredMonth:5}, defaultForgivenessPct:0.33 },
      ],
      loans:[],
      defaultAnnualInterestRate:0.18,
      defaultLoanTenorYears:2,
    },
    rollingFunds: [
      { id:'irrigation_kit_fund', name:'Irrigation Kit Fund', assetCostPerNewMember:8_000_000, contributionPerMember:{amount:4_000_000,periods:2,periodLengthSource:'firstProductionLineCycle'}, openingFundBalance:0, contributionSource:'external', appliesTo:'counterpartyGroups' },
    ],
    // Default debt obligations (empty -- populated via Planning tab UI)
    debtObligations: [],
  }
}

function buildWonderlandFgeRoster() {
  const roster = []
  for (let i=1;i<=10;i++) roster.push({ id:`fge_b1_${i}`, name:`FGE B1-${i}`, location:'Batch 1 area', memberCount:15, assetStatus:'saving', recruitedMonth:1, creditTerm:{value:14,unit:'weeks'}, allocationPeriods:[{label:'Season 1',startMonth:1,allocations:{tomatoes:3,onions:2}}] })
  for (let i=1;i<=10;i++) roster.push({ id:`fge_b2_${i}`, name:`FGE B2-${i}`, location:'Batch 2 area', memberCount:15, assetStatus:'saving', recruitedMonth:2, creditTerm:{value:14,unit:'weeks'}, allocationPeriods:[{label:'Season 1',startMonth:2,allocations:{tomatoes:3,onions:2}}] })
  return roster
}

function currency(n,cc='UGX'){const v=Math.round(n||0);const sign=v<0?'-':'';return`${sign}${cc} ${Math.abs(v).toLocaleString('en-US')}`}
function compactCurrency(n,cc='UGX'){const v=Math.round(n||0);const abs=Math.abs(v);const sign=v<0?'-':'';if(abs>=1_000_000_000)return`${sign}${cc} ${(abs/1_000_000_000).toFixed(1)}B`;if(abs>=1_000_000)return`${sign}${cc} ${(abs/1_000_000).toFixed(1)}M`;if(abs>=1_000)return`${sign}${cc} ${(abs/1_000).toFixed(0)}K`;return`${sign}${cc} ${abs}`}
function pct(n){return`${(n*100).toFixed(1)}%`}
function isActiveInMonth(s,e,m){if(m<(s||1))return false;if(e&&m>e)return false;return true}

function applyScenario(config,scenario){
  const ov=scenario?.overrides||{}
  return{presetLabel:'Base Case',productionLineOverrides:ov.productionLineOverrides||{},marginMultiplier:ov.marginMultiplier??1,revenueStreamOverrides:ov.revenueStreamOverrides||{},aggregationModel:ov.aggregationModel??'commission',commissionPctOverride:ov.commissionPctOverride??null,globalCreditTermOverride:ov.creditTerm??null,grantForgivenessOverrides:ov.grantForgivenessOverrides||{},additionalStaff:ov.additionalStaff||[],additionalGroups:ov.additionalGroups||[],financingOverrides:ov.financingOverrides||{},rollingFundOverrides:ov.rollingFundOverrides||{}}
}

function runModel(config,scenario){
  const s=applyScenario(config,scenario)
  const months=MONTHS_HORIZON
  const meta=config.meta
  const unit={}
  config.units.forEach(u=>{unit[u.id]={revenue:Array(months).fill(0),revenueLines:{},cogs:Array(months).fill(0),cogsLines:{},directOpex:Array(months).fill(0),staffCost:Array(months).fill(0),adminAllocated:Array(months).fill(0)}})
  function addRevenue(uid,name,m,v){if(!unit[uid]||m<0||m>=months||v===0)return;unit[uid].revenue[m]+=v;unit[uid].revenueLines[name]=unit[uid].revenueLines[name]||Array(months).fill(0);unit[uid].revenueLines[name][m]+=v}
  function addCogs(uid,name,m,v){if(!unit[uid]||m<0||m>=months||v===0)return;unit[uid].cogs[m]+=v;unit[uid].cogsLines[name]=unit[uid].cogsLines[name]||Array(months).fill(0);unit[uid].cogsLines[name][m]+=v}
  ;(config.revenueStreams||[]).forEach(stream=>{const ov=s.revenueStreamOverrides[stream.id]||{};const ma=ov.monthlyAmount??stream.monthlyAmount;let mp=ov.marginPct??stream.marginPct;if(ov.marginPct===undefined)mp*=s.marginMultiplier;for(let m=0;m<months;m++){if(!isActiveInMonth(stream.startMonth,stream.endMonth,m+1))continue;addRevenue(stream.unit,stream.name,m,ma);const cost=ma-ma*mp;if(cost!==0)addCogs(stream.unit,`${stream.name} - Cost`,m,cost)}})
  const gd=config.counterpartyGroupDefaults||{}
  const allGroups=[...(config.counterpartyGroups||[]),...s.additionalGroups]
  const creditAdvances=Array(months).fill(0),creditRepayments=Array(months).fill(0),productionLineTotals={}
  allGroups.forEach(group=>{
    const relType=group.relationshipType||gd.relationshipType,linkedUnit=group.linkedUnit||gd.linkedUnit,commissionPct=s.commissionPctOverride??(group.commissionPct??gd.commissionPct??0),creditTerm=s.globalCreditTermOverride||group.creditTerm||gd.defaultCreditTerm
    ;(group.allocationPeriods||[]).forEach(period=>{
      const ps=period.startMonth
      Object.entries(period.allocations||{}).forEach(([lineId,allocUnits])=>{
        if(!allocUnits||allocUnits<=0)return;const lb=config.productionLines[lineId];if(!lb)return
        const lo=s.productionLineOverrides[lineId]||{},icp=lo.inputCreditPricePerAllocationUnit??lb.inputCreditPricePerAllocationUnit,fbp=lo.farmgateBuyPrice??lb.farmgateBuyPrice,msp=lo.marketSellPrice??lb.marketSellPrice,ym=lo.yieldMultiplier??1,ey=lb.yieldPerUnit*ym,cm=lb.cycleMonths
        productionLineTotals[lineId]=productionLineTotals[lineId]||{volume:Array(months).fill(0)}
        if(relType==='input_credit_and_offtake'){
          const adv=allocUnits*icp,ai=ps-1
          if(ai>=0&&ai<months){creditAdvances[ai]+=adv;addRevenue(linkedUnit,`${lb.name} Input Supply Revenue`,ai,adv);addCogs(linkedUnit,`${lb.name} Input Procurement Cost`,ai,adv*(1-(gd.inputSupplyMarginPct??0.214)))}
          const hm=ps+cm-1,hi=hm-1,tm=creditTermToMonths(creditTerm,cm)
          let rm=Math.round(ps-1+tm)+1;rm=Math.max(rm,hm);rm=Math.min(rm,months);const ri=rm-1
          if(ri>=0&&ri<months&&ai>=0&&ai<months)creditRepayments[ri]+=adv
          const vol=allocUnits*ey,fgv=vol*fbp,mkv=vol*msp
          if(hi>=0&&hi<months){productionLineTotals[lineId].volume[hi]+=vol;if(s.aggregationModel==='commission'){addRevenue(linkedUnit,`${lb.name} Aggregation Commission`,hi,fgv*commissionPct)}else if(s.aggregationModel==='spread'){addRevenue(linkedUnit,`${lb.name} Produce Sales`,hi,mkv);addCogs(linkedUnit,`${lb.name} Produce Purchase Cost`,hi,fgv*(1-commissionPct))}else{addRevenue(linkedUnit,`${lb.name} Aggregation Commission`,hi,fgv*commissionPct);addRevenue(linkedUnit,`${lb.name} Produce Sales`,hi,mkv);addCogs(linkedUnit,`${lb.name} Produce Purchase Cost`,hi,fgv*(1-commissionPct))}}
        }
      })
    })
  })
  const creditReceivables=Array(months).fill(0);let ca=0,cr=0;for(let m=0;m<months;m++){ca+=creditAdvances[m];cr+=creditRepayments[m];creditReceivables[m]=Math.max(0,ca-cr)}
  const allStaff=[...(config.staff||[]),...s.additionalStaff],adminStaffCost=Array(months).fill(0),unitIds=config.units.map(u=>u.id)
  allStaff.forEach(p=>{const split=p.timeSplit||{};for(let m=0;m<months;m++){if(!isActiveInMonth(p.startMonth,p.endMonth,m+1))continue;unitIds.forEach(id=>{unit[id].staffCost[m]+=p.monthlyCost*((split[id]||0)/100)});adminStaffCost[m]+=p.monthlyCost*((split.admin||0)/100)}})
  const adminOverheadCost=Array(months).fill(0)
  ;(config.overheads||[]).forEach(ov=>{for(let m=0;m<months;m++){if(!isActiveInMonth(ov.startMonth,ov.endMonth,m+1))continue;if(ov.unit==='admin')adminOverheadCost[m]+=ov.monthlyAmount;else if(unit[ov.unit])unit[ov.unit].directOpex[m]+=ov.monthlyAmount}})
  const totalAdminCost=Array(months).fill(0);for(let m=0;m<months;m++)totalAdminCost[m]=adminStaffCost[m]+adminOverheadCost[m]
  for(let m=0;m<months;m++){const total=unitIds.reduce((s,id)=>s+unit[id].staffCost[m],0);unitIds.forEach(id=>{const share=total>0?unit[id].staffCost[m]/total:1/unitIds.length;unit[id].adminAllocated[m]=totalAdminCost[m]*share})}
  unitIds.forEach(id=>{const u=unit[id];u.grossProfit=Array(months).fill(0);u.totalOpex=Array(months).fill(0);u.ebitda=Array(months).fill(0);for(let m=0;m<months;m++){u.grossProfit[m]=u.revenue[m]-u.cogs[m];u.totalOpex[m]=u.directOpex[m]+u.staffCost[m]+u.adminAllocated[m];u.ebitda[m]=u.grossProfit[m]-u.totalOpex[m]}})
  const con={revenue:Array(months).fill(0),cogs:Array(months).fill(0),grossProfit:Array(months).fill(0),opex:Array(months).fill(0),ebitda:Array(months).fill(0),interest:Array(months).fill(0),nptBeforeTax:Array(months).fill(0),tax:Array(months).fill(0),nptAfterTax:Array(months).fill(0)}
  for(let m=0;m<months;m++){unitIds.forEach(id=>{con.revenue[m]+=unit[id].revenue[m];con.cogs[m]+=unit[id].cogs[m];con.grossProfit[m]+=unit[id].grossProfit[m];con.opex[m]+=unit[id].totalOpex[m];con.ebitda[m]+=unit[id].ebitda[m]})}
  const cap=config.capitalStructure||{},loans=[...(cap.loans||[])]
  if(s.financingOverrides.bankLoan)loans.push({id:'scenario_loan',amount:s.financingOverrides.bankLoan,annualInterestRate:s.financingOverrides.annualInterestRate??cap.defaultAnnualInterestRate??0,tenorYears:s.financingOverrides.loanTenorYears??cap.defaultLoanTenorYears??1,startMonth:s.financingOverrides.loanStartMonth??1})
  const loanInt=Array(months).fill(0),loanPrin=Array(months).fill(0),loanDraw=Array(months).fill(0),loanBals={}
  loans.forEach(loan=>{const si=(loan.startMonth||1)-1;if(si>=0&&si<months)loanDraw[si]+=loan.amount;const mr=(loan.annualInterestRate||0)/12,tm=(loan.tenorYears||1)*12,mp=tm>0?loan.amount/tm:0;let bal=loan.amount;for(let m=si;m<months;m++){if(m<0||bal<=0)continue;loanInt[m]+=bal*mr;const p=Math.min(mp,bal);loanPrin[m]+=p;bal-=p};loanBals[loan.id]={amount:loan.amount,monthlyPrincipal:mp}})
  for(let m=0;m<months;m++)con.interest[m]=loanInt[m]
  const grants=cap.grants||[],grantRep=Array(months).fill(0),grantForg=Array(months).fill(0),grantInflow=Array(months).fill(0),grantState={}
  grants.forEach(g=>{grantInflow[0]+=g.amount})
  grants.forEach(grant=>{if(!grant.repayable){grantState[grant.id]={totalAmount:grant.amount,netRepayable:0,forgivenAmount:0,repayable:false};return}
    const fp=s.grantForgivenessOverrides[grant.id]??grant.defaultForgivenessPct??0,nr=grant.amount*(1-fp),fa=grant.amount-nr;grantState[grant.id]={totalAmount:grant.amount,netRepayable:nr,forgivenAmount:fa,repayable:true,forgivenessPct:fp}
    const sch=grant.schedule;if(sch){const ts=sch.instalments.reduce((s,i)=>s+i.amount,0);sch.instalments.forEach(inst=>{const share=ts>0?inst.amount/ts:0;const month=sch.deferralEnabled?sch.deferredMonth:inst.month;if(month>=1&&month<=months){grantRep[month-1]+=nr*share;grantForg[month-1]+=fa*share}})}})
  for(let m=0;m<months;m++){con.nptBeforeTax[m]=con.ebitda[m]-con.interest[m];con.tax[m]=con.nptBeforeTax[m]>0?con.nptBeforeTax[m]*(meta.corporateTaxRate||0):0;con.nptAfterTax[m]=con.nptBeforeTax[m]-con.tax[m]+grantForg[m]}
  con.grantForgivenessGain=grantForg;con.grantState=grantState
  const rfResults={},wlOutTotal=Array(months).fill(0),wlRepTotal=Array(months).fill(0)
  ;(config.rollingFunds||[]).forEach(fund=>{
    const fo=s.rollingFundOverrides[fund.id]||{},cs=fo.contributionSource??fund.contributionSource??'external',wl=fo.wonderlandLoans||[]
    const fc=Array(months).fill(0),fd=Array(months).fill(0),wlo=Array(months).fill(0),wlr=Array(months).fill(0)
    if(fund.appliesTo==='counterpartyGroups'){;(config.counterpartyGroups||[]).forEach(group=>{const ri=Math.max(0,(group.recruitedMonth||1)-1);let pl=4;const fp=(group.allocationPeriods||[])[0];if(fp&&fund.contributionPerMember.periodLengthSource==='firstProductionLineCycle'){const lids=Object.keys(fp.allocations||[]);if(lids.length>0&&config.productionLines[lids[0]])pl=config.productionLines[lids[0]].cycleMonths}
    for(let p=0;p<fund.contributionPerMember.periods;p++){const ci=ri+p*pl+(pl-1);if(ci>=0&&ci<months)fc[ci]+=fund.contributionPerMember.amount}})}
    wl.forEach(loan=>{const li=Math.max(0,(loan.month||1)-1);if(li<months){wlo[li]+=loan.amount;fc[li]+=loan.amount};if(loan.repaymentMonth){const ri=Math.max(0,loan.repaymentMonth-1);if(ri<months){wlr[ri]+=loan.amount;fd[ri]+=loan.amount}}})
    const fsm=[],nama=Array(months).fill(0);let rb=fund.openingFundBalance||0;const fb=Array(months).fill(0)
    s.additionalGroups.forEach(g=>{const ri=Math.max(0,(g.recruitedMonth||1)-1);if(ri<months)nama[ri]+=fund.assetCostPerNewMember})
    for(let m=0;m<months;m++){rb+=fc[m];rb-=fd[m];if(nama[m]>0){if(rb>=nama[m]){rb-=nama[m];fd[m]+=nama[m]}else{fsm.push({month:m+1,shortfall:nama[m]-rb});fd[m]+=rb;rb=0}};fb[m]=rb}
    rfResults[fund.id]={name:fund.name,fundBalanceByMonth:fb,fundContributions:fc,fundDisbursements:fd,fundShortfallMonths:fsm,contributionSource:cs}
    for(let m=0;m<months;m++){wlOutTotal[m]+=wlo[m];wlRepTotal[m]+=wlr[m]}
  })
  const cf={operatingCash:Array(months).fill(0),investingCash:Array(months).fill(0),financingCash:Array(months).fill(0),netChange:Array(months).fill(0),openingCash:Array(months).fill(0),closingCash:Array(months).fill(0),workingCapitalMovement:Array(months).fill(0)}
  let pr=0;for(let m=0;m<months;m++){cf.workingCapitalMovement[m]=-(creditReceivables[m]-pr);pr=creditReceivables[m]}
  for(let m=0;m<months;m++)cf.operatingCash[m]=con.nptAfterTax[m]-grantForg[m]+cf.workingCapitalMovement[m]
  for(let m=0;m<months;m++){cf.investingCash[m]-=wlOutTotal[m];cf.investingCash[m]+=wlRepTotal[m]}
  cf.financingCash[0]+=(cap.shareholderContribution||0)
  for(let m=0;m<months;m++){cf.financingCash[m]+=grantInflow[m];cf.financingCash[m]-=grantRep[m];cf.financingCash[m]+=loanDraw[m];cf.financingCash[m]-=loanPrin[m]}
  for(let m=0;m<months;m++){cf.netChange[m]=cf.operatingCash[m]+cf.investingCash[m]+cf.financingCash[m];cf.openingCash[m]=m===0?meta.openingCashBeforeFinancing:cf.closingCash[m-1];cf.closingCash[m]=cf.openingCash[m]+cf.netChange[m]}
  const bs={loanToRollingFunds:Array(months).fill(0),cash:cf.closingCash,creditReceivables,totalAssets:Array(months).fill(0),shareCapital:Array(months).fill(0),grantEquity:Array(months).fill(0),retainedEarnings:Array(months).fill(0),totalEquity:Array(months).fill(0),grantsOutstanding:Array(months).fill(0),loansOutstanding:Array(months).fill(0),totalLiabilities:Array(months).fill(0)}
  let cumNPAT=0,cumLTF=0,cgr={},cgf={};grants.forEach(g=>{cgr[g.id]=0;cgf[g.id]=0});const rg=grants.filter(g=>g.repayable),tra=rg.reduce((s,g)=>s+g.amount,0),nrt=grants.filter(g=>!g.repayable).reduce((s,g)=>s+g.amount,0),lb2={}
  loans.forEach(l=>{lb2[l.id]=l.amount})
  for(let m=0;m<months;m++){cumLTF+=wlOutTotal[m]-wlRepTotal[m];bs.loanToRollingFunds[m]=Math.max(0,cumLTF);cumNPAT+=con.nptAfterTax[m];bs.retainedEarnings[m]=cumNPAT+(meta.openingCashBeforeFinancing||0);bs.shareCapital[m]=cap.shareholderContribution||0;bs.grantEquity[m]=nrt;bs.totalEquity[m]=bs.shareCapital[m]+bs.grantEquity[m]+bs.retainedEarnings[m];let go=0;rg.forEach(g=>{const share=tra>0?g.amount/tra:0;cgr[g.id]+=grantRep[m]*share;cgf[g.id]+=grantForg[m]*share;go+=Math.max(0,g.amount-cgr[g.id]-cgf[g.id])});bs.grantsOutstanding[m]=go;bs.loansOutstanding[m]=loans.length>0?Object.values(lb2).reduce((s,v)=>s+Math.max(0,v),0):0;bs.totalAssets[m]=bs.loanToRollingFunds[m]+bs.cash[m]+bs.creditReceivables[m];bs.totalLiabilities[m]=bs.grantsOutstanding[m]+bs.loansOutstanding[m]}
  const y1=arr=>arr.slice(0,12).reduce((a,b)=>a+b,0),y2=arr=>arr.slice(12,24).reduce((a,b)=>a+b,0)
  const metrics={year1Revenue:y1(con.revenue),year1GrossProfit:y1(con.grossProfit),year1EBITDA:y1(con.ebitda),year1NPAT:y1(con.nptAfterTax),year2Revenue:y2(con.revenue),year2GrossProfit:y2(con.grossProfit),year2EBITDA:y2(con.ebitda),year2NPAT:y2(con.nptAfterTax),grossMarginY1:y1(con.revenue)!==0?y1(con.grossProfit)/y1(con.revenue):0,netMarginY1:y1(con.revenue)!==0?y1(con.nptAfterTax)/y1(con.revenue):0,maxWorkingCapitalRequirement:Math.max(...creditReceivables),avgWorkingCapitalRequirement:creditReceivables.reduce((a,b)=>a+b,0)/months,minCashBalance:Math.min(...cf.closingCash),minCashMonth:cf.closingCash.indexOf(Math.min(...cf.closingCash))+1,totalCounterpartyGroups:allGroups.length,grantState}
  return{scenario:s,counterpartyGroups:allGroups,unit,consolidated:con,cashFlow:cf,balanceSheet:bs,workingCapitalRequirement:creditReceivables,creditReceivables,rollingFunds:rfResults,productionLineTotals,metrics}
}

// ─── DESIGN TOKENS ───────────────────────────────────────────
const CC={navy:'#1B2A4A',cyan:'#00B4D8',cream:'#F8F4EE',white:'#FFFFFF',slate:'#4A5A6A',border:'#D8E0E8',teal:'#1A9DAA',red:'#C0392B',green:'#1A7A4A',amber:'#B8860B',lightBg:'#F0F4F8'}
const inp={width:'100%',padding:'0.42rem 0.6rem',border:`1px solid ${CC.border}`,borderRadius:4,fontSize:'0.83rem',fontFamily:'inherit',background:'#F4F8FC',color:CC.navy,boxSizing:'border-box'}
const lbl={display:'block',fontWeight:600,fontSize:'0.8rem',marginBottom:'0.22rem',color:CC.navy}
const card={background:CC.white,border:`1px solid ${CC.border}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}

function HeroCard({label,value,sub,color}){return(<div style={{background:CC.white,border:`1px solid ${CC.border}`,borderRadius:6,padding:'1rem 1.1rem'}}><div style={{fontFamily:'monospace',fontSize:'0.72rem',letterSpacing:'0.08em',color:CC.slate,textTransform:'uppercase',marginBottom:'0.35rem'}}>{label}</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.35rem',fontWeight:700,color:color||CC.navy,marginBottom:'0.2rem'}}>{value}</div>{sub&&<div style={{fontSize:'0.74rem',color:CC.slate}}>{sub}</div>}</div>)}

function MonthlyTable({title,rows,months,footnote}){return(<div style={{...card,padding:'1rem 1.1rem'}}>{title&&<div style={{fontFamily:'Georgia,serif',fontSize:'1.15rem',fontWeight:700,marginBottom:'0.8rem',color:CC.navy}}>{title}</div>}<div style={{overflowX:'auto'}}><table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.75rem',fontFamily:'monospace'}}><thead><tr><th style={{textAlign:'left',padding:'0.3rem 0.5rem',borderBottom:`1px solid ${CC.border}`,minWidth:180,fontFamily:"'Segoe UI',system-ui,sans-serif",fontSize:'0.78rem'}}></th>{months.map((m,i)=><th key={i} style={{textAlign:'right',padding:'0.3rem 0.5rem',color:CC.slate,fontWeight:500,borderBottom:`1px solid ${CC.border}`,whiteSpace:'nowrap'}}>{m}</th>)}</tr></thead><tbody>{rows.map((row,ri)=>(<tr key={ri} style={{background:row.highlight?'#EBF8FF':undefined}}><td style={{textAlign:'left',padding:'0.28rem 0.5rem',borderBottom:`1px solid #F0F4F8`,fontFamily:"'Segoe UI',system-ui,sans-serif",fontSize:'0.8rem',fontWeight:row.bold?700:400}}>{row.label}</td>{row.values.map((v,vi)=><td key={vi} style={{textAlign:'right',padding:'0.28rem 0.5rem',borderBottom:`1px solid #F0F4F8`,fontWeight:row.bold?700:400,color:v<0?CC.red:CC.navy,whiteSpace:'nowrap'}}>{compactCurrency(v,row.cc)}</td>)}</tr>))}</tbody></table></div>{footnote&&<div style={{marginTop:'0.6rem',fontSize:'0.74rem',color:CC.slate,lineHeight:1.4}}>{footnote}</div>}</div>)}

function Flag({type,children}){const color=type==='warn'?CC.red:type==='ok'?CC.green:CC.amber;return(<div style={{display:'flex',alignItems:'flex-start',gap:'0.5rem',fontSize:'0.84rem',lineHeight:1.5,color:CC.white}}><span style={{width:8,height:8,borderRadius:'50%',background:color,marginTop:'0.45rem',flexShrink:0,display:'inline-block'}}/><span>{children}</span></div>)}

function defaultOverrides(){return{aggregationModel:'commission',commissionPctOverride:0.10,grantForgivenessOverrides:{csj_recoverable:0.33},creditTerm:null,additionalStaff:[],additionalGroups:[],financingOverrides:{},rollingFundOverrides:{},productionLineOverrides:{}}}

// ─── PLANNING & ACTUALS TAB ──────────────────────────────────
function PlanningActualsTab({config,result,monthLabels,cc,savedActuals,onSaveActuals,debtObligations,onSaveDebtObligations}){
  const months=MONTHS_HORIZON
  const [selMonth,setSelMonth]=useState(0)
  const [actuals,setActuals]=useState(savedActuals||{})
  const [saving,setSaving]=useState(false)
  const [savedAssessments,setSavedAssessments]=useState(null)
  const [activeSection,setActiveSection]=useState('actuals')

  // Debt obligations state
  const [obligations,setObligations]=useState(debtObligations||[])
  const debtSchedule=useMemo(()=>buildDebtSchedule(obligations,months),[obligations,months])

  const unitIds=config.units.map(u=>u.id)
  const selLabel=monthLabels[selMonth]

  async function saveActuals(next){
    setActuals(next)
    setSaving(true)
    try{
      await supabase.from('monthly_actuals').upsert({client_id:'client_wonderland',month_index:selMonth,actuals_data:next[selMonth]||{},updated_at:new Date().toISOString()},{onConflict:'client_id,month_index'})
      await onSaveActuals(next)
    }catch(e){}
    setSaving(false)
  }

  async function saveObligations(next){
    setObligations(next)
    try{
      await supabase.from('model_config').upsert({client_id:'client_wonderland',config_type:'debt_obligations',config_data:next,updated_at:new Date().toISOString()},{onConflict:'client_id,config_type'})
      await onSaveDebtObligations(next)
    }catch(e){}
  }

  function setActualValue(unitId,lineType,value){
    const next={...actuals,[selMonth]:{...(actuals[selMonth]||{}),[`${unitId}_${lineType}`]:Number(value)||0}}
    setActuals(next)
  }
  function getActual(unitId,lineType){return actuals[selMonth]?.[`${unitId}_${lineType}`]??null}
  function getPlan(unitId,lineType){
    const u=result.unit[unitId]
    if(lineType==='revenue')return u.revenue[selMonth]
    if(lineType==='cogs')return u.cogs[selMonth]
    if(lineType==='opex')return u.totalOpex[selMonth]
    if(lineType==='ebitda')return u.ebitda[selMonth]
    return 0
  }

  const sectionBtn=(id,label)=>(<button onClick={()=>setActiveSection(id)} style={{fontFamily:'monospace',fontSize:'0.82rem',padding:'0.6rem 1.2rem',border:`2px solid ${activeSection===id?CC.cyan:CC.border}`,borderRadius:6,background:activeSection===id?CC.cyan:CC.white,color:activeSection===id?CC.navy:CC.slate,cursor:'pointer',fontWeight:activeSection===id?700:400,letterSpacing:'0.03em'}}>{label}</button>)

  return(
    <div>
      <div style={{display:'flex',gap:'0.5rem',marginBottom:'1.25rem',flexWrap:'wrap'}}>
        {sectionBtn('actuals','Plan vs Actuals')}
        {sectionBtn('debt','Debt Schedule')}
        {sectionBtn('summary','Summary')}
      </div>

      {activeSection==='actuals'&&(
        <div>
          {/* Month selector */}
          <div style={card}>
            <div style={{fontFamily:'Georgia,serif',fontSize:'1rem',fontWeight:700,marginBottom:'0.75rem',color:CC.navy}}>Select Month</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(12,1fr)',gap:'0.4rem'}}>
              {monthLabels.map((ml,i)=>{
                const hasData=actuals[i]&&Object.keys(actuals[i]).length>0
                const isActive=selMonth===i
                return(<button key={i} onClick={()=>setSelMonth(i)} style={{fontFamily:'monospace',fontSize:'0.72rem',padding:'0.55rem 0.3rem',border:`2px solid ${isActive?CC.cyan:hasData?CC.green:CC.border}`,borderRadius:6,background:isActive?CC.navy:hasData?'#E8F5EE':CC.white,color:isActive?CC.white:hasData?CC.green:CC.slate,cursor:'pointer',fontWeight:isActive?700:400,textAlign:'center',lineHeight:1.2}}>
                  <div>{ml}</div>
                  {hasData&&!isActive&&<div style={{fontSize:'0.6rem',marginTop:'0.1rem'}}>✓</div>}
                </button>)
              })}
            </div>
            <div style={{display:'flex',gap:'1rem',marginTop:'0.6rem',fontSize:'0.76rem',color:CC.slate}}>
              <span style={{display:'flex',alignItems:'center',gap:'0.3rem'}}><span style={{width:10,height:10,borderRadius:2,background:CC.navy,display:'inline-block'}}/> Selected</span>
              <span style={{display:'flex',alignItems:'center',gap:'0.3rem'}}><span style={{width:10,height:10,borderRadius:2,background:'#E8F5EE',border:`1px solid ${CC.green}`,display:'inline-block'}}/> Has actuals</span>
              <span style={{display:'flex',alignItems:'center',gap:'0.3rem'}}><span style={{width:10,height:10,borderRadius:2,background:CC.white,border:`1px solid ${CC.border}`,display:'inline-block'}}/> No actuals yet</span>
            </div>
          </div>

          {/* Actuals entry for selected month */}
          <div style={card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem',flexWrap:'wrap',gap:'0.5rem'}}>
              <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:CC.navy}}>{selLabel} — Plan vs Actuals Entry</div>
              <button onClick={()=>saveActuals(actuals)} style={{fontFamily:'monospace',fontSize:'0.72rem',fontWeight:700,padding:'0.42rem 1rem',border:'none',borderRadius:4,background:CC.cyan,color:CC.navy,cursor:'pointer'}}>{saving?'Saving…':'Save Actuals'}</button>
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'}}>
                <thead><tr style={{background:CC.navy,color:CC.white}}>
                  {['Business Unit','Line','Plan','Actual','Variance','Var %'].map(h=><th key={h} style={{padding:'8px 10px',textAlign:h==='Plan'||h==='Actual'||h==='Variance'||h==='Var %'?'right':'left',fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {config.units.map((u,ui)=>{
                    const lines=['revenue','cogs','opex','ebitda']
                    const lineLabels={revenue:'Revenue',cogs:'Cost of Sales',opex:'Operating Expenses',ebitda:'EBITDA'}
                    return lines.map((line,li)=>{
                      const plan=getPlan(u.id,line)
                      const actual=getActual(u.id,line)
                      const variance=actual!==null?actual-plan:null
                      const varPct=actual!==null&&plan!==0?(actual-plan)/Math.abs(plan):null
                      const isEbitda=line==='ebitda'
                      return(<tr key={`${u.id}_${line}`} style={{background:(ui+li)%2===0?CC.cream:CC.white}}>
                        <td style={{padding:'7px 10px',fontWeight:li===0?700:400,color:CC.navy}}>{li===0?u.name:''}</td>
                        <td style={{padding:'7px 10px',color:CC.slate,fontSize:'0.78rem'}}>{lineLabels[line]}</td>
                        <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'monospace'}}>{compactCurrency(plan,cc)}</td>
                        <td style={{padding:'4px 6px',textAlign:'right'}}>
                          {line==='ebitda'?<span style={{fontFamily:'monospace',fontSize:'0.78rem',color:actual!==null?CC.navy:CC.slate}}>{actual!==null?compactCurrency(actual,cc):'auto'}</span>:(
                            <input type="number" value={actual??''} onChange={e=>setActualValue(u.id,line,e.target.value)} placeholder="Enter actual" style={{...inp,width:130,textAlign:'right',padding:'0.28rem 0.4rem',fontSize:'0.78rem'}}/>
                          )}
                        </td>
                        <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'monospace',color:variance===null?CC.slate:variance>=0?CC.green:CC.red,fontWeight:isEbitda?700:400}}>{variance!==null?compactCurrency(variance,cc):'—'}</td>
                        <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'monospace',fontSize:'0.78rem',color:varPct===null?CC.slate:varPct>=0?CC.green:CC.red}}>{varPct!==null?pct(varPct):'—'}</td>
                      </tr>)
                    })
                  })}
                  {/* Consolidated row */}
                  {['revenue','cogs','ebitda'].map(line=>{
                    const plan=result.consolidated[line==='cogs'?'cogs':line==='ebitda'?'ebitda':'revenue'][selMonth]
                    const actual=config.units.reduce((sum,u)=>{const v=getActual(u.id,line);return v!==null?sum+(v||0):null},0)
                    const variance=actual!==null?actual-plan:null
                    const varPct=actual!==null&&plan!==0?(actual-plan)/Math.abs(plan):null
                    return(<tr key={`con_${line}`} style={{background:CC.navy}}>
                      <td style={{padding:'7px 10px',fontWeight:700,color:CC.white}}>{line==='revenue'?'CONSOLIDATED':''}</td>
                      <td style={{padding:'7px 10px',color:CC.cyan,fontWeight:600,fontSize:'0.78rem'}}>{line==='revenue'?'Total Revenue':line==='cogs'?'Total Cost of Sales':'Total EBITDA'}</td>
                      <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'monospace',color:CC.white}}>{compactCurrency(plan,cc)}</td>
                      <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'monospace',color:CC.white}}>{actual!==null?compactCurrency(actual,cc):'—'}</td>
                      <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'monospace',color:variance===null?'rgba(255,255,255,0.5)':variance>=0?'#7DCEA0':CC.red,fontWeight:700}}>{variance!==null?compactCurrency(variance,cc):'—'}</td>
                      <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'monospace',fontSize:'0.78rem',color:varPct===null?'rgba(255,255,255,0.5)':varPct>=0?'#7DCEA0':CC.red}}>{varPct!==null?pct(varPct):'—'}</td>
                    </tr>)
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 12-month actuals summary */}
          <MonthlyTable title="Plan vs Actuals — Consolidated Revenue (all months entered)" rows={[
            {label:'Plan Revenue',values:result.consolidated.revenue.slice(0,12),cc},
            {label:'Actual Revenue',values:monthLabels.slice(0,12).map((_,i)=>{const v=config.units.reduce((s,u)=>s+(actuals[i]?.[`${u.id}_revenue`]??0),0);return v>0?v:null}).map(v=>v??0),cc},
            {label:'Variance',values:monthLabels.slice(0,12).map((_,i)=>{const a=config.units.reduce((s,u)=>s+(actuals[i]?.[`${u.id}_revenue`]??0),0);return a>0?a-result.consolidated.revenue[i]:0}),highlight:true,cc},
          ]} months={monthLabels.slice(0,12)}/>
        </div>
      )}

      {activeSection==='debt'&&(
        <div>
          <div style={card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
              <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:CC.navy}}>Debt and Grant Obligations</div>
              <button onClick={()=>{const newOb={id:`ob_${Date.now()}`,name:'New Loan',lender:'',type:'commercial_loan',principal:0,annualRate:0.18,tenorMonths:24,repaymentType:'reducing_balance',frequency:'monthly',gracePeriodMonths:0,drawdownMonth:1,seasonalMonths:[]};const next=[...obligations,newOb];saveObligations(next)}} style={{fontFamily:'monospace',fontSize:'0.72rem',padding:'0.38rem 0.8rem',border:`1px solid ${CC.cyan}`,borderRadius:4,background:'transparent',color:CC.cyan,cursor:'pointer'}}>+ Add Obligation</button>
            </div>
            {obligations.length===0&&<p style={{color:CC.slate,fontSize:'0.85rem'}}>No debt obligations entered. Click above to add a loan, recoverable grant, or commercial obligation.</p>}
            {obligations.map((ob,idx)=>(
              <div key={ob.id} style={{border:`1px solid ${CC.border}`,borderRadius:6,padding:'1rem',marginBottom:'0.75rem',background:CC.lightBg}}>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'0.75rem',marginBottom:'0.75rem'}}>
                  <div><label style={lbl}>Name</label><input style={inp} value={ob.name} onChange={e=>{const next=[...obligations];next[idx]={...next[idx],name:e.target.value};saveObligations(next)}}/></div>
                  <div><label style={lbl}>Lender</label><input style={inp} value={ob.lender} onChange={e=>{const next=[...obligations];next[idx]={...next[idx],lender:e.target.value};saveObligations(next)}}/></div>
                  <div><label style={lbl}>Type</label><select style={inp} value={ob.type} onChange={e=>{const next=[...obligations];next[idx]={...next[idx],type:e.target.value};saveObligations(next)}}><option value="commercial_loan">Commercial Loan</option><option value="recoverable_grant">Recoverable Grant</option><option value="non_recoverable_grant">Non-Recoverable Grant</option></select></div>
                  <div><label style={lbl}>Principal (UGX)</label><input type="number" style={inp} value={ob.principal} onChange={e=>{const next=[...obligations];next[idx]={...next[idx],principal:Number(e.target.value)};saveObligations(next)}}/></div>
                  <div><label style={lbl}>Annual Interest Rate (%)</label><input type="number" step="0.1" style={inp} value={(ob.annualRate||0)*100} onChange={e=>{const next=[...obligations];next[idx]={...next[idx],annualRate:Number(e.target.value)/100};saveObligations(next)}}/></div>
                  <div><label style={lbl}>Tenor (months)</label><input type="number" style={inp} value={ob.tenorMonths} onChange={e=>{const next=[...obligations];next[idx]={...next[idx],tenorMonths:Number(e.target.value)};saveObligations(next)}}/></div>
                  <div><label style={lbl}>Repayment Type</label><select style={inp} value={ob.repaymentType} onChange={e=>{const next=[...obligations];next[idx]={...next[idx],repaymentType:e.target.value};saveObligations(next)}}><option value="reducing_balance">Monthly Reducing Balance</option><option value="equal_instalment">Equal Instalment (EMI)</option><option value="bullet">Bullet (interest only, principal at end)</option><option value="grace_then_reducing">Grace Period then Reducing</option></select></div>
                  <div><label style={lbl}>Frequency</label><select style={inp} value={ob.frequency} onChange={e=>{const next=[...obligations];next[idx]={...next[idx],frequency:e.target.value};saveObligations(next)}}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="seasonal">Seasonal (post-harvest)</option></select></div>
                  <div><label style={lbl}>Grace Period (months)</label><input type="number" style={inp} value={ob.gracePeriodMonths||0} onChange={e=>{const next=[...obligations];next[idx]={...next[idx],gracePeriodMonths:Number(e.target.value)};saveObligations(next)}}/></div>
                  <div><label style={lbl}>Drawdown Month</label><input type="number" style={inp} value={ob.drawdownMonth||1} onChange={e=>{const next=[...obligations];next[idx]={...next[idx],drawdownMonth:Number(e.target.value)};saveObligations(next)}}/></div>
                </div>
                {ob.type!=='non_recoverable_grant'&&(()=>{
                  const sch=debtSchedule.schedules[ob.id]
                  if(!sch)return null
                  return(<div style={{background:CC.white,borderRadius:5,padding:'0.75rem',fontSize:'0.8rem',display:'flex',gap:'2rem',flexWrap:'wrap'}}>
                    <span>Total interest: <strong style={{color:CC.red}}>{compactCurrency(sch.totalInterestPaid,cc)}</strong></span>
                    <span>Total repayment: <strong style={{color:CC.navy}}>{compactCurrency(sch.totalPrincipalPaid+sch.totalInterestPaid,cc)}</strong></span>
                    <span>Outstanding M12: <strong>{compactCurrency(sch.balanceByMonth[11]||0,cc)}</strong></span>
                  </div>)
                })()}
                <button onClick={()=>{const next=obligations.filter((_,i)=>i!==idx);saveObligations(next)}} style={{fontSize:'0.74rem',color:CC.red,background:'transparent',border:'none',cursor:'pointer',textDecoration:'underline',marginTop:'0.5rem'}}>Remove</button>
              </div>
            ))}
          </div>

          {obligations.length>0&&(
            <>
              <MonthlyTable title="Debt Service Schedule — Year 1 (monthly)" rows={[
                {label:'Total Interest',values:debtSchedule.totalInterest.slice(0,12),cc},
                {label:'Total Principal',values:debtSchedule.totalPrincipal.slice(0,12),cc},
                {label:'Total Debt Service',values:debtSchedule.totalRepayment.slice(0,12),bold:true,highlight:true,cc},
                {label:'Outstanding Balance',values:debtSchedule.totalOutstanding.slice(0,12),cc},
              ]} months={monthLabels.slice(0,12)}/>
              <MonthlyTable title="Debt Service Schedule — Year 2 (monthly)" rows={[
                {label:'Total Interest',values:debtSchedule.totalInterest.slice(12,24),cc},
                {label:'Total Principal',values:debtSchedule.totalPrincipal.slice(12,24),cc},
                {label:'Total Debt Service',values:debtSchedule.totalRepayment.slice(12,24),bold:true,highlight:true,cc},
                {label:'Outstanding Balance',values:debtSchedule.totalOutstanding.slice(12,24),cc},
              ]} months={monthLabels.slice(12,24)}/>
            </>
          )}
        </div>
      )}

      {activeSection==='summary'&&(
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
            <HeroCard label="Months with Actuals" value={Object.keys(actuals).filter(k=>Object.keys(actuals[k]||{}).length>0).length} sub="of 24 months"/>
            <HeroCard label="Total Debt Service Y1" value={compactCurrency(debtSchedule.totalRepayment.slice(0,12).reduce((a,b)=>a+b,0),cc)} sub="Interest + Principal"/>
            <HeroCard label="Outstanding Balance M12" value={compactCurrency(debtSchedule.totalOutstanding[11]||0,cc)}/>
            <HeroCard label="Obligations Entered" value={obligations.length}/>
          </div>
          <MonthlyTable title="Plan Revenue vs Actuals Revenue — Full 24 months" rows={[
            {label:'Plan',values:result.consolidated.revenue,cc},
            {label:'Actuals (entered months)',values:Array(24).fill(0).map((_,i)=>{const v=config.units.reduce((s,u)=>s+(actuals[i]?.[`${u.id}_revenue`]??0),0);return v}),cc},
          ]} months={monthLabels}/>
        </div>
      )}
    </div>
  )
}

// ─── OPERATIONAL CASHFLOW VIEW ────────────────────────────────
function OperationalCashflowView({result,actuals,debtObligations,monthLabels,cc,config}){
  const months=MONTHS_HORIZON
  const debtSchedule=useMemo(()=>buildDebtSchedule(debtObligations||[],months),[debtObligations,months])

  // Build operational cashflow from actual cash movements, not P&L lines.
  // Money In = cash collected from customers (revenue minus credit extended, plus credit repaid)
  // Money Out = cash paid to suppliers + staff + overheads + debt service + grant repayment
  // This avoids double-counting the working capital adjustment.

  const moneyIn=Array(months).fill(0)
  const moneyOutBreakdown={suppliers:Array(months).fill(0),staff:Array(months).fill(0),overheads:Array(months).fill(0),debtService:Array(months).fill(0),grantRepay:Array(months).fill(0)}
  const moneyOut=Array(months).fill(0)

  for(let m=0;m<months;m++){
    // Money in: operating cash inflow = NPAT + depreciation (none here) - grant forgiveness (non-cash) + WC movement
    // Simplified: use the model's operating cash flow directly, which already accounts for WC timing correctly
    // Then layer actual revenue variance on top where actuals exist
    const planOperatingCash=result.cashFlow.operatingCash[m]
    // Adjust for actuals if entered -- if actual revenue differs from plan, shift the difference into cash
    const actualRev=config.units.reduce((s,u)=>s+(actuals[m]?.[`${u.id}_revenue`]??0),0)
    const planRev=result.consolidated.revenue[m]
    const revVariance=actualRev>0?actualRev-planRev:0
    // Money in = model operating cash inflow (already WC adjusted) + revenue variance + financing inflows
    const financingIn=result.cashFlow.financingCash[m]>0?result.cashFlow.financingCash[m]:0
    moneyIn[m]=Math.max(0,planOperatingCash+revVariance+financingIn)

    // Money out = operating cash outflows + additional debt service entered manually + grant repayments
    const operatingOutflow=planOperatingCash<0?Math.abs(planOperatingCash):0
    const extraDebtService=debtSchedule.totalRepayment[m] // user-entered obligations on top of model
    const grantRepay=result.cashFlow.financingCash[m]<0?Math.abs(result.cashFlow.financingCash[m]):0
    moneyOut[m]=operatingOutflow+extraDebtService+grantRepay

    moneyOutBreakdown.debtService[m]=extraDebtService
    moneyOutBreakdown.grantRepay[m]=grantRepay
  }

  const net=moneyIn.map((v,i)=>v-moneyOut[i])
  const cumulative=[];let cum=0;for(let m=0;m<months;m++){cum+=net[m];cumulative.push(cum)}

  // Only flag as pressure months where net is meaningfully negative (>50k threshold to avoid rounding noise)
  const pressureMonths=net.map((v,i)=>({month:monthLabels[i],idx:i,value:v})).filter(x=>x.value<-50_000)

  return(
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
        <HeroCard label="Y1 Total Money In" value={compactCurrency(moneyIn.slice(0,12).reduce((a,b)=>a+b,0),cc)}/>
        <HeroCard label="Y1 Total Money Out" value={compactCurrency(moneyOut.slice(0,12).reduce((a,b)=>a+b,0),cc)}/>
        <HeroCard label="Y1 Net Cash Position" value={compactCurrency(net.slice(0,12).reduce((a,b)=>a+b,0),cc)} color={net.slice(0,12).reduce((a,b)=>a+b,0)>=0?CC.green:CC.red}/>
        <HeroCard label="Pressure Months (Y1)" value={pressureMonths.filter(x=>monthLabels.indexOf(x.month)<12).length} color={pressureMonths.filter(x=>monthLabels.indexOf(x.month)<12).length>0?CC.amber:CC.green} sub="Months where outflows exceed inflows"/>
      </div>

      {pressureMonths.length>0&&(
        <div style={{background:CC.navy,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}}>
          <div style={{fontFamily:'monospace',fontSize:'0.72rem',letterSpacing:'0.12em',color:CC.amber,marginBottom:'0.75rem',fontWeight:700}}>CASHFLOW PRESSURE MONTHS ({pressureMonths.length})</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:'0.5rem',marginBottom:'0.75rem'}}>
            {pressureMonths.map((pm,i)=>(
              <div key={i} style={{background:'rgba(255,255,255,0.08)',borderRadius:5,padding:'0.6rem 0.8rem',borderLeft:`3px solid ${CC.amber}`}}>
                <div style={{fontFamily:'monospace',fontSize:'0.82rem',fontWeight:700,color:CC.white,marginBottom:'0.2rem'}}>{pm.month}</div>
                <div style={{fontSize:'0.8rem',color:'rgba(255,255,255,0.75)'}}>Shortfall: <strong style={{color:CC.amber}}>{compactCurrency(Math.abs(pm.value),cc)}</strong></div>
              </div>
            ))}
          </div>
          <div style={{fontSize:'0.76rem',color:'rgba(255,255,255,0.5)'}}>Review cost payment timing or accelerate receivables collection in these months.</div>
        </div>
      )}

      <MonthlyTable title="Operational Cashflow — Year 1 (Cash In vs Cash Out)" rows={[
        {label:'Cash In (Operating)',values:moneyIn.slice(0,12),cc},
        {label:'Cash Out (Operating + Debt Service)',values:moneyOut.slice(0,12).map(v=>-v),cc},
        {label:'  of which: Manual Debt Service',values:debtSchedule.totalRepayment.slice(0,12).map(v=>-v),cc},
        {label:'  of which: Grant Repayment',values:moneyOutBreakdown.grantRepay.slice(0,12).map(v=>-v),cc},
        {label:'Net Cash',values:net.slice(0,12),bold:true,cc},
        {label:'Cumulative Cash Position',values:cumulative.slice(0,12),bold:true,highlight:true,cc},
      ]} months={monthLabels.slice(0,12)} footnote="Cash In is the model operating cashflow adjusted for any actual revenue variance entered. Debt service shown is from obligations entered in the Planning tab only."/>

      <MonthlyTable title="Operational Cashflow — Year 2" rows={[
        {label:'Money In',values:moneyIn.slice(12,24),cc},
        {label:'Money Out',values:moneyOut.slice(12,24).map(v=>-v),cc},
        {label:'Net Cash',values:net.slice(12,24),bold:true,cc},
        {label:'Cumulative Cash Position',values:cumulative.slice(12,24),bold:true,highlight:true,cc},
      ]} months={monthLabels.slice(12,24)}/>

      <div style={card}>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,marginBottom:'0.75rem',color:CC.navy}}>Formal Cash Flow Statement vs Operational View</div>
        <div style={{fontSize:'0.85rem',color:CC.slate,lineHeight:1.7}}>
          <p style={{margin:'0 0 0.5rem'}}><strong style={{color:CC.navy}}>Operational Cashflow (this view)</strong> shows money actually moving in and out each month -- when revenue is collected, when costs are paid, when debt is serviced. It tells you whether you can meet your obligations next month.</p>
          <p style={{margin:0}}><strong style={{color:CC.navy}}>Formal Cash Flow Statement (Cash Flow tab)</strong> follows accounting conventions -- operating, investing, and financing activities separated. Required for funder reporting and financial statements.</p>
        </div>
      </div>
    </div>
  )
}

// ─── SCENARIO BUILDER ────────────────────────────────────────
function ScenarioBuilder({config,overrides,result,baseResult,onApply,monthLabels,cc}){
  const [local,setLocal]=useState(overrides)
  const liveResult=useMemo(()=>runModel(config,{overrides:local}),[config,local])
  function update(f,v){setLocal(p=>({...p,[f]:v}))}
  const m=liveResult.metrics,bm=baseResult.metrics,deltaEbitda=m.year1EBITDA-bm.year1EBITDA
  return(
    <div>
      <div style={card}>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,marginBottom:'1rem',color:CC.navy}}>Grant Negotiation</div>
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
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,marginBottom:'1rem',color:CC.navy}}>Credit Terms & Aggregation</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'1rem'}}>
          <div><label style={lbl}>Aggregation model</label><select style={inp} value={local.aggregationModel} onChange={e=>update('aggregationModel',e.target.value)}><option value="commission">Commission only</option><option value="spread">Spread only</option><option value="both">Both</option></select></div>
          <div><label style={lbl}>Commission %</label><input type="number" style={inp} value={(local.commissionPctOverride??0.10)*100} onChange={e=>update('commissionPctOverride',Number(e.target.value)/100)}/></div>
          <div><label style={lbl}>Bank loan (UGX)</label><input type="number" style={inp} value={(local.financingOverrides||{}).bankLoan??0} onChange={e=>update('financingOverrides',{...local.financingOverrides,bankLoan:Number(e.target.value)})}/></div>
          <div><label style={lbl}>Interest rate (% annual)</label><input type="number" style={inp} value={((local.financingOverrides||{}).annualInterestRate??0.18)*100} onChange={e=>update('financingOverrides',{...local.financingOverrides,annualInterestRate:Number(e.target.value)/100})}/></div>
        </div>
      </div>
      <div style={{background:CC.navy,borderRadius:8,padding:'1rem 1.25rem',marginBottom:'1.25rem'}}>
        <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.12em',color:CC.cyan,marginBottom:'0.5rem'}}>IMPACT VS BASE CASE</div>
        <Flag type={deltaEbitda>=0?'ok':'warn'}>Year 1 EBITDA {deltaEbitda>=0?'improves':'worsens'} by {currency(Math.abs(deltaEbitda),cc)} — from {currency(bm.year1EBITDA,cc)} to {currency(m.year1EBITDA,cc)}.</Flag>
        <div style={{marginTop:'0.4rem'}}><Flag type={m.minCashBalance>=0?'ok':'warn'}>Lowest cash: {currency(m.minCashBalance,cc)} at Month {m.minCashMonth}.</Flag></div>
      </div>
      <MonthlyTable title="Scenario vs Base Case — Year 1 Cash" rows={[{label:'This Scenario',values:liveResult.cashFlow.closingCash.slice(0,12),bold:true,cc},{label:'Base Case',values:baseResult.cashFlow.closingCash.slice(0,12),cc}]} months={monthLabels.slice(0,12)}/>
      <button onClick={()=>onApply(local)} style={{fontFamily:'monospace',fontSize:'0.8rem',fontWeight:700,padding:'0.65rem 1.5rem',border:'none',borderRadius:4,background:CC.cyan,color:CC.navy,cursor:'pointer'}}>Apply as active scenario</button>
    </div>
  )
}

// ─── MAIN COMPONENT ──────────────────────────────────────────
export default function WonderlandDashboard(){
  const config=useMemo(()=>wonderlandConfig(),[])
  const monthLabels=useMemo(()=>buildMonthLabels(config.meta.modelStartDate),[config])
  const cc=config.meta.currency

  const [overrides,setOverrides]=useState(defaultOverrides())
  const [actuals,setActuals]=useState({})
  const [debtObligations,setDebtObligations]=useState([])
  const [view,setView]=useState('overview')
  const [activeUnit,setActiveUnit]=useState('fge')
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)

  useEffect(()=>{
    async function load(){
      try{
        const {data:{user}}=await supabase.auth.getUser()
        if(user){
          const [{data:cfg},{data:acts}]=await Promise.all([
            supabase.from('model_config').select('config_data,config_type').eq('client_id','client_wonderland'),
            supabase.from('monthly_actuals').select('month_index,actuals_data').eq('client_id','client_wonderland')
          ])
          if(cfg){
            const scen=cfg.find(r=>r.config_type==='scenario_overrides')
            if(scen?.config_data)setOverrides({...defaultOverrides(),...scen.config_data})
            const debt=cfg.find(r=>r.config_type==='debt_obligations')
            if(debt?.config_data)setDebtObligations(debt.config_data)
            const assess=cfg.find(r=>r.config_type==='coach_assessments')
            if(assess?.config_data)setSavedAssessments(assess.config_data)
          }
          if(acts){
            const actObj={}
            acts.forEach(row=>{actObj[row.month_index]=row.actuals_data})
            setActuals(actObj)
          }
        }
      }catch(e){}
      finally{setLoading(false)}
    }
    load()
  },[])

  async function persist(nextOverrides){
    setOverrides(nextOverrides);setSaving(true)
    try{await supabase.from('model_config').upsert({client_id:'client_wonderland',config_type:'scenario_overrides',config_data:nextOverrides,updated_at:new Date().toISOString()},{onConflict:'client_id,config_type'})}catch(e){}
    setSaving(false)
  }

  const baseOverrides=useMemo(()=>({aggregationModel:'commission',commissionPctOverride:0.10,grantForgivenessOverrides:{csj_recoverable:0.33}}),[])
  const result=useMemo(()=>runModel(config,{overrides}),[config,overrides])
  const baseResult=useMemo(()=>runModel(config,{overrides:baseOverrides}),[config,baseOverrides])

  if(loading)return<div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",padding:'3rem',color:CC.navy,background:CC.cream,minHeight:'100vh'}}>Loading Wonderland…</div>

  const {consolidated:con,metrics}=result

  const navItems=[['overview','Overview'],['units','Business Units'],['planning','Planning & Actuals'],['analytics','Analytics'],['opcashflow','Operational Cashflow'],['cashflow','Cash Flow Statement'],['workingcapital','Working Capital'],['balancesheet','Balance Sheet'],['fges','FGE Roster'],['scenarios','Scenario Builder']]

  return(
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:CC.cream,color:CC.navy,minHeight:'100vh'}}>
      <header style={{background:CC.navy,borderBottom:`3px solid ${CC.cyan}`}}>
        <div style={{maxWidth:1500,margin:'0 auto',padding:'1.25rem 1.5rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'1rem',marginBottom:'1rem'}}>
            <div>
              <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.15em',color:CC.cyan,marginBottom:'0.25rem'}}>CANVAS COACH — CLEARVIEW</div>
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
              <button key={id} onClick={()=>setView(id)} style={{fontFamily:'monospace',fontSize:'0.7rem',padding:'0.5rem 0.9rem',border:'none',background:'transparent',color:view===id?CC.cyan:'rgba(255,255,255,0.7)',cursor:'pointer',borderBottom:view===id?`2px solid ${CC.cyan}`:'2px solid transparent',fontWeight:view===id?700:400,fontSize:'0.82rem'}}>{label}</button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{maxWidth:1500,margin:'0 auto',padding:'1.5rem'}}>

        {view==='overview'&&(
          <div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
              <HeroCard label="Year 1 Revenue" value={compactCurrency(metrics.year1Revenue,cc)} sub={`Gross margin ${pct(metrics.grossMarginY1)}`}/>
              <HeroCard label="Year 1 EBITDA" value={compactCurrency(metrics.year1EBITDA,cc)} color={metrics.year1EBITDA>=0?CC.green:CC.red} sub={`Net profit ${compactCurrency(metrics.year1NPAT,cc)}`}/>
              <HeroCard label="Year 2 Revenue" value={compactCurrency(metrics.year2Revenue,cc)} sub={`EBITDA ${compactCurrency(metrics.year2EBITDA,cc)}`}/>
              <HeroCard label="FGEs" value={metrics.totalCounterpartyGroups}/>
              <HeroCard label="Min Cash" value={compactCurrency(metrics.minCashBalance,cc)} color={metrics.minCashBalance<0?CC.red:CC.navy} sub={`Month ${metrics.minCashMonth}`}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
              {config.units.map(u=>{const ud=result.unit[u.id];const y1Rev=ud.revenue.slice(0,12).reduce((a,b)=>a+b,0);const y1Ebitda=ud.ebitda.slice(0,12).reduce((a,b)=>a+b,0);return(<div key={u.id} style={{background:CC.white,border:`1px solid ${CC.border}`,borderTop:`4px solid ${u.color}`,borderRadius:6,padding:'1rem 1.1rem'}}><div style={{fontWeight:700,fontSize:'0.88rem',marginBottom:'0.35rem'}}>{u.name}</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:y1Ebitda>=0?CC.green:CC.red,marginBottom:'0.2rem'}}>{compactCurrency(y1Ebitda,cc)}</div><div style={{fontSize:'0.74rem',color:CC.slate}}>Y1 EBITDA · Rev {compactCurrency(y1Rev,cc)}</div></div>)})}
            </div>
            <div style={{background:CC.navy,borderRadius:8,padding:'1rem 1.25rem',marginBottom:'1.5rem',display:'flex',flexDirection:'column',gap:'0.55rem'}}>
              <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.12em',color:CC.cyan,marginBottom:'0.35rem'}}>READING THE PICTURE</div>
              {metrics.minCashBalance<0?<Flag type="warn">Cash goes negative at {currency(metrics.minCashBalance,cc)} in Month {metrics.minCashMonth}.</Flag>:<Flag type="ok">Cash stays positive — lowest {currency(metrics.minCashBalance,cc)}.</Flag>}
              {metrics.year1EBITDA<0?<Flag type="warn">Year 1 EBITDA negative at {currency(metrics.year1EBITDA,cc)}.</Flag>:<Flag type="ok">Year 1 EBITDA positive at {currency(metrics.year1EBITDA,cc)} — gross margin {pct(metrics.grossMarginY1)}.</Flag>}
              <Flag type="info">Average FGE input credit outstanding: {currency(metrics.avgWorkingCapitalRequirement,cc)}, peak {currency(metrics.maxWorkingCapitalRequirement,cc)}.</Flag>
            </div>
            <MonthlyTable title="Consolidated P&L — Year 1" rows={[
              {label:'Revenue',values:con.revenue.slice(0,12),cc},{label:'Cost of Sales',values:con.cogs.slice(0,12),cc},
              {label:'Gross Profit',values:con.grossProfit.slice(0,12),bold:true,cc},{label:'Operating Expenses',values:con.opex.slice(0,12),cc},
              {label:'EBITDA',values:con.ebitda.slice(0,12),bold:true,cc},{label:'Grant Forgiveness Gain',values:con.grantForgivenessGain.slice(0,12),cc},
              {label:'Net Profit After Tax',values:con.nptAfterTax.slice(0,12),bold:true,highlight:true,cc},
            ]} months={monthLabels.slice(0,12)}/>
          </div>
        )}

        {view==='units'&&(()=>{
          const u=result.unit[activeUnit],unitMeta=config.units.find(x=>x.id===activeUnit)
          const y1Rev=u.revenue.slice(0,12).reduce((a,b)=>a+b,0),y1GP=u.grossProfit.slice(0,12).reduce((a,b)=>a+b,0),y1Opex=u.totalOpex.slice(0,12).reduce((a,b)=>a+b,0),y1Ebitda=u.ebitda.slice(0,12).reduce((a,b)=>a+b,0)
          return(<div>
            <div style={{display:'flex',gap:'0.5rem',marginBottom:'1.25rem',flexWrap:'wrap'}}>
              {config.units.map(u=><button key={u.id} onClick={()=>setActiveUnit(u.id)} style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.45rem 0.9rem',border:`2px solid ${activeUnit===u.id?u.color:CC.border}`,borderRadius:4,background:activeUnit===u.id?CC.navy:CC.white,color:activeUnit===u.id?CC.white:CC.slate,cursor:'pointer'}}>{u.short}</button>)}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
              <HeroCard label="Year 1 Revenue" value={compactCurrency(y1Rev,cc)}/><HeroCard label="Year 1 Gross Profit" value={compactCurrency(y1GP,cc)} sub={y1Rev!==0?`Margin ${pct(y1GP/y1Rev)}`:''}/><HeroCard label="Year 1 Opex" value={compactCurrency(y1Opex,cc)}/><HeroCard label="Year 1 EBITDA" value={compactCurrency(y1Ebitda,cc)} color={y1Ebitda>=0?CC.green:CC.red}/>
            </div>
            {Object.keys(u.revenueLines).length>0&&<MonthlyTable title={`${unitMeta.name} — Revenue lines (Year 1)`} rows={Object.entries(u.revenueLines).map(([name,values])=>({label:name,values:values.slice(0,12),cc}))} months={monthLabels.slice(0,12)}/>}
            <MonthlyTable title={`${unitMeta.name} — Full P&L (Year 1)`} rows={[{label:'Revenue',values:u.revenue.slice(0,12),cc},{label:'Cost of Sales',values:u.cogs.slice(0,12),cc},{label:'Gross Profit',values:u.grossProfit.slice(0,12),bold:true,cc},{label:'Staff Cost',values:u.staffCost.slice(0,12),cc},{label:'Admin Allocated',values:u.adminAllocated.slice(0,12),cc},{label:'Direct Opex',values:u.directOpex.slice(0,12),cc},{label:'EBITDA',values:u.ebitda.slice(0,12),bold:true,highlight:true,cc}]} months={monthLabels.slice(0,12)}/>
          </div>)
        })()}

        {view==='planning'&&<PlanningActualsTab config={config} result={result} monthLabels={monthLabels} cc={cc} savedActuals={actuals} onSaveActuals={setActuals} debtObligations={debtObligations} onSaveDebtObligations={setDebtObligations}/>}

        {view==='opcashflow'&&<OperationalCashflowView result={result} actuals={actuals} debtObligations={debtObligations} monthLabels={monthLabels} cc={cc} config={config}/>}

        {view==='cashflow'&&(
          <div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
              <HeroCard label="Opening Cash" value={compactCurrency(result.cashFlow.openingCash[0],cc)}/><HeroCard label="Closing Cash M12" value={compactCurrency(result.cashFlow.closingCash[11],cc)}/><HeroCard label="Closing Cash M24" value={compactCurrency(result.cashFlow.closingCash[23],cc)}/><HeroCard label="Lowest Point" value={compactCurrency(Math.min(...result.cashFlow.closingCash),cc)} color={Math.min(...result.cashFlow.closingCash)<0?CC.red:CC.navy} sub={`Month ${result.cashFlow.closingCash.indexOf(Math.min(...result.cashFlow.closingCash))+1}`}/>
            </div>
            <MonthlyTable title="Cash Flow Statement — Year 1" rows={[{label:'Opening Cash',values:result.cashFlow.openingCash.slice(0,12),cc},{label:'Operating Cash Flow',values:result.cashFlow.operatingCash.slice(0,12),cc},{label:'Investing Cash Flow',values:result.cashFlow.investingCash.slice(0,12),cc},{label:'Financing Cash Flow',values:result.cashFlow.financingCash.slice(0,12),cc},{label:'Net Change',values:result.cashFlow.netChange.slice(0,12),bold:true,cc},{label:'Closing Cash',values:result.cashFlow.closingCash.slice(0,12),bold:true,highlight:true,cc}]} months={monthLabels.slice(0,12)}/>
            <MonthlyTable title="Cash Flow Statement — Year 2" rows={[{label:'Opening Cash',values:result.cashFlow.openingCash.slice(12,24),cc},{label:'Operating Cash Flow',values:result.cashFlow.operatingCash.slice(12,24),cc},{label:'Financing Cash Flow',values:result.cashFlow.financingCash.slice(12,24),cc},{label:'Net Change',values:result.cashFlow.netChange.slice(12,24),bold:true,cc},{label:'Closing Cash',values:result.cashFlow.closingCash.slice(12,24),bold:true,highlight:true,cc}]} months={monthLabels.slice(12,24)}/>
          </div>
        )}

        {view==='workingcapital'&&(
          <div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
              <HeroCard label="Peak Working Capital" value={compactCurrency(metrics.maxWorkingCapitalRequirement,cc)}/><HeroCard label="Average Outstanding" value={compactCurrency(metrics.avgWorkingCapitalRequirement,cc)}/><HeroCard label="FGE Count" value={metrics.totalCounterpartyGroups}/>
            </div>
            <MonthlyTable title="FGE Input Credit Outstanding — Year 1" rows={[{label:'Input Credit Outstanding',values:result.creditReceivables.slice(0,12),bold:true,highlight:true,cc},{label:'Working Capital Movement',values:result.cashFlow.workingCapitalMovement.slice(0,12),cc}]} months={monthLabels.slice(0,12)}/>
            {Object.entries(result.rollingFunds).map(([fid,fund])=>(<MonthlyTable key={fid} title={`${fund.name} — Year 1`} rows={[{label:'Fund Balance',values:fund.fundBalanceByMonth.slice(0,12),bold:true,highlight:true,cc},{label:'Contributions In',values:fund.fundContributions.slice(0,12),cc},{label:'Disbursements Out',values:fund.fundDisbursements.slice(0,12),cc}]} months={monthLabels.slice(0,12)} footnote={fund.fundShortfallMonths.length>0?`Shortfall in: ${fund.fundShortfallMonths.map(s=>`Month ${s.month}`).join(', ')}`:'Rolling fund managed for FGE benefit.'}/>))}
          </div>
        )}

        {view==='balancesheet'&&(
          <div>
            <MonthlyTable title="Balance Sheet — Year 1" rows={[{label:'Loan to Rolling Funds',values:result.balanceSheet.loanToRollingFunds.slice(0,12),cc},{label:'Cash & Bank',values:result.balanceSheet.cash.slice(0,12),cc},{label:'FGE Input Receivables',values:result.balanceSheet.creditReceivables.slice(0,12),cc},{label:'Total Assets',values:result.balanceSheet.totalAssets.slice(0,12),bold:true,cc},{label:'Share Capital',values:result.balanceSheet.shareCapital.slice(0,12),cc},{label:'Non-Repayable Grant (Equity)',values:result.balanceSheet.grantEquity.slice(0,12),cc},{label:'Retained Earnings',values:result.balanceSheet.retainedEarnings.slice(0,12),cc},{label:'Total Equity',values:result.balanceSheet.totalEquity.slice(0,12),bold:true,cc},{label:'Recoverable Grant Outstanding',values:result.balanceSheet.grantsOutstanding.slice(0,12),cc},{label:'Loans Outstanding',values:result.balanceSheet.loansOutstanding.slice(0,12),cc},{label:'Total Liabilities',values:result.balanceSheet.totalLiabilities.slice(0,12),bold:true,highlight:true,cc}]} months={monthLabels.slice(0,12)} footnote="Total Assets = Total Equity + Total Liabilities."/>
          </div>
        )}

        {view==='fges'&&(
          <div style={card}>
            <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,marginBottom:'1rem'}}>FGE Roster ({config.counterpartyGroups.length} groups)</div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'}}>
                <thead><tr style={{background:CC.navy,color:CC.white}}>{['Name','Location','Members','Recruited','Tomatoes (ac)','Onions (ac)','Credit Term'].map(h=><th key={h} style={{padding:'8px 10px',textAlign:'left',fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
                <tbody>{config.counterpartyGroups.map((g,i)=>{const p=(g.allocationPeriods||[])[0];return(<tr key={g.id} style={{background:i%2===0?CC.cream:CC.white}}><td style={{padding:'7px 10px',fontWeight:600}}>{g.name}</td><td style={{padding:'7px 10px'}}>{g.location}</td><td style={{padding:'7px 10px'}}>{g.memberCount}</td><td style={{padding:'7px 10px'}}>M{g.recruitedMonth}</td><td style={{padding:'7px 10px'}}>{p?.allocations?.tomatoes||0}</td><td style={{padding:'7px 10px'}}>{p?.allocations?.onions||0}</td><td style={{padding:'7px 10px'}}>{g.creditTerm.value} {g.creditTerm.unit}</td></tr>)})}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view==='analytics'&&<AnalyticsView
          result={result}
          debtObligations={debtObligations}
          monthLabels={monthLabels}
          cc={cc}
          clientName="Wonderland Farm Services"
          savedAssessments={savedAssessments}
          onSaveAssessments={async(assess)=>{
            setSavedAssessments(assess)
            try{await supabase.from('model_config').upsert({client_id:'client_wonderland',config_type:'coach_assessments',config_data:assess,updated_at:new Date().toISOString()},{onConflict:'client_id,config_type'})}catch(e){}
          }}
        />}

        {view==='scenarios'&&<ScenarioBuilder config={config} overrides={overrides} result={result} baseResult={baseResult} onApply={persist} monthLabels={monthLabels} cc={cc}/>}

      </main>
      <footer style={{textAlign:'center',padding:'1.5rem',fontFamily:'monospace',fontSize:'0.67rem',color:CC.slate,borderTop:`1px solid ${CC.border}`}}>Canvas Coach · Clearview · Wonderland Farm Services · habibonifade.com</footer>
    </div>
  )
}
