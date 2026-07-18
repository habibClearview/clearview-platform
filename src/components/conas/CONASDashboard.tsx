// @ts-nocheck
'use client'
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const CONAS_CLIENT_ID = '1556298e-5fa0-4d6a-ae86-da8c708ec6ee'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  defaultCONASInputs, runCONASModel, buildMonthLabels,
  fmt, fmtFull, pct, MONTHS,
  blankPlanLine, spreadPlanLine, serviceFeePlanLine,
  type CONASInputs, type PlanLine, type PlanLineType, type SpendingRequest, type BusinessUnit,
} from '@/lib/conas-engine'
import type { UserRole } from '@/lib/auth/types'
import { roleLabel } from '@/lib/auth/types'
import UserManagement from '@/components/auth/UserManagement'
import { computeScores, buildDebtSchedule, defaultCoachAssessment, dscrLabel, dscrColor } from '@/lib/scoring-engine'

// ── Permissions prop ──────────────────────────────────────────
export interface DashboardPermissions {
  role: UserRole
  fullName: string
  userName?: string
  userId?: string
  clientId?: string
  businessUnit?: string
  canSeeAllUnits: boolean
  canEditPlan: boolean
  canLockPlan: boolean
  canApprove: boolean
  canSubmitRequest: boolean
  canEnterActuals: boolean
  assignedUnitIds: string[]
  onSignOut: () => void
}

const FULL_PERMISSIONS: DashboardPermissions = {
  role: 'ceo', fullName: 'CEO', userName: 'CEO', userId: '', clientId: 'conas',
  businessUnit: '', canSeeAllUnits: true, canEditPlan: true, canLockPlan: true,
  canApprove: true, canSubmitRequest: true, canEnterActuals: true,
  assignedUnitIds: [], onSignOut: () => {},
}

// ── Design tokens ───────────────────────────────────────────
const C = {
  navy:'#1B2A4A', cyan:'#00B4D8', cream:'#F8F4EE', white:'#FFFFFF',
  slate:'#4A5A6A', border:'#D8E0E8', teal:'#1A9DAA',
  red:'#C0392B', green:'#1A7A4A', amber:'#B8860B',
  planBg:'#FFFFFF', actualBg:'#E8F6F8', varBg:'#FFF9ED',
}

// ── Style helpers ───────────────────────────────────────────
const card: React.CSSProperties   = {background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}
const secH: React.CSSProperties   = {fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy,marginBottom:'0.75rem'}
const inp:  React.CSSProperties   = {width:'100%',padding:'0.42rem 0.6rem',border:`1px solid ${C.border}`,borderRadius:4,fontSize:'0.83rem',fontFamily:'inherit',background:'#F4F8FC',color:C.navy,boxSizing:'border-box'}
const lbl:  React.CSSProperties   = {display:'block',fontWeight:600,fontSize:'0.8rem',marginBottom:'0.22rem',color:C.navy}
const hint: React.CSSProperties   = {fontSize:'0.7rem',color:C.slate,lineHeight:1.4,marginTop:'0.18rem'}
const fGrid:React.CSSProperties   = {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:'1.1rem'}
const kpiGrid:React.CSSProperties = {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:'1rem',marginBottom:'1.25rem'}
const addBtn=(sm=false):React.CSSProperties=>({fontFamily:'monospace',fontSize:sm?'0.68rem':'0.72rem',padding:sm?'0.28rem 0.6rem':'0.38rem 0.8rem',border:`1px solid ${C.cyan}`,borderRadius:4,background:'transparent',color:C.cyan,cursor:'pointer'})
const delBtn:React.CSSProperties  = {fontSize:'0.68rem',color:C.red,background:'transparent',border:`1px solid ${C.border}`,borderRadius:3,cursor:'pointer',padding:'0.18rem 0.42rem'}

function navBtn(active:boolean):React.CSSProperties{
  return{fontFamily:'monospace',fontSize:'0.72rem',padding:'0.72rem 1rem',border:'none',background:'transparent',
    color:active?C.cyan:'rgba(255,255,255,0.6)',cursor:'pointer',
    borderBottom:active?`3px solid ${C.cyan}`:'3px solid transparent',
    fontWeight:active?700:400,whiteSpace:'nowrap'}
}

// ── Shared components ───────────────────────────────────────
function KPI({label,value,sub,color,onClick}:{label:string;value:string;sub?:string;color?:string;onClick?:()=>void}){
  return(
    <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1rem 1.1rem',cursor:onClick?'pointer':undefined}} onClick={onClick}>
      <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.1em',color:C.slate,textTransform:'uppercase',marginBottom:'0.28rem'}}>{label}</div>
      <div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:color||C.navy,marginBottom:'0.18rem'}}>{value}</div>
      {sub&&<div style={{fontSize:'0.7rem',color:C.slate}}>{sub}</div>}
    </div>
  )
}

function Flag({type,children}:{type:'warn'|'ok'|'info';children:React.ReactNode}){
  const col=type==='warn'?C.red:type==='ok'?C.green:C.cyan
  return(
    <div style={{display:'flex',gap:'0.55rem',alignItems:'flex-start',fontSize:'0.82rem',lineHeight:1.55,marginBottom:'0.42rem'}}>
      <span style={{width:8,height:8,borderRadius:'50%',background:col,marginTop:'0.45rem',flexShrink:0}}/>
      <span>{children}</span>
    </div>
  )
}


// ============================================================
// ADDITIONS TO CONASDashboard.tsx
// These go BEFORE the main CONASDashboard component export
// ============================================================

// ── ENGAGEMENT CLOSE (CONAS version) ────────────────────────
function ConasEngagementClose({score,classification,classColor,gcScore,gcRating,gcColor,irScore,irTier,irColor,hasDebt,dscrMin,cashGaps,assess,cc}:{score:number;classification:string;classColor:string;gcScore:number;gcRating:string;gcColor:string;irScore:number;irTier:string;irColor:string;hasDebt:boolean;dscrMin:number|null;cashGaps:number;assess:Record<string,unknown>;cc:string}) {
  const viabilityRating = gcScore>=15&&score>=65?'Viable':gcScore>=10&&score>=40?'Conditionally Viable':gcScore>=7?'At Risk':'Not Viable'
  const repaymentOutlook = !hasDebt?'No Debt':dscrMin===null?'Not Yet Due':dscrMin>=1.5&&cashGaps===0?'On Track':dscrMin>=1.0?'Watch':dscrMin>=0.5?'At Risk':'Default Risk'
  const viabilityColor = viabilityRating==='Viable'?C.green:viabilityRating==='Conditionally Viable'?C.teal:viabilityRating==='At Risk'?C.amber:C.red
  const repayColor = repaymentOutlook==='On Track'||repaymentOutlook==='No Debt'?C.green:repaymentOutlook==='Watch'||repaymentOutlook==='Not Yet Due'?C.amber:C.red
  const exitRec = viabilityRating==='Viable'?'Business is viable for independent operation. Maintain agreed monitoring rhythm.':viabilityRating==='Conditionally Viable'?'Business can close engagement with conditions. Specific actions below must be completed before the consultant fully exits.':viabilityRating==='At Risk'?'Engagement close requires an active support plan. Business needs structured follow-on support for at least 6 months post-engagement.':'Do not close without a remediation plan in place.'
  const immediateList = assess.immediateActions?(assess.immediateActions as string).split('\n').filter(Boolean):[cashGaps>0?'Identify short-term liquidity facility to cover cash-negative months.':null,(hasDebt&&dscrMin!==null&&dscrMin<1.0)?'Review and renegotiate repayment schedule with financing partners.':null,score<40?'Convene management session to review cashflow and cost structure.':null].filter(Boolean)
  const nearList = assess.nearTermActions?(assess.nearTermActions as string).split('\n').filter(Boolean):['Implement monthly cashflow tracking using Clearview.','Establish quarterly management accounts review process.',irScore<17?'Develop investment readiness improvement plan.':null].filter(Boolean)
  const followList = assess.followUp?(assess.followUp as string).split('\n').filter(Boolean):['Monthly Clearview review for 6 months post-engagement.','Annual commercial readiness reassessment.'].filter(Boolean)
  const cs = {background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}
  return (
    <div>
      <div style={{...cs,borderTop:`4px solid ${viabilityColor}`}}>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy,marginBottom:'1rem'}}>Engagement Close Assessment</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'1rem',marginBottom:'1.25rem'}}>
          {[['Viability',viabilityRating,viabilityColor],['Repayment Outlook',repaymentOutlook,repayColor],['Stability',classification,classColor],['Going Concern',gcRating,gcColor],['Investment Readiness',irTier,irColor]].map(function(item){
            return (
              <div key={item[0]} style={{background:'#F0F4F8',borderRadius:6,padding:'0.85rem'}}>
                <div style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.slate,textTransform:'uppercase',marginBottom:'0.4rem'}}>{item[0]}</div>
                <span style={{fontFamily:'monospace',fontSize:'0.78rem',fontWeight:700,padding:'0.25rem 0.65rem',borderRadius:20,background:item[2],color:C.white}}>{item[1]}</span>
              </div>
            )
          })}
        </div>
        <div style={{background:C.cream,borderRadius:6,padding:'1rem',borderLeft:`4px solid ${C.cyan}`,marginBottom:'1rem'}}>
          <div style={{fontFamily:'monospace',fontSize:'0.7rem',color:C.cyan,marginBottom:'0.4rem',fontWeight:700}}>RECOMMENDATION</div>
          <div style={{fontSize:'0.9rem',color:C.navy,lineHeight:1.6}}>{exitRec}</div>
        </div>
        {(assess.coachNotes as string)&&<div style={{background:'#FFF8E8',border:`1px solid ${C.amber}`,borderRadius:6,padding:'0.85rem'}}>
          <div style={{fontFamily:'monospace',fontSize:'0.7rem',color:C.amber,marginBottom:'0.3rem',fontWeight:700}}>COACH NOTES</div>
          <div style={{fontSize:'0.85rem',color:C.navy,lineHeight:1.6}}>{assess.coachNotes as string}</div>
        </div>}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:'1.25rem'}}>
        {([
          [C.red,'Immediate Actions (30 days)',immediateList],
          [C.amber,'Near-Term Actions (60-90 days)',nearList],
          [C.cyan,'Required Follow-Up',followList],
        ] as [string,string,(string|null|boolean)[]][]).map(function(item){
          return (
            <div key={item[1]} style={cs}>
              <div style={{fontFamily:'Georgia,serif',fontSize:'0.95rem',fontWeight:700,color:C.navy,marginBottom:'0.75rem'}}>{item[1]}</div>
              {item[2].filter(Boolean).length>0?item[2].filter(Boolean).map(function(a,i){return(<div key={i} style={{display:'flex',gap:'0.5rem',fontSize:'0.85rem',color:C.navy,marginBottom:'0.5rem',lineHeight:1.5}}><span style={{color:item[0],fontWeight:700,flexShrink:0}}>→</span>{a as string}</div>)}):<div style={{fontSize:'0.85rem',color:C.slate,fontStyle:'italic'}}>Add in Coach Assessment tab.</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── CONAS ANALYTICS TAB ──────────────────────────────────────
function ConasOperationalCashflowTab({result, months, cc}:{result:ReturnType<typeof runCONASModel>;months:string[];cc:string}) {
  const con = result.con
  const cf = result.cf
  const m = months.length

  const moneyIn = Array(m).fill(0)
  const moneyOut = Array(m).fill(0)

  for (let i = 0; i < m; i++) {
    moneyIn[i] = Math.max(0, con.ebitda[i])
    const operatingLoss = con.ebitda[i] < 0 ? Math.abs(con.ebitda[i]) : 0
    moneyOut[i] = operatingLoss + (result.cf.irrigation[i]||0) + (result.cf.approvedSpend[i]||0)
  }

  const net = moneyIn.map(function(v:number,i:number){return v - moneyOut[i]})
  const cumulative = []
  let cum = 0
  for (let i = 0; i < m; i++) { cum += net[i]; cumulative.push(cum) }

  const pressureMonths = net.map(function(v:number,i:number){return{idx:i,label:months[i],value:v}}).filter(function(x){return x.value < -50000})

  function exportOpCashflowCSV() {
    const headers = ['', ...months]
    const rows = [
      ['Cash In (Operating)', ...moneyIn.map(v=>Math.round(v))],
      ['Irrigation Outflows', ...(result.cf.irrigation||Array(m).fill(0)).map(v=>v>0?-Math.round(v):0)],
      ['Approved Spending', ...(result.cf.approvedSpend||Array(m).fill(0)).map(v=>v>0?-Math.round(v):0)],
      ['Cash Out (Total)', ...moneyOut.map(v=>-Math.round(v))],
      ['Net Cash', ...net.map(v=>Math.round(v))],
      ['Cumulative Position', ...cumulative.map(v=>Math.round(v))],
    ]
    const csv = [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv],{type:'text/csv'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href=url; a.download='Operational_Cashflow.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
        <KPI label="Total Money In" value={fmt(moneyIn.reduce(function(a:number,b:number){return a+b},0),cc)}/>
        <KPI label="Total Money Out" value={fmt(moneyOut.reduce(function(a:number,b:number){return a+b},0),cc)}/>
        <KPI label="Net Cash Position" value={fmt(net.reduce(function(a:number,b:number){return a+b},0),cc)} color={net.reduce(function(a:number,b:number){return a+b},0)>=0?C.green:C.red}/>
        <KPI label="Pressure Months" value={String(pressureMonths.length)} color={pressureMonths.length>0?C.amber:C.green} sub="Months outflows exceed inflows"/>
      </div>

      {pressureMonths.length>0&&(
        <div style={{background:C.navy,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}}>
          <div style={{fontFamily:'monospace',fontSize:'0.68rem',letterSpacing:'0.12em',color:C.amber,marginBottom:'0.75rem',fontWeight:700}}>CASHFLOW PRESSURE MONTHS ({pressureMonths.length})</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:'0.5rem',marginBottom:'0.75rem'}}>
            {pressureMonths.map(function(pm:{idx:number;label:string;value:number},i:number){return(
              <div key={i} style={{background:'rgba(255,255,255,0.08)',borderRadius:5,padding:'0.6rem 0.8rem',borderLeft:`3px solid ${C.amber}`}}>
                <div style={{fontFamily:'monospace',fontSize:'0.82rem',fontWeight:700,color:C.white,marginBottom:'0.2rem'}}>{pm.label}</div>
                <div style={{fontSize:'0.8rem',color:'rgba(255,255,255,0.75)'}}>Shortfall: <strong style={{color:C.amber}}>{fmt(Math.abs(pm.value),cc)}</strong></div>
              </div>
            )})}
          </div>
          <div style={{fontSize:'0.76rem',color:'rgba(255,255,255,0.5)'}}>Review cost payment timing or accelerate receivables collection in these months.</div>
        </div>
      )}

      <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}><div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy}}>Operational Cashflow (Cash In vs Cash Out)</div><div style={{display:'flex',gap:'0.4rem'}}><button style={{fontFamily:'monospace',fontSize:'0.65rem',background:'transparent',border:`1px solid ${C.border}`,borderRadius:3,color:C.slate,cursor:'pointer',padding:'0.15rem 0.5rem'}} onClick={()=>window.print()}>Print</button><button style={{fontFamily:'monospace',fontSize:'0.65rem',background:'transparent',border:`1px solid ${C.border}`,borderRadius:3,color:C.slate,cursor:'pointer',padding:'0.15rem 0.5rem'}} onClick={exportOpCashflowCSV}>Export CSV</button></div></div>
        <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.75rem',fontFamily:'monospace'}}>
          <thead><tr style={{background:C.navy,color:C.white}}>
            <th style={{padding:'7px 10px',textAlign:'left',minWidth:160}}>Line</th>
            {months.map(function(m:string,i:number){return <th key={i} style={{padding:'7px 8px',textAlign:'right',whiteSpace:'nowrap'}}>{m}</th>})}
          </tr></thead>
          <tbody>
            <tr style={{background:'#F8F4EE'}}><td style={{padding:'6px 10px',fontWeight:600}}>Cash In (Operating)</td>{moneyIn.map(function(v:number,i:number){return <td key={i} style={{padding:'6px 8px',textAlign:'right',color:C.green}}>{fmt(v,cc)}</td>})}</tr>
            <tr><td style={{padding:'6px 10px',fontWeight:600}}>Irrigation Outflows</td>{(result.cf.irrigation||Array(m).fill(0)).map(function(v:number,i:number){return <td key={i} style={{padding:'6px 8px',textAlign:'right',color:v>0?C.red:C.slate}}>{v>0?fmt(-v,cc):' - '}</td>})}</tr>
            <tr><td style={{padding:'6px 10px',fontWeight:600}}>Approved Spending</td>{(result.cf.approvedSpend||Array(m).fill(0)).map(function(v:number,i:number){return <td key={i} style={{padding:'6px 8px',textAlign:'right',color:v>0?C.red:C.slate}}>{v>0?fmt(-v,cc):' - '}</td>})}</tr>
            <tr style={{background:'#F0F4F8'}}><td style={{padding:'6px 10px',fontWeight:700}}>Cash Out (Total)</td>{moneyOut.map(function(v:number,i:number){return <td key={i} style={{padding:'6px 8px',textAlign:'right',fontWeight:700,color:C.red}}>{fmt(-v,cc)}</td>})}</tr>
            <tr style={{background:'#E8ECF0'}}><td style={{padding:'6px 10px',fontWeight:700}}>Net Cash</td>{net.map(function(v:number,i:number){return <td key={i} style={{padding:'6px 8px',textAlign:'right',fontWeight:700,color:v>=0?C.green:C.red}}>{fmt(v,cc)}</td>})}</tr>
            <tr style={{background:C.navy}}><td style={{padding:'6px 10px',fontWeight:700,color:C.white}}>Cumulative Position</td>{cumulative.map(function(v:number,i:number){return <td key={i} style={{padding:'6px 8px',textAlign:'right',fontWeight:700,color:v>=0?'#7DCEA0':C.red}}>{fmt(v,cc)}</td>})}</tr>
          </tbody>
        </table></div>
        <div style={{marginTop:'0.75rem',fontSize:'0.78rem',color:C.slate,lineHeight:1.5}}>Cash In is operating EBITDA when positive. Cash Out includes operating losses, irrigation kit outflows, and approved spending requests. Approved spending requests post here automatically when approved by the CEO.</div>
      </div>
    </div>
  )
}

// ── CONAS WORKING CAPITAL TAB ────────────────────────────────
function ConasWorkingCapitalTab({result, months, cc, inputs, upd, canEdit}:{result:ReturnType<typeof runCONASModel>;months:string[];cc:string;inputs:CONASInputs;upd:(f:(p:CONASInputs)=>CONASInputs)=>void;canEdit:boolean}) {
  const m = months.length
  const irrigationByMonth = result.cf.irrigation || Array(m).fill(0)
  const totalIrrigation = irrigationByMonth.reduce(function(a:number,b:number){return a+b},0)
  const fgeCount = result.metrics.fgeCount

  // FGE input credit outstanding -- advances in months 1-2, repaid at harvest months 4-5 and 9-10
  const inputCredit = Array(m).fill(0)
  let cumAdvance = 0
  for (let i = 0; i < m; i++) {
    // Shops advance input credit to FGEs in months 1-2 and 7-8 (planting seasons)
    const isPlanting = i === 0 || i === 1 || i === 6 || i === 7
    const isHarvest = i === 3 || i === 4 || i === 8 || i === 9
    if (isPlanting) cumAdvance += (totalIrrigation / 4) * 0.3 // approx 30% of kit value as seasonal advance
    if (isHarvest) cumAdvance = Math.max(0, cumAdvance - (totalIrrigation / 4) * 0.3)
    inputCredit[i] = cumAdvance
  }

  const peakCredit = Math.max.apply(null, inputCredit)
  const avgCredit = inputCredit.reduce(function(a:number,b:number){return a+b},0) / m

  function exportWorkingCapitalCSV() {
    const headers = ['', ...months]
    const rows = [
      ['Kit Outflows', ...irrigationByMonth.map((v:number)=>v>0?-Math.round(v):0)],
      ['Closing Cash (after kits)', ...result.cf.close.map((v:number)=>Math.round(v))],
    ]
    const csv = [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv],{type:'text/csv'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href=url; a.download='Working_Capital_Irrigation.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
        <KPI label="Total Irrigation Investment" value={fmt(totalIrrigation,cc)} sub={`${fgeCount} FGEs × UGX 8M`}/>
        <KPI label="Peak Input Credit Outstanding" value={fmt(peakCredit,cc)} sub="Max FGE input advance"/>
        <KPI label="Average Input Credit" value={fmt(avgCredit,cc)} sub="Across season"/>
        <KPI label="FGE Count" value={String(fgeCount)}/>
      </div>

      <div style={{background:C.navy,borderRadius:8,padding:'1rem 1.25rem',marginBottom:'1.25rem'}}>
        <div style={{fontFamily:'monospace',fontSize:'0.65rem',letterSpacing:'0.12em',color:C.cyan,marginBottom:'0.5rem'}}>WORKING CAPITAL EXPLANATION</div>
        <div style={{display:'flex',gap:'0.6rem',marginBottom:'0.5rem',fontSize:'0.84rem',color:C.white,lineHeight:1.5}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:C.teal,marginTop:'0.45rem',flexShrink:0,display:'inline-block'}}/>
          <span>Irrigation kits ({fmt(totalIrrigation,cc)}) are deployed in months 1 and 2; this is the primary working capital requirement for CONAS. Kits remain as assets on the balance sheet.</span>
        </div>
        <div style={{display:'flex',gap:'0.6rem',marginBottom:'0.5rem',fontSize:'0.84rem',color:C.white,lineHeight:1.5}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:C.cyan,marginTop:'0.45rem',flexShrink:0,display:'inline-block'}}/>
          <span>Input credit advances to FGEs peak at planting time and are recovered at harvest. Ensure opening cash covers both irrigation kits and peak input credit outstanding.</span>
        </div>
        <div style={{display:'flex',gap:'0.6rem',fontSize:'0.84rem',color:C.white,lineHeight:1.5}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:C.amber,marginTop:'0.45rem',flexShrink:0,display:'inline-block'}}/>
          <span>Enter opening capital in Settings to ensure the cash flow stays positive through the irrigation deployment months.</span>
        </div>
      </div>

      <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}><div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy}}>Irrigation Kit Deployment</div><div style={{display:'flex',gap:'0.4rem'}}><button style={{fontFamily:'monospace',fontSize:'0.65rem',background:'transparent',border:`1px solid ${C.border}`,borderRadius:3,color:C.slate,cursor:'pointer',padding:'0.15rem 0.5rem'}} onClick={()=>window.print()}>Print</button><button style={{fontFamily:'monospace',fontSize:'0.65rem',background:'transparent',border:`1px solid ${C.border}`,borderRadius:3,color:C.slate,cursor:'pointer',padding:'0.15rem 0.5rem'}} onClick={exportWorkingCapitalCSV}>Export CSV</button></div></div>
        <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.75rem',fontFamily:'monospace'}}>
          <thead><tr style={{background:C.navy,color:C.white}}>
            <th style={{padding:'7px 10px',textAlign:'left',minWidth:160}}>Line</th>
            {months.map(function(mn:string,i:number){return <th key={i} style={{padding:'7px 8px',textAlign:'right',whiteSpace:'nowrap'}}>{mn}</th>})}
          </tr></thead>
          <tbody>
            <tr style={{background:'#F8F4EE'}}><td style={{padding:'6px 10px',fontWeight:600}}>Kit Outflows</td>{irrigationByMonth.map(function(v:number,i:number){return <td key={i} style={{padding:'6px 8px',textAlign:'right',color:v>0?C.red:C.slate}}>{v>0?fmt(-v,cc):' - '}</td>})}</tr>
            <tr style={{background:'#F0F4F8'}}><td style={{padding:'6px 10px',fontWeight:700}}>Closing Cash (after kits)</td>{result.cf.close.map(function(v:number,i:number){return <td key={i} style={{padding:'6px 8px',textAlign:'right',fontWeight:700,color:v>=0?C.green:C.red}}>{fmt(v,cc)}</td>})}</tr>
          </tbody>
        </table></div>
        <div style={{marginTop:'0.75rem',fontSize:'0.78rem',color:C.slate}}>Kits deployed: {Math.round(fgeCount/2)} in Month 1, {Math.ceil(fgeCount/2)} in Month 2. Total: {fmt(totalIrrigation,cc)}. Enter shareholder contribution or grant in Settings → Capital Structure to ensure cash stays positive.</div>
      </div>

      <div style={{background:'#EBF8FF',borderRadius:6,padding:'0.85rem 1rem',marginBottom:'1.25rem'}}>
        <p style={{fontSize:'0.82rem',color:C.navy,lineHeight:1.6,margin:0}}>
          Track input supplier credit and credit extended to FGEs, customers, or licensing partners month by month. Enter <strong>new credit</strong> and what was <strong>actually settled</strong> each month. The outstanding balance and its cash effect are calculated automatically and feed directly into Cash Flow and Going Concern.
        </p>
      </div>

      <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
          <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy}}>Payable — Supplier Credit</div>
          {canEdit&&<button style={addBtn(true)} onClick={()=>upd(p=>({...p,tradeCreditLines:[...(p.tradeCreditLines||[]),{id:`tc_${Date.now()}`,name:'',type:'payable' as const,monthlyNew:Array(months.length).fill(0),monthlySettled:Array(months.length).fill(0)}]}))}>+ Add Supplier Credit Line</button>}
        </div>
        {(inputs.tradeCreditLines||[]).filter(l=>l.type==='payable').length===0 && <p style={{color:C.slate,fontSize:'0.85rem'}}>No supplier credit lines yet.</p>}
        {(inputs.tradeCreditLines||[]).filter(l=>l.type==='payable').map(line=>(
          <ConasTradeCreditLineGrid key={line.id} line={line} months={months} cc={cc} canEdit={canEdit} upd={upd}/>
        ))}
      </div>

      <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
          <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy}}>Receivable — FGE / Customer / Partner Credit</div>
          {canEdit&&<button style={addBtn(true)} onClick={()=>upd(p=>({...p,tradeCreditLines:[...(p.tradeCreditLines||[]),{id:`tc_${Date.now()}`,name:'',type:'receivable' as const,monthlyNew:Array(months.length).fill(0),monthlySettled:Array(months.length).fill(0)}]}))}>+ Add Receivable Line</button>}
        </div>
        {(inputs.tradeCreditLines||[]).filter(l=>l.type==='receivable').length===0 && <p style={{color:C.slate,fontSize:'0.85rem'}}>No receivable lines yet. Use this for FGE input credit advances, or credit given to customers or licensing partners.</p>}
        {(inputs.tradeCreditLines||[]).filter(l=>l.type==='receivable').map(line=>(
          <ConasTradeCreditLineGrid key={line.id} line={line} months={months} cc={cc} canEdit={canEdit} upd={upd}/>
        ))}
      </div>
    </div>
  )
}

function ConasTradeCreditLineGrid({line,months,cc,canEdit,upd}:{line:any;months:string[];cc:string;canEdit:boolean;upd:(f:(p:CONASInputs)=>CONASInputs)=>void}) {
  const [expanded,setExpanded] = React.useState(false)
  function updateName(name:string) {
    upd(p=>({...p,tradeCreditLines:(p.tradeCreditLines||[]).map(l=>l.id===line.id?{...l,name}:l)}))
  }
  function removeLine() {
    upd(p=>({...p,tradeCreditLines:(p.tradeCreditLines||[]).filter(l=>l.id!==line.id)}))
  }
  function updateMonth(field:'monthlyNew'|'monthlySettled', idx:number, val:number) {
    upd(p=>({...p,tradeCreditLines:(p.tradeCreditLines||[]).map(l=>l.id===line.id?{...l,[field]:(l[field]||Array(months.length).fill(0)).map((v:number,i:number)=>i===idx?val:v)}:l)}))
  }
  return (
    <div style={{marginBottom:'1rem',border:`1px solid ${C.border}`,borderRadius:6,padding:'0.75rem'}}>
      <div style={{display:'flex',gap:'0.5rem',alignItems:'center',marginBottom:'0.5rem'}}>
        <input style={{...inp,fontWeight:700}} placeholder="e.g. Input Supplier, Licensing Partner" value={line.name} disabled={!canEdit} onChange={e=>updateName(e.target.value)}/>
        {line.name&&<button style={addBtn(true)} onClick={()=>setExpanded(!expanded)}>{expanded?'Hide months':'Enter monthly figures'}</button>}
        {canEdit&&<button style={{background:'transparent',border:'none',color:C.red,cursor:'pointer',fontSize:'1.1rem'}} onClick={removeLine}>×</button>}
      </div>
      {expanded&&line.name&&(
        <div style={{overflowX:'auto',marginTop:'0.6rem'}}>
          <table style={{borderCollapse:'collapse',fontSize:'0.74rem'}}>
            <thead><tr>
              <th style={{padding:'4px 6px',textAlign:'left',minWidth:90}}></th>
              {months.map((m,i)=><th key={i} style={{padding:'4px 5px',textAlign:'center',minWidth:78,background:'#F0F4F8',color:C.navy,fontWeight:600}}>{m}</th>)}
            </tr></thead>
            <tbody>
              <tr>
                <td style={{padding:'4px 6px',fontWeight:600,color:C.teal,fontSize:'0.72rem'}}>{line.type==='payable'?'New Credit Received':'New Credit Extended'}</td>
                {(line.monthlyNew||Array(months.length).fill(0)).map((v:number,i:number)=>(
                  <td key={i} style={{padding:'2px 3px'}}><input type="number" disabled={!canEdit} style={{width:70,padding:'0.28rem 0.32rem',fontSize:'0.7rem',textAlign:'right',border:`1px solid ${C.border}`,borderRadius:3,background:canEdit?C.white:'#F4F4F4'}} value={v||''} placeholder="0" onChange={e=>updateMonth('monthlyNew',i,Number(e.target.value))}/></td>
                ))}
              </tr>
              <tr>
                <td style={{padding:'4px 6px',fontWeight:600,color:C.green,fontSize:'0.72rem'}}>{line.type==='payable'?'Paid This Month':'Collected This Month'}</td>
                {(line.monthlySettled||Array(months.length).fill(0)).map((v:number,i:number)=>(
                  <td key={i} style={{padding:'2px 3px'}}><input type="number" disabled={!canEdit} style={{width:70,padding:'0.28rem 0.32rem',fontSize:'0.7rem',textAlign:'right',border:`1px solid ${C.border}`,borderRadius:3,background:canEdit?C.white:'#F4F4F4'}} value={v||''} placeholder="0" onChange={e=>updateMonth('monthlySettled',i,Number(e.target.value))}/></td>
                ))}
              </tr>
            </tbody>
          </table>
          <p style={{fontSize:'0.68rem',color:C.slate,marginTop:'0.4rem'}}>All figures in {cc}. The outstanding balance carries forward automatically.</p>
        </div>
      )}
    </div>
  )
}


// Full P&L table  -  plan + optional actuals column
function PLTable({rows,months,title,footnote}:{
  title?:string; months:string[]; footnote?:string
  rows:{label:string;plan:number[];actual?:(number|null)[];bold?:boolean;highlight?:boolean;negate?:boolean;indent?:boolean}[]
}){
  const hasAct=rows.some(r=>r.actual?.some(v=>v!==null))
  function downloadCSV(){
    const headers=['',...months,'Total']
    const dataRows=rows.map(row=>{
      const dsp=(v:number)=>row.negate?-Math.abs(v):v
      const vals=row.plan.map(dsp)
      const total=vals.reduce((a,b)=>a+b,0)
      return [row.label,...vals.map(v=>String(Math.round(v))),String(Math.round(total))]
    })
    const csv=[headers,...dataRows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob=new Blob([csv],{type:'text/csv'})
    const url=URL.createObjectURL(blob)
    const a=document.createElement('a')
    a.href=url; a.download=`${(title||'export').replace(/[^a-z0-9]/gi,'_')}.csv`; a.click()
    URL.revokeObjectURL(url)
  }
  return(
    <div style={card}>
      {title&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.5rem'}}><div style={secH} style={{margin:0}}>{title}</div><div style={{display:'flex',gap:'0.4rem'}}><button style={{fontFamily:'monospace',fontSize:'0.65rem',background:'transparent',border:`1px solid ${C.border}`,borderRadius:3,color:C.slate,cursor:'pointer',padding:'0.15rem 0.5rem',flexShrink:0}} onClick={()=>window.print()}>Print</button><button style={{fontFamily:'monospace',fontSize:'0.65rem',background:'transparent',border:`1px solid ${C.border}`,borderRadius:3,color:C.slate,cursor:'pointer',padding:'0.15rem 0.5rem',flexShrink:0}} onClick={downloadCSV}>Export CSV</button></div></div>}
      {hasAct&&(
        <div style={{display:'flex',gap:'1.2rem',marginBottom:'0.6rem',fontSize:'0.7rem',color:C.slate}}>
          <span style={{display:'inline-flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:2,background:C.planBg,border:`1px solid ${C.border}`,display:'inline-block'}}/> Plan</span>
          <span style={{display:'inline-flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:2,background:C.actualBg,display:'inline-block'}}/> Actual</span>
        </div>
      )}
      <div style={{overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.77rem',fontFamily:'monospace'}}>
          <thead>
            <tr>
              <th style={{textAlign:'left',padding:'0.3rem 0.5rem',borderBottom:`2px solid ${C.border}`,minWidth:190,background:'#F4F8FC',fontFamily:'inherit',fontSize:'0.79rem'}}></th>
              {months.map((m,i)=><th key={i} style={{textAlign:'right',padding:'0.3rem 0.5rem',borderBottom:`2px solid ${C.border}`,whiteSpace:'nowrap',background:'#F4F8FC',color:C.slate,fontWeight:600}}>{m}</th>)}
              <th style={{textAlign:'right',padding:'0.3rem 0.5rem',borderBottom:`2px solid ${C.border}`,borderLeft:`2px solid ${C.border}`,background:'#F4F8FC',color:C.slate,fontWeight:600}}>Season Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row,ri)=>{
              const dsp=(v:number)=>row.negate?-Math.abs(v):v
              const vals=row.plan.map(dsp)
              const total=vals.reduce((a,b)=>a+b,0)
              return(
                <tr key={ri} style={{background:row.highlight?C.actualBg:'transparent'}}>
                  <td style={{textAlign:'left',padding:'0.27rem 0.5rem',borderBottom:`1px solid #EEF2F6`,fontWeight:row.bold?700:400,paddingLeft:row.indent?'1.8rem':'0.5rem',fontSize:'0.79rem'}}>{row.label}</td>
                  {vals.map((v,vi)=>{
                    const act=row.actual?.[vi]
                    const hasA=act!==null&&act!==undefined
                    const dA=hasA?dsp(act as number):null
                    const variance=hasA?(dA as number)-v:null
                    return(
                      <td key={vi} style={{textAlign:'right',padding:0,borderBottom:`1px solid #EEF2F6`,verticalAlign:'top'}}>
                        <div style={{display:'flex',flexDirection:'column',padding:'0.27rem 0.5rem',minHeight:32}}>
                          <span style={{color:hasA?C.slate:v<0?C.red:C.navy,fontWeight:row.bold?700:400}}>{fmt(v)}</span>
                          {hasA&&dA!==null&&<span style={{color:C.teal,fontSize:'0.72rem'}}>{fmt(dA)}</span>}
                          {variance!==null&&<span style={{fontSize:'0.68rem',color:variance>=0?C.green:C.red}}>{variance>=0?'+':''}{fmt(variance)}</span>}
                        </div>
                      </td>
                    )
                  })}
                  <td style={{textAlign:'right',padding:'0.27rem 0.5rem',borderBottom:`1px solid #EEF2F6`,borderLeft:`2px solid ${C.border}`,fontWeight:row.bold?700:600,color:total<0?C.red:C.navy}}>{fmt(total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {footnote&&<div style={{marginTop:'0.65rem',fontSize:'0.71rem',color:C.slate,lineHeight:1.5}}>{footnote}</div>}
    </div>
  )
}

// Editable monthly line
function LineEditor({line:l,onPlanChange,onActualChange,onRename,onRemove,onLineTypeChange,onArrayFieldChange,months,cc,planLocked,showActual,isNew}:{
  line:PlanLine;months:string[];cc:string;planLocked:boolean;showActual:boolean;isNew?:boolean
  onPlanChange:(m:number,v:number)=>void
  onActualChange:(m:number,v:number|null)=>void
  onRename:(name:string)=>void
  onRemove:()=>void
  onLineTypeChange?:(t:PlanLineType)=>void
  onArrayFieldChange?:(field:'buyPrice'|'sellPrice'|'volume'|'feePerEngagement'|'costPerEngagement'|'engagements',m:number,v:number)=>void
}){
  const isSpread = l.category==='revenue' && l.lineType==='spread'
  const isServiceFee = l.category==='revenue' && l.lineType==='service_fee'
  // For spread/service-fee lines, the displayed and totalled revenue is
  // derived from the source fields -- matches conas-engine.ts's calcUnitRaw
  // exactly, so this row never shows a different number than the engine uses.
  const computedRevenue = isSpread
    ? (l.volume??[]).map((v,m)=>(l.sellPrice?.[m]??0)*v)
    : isServiceFee
    ? (l.engagements??[]).map((e,m)=>(l.feePerEngagement?.[m]??0)*e)
    : l.monthlyPlan
  const total=computedRevenue.reduce((a,b)=>a+b,0)
  const nameRef = React.useRef<HTMLInputElement>(null)
  const wrapRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(()=>{
    if(isNew){
      wrapRef.current?.scrollIntoView({behavior:'smooth',block:'center'})
      nameRef.current?.focus()
      nameRef.current?.select()
    }
  },[isNew])
  const subRow = (label:string, field:'buyPrice'|'sellPrice'|'volume'|'feePerEngagement'|'costPerEngagement'|'engagements', values:number[]|undefined, isCurrency:boolean) => (
    <tr>
      <td style={{padding:'0.18rem 0.4rem',fontSize:'0.68rem',color:C.slate,whiteSpace:'nowrap'}}>{label}</td>
      {(values??Array(months.length).fill(0)).map((v,m)=>(
        <td key={m} style={{padding:'0.18rem 0.2rem'}}>
          <input type="number" min="0" disabled={planLocked}
            style={{...inp,width:84,fontSize:'0.72rem',padding:'0.24rem 0.28rem',textAlign:'right',background:planLocked?'#EEF4F8':'#F4F8FC'}}
            value={v===0?'':v} placeholder="0"
            onChange={e=>onArrayFieldChange?.(field,m,e.target.value===''?0:Number(e.target.value))}/>
        </td>
      ))}
    </tr>
  )
  return(
    <div ref={wrapRef} style={{border:`1px solid ${isNew?C.cyan:C.border}`,borderRadius:6,padding:'0.75rem',marginBottom:'0.6rem',boxShadow:isNew?`0 0 0 2px ${C.cyan}33`:'none',transition:'box-shadow 1.2s ease, border-color 1.2s ease'}}>
      <div style={{display:'flex',gap:'0.6rem',alignItems:'center',marginBottom:'0.5rem',flexWrap:'wrap'}}>
        <input ref={nameRef} style={{...inp,flex:2,fontSize:'0.8rem',minWidth:140}} value={l.name} onChange={e=>onRename(e.target.value)}/>
        {l.category==='revenue'&&onLineTypeChange&&(
          <select style={{...inp,width:140,fontSize:'0.7rem',padding:'0.3rem 0.4rem'}}
            value={l.lineType||'standard'} onChange={e=>onLineTypeChange(e.target.value as PlanLineType)}>
            <option value="standard">Standard</option>
            <option value="spread">Spread</option>
            <option value="service_fee">Service fee</option>
          </select>
        )}
        <span style={{fontFamily:'monospace',fontSize:'0.72rem',color:C.slate,whiteSpace:'nowrap'}}>Total: {fmt(total,cc)}</span>
        <button style={delBtn} onClick={()=>{if(window.confirm(`Remove "${l.name}"?`))onRemove()}}>✕ Remove</button>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',fontSize:'0.76rem',fontFamily:'monospace'}}>
          <thead><tr>{(isSpread||isServiceFee)&&<th></th>}{months.map((m,i)=><th key={i} style={{textAlign:'center',padding:'0.2rem 0.3rem',color:C.slate,fontWeight:600,fontSize:'0.68rem',minWidth:88}}>{m}</th>)}</tr></thead>
          <tbody>
            {isSpread ? (
              <>
                {subRow('Buy Price',  'buyPrice',  l.buyPrice,  true)}
                {subRow('Sell Price', 'sellPrice', l.sellPrice, true)}
                {subRow('Volume',     'volume',    l.volume,    false)}
                <tr style={{background:C.lightBg}}>
                  <td style={{padding:'0.18rem 0.4rem',fontSize:'0.68rem',color:C.navy,fontWeight:700}}>Revenue</td>
                  {computedRevenue.map((v,m)=><td key={m} style={{padding:'0.18rem 0.2rem',textAlign:'right',fontSize:'0.72rem',color:C.navy}}>{fmt(v,cc)}</td>)}
                </tr>
              </>
            ) : isServiceFee ? (
              <>
                {subRow('Fee / Engagement',  'feePerEngagement',  l.feePerEngagement,  true)}
                {subRow('Cost / Engagement', 'costPerEngagement', l.costPerEngagement, true)}
                {subRow('Engagements',       'engagements',       l.engagements,       false)}
                <tr style={{background:C.lightBg}}>
                  <td style={{padding:'0.18rem 0.4rem',fontSize:'0.68rem',color:C.navy,fontWeight:700}}>Revenue</td>
                  {computedRevenue.map((v,m)=><td key={m} style={{padding:'0.18rem 0.2rem',textAlign:'right',fontSize:'0.72rem',color:C.navy}}>{fmt(v,cc)}</td>)}
                </tr>
              </>
            ) : (
              <tr>{l.monthlyPlan.map((v,m)=>(
                <td key={m} style={{padding:'0.18rem 0.2rem'}}>
                  <input type="number" min="0" disabled={planLocked}
                    style={{...inp,width:84,fontSize:'0.74rem',padding:'0.26rem 0.3rem',textAlign:'right',background:planLocked?'#EEF4F8':'#F4F8FC'}}
                    value={v===0?'':v} placeholder="0"
                    onChange={e=>onPlanChange(m,e.target.value===''?0:Number(e.target.value))}/>
                </td>
              ))}</tr>
            )}
            {showActual&&<tr style={{background:C.actualBg}}>{(isSpread||isServiceFee)&&<td></td>}{l.monthlyActual.map((v,m)=>(
              <td key={m} style={{padding:'0.18rem 0.2rem'}}>
                <input type="number" min="0"
                  style={{...inp,width:84,fontSize:'0.73rem',padding:'0.24rem 0.3rem',textAlign:'right',background:v!==null?'#D0EEF2':'#EAF7F8',border:`1px solid ${v!==null?C.teal:C.border}`}}
                  value={v!==null&&v!==undefined?v:''} placeholder={String(Math.round(computedRevenue[m]||0))}
                  onChange={e=>onActualChange(m,e.target.value===''?null:Number(e.target.value))}/>
                {v!==null&&v!==undefined&&<div style={{fontSize:'0.63rem',color:v-(computedRevenue[m]||0)>=0?C.green:C.red,textAlign:'right'}}>{v-(computedRevenue[m]||0)>=0?'+':''}{fmt(v-(computedRevenue[m]||0))}</div>}
              </td>
            ))}</tr>}
          </tbody>
        </table>
      </div>
      {(isSpread||isServiceFee)&&<div style={{fontSize:'0.68rem',color:C.slate,marginTop:'0.35rem'}}>Revenue is calculated from the fields above -- it isn't entered directly.</div>}
      {showActual&&<div style={{fontSize:'0.68rem',color:C.teal,marginTop:'0.35rem'}}>{isSpread||isServiceFee?'Actual row (teal) = actual revenue for closed months':'Row 1 = Plan · Row 2 (teal) = Actual for closed months'}</div>}
    </div>
  )
}

function exportToCSV(title: string, headers: string[], rows: (string|number)[][]) {
  const csvContent = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob([csvContent], {type:'text/csv'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.replace(/[^a-z0-9]/gi,'_')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function exportToPrint(title: string) {
  window.print()
  void title
}


const TEAM_BUSINESS_UNITS = [
  'Input Profit Centre 1','Input Profit Centre 2','Input Profit Centre 3',
  'Input Profit Centre 4','Input Profit Centre 5',
  'FGE Production and Marketing','Own Farm','Advisory Services',
  'Customer Acquisition and Management','HQ Shared',
]

const TEAM_ROLES = [
  {value:'ceo', label:'CEO'},
  {value:'finance_manager', label:'Finance Manager'},
  {value:'unit_head', label:'Unit Head'},
  {value:'advisory_expert', label:'Advisory Expert'},
]

// ── SHARED CONSTANTS FOR WORKFLOW TABS ──────────────────────
const ACTUALS_BUSINESS_UNITS = [
  'Input Profit Centre 1','Input Profit Centre 2','Input Profit Centre 3',
  'Input Profit Centre 4','Input Profit Centre 5',
  'FGE Production and Marketing','Own Farm','Advisory Services',
  'Customer Acquisition and Management',
]

// ── TEAM TAB ─────────────────────────────────────────────
function TeamTab({role,userId,userName,businessUnit,canSeeAllUnits}:{role:string;userId:string;userName:string;businessUnit:string;canSeeAllUnits:boolean}) {
  const [teamMembers, setTeamMembers] = React.useState([])
  const [loadingTeam, setLoadingTeam] = React.useState(true)
  const [showInvite, setShowInvite] = React.useState(false)
  const [inviteForm, setInviteForm] = React.useState({email:'', full_name:'', role:'unit_head', business_unit:''})
  const [inviting, setInviting] = React.useState(false)
  const [inviteMsg, setInviteMsg] = React.useState('')

  // BUSINESS_UNITS and ROLES defined at module level as TEAM_BUSINESS_UNITS and TEAM_ROLES

  React.useEffect(() => {
    async function loadTeam() {
      try {
                const { data } = await sb
          .from('user_profiles')
          .select('*')
          .eq('client_id', CONAS_CLIENT_ID)
          .order('created_at')
        setTeamMembers(data || [])
      } catch(e) {}
      setLoadingTeam(false)
    }
    loadTeam()
  }, [])

  async function sendInvite() {
    if (!inviteForm.email || !inviteForm.full_name || !inviteForm.business_unit) {
      setInviteMsg('Please fill in all fields.')
      return
    }
    setInviting(true)
    setInviteMsg('')
    try {
      // Store as pending record -- email delivery via Edge Function (next build)
      const pendingId = crypto.randomUUID()
      await supabase.from('user_profiles').insert({
        id: pendingId,
        client_id: CONAS_CLIENT_ID,
        role: inviteForm.role,
        full_name: inviteForm.full_name,
        email: inviteForm.email,
        business_unit: inviteForm.business_unit,
        status: 'pending',
        invited_at: new Date().toISOString(),
      })
      setTeamMembers(prev => [...prev, {
        id: pendingId,
        full_name: inviteForm.full_name,
        email: inviteForm.email,
        role: inviteForm.role,
        business_unit: inviteForm.business_unit,
        status: 'pending',
      }])
      setInviteForm({email:'', full_name:'', role:'unit_head', business_unit:''})
      setShowInvite(false)
      setInviteMsg('Team member saved. Email invite will be available in the next build.')
    } catch(e) {
      setInviteMsg(`Error: ${e.message}`)
    }
    setInviting(false)
  }

  async function updateMember(id, updates) {
    // Optimistic: reflect the change at once (the role dropdown must not sit on
    // the old value waiting for the DB, then snap back on a slow link), then
    // persist and surface — never swallow — a failure. On failure roll the local
    // state back to the previous value so the UI never shows a change the
    // database rejected (which would contradict the "could not save" alert).
    const prevMember = teamMembers.find(m => m.id === id)
    setTeamMembers(prev => prev.map(m => m.id !== id ? m : {...m, ...updates}))
    try {
      const { error } = await supabase.from('user_profiles').update({...updates, updated_at: new Date().toISOString()}).eq('id', id)
      if (error) throw error
    } catch (e) {
      if (prevMember) setTeamMembers(prev => prev.map(m => m.id !== id ? m : prevMember))
      alert('Could not save that change to the server. Please check your connection and try again.')
    }
  }

  const roleLabel = (r) => TEAM_ROLES.find(x => x.value === r)?.label || r
  const statusColor = (s) => s === 'active' ? C.green : s === 'pending' ? C.amber : C.slate

  if (!canSeeAllUnits) return (
    <div style={{...card, textAlign:'center', color:C.slate, padding:'2.5rem'}}>
      Team management is available to the CEO only.
    </div>
  )

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem'}}>
        <div style={{fontFamily:'Georgia,serif', fontSize:'1.1rem', fontWeight:700, color:C.navy}}>CONAS Team</div>
        <button style={{fontFamily:'monospace', fontSize:'0.72rem', padding:'0.38rem 0.8rem', border:`1px solid ${C.cyan}`, borderRadius:4, background:'transparent', color:C.cyan, cursor:'pointer'}} onClick={() => setShowInvite(!showInvite)}>
          + Invite Team Member
        </button>
      </div>

      {inviteMsg && <div style={{padding:'0.75rem 1rem', borderRadius:6, background: inviteMsg.startsWith('Error') ? '#FDF0EE' : '#D4EDDA', color: inviteMsg.startsWith('Error') ? C.red : C.green, marginBottom:'1rem', fontSize:'0.83rem'}}>{inviteMsg}</div>}

      {showInvite && (
        <div style={{...card, border:`1px solid ${C.cyan}`, marginBottom:'1.25rem'}}>
          <div style={{fontWeight:700, color:C.navy, marginBottom:'1rem', fontSize:'0.9rem'}}>Invite New Team Member</div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'1rem', marginBottom:'1rem'}}>
            <div>
              <label style={{display:'block', fontWeight:600, fontSize:'0.8rem', marginBottom:'0.22rem', color:C.navy}}>Full Name</label>
              <input style={{width:'100%', padding:'0.42rem 0.6rem', border:`1px solid ${C.border}`, borderRadius:4, fontSize:'0.83rem', fontFamily:'inherit', background:'#F4F8FC', color:C.navy, boxSizing:'border-box'}}
                value={inviteForm.full_name} onChange={e => setInviteForm(f => ({...f, full_name: e.target.value}))} placeholder="Full name"/>
            </div>
            <div>
              <label style={{display:'block', fontWeight:600, fontSize:'0.8rem', marginBottom:'0.22rem', color:C.navy}}>Email Address</label>
              <input type="email" style={{width:'100%', padding:'0.42rem 0.6rem', border:`1px solid ${C.border}`, borderRadius:4, fontSize:'0.83rem', fontFamily:'inherit', background:'#F4F8FC', color:C.navy, boxSizing:'border-box'}}
                value={inviteForm.email} onChange={e => setInviteForm(f => ({...f, email: e.target.value}))} placeholder="email@example.com"/>
            </div>
            <div>
              <label style={{display:'block', fontWeight:600, fontSize:'0.8rem', marginBottom:'0.22rem', color:C.navy}}>Role</label>
              <select style={{width:'100%', padding:'0.42rem 0.6rem', border:`1px solid ${C.border}`, borderRadius:4, fontSize:'0.83rem', fontFamily:'inherit', background:'#F4F8FC', color:C.navy, boxSizing:'border-box'}}
                value={inviteForm.role} onChange={e => setInviteForm(f => ({...f, role: e.target.value}))}>
                {TEAM_ROLES.filter(r => r.value !== 'ceo').map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{display:'block', fontWeight:600, fontSize:'0.8rem', marginBottom:'0.22rem', color:C.navy}}>Business Unit</label>
              <select style={{width:'100%', padding:'0.42rem 0.6rem', border:`1px solid ${C.border}`, borderRadius:4, fontSize:'0.83rem', fontFamily:'inherit', background:'#F4F8FC', color:C.navy, boxSizing:'border-box'}}
                value={inviteForm.business_unit} onChange={e => setInviteForm(f => ({...f, business_unit: e.target.value}))}>
                <option value="">Select unit...</option>
                {TEAM_BUSINESS_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:'flex', gap:'0.6rem'}}>
            <button style={{fontFamily:'monospace', fontSize:'0.78rem', fontWeight:600, padding:'0.5rem 1.1rem', border:'none', borderRadius:4, background:C.cyan, color:C.navy, cursor:'pointer'}} onClick={sendInvite} disabled={inviting}>
              {inviting ? 'Sending...' : 'Send Invite'}
            </button>
            <button style={{fontFamily:'monospace', fontSize:'0.72rem', padding:'0.38rem 0.8rem', border:`1px solid ${C.border}`, borderRadius:4, background:'transparent', color:C.slate, cursor:'pointer'}} onClick={() => setShowInvite(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loadingTeam ? (
        <div style={{color:C.slate, padding:'1.5rem', textAlign:'center', fontSize:'0.85rem'}}>Loading team...</div>
      ) : teamMembers.length === 0 ? (
        <div style={{...card, textAlign:'center', color:C.slate, padding:'2rem', fontSize:'0.85rem'}}>No team members yet. Invite your first team member above.</div>
      ) : (
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.82rem'}}>
            <thead>
              <tr style={{background:C.navy, color:C.white}}>
                {['Name','Email','Role','Business Unit','Status','Actions'].map(h => (
                  <th key={h} style={{padding:'10px 12px', textAlign:'left', fontWeight:600, whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamMembers.map((m, i) => (
                <tr key={m.id} style={{background: i % 2 === 0 ? C.cream : C.white}}>
                  <td style={{padding:'9px 12px', fontWeight:600, color:C.navy}}>{m.full_name || ' - '}</td>
                  <td style={{padding:'9px 12px', color:C.slate, fontSize:'0.78rem'}}>{m.email || ' - '}</td>
                  <td style={{padding:'9px 12px'}}>
                    <select style={{fontFamily:'monospace', fontSize:'0.7rem', padding:'0.2rem 0.3rem', border:`1px solid ${C.border}`, borderRadius:4, background:'transparent', cursor:'pointer'}}
                      value={m.role} onChange={e => updateMember(m.id, {role: e.target.value})}>
                      {TEAM_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </td>
                  <td style={{padding:'9px 12px', color:C.slate, fontSize:'0.78rem'}}>{m.business_unit || ' - '}</td>
                  <td style={{padding:'9px 12px'}}>
                    <span style={{fontFamily:'monospace', fontSize:'0.63rem', padding:'0.1rem 0.42rem', borderRadius:4, background:statusColor(m.status || 'active'), color:C.white}}>
                      {m.status || 'active'}
                    </span>
                  </td>
                  <td style={{padding:'9px 12px'}}>
                    {m.status !== 'inactive' && m.role !== 'ceo' && (
                      <button style={{fontFamily:'monospace', fontSize:'0.65rem', padding:'0.2rem 0.5rem', border:`1px solid ${C.red}`, borderRadius:3, background:'transparent', color:C.red, cursor:'pointer'}}
                        onClick={() => updateMember(m.id, {status: 'inactive'})}>
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── ACTUALS TAB ──────────────────────────────────────────
function ActualsTab({role,userId,userName,businessUnit,planUnits}:{role:string;userId:string;userName:string;businessUnit:string;planUnits:any[]}) {
  const isCEO = role === 'ceo'
  const isFM = role === 'finance_manager'
  const isSuperCoach = role === 'super_coach' || role === 'coach'
  const canSeeAll = isCEO || isFM || isSuperCoach

  const visibleUnits = canSeeAll
    ? ACTUALS_BUSINESS_UNITS
    : ACTUALS_BUSINESS_UNITS.filter(u => u === (businessUnit || ''))

  const [selUnit, setSelUnit] = React.useState(() => visibleUnits[0] || '')
  const [selPeriod, setSelPeriod] = React.useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-01`
  })
  const [actuals, setActuals] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [allActuals, setAllActuals] = React.useState([])

  // Rolling 24 months from 12 months ago to 12 months ahead
  const PERIOD_MONTHS = Array.from({length: 24}, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - 12 + i)
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-01`,
      label: d.toLocaleString('en-GB', {month:'long', year:'numeric'})
    }
  })

  const UNIT_ID_MAP: Record<string,string> = {
    'Input Profit Centre 1': 'shop_1',
    'Input Profit Centre 2': 'shop_2',
    'Input Profit Centre 3': 'shop_3',
    'Input Profit Centre 4': 'shop_4',
    'Input Profit Centre 5': 'shop_5',
    'FGE Production and Marketing': 'fge',
    'Own Farm': 'own_farm',
    'Advisory Services': 'advisory',
    'Customer Acquisition and Management': 'customer',
  }

  function getLinesForUnit(unitName: string) {
    const unitId = UNIT_ID_MAP[unitName]
    if (!unitId || !planUnits) return []
    const unit = planUnits.find((u: any) => u.id === unitId)
    if (!unit) return []
    return [
      ...unit.lines.filter((l: any) => l.category === 'revenue' && !l.name.startsWith('Add ')).map((l: any) => ({key: l.id, label: l.name, section: 'revenue'})),
      ...unit.lines.filter((l: any) => l.category === 'cost_of_sales').map((l: any) => ({key: l.id, label: l.name, section: 'costs'})),
      ...unit.lines.filter((l: any) => l.category === 'staff' && !l.name.startsWith('Add ')).map((l: any) => ({key: l.id, label: l.name, section: 'staff'})),
      ...unit.lines.filter((l: any) => l.category === 'direct_opex' && !l.name.startsWith('Add ')).map((l: any) => ({key: l.id, label: l.name, section: 'opex'})),
    ]
  }

  const LINES = getLinesForUnit(selUnit).length > 0 ? getLinesForUnit(selUnit) : [
    {key:'revenue_primary', label:'Primary Revenue', section:'revenue'},
    {key:'revenue_secondary', label:'Secondary Revenue', section:'revenue'},
    {key:'cost_of_sales', label:'Cost of Sales', section:'costs'},
    {key:'staff_cost', label:'Staff Cost', section:'costs'},
    {key:'direct_operating_cost', label:'Direct Operating Cost', section:'costs'},
  ]

  React.useEffect(() => {
    if (!selUnit || !selPeriod) return
    setLoading(true)
    async function load() {
      try {
                const { data } = await supabase.from('unit_actuals')
          .select('*')
          .eq('client_id', CONAS_CLIENT_ID)
          .eq('business_unit', selUnit)
          .eq('period', selPeriod)
          .maybeSingle()
        setActuals(data || {business_unit: selUnit, period: selPeriod})
      } catch(e) {}
      setLoading(false)
    }
    load()
  }, [selUnit, selPeriod])

  React.useEffect(() => {
    if (!canSeeAll) return
    async function loadAll() {
      try {
                const { data } = await supabase.from('unit_actuals')
          .select('*')
          .eq('client_id', CONAS_CLIENT_ID)
          .eq('period', selPeriod)
          .order('business_unit')
        setAllActuals(data || [])
      } catch(e) {}
    }
    loadAll()
  }, [selPeriod, isCEO, isFM])

  function fmtNum(n) { return Number(n || 0).toLocaleString() }

  async function save(submit = false) {
    setSaving(true)
    try {
            const payload = {
        client_id: CONAS_CLIENT_ID,
        business_unit: selUnit,
        period: selPeriod,
        ...actuals,
        entered_by_name: userName || '',
        entered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        submitted: submit ? true : (actuals?.submitted || false),
        submitted_at: submit ? new Date().toISOString() : (actuals?.submitted_at || null),
      }
      delete payload.id
      const { data } = await supabase.from('unit_actuals')
        .upsert(payload, {onConflict: 'client_id,business_unit,period'})
        .select().single()
      setActuals(data)
      if (canSeeAll) {
        setAllActuals(prev => {
          const existing = prev.findIndex(a => a.business_unit === selUnit)
          if (existing >= 0) { const n = [...prev]; n[existing] = data; return n }
          return [...prev, data]
        })
      }
    } catch(e) {}
    setSaving(false)
  }

  const revenueLines = LINES.filter(l => l.section === 'revenue')
  const costLines = LINES.filter(l => l.section === 'costs' || l.section === 'staff' || l.section === 'opex')
  const totalRevenue = revenueLines.reduce((s,l) => s + Number(actuals?.[l.key] || 0), 0)
  const totalCosts = costLines.reduce((s,l) => s + Number(actuals?.[l.key] || 0), 0)
  const grossProfit = totalRevenue - totalCosts

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem', flexWrap:'wrap', gap:'1rem'}}>
        <div style={{fontFamily:'Georgia,serif', fontSize:'1.1rem', fontWeight:700, color:C.navy}}>Monthly Actuals</div>
        <div style={{display:'flex', gap:'0.75rem', flexWrap:'wrap', alignItems:'center'}}>
          {canSeeAll && (
            <select style={{fontFamily:'monospace', fontSize:'0.75rem', padding:'0.38rem 0.6rem', border:`1px solid ${C.border}`, borderRadius:4, background:C.white, color:C.navy}}
              value={selUnit} onChange={e => setSelUnit(e.target.value)}>
              {visibleUnits.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          )}
          <select style={{fontFamily:'monospace', fontSize:'0.75rem', padding:'0.38rem 0.6rem', border:`1px solid ${C.border}`, borderRadius:4, background:C.white, color:C.navy}}
            value={selPeriod} onChange={e => setSelPeriod(e.target.value)}>
            {PERIOD_MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>

      {/* Consolidated summary for CEO/FM */}
      {canSeeAll && allActuals.length > 0 && (
        <div style={{...card, marginBottom:'1.25rem'}}>
          <div style={{fontWeight:700, color:C.navy, marginBottom:'0.75rem', fontSize:'0.88rem'}}>All Units  -  {PERIOD_MONTHS.find(m => m.value === selPeriod)?.label}</div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.78rem', fontFamily:'monospace'}}>
              <thead>
                <tr style={{background:C.navy, color:C.white}}>
                  {['Business Unit','Revenue','Costs','Gross Profit','Status'].map(h => (
                    <th key={h} style={{padding:'8px 10px', textAlign:'left', fontWeight:600}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allActuals.map((a, i) => {
                  const rev = Number(a.revenue_primary||0) + Number(a.revenue_secondary||0) + Number(a.revenue_other||0)
                  const costs = Number(a.cost_of_sales||0) + Number(a.input_purchases||0) + Number(a.staff_cost||0) + Number(a.direct_operating_cost||0) + Number(a.transport_cost||0)
                  const gp = rev - costs
                  return (
                    <tr key={a.id} style={{background: i % 2 === 0 ? C.cream : C.white, cursor:'pointer'}} onClick={() => setSelUnit(a.business_unit)}>
                      <td style={{padding:'8px 10px', fontWeight:600, color:C.navy}}>{a.business_unit}</td>
                      <td style={{padding:'8px 10px', color:C.green}}>{fmtNum(rev)}</td>
                      <td style={{padding:'8px 10px', color:C.red}}>{fmtNum(costs)}</td>
                      <td style={{padding:'8px 10px', fontWeight:700, color: gp >= 0 ? C.green : C.red}}>{fmtNum(gp)}</td>
                      <td style={{padding:'8px 10px'}}>
                        <span style={{fontFamily:'monospace', fontSize:'0.63rem', padding:'0.1rem 0.42rem', borderRadius:4, background: a.submitted ? C.green : C.amber, color:C.white}}>
                          {a.submitted ? 'Submitted' : 'Draft'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unit entry form */}
      <div style={card}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.5rem'}}>
          <div style={{fontWeight:700, color:C.navy, fontSize:'0.9rem'}}>{selUnit}</div>
          {actuals?.submitted && (
            <span style={{fontFamily:'monospace', fontSize:'0.65rem', padding:'0.15rem 0.5rem', borderRadius:4, background:C.green, color:C.white}}>Submitted</span>
          )}
        </div>

        {loading ? (
          <div style={{color:C.slate, padding:'1rem', fontSize:'0.83rem'}}>Loading...</div>
        ) : (
          <>
            {(['revenue','costs','staff','opex'] as const).map(section => {
              const sectionLines = LINES.filter(l => l.section === section)
              if (sectionLines.length === 0) return null
              const sectionLabel = section === 'revenue' ? 'Revenue' : section === 'costs' ? 'Cost of Sales' : section === 'staff' ? 'Staff Costs' : 'Overheads'
              const sectionTotal = sectionLines.reduce((s,l) => s + Number(actuals?.[l.key] || 0), 0)
              return (
                <div key={section} style={{marginBottom:'1.5rem'}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:`2px solid ${section==='revenue'?C.green:C.red}`, paddingBottom:'0.4rem', marginBottom:'0.75rem'}}>
                    <div style={{fontFamily:'monospace', fontSize:'0.68rem', letterSpacing:'0.1em', color:section==='revenue'?C.green:C.red, textTransform:'uppercase', fontWeight:700}}>{sectionLabel}</div>
                    <div style={{fontFamily:'monospace', fontSize:'0.78rem', fontWeight:700, color:section==='revenue'?C.green:C.red}}>{fmtNum(sectionTotal)}</div>
                  </div>
                  {sectionLines.map(line => (
                    <div key={line.key} style={{display:'grid', gridTemplateColumns:'1fr 180px', alignItems:'center', gap:'0.75rem', marginBottom:'0.5rem', padding:'0.45rem 0.75rem', background:C.cream, borderRadius:4}}>
                      <label style={{fontWeight:600, fontSize:'0.82rem', color:C.navy, lineHeight:1.3}}>{line.label}</label>
                      <input
                        type="number"
                        style={{width:'100%', padding:'0.42rem 0.6rem', border:`1px solid ${C.border}`, borderRadius:4, fontSize:'0.83rem', fontFamily:'monospace', background: actuals?.submitted ? '#F5F5F5' : C.white, color:C.navy, textAlign:'right', boxSizing:'border-box'}}
                        value={actuals?.[line.key] || ''}
                        disabled={actuals?.submitted && !canSeeAll}
                        placeholder="0"
                        onChange={e => setActuals((a: any) => ({...a, [line.key]: e.target.value}))}
                      />
                    </div>
                  ))}
                </div>
              )
            })}

            <div>
              <label style={{display:'block', fontWeight:600, fontSize:'0.78rem', marginBottom:'0.22rem', color:C.navy}}>Notes</label>
              <textarea
                style={{width:'100%', padding:'0.42rem 0.6rem', border:`1px solid ${C.border}`, borderRadius:4, fontSize:'0.83rem', fontFamily:'inherit', background:'#F4F8FC', color:C.navy, minHeight:60, resize:'vertical', boxSizing:'border-box'}}
                value={actuals?.notes || ''}
                onChange={e => setActuals(a => ({...a, notes: e.target.value}))}
                placeholder="Any notes on this period..."
              />
            </div>

            <div style={{display:'flex', gap:'0.75rem', marginTop:'1rem', alignItems:'center', flexWrap:'wrap'}}>
              <div style={{display:'flex', gap:'0.5rem', flexWrap:'wrap'}}>
                <div style={{fontFamily:'monospace', fontSize:'0.72rem', color:C.slate}}>Revenue: <strong style={{color:C.green}}>{fmtNum(totalRevenue)}</strong></div>
                <div style={{fontFamily:'monospace', fontSize:'0.72rem', color:C.slate}}>Costs: <strong style={{color:C.red}}>{fmtNum(totalCosts)}</strong></div>
                <div style={{fontFamily:'monospace', fontSize:'0.72rem', color:C.slate}}>Gross Profit: <strong style={{color: grossProfit >= 0 ? C.green : C.red}}>{fmtNum(grossProfit)}</strong></div>
              </div>
              <div style={{marginLeft:'auto', display:'flex', gap:'0.6rem'}}>
                <button style={{fontFamily:'monospace', fontSize:'0.72rem', padding:'0.38rem 0.8rem', border:`1px solid ${C.border}`, borderRadius:4, background:'transparent', color:C.slate, cursor:'pointer'}} onClick={() => save(false)} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Draft'}
                </button>
                {!actuals?.submitted && (
                  <button style={{fontFamily:'monospace', fontSize:'0.78rem', fontWeight:600, padding:'0.5rem 1.1rem', border:'none', borderRadius:4, background:C.navy, color:C.white, cursor:'pointer'}} onClick={() => save(true)} disabled={saving}>
                    Submit for Review
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── TIME RECORDS TAB ──────────────────────────────────────
function TimeRecordsTab({role,userId,userName,businessUnit}:{role:string;userId:string;userName:string;businessUnit:string}) {
  const isFM = role === 'finance_manager'
  const isCEO = role === 'ceo'
  const isStaff = !isFM && !isCEO

  const [records, setRecords] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [showForm, setShowForm] = React.useState(false)
  const [form, setForm] = React.useState({
    business_unit: businessUnit || '',
    period: `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`,
    total_days: '',
    description: '',
  })
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    async function load() {
      try {
                let query = supabase.from('staff_time_records').select('*').eq('client_id', CONAS_CLIENT_ID).order('created_at', {ascending:false})
        if (isStaff) query = query.eq('submitted_by', userId)
        const { data } = await query
        setRecords(data || [])
      } catch(e) {}
      setLoading(false)
    }
    load()
  }, [isStaff, userId])

  async function submit() {
    if (!form.business_unit || !form.total_days || !form.period) return
    setSaving(true)
    try {
            const { data } = await supabase.from('staff_time_records').insert([{
        client_id: CONAS_CLIENT_ID,
        submitted_by: userId,
        submitted_by_name: userName || '',
        business_unit: form.business_unit,
        period: form.period,
        total_days: Number(form.total_days),
        description: form.description,
        status: 'pending',
      }]).select().single()
      setRecords(prev => [data, ...prev])
      setShowForm(false)
      setForm({business_unit: businessUnit || '', period: form.period, total_days: '', description: ''})
    } catch(e) {}
    setSaving(false)
  }

  async function updateRecord(id, updates) {
        await supabase.from('staff_time_records').update({...updates, updated_at:new Date().toISOString()}).eq('id', id)
    setRecords(prev => prev.map(r => r.id !== id ? r : {...r, ...updates}))
  }

  const statusColor = (s) => s === 'approved' ? C.green : s === 'queried' ? C.amber : C.slate
  const pending = records.filter(r => r.status === 'pending')

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem'}}>
        <div style={{fontFamily:'Georgia,serif', fontSize:'1.1rem', fontWeight:700, color:C.navy}}>
          Staff Time Records {isFM && pending.length > 0 && <span style={{fontFamily:'monospace', fontSize:'0.72rem', color:C.amber, marginLeft:'0.5rem'}}>({pending.length} pending review)</span>}
        </div>
        {!isCEO && (
          <button style={{fontFamily:'monospace', fontSize:'0.72rem', padding:'0.38rem 0.8rem', border:`1px solid ${C.cyan}`, borderRadius:4, background:'transparent', color:C.cyan, cursor:'pointer'}} onClick={() => setShowForm(!showForm)}>
            + Submit Time Record
          </button>
        )}
      </div>

      {showForm && (
        <div style={{...card, border:`1px solid ${C.cyan}`, marginBottom:'1.25rem'}}>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:'1rem', marginBottom:'1rem'}}>
            <div>
              <label style={{display:'block', fontWeight:600, fontSize:'0.8rem', marginBottom:'0.22rem', color:C.navy}}>Business Unit</label>
              <select style={{width:'100%', padding:'0.42rem 0.6rem', border:`1px solid ${C.border}`, borderRadius:4, fontSize:'0.83rem', fontFamily:'inherit', background:'#F4F8FC', color:C.navy, boxSizing:'border-box'}}
                value={form.business_unit} onChange={e => setForm(f => ({...f, business_unit: e.target.value}))}>
                <option value="">Select...</option>
                {TEAM_BUSINESS_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={{display:'block', fontWeight:600, fontSize:'0.8rem', marginBottom:'0.22rem', color:C.navy}}>Period</label>
              <select style={{width:'100%', padding:'0.42rem 0.6rem', border:`1px solid ${C.border}`, borderRadius:4, fontSize:'0.83rem', fontFamily:'inherit', background:'#F4F8FC', color:C.navy, boxSizing:'border-box'}}
                value={form.period} onChange={e => setForm(f => ({...f, period: e.target.value}))}>
                {Array.from({length:12}, (_,i) => {
                  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 6 + i)
                  const v = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
                  return <option key={v} value={v}>{d.toLocaleString('en-GB',{month:'long',year:'numeric'})}</option>
                })}
              </select>
            </div>
            <div>
              <label style={{display:'block', fontWeight:600, fontSize:'0.8rem', marginBottom:'0.22rem', color:C.navy}}>Days Worked on This Unit</label>
              <input type="number" style={{width:'100%', padding:'0.42rem 0.6rem', border:`1px solid ${C.border}`, borderRadius:4, fontSize:'0.83rem', fontFamily:'monospace', background:'#F4F8FC', color:C.navy, boxSizing:'border-box'}}
                value={form.total_days} onChange={e => setForm(f => ({...f, total_days: e.target.value}))} placeholder="e.g. 18"/>
            </div>
          </div>
          <div style={{marginBottom:'1rem'}}>
            <label style={{display:'block', fontWeight:600, fontSize:'0.8rem', marginBottom:'0.22rem', color:C.navy}}>Description of Work Done</label>
            <textarea style={{width:'100%', padding:'0.42rem 0.6rem', border:`1px solid ${C.border}`, borderRadius:4, fontSize:'0.83rem', fontFamily:'inherit', background:'#F4F8FC', color:C.navy, minHeight:60, resize:'vertical', boxSizing:'border-box'}}
              value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Briefly describe what you did this month for this unit..."/>
          </div>
          <div style={{display:'flex', gap:'0.6rem'}}>
            <button style={{fontFamily:'monospace', fontSize:'0.78rem', fontWeight:600, padding:'0.5rem 1.1rem', border:'none', borderRadius:4, background:C.navy, color:C.white, cursor:'pointer'}} onClick={submit} disabled={saving}>
              {saving ? 'Submitting...' : 'Submit Time Record'}
            </button>
            <button style={{fontFamily:'monospace', fontSize:'0.72rem', padding:'0.38rem 0.8rem', border:`1px solid ${C.border}`, borderRadius:4, background:'transparent', color:C.slate, cursor:'pointer'}} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{color:C.slate, padding:'1.5rem', fontSize:'0.83rem'}}>Loading...</div>
      ) : records.length === 0 ? (
        <div style={{...card, textAlign:'center', color:C.slate, padding:'2rem', fontSize:'0.85rem'}}>No time records yet.</div>
      ) : (
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.8rem'}}>
            <thead>
              <tr style={{background:C.navy, color:C.white}}>
                {['Submitted By','Business Unit','Period','Days','Description','Status', isFM ? 'Actions' : ''].filter(Boolean).map(h => (
                  <th key={h} style={{padding:'9px 12px', textAlign:'left', fontWeight:600, whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={r.id} style={{background: i % 2 === 0 ? C.cream : C.white, verticalAlign:'top'}}>
                  <td style={{padding:'9px 12px', color:C.navy, fontWeight:600}}>{r.submitted_by_name || ' - '}</td>
                  <td style={{padding:'9px 12px', color:C.slate, fontSize:'0.78rem'}}>{r.business_unit}</td>
                  <td style={{padding:'9px 12px', fontFamily:'monospace', fontSize:'0.75rem'}}>{r.period?.split('-').slice(0,2).join('/')}</td>
                  <td style={{padding:'9px 12px', fontFamily:'monospace', fontWeight:700}}>{r.total_days}</td>
                  <td style={{padding:'9px 12px', color:C.slate, maxWidth:200, fontSize:'0.78rem'}}>{r.description}</td>
                  <td style={{padding:'9px 12px'}}>
                    <span style={{fontFamily:'monospace', fontSize:'0.63rem', padding:'0.1rem 0.42rem', borderRadius:4, background:statusColor(r.status), color:C.white}}>
                      {r.status}
                    </span>
                    {r.fm_query && <div style={{fontSize:'0.72rem', color:C.amber, marginTop:'0.25rem'}}>Query: {r.fm_query}</div>}
                  </td>
                  {isFM && (
                    <td style={{padding:'9px 12px'}}>
                      {r.status === 'pending' && (
                        <div style={{display:'flex', flexDirection:'column', gap:'0.35rem'}}>
                          <button style={{fontFamily:'monospace', fontSize:'0.65rem', padding:'0.2rem 0.5rem', border:'none', borderRadius:3, background:C.green, color:C.white, cursor:'pointer'}}
                            onClick={() => updateRecord(r.id, {status:'approved', fm_reviewed_at:new Date().toISOString()})}>
                            Approve
                          </button>
                          <button style={{fontFamily:'monospace', fontSize:'0.65rem', padding:'0.2rem 0.5rem', border:`1px solid ${C.amber}`, borderRadius:3, background:'transparent', color:C.amber, cursor:'pointer'}}
                            onClick={() => {
                              const q = prompt('Enter your query for this time record:')
                              if (q) updateRecord(r.id, {status:'queried', fm_query:q, fm_reviewed_at:new Date().toISOString()})
                            }}>
                            Query
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── SPEND REQUESTS TAB ────────────────────────────────────
function SpendRequestsTab({role,userId,userName,businessUnit}:{role:string;userId:string;userName:string;businessUnit:string}) {
  const isCEO = role === 'ceo'
  const isFM = role === 'finance_manager'

  const CATEGORIES = ['staff','inputs','transport','equipment','overhead','other']

  const [requests, setRequests] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [showForm, setShowForm] = React.useState(false)
  const [form, setForm] = React.useState({
    business_unit: businessUnit || '',
    amount: '',
    description: '',
    category: 'other',
    is_shared_cost: false,
    period: `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`,
  })
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    async function load() {
      try {
                let query = supabase.from('spend_requests').select('*').eq('client_id', CONAS_CLIENT_ID).order('created_at', {ascending:false})
        if (!isCEO && !isFM) query = query.eq('requested_by', userId)
        const { data } = await query
        setRequests(data || [])
      } catch(e) {}
      setLoading(false)
    }
    load()
  }, [isCEO, isFM, userId])

  async function submitRequest() {
    if (!form.business_unit || !form.amount || !form.description) return
    setSaving(true)
    try {
            const { data } = await supabase.from('spend_requests').insert([{
        client_id: CONAS_CLIENT_ID,
        requested_by: userId,
        requested_by_name: userName || '',
        business_unit: form.is_shared_cost ? 'HQ Shared' : form.business_unit,
        amount: Number(form.amount),
        currency: 'UGX',
        description: form.description,
        category: form.category,
        is_shared_cost: form.is_shared_cost,
        period: form.period,
        status: 'pending_fm',
      }]).select().single()
      setRequests(prev => [data, ...prev])
      setShowForm(false)
    } catch(e) {}
    setSaving(false)
  }

  async function fmForward(id) {
        const updates = {status:'pending_ceo', fm_reviewed_at:new Date().toISOString(), fm_reviewed_by:userId, updated_at:new Date().toISOString()}
    await supabase.from('spend_requests').update(updates).eq('id', id)
    setRequests(prev => prev.map(r => r.id !== id ? r : {...r, ...updates}))
  }

  async function ceoDecide(id, approved) {
    const updates = {
      status: approved ? 'approved' : 'declined',
      ceo_decided_at: new Date().toISOString(),
      ceo_decided_by: userId,
      posted_to_actuals: approved,
      posted_at: approved ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }
    await supabase.from('spend_requests').update(updates).eq('id', id)
    if (approved) {
      const req = requests.find(r => r.id === id)
      if (req) {
        const period = req.period || `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`
        const costField = req.category === 'staff' ? 'staff_cost'
          : req.category === 'inputs' ? 'input_purchases'
          : req.category === 'transport' ? 'transport_cost'
          : 'direct_operating_cost'
        const { data: existing } = await supabase
          .from('unit_actuals')
          .select('*')
          .eq('client_id', CONAS_CLIENT_ID)
          .eq('business_unit', req.business_unit)
          .eq('period', period)
          .maybeSingle()
        const currentVal = Number(existing?.[costField] || 0)
        await supabase.from('unit_actuals').upsert({
          ...(existing || {}),
          client_id: CONAS_CLIENT_ID,
          business_unit: req.business_unit,
          period,
          [costField]: currentVal + Number(req.amount),
          updated_at: new Date().toISOString(),
        }, {onConflict:'client_id,business_unit,period'})
      }
    }
    setRequests(prev => prev.map(r => r.id !== id ? r : {...r, ...updates}))
  }

  function fmtNum(n) { return Number(n || 0).toLocaleString() }

  const statusColor = (s) => ({
    pending_fm: C.slate, pending_ceo: C.amber, approved: C.green, declined: C.red
  })[s] || C.slate

  const statusLabel = (s) => ({
    pending_fm: 'Pending FM Review', pending_ceo: 'Pending CEO Approval', approved: 'Approved', declined: 'Declined'
  })[s] || s

  const pendingCEO = requests.filter(r => r.status === 'pending_ceo')
  const pendingFM = requests.filter(r => r.status === 'pending_fm')

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem'}}>
        <div style={{fontFamily:'Georgia,serif', fontSize:'1.1rem', fontWeight:700, color:C.navy}}>
          Spend Requests
          {isCEO && pendingCEO.length > 0 && <span style={{fontFamily:'monospace', fontSize:'0.72rem', color:C.amber, marginLeft:'0.5rem'}}>({pendingCEO.length} awaiting your approval)</span>}
          {isFM && pendingFM.length > 0 && <span style={{fontFamily:'monospace', fontSize:'0.72rem', color:C.amber, marginLeft:'0.5rem'}}>({pendingFM.length} to review)</span>}
        </div>
        {!isCEO && (
          <button style={{fontFamily:'monospace', fontSize:'0.72rem', padding:'0.38rem 0.8rem', border:`1px solid ${C.cyan}`, borderRadius:4, background:'transparent', color:C.cyan, cursor:'pointer'}} onClick={() => setShowForm(!showForm)}>
            + New Request
          </button>
        )}
      </div>

      {showForm && (
        <div style={{...card, border:`1px solid ${C.cyan}`, marginBottom:'1.25rem'}}>
          <div style={{fontWeight:700, color:C.navy, marginBottom:'1rem', fontSize:'0.88rem'}}>New Spend Request</div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:'1rem', marginBottom:'1rem'}}>
            <div>
              <label style={{display:'block', fontWeight:600, fontSize:'0.8rem', marginBottom:'0.22rem', color:C.navy}}>Business Unit</label>
              <select style={{width:'100%', padding:'0.42rem 0.6rem', border:`1px solid ${C.border}`, borderRadius:4, fontSize:'0.83rem', fontFamily:'inherit', background:'#F4F8FC', color:C.navy, boxSizing:'border-box'}}
                value={form.business_unit} onChange={e => setForm(f => ({...f, business_unit: e.target.value}))}>
                <option value="">Select...</option>
                {TEAM_BUSINESS_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={{display:'block', fontWeight:600, fontSize:'0.8rem', marginBottom:'0.22rem', color:C.navy}}>Amount (UGX)</label>
              <input type="number" style={{width:'100%', padding:'0.42rem 0.6rem', border:`1px solid ${C.border}`, borderRadius:4, fontSize:'0.83rem', fontFamily:'monospace', background:'#F4F8FC', color:C.navy, boxSizing:'border-box'}}
                value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))} placeholder="0"/>
            </div>
            <div>
              <label style={{display:'block', fontWeight:600, fontSize:'0.8rem', marginBottom:'0.22rem', color:C.navy}}>Category</label>
              <select style={{width:'100%', padding:'0.42rem 0.6rem', border:`1px solid ${C.border}`, borderRadius:4, fontSize:'0.83rem', fontFamily:'inherit', background:'#F4F8FC', color:C.navy, boxSizing:'border-box'}}
                value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div style={{marginBottom:'1rem'}}>
            <label style={{display:'block', fontWeight:600, fontSize:'0.8rem', marginBottom:'0.22rem', color:C.navy}}>Description</label>
            <textarea style={{width:'100%', padding:'0.42rem 0.6rem', border:`1px solid ${C.border}`, borderRadius:4, fontSize:'0.83rem', fontFamily:'inherit', background:'#F4F8FC', color:C.navy, minHeight:60, resize:'vertical', boxSizing:'border-box'}}
              value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="What is this spend for?"/>
          </div>
          <label style={{display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.83rem', color:C.navy, marginBottom:'1rem', cursor:'pointer'}}>
            <input type="checkbox" checked={form.is_shared_cost} onChange={e => setForm(f => ({...f, is_shared_cost: e.target.checked}))}/>
            This is a shared/HQ cost (not specific to one unit)
          </label>
          <div style={{display:'flex', gap:'0.6rem'}}>
            <button style={{fontFamily:'monospace', fontSize:'0.78rem', fontWeight:600, padding:'0.5rem 1.1rem', border:'none', borderRadius:4, background:C.navy, color:C.white, cursor:'pointer'}} onClick={submitRequest} disabled={saving}>
              {saving ? 'Submitting...' : 'Submit Request'}
            </button>
            <button style={{fontFamily:'monospace', fontSize:'0.72rem', padding:'0.38rem 0.8rem', border:`1px solid ${C.border}`, borderRadius:4, background:'transparent', color:C.slate, cursor:'pointer'}} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{color:C.slate, padding:'1.5rem', fontSize:'0.83rem'}}>Loading...</div>
      ) : requests.length === 0 ? (
        <div style={{...card, textAlign:'center', color:C.slate, padding:'2rem', fontSize:'0.85rem'}}>No spend requests yet.</div>
      ) : (
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.8rem'}}>
            <thead>
              <tr style={{background:C.navy, color:C.white}}>
                {['Requested By','Unit','Category','Amount','Description','Status','Actions'].map(h => (
                  <th key={h} style={{padding:'9px 12px', textAlign:'left', fontWeight:600, whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((r, i) => (
                <tr key={r.id} style={{background: i % 2 === 0 ? C.cream : C.white, verticalAlign:'top'}}>
                  <td style={{padding:'9px 12px', fontWeight:600, color:C.navy, fontSize:'0.78rem'}}>{r.requested_by_name || ' - '}</td>
                  <td style={{padding:'9px 12px', color:C.slate, fontSize:'0.75rem'}}>{r.business_unit}</td>
                  <td style={{padding:'9px 12px', fontFamily:'monospace', fontSize:'0.72rem'}}>{r.category}</td>
                  <td style={{padding:'9px 12px', fontFamily:'monospace', fontWeight:700, color:C.navy}}>{fmtNum(r.amount)}</td>
                  <td style={{padding:'9px 12px', color:C.slate, maxWidth:200, fontSize:'0.78rem'}}>{r.description}</td>
                  <td style={{padding:'9px 12px'}}>
                    <span style={{fontFamily:'monospace', fontSize:'0.63rem', padding:'0.1rem 0.42rem', borderRadius:4, background:statusColor(r.status), color:C.white, whiteSpace:'nowrap'}}>
                      {statusLabel(r.status)}
                    </span>
                    {r.posted_to_actuals && <div style={{fontSize:'0.68rem', color:C.teal, marginTop:'0.2rem'}}>Posted to actuals</div>}
                  </td>
                  <td style={{padding:'9px 12px'}}>
                    {isFM && r.status === 'pending_fm' && (
                      <button style={{fontFamily:'monospace', fontSize:'0.65rem', padding:'0.2rem 0.5rem', border:'none', borderRadius:3, background:C.cyan, color:C.navy, cursor:'pointer', whiteSpace:'nowrap'}}
                        onClick={() => fmForward(r.id)}>
                        Forward to CEO
                      </button>
                    )}
                    {isCEO && r.status === 'pending_ceo' && (
                      <div style={{display:'flex', flexDirection:'column', gap:'0.35rem'}}>
                        <button style={{fontFamily:'monospace', fontSize:'0.65rem', padding:'0.2rem 0.5rem', border:'none', borderRadius:3, background:C.green, color:C.white, cursor:'pointer'}}
                          onClick={() => ceoDecide(r.id, true)}>
                          Approve
                        </button>
                        <button style={{fontFamily:'monospace', fontSize:'0.65rem', padding:'0.2rem 0.5rem', border:'none', borderRadius:3, background:C.red, color:C.white, cursor:'pointer'}}
                          onClick={() => ceoDecide(r.id, false)}>
                          Decline
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


function ApprovalsTab({spendingRequests,pending,spendForm,setSpendForm,allActiveUnits,months,cc,canSubmitRequest,canApprove,submitSpend,resolveRequest}:{spendingRequests:any[];pending:any[];spendForm:any;setSpendForm:any;allActiveUnits:any[];months:string[];cc:string;canSubmitRequest:boolean;canApprove:boolean;submitSpend:()=>void;resolveRequest:(id:string,approved:boolean,note:string)=>void}) {
  const [note,setNote]=useState<Record<string,string>>({})
  const all=[...spendingRequests].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
  return(
    <div>
      <div style={card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
          <div style={secH}>Submit a Spending Request</div>
          {canSubmitRequest && <button style={addBtn()} onClick={()=>setSpendForm(s=>({...s,show:!s.show}))}>{spendForm.show?'Cancel':'+ New Request'}</button>}
        </div>
        {spendForm.show&&(
          <div style={{background:'#F4F8FC',borderRadius:6,padding:'1rem',border:`1px solid ${C.border}`}}>
            <div style={fGrid}>
              <div><label style={lbl}>Requested by</label>
                <select style={inp} value={spendForm.requester} onChange={e=>setSpendForm(s=>({...s,requester:e.target.value}))}>
                  {['Finance Manager','Operations Manager','Business Development Manager','FGE Services Manager','Farm Manager','Advisory Team Lead'].map(r=><option key={r}>{r}</option>)}
                </select></div>
              <div><label style={lbl}>Business Unit</label>
                <select style={inp} value={spendForm.unitId} onChange={e=>setSpendForm(s=>({...s,unitId:e.target.value}))}>
                  {allActiveUnits.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                  <option value="shared">Shared / Central</option>
                </select></div>
              <div><label style={lbl}>Month</label>
                <select style={inp} value={spendForm.month} onChange={e=>setSpendForm(s=>({...s,month:Number(e.target.value)}))}>
                  {months.map((m,i)=><option key={i} value={i}>{m}</option>)}
                </select></div>
              <div><label style={lbl}>Amount ({cc})</label>
                <input type="number" style={inp} value={spendForm.amount||''} onChange={e=>setSpendForm(s=>({...s,amount:Number(e.target.value)}))} placeholder="0"/></div>
              <div style={{gridColumn:'1 / -1'}}><label style={lbl}>Description</label>
                <input style={inp} value={spendForm.desc} onChange={e=>setSpendForm(s=>({...s,desc:e.target.value}))} placeholder="e.g. Purchase fertiliser for Month 4 planting"/></div>
            </div>
            <button style={{fontFamily:'monospace',fontSize:'0.78rem',fontWeight:600,padding:'0.5rem 1.1rem',border:'none',borderRadius:4,background:C.navy,color:C.white,cursor:'pointer',marginTop:'0.85rem'}} onClick={submitSpend}>Submit Request for CEO Approval</button>
          </div>
        )}
      </div>
      {pending.length>0&&(
        <div style={card}>
          <div style={secH}>⏳ Pending CEO Approval ({pending.length})</div>
          {pending.map(r=>(
            <div key={r.id} style={{border:`1px solid ${C.amber}`,borderRadius:6,padding:'0.85rem',marginBottom:'0.75rem',background:'#FFF8E8'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.5rem'}}>
                <div>
                  <div style={{fontWeight:700,fontSize:'0.9rem'}}>{r.description}</div>
                  <div style={{fontSize:'0.77rem',color:C.slate,marginTop:2}}>By <strong>{r.requestedBy}</strong> · {unitName(r.unitId)} · {months[r.month]}</div>
                </div>
                <div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:C.amber,marginLeft:'1rem',whiteSpace:'nowrap'}}>{fmtFull(r.amount,cc)}</div>
              </div>
              <input style={{...inp,marginBottom:'0.5rem',fontSize:'0.8rem'}} placeholder="CEO note (required if declining)" value={note[r.id]||''} onChange={e=>setNote(n=>({...n,[r.id]:e.target.value}))}/>
              {canApprove && <div style={{display:'flex',gap:'0.6rem'}}>
                <button style={{fontSize:'0.78rem',fontWeight:600,padding:'0.4rem 0.9rem',border:'none',borderRadius:4,background:C.green,color:C.white,cursor:'pointer'}} onClick={()=>resolveRequest(r.id,true,note[r.id]||'')}>✓ Approve</button>
                <button style={{fontSize:'0.78rem',fontWeight:600,padding:'0.4rem 0.9rem',border:'none',borderRadius:4,background:C.red,color:C.white,cursor:'pointer'}} onClick={()=>{if(!note[r.id]){alert('Add a note explaining why this is declined.');return}resolveRequest(r.id,false,note[r.id])}}>✕ Decline</button>
              </div>}
            </div>
          ))}
        </div>
      )}
      {all.filter(r=>r.status!=='pending').length>0&&(
        <div style={card}>
          <div style={secH}>Resolved Requests</div>
          {all.filter(r=>r.status!=='pending').map(r=>(
            <div key={r.id} style={{border:`1px solid ${r.status==='approved'?C.green:C.red}`,borderRadius:5,padding:'0.7rem',marginBottom:'0.5rem',background:r.status==='approved'?'#F0F9F4':'#FDF0EE'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div>
                  <span style={{fontWeight:700,color:r.status==='approved'?C.green:C.red,marginRight:8}}>{r.status==='approved'?'✓ APPROVED':'✕ DECLINED'}</span>
                  <span style={{fontSize:'0.84rem'}}>{r.description}</span>
                  <div style={{fontSize:'0.72rem',color:C.slate,marginTop:2}}>{r.requestedBy} · {unitName(r.unitId)} · {months[r.month]}</div>
                  {r.ceoNote&&<div style={{fontSize:'0.74rem',color:C.slate,marginTop:4,fontStyle:'italic'}}>CEO note: {r.ceoNote}</div>}
                </div>
                <div style={{fontWeight:700,marginLeft:'1rem',color:r.status==='approved'?C.green:C.red,whiteSpace:'nowrap'}}>{fmtFull(r.amount,cc)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {all.length===0&&<div style={{...card,textAlign:'center',color:C.slate,padding:'2.5rem'}}>No spending requests yet.</div>}
    </div>
  )
}

// ── MAIN COMPONENT ──────────────────────────────────────────
export default function CONASDashboard({
  inputs: inputsProp,
  onInputsChange,
  permissions: permProp,
}: {
  inputs?: CONASInputs
  onInputsChange?: (inputs: CONASInputs) => void
  permissions?: DashboardPermissions
}) {
  const P = permProp || FULL_PERMISSIONS
  const [inputs,setInputsLocal]  = useState<CONASInputs>(inputsProp || defaultCONASInputs)
  const [loadingData, setLoadingData] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout>|null>(null)

  // Debts saved before the stable-id fix have no id and would still fall
  // back to array-index keys (the stale input/focus-on-delete bug this was
  // meant to fix). Used to backfill on both the load() path below and the
  // controlled inputsProp path (app/dashboard/conas/page.tsx passes
  // inputs={loadLocal(...)}, which can carry the same legacy data).
  function backfillDebtIds(cfg: CONASInputs): CONASInputs {
    const needsBackfill = (cfg.debts || []).some(d => !d.id)
    if (!needsBackfill) return cfg
    const debts = (cfg.debts || []).map((d, i) => d.id ? d : { ...d, id: `debt_legacy_${i}_${Date.now()}_${Math.random().toString(36).slice(2,7)}` })
    return { ...cfg, debts }
  }

  // Load saved config from Supabase on mount
  useEffect(() => {
    async function load() {
      try {
                const { data } = await sb
          .from('model_config')
          .select('config')
          .eq('client_id', CONAS_CLIENT_ID)
          .single()
        if (data?.config && Object.keys(data.config).length > 0) {
          const cfg = data.config as CONASInputs
          const fixed = backfillDebtIds(cfg)
          // Persist via setInputs (not setInputsLocal) when a backfill
          // happened, so the id is durably stable across reloads, not
          // just for this session.
          if (fixed !== cfg) setInputs(fixed)
          else setInputsLocal(cfg)
        }
      } catch {}
      setLoadingData(false)
    }
    if (!inputsProp) load()
    else setLoadingData(false)
  }, [])

  // Controlled-mode path: inputsProp can also carry legacy debts (e.g. from
  // loadLocal() in app/dashboard/conas/page.tsx). Normalize those too.
  // Memoized so the effect below and activeInputs use the exact same
  // computed ids -- calling backfillDebtIds twice would generate two
  // different random suffixes for the same legacy debt, desyncing the
  // rendered key from what actually gets persisted via onInputsChange.
  const normalizedInputsProp = React.useMemo(
    () => inputsProp ? backfillDebtIds(inputsProp) : null,
    [inputsProp]
  )

  useEffect(() => {
    if (!inputsProp || !normalizedInputsProp) return
    if (normalizedInputsProp !== inputsProp) onInputsChange?.(normalizedInputsProp)
  }, [inputsProp, normalizedInputsProp])

  const activeInputs = normalizedInputsProp || inputs

  function setInputs(newInputs: CONASInputs) {
    setInputsLocal(newInputs)
    onInputsChange?.(newInputs)
    // Debounced save to Supabase
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
                await supabase.from('model_config').upsert({
          client_id: CONAS_CLIENT_ID,
          config: newInputs,
          version: 1,
          updated_by: 'dashboard',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'client_id' })
      } catch {}
    }, 1000)
  }

  const [view,setView]      = useState('overview')
  const [planUnit,setPlanUnit] = useState('shop_1')
  const [lastAddedId,setLastAddedId] = useState<string|null>(null)
  const [unitPLView,setUnitPLView] = useState('fge')
  const [showActual,setShowActual] = useState(false)
  const [coachAssessments,setCoachAssessments] = useState<Record<string,unknown>|null>(null)
  const [spendForm,setSpendForm] = useState({show:false,desc:'',unitId:'fge',category:'direct_opex' as PlanLine['category'],month:0,amount:0,requester:'Finance Manager'})

  const result = useMemo(()=>runCONASModel(activeInputs),[activeInputs])
  const months = useMemo(()=>buildMonthLabels(activeInputs.global.modelStartDate),[activeInputs.global.modelStartDate])
  const cc = activeInputs.global.currency
  const {unitPL,con,cf,bs,metrics,allocUnits,subUnitsByParent} = result

  const season = activeInputs.seasons[0]
  const planLocked = season?.planLocked||false
  const pending = activeInputs.spendingRequests.filter(r=>r.status==='pending')

  const allActiveUnits = activeInputs.units.filter(u=>u.active)
  const topUnits = allActiveUnits.filter(u=>!u.parentId)
  const shopUnits = allActiveUnits.filter(u=>u.parentId==='input_centres')

  const upd = useCallback((fn:(p:CONASInputs)=>CONASInputs)=>{
    const next = fn(activeInputs)
    setInputs(next)
  },[activeInputs])
  const setG = (f:string,v:unknown)=>upd(p=>({...p,global:{...p.global,[f]:v}}))

  function setPlanVal(uid:string,lid:string,m:number,v:number){
    upd(p=>({...p,units:p.units.map(u=>u.id!==uid?u:{...u,lines:u.lines.map(l=>l.id!==lid?l:{...l,monthlyPlan:l.monthlyPlan.map((x,i)=>i===m?v:x)})})}))
  }
  function setActualVal(uid:string,lid:string,m:number,v:number|null){
    upd(p=>({...p,units:p.units.map(u=>u.id!==uid?u:{...u,lines:u.lines.map(l=>l.id!==lid?l:{...l,monthlyActual:l.monthlyActual.map((x,i)=>i===m?v:x),actualStatus:l.actualStatus.map((s,i)=>i===m&&v!==null?'approved':s)})})}))
  }
  function setSharedVal(lid:string,m:number,v:number){
    upd(p=>({...p,sharedLines:p.sharedLines.map(l=>l.id!==lid?l:{...l,monthlyPlan:l.monthlyPlan.map((x,i)=>i===m?v:x)})}))
  }
  function addLine(uid:string,cat:PlanLine['category']){
    const nl:PlanLine=blankPlanLine(`l_${Date.now()}`,'New item',cat,MONTHS)
    upd(p=>({...p,units:p.units.map(u=>u.id!==uid?u:{...u,lines:[...u.lines,nl]})}))
    setLastAddedId(nl.id)
  }
  function removeLine(uid:string,lid:string){upd(p=>({...p,units:p.units.map(u=>u.id!==uid?u:{...u,lines:u.lines.filter(l=>l.id!==lid)})}))}
  function renameLine(uid:string,lid:string,name:string){upd(p=>({...p,units:p.units.map(u=>u.id!==uid?u:{...u,lines:u.lines.map(l=>l.id!==lid?l:{...l,name})})}))}
  // Switching a revenue line's type resets its type-specific numbers to zero --
  // a flat monthly figure from Standard doesn't map meaningfully onto buy/sell/
  // volume, so starting clean avoids silently carrying over a wrong number.
  // Mirrors generic-engine.ts's changeLineType exactly.
  function changeLineType(uid:string,lid:string,newType:PlanLineType){
    upd(p=>({...p,units:p.units.map(u=>{
      if(u.id!==uid) return u
      return {...u,lines:u.lines.map(l=>{
        if(l.id!==lid) return l
        const rebuilt = newType==='spread' ? spreadPlanLine(l.id,l.name,MONTHS)
          : newType==='service_fee' ? serviceFeePlanLine(l.id,l.name,MONTHS)
          : blankPlanLine(l.id,l.name,l.category,MONTHS)
        // Preserve actuals -- those were entered against real transactions and
        // aren't tied to how the plan side is structured.
        return {...rebuilt, monthlyActual:l.monthlyActual, actualStatus:l.actualStatus, rejectionNote:l.rejectionNote}
      })}
    })}))
  }
  // Generic updater for the monthly array fields used by spread and
  // service-fee lines (buyPrice, sellPrice, volume, feePerEngagement,
  // costPerEngagement, engagements) -- all share monthlyPlan's per-month shape.
  function updateLineArrayField(uid:string,lid:string,field:'buyPrice'|'sellPrice'|'volume'|'feePerEngagement'|'costPerEngagement'|'engagements',m:number,val:number){
    upd(p=>({...p,units:p.units.map(u=>{
      if(u.id!==uid) return u
      return {...u,lines:u.lines.map(l=>{
        if(l.id!==lid) return l
        const arr = (l[field] as number[]|undefined) ?? Array(MONTHS).fill(0)
        return {...l,[field]:arr.map((v,i)=>i===m?val:v)}
      })}
    })}))
  }
  function addShared(){
    const nl:PlanLine={...blankPlanLine(`sh_${Date.now()}`,'New shared cost','shared',MONTHS),isShared:true}
    upd(p=>({...p,sharedLines:[...p.sharedLines,nl]}))
    setLastAddedId(nl.id)
  }
  function toggleLock(){
    if(!window.confirm(planLocked?'Unlock the season plan?':'Lock the season plan? Unit heads cannot change plan figures after locking.'))return
    upd(p=>({...p,seasons:p.seasons.map((s,i)=>i!==0?s:{...s,planLocked:!s.planLocked,lockedAt:new Date().toISOString(),lockedBy:'CEO'})}))
  }
  function resolveRequest(id:string,approved:boolean,note:string){
    upd(p=>({...p,spendingRequests:p.spendingRequests.map(r=>r.id!==id?r:{...r,status:approved?'approved':'declined',ceoNote:note,resolvedAt:new Date().toISOString()})}))
  }
  function submitSpend(){
    if(!spendForm.desc||spendForm.amount<=0){alert('Please enter a description and amount.');return}
    const req:SpendingRequest={id:`sr_${Date.now()}`,requestedBy:spendForm.requester,description:spendForm.desc,unitId:spendForm.unitId,category:spendForm.category as SpendingRequest['category'],month:spendForm.month,amount:spendForm.amount,status:'pending',ceoNote:'',createdAt:new Date().toISOString(),resolvedAt:''}
    upd(p=>({...p,spendingRequests:[...p.spendingRequests,req]}))
    setSpendForm(s=>({...s,show:false,desc:'',amount:0}))
  }

  const unitName=(id:string)=>inputs.units.find(u=>u.id===id)?.name||id
  const yr=(a:number[])=>a.reduce((s,v)=>s+v,0)

  // ── OVERVIEW ─────────────────────────────────────────────
  function OverviewTab(){
    const trendData=months.map((label,i)=>({
      month:label,Revenue:Math.round(con.rev[i]),EBITDA:Math.round(con.ebitda[i]),Cash:Math.round(cf.close[i]),
      ...(con.actRev[i]!==null?{'Actual Revenue':Math.round(con.actRev[i] as number)}:{})
    }))
    const unitBars=[
      {name:'Inputs (total)',EBITDA:Math.round(yr(unitPL['input_centres']?.ebitda||[])),color:'#1B2A4A'},
      ...topUnits.filter(u=>u.id!=='input_centres'&&unitPL[u.id]).map(u=>({
        name:u.short,EBITDA:Math.round(yr(unitPL[u.id].ebitda)),color:u.color
      }))
    ]
    return(
      <div>
        {pending.length>0&&(
          <div style={{background:'#FFF8E8',border:`1px solid ${C.amber}`,borderRadius:8,padding:'0.9rem 1.1rem',marginBottom:'1.25rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontWeight:600,color:C.amber}}>⏳ {pending.length} spending request{pending.length>1?'s':''} waiting for CEO approval</span>
            <button style={{...addBtn(true),borderColor:C.amber,color:C.amber}} onClick={()=>setView('approvals')}>Review now →</button>
          </div>
        )}
        <div style={{background:planLocked?'#E8F6F8':'#F0F8FF',border:`1px solid ${planLocked?C.teal:C.cyan}`,borderRadius:8,padding:'0.75rem 1.1rem',marginBottom:'1.25rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontWeight:700,color:planLocked?C.teal:C.navy}}>{planLocked?'🔒 Season plan locked':'🔓 Season plan open  -  unit heads can edit'}</span>
          {P.canLockPlan && <button style={{...addBtn(true),borderColor:planLocked?C.teal:C.cyan,color:planLocked?C.teal:C.cyan}} onClick={toggleLock}>{planLocked?'Unlock Plan':'Lock Season Plan'}</button>}
        </div>
        <div style={kpiGrid}>
          <KPI label="Season Revenue (Plan)" value={fmt(metrics.totalRevenue,cc)} sub={`Gross margin ${pct(metrics.grossMargin)}`}/>
          <KPI label="Season EBITDA" value={fmt(metrics.totalEBITDA,cc)} color={metrics.totalEBITDA>=0?C.green:C.red} sub={`Net profit ${fmt(metrics.totalNPAT,cc)}`}/>
          <KPI label="Irrigation Investment" value={fmt(metrics.irrigationTotal,cc)} sub={`${metrics.fgeCount} FGEs × UGX 8M`}/>
          <KPI label="Approved Spending" value={fmt(metrics.approvedSpendTotal,cc)} color={metrics.approvedSpendTotal>0?C.amber:C.navy} sub="Posted to P&L & cash flow"/>
          <KPI label="Minimum Cash" value={fmt(metrics.minCash,cc)} color={metrics.minCash>=0?C.navy:C.red} sub={`Month ${metrics.minCashMonth}`}/>
          <KPI label="Pending Approvals" value={String(metrics.pendingRequests)} color={metrics.pendingRequests>0?C.amber:C.navy} sub="CEO action required" onClick={()=>setView('approvals')}/>
        </div>
        <div style={{...card,background:C.navy,color:C.white}}>
          <div style={{fontFamily:'monospace',fontSize:'0.63rem',letterSpacing:'0.12em',color:C.cyan,marginBottom:'0.7rem'}}>READING THE PICTURE</div>
          {metrics.minCash<0?<Flag type="warn">Cash goes negative  -  {fmtFull(metrics.minCash,cc)} in Month {metrics.minCashMonth}. Irrigation kits ({fmtFull(metrics.irrigationTotal,cc)}) drive the early deficit. Enter opening capital in Settings.</Flag>
            :<Flag type="ok">Cash stays positive. Lowest: {fmtFull(metrics.minCash,cc)} in Month {metrics.minCashMonth}.</Flag>}
          {metrics.totalEBITDA<0?<Flag type="warn">Season EBITDA is negative. FGE revenue peaks at harvest (months 4–5, 9–10). Input Centres and advisory services provide year-round income.</Flag>
            :<Flag type="ok">Season EBITDA: {fmtFull(metrics.totalEBITDA,cc)} ({pct(metrics.netMargin)} net margin).</Flag>}
          <Flag type="info">Five Input Profit Centres consolidated. Each centre has its own P&L  -  view in Unit P&L tab.</Flag>
          <Flag type="info">Shared costs ({fmt(metrics.totalShared,cc)}) allocated {pct(inputs.global.sharedCostFixedPct)} by headcount, {pct(1-inputs.global.sharedCostFixedPct)} by revenue.</Flag>
        </div>
        <div style={card}>
          <div style={secH}>Revenue, EBITDA & Cash  -  Season Overview</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData} margin={{top:8,right:16,left:8,bottom:8}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="month" tick={{fontSize:11,fill:C.slate}}/>
              <YAxis tick={{fontSize:11,fill:C.slate}} tickFormatter={v=>fmt(v,'').trim()} width={72}/>
              <Tooltip formatter={(v:number)=>fmtFull(v,cc)} contentStyle={{fontSize:'0.77rem',borderRadius:4,border:`1px solid ${C.border}`}}/>
              <Legend wrapperStyle={{fontSize:'0.77rem'}}/>
              <ReferenceLine y={0} stroke={C.red} strokeDasharray="3 3"/>
              <Line type="monotone" dataKey="Revenue" stroke={C.navy} strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="EBITDA" stroke={C.cyan} strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="Cash" stroke={C.green} strokeWidth={2} strokeDasharray="4 3" dot={false}/>
              <Line type="monotone" dataKey="Actual Revenue" stroke={C.teal} strokeWidth={2} strokeDasharray="2 2" dot={{r:3}}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={card}>
          <div style={secH}>EBITDA by Business Unit  -  Season Total</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={unitBars} margin={{top:4,right:16,left:8,bottom:4}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="name" tick={{fontSize:11,fill:C.slate}}/>
              <YAxis tick={{fontSize:11,fill:C.slate}} tickFormatter={v=>fmt(v,'').trim()} width={72}/>
              <Tooltip formatter={(v:number)=>fmtFull(v,cc)}/>
              <ReferenceLine y={0} stroke={C.red} strokeDasharray="3 3"/>
              <Bar dataKey="EBITDA" fill={C.cyan} radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:'1rem',marginBottom:'1.25rem'}}>
          {unitPL['input_centres']&&(()=>{
            const r=unitPL['input_centres']
            return(
              <div style={{background:C.white,border:`1px solid ${C.border}`,borderTop:'4px solid #1B2A4A',borderRadius:8,padding:'1rem 1.1rem'}}>
                <div style={{fontWeight:600,fontSize:'0.82rem',marginBottom:'0.3rem'}}>Input Profit Centres (×5)</div>
                <div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:r.annEbitda>=0?C.teal:C.red}}>{fmt(r.annEbitda,cc)}</div>
                <div style={{fontSize:'0.7rem',color:C.slate,marginBottom:'0.5rem'}}>EBITDA · Revenue: {fmt(r.annRev,cc)}</div>
                <button style={addBtn(true)} onClick={()=>{setUnitPLView('input_centres');setView('unitpl')}}>View consolidated P&L →</button>
              </div>
            )
          })()}
          {topUnits.filter(u=>u.id!=='input_centres'&&unitPL[u.id]).map(u=>{
            const r=unitPL[u.id]
            return(
              <div key={u.id} style={{background:C.white,border:`1px solid ${C.border}`,borderTop:`4px solid ${u.color}`,borderRadius:8,padding:'1rem 1.1rem'}}>
                <div style={{fontWeight:600,fontSize:'0.82rem',marginBottom:'0.3rem'}}>{u.name}</div>
                <div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:r.annEbitda>=0?C.teal:C.red}}>{fmt(r.annEbitda,cc)}</div>
                <div style={{fontSize:'0.7rem',color:C.slate,marginBottom:'0.5rem'}}>EBITDA · Revenue: {fmt(r.annRev,cc)}</div>
                <button style={addBtn(true)} onClick={()=>{setUnitPLView(u.id);setView('unitpl')}}>View unit P&L →</button>
              </div>
            )
          })}
        </div>
        <PLTable
          title="Consolidated P&L  -  Full Season"
          rows={[
            {label:'Revenue',plan:con.rev,actual:con.actRev},
            {label:'Cost of Sales',plan:con.cogs,negate:true},
            {label:'Gross Profit',plan:con.gp,bold:true},
            {label:'Total Overheads & Staff',plan:con.opex,negate:true},
            {label:'EBITDA',plan:con.ebitda,actual:con.actEbitda,bold:true,highlight:true},
            {label:'Finance Interest',plan:con.interest,negate:true},
            {label:'Net Profit Before Tax',plan:con.nbt,bold:true},
            {label:'Tax',plan:con.tax,negate:true},
            {label:'Net Profit After Tax',plan:con.npat,bold:true},
          ]}
          months={months}
          footnote="Revenue is seasonal. Large inflows at harvest months (4–5 and 9–10). Costs spread throughout season."
        />
      </div>
    )
  }

  function UnitPLTab(){
    const viewableUnits:[string,string][]=[
      ['input_centres','Input Profit Centres (Consolidated)'],
      ...shopUnits.map(u=>[u.id,u.name] as [string,string]),
      ...topUnits.filter(u=>u.id!=='input_centres'&&unitPL[u.id]).map(u=>[u.id,u.name] as [string,string]),
    ]
    const r = unitPL[unitPLView]
    const unitMeta = inputs.units.find(u=>u.id===unitPLView)
    const isConsolidated = unitPLView==='input_centres'
    return(
      <div>
        <div style={{display:'flex',gap:'0.45rem',marginBottom:'1.25rem',flexWrap:'wrap',alignItems:'center'}}>
          {viewableUnits.map(([id,name])=>(
            <button key={id}
              style={{fontFamily:'monospace',fontSize:'0.71rem',padding:'0.45rem 0.85rem',
                border:`2px solid ${unitPLView===id?(inputs.units.find(u=>u.id===id)?.color||C.cyan):C.border}`,
                borderRadius:4,
                background:unitPLView===id?(inputs.units.find(u=>u.id===id)?.color||C.cyan):C.white,
                color:unitPLView===id?C.white:C.navy,cursor:'pointer'}}
              onClick={()=>setUnitPLView(id)}>
              {inputs.units.find(u=>u.id===id)?.short||name.split(' ')[0]}{id==='input_centres'?' (All)':''}
            </button>
          ))}
          <button style={{...addBtn(true),marginLeft:'auto'}} onClick={()=>exportToPrint(`${unitPLView} P&L`)}>Export / Print</button>
        </div>
        {!r?(
          <div style={{...card,color:C.slate,textAlign:'center',padding:'2rem'}}>No P&L data for this unit.</div>
        ):(
          <>
            <div style={kpiGrid}>
              <KPI label="Season Revenue" value={fmt(r.annRev,cc)}/>
              <KPI label="Gross Profit" value={fmt(r.annGP,cc)} sub={`Margin ${pct(r.gpMargin)}`}/>
              <KPI label="Total Overheads" value={fmt(-(r.annStaff+r.annOpex+r.annShared),cc)} color={C.red}/>
              <KPI label="EBITDA" value={fmt(r.annEbitda,cc)} color={r.annEbitda>=0?C.green:C.red} sub={`Margin ${pct(r.ebitdaMargin)}`}/>
            </div>
            {isConsolidated&&(
              <div style={{...card,background:'#F0F8FF',border:`1px solid ${C.cyan}`,padding:'0.85rem 1.1rem',marginBottom:'1rem'}}>
                <div style={{fontSize:'0.83rem',color:C.navy,lineHeight:1.6}}>
                  <strong>Consolidated view of all 5 Input Profit Centres.</strong> Select an individual shop above to see that shop's own P&L.
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'0.6rem',marginTop:'0.75rem'}}>
                  {shopUnits.map(su=>unitPL[su.id]&&(
                    <div key={su.id} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:5,padding:'0.5rem 0.6rem',textAlign:'center'}}>
                      <div style={{fontSize:'0.68rem',color:C.slate,fontFamily:'monospace'}}>{su.short}</div>
                      <div style={{fontWeight:700,fontSize:'0.88rem',color:unitPL[su.id].annEbitda>=0?C.teal:C.red}}>{fmt(unitPL[su.id].annEbitda,cc)}</div>
                      <div style={{fontSize:'0.65rem',color:C.slate}}>EBITDA</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <PLTable
              title={`${isConsolidated?'Input Profit Centres (Consolidated)':unitMeta?.name||unitPLView}  -  Full P&L`}
              rows={[
                {label:'Revenue',plan:r.rev,actual:r.actRev},
                {label:'Cost of Sales',plan:r.cogs,actual:r.actCogs,negate:true},
                {label:'Gross Profit',plan:r.gp,bold:true},
                {label:'Staff Cost',plan:r.staff,actual:r.actStaff,negate:true},
                {label:'Direct Overheads',plan:r.opex,actual:r.actOpex,negate:true},
                {label:'Shared Cost Allocated',plan:r.shared,negate:true},
                {label:'Total Overheads',plan:r.totalOpex,negate:true,bold:true},
                {label:'EBITDA',plan:r.ebitda,bold:true,highlight:true},
              ]}
              months={months}
              footnote={`Shared cost allocation: ${pct(inputs.global.sharedCostFixedPct)} headcount, ${pct(1-inputs.global.sharedCostFixedPct)} revenue.`}
            />
            {isConsolidated&&(
              <div style={card}>
                <div style={secH}>Shop-by-Shop Comparison  -  Season EBITDA</div>
                <div style={{overflowX:'auto'}}>
                  <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.78rem',fontFamily:'monospace'}}>
                    <thead><tr style={{background:'#F4F8FC'}}>
                      {['Shop','Revenue','Gross Profit','GM%','Staff','Overheads','Shared','EBITDA','EBITDA%',''].map((h,i)=>(
                        <th key={i} style={{textAlign:i===0?'left':'right',padding:'0.35rem 0.6rem',borderBottom:`2px solid ${C.border}`,color:C.slate,fontWeight:600}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {shopUnits.map(su=>{
                        const sr=unitPL[su.id]
                        if(!sr)return null
                        return(
                          <tr key={su.id}>
                            <td style={{padding:'0.3rem 0.6rem',borderBottom:`1px solid #EEF2F6`,fontWeight:600}}>{su.name}</td>
                            <td style={{textAlign:'right',padding:'0.3rem 0.6rem',borderBottom:`1px solid #EEF2F6`}}>{fmt(sr.annRev,cc)}</td>
                            <td style={{textAlign:'right',padding:'0.3rem 0.6rem',borderBottom:`1px solid #EEF2F6`}}>{fmt(sr.annGP,cc)}</td>
                            <td style={{textAlign:'right',padding:'0.3rem 0.6rem',borderBottom:`1px solid #EEF2F6`}}>{pct(sr.gpMargin)}</td>
                            <td style={{textAlign:'right',padding:'0.3rem 0.6rem',borderBottom:`1px solid #EEF2F6`,color:C.red}}>{fmt(-sr.annStaff,cc)}</td>
                            <td style={{textAlign:'right',padding:'0.3rem 0.6rem',borderBottom:`1px solid #EEF2F6`,color:C.red}}>{fmt(-sr.annOpex,cc)}</td>
                            <td style={{textAlign:'right',padding:'0.3rem 0.6rem',borderBottom:`1px solid #EEF2F6`,color:C.red}}>{fmt(-sr.annShared,cc)}</td>
                            <td style={{textAlign:'right',padding:'0.3rem 0.6rem',borderBottom:`1px solid #EEF2F6`,fontWeight:700,color:sr.annEbitda>=0?C.green:C.red}}>{fmt(sr.annEbitda,cc)}</td>
                            <td style={{textAlign:'right',padding:'0.3rem 0.6rem',borderBottom:`1px solid #EEF2F6`,color:sr.ebitdaMargin>=0?C.navy:C.red}}>{pct(sr.ebitdaMargin)}</td>
                            <td style={{padding:'0.3rem 0.5rem',borderBottom:`1px solid #EEF2F6`}}>
                              <button style={addBtn(true)} onClick={()=>setUnitPLView(su.id)}>Detail →</button>
                            </td>
                          </tr>
                        )
                      })}
                      {unitPL['input_centres']&&(()=>{const tr=unitPL['input_centres'];return(
                        <tr style={{background:C.actualBg,fontWeight:700}}>
                          <td style={{padding:'0.3rem 0.6rem'}}>TOTAL</td>
                          <td style={{textAlign:'right',padding:'0.3rem 0.6rem'}}>{fmt(tr.annRev,cc)}</td>
                          <td style={{textAlign:'right',padding:'0.3rem 0.6rem'}}>{fmt(tr.annGP,cc)}</td>
                          <td style={{textAlign:'right',padding:'0.3rem 0.6rem'}}>{pct(tr.gpMargin)}</td>
                          <td style={{textAlign:'right',padding:'0.3rem 0.6rem',color:C.red}}>{fmt(-tr.annStaff,cc)}</td>
                          <td style={{textAlign:'right',padding:'0.3rem 0.6rem',color:C.red}}>{fmt(-tr.annOpex,cc)}</td>
                          <td style={{textAlign:'right',padding:'0.3rem 0.6rem',color:C.red}}>{fmt(-tr.annShared,cc)}</td>
                          <td style={{textAlign:'right',padding:'0.3rem 0.6rem',fontWeight:700,color:tr.annEbitda>=0?C.green:C.red}}>{fmt(tr.annEbitda,cc)}</td>
                          <td style={{textAlign:'right',padding:'0.3rem 0.6rem',color:tr.ebitdaMargin>=0?C.navy:C.red}}>{pct(tr.ebitdaMargin)}</td>
                          <td></td>
                        </tr>
                      )})()} 
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  function PlanningTab(){
    const allPlanUnits:[string,string][]=[
      ...shopUnits.map(u=>[u.id,u.name] as [string,string]),
      ...topUnits.filter(u=>u.id!=='input_centres').map(u=>[u.id,u.name] as [string,string]),
      ['shared','Shared / Central Costs'],
    ]
    const unitMeta=inputs.units.find(u=>u.id===planUnit)
    const r=unitPL[planUnit]
    const cats:[PlanLine['category'],string,string][]=[
      ['revenue','Revenue Plan','+ Add Revenue Line'],
      ['cost_of_sales','Cost of Sales','+ Add Cost of Sales'],
      ['staff','Staff Plan','+ Add Staff Role'],
      ['direct_opex','Direct Overheads','+ Add Overhead'],
    ]
    return(
      <div>
        <div style={{display:'flex',gap:'0.45rem',marginBottom:'1.25rem',flexWrap:'wrap',alignItems:'center'}}>
          {allPlanUnits.map(([id,name])=>{
            const meta=inputs.units.find(u=>u.id===id)
            const active=planUnit===id
            return(
              <button key={id}
                style={{fontFamily:'monospace',fontSize:'0.71rem',padding:'0.45rem 0.85rem',
                  border:`2px solid ${active?(meta?.color||C.slate):C.border}`,borderRadius:4,
                  background:active?(meta?.color||C.slate):C.white,
                  color:active?C.white:C.navy,cursor:'pointer'}}
                onClick={()=>setPlanUnit(id)}>
                {meta?.short||name.split(' ')[0]}
              </button>
            )
          })}
          <label style={{fontSize:'0.75rem',color:C.slate,display:'flex',alignItems:'center',gap:4,cursor:'pointer',marginLeft:'auto'}}>
            <input type="checkbox" checked={showActual} onChange={e=>setShowActual(e.target.checked)}/> Show actuals
          </label>
          {planLocked&&<span style={{fontFamily:'monospace',fontSize:'0.68rem',color:C.teal,border:`1px solid ${C.teal}`,borderRadius:4,padding:'0.2rem 0.5rem'}}>🔒 Locked</span>}
        </div>
        {planLocked&&<div style={{background:'#E8F6F8',border:`1px solid ${C.teal}`,borderRadius:6,padding:'0.7rem 1rem',marginBottom:'1rem',fontSize:'0.82rem',color:C.teal}}>🔒 Plan locked. View only. Unlock from Overview to make changes.</div>}
        {planUnit==='shared'?(
          <div style={card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
              <div style={secH}>Shared / Central Cost Pool</div>
              <button style={addBtn()} onClick={addShared}>+ Add Shared Cost</button>
            </div>
            <p style={{...hint,fontSize:'0.79rem',lineHeight:1.55,marginBottom:'0.85rem'}}>CEO, Finance Manager, Operations Manager, Business Development Manager, and all central overheads. Allocated {pct(inputs.global.sharedCostFixedPct)} by headcount, {pct(1-inputs.global.sharedCostFixedPct)} by revenue each month.</p>
            {inputs.sharedLines.map(l=>(
              <LineEditor key={l.id} line={l} months={months} cc={cc} planLocked={planLocked} showActual={false} isNew={l.id===lastAddedId}
                onPlanChange={(m,v)=>setSharedVal(l.id,m,v)}
                onActualChange={()=>{}}
                onRename={name=>upd(p=>({...p,sharedLines:p.sharedLines.map(sl=>sl.id!==l.id?sl:{...sl,name})}))}
                onRemove={()=>upd(p=>({...p,sharedLines:p.sharedLines.filter(sl=>sl.id!==l.id)}))}
              />
            ))}
          </div>
        ):unitMeta?(
          <>
            {r&&(
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:'0.75rem',marginBottom:'1.25rem'}}>
                {[
                  {label:'Revenue',v:r.annRev},{label:'Cost of Sales',v:-r.annCogs},
                  {label:'Gross Profit',v:r.annGP},{label:'Staff',v:-r.annStaff},
                  {label:'Overheads',v:-r.annOpex},{label:'Shared',v:-r.annShared},
                  {label:'EBITDA',v:r.annEbitda,highlight:true},
                ].map(({label,v,highlight})=>(
                  <div key={label} style={{background:highlight?C.navy:C.white,border:`1px solid ${highlight?C.navy:C.border}`,borderRadius:6,padding:'0.65rem 0.75rem'}}>
                    <div style={{fontSize:'0.62rem',fontFamily:'monospace',color:highlight?C.cyan:C.slate,letterSpacing:'0.06em'}}>{label.toUpperCase()}</div>
                    <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:highlight?(v>=0?C.cyan:C.red):(v<0?C.red:C.navy)}}>{fmt(v,cc)}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{...card,background:'#F0F8FF',border:`1px solid ${C.cyan}`,padding:'0.8rem 1rem',marginBottom:'1rem',fontSize:'0.82rem',color:C.navy,lineHeight:1.6}}>
              <strong>Planning sandbox for {unitMeta.name}.</strong> Change any figure  -  the EBITDA cards above update immediately.
            </div>
            {cats.map(([cat,title,addLabel])=>{
              const lines=unitMeta.lines.filter(l=>l.category===cat)
              const total=lines.reduce((s,l)=>s+l.monthlyPlan.reduce((a,b)=>a+b,0),0)
              return(
                <div key={cat} style={card}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
                    <div style={secH}>{title}</div>
                    <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
                      <span style={{fontFamily:'monospace',fontSize:'0.72rem',color:C.slate}}>Total: {fmt(cat==='revenue'?total:-total,cc)}</span>
                      {!planLocked&&<button style={addBtn()} onClick={()=>addLine(unitMeta.id,cat)}>{addLabel}</button>}
                    </div>
                  </div>
                  {lines.length===0&&<p style={{color:C.slate,fontSize:'0.82rem'}}>No lines. {!planLocked&&'Use the button above to add one.'}</p>}
                  {lines.map(l=>(
                    <LineEditor key={l.id} line={l} months={months} cc={cc} planLocked={planLocked} showActual={showActual} isNew={l.id===lastAddedId}
                      onPlanChange={(m,v)=>setPlanVal(unitMeta.id,l.id,m,v)}
                      onActualChange={(m,v)=>setActualVal(unitMeta.id,l.id,m,v)}
                      onRename={name=>renameLine(unitMeta.id,l.id,name)}
                      onRemove={()=>removeLine(unitMeta.id,l.id)}
                      onLineTypeChange={t=>changeLineType(unitMeta.id,l.id,t)}
                      onArrayFieldChange={(field,m,v)=>updateLineArrayField(unitMeta.id,l.id,field,m,v)}
                    />
                  ))}
                </div>
              )
            })}
          </>
        ):null}
      </div>
    )
  }

  function CashFlowTab(){
    const [cfMode,setCfMode]=useState<'statement'|'operational'>('statement')
    if(cfMode==='operational')return(
      <div>
        <div style={{display:'flex',gap:'0.5rem',marginBottom:'1.25rem'}}>
          <button style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.5rem 1.1rem',border:'none',background:C.white,color:C.slate,borderRadius:4,cursor:'pointer'}} onClick={()=>setCfMode('statement')}>Cash Flow Statement</button>
          <button style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.5rem 1.1rem',border:'none',background:C.navy,color:C.white,borderRadius:4,cursor:'pointer',fontWeight:700}} onClick={()=>setCfMode('operational')}>Operational Cashflow</button>
        </div>
        <ConasOperationalCashflowTab result={result} months={months} cc={cc}/>
      </div>
    )
    return(
      <div>
        <div style={{display:'flex',gap:'0.5rem',marginBottom:'1.25rem'}}>
          <button style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.5rem 1.1rem',border:'none',background:C.navy,color:C.white,borderRadius:4,cursor:'pointer',fontWeight:700}} onClick={()=>setCfMode('statement')}>Cash Flow Statement</button>
          <button style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.5rem 1.1rem',border:'none',background:C.white,color:C.slate,borderRadius:4,cursor:'pointer'}} onClick={()=>setCfMode('operational')}>Operational Cashflow</button>
        </div>
        <div style={kpiGrid}>
          <KPI label="Opening Cash" value={fmt(cf.open[0],cc)}/>
          <KPI label="Month 6 Cash" value={fmt(cf.close[5],cc)} color={cf.close[5]>=0?C.navy:C.red}/>
          <KPI label="End of Season" value={fmt(cf.close[11],cc)} color={cf.close[11]>=0?C.navy:C.red}/>
          <KPI label="Lowest Point" value={fmt(metrics.minCash,cc)} color={metrics.minCash>=0?C.navy:C.red} sub={`Month ${metrics.minCashMonth}`}/>
        </div>
        <PLTable
          title="Cash Flow Statement"
          rows={[
            {label:'Opening Cash',plan:cf.open},
            {label:'Net Profit After Tax',plan:con.npat},
            {label:'Irrigation Kit Outflows',plan:cf.irrigation,negate:true},
            {label:'Approved Spending (posted)',plan:cf.approvedSpend,negate:true},
            {label:'Operating Cash Flow',plan:cf.opCash,bold:true},
            {label:'Capital & Financing',plan:cf.finCash},
            {label:'Fixed Asset Purchases',plan:cf.invCash||Array(MONTHS).fill(0)},
            {label:'Net Change in Cash',plan:cf.net,bold:true},
            {label:'Closing Cash',plan:cf.close,bold:true,highlight:true},
          ]}
          months={months}
          footnote="Approved spending requests post to this statement automatically on approval."
        />
        {result.debtSchedule && result.debtSchedule.totalPrincipal.some((v:number)=>v>0) && (
          <PLTable
            title="Loan Repayment Schedule"
            rows={[
              {label:'Interest',plan:result.debtSchedule.totalInterest},
              {label:'Principal',plan:result.debtSchedule.totalPrincipal},
              {label:'Total Debt Service',plan:result.debtSchedule.totalRepayment,bold:true},
              {label:'Closing Loan Balance',plan:result.debtSchedule.totalOutstanding,bold:true,highlight:true},
            ]}
            months={months}
          />
        )}
        <div style={card}>
          <div style={secH}>Cash Position  -  Month by Month</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={months.map((m,i)=>({month:m,Cash:Math.round(cf.close[i])}))} margin={{top:4,right:16,left:8,bottom:4}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="month" tick={{fontSize:11}}/>
              <YAxis tick={{fontSize:11}} tickFormatter={v=>fmt(v,'').trim()} width={72}/>
              <Tooltip formatter={(v:number)=>fmtFull(v,cc)}/>
              <ReferenceLine y={0} stroke={C.red} strokeWidth={2}/>
              <Bar dataKey="Cash" fill={C.cyan} radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  function BalanceSheetTab(){
    return(
      <div>
        <div style={kpiGrid}>
          <KPI label="Total Assets (End of Season)" value={fmt(bs.totalAssets[11],cc)}/>
          <KPI label="Total Equity" value={fmt(bs.totalEquity[11],cc)} color={bs.totalEquity[11]>=0?C.green:C.red}/>
          <KPI label="Total Liabilities" value={fmt(bs.totalLiabilities[11],cc)} color={C.amber}/>
          <KPI label="Retained Earnings" value={fmt(bs.retainedEarnings[11],cc)} color={bs.retainedEarnings[11]>=0?C.navy:C.red}/>
        </div>
        <PLTable
          title="Balance Sheet  -  Month by Month"
          rows={[
            {label:'ASSETS',plan:Array(MONTHS).fill(0),bold:true},
            {label:'Cash & Bank',plan:bs.cash,indent:true},
            {label:'Irrigation Kits (at cost)',plan:bs.irrigationKits,indent:true},
            {label:'Fixed Assets',plan:bs.fixedAssets,indent:true},
            {label:'TOTAL ASSETS',plan:bs.totalAssets,bold:true,highlight:true},
            {label:'EQUITY',plan:Array(MONTHS).fill(0),bold:true},
            {label:'Share Capital',plan:bs.shareCapital,indent:true},
            {label:'Non-Repayable Grant',plan:bs.grantEquity,indent:true},
            {label:'Retained Earnings',plan:bs.retainedEarnings,indent:true},
            {label:'TOTAL EQUITY',plan:bs.totalEquity,bold:true},
            {label:'LIABILITIES',plan:Array(MONTHS).fill(0),bold:true},
            {label:'Recoverable Grant',plan:bs.grantLiability,indent:true},
            {label:'Bank Loan',plan:bs.loanLiability,indent:true},
            {label:'TOTAL LIABILITIES',plan:bs.totalLiabilities,bold:true},
            {label:'TOTAL EQUITY & LIABILITIES',plan:bs.totalEquityAndLiabilities,bold:true,highlight:true},
          ]}
          months={months}
          footnote="Balance sheet balances when capital raised equals assets deployed. Enter shareholder contribution, grants, and loans in Settings."
        />
      </div>
    )
  }

  function ScenariosTab(){
    const results=inputs.scenarios.map(sc=>({sc,m:runCONASModel({...inputs,global:{...inputs.global,activeScenarioId:sc.id}}).metrics}))
    return(
      <div>
        <div style={card}>
          <div style={secH}>Scenario Comparison</div>
          <div style={{overflowX:'auto'}}>
            <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.78rem',fontFamily:'monospace'}}>
              <thead><tr style={{background:'#F4F8FC'}}>
                {['Scenario','FGEs','Rev ×','Cost ×','Revenue','EBITDA','Net Margin','Min Cash',''].map((h,i)=>(
                  <th key={i} style={{textAlign:i===0?'left':'right',padding:'0.35rem 0.6rem',borderBottom:`2px solid ${C.border}`,color:C.slate,fontWeight:600}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {results.map(({sc,m})=>{
                  const active=sc.id===inputs.global.activeScenarioId
                  return(
                    <tr key={sc.id} style={{background:active?'#E8F6F8':'transparent'}}>
                      <td style={{padding:'0.3rem 0.6rem',borderBottom:`1px solid #EEF2F6`,fontWeight:active?700:400}}>{sc.label}</td>
                      <td style={{textAlign:'right',padding:'0.3rem 0.6rem',borderBottom:`1px solid #EEF2F6`}}>{m.fgeCount}</td>
                      <td style={{textAlign:'right',padding:'0.3rem 0.6rem',borderBottom:`1px solid #EEF2F6`}}>{sc.revMult.toFixed(2)}×</td>
                      <td style={{textAlign:'right',padding:'0.3rem 0.6rem',borderBottom:`1px solid #EEF2F6`}}>{sc.costMult.toFixed(2)}×</td>
                      <td style={{textAlign:'right',padding:'0.3rem 0.6rem',borderBottom:`1px solid #EEF2F6`}}>{fmt(m.totalRevenue,cc)}</td>
                      <td style={{textAlign:'right',padding:'0.3rem 0.6rem',borderBottom:`1px solid #EEF2F6`,color:m.totalEBITDA<0?C.red:C.green,fontWeight:600}}>{fmt(m.totalEBITDA,cc)}</td>
                      <td style={{textAlign:'right',padding:'0.3rem 0.6rem',borderBottom:`1px solid #EEF2F6`,color:m.netMargin<0?C.red:C.navy}}>{pct(m.netMargin)}</td>
                      <td style={{textAlign:'right',padding:'0.3rem 0.6rem',borderBottom:`1px solid #EEF2F6`,color:m.minCash<0?C.red:C.navy}}>{fmt(m.minCash,cc)}</td>
                      <td style={{padding:'0.3rem 0.5rem',borderBottom:`1px solid #EEF2F6`}}>
                        <button style={{...addBtn(true),opacity:active?0.5:1}} onClick={()=>setG('activeScenarioId',sc.id)} disabled={active}>{active?'✓ Active':'Set active'}</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  function SettingsTab(){
    const cap=inputs.capitalStructure
    return(
      <div>
        <div style={card}>
          <div style={secH}>Global Settings</div>
          <div style={fGrid}>
            {[
              {f:'businessName',l:'Business Name',t:'text'},
              {f:'currency',l:'Currency Code',t:'text'},
              {f:'modelStartDate',l:'Season Start Date',t:'date'},
              {f:'openingCashBalance',l:`Opening Cash Balance (${cc})`,t:'number'},
              {f:'transferPriceMargin',l:'Internal Transfer Margin %',t:'pct'},
              {f:'sharedCostFixedPct',l:'Shared Cost Headcount Split %',t:'pct'},
              {f:'corporateTaxRate',l:'Corporate Tax Rate %',t:'pct'},
            ].map(({f,l,t})=>(
              <div key={f}>
                <label style={lbl}>{l}</label>
                {t==='pct'
                  ?<input type="number" step="0.5" style={inp} value={(((inputs.global as unknown) as Record<string,number>)[f]*100).toFixed(1)} onChange={e=>setG(f,Number(e.target.value)/100)}/>
                  :<input type={t==='number'?'number':'text'} style={inp} value={(inputs.global as unknown as Record<string,string|number>)[f] as string} onChange={e=>setG(f,t==='number'?Number(e.target.value):e.target.value)}/>
                }
              </div>
            ))}
          </div>
        </div>
        <div style={card}>
          <div style={secH}>Capital Structure</div>
          <div style={fGrid}>
            {[
              {f:'shareholderContribution',l:`Shareholder Contribution (${cc})`},
              {f:'grantNonRepayable',l:`Non-Repayable Grant (${cc})`},
              {f:'grantRecoverable',l:`Recoverable Grant (${cc})`},
              {f:'bankLoan',l:`Bank Loan (${cc})`},
              {f:'fixedAssets',l:`Fixed Assets at Cost (${cc})`},
            ].map(({f,l})=>(
              <div key={f}>
                <label style={lbl}>{l}</label>
                <input type="number" style={inp} value={(cap as unknown as Record<string,number>)[f]} onChange={e=>upd(p=>({...p,capitalStructure:{...p.capitalStructure,[f]:Number(e.target.value)}}))}/>
              </div>
            ))}
          </div>
        </div>
        <div style={card}>
          <div style={secH}>Additional Debt Obligations</div>
          <p style={{fontSize:'0.8rem',color:C.slate,marginBottom:'0.85rem'}}>Use this if the business has more than one loan -- bank loans, SACCO loans, or other non-bank facilities. Each is tracked separately in DSCR.</p>
          {(activeInputs.debts||[]).map((d,i)=>(
            <div key={d.id||i} style={{padding:'0.6rem',border:`1px solid ${C.border}`,borderRadius:5,marginBottom:'0.5rem'}}>
              <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 1fr auto',gap:'0.5rem',alignItems:'end',marginBottom:'0.5rem'}}>
                <div><div style={hint}>Name</div><input style={inp} value={d.name||''} onChange={e=>upd(p=>{const ds=[...(p.debts||[])];ds[i]={...ds[i],name:e.target.value};return{...p,debts:ds}})}/></div>
                <div><div style={hint}>Principal ({cc})</div><input type="number" style={inp} value={d.principal||0} onChange={e=>upd(p=>{const ds=[...(p.debts||[])];ds[i]={...ds[i],principal:Number(e.target.value)};return{...p,debts:ds}})}/></div>
                <div><div style={hint}>Annual Rate %</div><input type="number" step="0.5" style={inp} value={((d.annualRate||0)*100).toFixed(1)} onChange={e=>upd(p=>{const ds=[...(p.debts||[])];ds[i]={...ds[i],annualRate:Number(e.target.value)/100};return{...p,debts:ds}})}/></div>
                <button style={{background:'transparent',border:'none',color:C.red,cursor:'pointer',fontSize:'1.1rem'}} onClick={()=>upd(p=>({...p,debts:(p.debts||[]).filter((_,j)=>j!==i)}))}>×</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1.3fr',gap:'0.5rem'}}>
                <div><div style={hint}>Tenor (months)</div><input type="number" style={inp} value={d.tenorMonths||12} onChange={e=>upd(p=>{const ds=[...(p.debts||[])];ds[i]={...ds[i],tenorMonths:Number(e.target.value)};return{...p,debts:ds}})}/></div>
                <div><div style={hint}>Grace (months)</div><input type="number" style={inp} value={d.gracePeriodMonths||0} onChange={e=>upd(p=>{const ds=[...(p.debts||[])];ds[i]={...ds[i],gracePeriodMonths:Number(e.target.value)};return{...p,debts:ds}})}/></div>
                <div><div style={hint}>Drawdown Month (1 = season's first month)</div><input type="number" min="1" style={inp} value={d.drawdownMonth||1} onChange={e=>upd(p=>{const ds=[...(p.debts||[])];ds[i]={...ds[i],drawdownMonth:Number(e.target.value)};return{...p,debts:ds}})}/></div>
                <div><div style={hint}>Repayment Type</div>
                  <select style={inp} value={d.repaymentType||'amortising'} onChange={e=>upd(p=>{const ds=[...(p.debts||[])];ds[i]={...ds[i],repaymentType:e.target.value};return{...p,debts:ds}})}>
                    <option value="amortising">Amortising (equal principal each month)</option>
                    <option value="bullet">Bullet (full principal at end of tenor)</option>
                    <option value="quarterly">Quarterly (equal principal every 3 months)</option>
                    <option value="seasonal">Seasonal (specific months only)</option>
                  </select>
                </div>
              </div>
              {d.repaymentType==='seasonal'&&(
                <div style={{marginTop:'0.5rem'}}>
                  <div style={hint}>Repayment months (comma-separated, 1 = season's first month, e.g. "6, 12" for a twice-yearly harvest schedule)</div>
                  <input style={inp} value={(d.seasonalMonths||[]).join(', ')}
                    onChange={e=>upd(p=>{
                      const ds=[...(p.debts||[])]
                      const months=e.target.value.split(',').map((x:string)=>parseInt(x.trim(),10)).filter((n:number)=>!isNaN(n)&&n>0)
                      ds[i]={...ds[i],seasonalMonths:months}
                      return{...p,debts:ds}
                    })}/>
                </div>
              )}
            </div>
          ))}
          <button style={addBtn(true)} onClick={()=>upd(p=>({...p,debts:[...(p.debts||[]),{id:`debt_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,name:'',principal:0,annualRate:0.18,tenorMonths:12,gracePeriodMonths:0,drawdownMonth:1,repaymentType:'amortising'}]}))}>+ Add Debt Obligation</button>
        </div>
        <div style={card}>
          <div style={secH}>Business Units</div>
          {inputs.units.map((bu,i)=>(
            <div key={bu.id} style={{display:'flex',gap:'0.6rem',alignItems:'center',padding:'0.5rem 0.7rem',border:`1px solid ${C.border}`,borderRadius:5,marginBottom:'0.42rem',borderLeft:`4px solid ${bu.color}`}}>
              <input type="checkbox" checked={bu.active} onChange={e=>upd(p=>{const u=[...p.units];u[i]={...u[i],active:e.target.checked};return{...p,units:u}})}/>
              <input style={{...inp,flex:2,minWidth:160}} value={bu.name} onChange={e=>upd(p=>{const u=[...p.units];u[i]={...u[i],name:e.target.value};return{...p,units:u}})}/>
              <input style={{...inp,width:65}} value={bu.short} onChange={e=>upd(p=>{const u=[...p.units];u[i]={...u[i],short:e.target.value};return{...p,units:u}})}/>
              <div><div style={hint}>Staff</div><input type="number" style={{...inp,width:60}} value={bu.headcount} onChange={e=>upd(p=>{const u=[...p.units];u[i]={...u[i],headcount:Number(e.target.value)};return{...p,units:u}})}/></div>
              <input type="color" value={bu.color} onChange={e=>upd(p=>{const u=[...p.units];u[i]={...u[i],color:e.target.value};return{...p,units:u}})} style={{width:34,height:30,border:'none',cursor:'pointer',borderRadius:3}}/>
              {bu.parentId&&<span style={{fontSize:'0.68rem',color:C.slate,fontFamily:'monospace'}}>sub-unit</span>}
            </div>
          ))}
        </div>
      </div>
    )
  }


  // ── RENDER ───────────────────────────────────────────────
  if (loadingData) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'#F8F4EE',fontFamily:"'Segoe UI',system-ui,sans-serif",color:'#1B2A4A'}}>
      <div style={{textAlign:'center'}}>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',marginBottom:'0.5rem'}}>CONAS Agricultural Hub</div>
        <div style={{fontFamily:'monospace',fontSize:'0.8rem',color:'#4A5A6A'}}>Loading your data...</div>
      </div>
    </div>
  )

  const tabs:[string,string][]=[
    ['overview','Overview'],
    ['approvals',`Approvals${pending.length>0?` (${pending.length})`:''}`],
    ['intelligence','Clearview Intelligence'],
    ['planning','Planning'],
    ['unitpl','P&L'],
    ['cashflow','Cash Flow'],
    ['balancesheet','Balance Sheet'],
    ['workingcapital','Working Capital'],
    ['actuals','Actuals'],
    ['timerecords','Time Records'],
    ['settings','Settings'],
  ]

  return(
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.cream,color:C.navy,minHeight:'100vh'}}>
      <header style={{background:C.navy,borderBottom:`3px solid ${C.cyan}`}}>
        <div style={{maxWidth:1440,margin:'0 auto',padding:'1.25rem 1.5rem',display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'1rem'}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'0.28rem'}}>
              <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.15em',color:C.cyan}}>CANVAS COACH  -  CLEARVIEW PLANNER</div>
              <a href="/coach" style={{fontFamily:'monospace',fontSize:'0.62rem',color:'rgba(255,255,255,0.5)',textDecoration:'none',border:'1px solid rgba(255,255,255,0.2)',borderRadius:3,padding:'0.12rem 0.45rem'}}>← Coach Dashboard</a>
            </div>
            <h1 style={{fontFamily:'Georgia,serif',fontSize:'1.5rem',fontWeight:700,color:C.white,margin:'0.1rem 0 0.15rem'}}>{activeInputs.global.businessName}</h1>
            <div style={{fontSize:'0.76rem',color:'rgba(255,255,255,0.6)'}}>
              {metrics.scenarioLabel} · {metrics.fgeCount} FGEs · {activeInputs.global.currency} · {new Date(inputs.global.modelStartDate).toLocaleString('en-GB',{month:'long',year:'numeric'})}
              {planLocked&&<span style={{marginLeft:8,color:C.teal}}>· 🔒 Locked</span>}
              {pending.length>0&&<span style={{marginLeft:8,color:C.amber}}>· ⏳ {pending.length} pending</span>}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginTop:'0.4rem'}}>
              <span style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.cyan,border:`1px solid rgba(0,180,216,0.4)`,borderRadius:4,padding:'0.18rem 0.5rem'}}>
                {roleLabel(P.role)}  -  {P.fullName}
              </span>
              <button onClick={P.onSignOut} style={{fontFamily:'monospace',fontSize:'0.65rem',background:'transparent',border:`1px solid rgba(255,255,255,0.25)`,borderRadius:4,color:'rgba(255,255,255,0.6)',cursor:'pointer',padding:'0.18rem 0.5rem'}}>
                Sign out
              </button>
            </div>
          </div>
          <div style={{background:'rgba(0,180,216,0.12)',border:`1px solid rgba(0,180,216,0.3)`,borderRadius:8,padding:'0.72rem 1rem',minWidth:210}}>
            <div style={{fontFamily:'monospace',fontSize:'0.6rem',color:C.cyan,letterSpacing:'0.1em',marginBottom:'0.28rem'}}>ACTIVE SCENARIO</div>
            <select style={{width:'100%',background:'transparent',border:'none',color:C.white,fontSize:'0.85rem',fontWeight:700,cursor:'pointer',outline:'none'}}
              value={activeInputs.global.activeScenarioId} onChange={e=>setG('activeScenarioId',e.target.value)}>
              {inputs.scenarios.map(s=><option key={s.id} value={s.id} style={{background:C.navy}}>{s.label}</option>)}
            </select>
            <div style={{marginTop:'0.35rem',fontSize:'0.67rem',color:'rgba(255,255,255,0.5)'}}>Revenue: {fmt(metrics.totalRevenue,cc)} · EBITDA: {fmt(metrics.totalEBITDA,cc)}</div>
          </div>
        </div>
      </header>
      <nav style={{background:'#142038',borderBottom:`1px solid rgba(0,180,216,0.15)`,overflowX:'auto'}}>
        <div style={{maxWidth:1440,margin:'0 auto',padding:'0 1.5rem',display:'flex',gap:0,whiteSpace:'nowrap'}}>
          {tabs.map(([id,label])=><button key={id} style={navBtn(view===id)} onClick={()=>setView(id)}>{label}</button>)}
        </div>
      </nav>
      <main style={{maxWidth:1440,margin:'0 auto',padding:'1.5rem'}}>
        {view==='overview'        &&<OverviewTab/>}
        {view==='approvals'       &&<ConasApprovalsAndSpendTab
          approvalsEl={<ApprovalsTab spendingRequests={inputs.spendingRequests} pending={pending} spendForm={spendForm} setSpendForm={setSpendForm} allActiveUnits={allActiveUnits} months={months} cc={cc} canSubmitRequest={P.canSubmitRequest} canApprove={P.canApprove} submitSpend={submitSpend} resolveRequest={resolveRequest}/>}
          spendEl={<SpendRequestsTab role={P.role} userId={P.userId||''} userName={P.fullName||''} businessUnit={P.businessUnit||''} canSeeAllUnits={P.canSeeAllUnits}/>}
        />}
        {view==='intelligence'    &&<ConasIntelligenceTab result={result} inputs={inputs} coachAssessments={coachAssessments} onSaveAssessments={setCoachAssessments} months={months} cc={cc} P={P}/>}
        {view==='planning'        &&<PlanningTab/>}
        {view==='unitpl'          &&<UnitPLTab/>}
        {view==='cashflow'        &&<CashFlowTab/>}
        {view==='balancesheet'    &&<BalanceSheetTab/>}
        {view==='workingcapital'  &&<ConasWorkingCapitalTab result={result} months={months} cc={cc} inputs={inputs} upd={upd} canEdit={P.canEditPlan}/>}
        {view==='actuals'         &&<ActualsTab role={P.role} userId={P.userId||''} userName={P.fullName||''} businessUnit={P.businessUnit||''} canSeeAllUnits={P.canSeeAllUnits} planUnits={inputs.units}/>}
        {view==='timerecords'     &&<TimeRecordsTab role={P.role} userId={P.userId||''} userName={P.fullName||''} businessUnit={P.businessUnit||''} canSeeAllUnits={P.canSeeAllUnits}/>}
        {view==='settings'        &&<ConasSettingsAndAdminTab
          settingsEl={<SettingsTab/>}
          scenariosEl={<ScenariosTab/>}
          teamEl={<TeamTab role={P.role} userId={P.userId||''} userName={P.fullName||''} businessUnit={P.businessUnit||''} canSeeAllUnits={P.canSeeAllUnits}/>}
        />}
      </main>
      <footer style={{textAlign:'center',padding:'1.5rem',fontFamily:'monospace',fontSize:'0.67rem',color:C.slate,borderTop:`1px solid ${C.border}`,marginTop:'2rem'}}>
        Canvas Coach · Clearview Planner · {inputs.global.businessName} · habibonifade.com
        <span style={{marginLeft:'1.5rem'}}>
          <button style={{fontFamily:'monospace',fontSize:'0.67rem',background:'transparent',border:`1px solid ${C.border}`,borderRadius:3,color:C.slate,cursor:'pointer',padding:'0.15rem 0.5rem'}} onClick={()=>window.print()}>Export / Print</button>
        </span>
      </footer>
    </div>
  )
}

// ── CLEARVIEW BUSINESS INTELLIGENCE (CONAS) ──────────────────
// Consolidated page: real deterministic Credit Risk / Going Concern /
// Investment Readiness scoring (from shared scoring engine), Coach
// Assessment inputs, Engagement Close, plus AI narrative, health
// check, and cash flow early warning.

function ConasIntelligenceTab({result, inputs, coachAssessments, onSaveAssessments, months, cc, P}:{result:ReturnType<typeof runCONASModel>;inputs:CONASInputs;coachAssessments:Record<string,unknown>|null;onSaveAssessments:(a:Record<string,unknown>)=>void;months:string[];cc:string;P:any}) {
  const clientId = CONAS_CLIENT_ID
  const [assess, setAssess] = React.useState<any>(coachAssessments || defaultCoachAssessment())
  const [activeSection, setActiveSection] = React.useState('summary')
  const [healthReports,setHealthReports]=useState<any[]>([])
  const [investmentAssessments,setInvestmentAssessments]=useState<any[]>([])
  const [narrative,setNarrative]=useState<any>(null)
  const [events,setEvents]=useState<any[]>([])
  const [loadingAI,setLoadingAI]=useState(true)
  const [generatingNarrative,setGeneratingNarrative]=useState(false)
  const [generatingHealth,setGeneratingHealth]=useState(false)

  useEffect(()=>{
    Promise.all([
      supabase.from('ai_health_checks').select('*').eq('client_id',clientId).order('period',{ascending:false}).limit(1),
      supabase.from('investment_readiness').select('*').eq('client_id',clientId).order('generated_at',{ascending:false}).limit(1),
      supabase.from('coach_briefings').select('*').eq('client_id',clientId).order('generated_at',{ascending:false}).limit(1),
      supabase.from('management_events').select('*').eq('client_id',clientId).order('date',{ascending:false}),
    ]).then(([h,i,n,e])=>{
      setHealthReports(h.data||[])
      setInvestmentAssessments(i.data||[])
      setNarrative(n.data?.[0]||null)
      setEvents(e.data||[])
      setLoadingAI(false)
    })
  },[clientId])

  function updateAssess(field: string, value: unknown) {
    const next = Object.assign({}, assess)
    next[field] = value
    setAssess(next)
    if (onSaveAssessments) onSaveAssessments(next)
  }

  const con = result.con
  const cf = result.cf
  const bs = result.bs
  const m = months.length

  // Multiple debt obligations: use the explicit `debts` list if provided,
  // otherwise fall back to the single bankLoan field for backward compatibility.
  // Reads from activeInputs (not inputs) -- in controlled mode inputs is only
  // set once at mount and never updated when inputsProp changes, so reading
  // inputs here would feed the DSCR calculation from stale debt data.
  const conasDebtObligations = (activeInputs.debts && activeInputs.debts.length > 0)
    ? activeInputs.debts
    : (activeInputs.capitalStructure?.bankLoan > 0 ? [{
        drawdownMonth: 1,
        annualRate: activeInputs.capitalStructure.annualInterestRate || 0.18,
        tenorMonths: (activeInputs.capitalStructure.loanTenorYears || 2) * 12,
        gracePeriodMonths: 0,
        principal: activeInputs.capitalStructure.bankLoan,
        repaymentType: 'amortising',
      }] : [])
  const conasTradeCreditLines = (inputs.tradeCreditLines || []).map(l => ({
    id: l.id, name: l.name, type: l.type,
    monthly_new: l.monthlyNew || Array(months.length).fill(0),
    monthly_settled: l.monthlySettled || Array(months.length).fill(0),
  }))

  const scores = computeScores({
    rev: con.rev, ebitda: con.ebitda, cogs: con.cogs, cashClose: cf.close,
    totalEquity: bs.totalEquity?.[bs.totalEquity.length-1]||0,
    totalLiabilities: bs.totalLiabilities?.[bs.totalLiabilities.length-1]||0,
    months: m, debtObligations: conasDebtObligations, tradeCreditLines: conasTradeCreditLines, assess,
  })
  const { score, classification, classColor, hasDebt, dscrMin, dscrVals, cashGaps, revTrend,
    gcScore, gcRating, gcColor, irScore, irTier, irColor, irFinancial, irDebt,
    tradeCredit, annualRevenue, annualEbitda, minCash, ebitdaMargin, deToEq } = scores

  const debtSched = buildDebtSchedule(conasDebtObligations, m)
  const cashWarnings = cf.close.map((v:number,i:number)=>({month:months[i]||`Month ${i+1}`,balance:v})).filter((w:any)=>w.balance<0)

  // Whole-business breakeven (same logic as generic engine, computed here since CONAS doesn't have it natively)
  const totalFixed = result.metrics.totalShared + result.allocUnits.reduce((s:number,u:any)=>{
    const pl = result.unitPL[u.id]
    return s + (pl ? pl.annStaff + pl.annOpex : 0)
  },0)
  const variableCostPct = annualRevenue>0 ? (annualRevenue-result.metrics.totalGP)/annualRevenue : 0
  const businessBreakeven = variableCostPct<1 ? totalFixed/(1-variableCostPct) : 0
  const totalHeadcount = result.allocUnits.reduce((s:number,u:any)=>s+(u.headcount||0),0)
  const totalStaffCost = result.allocUnits.reduce((s:number,u:any)=>s+(result.unitPL[u.id]?.annStaff||0),0)
  const staffCostPct = annualRevenue>0 ? totalStaffCost/annualRevenue : 0

  async function generateHealthCheck() {
    setGeneratingHealth(true)
    const targetPeriod = new Date().toISOString().slice(0,7)+'-01'
    try {
      const prompt = `You are a financial health advisor for an African MSME. Produce a monthly business health check report for CONAS Agricultural Hub.

Financial summary:
- Total revenue: ${cc} ${annualRevenue.toLocaleString()}
- EBITDA: ${cc} ${annualEbitda.toLocaleString()} (${(ebitdaMargin*100).toFixed(1)}% margin)
- Credit Risk Score: ${score}/100 (${classification})
- Going Concern: ${gcScore}/20 (${gcRating})
- Investment Readiness: ${irScore}/30 (${irTier})
- Minimum cash position: ${cc} ${minCash.toLocaleString()}
- Debt service coverage (min DSCR): ${dscrLabel({hasDebt,dscrMin})}
- Break-even revenue: ${cc} ${businessBreakeven.toLocaleString()}
- Staff cost as % of revenue: ${(staffCostPct*100).toFixed(1)}%

Write a clear, plain-English health check report for the CEO. Include: 1) Overall status (Green/Amber/Red with reason) 2) Two or three things going well 3) Two or three areas of concern 4) Three specific actions this month. Maximum 300 words.`
      const response = await fetch('/api/ai-generate',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prompt,max_tokens:1000})
      })
      const data = await response.json()
      const text = data.text||'Report unavailable'
      const {data:saved} = await supabase.from('ai_health_checks').upsert({
        client_id:clientId, period:targetPeriod, report_text:text,
        triggered_by:'manual', generated_at:new Date().toISOString(), visible_to_ceo:true,
      },{onConflict:'client_id,period'}).select().single()
      if (saved) setHealthReports([saved])
    } catch(e) { alert('Health check generation failed') }
    setGeneratingHealth(false)
  }

  async function generateNarrative() {
    setGeneratingNarrative(true)
    try {
      const prompt = `You are writing a monthly business narrative for the CEO of CONAS Agricultural Hub, an African MSME crop aggregator. Write a complete story of where the business stands right now, in plain conversational English -- not a list, a narrative read top to bottom like a letter.

Data:
- Revenue: ${cc} ${annualRevenue.toLocaleString()}, EBITDA margin: ${(ebitdaMargin*100).toFixed(1)}%
- Credit Risk: ${score}/100 (${classification}); Going Concern: ${gcScore}/20 (${gcRating}); Investment Readiness: ${irScore}/30 (${irTier})
- DSCR: ${dscrLabel({hasDebt,dscrMin})}
- Break-even revenue: ${cc} ${businessBreakeven.toLocaleString()}
- Cash shortfall months: ${cashWarnings.length>0?cashWarnings.map((w:any)=>w.month).join(', '):'none'}
- Staff cost ratio: ${(staffCostPct*100).toFixed(1)}%

Write 4-5 short paragraphs telling the story of this business right now. Speak directly to the owner. No headers, no bullets, no jargon. Maximum 350 words.`
      const response = await fetch('/api/ai-generate',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prompt,max_tokens:1000})
      })
      const data = await response.json()
      const text = data.text||'Narrative unavailable'
      const {data:saved} = await supabase.from('coach_briefings').insert([{
        client_id:clientId, briefing_text:text, visit_context:'Monthly Narrative',
        period_covered:new Date().toLocaleString('en-GB',{month:'long',year:'numeric'}),
        generated_at:new Date().toISOString(),
      }]).select().single()
      if (saved) setNarrative(saved)
    } catch(e) { alert('Narrative generation failed') }
    setGeneratingNarrative(false)
  }

  function Badge({label, color}:{label:string;color:string}) {
    return <span style={{fontFamily:'monospace',fontSize:'0.78rem',fontWeight:700,padding:'0.25rem 0.7rem',borderRadius:20,background:color,color:C.white}}>{label}</span>
  }

  const latestHealth = healthReports[0]
  const latestInvestmentNarrative = investmentAssessments[0]

  const tabList:[string,string][] = [
    ['summary','Summary'],['narrative',"This Month's Story"],['credit','Credit Risk'],
    ['going_concern','Going Concern'],['investment','Investment Readiness'],
    ['coach','Coach Assessment'],['events','Marketing Events'],['close','Engagement Close'],
  ]

  return (
    <div>
      <div style={{...card,background:C.navy,marginBottom:'1.25rem'}}>
        <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.12em',color:C.cyan,marginBottom:'0.3rem'}}>CLEARVIEW BUSINESS INTELLIGENCE</div>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:C.white,marginBottom:'0.5rem'}}>CONAS Agricultural Hub</div>
        <div style={{display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
          <div><div style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.5)'}}>CREDIT RISK</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.4rem',fontWeight:700,color:classColor}}>{score}/100</div></div>
          <div><div style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.5)'}}>GOING CONCERN</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.4rem',fontWeight:700,color:gcColor}}>{gcScore}/20</div></div>
          <div><div style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.5)'}}>INVESTMENT READY</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.4rem',fontWeight:700,color:irColor}}>{irScore}/30</div></div>
          <div><div style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.5)'}}>CASH WARNINGS</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.4rem',fontWeight:700,color:cashWarnings.length>0?C.red:C.green}}>{cashWarnings.length}</div></div>
        </div>
      </div>

      <div style={{display:'flex',gap:'0.4rem',flexWrap:'wrap',marginBottom:'1.5rem',borderBottom:`2px solid ${C.border}`,paddingBottom:'0.75rem'}}>
        {tabList.map(t=>(
          <button key={t[0]} onClick={()=>setActiveSection(t[0])} style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.5rem 1rem',border:`1px solid ${activeSection===t[0]?C.cyan:C.border}`,borderRadius:5,background:activeSection===t[0]?C.cyan:C.white,color:activeSection===t[0]?C.navy:C.slate,cursor:'pointer',fontWeight:activeSection===t[0]?700:400}}>{t[1]}</button>
        ))}
      </div>

      {activeSection==='summary'&&(
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:'1rem'}}><div style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.slate,textTransform:'uppercase',marginBottom:'0.35rem'}}>Credit Risk</div><Badge label={classification} color={classColor}/><div style={{fontSize:'0.75rem',color:C.slate,marginTop:'0.3rem'}}>Score {score}/100</div></div>
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:'1rem'}}><div style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.slate,textTransform:'uppercase',marginBottom:'0.35rem'}}>Going Concern</div><Badge label={gcRating} color={gcColor}/><div style={{fontSize:'0.75rem',color:C.slate,marginTop:'0.3rem'}}>{gcScore}/20</div></div>
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:'1rem'}}><div style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.slate,textTransform:'uppercase',marginBottom:'0.35rem'}}>Investment Readiness</div><Badge label={irTier} color={irColor}/><div style={{fontSize:'0.75rem',color:C.slate,marginTop:'0.3rem'}}>{irScore}/30</div></div>
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:'1rem'}}><div style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.slate,textTransform:'uppercase',marginBottom:'0.35rem'}}>Minimum DSCR</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:dscrColor({hasDebt,dscrMin},C)}}>{dscrLabel({hasDebt,dscrMin})}</div></div>
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:'1rem'}}><div style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.slate,textTransform:'uppercase',marginBottom:'0.35rem'}}>Cash-Negative Months</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:cashGaps===0?C.green:C.red}}>{cashGaps}</div><div style={{fontSize:'0.75rem',color:C.slate}}>of {m} months</div></div>
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:'1rem'}}><div style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.slate,textTransform:'uppercase',marginBottom:'0.35rem'}}>Revenue Trend</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:revTrend==='Growing'?C.green:revTrend==='Stable'?C.amber:C.red}}>{revTrend}</div></div>
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:'1rem'}}><div style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.slate,textTransform:'uppercase',marginBottom:'0.35rem'}}>Break-Even Revenue</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:C.amber}}>{fmt(businessBreakeven,cc)}</div></div>
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:'1rem'}}><div style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.slate,textTransform:'uppercase',marginBottom:'0.35rem'}}>Staff Cost %</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:staffCostPct<0.3?C.green:staffCostPct<0.5?C.amber:C.red}}>{pct(staffCostPct)}</div></div>
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:'1rem'}}><div style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.slate,textTransform:'uppercase',marginBottom:'0.35rem'}}>Days to Collect (DSO)</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:C.navy}}>{tradeCredit.dso.toFixed(0)}d</div></div>
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:'1rem'}}><div style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.slate,textTransform:'uppercase',marginBottom:'0.35rem'}}>Days to Pay (DPO)</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:C.navy}}>{tradeCredit.dpo.toFixed(0)}d</div></div>
            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:'1rem'}}><div style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.slate,textTransform:'uppercase',marginBottom:'0.35rem'}}>Cash Conversion Gap</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:tradeCredit.cashConversionGap<=0?C.green:tradeCredit.cashConversionGap>30?C.red:C.amber}}>{tradeCredit.cashConversionGap.toFixed(0)}d</div></div>
          </div>
          <div style={{background:C.navy,borderRadius:8,padding:'1rem 1.25rem',marginBottom:'1.25rem'}}>
            <div style={{fontFamily:'monospace',fontSize:'0.65rem',letterSpacing:'0.12em',color:C.cyan,marginBottom:'0.75rem'}}>READING THE PICTURE</div>
            {[
              [!hasDebt?'info':dscrMin===null?'info':dscrMin>=1.5?'ok':dscrMin>=1.0?'info':'warn',
                `Debt service coverage: ${!hasDebt?'No debt obligations on this plan.':dscrMin===null?'Debt exists but no repayment has fallen due yet.':`Minimum DSCR ${dscrMin.toFixed(2)}x across periods with a repayment due. ${dscrMin>=1.5?'Strong.':dscrMin>=1.0?'Adequate but watch closely.':'Weak: not generating enough to service obligations in the tightest period.'}`}`],
              [cashGaps===0?'ok':'warn', `Cash position: ${cashGaps===0?'Positive throughout the season.':'Negative in '+cashGaps+' month(s).'}`],
              [revTrend==='Growing'?'ok':revTrend==='Stable'?'info':'warn', `Revenue trend: ${revTrend} from start to end of season.`],
              [irScore>=17?'ok':'info', `Investment readiness: ${irTier} (${irScore}/30).`],
              [(tradeCredit.dso>0||tradeCredit.dpo>0)?(tradeCredit.cashConversionGap<=0?'ok':tradeCredit.cashConversionGap>30?'warn':'info'):'info',
                (tradeCredit.dso>0||tradeCredit.dpo>0)
                  ? `Trade credit: collecting in ${tradeCredit.dso.toFixed(0)} days, paying suppliers in ${tradeCredit.dpo.toFixed(0)} days. ${tradeCredit.cashConversionGap<=0?'Effectively supplier-financed -- a healthy position.':'Cash is tied up for '+tradeCredit.cashConversionGap.toFixed(0)+' days waiting to collect before suppliers are paid.'}`
                  : 'Trade credit: no supplier or customer credit data entered yet.'],
            ].map((item,i)=>{
              const col = item[0]==='ok'?C.green:item[0]==='warn'?C.red:C.teal
              return(
                <div key={i} style={{display:'flex',gap:'0.6rem',marginBottom:'0.5rem',fontSize:'0.84rem',color:C.white,lineHeight:1.5}}>
                  <span style={{width:8,height:8,borderRadius:'50%',background:col,marginTop:'0.45rem',flexShrink:0,display:'inline-block'}}/>
                  <span>{item[1]}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeSection==='narrative'&&(
        <div>
          <div style={card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
              <div style={secH}>This Month's Story</div>
              <button style={{fontFamily:'monospace',fontSize:'0.72rem',fontWeight:600,padding:'0.35rem 0.8rem',border:'none',borderRadius:4,background:C.purple,color:C.white,cursor:'pointer'}} disabled={generatingNarrative} onClick={generateNarrative}>{generatingNarrative?'Writing...':'Generate Narrative'}</button>
            </div>
            {narrative ? (
              <div>
                <div style={{fontSize:'0.75rem',color:C.slate,marginBottom:'0.75rem'}}>{narrative.period_covered} · Generated {new Date(narrative.generated_at).toLocaleDateString('en-GB')}</div>
                <div style={{fontSize:'0.9rem',color:C.navy,lineHeight:1.85,whiteSpace:'pre-wrap'}}>{narrative.briefing_text}</div>
              </div>
            ) : <p style={{color:C.slate,fontSize:'0.85rem'}}>Generate a plain-English story of how the business is doing this month, written for the CEO.</p>}
          </div>
          <div style={card}>
            <div style={secH}>Cash Flow Early Warning</div>
            {cashWarnings.length===0 ? (
              <div style={{padding:'0.85rem',background:'#EBFAF0',borderRadius:6,color:C.green,fontSize:'0.85rem',fontWeight:600}}>No cash shortfall projected across the planning period.</div>
            ) : (
              <div>
                {cashWarnings.map((w:any,i:number)=>(
                  <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'0.5rem 0.75rem',background:'#FDF0EE',borderRadius:5,marginBottom:'0.4rem'}}>
                    <span style={{fontWeight:600,color:C.navy}}>{w.month}</span>
                    <span style={{fontFamily:'monospace',color:C.red,fontWeight:700}}>{fmt(w.balance,cc)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
              <div style={secH}>Business Health Check</div>
              <button style={{fontFamily:'monospace',fontSize:'0.72rem',fontWeight:600,padding:'0.35rem 0.8rem',border:'none',borderRadius:4,background:C.purple,color:C.white,cursor:'pointer'}} disabled={generatingHealth} onClick={generateHealthCheck}>{generatingHealth?'Generating...':'Generate This Month'}</button>
            </div>
            {latestHealth ? (
              <div>
                <div style={{fontSize:'0.75rem',color:C.slate,marginBottom:'0.75rem'}}>{new Date(latestHealth.period).toLocaleString('en-GB',{month:'long',year:'numeric'})}</div>
                <div style={{fontSize:'0.88rem',color:C.navy,lineHeight:1.8,whiteSpace:'pre-wrap'}}>{latestHealth.report_text}</div>
              </div>
            ) : <p style={{color:C.slate,fontSize:'0.85rem'}}>No health check generated yet this month.</p>}
          </div>
        </div>
      )}

      {activeSection==='credit'&&(
        <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'1.25rem',flexWrap:'wrap',gap:'0.75rem'}}>
            <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy}}>Credit Risk Dashboard</div>
            <div style={{display:'flex',alignItems:'center',gap:'1rem'}}>
              <div style={{fontFamily:'Georgia,serif',fontSize:'2.5rem',fontWeight:700,color:classColor,lineHeight:1}}>{score}</div>
              <div><div style={{fontSize:'0.75rem',color:C.slate}}>out of 100</div><Badge label={classification} color={classColor}/></div>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'1rem',marginBottom:'1.25rem'}}>
            <div style={{background:'#F0F4F8',borderRadius:6,padding:'0.85rem'}}><div style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.slate,marginBottom:'0.3rem'}}>MINIMUM DSCR</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.5rem',fontWeight:700,color:dscrColor({hasDebt,dscrMin},C)}}>{dscrLabel({hasDebt,dscrMin})}</div></div>
            <div style={{background:'#F0F4F8',borderRadius:6,padding:'0.85rem'}}><div style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.slate,marginBottom:'0.3rem'}}>REVENUE TREND</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.5rem',fontWeight:700,color:revTrend==='Growing'?C.green:revTrend==='Stable'?C.amber:C.red}}>{revTrend}</div></div>
            <div style={{background:'#F0F4F8',borderRadius:6,padding:'0.85rem'}}><div style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.slate,marginBottom:'0.3rem'}}>CASH-NEGATIVE MONTHS</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.5rem',fontWeight:700,color:cashGaps===0?C.green:C.red}}>{cashGaps}</div></div>
            <div style={{background:'#F0F4F8',borderRadius:6,padding:'0.85rem'}}><div style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.slate,marginBottom:'0.3rem'}}>SEASON EBITDA</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.5rem',fontWeight:700,color:annualEbitda>=0?C.green:C.red}}>{fmt(annualEbitda,cc)}</div></div>
          </div>
          <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.75rem',fontFamily:'monospace'}}>
            <thead><tr style={{background:C.navy,color:C.white}}><th style={{padding:'7px 10px',textAlign:'left',minWidth:120}}>Metric</th>{months.map((mo:string,i:number)=><th key={i} style={{padding:'7px 8px',textAlign:'right',whiteSpace:'nowrap'}}>{mo}</th>)}</tr></thead>
            <tbody>
              <tr style={{background:'#F8F4EE'}}><td style={{padding:'6px 10px',fontWeight:600}}>EBITDA</td>{con.ebitda.map((v:number,i:number)=><td key={i} style={{padding:'6px 8px',textAlign:'right',color:v>=0?C.green:C.red}}>{fmt(v,cc)}</td>)}</tr>
              <tr><td style={{padding:'6px 10px',fontWeight:600}}>Debt Service</td>{debtSched.totalRepayment.map((v:number,i:number)=><td key={i} style={{padding:'6px 8px',textAlign:'right'}}>{fmt(v,cc)}</td>)}</tr>
              <tr style={{background:'#F0F4F8'}}><td style={{padding:'6px 10px',fontWeight:700}}>DSCR</td>{dscrVals.map((v:number|null,i:number)=><td key={i} style={{padding:'6px 8px',textAlign:'right',fontWeight:700,color:v===null?C.slate:v>=1.5?C.green:v>=1.0?C.amber:C.red}}>{v===null?'–':`${v.toFixed(2)}x`}</td>)}</tr>
            </tbody>
          </table></div>
        </div>
      )}

      {activeSection==='going_concern'&&(
        <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem',flexWrap:'wrap',gap:'0.75rem'}}>
            <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy}}>Going Concern Assessment</div>
            <div style={{display:'flex',alignItems:'center',gap:'1rem'}}><div style={{fontFamily:'Georgia,serif',fontSize:'2.5rem',fontWeight:700,color:gcColor,lineHeight:1}}>{gcScore}</div><div><div style={{fontSize:'0.75rem',color:C.slate}}>out of 20</div><Badge label={gcRating} color={gcColor}/></div></div>
          </div>
          {[
            {name:'Debt Service Coverage',sc:!hasDebt?4:dscrMin===null?3:dscrMin>=1.5?4:dscrMin>=1.0?3:dscrMin>=0.5?2:1,max:4,ev:dscrLabel({hasDebt,dscrMin}),field:null},
            {name:'Liquidity Position',sc:minCash>=0?4:minCash>-10000000?1:0,max:4,ev:'Min cash: '+fmt(minCash,cc),field:null},
            {name:'Revenue Sustainability',sc:3,max:4,ev:'Season revenue trend: '+revTrend,field:null},
            {name:'Operational Profitability',sc:annualEbitda>0?3:2,max:4,ev:'Season EBITDA: '+fmt(annualEbitda,cc),field:null},
            {name:'Management & Governance',sc:Number(assess.managementCapability)||2,max:4,ev:'Coach assessment',field:'managementCapability'},
          ].map(ind=>(
            <div key={ind.name} style={{marginBottom:'1rem',paddingBottom:'1rem',borderBottom:`1px solid ${C.border}`}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.3rem'}}><span style={{fontWeight:600,fontSize:'0.88rem',color:C.navy}}>{ind.name}</span><span style={{fontFamily:'monospace',fontWeight:700,color:ind.sc>=3?C.green:ind.sc>=2?C.amber:C.red}}>{ind.sc}/{ind.max}</span></div>
              <div style={{background:'#E8ECF0',borderRadius:999,height:7}}><div style={{width:(ind.sc/ind.max*100)+'%',height:'100%',background:ind.sc>=3?C.green:ind.sc>=2?C.amber:C.red,borderRadius:999}}/></div>
              <div style={{fontSize:'0.78rem',color:C.slate,marginTop:'0.3rem'}}>{ind.ev}</div>
              {ind.field!=null&&<input type="range" min="0" max={ind.max} step="1" value={(assess[ind.field] as number)||2} onChange={e=>updateAssess(ind.field as string,Number(e.target.value))} style={{width:'100%',accentColor:C.cyan,marginTop:'0.4rem'}}/>}
            </div>
          ))}
        </div>
      )}

      {activeSection==='investment'&&(
        <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem',flexWrap:'wrap',gap:'0.75rem'}}>
            <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy}}>Investment Readiness Score</div>
            <div style={{display:'flex',alignItems:'center',gap:'1rem'}}>
              <div style={{fontFamily:'Georgia,serif',fontSize:'2.5rem',fontWeight:700,color:irColor,lineHeight:1}}>{irScore}</div>
              <div><div style={{fontSize:'0.75rem',color:C.slate}}>out of 30</div><Badge label={irTier} color={irColor}/></div>
            </div>
          </div>
          <ConasPitchDownload/>
          {[
            {name:'Financial Viability',sc:irFinancial,max:5,ev:'EBITDA margin '+(ebitdaMargin*100).toFixed(1)+'%',field:null},
            {name:'Debt Serviceability',sc:irDebt,max:5,ev:dscrLabel({hasDebt,dscrMin}),field:null},
            {name:'Commercial Model Clarity',sc:Number(assess.commercialModel)||2,max:5,ev:'Coach assessment',field:'commercialModel'},
            {name:'Management Capability',sc:Number(assess.managementCapability)||2,max:5,ev:'Coach assessment',field:'managementCapability'},
            {name:'Market Evidence',sc:Number(assess.marketEvidence)||2,max:5,ev:'Coach assessment',field:'marketEvidence'},
            {name:'Governance & Records',sc:Number(assess.governance)||2,max:5,ev:'Coach assessment',field:'governance'},
          ].map(dim=>(
            <div key={dim.name} style={{marginBottom:'1rem',paddingBottom:'1rem',borderBottom:`1px solid ${C.border}`}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.3rem'}}><span style={{fontWeight:600,fontSize:'0.88rem',color:C.navy}}>{dim.name}</span><span style={{fontFamily:'monospace',fontWeight:700,color:dim.sc>=4?C.green:dim.sc>=3?C.teal:dim.sc>=2?C.amber:C.red}}>{dim.sc}/{dim.max}</span></div>
              <div style={{background:'#E8ECF0',borderRadius:999,height:7}}><div style={{width:(dim.sc/dim.max*100)+'%',height:'100%',background:dim.sc>=4?C.green:dim.sc>=3?C.teal:dim.sc>=2?C.amber:C.red,borderRadius:999}}/></div>
              <div style={{fontSize:'0.78rem',color:C.slate,marginTop:'0.3rem'}}>{dim.ev}</div>
              {dim.field!=null&&<input type="range" min="0" max={dim.max} step="1" value={(assess[dim.field] as number)||2} onChange={e=>updateAssess(dim.field as string,Number(e.target.value))} style={{width:'100%',accentColor:C.cyan,marginTop:'0.4rem'}}/>}
            </div>
          ))}
          {latestInvestmentNarrative&&(
            <div style={{marginTop:'1.25rem',paddingTop:'1.25rem',borderTop:`1px solid ${C.border}`}}>
              <div style={{fontWeight:700,fontSize:'0.85rem',color:C.navy,marginBottom:'0.5rem'}}>AI Narrative Assessment</div>
              <div style={{fontSize:'0.85rem',color:C.navy,lineHeight:1.75,whiteSpace:'pre-wrap'}}>{latestInvestmentNarrative.assessment_text}</div>
            </div>
          )}
        </div>
      )}

      {activeSection==='coach'&&(
        <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}}>
          <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy,marginBottom:'0.5rem'}}>Coach Assessment Inputs</div>
          <p style={{fontSize:'0.85rem',color:C.slate,marginBottom:'1.5rem',lineHeight:1.6}}>These scores feed into Going Concern, Investment Readiness, and Engagement Close.</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:'1.25rem',marginBottom:'1.5rem'}}>
            {[{label:'Commercial Model Clarity',field:'commercialModel',max:5},{label:'Management Capability',field:'managementCapability',max:4},{label:'Market Evidence',field:'marketEvidence',max:5},{label:'Governance & Record-Keeping',field:'governance',max:5}].map(item=>(
              <div key={item.field}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.3rem'}}>
                  <label style={{fontWeight:600,fontSize:'0.85rem',color:C.navy}}>{item.label}</label>
                  <span style={{fontFamily:'monospace',fontWeight:700,color:C.cyan}}>{Number(assess[item.field])||2}/{item.max}</span>
                </div>
                <input type="range" min="0" max={item.max} step="1" value={(assess[item.field] as number)||2} onChange={e=>updateAssess(item.field,Number(e.target.value))} style={{width:'100%',accentColor:C.cyan,marginBottom:'0.2rem'}}/>
              </div>
            ))}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem'}}>
            {[{label:'Immediate Actions (30 days)',field:'immediateActions'},{label:'Near-Term Actions (60-90 days)',field:'nearTermActions'},{label:'Required Follow-Up',field:'followUp'},{label:'Coach Notes',field:'coachNotes'}].map(item=>(
              <div key={item.field}>
                <label style={{display:'block',fontWeight:600,fontSize:'0.82rem',marginBottom:'0.25rem',color:C.navy}}>{item.label}</label>
                <textarea value={(assess[item.field] as string)||''} onChange={e=>updateAssess(item.field,e.target.value)} style={{width:'100%',minHeight:75,padding:'0.42rem 0.6rem',border:`1px solid ${C.border}`,borderRadius:4,fontSize:'0.82rem',fontFamily:'inherit',background:'#F4F8FC',color:C.navy,boxSizing:'border-box',resize:'vertical'}} placeholder="One per line..."/>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection==='events'&&(
        <ConasPromotionEventsSection clientId={clientId} units={inputs.units} cc={cc} P={P} events={events} setEvents={setEvents}/>
      )}

      {activeSection==='close'&&(
        <ConasEngagementClose score={score} classification={classification} classColor={classColor} gcScore={gcScore} gcRating={gcRating} gcColor={gcColor} irScore={irScore} irTier={irTier} irColor={irColor} hasDebt={hasDebt} dscrMin={dscrMin} cashGaps={cashGaps} assess={assess} cc={cc}/>
      )}
    </div>
  )
}

// ── CONAS PROMOTION EVENTS & CUSTOMER ACQUISITION COST ────────
function ConasPromotionEventsSection({clientId,units,cc,P,events,setEvents}:{clientId:string;units:any[];cc:string;P:any;events:any[];setEvents:(e:any[])=>void}) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name:'', channel:'', event_type:'promotion', date:new Date().toISOString().split('T')[0],
    cost:0, description:'', revenue_before:0, revenue_after:0, customers_acquired:0,
    period_weeks:4, unit_id:'',
  })

  async function saveEvent() {
    if (!form.name) return
    setSaving(true)
    const {data,error} = await supabase.from('management_events').insert([{
      ...form, client_id:clientId, created_at:new Date().toISOString(), updated_at:new Date().toISOString(),
    }]).select().single()
    if (!error&&data) {
      setEvents([data,...events])
      setShowForm(false)
      setForm({name:'',channel:'',event_type:'promotion',date:new Date().toISOString().split('T')[0],cost:0,description:'',revenue_before:0,revenue_after:0,customers_acquired:0,period_weeks:4,unit_id:''})
    }
    setSaving(false)
  }

  const channelStats: Record<string,{cost:number,customers:number,events:number,revenueLift:number}> = {}
  events.forEach((evt:any) => {
    const ch = evt.channel || 'Unspecified'
    if (!channelStats[ch]) channelStats[ch] = {cost:0,customers:0,events:0,revenueLift:0}
    channelStats[ch].cost += evt.cost||0
    channelStats[ch].customers += evt.customers_acquired||0
    channelStats[ch].events += 1
    channelStats[ch].revenueLift += Math.max(0,(evt.revenue_after||0)-(evt.revenue_before||0))
  })
  const channelRows = Object.entries(channelStats).map(([channel,s])=>({
    channel, ...s, cac: s.customers>0 ? s.cost/s.customers : null,
  })).sort((a,b)=>{
    if (a.cac===null) return 1
    if (b.cac===null) return -1
    return a.cac-b.cac
  })

  return (
    <div>
      <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
          <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy}}>Customer Acquisition Cost by Channel</div>
          {P.canEditPlan&&<button style={addBtn(true)} onClick={()=>setShowForm(!showForm)}>+ Add Event</button>}
        </div>
        {channelRows.length===0 ? (
          <p style={{color:C.slate,fontSize:'0.85rem'}}>No promotion events recorded yet. Add one below to start tracking cost per customer acquired, by channel.</p>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.8rem'}}>
              <thead>
                <tr style={{background:C.navy,color:C.white}}>
                  {['Channel','Events','Total Cost','Customers Acquired','Cost per Customer (CAC)','Revenue Lift'].map(h=>(
                    <th key={h} style={{padding:'8px 10px',textAlign:'left',fontWeight:600,fontSize:'0.75rem'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {channelRows.map((r,i)=>(
                  <tr key={r.channel} style={{background:i%2===0?C.cream:C.white}}>
                    <td style={{padding:'8px 10px',fontWeight:600,color:C.navy}}>{r.channel}</td>
                    <td style={{padding:'8px 10px',fontFamily:'monospace'}}>{r.events}</td>
                    <td style={{padding:'8px 10px',fontFamily:'monospace'}}>{fmt(r.cost,cc)}</td>
                    <td style={{padding:'8px 10px',fontFamily:'monospace'}}>{r.customers}</td>
                    <td style={{padding:'8px 10px',fontFamily:'monospace',fontWeight:700,color:r.cac===null?C.slate:C.navy}}>
                      {r.cac===null?'No customers recorded':fmt(r.cac,cc)}
                    </td>
                    <td style={{padding:'8px 10px',fontFamily:'monospace',color:C.green}}>{fmt(r.revenueLift,cc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{fontSize:'0.72rem',color:C.slate,marginTop:'0.6rem'}}>Lower cost per customer means a more efficient channel. Channels with no customers recorded cannot be ranked.</p>
          </div>
        )}
      </div>

      {showForm&&(
        <div style={{background:C.white,border:`1px solid ${C.cyan}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'1rem'}}>
            <div><label style={lbl}>Event Name</label><input style={inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
            <div><label style={lbl}>Channel</label><input style={inp} placeholder="e.g. Farmer Field Days, Radio" value={form.channel} onChange={e=>setForm(f=>({...f,channel:e.target.value}))}/></div>
            <div><label style={lbl}>FGE / Unit</label><select style={inp} value={form.unit_id} onChange={e=>setForm(f=>({...f,unit_id:e.target.value}))}>
              <option value="">All FGEs</option>
              {units.filter((u:any)=>u.active).map((u:any)=><option key={u.id} value={u.id}>{u.name}</option>)}
            </select></div>
            <div><label style={lbl}>Date</label><input type="date" style={inp} value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
            <div><label style={lbl}>Cost ({cc})</label><input type="number" style={inp} value={form.cost||''} onChange={e=>setForm(f=>({...f,cost:Number(e.target.value)}))}/></div>
            <div><label style={lbl}>Customers Acquired</label><input type="number" style={inp} value={form.customers_acquired||''} onChange={e=>setForm(f=>({...f,customers_acquired:Number(e.target.value)}))}/></div>
            <div><label style={lbl}>Revenue Before ({cc})</label><input type="number" style={inp} value={form.revenue_before||''} onChange={e=>setForm(f=>({...f,revenue_before:Number(e.target.value)}))}/></div>
            <div><label style={lbl}>Revenue After ({cc})</label><input type="number" style={inp} value={form.revenue_after||''} onChange={e=>setForm(f=>({...f,revenue_after:Number(e.target.value)}))}/></div>
            <div style={{gridColumn:'1/-1'}}><label style={lbl}>Description</label><textarea style={{...inp,minHeight:60,resize:'vertical'}} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></div>
          </div>
          <div style={{display:'flex',gap:'0.6rem',marginTop:'0.85rem'}}>
            <button style={{fontFamily:'monospace',fontSize:'0.78rem',fontWeight:600,padding:'0.5rem 1.1rem',border:'none',borderRadius:4,background:C.navy,color:C.white,cursor:'pointer'}} disabled={saving} onClick={saveEvent}>{saving?'Saving...':'Save Event'}</button>
            <button style={addBtn(true)} onClick={()=>setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {events.length>0 && (
        <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.25rem'}}>
          <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy,marginBottom:'0.75rem'}}>All Events</div>
          {events.map((evt:any)=>{
            const roi = evt.cost>0 ? (evt.revenue_after-evt.revenue_before-evt.cost)/evt.cost : null
            const cac = evt.customers_acquired>0 ? evt.cost/evt.customers_acquired : null
            return (
              <div key={evt.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.6rem 0.75rem',background:'#F4F8FC',borderRadius:5,marginBottom:'0.4rem',flexWrap:'wrap',gap:'0.5rem'}}>
                <div>
                  <div style={{fontWeight:600,fontSize:'0.85rem',color:C.navy}}>{evt.name}</div>
                  <div style={{fontSize:'0.7rem',color:C.slate}}>{evt.date} · {evt.channel||'No channel set'}</div>
                </div>
                <div style={{display:'flex',gap:'0.4rem',flexWrap:'wrap'}}>
                  {cac!==null&&<Badge label={`CAC ${fmt(cac,cc)}`} color={C.teal}/>}
                  {roi!==null&&<Badge label={`ROI ${(roi*100).toFixed(0)}%`} color={roi>0?C.green:C.red}/>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── CONAS INVESTMENT PITCH DOWNLOAD ─────────────────────────
function ConasPitchDownload() {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  async function download() {
    setDownloading(true)
    setError('')
    try {
      const response = await fetch('/api/investment-pitch-conas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (!response.ok) {
        const errData = await response.json().catch(()=>({}))
        throw new Error(errData.error || 'Could not generate the document')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'CONAS_Investment_Summary.docx'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch(e:any) { setError(e.message || 'Download failed') }
    setDownloading(false)
  }

  return (
    <div style={{background:'#EBF8FF',borderRadius:6,padding:'0.85rem 1rem',marginBottom:'1.25rem',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.75rem'}}>
      <div>
        <div style={{fontWeight:700,fontSize:'0.88rem',color:C.navy}}>Investment Pitch Summary</div>
        <div style={{fontSize:'0.78rem',color:C.slate}}>A Word document with CONAS's financial summary and investment readiness scores, ready to send to a lender or investor.</div>
      </div>
      <button style={{fontFamily:'monospace',fontSize:'0.78rem',fontWeight:700,padding:'0.5rem 1.1rem',border:'none',borderRadius:4,background:C.navy,color:C.white,cursor:'pointer'}} disabled={downloading} onClick={download}>
        {downloading?'Generating...':'Download Word Document'}
      </button>
      {error&&(
        <div style={{width:'100%',background:'#FDF0EE',border:`2px solid ${C.red}`,borderRadius:6,padding:'0.85rem 1rem',marginTop:'0.5rem'}}>
          <div style={{fontWeight:700,color:C.red,fontSize:'0.85rem',marginBottom:'0.3rem'}}>⚠ Could not generate the document</div>
          <div style={{color:C.red,fontSize:'0.8rem'}}>{error}</div>
        </div>
      )}
    </div>
  )
}

// ── CONAS APPROVALS + SPEND REQUESTS WRAPPER ─────────────────
function ConasApprovalsAndSpendTab({approvalsEl,spendEl}:{approvalsEl:React.ReactNode;spendEl:React.ReactNode}) {
  const [mode,setMode]=useState<'approvals'|'requests'>('approvals')
  return (
    <div>
      <div style={{display:'flex',gap:'0.5rem',marginBottom:'1.25rem'}}>
        <button style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.5rem 1.1rem',border:'none',
          background:mode==='approvals'?C.navy:C.white,color:mode==='approvals'?C.white:C.slate,
          borderRadius:4,cursor:'pointer',fontWeight:mode==='approvals'?700:400}}
          onClick={()=>setMode('approvals')}>Approvals</button>
        <button style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.5rem 1.1rem',border:'none',
          background:mode==='requests'?C.navy:C.white,color:mode==='requests'?C.white:C.slate,
          borderRadius:4,cursor:'pointer',fontWeight:mode==='requests'?700:400}}
          onClick={()=>setMode('requests')}>My Spend Requests</button>
      </div>
      {mode==='approvals'?approvalsEl:spendEl}
    </div>
  )
}

// ── CONAS SETTINGS + SCENARIOS + TEAM WRAPPER ────────────────
function ConasSettingsAndAdminTab({settingsEl,scenariosEl,teamEl}:{settingsEl:React.ReactNode;scenariosEl:React.ReactNode;teamEl:React.ReactNode}) {
  const [mode,setMode]=useState<'settings'|'scenarios'|'team'>('settings')
  return (
    <div>
      <div style={{display:'flex',gap:'0.5rem',marginBottom:'1.25rem',flexWrap:'wrap'}}>
        <button style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.5rem 1.1rem',border:'none',
          background:mode==='settings'?C.navy:C.white,color:mode==='settings'?C.white:C.slate,
          borderRadius:4,cursor:'pointer',fontWeight:mode==='settings'?700:400}}
          onClick={()=>setMode('settings')}>General Settings</button>
        <button style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.5rem 1.1rem',border:'none',
          background:mode==='scenarios'?C.navy:C.white,color:mode==='scenarios'?C.white:C.slate,
          borderRadius:4,cursor:'pointer',fontWeight:mode==='scenarios'?700:400}}
          onClick={()=>setMode('scenarios')}>Scenarios</button>
        <button style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.5rem 1.1rem',border:'none',
          background:mode==='team'?C.navy:C.white,color:mode==='team'?C.white:C.slate,
          borderRadius:4,cursor:'pointer',fontWeight:mode==='team'?700:400}}
          onClick={()=>setMode('team')}>Team</button>
      </div>
      {mode==='settings'?settingsEl:mode==='scenarios'?scenariosEl:teamEl}
    </div>
  )
}
