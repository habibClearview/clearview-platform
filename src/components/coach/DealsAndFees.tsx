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
import { clientCountForProgramme, programmeCanvasSpread, canvasProgress } from '@/lib/coach-business-metrics'

const C = {
  navy:'var(--cv-navy)', cyan:'var(--cv-cyan)', cream:'var(--cv-cream)', white:'var(--cv-card)',
  slate:'var(--cv-slate)', border:'var(--cv-border)', teal:'var(--cv-teal)',
  red:'var(--cv-red)', green:'var(--cv-green)', amber:'var(--cv-amber)', purple:'var(--cv-purple)',
  lightBg:'var(--cv-alt)',
}
const card = {background:C.white,border:'1px solid var(--cv-border-soft)',borderRadius:14,padding:'1.35rem 1.5rem',marginBottom:'1.25rem',boxShadow:'0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)'}
const secH = {fontFamily:'Georgia,serif',fontSize:'1.32rem',fontWeight:700,color:C.navy,marginBottom:'0.75rem'}
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
// Real order: you hear about the opportunity and send a proposal, maybe get
// called in for an interview/discussion, then negotiate terms, then it's
// won or lost. Underlying ids (conversation/scoping/proposal) are just
// historical field names from an earlier labelling pass -- not renamed
// here to avoid a data migration; only the display order/labels changed.
const DEAL_STAGES=[
  {id:'conversation',label:'Proposal Sent',color:C.slate},
  {id:'scoping',label:'Interview Stage',color:C.cyan},
  {id:'proposal',label:'Negotiation',color:C.amber},
  {id:'won',label:'Won',color:C.green},
  {id:'lost',label:'Lost',color:C.red},
]
const stageMeta=(id)=>DEAL_STAGES.find(s=>s.id===id)||{id:id||'—',label:id||'No stage',color:C.slate}

// fees
const FEE_STATUSES=[
  {id:'paid',label:'Paid',color:C.green},
  {id:'invoiced',label:'Invoiced',color:C.amber},
  {id:'unpaid',label:'Unpaid',color:C.red},
]
const feeMeta=(id)=>FEE_STATUSES.find(s=>s.id===id)||{id:id||'—',label:id||'Not set',color:C.slate}

// Single view, no nested sub-tabs -- the Pipeline main-nav tab renders
// straight into this. ("Engagement fees" and the old programme directory
// view are no longer reachable from here -- see EngagementFees/ProgrammesView
// in this file / CoachDashboard.tsx, both still defined, just not wired
// into this tab any more.)
export default function DealsAndFees({programmes=[],setProgrammes,clients=[],setClients,onWinDeal}){
  return <DealsPipeline programmes={programmes} setProgrammes={setProgrammes} clients={clients} onWinDeal={onWinDeal}/>
}

// New programme, reachable directly from the deals pipeline -- previously
// only creatable from the separate Programmes tab, so a coach opening
// Programmes & Deals to start tracking a fresh deal had nowhere to add it.
function NewProgrammeForm({onSave,onCancel}){
  const [f,setF]=useState({name:'',type:'donor_programme',funder:'',country:'Uganda',start_date:'',end_date:'',notes:'',client_ids:[],co_implementer_ids:[],funder_email:'',funder_invited:false})
  return(
    <div style={{...card,border:`1px solid ${C.cyan}`,marginBottom:'1.25rem'}}>
      <div style={secH}>New Programme</div>
      <div style={fGrid}>
        <div><label style={lbl}>Name *</label><input style={inp} value={f.name} onChange={e=>setF(x=>({...x,name:e.target.value}))}/></div>
        <div><label style={lbl}>Type</label><select style={inp} value={f.type} onChange={e=>setF(x=>({...x,type:e.target.value}))}><option value="donor_programme">Donor Programme</option><option value="direct_client">Direct Client</option><option value="blended">Blended</option></select></div>
        <div><label style={lbl}>Funder *</label><input style={inp} value={f.funder} onChange={e=>setF(x=>({...x,funder:e.target.value}))}/></div>
        <div><label style={lbl}>Country</label><input style={inp} value={f.country} onChange={e=>setF(x=>({...x,country:e.target.value}))}/></div>
        <div><label style={lbl}>Start Date</label><input type="date" style={inp} value={f.start_date} onChange={e=>setF(x=>({...x,start_date:e.target.value}))}/></div>
        <div><label style={lbl}>End Date</label><input type="date" style={inp} value={f.end_date} onChange={e=>setF(x=>({...x,end_date:e.target.value}))}/></div>
      </div>
      <div style={{display:'flex',gap:'0.6rem',marginTop:'0.85rem'}}>
        <button style={solidBtn()} onClick={()=>{if(!f.name||!f.funder)return;onSave({...f,id:`prog_${Date.now()}`})}}>Create Programme</button>
        <button style={{...addBtn(),borderColor:C.border,color:C.slate}} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ─── DEALS PIPELINE ──────────────────────────────────────────
const DEAL_SERVICE_OPTIONS=[
  {key:'advisory',label:'Advisory'},
  {key:'canvas',label:'GtCV Canvas'},
  {key:'financial',label:'Financial Model'},
  {key:'portfolio_intelligence',label:'Subscription'},
]
function DealsPipeline({programmes,setProgrammes,clients,onWinDeal}){
  const [msg,setMsg]=useState(null)
  const [showNew,setShowNew]=useState(false)
  async function createProgramme(p){
    const {data,error}=await supabase.from('programmes').insert([p]).select().single()
    if(error)return setMsg('Could not create programme: '+error.message)
    setProgrammes&&setProgrammes(prev=>[...prev,data])
    setShowNew(false)
  }
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

  // Every field editable directly on its own block -- no click-to-open a
  // separate form. Updates local state immediately (so the input never
  // feels laggy) and persists the same patch to Supabase right away.
  async function updateDeal(id,patch){
    setProgrammes&&setProgrammes(prev=>prev.map(p=>p.id!==id?p:{...p,...patch}))
    const {error}=await supabase.from('programmes').update({...patch,updated_at:new Date().toISOString()}).eq('id',id)
    if(error)setMsg('Could not save: '+error.message)
  }

  return(
    <div>
      <div style={{background:C.navy,color:'var(--cv-on-accent)',borderRadius:'10px 10px 0 0',padding:'0.95rem 1.4rem',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.6rem'}}>
        <div style={{fontFamily:'Georgia,serif',fontWeight:700,fontSize:'1.05rem'}}>Pipeline</div>
        <button onClick={()=>setShowNew(!showNew)} style={{fontFamily:'monospace',fontSize:'0.85rem',fontWeight:700,background:'var(--cv-cyan)',border:'none',color:'var(--cv-on-accent)',borderRadius:6,padding:'0.4rem 0.9rem',cursor:'pointer'}}>+ New Prospect</button>
      </div>
      <div style={{border:'1px solid var(--cv-border-soft)',borderTop:'none',borderRadius:'0 0 10px 10px',padding:'1.2rem',background:C.white}}>
      {showNew&&<NewProgrammeForm onSave={createProgramme} onCancel={()=>setShowNew(false)}/>}
      {msg&&<div style={{fontSize:'1.01rem',color:C.red,marginBottom:'0.6rem'}}>{msg}</div>}

      {programmes.length===0
        ? <div style={{...hint,padding:'0.5rem 0'}}>No prospects yet.</div>
        : programmes.map(p=>{
          const meta=stageMeta(p.deal_stage)
          const lsps=clientCountForProgramme(p.id,clients)
          const spread=p.deal_stage==='won'?programmeCanvasSpread(clients.filter(c=>c.programme_id===p.id).map(c=>canvasProgress(canvasByClient[c.id]||[]))):null
          const services=p.deal_services||[]
          function toggleService(key){
            const next=services.includes(key)?services.filter(s=>s!==key):[...services,key]
            updateDeal(p.id,{deal_services:next})
          }
          function changeStage(newStage){
            const wasWon=p.deal_stage==='won'
            updateDeal(p.id,{deal_stage:newStage})
            if(newStage==='won'&&!wasWon)onWinDeal&&onWinDeal(p)
          }
          return(
            <div key={p.id} style={{...card,borderLeft:`4px solid ${meta.color}`,marginBottom:'0.75rem'}}>
              <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:'0.75rem',alignItems:'flex-start'}}>
                <div>
                  <div style={{fontWeight:700,fontSize:'1.11rem',color:C.navy}}>{p.name}</div>
                  <div style={{fontSize:'0.93rem',color:C.slate,marginTop:'0.15rem'}}>{p.funder||'—'}{lsps>0&&` · ${lsps} beneficiar${lsps===1?'y':'ies'}`}</div>
                  {spread&&<div style={{fontSize:'0.93rem',color:C.teal,marginTop:'0.15rem'}}>Furthest {spread.furthestLabel} · Nearest {spread.nearestLabel}</div>}
                  <div style={{display:'flex',gap:'0.35rem',flexWrap:'wrap',marginTop:'0.5rem'}}>
                    {DEAL_SERVICE_OPTIONS.map(opt=>{
                      const active=services.includes(opt.key)
                      return(
                        <button key={opt.key} onClick={()=>toggleService(opt.key)} style={{fontFamily:'monospace',fontSize:'0.78rem',border:`1px solid ${active?C.teal:C.border}`,background:active?C.teal:'transparent',color:active?'var(--cv-on-accent)':C.slate,borderRadius:999,padding:'0.15rem 0.6rem',cursor:'pointer'}}>{opt.label}</button>
                      )
                    })}
                  </div>
                </div>
                <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap',alignItems:'center'}}>
                  <div>
                    <label style={{...lbl,marginBottom:'0.15rem'}}>Stage</label>
                    <select style={{...inp,width:'auto',padding:'0.3rem 0.5rem'}} value={p.deal_stage||'conversation'} onChange={e=>changeStage(e.target.value)}>{DEAL_STAGES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select>
                  </div>
                  <div>
                    <label style={{...lbl,marginBottom:'0.15rem'}}>Value</label>
                    <div style={{display:'flex',gap:'0.25rem'}}>
                      <input type="number" placeholder="0" style={{...inp,width:100,padding:'0.3rem 0.5rem'}} value={p.deal_value??''} onChange={e=>updateDeal(p.id,{deal_value:e.target.value===''?null:num(e.target.value)})}/>
                      <select style={{...inp,width:75,padding:'0.3rem 0.3rem'}} value={p.deal_currency||cur} onChange={e=>updateDeal(p.id,{deal_currency:e.target.value})}>{CURRENCIES.map(x=><option key={x}>{x}</option>)}</select>
                    </div>
                  </div>
                  <div>
                    <label style={{...lbl,marginBottom:'0.15rem'}}>Probability %</label>
                    <input type="number" min="0" max="100" placeholder="stage default" style={{...inp,width:100,padding:'0.3rem 0.5rem'}} value={p.deal_probability??''} onChange={e=>updateDeal(p.id,{deal_probability:e.target.value===''?null:num(e.target.value)})}/>
                  </div>
                  <div>
                    <label style={{...lbl,marginBottom:'0.15rem'}}>Expected close</label>
                    <input type="date" style={{...inp,width:'auto',padding:'0.3rem 0.5rem'}} value={p.deal_expected_close||''} onChange={e=>updateDeal(p.id,{deal_expected_close:e.target.value||null})}/>
                  </div>
                </div>
              </div>
              <div style={{marginTop:'0.6rem'}}>
                <input placeholder="Next step / note..." style={{...inp,fontSize:'0.95rem',padding:'0.35rem 0.55rem',border:`1px dashed ${C.border}`}} value={p.deal_notes||''} onChange={e=>updateDeal(p.id,{deal_notes:e.target.value})}/>
              </div>
              {p.deal_stage==='won'&&(
                <div style={{marginTop:'0.6rem',display:'flex',alignItems:'center',gap:'0.6rem',background:'var(--cv-tint-green)',border:`1px solid ${C.green}`,borderRadius:8,padding:'0.5rem 0.7rem'}}>
                  <span style={{fontSize:'0.9rem',color:C.green,fontWeight:600}}>✓ Won</span>
                  <button style={{...solidBtn(C.green,true),marginLeft:'auto'}} onClick={()=>onWinDeal&&onWinDeal(p)}>+ Add beneficiary client →</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
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
      <p style={{...hint,marginBottom:'1rem'}}>The engagement clients (LSPs / agribusinesses) are who is served. Track the fee agreed per engagement and whether it is paid, invoiced, or still unpaid. <strong>Where a Programme is set</strong>, the organisation itself is a served beneficiary, not the payer -- the programme is the paying client, and any fee entered here is the programme's own budget allocation for that engagement, not something the beneficiary owes.</p>
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
                  <td style={td}>{c.programme_id?(<>{progName(c.programme_id)} <Badge text="Beneficiary" color={C.purple}/></>):(<Badge text="Paying client" color={C.teal}/>)}</td>
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
