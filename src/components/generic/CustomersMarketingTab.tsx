'use client'
// ============================================================
// CUSTOMERS & MARKETING  (BUSINESS > Customers & Marketing)
//
// Self-contained section component for the per-client dashboard. Three
// sub-tabs, held in local state:
//
//   Funnel     -- a per-officer sales/marketing funnel backed by the new
//                 customer_leads table (lead -> prospect -> client). Shows
//                 stage counts + conversion %, a per-officer breakdown, an
//                 add-lead form and per-lead stage advance. Filter by officer.
//   Customers  -- read-only list of field_customers for this client
//                 (name / phone / village), captured in the field app.
//   Campaigns  -- read-only CAC summary of management_events for this client
//                 (channel, cost, customers acquired, cost-per-acquisition).
//
// Styling is intentionally duplicated (not imported) from GenericDashboard's
// design tokens so this file can be wired in without touching anything else:
// same CSS variables (--cv-*), Card surface, Georgia-serif section headers,
// monospace labels, and the shared currency formatter.
//
// Props (loose `any` by request):
//   config    -- { client_id, business_units:[{id,name}], ... }
//   clientId  -- === config.client_id
//   cc        -- currency code string (e.g. 'NGN')
//   P         -- { role, userId, fullName, canManageTeam }
// ============================================================
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ── Design tokens (mirrors GenericDashboard.tsx) ─────────────
const C = {
  navy:'var(--cv-navy)', cyan:'var(--cv-cyan)', cream:'var(--cv-cream)', white:'var(--cv-card)',
  slate:'var(--cv-slate)', border:'var(--cv-border)', teal:'var(--cv-teal)',
  red:'var(--cv-red)', green:'var(--cv-green)', amber:'var(--cv-amber)', purple:'var(--cv-purple)',
  lightBg:'var(--cv-alt)',
}
const card: React.CSSProperties = {background:C.white,border:'1px solid var(--cv-border-soft)',borderRadius:14,padding:'1.4rem 1.6rem',marginBottom:'1.35rem',boxShadow:'0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)'}
const secH: React.CSSProperties = {fontFamily:'Georgia,serif',fontSize:'1.32rem',fontWeight:700,color:C.navy,marginBottom:'0.75rem'}
const inp:  React.CSSProperties = {width:'100%',padding:'0.42rem 0.6rem',border:`1px solid ${C.border}`,borderRadius:4,fontSize:'1.06rem',fontFamily:'inherit',background:'var(--cv-bg-2)',color:C.navy,boxSizing:'border-box'}
const lbl:  React.CSSProperties = {display:'block',fontWeight:600,fontSize:'1.0rem',marginBottom:'0.22rem',color:C.navy}
const fGrid:React.CSSProperties = {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:'1.1rem'}
const addBtn = (sm=false, col=C.cyan): React.CSSProperties => ({fontFamily:'monospace',fontSize:sm?'0.84rem':'0.88rem',padding:sm?'0.28rem 0.6rem':'0.38rem 0.8rem',border:`1px solid ${col}`,borderRadius:4,background:'transparent',color:col,cursor:'pointer'})
const solidBtn = (col=C.cyan, sm=false): React.CSSProperties => ({fontFamily:'monospace',fontSize:sm?'0.88rem':'0.94rem',fontWeight:600,padding:sm?'0.35rem 0.8rem':'0.5rem 1.1rem',border:'none',borderRadius:4,background:col,color:'var(--cv-on-accent)',cursor:'pointer'})

function navBtn(active: boolean): React.CSSProperties {
  return {fontFamily:'monospace',fontSize:'0.96rem',padding:'0.65rem 1rem',border:'none',background:'transparent',
    color:active?C.cyan:'var(--cv-wa-60)',cursor:'pointer',
    borderBottom:active?`3px solid ${C.cyan}`:'3px solid transparent',
    fontWeight:active?700:400,whiteSpace:'nowrap'}
}

function KPI({label,value,sub,color}:{label:string;value:string;sub?:string;color?:string}) {
  const accent = color || C.cyan
  return (
    <div style={{background:C.white,borderRadius:14,padding:'1.15rem 1.3rem 1.25rem',borderTop:`3px solid ${accent}`,boxShadow:'0 1px 2px var(--cv-shadow-1), 0 12px 32px var(--cv-shadow-2)'}}>
      <div style={{fontFamily:'monospace',fontSize:'1.09rem',letterSpacing:'0.14em',color:C.slate,textTransform:'uppercase',marginBottom:'0.45rem'}}>{label}</div>
      <div style={{fontFamily:'Georgia,serif',fontSize:'1.75rem',fontWeight:700,color:color||C.navy,lineHeight:1.05}}>{value}</div>
      {sub&&<div style={{fontSize:'1.0rem',color:C.slate,marginTop:'0.32rem'}}>{sub}</div>}
    </div>
  )
}

function Badge({text,color}:{text:string;color?:string}) {
  return <span style={{fontFamily:'monospace',fontSize:'0.88rem',padding:'0.1rem 0.42rem',borderRadius:4,background:color||C.slate,color:'var(--cv-on-accent)',display:'inline-block'}}>{text}</span>
}

function Spinner({label}:{label?:string}) {
  return <p style={{color:C.slate,fontSize:'1.06rem',padding:'0.5rem 0'}}>{label||'Loading…'}</p>
}
function Empty({children}:{children:React.ReactNode}) {
  return <p style={{color:C.slate,fontSize:'1.06rem',lineHeight:1.5}}>{children}</p>
}

// ── Funnel model ─────────────────────────────────────────────
const STAGES = ['lead','prospect','client'] as const
type Stage = typeof STAGES[number]
const STAGE_LABEL: Record<Stage,string> = { lead:'Leads', prospect:'Prospects', client:'Clients' }
const STAGE_COLOR: Record<Stage,string> = { lead:C.slate, prospect:C.amber, client:C.green }
const NEXT_STAGE: Record<Stage,Stage|null> = { lead:'prospect', prospect:'client', client:null }

interface Lead {
  id: string
  client_id: string
  name: string | null
  contact: string | null
  officer: string | null
  stage: Stage
  source: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

function pct(numer: number, denom: number): string {
  if (!denom) return '—'
  return Math.round((numer / denom) * 100) + '%'
}

export default function CustomersMarketingTab({ config, clientId, cc, P, activitiesNode }: any) {
  const fmt = (n: any) => cc + ' ' + Math.round(Number(n) || 0).toLocaleString()
  const [tab, setTab] = useState<'funnel'|'customers'|'campaigns'|'activities'>('funnel')

  return (
    <div>
      <div style={{display:'flex',gap:'0.25rem',borderBottom:`1px solid ${C.border}`,marginBottom:'1.35rem',overflowX:'auto'}}>
        <button style={navBtn(tab==='funnel')} onClick={()=>setTab('funnel')}>Funnel</button>
        <button style={navBtn(tab==='customers')} onClick={()=>setTab('customers')}>Customers</button>
        <button style={navBtn(tab==='campaigns')} onClick={()=>setTab('campaigns')}>Campaigns</button>
        {activitiesNode && <button style={navBtn(tab==='activities')} onClick={()=>setTab('activities')}>Marketing activities</button>}
      </div>

      {tab==='funnel'     && <FunnelTab clientId={clientId} P={P} />}
      {tab==='customers'  && <CustomersTab clientId={clientId} />}
      {tab==='campaigns'  && <CampaignsTab clientId={clientId} fmt={fmt} />}
      {tab==='activities' && activitiesNode}
    </div>
  )
}

// ── 1) FUNNEL ────────────────────────────────────────────────
function FunnelTab({ clientId, P }: { clientId: string; P: any }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string|null>(null)
  const [officerFilter, setOfficerFilter] = useState<string>('__all__')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string|null>(null)
  const [form, setForm] = useState({ name:'', contact:'', officer:'', source:'', notes:'' })

  async function load() {
    setLoading(true); setError(null)
    const { data, error } = await supabase
      .from('customer_leads')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setLeads((data as Lead[]) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [clientId])

  const officers = useMemo(() => {
    const set = new Set<string>()
    leads.forEach(l => { if (l.officer && l.officer.trim()) set.add(l.officer.trim()) })
    return Array.from(set).sort((a,b)=>a.localeCompare(b))
  }, [leads])

  const visible = useMemo(() => {
    if (officerFilter === '__all__') return leads
    if (officerFilter === '__none__') return leads.filter(l => !l.officer || !l.officer.trim())
    return leads.filter(l => (l.officer||'').trim() === officerFilter)
  }, [leads, officerFilter])

  // Stage counts over the currently-filtered set.
  const counts = useMemo(() => {
    const c: Record<Stage,number> = { lead:0, prospect:0, client:0 }
    visible.forEach(l => { if (c[l.stage] !== undefined) c[l.stage] += 1 })
    return c
  }, [visible])
  const totalInFunnel = counts.lead + counts.prospect + counts.client

  // Per-officer breakdown (always over the full set, so it reads as a roster).
  const byOfficer = useMemo(() => {
    const map: Record<string,{lead:number;prospect:number;client:number;total:number}> = {}
    leads.forEach(l => {
      const key = (l.officer && l.officer.trim()) ? l.officer.trim() : 'Unassigned'
      if (!map[key]) map[key] = { lead:0, prospect:0, client:0, total:0 }
      if (map[key][l.stage] !== undefined) { map[key][l.stage] += 1; map[key].total += 1 }
    })
    return Object.entries(map)
      .map(([officer, s]) => ({ officer, ...s }))
      .sort((a,b) => b.total - a.total || a.officer.localeCompare(b.officer))
  }, [leads])

  async function addLead() {
    if (!form.name.trim() && !form.contact.trim()) { setError('Give the lead a name or a contact.'); return }
    setSaving(true); setError(null)
    const row = {
      client_id: clientId,
      name: form.name.trim() || null,
      contact: form.contact.trim() || null,
      officer: form.officer.trim() || null,
      source: form.source.trim() || null,
      notes: form.notes.trim() || null,
      stage: 'lead' as Stage,
    }
    const { data, error } = await supabase.from('customer_leads').insert([row]).select().single()
    if (error) setError(error.message)
    else if (data) {
      setLeads(prev => [data as Lead, ...prev])
      setForm({ name:'', contact:'', officer:'', source:'', notes:'' })
      setShowForm(false)
    }
    setSaving(false)
  }

  async function advance(l: Lead) {
    const next = NEXT_STAGE[l.stage]
    if (!next) return
    setBusyId(l.id); setError(null)
    const { data, error } = await supabase
      .from('customer_leads')
      .update({ stage: next, updated_at: new Date().toISOString() })
      .eq('id', l.id).eq('client_id', clientId)
      .select().single()
    if (error) setError(error.message)
    else if (data) setLeads(prev => prev.map(x => x.id === l.id ? (data as Lead) : x))
    setBusyId(null)
  }

  const canEdit = true // RLS enforces client scope; any client user may manage the funnel.

  return (
    <div>
      {/* Stage KPIs + conversions */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:'1rem',marginBottom:'1.25rem'}}>
        <KPI label="Leads" value={String(counts.lead)} color={STAGE_COLOR.lead} sub={`${pct(counts.prospect + counts.client, counts.lead + counts.prospect + counts.client)} advanced past lead`} />
        <KPI label="Prospects" value={String(counts.prospect)} color={STAGE_COLOR.prospect} sub={`${pct(counts.prospect + counts.client, counts.lead + counts.prospect + counts.client)} lead→prospect`} />
        <KPI label="Clients" value={String(counts.client)} color={STAGE_COLOR.client} sub={`${pct(counts.client, counts.prospect + counts.client)} prospect→client`} />
        <KPI label="In Funnel" value={String(totalInFunnel)} sub={`${pct(counts.client, totalInFunnel)} overall conversion`} />
      </div>

      {error && <div style={{...card,border:`1px solid ${C.red}`,color:C.red,fontSize:'1.0rem'}}>{error}</div>}

      {/* Filter + add */}
      <div style={card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'1rem',flexWrap:'wrap',marginBottom: (showForm ? '1rem' : 0)}}>
          <div style={{display:'flex',alignItems:'center',gap:'0.6rem',flexWrap:'wrap'}}>
            <span style={{fontFamily:'monospace',fontSize:'0.96rem',color:C.slate,textTransform:'uppercase',letterSpacing:'0.08em'}}>Officer</span>
            <select style={{...inp,width:'auto',minWidth:180}} value={officerFilter} onChange={e=>setOfficerFilter(e.target.value)}>
              <option value="__all__">All officers</option>
              {officers.map(o => <option key={o} value={o}>{o}</option>)}
              <option value="__none__">Unassigned</option>
            </select>
          </div>
          {canEdit && <button style={addBtn()} onClick={()=>setShowForm(s=>!s)}>{showForm ? 'Close' : '+ Add Lead'}</button>}
        </div>

        {showForm && (
          <div style={{borderTop:`1px solid ${C.border}`,paddingTop:'1rem'}}>
            <div style={fGrid}>
              <div><label style={lbl}>Name</label><input style={inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Lead / contact person"/></div>
              <div><label style={lbl}>Contact</label><input style={inp} value={form.contact} onChange={e=>setForm(f=>({...f,contact:e.target.value}))} placeholder="Phone or email"/></div>
              <div><label style={lbl}>Officer</label><input style={inp} list="cm-officer-list" value={form.officer} onChange={e=>setForm(f=>({...f,officer:e.target.value}))} placeholder="Salesperson / marketer"/>
                <datalist id="cm-officer-list">{officers.map(o=><option key={o} value={o}/>)}</datalist>
              </div>
              <div><label style={lbl}>Source</label><input style={inp} value={form.source} onChange={e=>setForm(f=>({...f,source:e.target.value}))} placeholder="e.g. Field day, Referral"/></div>
              <div style={{gridColumn:'1/-1'}}><label style={lbl}>Notes</label><textarea style={{...inp,minHeight:56,resize:'vertical'}} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
            </div>
            <div style={{display:'flex',gap:'0.6rem',marginTop:'0.85rem'}}>
              <button style={solidBtn()} disabled={saving} onClick={addLead}>{saving ? 'Saving…' : 'Save Lead'}</button>
              <button style={addBtn(true,C.slate)} onClick={()=>setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Per-officer breakdown */}
      <div style={card}>
        <div style={secH}>Funnel by Officer</div>
        {loading ? <Spinner/> : byOfficer.length === 0 ? (
          <Empty>No leads recorded yet. Add a lead above to start tracking the funnel per officer.</Empty>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{borderCollapse:'collapse',width:'100%',fontSize:'1.0rem'}}>
              <thead>
                <tr style={{background:'var(--cv-header)',color:'var(--cv-on-accent)'}}>
                  {['Officer','Leads','Prospects','Clients','Total','Lead→Prospect','Prospect→Client','Overall'].map(h=>(
                    <th key={h} style={{padding:'8px 10px',textAlign:h==='Officer'?'left':'right',fontWeight:600,fontSize:'1.0rem',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byOfficer.map((r,i)=>(
                  <tr key={r.officer} style={{background:i%2===0?C.cream:C.white}}>
                    <td style={{padding:'8px 10px',fontWeight:600,color:C.navy}}>{r.officer}</td>
                    <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace'}}>{r.lead}</td>
                    <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace'}}>{r.prospect}</td>
                    <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace',color:C.green,fontWeight:700}}>{r.client}</td>
                    <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace'}}>{r.total}</td>
                    <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace',color:C.slate}}>{pct(r.prospect + r.client, r.total)}</td>
                    <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace',color:C.slate}}>{pct(r.client, r.prospect + r.client)}</td>
                    <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace',fontWeight:700,color:C.navy}}>{pct(r.client, r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{fontSize:'0.96rem',color:C.slate,marginTop:'0.6rem'}}>Conversion is the share of an officer&apos;s leads that reached each later stage. &quot;Unassigned&quot; groups leads with no officer set.</p>
          </div>
        )}
      </div>

      {/* Lead list with stage advance */}
      <div style={card}>
        <div style={secH}>Leads {officerFilter !== '__all__' && <span style={{fontFamily:'monospace',fontSize:'0.9rem',color:C.slate}}>· filtered</span>}</div>
        {loading ? <Spinner/> : visible.length === 0 ? (
          <Empty>{leads.length === 0 ? 'No leads yet.' : 'No leads match this officer filter.'}</Empty>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:'0.4rem'}}>
            {visible.map(l => {
              const next = NEXT_STAGE[l.stage]
              return (
                <div key={l.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.6rem 0.75rem',background:C.lightBg,borderRadius:5,flexWrap:'wrap',gap:'0.6rem'}}>
                  <div style={{minWidth:180}}>
                    <div style={{fontWeight:600,fontSize:'1.06rem',color:C.navy}}>{l.name || l.contact || 'Unnamed lead'}</div>
                    <div style={{fontSize:'0.96rem',color:C.slate}}>
                      {[l.officer && `Officer: ${l.officer}`, l.contact && l.name ? l.contact : null, l.source && `via ${l.source}`].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <div style={{display:'flex',gap:'0.5rem',alignItems:'center',flexWrap:'wrap'}}>
                    <Badge text={STAGE_LABEL[l.stage].replace(/s$/,'')} color={STAGE_COLOR[l.stage]}/>
                    {next && canEdit && (
                      <button style={addBtn(true, STAGE_COLOR[next])} disabled={busyId===l.id} onClick={()=>advance(l)}>
                        {busyId===l.id ? '…' : `→ ${STAGE_LABEL[next].replace(/s$/,'')}`}
                      </button>
                    )}
                    {!next && <span style={{fontFamily:'monospace',fontSize:'0.84rem',color:C.green}}>✓ converted</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 2) CUSTOMERS ─────────────────────────────────────────────
interface FieldCustomer { id:string; name:string|null; phone:string|null; village:string|null }
function CustomersTab({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<FieldCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string|null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true); setError(null)
      const { data, error } = await supabase
        .from('field_customers')
        .select('id, name, phone, village')
        .eq('client_id', clientId)
        .order('name')
      if (!alive) return
      if (error) setError(error.message)
      else setRows((data as FieldCustomer[]) || [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [clientId])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return rows
    return rows.filter(r =>
      (r.name||'').toLowerCase().includes(t) ||
      (r.phone||'').toLowerCase().includes(t) ||
      (r.village||'').toLowerCase().includes(t))
  }, [rows, q])

  return (
    <div style={card}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'1rem',flexWrap:'wrap',marginBottom:'1rem'}}>
        <div style={secH}>Customers <span style={{fontFamily:'monospace',fontSize:'1rem',color:C.slate}}>· {rows.length}</span></div>
        {rows.length > 0 && <input style={{...inp,width:'auto',minWidth:220}} placeholder="Search name, phone, village" value={q} onChange={e=>setQ(e.target.value)}/>}
      </div>
      {loading ? <Spinner/> : error ? (
        <div style={{color:C.red,fontSize:'1.0rem'}}>{error}</div>
      ) : rows.length === 0 ? (
        <Empty>No customers recorded yet. Customer records are captured in the field app during sales, then appear here.</Empty>
      ) : filtered.length === 0 ? (
        <Empty>No customers match your search.</Empty>
      ) : (
        <div style={{overflowX:'auto'}}>
          <table style={{borderCollapse:'collapse',width:'100%',fontSize:'1.0rem'}}>
            <thead>
              <tr style={{background:'var(--cv-header)',color:'var(--cv-on-accent)'}}>
                {['Name','Phone','Village'].map(h=>(
                  <th key={h} style={{padding:'8px 10px',textAlign:'left',fontWeight:600,fontSize:'1.0rem'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r,i)=>(
                <tr key={r.id} style={{background:i%2===0?C.cream:C.white}}>
                  <td style={{padding:'8px 10px',fontWeight:600,color:C.navy}}>{r.name || '—'}</td>
                  <td style={{padding:'8px 10px',fontFamily:'monospace',color:C.slate}}>{r.phone || '—'}</td>
                  <td style={{padding:'8px 10px',color:C.slate}}>{r.village || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{fontSize:'0.96rem',color:C.slate,marginTop:'0.6rem'}}>Read-only. Customer records are managed in the field app.</p>
        </div>
      )}
    </div>
  )
}

// ── 3) CAMPAIGNS ─────────────────────────────────────────────
interface MgmtEvent {
  id:string; name?:string|null; channel?:string|null; date?:string|null;
  cost?:number|null; customers_acquired?:number|null;
  revenue_before?:number|null; revenue_after?:number|null;
}
function CampaignsTab({ clientId, fmt }: { clientId: string; fmt: (n:any)=>string }) {
  const [events, setEvents] = useState<MgmtEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string|null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true); setError(null)
      const { data, error } = await supabase
        .from('management_events')
        .select('id, name, channel, date, cost, customers_acquired, revenue_before, revenue_after')
        .eq('client_id', clientId)
        .order('date', { ascending: false })
      if (!alive) return
      if (error) setError(error.message)
      else setEvents((data as MgmtEvent[]) || [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [clientId])

  // CAC grouped by channel: total cost / total customers acquired.
  const channelRows = useMemo(() => {
    const stats: Record<string,{cost:number;customers:number;events:number}> = {}
    events.forEach(e => {
      const ch = e.channel || 'Unspecified'
      if (!stats[ch]) stats[ch] = { cost:0, customers:0, events:0 }
      stats[ch].cost += Number(e.cost)||0
      stats[ch].customers += Number(e.customers_acquired)||0
      stats[ch].events += 1
    })
    return Object.entries(stats)
      .map(([channel,s]) => ({ channel, ...s, cac: s.customers>0 ? s.cost/s.customers : null }))
      .sort((a,b) => (a.cac===null?1:b.cac===null?-1:a.cac-b.cac))
  }, [events])

  const totals = useMemo(() => {
    const cost = events.reduce((a,e)=>a+(Number(e.cost)||0),0)
    const customers = events.reduce((a,e)=>a+(Number(e.customers_acquired)||0),0)
    return { cost, customers, blendedCac: customers>0 ? cost/customers : null }
  }, [events])

  if (loading) return <div style={card}><Spinner/></div>
  if (error) return <div style={{...card,border:`1px solid ${C.red}`,color:C.red}}>{error}</div>

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:'1rem',marginBottom:'1.25rem'}}>
        <KPI label="Campaigns" value={String(events.length)} />
        <KPI label="Total Spend" value={fmt(totals.cost)} />
        <KPI label="Customers Acquired" value={String(totals.customers)} color={C.green} />
        <KPI label="Blended CAC" value={totals.blendedCac===null ? '—' : fmt(totals.blendedCac)} color={C.teal} sub="cost / customers acquired" />
      </div>

      <div style={card}>
        <div style={secH}>Cost per Customer Acquired, by Channel</div>
        {channelRows.length === 0 ? (
          <Empty>No campaigns recorded yet. Marketing events are added under Intelligence › Marketing Events; once recorded, cost-per-customer appears here by channel.</Empty>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{borderCollapse:'collapse',width:'100%',fontSize:'1.0rem'}}>
              <thead>
                <tr style={{background:'var(--cv-header)',color:'var(--cv-on-accent)'}}>
                  {['Channel','Campaigns','Total Cost','Customers Acquired','Cost per Customer (CAC)'].map(h=>(
                    <th key={h} style={{padding:'8px 10px',textAlign:h==='Channel'?'left':'right',fontWeight:600,fontSize:'1.0rem',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {channelRows.map((r,i)=>(
                  <tr key={r.channel} style={{background:i%2===0?C.cream:C.white}}>
                    <td style={{padding:'8px 10px',fontWeight:600,color:C.navy}}>{r.channel}</td>
                    <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace'}}>{r.events}</td>
                    <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace'}}>{fmt(r.cost)}</td>
                    <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace'}}>{r.customers}</td>
                    <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace',fontWeight:700,color:r.cac===null?C.slate:C.navy}}>
                      {r.cac===null ? 'No customers recorded' : fmt(r.cac)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{fontSize:'0.96rem',color:C.slate,marginTop:'0.6rem'}}>Lower cost per customer means a more efficient channel. Channels with no customers recorded cannot be ranked.</p>
          </div>
        )}
      </div>

      {events.length > 0 && (
        <div style={card}>
          <div style={secH}>All Campaigns</div>
          <div style={{display:'flex',flexDirection:'column',gap:'0.4rem'}}>
            {events.map(e => {
              const cac = (Number(e.customers_acquired)||0) > 0 ? (Number(e.cost)||0)/(Number(e.customers_acquired)||0) : null
              return (
                <div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.6rem 0.75rem',background:C.lightBg,borderRadius:5,flexWrap:'wrap',gap:'0.5rem'}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:'1.06rem',color:C.navy}}>{e.name || 'Untitled campaign'}</div>
                    <div style={{fontSize:'0.96rem',color:C.slate}}>{[e.date, e.channel || 'No channel set'].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div style={{display:'flex',gap:'0.4rem',flexWrap:'wrap',alignItems:'center'}}>
                    <Badge text={`Cost ${fmt(e.cost)}`} color={C.slate}/>
                    <Badge text={`${Number(e.customers_acquired)||0} acquired`} color={C.green}/>
                    {cac!==null && <Badge text={`CAC ${fmt(cac)}`} color={C.teal}/>}
                  </div>
                </div>
              )
            })}
          </div>
          <p style={{fontSize:'0.96rem',color:C.slate,marginTop:'0.6rem'}}>Read-only summary. Campaigns are created and edited under Intelligence › Marketing Events.</p>
        </div>
      )}
    </div>
  )
}
