'use client'
import { useState, useMemo } from 'react'
import {
  defaultCoachState, statusLabel, statusColor, CLIENT_TYPE_LABELS,
  CLIENT_TYPE_COLORS, DP_LABELS,
  type CoachState, type EngagementClient, type Programme,
  type ClientType, type DPStatus, type EngagementStatus,
} from '@/lib/coach-types'

// ── Design tokens ────────────────────────────────────────────
const C = {
  navy:'#1B2A4A', cyan:'#00B4D8', cream:'#F8F4EE', white:'#FFFFFF',
  slate:'#4A5A6A', border:'#D8E0E8', teal:'#1A9DAA',
  red:'#C0392B', green:'#1A7A4A', amber:'#B8860B', purple:'#6B4A8B',
}

const card: React.CSSProperties  = {background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}
const secH: React.CSSProperties  = {fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy,marginBottom:'0.75rem'}
const inp:  React.CSSProperties  = {width:'100%',padding:'0.42rem 0.6rem',border:`1px solid ${C.border}`,borderRadius:4,fontSize:'0.83rem',fontFamily:'inherit',background:'#F4F8FC',color:C.navy,boxSizing:'border-box'}
const lbl:  React.CSSProperties  = {display:'block',fontWeight:600,fontSize:'0.8rem',marginBottom:'0.22rem',color:C.navy}
const fGrid:React.CSSProperties  = {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:'1rem'}
const hint: React.CSSProperties  = {fontSize:'0.7rem',color:C.slate,lineHeight:1.4,marginTop:'0.18rem'}

function navBtn(active:boolean):React.CSSProperties {
  return {fontFamily:'monospace',fontSize:'0.72rem',padding:'0.72rem 1rem',border:'none',background:'transparent',
    color:active?C.cyan:'rgba(255,255,255,0.6)',cursor:'pointer',
    borderBottom:active?`3px solid ${C.cyan}`:'3px solid transparent',
    fontWeight:active?700:400,whiteSpace:'nowrap'}
}
function addBtn(sm=false):React.CSSProperties {
  return {fontFamily:'monospace',fontSize:sm?'0.68rem':'0.72rem',padding:sm?'0.28rem 0.6rem':'0.38rem 0.8rem',
    border:`1px solid ${C.cyan}`,borderRadius:4,background:'transparent',color:C.cyan,cursor:'pointer'}
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

function DPBadge({status}:{status?:DPStatus}) {
  const col = status==='✓'?C.green:status==='◐'?C.cyan:status==='⚠'?C.amber:C.border
  return <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:20,height:20,borderRadius:'50%',background:col,color:C.white,fontSize:'0.65rem',fontWeight:700}}>{status||'○'}</span>
}

// ── MAIN COMPONENT ───────────────────────────────────────────
export default function CoachDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [state, setState] = useState<CoachState>(() => {
    try {
      const stored = localStorage.getItem('coach-state-v1')
      if (stored) return JSON.parse(stored) as CoachState
    } catch { /* ignore */ }
    return defaultCoachState()
  })
  const [view, setView]     = useState('overview')
  const [selectedClient, setSelectedClient] = useState<string|null>(null)
  const [selectedProg, setSelectedProg]   = useState<string|null>(null)
  const [showNewClient, setShowNewClient] = useState(false)
  const [showNewProg, setShowNewProg]     = useState(false)
  const [showNewCI, setShowNewCI]         = useState(false)

  function save(next: CoachState) {
    setState(next)
    try { localStorage.setItem('coach-state-v1', JSON.stringify(next)) } catch { /* ignore */ }
  }

  function updateClient(id: string, updates: Partial<EngagementClient>) {
    save({...state, clients: state.clients.map(c => c.id!==id ? c : {...c,...updates})})
  }
  function updateProg(id: string, updates: Partial<Programme>) {
    save({...state, programmes: state.programmes.map(p => p.id!==id ? p : {...p,...updates})})
  }

  const allClients   = state.clients
  const activeClients = allClients.filter(c => c.status !== 'complete' && c.status !== 'paused')
  const clearviewLive = allClients.filter(c => c.clearviewActive)

  // ── OVERVIEW TAB ─────────────────────────────────────────
  function OverviewTab() {
    return (
      <div>
        {/* KPI strip */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
          <KPI label="Active Engagements" value={String(activeClients.length)}/>
          <KPI label="Programmes" value={String(state.programmes.length)}/>
          <KPI label="Clearview Live" value={String(clearviewLive.length)} color={C.teal}/>
          <KPI label="Co-Implementers" value={String(state.coImplementers.length)}/>
          <KPI label="Complete" value={String(allClients.filter(c=>c.status==='complete').length)} color={C.green}/>
        </div>

        {/* Programme cards */}
        {state.programmes.map(prog => {
          const clients = allClients.filter(c => prog.clientIds.includes(c.id))
          return (
            <div key={prog.id} style={card}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'1rem',flexWrap:'wrap',gap:'0.5rem'}}>
                <div>
                  <div style={{fontFamily:'Georgia,serif',fontSize:'1.1rem',fontWeight:700,color:C.navy}}>{prog.name}</div>
                  <div style={{fontSize:'0.77rem',color:C.slate,marginTop:'0.2rem'}}>
                    {prog.funder} · {prog.country} · {prog.type==='donor_programme'?'Donor Programme':prog.type==='direct_client'?'Direct Client':'Blended'}
                    {prog.startDate && ` · ${new Date(prog.startDate).toLocaleDateString('en-GB',{month:'short',year:'numeric'})} – ${new Date(prog.endDate).toLocaleDateString('en-GB',{month:'short',year:'numeric'})}`}
                  </div>
                </div>
                <div style={{display:'flex',gap:'0.5rem'}}>
                  <button style={addBtn(true)} onClick={()=>{setSelectedProg(prog.id);setView('programmes')}}>Manage →</button>
                </div>
              </div>
              {/* Client grid within programme */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:'0.75rem'}}>
                {clients.map(c => (
                  <div key={c.id} style={{border:`1px solid ${C.border}`,borderTop:`3px solid ${CLIENT_TYPE_COLORS[c.type]}`,borderRadius:6,padding:'0.75rem 0.9rem',background:C.white}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.35rem'}}>
                      <div style={{fontWeight:700,fontSize:'0.85rem',color:C.navy}}>{c.name}</div>
                      {c.clearviewActive && <span style={{fontFamily:'monospace',fontSize:'0.6rem',color:C.teal,border:`1px solid ${C.teal}`,borderRadius:3,padding:'0.08rem 0.35rem'}}>LIVE</span>}
                    </div>
                    <div style={{fontSize:'0.7rem',color:C.slate,marginBottom:'0.5rem'}}>{CLIENT_TYPE_LABELS[c.type]}</div>
                    <div style={{display:'flex',alignItems:'center',gap:'0.4rem',marginBottom:'0.5rem'}}>
                      <span style={{fontFamily:'monospace',fontSize:'0.65rem',padding:'0.12rem 0.45rem',borderRadius:4,background:statusColor(c.status),color:C.white}}>{statusLabel(c.status)}</span>
                    </div>
                    {/* DP progress dots */}
                    <div style={{display:'flex',gap:'0.2rem',flexWrap:'wrap',marginBottom:'0.55rem'}}>
                      {['phase_0','dp01','dp02','dp03','dp04','dp05','dp06','dp07','dp08','dp09'].map(dp => (
                        <DPBadge key={dp} status={c.dpStatus[dp]}/>
                      ))}
                    </div>
                    <button style={addBtn(true)} onClick={()=>{setSelectedClient(c.id);setView('client')}}>Open →</button>
                  </div>
                ))}
                <div style={{border:`2px dashed ${C.border}`,borderRadius:6,padding:'0.75rem 0.9rem',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:C.slate,fontSize:'0.82rem'}}
                  onClick={()=>{setSelectedProg(prog.id);setShowNewClient(true);setView('clients')}}>
                  + Add client to {prog.name}
                </div>
              </div>
            </div>
          )
        })}

        {/* Add programme */}
        <button style={{...addBtn(),marginBottom:'1rem'}} onClick={()=>setShowNewProg(true)}>+ Add Programme</button>

        {showNewProg && <NewProgrammeForm onSave={prog=>{save({...state,programmes:[...state.programmes,prog]});setShowNewProg(false)}} onCancel={()=>setShowNewProg(false)}/>}
      </div>
    )
  }

  // ── CLIENTS TAB ──────────────────────────────────────────
  function ClientsTab() {
    const [filter, setFilter] = useState<string>('all')
    const filtered = filter==='all' ? allClients : allClients.filter(c => c.type===filter || c.programmeId===filter || c.status===filter)

    return (
      <div>
        <div style={{display:'flex',gap:'0.5rem',alignItems:'center',marginBottom:'1.25rem',flexWrap:'wrap'}}>
          {['all','crop_aggregator','livestock_aggregator','farmer_group_enterprise','service_lsp'].map(f=>(
            <button key={f} style={{fontFamily:'monospace',fontSize:'0.7rem',padding:'0.35rem 0.7rem',border:`1px solid ${filter===f?C.cyan:C.border}`,borderRadius:4,background:filter===f?C.cyan:C.white,color:filter===f?C.navy:C.slate,cursor:'pointer'}}
              onClick={()=>setFilter(f)}>
              {f==='all'?'All Clients':CLIENT_TYPE_LABELS[f as ClientType]}
            </button>
          ))}
          <button style={{...addBtn(),marginLeft:'auto'}} onClick={()=>setShowNewClient(!showNewClient)}>+ New Client</button>
        </div>

        {showNewClient && <NewClientForm programmes={state.programmes} onSave={client=>{save({...state,clients:[...state.clients,client]});setShowNewClient(false)}} onCancel={()=>setShowNewClient(false)}/>}

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'1rem'}}>
          {filtered.map(c => {
            const prog = state.programmes.find(p=>p.id===c.programmeId)
            return (
              <div key={c.id} style={{background:C.white,border:`1px solid ${C.border}`,borderTop:`4px solid ${CLIENT_TYPE_COLORS[c.type]}`,borderRadius:8,padding:'1rem 1.1rem',cursor:'pointer'}}
                onClick={()=>{setSelectedClient(c.id);setView('client')}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.4rem'}}>
                  <div style={{fontWeight:700,fontSize:'0.9rem',color:C.navy}}>{c.name}</div>
                  {c.clearviewActive && <span style={{fontFamily:'monospace',fontSize:'0.6rem',color:C.teal,border:`1px solid ${C.teal}`,borderRadius:3,padding:'0.08rem 0.35rem'}}>CLEARVIEW LIVE</span>}
                </div>
                <div style={{fontSize:'0.72rem',color:C.slate,marginBottom:'0.35rem'}}>{CLIENT_TYPE_LABELS[c.type]} · {prog?.name||'No programme'}</div>
                {c.contactName && <div style={{fontSize:'0.75rem',color:C.navy,marginBottom:'0.35rem'}}>{c.contactName}</div>}
                <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'0.6rem'}}>
                  <span style={{fontFamily:'monospace',fontSize:'0.65rem',padding:'0.12rem 0.45rem',borderRadius:4,background:statusColor(c.status),color:C.white}}>{statusLabel(c.status)}</span>
                  <span style={{fontSize:'0.7rem',color:C.slate}}>{c.country}</span>
                </div>
                <div style={{display:'flex',gap:'0.25rem',flexWrap:'wrap'}}>
                  {['phase_0','dp01','dp02','dp03','dp04','dp05','dp06','dp07','dp08','dp09'].map(dp=>(
                    <DPBadge key={dp} status={c.dpStatus[dp]}/>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── CLIENT DETAIL ────────────────────────────────────────
  function ClientDetail() {
    const client = state.clients.find(c=>c.id===selectedClient)
    if (!client) return <div style={{color:C.slate,padding:'2rem'}}>Client not found.</div>

    const prog = state.programmes.find(p=>p.id===client.programmeId)
    const [editing, setEditing] = useState(false)
    const [form, setForm] = useState({...client!})

    const dps = ['phase_0','dp01','dp02','dp03','dp04','dp05','dp06','dp07','dp08','dp09']

    function saveClient() {
      if(client) updateClient(client.id, form)
      setEditing(false)
    }

    return (
      <div>
        <button style={{fontFamily:'monospace',fontSize:'0.72rem',color:C.slate,background:'transparent',border:'none',cursor:'pointer',marginBottom:'1rem'}} onClick={()=>setView('clients')}>← Back to clients</button>

        {/* Header */}
        <div style={{...card,background:C.navy,color:C.white,marginBottom:'1.25rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'1rem'}}>
            <div>
              <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.12em',color:C.cyan,marginBottom:'0.35rem'}}>
                {CLIENT_TYPE_LABELS[client.type]} · {prog?.name||'No programme'}
              </div>
              <h2 style={{fontFamily:'Georgia,serif',fontSize:'1.4rem',fontWeight:700,color:C.white,margin:'0 0 0.3rem'}}>{client.name}</h2>
              <div style={{fontSize:'0.77rem',color:'rgba(255,255,255,0.6)'}}>
                {client.contactName && `${client.contactName} · `}{client.country} · {client.sector}
              </div>
            </div>
            <div style={{display:'flex',gap:'0.6rem',alignItems:'center',flexWrap:'wrap'}}>
              <span style={{fontFamily:'monospace',fontSize:'0.7rem',padding:'0.25rem 0.65rem',borderRadius:4,background:statusColor(client.status),color:C.white}}>{statusLabel(client.status)}</span>
              {client.clearviewActive && (
                <a href={`/dashboard/${client.slug}`} target="_blank" rel="noreferrer"
                  style={{fontFamily:'monospace',fontSize:'0.7rem',padding:'0.25rem 0.65rem',borderRadius:4,background:C.teal,color:C.white,textDecoration:'none'}}>
                  Open Clearview →
                </a>
              )}
              <button style={{fontFamily:'monospace',fontSize:'0.7rem',padding:'0.25rem 0.65rem',border:`1px solid rgba(255,255,255,0.3)`,borderRadius:4,background:'transparent',color:'rgba(255,255,255,0.8)',cursor:'pointer'}} onClick={()=>setEditing(!editing)}>
                {editing?'Cancel':'Edit'}
              </button>
            </div>
          </div>
        </div>

        {/* Edit form */}
        {editing && (
          <div style={card}>
            <div style={secH}>Edit Client Details</div>
            <div style={fGrid}>
              <div><label style={lbl}>Client Name</label><input style={inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
              <div><label style={lbl}>Contact Name</label><input style={inp} value={form.contactName} onChange={e=>setForm(f=>({...f,contactName:e.target.value}))}/></div>
              <div><label style={lbl}>Contact Email</label><input style={inp} value={form.contactEmail} onChange={e=>setForm(f=>({...f,contactEmail:e.target.value}))}/></div>
              <div><label style={lbl}>Contact Phone</label><input style={inp} value={form.contactPhone} onChange={e=>setForm(f=>({...f,contactPhone:e.target.value}))}/></div>
              <div><label style={lbl}>Country</label><input style={inp} value={form.country} onChange={e=>setForm(f=>({...f,country:e.target.value}))}/></div>
              <div><label style={lbl}>Sector</label><input style={inp} value={form.sector} onChange={e=>setForm(f=>({...f,sector:e.target.value}))}/></div>
              <div><label style={lbl}>Current Status</label>
                <select style={inp} value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value as EngagementStatus}))}>
                  {['setup','phase_0','dp01','dp02','dp03','dp04','dp05','dp06','dp07','dp08','dp09','complete','paused'].map(s=>(
                    <option key={s} value={s}>{statusLabel(s as EngagementStatus)}</option>
                  ))}
                </select>
              </div>
              <div><label style={lbl}>Clearview Active</label>
                <select style={inp} value={form.clearviewActive?'yes':'no'} onChange={e=>setForm(f=>({...f,clearviewActive:e.target.value==='yes'}))}>
                  <option value="no">Not yet</option><option value="yes">Live</option>
                </select>
              </div>
              <div><label style={lbl}>Start Date</label><input type="date" style={inp} value={form.startDate} onChange={e=>setForm(f=>({...f,startDate:e.target.value}))}/></div>
              <div><label style={lbl}>Expected Close</label><input type="date" style={inp} value={form.expectedClose} onChange={e=>setForm(f=>({...f,expectedClose:e.target.value}))}/></div>
              <div style={{gridColumn:'1/-1'}}><label style={lbl}>Notes</label><textarea style={{...inp,minHeight:80,resize:'vertical'}} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
            </div>
            <button style={{marginTop:'0.85rem',fontFamily:'monospace',fontSize:'0.78rem',fontWeight:600,padding:'0.5rem 1.1rem',border:'none',borderRadius:4,background:C.cyan,color:C.navy,cursor:'pointer'}} onClick={saveClient}>Save Changes</button>
          </div>
        )}

        {/* DP tracker */}
        <div style={card}>
          <div style={secH}>Engagement Tracker — Nine Decision Points</div>
          <p style={{...hint,fontSize:'0.78rem',lineHeight:1.55,marginBottom:'1rem'}}>Update status after every session. Open tracker first at the start of every session. Any DP01 or DP02 showing ⚠ takes priority over all downstream work.</p>
          <div style={{display:'grid',gap:'0.5rem'}}>
            {dps.map(dp => {
              const status = client.dpStatus[dp] || '○'
              const label = DP_LABELS[dp] || dp
              return (
                <div key={dp} style={{display:'flex',alignItems:'center',gap:'0.75rem',padding:'0.65rem 0.85rem',border:`1px solid ${C.border}`,borderRadius:6,background:status==='✓'?'#F0F9F4':status==='◐'?'#E8F6F8':status==='⚠'?'#FFF8E8':C.white}}>
                  <DPBadge status={status}/>
                  <span style={{flex:1,fontSize:'0.83rem',fontWeight:status==='✓'?600:400,color:C.navy}}>{label}</span>
                  <select value={status}
                    onChange={e=>updateClient(client.id,{dpStatus:{...client.dpStatus,[dp]:e.target.value as DPStatus}})}
                    style={{fontFamily:'monospace',fontSize:'0.72rem',padding:'0.22rem 0.4rem',border:`1px solid ${C.border}`,borderRadius:4,background:'transparent',color:C.navy,cursor:'pointer'}}>
                    <option value="○">○ Not Started</option>
                    <option value="◐">◐ In Progress</option>
                    <option value="✓">✓ Complete</option>
                    <option value="⚠">⚠ Needs Revisiting</option>
                  </select>
                </div>
              )
            })}
          </div>
        </div>

        {/* Client details grid */}
        {!editing && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:'1rem'}}>
            <div style={card}>
              <div style={secH}>Contact</div>
              {client.contactName && <div style={{marginBottom:'0.4rem'}}><strong>{client.contactName}</strong></div>}
              {client.contactEmail && <div style={{fontSize:'0.82rem',color:C.slate,marginBottom:'0.25rem'}}>✉ {client.contactEmail}</div>}
              {client.contactPhone && <div style={{fontSize:'0.82rem',color:C.slate}}>📞 {client.contactPhone}</div>}
              {!client.contactName && !client.contactEmail && <div style={{color:C.slate,fontSize:'0.82rem'}}>No contact details yet. Click Edit to add.</div>}
            </div>
            <div style={card}>
              <div style={secH}>Engagement</div>
              <div style={{fontSize:'0.82rem',color:C.slate,lineHeight:1.8}}>
                <div>Programme: <strong style={{color:C.navy}}>{prog?.name||'—'}</strong></div>
                <div>Start: <strong style={{color:C.navy}}>{client.startDate?new Date(client.startDate).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—'}</strong></div>
                <div>Expected close: <strong style={{color:C.navy}}>{client.expectedClose?new Date(client.expectedClose).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—'}</strong></div>
                <div>Clearview: <strong style={{color:client.clearviewActive?C.teal:C.slate}}>{client.clearviewActive?'Live':'Not yet active'}</strong></div>
              </div>
            </div>
            {client.notes && (
              <div style={card}>
                <div style={secH}>Notes</div>
                <div style={{fontSize:'0.82rem',color:C.slate,lineHeight:1.6}}>{client.notes}</div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── PROGRAMMES TAB ───────────────────────────────────────
  function ProgrammesTab() {
    const prog = selectedProg ? state.programmes.find(p=>p.id===selectedProg) : null

    if (prog) {
      const clients = state.clients.filter(c=>prog.clientIds.includes(c.id))
      return (
        <div>
          <button style={{fontFamily:'monospace',fontSize:'0.72rem',color:C.slate,background:'transparent',border:'none',cursor:'pointer',marginBottom:'1rem'}} onClick={()=>setSelectedProg(null)}>← Back to programmes</button>
          <div style={{...card,background:C.navy,color:C.white}}>
            <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.12em',color:C.cyan,marginBottom:'0.35rem'}}>{prog.type==='donor_programme'?'DONOR PROGRAMME':'DIRECT CLIENT'}</div>
            <h2 style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:C.white,margin:'0 0 0.2rem'}}>{prog.name}</h2>
            <div style={{fontSize:'0.77rem',color:'rgba(255,255,255,0.6)'}}>{prog.funder} · {prog.country}</div>
          </div>
          <div style={card}>
            <div style={secH}>Client Organisations ({clients.length})</div>
            {clients.map(c=>(
              <div key={c.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.6rem 0.75rem',border:`1px solid ${C.border}`,borderRadius:5,marginBottom:'0.5rem',background:C.white}}>
                <div>
                  <div style={{fontWeight:600,fontSize:'0.85rem'}}>{c.name}</div>
                  <div style={{fontSize:'0.72rem',color:C.slate}}>{CLIENT_TYPE_LABELS[c.type]} · {statusLabel(c.status)}</div>
                </div>
                <button style={addBtn(true)} onClick={()=>{setSelectedClient(c.id);setView('client')}}>Open →</button>
              </div>
            ))}
          </div>
          <div style={card}>
            <div style={secH}>Programme Details</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'1rem',fontSize:'0.83rem',color:C.slate,lineHeight:1.8}}>
              <div>Funder: <strong style={{color:C.navy}}>{prog.funder}</strong></div>
              <div>Country: <strong style={{color:C.navy}}>{prog.country}</strong></div>
              <div>Start: <strong style={{color:C.navy}}>{prog.startDate?new Date(prog.startDate).toLocaleDateString('en-GB',{month:'short',year:'numeric'}):'—'}</strong></div>
              <div>End: <strong style={{color:C.navy}}>{prog.endDate?new Date(prog.endDate).toLocaleDateString('en-GB',{month:'short',year:'numeric'}):'—'}</strong></div>
            </div>
            {prog.notes && <div style={{marginTop:'0.75rem',fontSize:'0.82rem',color:C.slate,lineHeight:1.6}}>{prog.notes}</div>}
          </div>
        </div>
      )
    }

    return (
      <div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem'}}>
          <div style={secH}>All Programmes</div>
          <button style={addBtn()} onClick={()=>setShowNewProg(true)}>+ New Programme</button>
        </div>
        {showNewProg && <NewProgrammeForm onSave={prog=>{save({...state,programmes:[...state.programmes,prog]});setShowNewProg(false)}} onCancel={()=>setShowNewProg(false)}/>}
        {state.programmes.map(p=>{
          const clients = state.clients.filter(c=>p.clientIds.includes(c.id))
          return (
            <div key={p.id} style={{...card,cursor:'pointer'}} onClick={()=>setSelectedProg(p.id)}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div>
                  <div style={{fontFamily:'Georgia,serif',fontSize:'1rem',fontWeight:700,color:C.navy,marginBottom:'0.25rem'}}>{p.name}</div>
                  <div style={{fontSize:'0.77rem',color:C.slate}}>{p.funder} · {p.country} · {clients.length} client{clients.length!==1?'s':''}</div>
                </div>
                <span style={{fontFamily:'monospace',fontSize:'0.65rem',padding:'0.15rem 0.5rem',borderRadius:4,background:p.type==='donor_programme'?C.amber:C.teal,color:C.white}}>{p.type==='donor_programme'?'Donor':'Direct'}</span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── CO-IMPLEMENTERS TAB ──────────────────────────────────
  function CoImplementersTab() {
    return (
      <div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem'}}>
          <div style={secH}>Co-Implementers</div>
          <button style={addBtn()} onClick={()=>setShowNewCI(true)}>+ Add Co-Implementer</button>
        </div>
        {showNewCI && (
          <div style={card}>
            <div style={secH}>Add Co-Implementer</div>
            <NewCIForm programmes={state.programmes} clients={state.clients}
              onSave={ci=>{save({...state,coImplementers:[...state.coImplementers,ci]});setShowNewCI(false)}}
              onCancel={()=>setShowNewCI(false)}/>
          </div>
        )}
        {state.coImplementers.length===0 ? (
          <div style={{...card,color:C.slate,textAlign:'center',padding:'2.5rem'}}>
            No co-implementers yet. Add one using the button above.
            <div style={{fontSize:'0.78rem',marginTop:'0.5rem',lineHeight:1.5}}>Co-implementers are assigned to specific programmes and clients. They see only the clients assigned to them.</div>
          </div>
        ) : (
          state.coImplementers.map(ci=>(
            <div key={ci.id} style={card}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div>
                  <div style={{fontWeight:700,fontSize:'0.9rem',color:C.navy,marginBottom:'0.25rem'}}>{ci.name}</div>
                  <div style={{fontSize:'0.77rem',color:C.slate}}>{ci.email} · {ci.country}</div>
                  {ci.specialisation && <div style={{fontSize:'0.75rem',color:C.slate,marginTop:'0.2rem'}}>{ci.specialisation}</div>}
                </div>
                <div style={{fontFamily:'monospace',fontSize:'0.65rem',color:ci.active?C.green:C.red}}>{ci.active?'Active':'Inactive'}</div>
              </div>
              {ci.clientIds.length>0 && (
                <div style={{marginTop:'0.65rem',fontSize:'0.75rem',color:C.slate}}>
                  Assigned to: {ci.clientIds.map(id=>state.clients.find(c=>c.id===id)?.name||id).join(', ')}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    )
  }

  // ── FORM COMPONENTS ──────────────────────────────────────
  function NewClientForm({programmes,onSave,onCancel}:{programmes:Programme[];onSave:(c:EngagementClient)=>void;onCancel:()=>void}) {
    const [f, setF] = useState({name:'',type:'crop_aggregator' as ClientType,programmeId:programmes[0]?.id||'',country:'Uganda',sector:'',contactName:'',contactEmail:'',contactPhone:'',notes:''})
    function save() {
      if (!f.name) return
      const slug = f.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')
      onSave({...f,id:`client_${Date.now()}`,slug,status:'setup',dpStatus:{},startDate:new Date().toISOString().split('T')[0],expectedClose:'',clearviewActive:false})
    }
    return (
      <div style={{...card,background:'#F4F8FC',border:`1px solid ${C.cyan}`}}>
        <div style={secH}>New Client Organisation</div>
        <div style={fGrid}>
          <div><label style={lbl}>Organisation Name *</label><input style={inp} value={f.name} onChange={e=>setF(x=>({...x,name:e.target.value}))} placeholder="e.g. CONAS Agricultural Hub"/></div>
          <div><label style={lbl}>Client Type *</label>
            <select style={inp} value={f.type} onChange={e=>setF(x=>({...x,type:e.target.value as ClientType}))}>
              <option value="crop_aggregator">Crop Aggregator with Input</option>
              <option value="livestock_aggregator">Livestock Aggregator</option>
              <option value="farmer_group_enterprise">Farmer Group Enterprise</option>
              <option value="service_lsp">Service LSP</option>
            </select>
          </div>
          <div><label style={lbl}>Programme</label>
            <select style={inp} value={f.programmeId} onChange={e=>setF(x=>({...x,programmeId:e.target.value}))}>
              {programmes.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Country</label><input style={inp} value={f.country} onChange={e=>setF(x=>({...x,country:e.target.value}))}/></div>
          <div><label style={lbl}>Sector</label><input style={inp} value={f.sector} onChange={e=>setF(x=>({...x,sector:e.target.value}))} placeholder="e.g. Agricultural Services"/></div>
          <div><label style={lbl}>CEO / Executive Director Name</label><input style={inp} value={f.contactName} onChange={e=>setF(x=>({...x,contactName:e.target.value}))}/></div>
          <div><label style={lbl}>Contact Email</label><input type="email" style={inp} value={f.contactEmail} onChange={e=>setF(x=>({...x,contactEmail:e.target.value}))}/></div>
          <div style={{gridColumn:'1/-1'}}><label style={lbl}>Notes</label><textarea style={{...inp,minHeight:70,resize:'vertical'}} value={f.notes} onChange={e=>setF(x=>({...x,notes:e.target.value}))}/></div>
        </div>
        <div style={{display:'flex',gap:'0.6rem',marginTop:'0.85rem'}}>
          <button style={{fontFamily:'monospace',fontSize:'0.78rem',fontWeight:600,padding:'0.5rem 1.1rem',border:'none',borderRadius:4,background:C.cyan,color:C.navy,cursor:'pointer'}} onClick={save}>Create Client</button>
          <button style={{fontFamily:'monospace',fontSize:'0.78rem',padding:'0.5rem 0.9rem',border:`1px solid ${C.border}`,borderRadius:4,background:'transparent',color:C.slate,cursor:'pointer'}} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    )
  }

  function NewProgrammeForm({onSave,onCancel}:{onSave:(p:Programme)=>void;onCancel:()=>void}) {
    const [f, setF] = useState({name:'',type:'donor_programme' as Programme['type'],funder:'',country:'Uganda',startDate:'',endDate:'',notes:''})
    function save() {
      if (!f.name||!f.funder) return
      onSave({...f,id:`prog_${Date.now()}`,clientIds:[],coImplementerIds:[]})
    }
    return (
      <div style={{...card,background:'#F4F8FC',border:`1px solid ${C.cyan}`}}>
        <div style={secH}>New Programme</div>
        <div style={fGrid}>
          <div><label style={lbl}>Programme Name *</label><input style={inp} value={f.name} onChange={e=>setF(x=>({...x,name:e.target.value}))} placeholder="e.g. Palladium CSJ"/></div>
          <div><label style={lbl}>Type</label>
            <select style={inp} value={f.type} onChange={e=>setF(x=>({...x,type:e.target.value as Programme['type']}))}>
              <option value="donor_programme">Donor Programme</option>
              <option value="direct_client">Direct Client</option>
              <option value="blended">Blended</option>
            </select>
          </div>
          <div><label style={lbl}>Funder / Client *</label><input style={inp} value={f.funder} onChange={e=>setF(x=>({...x,funder:e.target.value}))} placeholder="e.g. FCDO, Ignite"/></div>
          <div><label style={lbl}>Country</label><input style={inp} value={f.country} onChange={e=>setF(x=>({...x,country:e.target.value}))}/></div>
          <div><label style={lbl}>Start Date</label><input type="date" style={inp} value={f.startDate} onChange={e=>setF(x=>({...x,startDate:e.target.value}))}/></div>
          <div><label style={lbl}>End Date</label><input type="date" style={inp} value={f.endDate} onChange={e=>setF(x=>({...x,endDate:e.target.value}))}/></div>
          <div style={{gridColumn:'1/-1'}}><label style={lbl}>Notes</label><textarea style={{...inp,minHeight:70,resize:'vertical'}} value={f.notes} onChange={e=>setF(x=>({...x,notes:e.target.value}))}/></div>
        </div>
        <div style={{display:'flex',gap:'0.6rem',marginTop:'0.85rem'}}>
          <button style={{fontFamily:'monospace',fontSize:'0.78rem',fontWeight:600,padding:'0.5rem 1.1rem',border:'none',borderRadius:4,background:C.cyan,color:C.navy,cursor:'pointer'}} onClick={save}>Create Programme</button>
          <button style={{fontFamily:'monospace',fontSize:'0.78rem',padding:'0.5rem 0.9rem',border:`1px solid ${C.border}`,borderRadius:4,background:'transparent',color:C.slate,cursor:'pointer'}} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    )
  }

  function NewCIForm({programmes,clients,onSave,onCancel}:{programmes:Programme[];clients:EngagementClient[];onSave:(ci:ReturnType<typeof defaultCoachState>['coImplementers'][0])=>void;onCancel:()=>void}) {
    const [f, setF] = useState({name:'',email:'',phone:'',country:'Uganda',specialisation:'',programmeIds:[] as string[],clientIds:[] as string[],notes:''})
    function save() {
      if (!f.name||!f.email) return
      onSave({...f,id:`ci_${Date.now()}`,active:true})
    }
    return (
      <div style={fGrid}>
        <div><label style={lbl}>Full Name *</label><input style={inp} value={f.name} onChange={e=>setF(x=>({...x,name:e.target.value}))}/></div>
        <div><label style={lbl}>Email *</label><input type="email" style={inp} value={f.email} onChange={e=>setF(x=>({...x,email:e.target.value}))}/></div>
        <div><label style={lbl}>Phone</label><input style={inp} value={f.phone} onChange={e=>setF(x=>({...x,phone:e.target.value}))}/></div>
        <div><label style={lbl}>Country</label><input style={inp} value={f.country} onChange={e=>setF(x=>({...x,country:e.target.value}))}/></div>
        <div><label style={lbl}>Specialisation</label><input style={inp} value={f.specialisation} onChange={e=>setF(x=>({...x,specialisation:e.target.value}))} placeholder="e.g. Market Systems, Agri Finance"/></div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={lbl}>Assign to Clients</label>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:'0.35rem',marginTop:'0.3rem'}}>
            {clients.map(c=>(
              <label key={c.id} style={{display:'flex',alignItems:'center',gap:'0.45rem',fontSize:'0.8rem',cursor:'pointer',padding:'0.3rem 0.5rem',border:`1px solid ${f.clientIds.includes(c.id)?C.cyan:C.border}`,borderRadius:4,background:f.clientIds.includes(c.id)?'#EAF7F8':C.white}}>
                <input type="checkbox" checked={f.clientIds.includes(c.id)} onChange={e=>setF(x=>({...x,clientIds:e.target.checked?[...x.clientIds,c.id]:x.clientIds.filter(id=>id!==c.id)}))}/>
                {c.name}
              </label>
            ))}
          </div>
        </div>
        <div style={{gridColumn:'1/-1',display:'flex',gap:'0.6rem',marginTop:'0.5rem'}}>
          <button style={{fontFamily:'monospace',fontSize:'0.78rem',fontWeight:600,padding:'0.5rem 1.1rem',border:'none',borderRadius:4,background:C.cyan,color:C.navy,cursor:'pointer'}} onClick={save}>Add Co-Implementer</button>
          <button style={{fontFamily:'monospace',fontSize:'0.78rem',padding:'0.5rem 0.9rem',border:`1px solid ${C.border}`,borderRadius:4,background:'transparent',color:C.slate,cursor:'pointer'}} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    )
  }

  // ── RENDER ───────────────────────────────────────────────
  const tabs:[string,string][] = [
    ['overview','Overview'],
    ['clients','Clients'],
    ['programmes','Programmes'],
    ['co_implementers','Co-Implementers'],
  ]

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.cream,color:C.navy,minHeight:'100vh'}}>
      <header style={{background:C.navy,borderBottom:`3px solid ${C.cyan}`}}>
        <div style={{maxWidth:1440,margin:'0 auto',padding:'1.25rem 1.5rem',display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'1rem'}}>
          <div>
            <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.15em',color:C.cyan,marginBottom:'0.28rem'}}>CANVAS COACH — COACH DASHBOARD</div>
            <h1 style={{fontFamily:'Georgia,serif',fontSize:'1.5rem',fontWeight:700,color:C.white,margin:'0.1rem 0 0.15rem'}}>Habib Onifade</h1>
            <div style={{fontSize:'0.76rem',color:'rgba(255,255,255,0.6)'}}>
              {activeClients.length} active engagement{activeClients.length!==1?'s':''} · {state.programmes.length} programme{state.programmes.length!==1?'s':''} · {clearviewLive.length} Clearview live
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
            <span style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.cyan,border:`1px solid rgba(0,180,216,0.4)`,borderRadius:4,padding:'0.18rem 0.5rem'}}>Super Coach</span>
            <button onClick={onSignOut} style={{fontFamily:'monospace',fontSize:'0.65rem',background:'transparent',border:`1px solid rgba(255,255,255,0.25)`,borderRadius:4,color:'rgba(255,255,255,0.6)',cursor:'pointer',padding:'0.18rem 0.5rem'}}>Sign out</button>
          </div>
        </div>
      </header>
      <nav style={{background:'#142038',borderBottom:`1px solid rgba(0,180,216,0.15)`,overflowX:'auto'}}>
        <div style={{maxWidth:1440,margin:'0 auto',padding:'0 1.5rem',display:'flex',gap:0}}>
          {tabs.map(([id,label])=>(
            <button key={id} style={navBtn(view===id||( view==='client'&&id==='clients'))} onClick={()=>{setView(id);if(id!=='client')setSelectedClient(null)}}>{label}</button>
          ))}
        </div>
      </nav>
      <main style={{maxWidth:1440,margin:'0 auto',padding:'1.5rem'}}>
        {view==='overview'        && <OverviewTab/>}
        {view==='clients'         && <ClientsTab/>}
        {view==='client'          && <ClientDetail/>}
        {view==='programmes'      && <ProgrammesTab/>}
        {view==='co_implementers' && <CoImplementersTab/>}
      </main>
      <footer style={{textAlign:'center',padding:'1.5rem',fontFamily:'monospace',fontSize:'0.67rem',color:C.slate,borderTop:`1px solid ${C.border}`,marginTop:'2rem'}}>
        Canvas Coach · Coach Dashboard · habibonifade.com · Confidential
      </footer>
    </div>
  )
}
