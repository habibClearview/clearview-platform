// @ts-nocheck
'use client'
// ============================================================
// PROGRAMMES & DEALS + PER-ENGAGEMENT FEES
//
// The money view of docs/gtcv/README.md's "who pays vs who is served":
//   * Paying customer = the programme (deals to close)  -> deals pipeline
//   * Served = the engagement clients (LSPs/agribusinesses) -> per-engagement fees
//
// Writes to the columns added in
// supabase/migrations/2026_07_11_coach_payments_deals_fees.sql:
//   programmes.deal_stage / deal_value / deal_probability /
//     deal_currency / deal_expected_close
//   engagement_clients.engagement_fee / fee_currency / fee_status
//
// Additive & self-contained: mounted as a new "Programmes & Deals" tab.
// Existing Programmes/Client views are untouched.
// ============================================================
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { dealFunnel, clientCountForProgramme, programmeCanvasSpread, canvasProgress, revenueStreams } from '@/lib/coach-business-metrics'

const C = {
  navy:'var(--cv-navy)', cyan:'var(--cv-cyan)', cream:'var(--cv-cream)', white:'var(--cv-card)',
  slate:'var(--cv-slate)', border:'var(--cv-border)', teal:'var(--cv-teal)',
  red:'var(--cv-red)', green:'var(--cv-green)', amber:'var(--cv-amber)', purple:'var(--cv-purple)',
  lightBg:'var(--cv-alt)',
}
const card = {background:C.white,border:'1px solid var(--cv-border-soft)',borderRadius:14,padding:'1.35rem 1.5rem',marginBottom:'1.25rem',boxShadow:'0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)'}
const secH = {fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy,marginBottom:'0.75rem'}
const inp  = {width:'100%',padding:'0.42rem 0.6rem',border:`1px solid ${C.border}`,borderRadius:6,fontSize:'1.13rem',fontFamily:'inherit',background:'var(--cv-bg-2)',color:C.navy,boxSizing:'border-box'}
const lbl  = {display:'block',fontWeight:600,fontSize:'1.07rem',marginBottom:'0.2rem',color:C.navy}
const hint = {fontSize:'1.01rem',color:C.slate,lineHeight:1.4}
const fGrid= {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:'0.8rem'}
const th   = {padding:'0.4rem 0.6rem',textAlign:'left',fontWeight:600,color:C.navy,borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}
const td   = {padding:'0.4rem 0.6rem',verticalAlign:'top'}
function addBtn(sm=false,col=C.cyan){return{fontFamily:'monospace',fontSize:sm?'0.91rem':'0.95rem',padding:sm?'0.28rem 0.6rem':'0.38rem 0.8rem',border:`1px solid ${col}`,borderRadius:6,background:'transparent',color:col,cursor:'pointer'}}
function solidBtn(col=C.cyan,sm=false){return{fontFamily:'monospace',fontSize:sm?'0.95rem':'1.01rem',fontWeight:600,padding:sm?'0.35rem 0.8rem':'0.5rem 1.1rem',border:'none',borderRadius:6,background:col,color:'var(--cv-on-accent)',cursor:'pointer'}}
function subPill(active,col=C.cyan){return{fontFamily:'monospace',fontSize:'0.93rem',padding:'0.4rem 0.8rem',borderRadius:8,border:`1px solid ${active?col:C.border}`,background:active?col:C.white,color:active?'var(--cv-on-cyan)':C.slate,cursor:'pointer',fontWeight:active?700:400,whiteSpace:'nowrap'}}
function KPI({label,value,sub,color}){const accent=color||C.cyan;return(<div style={{background:C.white,borderRadius:14,padding:'0.95rem 1.1rem',borderTop:`3px solid ${accent}`,boxShadow:'0 1px 2px var(--cv-shadow-1), 0 12px 32px var(--cv-shadow-2)'}}><div style={{fontFamily:'monospace',fontSize:'1.13rem',letterSpacing:'0.1em',color:C.slate,textTransform:'uppercase',marginBottom:'0.35rem'}}>{label}</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.5rem',fontWeight:700,color:color||C.navy,lineHeight:1.05}}>{value}</div>{sub&&<div style={{fontSize:'1.07rem',color:C.slate,marginTop:'0.2rem'}}>{sub}</div>}</div>)}
function Badge({text,color}){return<span style={{fontFamily:'monospace',fontSize:'0.93rem',padding:'0.1rem 0.42rem',borderRadius:4,background:color||C.slate,color:'var(--cv-on-accent)',display:'inline-block'}}>{text}</span>}

const num=(v)=>{const n=Number(v);return Number.isFinite(n)?n:0}
const fmtMoney=(n,cur)=>`${cur||'USD'} ${num(n).toLocaleString(undefined,{maximumFractionDigits:0})}`
const CURRENCIES=['USD','GBP','EUR','UGX','NGN','KES']

// deal pipeline
const DEAL_STAGES=[
  {id:'conversation',label:'Conversation',color:C.slate},
  {id:'scoping',label:'Scoping',color:C.cyan},
  {id:'proposal',label:'Proposal',color:C.amber},
  {id:'won',label:'Won',color:C.green},
  {id:'lost',label:'Lost',color:C.red},
]
const stageMeta=(id)=>DEAL_STAGES.find(s=>s.id===id)||{id:id||'—',label:id||'No stage',color:C.slate}
const OPEN_STAGES=['conversation','scoping','proposal']

// fees
const FEE_STATUSES=[
  {id:'paid',label:'Paid',color:C.green},
  {id:'invoiced',label:'Invoiced',color:C.amber},
  {id:'unpaid',label:'Unpaid',color:C.red},
]
const feeMeta=(id)=>FEE_STATUSES.find(s=>s.id===id)||{id:id||'—',label:id||'Not set',color:C.slate}

export default function DealsAndFees({programmes=[],setProgrammes,clients=[],setClients}){
  const [view,setView]=useState('deals')
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.75rem',marginBottom:'1rem'}}>
        <div style={secH}>Programmes &amp; Deals</div>
        <div style={{display:'flex',gap:'0.4rem'}}>
          <button style={subPill(view==='deals')} onClick={()=>setView('deals')}>Deals pipeline (who pays)</button>
          <button style={subPill(view==='fees')} onClick={()=>setView('fees')}>Engagement fees (who is served)</button>
        </div>
      </div>
      {view==='deals'
        ? <DealsPipeline programmes={programmes} setProgrammes={setProgrammes} clients={clients}/>
        : <EngagementFees clients={clients} setClients={setClients} programmes={programmes}/>}
    </div>
  )
}

// ─── DEALS PIPELINE ──────────────────────────────────────────
const FUNNEL_STAGE_META={conversation:{label:'Conversation',color:C.slate},scoping:{label:'Scoping',color:C.cyan},proposal:{label:'Proposal in',color:C.amber},won:{label:'Won',color:C.green}}
function DealsPipeline({programmes,setProgrammes,clients}){
  const [editId,setEditId]=useState(null)
  const [form,setForm]=useState(null)
  const [msg,setMsg]=useState(null)
  // Real canvas progress for won-programme clients only -- "furthest/nearest
  // zone" needs it; nothing else here does, so this stays a small, scoped
  // fetch rather than loading every client's canvas up front.
  const [canvasByClient,setCanvasByClient]=useState({})
  useEffect(()=>{
    let cancelled=false
    const wonProgrammeIds=new Set(programmes.filter(p=>p.deal_stage==='won').map(p=>p.id))
    const clientIds=clients.filter(c=>wonProgrammeIds.has(c.programme_id)).map(c=>c.id)
    if(clientIds.length===0)return
    supabase.from('canvas_decision_points').select('client_id,dp_id,status').in('client_id',clientIds)
      .then(({data})=>{
        if(cancelled)return
        const grouped={}
        ;(data||[]).forEach(d=>{(grouped[d.client_id]=grouped[d.client_id]||[]).push(d)})
        setCanvasByClient(grouped)
      })
    return ()=>{cancelled=true}
  },[programmes,clients])

  const cur=programmes.find(p=>p.deal_currency)?.deal_currency||'USD'
  const openDeals=programmes.filter(p=>OPEN_STAGES.includes(p.deal_stage))
  const openValue=openDeals.reduce((s,p)=>s+num(p.deal_value),0)
  const weighted=openDeals.reduce((s,p)=>s+num(p.deal_value)*num(p.deal_probability)/100,0)
  const wonValue=programmes.filter(p=>p.deal_stage==='won').reduce((s,p)=>s+num(p.deal_value),0)
  const funnel=dealFunnel(programmes)
  const programmesById=Object.fromEntries(programmes.map(p=>[p.id,p]))
  const revStreams=revenueStreams(clients,programmesById)
  const independentStreams=revStreams.streams.filter(s=>s.key!=='programme_advisory')

  function startEdit(p){setForm({deal_stage:p.deal_stage||'conversation',deal_value:p.deal_value??'',deal_probability:p.deal_probability??'',deal_currency:p.deal_currency||'USD',deal_expected_close:p.deal_expected_close||''});setEditId(p.id)}
  async function save(id){
    const patch={
      deal_stage:form.deal_stage,
      deal_value:form.deal_value===''?null:num(form.deal_value),
      deal_probability:form.deal_probability===''?null:num(form.deal_probability),
      deal_currency:form.deal_currency,
      deal_expected_close:form.deal_expected_close||null,
    }
    const {error}=await supabase.from('programmes').update({...patch,updated_at:new Date().toISOString()}).eq('id',id)
    if(error)return setMsg('Could not save deal: '+error.message)
    setProgrammes&&setProgrammes(prev=>prev.map(p=>p.id!==id?p:{...p,...patch}))
    setEditId(null);setMsg(null)
  }

  return(
    <div>
      <p style={{...hint,marginBottom:'1rem'}}>The programme is the paying customer (the budget holder). Track each programme deal through the pipeline; weighted value = deal value × probability for open stages.</p>

      <div style={{fontFamily:'monospace',fontSize:'0.93rem',letterSpacing:'0.1em',textTransform:'uppercase',color:C.slate,marginBottom:'0.6rem'}}>Pipeline · programme contracts</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'0.6rem',marginBottom:'1.25rem'}}>
        {funnel.stages.map(s=>{
          const meta=FUNNEL_STAGE_META[s.stage]
          return(
            <div key={s.stage} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:'0.7rem 0.8rem',borderTop:`4px solid ${meta.color}`}}>
              <div style={{fontFamily:'monospace',fontSize:'0.81rem',letterSpacing:'0.05em',textTransform:'uppercase',color:C.slate}}>{meta.label}</div>
              <div style={{fontFamily:'Georgia,serif',fontSize:'1.4rem',fontWeight:700,margin:'0.15rem 0',color:C.navy}}>{s.count}</div>
              <div style={{fontFamily:'monospace',fontSize:'0.93rem',color:C.slate}}>{fmtMoney(s.value,s.currency)}</div>
            </div>
          )
        })}
        <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:'0.7rem 0.8rem',borderTop:`4px solid ${C.navy}`}}>
          <div style={{fontFamily:'monospace',fontSize:'0.81rem',letterSpacing:'0.05em',textTransform:'uppercase',color:C.slate}}>Conversion</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:'1.4rem',fontWeight:700,margin:'0.15rem 0',color:C.navy}}>{Math.round(funnel.conversionPct*100)}%</div>
          <div style={{fontFamily:'monospace',fontSize:'0.93rem',color:C.slate}}>won / closed</div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:'0.85rem',marginBottom:'1.25rem'}}>
        <KPI label="Open pipeline" value={fmtMoney(openValue,cur)} sub={`${openDeals.length} open deal${openDeals.length!==1?'s':''}`}/>
        <KPI label="Weighted" value={fmtMoney(weighted,cur)} sub="value × probability" color={C.teal}/>
        <KPI label="Won" value={fmtMoney(wonValue,cur)} sub={`${programmes.filter(p=>p.deal_stage==='won').length} won`} color={C.green}/>
        <KPI label="Programmes" value={programmes.length} sub="total tracked" color={C.purple}/>
      </div>

      {independentStreams.some(s=>s.value>0)&&(<>
        <div style={{fontFamily:'monospace',fontSize:'0.93rem',letterSpacing:'0.1em',textTransform:'uppercase',color:C.slate,marginBottom:'0.6rem'}}>Independent revenue <span style={{textTransform:'none',letterSpacing:0,fontWeight:400}}>· not programme deals -- self-paying clients, tracked here for the full revenue picture</span></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'0.85rem',marginBottom:'1.25rem'}}>
          {independentStreams.map(s=><KPI key={s.key} label={s.label} value={fmtMoney(s.value,cur)} sub={s.description} color={s.key==='clearview_subscriptions'?C.teal:C.purple}/>)}
        </div>
      </>)}

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'0.85rem',marginBottom:'1.25rem'}}>
        {DEAL_STAGES.map(stage=>{
          const inStage=programmes.filter(p=>(p.deal_stage||'conversation')===stage.id)
          const stageValue=inStage.reduce((s,p)=>s+num(p.deal_value),0)
          return(
            <div key={stage.id} style={{background:C.lightBg,borderRadius:12,padding:'0.75rem',borderTop:`3px solid ${stage.color}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'0.5rem'}}>
                <span style={{fontWeight:700,fontSize:'1.07rem',color:stage.color}}>{stage.label}</span>
                <span style={{fontSize:'0.93rem',color:C.slate}}>{inStage.length} · {fmtMoney(stageValue,cur)}</span>
              </div>
              {inStage.length===0&&<div style={{...hint,padding:'0.5rem 0'}}>—</div>}
              {inStage.map(p=>{
                const lsps=clientCountForProgramme(p.id,clients)
                const spread=p.deal_stage==='won'?programmeCanvasSpread(clients.filter(c=>c.programme_id===p.id).map(c=>canvasProgress(canvasByClient[c.id]||[]))):null
                return(
                <div key={p.id} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'0.6rem 0.7rem',marginBottom:'0.5rem',cursor:'pointer'}} onClick={()=>startEdit(p)}>
                  <div style={{fontWeight:600,fontSize:'1.07rem',color:C.navy}}>{p.name}</div>
                  <div style={{fontSize:'0.93rem',color:C.slate,marginTop:'0.15rem'}}>{p.funder||'—'}{lsps>0&&` · ${lsps} LSP${lsps===1?'':'s'}`}</div>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:'0.35rem',fontSize:'1.01rem'}}>
                    <span style={{fontWeight:600,color:C.navy}}>{p.deal_value?fmtMoney(p.deal_value,p.deal_currency||cur):'—'}</span>
                    {p.deal_probability!=null&&p.deal_probability!==''&&<span style={{color:C.slate}}>{num(p.deal_probability)}%</span>}
                  </div>
                  {p.deal_expected_close&&<div style={{fontSize:'0.93rem',color:C.slate,marginTop:'0.2rem'}}>close {p.deal_expected_close}</div>}
                  {spread&&<div style={{fontSize:'0.93rem',color:C.teal,marginTop:'0.2rem'}}>Furthest {spread.furthestLabel} · Nearest {spread.nearestLabel}</div>}
                </div>
              )})}
            </div>
          )
        })}
      </div>

      {msg&&<div style={{fontSize:'1.01rem',color:C.red,marginBottom:'0.6rem'}}>{msg}</div>}

      {editId&&form&&(()=>{const p=programmes.find(x=>x.id===editId);return(
        <div style={{...card,border:`1px solid ${C.cyan}`}}>
          <div style={{...secH,marginBottom:'0.85rem'}}>Deal — {p?.name}</div>
          <div style={fGrid}>
            <div><label style={lbl}>Stage</label><select style={inp} value={form.deal_stage} onChange={e=>setForm(f=>({...f,deal_stage:e.target.value}))}>{DEAL_STAGES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
            <div><label style={lbl}>Deal value</label><input type="number" style={inp} value={form.deal_value} onChange={e=>setForm(f=>({...f,deal_value:e.target.value}))}/></div>
            <div><label style={lbl}>Currency</label><select style={inp} value={form.deal_currency} onChange={e=>setForm(f=>({...f,deal_currency:e.target.value}))}>{CURRENCIES.map(x=><option key={x}>{x}</option>)}</select></div>
            <div><label style={lbl}>Probability %</label><input type="number" min="0" max="100" style={inp} value={form.deal_probability} onChange={e=>setForm(f=>({...f,deal_probability:e.target.value}))}/></div>
            <div><label style={lbl}>Expected close</label><input type="date" style={inp} value={form.deal_expected_close} onChange={e=>setForm(f=>({...f,deal_expected_close:e.target.value}))}/></div>
          </div>
          <div style={{display:'flex',gap:'0.6rem',marginTop:'0.85rem'}}>
            <button style={solidBtn()} onClick={()=>save(editId)}>Save deal</button>
            <button style={addBtn(true,C.slate)} onClick={()=>{setEditId(null);setMsg(null)}}>Cancel</button>
          </div>
        </div>
      )})()}
    </div>
  )
}

// ─── PER-ENGAGEMENT FEES ─────────────────────────────────────
function EngagementFees({clients,setClients,programmes}){
  const [editId,setEditId]=useState(null)
  const [form,setForm]=useState(null)
  const [msg,setMsg]=useState(null)
  const progName=(id)=>programmes.find(p=>p.id===id)?.name||'—'

  const cur=clients.find(c=>c.fee_currency)?.fee_currency||'USD'
  const totalFee=clients.reduce((s,c)=>s+num(c.engagement_fee),0)
  const byStatus=(st)=>clients.filter(c=>c.fee_status===st).reduce((s,c)=>s+num(c.engagement_fee),0)

  function startEdit(c){setForm({engagement_fee:c.engagement_fee??'',fee_currency:c.fee_currency||'USD',fee_status:c.fee_status||'unpaid'});setEditId(c.id)}
  async function save(id){
    const existing=clients.find(c=>c.id===id)
    const today=new Date().toISOString().slice(0,10)
    const patch={
      engagement_fee:form.engagement_fee===''?null:num(form.engagement_fee),
      fee_currency:form.fee_currency,
      fee_status:form.fee_status,
      // Stamp the date the FIRST time a fee reaches invoiced/paid, so "My
      // Business at a glance" (fees received this year, avg days to
      // collect) can be computed honestly. A later status/amount edit never
      // overwrites an already-recorded date.
      ...(form.fee_status==='invoiced'&&!existing?.fee_invoiced_at?{fee_invoiced_at:today}:{}),
      ...(form.fee_status==='paid'&&!existing?.fee_paid_at?{fee_paid_at:today}:{}),
    }
    const {error}=await supabase.from('engagement_clients').update({...patch,updated_at:new Date().toISOString()}).eq('id',id)
    if(error)return setMsg('Could not save fee: '+error.message)
    setClients&&setClients(prev=>prev.map(c=>c.id!==id?c:{...c,...patch}))
    setEditId(null);setMsg(null)
  }

  return(
    <div>
      <p style={{...hint,marginBottom:'1rem'}}>The engagement clients (LSPs / agribusinesses) are who is served. Track the fee agreed per engagement and whether it is paid, invoiced, or still unpaid.</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'0.85rem',marginBottom:'1.25rem'}}>
        <KPI label="Total fees" value={fmtMoney(totalFee,cur)} sub={`${clients.length} engagements`}/>
        <KPI label="Paid" value={fmtMoney(byStatus('paid'),cur)} color={C.green}/>
        <KPI label="Invoiced" value={fmtMoney(byStatus('invoiced'),cur)} color={C.amber}/>
        <KPI label="Unpaid" value={fmtMoney(byStatus('unpaid'),cur)} color={C.red}/>
      </div>

      {msg&&<div style={{fontSize:'1.01rem',color:C.red,marginBottom:'0.6rem'}}>{msg}</div>}

      <div style={card}>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'1.01rem'}}>
            <thead><tr style={{background:C.lightBg}}>{['Engagement','Programme','Fee','Status',''].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {clients.length===0&&<tr><td style={{...td,color:C.slate}} colSpan={5}>No engagements yet.</td></tr>}
              {clients.map((c,i)=>{
                const isEdit=editId===c.id
                return(<tr key={c.id} style={{background:i%2?C.white:C.cream}}>
                  <td style={{...td,fontWeight:600,color:C.navy}}>{c.name}</td>
                  <td style={td}>{progName(c.programme_id)}</td>
                  {isEdit?(
                    <>
                      <td style={td}><div style={{display:'flex',gap:'0.3rem'}}><input type="number" style={{...inp,width:100,padding:'0.25rem 0.4rem'}} value={form.engagement_fee} onChange={e=>setForm(f=>({...f,engagement_fee:e.target.value}))}/><select style={{...inp,width:75,padding:'0.25rem 0.3rem'}} value={form.fee_currency} onChange={e=>setForm(f=>({...f,fee_currency:e.target.value}))}>{CURRENCIES.map(x=><option key={x}>{x}</option>)}</select></div></td>
                      <td style={td}><select style={{...inp,width:110,padding:'0.25rem 0.4rem'}} value={form.fee_status} onChange={e=>setForm(f=>({...f,fee_status:e.target.value}))}>{FEE_STATUSES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></td>
                      <td style={td}><button style={solidBtn(C.cyan,true)} onClick={()=>save(c.id)}>Save</button> <button style={addBtn(true,C.slate)} onClick={()=>{setEditId(null);setMsg(null)}}>Cancel</button></td>
                    </>
                  ):(
                    <>
                      <td style={td}>{c.engagement_fee?fmtMoney(c.engagement_fee,c.fee_currency||cur):'—'}</td>
                      <td style={td}>{c.fee_status?<Badge text={feeMeta(c.fee_status).label} color={feeMeta(c.fee_status).color}/>:<span style={hint}>not set</span>}</td>
                      <td style={td}><button style={addBtn(true)} onClick={()=>startEdit(c)}>Edit</button></td>
                    </>
                  )}
                </tr>)
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
