'use client'
import { useState, useMemo, useCallback } from 'react'
import {
  defaultCoachState, statusLabel, statusColor,
  CLIENT_TYPE_LABELS, CLIENT_TYPE_COLORS, buildEmptyCanvas,
  type CoachState, type EngagementClient, type Programme,
  type ClientType, type DPStatus, type EngagementStatus,
  type DecisionPoint, type DecisionComponent, type CoImplementer,
  type TimesheetEntry,
} from '@/lib/coach-types'
import { supabase } from '@/lib/supabase'

// ── Design tokens ────────────────────────────────────────────
const C = {
  navy:'#1B2A4A', cyan:'#00B4D8', cream:'#F8F4EE', white:'#FFFFFF',
  slate:'#4A5A6A', border:'#D8E0E8', teal:'#1A9DAA',
  red:'#C0392B', green:'#1A7A4A', amber:'#B8860B', purple:'#6B4A8B',
}
const card: React.CSSProperties = {background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}
const secH: React.CSSProperties = {fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy,marginBottom:'0.75rem'}
const inp:  React.CSSProperties = {width:'100%',padding:'0.42rem 0.6rem',border:`1px solid ${C.border}`,borderRadius:4,fontSize:'0.83rem',fontFamily:'inherit',background:'#F4F8FC',color:C.navy,boxSizing:'border-box'}
const lbl:  React.CSSProperties = {display:'block',fontWeight:600,fontSize:'0.8rem',marginBottom:'0.22rem',color:C.navy}
const hint: React.CSSProperties = {fontSize:'0.7rem',color:C.slate,lineHeight:1.4}
const fGrid:React.CSSProperties = {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:'1rem'}
const kpiGrid:React.CSSProperties = {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(165px,1fr))',gap:'1rem',marginBottom:'1.5rem'}

function navBtn(active:boolean):React.CSSProperties {
  return {fontFamily:'monospace',fontSize:'0.72rem',padding:'0.72rem 1rem',border:'none',background:'transparent',
    color:active?C.cyan:'rgba(255,255,255,0.6)',cursor:'pointer',
    borderBottom:active?`3px solid ${C.cyan}`:'3px solid transparent',
    fontWeight:active?700:400,whiteSpace:'nowrap'}
}
function addBtn(sm=false,col=C.cyan):React.CSSProperties {
  return {fontFamily:'monospace',fontSize:sm?'0.68rem':'0.72rem',padding:sm?'0.28rem 0.6rem':'0.38rem 0.8rem',
    border:`1px solid ${col}`,borderRadius:4,background:'transparent',color:col,cursor:'pointer'}
}
function solidBtn(col=C.cyan,sm=false):React.CSSProperties {
  return {fontFamily:'monospace',fontSize:sm?'0.72rem':'0.78rem',fontWeight:600,
    padding:sm?'0.35rem 0.8rem':'0.5rem 1.1rem',border:'none',borderRadius:4,
    background:col,color:col===C.white?C.navy:C.white,cursor:'pointer'}
}

function KPI({label,value,sub,color}:{label:string;value:string;sub?:string;color?:string}) {
  return (
    <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1rem 1.1rem'}}>
      <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.1em',color:C.slate,textTransform:'uppercase',marginBottom:'0.28rem'}}>{label}</div>
      <div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:color||C.navy}}>{value}</div>
      {sub&&<div style={{fontSize:'0.7rem',color:C.slate,marginTop:'0.18rem'}}>{sub}</div>}
    </div>
  )
}

function DPDot({status}:{status?:DPStatus}) {
  const col = status==='✓'?C.green:status==='◐'?C.cyan:status==='⚠'?C.amber:C.border
  return <span title={status||'○'} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:18,height:18,borderRadius:'50%',background:col,color:C.white,fontSize:'0.6rem',fontWeight:700,flexShrink:0}}>{status||'○'}</span>
}

function ClientCard({client,programmes,onClick}:{client:EngagementClient;programmes:Programme[];onClick:()=>void}) {
  const prog = programmes.find(p=>p.id===client.programmeId)
  const dpIds = ['phase_0','dp01','dp02','dp03','dp04','dp05','dp06','dp07','dp08','dp09']
  const dpMap = Object.fromEntries((client.canvas||[]).map(dp=>[dp.id,dp.status]))
  return (
    <div style={{background:C.white,border:`1px solid ${C.border}`,borderTop:`4px solid ${CLIENT_TYPE_COLORS[client.type]}`,borderRadius:8,padding:'1rem 1.1rem',cursor:'pointer'}} onClick={onClick}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.35rem'}}>
        <div style={{fontWeight:700,fontSize:'0.88rem',color:C.navy,lineHeight:1.3}}>{client.name}</div>
        <div style={{display:'flex',gap:'0.3rem',flexShrink:0,marginLeft:'0.5rem'}}>
          {client.clearviewActive&&<span style={{fontFamily:'monospace',fontSize:'0.58rem',color:C.teal,border:`1px solid ${C.teal}`,borderRadius:3,padding:'0.05rem 0.3rem'}}>CRV</span>}
          {client.engagementMode==='canvas'&&<span style={{fontFamily:'monospace',fontSize:'0.58rem',color:C.purple||C.amber,border:`1px solid ${C.purple||C.amber}`,borderRadius:3,padding:'0.05rem 0.3rem'}}>GtCV</span>}
        </div>
      </div>
      <div style={{fontSize:'0.7rem',color:C.slate,marginBottom:'0.35rem'}}>{CLIENT_TYPE_LABELS[client.type]} · {prog?.name||'—'}</div>
      {client.contactName&&<div style={{fontSize:'0.72rem',color:C.navy,marginBottom:'0.3rem'}}>{client.contactName}</div>}
      <span style={{fontFamily:'monospace',fontSize:'0.63rem',padding:'0.1rem 0.42rem',borderRadius:4,background:statusColor(client.status),color:C.white,display:'inline-block',marginBottom:'0.55rem'}}>{statusLabel(client.status)}</span>
      {client.engagementMode==='canvas'&&(
        <div style={{display:'flex',gap:'0.18rem',flexWrap:'wrap'}}>
          {dpIds.map(id=><DPDot key={id} status={dpMap[id]}/>)}
        </div>
      )}
    </div>
  )
}

// ── MAIN COMPONENT ───────────────────────────────────────────
export default function CoachDashboard({onSignOut}:{onSignOut:()=>void}) {
  const [state, setState] = useState<CoachState>(()=>{
    try { const s=localStorage.getItem('coach-v2'); if(s) return JSON.parse(s) as CoachState } catch {}
    return defaultCoachState()
  })
  const [view, setView] = useState('overview')
  const [selClient, setSelClient] = useState<string|null>(null)
  const [selProg, setSelProg]     = useState<string|null>(null)
  const [clientTab, setClientTab] = useState('engagement')
  const [inviteMsg, setInviteMsg] = useState('')

  function save(next:CoachState) {
    setState(next)
    try { localStorage.setItem('coach-v2',JSON.stringify(next)) } catch {}
  }
  function updClient(id:string, updates:Partial<EngagementClient>) {
    save({...state, clients:state.clients.map(c=>c.id!==id?c:{...c,...updates})})
  }

  const allClients   = state.clients
  const activeC      = allClients.filter(c=>c.status!=='complete'&&c.status!=='paused')
  const clearviewLive= allClients.filter(c=>c.clearviewActive)
  const canvasC      = allClients.filter(c=>c.engagementMode==='canvas')
  const pending      = state.timesheets.filter(t=>t.status==='submitted').length

  // ── OVERVIEW ─────────────────────────────────────────────
  function OverviewTab() {
    return (
      <div>
        {pending>0&&(
          <div style={{background:'#FFF8E8',border:`1px solid ${C.amber}`,borderRadius:8,padding:'0.85rem 1.1rem',marginBottom:'1.25rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontWeight:600,color:C.amber}}>⏳ {pending} timesheet{pending>1?'s':''} awaiting approval</span>
            <button style={addBtn(true,C.amber)} onClick={()=>setView('team')}>Review →</button>
          </div>
        )}
        <div style={kpiGrid}>
          <KPI label="Active Engagements" value={String(activeC.length)}/>
          <KPI label="Programmes" value={String(state.programmes.length)}/>
          <KPI label="Clearview Live" value={String(clearviewLive.length)} color={C.teal}/>
          <KPI label="Canvas Engagements" value={String(canvasC.length)} color={C.purple||C.amber}/>
          <KPI label="Co-Implementers" value={String(state.coImplementers.length)}/>
          <KPI label="Pending Approvals" value={String(pending)} color={pending>0?C.amber:C.navy}/>
        </div>

        {state.programmes.map(prog=>{
          const clients=allClients.filter(c=>prog.clientIds.includes(c.id))
          return (
            <div key={prog.id} style={card}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem',flexWrap:'wrap',gap:'0.5rem'}}>
                <div>
                  <div style={{fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy}}>{prog.name}</div>
                  <div style={{fontSize:'0.75rem',color:C.slate,marginTop:'0.15rem'}}>{prog.funder} · {prog.country} · {prog.type==='donor_programme'?'Donor Programme':'Direct Client'}</div>
                </div>
                <button style={addBtn(true)} onClick={()=>{setSelProg(prog.id);setView('programmes')}}>Manage →</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(215px,1fr))',gap:'0.75rem'}}>
                {clients.map(c=>(
                  <ClientCard key={c.id} client={c} programmes={state.programmes}
                    onClick={()=>{setSelClient(c.id);setClientTab('engagement');setView('client')}}/>
                ))}
                <div style={{border:`2px dashed ${C.border}`,borderRadius:6,padding:'1rem',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',cursor:'pointer',color:C.slate,fontSize:'0.8rem',gap:'0.35rem',minHeight:120}}
                  onClick={()=>{setSelProg(prog.id);setView('clients')}}>
                  <span style={{fontSize:'1.3rem'}}>+</span>
                  <span>Add client</span>
                </div>
              </div>
            </div>
          )
        })}
        <button style={addBtn()} onClick={()=>setView('programmes')}>+ New Programme</button>
      </div>
    )
  }

  // ── CLIENTS LIST ─────────────────────────────────────────
  function ClientsTab() {
    const [filter,setFilter]=useState('all')
    const [showNew,setShowNew]=useState(false)
    const filtered=filter==='all'?allClients:allClients.filter(c=>c.type===filter||c.engagementMode===filter)
    return (
      <div>
        <div style={{display:'flex',gap:'0.45rem',marginBottom:'1.25rem',flexWrap:'wrap',alignItems:'center'}}>
          {['all','canvas','financial','crop_aggregator','livestock_aggregator','farmer_group_enterprise','service_lsp'].map(f=>(
            <button key={f} style={{fontFamily:'monospace',fontSize:'0.68rem',padding:'0.3rem 0.65rem',border:`1px solid ${filter===f?C.cyan:C.border}`,borderRadius:4,background:filter===f?C.cyan:C.white,color:filter===f?C.navy:C.slate,cursor:'pointer'}}
              onClick={()=>setFilter(f)}>
              {f==='all'?'All':f==='canvas'?'GtCV Canvas':f==='financial'?'Clearview Only':CLIENT_TYPE_LABELS[f as ClientType]||f}
            </button>
          ))}
          <button style={{...addBtn(),marginLeft:'auto'}} onClick={()=>setShowNew(!showNew)}>+ New Client</button>
        </div>
        {showNew&&<NewClientForm programmes={state.programmes}
          onSave={c=>{save({...state,clients:[...state.clients,c]});setShowNew(false)}}
          onCancel={()=>setShowNew(false)}/>}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))',gap:'1rem'}}>
          {filtered.map(c=>(
            <ClientCard key={c.id} client={c} programmes={state.programmes}
              onClick={()=>{setSelClient(c.id);setClientTab('engagement');setView('client')}}/>
          ))}
        </div>
      </div>
    )
  }

  // ── CLIENT DETAIL ────────────────────────────────────────
  function ClientDetail() {
    const client=state.clients.find(c=>c.id===selClient)
    if(!client) return <div style={{color:C.slate,padding:'2rem'}}>Client not found.</div>
    const prog=state.programmes.find(p=>p.id===client.programmeId)
    const isCanvas=client.engagementMode==='canvas'

    const tabs:[string,string][]=isCanvas
      ?[['engagement','Engagement & Canvas'],['team','Team & Access'],['clearview','Clearview'],['reports','Reports']]
      :[['engagement','Engagement'],['team','Team & Access'],['clearview','Clearview'],['reports','Reports']]

    return (
      <div>
        {/* Back + breadcrumb */}
        <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'1rem',fontSize:'0.8rem',color:C.slate}}>
          <button style={{fontFamily:'monospace',fontSize:'0.72rem',color:C.slate,background:'transparent',border:`1px solid ${C.border}`,borderRadius:4,cursor:'pointer',padding:'0.22rem 0.6rem'}} onClick={()=>setView('overview')}>← Coach Dashboard</button>
          <span>/</span><span style={{color:C.navy,fontWeight:600}}>{client.name}</span>
        </div>

        {/* Header */}
        <div style={{...card,background:C.navy,color:C.white,marginBottom:'1.25rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'1rem'}}>
            <div>
              <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.12em',color:C.cyan,marginBottom:'0.3rem'}}>
                {CLIENT_TYPE_LABELS[client.type]} · {prog?.name||'—'} · {isCanvas?'Full GtCV Canvas':'Clearview Financial'}
              </div>
              <h2 style={{fontFamily:'Georgia,serif',fontSize:'1.4rem',fontWeight:700,color:C.white,margin:'0 0 0.25rem'}}>{client.name}</h2>
              <div style={{fontSize:'0.77rem',color:'rgba(255,255,255,0.6)'}}>
                {client.contactName&&`${client.contactName} · `}{client.country} · {client.sector}
              </div>
            </div>
            <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap',alignItems:'center'}}>
              <span style={{fontFamily:'monospace',fontSize:'0.7rem',padding:'0.22rem 0.6rem',borderRadius:4,background:statusColor(client.status),color:C.white}}>{statusLabel(client.status)}</span>
              {client.clearviewActive&&(
                <a href={`/dashboard/${client.slug}`} target="_blank" rel="noreferrer"
                  style={{fontFamily:'monospace',fontSize:'0.7rem',padding:'0.22rem 0.6rem',borderRadius:4,background:C.teal,color:C.white,textDecoration:'none'}}>
                  Open Clearview ↗
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div style={{display:'flex',gap:0,borderBottom:`2px solid ${C.border}`,marginBottom:'1.25rem',overflowX:'auto'}}>
          {tabs.map(([id,label])=>(
            <button key={id} style={{fontFamily:'monospace',fontSize:'0.72rem',padding:'0.6rem 1rem',border:'none',background:'transparent',
              color:clientTab===id?C.navy:C.slate,cursor:'pointer',borderBottom:clientTab===id?`3px solid ${C.navy}`:'3px solid transparent',fontWeight:clientTab===id?700:400,whiteSpace:'nowrap'}}
              onClick={()=>setClientTab(id)}>{label}</button>
          ))}
        </div>

        {clientTab==='engagement' && <EngagementTab client={client} isCanvas={isCanvas}/>}
        {clientTab==='team'       && <TeamAccessTab client={client}/>}
        {clientTab==='clearview'  && <ClearviewTab client={client}/>}
        {clientTab==='reports'    && <ReportsTab client={client}/>}
      </div>
    )
  }

  // ── ENGAGEMENT TAB ───────────────────────────────────────
  function EngagementTab({client,isCanvas}:{client:EngagementClient;isCanvas:boolean}) {
    const [editing,setEditing]=useState(false)
    const [form,setForm]=useState({...client})
    const [expandedDP,setExpandedDP]=useState<string|null>(null)
    const [expandedComp,setExpandedComp]=useState<string|null>(null)

    function saveEdit(){updClient(client.id,form);setEditing(false)}

    function updateDP(dpId:string,updates:Partial<DecisionPoint>){
      const canvas=(client.canvas||[]).map(dp=>dp.id!==dpId?dp:{...dp,...updates})
      updClient(client.id,{canvas})
    }
    function updateComp(dpId:string,compId:string,updates:Partial<DecisionComponent>){
      const canvas=(client.canvas||[]).map(dp=>dp.id!==dpId?dp:{
        ...dp,components:dp.components.map(c=>c.id!==compId?c:{...c,...updates})
      })
      updClient(client.id,{canvas})
    }
    function activateCanvas(){
      if(!window.confirm('Activate the full GtCV Canvas for this client? This will create all nine Decision Points with their full component detail.'))return
      updClient(client.id,{engagementMode:'canvas',canvas:buildEmptyCanvas()})
    }

    const dpStatuses=['○','◐','✓','⚠'] as DPStatus[]

    return (
      <div>
        {/* Client details edit */}
        <div style={card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
            <div style={secH}>Client Details</div>
            <button style={addBtn(true)} onClick={()=>setEditing(!editing)}>{editing?'Cancel':'Edit'}</button>
          </div>
          {editing?(
            <div>
              <div style={fGrid}>
                <div><label style={lbl}>Contact Name</label><input style={inp} value={form.contactName} onChange={e=>setForm(f=>({...f,contactName:e.target.value}))}/></div>
                <div><label style={lbl}>Contact Email</label><input style={inp} value={form.contactEmail} onChange={e=>setForm(f=>({...f,contactEmail:e.target.value}))}/></div>
                <div><label style={lbl}>Contact Phone</label><input style={inp} value={form.contactPhone} onChange={e=>setForm(f=>({...f,contactPhone:e.target.value}))}/></div>
                <div><label style={lbl}>Country</label><input style={inp} value={form.country} onChange={e=>setForm(f=>({...f,country:e.target.value}))}/></div>
                <div><label style={lbl}>Sector</label><input style={inp} value={form.sector} onChange={e=>setForm(f=>({...f,sector:e.target.value}))}/></div>
                <div><label style={lbl}>Status</label>
                  <select style={inp} value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value as EngagementStatus}))}>
                    {['setup','phase_0','dp01','dp02','dp03','dp04','dp05','dp06','dp07','dp08','dp09','complete','paused'].map(s=>(
                      <option key={s} value={s}>{statusLabel(s as EngagementStatus)}</option>
                    ))}
                  </select>
                </div>
                <div><label style={lbl}>Start Date</label><input type="date" style={inp} value={form.startDate} onChange={e=>setForm(f=>({...f,startDate:e.target.value}))}/></div>
                <div><label style={lbl}>Expected Close</label><input type="date" style={inp} value={form.expectedClose} onChange={e=>setForm(f=>({...f,expectedClose:e.target.value}))}/></div>
                <div style={{gridColumn:'1/-1'}}><label style={lbl}>Notes</label><textarea style={{...inp,minHeight:72,resize:'vertical'}} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
              </div>
              <button style={{...solidBtn(),marginTop:'0.85rem'}} onClick={saveEdit}>Save Changes</button>
            </div>
          ):(
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'0.6rem',fontSize:'0.83rem',color:C.slate,lineHeight:1.8}}>
              {client.contactName&&<div>Contact: <strong style={{color:C.navy}}>{client.contactName}</strong></div>}
              {client.contactEmail&&<div>Email: <strong style={{color:C.navy}}>{client.contactEmail}</strong></div>}
              <div>Country: <strong style={{color:C.navy}}>{client.country}</strong></div>
              <div>Start: <strong style={{color:C.navy}}>{client.startDate||'—'}</strong></div>
              <div>Expected close: <strong style={{color:C.navy}}>{client.expectedClose||'—'}</strong></div>
              {client.notes&&<div style={{gridColumn:'1/-1',fontStyle:'italic'}}>{client.notes}</div>}
            </div>
          )}
        </div>

        {/* Canvas section */}
        {!isCanvas?(
          <div style={{...card,background:'#F0F8FF',border:`1px solid ${C.cyan}`,textAlign:'center',padding:'2rem'}}>
            <div style={{fontFamily:'Georgia,serif',fontSize:'1rem',fontWeight:700,color:C.navy,marginBottom:'0.5rem'}}>Financial Engagement Mode</div>
            <p style={{...hint,fontSize:'0.82rem',lineHeight:1.6,marginBottom:'1.25rem',maxWidth:480,margin:'0 auto 1.25rem'}}>
              This client is on a financial-only engagement — their primary tool is the Clearview financial workspace.
              You can activate the full GtCV Canvas if the engagement scope expands to include the nine Decision Points.
            </p>
            <button style={solidBtn(C.navy)} onClick={activateCanvas}>Activate Full GtCV Canvas for this Client</button>
          </div>
        ):(
          <div>
            <div style={{...hint,fontSize:'0.82rem',lineHeight:1.6,marginBottom:'1rem',padding:'0.85rem 1rem',background:'#F4F8FC',borderRadius:6,border:`1px solid ${C.border}`}}>
              <strong>GtCV Canvas Engagement.</strong> Each Decision Point must be completed with evidence before the next opens.
              The CEO signs off each DP before it is marked complete. Click any DP to expand its nine components.
            </div>
            {(client.canvas||[]).map(dp=>{
              const expanded=expandedDP===dp.id
              const completedComps=dp.components.filter(c=>c.status==='✓').length
              const ceoSigned=dp.ceoSignedOff
              const prevIdx=(client.canvas||[]).findIndex(d=>d.id===dp.id)-1
              const prevDP=prevIdx>=0?(client.canvas||[])[prevIdx]:null
              const isLocked=prevDP&&!prevDP.ceoSignedOff&&prevDP.status!=='✓'

              return (
                <div key={dp.id} style={{border:`1px solid ${isLocked?C.border:C.border}`,borderLeft:`4px solid ${dp.status==='✓'?C.green:dp.status==='◐'?C.cyan:dp.status==='⚠'?C.amber:C.border}`,borderRadius:6,marginBottom:'0.6rem',background:isLocked?'#F8F8F8':C.white,opacity:isLocked?0.6:1}}>
                  {/* DP header */}
                  <div style={{display:'flex',alignItems:'center',gap:'0.75rem',padding:'0.85rem 1rem',cursor:isLocked?'not-allowed':'pointer'}}
                    onClick={()=>!isLocked&&setExpandedDP(expanded?null:dp.id)}>
                    <DPDot status={dp.status}/>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:'0.88rem',color:C.navy}}>{dp.label}</div>
                      <div style={{fontSize:'0.72rem',color:C.slate,marginTop:'0.15rem'}}>{dp.coreQuestion}</div>
                    </div>
                    <div style={{display:'flex',gap:'0.5rem',alignItems:'center',flexShrink:0}}>
                      <span style={{fontSize:'0.7rem',color:C.slate,fontFamily:'monospace'}}>{completedComps}/{dp.components.length}</span>
                      {ceoSigned&&<span style={{fontFamily:'monospace',fontSize:'0.62rem',color:C.green,border:`1px solid ${C.green}`,borderRadius:3,padding:'0.05rem 0.35rem'}}>CEO ✓</span>}
                      {isLocked&&<span style={{fontFamily:'monospace',fontSize:'0.62rem',color:C.slate}}>🔒 Complete previous DP first</span>}
                      <select value={dp.status} onClick={e=>e.stopPropagation()}
                        onChange={e=>{e.stopPropagation();updateDP(dp.id,{status:e.target.value as DPStatus})}}
                        style={{fontFamily:'monospace',fontSize:'0.7rem',padding:'0.2rem 0.35rem',border:`1px solid ${C.border}`,borderRadius:4,background:'transparent',cursor:'pointer'}}>
                        {['○','◐','✓','⚠'].map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Expanded DP content */}
                  {expanded&&!isLocked&&(
                    <div style={{padding:'0 1rem 1rem',borderTop:`1px solid ${C.border}`}}>
                      <div style={{paddingTop:'0.85rem',marginBottom:'0.75rem'}}>
                        <div style={{fontSize:'0.78rem',color:C.slate,lineHeight:1.6,marginBottom:'0.5rem'}}><strong>Commitment:</strong> {dp.commitment}</div>
                        <div style={{fontSize:'0.78rem',color:C.slate,lineHeight:1.6,marginBottom:'0.5rem'}}><strong>Output required:</strong> {dp.outputRequired}</div>
                        <div style={{fontSize:'0.78rem',color:C.slate}}><strong>Session time:</strong> {dp.sessionTime}</div>
                      </div>

                      {/* Components */}
                      {dp.components.map(comp=>{
                        const compExpanded=expandedComp===comp.id
                        return (
                          <div key={comp.id} style={{border:`1px solid ${C.border}`,borderLeft:`3px solid ${comp.status==='✓'?C.green:comp.status==='◐'?C.cyan:comp.status==='⚠'?C.amber:C.border}`,borderRadius:5,marginBottom:'0.45rem',background:C.white}}>
                            {/* Component header */}
                            <div style={{display:'flex',alignItems:'center',gap:'0.6rem',padding:'0.65rem 0.85rem',cursor:'pointer'}}
                              onClick={()=>setExpandedComp(compExpanded?null:comp.id)}>
                              <DPDot status={comp.status}/>
                              <div style={{flex:1}}>
                                <span style={{fontWeight:600,fontSize:'0.82rem',color:C.navy}}>{comp.number} — {comp.title}</span>
                              </div>
                              <div style={{display:'flex',gap:'0.4rem',alignItems:'center',flexShrink:0}}>
                                {comp.ceoSignedOff&&<span style={{fontSize:'0.62rem',color:C.green,fontFamily:'monospace'}}>CEO ✓</span>}
                                {comp.evidenceRecorded&&<span style={{fontSize:'0.62rem',color:C.teal,fontFamily:'monospace'}}>Evidence ✓</span>}
                                <select value={comp.status} onClick={e=>e.stopPropagation()}
                                  onChange={e=>{e.stopPropagation();updateComp(dp.id,comp.id,{status:e.target.value as DPStatus})}}
                                  style={{fontFamily:'monospace',fontSize:'0.68rem',padding:'0.18rem 0.3rem',border:`1px solid ${C.border}`,borderRadius:3,background:'transparent',cursor:'pointer'}}>
                                  {['○','◐','✓','⚠'].map(s=><option key={s} value={s}>{s}</option>)}
                                </select>
                                <span style={{fontSize:'0.72rem',color:C.slate}}>{compExpanded?'▲':'▼'}</span>
                              </div>
                            </div>

                            {/* Component detail */}
                            {compExpanded&&(
                              <div style={{padding:'0 0.85rem 0.85rem',borderTop:`1px solid #EEF2F6`}}>
                                {/* Five layers — collapsible */}
                                {[
                                  {label:'What it is',content:comp.whatItIs,bg:'#F4F8FC'},
                                  {label:'Why it matters',content:comp.whyItMatters,bg:'#FFF8E8'},
                                  {label:'Coach guidance',content:comp.coachGuidance,bg:'#F0F8FF'},
                                  {label:'Action trigger',content:comp.actionTrigger,bg:'#F0F9F4'},
                                  {label:'Signal to look for',content:comp.signalToLookFor,bg:'#F9F0FF'},
                                ].map(({label,content,bg})=>(
                                  <div key={label} style={{background:bg,borderRadius:4,padding:'0.6rem 0.8rem',marginTop:'0.4rem',fontSize:'0.78rem',lineHeight:1.6}}>
                                    <strong style={{color:C.navy,display:'block',marginBottom:'0.2rem'}}>{label}</strong>
                                    <span style={{color:C.slate}}>{content}</span>
                                  </div>
                                ))}

                                {/* Evidence field */}
                                <div style={{marginTop:'0.75rem'}}>
                                  <label style={{...lbl,color:C.teal}}>Evidence Recorded</label>
                                  <textarea
                                    style={{...inp,minHeight:80,resize:'vertical',background:'#E8F6F8',border:`1px solid ${C.teal}`}}
                                    placeholder="Record the specific evidence produced at this component — documents, decisions, verbatim responses, outcomes..."
                                    value={comp.evidenceRecorded}
                                    onChange={e=>updateComp(dp.id,comp.id,{evidenceRecorded:e.target.value})}
                                  />
                                </div>
                                <div style={{marginTop:'0.5rem'}}>
                                  <label style={lbl}>Coach Notes (internal — not visible to client)</label>
                                  <textarea
                                    style={{...inp,minHeight:60,resize:'vertical',background:'#FFF8E8'}}
                                    placeholder="Your private notes on this component..."
                                    value={comp.coachNotes}
                                    onChange={e=>updateComp(dp.id,comp.id,{coachNotes:e.target.value})}
                                  />
                                </div>
                                {/* CEO sign-off per component */}
                                <div style={{marginTop:'0.5rem',display:'flex',alignItems:'center',gap:'0.75rem'}}>
                                  {!comp.ceoSignedOff?(
                                    <button style={solidBtn(C.green,true)} onClick={()=>updateComp(dp.id,comp.id,{ceoSignedOff:true,ceoSignedOffAt:new Date().toISOString(),ceoSignedOffBy:client.contactName||'CEO'})}>
                                      Mark CEO signed off on this component
                                    </button>
                                  ):(
                                    <span style={{fontSize:'0.75rem',color:C.green}}>✓ CEO signed off · {new Date(comp.ceoSignedOffAt).toLocaleDateString('en-GB')}</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {/* DP-level CEO sign-off */}
                      <div style={{marginTop:'0.75rem',padding:'0.75rem',background:'#F0F9F4',borderRadius:5,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.5rem'}}>
                        <div>
                          <div style={{fontWeight:600,fontSize:'0.83rem',color:C.navy}}>Decision Point Sign-Off</div>
                          <div style={{...hint,marginTop:'0.15rem'}}>CEO must sign off this full Decision Point before the next one opens.</div>
                        </div>
                        {!dp.ceoSignedOff?(
                          <button style={solidBtn(C.green)} onClick={()=>updateDP(dp.id,{ceoSignedOff:true,ceoSignedOffAt:new Date().toISOString(),status:'✓',completedAt:new Date().toISOString()})}>
                            CEO Signs Off {dp.label}
                          </button>
                        ):(
                          <span style={{fontSize:'0.8rem',color:C.green,fontWeight:600}}>✓ Signed off by CEO · {new Date(dp.ceoSignedOffAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── TEAM & ACCESS TAB ────────────────────────────────────
  function TeamAccessTab({client}:{client:EngagementClient}) {
    const [inviteForm,setInviteForm]=useState({show:false,name:'',email:'',role:'ceo',sending:false})
    const [msg,setMsg]=useState('')

    async function sendInvite() {
      if(!inviteForm.email||!inviteForm.name){setMsg('Please enter name and email.');return}
      setInviteForm(f=>({...f,sending:true}))
      setMsg('')
      try {
        const {data:{session}}=await supabase.auth.getSession()
        const token=session?.access_token
        if(!token){setMsg('Session expired. Please refresh.');setInviteForm(f=>({...f,sending:false}));return}
        const res=await fetch('/api/invite-user',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({email:inviteForm.email,fullName:inviteForm.name,role:inviteForm.role,clientId:client.id,assignedUnitIds:[],inviterToken:token})
        })
        const data=await res.json() as {success?:boolean;message?:string;error?:string}
        if(data.success){
          setMsg(`✓ Invitation sent to ${inviteForm.email}`)
          if(inviteForm.role==='ceo') updClient(client.id,{ceoInvited:true,ceoInvitedAt:new Date().toISOString(),contactEmail:inviteForm.email,contactName:inviteForm.name})
          setInviteForm({show:false,name:'',email:'',role:'ceo',sending:false})
        } else {
          setMsg(`Error: ${data.error||'Invitation failed'}`)
          setInviteForm(f=>({...f,sending:false}))
        }
      } catch {
        setMsg('Network error. Please try again.')
        setInviteForm(f=>({...f,sending:false}))
      }
    }

    return (
      <div>
        {msg&&<div style={{background:msg.startsWith('✓')?'#F0F9F4':'#FDF0EE',border:`1px solid ${msg.startsWith('✓')?C.green:C.red}`,borderRadius:6,padding:'0.7rem 1rem',marginBottom:'1rem',fontSize:'0.83rem',color:msg.startsWith('✓')?C.green:C.red}}>{msg}</div>}

        <div style={card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
            <div style={secH}>Invite Team Member</div>
            <button style={addBtn()} onClick={()=>setInviteForm(f=>({...f,show:!f.show}))}>
              {inviteForm.show?'Cancel':'+ Invite User'}
            </button>
          </div>

          {!client.ceoInvited&&(
            <div style={{background:'#FFF8E8',border:`1px solid ${C.amber}`,borderRadius:5,padding:'0.7rem 0.85rem',marginBottom:'0.85rem',fontSize:'0.82rem',color:C.amber}}>
              ⚠ CEO has not been invited yet. Invite the CEO first — they will then manage their own team from inside Clearview.
            </div>
          )}

          {client.ceoInvited&&(
            <div style={{background:'#F0F9F4',border:`1px solid ${C.green}`,borderRadius:5,padding:'0.7rem 0.85rem',marginBottom:'0.85rem',fontSize:'0.82rem',color:C.green}}>
              ✓ CEO invited {client.ceoInvitedAt?`on ${new Date(client.ceoInvitedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`:''}. 
              They can invite their own team from inside their Clearview workspace.
            </div>
          )}

          {inviteForm.show&&(
            <div style={{background:'#F4F8FC',borderRadius:6,padding:'1rem',border:`1px solid ${C.border}`}}>
              <p style={{...hint,fontSize:'0.8rem',lineHeight:1.6,marginBottom:'0.85rem'}}>
                The invited person receives an email with a link to set their password. They log in at clearview.habibonifade.com/dashboard/{client.slug}.
                You assign their role and access here — they cannot change their own role.
              </p>
              <div style={fGrid}>
                <div><label style={lbl}>Full Name *</label><input style={inp} value={inviteForm.name} onChange={e=>setInviteForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Bernard Okello"/></div>
                <div><label style={lbl}>Email Address *</label><input type="email" style={inp} value={inviteForm.email} onChange={e=>setInviteForm(f=>({...f,email:e.target.value}))} placeholder="ceo@company.com"/></div>
                <div><label style={lbl}>Role</label>
                  <select style={inp} value={inviteForm.role} onChange={e=>setInviteForm(f=>({...f,role:e.target.value}))}>
                    <option value="ceo">CEO — full access, manages own team</option>
                    <option value="finance_manager">Finance Manager — planning and actuals</option>
                    <option value="unit_head">Unit Head — their unit only</option>
                    <option value="accounts_assistant">Accounts Assistant — actuals entry only</option>
                  </select>
                </div>
              </div>
              <button style={{...solidBtn(),marginTop:'0.85rem'}} disabled={inviteForm.sending} onClick={sendInvite}>
                {inviteForm.sending?'Sending invitation…':'Send Invitation Email'}
              </button>
            </div>
          )}
        </div>

        <div style={card}>
          <div style={secH}>About Team Access</div>
          <div style={{fontSize:'0.82rem',color:C.slate,lineHeight:1.7}}>
            <p style={{marginBottom:'0.6rem'}}>The CEO receives an invitation email and sets their own password. Once logged in, they see the full Clearview financial workspace for {client.name}.</p>
            <p style={{marginBottom:'0.6rem'}}>From inside their workspace, the CEO can invite their Finance Manager, unit heads, and accounts assistants. You do not need to be involved in that process.</p>
            <p>Your coach account has super coach access — you can see everything in their workspace. You do not appear in their user list.</p>
          </div>
        </div>
      </div>
    )
  }

  // ── CLEARVIEW TAB ────────────────────────────────────────
  function ClearviewTab({client}:{client:EngagementClient}) {
    return (
      <div>
        <div style={card}>
          <div style={secH}>Clearview Financial Workspace</div>
          <div style={{display:'flex',alignItems:'center',gap:'0.85rem',marginBottom:'1rem',flexWrap:'wrap'}}>
            <span style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.25rem 0.7rem',borderRadius:4,background:client.clearviewActive?C.teal:C.slate,color:C.white}}>
              {client.clearviewActive?'LIVE':'NOT YET ACTIVE'}
            </span>
            {client.clearviewActive&&(
              <a href={`/dashboard/${client.slug}`} target="_blank" rel="noreferrer" style={{...solidBtn(C.teal,true),textDecoration:'none',display:'inline-block'}}>
                Open {client.name} Clearview ↗
              </a>
            )}
            {!client.clearviewActive&&(
              <button style={solidBtn(C.cyan)} onClick={()=>updClient(client.id,{clearviewActive:true})}>Activate Clearview for this Client</button>
            )}
          </div>
          <div style={{fontSize:'0.82rem',color:C.slate,lineHeight:1.7}}>
            {client.clearviewActive?(
              <p>Clearview is live for {client.name}. You can open their workspace above — your session will be authenticated as super coach. The client does not see your visits in their activity log.</p>
            ):(
              <p>Clearview has not yet been activated for {client.name}. Activate it when you reach DP04 — Commercial Viability Model — so the financial model is built inside the platform during the session.</p>
            )}
          </div>
        </div>
        {client.financialHeadline&&(
          <div style={card}>
            <div style={secH}>Latest Financial Headline</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:'1rem'}}>
              <KPI label="Revenue (Plan)" value={`${client.financialHeadline.currency} ${(client.financialHeadline.revenue/1e6).toFixed(1)}M`}/>
              <KPI label="EBITDA" value={`${client.financialHeadline.currency} ${(client.financialHeadline.ebitda/1e6).toFixed(1)}M`} color={client.financialHeadline.ebitda>=0?C.green:C.red}/>
              <KPI label="Cash Position" value={`${client.financialHeadline.currency} ${(client.financialHeadline.cash/1e6).toFixed(1)}M`} color={client.financialHeadline.cash>=0?C.navy:C.red}/>
            </div>
            <div style={{...hint,marginTop:'0.65rem'}}>Last updated: {client.financialHeadline.lastUpdated}</div>
          </div>
        )}
      </div>
    )
  }

  // ── REPORTS TAB ──────────────────────────────────────────
  function ReportsTab({client}:{client:EngagementClient}) {
    function printReport(){window.print()}
    const isCanvas=client.engagementMode==='canvas'
    const canvas=client.canvas||[]
    const completedDPs=canvas.filter(dp=>dp.status==='✓').length
    const totalComponents=canvas.reduce((s,dp)=>s+dp.components.length,0)
    const completedComponents=canvas.reduce((s,dp)=>s+dp.components.filter(c=>c.status==='✓').length,0)
    const prog=state.programmes.find(p=>p.id===client.programmeId)

    return (
      <div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem'}}>
          <div style={secH}>Engagement Reports</div>
          <button style={solidBtn(C.navy)} onClick={printReport}>Export / Print</button>
        </div>

        {/* Progress summary */}
        <div style={card}>
          <div style={secH}>Engagement Progress Summary</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:'1rem',marginBottom:'1rem'}}>
            <KPI label="Engagement Status" value={statusLabel(client.status)}/>
            <KPI label="Programme" value={prog?.name||'—'}/>
            <KPI label="Client Type" value={CLIENT_TYPE_LABELS[client.type]}/>
            <KPI label="Engagement Mode" value={isCanvas?'Full GtCV Canvas':'Clearview Financial'}/>
            {isCanvas&&<KPI label="DPs Complete" value={`${completedDPs} / ${canvas.length}`} color={completedDPs===canvas.length?C.green:C.navy}/>}
            {isCanvas&&<KPI label="Components Complete" value={`${completedComponents} / ${totalComponents}`}/>}
          </div>
        </div>

        {/* Canvas DP summary for funder / reporting */}
        {isCanvas&&canvas.length>0&&(
          <div style={card}>
            <div style={secH}>Decision Point Progress — For Programme Funder</div>
            <p style={{...hint,fontSize:'0.79rem',lineHeight:1.55,marginBottom:'1rem'}}>This section is suitable for sharing with {prog?.funder||'the programme funder'} as a progress update.</p>
            {canvas.map(dp=>{
              const completedC=dp.components.filter(c=>c.status==='✓').length
              const evidenceEntries=dp.components.filter(c=>c.evidenceRecorded).length
              return (
                <div key={dp.id} style={{padding:'0.75rem 0.85rem',border:`1px solid ${C.border}`,borderLeft:`4px solid ${dp.status==='✓'?C.green:dp.status==='◐'?C.cyan:dp.status==='⚠'?C.amber:C.border}`,borderRadius:5,marginBottom:'0.5rem'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'0.35rem'}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:'0.85rem',color:C.navy}}>{dp.label}</div>
                      <div style={{fontSize:'0.72rem',color:C.slate,marginTop:'0.15rem',fontStyle:'italic'}}>{dp.coreQuestion}</div>
                    </div>
                    <div style={{display:'flex',gap:'0.4rem',alignItems:'center'}}>
                      <DPDot status={dp.status}/>
                      <span style={{fontSize:'0.72rem',color:C.slate,fontFamily:'monospace'}}>{completedC}/{dp.components.length} components</span>
                      {dp.ceoSignedOff&&<span style={{fontSize:'0.65rem',color:C.green,fontFamily:'monospace',border:`1px solid ${C.green}`,borderRadius:3,padding:'0.05rem 0.3rem'}}>CEO ✓</span>}
                    </div>
                  </div>
                  {dp.ceoSignedOff&&dp.components.some(c=>c.evidenceRecorded)&&(
                    <div style={{marginTop:'0.5rem',fontSize:'0.76rem',color:C.slate,lineHeight:1.5}}>
                      <strong>Evidence summary:</strong> {dp.components.filter(c=>c.evidenceRecorded).map(c=>`${c.number}: ${c.evidenceRecorded.substring(0,80)}${c.evidenceRecorded.length>80?'…':''}`).join(' | ')}
                    </div>
                  )}
                  {evidenceEntries===0&&dp.status==='○'&&(
                    <div style={{marginTop:'0.4rem',fontSize:'0.74rem',color:C.slate,fontStyle:'italic'}}>Not yet started.</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── PROGRAMMES TAB ───────────────────────────────────────
  function ProgrammesTab() {
    const [showNew,setShowNew]=useState(false)
    const prog=selProg?state.programmes.find(p=>p.id===selProg):null

    if(prog) return (
      <div>
        <button style={{fontFamily:'monospace',fontSize:'0.72rem',color:C.slate,background:'transparent',border:`1px solid ${C.border}`,borderRadius:4,cursor:'pointer',padding:'0.22rem 0.6rem',marginBottom:'1rem'}} onClick={()=>setSelProg(null)}>← All Programmes</button>
        <div style={{...card,background:C.navy,color:C.white}}>
          <div style={{fontFamily:'monospace',fontSize:'0.62rem',color:C.cyan,letterSpacing:'0.12em',marginBottom:'0.3rem'}}>{prog.type==='donor_programme'?'DONOR PROGRAMME':'DIRECT CLIENT'}</div>
          <h2 style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:C.white,margin:'0 0 0.2rem'}}>{prog.name}</h2>
          <div style={{fontSize:'0.77rem',color:'rgba(255,255,255,0.6)'}}>{prog.funder} · {prog.country} · {prog.startDate?`${new Date(prog.startDate).toLocaleDateString('en-GB',{month:'short',year:'numeric'})} – ${new Date(prog.endDate).toLocaleDateString('en-GB',{month:'short',year:'numeric'})}`:''}</div>
        </div>
        <div style={card}>
          <div style={secH}>Client Organisations</div>
          {state.clients.filter(c=>prog.clientIds.includes(c.id)).map(c=>(
            <div key={c.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.6rem 0.75rem',border:`1px solid ${C.border}`,borderRadius:5,marginBottom:'0.45rem'}}>
              <div>
                <div style={{fontWeight:600,fontSize:'0.85rem'}}>{c.name}</div>
                <div style={{fontSize:'0.72rem',color:C.slate}}>{CLIENT_TYPE_LABELS[c.type]} · {statusLabel(c.status)}</div>
              </div>
              <button style={addBtn(true)} onClick={()=>{setSelClient(c.id);setClientTab('engagement');setView('client')}}>Open →</button>
            </div>
          ))}
        </div>
        {prog.notes&&<div style={card}><div style={secH}>Notes</div><div style={{fontSize:'0.82rem',color:C.slate,lineHeight:1.6}}>{prog.notes}</div></div>}
      </div>
    )

    return (
      <div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem'}}>
          <div style={secH}>Programmes</div>
          <button style={addBtn()} onClick={()=>setShowNew(!showNew)}>+ New Programme</button>
        </div>
        {showNew&&<NewProgrammeForm onSave={p=>{save({...state,programmes:[...state.programmes,p]});setShowNew(false)}} onCancel={()=>setShowNew(false)}/>}
        {state.programmes.map(p=>(
          <div key={p.id} style={{...card,cursor:'pointer'}} onClick={()=>setSelProg(p.id)}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <div style={{fontFamily:'Georgia,serif',fontSize:'1rem',fontWeight:700,color:C.navy}}>{p.name}</div>
                <div style={{fontSize:'0.77rem',color:C.slate,marginTop:'0.18rem'}}>{p.funder} · {p.country} · {state.clients.filter(c=>p.clientIds.includes(c.id)).length} clients</div>
              </div>
              <span style={{fontFamily:'monospace',fontSize:'0.65rem',padding:'0.12rem 0.45rem',borderRadius:4,background:p.type==='donor_programme'?C.amber:C.teal,color:C.white}}>{p.type==='donor_programme'?'Donor':'Direct'}</span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── TEAM TAB ─────────────────────────────────────────────
  function TeamTab() {
    const [showNew,setShowNew]=useState(false)
    const pendingTs=state.timesheets.filter(t=>t.status==='submitted')

    return (
      <div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem'}}>
          <div style={secH}>Canvas Coach Team</div>
          <button style={addBtn()} onClick={()=>setShowNew(!showNew)}>+ Add Co-Implementer</button>
        </div>

        {pendingTs.length>0&&(
          <div style={{...card,background:'#FFF8E8',border:`1px solid ${C.amber}`}}>
            <div style={secH}>⏳ Pending Timesheet Approvals ({pendingTs.length})</div>
            {pendingTs.map(ts=>{
              const ci=state.coImplementers.find(c=>c.id===ts.coImplementerId)
              const cl=state.clients.find(c=>c.id===ts.clientId)
              return (
                <div key={ts.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.6rem 0.75rem',border:`1px solid ${C.amber}`,borderRadius:5,marginBottom:'0.45rem',background:C.white}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:'0.84rem'}}>{ci?.name||'Unknown'} — {ts.date}</div>
                    <div style={{fontSize:'0.75rem',color:C.slate}}>{cl?.name||'Unknown client'} · {ts.hours}h · {ts.description}</div>
                  </div>
                  <div style={{display:'flex',gap:'0.4rem'}}>
                    <button style={solidBtn(C.green,true)} onClick={()=>save({...state,timesheets:state.timesheets.map(t=>t.id!==ts.id?t:{...t,status:'approved',approvedAt:new Date().toISOString()})})}>Approve</button>
                    <button style={solidBtn(C.red,true)} onClick={()=>save({...state,timesheets:state.timesheets.map(t=>t.id!==ts.id?t:{...t,status:'rejected',approvedAt:new Date().toISOString()})})}>Reject</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {showNew&&(
          <NewCIForm clients={state.clients} programmes={state.programmes}
            onSave={ci=>{save({...state,coImplementers:[...state.coImplementers,ci]});setShowNew(false)}}
            onCancel={()=>setShowNew(false)}/>
        )}

        {state.coImplementers.length===0?(
          <div style={{...card,color:C.slate,textAlign:'center',padding:'2.5rem'}}>
            No co-implementers yet. Add one using the button above.
          </div>
        ):(
          state.coImplementers.map(ci=>{
            const ciTs=state.timesheets.filter(t=>t.coImplementerId===ci.id)
            const approvedHours=ciTs.filter(t=>t.status==='approved').reduce((s,t)=>s+t.hours,0)
            return (
              <div key={ci.id} style={card}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.65rem'}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:'0.9rem',color:C.navy,marginBottom:'0.2rem'}}>{ci.name}</div>
                    <div style={{fontSize:'0.77rem',color:C.slate}}>{ci.email} · {ci.country}</div>
                    {ci.specialisation&&<div style={{fontSize:'0.74rem',color:C.slate,marginTop:'0.15rem'}}>{ci.specialisation}</div>}
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontFamily:'monospace',fontSize:'0.72rem',color:ci.active?C.green:C.red,marginBottom:'0.2rem'}}>{ci.active?'Active':'Inactive'}</div>
                    {ci.ratePerDay>0&&<div style={{fontSize:'0.72rem',color:C.slate}}>{ci.currency||'USD'} {ci.ratePerDay.toLocaleString()}/day</div>}
                  </div>
                </div>
                <div style={{display:'flex',gap:'1.5rem',fontSize:'0.78rem',color:C.slate}}>
                  <span>Clients: <strong style={{color:C.navy}}>{ci.clientIds.map(id=>state.clients.find(c=>c.id===id)?.name||id).join(', ')||'None assigned'}</strong></span>
                  <span>Approved hours: <strong style={{color:C.navy}}>{approvedHours}h</strong></span>
                </div>
              </div>
            )
          })
        )}
      </div>
    )
  }

  // ── FORM COMPONENTS ──────────────────────────────────────
  function NewClientForm({programmes,onSave,onCancel}:{programmes:Programme[];onSave:(c:EngagementClient)=>void;onCancel:()=>void}) {
    const [f,setF]=useState({name:'',type:'service_lsp' as ClientType,engagementMode:'canvas' as 'canvas'|'financial',programmeId:programmes[0]?.id||'',country:'Uganda',sector:'',contactName:'',contactEmail:'',notes:''})
    function save() {
      if(!f.name)return
      const slug=f.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')
      const canvas=f.engagementMode==='canvas'?buildEmptyCanvas():[]
      onSave({...f,id:`client_${Date.now()}`,slug,status:'setup',clearviewActive:false,ceoInvited:false,ceoInvitedAt:'',startDate:new Date().toISOString().split('T')[0],expectedClose:'',canvas,contactPhone:''})
    }
    return (
      <div style={{...card,background:'#F4F8FC',border:`1px solid ${C.cyan}`,marginBottom:'1.25rem'}}>
        <div style={secH}>New Client Organisation</div>
        <div style={fGrid}>
          <div><label style={lbl}>Organisation Name *</label><input style={inp} value={f.name} onChange={e=>setF(x=>({...x,name:e.target.value}))}/></div>
          <div><label style={lbl}>Client Type *</label>
            <select style={inp} value={f.type} onChange={e=>setF(x=>({...x,type:e.target.value as ClientType}))}>
              <option value="crop_aggregator">Crop Aggregator with Input</option>
              <option value="livestock_aggregator">Livestock Aggregator</option>
              <option value="farmer_group_enterprise">Farmer Group Enterprise</option>
              <option value="service_lsp">Service LSP</option>
            </select>
          </div>
          <div><label style={lbl}>Engagement Mode *</label>
            <select style={inp} value={f.engagementMode} onChange={e=>setF(x=>({...x,engagementMode:e.target.value as 'canvas'|'financial'}))}>
              <option value="canvas">Full GtCV Canvas Engagement</option>
              <option value="financial">Clearview Financial Only</option>
            </select>
            <div style={hint}>{f.engagementMode==='canvas'?'Full nine Decision Points with CEO sign-off. For Ignite and direct clients.':'Clearview financial workspace only. For Palladium CSJ clients.'}</div>
          </div>
          <div><label style={lbl}>Programme</label>
            <select style={inp} value={f.programmeId} onChange={e=>setF(x=>({...x,programmeId:e.target.value}))}>
              {programmes.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Country</label><input style={inp} value={f.country} onChange={e=>setF(x=>({...x,country:e.target.value}))}/></div>
          <div><label style={lbl}>Sector</label><input style={inp} value={f.sector} onChange={e=>setF(x=>({...x,sector:e.target.value}))}/></div>
          <div><label style={lbl}>CEO / Executive Director</label><input style={inp} value={f.contactName} onChange={e=>setF(x=>({...x,contactName:e.target.value}))}/></div>
          <div><label style={lbl}>Contact Email</label><input type="email" style={inp} value={f.contactEmail} onChange={e=>setF(x=>({...x,contactEmail:e.target.value}))}/></div>
          <div style={{gridColumn:'1/-1'}}><label style={lbl}>Notes</label><textarea style={{...inp,minHeight:70,resize:'vertical'}} value={f.notes} onChange={e=>setF(x=>({...x,notes:e.target.value}))}/></div>
        </div>
        <div style={{display:'flex',gap:'0.6rem',marginTop:'0.85rem'}}>
          <button style={solidBtn()} onClick={save}>Create Client</button>
          <button style={{...addBtn(),borderColor:C.border,color:C.slate}} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    )
  }

  function NewProgrammeForm({onSave,onCancel}:{onSave:(p:Programme)=>void;onCancel:()=>void}) {
    const [f,setF]=useState({name:'',type:'donor_programme' as Programme['type'],funder:'',country:'Uganda',startDate:'',endDate:'',notes:''})
    return (
      <div style={{...card,background:'#F4F8FC',border:`1px solid ${C.cyan}`,marginBottom:'1.25rem'}}>
        <div style={secH}>New Programme</div>
        <div style={fGrid}>
          <div><label style={lbl}>Programme Name *</label><input style={inp} value={f.name} onChange={e=>setF(x=>({...x,name:e.target.value}))}/></div>
          <div><label style={lbl}>Type</label>
            <select style={inp} value={f.type} onChange={e=>setF(x=>({...x,type:e.target.value as Programme['type']}))}>
              <option value="donor_programme">Donor Programme</option>
              <option value="direct_client">Direct Client</option>
              <option value="blended">Blended</option>
            </select>
          </div>
          <div><label style={lbl}>Funder *</label><input style={inp} value={f.funder} onChange={e=>setF(x=>({...x,funder:e.target.value}))} placeholder="e.g. FCDO, Ignite"/></div>
          <div><label style={lbl}>Country</label><input style={inp} value={f.country} onChange={e=>setF(x=>({...x,country:e.target.value}))}/></div>
          <div><label style={lbl}>Start Date</label><input type="date" style={inp} value={f.startDate} onChange={e=>setF(x=>({...x,startDate:e.target.value}))}/></div>
          <div><label style={lbl}>End Date</label><input type="date" style={inp} value={f.endDate} onChange={e=>setF(x=>({...x,endDate:e.target.value}))}/></div>
          <div style={{gridColumn:'1/-1'}}><label style={lbl}>Notes</label><textarea style={{...inp,minHeight:70,resize:'vertical'}} value={f.notes} onChange={e=>setF(x=>({...x,notes:e.target.value}))}/></div>
        </div>
        <div style={{display:'flex',gap:'0.6rem',marginTop:'0.85rem'}}>
          <button style={solidBtn()} onClick={()=>{if(!f.name||!f.funder)return;onSave({...f,id:`prog_${Date.now()}`,clientIds:[],coImplementerIds:[],funderEmail:'',funderInvited:false})}}>Create Programme</button>
          <button style={{...addBtn(),borderColor:C.border,color:C.slate}} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    )
  }

  function NewCIForm({clients,programmes,onSave,onCancel}:{clients:EngagementClient[];programmes:Programme[];onSave:(ci:CoImplementer)=>void;onCancel:()=>void}) {
    const [f,setF]=useState({name:'',email:'',phone:'',country:'Uganda',specialisation:'',ratePerDay:0,currency:'USD',programmeIds:[] as string[],clientIds:[] as string[],notes:''})
    return (
      <div style={{...card,background:'#F4F8FC',border:`1px solid ${C.cyan}`,marginBottom:'1.25rem'}}>
        <div style={secH}>Add Co-Implementer</div>
        <div style={fGrid}>
          <div><label style={lbl}>Full Name *</label><input style={inp} value={f.name} onChange={e=>setF(x=>({...x,name:e.target.value}))}/></div>
          <div><label style={lbl}>Email *</label><input type="email" style={inp} value={f.email} onChange={e=>setF(x=>({...x,email:e.target.value}))}/></div>
          <div><label style={lbl}>Phone</label><input style={inp} value={f.phone} onChange={e=>setF(x=>({...x,phone:e.target.value}))}/></div>
          <div><label style={lbl}>Country</label><input style={inp} value={f.country} onChange={e=>setF(x=>({...x,country:e.target.value}))}/></div>
          <div><label style={lbl}>Specialisation</label><input style={inp} value={f.specialisation} onChange={e=>setF(x=>({...x,specialisation:e.target.value}))} placeholder="e.g. Market Systems, Agri Finance"/></div>
          <div><label style={lbl}>Daily Rate</label><input type="number" style={inp} value={f.ratePerDay||''} onChange={e=>setF(x=>({...x,ratePerDay:Number(e.target.value)}))}/></div>
          <div><label style={lbl}>Currency</label>
            <select style={inp} value={f.currency} onChange={e=>setF(x=>({...x,currency:e.target.value}))}>
              <option>USD</option><option>GBP</option><option>EUR</option><option>UGX</option>
            </select>
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <label style={lbl}>Assign to Clients</label>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:'0.35rem',marginTop:'0.3rem'}}>
              {clients.map(c=>(
                <label key={c.id} style={{display:'flex',alignItems:'center',gap:'0.45rem',fontSize:'0.8rem',cursor:'pointer',padding:'0.3rem 0.5rem',border:`1px solid ${f.clientIds.includes(c.id)?C.cyan:C.border}`,borderRadius:4,background:f.clientIds.includes(c.id)?'#EAF7F8':C.white}}>
                  <input type="checkbox" checked={f.clientIds.includes(c.id)} onChange={e=>setF(x=>({...x,clientIds:e.target.checked?[...x.clientIds,c.id]:x.clientIds.filter(id=>id!==c.id)}))}/>
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div style={{display:'flex',gap:'0.6rem',marginTop:'0.85rem'}}>
          <button style={solidBtn()} onClick={()=>{if(!f.name||!f.email)return;onSave({...f,id:`ci_${Date.now()}`,active:true})}}>Add Co-Implementer</button>
          <button style={{...addBtn(),borderColor:C.border,color:C.slate}} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    )
  }

  // ── RENDER ───────────────────────────────────────────────
  const tabs:[string,string][]=[
    ['overview','Overview'],
    ['clients','All Clients'],
    ['programmes','Programmes'],
    ['team','Team'],
  ]

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.cream,color:C.navy,minHeight:'100vh'}}>
      <header style={{background:C.navy,borderBottom:`3px solid ${C.cyan}`}}>
        <div style={{maxWidth:1440,margin:'0 auto',padding:'1.25rem 1.5rem',display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'1rem'}}>
          <div>
            <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.15em',color:C.cyan,marginBottom:'0.28rem'}}>CANVAS COACH — COACH DASHBOARD</div>
            <h1 style={{fontFamily:'Georgia,serif',fontSize:'1.5rem',fontWeight:700,color:C.white,margin:'0.1rem 0 0.15rem'}}>Habib Onifade</h1>
            <div style={{fontSize:'0.76rem',color:'rgba(255,255,255,0.6)'}}>
              {activeC.length} active · {state.programmes.length} programmes · {clearviewLive.length} Clearview live · {canvasC.length} canvas engagement{canvasC.length!==1?'s':''}
              {pending>0&&<span style={{marginLeft:8,color:C.amber}}>· ⏳ {pending} pending</span>}
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
            <span style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.cyan,border:`1px solid rgba(0,180,216,0.4)`,borderRadius:4,padding:'0.18rem 0.5rem'}}>Super Coach</span>
            <button onClick={onSignOut} style={{fontFamily:'monospace',fontSize:'0.65rem',background:'transparent',border:`1px solid rgba(255,255,255,0.25)`,borderRadius:4,color:'rgba(255,255,255,0.6)',cursor:'pointer',padding:'0.18rem 0.5rem'}}>Sign out</button>
          </div>
        </div>
      </header>
      <nav style={{background:'#142038',borderBottom:`1px solid rgba(0,180,216,0.15)`,overflowX:'auto'}}>
        <div style={{maxWidth:1440,margin:'0 auto',padding:'0 1.5rem',display:'flex'}}>
          {tabs.map(([id,label])=>(
            <button key={id} style={navBtn(view===id||(view==='client'&&id==='clients'))} onClick={()=>{setView(id);if(id!=='client')setSelClient(null)}}>{label}</button>
          ))}
        </div>
      </nav>
      <main style={{maxWidth:1440,margin:'0 auto',padding:'1.5rem'}}>
        {view==='overview'   &&<OverviewTab/>}
        {view==='clients'    &&<ClientsTab/>}
        {view==='client'     &&<ClientDetail/>}
        {view==='programmes' &&<ProgrammesTab/>}
        {view==='team'       &&<TeamTab/>}
      </main>
      <footer style={{textAlign:'center',padding:'1.5rem',fontFamily:'monospace',fontSize:'0.67rem',color:C.slate,borderTop:`1px solid ${C.border}`,marginTop:'2rem'}}>
        Canvas Coach · Coach Dashboard · habibonifade.com · Confidential
      </footer>
    </div>
  )
}
