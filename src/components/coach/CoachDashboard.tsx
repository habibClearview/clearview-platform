// @ts-nocheck
'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  statusLabel, statusColor, canEdit, canViewCoachGuidance, canSignOff,
  canManageTeam, canApproveTimesheets, canSubmitTimesheets,
  CLIENT_TYPE_LABELS, CLIENT_TYPE_COLORS, CANVAS_TABS,
  READINESS_QUESTIONS, buildEmptyCanvas,
} from '@/lib/coach-types'
import { supabase } from '@/lib/supabase'
import SpreadsheetUpload from '@/components/intake/SpreadsheetUpload'
import BuildStamp from '@/components/BuildStamp'
import TeamPayments from '@/components/coach/TeamPayments'
import DealsAndFees from '@/components/coach/DealsAndFees'
import {
  engagementSplit, independentClients, feesReceivedInYear, feesReceivedInMonth, outstandingInvoiced,
  averageDaysToCollect, revenueStreams, dealCards, dealWinRate,
  canvasProgress, coImplementerNamesForClient, engagementDisplayStatus, coImplementerWorkload,
  healthStatusFromReportText, portfolioHealthCounts, groupClientsByProgramme,
  pipelineSnapshot, recentMonthPeriods, monthlyFeeRevenue, monthlyTeamCost,
} from '@/lib/coach-business-metrics'
import { GRANT_TYPE_LABELS, GRANT_SCOPE_LABELS, grantStatus, generateAccessToken, expiryFromDays } from '@/lib/access-grants'
import { READINESS_STAGE_LABELS } from '@/lib/portfolio-intelligence'

// \u2500\u2500\u2500 DESIGN TOKENS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const C = {
  navy:'var(--cv-navy)', cyan:'var(--cv-cyan)', cream:'var(--cv-cream)', white:'var(--cv-card)',
  slate:'var(--cv-slate)', border:'var(--cv-border)', teal:'var(--cv-teal)',
  red:'var(--cv-red)', green:'var(--cv-green)', amber:'var(--cv-amber)', purple:'var(--cv-purple)',
  lightBg:'var(--cv-alt)',
}

// \u2500\u2500\u2500 SHARED STYLES \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const card = {background:C.white,border:'1px solid var(--cv-border-soft)',borderRadius:14,padding:'1.35rem 1.5rem',marginBottom:'1.25rem',boxShadow:'0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)'}
const secH = {fontFamily:'Georgia,serif',fontSize:'1.32rem',fontWeight:700,color:C.navy,marginBottom:'0.75rem'}
const inp  = {width:'100%',padding:'0.42rem 0.6rem',border:`1px solid ${C.border}`,borderRadius:6,fontSize:'1.13rem',fontFamily:'inherit',background:'var(--cv-bg-2)',color:C.navy,boxSizing:'border-box'}
const lbl  = {display:'block',fontWeight:600,fontSize:'1.07rem',marginBottom:'0.22rem',color:C.navy}
const hint = {fontSize:'1.01rem',color:C.slate,lineHeight:1.4}
const fGrid= {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:'1rem'}

function navBtn(active){return{fontFamily:'monospace',fontSize:'1.01rem',padding:'0.72rem 1rem',border:'none',background:'transparent',color:active?C.cyan:'var(--cv-wa-60)',cursor:'pointer',borderBottom:active?`3px solid ${C.cyan}`:'3px solid transparent',fontWeight:active?700:400,whiteSpace:'nowrap'}}
function addBtn(sm=false,col=C.cyan){return{fontFamily:'monospace',fontSize:sm?'0.91rem':'0.95rem',padding:sm?'0.28rem 0.6rem':'0.38rem 0.8rem',border:`1px solid ${col}`,borderRadius:6,background:'transparent',color:col,cursor:'pointer'}}
function solidBtn(col=C.cyan,sm=false){return{fontFamily:'monospace',fontSize:sm?'0.95rem':'1.01rem',fontWeight:600,padding:sm?'0.35rem 0.8rem':'0.5rem 1.1rem',border:'none',borderRadius:6,background:col,color:col===C.white?C.navy:'var(--cv-on-accent)',cursor:'pointer'}}
// Pill toggle for mode / filter subtabs (new design language)
function subPill(active,col=C.cyan){return{fontFamily:'monospace',fontSize:'0.93rem',padding:'0.4rem 0.8rem',borderRadius:8,border:`1px solid ${active?col:C.border}`,background:active?col:C.white,color:active?'var(--cv-on-cyan)':C.slate,cursor:'pointer',fontWeight:active?700:400,whiteSpace:'nowrap'}}

function KPI({label,value,sub,color}){const accent=color||C.cyan;return(<div style={{background:C.white,borderRadius:14,padding:'1.05rem 1.2rem 1.15rem',borderTop:`3px solid ${accent}`,boxShadow:'0 1px 2px var(--cv-shadow-1), 0 12px 32px var(--cv-shadow-2)'}}><div style={{fontFamily:'monospace',fontSize:'1.13rem',letterSpacing:'0.12em',color:C.slate,textTransform:'uppercase',marginBottom:'0.4rem'}}>{label}</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.65rem',fontWeight:700,color:color||C.navy,lineHeight:1.05}}>{value}</div>{sub&&<div style={{fontSize:'1.07rem',color:C.slate,marginTop:'0.22rem'}}>{sub}</div>}</div>)}
function DPDot({status}){const col=status==='\u2713'?C.green:status==='\u25d0'?C.cyan:status==='\u26a0'?C.amber:C.border;return<span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:18,height:18,borderRadius:'50%',background:col,color:'var(--cv-on-accent)',fontSize:'0.93rem',fontWeight:700,flexShrink:0}}>{status||'\u25cb'}</span>}
function Badge({text,color}){return<span style={{fontFamily:'monospace',fontSize:'0.93rem',padding:'0.1rem 0.42rem',borderRadius:4,background:color||C.slate,color:'var(--cv-on-accent)',display:'inline-block'}}>{text}</span>}
function Spinner(){return<div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'3rem',color:C.slate,fontSize:'1.11rem'}}>Loading...</div>}
// Donut score circle \u2014 reused for real scores that already exist in the data (e.g. the readiness self-assessment). No score is invented.
function ScoreDonut({label,display,frac,rating,color}){const r=26,circ=2*Math.PI*r,f=Math.max(0,Math.min(1,frac||0));return(<div style={{background:C.white,borderRadius:14,padding:'1.05rem 1.15rem',borderLeft:`4px solid ${color}`,boxShadow:'0 1px 2px var(--cv-shadow-1), 0 12px 32px var(--cv-shadow-2)',display:'flex',alignItems:'center',gap:'0.9rem'}}><svg width="60" height="60" viewBox="0 0 62 62" style={{flexShrink:0}}><circle cx="31" cy="31" r={r} fill="none" style={{stroke:'var(--cv-border-soft)'}} strokeWidth="6"/><circle cx="31" cy="31" r={r} fill="none" style={{stroke:color}} strokeWidth="6" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ*(1-f)} transform="rotate(-90 31 31)"/></svg><div style={{minWidth:0}}><div style={{fontSize:'1.11rem',color:C.slate,marginBottom:'0.18rem'}}>{label}</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.55rem',fontWeight:700,color:C.navy,lineHeight:1}}>{display}</div><div style={{fontSize:'1.07rem',fontWeight:700,color,marginTop:'0.22rem'}}>{rating}</div></div></div>)}

// ─── "MY BUSINESS AT A GLANCE" (coach's own commercial numbers) ──────
// Compact currency formatter matching the approved design ($182k, not
// "USD 182,000") -- only ever formats real computed values, never invents one.
function fmtGlance(n,cur){const sym=cur==='USD'?'$':(cur||'')+' ';const abs=Math.abs(n||0);if(abs>=1000)return`${n<0?'-':''}${sym}${(abs/1000).toFixed(abs>=10000?0:1).replace(/\.0$/,'')}k`;return`${sym}${Math.round(n||0)}`}
function Kicker({children,style}){return<div style={{fontFamily:'monospace',fontSize:'1.01rem',letterSpacing:'0.1em',textTransform:'uppercase',color:C.slate,marginBottom:'0.75rem',...style}}>{children}</div>}
function GlanceKPI({label,value,sub,color}){return(<div style={{background:C.white,borderRadius:14,padding:'1.05rem 1.2rem',borderLeft:`4px solid ${color||C.navy}`,boxShadow:'0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-2)'}}><div style={{fontFamily:'monospace',fontSize:'1.01rem',letterSpacing:'0.08em',textTransform:'uppercase',color:C.slate,marginBottom:'0.4rem'}}>{label}</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.55rem',fontWeight:700,color:color||C.navy,lineHeight:1.05}}>{value}</div>{sub&&<div style={{fontSize:'1.07rem',color:C.slate,marginTop:'0.3rem'}}>{sub}</div>}</div>)}
function GlanceBar({frac,color}){return<div style={{height:6,borderRadius:3,background:'var(--cv-track)',marginTop:'0.75rem',overflow:'hidden'}}><div style={{height:'100%',width:`${Math.round(Math.max(0,Math.min(1,frac||0))*100)}%`,background:color,borderRadius:3}}/></div>}
// Numbered LEVEL badge + "drilled from" connector -- matches the approved
// Portfolio Intelligence mockup's Level 1 -> 2 -> 3 drill-down structure
// (portfolio overview -> filtered segment -> one anonymised business).
function LevelMarker({n,label,sub}){return(<div style={{display:'flex',alignItems:'center',gap:'0.6rem',flexWrap:'wrap',margin:'1.7rem 0 0.9rem'}}><span style={{fontFamily:'monospace',fontSize:'0.78rem',fontWeight:700,color:'var(--cv-on-accent)',background:C.navy,borderRadius:20,padding:'0.15rem 0.7rem'}}>LEVEL {n}</span><span style={{fontFamily:'Georgia,serif',fontSize:'1.08rem',fontWeight:700,color:C.navy}}>{label}</span>{sub&&<span style={{color:C.slate,fontSize:'0.86rem'}}>{sub}</span>}</div>)}
function DrillConnector({children}){return<div style={{display:'flex',justifyContent:'center',textAlign:'center',padding:'0.25rem 0',color:C.teal,fontSize:'0.92rem',fontFamily:'monospace'}}>{children}</div>}
function RevenueStreamCard({label,value,description,tag,barFrac,currency,color}){return(<div style={{background:C.white,borderRadius:14,padding:'1.05rem 1.2rem',borderTop:`3px solid ${color}`,boxShadow:'0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-2)'}}><div style={{fontFamily:'Georgia,serif',fontSize:'1.22rem',fontWeight:700,color:C.navy}}>{label}</div><div style={{fontSize:'1.07rem',color:C.slate,margin:'0.15rem 0 0.7rem'}}>{description}</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:C.navy,marginBottom:'0.5rem'}}>{fmtGlance(value,currency)}</div><Badge text={tag} color={color}/><GlanceBar frac={barFrac} color={color}/></div>)}
const DEAL_STAGE_META={conversation:{label:'Early conversation',color:C.slate},scoping:{label:'Scoping',color:C.cyan},proposal:{label:'Proposal · deciding',color:C.amber},won:{label:'Won · in delivery',color:C.green},lost:{label:'Lost',color:C.red}}
function DealPipelineCard({deal}){const meta=DEAL_STAGE_META[deal.stage]||{label:deal.stage,color:C.slate};return(<div style={{background:C.white,borderRadius:14,padding:'1.05rem 1.2rem',borderTop:`3px solid ${meta.color}`,boxShadow:'0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-2)'}}><div style={{fontFamily:'Georgia,serif',fontSize:'1.22rem',fontWeight:700,color:C.navy,marginBottom:'0.2rem'}}>{deal.name}</div><div style={{fontSize:'1.01rem',color:C.slate,marginBottom:'0.5rem'}}>{deal.subtitle}</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:C.navy,marginBottom:'0.5rem'}}>{fmtGlance(deal.value,deal.currency)}</div><Badge text={meta.label} color={meta.color}/><GlanceBar frac={deal.barFrac} color={meta.color}/></div>)}

// ─── Engagements table (real canvas progress; NO margin % -- that field
// does not exist anywhere in the schema, so it is deliberately omitted
// rather than fabricated) ──────────────────────────────────────────
const STATUS_COLOR={closed:C.slate,paid:C.green,invoiced:C.amber,unpaid:C.red,unset:C.border}
function EngagementsTable({clients,programmes,coImplementers,canvasByClient}){
  const programmesById=Object.fromEntries(programmes.map(p=>[p.id,p]))
  return(
    <div style={card}>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'1.07rem'}}>
          <thead><tr style={{background:C.navy}}>{['Served','Payer','Canvas progress','Fee','Co-implementer','Status'].map(h=><th key={h} style={{padding:'10px 12px',textAlign:'left',fontWeight:400,fontSize:'0.93rem',color:'var(--cv-on-accent)',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
          <tbody>
            {clients.map(c=>{
              const prog=canvasProgress(canvasByClient[c.id]||[])
              const payer=c.programme_id?(programmesById[c.programme_id]?.funder||programmesById[c.programme_id]?.name||'programme'):'self · independent'
              const cis=coImplementerNamesForClient(c.id,coImplementers)
              const status=engagementDisplayStatus(c)
              return(
                <tr key={c.id} style={{borderBottom:'1px solid var(--cv-border-soft)'}}>
                  <td style={{padding:'10px 12px'}}>
                    <div style={{fontWeight:700}}>{c.name}</div>
                    <span className="mode" style={{fontFamily:'monospace',fontSize:'0.81rem',fontWeight:700,borderRadius:4,padding:'0.08rem 0.4rem',color:c.engagement_mode==='canvas'?C.purple:C.teal,border:`1px solid ${c.engagement_mode==='canvas'?C.purple:C.teal}`}}>{c.engagement_mode==='canvas'?'GtCV':'Clearview'}</span>
                  </td>
                  <td style={{padding:'10px 12px',fontSize:'0.99rem',color:C.slate}}>{payer}</td>
                  <td style={{padding:'10px 12px',fontSize:'0.99rem',color:C.slate}}>{prog.totalCount>0?`${prog.doneCount}/${prog.totalCount} · ${prog.currentLabel}`:'No canvas yet'}</td>
                  <td style={{padding:'10px 12px',fontFamily:'monospace',fontSize:'1.03rem'}}>{c.engagement_fee?fmtGlance(c.engagement_fee,c.fee_currency||'USD'):'—'}</td>
                  <td style={{padding:'10px 12px',fontSize:'0.99rem'}}>{cis.length>0?cis.join(', '):'—'}</td>
                  <td style={{padding:'10px 12px'}}><Badge text={status.label} color={STATUS_COLOR[status.key]}/></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Co-implementer performance -- only what's honestly computable. ────
// "On-time gates", "utilisation %", and a red/amber issue flag were checked
// against the real schema and none of them exist (no due-date field, no
// capacity field, no structured flag field) -- deliberately not shown here.
function CoImplementerPerfCard({ci,workload}){
  const initials=(ci.name||'?').split(' ').filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase()
  return(
    <div style={{...card,padding:'1rem 1.1rem',marginBottom:0}}>
      <div style={{display:'flex',alignItems:'center',gap:'0.7rem',marginBottom:'0.8rem'}}>
        <div style={{width:38,height:38,borderRadius:10,background:C.navy,color:'var(--cv-on-accent)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace',fontSize:'0.99rem',fontWeight:700}}>{initials}</div>
        <div><div style={{fontWeight:700,fontSize:'1.19rem'}}>{ci.name}</div><div style={{fontSize:'0.99rem',color:C.slate}}>{ci.country||''}{ci.country&&' · '}{(ci.client_ids||[]).length} engagement{(ci.client_ids||[]).length===1?'':'s'}</div></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'0.6rem'}}>
        <div><div style={{fontFamily:'monospace',fontSize:'0.81rem',letterSpacing:'0.05em',textTransform:'uppercase',color:C.slate}}>Approved</div><div style={{fontWeight:700,fontSize:'1.05rem',fontFamily:'Georgia,serif'}}>{workload.approvedHours}h</div></div>
        <div><div style={{fontFamily:'monospace',fontSize:'0.81rem',letterSpacing:'0.05em',textTransform:'uppercase',color:C.slate}}>Pending</div><div style={{fontWeight:700,fontSize:'1.05rem',fontFamily:'Georgia,serif',color:workload.pendingHours>0?C.amber:C.navy}}>{workload.pendingHours}h</div></div>
        <div><div style={{fontFamily:'monospace',fontSize:'0.81rem',letterSpacing:'0.05em',textTransform:'uppercase',color:C.slate}}>Sessions/mo</div><div style={{fontWeight:700,fontSize:'1.05rem',fontFamily:'Georgia,serif'}}>{workload.sessionsThisMonth}</div></div>
      </div>
    </div>
  )
}

// ─── Client Health tab ──────────────────────────────────────────────
// The mockup's numeric "Avg Commercial Readiness /18" and "Avg Liquidity
// Readiness /100" dials do not exist at the coach layer (see
// coach-business-metrics.ts) -- swapped for real portfolio-wide counts of
// the health status that's already live (ai_health_checks). Canvas clients
// show real canvas progress instead of a health status, since ai_health_checks
// only ever covers Clearview/financial clients (never GtCV).
const HEALTH_COLOR={'Needs attention':C.red,'Watch':C.amber,'Healthy':C.green,'Reviewed':C.teal,'No data':C.slate,'Not yet reviewed':C.cyan,'No financial data yet':C.slate}

// Generates and downloads a client's Investment Readiness Brief from the
// COACH's own dashboard -- the coach is the one deciding who a client's
// numbers go to (a lender, an investor, a programme officer), not the
// client self-serving a document to send externally on their own. Reuses
// the same /api/investment-pitch route the client dashboard already used;
// no new endpoint, no new data access, just a different, coach-controlled
// place to trigger it from.
function ClientDocumentActions({clientId,clientName,clients,programmes}){
  const [downloading,setDownloading]=useState(false)
  const [error,setError]=useState('')
  const [showAccess,setShowAccess]=useState(false)
  async function download(){
    setDownloading(true); setError('')
    try{
      const response=await fetch('/api/investment-pitch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId})})
      if(!response.ok){const errData=await response.json().catch(()=>({}));throw new Error(errData.error||'Could not generate the document')}
      const blob=await response.blob()
      const disposition=response.headers.get('Content-Disposition')||''
      const match=disposition.match(/filename="(.+)"/)
      const fileName=match?match[1]:`${clientName.replace(/[^a-z0-9]+/gi,'_')}_Investment_Brief.docx`
      const url=URL.createObjectURL(blob)
      const a=document.createElement('a')
      a.href=url; a.download=fileName
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }catch(e){setError(e.message||'Download failed')}
    setDownloading(false)
  }
  return(
    <div style={{marginTop:'0.6rem',display:'flex',gap:'0.5rem',flexWrap:'wrap'}}>
      <button
        style={{fontSize:'0.85rem',fontWeight:600,color:C.teal,background:'none',border:`1px solid ${C.teal}`,borderRadius:6,padding:'0.3rem 0.65rem',cursor:'pointer'}}
        disabled={downloading}
        onClick={download}
      >{downloading?'Generating…':'⬇ Investment Brief'}</button>
      <button
        style={{fontSize:'0.85rem',fontWeight:600,color:C.navy,background:'none',border:`1px solid var(--cv-border-soft)`,borderRadius:6,padding:'0.3rem 0.65rem',cursor:'pointer'}}
        onClick={()=>setShowAccess(true)}
      >🔗 External Access</button>
      {error&&<div style={{width:'100%',fontSize:'0.78rem',color:C.red}}>{error}</div>}
      {showAccess&&<ExternalAccessPanel clientId={clientId} clientName={clientName} clients={clients} programmes={programmes} onClose={()=>setShowAccess(false)}/>}
    </div>
  )
}

// Coach-managed grant/revoke of external access to either ONE client's
// Investment Readiness Brief, the WHOLE portfolio, or one filtered
// SEGMENT of it. Anyone handed the resulting link can view/download the
// content without a ClearView login of their own -- but ONLY while the
// coach who issued it hasn't revoked it, only for the scope it was
// issued for, and (if the coach entered an email) only after confirming
// that email on the public /access/[token] page. See
// supabase/migrations/2026_07_13_client_access_grants.sql and
// 2026_07_13_access_grants_portfolio_scope.sql for the RLS that makes
// this coach-only to create/revoke.
//
// clientId/clientName are provided when opened from a specific client's
// page (defaults scope to 'client', still lets the coach widen scope to
// portfolio/segment "on behalf of" that client's context); omitted when
// opened from the Portfolio Intelligence Hub itself, in which case the
// 'client' scope isn't offered (there's no specific client to attach it
// to) and portfolioFilter, if the coach had a filter active there, is
// used to prefill the segment fields and default scope to 'segment'.
function ExternalAccessPanel({clientId,clientName,portfolioFilter,clients,programmes,onClose}){
  const [grants,setGrants]=useState([])
  const [loading,setLoading]=useState(true)
  const [name,setName]=useState('')
  const [email,setEmail]=useState('')
  const [type,setType]=useState('investor')
  const [expiryDays,setExpiryDays]=useState('')
  const [scope,setScope]=useState(clientId?'client':(portfolioFilter&&Object.keys(portfolioFilter).length>0?'segment':'portfolio'))
  const [segSector,setSegSector]=useState(portfolioFilter?.sector||'')
  const [segCountry,setSegCountry]=useState(portfolioFilter?.country||'')
  const [segStage,setSegStage]=useState(portfolioFilter?.readinessStage||'')
  const [segProgrammeId,setSegProgrammeId]=useState(portfolioFilter?.programmeId||'')
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [copiedId,setCopiedId]=useState(null)

  // Real distinct values from the coach's own client list, not free text --
  // a coach typing "Kenya" against a record stored as "kenya " (or any
  // other mismatch) would silently match nothing, since matchesFilter()
  // in portfolio-intelligence.ts is an exact string comparison. Sourcing
  // the dropdown options from the same data being filtered guarantees
  // whatever's picked here actually exists to match against.
  const financialClients=(clients||[]).filter(c=>c.engagement_mode==='financial')
  const sectorOptions=Array.from(new Set(financialClients.map(c=>c.sector).filter(Boolean))).sort()
  const countryOptions=Array.from(new Set(financialClients.map(c=>c.country).filter(Boolean))).sort()
  const programmesById=Object.fromEntries((programmes||[]).map(p=>[p.id,p]))

  const load=useCallback(()=>{
    setLoading(true)
    const q=supabase.from('client_access_grants').select('*').order('created_at',{ascending:false})
    ;(clientId?q.eq('client_id',clientId):q.is('client_id',null))
      .then(({data})=>{setGrants(data||[]);setLoading(false)})
  },[clientId])
  useEffect(()=>{load()},[load])

  async function createGrant(e){
    e.preventDefault()
    if(!name.trim()){setError('Enter a name for who this link is for.');return}
    setSaving(true); setError('')
    const {data:{user}}=await supabase.auth.getUser()
    const segmentFilter=scope==='segment'?Object.fromEntries(Object.entries({sector:segSector||undefined,country:segCountry||undefined,programmeId:segProgrammeId||undefined,readinessStage:segStage||undefined}).filter(([,v])=>v!==undefined)):null
    if(scope==='segment'&&Object.keys(segmentFilter).length===0){setError('Choose at least one segment filter (sector, country, programme, or readiness stage).');setSaving(false);return}
    const row={
      client_id:scope==='client'?clientId:null,
      scope_type:scope,
      segment_filter:segmentFilter,
      granted_by:user?.id||null,
      grantee_name:name.trim(),
      grantee_email:email.trim()||null,
      grant_type:type,
      access_token:generateAccessToken(),
      expires_at:expiryFromDays(expiryDays?Number(expiryDays):null,Date.now()),
    }
    const {error:insErr}=await supabase.from('client_access_grants').insert([row])
    if(insErr){setError(insErr.message);setSaving(false);return}
    setName('');setEmail('');setType('investor');setExpiryDays('')
    setSaving(false)
    load()
  }

  async function revoke(id){
    await supabase.from('client_access_grants').update({revoked_at:new Date().toISOString()}).eq('id',id)
    load()
  }

  function linkFor(token){
    return `${window.location.origin}/access/${token}`
  }
  function copyLink(grant){
    navigator.clipboard.writeText(linkFor(grant.access_token)).then(()=>{
      setCopiedId(grant.id)
      setTimeout(()=>setCopiedId(null),2000)
    })
  }

  function segmentDescription(g){
    if(g.scope_type!=='segment'||!g.segment_filter)return null
    const f=g.segment_filter
    return [f.sector,f.country,f.programmeId&&(programmesById[f.programmeId]?.name||'Unknown programme'),f.readinessStage&&READINESS_STAGE_LABELS[f.readinessStage]].filter(Boolean).join(' · ')||'No filters set'
  }

  const now=new Date().toISOString()
  const STATUS_COLOR={active:C.green,expired:C.slate,revoked:C.red}

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(11,31,51,0.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}} onClick={onClose}>
      <div style={{...card,maxWidth:600,width:'100%',maxHeight:'85vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.9rem'}}>
          <div>
            <div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:C.navy}}>External Access{clientName?` — ${clientName}`:' — Portfolio'}</div>
            <div style={{fontSize:'0.92rem',color:C.slate,marginTop:'0.2rem'}}>Give an investor, programme officer, DFI, or subscriber a read-only link -- to one business's Investment Brief, the whole portfolio, or a filtered segment -- without giving them a login. If you enter their email, they must confirm it before the link works for them. Revoke any time.</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:'1.3rem',color:C.slate,cursor:'pointer',lineHeight:1}}>×</button>
        </div>

        <form onSubmit={createGrant} style={{display:'flex',flexDirection:'column',gap:'0.5rem',marginBottom:'1rem',padding:'0.8rem',background:'var(--cv-tint-cyan)',borderRadius:8}}>
          <div style={{display:'flex',flexWrap:'wrap',gap:'0.5rem'}}>
            {Object.entries(GRANT_SCOPE_LABELS).filter(([k])=>k!=='client'||clientId).map(([k,l])=>(
              <label key={k} style={{display:'flex',alignItems:'center',gap:'0.35rem',fontSize:'0.85rem',color:C.navy,cursor:'pointer',padding:'0.3rem 0.6rem',borderRadius:6,border:`1px solid ${scope===k?C.teal:'var(--cv-border-soft)'}`,background:scope===k?'var(--cv-tint-teal)':'transparent'}}>
                <input type="radio" name="scope" checked={scope===k} onChange={()=>setScope(k)} style={{margin:0}}/>{l}
              </label>
            ))}
          </div>
          {scope==='segment'&&(
            <div style={{display:'flex',flexWrap:'wrap',gap:'0.5rem'}}>
              <select value={segProgrammeId} onChange={e=>setSegProgrammeId(e.target.value)} style={{flex:'1 1 160px',padding:'0.4rem 0.5rem',borderRadius:6,border:'1px solid var(--cv-border-soft)'}}>
                <option value="">All programmes (or independent)</option>
                {(programmes||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={segSector} onChange={e=>setSegSector(e.target.value)} style={{flex:'1 1 140px',padding:'0.4rem 0.5rem',borderRadius:6,border:'1px solid var(--cv-border-soft)'}}>
                <option value="">All sectors</option>
                {sectorOptions.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <select value={segCountry} onChange={e=>setSegCountry(e.target.value)} style={{flex:'1 1 140px',padding:'0.4rem 0.5rem',borderRadius:6,border:'1px solid var(--cv-border-soft)'}}>
                <option value="">All countries</option>
                {countryOptions.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <select value={segStage} onChange={e=>setSegStage(e.target.value)} style={{flex:'1 1 160px',padding:'0.4rem 0.5rem',borderRadius:6,border:'1px solid var(--cv-border-soft)'}}>
                <option value="">All readiness stages</option>
                {Object.entries(READINESS_STAGE_LABELS).map(([k,l])=><option key={k} value={k}>{l}</option>)}
              </select>
              <div style={{width:'100%',fontSize:'0.78rem',color:C.slate}}>A programme filter shows exactly the businesses that programme is paying for -- combine it with sector/country/stage to narrow further, or leave those on "All" to get the whole programme.</div>
            </div>
          )}
          <div style={{display:'flex',flexWrap:'wrap',gap:'0.5rem'}}>
            <input placeholder="Name" value={name} onChange={e=>setName(e.target.value)} style={{flex:'1 1 140px',padding:'0.4rem 0.5rem',borderRadius:6,border:'1px solid var(--cv-border-soft)'}}/>
            <input placeholder="Email (recommended -- they'll need to confirm it)" value={email} onChange={e=>setEmail(e.target.value)} style={{flex:'1 1 220px',padding:'0.4rem 0.5rem',borderRadius:6,border:'1px solid var(--cv-border-soft)'}}/>
            <select value={type} onChange={e=>setType(e.target.value)} style={{padding:'0.4rem 0.5rem',borderRadius:6,border:'1px solid var(--cv-border-soft)'}}>
              {Object.entries(GRANT_TYPE_LABELS).map(([k,l])=><option key={k} value={k}>{l}</option>)}
            </select>
            <input placeholder="Expires in days (optional)" type="number" min="1" value={expiryDays} onChange={e=>setExpiryDays(e.target.value)} style={{width:170,padding:'0.4rem 0.5rem',borderRadius:6,border:'1px solid var(--cv-border-soft)'}}/>
            <button type="submit" disabled={saving} style={solidBtn(C.teal)}>{saving?'Creating…':'+ Create Link'}</button>
          </div>
          {error&&<div style={{fontSize:'0.82rem',color:C.red}}>{error}</div>}
        </form>

        {loading?(
          <div style={{textAlign:'center',color:C.slate,padding:'1rem'}}>Loading…</div>
        ):grants.length===0?(
          <div style={{textAlign:'center',color:C.slate,padding:'1rem',fontSize:'0.92rem'}}>No external access has been granted {clientId?'for this client':'at the portfolio level'} yet.</div>
        ):(
          <div style={{display:'flex',flexDirection:'column',gap:'0.6rem'}}>
            {grants.map(g=>{
              const status=grantStatus(g,now)
              const segDesc=segmentDescription(g)
              return(
                <div key={g.id} style={{border:'1px solid var(--cv-border-soft)',borderRadius:8,padding:'0.7rem 0.85rem'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'0.5rem'}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:'0.96rem',color:C.navy}}>{g.grantee_name}</div>
                      <div style={{fontSize:'0.82rem',color:C.slate}}>{GRANT_TYPE_LABELS[g.grant_type]||g.grant_type} · {GRANT_SCOPE_LABELS[g.scope_type]||g.scope_type}{g.grantee_email?` · ${g.grantee_email}${g.email_confirmed_at?' (confirmed)':' (not yet confirmed)'}`:''}</div>
                      {segDesc&&<div style={{fontSize:'0.8rem',color:C.teal,marginTop:'0.1rem'}}>Segment: {segDesc}</div>}
                    </div>
                    <Badge text={status==='active'?'Active':status==='expired'?'Expired':'Revoked'} color={STATUS_COLOR[status]}/>
                  </div>
                  <div style={{fontSize:'0.78rem',color:C.slate,marginTop:'0.3rem'}}>
                    Created {new Date(g.created_at).toLocaleDateString()}
                    {g.expires_at?` · Expires ${new Date(g.expires_at).toLocaleDateString()}`:' · No expiry'}
                    {g.last_accessed_at?` · Last used ${new Date(g.last_accessed_at).toLocaleDateString()}`:' · Not yet used'}
                  </div>
                  {status==='active'&&(
                    <div style={{display:'flex',gap:'0.5rem',marginTop:'0.5rem'}}>
                      <button onClick={()=>copyLink(g)} style={{fontSize:'0.8rem',fontWeight:600,color:C.teal,background:'none',border:`1px solid ${C.teal}`,borderRadius:6,padding:'0.25rem 0.55rem',cursor:'pointer'}}>{copiedId===g.id?'Copied!':'Copy Link'}</button>
                      <button onClick={()=>revoke(g.id)} style={{fontSize:'0.8rem',fontWeight:600,color:C.red,background:'none',border:`1px solid ${C.red}`,borderRadius:6,padding:'0.25rem 0.55rem',cursor:'pointer'}}>Revoke</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function ClientHealthTab({clients,programmes,onUpdateClient}){
  const [reportByClient,setReportByClient]=useState({})
  const [canvasByClient,setCanvasByClient]=useState({})
  // Whether a client has ANY real generic_actuals row -- a genuinely
  // different question from "has an AI health check been generated". Without
  // this, a client with real financial data on file but no AI report yet
  // looked identical to a client with nothing recorded at all, both reading
  // "No data". That's exactly what was reported as wrong: real data existed,
  // the label just didn't say so.
  const [hasActuals,setHasActuals]=useState(new Set())
  const [loading,setLoading]=useState(true)
  // NOT gated on clearview_active -- that flag only tracks whether the CEO
  // portal link has been switched on in the coach's own UI (see the "Open
  // Clearview" link elsewhere in this file). It has no editing UI once a
  // client is created, and real generic_actuals/ai_health_checks data is
  // routinely recorded well before (or without) that flag ever being set.
  // Gating on it here excluded clients who plainly had real data on file --
  // exactly what was reported. engagement_mode alone is the honest signal
  // for "this is a financial-model client".
  const financialClients=clients.filter(c=>c.engagement_mode==='financial')
  const canvasClients=clients.filter(c=>c.engagement_mode==='canvas')

  useEffect(()=>{
    let cancelled=false
    const clientIds=clients.map(c=>c.id)
    if(clientIds.length===0){setLoading(false);return}
    Promise.all([
      supabase.from('ai_health_checks').select('client_id,period,report_text,generated_at').in('client_id',financialClients.map(c=>c.id)).order('period',{ascending:false}),
      supabase.from('canvas_decision_points').select('client_id,dp_id,status').in('client_id',canvasClients.map(c=>c.id)),
      supabase.from('generic_actuals').select('client_id').in('client_id',financialClients.map(c=>c.id)),
    ]).then(([{data:reports},{data:dps},{data:actuals}])=>{
      if(cancelled)return
      const latestByClient={}
      ;(reports||[]).forEach(r=>{if(!latestByClient[r.client_id])latestByClient[r.client_id]=r})
      setReportByClient(latestByClient)
      const grouped={}
      ;(dps||[]).forEach(d=>{(grouped[d.client_id]=grouped[d.client_id]||[]).push(d)})
      setCanvasByClient(grouped)
      setHasActuals(new Set((actuals||[]).map(a=>a.client_id)))
      setLoading(false)
    }).catch(()=>setLoading(false))
    return ()=>{cancelled=true}
  },[clients])

  if(loading)return<div style={{...card,textAlign:'center',padding:'2rem',color:C.slate}}>Loading portfolio health...</div>

  // Same health-status classification everywhere, but the DISPLAYED label for
  // a client with no AI report is now honest about which case it is.
  function displayStatus(c){
    const s=healthStatusFromReportText(reportByClient[c.id]?.report_text)
    if(s.label!=='No data')return s
    return hasActuals.has(c.id)
      ? {label:'Not yet reviewed',dot:'🔵'}
      : {label:'No financial data yet',dot:'⚪'}
  }

  const counts=portfolioHealthCounts(financialClients,reportByClient)
  const flagged=financialClients.filter(c=>{
    const label=healthStatusFromReportText(reportByClient[c.id]?.report_text).label
    return label==='Needs attention'||label==='Watch'
  }).sort((a,b)=>{
    const rank={'Needs attention':0,'Watch':1}
    const la=healthStatusFromReportText(reportByClient[a.id]?.report_text).label
    const lb=healthStatusFromReportText(reportByClient[b.id]?.report_text).label
    return (rank[la]??2)-(rank[lb]??2)
  })
  const programmesById=Object.fromEntries(programmes.map(p=>[p.id,p]))
  const groups=groupClientsByProgramme(clients,programmesById)
  // Active/paused/completed -- who's actually engaged right now, distinct
  // from health status (a paused client can still show green from its last
  // check). This matters most to a funder, whose whole login is scoped to
  // one programme's clients and who otherwise has no way to tell which of
  // the entities they're paying for are still active versus stalled.
  const activeCount=clients.filter(c=>c.status!=='complete'&&c.status!=='paused').length
  const pausedCount=clients.filter(c=>c.status==='paused').length
  const completedCount=clients.filter(c=>c.status==='complete').length

  return(
    <div>
      <Kicker>Portfolio at a glance</Kicker>
      <div className="cv-grid-4" style={{marginBottom:'1.5rem'}}>
        <GlanceKPI label="Portfolio Clients" value={String(clients.length)} sub={`${canvasClients.length} GtCV · ${financialClients.length} Clearview`} color={C.navy}/>
        <GlanceKPI label="Active" value={String(activeCount)} sub="currently engaged" color={C.green}/>
        <GlanceKPI label="Paused" value={String(pausedCount)} sub={pausedCount>0?'not currently responsive':'none paused'} color={pausedCount>0?C.red:C.slate}/>
        <GlanceKPI label="Completed" value={String(completedCount)} sub="engagement closed" color={C.teal}/>
      </div>
      <div className="cv-grid-4" style={{marginBottom:'1.5rem'}}>
        <GlanceKPI label="Need Attention" value={String(counts.needsAttention)} sub="flagged red this period" color={C.red}/>
        <GlanceKPI label="Watch" value={String(counts.watch)} sub="flagged amber this period" color={C.amber}/>
        <GlanceKPI label="Healthy" value={String(counts.healthy)} sub="green health check" color={C.green}/>
      </div>

      {flagged.length>0&&(
        <div style={{...card,border:'1px solid #F1C9C2',borderLeft:`4px solid ${C.red}`}}>
          <div style={{fontWeight:700,fontSize:'1.02rem',color:C.red,marginBottom:'0.7rem'}}>⚠ {flagged.length} client{flagged.length===1?'':'s'} flagged this week</div>
          {flagged.map(c=>{
            const report=reportByClient[c.id]
            const status=healthStatusFromReportText(report?.report_text)
            const why=report?.report_text?(report.report_text.length>140?report.report_text.slice(0,140)+'…':report.report_text):'No health check generated yet.'
            return(
              <div key={c.id} style={{display:'flex',alignItems:'center',gap:'0.9rem',padding:'0.7rem 0',borderTop:'1px solid #F4F1F0',cursor:'pointer'}} onClick={()=>window.open(`/dashboard/${c.slug}`,'_blank')}>
                <Badge text={status.label} color={HEALTH_COLOR[status.label]}/>
                <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700}}>{c.name}</div><div style={{fontSize:'1.07rem',color:C.slate}}>{why}</div></div>
                <span style={{fontFamily:'monospace',fontSize:'1.01rem',fontWeight:700,color:C.red,flexShrink:0}}>Open →</span>
              </div>
            )
          })}
        </div>
      )}

      <Kicker>By programme</Kicker>
      {groups.map((g,i)=>(
        <div key={g.programme?.id||'independent'} style={{...card,marginBottom:'1.3rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem',flexWrap:'wrap',gap:'0.5rem'}}>
            <div>
              <div style={{fontFamily:'Georgia,serif',fontSize:'1.32rem',fontWeight:700,color:C.navy}}>{g.programme?g.programme.name:'Independent clients'}</div>
              <div style={{fontSize:'1.07rem',color:C.slate,marginTop:'0.15rem'}}>{g.programme?[g.programme.funder,g.programme.country].filter(Boolean).join(' · '):'Self-paying, no programme'} · {g.clients.length} client{g.clients.length===1?'':'s'}</div>
            </div>
          </div>
          <div className="cv-grid-3">
            {g.clients.map(c=>{
              const isCanvas=c.engagement_mode==='canvas'
              const prog=isCanvas?canvasProgress(canvasByClient[c.id]||[]):null
              const status=isCanvas?null:displayStatus(c)
              const accent=isCanvas?C.purple:(status?HEALTH_COLOR[status.label]:C.slate)
              return(
                <div key={c.id} style={{border:'1px solid var(--cv-border-soft)',borderTop:`4px solid ${c.status==='paused'?C.red:accent}`,borderRadius:13,padding:'1rem 1.05rem',cursor:'pointer',background:C.white}} onClick={()=>window.open(`/dashboard/${c.slug}`,'_blank')}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'0.5rem'}}>
                    <div style={{fontWeight:700,fontSize:'1.02rem'}}>{c.name}</div>
                    <div style={{display:'flex',gap:'0.3rem',flexShrink:0}}>
                      {c.status==='paused'&&<Badge text="Paused" color={C.red}/>}
                      <span style={{fontFamily:'monospace',fontSize:'0.79rem',fontWeight:700,borderRadius:4,padding:'0.08rem 0.38rem',color:isCanvas?C.purple:C.teal,border:`1px solid ${isCanvas?C.purple:C.teal}`}}>{isCanvas?'GtCV':'Clearview'}</span>
                    </div>
                  </div>
                  {isCanvas?(
                    <div style={{fontFamily:'monospace',fontSize:'0.99rem',color:C.slate,marginTop:'0.6rem'}}>{prog.totalCount>0?`${prog.doneCount}/${prog.totalCount} · ${prog.currentLabel}`:'No canvas yet'}</div>
                  ):(
                    <>
                      <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginTop:'0.6rem'}}><span>{status.dot}</span><Badge text={status.label} color={HEALTH_COLOR[status.label]}/></div>
                      {hasActuals.has(c.id)&&<div onClick={e=>e.stopPropagation()}><ClientDocumentActions clientId={c.id} clientName={c.name} clients={clients} programmes={programmes}/></div>}
                      {hasActuals.has(c.id)&&<div onClick={e=>e.stopPropagation()}>
                        <label style={{display:'flex',alignItems:'center',gap:'0.4rem',fontSize:'0.82rem',color:C.slate,marginTop:'0.5rem',cursor:'pointer'}} title="Only enable after the business owner has explicitly agreed to be named (not anonymised) in aggregated Portfolio Intelligence views.">
                          <input type="checkbox" checked={!!c.portfolio_consent_named} onChange={e=>onUpdateClient(c.id,{portfolio_consent_named:e.target.checked})}/>
                          Named in Portfolio Intelligence
                        </label>
                      </div>}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
// Pipeline by stage -- a current, point-in-time bar chart (see
// pipelineSnapshot in coach-business-metrics.ts for why this can't
// honestly be a trend yet). Bar height = deal count in that stage; value
// is shown as a secondary label underneath, never invented.
function PipelineStageChart({stages}){
  const W=560,H=178,padL=16,padR=16,padT=20,padB=34
  const maxV=Math.max(1,...stages.map(s=>s.count))
  const bw=(W-padL-padR)/stages.length
  const y=v=>padT+(1-(v/maxV))*(H-padT-padB)
  return(
    <div style={{overflowX:'auto'}}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{display:'block',minWidth:340}}>
        <line x1={padL} y1={H-padB} x2={W-padR} y2={H-padB} style={{stroke:'var(--cv-border-soft)'}}/>
        {stages.map((s,i)=>{
          const meta=DEAL_STAGE_META[s.stage]||{color:C.slate,label:s.stage}
          const x=padL+i*bw+bw*0.2, w=bw*0.6
          const top=y(s.count)
          return(
            <g key={s.stage}>
              <rect x={x} y={top} width={w} height={Math.max(0,(H-padB)-top)} rx={4} style={{fill:meta.color}}/>
              {s.count>0&&<text x={x+w/2} y={top-6} fontSize="10.5" fontWeight="700" textAnchor="middle" fontFamily="monospace" style={{fill:C.navy}}>{s.count}</text>}
              <text x={x+w/2} y={H-padB+14} fontSize="9.5" textAnchor="middle" fontFamily="monospace" style={{fill:C.slate}}>{meta.label.split(' ')[0].replace('·','')}</text>
              <text x={x+w/2} y={H-padB+25} fontSize="8.5" textAnchor="middle" fontFamily="monospace" style={{fill:C.slate}}>{fmtGlance(s.value,s.currency)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// Revenue vs cost, last 6 months -- both real, dated figures (fee_paid_at
// for revenue, issued coach_invoices.period for cost). A month with
// nothing collected/invoiced shows as a zero bar, not a gap or an
// estimate.
function RevenueCostTrendChart({periods,revenueByPeriod,costByPeriod,cur}){
  const W=560,H=190,padL=16,padR=16,padT=18,padB=30
  const maxV=Math.max(1,...periods.map(p=>Math.max(revenueByPeriod[p]||0,costByPeriod[p]||0)))
  const bw=(W-padL-padR)/periods.length
  const y=v=>padT+(1-(v/maxV))*(H-padT-padB)
  const monthLabel=p=>{const [yr,m]=p.split('-');return new Date(Number(yr),Number(m)-1,1).toLocaleDateString('en-GB',{month:'short'})}
  return(
    <div style={{overflowX:'auto'}}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{display:'block',minWidth:380}}>
        <line x1={padL} y1={H-padB} x2={W-padR} y2={H-padB} style={{stroke:'var(--cv-border-soft)'}}/>
        {periods.map((p,i)=>{
          const rev=revenueByPeriod[p]||0, cost=costByPeriod[p]||0
          const gx=padL+i*bw, barW=bw*0.3, gap=bw*0.06
          const revX=gx+bw*0.17, costX=revX+barW+gap
          const revTop=y(rev), costTop=y(cost)
          return(
            <g key={p}>
              <rect x={revX} y={revTop} width={barW} height={Math.max(0,(H-padB)-revTop)} rx={3} style={{fill:C.teal}}/>
              <rect x={costX} y={costTop} width={barW} height={Math.max(0,(H-padB)-costTop)} rx={3} style={{fill:C.purple}}/>
              <text x={gx+bw/2} y={H-padB+14} fontSize="9.5" textAnchor="middle" fontFamily="monospace" style={{fill:C.slate}}>{monthLabel(p)}</text>
            </g>
          )
        })}
      </svg>
      <div style={{display:'flex',gap:'1.1rem',fontSize:'0.87rem',fontFamily:'monospace',color:C.slate,marginTop:'0.4rem'}}>
        <span><span style={{display:'inline-block',width:10,height:10,borderRadius:2,background:C.teal,marginRight:5,verticalAlign:'middle'}}/>Revenue</span>
        <span><span style={{display:'inline-block',width:10,height:10,borderRadius:2,background:C.purple,marginRight:5,verticalAlign:'middle'}}/>Team cost</span>
      </div>
    </div>
  )
}

function MyBusinessGlance({clients,programmes,coImplementers}){
  const split=engagementSplit(clients)
  const indep=independentClients(clients)
  const feeCur=clients.find(c=>c.fee_currency)?.fee_currency||'USD'
  const outstanding=outstandingInvoiced(clients)
  const dso=averageDaysToCollect(clients)
  const programmesById=Object.fromEntries(programmes.map(p=>[p.id,p]))
  const rs=revenueStreams(clients,programmesById)
  const deals=dealCards(programmes)
  const winRate=dealWinRate(programmes)
  const streamColor={programme_advisory:C.slate,self_funded_gtcv:C.purple,clearview_subscriptions:C.teal}
  const totalPayingClients=rs.streams.reduce((s,x)=>s+x.clientCount,0)
  const streamByKey=Object.fromEntries(rs.streams.map(s=>[s.key,s]))
  // "Served / beneficiary" (docs/gtcv/README.md) = every organisation put
  // through the canvas, regardless of who pays for it -- distinct from the
  // revenue-stream cards above, which are about who's paying, not who's
  // being served. The same real count as split.gtcv, just named for what
  // it actually represents here.
  const beneficiaryCount=split.gtcv

  // Fees Paid is period-aware (month vs year, cumulative); every other
  // count/value on this tab is a CURRENT snapshot (there's no per-stream
  // collection date to split by period -- engagement_fee is a single
  // static value per client, not a dated line per month), so only this
  // one figure changes with the toggle.
  const [period,setPeriod]=useState('month')
  const now=new Date()
  const currentMonthKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const feesThisPeriod=period==='month'?feesReceivedInMonth(clients,currentMonthKey):feesReceivedInYear(clients,now.getFullYear())

  // Real canvas progress + timesheet + invoice data, fetched once for the
  // whole list -- avoids an N+1 query per client. Empty/failed fetch
  // degrades to "no data yet", never a fabricated number.
  const [canvasByClient,setCanvasByClient]=useState({})
  const [tsEntries,setTsEntries]=useState([])
  const [invoices,setInvoices]=useState([])
  useEffect(()=>{
    let cancelled=false
    const clientIds=clients.map(c=>c.id)
    if(clientIds.length===0)return
    Promise.all([
      supabase.from('canvas_decision_points').select('client_id,dp_id,status').in('client_id',clientIds),
      supabase.from('coach_timesheet_entries').select('co_implementer_id,hours,status,entry_date'),
      supabase.from('coach_invoices').select('period,status,time_amount,expenses_amount'),
    ]).then(([{data:dps},{data:entries},{data:inv}])=>{
      if(cancelled)return
      const grouped={}
      ;(dps||[]).forEach(d=>{(grouped[d.client_id]=grouped[d.client_id]||[]).push(d)})
      setCanvasByClient(grouped)
      setTsEntries(entries||[])
      setInvoices(inv||[])
    }).catch(()=>{})
    return ()=>{cancelled=true}
  },[clients])

  const trendPeriods=recentMonthPeriods(6)
  const revenueByPeriod=monthlyFeeRevenue(clients,trendPeriods)
  const costByPeriod=monthlyTeamCost(invoices,trendPeriods)
  const pipeline=pipelineSnapshot(programmes)

  return(
    <div style={{marginBottom:'1.75rem'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.6rem',marginBottom:'0.75rem'}}>
        <Kicker style={{marginBottom:0}}>My business at a glance</Kicker>
        <div style={{display:'flex',gap:'0.3rem'}}>
          <button style={subPill(period==='month')} onClick={()=>setPeriod('month')}>This Month</button>
          <button style={subPill(period==='year')} onClick={()=>setPeriod('year')}>This Year (cumulative)</button>
        </div>
      </div>
      <div className="cv-grid-4" style={{marginBottom:'0.75rem'}}>
        <GlanceKPI label="Paying Clients" value={String(totalPayingClients)} sub="across every revenue stream" color={C.navy}/>
        <GlanceKPI label="Programme Advisory" value={String(streamByKey.programme_advisory?.clientCount||0)} sub="grant-funded" color={C.slate}/>
        <GlanceKPI label="Independent Canvas Paying" value={String(streamByKey.self_funded_gtcv?.clientCount||0)} sub="self-funded GtCV" color={C.purple}/>
        <GlanceKPI label="Clearview Subscriptions" value={String(streamByKey.clearview_subscriptions?.clientCount||0)} sub="independent · recurring" color={C.teal}/>
      </div>
      <div className="cv-grid-4" style={{marginBottom:'1.5rem'}}>
        <GlanceKPI label={`Fees Paid Up · ${period==='month'?'This Month':'This Year'}`} value={fmtGlance(feesThisPeriod,feeCur)} sub="received & cleared" color={C.green}/>
        <GlanceKPI label="Invoiced · My Own DSO" value={fmtGlance(outstanding,feeCur)} sub={dso!=null?`avg ${Math.round(dso)} days to collect`:'no collections recorded yet'} color={C.amber}/>
        <GlanceKPI label="Independent Clients" value={String(indep.count)} sub={`self-paying · ${Math.round(indep.revenueShare*100)}% of revenue`} color={C.purple}/>
        <GlanceKPI label="Beneficiaries Served" value={String(beneficiaryCount)} sub="LSPs/agribusinesses through the canvas" color={C.cyan}/>
      </div>
      <Kicker>Revenue streams <span style={{textTransform:'none',letterSpacing:0,fontWeight:400}}>&middot; two of the three are independent &mdash; your own commercial base, growing off programme money</span></Kicker>
      <div className="cv-grid-3" style={{marginBottom:'1.5rem'}}>
        {rs.streams.map(s=><RevenueStreamCard key={s.key} label={s.label} value={s.value} description={s.description} tag={s.tag} barFrac={s.barFrac} currency={feeCur} color={streamColor[s.key]}/>)}
      </div>
      <Kicker>Revenue &amp; cost <span style={{textTransform:'none',letterSpacing:0,fontWeight:400}}>&middot; last 6 months, from real collections and issued co-implementer invoices</span></Kicker>
      <div style={{...card,marginBottom:'1.5rem'}}>
        <RevenueCostTrendChart periods={trendPeriods} revenueByPeriod={revenueByPeriod} costByPeriod={costByPeriod} cur={feeCur}/>
      </div>
      <Kicker>Pipeline <span style={{textTransform:'none',letterSpacing:0,fontWeight:400}}>&middot; a current snapshot, not a trend &mdash; deal stage changes aren&#39;t logged with a date yet, so this can&#39;t honestly be shown over time</span></Kicker>
      <div className="cv-grid-3" style={{marginBottom:'0.85rem'}}>
        <GlanceKPI label="Closed Deals" value={String(pipeline.closedCount)} sub="won, all-time" color={C.green}/>
        <GlanceKPI label="Open Pipeline Deals" value={String(pipeline.openCount)} sub="any stage" color={C.cyan}/>
        <GlanceKPI label={`Revenue · ${period==='month'?'This Month':'This Year'}`} value={fmtGlance(feesThisPeriod,feeCur)} sub="fees actually collected" color={C.navy}/>
      </div>
      {pipeline.stages.some(s=>s.count>0)&&(
        <div style={{...card,marginBottom:'1.5rem'}}>
          <PipelineStageChart stages={pipeline.stages}/>
        </div>
      )}
      {deals.length>0&&(<>
        <Kicker>Programme deals <span style={{textTransform:'none',letterSpacing:0,fontWeight:400}}>&middot; who actually pays for the programme-funded stream. {Math.round(winRate.pct*100)}% won ({winRate.wonCount} of {winRate.totalCount}).</span></Kicker>
        <div className="cv-grid-3" style={{marginBottom:'1.5rem'}}>
          {deals.map(d=><DealPipelineCard key={d.id} deal={d}/>)}
        </div>
      </>)}
      {/* Canvas (GtCV) clients only -- they're the only ones with decision-gate
          stages to be "how far along" through. Financial-model clients have
          no engagement stages, so listing them here just showed "No canvas
          yet" against every one of them; they already have their own view
          (Client Health, Revenue Streams above) that fits what they actually
          are. */}
      {clients.filter(c=>c.engagement_mode==='canvas').length>0&&(<>
        <Kicker>Engagements <span style={{textTransform:'none',letterSpacing:0,fontWeight:400}}>&middot; who we serve, and how far along the canvas they are</span></Kicker>
        <div style={{marginBottom:'1.5rem'}}>
          <EngagementsTable clients={clients.filter(c=>c.engagement_mode==='canvas')} programmes={programmes} coImplementers={coImplementers} canvasByClient={canvasByClient}/>
        </div>
      </>)}
      {coImplementers.length>0&&(<>
        <Kicker>Co-implementer workload <span style={{textTransform:'none',letterSpacing:0,fontWeight:400}}>&middot; hours and sessions from real timesheets. On-time gates, utilisation, and issue flags aren&#39;t tracked yet, so they&#39;re not shown here rather than guessed.</span></Kicker>
        <div className="cv-grid-3">
          {coImplementers.map(ci=><CoImplementerPerfCard key={ci.id} ci={ci} workload={coImplementerWorkload(ci.id,tsEntries)}/>)}
        </div>
      </>)}
    </div>
  )
}

// \u2500\u2500\u2500 SUPABASE HELPERS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function loadClients(){
  const {data,error}=await supabase.from('engagement_clients').select('*').order('name')
  if(error)throw error
  return data||[]
}
async function loadProgrammes(){
  const {data,error}=await supabase.from('programmes').select('*').order('name')
  if(error)throw error
  return data||[]
}
async function loadCoImplementers(){
  const {data,error}=await supabase.from('co_implementers').select('*').order('name')
  if(error)throw error
  return data||[]
}
async function loadTimesheets(){
  const {data,error}=await supabase.from('timesheets').select('*').order('date',{ascending:false})
  if(error)throw error
  return data||[]
}
async function loadClientCanvas(clientId){
  const [{data:dps},{data:comps}]=await Promise.all([
    supabase.from('canvas_decision_points').select('*').eq('client_id',clientId).order('sort_order'),
    supabase.from('canvas_components').select('*').eq('client_id',clientId).order('sort_order'),
  ])
  return (dps||[]).map(dp=>({
    ...dp,
    components:(comps||[]).filter(c=>c.dp_id===dp.dp_id),
  }))
}
async function loadClientEvidence(clientId){
  const {data}=await supabase.from('evidence_library').select('*').eq('client_id',clientId).order('reference')
  return data||[]
}
async function loadClientInterviews(clientId){
  const {data}=await supabase.from('interviews').select('*').eq('client_id',clientId).order('date',{ascending:false})
  return data||[]
}
async function loadClientHypotheses(clientId){
  const {data}=await supabase.from('hypotheses').select('*').eq('client_id',clientId).order('date_formed',{ascending:false})
  return data||[]
}
async function loadClientDecisions(clientId){
  const {data}=await supabase.from('canvas_decisions').select('*').eq('client_id',clientId).order('date',{ascending:false})
  return data||[]
}
async function loadClientDiagnostic(clientId){
  const {data}=await supabase.from('engagement_diagnostic').select('*').eq('client_id',clientId).single()
  return data
}
async function loadClientHandover(clientId){
  const {data}=await supabase.from('handover_record').select('*').eq('client_id',clientId).order('test_number')
  return data||[]
}
async function loadPilotObservations(clientId){
  const {data}=await supabase.from('pilot_observations').select('*').eq('client_id',clientId).order('date',{ascending:false})
  return data||[]
}
async function loadFileLinks(clientId){
  const {data}=await supabase.from('file_links').select('*').eq('client_id',clientId).order('sort_order')
  return data||[]
}
async function loadNotificationSettings(clientId){
  const {data}=await supabase.from('notification_settings').select('*').eq('client_id',clientId).single()
  return data
}

// \u2500\u2500\u2500 CLIENT CARD \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function ClientCard({client,programmes,onClick}){
  const prog=programmes.find(p=>p.id===client.programme_id)
  return(
    <div style={{background:C.white,border:`1px solid ${C.border}`,borderTop:`4px solid ${CLIENT_TYPE_COLORS[client.type]||C.cyan}`,borderRadius:8,padding:'1rem 1.1rem',cursor:'pointer'}} onClick={onClick}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.35rem'}}>
        <div style={{fontWeight:700,fontSize:'1.13rem',color:C.navy,lineHeight:1.3}}>{client.name}</div>
        <div style={{display:'flex',gap:'0.3rem',flexShrink:0,marginLeft:'0.5rem'}}>
          {client.clearview_active&&<span style={{fontFamily:'monospace',fontSize:'0.93rem',color:C.teal,border:`1px solid ${C.teal}`,borderRadius:3,padding:'0.05rem 0.3rem'}}>CRV</span>}
          {client.engagement_mode==='canvas'&&<span style={{fontFamily:'monospace',fontSize:'0.93rem',color:C.purple,border:`1px solid ${C.purple}`,borderRadius:3,padding:'0.05rem 0.3rem'}}>GtCV</span>}
        </div>
      </div>
      <div style={{fontSize:'0.93rem',color:C.slate,marginBottom:'0.35rem'}}>{CLIENT_TYPE_LABELS[client.type]} \u00b7 {prog?.name||'\u2014'}</div>
      {client.contact_name&&<div style={{fontSize:'0.93rem',color:C.navy,marginBottom:'0.3rem'}}>{client.contact_name}</div>}
      <Badge text={statusLabel(client.status)} color={statusColor(client.status)}/>
    </div>
  )
}

// \u2500\u2500\u2500 MAIN COMPONENT \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Sends a real Supabase Auth invite for a 'coach' (co-implementer) or
// 'funder' login, scoped via the same columns the RLS migration reads
// (user_profiles.co_implementer_id / funder_programme_id). Reuses the
// exact invite mechanism already used for ceo/finance_manager/etc --
// see app/api/invite-user/route.ts.
function InviteLoginButton({email,fullName,role,coImplementerId,funderProgrammeId}){
  const [busy,setBusy]=useState(false)
  const [msg,setMsg]=useState(null)
  async function invite(){
    if(!email){setMsg('No email on file to invite.');return}
    setBusy(true);setMsg(null)
    try{
      const {data:{session}}=await supabase.auth.getSession()
      const res=await fetch('/api/invite-user',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email,fullName,role,clientId:null,assignedUnitIds:[],coImplementerId,funderProgrammeId,inviterToken:session?.access_token}),
      })
      const data=await res.json()
      setMsg(res.ok?(data.message||'Invitation sent.'):(data.error||'Invite failed.'))
    }catch(e){setMsg('Invite failed: '+e.message)}
    setBusy(false)
  }
  return(
    <div style={{display:'flex',alignItems:'center',gap:'0.5rem',flexWrap:'wrap'}}>
      <button style={addBtn(true,C.teal)} disabled={busy} onClick={invite}>{busy?'Sending…':'Invite login'}</button>
      {msg&&<span style={{fontSize:'0.93rem',color:C.slate}}>{msg}</span>}
    </div>
  )
}

function DeleteClientConfirm({client,onCancel,onDeleted}){
  const [text,setText]=useState('')
  const [deleting,setDeleting]=useState(false)

  async function handleDelete(){
    setDeleting(true)
    try{
      await supabase.from('generic_actuals').delete().eq('client_id',client.id)
      await supabase.from('generic_model_config').delete().eq('client_id',client.id)
      await supabase.from('engagement_clients').delete().eq('id',client.id)
      onDeleted()
    }catch(e){
      alert('Delete failed: '+e.message)
      setDeleting(false)
    }
  }

  return(
    <div style={{...card,border:`2px solid ${C.red}`,background:'var(--cv-tint-red)'}}>
      <div style={{fontWeight:700,color:C.red,marginBottom:'0.5rem'}}>Delete {client.name}?</div>
      <p style={{fontSize:'1.07rem',color:C.navy,lineHeight:1.7,marginBottom:'0.85rem'}}>This permanently deletes this client, their entire financial model, and all submitted actuals. This cannot be undone. Type the client's name below to confirm.</p>
      <input style={{...inp,marginBottom:'0.75rem'}} placeholder={client.name} value={text} onChange={e=>setText(e.target.value)} autoFocus/>
      {(()=>{const isMatch=text.trim().toLowerCase()===client.name.trim().toLowerCase();return(
      <div style={{display:'flex',gap:'0.6rem'}}>
        <button disabled={!isMatch||deleting} onClick={handleDelete} style={{fontFamily:'monospace',fontSize:'1.01rem',fontWeight:700,padding:'0.5rem 1.1rem',border:'none',borderRadius:5,background:isMatch?C.red:C.border,color:'var(--cv-on-accent)',cursor:isMatch?'pointer':'not-allowed'}}>{deleting?'Deleting...':'Permanently Delete'}</button>
        <button onClick={onCancel} style={addBtn(true,C.slate)}>Cancel</button>
      </div>
      )})()}
    </div>
  )
}

function ClearviewHealthSummary({clients}){
  const [summaries,setSummaries]=useState({})
  const [loading,setLoading]=useState(true)
  const financialClients = clients.filter(c=>c.engagement_mode==='financial')

  useEffect(()=>{
    if(financialClients.length===0){setLoading(false);return}
    Promise.all(financialClients.map(c=>
      supabase.from('ai_health_checks').select('period,report_text,generated_at').eq('client_id',c.id).order('period',{ascending:false}).limit(1)
        .then(({data})=>({clientId:c.id,latest:data?.[0]||null}))
    )).then(results=>{
      const map={}
      results.forEach(r=>{map[r.clientId]=r.latest})
      setSummaries(map)
      setLoading(false)
    })
  },[clients.length])

  function statusFromReport(text){
    if(!text)return{label:'No data',color:C.slate,dot:'\u26AA'}
    const lower=text.toLowerCase()
    if(lower.includes('red')||lower.includes('at risk')||lower.includes('concern'))return{label:'Needs attention',color:C.red,dot:'\ud83d\udd34'}
    if(lower.includes('amber')||lower.includes('caution'))return{label:'Watch',color:C.amber,dot:'\ud83d\udfe1'}
    if(lower.includes('green')||lower.includes('healthy')||lower.includes('strong'))return{label:'Healthy',color:C.green,dot:'\ud83d\udfe2'}
    return{label:'Reviewed',color:C.teal,dot:'\ud83d\udd35'}
  }

  if(financialClients.length===0)return null
  if(loading)return<div style={{...card,textAlign:'center',padding:'1.5rem',color:C.slate,fontSize:'1.07rem'}}>Loading Clearview health summary...</div>

  const flagged = financialClients.filter(c=>{
    const r=summaries[c.id]
    const s=statusFromReport(r?.report_text)
    return s.label==='Needs attention'||s.label==='Watch'
  })
  const sorted = [...financialClients].sort((a,b)=>{
    const sa=statusFromReport(summaries[a.id]?.report_text)
    const sb=statusFromReport(summaries[b.id]?.report_text)
    const rank={'Needs attention':0,'Watch':1,'Reviewed':2,'Healthy':3,'No data':4}
    return rank[sa.label]-rank[sb.label]
  })

  return(
    <div style={card}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div style={secH}>Clearview Business Intelligence — All Clients</div>
        {flagged.length>0&&<Badge text={`${flagged.length} need attention`} color={C.red}/>}
      </div>
      {sorted.map(c=>{
        const report=summaries[c.id]
        const status=statusFromReport(report?.report_text)
        return(
          <div key={c.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.6rem 0.85rem',borderRadius:6,marginBottom:'0.45rem',background:status.label==='Needs attention'?'var(--cv-tint-red)':status.label==='Watch'?'var(--cv-tint-amber)':C.lightBg,cursor:'pointer'}}
            onClick={()=>window.open(`/dashboard/${c.slug}`,'_blank')}>
            <div style={{display:'flex',alignItems:'center',gap:'0.6rem'}}>
              <span style={{fontSize:'1rem'}}>{status.dot}</span>
              <div>
                <div style={{fontWeight:600,fontSize:'1.07rem',color:C.navy}}>{c.name}</div>
                <div style={{fontSize:'0.93rem',color:C.slate}}>{report?`Last reviewed ${new Date(report.generated_at).toLocaleDateString('en-GB')}`:'No health check generated yet'}</div>
              </div>
            </div>
            <Badge text={status.label} color={status.color}/>
          </div>
        )
      })}
    </div>
  )
}

function CopyIntakeLink({client}){
  const [link,setLink]=useState(null)
  const [loading,setLoading]=useState(true)
  const [copied,setCopied]=useState(false)
  const [creating,setCreating]=useState(false)

  useEffect(()=>{
    supabase.from('client_intake_links').select('token').eq('client_id',client.id).order('created_at',{ascending:false}).limit(1).maybeSingle()
      .then(({data})=>{ setLink(data?.token||null); setLoading(false) })
  },[client.id])

  async function generateLink(){
    setCreating(true)
    const {data,error}=await supabase.from('client_intake_links').insert([{
      client_name:client.name, client_id:client.id, programme_id:client.programme_id||null, created_by:'coach',
    }]).select('token').single()
    if(!error&&data) setLink(data.token)
    setCreating(false)
  }

  function copyToClipboard(){
    if(!link)return
    const url=`https://clearview.habibonifade.com/intake/${link}`
    navigator.clipboard.writeText(url).then(()=>{
      setCopied(true)
      setTimeout(()=>setCopied(false),2000)
    })
  }

  if(loading)return null

  if(!link){
    return(
      <button onClick={generateLink} disabled={creating} style={{fontFamily:'monospace',fontSize:'0.93rem',padding:'0.4rem 0.85rem',borderRadius:4,background:'transparent',border:'1px solid var(--cv-wa-40)',color:'var(--cv-wa-80)',cursor:creating?'not-allowed':'pointer'}}>
        {creating?'Creating link...':`Generate ${client.name} Data Capture Link`}
      </button>
    )
  }

  return(
    <>
    <button onClick={copyToClipboard} style={{fontFamily:'monospace',fontSize:'0.93rem',padding:'0.4rem 0.85rem',borderRadius:4,background:copied?C.green:'transparent',border:`1px solid ${copied?C.green:'var(--cv-wa-40)'}`,color:'var(--cv-on-accent)',cursor:'pointer'}}>
      {copied?'Copied!':`Copy ${client.name} Data Capture Link`}
    </button>
    <a href="/Clearview_Data_Capture_Template_v7.xlsx" download="Clearview_Data_Capture_Template_v7.xlsx"
      style={{fontFamily:'monospace',fontSize:'0.93rem',padding:'0.4rem 0.85rem',borderRadius:4,
        background:'transparent',border:'1px solid var(--cv-wa-40)',
        color:'var(--cv-wa-80)',cursor:'pointer',textDecoration:'none',display:'inline-block',marginLeft:'0.5rem'}}>
      ⬇ Download Template
    </a>
    </>
  )
}

const LRS_DIM_LABELS={marketOpportunity:'Market Opportunity',visibility:'Visibility',trust:'Trust',profitability:'Profitability',capacity:'Capacity',resilience:'Resilience',compliance:'Compliance'}
const FAC_TYPE_LABELS={credit:'Credit',grant:'Grant',equity:'Equity',consignment:'Consignment',recoverableGrant:'Recoverable Grant'}
function fmtPortfolioMoney(n,cc){
  if(n===null||n===undefined)return'n/a'
  const v=Math.round(Math.abs(n))
  const s=v>=1000000?`${(v/1000000).toFixed(1)}M`:v>=1000?`${(v/1000).toFixed(0)}K`:v.toString()
  return `${cc} ${s}`
}

// Portfolio Intelligence: Habib's own bizdev/programme-design view across
// every financial client on the platform. Levels 1 (overview) and 2
// (segment drilldown) only -- see src/lib/portfolio-intelligence.ts for
// what's deliberately not computed and why (no fabricated time-to-
// readiness estimates, no hypothetical "if everyone were ready" capital
// figures). Restricted to super_coach server-side (see
// app/api/portfolio-intelligence/route.ts); this component doesn't
// re-check the role, it relies on the route's own check plus the fact
// only super_coach ever sees this tab in mainNavTabs.
function PortfolioIntelligenceHub({clients,programmes}){
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [filter,setFilter]=useState({})
  const [openProfile,setOpenProfile]=useState(null)
  const [showAccess,setShowAccess]=useState(false)
  const [downloading,setDownloading]=useState(false)
  const [downloadError,setDownloadError]=useState('')

  async function downloadBrief(currentFilter){
    setDownloading(true);setDownloadError('')
    try{
      const {data:{session}}=await supabase.auth.getSession()
      const hasActiveFilter=Object.keys(currentFilter).length>0
      const response=await fetch('/api/portfolio-brief',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requesterToken:session?.access_token,filter:hasActiveFilter?currentFilter:undefined})})
      if(!response.ok){const errData=await response.json().catch(()=>({}));throw new Error(errData.error||'Could not generate the document')}
      const blob=await response.blob()
      const disposition=response.headers.get('Content-Disposition')||''
      const match=disposition.match(/filename="(.+)"/)
      const fileName=match?match[1]:'Clearview_Portfolio_Intelligence.docx'
      const url=URL.createObjectURL(blob)
      const a=document.createElement('a')
      a.href=url; a.download=fileName
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }catch(e){setDownloadError(e.message||'Download failed')}
    setDownloading(false)
  }

  const load=useCallback((f)=>{
    setLoading(true);setError('')
    supabase.auth.getSession().then(({data:{session}})=>{
      fetch('/api/portfolio-intelligence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requesterToken:session?.access_token,filter:f})})
        .then(r=>r.json())
        .then(json=>{
          if(json.error){setError(json.error);setLoading(false);return}
          setData(json);setLoading(false)
        })
        .catch(e=>{setError(e.message||'Could not load portfolio data');setLoading(false)})
    })
  },[])
  useEffect(()=>{load(filter)},[])

  function applyFilter(next){
    const merged={...filter,...next}
    Object.keys(merged).forEach(k=>{if(!merged[k])delete merged[k]})
    setFilter(merged)
    load(merged)
  }

  if(loading)return<div style={{...card,textAlign:'center',padding:'2rem',color:C.slate}}>Loading portfolio intelligence...</div>
  if(error)return<div style={{...card,border:`1px solid ${C.red}`}}><div style={{color:C.red,fontWeight:600}}>⚠ {error}</div></div>
  if(!data||data.snapshotCount===0)return<div style={{...card,textAlign:'center',padding:'2rem',color:C.slate}}>No financial clients with data on file yet.</div>

  const {portfolio,segment,filterOptions,snapshotCount}=data
  const hasFilter=Object.keys(filter).length>0
  const view=hasFilter&&segment?segment.segment:portfolio
  const currencies=Object.keys(portfolio.currentFundAbsorption)
  const programmesById=Object.fromEntries((programmes||[]).map(p=>[p.id,p]))
  const pipelineEntries=[['investment_ready',C.green],['near_ready',C.cyan],['development_stage',C.amber],['pre_investment',C.red]]

  return(
    <div>
      <Kicker>Portfolio Intelligence · {snapshotCount} financial client{snapshotCount===1?'':'s'}</Kicker>

      <div style={{...card,display:'flex',flexWrap:'wrap',gap:'0.6rem',alignItems:'center'}}>
        <select value={filter.programmeId||''} onChange={e=>applyFilter({programmeId:e.target.value})} style={{padding:'0.4rem 0.5rem',borderRadius:6,border:'1px solid var(--cv-border-soft)'}}>
          <option value="">All programmes</option>
          {filterOptions.programmeIds.map(id=><option key={id} value={id}>{programmesById[id]?.name||'Unknown programme'}</option>)}
        </select>
        <select value={filter.sector||''} onChange={e=>applyFilter({sector:e.target.value})} style={{padding:'0.4rem 0.5rem',borderRadius:6,border:'1px solid var(--cv-border-soft)'}}>
          <option value="">All sectors</option>
          {filterOptions.sectors.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filter.country||''} onChange={e=>applyFilter({country:e.target.value})} style={{padding:'0.4rem 0.5rem',borderRadius:6,border:'1px solid var(--cv-border-soft)'}}>
          <option value="">All countries</option>
          {filterOptions.countries.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filter.readinessStage||''} onChange={e=>applyFilter({readinessStage:e.target.value})} style={{padding:'0.4rem 0.5rem',borderRadius:6,border:'1px solid var(--cv-border-soft)'}}>
          <option value="">All readiness stages</option>
          {Object.entries(READINESS_STAGE_LABELS).map(([k,l])=><option key={k} value={k}>{l}</option>)}
        </select>
        {hasFilter&&<button onClick={()=>{setFilter({});load({})}} style={{fontSize:'0.85rem',color:C.slate,background:'none',border:'1px solid var(--cv-border-soft)',borderRadius:6,padding:'0.35rem 0.7rem',cursor:'pointer'}}>Clear filters</button>}
        <button disabled={downloading} onClick={()=>downloadBrief(filter)} style={{marginLeft:'auto',fontSize:'0.85rem',fontWeight:600,color:C.teal,background:'none',border:`1px solid ${C.teal}`,borderRadius:6,padding:'0.35rem 0.7rem',cursor:'pointer'}}>{downloading?'Generating…':'⬇ Word Summary'}</button>
        <button onClick={()=>setShowAccess(true)} style={{fontSize:'0.85rem',fontWeight:600,color:C.navy,background:'none',border:'1px solid var(--cv-border-soft)',borderRadius:6,padding:'0.35rem 0.7rem',cursor:'pointer'}}>🔗 External Access</button>
        {downloadError&&<div style={{width:'100%',fontSize:'0.78rem',color:C.red}}>{downloadError}</div>}
      </div>
      {showAccess&&<ExternalAccessPanel portfolioFilter={hasFilter?filter:undefined} clients={clients} programmes={programmes} onClose={()=>setShowAccess(false)}/>}

      {hasFilter&&(
        <DrillConnector>↓ filtered to {[filter.programmeId&&(programmesById[filter.programmeId]?.name||'a programme'),filter.sector,filter.country,filter.readinessStage&&READINESS_STAGE_LABELS[filter.readinessStage]].filter(Boolean).join(' · ')} ↓</DrillConnector>
      )}
      <LevelMarker n={hasFilter?2:1} label={hasFilter?'Segment view':'Portfolio overview'} sub={hasFilter?`${view.totalBusinesses} of ${portfolio.totalBusinesses} businesses portfolio-wide`:'every financial business on the platform'}/>

      <div className="cv-grid-4" style={{marginBottom:'1.25rem'}}>
        <GlanceKPI label="Businesses" value={String(view.totalBusinesses)} sub={hasFilter?`of ${portfolio.totalBusinesses} portfolio-wide`:'on platform'} color={C.navy}/>
        <GlanceKPI label="Avg Investment Readiness" value={`${Math.round(view.avgIRScore)}/30`} sub="current scores" color={C.teal}/>
        <GlanceKPI label="Avg Verification Confidence" value={`${Math.round(view.avgConfidenceScore)}/100`} sub="current period" color={C.cyan}/>
        <GlanceKPI label="Avg Liquidity Readiness" value={`${Math.round(view.avgLRSScore)}/100`} sub="seven dimensions" color={C.purple}/>
      </div>

      <div style={card}>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.15rem',fontWeight:700,color:C.navy,marginBottom:'0.8rem'}}>Readiness pipeline</div>
        <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap'}}>
          {pipelineEntries.map(([stage,color])=>(
            <div key={stage} style={{flex:'1 1 140px',borderLeft:`4px solid ${color}`,padding:'0.5rem 0.8rem',background:'var(--cv-tint-cyan)',borderRadius:4}}>
              <div style={{fontSize:'1.3rem',fontWeight:700,color}}>{view.readinessPipeline[stage]}</div>
              <div style={{fontSize:'0.85rem',color:C.slate}}>{READINESS_STAGE_LABELS[stage]} · {Math.round(view.readinessPipelinePct[stage])}%</div>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.15rem',fontWeight:700,color:C.navy,marginBottom:'0.4rem'}}>
          Seven-dimension average{hasFilter?' — this segment vs. portfolio':''}
        </div>
        {view.mostCommonWeakDimension&&<div style={{fontSize:'0.9rem',color:C.slate,marginBottom:'0.8rem'}}>Weakest dimension: <b style={{color:C.red}}>{LRS_DIM_LABELS[view.mostCommonWeakDimension]}</b></div>}
        <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
          {Object.entries(view.dimensionAverages).map(([dim,avg])=>{
            const portfolioAvg=portfolio.dimensionAverages[dim]
            return(
              <div key={dim} style={{display:'flex',alignItems:'center',gap:'0.6rem'}}>
                <div style={{width:150,fontSize:'0.9rem',color:C.navy,flexShrink:0}}>{LRS_DIM_LABELS[dim]}</div>
                <div style={{flex:1,background:'var(--cv-tint-cyan)',borderRadius:4,height:14,position:'relative'}}>
                  <div style={{width:`${Math.max(2,avg)}%`,background:C.teal,height:'100%',borderRadius:4}}/>
                  {hasFilter&&<div style={{position:'absolute',left:`${Math.max(0,portfolioAvg-0.5)}%`,top:-2,width:2,height:18,background:C.navy}} title={`Portfolio average: ${Math.round(portfolioAvg)}`}/>}
                </div>
                <div style={{width:40,fontSize:'0.88rem',color:C.slate,textAlign:'right'}}>{Math.round(avg)}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={card}>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.15rem',fontWeight:700,color:C.navy,marginBottom:'0.8rem'}}>Verification confidence distribution</div>
        <div style={{display:'flex',gap:'0.4rem',alignItems:'flex-end',height:100}}>
          {view.verificationDistribution.map(b=>{
            const maxCount=Math.max(1,...view.verificationDistribution.map(x=>x.count))
            return(
              <div key={b.label} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'0.3rem'}}>
                <div style={{fontSize:'0.85rem',color:C.navy,fontWeight:600}}>{b.count}</div>
                <div style={{width:'100%',height:`${Math.max(4,(b.count/maxCount)*70)}px`,background:C.cyan,borderRadius:'3px 3px 0 0'}}/>
                <div style={{fontSize:'0.75rem',color:C.slate}}>{b.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={card}>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.15rem',fontWeight:700,color:C.navy,marginBottom:'0.3rem'}}>Current fund absorption capacity</div>
        <div style={{fontSize:'0.85rem',color:C.slate,marginBottom:'0.8rem'}}>Average of what each business could absorb TODAY, by type -- not a hypothetical "if all were investment-ready" ceiling. Shown separately per currency; never blended across currencies.</div>
        {currencies.length===0?(
          <div style={{color:C.slate,fontSize:'0.9rem'}}>Not yet available.</div>
        ):currencies.map(cc=>(
          <div key={cc} style={{marginBottom:'0.8rem'}}>
            <div style={{fontFamily:'monospace',fontSize:'0.85rem',color:C.slate,marginBottom:'0.4rem'}}>{cc}</div>
            <div className="cv-grid-4">
              {Object.entries(portfolio.currentFundAbsorption[cc]).map(([type,val])=>(
                <div key={type} style={{border:'1px solid var(--cv-border-soft)',borderRadius:8,padding:'0.6rem 0.8rem'}}>
                  <div style={{fontSize:'0.8rem',color:C.slate}}>{FAC_TYPE_LABELS[type]}</div>
                  <div style={{fontSize:'1.05rem',fontWeight:700,color:C.navy}}>{fmtPortfolioMoney(val,cc)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {hasFilter&&segment&&(
        <div style={card}>
          <div style={{fontFamily:'Georgia,serif',fontSize:'1.15rem',fontWeight:700,color:C.navy,marginBottom:'0.8rem'}}>Weakest dimensions in this segment, ranked</div>
          <ol style={{margin:0,paddingLeft:'1.2rem'}}>
            {segment.weakestDimensionsInSegment.slice(0,3).map(dim=>{
              const cmp=segment.dimensionComparison.find(d=>d.dimension===dim)
              return(
                <li key={dim} style={{fontSize:'0.95rem',color:C.navy,marginBottom:'0.3rem'}}>
                  {LRS_DIM_LABELS[dim]}: {Math.round(cmp.segmentAvg)} vs. portfolio {Math.round(cmp.portfolioAvg)}
                  {cmp.delta<0&&<span style={{color:C.red}}> ({Math.round(cmp.delta)} below portfolio)</span>}
                </li>
              )
            })}
          </ol>
        </div>
      )}

      <DrillConnector>↓ individual businesses within this view ↓</DrillConnector>
      <LevelMarker n={3} label="Individual businesses" sub="click one to drill in"/>
      <div style={card}>
        <div style={{fontSize:'0.85rem',color:C.slate,marginBottom:'0.8rem'}}>Anonymised by default -- a business only shows its real name here once its owner has explicitly consented (toggled from the Client Health tab).</div>
        <div className="cv-grid-3">
          {(data.profiles||[]).map(p=>(
            <div key={p.refCode} onClick={()=>setOpenProfile(p)} style={{border:'1px solid var(--cv-border-soft)',borderRadius:8,padding:'0.7rem 0.85rem',cursor:'pointer'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'0.5rem'}}>
                <div style={{fontWeight:700,fontSize:'0.95rem',color:C.navy,fontFamily:p.isNamed?'inherit':'monospace'}}>{p.displayName}</div>
                {p.isNamed&&<Badge text="Verified" color={C.green}/>}
              </div>
              <div style={{fontSize:'0.82rem',color:C.slate,marginTop:'0.2rem'}}>{p.sector||'Sector n/a'} · {p.country||'Country n/a'} · {p.sizeBracket}</div>
              <div style={{fontSize:'0.82rem',color:C.slate,marginTop:'0.2rem'}}>{p.irTier} · IR {Math.round(p.irScore)}/30 · Confidence {Math.round(p.confidenceScore)}/100</div>
            </div>
          ))}
          {(data.profiles||[]).length===0&&<div style={{color:C.slate,fontSize:'0.9rem'}}>No businesses match the current filter.</div>}
        </div>
      </div>

      {openProfile&&(
        <div style={{position:'fixed',inset:0,background:'rgba(11,31,51,0.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}} onClick={()=>setOpenProfile(null)}>
          <div style={{...card,maxWidth:640,width:'100%',maxHeight:'85vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.9rem'}}>
              <div>
                <span style={{fontFamily:'monospace',fontSize:'0.72rem',fontWeight:700,color:'var(--cv-on-accent)',background:C.navy,borderRadius:20,padding:'0.1rem 0.6rem',marginBottom:'0.4rem',display:'inline-block'}}>LEVEL 3</span>
                <div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:C.navy}}>{openProfile.displayName}{openProfile.isNamed&&<span style={{marginLeft:'0.5rem'}}><Badge text="Verified" color={C.green}/></span>}</div>
                <div style={{fontSize:'0.92rem',color:C.slate,marginTop:'0.2rem'}}>{openProfile.sector||'Sector n/a'} · {openProfile.country||'Country n/a'} · {openProfile.sizeBracket}</div>
              </div>
              <button onClick={()=>setOpenProfile(null)} style={{background:'none',border:'none',fontSize:'1.3rem',color:C.slate,cursor:'pointer',lineHeight:1}}>×</button>
            </div>

            <div className="cv-grid-3" style={{marginBottom:'1rem'}}>
              <GlanceKPI label="Investment Readiness" value={`${Math.round(openProfile.irScore)}/30`} sub={openProfile.irTier} color={C.teal}/>
              <GlanceKPI label="Verification Confidence" value={`${Math.round(openProfile.confidenceScore)}/100`} sub={`${openProfile.confidenceBadges.length} badge${openProfile.confidenceBadges.length===1?'':'s'} earned`} color={C.cyan}/>
              <GlanceKPI label="Liquidity Readiness" value={`${Math.round(openProfile.lrs.score)}/100`} sub="seven dimensions" color={C.purple}/>
            </div>

            <div style={{fontWeight:700,fontSize:'0.95rem',color:C.navy,marginBottom:'0.5rem'}}>Readiness scorecard</div>
            <div style={{display:'flex',flexDirection:'column',gap:'0.4rem',marginBottom:'1rem'}}>
              {Object.entries(openProfile.lrs.dimensions).map(([dim,d])=>(
                <div key={dim} style={{display:'flex',alignItems:'center',gap:'0.6rem'}}>
                  <div style={{width:150,fontSize:'0.88rem',color:C.navy,flexShrink:0}}>{LRS_DIM_LABELS[dim]}</div>
                  <div style={{flex:1,background:'var(--cv-tint-cyan)',borderRadius:4,height:12}}>
                    <div style={{width:`${Math.max(2,d.score)}%`,background:C.teal,height:'100%',borderRadius:4}}/>
                  </div>
                  <div style={{width:36,fontSize:'0.85rem',color:C.slate,textAlign:'right'}}>{Math.round(d.score)}</div>
                </div>
              ))}
            </div>

            <div style={{fontWeight:700,fontSize:'0.95rem',color:C.navy,marginBottom:'0.5rem'}}>Fund absorption capacity</div>
            <div className="cv-grid-3" style={{marginBottom:'1rem'}}>
              {Object.entries(FAC_TYPE_LABELS).map(([key,label])=>{
                const t=openProfile.fac[key]
                return(
                  <div key={key} style={{border:'1px solid var(--cv-border-soft)',borderRadius:8,padding:'0.5rem 0.7rem'}}>
                    <div style={{fontSize:'0.78rem',color:C.slate}}>{label}</div>
                    <div style={{fontSize:'0.95rem',fontWeight:700,color:C.navy}}>{t.capacity===null?'n/a':fmtPortfolioMoney(t.capacity,openProfile.currency)}</div>
                  </div>
                )
              })}
            </div>

            {openProfile.businessUnits.length>0&&<>
              <div style={{fontWeight:700,fontSize:'0.95rem',color:C.navy,marginBottom:'0.5rem'}}>Business unit structure ({openProfile.businessUnits.length} unit{openProfile.businessUnits.length===1?'':'s'})</div>
              <div style={{display:'flex',flexDirection:'column',gap:'0.3rem'}}>
                {openProfile.businessUnits.map(u=>(
                  <div key={u.name} style={{display:'flex',justifyContent:'space-between',fontSize:'0.88rem',color:C.navy}}>
                    <span>{u.name}</span><span style={{color:C.slate}}>{Math.round(u.revenuePct)}% of revenue</span>
                  </div>
                ))}
              </div>
            </>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function CoachDashboard({onSignOut,userRole='super_coach',userName='Habib Onifade',coImplementerId=null,funderProgrammeId=null}){
  const isSuperCoach=userRole==='super_coach'
  const isFunder=userRole==='funder'
  const isCoImplementer=userRole==='coach'
  // Both non-super_coach roles land here through the exact same data path
  // (loadClients/loadProgrammes/loadCoImplementers -- unfiltered queries
  // that RLS scopes down automatically), reusing the same Clients/
  // ClientDetailView UI the coach already has. A funder never edits
  // anything; a co-implementer edits only the canvas fieldwork on their
  // own assigned clients (also RLS-enforced, not just hidden in the UI).
  const canEditClients=!isFunder
  const [programmes,setPrograms]=useState([])
  const [clients,setClients]=useState([])
  const [coImplementers,setCoImplementers]=useState([])
  const [timesheets,setTimesheets]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState(null)
  const [view,setView]=useState(()=>isSuperCoach?'overview':'clients')
  const [selClientId,setSelClientId]=useState(null)
  const [selProgId,setSelProgId]=useState(null)
  const [showDeleteConfirm,setShowDeleteConfirm]=useState(false)
  const [showEditClient,setShowEditClient]=useState(false)
  useEffect(()=>{setShowEditClient(false);setShowDeleteConfirm(false)},[selClientId])
  const [clientData,setClientData]=useState({})
  const [clientLoading,setClientLoading]=useState(false)
  const [activeTab,setActiveTab]=useState('cover')
  // Lifted up from the tab components below rather than kept as their own
  // useState: those (ClientsHub/ClientsView/ProgrammesHub/TeamHub) are
  // defined as nested functions inside this component's own render body,
  // so React sees a "new" component on every render of CoachDashboard
  // (e.g. every time setClients/setCoImplementers/etc. fires anywhere in
  // this tree) and silently remounts them, wiping any state that lived
  // inside them -- which is exactly why a filter selection (e.g. "Paused")
  // or the Health/All-clients toggle could reset on their own. Keeping
  // this state up here, where CoachDashboard itself never remounts, fixes
  // that without a full rewrite of every nested view into a top-level
  // component.
  const [clientsFilter,setClientsFilter]=useState('all')
  const [clientsSub,setClientsSub]=useState('health')
  const [programmesSub,setProgrammesSub]=useState('pipeline')
  // Light/dark theme -- same 'cv-theme' localStorage key and
  // document.documentElement.dataset.theme mechanism GenericDashboard
  // uses, so a coach's choice here and a client's choice there share one
  // preference and both dashboards' shared CSS custom properties respond
  // the same way. This was previously only wired up in GenericDashboard.
  const [theme,setTheme]=useState('light')
  useEffect(()=>{
    const saved=localStorage.getItem('cv-theme')
    const initial=saved==='light'||saved==='dark'?saved:'light'
    setTheme(initial)
    if(initial==='dark')document.documentElement.dataset.theme='dark'
    else delete document.documentElement.dataset.theme
  },[])
  const toggleTheme=()=>{
    setTheme(prev=>{
      const next=prev==='dark'?'light':'dark'
      localStorage.setItem('cv-theme',next)
      if(next==='dark')document.documentElement.dataset.theme='dark'
      else delete document.documentElement.dataset.theme
      return next
    })
  }
  const [teamSub,setTeamSub]=useState('roster')

  // Load all top-level data on mount
  useEffect(()=>{
    async function load(){
      try{
        const [progs,cls,cis,ts]=await Promise.all([loadProgrammes(),loadClients(),loadCoImplementers(),loadTimesheets()])
        setPrograms(progs)
        setClients(cls)
        setCoImplementers(cis)
        setTimesheets(ts)
      }catch(e){
        setError(e.message)
      }finally{
        setLoading(false)
      }
    }
    load()
  },[])

  // Load full client data when a client is selected
  useEffect(()=>{
    if(!selClientId)return
    const client=clients.find(c=>c.id===selClientId)
    if(!client||client.engagement_mode!=='canvas')return
    if(clientData[selClientId]?.canvas)return // already loaded
    setClientLoading(true)
    Promise.all([
      loadClientCanvas(selClientId),
      loadClientEvidence(selClientId),
      loadClientInterviews(selClientId),
      loadClientHypotheses(selClientId),
      loadClientDecisions(selClientId),
      loadClientDiagnostic(selClientId),
      loadClientHandover(selClientId),
      loadPilotObservations(selClientId),
      loadFileLinks(selClientId),
      loadNotificationSettings(selClientId),
    ]).then(([canvas,evidence,interviews,hypotheses,decisions,diagnostic,handover,pilots,fileLinks,notifications])=>{
      setClientData(prev=>({...prev,[selClientId]:{canvas,evidence,interviews,hypotheses,decisions,diagnostic,handover,pilots,fileLinks,notifications}}))
      setClientLoading(false)
    }).catch(e=>{
      console.error(e)
      setClientLoading(false)
    })
  },[selClientId])

  const pending=timesheets.filter(t=>t.status==='submitted').length
  const activeClients=clients.filter(c=>c.status!=='complete'&&c.status!=='paused')
  const pausedClients=clients.filter(c=>c.status==='paused')
  const clearviewLive=clients.filter(c=>c.clearview_active)
  const canvasClients=clients.filter(c=>c.engagement_mode==='canvas')

  async function updateClient(id,updates){
    await supabase.from('engagement_clients').update({...updates,updated_at:new Date().toISOString()}).eq('id',id)
    setClients(prev=>prev.map(c=>c.id!==id?c:{...c,...updates}))
  }

  async function updateDP(clientId,dpId,updates){
    await supabase.from('canvas_decision_points').update({...updates,updated_at:new Date().toISOString()}).eq('client_id',clientId).eq('dp_id',dpId)
    setClientData(prev=>({...prev,[clientId]:{...prev[clientId],canvas:(prev[clientId]?.canvas||[]).map(dp=>dp.dp_id!==dpId?dp:{...dp,...updates})}}))
  }

  async function updateComponent(clientId,dpId,compNumber,updates){
    await supabase.from('canvas_components').update({...updates,updated_at:new Date().toISOString()}).eq('client_id',clientId).eq('dp_id',dpId).eq('component_number',compNumber)
    setClientData(prev=>({...prev,[clientId]:{...prev[clientId],canvas:(prev[clientId]?.canvas||[]).map(dp=>dp.dp_id!==dpId?dp:{...dp,components:dp.components.map(c=>c.component_number!==compNumber?c:{...c,...updates})})}}))
  }

  if(loading)return<Spinner/>
  if(error)return<div style={{padding:'2rem',fontFamily:"'Segoe UI',system-ui,sans-serif"}}><div style={{color:C.red,marginBottom:'1.5rem'}}>Error loading data: {error}</div><p style={{color:C.slate,fontSize:'1.07rem',marginBottom:'1rem'}}>This is usually caused by a stale session. Sign out and sign back in to fix it.</p><button onClick={onSignOut} style={{fontFamily:'monospace',fontSize:'1.07rem',padding:'0.6rem 1.4rem',border:'none',borderRadius:6,background:'var(--cv-header)',color:'var(--cv-on-accent)',cursor:'pointer'}}>Sign Out and Refresh</button></div>

  const selClient=clients.find(c=>c.id===selClientId)
  const selClientFullData=clientData[selClientId]||{}

  // \u2500\u2500 OVERVIEW \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const newSubmissions = clients.filter(c => c.status === 'setup' && (c.notes || '').includes('Self-submitted intake'))

  function OverviewTab(){
    const [refreshingOv,setRefreshingOv]=useState(false)
    async function refreshOverview(){
      setRefreshingOv(true)
      try { const fresh = await loadClients(); setClients(fresh) }
      catch(e) {}
      setRefreshingOv(false)
    }
    return(
      <div>
        <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'0.75rem'}}>
          <button style={addBtn(true,C.teal)} onClick={refreshOverview} disabled={refreshingOv}>{refreshingOv?'Refreshing...':'\u21bb Refresh client list'}</button>
        </div>
        {newSubmissions.length>0&&(
          <div style={{background:'var(--cv-tint-cyan)',border:`1px solid ${C.teal}`,borderRadius:8,padding:'0.85rem 1.1rem',marginBottom:'1.25rem'}}>
            <div style={{fontWeight:700,color:C.teal,marginBottom:'0.6rem'}}>New Clearview data capture submissions ({newSubmissions.length})</div>
            {newSubmissions.map(c=>(
              <div key={c.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.5rem 0.75rem',background:C.white,borderRadius:5,marginBottom:'0.4rem',border:`1px solid ${C.border}`}}>
                <div>
                  <div style={{fontWeight:600,fontSize:'1.07rem',color:C.navy}}>{c.name}</div>
                  <div style={{fontSize:'0.93rem',color:C.slate}}>{c.contact_name}{c.created_at?(' \u00b7 submitted '+new Date(c.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})):''}</div>
                </div>
                <button style={addBtn(true,C.teal)} onClick={()=>{setSelClientId(c.id);setActiveTab('cover');setView('client')}}>Review {'\u2192'}</button>
              </div>
            ))}
          </div>
        )}
        {pending>0&&<div style={{background:'var(--cv-tint-amber)',border:`1px solid ${C.amber}`,borderRadius:8,padding:'0.85rem 1.1rem',marginBottom:'1.25rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontWeight:600,color:C.amber}}>\u23f3 {pending} timesheet{pending>1?'s':''} awaiting approval</span><button style={addBtn(true,C.amber)} onClick={()=>setView('team')}>Review \u2192</button></div>}
        <MyBusinessGlance clients={clients} programmes={programmes} coImplementers={coImplementers}/>
        {programmes.map(prog=>{
          const progClients=clients.filter(c=>c.programme_id===prog.id)
          return(
            <div key={prog.id} style={card}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem',flexWrap:'wrap',gap:'0.5rem'}}>
                <div>
                  <div style={{fontFamily:'Georgia,serif',fontSize:'1.22rem',fontWeight:700,color:C.navy}}>{prog.name}</div>
                  <div style={{fontSize:'1.01rem',color:C.slate,marginTop:'0.15rem'}}>{prog.funder} \u00b7 {prog.country} \u00b7 {prog.type==='donor_programme'?'Donor Programme':'Direct Client'}</div>
                </div>
                <button style={addBtn(true)} onClick={()=>{setSelProgId(prog.id);setView('programmes')}}>Manage \u2192</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(215px,1fr))',gap:'0.75rem'}}>
                {progClients.map(c=><ClientCard key={c.id} client={c} programmes={programmes} onClick={()=>{setSelClientId(c.id);setActiveTab('cover');setView('client')}}/>)}
                <div style={{border:`2px dashed ${C.border}`,borderRadius:6,padding:'1rem',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',cursor:'pointer',color:C.slate,fontSize:'1.01rem',gap:'0.35rem',minHeight:120}} onClick={()=>setView('clients')}><span style={{fontSize:'1.3rem'}}>+</span><span>Add client</span></div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // \u2500\u2500 CLIENT LIST \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function ClientsView(){
    const filter=clientsFilter, setFilter=setClientsFilter
    const [showNew,setShowNew]=useState(false)
    const [showUpload,setShowUpload]=useState(false)
    const [refreshing,setRefreshing]=useState(false)
    const filtered=filter==='all'?clients
      :filter==='active'?clients.filter(c=>c.status!=='complete'&&c.status!=='paused')
      :filter==='completed'?clients.filter(c=>c.status==='complete')
      :filter==='paused'?clients.filter(c=>c.status==='paused')
      :clients.filter(c=>c.type===filter||c.engagement_mode===filter)
    async function refreshClients(){
      setRefreshing(true)
      try { const fresh = await loadClients(); setClients(fresh) }
      catch(e) { /* ignore -- keep existing list on failure */ }
      setRefreshing(false)
    }
    return(
      <div>
        <div style={{display:'flex',gap:'0.45rem',marginBottom:'1.25rem',flexWrap:'wrap',alignItems:'center'}}>
          <button style={addBtn(true,C.teal)} onClick={refreshClients} disabled={refreshing}>{refreshing?'Refreshing...':'\u21bb Refresh'}</button>
          {['all','active','completed','paused','canvas','financial','crop_aggregator','livestock_aggregator','farmer_group_enterprise','service_lsp'].map(f=>(
            <button key={f} style={subPill(filter===f,f==='completed'?C.green:f==='paused'?C.red:C.cyan)} onClick={()=>setFilter(f)}>
              {f==='all'?'All':f==='active'?'Active':f==='completed'?'Completed':f==='paused'?'Paused':f==='canvas'?'GtCV Canvas':f==='financial'?'Clearview Only':CLIENT_TYPE_LABELS[f]||f}
            </button>
          ))}
          {isSuperCoach&&<button style={{...addBtn(true,C.teal),marginLeft:'auto'}} onClick={()=>{setShowUpload(!showUpload);setShowNew(false)}}>Upload Spreadsheet</button>}
          {isSuperCoach&&<button style={addBtn()} onClick={()=>{setShowNew(!showNew);setShowUpload(false)}}>+ New Client</button>}
        </div>
        {showUpload&&<SpreadsheetUpload onSuccess={(clientId)=>{setShowUpload(false);supabase.from('engagement_clients').select('*').eq('id',clientId).single().then(({data})=>{if(data)setClients(prev=>[...prev,data])})}}/>}
        {showNew&&<NewClientForm programmes={programmes} onSave={async c=>{
          const {data,error}=await supabase.from('engagement_clients').insert([c]).select().single()
          if(!error&&data){setClients(prev=>[...prev,data]);setShowNew(false)}
        }} onCancel={()=>setShowNew(false)}/>}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))',gap:'1rem'}}>
          {filtered.map(c=><ClientCard key={c.id} client={c} programmes={programmes} onClick={()=>{setSelClientId(c.id);setActiveTab('cover');setView('client')}}/>)}
        </div>
      </div>
    )
  }

  // \u2500\u2500 CLIENT DETAIL \u2014 25 TABS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function ClientDetailView(){
    if(!selClient)return<div style={{color:C.slate,padding:'2rem'}}>Client not found.</div>
    if(clientLoading&&selClient.engagement_mode==='canvas')return<Spinner/>
    const prog=programmes.find(p=>p.id===selClient.programme_id)
    const isCanvas=selClient.engagement_mode==='canvas'
    const canvas=selClientFullData.canvas||[]
    const evidence=selClientFullData.evidence||[]
    const interviews=selClientFullData.interviews||[]
    const hypotheses=selClientFullData.hypotheses||[]
    const decisions=selClientFullData.decisions||[]
    const handover=selClientFullData.handover||[]
    const pilots=selClientFullData.pilots||[]
    const diagnostic=selClientFullData.diagnostic||{}
    const fileLinks=selClientFullData.fileLinks||[]
    const notifications=selClientFullData.notifications||{enabled:false,recipients:[]}

    const visibleTabs=isCanvas
      ? CANVAS_TABS.filter(t=>!t.coachOnly||(t.coachOnly&&canViewCoachGuidance(userRole)))
      : []

    function printSection(){window.print()}

    if(!isCanvas) return(
      <div>
        <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'1rem',fontSize:'1.01rem',color:C.slate}}>
          <button style={{fontFamily:'monospace',fontSize:'0.93rem',color:C.slate,background:'transparent',border:`1px solid ${C.border}`,borderRadius:4,cursor:'pointer',padding:'0.22rem 0.6rem'}} onClick={()=>setView('overview')}>← Coach Dashboard</button>
          <span>/</span><span style={{color:C.navy,fontWeight:600}}>{selClient.name}</span>
        </div>
        <div style={{...card,background:'var(--cv-header)',color:'var(--cv-on-accent)',marginBottom:'1.25rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'1rem'}}>
            <div>
              <div style={{fontFamily:'monospace',fontSize:'0.93rem',letterSpacing:'0.12em',color:C.cyan,marginBottom:'0.3rem'}}>{CLIENT_TYPE_LABELS[selClient.type]} · {prog?.name||'—'} · Clearview Financial Model</div>
              <h2 style={{fontFamily:'Georgia,serif',fontSize:'1.4rem',fontWeight:700,color:'var(--cv-on-accent)',margin:'0 0 0.25rem'}}>{selClient.name}</h2>
              <div style={{fontSize:'1.01rem',color:'var(--cv-wa-60)'}}>{selClient.contact_name&&`${selClient.contact_name} · `}{selClient.country} · {selClient.sector}</div>
            </div>
            <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap',alignItems:'center'}}>
              <Badge text={statusLabel(selClient.status)} color={statusColor(selClient.status)}/>
              <a href={`/dashboard/${selClient.slug}`} target="_blank" rel="noreferrer" style={{fontFamily:'monospace',fontSize:'1.01rem',padding:'0.4rem 1rem',borderRadius:4,background:C.teal,color:'var(--cv-on-accent)',textDecoration:'none',fontWeight:700}}>Open Clearview Financial Model ↗</a>
              {isSuperCoach&&<CopyIntakeLink client={selClient}/>}
              {isSuperCoach&&<button onClick={()=>setShowEditClient(true)} style={{fontFamily:'monospace',fontSize:'0.93rem',padding:'0.4rem 0.85rem',borderRadius:4,background:'transparent',border:'1px solid var(--cv-wa-40)',color:'var(--cv-wa-80)',cursor:'pointer'}}>Edit Setup</button>}
              {isSuperCoach&&<button onClick={()=>setShowDeleteConfirm(true)} style={{fontFamily:'monospace',fontSize:'0.93rem',padding:'0.4rem 0.85rem',borderRadius:4,background:'transparent',border:'1px solid var(--cv-wa-40)',color:'var(--cv-wa-80)',cursor:'pointer'}}>Delete Client</button>}
            </div>
          </div>
        </div>
        {showEditClient&&(
          <EditClientForm
            client={selClient}
            programmes={programmes}
            onSave={patch=>{setClients(prev=>prev.map(c=>c.id!==selClient.id?c:{...c,...patch}));setShowEditClient(false)}}
            onCancel={()=>setShowEditClient(false)}
          />
        )}
        {showDeleteConfirm&&(
          <DeleteClientConfirm
            client={selClient}
            onCancel={()=>setShowDeleteConfirm(false)}
            onDeleted={()=>{setClients(prev=>prev.filter(c=>c.id!==selClient.id));setSelClientId(null);setView('overview')}}
          />
        )}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:'1rem',marginBottom:'1.25rem'}}>
          <div style={{...card,marginBottom:0}}><div style={{fontFamily:'Georgia,serif',fontSize:'1.16rem',fontWeight:700,color:C.navy,marginBottom:'0.5rem'}}>Step 1 — Open Clearview</div><p style={{fontSize:'1.07rem',color:C.slate,lineHeight:1.7,margin:0}}>Click "Open Clearview Financial Model" above. Go to Settings to define business units and revenue lines.</p></div>
          <div style={{...card,marginBottom:0}}><div style={{fontFamily:'Georgia,serif',fontSize:'1.16rem',fontWeight:700,color:C.navy,marginBottom:'0.5rem'}}>Step 2 — Define Business Units</div><p style={{fontSize:'1.07rem',color:C.slate,lineHeight:1.7,margin:0}}>In Settings, add business units. Set each unit type: product, service, or aggregator.</p></div>
          <div style={{...card,marginBottom:0}}><div style={{fontFamily:'Georgia,serif',fontSize:'1.16rem',fontWeight:700,color:C.navy,marginBottom:'0.5rem'}}>Step 3 — Enter the Plan</div><p style={{fontSize:'1.07rem',color:C.slate,lineHeight:1.7,margin:0}}>Go to Planning to add revenue and cost lines. Enter monthly figures for the full planning period.</p></div>
        </div>
        <div style={card}><TabCover client={selClient} prog={prog} onUpdate={updates=>updateClient(selClient.id,updates)}/></div>
      </div>
    )

    return(
      <div>
        {/* Breadcrumb */}
        <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'1rem',fontSize:'1.01rem',color:C.slate}}>
          <button style={{fontFamily:'monospace',fontSize:'0.93rem',color:C.slate,background:'transparent',border:`1px solid ${C.border}`,borderRadius:4,cursor:'pointer',padding:'0.22rem 0.6rem'}} onClick={()=>setView('overview')}>\u2190 Coach Dashboard</button>
          <span>/</span><span style={{color:C.navy,fontWeight:600}}>{selClient.name}</span>
        </div>

        {/* Client header */}
        <div style={{...card,background:'var(--cv-header)',color:'var(--cv-on-accent)',marginBottom:'1.25rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'1rem'}}>
            <div>
              <div style={{fontFamily:'monospace',fontSize:'0.93rem',letterSpacing:'0.12em',color:C.cyan,marginBottom:'0.3rem'}}>{CLIENT_TYPE_LABELS[selClient.type]} \u00b7 {prog?.name||'\u2014'} \u00b7 {isCanvas?'Full GtCV Canvas':'Clearview Financial'}</div>
              <h2 style={{fontFamily:'Georgia,serif',fontSize:'1.4rem',fontWeight:700,color:'var(--cv-on-accent)',margin:'0 0 0.25rem'}}>{selClient.name}</h2>
              <div style={{fontSize:'1.01rem',color:'var(--cv-wa-60)'}}>{selClient.contact_name&&`${selClient.contact_name} \u00b7 `}{selClient.country} \u00b7 {selClient.sector}</div>
            </div>
            <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap',alignItems:'center'}}>
              <Badge text={statusLabel(selClient.status)} color={statusColor(selClient.status)}/>
              {selClient.clearview_active&&<a href={`/dashboard/${selClient.slug}`} target="_blank" rel="noreferrer" style={{fontFamily:'monospace',fontSize:'0.93rem',padding:'0.22rem 0.6rem',borderRadius:4,background:C.teal,color:'var(--cv-on-accent)',textDecoration:'none'}}>Open Clearview \u2197</a>}
              {isSuperCoach&&<button onClick={()=>setShowEditClient(true)} style={{fontFamily:'monospace',fontSize:'0.93rem',padding:'0.22rem 0.6rem',borderRadius:4,background:'transparent',border:'1px solid var(--cv-wa-40)',color:'var(--cv-wa-80)',cursor:'pointer'}}>Edit Setup</button>}
              <button style={addBtn(true)} onClick={printSection}>Print</button>
            </div>
          </div>
        </div>
        {showEditClient&&(
          <EditClientForm
            client={selClient}
            programmes={programmes}
            onSave={patch=>{setClients(prev=>prev.map(c=>c.id!==selClient.id?c:{...c,...patch}));setShowEditClient(false)}}
            onCancel={()=>setShowEditClient(false)}
          />
        )}

        {/* Two-column layout: sidebar + content */}
        <div style={{display:'grid',gridTemplateColumns:'220px 1fr',gap:'1.5rem',alignItems:'start'}}>

          {/* Sidebar \u2014 25 tabs */}
          <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden',position:'sticky',top:'1rem'}}>
            {visibleTabs.map(tab=>{
              const isActive=activeTab===tab.id
              const dpCanvas=canvas.find(dp=>dp.dp_id===tab.dpId)
              return(
                <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{width:'100%',textAlign:'left',padding:'0.6rem 0.85rem',border:'none',borderBottom:`1px solid ${C.border}`,background:isActive?'var(--cv-header)':C.white,color:isActive?'var(--cv-on-accent)':C.navy,cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:'1.01rem',fontFamily:"'Segoe UI',system-ui,sans-serif",fontWeight:isActive?700:400}}>
                  <span>
                    <span style={{fontFamily:'monospace',fontSize:'0.93rem',color:isActive?C.cyan:C.slate,marginRight:'0.4rem'}}>{String(tab.number).padStart(2,'0')}</span>
                    {tab.label}
                  </span>
                  {dpCanvas&&<DPDot status={dpCanvas.status}/>}
                  {tab.coachOnly&&<span style={{fontSize:'0.93rem',color:isActive?C.cyan:C.amber}}>\ud83d\udc41</span>}
                </button>
              )
            })}
          </div>

          {/* Main content area */}
          <div>
            {activeTab==='cover'&&<TabCover client={selClient} prog={prog} onUpdate={updates=>updateClient(selClient.id,updates)}/>}
            {activeTab==='how_to_start'&&<TabHowToStart client={selClient}/>}
            {activeTab==='coach_ref'&&canViewCoachGuidance(userRole)&&<TabCoachRef/>}
            {activeTab==='ip_framework'&&<TabIPFramework/>}
            {activeTab==='eng_setup'&&<TabEngagementSetup client={selClient} fileLinks={fileLinks} notifications={notifications} onUpdate={updates=>updateClient(selClient.id,updates)} onUpdateFileLinks={async(links)=>{await supabase.from('file_links').delete().eq('client_id',selClient.id);if(links.length>0)await supabase.from('file_links').insert(links.map((l,i)=>({...l,client_id:selClient.id,sort_order:i})));setClientData(prev=>({...prev,[selClient.id]:{...selClientFullData,fileLinks:links}}))}} onUpdateNotifications={async(n)=>{await supabase.from('notification_settings').upsert({client_id:selClient.id,...n,updated_at:new Date().toISOString()});setClientData(prev=>({...prev,[selClient.id]:{...selClientFullData,notifications:n}}))}}/>}
            {activeTab==='diagnostic'&&<TabDiagnostic client={selClient} diagnostic={diagnostic} userRole={userRole} userName={userName} onUpdate={async(updates)=>{if(diagnostic?.id){await supabase.from('engagement_diagnostic').update({...updates,updated_at:new Date().toISOString()}).eq('client_id',selClient.id)}else{await supabase.from('engagement_diagnostic').insert({client_id:selClient.id,...updates})}setClientData(prev=>({...prev,[selClient.id]:{...selClientFullData,diagnostic:{...diagnostic,...updates}}}))}}/>}
            {activeTab==='tracker'&&<TabTracker client={selClient} canvas={canvas}/>}
            {activeTab==='decisions'&&<TabDecisions client={selClient} decisions={decisions} userRole={userRole} userName={userName} onAdd={async(d)=>{const {data}=await supabase.from('canvas_decisions').insert([{...d,client_id:selClient.id}]).select().single();if(data)setClientData(prev=>({...prev,[selClient.id]:{...selClientFullData,decisions:[...decisions,data]}}))}} onUpdate={async(id,updates)=>{await supabase.from('canvas_decisions').update({...updates,updated_at:new Date().toISOString()}).eq('id',id);setClientData(prev=>({...prev,[selClient.id]:{...selClientFullData,decisions:decisions.map(d=>d.id!==id?d:{...d,...updates})}}))}}/>}
            {activeTab==='evidence'&&<TabEvidence client={selClient} evidence={evidence} onAdd={async(e)=>{const ref=`E-${String(evidence.length+1).padStart(3,'0')}`;const {data}=await supabase.from('evidence_library').insert([{...e,client_id:selClient.id,reference:ref}]).select().single();if(data)setClientData(prev=>({...prev,[selClient.id]:{...selClientFullData,evidence:[...evidence,data]}}))}} onUpdate={async(id,updates)=>{await supabase.from('evidence_library').update({...updates,updated_at:new Date().toISOString()}).eq('id',id);setClientData(prev=>({...prev,[selClient.id]:{...selClientFullData,evidence:evidence.map(e=>e.id!==id?e:{...e,...updates})}}))}}/>}
            {activeTab==='handover'&&<TabHandover client={selClient} handover={handover} canvas={canvas} userRole={userRole} onUpdate={async(id,updates)=>{await supabase.from('handover_record').update({...updates,updated_at:new Date().toISOString()}).eq('id',id);setClientData(prev=>({...prev,[selClient.id]:{...selClientFullData,handover:handover.map(h=>h.id!==id?h:{...h,...updates})}}))}}/>}
            {activeTab==='phase0'&&<TabDP client={selClient} dp={canvas.find(d=>d.dp_id==='phase_0')} userRole={userRole} onUpdateDP={u=>updateDP(selClient.id,'phase_0',u)} onUpdateComp={(cn,u)=>updateComponent(selClient.id,'phase_0',cn,u)}/>}
            {['dp01','dp02','dp03','dp04','dp05','dp06','dp07','dp08','dp09'].map(dpKey=>(
              activeTab===dpKey&&<TabDP key={dpKey} client={selClient} dp={canvas.find(d=>d.dp_id===dpKey)} userRole={userRole} onUpdateDP={u=>updateDP(selClient.id,dpKey,u)} onUpdateComp={(cn,u)=>updateComponent(selClient.id,dpKey,cn,u)}/>
            ))}
            {activeTab==='int_brief'&&<TabInterviewBriefing client={selClient} interviews={interviews} onAdd={async(i)=>{const ref=`INT-${String(interviews.length+1).padStart(3,'0')}`;const {data}=await supabase.from('interviews').insert([{...i,client_id:selClient.id,reference:ref}]).select().single();if(data)setClientData(prev=>({...prev,[selClient.id]:{...selClientFullData,interviews:[...interviews,data]}}))}}/>}
            {activeTab==='int_capture'&&<TabInterviewCapture client={selClient} interviews={interviews}
              onAdd={async(i)=>{
                const ref=`INT-${String(interviews.length+1).padStart(3,'0')}`
                const {data}=await supabase.from('interviews').insert([{...i,client_id:selClient.id,reference:ref}]).select().single()
                if(data)setClientData(prev=>({...prev,[selClient.id]:{...selClientFullData,interviews:[...interviews,data]}}))
              }}
              onUpdate={async(id,updates)=>{
                await supabase.from('interviews').update({...updates,updated_at:new Date().toISOString()}).eq('id',id)
                setClientData(prev=>({...prev,[selClient.id]:{...selClientFullData,interviews:interviews.map(i=>i.id!==id?i:{...i,...updates})}}))
              }}
            />}
            {activeTab==='int_report'&&<TabInterviewReporting interviews={interviews}/>}
            {activeTab==='hypothesis'&&<TabHypothesis client={selClient} hypotheses={hypotheses} onAdd={async(h)=>{const ref=`HYP-${String(hypotheses.length+1).padStart(3,'0')}`;const {data}=await supabase.from('hypotheses').insert([{...h,client_id:selClient.id,reference:ref}]).select().single();if(data)setClientData(prev=>({...prev,[selClient.id]:{...selClientFullData,hypotheses:[...hypotheses,data]}}))} } onUpdate={async(id,updates)=>{await supabase.from('hypotheses').update({...updates,updated_at:new Date().toISOString()}).eq('id',id);setClientData(prev=>({...prev,[selClient.id]:{...selClientFullData,hypotheses:hypotheses.map(h=>h.id!==id?h:{...h,...updates})}}))}}/>}
            {activeTab==='pilot_obs'&&<TabPilotObservation client={selClient} pilots={pilots} onAdd={async(p)=>{const {data}=await supabase.from('pilot_observations').insert([{...p,client_id:selClient.id}]).select().single();if(data)setClientData(prev=>({...prev,[selClient.id]:{...selClientFullData,pilots:[...pilots,data]}}))} } onUpdate={async(id,updates)=>{await supabase.from('pilot_observations').update({...updates,updated_at:new Date().toISOString()}).eq('id',id);setClientData(prev=>({...prev,[selClient.id]:{...selClientFullData,pilots:pilots.map(p=>p.id!==id?p:{...p,...updates})}}))}}/>}
          </div>
        </div>
      </div>
    )
  }

  // \u2500\u2500 PROGRAMMES VIEW \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function ProgrammesView(){
    const [showNew,setShowNew]=useState(false)
    const [editingProg,setEditingProg]=useState(false)
    const [progForm,setProgForm]=useState(null)
    const prog=selProgId?programmes.find(p=>p.id===selProgId):null
    if(prog)return(
      <div>
        <button style={{fontFamily:'monospace',fontSize:'0.93rem',color:C.slate,background:'transparent',border:`1px solid ${C.border}`,borderRadius:4,cursor:'pointer',padding:'0.22rem 0.6rem',marginBottom:'1rem'}} onClick={()=>{setSelProgId(null);setEditingProg(false)}}>\u2190 All Programmes</button>
        {editingProg&&progForm?(
          <div style={card}>
            <div style={{...secH,marginBottom:'1rem'}}>Edit Programme</div>
            <div style={fGrid}>
              <div><label style={lbl}>Programme Name</label><input style={inp} value={progForm.name} onChange={e=>setProgForm(f=>({...f,name:e.target.value}))}/></div>
              <div><label style={lbl}>Type</label><select style={inp} value={progForm.type} onChange={e=>setProgForm(f=>({...f,type:e.target.value}))}><option value="donor_programme">Donor Programme</option><option value="direct_client">Direct Client</option><option value="blended">Blended</option></select></div>
              <div><label style={lbl}>Funder</label><input style={inp} value={progForm.funder} onChange={e=>setProgForm(f=>({...f,funder:e.target.value}))}/></div>
              <div><label style={lbl}>Funder Email</label><input type="email" style={inp} value={progForm.funder_email||''} onChange={e=>setProgForm(f=>({...f,funder_email:e.target.value}))} placeholder="for their portal login"/></div>
              <div><label style={lbl}>Country</label><input style={inp} value={progForm.country} onChange={e=>setProgForm(f=>({...f,country:e.target.value}))}/></div>
              <div><label style={lbl}>Start Date</label><input type="date" style={inp} value={progForm.start_date||''} onChange={e=>setProgForm(f=>({...f,start_date:e.target.value}))}/></div>
              <div><label style={lbl}>End Date</label><input type="date" style={inp} value={progForm.end_date||''} onChange={e=>setProgForm(f=>({...f,end_date:e.target.value}))}/></div>
              <div>
                <label style={lbl}>Funder sees</label>
                <select style={inp} value={progForm.funder_detail_level||'summary'} onChange={e=>setProgForm(f=>({...f,funder_detail_level:e.target.value}))}>
                  <option value="summary">Summary only (health status, headline numbers)</option>
                  <option value="full">Full financial dashboard</option>
                </select>
              </div>
              <div style={{gridColumn:'1/-1'}}><label style={lbl}>Notes</label><textarea style={{...inp,minHeight:72,resize:'vertical'}} value={progForm.notes||''} onChange={e=>setProgForm(f=>({...f,notes:e.target.value}))}/></div>
            </div>
            <div style={{display:'flex',gap:'0.6rem',marginTop:'0.85rem'}}>
              <button style={solidBtn()} onClick={async()=>{await supabase.from('programmes').update({...progForm,updated_at:new Date().toISOString()}).eq('id',prog.id);setPrograms(prev=>prev.map(p=>p.id!==prog.id?p:{...p,...progForm}));setEditingProg(false)}}>Save</button>
              <button style={addBtn(true,C.slate)} onClick={()=>setEditingProg(false)}>Cancel</button>
            </div>
          </div>
        ):(
          <div>
            <div style={{...card,background:'var(--cv-header)',color:'var(--cv-on-accent)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div><div style={{fontFamily:'monospace',fontSize:'0.93rem',color:C.cyan,letterSpacing:'0.12em',marginBottom:'0.3rem'}}>{prog.type==='donor_programme'?'DONOR PROGRAMME':'DIRECT CLIENT'}</div><h2 style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:'var(--cv-on-accent)',margin:'0 0 0.2rem'}}>{prog.name}</h2><div style={{fontSize:'1.01rem',color:'var(--cv-wa-60)'}}>{prog.funder} \u00b7 {prog.country}</div></div>
                <button style={{fontFamily:'monospace',fontSize:'0.93rem',padding:'0.3rem 0.8rem',border:'1px solid var(--cv-wa-30)',borderRadius:4,background:'transparent',color:'var(--cv-wa-80)',cursor:'pointer'}} onClick={()=>{setProgForm({...prog});setEditingProg(true)}}>Edit</button>
              </div>
            </div>
            <div style={card}>
              <div style={secH}>Funder Access</div>
              <p style={{...hint,marginBottom:'0.75rem'}}>The funder&#39;s login sees only the {clients.filter(c=>c.programme_id===prog.id).length} client{clients.filter(c=>c.programme_id===prog.id).length===1?'':'s'} under this programme, at the level set above ({prog.funder_detail_level==='full'?'full financial dashboard':'summary only'} -- change it via Edit).</p>
              {prog.funder_email
                ?<InviteLoginButton email={prog.funder_email} fullName={prog.funder||'Funder'} role="funder" coImplementerId={null} funderProgrammeId={prog.id}/>
                :<div style={{...hint,color:C.amber}}>Add a funder email via Edit before you can invite them.</div>}
            </div>
            <div style={card}><div style={secH}>Client Organisations</div>{clients.filter(c=>c.programme_id===prog.id).map(c=><div key={c.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.6rem 0.75rem',border:`1px solid ${C.border}`,borderRadius:5,marginBottom:'0.45rem'}}><div><div style={{fontWeight:600,fontSize:'1.07rem'}}>{c.name}</div><div style={{fontSize:'0.93rem',color:C.slate}}>{CLIENT_TYPE_LABELS[c.type]} \u00b7 {statusLabel(c.status)}</div></div><button style={addBtn(true)} onClick={()=>{setSelClientId(c.id);setActiveTab('cover');setView('client')}}>Open \u2192</button></div>)}</div>
            {prog.notes&&<div style={card}><div style={secH}>Notes</div><div style={{fontSize:'1.07rem',color:C.slate,lineHeight:1.6}}>{prog.notes}</div></div>}
          </div>
        )}
      </div>
    )
    return(
      <div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem'}}><div style={secH}>Programmes</div><button style={addBtn()} onClick={()=>setShowNew(!showNew)}>+ New Programme</button></div>
        {showNew&&<NewProgrammeForm onSave={async p=>{const {data,error}=await supabase.from('programmes').insert([p]).select().single();if(!error&&data){setPrograms(prev=>[...prev,data]);setShowNew(false)}}} onCancel={()=>setShowNew(false)}/>}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'1.25rem'}}>
          {programmes.map(p=><div key={p.id} style={{...card,cursor:'pointer',marginBottom:0}} onClick={()=>setSelProgId(p.id)}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}><div><div style={{fontFamily:'Georgia,serif',fontSize:'1.22rem',fontWeight:700,color:C.navy}}>{p.name}</div><div style={{fontSize:'1.01rem',color:C.slate,marginTop:'0.18rem'}}>{p.funder} \u00b7 {p.country} \u00b7 {clients.filter(c=>c.programme_id===p.id).length} clients</div></div><span style={{fontFamily:'monospace',fontSize:'0.93rem',padding:'0.12rem 0.45rem',borderRadius:4,background:p.type==='donor_programme'?C.amber:C.teal,color:'var(--cv-on-accent)'}}>{p.type==='donor_programme'?'Donor':'Direct'}</span></div></div>)}
        </div>
      </div>
    )
  }

  // \u2500\u2500 TEAM VIEW \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function TeamView(){
    const [showNew,setShowNew]=useState(false)
    const pendingTs=timesheets.filter(t=>t.status==='submitted')
    async function approveTs(id){await supabase.from('timesheets').update({status:'approved',approved_by:userName,approved_at:new Date().toISOString()}).eq('id',id);setTimesheets(prev=>prev.map(t=>t.id!==id?t:{...t,status:'approved'}))}
    async function rejectTs(id){await supabase.from('timesheets').update({status:'rejected'}).eq('id',id);setTimesheets(prev=>prev.map(t=>t.id!==id?t:{...t,status:'rejected'}))}
    return(
      <div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem'}}><div style={secH}>Canvas Coach Team</div>{canManageTeam(userRole)&&<button style={addBtn()} onClick={()=>setShowNew(!showNew)}>+ Add Co-Implementer</button>}</div>
        {pendingTs.length>0&&canApproveTimesheets(userRole)&&(
          <div style={{...card,background:'var(--cv-tint-amber)',border:`1px solid ${C.amber}`}}>
            <div style={secH}>\u23f3 Pending Timesheet Approvals ({pendingTs.length})</div>
            {pendingTs.map(ts=>{
              const ci=coImplementers.find(c=>c.id===ts.co_implementer_id)
              const cl=clients.find(c=>c.id===ts.client_id)
              return(<div key={ts.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.6rem 0.75rem',border:`1px solid ${C.amber}`,borderRadius:5,marginBottom:'0.45rem',background:C.white}}>
                <div><div style={{fontWeight:600,fontSize:'1.07rem'}}>{ci?.name||'Unknown'} \u2014 {ts.date}</div><div style={{fontSize:'1.01rem',color:C.slate}}>{cl?.name||'Unknown'} \u00b7 {ts.hours}h \u00b7 {ts.dp_id||''} \u00b7 {ts.description}</div></div>
                <div style={{display:'flex',gap:'0.4rem'}}>
                  <button style={solidBtn(C.green,true)} onClick={()=>approveTs(ts.id)}>Approve</button>
                  <button style={solidBtn(C.red,true)} onClick={()=>rejectTs(ts.id)}>Reject</button>
                </div>
              </div>)
            })}
          </div>
        )}
        {showNew&&<NewCIForm clients={clients} onSave={async ci=>{const {data,error}=await supabase.from('co_implementers').insert([ci]).select().single();if(!error&&data){setCoImplementers(prev=>[...prev,data]);setShowNew(false)}}} onCancel={()=>setShowNew(false)}/>}
        {coImplementers.length===0?<div style={{...card,color:C.slate,textAlign:'center',padding:'2.5rem'}}>No co-implementers yet.</div>:coImplementers.map(ci=>{
          const ciTs=timesheets.filter(t=>t.co_implementer_id===ci.id)
          const approvedHours=ciTs.filter(t=>t.status==='approved').reduce((s,t)=>s+(Number(t.hours)||0),0)
          const pendingHours=ciTs.filter(t=>t.status==='submitted').reduce((s,t)=>s+(Number(t.hours)||0),0)
          return(<div key={ci.id} style={card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.65rem'}}>
              <div><div style={{fontWeight:700,fontSize:'1.11rem',color:C.navy}}>{ci.name}</div><div style={{fontSize:'1.01rem',color:C.slate}}>{ci.email} \u00b7 {ci.country}</div>{ci.specialisation&&<div style={{fontSize:'1.01rem',color:C.slate}}>{ci.specialisation}</div>}</div>
              <div style={{textAlign:'right'}}>
                <div style={{fontFamily:'monospace',fontSize:'0.93rem',color:ci.active?C.green:C.red,marginBottom:'0.2rem'}}>{ci.active?'Active':'Inactive'}</div>
                {ci.rate_per_day>0&&<div style={{fontSize:'0.93rem',color:C.slate,marginBottom:'0.4rem'}}>{ci.currency} {Number(ci.rate_per_day).toLocaleString()}/day</div>}
                <InviteLoginButton email={ci.email} fullName={ci.name} role="coach" coImplementerId={ci.id} funderProgrammeId={null}/>
              </div>
            </div>
            <div style={{display:'flex',gap:'1.5rem',fontSize:'1.01rem',color:C.slate,marginBottom:'0.5rem'}}>
              <span style={{display:'flex',alignItems:'center',gap:'0.4rem',flexWrap:'wrap'}}>Clients:{(ci.client_ids||[]).length===0?<strong style={{color:C.slate}}>None</strong>:(ci.client_ids||[]).map(id=><span key={id} style={{fontFamily:'monospace',fontSize:'0.93rem',padding:'0.12rem 0.55rem',borderRadius:20,background:'var(--cv-cyan-dim)',color:C.teal,border:`1px solid ${C.border}`}}>{clients.find(c=>c.id===id)?.name||id}</span>)}</span>
              <span>Approved: <strong style={{color:C.green}}>{approvedHours}h</strong></span>
              <span>Pending: <strong style={{color:C.amber}}>{pendingHours}h</strong></span>
            </div>
            {/* Timesheet table */}
            {ciTs.length>0&&<div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'1.01rem',fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
                <thead><tr style={{background:C.lightBg}}>{['Date','Client','DP','Hours','Description','Status'].map(h=><th key={h} style={{padding:'0.4rem 0.6rem',textAlign:'left',fontWeight:600,color:C.navy,borderBottom:`1px solid ${C.border}`}}>{h}</th>)}</tr></thead>
                <tbody>{ciTs.slice(0,10).map((ts,i)=><tr key={ts.id} style={{background:i%2===0?C.cream:C.white}}>
                  <td style={{padding:'0.4rem 0.6rem'}}>{ts.date}</td>
                  <td style={{padding:'0.4rem 0.6rem'}}>{clients.find(c=>c.id===ts.client_id)?.name||'\u2014'}</td>
                  <td style={{padding:'0.4rem 0.6rem',fontFamily:'monospace',fontSize:'0.93rem'}}>{ts.dp_id||'\u2014'}</td>
                  <td style={{padding:'0.4rem 0.6rem'}}>{ts.hours}</td>
                  <td style={{padding:'0.4rem 0.6rem',maxWidth:180}}>{ts.description}</td>
                  <td style={{padding:'0.4rem 0.6rem'}}><Badge text={ts.status} color={ts.status==='approved'?C.green:ts.status==='submitted'?C.amber:ts.status==='rejected'?C.red:C.slate}/></td>
                </tr>)}</tbody>
              </table>
            </div>}
          </div>)
        })}
      </div>
    )
  }

  // \u2500\u2500 HEADER + SHELL \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // Previously 4 separate top-level entries covered the same ground as
  // 3 others under confusingly similar names (Clients/Client Health,
  // Programmes/Programmes & Deals, Team/Team & Payments) with no
  // cross-linking between them. Each pair covers genuinely different
  // ground (roster vs. status, record-editing vs. pipeline stage,
  // roster+legacy canvas timesheet approvals vs. the day-rate payments
  // loop) so nothing here is deleted -- they're folded into one tab
  // each with an internal toggle, which is what a coach actually wants:
  // one place to go for "clients", not three.
  function ClientsHub(){
    const sub=clientsSub, setSub=setClientsSub
    return(
      <div>
        <div style={{display:'flex',gap:'0.4rem',marginBottom:'1.25rem'}}>
          <button style={subPill(sub==='health')} onClick={()=>setSub('health')}>Health overview</button>
          <button style={subPill(sub==='roster')} onClick={()=>setSub('roster')}>All clients</button>
        </div>
        {sub==='health'?<ClientHealthTab clients={clients} programmes={programmes} onUpdateClient={updateClient}/>:<ClientsView/>}
      </div>
    )
  }
  function ProgrammesHub(){
    const sub=programmesSub, setSub=setProgrammesSub
    return(
      <div>
        <div style={{display:'flex',gap:'0.4rem',marginBottom:'1.25rem'}}>
          <button style={subPill(sub==='pipeline')} onClick={()=>setSub('pipeline')}>Pipeline &amp; fees</button>
          <button style={subPill(sub==='directory')} onClick={()=>setSub('directory')}>All programmes</button>
        </div>
        {sub==='pipeline'?<DealsAndFees programmes={programmes} setProgrammes={setPrograms} clients={clients} setClients={setClients}/>:<ProgrammesView/>}
      </div>
    )
  }
  function TeamHub(){
    const sub=teamSub, setSub=setTeamSub
    return(
      <div>
        <div style={{display:'flex',gap:'0.4rem',marginBottom:'1.25rem'}}>
          <button style={subPill(sub==='roster')} onClick={()=>setSub('roster')}>Roster &amp; approvals</button>
          <button style={subPill(sub==='payments')} onClick={()=>setSub('payments')}>Payments</button>
        </div>
        {sub==='roster'?<TeamView/>:<TeamPayments coImplementers={coImplementers} setCoImplementers={setCoImplementers} clients={clients} userName={userName}/>}
      </div>
    )
  }

  // Programmes/Team are the coach's own business operations (deal terms,
  // co-implementer pay rates) -- not appropriate for a co-implementer or
  // funder to see. Both land straight on Clients, already scoped by RLS
  // to just what they're allowed to see (their assigned clients, or the
  // clients under their programme).
  const mainNavTabs=isSuperCoach
    ?[['overview','My Business'],['clients','Clients'],['programmes','Programmes'],['team','Team'],['portfolio','Portfolio Intelligence']]
    :isCoImplementer
    ?[['clients','Clients'],['mypayments','My Timesheet & Expenses']]
    :[['clients','Clients']]
  const roleBadgeLabel=isSuperCoach?'Super Coach':isFunder?'Funder':'Co-Implementer'
  return(
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.cream,color:C.navy,minHeight:'100vh'}}>
      <BuildStamp/>
      <header style={{background:'var(--cv-header)',borderBottom:`3px solid ${C.cyan}`}}>
        <div style={{maxWidth:1600,margin:'0 auto',padding:'1.25rem 1.5rem',display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'1rem'}}>
          <div>
            <div style={{fontFamily:'monospace',fontSize:'0.93rem',letterSpacing:'0.15em',color:C.cyan,marginBottom:'0.28rem'}}>CANVAS COACH \u2014 COACH DASHBOARD</div>
            <h1 style={{fontFamily:'Georgia,serif',fontSize:'1.5rem',fontWeight:700,color:'var(--cv-on-accent)',margin:'0.1rem 0 0.15rem'}}>{userName}</h1>
            <div style={{fontSize:'1.01rem',color:'var(--cv-wa-60)'}}>{activeClients.length} active \u00b7 {programmes.length} programme{programmes.length!==1?'s':''} \u00b7 {clearviewLive.length} Clearview live \u00b7 {canvasClients.length} canvas engagement{canvasClients.length!==1?'s':''}{pausedClients.length>0&&<span style={{marginLeft:8,color:C.red}}>\u00b7 {pausedClients.length} paused</span>}{pending>0&&<span style={{marginLeft:8,color:C.amber}}>\u00b7 \u23f3 {pending} pending</span>}</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
            <span style={{fontFamily:'monospace',fontSize:'0.93rem',color:C.cyan,border:`1px solid var(--cv-cyan-40)`,borderRadius:4,padding:'0.18rem 0.5rem'}}>{roleBadgeLabel}</span>
            <button onClick={toggleTheme} aria-label="Toggle light or dark theme" title="Toggle light/dark theme" style={{fontFamily:'monospace',fontSize:'0.93rem',background:'transparent',border:`1px solid var(--cv-wa-25)`,borderRadius:4,color:'var(--cv-wa-60)',cursor:'pointer',padding:'0.18rem 0.5rem'}}>{theme==='dark'?'☀':'☾'} Theme</button>
            <button onClick={onSignOut} style={{fontFamily:'monospace',fontSize:'0.93rem',background:'transparent',border:`1px solid var(--cv-wa-25)`,borderRadius:4,color:'var(--cv-wa-60)',cursor:'pointer',padding:'0.18rem 0.5rem'}}>Sign out</button>
          </div>
        </div>
      </header>
      <nav style={{background:'var(--cv-nav)',borderBottom:`1px solid var(--cv-cyan-dim)`,overflowX:'auto'}}>
        <div style={{maxWidth:1600,margin:'0 auto',padding:'0 1.5rem',display:'flex'}}>
          {mainNavTabs.map(([id,label])=><button key={id} style={navBtn(view===id||(view==='client'&&id==='clients'))} onClick={()=>{if(id!=='client')setSelClientId(null);setView(id)}}>{label}</button>)}
        </div>
      </nav>
      <main style={{maxWidth:1600,margin:'0 auto',padding:'1.5rem'}}>
        {view==='overview'&&<OverviewTab/>}
        {view==='clients'&&<ClientsHub/>}
        {view==='client'&&<ClientDetailView/>}
        {view==='programmes'&&<ProgrammesHub/>}
        {view==='team'&&<TeamHub/>}
        {view==='mypayments'&&<TeamPayments coImplementers={coImplementers} setCoImplementers={setCoImplementers} clients={clients} userName={userName} canApprove={false}/>}
        {view==='portfolio'&&<PortfolioIntelligenceHub clients={clients} programmes={programmes}/>}
      </main>
      <footer style={{textAlign:'center',padding:'1.5rem',fontFamily:'monospace',fontSize:'0.93rem',color:C.slate,borderTop:`1px solid ${C.border}`,marginTop:'2rem'}}>Canvas Coach \u00b7 Coach Dashboard \u00b7 habibonifade.com \u00b7 Confidential</footer>
    </div>
  )
}

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// TAB CONTENT COMPONENTS
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

function TabCover({client,prog,onUpdate}){
  const [editing,setEditing]=useState(false)
  const [form,setForm]=useState({...client})
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'1rem'}}><h3 style={secH}>Tab 1 \u2014 Cover</h3><div style={{display:'flex',gap:'0.5rem'}}><button style={addBtn(true)} onClick={()=>setEditing(!editing)}>{editing?'Cancel':'Edit'}</button><button style={addBtn(true)} onClick={()=>window.print()}>Print</button></div></div>
      {editing?(
        <div style={card}>
          <div style={fGrid}>
            <div><label style={lbl}>Organisation Name</label><input style={inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
            <div><label style={lbl}>Contact Name</label><input style={inp} value={form.contact_name} onChange={e=>setForm(f=>({...f,contact_name:e.target.value}))}/></div>
            <div><label style={lbl}>Contact Email</label><input style={inp} value={form.contact_email} onChange={e=>setForm(f=>({...f,contact_email:e.target.value}))}/></div>
            <div><label style={lbl}>Country</label><input style={inp} value={form.country} onChange={e=>setForm(f=>({...f,country:e.target.value}))}/></div>
            <div><label style={lbl}>Sector</label><input style={inp} value={form.sector} onChange={e=>setForm(f=>({...f,sector:e.target.value}))}/></div>
            <div><label style={lbl}>Client Type</label><select style={inp} value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}><option value="crop_aggregator">Crop Aggregator</option><option value="livestock_aggregator">Livestock Aggregator</option><option value="farmer_group_enterprise">Farmer Group Enterprise</option><option value="service_lsp">Service LSP</option></select></div>
            <div><label style={lbl}>Engagement Mode</label><select style={inp} value={form.engagement_mode} onChange={e=>setForm(f=>({...f,engagement_mode:e.target.value}))}><option value="canvas">Full GtCV Canvas</option><option value="financial">Clearview Financial Only</option></select></div>
            <div><label style={lbl}>Status</label><select style={inp} value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>{['setup','phase_0','dp01','dp02','dp03','dp04','dp05','dp06','dp07','dp08','dp09','complete','paused'].map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select></div>
            <div><label style={lbl}>Start Date</label><input type="date" style={inp} value={form.start_date||''} onChange={e=>setForm(f=>({...f,start_date:e.target.value}))}/></div>
            <div><label style={lbl}>Target Handover</label><input type="date" style={inp} value={form.expected_close||''} onChange={e=>setForm(f=>({...f,expected_close:e.target.value}))}/></div>
            <div style={{gridColumn:'1/-1'}}><label style={lbl}>Notes</label><textarea style={{...inp,minHeight:72,resize:'vertical'}} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
          </div>
          <button style={{...solidBtn(),marginTop:'0.85rem'}} onClick={()=>{onUpdate(form);setEditing(false)}}>Save</button>
        </div>
      ):(
        <div style={card}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
            {[['Organisation',client.name],['Programme',prog?.name||'\u2014'],['Funder',prog?.funder||'\u2014'],['Lead Consultant','The Canvas Coach'],['Contact',client.contact_name||'\u2014'],['Email',client.contact_email||'\u2014'],['Country',client.country],['Sector',client.sector],['Start Date',client.start_date||'\u2014'],['Target Handover',client.expected_close||'\u2014'],['Status',statusLabel(client.status)],['Engagement Mode',client.engagement_mode==='canvas'?'Full GtCV Canvas':'Clearview Financial']].map(([k,v])=>(
              <div key={k} style={{padding:'0.75rem 1rem',background:C.lightBg,borderRadius:6}}>
                <div style={{fontSize:'0.93rem',color:C.slate,marginBottom:'0.2rem',textTransform:'uppercase',letterSpacing:'0.05em'}}>{k}</div>
                <div style={{fontSize:'1.11rem',fontWeight:600,color:C.navy}}>{v}</div>
              </div>
            ))}
          </div>
          {client.notes&&<div style={{...card,background:C.cream}}><p style={{margin:0,fontSize:'1.07rem',color:C.slate,fontStyle:'italic'}}>{client.notes}</p></div>}
          <div style={{textAlign:'center',padding:'1.5rem',borderTop:`1px solid ${C.border}`,marginTop:'1rem'}}>
            <div style={{fontFamily:'monospace',fontSize:'0.93rem',color:C.cyan,letterSpacing:'0.1em',marginBottom:'0.3rem'}}>CANVAS COACH</div>
            <div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:C.navy}}>Grant-to-Commercial Viability Canvas</div>
            <div style={{fontSize:'1.01rem',color:C.slate,marginTop:'0.3rem'}}>habibonifade.com</div>
          </div>
        </div>
      )}
    </div>
  )
}

function TabHowToStart({client}){
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'1rem'}}><h3 style={secH}>Tab 2 \u2014 How to Start</h3><button style={addBtn(true)} onClick={()=>window.print()}>Print</button></div>
      <div style={card}>
        <h3 style={{fontFamily:'Georgia,serif',color:C.navy,marginTop:0}}>Welcome to your Canvas Coach engagement platform</h3>
        <p style={{fontSize:'1.13rem',lineHeight:1.7,color:C.slate}}>This platform is where the work of your engagement lives. It tracks every decision you make, every piece of evidence you produce, and every milestone you reach on your journey to commercial independence.</p>
        <h4 style={{color:C.navy,fontFamily:'Georgia,serif'}}>What this platform tracks</h4>
        <ul style={{fontSize:'1.13rem',lineHeight:1.8,color:C.slate}}>
          <li>Your progress through 9 Decision Points, each building on the last</li>
          <li>Evidence you produce at each stage: documents, interviews, financial data, observations</li>
          <li>Decisions made and who made them, all numbered and referenced</li>
          <li>Your commercial readiness, measured at the start, middle, and end of the engagement</li>
        </ul>
        <h4 style={{color:C.navy,fontFamily:'Georgia,serif'}}>What {client.name} does here</h4>
        <ul style={{fontSize:'1.13rem',lineHeight:1.8,color:C.slate}}>
          <li>Enter evidence and link to documents as you complete each component</li>
          <li>Your CEO signs off each Decision Point when the work is done</li>
          <li>Record what you learned from customer conversations and pilot deliveries</li>
          <li>Review the Engagement Tracker (Tab 7) to see where you are and what comes next</li>
        </ul>
        <h4 style={{color:C.navy,fontFamily:'Georgia,serif'}}>What your coach does here</h4>
        <ul style={{fontSize:'1.13rem',lineHeight:1.8,color:C.slate}}>
          <li>Reviews your evidence and guides next steps</li>
          <li>Can authorise progress if a gate is delayed, with a note visible to everyone</li>
          <li>Manages the overall engagement record</li>
        </ul>
        <div style={{background:'var(--cv-tint-cyan)',padding:16,borderRadius:6,borderLeft:`4px solid ${C.cyan}`,marginTop:'1rem'}}>
          <strong style={{color:C.navy}}>Your data is saved automatically.</strong> <span style={{color:C.slate,fontSize:'1.13rem'}}>You do not need to click save. Every entry is recorded the moment you complete it.</span>
        </div>
      </div>
    </div>
  )
}

function TabCoachRef(){
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'1rem'}}><h3 style={secH}>Tab 3 \u2014 Coach Quick Reference</h3><div style={{display:'flex',gap:'0.5rem'}}><span style={{fontFamily:'monospace',fontSize:'0.93rem',color:C.amber,border:`1px solid ${C.amber}`,borderRadius:4,padding:'0.2rem 0.5rem'}}>Coach only \u2014 not visible to client</span><button style={addBtn(true)} onClick={()=>window.print()}>Print</button></div></div>
      <div style={{...card,background:'var(--cv-tint-amber)',border:`1px solid ${C.amber}`}}>
        <h4 style={{fontFamily:'Georgia,serif',color:C.navy,marginTop:0}}>Delivery Rhythm</h4>
        <ul style={{fontSize:'1.07rem',lineHeight:1.8,color:C.navy}}>
          <li><strong>Kick-off immersion:</strong> 3 days on-site. Baseline, Phase 0, DP01 and DP02.</li>
          <li><strong>Customer validation visit:</strong> 2 days. Real customer conversations and debrief.</li>
          <li><strong>Iteration 1 pilot visit:</strong> 3 days. Consultant leads with 2 real clients, CEO observes.</li>
          <li><strong>Iteration 2 and handover visit:</strong> 3 days. Client leads, consultant observes.</li>
          <li><strong>Between visits:</strong> in-country associate provides daily continuity. 2 remote sessions per week.</li>
        </ul>
        <h4 style={{fontFamily:'Georgia,serif',color:C.navy}}>Gate Escalation Protocol</h4>
        <ul style={{fontSize:'1.07rem',lineHeight:1.8,color:C.navy}}>
          <li>Gate not signed within 5 working days of completion: escalate to CEO directly by phone or WhatsApp.</li>
          <li>Gate not signed within 10 working days: use Coach Authorise Progress with a mandatory note.</li>
          <li>All coach-authorised progress is visible to the Ignite funder view \u2014 be specific in the note.</li>
        </ul>
        <h4 style={{fontFamily:'Georgia,serif',color:C.navy}}>Commercial Readiness Diagnostic Points</h4>
        <ul style={{fontSize:'1.07rem',lineHeight:1.8,color:C.navy}}>
          <li><strong>Baseline:</strong> DP06 \u2014 before pilots begin.</li>
          <li><strong>Mid-point:</strong> DP07 \u2014 after Iteration 1.</li>
          <li><strong>Final:</strong> DP09 \u2014 at engagement close.</li>
        </ul>
        <h4 style={{fontFamily:'Georgia,serif',color:C.navy}}>Non-Negotiables</h4>
        <ul style={{fontSize:'1.07rem',lineHeight:1.8,color:C.navy}}>
          <li>Independence Test 4 (client presents commercial model unassisted) must be Yes before handover.</li>
          <li>Pilot clients must pay \u2014 even a nominal amount. Zero-payment pilots do not count.</li>
          <li>The financial model must be understood by the CEO and Finance Manager, not just the consultant.</li>
        </ul>
      </div>
    </div>
  )
}

function TabIPFramework(){
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'1rem'}}><h3 style={secH}>Tab 4 \u2014 IP Framework Reference</h3><button style={addBtn(true)} onClick={()=>window.print()}>Print</button></div>
      <div style={card}>
        <h4 style={{fontFamily:'Georgia,serif',color:C.navy,marginTop:0}}>Three-Stage Adoption Test</h4>
        <p style={{fontSize:'1.07rem',color:C.slate,lineHeight:1.6}}>Before any service can be sold commercially, three things must be true about the buyer. All three must be present \u2014 one or two is not enough.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'1rem',marginBottom:'1.5rem'}}>
          {[{n:'01',t:'Willingness',d:'The customer sees the problem as real and worth solving. They want a solution and are open to engaging with a provider.'},{n:'02',t:'Ability',d:'The customer has the financial means to pay for the solution at the price offered. Budget exists and can be accessed.'},{n:'03',t:'Prioritisation',d:'The customer ranks this problem high enough to spend budget on it now, not next quarter or next year.'}].map(s=>(
            <div key={s.n} style={{background:C.cream,padding:16,borderRadius:8,borderTop:`3px solid ${C.cyan}`}}>
              <p style={{fontSize:'0.93rem',color:C.cyan,fontWeight:700,letterSpacing:1,margin:'0 0 4px',textTransform:'uppercase',fontFamily:'monospace'}}>{s.n}</p>
              <p style={{fontFamily:'Georgia,serif',fontWeight:700,margin:'0 0 8px',fontSize:'1rem',color:C.navy}}>{s.t}</p>
              <p style={{margin:0,fontSize:'1.07rem',color:C.slate}}>{s.d}</p>
            </div>
          ))}
        </div>
        <h4 style={{fontFamily:'Georgia,serif',color:C.navy}}>Asset Liquidity Hierarchy</h4>
        <p style={{fontSize:'1.07rem',color:C.slate,lineHeight:1.6}}>In agricultural markets, assets serve different financial functions. Understanding this helps diagnose customer budget behaviour.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'1rem',marginBottom:'1.5rem'}}>
          {[{t:'Poultry',sub:'ATM equivalent',d:'Easily converted to cash. Sold when small amounts are needed quickly.'},{t:'Small ruminants',sub:'Savings equivalent',d:'Converted for planned medium expenses. Goats and sheep are liquid but not instant.'},{t:'Large ruminants',sub:'Fixed asset equivalent',d:'Sold for major planned expenses only. Cattle represent significant stored value.'}].map(a=>(
            <div key={a.t} style={{background:C.cream,padding:16,borderRadius:8,borderTop:`3px solid ${C.teal}`}}>
              <p style={{fontFamily:'Georgia,serif',fontWeight:700,margin:'0 0 2px',fontSize:'1.16rem',color:C.navy}}>{a.t}</p>
              <p style={{fontSize:'0.93rem',color:C.teal,margin:'0 0 8px',fontWeight:600}}>{a.sub}</p>
              <p style={{margin:0,fontSize:'1.07rem',color:C.slate}}>{a.d}</p>
            </div>
          ))}
        </div>
        <h4 style={{fontFamily:'Georgia,serif',color:C.navy}}>Six Fit Tests \u2014 Commercial Readiness Diagnostic</h4>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'1.07rem'}}>
          <thead><tr style={{background:'var(--cv-header)',color:'var(--cv-on-accent)'}}>{['Test','Name','What it diagnoses'].map(h=><th key={h} style={{padding:'8px 12px',textAlign:'left'}}>{h}</th>)}</tr></thead>
          <tbody>{[['01','Problem\u2013Provider Fit','Does the organisation have the right to own this problem in this market?'],['02','Problem\u2013Solution Fit','Does the service solve the problem as the client experiences it?'],['03','Solution\u2013Problem Owner Fit','Is the solution designed for the actor with budget, not just the beneficiary?'],['04','Solution\u2013Pilot Fit','Can this be tested meaningfully within the engagement timeline?'],['05','Solution\u2013Market Fit','Is there demonstrated willingness to pay at a cost-recovery price?'],['06','Solution\u2013Scale Channel Fit','Are there channels to reach beyond the founding clients independently?']].map(([n,name,desc],i)=>(
            <tr key={n} style={{background:i%2===0?C.cream:C.white}}>
              <td style={{padding:'8px 12px',color:C.cyan,fontWeight:700,fontFamily:'monospace'}}>{n}</td>
              <td style={{padding:'8px 12px',fontWeight:600,color:C.navy}}>{name}</td>
              <td style={{padding:'8px 12px',color:C.slate}}>{desc}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

function TabEngagementSetup({client,fileLinks,notifications,onUpdate,onUpdateFileLinks,onUpdateNotifications}){
  const [links,setLinks]=useState(fileLinks||[])
  const [notif,setNotif]=useState(notifications||{enabled:false,recipients:[]})
  const [saving,setSaving]=useState(false)
  function addLink(){setLinks(l=>[...l,{label:'',url:'',sort_order:l.length}])}
  function updLink(i,f,v){setLinks(l=>l.map((x,idx)=>idx!==i?x:{...x,[f]:v}))}
  function removeLink(i){setLinks(l=>l.filter((_,idx)=>idx!==i))}
  function addRecipient(){setNotif(n=>({...n,recipients:[...n.recipients,{name:'',email:'',role:'',notify_gate_signed:true,notify_gate_authorised:true,notify_evidence_submitted:false,notify_dp_complete:true}]}))}
  function updRecipient(i,f,v){setNotif(n=>({...n,recipients:n.recipients.map((r,idx)=>idx!==i?r:{...r,[f]:v})}))}
  async function save(){setSaving(true);await onUpdateFileLinks(links);await onUpdateNotifications(notif);setSaving(false)}
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'1rem'}}><h3 style={secH}>Tab 5 \u2014 Engagement Setup</h3><div style={{display:'flex',gap:'0.5rem'}}><button style={solidBtn('var(--cv-header)',true)} disabled={saving} onClick={save}>{saving?'Saving\u2026':'Save'}</button><button style={addBtn(true)} onClick={()=>window.print()}>Print</button></div></div>
      <div style={card}>
        <div style={secH}>Engagement Team</div>
        <div style={fGrid}>
          <div><label style={lbl}>Lead Consultant</label><input style={inp} defaultValue="The Canvas Coach" readOnly/></div>
          <div><label style={lbl}>Client CEO</label><input style={inp} value={client.contact_name} onChange={e=>onUpdate({contact_name:e.target.value})}/></div>
          <div><label style={lbl}>CEO Email</label><input style={inp} value={client.contact_email} onChange={e=>onUpdate({contact_email:e.target.value})}/></div>
          <div><label style={lbl}>CEO Phone</label><input style={inp} value={client.contact_phone} onChange={e=>onUpdate({contact_phone:e.target.value})}/></div>
        </div>
      </div>
      <div style={card}>
        <div style={secH}>Document Links</div>
        <p style={{fontSize:'1.07rem',color:C.slate,marginBottom:'1rem'}}>Add links to Google Drive, Dropbox, or any URL for key documents.</p>
        {links.map((l,i)=>(
          <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 2fr auto',gap:'0.75rem',alignItems:'end',marginBottom:'0.75rem'}}>
            <div><label style={lbl}>Label</label><input style={inp} value={l.label} onChange={e=>updLink(i,'label',e.target.value)} placeholder="e.g. Engagement Brief"/></div>
            <div><label style={lbl}>URL</label><input style={inp} value={l.url} onChange={e=>updLink(i,'url',e.target.value)} placeholder="https://..."/></div>
            <button onClick={()=>removeLink(i)} style={{...addBtn(true,C.red),alignSelf:'center'}}>Remove</button>
          </div>
        ))}
        <button onClick={addLink} style={addBtn()}>+ Add document link</button>
      </div>
      <div style={card}>
        <div style={secH}>Email Notifications</div>
        <label style={{display:'flex',alignItems:'center',gap:'0.6rem',fontSize:'1.07rem',color:C.navy,marginBottom:'1rem',cursor:'pointer'}}><input type="checkbox" checked={notif.enabled} onChange={e=>setNotif(n=>({...n,enabled:e.target.checked}))}/> Enable automatic email notifications</label>
        {notif.enabled&&(
          <div>
            {notif.recipients.map((r,i)=>(
              <div key={i} style={{...card,background:C.lightBg}}>
                <div style={fGrid}>
                  <div><label style={lbl}>Name</label><input style={inp} value={r.name} onChange={e=>updRecipient(i,'name',e.target.value)}/></div>
                  <div><label style={lbl}>Email</label><input style={inp} value={r.email} onChange={e=>updRecipient(i,'email',e.target.value)}/></div>
                  <div><label style={lbl}>Role</label><input style={inp} value={r.role} onChange={e=>updRecipient(i,'role',e.target.value)} placeholder="e.g. CEO, Programme Officer"/></div>
                </div>
                <div style={{display:'flex',gap:'1.25rem',flexWrap:'wrap',fontSize:'1.07rem',marginTop:'0.75rem'}}>
                  {[['notify_gate_signed','Gate signed'],['notify_gate_authorised','Coach authorisation'],['notify_evidence_submitted','Evidence submitted'],['notify_dp_complete','DP complete']].map(([f,label])=>(
                    <label key={f} style={{display:'flex',alignItems:'center',gap:'0.4rem',cursor:'pointer'}}><input type="checkbox" checked={r[f]} onChange={e=>updRecipient(i,f,e.target.checked)}/>{label}</label>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={addRecipient} style={addBtn()}>+ Add recipient</button>
          </div>
        )}
      </div>
    </div>
  )
}

function TabDiagnostic({client,diagnostic,userRole,userName,onUpdate}){
  const d=diagnostic||{}
  const locked=d.ceo_signed&&d.coach_signed
  const answers=d.readiness_answers||READINESS_QUESTIONS.map(q=>({...q,answer:null}))
  const score=answers.filter(a=>a.answer===true).length
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'1rem'}}><h3 style={secH}>Tab 6 \u2014 Pre-Engagement Diagnostic</h3><button style={addBtn(true)} onClick={()=>window.print()}>Print</button></div>
      {locked&&<div style={{background:'var(--cv-tint-green)',padding:14,borderRadius:8,marginBottom:16,fontWeight:600,color:C.green}}>Signed and locked. CEO: {d.ceo_signed_name} on {d.ceo_signed_at?.split('T')[0]}. Coach confirmed {d.coach_signed_at?.split('T')[0]}.</div>}
      <div style={card}>
        <div style={secH}>Three Questions</div>
        {[['question_1','What does commercial success look like for your organisation in 18 months?'],['question_2','What is the biggest thing stopping you from earning commercial revenue right now?'],['question_3','What would have to be true for your organisation to stop needing grant funding?']].map(([field,question])=>(
          <div key={field} style={{marginBottom:'1.25rem'}}>
            <label style={lbl}>{question}</label>
            <p style={{...hint,marginBottom:'0.4rem'}}>Capture the answer verbatim \u2014 use the client's own words.</p>
            <textarea style={{...inp,minHeight:80,resize:'vertical',background:locked?'var(--cv-disabled)':undefined}} value={d[field]||''} onChange={e=>!locked&&onUpdate({[field]:e.target.value})} placeholder="Enter answer exactly as given..." disabled={locked}/>
          </div>
        ))}
        <div style={{display:'flex',gap:'1rem',alignItems:'center',flexWrap:'wrap',marginTop:'0.5rem'}}>
          {!d.ceo_signed&&canSignOff(userRole)&&(
            <button style={solidBtn('var(--cv-header)')} onClick={()=>onUpdate({ceo_signed:true,ceo_signed_at:new Date().toISOString(),ceo_signed_name:client.contact_name||userName})}>CEO Sign-Off</button>
          )}
          {d.ceo_signed&&!d.coach_signed&&canViewCoachGuidance(userRole)&&(
            <button style={solidBtn(C.teal)} onClick={()=>onUpdate({coach_signed:true,coach_signed_at:new Date().toISOString()})}>Coach Confirms</button>
          )}
          {d.ceo_signed&&<Badge text={`CEO signed: ${d.ceo_signed_name||''}`} color={C.green}/>}
          {d.coach_signed&&<Badge text="Coach confirmed" color={C.teal}/>}
        </div>
      </div>
      <div style={card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
          <div style={secH}>Readiness Self-Assessment</div>
          <div style={{background:score<6?'var(--cv-tint-amber-2)':score>=8?'var(--cv-tint-green)':'var(--cv-tint-cyan)',padding:'6px 14px',borderRadius:6,fontWeight:700,color:score<6?C.amber:score>=8?C.green:C.cyan,fontSize:'1.07rem'}}>{score} / {READINESS_QUESTIONS.length} \u2014 {score<6?'Below threshold \u2014 discuss with coach':score>=8?'Strong readiness':'Moderate readiness'}</div>
        </div>
        <div style={{maxWidth:280,marginBottom:'1rem'}}>
          <ScoreDonut label="Readiness self-assessment" display={`${score} / ${READINESS_QUESTIONS.length}`} frac={READINESS_QUESTIONS.length?score/READINESS_QUESTIONS.length:0} rating={score<6?'Below threshold':score>=8?'Strong readiness':'Moderate readiness'} color={score<6?C.amber:score>=8?C.green:C.cyan}/>
        </div>
        {answers.map((a,i)=>(
          <div key={a.id} style={{display:'flex',alignItems:'center',gap:'1rem',padding:'0.65rem 0',borderBottom:`1px solid ${C.border}`,fontSize:'1.07rem'}}>
            <div style={{display:'flex',gap:'0.4rem',flexShrink:0}}>
              {[true,false,null].map((v,vi)=>(
                <button key={vi} onClick={()=>{if(!locked){const newAnswers=[...answers];newAnswers[i]={...newAnswers[i],answer:v};onUpdate({readiness_answers:newAnswers})}}} style={{padding:'3px 10px',borderRadius:4,fontSize:'1.01rem',cursor:locked?'default':'pointer',background:a.answer===v?(v===true?C.green:v===false?C.red:C.slate):C.white,color:a.answer===v?'var(--cv-on-accent)':C.slate,border:`1px solid ${C.border}`}}>
                  {v===true?'Yes':v===false?'No':'?'}
                </button>
              ))}
            </div>
            <span style={{color:C.navy}}>{a.question}</span>
          </div>
        ))}
      </div>
      <div style={card}>
        <div style={secH}>Engagement Commitment</div>
        <div style={{background:C.cream,padding:16,borderRadius:8,marginBottom:16,fontSize:'1.07rem',lineHeight:1.7,color:C.navy}}>
          <p>By signing below, {client.name} confirms that:</p>
          <ol style={{color:C.slate}}>
            <li>We have read and understood how this engagement works.</li>
            <li>We will allocate sufficient time from our leadership and relevant staff to complete each Decision Point.</li>
            <li>We will engage directly with real paying customers during this engagement.</li>
            <li>We accept that the engagement will produce a commercial model we will operate independently.</li>
            <li>We understand that the goal is financial independence, not a donor report.</li>
          </ol>
        </div>
        {!d.commitment_signed&&canSignOff(userRole)&&<button style={solidBtn('var(--cv-header)')} onClick={()=>onUpdate({commitment_signed:true,commitment_signed_at:new Date().toISOString()})}>Sign Engagement Commitment</button>}
        {d.commitment_signed&&<Badge text={`Signed on ${d.commitment_signed_at?.split('T')[0]}`} color={C.green}/>}
      </div>
    </div>
  )
}

function TabTracker({client,canvas}){
  const dpOrder=['phase_0','dp01','dp02','dp03','dp04','dp05','dp06','dp07','dp08','dp09']
  const dpLabels={'phase_0':'Phase 0','dp01':'DP01','dp02':'DP02','dp03':'DP03','dp04':'DP04','dp05':'DP05','dp06':'DP06','dp07':'DP07','dp08':'DP08','dp09':'DP09'}
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'1rem'}}><h3 style={secH}>Tab 7 \u2014 Engagement Tracker</h3><button style={addBtn(true)} onClick={()=>window.print()}>Print</button></div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'1.07rem',fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
          <thead><tr style={{background:'var(--cv-header)',color:'var(--cv-on-accent)'}}>{['Phase','Zone / Decision Point','Core Question','Status','Components','CEO Sign-Off'].map(h=><th key={h} style={{padding:'10px 12px',textAlign:'left',fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
          <tbody>
            {dpOrder.map((dpId,i)=>{
              const dp=canvas.find(d=>d.dp_id===dpId)
              const completedComps=dp?.components?.filter(c=>c.status==='\u2713').length||0
              const totalComps=dp?.components?.length||0
              return(
                <tr key={dpId} style={{background:i%2===0?C.cream:C.white}}>
                  <td style={{padding:'9px 12px',fontWeight:700,color:C.cyan,fontFamily:'monospace'}}>{dpLabels[dpId]}</td>
                  <td style={{padding:'9px 12px',fontWeight:600,color:C.navy}}>{dp?.label||dpId}</td>
                  <td style={{padding:'9px 12px',color:C.slate,maxWidth:220,fontSize:'1.01rem'}}>{dp?.core_question||'\u2014'}</td>
                  <td style={{padding:'9px 12px'}}>{dp?<div style={{display:'flex',alignItems:'center',gap:'0.4rem'}}><DPDot status={dp.status}/><span style={{fontSize:'1.01rem'}}>{dp.status}</span></div>:<Badge text="Not started" color={C.slate}/>}</td>
                  <td style={{padding:'9px 12px',fontFamily:'monospace',fontSize:'1.01rem'}}>{dp?`${completedComps}/${totalComps}`:'\u2014'}</td>
                  <td style={{padding:'9px 12px'}}>{dp?.ceo_signed_off?<Badge text={`CEO \u2713 ${dp.ceo_signed_off_at?.split('T')[0]||''}`} color={C.green}/>:'\u2014'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TabDecisions({client,decisions,userRole,userName,onAdd,onUpdate}){
  const [form,setForm]=useState({date:new Date().toISOString().split('T')[0],dp_id:'',decision:'',made_by:userName,evidence_ref:'',authorised_by:''})
  const [adding,setAdding]=useState(false)
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'1rem'}}><h3 style={secH}>Tab 8 \u2014 Canvas Decision Record</h3><div style={{display:'flex',gap:'0.5rem'}}>{canEdit(userRole)&&<button style={addBtn()} onClick={()=>setAdding(!adding)}>+ Record Decision</button>}<button style={addBtn(true)} onClick={()=>window.print()}>Print</button></div></div>
      {adding&&(
        <div style={{...card,border:`1px solid ${C.cyan}`}}>
          <div style={fGrid}>
            <div><label style={lbl}>Date</label><input type="date" style={inp} value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
            <div><label style={lbl}>Decision Point</label><select style={inp} value={form.dp_id} onChange={e=>setForm(f=>({...f,dp_id:e.target.value}))}><option value="">Select...</option>{['phase_0','dp01','dp02','dp03','dp04','dp05','dp06','dp07','dp08','dp09'].map(d=><option key={d} value={d}>{d}</option>)}</select></div>
            <div><label style={lbl}>Made by</label><input style={inp} value={form.made_by} onChange={e=>setForm(f=>({...f,made_by:e.target.value}))}/></div>
            <div><label style={lbl}>Authorised by</label><input style={inp} value={form.authorised_by} onChange={e=>setForm(f=>({...f,authorised_by:e.target.value}))}/></div>
            <div><label style={lbl}>Evidence reference</label><input style={inp} value={form.evidence_ref} onChange={e=>setForm(f=>({...f,evidence_ref:e.target.value}))} placeholder="e.g. E-003"/></div>
          </div>
          <div><label style={lbl}>Decision</label><textarea style={{...inp,minHeight:80,resize:'vertical'}} value={form.decision} onChange={e=>setForm(f=>({...f,decision:e.target.value}))} placeholder="What was decided?"/></div>
          <div style={{display:'flex',gap:'0.6rem',marginTop:'0.75rem'}}>
            <button style={solidBtn()} onClick={()=>{onAdd({...form,id:`cdr_${Date.now()}`});setAdding(false);setForm({date:new Date().toISOString().split('T')[0],dp_id:'',decision:'',made_by:userName,evidence_ref:'',authorised_by:''})}}>Save Decision</button>
            <button style={addBtn(true,C.slate)} onClick={()=>setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
      {decisions.length===0&&!adding&&<div style={{...card,textAlign:'center',color:C.slate,padding:'2rem'}}>No decisions recorded yet.</div>}
      {decisions.map(d=>(
        <div key={d.id} style={{...card,borderLeft:`4px solid ${C.cyan}`}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.5rem'}}>
            <span style={{fontFamily:'monospace',fontSize:'1.01rem',fontWeight:700,color:C.cyan}}>{d.reference}</span>
            <span style={{fontSize:'1.01rem',color:C.slate}}>{d.date} \u00b7 {d.dp_id||'\u2014'}</span>
          </div>
          <p style={{margin:'0 0 0.5rem',fontSize:'1.13rem',color:C.navy}}>{d.decision}</p>
          <div style={{display:'flex',gap:'1.5rem',fontSize:'1.01rem',color:C.slate}}>
            <span>Made by: <strong style={{color:C.navy}}>{d.made_by}</strong></span>
            {d.authorised_by&&<span>Authorised by: <strong style={{color:C.navy}}>{d.authorised_by}</strong></span>}
            {d.evidence_ref&&<span>Evidence: <strong style={{color:C.cyan}}>{d.evidence_ref}</strong></span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function TabEvidence({client,evidence,onAdd,onUpdate}){
  const [adding,setAdding]=useState(false)
  const [form,setForm]=useState({date:new Date().toISOString().split('T')[0],dp_id:'',type:'document',description:'',url:'',uploaded_by:'',status:'submitted'})
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'1rem'}}><h3 style={secH}>Tab 9 \u2014 Evidence Library</h3><div style={{display:'flex',gap:'0.5rem'}}><button style={addBtn()} onClick={()=>setAdding(!adding)}>+ Add Evidence</button><button style={addBtn(true)} onClick={()=>window.print()}>Print</button></div></div>
      {adding&&(
        <div style={{...card,border:`1px solid ${C.cyan}`}}>
          <div style={fGrid}>
            <div><label style={lbl}>Date</label><input type="date" style={inp} value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
            <div><label style={lbl}>Decision Point</label><select style={inp} value={form.dp_id} onChange={e=>setForm(f=>({...f,dp_id:e.target.value}))}><option value="">\u2014</option>{['phase_0','dp01','dp02','dp03','dp04','dp05','dp06','dp07','dp08','dp09'].map(d=><option key={d} value={d}>{d}</option>)}</select></div>
            <div><label style={lbl}>Type</label><select style={inp} value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{['document','interview','observation','financial_data','other'].map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            <div><label style={lbl}>Uploaded by</label><input style={inp} value={form.uploaded_by} onChange={e=>setForm(f=>({...f,uploaded_by:e.target.value}))}/></div>
            <div style={{gridColumn:'1/-1'}}><label style={lbl}>Description</label><input style={inp} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="What is this evidence?"/></div>
            <div style={{gridColumn:'1/-1'}}><label style={lbl}>URL or file link</label><input style={inp} value={form.url} onChange={e=>setForm(f=>({...f,url:e.target.value}))} placeholder="https://..."/></div>
          </div>
          <div style={{display:'flex',gap:'0.6rem',marginTop:'0.75rem'}}>
            <button style={solidBtn()} onClick={()=>{onAdd({...form,id:`ev_${Date.now()}`});setAdding(false)}}>Save</button>
            <button style={addBtn(true,C.slate)} onClick={()=>setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'1.01rem'}}>
          <thead><tr style={{background:'var(--cv-header)',color:'var(--cv-on-accent)'}}>{['Ref','Date','DP','Type','Description','Status','Link'].map(h=><th key={h} style={{padding:'8px 10px',textAlign:'left',fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
          <tbody>{evidence.length===0?<tr><td colSpan={7} style={{padding:'2rem',textAlign:'center',color:C.slate}}>No evidence recorded yet.</td></tr>:evidence.map((e,i)=>(
            <tr key={e.id} style={{background:i%2===0?C.cream:C.white}}>
              <td style={{padding:'8px 10px',fontFamily:'monospace',fontWeight:700,color:C.cyan}}>{e.reference}</td>
              <td style={{padding:'8px 10px'}}>{e.date}</td>
              <td style={{padding:'8px 10px',fontFamily:'monospace',fontSize:'1.01rem'}}>{e.dp_id||'\u2014'}</td>
              <td style={{padding:'8px 10px'}}>{e.type}</td>
              <td style={{padding:'8px 10px',maxWidth:240}}>{e.description}</td>
              <td style={{padding:'8px 10px'}}><Badge text={e.status} color={e.status==='accepted'?C.green:e.status==='queried'?C.amber:C.slate}/></td>
              <td style={{padding:'8px 10px'}}>{e.url?<a href={e.url} target="_blank" rel="noopener noreferrer" style={{color:C.cyan,fontSize:'1.01rem'}}>Open</a>:'\u2014'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

function TabHandover({client,handover,canvas,userRole,onUpdate}){
  const dp09=canvas.find(d=>d.dp_id==='dp09')
  const locked=!dp09?.ceo_signed_off
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'1rem'}}><h3 style={secH}>Tab 10 \u2014 Handover Record</h3><button style={addBtn(true)} onClick={()=>window.print()}>Print</button></div>
      {locked&&<div style={{background:'var(--cv-tint-amber-2)',padding:14,borderRadius:8,marginBottom:16,color:C.amber,fontWeight:600}}>This tab unlocks when DP09 CEO sign-off is complete.</div>}
      {handover.map(test=>(
        <div key={test.id} style={{...card,opacity:locked?0.6:1}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.75rem',flexWrap:'wrap',gap:'0.5rem'}}>
            <p style={{fontFamily:'Georgia,serif',fontSize:'1.16rem',fontWeight:700,color:C.navy,margin:0}}>Test {test.test_number}: {test.test_description}</p>
            <Badge text={test.status.replace('_',' ')} color={test.status==='yes'?C.green:test.status==='no'?C.red:test.status==='partial'?C.amber:C.slate}/>
          </div>
          {!locked&&canViewCoachGuidance(userRole)&&(
            <div style={{display:'flex',gap:'0.5rem',marginBottom:'0.75rem',flexWrap:'wrap'}}>
              {['yes','no','partial','not_assessed'].map(s=>(
                <button key={s} style={{padding:'4px 12px',borderRadius:5,fontSize:'1.01rem',cursor:'pointer',background:test.status===s?'var(--cv-header)':C.white,color:test.status===s?'var(--cv-on-accent)':C.slate,border:`1px solid ${C.border}`}} onClick={()=>onUpdate(test.id,{status:s})}>{s.replace('_',' ')}</button>
              ))}
            </div>
          )}
          <div><label style={lbl}>Evidence</label><textarea style={{...inp,minHeight:60,resize:'vertical'}} value={test.evidence||''} disabled={locked||!canEdit(userRole)} onChange={e=>onUpdate(test.id,{evidence:e.target.value})} placeholder="What evidence confirms this test is passed?"/></div>
          {test.status==='yes'&&!test.ceo_confirmed&&canSignOff(userRole)&&!locked&&(
            <button style={{...solidBtn(C.green),marginTop:'0.5rem'}} onClick={()=>onUpdate(test.id,{ceo_confirmed:true,ceo_confirmed_at:new Date().toISOString()})}>CEO Confirms Test Passed</button>
          )}
          {test.ceo_confirmed&&<div style={{marginTop:'0.5rem'}}><Badge text={`CEO confirmed ${test.ceo_confirmed_at?.split('T')[0]||''}`} color={C.green}/></div>}
        </div>
      ))}
    </div>
  )
}

function TabDP({client,dp,userRole,onUpdateDP,onUpdateComp}){
  const [expandedComp,setExpandedComp]=useState(null)
  const [coachOverrideNote,setCoachOverrideNote]=useState('')
  const [showOverride,setShowOverride]=useState(false)
  if(!dp)return<div style={{...card,color:C.slate,textAlign:'center',padding:'2rem'}}>This Decision Point is not yet loaded. It will appear once the canvas is activated for this client.</div>
  const completedComps=dp.components?.filter(c=>c.status==='\u2713').length||0
  const totalComps=dp.components?.length||0
  return(
    <div>
      {/* DP Header */}
      <div style={{background:'var(--cv-header)',borderRadius:8,padding:'1.5rem',marginBottom:'1.5rem',color:'var(--cv-on-accent)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'1rem'}}>
          <div>
            <p style={{margin:'0 0 4px',fontSize:'0.93rem',color:C.cyan,fontFamily:'monospace',letterSpacing:'0.08em'}}>{dp.label?.split('\u2014')[0]?.trim()}</p>
            <h2 style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',margin:'0 0 0.5rem',color:'var(--cv-on-accent)'}}>{dp.core_question}</h2>
            <p style={{margin:0,fontSize:'1.01rem',color:'var(--cv-wa-60)'}}>Session time: {dp.session_time}</p>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:'0.5rem',alignItems:'flex-end'}}>
            <div style={{display:'flex',gap:'0.4rem',alignItems:'center'}}><DPDot status={dp.status}/><span style={{fontSize:'1.01rem',color:'var(--cv-on-accent)'}}>{dp.status}</span></div>
            <p style={{margin:0,fontSize:'1.01rem',color:C.cyan}}>{completedComps}/{totalComps} components</p>
            <button style={addBtn(true)} onClick={()=>window.print()}>Print</button>
          </div>
        </div>
      </div>

      {/* What good looks like */}
      <div style={card}>
        <div style={secH}>What good looks like for this Decision Point</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginBottom:'1rem'}}>
          <div style={{background:'var(--cv-tint-green)',padding:14,borderRadius:6}}><p style={{fontWeight:700,color:C.green,margin:'0 0 6px',fontSize:'1.01rem'}}>A strong answer</p><p style={{margin:0,fontSize:'1.07rem',color:C.navy}}>{dp.commitment}</p></div>
          <div style={{background:'var(--cv-tint-red)',padding:14,borderRadius:6}}><p style={{fontWeight:700,color:C.red,margin:'0 0 6px',fontSize:'1.01rem'}}>Output required</p><p style={{margin:0,fontSize:'1.07rem',color:C.navy}}>{dp.output_required}</p></div>
        </div>
      </div>

      {/* Components */}
      <div style={card}>
        <div style={secH}>Components \u2014 Evidence Required</div>
        {(dp.components||[]).map(comp=>{
          const expanded=expandedComp===comp.id
          return(
            <div key={comp.id} style={{border:`1px solid ${C.border}`,borderLeft:`4px solid ${comp.status==='\u2713'?C.green:comp.status==='\u25d0'?C.cyan:comp.status==='\u26a0'?C.amber:C.border}`,borderRadius:6,marginBottom:'0.6rem',overflow:'hidden'}}>
              <div style={{display:'flex',alignItems:'center',gap:'0.75rem',padding:'0.75rem 1rem',cursor:'pointer',background:expanded?C.lightBg:C.white}} onClick={()=>setExpandedComp(expanded?null:comp.id)}>
                <DPDot status={comp.status}/>
                <div style={{flex:1}}>
                  <span style={{fontWeight:600,fontSize:'1.07rem',color:C.navy}}>Component {comp.component_number} \u2014 {comp.title}</span>
                </div>
                <div style={{display:'flex',gap:'0.4rem',alignItems:'center',flexShrink:0}}>
                  {comp.ceo_signed_off&&<Badge text="CEO \u2713" color={C.green}/>}
                  {comp.evidence_recorded&&<Badge text="Evidence" color={C.teal}/>}
                  {canEdit(userRole)&&<select value={comp.status} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();onUpdateComp(comp.component_number,{status:e.target.value})}} style={{fontFamily:'monospace',fontSize:'0.93rem',padding:'0.2rem 0.3rem',border:`1px solid ${C.border}`,borderRadius:4,background:'transparent',cursor:'pointer'}}>
                    {['\u25cb','\u25d0','\u2713','\u26a0'].map(s=><option key={s} value={s}>{s}</option>)}
                  </select>}
                  <span style={{fontSize:'0.93rem',color:C.slate}}>{expanded?'\u25b2':'\u25bc'}</span>
                </div>
              </div>
              {expanded&&(
                <div style={{padding:'1rem',borderTop:`1px solid ${C.border}`,background:C.white}}>
                  {/* Five layers */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem',marginBottom:'1rem'}}>
                    <div style={{background:'var(--cv-bg-2)',borderRadius:6,padding:'0.75rem'}}><p style={{fontWeight:700,color:C.navy,margin:'0 0 4px',fontSize:'1.01rem',textTransform:'uppercase',letterSpacing:'0.05em'}}>What it is</p><p style={{margin:0,fontSize:'1.07rem',color:C.slate}}>{comp.what_it_is||'Content will be loaded from canvas-types.'}</p></div>
                    <div style={{background:'var(--cv-tint-amber)',borderRadius:6,padding:'0.75rem'}}><p style={{fontWeight:700,color:C.amber,margin:'0 0 4px',fontSize:'1.01rem',textTransform:'uppercase',letterSpacing:'0.05em'}}>Why it matters</p><p style={{margin:0,fontSize:'1.07rem',color:C.slate}}>{comp.why_it_matters||'\u2014'}</p></div>
                  </div>
                  <div style={{background:'var(--cv-tint-cyan)',borderRadius:6,padding:'0.75rem',marginBottom:'0.75rem',borderLeft:`4px solid ${C.cyan}`}}><p style={{fontWeight:700,color:C.cyan,margin:'0 0 4px',fontSize:'1.01rem',textTransform:'uppercase',letterSpacing:'0.05em'}}>Action trigger</p><p style={{margin:0,fontSize:'1.07rem',color:C.navy}}>{comp.action_trigger||'\u2014'}</p></div>
                  <div style={{background:'var(--cv-tint-green)',borderRadius:6,padding:'0.75rem',marginBottom:'0.75rem'}}><p style={{fontWeight:700,color:C.green,margin:'0 0 4px',fontSize:'1.01rem',textTransform:'uppercase',letterSpacing:'0.05em'}}>Signal to look for</p><p style={{margin:0,fontSize:'1.07rem',color:C.navy}}>{comp.signal_to_look_for||'\u2014'}</p></div>
                  {canViewCoachGuidance(userRole)&&<div style={{background:'var(--cv-tint-amber)',borderRadius:6,padding:'0.75rem',marginBottom:'1rem',borderLeft:`4px solid ${C.amber}`}}><p style={{fontWeight:700,color:C.amber,margin:'0 0 4px',fontSize:'1.01rem',textTransform:'uppercase',letterSpacing:'0.05em'}}>Coach guidance (not visible to client)</p><p style={{margin:0,fontSize:'1.07rem',color:C.navy}}>{comp.coach_guidance||'\u2014'}</p></div>}
                  {/* Evidence fields */}
                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:'0.75rem'}}>
                    <label style={{...lbl,color:C.teal}}>Evidence recorded</label>
                    <textarea style={{...inp,minHeight:80,resize:'vertical',background:'var(--cv-tint-actual)',border:`1px solid ${C.teal}`}} placeholder="Describe what was produced or done for this component..." value={comp.evidence_recorded||''} onChange={e=>onUpdateComp(comp.component_number,{evidence_recorded:e.target.value})}/>
                    <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'0.75rem',marginTop:'0.5rem'}}>
                      <div><label style={lbl}>Document link</label><input style={inp} value={comp.evidence_url||''} onChange={e=>onUpdateComp(comp.component_number,{evidence_url:e.target.value})} placeholder="https://..."/></div>
                      <div><label style={lbl}>Evidence reference</label><input style={inp} value={comp.evidence_ref||''} onChange={e=>onUpdateComp(comp.component_number,{evidence_ref:e.target.value})} placeholder="e.g. E-003"/></div>
                    </div>
                    {canViewCoachGuidance(userRole)&&<div style={{marginTop:'0.5rem'}}><label style={lbl}>Coach notes (internal)</label><textarea style={{...inp,minHeight:60,resize:'vertical',background:'var(--cv-tint-amber)'}} value={comp.coach_notes||''} onChange={e=>onUpdateComp(comp.component_number,{coach_notes:e.target.value})} placeholder="Your private notes on this component..."/></div>}
                    <div style={{marginTop:'0.75rem',display:'flex',alignItems:'center',gap:'0.75rem',flexWrap:'wrap'}}>
                      {!comp.ceo_signed_off&&canSignOff(userRole)&&<button style={solidBtn(C.green,true)} onClick={()=>onUpdateComp(comp.component_number,{ceo_signed_off:true,ceo_signed_off_at:new Date().toISOString(),ceo_signed_off_by:client.contact_name||'CEO'})}>CEO signs off this component</button>}
                      {comp.ceo_signed_off&&<Badge text={`CEO signed off ${comp.ceo_signed_off_at?.split('T')[0]||''}`} color={C.green}/>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Evidence summary table */}
      <div style={card}>
        <div style={secH}>Evidence Summary</div>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'1.01rem'}}>
          <thead><tr style={{background:C.lightBg}}>{['Component','Evidence','Status','Link'].map(h=><th key={h} style={{padding:'8px 10px',textAlign:'left',fontWeight:600,color:C.navy,borderBottom:`1px solid ${C.border}`}}>{h}</th>)}</tr></thead>
          <tbody>{(dp.components||[]).map((comp,i)=>(
            <tr key={comp.id} style={{background:i%2===0?C.cream:C.white}}>
              <td style={{padding:'8px 10px',fontWeight:600,color:C.navy}}>{comp.component_number}. {comp.title}</td>
              <td style={{padding:'8px 10px',color:C.slate,maxWidth:280}}>{comp.evidence_recorded||'\u2014'}</td>
              <td style={{padding:'8px 10px'}}><DPDot status={comp.status}/></td>
              <td style={{padding:'8px 10px'}}>{comp.evidence_url?<a href={comp.evidence_url} target="_blank" rel="noopener noreferrer" style={{color:C.cyan}}>Open</a>:'\u2014'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* CEO Gate Sign-Off */}
      <div style={{border:`2px solid ${dp.ceo_signed_off?C.green:dp.status==='coach_authorised'?C.amber:C.border}`,borderRadius:10,padding:'1.5rem',marginTop:'1rem'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem',flexWrap:'wrap',gap:'0.5rem'}}>
          <h3 style={{fontFamily:'Georgia,serif',margin:0,color:C.navy}}>CEO Sign-Off Gate</h3>
          {dp.ceo_signed_off&&<Badge text={`CEO signed off`} color={C.green}/>}
        </div>
        {dp.ceo_signed_off?(
          <div style={{background:'var(--cv-tint-green)',padding:14,borderRadius:8}}><p style={{margin:0,color:C.green,fontWeight:600}}>Signed off on {dp.ceo_signed_off_at?.split('T')[0]}. The next section is unlocked.</p></div>
        ):(
          <div>
            {canSignOff(userRole)&&userRole==='ceo'&&(
              <div style={{background:C.cream,padding:'1.25rem',borderRadius:8,marginBottom:'1rem'}}>
                <p style={{fontSize:'1.13rem',color:C.navy,lineHeight:1.7,margin:'0 0 1rem'}}>When all components are complete, click below to sign off and unlock the next Decision Point.</p>
                <button style={solidBtn('var(--cv-header)')} onClick={()=>onUpdateDP({ceo_signed_off:true,ceo_signed_off_at:new Date().toISOString(),status:'\u2713',completed_at:new Date().toISOString()})}>I confirm this Decision Point is complete \u2014 CEO Sign-Off</button>
              </div>
            )}
            {canViewCoachGuidance(userRole)&&(
              <div style={{background:'var(--cv-tint-amber)',padding:'1.25rem',borderRadius:8,border:`1px solid ${C.amber}`}}>
                <p style={{color:C.amber,fontWeight:600,margin:'0 0 0.75rem'}}>Coach options \u2014 CEO sign-off pending</p>
                <div style={{display:'flex',gap:'0.75rem',marginBottom:'0.75rem',flexWrap:'wrap'}}>
                  <button style={addBtn(true,C.amber)} onClick={()=>alert('In production: this sends a notification email to the CEO via the Resend API.')}>Escalate to CEO by email</button>
                  <button style={solidBtn('var(--cv-header)',true)} onClick={()=>setShowOverride(!showOverride)}>Authorise Progress (Coach override)</button>
                </div>
                {showOverride&&(
                  <div>
                    <label style={lbl}>Mandatory note \u2014 visible to all parties including the Ignite funder</label>
                    <textarea style={{...inp,minHeight:80,resize:'vertical'}} value={coachOverrideNote} onChange={e=>setCoachOverrideNote(e.target.value)} placeholder="Explain why you are authorising progress without CEO sign-off. Be specific. Minimum 20 characters."/>
                    <button style={{...solidBtn(C.amber),marginTop:'0.5rem'}} onClick={()=>{if(coachOverrideNote.trim().length<20){alert('Please write at least 20 characters.');return}onUpdateDP({status:'\u26a0',coach_authorised:true,coach_note:coachOverrideNote,coach_authorised_at:new Date().toISOString()});setShowOverride(false);setCoachOverrideNote('')}}>Confirm Coach Authorisation</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TabInterviewBriefing({client,interviews,onAdd}){
  const [form,setForm]=useState({date:new Date().toISOString().split('T')[0],dp_id:'',objective:'',key_questions:'',respondent:'',role:'',organisation:'',interviewer:'',key_quotes:'',observations:'',follow_up:'',evidence_ref:''})
  const [adding,setAdding]=useState(false)
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'1rem'}}><h3 style={secH}>Tab 21 \u2014 Interview Briefing</h3><div style={{display:'flex',gap:'0.5rem'}}><button style={addBtn()} onClick={()=>setAdding(!adding)}>+ New Briefing</button><button style={addBtn(true)} onClick={()=>window.print()}>Print</button></div></div>
      <div style={{...card,background:C.cream,fontSize:'1.07rem',color:C.slate,lineHeight:1.7}}>An interview briefing is prepared before each customer validation visit. It sets the objective, target respondent profile, and key questions for the interviewer.</div>
      {adding&&(
        <div style={{...card,border:`1px solid ${C.cyan}`}}>
          <div style={fGrid}>
            <div><label style={lbl}>Date</label><input type="date" style={inp} value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
            <div><label style={lbl}>Decision Point</label><select style={inp} value={form.dp_id} onChange={e=>setForm(f=>({...f,dp_id:e.target.value}))}><option value="">Select...</option>{['dp02','dp03','dp05','dp07','dp08'].map(d=><option key={d} value={d}>{d}</option>)}</select></div>
            <div><label style={lbl}>Target Respondent Profile</label><input style={inp} value={form.respondent} onChange={e=>setForm(f=>({...f,respondent:e.target.value}))} placeholder="Type of person to interview"/></div>
            <div><label style={lbl}>Interviewer</label><input style={inp} value={form.interviewer} onChange={e=>setForm(f=>({...f,interviewer:e.target.value}))}/></div>
          </div>
          <div><label style={lbl}>Interview Objective</label><textarea style={{...inp,minHeight:70,resize:'vertical'}} value={form.objective} onChange={e=>setForm(f=>({...f,objective:e.target.value}))} placeholder="What do you need to learn from this conversation?"/></div>
          <div><label style={lbl}>Key Questions (one per line)</label><textarea style={{...inp,minHeight:120,resize:'vertical'}} value={form.key_questions} onChange={e=>setForm(f=>({...f,key_questions:e.target.value}))} placeholder="1. What is the biggest problem you face with...&#10;2. How much would you be willing to pay for...&#10;3. Who in your organisation makes this decision?"/></div>
          <div style={{display:'flex',gap:'0.6rem',marginTop:'0.75rem'}}>
            <button style={solidBtn()} onClick={()=>{onAdd({...form,id:`int_${Date.now()}`});setAdding(false)}}>Save Briefing</button>
            <button style={addBtn(true,C.slate)} onClick={()=>setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
      {interviews.filter(i=>i.objective).map(i=>(
        <div key={i.id} style={{...card,borderLeft:`4px solid ${C.cyan}`}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.5rem'}}><span style={{fontFamily:'monospace',fontSize:'1.01rem',fontWeight:700,color:C.cyan}}>{i.reference}</span><span style={{fontSize:'1.01rem',color:C.slate}}>{i.date} \u00b7 {i.dp_id}</span></div>
          <p style={{fontWeight:600,color:C.navy,margin:'0 0 0.4rem'}}>Objective: {i.objective}</p>
          <p style={{fontSize:'1.07rem',color:C.slate,margin:'0 0 0.4rem'}}>Respondent profile: {i.respondent}</p>
          {i.key_questions&&<div style={{background:C.lightBg,borderRadius:5,padding:'0.75rem',marginTop:'0.5rem'}}><p style={{fontWeight:600,fontSize:'1.01rem',color:C.navy,margin:'0 0 0.4rem'}}>Key Questions:</p><pre style={{fontSize:'1.07rem',color:C.slate,margin:0,whiteSpace:'pre-wrap',fontFamily:'inherit'}}>{i.key_questions}</pre></div>}
        </div>
      ))}
    </div>
  )
}

function TabInterviewCapture({client,interviews,onAdd,onUpdate}){
  const [adding,setAdding]=useState(false)
  const [form,setForm]=useState({date:new Date().toISOString().split('T')[0],dp_id:'',respondent:'',role:'',organisation:'',interviewer:'',key_quotes:'',observations:'',follow_up:'',evidence_ref:''})
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'1rem'}}><h3 style={secH}>Tab 22 \u2014 Interview Capture</h3><div style={{display:'flex',gap:'0.5rem'}}><button style={addBtn()} onClick={()=>setAdding(!adding)}>+ Record Interview</button><button style={addBtn(true)} onClick={()=>window.print()}>Print</button></div></div>
      {adding&&(
        <div style={{...card,border:`1px solid ${C.cyan}`}}>
          <div style={fGrid}>
            <div><label style={lbl}>Date</label><input type="date" style={inp} value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
            <div><label style={lbl}>Respondent</label><input style={inp} value={form.respondent} onChange={e=>setForm(f=>({...f,respondent:e.target.value}))} placeholder="Full name"/></div>
            <div><label style={lbl}>Their Role</label><input style={inp} value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} placeholder="e.g. Procurement Manager"/></div>
            <div><label style={lbl}>Organisation</label><input style={inp} value={form.organisation} onChange={e=>setForm(f=>({...f,organisation:e.target.value}))}/></div>
            <div><label style={lbl}>Interviewer</label><input style={inp} value={form.interviewer} onChange={e=>setForm(f=>({...f,interviewer:e.target.value}))}/></div>
            <div><label style={lbl}>Decision Point</label><select style={inp} value={form.dp_id} onChange={e=>setForm(f=>({...f,dp_id:e.target.value}))}><option value="">\u2014</option>{['dp02','dp03','dp05','dp07','dp08'].map(d=><option key={d} value={d}>{d}</option>)}</select></div>
          </div>
          <div><label style={lbl}>Key Quotes (verbatim)</label><textarea style={{...inp,minHeight:100,resize:'vertical'}} value={form.key_quotes} onChange={e=>setForm(f=>({...f,key_quotes:e.target.value}))} placeholder="Capture exactly what they said. Direct quotes are the most valuable evidence."/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem'}}>
            <div><label style={lbl}>Observations</label><textarea style={{...inp,minHeight:70,resize:'vertical'}} value={form.observations} onChange={e=>setForm(f=>({...f,observations:e.target.value}))} placeholder="What did you notice beyond what was said?"/></div>
            <div><label style={lbl}>Follow-up needed</label><textarea style={{...inp,minHeight:70,resize:'vertical'}} value={form.follow_up} onChange={e=>setForm(f=>({...f,follow_up:e.target.value}))} placeholder="What needs to happen as a result of this conversation?"/></div>
          </div>
          <div><label style={lbl}>Evidence Library reference</label><input style={inp} value={form.evidence_ref} onChange={e=>setForm(f=>({...f,evidence_ref:e.target.value}))} placeholder="e.g. E-007"/></div>
          <div style={{display:'flex',gap:'0.6rem',marginTop:'0.75rem'}}>
            <button style={solidBtn()} onClick={()=>{onAdd({...form,id:`int_${Date.now()}`});setAdding(false)}}>Save</button>
            <button style={addBtn(true,C.slate)} onClick={()=>setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
      {interviews.filter(i=>i.respondent).map(i=>(
        <div key={i.id} style={{...card,borderLeft:`4px solid ${C.cyan}`}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.5rem'}}><span style={{fontFamily:'monospace',fontSize:'1.01rem',fontWeight:700,color:C.cyan}}>{i.reference}</span><span style={{fontSize:'1.01rem',color:C.slate}}>{i.date} \u00b7 {i.dp_id}</span></div>
          <p style={{fontWeight:600,color:C.navy,margin:'0 0 0.3rem'}}>{i.respondent} \u2014 {i.role}, {i.organisation}</p>
          <p style={{fontSize:'1.01rem',color:C.slate,margin:'0 0 0.75rem'}}>Interviewer: {i.interviewer}</p>
          {i.key_quotes&&<div style={{background:'var(--cv-tint-cyan)',borderRadius:5,padding:'0.75rem',marginBottom:'0.5rem',borderLeft:`3px solid ${C.cyan}`}}><p style={{fontWeight:600,fontSize:'1.01rem',color:C.cyan,margin:'0 0 0.4rem'}}>Key Quotes:</p><p style={{margin:0,fontSize:'1.07rem',color:C.navy,fontStyle:'italic',lineHeight:1.6}}>{i.key_quotes}</p></div>}
          {i.observations&&<p style={{fontSize:'1.07rem',color:C.slate,margin:'0 0 0.4rem'}}><strong>Observations:</strong> {i.observations}</p>}
          {i.follow_up&&<p style={{fontSize:'1.07rem',color:C.amber,margin:0}}><strong>Follow-up:</strong> {i.follow_up}</p>}
        </div>
      ))}
    </div>
  )
}

function TabInterviewReporting({interviews}){
  const byDP=['dp02','dp03','dp05','dp07','dp08'].map(dp=>({dp,items:interviews.filter(i=>i.dp_id===dp)})).filter(g=>g.items.length>0)
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'1rem'}}><h3 style={secH}>Tab 23 \u2014 Interview Reporting</h3><button style={addBtn(true)} onClick={()=>window.print()}>Print</button></div>
      <div style={{...card,background:C.cream,fontSize:'1.07rem',color:C.slate,lineHeight:1.7}}>Interview reports summarise what was heard across all interviews for a given Decision Point: what we heard, what it means, and what we do next.</div>
      {byDP.length===0&&<div style={{...card,textAlign:'center',color:C.slate,padding:'2rem'}}>No interviews recorded yet.</div>}
      {byDP.map(({dp,items})=>(
        <div key={dp} style={card}>
          <div style={secH}>{dp.toUpperCase()} \u2014 {items.length} interview{items.length!==1?'s':''}</div>
          <div style={{marginBottom:'1rem'}}><p style={{fontWeight:700,color:C.navy,margin:'0 0 0.5rem'}}>What we heard:</p>{items.map(i=><div key={i.id} style={{marginBottom:'0.4rem',fontSize:'1.07rem'}}>{i.respondent&&<span style={{fontWeight:600,color:C.navy}}>{i.respondent}: </span>}<span style={{color:C.slate,fontStyle:'italic'}}>{i.key_quotes||'No quotes recorded.'}</span></div>)}</div>
          <div style={{borderTop:`1px solid ${C.border}`,paddingTop:'0.75rem'}}><p style={{fontWeight:700,color:C.navy,margin:'0 0 0.5rem'}}>Follow-up actions:</p>{items.filter(i=>i.follow_up).map(i=><div key={i.id} style={{fontSize:'1.07rem',color:C.amber,marginBottom:'0.3rem'}}>\u00b7 {i.follow_up}</div>)}{items.filter(i=>i.follow_up).length===0&&<p style={{fontSize:'1.07rem',color:C.slate}}>No follow-up actions recorded.</p>}</div>
        </div>
      ))}
    </div>
  )
}

function TabHypothesis({client,hypotheses,onAdd,onUpdate}){
  const [adding,setAdding]=useState(false)
  const [form,setForm]=useState({dp_id:'',date_formed:new Date().toISOString().split('T')[0],hypothesis:'',evidence_for:'',evidence_against:'',status:'holding',decision_made:''})
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'1rem'}}><h3 style={secH}>Tab 24 \u2014 Hypothesis Tracker</h3><div style={{display:'flex',gap:'0.5rem'}}><button style={addBtn()} onClick={()=>setAdding(!adding)}>+ Add Hypothesis</button><button style={addBtn(true)} onClick={()=>window.print()}>Print</button></div></div>
      {adding&&(
        <div style={{...card,border:`1px solid ${C.cyan}`}}>
          <div style={fGrid}>
            <div><label style={lbl}>Date Formed</label><input type="date" style={inp} value={form.date_formed} onChange={e=>setForm(f=>({...f,date_formed:e.target.value}))}/></div>
            <div><label style={lbl}>Decision Point</label><select style={inp} value={form.dp_id} onChange={e=>setForm(f=>({...f,dp_id:e.target.value}))}><option value="">\u2014</option>{['phase_0','dp01','dp02','dp03','dp04','dp05','dp06','dp07','dp08','dp09'].map(d=><option key={d} value={d}>{d}</option>)}</select></div>
          </div>
          <div><label style={lbl}>Hypothesis</label><textarea style={{...inp,minHeight:70,resize:'vertical'}} value={form.hypothesis} onChange={e=>setForm(f=>({...f,hypothesis:e.target.value}))} placeholder='e.g. "We believe that agrodealers will pay UGX 50,000 per session because..."'/></div>
          <div style={{display:'flex',gap:'0.6rem',marginTop:'0.75rem'}}>
            <button style={solidBtn()} onClick={()=>{onAdd({...form,id:`hyp_${Date.now()}`});setAdding(false)}}>Save</button>
            <button style={addBtn(true,C.slate)} onClick={()=>setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'1.01rem',marginBottom:'1rem'}}>
        <thead><tr style={{background:'var(--cv-header)',color:'var(--cv-on-accent)'}}>{['Ref','DP','Hypothesis','Evidence For','Evidence Against','Status','Decision'].map(h=><th key={h} style={{padding:'8px 10px',textAlign:'left',fontWeight:600}}>{h}</th>)}</tr></thead>
        <tbody>{hypotheses.length===0?<tr><td colSpan={7} style={{padding:'2rem',textAlign:'center',color:C.slate}}>No hypotheses recorded.</td></tr>:hypotheses.map((h,i)=>(
          <tr key={h.id} style={{background:i%2===0?C.cream:C.white,verticalAlign:'top'}}>
            <td style={{padding:'8px 10px',fontFamily:'monospace',fontWeight:700,color:C.cyan,whiteSpace:'nowrap'}}>{h.reference}</td>
            <td style={{padding:'8px 10px',fontFamily:'monospace',fontSize:'1.01rem'}}>{h.dp_id}</td>
            <td style={{padding:'8px 10px',maxWidth:200}}><input style={{...inp,background:'transparent',border:'none',padding:0}} value={h.hypothesis||''} onChange={e=>onUpdate(h.id,{hypothesis:e.target.value})}/></td>
            <td style={{padding:'8px 10px',maxWidth:150}}><input style={{...inp,background:'transparent',border:'none',padding:0}} value={h.evidence_for||''} onChange={e=>onUpdate(h.id,{evidence_for:e.target.value})} placeholder="Add..."/></td>
            <td style={{padding:'8px 10px',maxWidth:150}}><input style={{...inp,background:'transparent',border:'none',padding:0}} value={h.evidence_against||''} onChange={e=>onUpdate(h.id,{evidence_against:e.target.value})} placeholder="Add..."/></td>
            <td style={{padding:'8px 10px'}}><select style={{...inp,width:'auto'}} value={h.status} onChange={e=>onUpdate(h.id,{status:e.target.value})}><option value="holding">Holding</option><option value="confirmed">Confirmed</option><option value="rejected">Rejected</option></select></td>
            <td style={{padding:'8px 10px',maxWidth:150}}><input style={{...inp,background:'transparent',border:'none',padding:0}} value={h.decision_made||''} onChange={e=>onUpdate(h.id,{decision_made:e.target.value})} placeholder="Add..."/></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function TabPilotObservation({client,pilots,onAdd,onUpdate}){
  const [adding,setAdding]=useState(false)
  const [iteration,setIteration]=useState(1)
  const [form,setForm]=useState({date:new Date().toISOString().split('T')[0],client_name:'',service_delivered:'',went_well:'',did_not_work:'',client_feedback:'',adjustments_made:'',evidence_ref:''})
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'1rem'}}><h3 style={secH}>Tab 25 \u2014 Pilot Observation</h3><div style={{display:'flex',gap:'0.5rem'}}><button style={addBtn()} onClick={()=>setAdding(!adding)}>+ Record Observation</button><button style={addBtn(true)} onClick={()=>window.print()}>Print</button></div></div>
      <div style={{...card,background:C.cream,fontSize:'1.07rem',color:C.slate,lineHeight:1.7}}>One form per pilot delivery. Completed by the lead consultant during or immediately after the visit.</div>
      {adding&&(
        <div style={{...card,border:`1px solid ${C.cyan}`}}>
          <div style={fGrid}>
            <div><label style={lbl}>Iteration</label><select style={inp} value={iteration} onChange={e=>setIteration(Number(e.target.value))}><option value={1}>Iteration 1</option><option value={2}>Iteration 2</option></select></div>
            <div><label style={lbl}>Date</label><input type="date" style={inp} value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
            <div><label style={lbl}>Pilot Client Name</label><input style={inp} value={form.client_name} onChange={e=>setForm(f=>({...f,client_name:e.target.value}))} placeholder="Organisation name"/></div>
            <div><label style={lbl}>Evidence reference</label><input style={inp} value={form.evidence_ref} onChange={e=>setForm(f=>({...f,evidence_ref:e.target.value}))} placeholder="e.g. E-012"/></div>
          </div>
          <div><label style={lbl}>Service delivered</label><textarea style={{...inp,minHeight:70,resize:'vertical'}} value={form.service_delivered} onChange={e=>setForm(f=>({...f,service_delivered:e.target.value}))} placeholder="Describe what was delivered in this session"/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem'}}>
            <div><label style={lbl}>What went well</label><textarea style={{...inp,minHeight:70,resize:'vertical'}} value={form.went_well} onChange={e=>setForm(f=>({...f,went_well:e.target.value}))} placeholder="Be specific. What worked and why?"/></div>
            <div><label style={lbl}>What did not work</label><textarea style={{...inp,minHeight:70,resize:'vertical'}} value={form.did_not_work} onChange={e=>setForm(f=>({...f,did_not_work:e.target.value}))} placeholder="Be honest. What needs to change?"/></div>
          </div>
          <div><label style={lbl}>Client feedback (verbatim)</label><textarea style={{...inp,minHeight:80,resize:'vertical'}} value={form.client_feedback} onChange={e=>setForm(f=>({...f,client_feedback:e.target.value}))} placeholder="What did the client say about the service in their own words?"/></div>
          <div><label style={lbl}>Adjustments for next iteration</label><textarea style={{...inp,minHeight:60,resize:'vertical'}} value={form.adjustments_made} onChange={e=>setForm(f=>({...f,adjustments_made:e.target.value}))} placeholder="What will change based on this delivery?"/></div>
          <div style={{display:'flex',gap:'0.6rem',marginTop:'0.75rem'}}>
            <button style={solidBtn()} onClick={()=>{onAdd({...form,iteration,id:`obs_${Date.now()}`});setAdding(false)}}>Save Observation</button>
            <button style={addBtn(true,C.slate)} onClick={()=>setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
      {pilots.map(p=>(
        <div key={p.id} style={{...card,borderLeft:`4px solid ${p.iteration===1?C.cyan:C.teal}`}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.5rem'}}><Badge text={`Iteration ${p.iteration}`} color={p.iteration===1?C.cyan:C.teal}/><span style={{fontSize:'1.01rem',color:C.slate}}>{p.date}</span></div>
          <p style={{fontWeight:600,color:C.navy,margin:'0 0 0.5rem'}}>{p.client_name}</p>
          <p style={{fontSize:'1.07rem',color:C.slate,margin:'0 0 0.75rem'}}>{p.service_delivered}</p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem',marginBottom:'0.75rem'}}>
            <div style={{background:'var(--cv-tint-green)',borderRadius:5,padding:'0.75rem'}}><p style={{fontWeight:600,color:C.green,margin:'0 0 0.4rem',fontSize:'1.01rem'}}>Went well</p><p style={{margin:0,fontSize:'1.07rem',color:C.navy}}>{p.went_well}</p></div>
            <div style={{background:'var(--cv-tint-red)',borderRadius:5,padding:'0.75rem'}}><p style={{fontWeight:600,color:C.red,margin:'0 0 0.4rem',fontSize:'1.01rem'}}>Did not work</p><p style={{margin:0,fontSize:'1.07rem',color:C.navy}}>{p.did_not_work}</p></div>
          </div>
          {p.client_feedback&&<div style={{background:'var(--cv-tint-cyan)',borderRadius:5,padding:'0.75rem',marginBottom:'0.5rem',borderLeft:`3px solid ${C.cyan}`}}><p style={{fontWeight:600,fontSize:'1.01rem',color:C.cyan,margin:'0 0 0.4rem'}}>Client feedback:</p><p style={{margin:0,fontSize:'1.07rem',color:C.navy,fontStyle:'italic'}}>{p.client_feedback}</p></div>}
          {p.adjustments_made&&<p style={{fontSize:'1.07rem',color:C.amber,margin:0}}><strong>Adjustments for next iteration:</strong> {p.adjustments_made}</p>}
        </div>
      ))}
    </div>
  )
}

// \u2500\u2500\u2500 FORM COMPONENTS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Shared by NewClientForm and EditClientForm so the two can never drift --
// a client's programme was previously hardcoded to 'prog_csj' with no way to
// change it (every new client silently landed on Climate Smart Jobs, no
// matter what the coach actually meant). This is the real fix: the coach
// explicitly picks a real programme, or "No programme (independent)".
function ClientSetupFields({f,setF,programmes,showStatus}){
  return(
    <div style={fGrid}>
      <div><label style={lbl}>Name *</label><input style={inp} value={f.name} onChange={e=>setF(x=>({...x,name:e.target.value}))}/></div>
      <div><label style={lbl}>Type *</label><select style={inp} value={f.type} onChange={e=>setF(x=>({...x,type:e.target.value}))}><option value="crop_aggregator">Crop Aggregator</option><option value="livestock_aggregator">Livestock Aggregator</option><option value="farmer_group_enterprise">Farmer Group Enterprise</option><option value="service_lsp">Service LSP</option></select></div>
      <div><label style={lbl}>Engagement Mode *</label><select style={inp} value={f.engagement_mode} onChange={e=>setF(x=>({...x,engagement_mode:e.target.value}))}><option value="canvas">Full GtCV Canvas</option><option value="financial">Clearview Financial Only</option></select></div>
      <div><label style={lbl}>Programme</label><select style={inp} value={f.programme_id||''} onChange={e=>setF(x=>({...x,programme_id:e.target.value||null}))}><option value="">No programme (independent · self-paying)</option>{programmes.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div><label style={lbl}>Country</label><input style={inp} value={f.country} onChange={e=>setF(x=>({...x,country:e.target.value}))}/></div>
      <div><label style={lbl}>Sector</label><input style={inp} value={f.sector} onChange={e=>setF(x=>({...x,sector:e.target.value}))}/></div>
      <div><label style={lbl}>CEO Name</label><input style={inp} value={f.contact_name} onChange={e=>setF(x=>({...x,contact_name:e.target.value}))}/></div>
      <div><label style={lbl}>CEO Email</label><input type="email" style={inp} value={f.contact_email} onChange={e=>setF(x=>({...x,contact_email:e.target.value}))}/></div>
      {/* Only the canvas client's Cover tab exposed this before -- financial-only
          clients had no way to ever be marked complete/paused, so "active"
          counts (header, Client Health) could never change for them. */}
      {showStatus&&<div><label style={lbl}>Status</label><select style={inp} value={f.status||'setup'} onChange={e=>setF(x=>({...x,status:e.target.value}))}>{['setup','phase_0','dp01','dp02','dp03','dp04','dp05','dp06','dp07','dp08','dp09','complete','paused'].map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select></div>}
    </div>
  )
}

function NewClientForm({onSave,onCancel,programmes}){
  const [f,setF]=useState({name:'',type:'service_lsp',engagement_mode:'canvas',programme_id:null,country:'Uganda',sector:'',contact_name:'',contact_email:'',contact_phone:'',notes:''})
  function doSave(){
    if(!f.name)return
    const slug=f.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')
    onSave({...f,id:`client_${Date.now()}`,slug,status:'setup',clearview_active:false,ceo_invited:false,ceo_invited_at:null,start_date:new Date().toISOString().split('T')[0],expected_close:null})
  }
  return(
    <div style={{...card,border:`1px solid ${C.cyan}`,marginBottom:'1.25rem'}}>
      <div style={secH}>New Client Organisation</div>
      <ClientSetupFields f={f} setF={setF} programmes={programmes}/>
      <div style={{display:'flex',gap:'0.6rem',marginTop:'0.85rem'}}>
        <button style={solidBtn()} onClick={doSave}>Create Client</button>
        <button style={{...addBtn(),borderColor:C.border,color:C.slate}} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// The real fix for "client setup cannot be edited anywhere" -- no such form
// existed before. Edits the actual engagement_clients row (name, type,
// engagement_mode, programme_id, country, sector, CEO contact); canvas
// progress, actuals, and everything else are untouched.
function EditClientForm({client,programmes,onSave,onCancel}){
  const [f,setF]=useState({
    name:client.name||'',type:client.type||'service_lsp',engagement_mode:client.engagement_mode||'canvas',
    programme_id:client.programme_id||null,country:client.country||'',sector:client.sector||'',
    contact_name:client.contact_name||'',contact_email:client.contact_email||'',status:client.status||'setup',
  })
  const [saving,setSaving]=useState(false)
  const [msg,setMsg]=useState(null)
  async function doSave(){
    if(!f.name)return setMsg('Name is required.')
    setSaving(true)
    const {error}=await supabase.from('engagement_clients').update({...f,updated_at:new Date().toISOString()}).eq('id',client.id)
    setSaving(false)
    if(error)return setMsg('Could not save: '+error.message)
    onSave(f)
  }
  return(
    <div style={{...card,border:`1px solid ${C.cyan}`,marginBottom:'1.25rem'}}>
      <div style={secH}>Edit Client Organisation</div>
      <ClientSetupFields f={f} setF={setF} programmes={programmes} showStatus/>
      {msg&&<div style={{...hint,color:C.red,marginTop:'0.6rem'}}>{msg}</div>}
      <div style={{display:'flex',gap:'0.6rem',marginTop:'0.85rem'}}>
        <button style={solidBtn()} disabled={saving} onClick={doSave}>{saving?'Saving…':'Save changes'}</button>
        <button style={{...addBtn(),borderColor:C.border,color:C.slate}} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

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

function NewCIForm({clients,onSave,onCancel}){
  const [f,setF]=useState({name:'',email:'',phone:'',country:'Uganda',specialisation:'',rate_per_day:0,currency:'USD',active:true,programme_ids:[],client_ids:[],notes:''})
  return(
    <div style={{...card,border:`1px solid ${C.cyan}`,marginBottom:'1.25rem'}}>
      <div style={secH}>Add Co-Implementer</div>
      <div style={fGrid}>
        <div><label style={lbl}>Name *</label><input style={inp} value={f.name} onChange={e=>setF(x=>({...x,name:e.target.value}))}/></div>
        <div><label style={lbl}>Email *</label><input type="email" style={inp} value={f.email} onChange={e=>setF(x=>({...x,email:e.target.value}))}/></div>
        <div><label style={lbl}>Phone</label><input style={inp} value={f.phone} onChange={e=>setF(x=>({...x,phone:e.target.value}))}/></div>
        <div><label style={lbl}>Country</label><input style={inp} value={f.country} onChange={e=>setF(x=>({...x,country:e.target.value}))}/></div>
        <div><label style={lbl}>Specialisation</label><input style={inp} value={f.specialisation} onChange={e=>setF(x=>({...x,specialisation:e.target.value}))}/></div>
        <div><label style={lbl}>Daily Rate</label><input type="number" style={inp} value={f.rate_per_day||''} onChange={e=>setF(x=>({...x,rate_per_day:Number(e.target.value)}))}/></div>
        <div><label style={lbl}>Currency</label><select style={inp} value={f.currency} onChange={e=>setF(x=>({...x,currency:e.target.value}))}><option>USD</option><option>GBP</option><option>EUR</option><option>UGX</option></select></div>
        <div style={{gridColumn:'1/-1'}}><label style={lbl}>Assign to Clients</label><div style={{display:'flex',gap:'0.35rem',flexWrap:'wrap',marginTop:'0.3rem'}}>{clients.map(c=><label key={c.id} style={{display:'flex',alignItems:'center',gap:'0.4rem',fontSize:'1.01rem',cursor:'pointer',padding:'0.3rem 0.5rem',border:`1px solid ${f.client_ids.includes(c.id)?C.cyan:C.border}`,borderRadius:4,background:f.client_ids.includes(c.id)?'var(--cv-tint-actual)':C.white}}><input type="checkbox" checked={f.client_ids.includes(c.id)} onChange={e=>setF(x=>({...x,client_ids:e.target.checked?[...x.client_ids,c.id]:x.client_ids.filter(id=>id!==c.id)}))}/>{c.name}</label>)}</div></div>
      </div>
      <div style={{display:'flex',gap:'0.6rem',marginTop:'0.85rem'}}>
        <button style={solidBtn()} onClick={()=>{if(!f.name||!f.email)return;onSave({...f,id:`ci_${Date.now()}`})}}>Add Co-Implementer</button>
        <button style={{...addBtn(),borderColor:C.border,color:C.slate}} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

