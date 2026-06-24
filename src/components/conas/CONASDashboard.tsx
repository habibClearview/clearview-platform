'use client'
import { useState, useMemo, useCallback } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  defaultCONASInputs, runCONASModel, buildMonthLabels,
  fmt, fmtFull, pct, MONTHS,
  type CONASInputs, type PlanLine, type SpendingRequest,
} from '@/lib/conas-engine'

// ── Design tokens ──────────────────────────────────────────
const C = {
  navy:'#1B2A4A', cyan:'#00B4D8', cream:'#F8F4EE', white:'#FFFFFF',
  slate:'#4A5A6A', border:'#D8E0E8', teal:'#1A9DAA',
  red:'#C0392B', green:'#1A7A4A', amber:'#B8860B',
  planBg:'#FFFFFF', actualBg:'#E8F6F8', varBg:'#FFF9ED',
}

// ── Small reusable style objects ───────────────────────────
const card: React.CSSProperties   = {background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}
const secH: React.CSSProperties   = {fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy,marginBottom:'0.75rem'}
const inp:  React.CSSProperties   = {width:'100%',padding:'0.42rem 0.6rem',border:`1px solid ${C.border}`,borderRadius:4,fontSize:'0.83rem',fontFamily:'inherit',background:'#F4F8FC',color:C.navy,boxSizing:'border-box'}
const lbl:  React.CSSProperties   = {display:'block',fontWeight:600,fontSize:'0.8rem',marginBottom:'0.22rem',color:C.navy}
const hint: React.CSSProperties   = {fontSize:'0.7rem',color:C.slate,lineHeight:1.4,marginTop:'0.18rem'}
const fGrid:React.CSSProperties   = {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:'1.1rem'}
const addBtn:(a?:boolean)=>React.CSSProperties = (sm) => ({fontFamily:'monospace',fontSize:sm?'0.68rem':'0.72rem',padding:sm?'0.28rem 0.6rem':'0.38rem 0.8rem',border:`1px solid ${C.cyan}`,borderRadius:4,background:'transparent',color:C.cyan,cursor:'pointer'})
const delBtn: React.CSSProperties = {fontSize:'0.68rem',color:C.red,background:'transparent',border:`1px solid ${C.border}`,borderRadius:3,cursor:'pointer',padding:'0.18rem 0.42rem'}
const approveBtn: React.CSSProperties = {fontSize:'0.78rem',fontWeight:600,padding:'0.4rem 0.9rem',border:'none',borderRadius:4,background:C.green,color:C.white,cursor:'pointer'}
const declineBtn: React.CSSProperties = {fontSize:'0.78rem',fontWeight:600,padding:'0.4rem 0.9rem',border:'none',borderRadius:4,background:C.red,color:C.white,cursor:'pointer'}

function navBtn(active:boolean): React.CSSProperties {
  return {fontFamily:'monospace',fontSize:'0.72rem',padding:'0.72rem 1rem',border:'none',background:'transparent',
    color:active?C.cyan:'rgba(255,255,255,0.6)',cursor:'pointer',
    borderBottom:active?`3px solid ${C.cyan}`:'3px solid transparent',
    fontWeight:active?700:400,whiteSpace:'nowrap'}
}

// ── Shared sub-components ──────────────────────────────────
function KPI({label,value,sub,color,onClick}:{label:string;value:string;sub?:string;color?:string;onClick?:()=>void}) {
  return (
    <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1rem 1.1rem',cursor:onClick?'pointer':undefined}} onClick={onClick}>
      <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.1em',color:C.slate,textTransform:'uppercase',marginBottom:'0.28rem'}}>{label}</div>
      <div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:color||C.navy,marginBottom:'0.18rem'}}>{value}</div>
      {sub && <div style={{fontSize:'0.7rem',color:C.slate}}>{sub}</div>}
    </div>
  )
}

function Flag({type,children}:{type:'warn'|'ok'|'info';children:React.ReactNode}) {
  const col = type==='warn'?C.red:type==='ok'?C.green:C.cyan
  return (
    <div style={{display:'flex',gap:'0.55rem',alignItems:'flex-start',fontSize:'0.82rem',lineHeight:1.55,marginBottom:'0.42rem'}}>
      <span style={{width:8,height:8,borderRadius:'50%',background:col,marginTop:'0.45rem',flexShrink:0}}/>
      <span>{children}</span>
    </div>
  )
}

// Table used throughout — plan, optional actual, optional variance
function PlanTable({title,rows,months,footnote}:{
  title?:string
  months:string[]
  footnote?:string
  rows:{
    label:string
    plan:number[]
    actual?:(number|null)[]
    bold?:boolean
    highlight?:boolean
    negate?:boolean
    indent?:boolean
  }[]
}) {
  const hasActual = rows.some(r => r.actual?.some(v => v!==null))
  return (
    <div style={card}>
      {title && <div style={secH}>{title}</div>}
      {hasActual && (
        <div style={{display:'flex',gap:'1.2rem',marginBottom:'0.6rem',fontSize:'0.7rem',color:C.slate}}>
          <span style={{display:'inline-flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:2,background:C.planBg,border:`1px solid ${C.border}`,display:'inline-block'}}/> Plan</span>
          <span style={{display:'inline-flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:2,background:C.actualBg,display:'inline-block'}}/> Actual (approved)</span>
          <span style={{display:'inline-flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:2,background:C.varBg,display:'inline-block'}}/> Variance</span>
        </div>
      )}
      <div style={{overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.77rem',fontFamily:'monospace'}}>
          <thead>
            <tr>
              <th style={{textAlign:'left',padding:'0.3rem 0.5rem',borderBottom:`2px solid ${C.border}`,minWidth:200,background:'#F4F8FC',fontFamily:'inherit',fontSize:'0.79rem'}}>​</th>
              {months.map((m,i) => <th key={i} style={{textAlign:'right',padding:'0.3rem 0.5rem',borderBottom:`2px solid ${C.border}`,whiteSpace:'nowrap',background:'#F4F8FC',color:C.slate,fontWeight:600}}>{m}</th>)}
              <th style={{textAlign:'right',padding:'0.3rem 0.5rem',borderBottom:`2px solid ${C.border}`,borderLeft:`2px solid ${C.border}`,background:'#F4F8FC',color:C.slate,fontWeight:600}}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row,ri) => {
              const dsp = (v:number) => row.negate ? -Math.abs(v) : v
              const planVals = row.plan.map(dsp)
              const total = planVals.reduce((a,b)=>a+b,0)
              const bg = row.highlight ? C.actualBg : 'transparent'
              return (
                <tr key={ri} style={{background:bg}}>
                  <td style={{textAlign:'left',padding:'0.27rem 0.5rem',borderBottom:`1px solid #EEF2F6`,fontSize:'0.79rem',fontWeight:row.bold?700:400,paddingLeft:row.indent?'1.8rem':'0.5rem'}}>
                    {row.label}
                  </td>
                  {planVals.map((v,vi) => {
                    const act = row.actual?.[vi]
                    const hasAct = act!==null && act!==undefined
                    const dAct = hasAct ? dsp(act as number) : null
                    const variance = hasAct ? (dAct as number) - v : null
                    return (
                      <td key={vi} style={{textAlign:'right',padding:'0',borderBottom:`1px solid #EEF2F6`,verticalAlign:'top'}}>
                        <div style={{display:'flex',flexDirection:'column',padding:'0.27rem 0.5rem',minHeight:36}}>
                          <span style={{color:hasAct?C.slate:v<0?C.red:C.navy,fontWeight:row.bold?700:400}}>{fmt(v)}</span>
                          {hasAct && dAct!==null && <span style={{color:C.teal,fontSize:'0.72rem'}}>{fmt(dAct)}</span>}
                          {variance!==null && <span style={{fontSize:'0.68rem',color:variance>=0?C.green:C.red}}>{variance>=0?'+':''}{fmt(variance)}</span>}
                        </div>
                      </td>
                    )
                  })}
                  <td style={{textAlign:'right',padding:'0.27rem 0.5rem',borderBottom:`1px solid #EEF2F6`,borderLeft:`2px solid ${C.border}`,fontWeight:row.bold?700:600,color:total<0?C.red:C.navy}}>
                    {fmt(total)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {footnote && <div style={{marginTop:'0.65rem',fontSize:'0.71rem',color:C.slate,lineHeight:1.5}}>{footnote}</div>}
    </div>
  )
}

// Editable monthly grid for a single plan line
function LineEditor({line,onPlanChange,onActualChange,onRename,onRemove,months,cc,planLocked,showActual}:{
  line:PlanLine; months:string[]; cc:string; planLocked:boolean; showActual:boolean
  onPlanChange:(m:number,v:number)=>void
  onActualChange:(m:number,v:number|null)=>void
  onRename:(name:string)=>void
  onRemove:()=>void
}) {
  const planTotal = line.monthlyPlan.reduce((a,b)=>a+b,0)
  return (
    <div style={{border:`1px solid ${C.border}`,borderRadius:6,padding:'0.75rem',marginBottom:'0.6rem'}}>
      <div style={{display:'flex',gap:'0.6rem',alignItems:'center',marginBottom:'0.5rem'}}>
        <input style={{...inp,flex:2,fontSize:'0.8rem'}} value={line.name} onChange={e=>onRename(e.target.value)} />
        <span style={{fontFamily:'monospace',fontSize:'0.72rem',color:C.slate,whiteSpace:'nowrap'}}>Annual: {fmt(planTotal,cc)}</span>
        <button style={delBtn} onClick={()=>{if(window.confirm(`Remove "${line.name}"? This cannot be undone.`)) onRemove()}}>✕ Remove</button>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',fontSize:'0.76rem',fontFamily:'monospace'}}>
          <thead>
            <tr>
              {months.map((m,i)=>(
                <th key={i} style={{textAlign:'center',padding:'0.2rem 0.3rem',color:C.slate,fontWeight:600,fontSize:'0.68rem',minWidth:88}}>{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {line.monthlyPlan.map((v,m)=>(
                <td key={m} style={{padding:'0.18rem 0.2rem'}}>
                  <input type="number" min="0"
                    disabled={planLocked}
                    style={{...inp,width:84,fontSize:'0.74rem',padding:'0.26rem 0.3rem',textAlign:'right',background:planLocked?'#EEF4F8':'#F4F8FC'}}
                    value={v===0?'':v}
                    placeholder="0"
                    onChange={e=>onPlanChange(m, e.target.value===''?0:Number(e.target.value))}
                  />
                </td>
              ))}
            </tr>
            {showActual && (
              <tr>
                {line.monthlyActual.map((v,m)=>(
                  <td key={m} style={{padding:'0.18rem 0.2rem',background:C.actualBg,borderRadius:3}}>
                    <input type="number" min="0"
                      style={{...inp,width:84,fontSize:'0.73rem',padding:'0.24rem 0.3rem',textAlign:'right',background:v!==null?'#D0EEF2':'#EAF7F8',border:`1px solid ${v!==null?C.teal:C.border}`}}
                      value={v!==null&&v!==undefined?v:''}
                      placeholder={String(Math.round(line.monthlyPlan[m]))}
                      onChange={e=>onActualChange(m, e.target.value===''?null:Number(e.target.value))}
                    />
                    {v!==null&&v!==undefined && (
                      <div style={{fontSize:'0.63rem',color:v-line.monthlyPlan[m]>=0?C.green:C.red,textAlign:'right'}}>
                        {v-line.monthlyPlan[m]>=0?'+':''}{fmt(v-line.monthlyPlan[m])}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {showActual && <div style={{fontSize:'0.68rem',color:C.teal,marginTop:'0.35rem'}}>Row 1 = Plan &nbsp;|&nbsp; Row 2 (teal) = Actual — enter actual for any closed month. Plan row 1 shows grey once actual is entered.</div>}
    </div>
  )
}

// ── MAIN COMPONENT ─────────────────────────────────────────
export default function CONASDashboard() {
  const [inputs, setInputs] = useState<CONASInputs>(defaultCONASInputs)
  const [view, setView]     = useState('overview')
  const [planUnit, setPlanUnit] = useState('input_centres')
  const [showActualInPlan, setShowActualInPlan] = useState(false)
  const [spendForm, setSpendForm] = useState({show:false,desc:'',unitId:'fge',category:'direct_opex' as PlanLine['category'],month:0,amount:0,requester:'Finance Manager'})

  const result = useMemo(()=>runCONASModel(inputs),[inputs])
  const months = useMemo(()=>buildMonthLabels(inputs.global.modelStartDate),[inputs.global.modelStartDate])
  const cc = inputs.global.currency
  const {uc,con,cf,metrics,activeUnits} = result

  // Current season lock status
  const season = inputs.seasons[0]
  const planLocked = season?.planLocked || false

  // ── Update helpers ────────────────────────────────────────
  const upd = useCallback((fn:(p:CONASInputs)=>CONASInputs)=>setInputs(fn),[])
  const setG = (f:string,v:unknown) => upd(p=>({...p,global:{...p.global,[f]:v}}))

  function setPlanVal(uid:string,lid:string,m:number,v:number) {
    upd(p=>({...p,units:p.units.map(u=>u.id!==uid?u:{...u,lines:u.lines.map(l=>l.id!==lid?l:{...l,monthlyPlan:l.monthlyPlan.map((x,i)=>i===m?v:x)})})}))
  }
  function setActualVal(uid:string,lid:string,m:number,v:number|null) {
    upd(p=>({...p,units:p.units.map(u=>u.id!==uid?u:{...u,lines:u.lines.map(l=>l.id!==lid?l:{...l,monthlyActual:l.monthlyActual.map((x,i)=>i===m?v:x),actualStatus:l.actualStatus.map((s,i)=>i===m&&v!==null?'approved':s)})})}))
  }
  function setSharedPlanVal(lid:string,m:number,v:number) {
    upd(p=>({...p,sharedLines:p.sharedLines.map(l=>l.id!==lid?l:{...l,monthlyPlan:l.monthlyPlan.map((x,i)=>i===m?v:x)})}))
  }
  function addLine(uid:string,category:PlanLine['category']) {
    const newLine:PlanLine={id:`l_${Date.now()}`,name:'New item — rename me',category,monthlyPlan:Array(MONTHS).fill(0),monthlyActual:Array(MONTHS).fill(null),actualStatus:Array(MONTHS).fill('draft'),rejectionNote:Array(MONTHS).fill(''),isShared:false}
    upd(p=>({...p,units:p.units.map(u=>u.id!==uid?u:{...u,lines:[...u.lines,newLine]})}))
  }
  function addSharedLine() {
    const newLine:PlanLine={id:`sh_${Date.now()}`,name:'New shared cost',category:'shared',monthlyPlan:Array(MONTHS).fill(0),monthlyActual:Array(MONTHS).fill(null),actualStatus:Array(MONTHS).fill('draft'),rejectionNote:Array(MONTHS).fill(''),isShared:true}
    upd(p=>({...p,sharedLines:[...p.sharedLines,newLine]}))
  }
  function removeLine(uid:string,lid:string) { upd(p=>({...p,units:p.units.map(u=>u.id!==uid?u:{...u,lines:u.lines.filter(l=>l.id!==lid)})})) }
  function removeSharedLine(lid:string) { upd(p=>({...p,sharedLines:p.sharedLines.filter(l=>l.id!==lid)})) }
  function renameLine(uid:string,lid:string,name:string) { upd(p=>({...p,units:p.units.map(u=>u.id!==uid?u:{...u,lines:u.lines.map(l=>l.id!==lid?l:{...l,name})})})) }
  function renameShared(lid:string,name:string) { upd(p=>({...p,sharedLines:p.sharedLines.map(l=>l.id!==lid?l:{...l,name})})) }
  function setLineFlat(uid:string,lid:string,v:number) { upd(p=>({...p,units:p.units.map(u=>u.id!==uid?u:{...u,lines:u.lines.map(l=>l.id!==lid?l:{...l,monthlyPlan:Array(MONTHS).fill(v)})})})) }
  function setSharedFlat(lid:string,v:number) { upd(p=>({...p,sharedLines:p.sharedLines.map(l=>l.id!==lid?l:{...l,monthlyPlan:Array(MONTHS).fill(v)})})) }

  // Season lock / unlock
  function toggleLock() {
    const msg = planLocked
      ? 'Unlock the season plan? Unit heads will be able to edit plan figures again.'
      : 'Lock the season plan? Plan figures will be frozen for all unit heads. Actuals entry remains open.'
    if (!window.confirm(msg)) return
    upd(p=>({...p,seasons:p.seasons.map((s,i)=>i!==0?s:{...s,planLocked:!s.planLocked,lockedAt:new Date().toISOString(),lockedBy:'CEO / Finance Manager'})}))
  }

  // Spending request approval
  function resolveRequest(id:string, approved:boolean, note:string) {
    upd(p=>({...p,spendingRequests:p.spendingRequests.map(r=>r.id!==id?r:{...r,status:approved?'approved':'declined',ceoNote:note,resolvedAt:new Date().toISOString()})}))
  }
  function submitSpendRequest() {
    if (!spendForm.desc || spendForm.amount<=0) { alert('Please enter a description and amount.'); return }
    const req:SpendingRequest={
      id:`sr_${Date.now()}`,requestedBy:spendForm.requester,description:spendForm.desc,
      unitId:spendForm.unitId,category:spendForm.category as SpendingRequest['category'],
      month:spendForm.month,amount:spendForm.amount,
      status:'pending',ceoNote:'',createdAt:new Date().toISOString(),resolvedAt:'',
    }
    upd(p=>({...p,spendingRequests:[...p.spendingRequests,req]}))
    setSpendForm(s=>({...s,show:false,desc:'',amount:0}))
  }

  const pending = inputs.spendingRequests.filter(r=>r.status==='pending')

  // ── OVERVIEW ──────────────────────────────────────────────
  function OverviewTab() {
    const trendData = months.map((label,i)=>({
      month:label,
      Revenue: Math.round(con.rev[i]),
      EBITDA:  Math.round(con.ebitda[i]),
      Cash:    Math.round(cf.close[i]),
      ...(con.actRev[i]!==null?{'Actual Revenue':Math.round(con.actRev[i] as number)}:{}),
    }))
    const unitBars = activeUnits.map(u=>({
      name:u.short,
      EBITDA:Math.round(uc[u.id].finalEbitda.reduce((a,b)=>a+b,0)),
      color:u.color,
    }))
    const yr=(a:number[])=>a.reduce((s,v)=>s+v,0)

    return (
      <div>
        {/* Pending approvals banner */}
        {pending.length>0 && (
          <div style={{background:'#FFF8E8',border:`1px solid ${C.amber}`,borderRadius:8,padding:'0.9rem 1.1rem',marginBottom:'1.25rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontWeight:600,color:C.amber}}>⏳ {pending.length} spending request{pending.length>1?'s':''} waiting for CEO approval</span>
            <button style={{...addBtn(true),borderColor:C.amber,color:C.amber}} onClick={()=>setView('approvals')}>Review now →</button>
          </div>
        )}

        {/* Season lock banner */}
        <div style={{background:planLocked?'#E8F6F8':'#F0F8FF',border:`1px solid ${planLocked?C.teal:C.cyan}`,borderRadius:8,padding:'0.75rem 1.1rem',marginBottom:'1.25rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <span style={{fontWeight:700,color:planLocked?C.teal:C.navy}}>{planLocked?`🔒 Season plan locked — ${season.lockedAt?new Date(season.lockedAt).toLocaleDateString('en-GB'):''}`: '🔓 Season plan is open — unit heads can edit assumptions'}</span>
            {planLocked && <div style={{fontSize:'0.72rem',color:C.slate,marginTop:2}}>Actuals entry remains open. Unlock to allow plan changes.</div>}
          </div>
          <button style={{...addBtn(true),borderColor:planLocked?C.teal:C.cyan,color:planLocked?C.teal:C.cyan}} onClick={toggleLock}>
            {planLocked?'Unlock Plan':'Lock Season Plan'}
          </button>
        </div>

        {/* KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:'1rem',marginBottom:'1.25rem'}}>
          <KPI label="Season Revenue (Plan)" value={fmt(metrics.totalRevenue,cc)} sub={`Gross margin ${pct(metrics.grossMargin)}`}/>
          <KPI label="Season EBITDA" value={fmt(metrics.totalEBITDA,cc)} color={metrics.totalEBITDA>=0?C.green:C.red} sub={`Net profit ${fmt(metrics.totalNPAT,cc)}`}/>
          <KPI label="Irrigation Investment" value={fmt(metrics.irrigationTotal,cc)} sub={`${metrics.fgeCount} FGEs × UGX 8M`}/>
          <KPI label="Approved Spending" value={fmt(metrics.approvedSpendTotal,cc)} sub="Posted to P&L and cash flow" color={metrics.approvedSpendTotal>0?C.amber:C.navy}/>
          <KPI label="Minimum Cash" value={fmt(metrics.minCash,cc)} color={metrics.minCash>=0?C.navy:C.red} sub={`Month ${metrics.minCashMonth}`}/>
          <KPI label="Pending Approvals" value={String(metrics.pendingRequests)} color={metrics.pendingRequests>0?C.amber:C.navy} sub="Spending requests awaiting CEO" onClick={()=>setView('approvals')}/>
        </div>

        {/* Reading the picture */}
        <div style={{...card,background:C.navy,color:C.white}}>
          <div style={{fontFamily:'monospace',fontSize:'0.63rem',letterSpacing:'0.12em',color:C.cyan,marginBottom:'0.7rem'}}>READING THE PICTURE</div>
          {metrics.minCash<0
            ? <Flag type="warn">Cash goes negative — reaching {fmtFull(metrics.minCash,cc)} in Month {metrics.minCashMonth}. Irrigation kit costs ({fmtFull(metrics.irrigationTotal,cc)}) in Months 1–2 drive the early deficit. Enter opening capital in Settings → Capital Structure.</Flag>
            : <Flag type="ok">Cash stays positive throughout the season. Lowest point: {fmtFull(metrics.minCash,cc)} in Month {metrics.minCashMonth}.</Flag>}
          {metrics.totalEBITDA<0
            ? <Flag type="warn">Season EBITDA is negative ({fmtFull(metrics.totalEBITDA,cc)}). Revenue is heavily seasonal — almost all FGE income arrives at harvest months. The planning section shows when cash comes in and goes out.</Flag>
            : <Flag type="ok">Season EBITDA: {fmtFull(metrics.totalEBITDA,cc)} ({pct(metrics.netMargin)} net margin).</Flag>}
          <Flag type="info">Shared costs (CEO, Finance Manager, Operations Manager, Business Development Manager, central overheads) total {fmt(metrics.totalShared,cc)} for the season. Allocated to units {pct(inputs.global.sharedCostFixedPct)} by headcount and {pct(1-inputs.global.sharedCostFixedPct)} by revenue each month.</Flag>
          {metrics.approvedSpendTotal>0 && <Flag type="info">{fmt(metrics.approvedSpendTotal,cc)} in approved spending requests has been posted automatically to unit costs and cash flow.</Flag>}
        </div>

        {/* Chart */}
        <div style={card}>
          <div style={secH}>Revenue, EBITDA & Cash — Season Overview</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData} margin={{top:8,right:16,left:8,bottom:8}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="month" tick={{fontSize:11,fill:C.slate}}/>
              <YAxis tick={{fontSize:11,fill:C.slate}} tickFormatter={v=>fmt(v,'').trim()} width={70}/>
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

        {/* Unit EBITDA bars */}
        <div style={card}>
          <div style={secH}>EBITDA by Business Unit — Season Total</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={unitBars} margin={{top:4,right:16,left:8,bottom:4}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="name" tick={{fontSize:11,fill:C.slate}}/>
              <YAxis tick={{fontSize:11,fill:C.slate}} tickFormatter={v=>fmt(v,'').trim()} width={70}/>
              <Tooltip formatter={(v:number)=>fmtFull(v,cc)}/>
              <ReferenceLine y={0} stroke={C.red} strokeDasharray="3 3"/>
              <Bar dataKey="EBITDA" fill={C.cyan} radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Unit cards with link to planning */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:'1rem',marginBottom:'1.25rem'}}>
          {activeUnits.map(u=>{
            const yr2=(a:number[])=>a.reduce((s,v)=>s+v,0)
            const rev=yr2(uc[u.id].plan.rev), ebitda=yr2(uc[u.id].finalEbitda)
            return (
              <div key={u.id} style={{background:C.white,border:`1px solid ${C.border}`,borderTop:`4px solid ${u.color}`,borderRadius:8,padding:'1rem 1.1rem'}}>
                <div style={{fontWeight:600,fontSize:'0.82rem',marginBottom:'0.3rem'}}>{u.name}</div>
                <div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:ebitda>=0?C.teal:C.red}}>{fmt(ebitda,cc)}</div>
                <div style={{fontSize:'0.7rem',color:C.slate,marginBottom:'0.5rem'}}>EBITDA · Revenue: {fmt(rev,cc)}</div>
                <button style={addBtn(true)} onClick={()=>{setPlanUnit(u.id);setView('planning')}}>Open planning →</button>
              </div>
            )
          })}
        </div>

        <PlanTable
          title="Consolidated P&L — Full Season"
          rows={[
            {label:'Revenue',plan:con.rev,actual:con.actRev},
            {label:'Cost of Sales',plan:con.cogs,negate:true},
            {label:'Gross Profit',plan:con.gp,bold:true},
            {label:'Total Overheads & Staff',plan:con.opex,negate:true},
            {label:'EBITDA',plan:con.ebitda,actual:con.actEbitda,bold:true,highlight:true},
            {label:'Net Profit After Tax',plan:con.npat,bold:true},
          ]}
          months={months}
          footnote="Revenue is seasonal — large inflows at harvest (months 4, 5, 9, 10). Costs are spread throughout. This is the expected pattern for a three-crop aggregator."
        />
      </div>
    )
  }

  // ── PLANNING TAB ──────────────────────────────────────────
  function PlanningTab() {
    const isShared = planUnit==='shared'
    const unitMeta = isShared ? null : activeUnits.find(u=>u.id===planUnit)||activeUnits[0]
    const r = unitMeta ? uc[unitMeta.id] : null

    const cats: {key:PlanLine['category'];label:string;addLabel:string;hint:string}[] = [
      {key:'revenue',     label:'Revenue Plan',      addLabel:'+ Add Revenue Line',   hint:'Add any new income stream for this unit. Change any cell and watch the EBITDA update immediately.'},
      {key:'cost_of_sales',label:'Cost of Sales',   addLabel:'+ Add Cost of Sales',  hint:'Direct costs of producing or procuring the goods/services sold.'},
      {key:'staff',       label:'Staff Plan',        addLabel:'+ Add Staff Role',     hint:'Add a new role — enter the monthly salary cost. The EBITDA impact shows immediately.'},
      {key:'direct_opex', label:'Direct Overheads', addLabel:'+ Add Overhead',       hint:'Add any direct cost — Farmer Days, events, equipment, campaigns. Flows through to EBITDA and consolidated P&L.'},
    ]

    return (
      <div>
        {/* Unit tabs */}
        <div style={{display:'flex',gap:'0.45rem',marginBottom:'1.25rem',flexWrap:'wrap',alignItems:'center'}}>
          {activeUnits.map(u=>(
            <button key={u.id}
              style={{fontFamily:'monospace',fontSize:'0.72rem',padding:'0.48rem 0.9rem',border:`2px solid ${planUnit===u.id?u.color:C.border}`,borderRadius:4,background:planUnit===u.id?u.color:C.white,color:planUnit===u.id?C.white:C.navy,cursor:'pointer'}}
              onClick={()=>setPlanUnit(u.id)}>{u.short}</button>
          ))}
          <button style={{fontFamily:'monospace',fontSize:'0.72rem',padding:'0.48rem 0.9rem',border:`2px solid ${planUnit==='shared'?C.slate:C.border}`,borderRadius:4,background:planUnit==='shared'?C.slate:C.white,color:planUnit==='shared'?C.white:C.navy,cursor:'pointer'}} onClick={()=>setPlanUnit('shared')}>Shared / Central</button>
          <div style={{marginLeft:'auto',display:'flex',gap:'0.5rem',alignItems:'center'}}>
            <label style={{fontSize:'0.75rem',color:C.slate,display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
              <input type="checkbox" checked={showActualInPlan} onChange={e=>setShowActualInPlan(e.target.checked)}/>
              Show actuals in plan grid
            </label>
            {planLocked && <span style={{fontFamily:'monospace',fontSize:'0.68rem',color:C.teal,border:`1px solid ${C.teal}`,borderRadius:4,padding:'0.2rem 0.5rem'}}>🔒 Plan locked — read only</span>}
          </div>
        </div>

        {planLocked && (
          <div style={{background:'#E8F6F8',border:`1px solid ${C.teal}`,borderRadius:6,padding:'0.7rem 1rem',marginBottom:'1rem',fontSize:'0.82rem',color:C.teal}}>
            🔒 The season plan is locked. You can view all figures below but cannot change them. To make changes, unlock the plan from the Overview tab (CEO / Finance Manager only).
          </div>
        )}

        {isShared ? (
          // ── SHARED COST POOL ─────────────────────────────
          <div>
            <div style={card}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
                <div style={secH}>Shared / Central Cost Pool</div>
                <button style={addBtn()} onClick={addSharedLine}>+ Add Shared Cost</button>
              </div>
              <p style={{...hint,fontSize:'0.79rem',lineHeight:1.55,marginBottom:'0.85rem'}}>
                CEO, Finance Manager, Operations Manager, Business Development Manager salaries and all central overheads sit here.
                Allocated to units each month: {pct(inputs.global.sharedCostFixedPct)} by headcount, {pct(1-inputs.global.sharedCostFixedPct)} by revenue (hybrid method, advisory note).
                Season total: {fmt(inputs.sharedLines.reduce((s,l)=>s+l.monthlyPlan.reduce((a,b)=>a+b,0),0),cc)}.
              </p>
              {inputs.sharedLines.map(l=>(
                <LineEditor key={l.id} line={l} months={months} cc={cc} planLocked={planLocked} showActual={showActualInPlan}
                  onPlanChange={(m,v)=>setSharedPlanVal(l.id,m,v)}
                  onActualChange={()=>{}}
                  onRename={name=>renameShared(l.id,name)}
                  onRemove={()=>removeSharedLine(l.id)}
                />
              ))}
            </div>
          </div>
        ) : unitMeta && r ? (
          // ── UNIT PLANNING ─────────────────────────────────
          <div>
            {/* Live EBITDA impact strip */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:'0.75rem',marginBottom:'1.25rem'}}>
              {[
                {label:'Revenue',v:r.plan.rev.reduce((a,b)=>a+b,0),pos:true},
                {label:'Cost of Sales',v:-r.plan.cogs.reduce((a,b)=>a+b,0),pos:false},
                {label:'Gross Profit',v:r.plan.gp.reduce((a,b)=>a+b,0),pos:null},
                {label:'Staff Cost',v:-r.plan.staff.reduce((a,b)=>a+b,0),pos:false},
                {label:'Direct Overheads',v:-r.plan.opex.reduce((a,b)=>a+b,0),pos:false},
                {label:'Shared Allocated',v:-r.shared.reduce((a,b)=>a+b,0),pos:false},
                {label:'EBITDA',v:r.finalEbitda.reduce((a,b)=>a+b,0),pos:null},
              ].map(({label,v,pos})=>(
                <div key={label} style={{background:label==='EBITDA'?C.navy:C.white,border:`1px solid ${label==='EBITDA'?C.navy:C.border}`,borderRadius:6,padding:'0.65rem 0.75rem'}}>
                  <div style={{fontSize:'0.63rem',fontFamily:'monospace',color:label==='EBITDA'?C.cyan:C.slate,letterSpacing:'0.06em',marginBottom:'0.2rem'}}>{label.toUpperCase()}</div>
                  <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:label==='EBITDA'?(v>=0?C.cyan:C.red):(v<0?C.red:C.navy)}}>{fmt(v,cc)}</div>
                </div>
              ))}
            </div>
            <div style={{...card,background:'#F0F8FF',border:`1px solid ${C.cyan}`,padding:'0.8rem 1rem',marginBottom:'1rem',fontSize:'0.82rem',color:C.navy,lineHeight:1.6}}>
              <strong>Live planning sandbox for {unitMeta.name}.</strong> Change any figure and the EBITDA cards above update immediately. Add roles, overhead lines, or revenue lines using the buttons in each section. Every change flows through to the consolidated P&L on the Overview tab.
              {!planLocked && <span style={{color:C.teal,marginLeft:6}}>↑ Cards update as you type.</span>}
            </div>

            {cats.map(({key,label,addLabel,hint:h})=>{
              const lines = unitMeta.lines.filter(l=>l.category===key)
              const total = lines.reduce((s,l)=>s+l.monthlyPlan.reduce((a,b)=>a+b,0),0)
              return (
                <div key={key} style={card}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.35rem'}}>
                    <div style={secH}>{label}</div>
                    <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
                      <span style={{fontFamily:'monospace',fontSize:'0.72rem',color:C.slate}}>Season total: {fmt(key==='revenue'?total:-total,cc)}</span>
                      {!planLocked && <button style={addBtn()} onClick={()=>addLine(unitMeta.id,key)}>{addLabel}</button>}
                    </div>
                  </div>
                  {h && <p style={{...hint,fontSize:'0.78rem',lineHeight:1.5,marginBottom:'0.75rem'}}>{h}</p>}
                  {lines.length===0 && <p style={{color:C.slate,fontSize:'0.82rem'}}>No lines added yet. {!planLocked&&'Use the button above to add one.'}</p>}
                  {lines.map(l=>(
                    <LineEditor key={l.id} line={l} months={months} cc={cc} planLocked={planLocked} showActual={showActualInPlan}
                      onPlanChange={(m,v)=>setPlanVal(unitMeta.id,l.id,m,v)}
                      onActualChange={(m,v)=>setActualVal(unitMeta.id,l.id,m,v)}
                      onRename={name=>renameLine(unitMeta.id,l.id,name)}
                      onRemove={()=>removeLine(unitMeta.id,l.id)}
                    />
                  ))}
                </div>
              )
            })}

            {/* Shared cost allocation explanation */}
            <div style={{...card,background:'#F4F8FC'}}>
              <div style={secH}>Shared Cost Allocated to {unitMeta.name}</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(80px,1fr))',gap:'0.5rem',marginBottom:'0.75rem'}}>
                {months.map((m,i)=>(
                  <div key={i} style={{textAlign:'center',padding:'0.4rem',background:C.white,borderRadius:4,border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:'0.65rem',color:C.slate,fontFamily:'monospace'}}>{m}</div>
                    <div style={{fontFamily:'Georgia,serif',fontSize:'0.88rem',fontWeight:600}}>{fmt(r.shared[i],cc)}</div>
                  </div>
                ))}
              </div>
              <p style={{...hint,fontSize:'0.78rem',lineHeight:1.55}}>
                {unitMeta.headcount} staff out of {activeUnits.reduce((s,u)=>s+u.headcount,0)} total = {pct(unitMeta.headcount/Math.max(activeUnits.reduce((s,u)=>s+u.headcount,0),1))} of the fixed {pct(inputs.global.sharedCostFixedPct)} headcount share.
                The remaining {pct(1-inputs.global.sharedCostFixedPct)} follows revenue earned each month.
                This unit carries a fair share even in zero-revenue months because staff are still employed year-round.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  // ── APPROVALS TAB ─────────────────────────────────────────
  function ApprovalsTab() {
    const [note, setNote] = useState<Record<string,string>>({})
    const allReqs = [...inputs.spendingRequests].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))

    return (
      <div>
        {/* New request form */}
        <div style={card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
            <div style={secH}>Submit a Spending Request</div>
            <button style={addBtn()} onClick={()=>setSpendForm(s=>({...s,show:!s.show}))}>
              {spendForm.show?'Cancel':'+ New Request'}
            </button>
          </div>
          {spendForm.show && (
            <div style={{background:'#F4F8FC',borderRadius:6,padding:'1rem',border:`1px solid ${C.border}`}}>
              <p style={{...hint,fontSize:'0.8rem',marginBottom:'0.85rem',lineHeight:1.5}}>
                All spending requests require CEO approval before any cash is released. Once approved, the amount posts automatically to the relevant unit&apos;s costs and the cash flow statement.
              </p>
              <div style={fGrid}>
                <div>
                  <label style={lbl}>Requested by</label>
                  <select style={inp} value={spendForm.requester} onChange={e=>setSpendForm(s=>({...s,requester:e.target.value}))}>
                    <option>Finance Manager</option>
                    <option>Operations Manager</option>
                    <option>Business Development Manager</option>
                    <option>FGE Services Manager</option>
                    <option>Farm Manager</option>
                    <option>Advisory Team Lead</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Business Unit</label>
                  <select style={inp} value={spendForm.unitId} onChange={e=>setSpendForm(s=>({...s,unitId:e.target.value}))}>
                    {activeUnits.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                    <option value="shared">Shared / Central</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Cost Category</label>
                  <select style={inp} value={spendForm.category} onChange={e=>setSpendForm(s=>({...s,category:e.target.value as PlanLine['category']}))}>
                    <option value="cost_of_sales">Cost of Sales</option>
                    <option value="staff">Staff</option>
                    <option value="direct_opex">Direct Overhead</option>
                    <option value="shared">Shared / Central</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Month</label>
                  <select style={inp} value={spendForm.month} onChange={e=>setSpendForm(s=>({...s,month:Number(e.target.value)}))}>
                    {months.map((m,i)=><option key={i} value={i}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Amount ({cc})</label>
                  <input type="number" style={inp} value={spendForm.amount||''} onChange={e=>setSpendForm(s=>({...s,amount:Number(e.target.value)}))} placeholder="0"/>
                </div>
                <div style={{gridColumn:'1 / -1'}}>
                  <label style={lbl}>Description — what is this for?</label>
                  <input style={inp} value={spendForm.desc} onChange={e=>setSpendForm(s=>({...s,desc:e.target.value}))} placeholder="e.g. Purchase 500 crates for Tomato harvest Month 4"/>
                </div>
              </div>
              <button style={{...approveBtn,marginTop:'0.85rem',background:C.navy}} onClick={submitSpendRequest}>Submit Request for CEO Approval</button>
            </div>
          )}
        </div>

        {/* Pending requests */}
        {pending.length>0 && (
          <div style={card}>
            <div style={secH}>⏳ Pending CEO Approval ({pending.length})</div>
            {pending.map(r=>{
              const unitName = activeUnits.find(u=>u.id===r.unitId)?.name || r.unitId
              return (
                <div key={r.id} style={{border:`1px solid ${C.amber}`,borderRadius:6,padding:'0.85rem',marginBottom:'0.75rem',background:'#FFF8E8'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.5rem'}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:'0.9rem'}}>{r.description}</div>
                      <div style={{fontSize:'0.77rem',color:C.slate,marginTop:2}}>
                        Requested by <strong>{r.requestedBy}</strong> · {unitName} · {months[r.month]} · {r.category.replace('_',' ')}
                      </div>
                    </div>
                    <div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:C.amber,whiteSpace:'nowrap',marginLeft:'1rem'}}>{fmtFull(r.amount,cc)}</div>
                  </div>
                  <div style={{fontSize:'0.72rem',color:C.slate,marginBottom:'0.6rem'}}>
                    If approved: posts to {unitName} costs in {months[r.month]} and reduces cash by {fmtFull(r.amount,cc)} in the same month.
                  </div>
                  <input style={{...inp,marginBottom:'0.5rem',fontSize:'0.8rem'}} placeholder="CEO note (optional — required if declining)" value={note[r.id]||''} onChange={e=>setNote(n=>({...n,[r.id]:e.target.value}))}/>
                  <div style={{display:'flex',gap:'0.6rem'}}>
                    <button style={approveBtn} onClick={()=>resolveRequest(r.id,true,note[r.id]||'')}>✓ Approve — post to P&L & Cash</button>
                    <button style={declineBtn} onClick={()=>{if(!note[r.id]){alert('Please add a note explaining why this is declined.');return}resolveRequest(r.id,false,note[r.id])}}>✕ Decline</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Resolved requests */}
        {allReqs.filter(r=>r.status!=='pending').length>0 && (
          <div style={card}>
            <div style={secH}>Resolved Requests</div>
            {allReqs.filter(r=>r.status!=='pending').map(r=>{
              const unitName = activeUnits.find(u=>u.id===r.unitId)?.name || r.unitId
              const approved = r.status==='approved'
              return (
                <div key={r.id} style={{border:`1px solid ${approved?C.green:C.red}`,borderRadius:5,padding:'0.7rem',marginBottom:'0.5rem',background:approved?'#F0F9F4':'#FDF0EE'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                    <div>
                      <span style={{fontWeight:700,color:approved?C.green:C.red,marginRight:8}}>{approved?'✓ APPROVED':'✕ DECLINED'}</span>
                      <span style={{fontSize:'0.84rem'}}>{r.description}</span>
                      <div style={{fontSize:'0.72rem',color:C.slate,marginTop:2}}>{r.requestedBy} · {unitName} · {months[r.month]}</div>
                      {r.ceoNote && <div style={{fontSize:'0.74rem',color:C.slate,marginTop:4,fontStyle:'italic'}}>CEO note: {r.ceoNote}</div>}
                    </div>
                    <div style={{fontWeight:700,whiteSpace:'nowrap',marginLeft:'1rem',color:approved?C.green:C.red}}>{fmtFull(r.amount,cc)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {allReqs.length===0 && (
          <div style={{...card,textAlign:'center',color:C.slate,padding:'2.5rem'}}>
            No spending requests yet. Use the form above to submit a request for CEO approval.
          </div>
        )}
      </div>
    )
  }

  // ── CASH FLOW TAB ─────────────────────────────────────────
  function CashFlowTab() {
    return (
      <div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:'1rem',marginBottom:'1.25rem'}}>
          <KPI label="Opening Cash" value={fmt(cf.open[0],cc)}/>
          <KPI label="Month 6 Cash" value={fmt(cf.close[5],cc)} color={cf.close[5]>=0?C.navy:C.red}/>
          <KPI label="End of Season Cash" value={fmt(cf.close[11],cc)} color={cf.close[11]>=0?C.navy:C.red}/>
          <KPI label="Lowest Point" value={fmt(metrics.minCash,cc)} color={metrics.minCash>=0?C.navy:C.red} sub={`Month ${metrics.minCashMonth}`}/>
        </div>
        <PlanTable
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
          footnote="Approved spending requests appear on their own line and flow into the closing cash position. Irrigation kit costs reflect the FGE count in the active scenario."
        />
        <div style={card}>
          <div style={secH}>Cash Position — Month by Month</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={months.map((m,i)=>({month:m,Cash:Math.round(cf.close[i])}))} margin={{top:4,right:16,left:8,bottom:4}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="month" tick={{fontSize:11}}/>
              <YAxis tick={{fontSize:11}} tickFormatter={v=>fmt(v,'').trim()} width={70}/>
              <Tooltip formatter={(v:number)=>fmtFull(v,cc)}/>
              <ReferenceLine y={0} stroke={C.red} strokeWidth={2}/>
              <Bar dataKey="Cash" fill={C.cyan} radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  // ── SCENARIOS TAB ─────────────────────────────────────────
  function ScenariosTab() {
    const results = inputs.scenarios.map(sc=>({
      sc, m:runCONASModel({...inputs,global:{...inputs.global,activeScenarioId:sc.id}}).metrics
    }))
    return (
      <div>
        <div style={card}>
          <div style={secH}>Scenario Comparison — What If?</div>
          <p style={{...hint,fontSize:'0.8rem',lineHeight:1.55,marginBottom:'0.85rem'}}>
            Each scenario applies a revenue multiplier and cost multiplier to your current plan figures. Use this to explore best case, worst case, and growth options before committing to a plan.
          </p>
          <div style={{overflowX:'auto'}}>
            <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.78rem',fontFamily:'monospace'}}>
              <thead>
                <tr style={{background:'#F4F8FC'}}>
                  {['Scenario','FGEs','Rev ×','Cost ×','Revenue','EBITDA','Net Margin','Min Cash',''].map((h,i)=>(
                    <th key={i} style={{textAlign:i===0?'left':'right',padding:'0.35rem 0.6rem',borderBottom:`2px solid ${C.border}`,color:C.slate,fontWeight:600}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map(({sc,m})=>{
                  const active = sc.id===inputs.global.activeScenarioId
                  return (
                    <tr key={sc.id} style={{background:active?C.actualBg:'transparent'}}>
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
        <div style={card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
            <div style={secH}>Manage Scenarios</div>
            <button style={addBtn()} onClick={()=>upd(p=>({...p,scenarios:[...p.scenarios,{id:`sc_${Date.now()}`,label:'New Scenario',fgeCount:20,revMult:1,costMult:1}]}))}>+ Add Scenario</button>
          </div>
          {inputs.scenarios.map((sc,i)=>(
            <div key={sc.id} style={{display:'flex',gap:'0.6rem',alignItems:'center',marginBottom:'0.45rem',padding:'0.5rem',border:`1px solid ${C.border}`,borderRadius:5,background:sc.id===inputs.global.activeScenarioId?C.actualBg:C.white}}>
              <input style={{...inp,flex:2}} value={sc.label} onChange={e=>upd(p=>{const a=[...p.scenarios];a[i]={...a[i],label:e.target.value};return{...p,scenarios:a}})}/>
              <div><div style={hint}>FGEs</div><input type="number" style={{...inp,width:65}} value={sc.fgeCount} onChange={e=>upd(p=>{const a=[...p.scenarios];a[i]={...a[i],fgeCount:Number(e.target.value)};return{...p,scenarios:a}})}/></div>
              <div><div style={hint}>Rev ×</div><input type="number" step="0.05" style={{...inp,width:65}} value={sc.revMult} onChange={e=>upd(p=>{const a=[...p.scenarios];a[i]={...a[i],revMult:Number(e.target.value)};return{...p,scenarios:a}})}/></div>
              <div><div style={hint}>Cost ×</div><input type="number" step="0.05" style={{...inp,width:65}} value={sc.costMult} onChange={e=>upd(p=>{const a=[...p.scenarios];a[i]={...a[i],costMult:Number(e.target.value)};return{...p,scenarios:a}})}/></div>
              <button style={delBtn} onClick={()=>{if(window.confirm(`Remove ${sc.label}?`))upd(p=>({...p,scenarios:p.scenarios.filter((_,si)=>si!==i)}))}}>✕</button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── SETTINGS TAB ──────────────────────────────────────────
  function SettingsTab() {
    const cap = inputs.capitalStructure
    return (
      <div>
        <div style={card}>
          <div style={secH}>Global Settings</div>
          <div style={fGrid}>
            {[
              {f:'businessName',l:'Business Name',type:'text'},
              {f:'currency',l:'Currency Code (e.g. UGX, KES, GHS)',type:'text'},
              {f:'modelStartDate',l:'Season Start Date',type:'date'},
              {f:'openingCashBalance',l:`Opening Cash Balance (${cc})`,type:'number'},
              {f:'transferPriceMargin',l:'Internal Transfer Margin %',type:'pct'},
              {f:'sharedCostFixedPct',l:'Shared Cost Headcount Split %',type:'pct'},
              {f:'corporateTaxRate',l:'Corporate Tax Rate %',type:'pct'},
            ].map(({f,l,type})=>(
              <div key={f}>
                <label style={lbl}>{l}</label>
                {type==='pct' ? (
                  <input type="number" step="0.5" style={inp}
                    value={(((inputs.global as unknown) as Record<string,number>)[f]*100).toFixed(1)}
                    onChange={e=>setG(f,Number(e.target.value)/100)}/>
                ) : (
                  <input type={type==='number'?'number':'text'} style={inp}
                    value={(inputs.global as Record<string,string|number>)[f] as string}
                    onChange={e=>setG(f,type==='number'?Number(e.target.value):e.target.value)}/>
                )}
                {f==='currency' && <div style={hint}>Changing this updates all displayed figures immediately.</div>}
                {f==='sharedCostFixedPct' && <div style={hint}>Advisory note recommends 50%. Remainder allocated by revenue each month.</div>}
                {f==='transferPriceMargin' && <div style={hint}>Input Centres charge FGE and Farm at cost + this %. Advisory note: 5–6%.</div>}
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
            ].map(({f,l})=>(
              <div key={f}>
                <label style={lbl}>{l}</label>
                <input type="number" style={inp}
                  value={(cap as Record<string,number>)[f]}
                  onChange={e=>upd(p=>({...p,capitalStructure:{...p.capitalStructure,[f]:Number(e.target.value)}}))}/>
              </div>
            ))}
          </div>
          <div style={{marginTop:'1rem',padding:'0.75rem',background:'#F0F8FF',borderRadius:6,fontSize:'0.82rem',color:C.slate,lineHeight:1.55}}>
            Irrigation kits: <strong>{fmtFull(metrics.irrigationTotal,cc)}</strong> ({metrics.fgeCount} FGEs × UGX 8M). &nbsp;
            Capital raised: <strong>{fmtFull(cap.shareholderContribution+cap.grantNonRepayable+cap.grantRecoverable+cap.bankLoan,cc)}</strong>. &nbsp;
            Gap: <strong style={{color:metrics.irrigationTotal-cap.shareholderContribution-cap.grantNonRepayable-cap.grantRecoverable-cap.bankLoan>0?C.red:C.green}}>
              {fmtFull(metrics.irrigationTotal-cap.shareholderContribution-cap.grantNonRepayable-cap.grantRecoverable-cap.bankLoan,cc)}
            </strong>
          </div>
        </div>
        <div style={card}>
          <div style={secH}>Business Units</div>
          <p style={{...hint,fontSize:'0.79rem',lineHeight:1.5,marginBottom:'0.85rem'}}>Headcount drives the fixed share of the hybrid cost allocation. Each unit head is measured on their unit EBITDA.</p>
          {inputs.units.map((bu,i)=>(
            <div key={bu.id} style={{display:'flex',gap:'0.6rem',alignItems:'center',padding:'0.5rem 0.7rem',border:`1px solid ${C.border}`,borderRadius:5,marginBottom:'0.42rem',borderLeft:`4px solid ${bu.color}`}}>
              <input type="checkbox" checked={bu.active} onChange={e=>upd(p=>{const u=[...p.units];u[i]={...u[i],active:e.target.checked};return{...p,units:u}})}/>
              <input style={{...inp,flex:2,minWidth:160}} value={bu.name} onChange={e=>upd(p=>{const u=[...p.units];u[i]={...u[i],name:e.target.value};return{...p,units:u}})}/>
              <input style={{...inp,width:65}} value={bu.short} onChange={e=>upd(p=>{const u=[...p.units];u[i]={...u[i],short:e.target.value};return{...p,units:u}})}/>
              <div><div style={hint}>Staff</div><input type="number" style={{...inp,width:60}} value={bu.headcount} onChange={e=>upd(p=>{const u=[...p.units];u[i]={...u[i],headcount:Number(e.target.value)};return{...p,units:u}})}/></div>
              <input type="color" value={bu.color} onChange={e=>upd(p=>{const u=[...p.units];u[i]={...u[i],color:e.target.value};return{...p,units:u}})} style={{width:34,height:30,border:'none',cursor:'pointer',borderRadius:3}}/>
            </div>
          ))}
          <div style={hint}>Total headcount: {inputs.units.filter(u=>u.active).reduce((s,u)=>s+u.headcount,0)}.</div>
        </div>
      </div>
    )
  }

  // ── RENDER ────────────────────────────────────────────────
  const tabs:[string,string][] = [
    ['overview','Overview'],
    ['planning','Planning'],
    ['approvals',`Approvals${pending.length>0?` (${pending.length})`:''}`],
    ['cashflow','Cash Flow'],
    ['scenarios','Scenarios'],
    ['settings','Settings'],
  ]

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.cream,color:C.navy,minHeight:'100vh'}}>
      <header style={{background:C.navy,borderBottom:`3px solid ${C.cyan}`}}>
        <div style={{maxWidth:1440,margin:'0 auto',padding:'1.25rem 1.5rem',display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'1rem'}}>
          <div>
            <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.15em',color:C.cyan,marginBottom:'0.28rem'}}>CANVAS COACH — CLEARVIEW PLANNER</div>
            <h1 style={{fontFamily:'Georgia,serif',fontSize:'1.5rem',fontWeight:700,color:C.white,margin:'0.1rem 0 0.15rem'}}>{inputs.global.businessName}</h1>
            <div style={{fontSize:'0.76rem',color:'rgba(255,255,255,0.6)'}}>
              {metrics.scenarioLabel} · {metrics.fgeCount} FGEs · {inputs.global.currency} · Season starts {new Date(inputs.global.modelStartDate).toLocaleString('en-GB',{month:'long',year:'numeric'})}
              {planLocked && <span style={{marginLeft:8,color:C.teal}}>· 🔒 Plan locked</span>}
              {pending.length>0 && <span style={{marginLeft:8,color:C.amber}}>· ⏳ {pending.length} approval{pending.length>1?'s':''} pending</span>}
            </div>
          </div>
          <div style={{background:'rgba(0,180,216,0.12)',border:`1px solid rgba(0,180,216,0.3)`,borderRadius:8,padding:'0.72rem 1rem',minWidth:210}}>
            <div style={{fontFamily:'monospace',fontSize:'0.6rem',color:C.cyan,letterSpacing:'0.1em',marginBottom:'0.28rem'}}>ACTIVE SCENARIO</div>
            <select style={{width:'100%',background:'transparent',border:'none',color:C.white,fontSize:'0.85rem',fontWeight:700,cursor:'pointer',outline:'none'}}
              value={inputs.global.activeScenarioId} onChange={e=>setG('activeScenarioId',e.target.value)}>
              {inputs.scenarios.map(s=><option key={s.id} value={s.id} style={{background:C.navy}}>{s.label}</option>)}
            </select>
            <div style={{marginTop:'0.35rem',fontSize:'0.67rem',color:'rgba(255,255,255,0.5)'}}>
              Revenue: {fmt(metrics.totalRevenue,cc)} · EBITDA: {fmt(metrics.totalEBITDA,cc)}
            </div>
          </div>
        </div>
      </header>
      <nav style={{background:'#142038',borderBottom:`1px solid rgba(0,180,216,0.15)`,overflowX:'auto'}}>
        <div style={{maxWidth:1440,margin:'0 auto',padding:'0 1.5rem',display:'flex',gap:0,whiteSpace:'nowrap'}}>
          {tabs.map(([id,label])=>(
            <button key={id} style={navBtn(view===id)} onClick={()=>setView(id)}>{label}</button>
          ))}
        </div>
      </nav>
      <main style={{maxWidth:1440,margin:'0 auto',padding:'1.5rem'}}>
        {view==='overview'  && <OverviewTab/>}
        {view==='planning'  && <PlanningTab/>}
        {view==='approvals' && <ApprovalsTab/>}
        {view==='cashflow'  && <CashFlowTab/>}
        {view==='scenarios' && <ScenariosTab/>}
        {view==='settings'  && <SettingsTab/>}
      </main>
      <footer style={{textAlign:'center',padding:'1.5rem',fontFamily:'monospace',fontSize:'0.67rem',color:C.slate,borderTop:`1px solid ${C.border}`,marginTop:'2rem'}}>
        Canvas Coach · Clearview Planner · {inputs.global.businessName} · habibonifade.com
      </footer>
    </div>
  )
}
