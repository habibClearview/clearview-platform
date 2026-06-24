'use client'
import { useState, useMemo, useCallback } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  defaultCONASInputs, runCONASModel, buildMonthLabels,
  fmt, fmtFull, pct, MONTHS,
  type CONASInputs, type PlanLine, type SpendingRequest, type BusinessUnit,
} from '@/lib/conas-engine'

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

// Full P&L table — plan + optional actuals column
function PLTable({rows,months,title,footnote}:{
  title?:string; months:string[]; footnote?:string
  rows:{label:string;plan:number[];actual?:(number|null)[];bold?:boolean;highlight?:boolean;negate?:boolean;indent?:boolean}[]
}){
  const hasAct=rows.some(r=>r.actual?.some(v=>v!==null))
  return(
    <div style={card}>
      {title&&<div style={secH}>{title}</div>}
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
function LineEditor({line:l,onPlanChange,onActualChange,onRename,onRemove,months,cc,planLocked,showActual}:{
  line:PlanLine;months:string[];cc:string;planLocked:boolean;showActual:boolean
  onPlanChange:(m:number,v:number)=>void
  onActualChange:(m:number,v:number|null)=>void
  onRename:(name:string)=>void
  onRemove:()=>void
}){
  const total=l.monthlyPlan.reduce((a,b)=>a+b,0)
  return(
    <div style={{border:`1px solid ${C.border}`,borderRadius:6,padding:'0.75rem',marginBottom:'0.6rem'}}>
      <div style={{display:'flex',gap:'0.6rem',alignItems:'center',marginBottom:'0.5rem'}}>
        <input style={{...inp,flex:2,fontSize:'0.8rem'}} value={l.name} onChange={e=>onRename(e.target.value)}/>
        <span style={{fontFamily:'monospace',fontSize:'0.72rem',color:C.slate,whiteSpace:'nowrap'}}>Total: {fmt(total,cc)}</span>
        <button style={delBtn} onClick={()=>{if(window.confirm(`Remove "${l.name}"?`))onRemove()}}>✕ Remove</button>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',fontSize:'0.76rem',fontFamily:'monospace'}}>
          <thead><tr>{months.map((m,i)=><th key={i} style={{textAlign:'center',padding:'0.2rem 0.3rem',color:C.slate,fontWeight:600,fontSize:'0.68rem',minWidth:88}}>{m}</th>)}</tr></thead>
          <tbody>
            <tr>{l.monthlyPlan.map((v,m)=>(
              <td key={m} style={{padding:'0.18rem 0.2rem'}}>
                <input type="number" min="0" disabled={planLocked}
                  style={{...inp,width:84,fontSize:'0.74rem',padding:'0.26rem 0.3rem',textAlign:'right',background:planLocked?'#EEF4F8':'#F4F8FC'}}
                  value={v===0?'':v} placeholder="0"
                  onChange={e=>onPlanChange(m,e.target.value===''?0:Number(e.target.value))}/>
              </td>
            ))}</tr>
            {showActual&&<tr style={{background:C.actualBg}}>{l.monthlyActual.map((v,m)=>(
              <td key={m} style={{padding:'0.18rem 0.2rem'}}>
                <input type="number" min="0"
                  style={{...inp,width:84,fontSize:'0.73rem',padding:'0.24rem 0.3rem',textAlign:'right',background:v!==null?'#D0EEF2':'#EAF7F8',border:`1px solid ${v!==null?C.teal:C.border}`}}
                  value={v!==null&&v!==undefined?v:''} placeholder={String(Math.round(l.monthlyPlan[m]))}
                  onChange={e=>onActualChange(m,e.target.value===''?null:Number(e.target.value))}/>
                {v!==null&&v!==undefined&&<div style={{fontSize:'0.63rem',color:v-l.monthlyPlan[m]>=0?C.green:C.red,textAlign:'right'}}>{v-l.monthlyPlan[m]>=0?'+':''}{fmt(v-l.monthlyPlan[m])}</div>}
              </td>
            ))}</tr>}
          </tbody>
        </table>
      </div>
      {showActual&&<div style={{fontSize:'0.68rem',color:C.teal,marginTop:'0.35rem'}}>Row 1 = Plan · Row 2 (teal) = Actual for closed months</div>}
    </div>
  )
}

// ── PDF / Print export helper ───────────────────────────────
function exportToPrint(title: string) {
  window.print()
  void title
}

// ── MAIN COMPONENT ──────────────────────────────────────────
export default function CONASDashboard(){
  const [inputs,setInputs]  = useState<CONASInputs>(defaultCONASInputs)
  const [view,setView]      = useState('overview')
  const [planUnit,setPlanUnit] = useState('shop_1')
  const [unitPLView,setUnitPLView] = useState('fge')
  const [showActual,setShowActual] = useState(false)
  const [spendForm,setSpendForm] = useState({show:false,desc:'',unitId:'fge',category:'direct_opex' as PlanLine['category'],month:0,amount:0,requester:'Finance Manager'})

  const result = useMemo(()=>runCONASModel(inputs),[inputs])
  const months = useMemo(()=>buildMonthLabels(inputs.global.modelStartDate),[inputs.global.modelStartDate])
  const cc = inputs.global.currency
  const {unitPL,con,cf,bs,metrics,allocUnits,subUnitsByParent} = result

  const season = inputs.seasons[0]
  const planLocked = season?.planLocked||false
  const pending = inputs.spendingRequests.filter(r=>r.status==='pending')

  // All units including virtual parent consolidations
  const allActiveUnits = inputs.units.filter(u=>u.active)
  const topUnits = allActiveUnits.filter(u=>!u.parentId)
  const shopUnits = allActiveUnits.filter(u=>u.parentId==='input_centres')

  // ── Update helpers ────────────────────────────────────────
  const upd = useCallback((fn:(p:CONASInputs)=>CONASInputs)=>setInputs(fn),[])
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
    const nl:PlanLine={id:`l_${Date.now()}`,name:'New item',category:cat,monthlyPlan:Array(MONTHS).fill(0),monthlyActual:Array(MONTHS).fill(null),actualStatus:Array(MONTHS).fill('draft'),rejectionNote:Array(MONTHS).fill(''),isShared:false}
    upd(p=>({...p,units:p.units.map(u=>u.id!==uid?u:{...u,lines:[...u.lines,nl]})}))
  }
  function removeLine(uid:string,lid:string){upd(p=>({...p,units:p.units.map(u=>u.id!==uid?u:{...u,lines:u.lines.filter(l=>l.id!==lid)})}))}
  function renameLine(uid:string,lid:string,name:string){upd(p=>({...p,units:p.units.map(u=>u.id!==uid?u:{...u,lines:u.lines.map(l=>l.id!==lid?l:{...l,name})})}))}
  function addShared(){
    const nl:PlanLine={id:`sh_${Date.now()}`,name:'New shared cost',category:'shared',monthlyPlan:Array(MONTHS).fill(0),monthlyActual:Array(MONTHS).fill(null),actualStatus:Array(MONTHS).fill('draft'),rejectionNote:Array(MONTHS).fill(''),isShared:true}
    upd(p=>({...p,sharedLines:[...p.sharedLines,nl]}))
  }
  function toggleLock(){
    if(!window.confirm(planLocked?'Unlock the season plan?':'Lock the season plan? Unit heads cannot change plan figures after locking.'))return
    upd(p=>({...p,seasons:p.seasons.map((s,i)=>i!==0?s:{...s,planLocked:!s.planLocked,lockedAt:new Date().toISOString(),lockedBy:'CEO / Finance Manager'})}))
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

  // Unit display helpers
  const unitName=(id:string)=>inputs.units.find(u=>u.id===id)?.name||id
  const yr=(a:number[])=>a.reduce((s,v)=>s+v,0)

  // ── OVERVIEW ─────────────────────────────────────────────
  function OverviewTab(){
    const trendData=months.map((label,i)=>({
      month:label,Revenue:Math.round(con.rev[i]),EBITDA:Math.round(con.ebitda[i]),Cash:Math.round(cf.close[i]),
      ...(con.actRev[i]!==null?{'Actual Revenue':Math.round(con.actRev[i] as number)}:{})
    }))

    // Unit EBITDA for bar chart — show consolidated Input Centres + other top-level
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
          <span style={{fontWeight:700,color:planLocked?C.teal:C.navy}}>{planLocked?`🔒 Season plan locked`:'🔓 Season plan open — unit heads can edit'}</span>
          <button style={{...addBtn(true),borderColor:planLocked?C.teal:C.cyan,color:planLocked?C.teal:C.cyan}} onClick={toggleLock}>{planLocked?'Unlock Plan':'Lock Season Plan'}</button>
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
          {metrics.minCash<0?<Flag type="warn">Cash goes negative — {fmtFull(metrics.minCash,cc)} in Month {metrics.minCashMonth}. Irrigation kits ({fmtFull(metrics.irrigationTotal,cc)}) drive the early deficit. Enter opening capital in Settings.</Flag>
            :<Flag type="ok">Cash stays positive. Lowest: {fmtFull(metrics.minCash,cc)} in Month {metrics.minCashMonth}.</Flag>}
          {metrics.totalEBITDA<0?<Flag type="warn">Season EBITDA is negative. FGE revenue peaks at harvest (months 4–5, 9–10). Input Centres and advisory services provide year-round income.</Flag>
            :<Flag type="ok">Season EBITDA: {fmtFull(metrics.totalEBITDA,cc)} ({pct(metrics.netMargin)} net margin).</Flag>}
          <Flag type="info">Five Input Profit Centres consolidated. Each centre has its own P&L — view in Unit P&L tab.</Flag>
          <Flag type="info">Shared costs ({fmt(metrics.totalShared,cc)}) allocated {pct(inputs.global.sharedCostFixedPct)} by headcount, {pct(1-inputs.global.sharedCostFixedPct)} by revenue.</Flag>
        </div>

        <div style={card}>
          <div style={secH}>Revenue, EBITDA & Cash — Season Overview</div>
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
          <div style={secH}>EBITDA by Business Unit — Season Total</div>
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

        {/* Unit cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:'1rem',marginBottom:'1.25rem'}}>
          {/* Consolidated Input Centres card */}
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
          title="Consolidated P&L — Full Season"
          rows={[
            {label:'Revenue',plan:con.rev,actual:con.actRev},
            {label:'Cost of Sales',plan:con.cogs,negate:true},
            {label:'Gross Profit',plan:con.gp,bold:true},
            {label:'Total Overheads & Staff',plan:con.opex,negate:true},
            {label:'EBITDA',plan:con.ebitda,actual:con.actEbitda,bold:true,highlight:true},
            {label:'Tax',plan:con.tax,negate:true},
            {label:'Net Profit After Tax',plan:con.npat,bold:true},
          ]}
          months={months}
          footnote="Revenue is seasonal. Large inflows at harvest months (4–5 and 9–10). Costs spread throughout season."
        />
      </div>
    )
  }

  // ── UNIT P&L TAB ─────────────────────────────────────────
  function UnitPLTab(){
    // Build list of viewable units: individual shops + other top-level units
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
        {/* Unit selector */}
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
                  <strong>Consolidated view of all 5 Input Profit Centres.</strong> The figures below are the sum of all five shops.
                  Select an individual shop above to see that shop&apos;s own P&L and compare performance between centres.
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
              title={`${isConsolidated?'Input Profit Centres (Consolidated)':unitMeta?.name||unitPLView} — Full P&L`}
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
              footnote={`Shared cost allocation: ${pct(inputs.global.sharedCostFixedPct)} headcount, ${pct(1-inputs.global.sharedCostFixedPct)} revenue. ${isConsolidated?'Shared cost shown here is the total across all 5 centres.':''}`}
            />

            {/* Shop comparison table — only for Input Centres consolidated */}
            {isConsolidated&&(
              <div style={card}>
                <div style={secH}>Shop-by-Shop Comparison — Season EBITDA</div>
                <div style={{overflowX:'auto'}}>
                  <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.78rem',fontFamily:'monospace'}}>
                    <thead>
                      <tr style={{background:'#F4F8FC'}}>
                        <th style={{textAlign:'left',padding:'0.35rem 0.6rem',borderBottom:`2px solid ${C.border}`}}>Shop</th>
                        <th style={{textAlign:'right',padding:'0.35rem 0.6rem',borderBottom:`2px solid ${C.border}`}}>Revenue</th>
                        <th style={{textAlign:'right',padding:'0.35rem 0.6rem',borderBottom:`2px solid ${C.border}`}}>Gross Profit</th>
                        <th style={{textAlign:'right',padding:'0.35rem 0.6rem',borderBottom:`2px solid ${C.border}`}}>GM%</th>
                        <th style={{textAlign:'right',padding:'0.35rem 0.6rem',borderBottom:`2px solid ${C.border}`}}>Staff</th>
                        <th style={{textAlign:'right',padding:'0.35rem 0.6rem',borderBottom:`2px solid ${C.border}`}}>Overheads</th>
                        <th style={{textAlign:'right',padding:'0.35rem 0.6rem',borderBottom:`2px solid ${C.border}`}}>Shared</th>
                        <th style={{textAlign:'right',padding:'0.35rem 0.6rem',borderBottom:`2px solid ${C.border}`,fontWeight:700}}>EBITDA</th>
                        <th style={{textAlign:'right',padding:'0.35rem 0.6rem',borderBottom:`2px solid ${C.border}`}}>EBITDA%</th>
                        <th style={{textAlign:'left',padding:'0.35rem 0.6rem',borderBottom:`2px solid ${C.border}`}}></th>
                      </tr>
                    </thead>
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
                      {/* Totals row */}
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

  // ── PLANNING TAB ─────────────────────────────────────────
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
              <LineEditor key={l.id} line={l} months={months} cc={cc} planLocked={planLocked} showActual={false}
                onPlanChange={(m,v)=>setSharedVal(l.id,m,v)}
                onActualChange={()=>{}}
                onRename={name=>upd(p=>({...p,sharedLines:p.sharedLines.map(sl=>sl.id!==l.id?sl:{...sl,name})}))}
                onRemove={()=>upd(p=>({...p,sharedLines:p.sharedLines.filter(sl=>sl.id!==l.id)}))}
              />
            ))}
          </div>
        ):unitMeta?(
          <>
            {/* Live EBITDA strip */}
            {r&&(
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:'0.75rem',marginBottom:'1.25rem'}}>
                {[
                  {label:'Revenue',v:r.annRev},
                  {label:'Cost of Sales',v:-r.annCogs},
                  {label:'Gross Profit',v:r.annGP},
                  {label:'Staff',v:-r.annStaff},
                  {label:'Overheads',v:-r.annOpex},
                  {label:'Shared',v:-r.annShared},
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
              <strong>Planning sandbox for {unitMeta.name}.</strong> Change any figure — the EBITDA cards above update immediately. Every change flows to the consolidated P&L on Overview.{!planLocked&&<span style={{color:C.teal,marginLeft:6}}>↑ Cards update as you type.</span>}
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
                    <LineEditor key={l.id} line={l} months={months} cc={cc} planLocked={planLocked} showActual={showActual}
                      onPlanChange={(m,v)=>setPlanVal(unitMeta.id,l.id,m,v)}
                      onActualChange={(m,v)=>setActualVal(unitMeta.id,l.id,m,v)}
                      onRename={name=>renameLine(unitMeta.id,l.id,name)}
                      onRemove={()=>removeLine(unitMeta.id,l.id)}
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

  // ── CASH FLOW TAB ────────────────────────────────────────
  function CashFlowTab(){
    return(
      <div>
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
            {label:'Capital & Grant Inflows',plan:cf.finCash},
            {label:'Net Change in Cash',plan:cf.net,bold:true},
            {label:'Closing Cash',plan:cf.close,bold:true,highlight:true},
          ]}
          months={months}
          footnote="Approved spending requests post to this statement automatically on approval."
        />
        <div style={card}>
          <div style={secH}>Cash Position — Month by Month</div>
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

  // ── BALANCE SHEET TAB ────────────────────────────────────
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
          title="Balance Sheet — Month by Month"
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
          footnote="Balance sheet balances when capital raised equals assets deployed. Enter shareholder contribution, grants, and loans in Settings → Capital Structure. Irrigation kits shown at cost — add depreciation in Settings → Fixed Assets if needed."
        />
        <div style={{...card,background:'#F0F8FF',border:`1px solid ${C.cyan}`,padding:'0.85rem 1.1rem'}}>
          <div style={{fontWeight:700,fontSize:'0.9rem',marginBottom:'0.4rem',color:C.navy}}>Balance Sheet Check</div>
          <div style={{fontSize:'0.83rem',color:C.slate,lineHeight:1.6}}>
            End of season: Total Assets = {fmtFull(bs.totalAssets[11],cc)} · Total Equity + Liabilities = {fmtFull(bs.totalEquityAndLiabilities[11],cc)}.
            {Math.abs(bs.totalAssets[11]-bs.totalEquityAndLiabilities[11])<1000
              ?<span style={{color:C.green,marginLeft:6}}>✓ Balanced.</span>
              :<span style={{color:C.amber,marginLeft:6}}> Difference: {fmtFull(Math.abs(bs.totalAssets[11]-bs.totalEquityAndLiabilities[11]),cc)}. Add capital or grants in Settings to close the gap.</span>}
          </div>
        </div>
      </div>
    )
  }

  // ── APPROVALS TAB ────────────────────────────────────────
  function ApprovalsTab(){
    const [note,setNote]=useState<Record<string,string>>({})
    const all=[...inputs.spendingRequests].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
    return(
      <div>
        <div style={card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
            <div style={secH}>Submit a Spending Request</div>
            <button style={addBtn()} onClick={()=>setSpendForm(s=>({...s,show:!s.show}))}>{spendForm.show?'Cancel':'+ New Request'}</button>
          </div>
          {spendForm.show&&(
            <div style={{background:'#F4F8FC',borderRadius:6,padding:'1rem',border:`1px solid ${C.border}`}}>
              <p style={{...hint,fontSize:'0.8rem',marginBottom:'0.85rem',lineHeight:1.5}}>All spending requests require CEO approval before any cash is released. Approved requests post automatically to the unit&apos;s costs and the cash flow statement.</p>
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
                <div style={{gridColumn:'1 / -1'}}><label style={lbl}>Description — what is this for?</label>
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
                    <div style={{fontSize:'0.72rem',color:C.slate,marginTop:4}}>If approved: posts to {unitName(r.unitId)} costs in {months[r.month]} and reduces cash by {fmtFull(r.amount,cc)}.</div>
                  </div>
                  <div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:C.amber,marginLeft:'1rem',whiteSpace:'nowrap'}}>{fmtFull(r.amount,cc)}</div>
                </div>
                <input style={{...inp,marginBottom:'0.5rem',fontSize:'0.8rem'}} placeholder="CEO note (required if declining)" value={note[r.id]||''} onChange={e=>setNote(n=>({...n,[r.id]:e.target.value}))}/>
                <div style={{display:'flex',gap:'0.6rem'}}>
                  <button style={{fontSize:'0.78rem',fontWeight:600,padding:'0.4rem 0.9rem',border:'none',borderRadius:4,background:C.green,color:C.white,cursor:'pointer'}} onClick={()=>resolveRequest(r.id,true,note[r.id]||'')}>✓ Approve — post to P&L & Cash</button>
                  <button style={{fontSize:'0.78rem',fontWeight:600,padding:'0.4rem 0.9rem',border:'none',borderRadius:4,background:C.red,color:C.white,cursor:'pointer'}} onClick={()=>{if(!note[r.id]){alert('Add a note explaining why this is declined.');return}resolveRequest(r.id,false,note[r.id])}}>✕ Decline</button>
                </div>
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

  // ── SCENARIOS TAB ────────────────────────────────────────
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

  // ── SETTINGS TAB ────────────────────────────────────────
  function SettingsTab(){
    const cap=inputs.capitalStructure
    return(
      <div>
        <div style={card}>
          <div style={secH}>Global Settings</div>
          <div style={fGrid}>
            {[
              {f:'businessName',l:'Business Name',t:'text'},
              {f:'currency',l:'Currency Code (UGX, KES, GHS…)',t:'text'},
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
                {f==='currency'&&<div style={hint}>Updates all figures immediately.</div>}
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
          <div style={{marginTop:'1rem',padding:'0.75rem',background:'#F0F8FF',borderRadius:6,fontSize:'0.82rem',color:C.slate,lineHeight:1.55}}>
            Irrigation kits: <strong>{fmtFull(metrics.irrigationTotal,cc)}</strong> ({metrics.fgeCount} FGEs × UGX 8M). &nbsp;
            Capital raised: <strong>{fmtFull(cap.shareholderContribution+cap.grantNonRepayable+cap.grantRecoverable+cap.bankLoan,cc)}</strong>. &nbsp;
            Gap: <strong style={{color:metrics.irrigationTotal-cap.shareholderContribution-cap.grantNonRepayable-cap.grantRecoverable-cap.bankLoan>0?C.red:C.green}}>{fmtFull(metrics.irrigationTotal-cap.shareholderContribution-cap.grantNonRepayable-cap.grantRecoverable-cap.bankLoan,cc)}</strong>
          </div>
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
  const tabs:[string,string][]=[
    ['overview','Overview'],
    ['unitpl','Unit P&L'],
    ['planning','Planning'],
    ['approvals',`Approvals${pending.length>0?` (${pending.length})`:''}`],
    ['cashflow','Cash Flow'],
    ['balancesheet','Balance Sheet'],
    ['scenarios','Scenarios'],
    ['settings','Settings'],
  ]

  return(
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.cream,color:C.navy,minHeight:'100vh'}}>
      <header style={{background:C.navy,borderBottom:`3px solid ${C.cyan}`}}>
        <div style={{maxWidth:1440,margin:'0 auto',padding:'1.25rem 1.5rem',display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'1rem'}}>
          <div>
            <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.15em',color:C.cyan,marginBottom:'0.28rem'}}>CANVAS COACH — CLEARVIEW PLANNER</div>
            <h1 style={{fontFamily:'Georgia,serif',fontSize:'1.5rem',fontWeight:700,color:C.white,margin:'0.1rem 0 0.15rem'}}>{inputs.global.businessName}</h1>
            <div style={{fontSize:'0.76rem',color:'rgba(255,255,255,0.6)'}}>
              {metrics.scenarioLabel} · {metrics.fgeCount} FGEs · {inputs.global.currency} · {new Date(inputs.global.modelStartDate).toLocaleString('en-GB',{month:'long',year:'numeric'})}
              {planLocked&&<span style={{marginLeft:8,color:C.teal}}>· 🔒 Locked</span>}
              {pending.length>0&&<span style={{marginLeft:8,color:C.amber}}>· ⏳ {pending.length} pending</span>}
            </div>
          </div>
          <div style={{background:'rgba(0,180,216,0.12)',border:`1px solid rgba(0,180,216,0.3)`,borderRadius:8,padding:'0.72rem 1rem',minWidth:210}}>
            <div style={{fontFamily:'monospace',fontSize:'0.6rem',color:C.cyan,letterSpacing:'0.1em',marginBottom:'0.28rem'}}>ACTIVE SCENARIO</div>
            <select style={{width:'100%',background:'transparent',border:'none',color:C.white,fontSize:'0.85rem',fontWeight:700,cursor:'pointer',outline:'none'}}
              value={inputs.global.activeScenarioId} onChange={e=>setG('activeScenarioId',e.target.value)}>
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
        {view==='overview'     &&<OverviewTab/>}
        {view==='unitpl'       &&<UnitPLTab/>}
        {view==='planning'     &&<PlanningTab/>}
        {view==='approvals'    &&<ApprovalsTab/>}
        {view==='cashflow'     &&<CashFlowTab/>}
        {view==='balancesheet' &&<BalanceSheetTab/>}
        {view==='scenarios'    &&<ScenariosTab/>}
        {view==='settings'     &&<SettingsTab/>}
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
