// @ts-nocheck
'use client'
// ============================================================
// TEAM & PAYMENTS — the coach's online co-implementer loop.
//
// Implements the loop described in docs/gtcv/README.md against the
// tables in supabase/migrations/2026_07_11_coach_payments_deals_fees.sql:
//   * co_implementers.day_rate / rate_currency  (day rate per person)
//   * coach_timesheet_entries  (hours per task; days = hours / 8)
//   * coach_expenses           (reclaims, with receipts)
//   * coach_advances           (advances, reconciled against spend)
//   * coach_invoices           (auto-drafted per CI per period)
//
// Locked business rules (README):
//   * a day = 8 hours; days = hours / 8
//   * day rate is set per co-implementer
//   * an unreconciled advance BLOCKS the next invoice from issuing
//
// This component is fully self-contained and additive: it is mounted
// as a new "Team & Payments" tab and does not touch any existing view,
// the legacy `timesheets` table, or the co-implementer roster logic.
// ============================================================
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const HOURS_PER_DAY = 8

// ─── design tokens (mirror CoachDashboard) ───────────────────
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
const fGrid= {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'0.8rem'}
const th   = {padding:'0.4rem 0.6rem',textAlign:'left',fontWeight:600,color:C.navy,borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'}
const td   = {padding:'0.4rem 0.6rem',verticalAlign:'top'}
function addBtn(sm=false,col=C.cyan){return{fontFamily:'monospace',fontSize:sm?'0.91rem':'0.95rem',padding:sm?'0.28rem 0.6rem':'0.38rem 0.8rem',border:`1px solid ${col}`,borderRadius:6,background:'transparent',color:col,cursor:'pointer'}}
function solidBtn(col=C.cyan,sm=false){return{fontFamily:'monospace',fontSize:sm?'0.95rem':'1.01rem',fontWeight:600,padding:sm?'0.35rem 0.8rem':'0.5rem 1.1rem',border:'none',borderRadius:6,background:col,color:'var(--cv-on-accent)',cursor:'pointer'}}
function subPill(active,col=C.cyan){return{fontFamily:'monospace',fontSize:'0.93rem',padding:'0.4rem 0.8rem',borderRadius:8,border:`1px solid ${active?col:C.border}`,background:active?col:C.white,color:active?'var(--cv-on-cyan)':C.slate,cursor:'pointer',fontWeight:active?700:400,whiteSpace:'nowrap'}}
function Badge({text,color}){return<span style={{fontFamily:'monospace',fontSize:'0.93rem',padding:'0.1rem 0.42rem',borderRadius:4,background:color||C.slate,color:'var(--cv-on-accent)',display:'inline-block'}}>{text}</span>}
function KPI({label,value,sub,color}){const accent=color||C.cyan;return(<div style={{background:C.white,borderRadius:14,padding:'0.95rem 1.1rem',borderTop:`3px solid ${accent}`,boxShadow:'0 1px 2px var(--cv-shadow-1), 0 12px 32px var(--cv-shadow-2)'}}><div style={{fontFamily:'monospace',fontSize:'1.13rem',letterSpacing:'0.1em',color:C.slate,textTransform:'uppercase',marginBottom:'0.35rem'}}>{label}</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.5rem',fontWeight:700,color:color||C.navy,lineHeight:1.05}}>{value}</div>{sub&&<div style={{fontSize:'1.07rem',color:C.slate,marginTop:'0.2rem'}}>{sub}</div>}</div>)}

// ─── helpers ─────────────────────────────────────────────────
const num = (v)=>{const n=Number(v);return Number.isFinite(n)?n:0}
const rateOf = (ci)=>num(ci?.day_rate ?? ci?.rate_per_day)          // new col, fall back to legacy
const curOf  = (ci)=> ci?.rate_currency || ci?.currency || 'USD'
const daysFromHours = (h)=> num(h)/HOURS_PER_DAY
const fmtMoney = (n,cur)=>`${cur||'USD'} ${num(n).toLocaleString(undefined,{maximumFractionDigits:2})}`
const fmtDays = (d)=> num(d).toLocaleString(undefined,{maximumFractionDigits:2})
const today = ()=> new Date().toISOString().split('T')[0]
function addDays(iso,days){const d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+days);return d.toISOString().split('T')[0]}
// Invoicing period label like 2026-07 (monthly). Timesheet/expense entries
// keep their own real entry_date (still logged daily) -- this is only the
// period they're grouped and invoiced under.
function periodForDate(iso){
  const d=new Date(iso+'T00:00:00');const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0')
  return `${y}-${m}`
}
function currentPeriod(){return periodForDate(today())}
function periodLabel(p){
  const [y,m]=p.split('-')
  return new Date(Number(y),Number(m)-1,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'})
}
// last N monthly periods, newest first
function recentPeriods(n=12){
  const out=[];const d=new Date()
  for(let i=0;i<n;i++){out.push(periodForDate(d.toISOString().split('T')[0]));d.setMonth(d.getMonth()-1)}
  return Array.from(new Set(out))
}
const EXPENSE_CATEGORIES=['travel','accommodation','comms','materials','other']

// Real file upload to a private Supabase Storage bucket (coach-receipts),
// not a pasted URL. Objects live under '{co_implementer_id}/...' so the
// RLS policy in 2026_07_13_coimplementer_self_service_pay.sql can scope a
// co-implementer to only their own folder. The bucket is private, so
// viewing a receipt always goes through a short-lived signed URL --
// never a permanent public link -- generated fresh on each click.
// Last 6 months' portfolio totals -- what was actually issued, not a
// recomputed draft (drafts are only meaningful for the current open
// period; past periods should show what really went out).
function PeriodTrend({invoices,entries}){
  const periods=recentPeriods(6).slice().reverse()
  return(
    <div style={card}>
      <div style={{...secH,fontSize:'1.16rem'}}>Monthly trend</div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'1.01rem'}}>
          <thead><tr style={{background:C.lightBg}}>{['Month','Approved days','Invoices issued','Net invoiced'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {periods.map(p=>{
              const days=entries.filter(e=>e.period===p&&e.status==='approved').reduce((s,e)=>s+daysFromHours(e.hours),0)
              const periodInvoices=invoices.filter(i=>i.period===p&&i.status!=='draft')
              const netByCurrency={}
              periodInvoices.forEach(i=>{netByCurrency[i.currency||'USD']=(netByCurrency[i.currency||'USD']||0)+num(i.net_amount)})
              const netStr=Object.entries(netByCurrency).map(([cur,amt])=>fmtMoney(amt,cur)).join(', ')||'—'
              return(<tr key={p}>
                <td style={td}>{periodLabel(p)}</td>
                <td style={td}>{fmtDays(days)}</td>
                <td style={td}>{periodInvoices.length}</td>
                <td style={td}>{netStr}</td>
              </tr>)
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ReceiptUpload({coImplementerId,path,onUploaded}){
  const [busy,setBusy]=useState(false)
  const [err,setErr]=useState(null)
  async function handleFile(e){
    const file=e.target.files?.[0]
    if(!file)return
    setBusy(true);setErr(null)
    const objectPath=`${coImplementerId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`
    const {error}=await supabase.storage.from('coach-receipts').upload(objectPath,file)
    setBusy(false)
    if(error)return setErr(error.message)
    onUploaded(objectPath)
  }
  async function view(){
    const {data,error}=await supabase.storage.from('coach-receipts').createSignedUrl(path,3600)
    if(!error&&data?.signedUrl)window.open(data.signedUrl,'_blank')
    else setErr(error?.message||'Could not open receipt.')
  }
  return(
    <div style={{display:'flex',alignItems:'center',gap:'0.4rem',flexWrap:'wrap'}}>
      {path&&<button type="button" style={addBtn(true,C.teal)} onClick={view}>View</button>}
      <label style={{...addBtn(true,path?C.slate:C.cyan),cursor:'pointer',margin:0}}>
        {busy?'Uploading…':path?'Replace':'+ Upload'}
        <input type="file" accept="image/*,.pdf" style={{display:'none'}} onChange={handleFile} disabled={busy}/>
      </label>
      {err&&<span style={{fontSize:'0.93rem',color:C.red}}>{err}</span>}
    </div>
  )
}

// ─── ACCESS — real client_ids assignment, no invented access level ────
// Per-client permission GRADES (Edit/View/Full) and a red/amber health flag
// were checked against the schema before building this: neither exists
// anywhere (co_implementers only has a flat client_ids array, and there is
// no structured flag field on any table). Showing a working-looking dropdown
// or badge with nothing behind it would be worse than not having it, so
// this shows only what's real: the actual assignment, addable and
// removable, writing straight to co_implementers.client_ids.
function AccessSection({coImplementers,setCoImplementers,clients,setMsg}){
  const [addingFor,setAddingFor]=useState(null)
  async function assign(ci,clientId){
    if(!clientId||(ci.client_ids||[]).includes(clientId))return
    const next=[...(ci.client_ids||[]),clientId]
    const {error}=await supabase.from('co_implementers').update({client_ids:next}).eq('id',ci.id)
    if(error)return setMsg('Could not assign client: '+error.message)
    setCoImplementers&&setCoImplementers(prev=>prev.map(x=>x.id!==ci.id?x:{...x,client_ids:next}))
    setAddingFor(null)
  }
  async function unassign(ci,clientId){
    const next=(ci.client_ids||[]).filter(id=>id!==clientId)
    const {error}=await supabase.from('co_implementers').update({client_ids:next}).eq('id',ci.id)
    if(error)return setMsg('Could not remove client: '+error.message)
    setCoImplementers&&setCoImplementers(prev=>prev.map(x=>x.id!==ci.id?x:{...x,client_ids:next}))
  }
  return(
    <div style={card}>
      <div style={secH}>Co-implementers &amp; client access</div>
      <p style={{...hint,marginBottom:'1rem'}}>Each co-implementer's assigned clients. Access today is binary -- assigned or not -- there is no permission grade (Edit/View/Full) stored anywhere yet, so none is shown here.</p>
      {coImplementers.length===0
        ? <div style={{color:C.slate,textAlign:'center',padding:'1.5rem'}}>No co-implementers yet. Add them in the Team tab.</div>
        : coImplementers.map(ci=>{
          const assigned=(ci.client_ids||[]).map(id=>clients.find(c=>c.id===id)).filter(Boolean)
          const available=clients.filter(c=>!(ci.client_ids||[]).includes(c.id))
          return(
            <div key={ci.id} style={{display:'grid',gridTemplateColumns:'220px 1fr',gap:'1rem',padding:'0.9rem 0',borderTop:`1px solid ${C.border}`}}>
              <div>
                <div style={{fontWeight:700,fontSize:'1.16rem',color:C.navy}}>{ci.name}</div>
                <div style={{fontSize:'1.01rem',color:C.slate}}>{ci.country||'Co-implementer'}</div>
                {rateOf(ci)>0&&<div style={{fontFamily:'monospace',fontSize:'0.99rem',color:C.teal,marginTop:'0.2rem',fontWeight:700}}>{fmtMoney(rateOf(ci),curOf(ci))}/day</div>}
              </div>
              <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
                {assigned.length===0&&<div style={{padding:'0.5rem 0.8rem',fontSize:'1.07rem',color:C.slate}}>No clients assigned</div>}
                {assigned.map(c=>(
                  <div key={c.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.45rem 0.8rem',borderTop:`1px solid ${C.border}`,fontSize:'1.11rem'}}>
                    <span>{c.name}</span>
                    <span style={{color:C.slate,cursor:'pointer',fontWeight:700}} onClick={()=>unassign(ci,c.id)} title="Remove access">×</span>
                  </div>
                ))}
                <div style={{padding:'0.5rem 0.8rem',borderTop:`1px solid ${C.border}`}}>
                  {addingFor===ci.id?(
                    <select style={{...inp,width:'auto'}} autoFocus value="" onChange={e=>assign(ci,e.target.value)} onBlur={()=>setAddingFor(null)}>
                      <option value="">Select a client…</option>
                      {available.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ):(
                    <button style={addBtn(true)} onClick={()=>setAddingFor(ci.id)} disabled={available.length===0}>{available.length===0?'All clients assigned':'+ Assign client'}</button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
    </div>
  )
}

export default function TeamPayments({coImplementers=[],setCoImplementers,clients=[],userName='Coach',canApprove=true}){
  const [entries,setEntries]=useState([])
  const [expenses,setExpenses]=useState([])
  const [advances,setAdvances]=useState([])
  const [invoices,setInvoices]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState(null)
  const [period,setPeriod]=useState(currentPeriod())
  const [accessMsg,setAccessMsg]=useState(null)
  const clientName=useCallback((id)=>clients.find(c=>c.id===id)?.name||(id?String(id):'—'),[clients])

  useEffect(()=>{
    let alive=true
    async function load(){
      try{
        const [ts,ex,ad,iv]=await Promise.all([
          supabase.from('coach_timesheet_entries').select('*').order('entry_date',{ascending:false}),
          supabase.from('coach_expenses').select('*').order('expense_date',{ascending:false}),
          supabase.from('coach_advances').select('*').order('advance_date',{ascending:false}),
          supabase.from('coach_invoices').select('*').order('created_at',{ascending:false}),
        ])
        const firstErr=[ts,ex,ad,iv].find(r=>r.error)?.error
        if(firstErr)throw firstErr
        if(!alive)return
        setEntries(ts.data||[]);setExpenses(ex.data||[]);setAdvances(ad.data||[]);setInvoices(iv.data||[])
      }catch(e){ if(alive)setError(e.message||String(e)) }
      finally{ if(alive)setLoading(false) }
    }
    load()
    return ()=>{alive=false}
  },[])

  // ── portfolio-level derived numbers for the selected period ──
  const periodEntries=entries.filter(e=>e.period===period)
  const approvedDaysAll=periodEntries.filter(e=>e.status==='approved').reduce((s,e)=>s+daysFromHours(e.hours),0)
  const openAdvancesAll=advances.filter(a=>!a.reconciled)
  const draftNetAll=coImplementers.reduce((s,ci)=>s+Math.max(0,computeDraft(ci,period,entries,expenses,advances).net),0)
  const issuedThisPeriod=invoices.filter(i=>i.period===period&&i.status!=='draft')

  if(loading)return<div style={{padding:'2.5rem',color:C.slate}}>Loading Team &amp; Payments…</div>
  if(error)return(
    <div style={{...card,border:`1px solid ${C.amber}`,background:'var(--cv-tint-amber)'}}>
      <div style={secH}>Team &amp; Payments could not load</div>
      <p style={{...hint,marginBottom:'0.6rem'}}>{error}</p>
      <p style={hint}>If this is a fresh environment, the payments tables may not be applied yet. Apply <code>supabase/migrations/2026_07_11_coach_payments_deals_fees.sql</code> in the Supabase SQL editor, then reload.</p>
    </div>
  )

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.75rem',marginBottom:'1rem'}}>
        <div style={secH}>Team &amp; Payments</div>
        <div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
          <label style={{...lbl,marginBottom:0}}>Period</label>
          <select style={{...inp,width:'auto'}} value={period} onChange={e=>setPeriod(e.target.value)}>
            {Array.from(new Set([period,...recentPeriods(12)])).map(p=><option key={p} value={p}>{periodLabel(p)}</option>)}
          </select>
        </div>
      </div>
      <p style={{...hint,marginBottom:'1rem'}}>Co-implementers are paid by the day but log hours per task. The platform rolls hours into days ({HOURS_PER_DAY}h = 1 day) at the person's day rate, adds approved expenses, nets off any advance taken, and auto-drafts one invoice per co-implementer per period. An unreconciled advance blocks the next invoice from issuing.</p>

      {canApprove&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'0.85rem',marginBottom:'1.25rem'}}>
        <KPI label="Approved days" value={fmtDays(approvedDaysAll)} sub={periodLabel(period)}/>
        <KPI label="Draft invoices (net)" value={draftNetAll?fmtMoney(draftNetAll,curOf(coImplementers[0])):'—'} sub="across team, this period" color={C.teal}/>
        <KPI label="Open advances" value={openAdvancesAll.length} sub={openAdvancesAll.length?'blocking invoices':'none outstanding'} color={openAdvancesAll.length?C.amber:C.green}/>
        <KPI label="Invoices issued" value={issuedThisPeriod.length} sub={periodLabel(period)} color={C.purple}/>
      </div>}

      {canApprove&&<PeriodTrend invoices={invoices} entries={entries}/>}

      {canApprove&&accessMsg&&<div style={{fontSize:'1.01rem',color:C.slate,marginBottom:'0.6rem'}}>{accessMsg}</div>}
      {canApprove&&<AccessSection coImplementers={coImplementers} setCoImplementers={setCoImplementers} clients={clients} setMsg={setAccessMsg}/>}

      {coImplementers.length===0
        ? <div style={{...card,color:C.slate,textAlign:'center',padding:'2.5rem'}}>{canApprove?'No co-implementers yet. Add them in the Team tab, then set a day rate here.':'Your co-implementer profile could not be found. Contact your coach.'}</div>
        : coImplementers.map(ci=>(
            <CoImplementerPayments
              key={ci.id} ci={ci} period={period} userName={userName} clientName={clientName} clients={clients} canApprove={canApprove}
              entries={entries} setEntries={setEntries}
              expenses={expenses} setExpenses={setExpenses}
              advances={advances} setAdvances={setAdvances}
              invoices={invoices} setInvoices={setInvoices}
            />
          ))}
    </div>
  )
}

// Pure draft calculator — shared by the summary KPI and the card.
function computeDraft(ci,period,entries,expenses,advances){
  const eEntries=entries.filter(e=>e.co_implementer_id===ci.id&&e.period===period)
  const approvedHours=eEntries.filter(e=>e.status==='approved').reduce((s,e)=>s+num(e.hours),0)
  const days=approvedHours/HOURS_PER_DAY
  const rate=rateOf(ci)
  const timeAmount=days*rate
  const expApproved=expenses.filter(x=>x.co_implementer_id===ci.id&&x.period===period&&x.status==='approved').reduce((s,x)=>s+num(x.amount),0)
  const openAdvances=advances.filter(a=>a.co_implementer_id===ci.id&&!a.reconciled)
  const openAdvanceTotal=openAdvances.reduce((s,a)=>s+num(a.amount),0)
  const gross=timeAmount+expApproved
  const advanceApplied=openAdvanceTotal
  const net=gross-advanceApplied
  // Locked rule: an unreconciled advance blocks issuing. Issuing an
  // invoice large enough to net it off IS how it clears. So issuing is
  // blocked only when the open advance exceeds this period's earnings
  // (net < 0 → the CI still owes and the advance can't be cleared here).
  const blocked=openAdvanceTotal>0&&net<0
  return {approvedHours,days,rate,timeAmount,expApproved,openAdvances,openAdvanceTotal,gross,advanceApplied,net,blocked}
}

function CoImplementerPayments({ci,period,userName,clientName,clients,entries,setEntries,expenses,setExpenses,advances,setAdvances,invoices,setInvoices,canApprove}){
  const [tab,setTab]=useState('timesheets')
  const [savingRate,setSavingRate]=useState(false)
  const [rateDraft,setRateDraft]=useState(String(rateOf(ci)||''))
  const [curDraft,setCurDraft]=useState(curOf(ci))
  const [busy,setBusy]=useState(false)
  const [msg,setMsg]=useState(null)

  const assignedClients=clients.filter(c=>(ci.client_ids||[]).includes(c.id))
  const d=computeDraft(ci,period,entries,expenses,advances)
  const ciInvoices=invoices.filter(i=>i.co_implementer_id===ci.id).sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''))
  const alreadyIssued=ciInvoices.find(i=>i.period===period&&i.status!=='draft')

  async function saveRate(){
    setSavingRate(true)
    const patch={day_rate:num(rateDraft),rate_currency:curDraft}
    const {error}=await supabase.from('co_implementers').update(patch).eq('id',ci.id)
    setSavingRate(false)
    if(error){setMsg('Could not save rate: '+error.message);return}
    // reflect locally so the draft recomputes (ci is a prop; mutate view only)
    ci.day_rate=patch.day_rate;ci.rate_currency=patch.rate_currency
    setMsg('Day rate saved.')
  }

  return(
    <div style={card}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'1rem',flexWrap:'wrap',marginBottom:'0.75rem'}}>
        <div>
          <div style={{fontWeight:700,fontSize:'1.16rem',color:C.navy}}>{ci.name}</div>
          <div style={{fontSize:'1.01rem',color:C.slate}}>{ci.email}{ci.country?` · ${ci.country}`:''}{ci.specialisation?` · ${ci.specialisation}`:''}</div>
          <div style={{fontSize:'1.01rem',color:C.slate,marginTop:'0.2rem'}}>Clients: {assignedClients.length?assignedClients.map(c=>c.name).join(', '):'none assigned'}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontFamily:'monospace',fontSize:'0.93rem',color:d.rate>0?C.slate:C.amber,marginBottom:'0.3rem'}}>{d.rate>0?`${fmtMoney(d.rate,curOf(ci))}/day`:'no day rate set'}</div>
          {canApprove&&<div style={{display:'flex',gap:'0.35rem',alignItems:'center',justifyContent:'flex-end'}}>
            <input style={{...inp,width:90,padding:'0.28rem 0.45rem',fontSize:'1.01rem'}} type="number" value={rateDraft} placeholder="rate" onChange={e=>setRateDraft(e.target.value)}/>
            <select style={{...inp,width:70,padding:'0.28rem 0.35rem',fontSize:'1.01rem'}} value={curDraft} onChange={e=>setCurDraft(e.target.value)}>{['USD','GBP','EUR','UGX','NGN','KES'].map(x=><option key={x}>{x}</option>)}</select>
            <button style={addBtn(true)} disabled={savingRate} onClick={saveRate}>{savingRate?'…':'Set rate'}</button>
          </div>}
        </div>
      </div>

      {/* period draft strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:'0.6rem',padding:'0.7rem 0.85rem',background:C.lightBg,borderRadius:8,marginBottom:'0.85rem',fontSize:'1.01rem'}}>
        <div><div style={hint}>Approved days</div><strong>{fmtDays(d.days)}</strong> <span style={hint}>({d.approvedHours}h)</span></div>
        <div><div style={hint}>Time</div><strong>{fmtMoney(d.timeAmount,curOf(ci))}</strong></div>
        <div><div style={hint}>Expenses</div><strong>{fmtMoney(d.expApproved,curOf(ci))}</strong></div>
        <div><div style={hint}>Advance netted</div><strong style={{color:d.advanceApplied?C.amber:C.navy}}>−{fmtMoney(d.advanceApplied,curOf(ci))}</strong></div>
        <div><div style={hint}>Net invoice</div><strong style={{color:C.teal}}>{fmtMoney(d.net,curOf(ci))}</strong></div>
      </div>

      <div style={{display:'flex',gap:'0.4rem',flexWrap:'wrap',marginBottom:'0.85rem'}}>
        {[['timesheets','Timesheets'],['expenses','Expenses'],['advances',`Advances${d.openAdvances.length?` (${d.openAdvances.length})`:''}`],['invoice','Invoice']].map(([id,label])=>
          <button key={id} style={subPill(tab===id,id==='advances'&&d.openAdvances.length?C.amber:C.cyan)} onClick={()=>setTab(id)}>{label}</button>)}
      </div>

      {msg&&<div style={{fontSize:'1.01rem',color:C.slate,marginBottom:'0.6rem'}}>{msg}</div>}

      {tab==='timesheets'&&<TimesheetSection ci={ci} period={period} userName={userName} assignedClients={assignedClients} clientName={clientName} entries={entries} setEntries={setEntries} setMsg={setMsg} canApprove={canApprove}/>}
      {tab==='expenses'&&<ExpenseSection ci={ci} period={period} userName={userName} assignedClients={assignedClients} clientName={clientName} expenses={expenses} setExpenses={setExpenses} setMsg={setMsg} canApprove={canApprove}/>}
      {tab==='advances'&&<AdvanceSection ci={ci} advances={advances} setAdvances={setAdvances} setMsg={setMsg} canApprove={canApprove}/>}
      {tab==='invoice'&&<InvoiceSection ci={ci} period={period} draft={d} clientName={clientName} entries={entries} expenses={expenses} advances={advances} setAdvances={setAdvances} invoices={ciInvoices} setInvoices={setInvoices} alreadyIssued={alreadyIssued} busy={busy} setBusy={setBusy} setMsg={setMsg} canApprove={canApprove}/>}
    </div>
  )
}

// ─── TIMESHEETS ──────────────────────────────────────────────
function TimesheetSection({ci,period,userName,assignedClients,clientName,entries,setEntries,setMsg,canApprove}){
  const rows=entries.filter(e=>e.co_implementer_id===ci.id&&e.period===period)
  const [f,setF]=useState({entry_date:today(),client_id:assignedClients[0]?.id||'',task:'',hours:''})
  async function add(){
    if(!num(f.hours))return setMsg('Enter hours for the timesheet entry.')
    const row={co_implementer_id:ci.id,client_id:f.client_id||null,entry_date:f.entry_date,task:f.task,hours:num(f.hours),period,status:'submitted'}
    const {data,error}=await supabase.from('coach_timesheet_entries').insert([row]).select().single()
    if(error)return setMsg('Could not add entry: '+error.message)
    setEntries(prev=>[data,...prev]);setF(x=>({...x,task:'',hours:''}));setMsg(null)
  }
  async function setStatus(id,status){
    const patch=status==='approved'?{status,approved_by:userName,approved_at:new Date().toISOString()}:{status}
    const {error}=await supabase.from('coach_timesheet_entries').update(patch).eq('id',id)
    if(error)return setMsg('Could not update entry: '+error.message)
    setEntries(prev=>prev.map(e=>e.id!==id?e:{...e,...patch}))
  }
  return(
    <div>
      <div style={{overflowX:'auto',marginBottom:'0.75rem'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'1.01rem'}}>
          <thead><tr style={{background:C.lightBg}}>{['Date','Client','Task','Hours','Days','Status',canApprove?'':null].filter(h=>h!==null).map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.length===0&&<tr><td style={{...td,color:C.slate}} colSpan={7}>No timesheet entries for {periodLabel(period)}.</td></tr>}
            {rows.map((e,i)=><tr key={e.id} style={{background:i%2?C.white:C.cream}}>
              <td style={td}>{e.entry_date}</td>
              <td style={td}>{clientName(e.client_id)}</td>
              <td style={{...td,maxWidth:220}}>{e.task||'—'}</td>
              <td style={td}>{e.hours}</td>
              <td style={td}>{fmtDays(daysFromHours(e.hours))}</td>
              <td style={td}><Badge text={e.status} color={e.status==='approved'?C.green:e.status==='submitted'?C.amber:C.slate}/></td>
              {canApprove&&<td style={td}>{e.status!=='approved'&&<button style={solidBtn(C.green,true)} onClick={()=>setStatus(e.id,'approved')}>Approve</button>}{e.status==='approved'&&<button style={addBtn(true,C.slate)} onClick={()=>setStatus(e.id,'submitted')}>Unapprove</button>}</td>}
            </tr>)}
          </tbody>
        </table>
      </div>
      <div style={{...fGrid,alignItems:'end'}}>
        <div><label style={lbl}>Date</label><input type="date" style={inp} value={f.entry_date} onChange={e=>setF(x=>({...x,entry_date:e.target.value}))}/></div>
        <div><label style={lbl}>Client</label><select style={inp} value={f.client_id} onChange={e=>setF(x=>({...x,client_id:e.target.value}))}><option value="">—</option>{assignedClients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div style={{gridColumn:'span 2'}}><label style={lbl}>Task</label><input style={inp} value={f.task} placeholder="What was worked on" onChange={e=>setF(x=>({...x,task:e.target.value}))}/></div>
        <div><label style={lbl}>Hours</label><input type="number" step="0.5" style={inp} value={f.hours} onChange={e=>setF(x=>({...x,hours:e.target.value}))}/></div>
        <div><button style={solidBtn()} onClick={add}>+ Log hours</button></div>
      </div>
    </div>
  )
}

// ─── EXPENSES ────────────────────────────────────────────────
function ExpenseSection({ci,period,userName,assignedClients,clientName,expenses,setExpenses,setMsg,canApprove}){
  const rows=expenses.filter(x=>x.co_implementer_id===ci.id&&x.period===period)
  const [f,setF]=useState({expense_date:today(),client_id:assignedClients[0]?.id||'',description:'',category:'travel',amount:'',currency:curOf(ci),receipt_url:''})
  async function add(){
    if(!num(f.amount))return setMsg('Enter an expense amount.')
    const row={co_implementer_id:ci.id,client_id:f.client_id||null,expense_date:f.expense_date,description:f.description,category:f.category,amount:num(f.amount),currency:f.currency,receipt_url:f.receipt_url||null,period,status:'submitted'}
    const {data,error}=await supabase.from('coach_expenses').insert([row]).select().single()
    if(error)return setMsg('Could not add expense: '+error.message)
    setExpenses(prev=>[data,...prev]);setF(x=>({...x,description:'',amount:'',receipt_url:''}));setMsg(null)
  }
  async function setStatus(id,status){
    const patch=status==='approved'?{status,approved_by:userName,approved_at:new Date().toISOString()}:{status}
    const {error}=await supabase.from('coach_expenses').update(patch).eq('id',id)
    if(error)return setMsg('Could not update expense: '+error.message)
    setExpenses(prev=>prev.map(x=>x.id!==id?x:{...x,...patch}))
  }
  async function attachReceipt(id,objectPath){
    const {error}=await supabase.from('coach_expenses').update({receipt_url:objectPath}).eq('id',id)
    if(error)return setMsg('Could not attach receipt: '+error.message)
    setExpenses(prev=>prev.map(x=>x.id!==id?x:{...x,receipt_url:objectPath}))
  }
  return(
    <div>
      <div style={{overflowX:'auto',marginBottom:'0.75rem'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'1.01rem'}}>
          <thead><tr style={{background:C.lightBg}}>{['Date','Client','Description','Category','Amount','Receipt','Status',canApprove?'':null].filter(h=>h!==null).map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.length===0&&<tr><td style={{...td,color:C.slate}} colSpan={8}>No expenses for {periodLabel(period)}.</td></tr>}
            {rows.map((x,i)=><tr key={x.id} style={{background:i%2?C.white:C.cream}}>
              <td style={td}>{x.expense_date}</td>
              <td style={td}>{clientName(x.client_id)}</td>
              <td style={{...td,maxWidth:200}}>{x.description||'—'}</td>
              <td style={td}>{x.category}</td>
              <td style={td}>{fmtMoney(x.amount,x.currency)}</td>
              <td style={td}><ReceiptUpload coImplementerId={ci.id} path={x.receipt_url} onUploaded={p=>attachReceipt(x.id,p)}/></td>
              <td style={td}><Badge text={x.status} color={x.status==='approved'?C.green:x.status==='rejected'?C.red:C.amber}/></td>
              {canApprove&&<td style={td}>{x.status!=='approved'&&<button style={solidBtn(C.green,true)} onClick={()=>setStatus(x.id,'approved')}>Approve</button>} {x.status!=='rejected'&&<button style={addBtn(true,C.red)} onClick={()=>setStatus(x.id,'rejected')}>Reject</button>}</td>}
            </tr>)}
          </tbody>
        </table>
      </div>
      <div style={{...fGrid,alignItems:'end'}}>
        <div><label style={lbl}>Date</label><input type="date" style={inp} value={f.expense_date} onChange={e=>setF(x=>({...x,expense_date:e.target.value}))}/></div>
        <div><label style={lbl}>Client</label><select style={inp} value={f.client_id} onChange={e=>setF(x=>({...x,client_id:e.target.value}))}><option value="">—</option>{assignedClients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div style={{gridColumn:'span 2'}}><label style={lbl}>Description</label><input style={inp} value={f.description} onChange={e=>setF(x=>({...x,description:e.target.value}))}/></div>
        <div><label style={lbl}>Category</label><select style={inp} value={f.category} onChange={e=>setF(x=>({...x,category:e.target.value}))}>{EXPENSE_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
        <div><label style={lbl}>Amount</label><input type="number" step="0.01" style={inp} value={f.amount} onChange={e=>setF(x=>({...x,amount:e.target.value}))}/></div>
        <div><label style={lbl}>Receipt</label><ReceiptUpload coImplementerId={ci.id} path={f.receipt_url} onUploaded={p=>setF(x=>({...x,receipt_url:p}))}/></div>
        <div><button style={solidBtn()} onClick={add}>+ Add expense</button></div>
      </div>
    </div>
  )
}

// ─── ADVANCES ────────────────────────────────────────────────
function AdvanceSection({ci,advances,setAdvances,setMsg,canApprove}){
  const rows=advances.filter(a=>a.co_implementer_id===ci.id).sort((a,b)=>(b.advance_date||'').localeCompare(a.advance_date||''))
  const [f,setF]=useState({amount:'',currency:curOf(ci),advance_date:today(),reason:'',due_date:addDays(today(),14),receipt_url:''})
  async function add(){
    if(!num(f.amount))return setMsg('Enter an advance amount.')
    const row={co_implementer_id:ci.id,amount:num(f.amount),currency:f.currency,advance_date:f.advance_date,reason:f.reason,due_date:f.due_date||null,receipt_url:f.receipt_url||null,reconciled:false}
    const {data,error}=await supabase.from('coach_advances').insert([row]).select().single()
    if(error)return setMsg('Could not add advance: '+error.message)
    setAdvances(prev=>[data,...prev]);setF(x=>({...x,amount:'',reason:'',receipt_url:''}));setMsg(null)
  }
  // Reconciling (marking an advance settled against actual spend) is a
  // financial control -- the coach's call, not something a co-implementer
  // can declare about their own advance.
  async function reconcile(id){
    const patch={reconciled:true,reconciled_at:new Date().toISOString()}
    const {error}=await supabase.from('coach_advances').update(patch).eq('id',id)
    if(error)return setMsg('Could not reconcile advance: '+error.message)
    setAdvances(prev=>prev.map(a=>a.id!==id?a:{...a,...patch}));setMsg('Advance reconciled.')
  }
  async function attachReceipt(id,objectPath){
    const {error}=await supabase.from('coach_advances').update({receipt_url:objectPath}).eq('id',id)
    if(error)return setMsg('Could not attach receipt: '+error.message)
    setAdvances(prev=>prev.map(a=>a.id!==id?a:{...a,receipt_url:objectPath}))
  }
  return(
    <div>
      <p style={{...hint,marginBottom:'0.6rem'}}>Advances are reconciled against actual spend by their due date. While an advance is unreconciled it is netted off the next invoice, and it blocks that invoice from issuing if it exceeds the period's earnings.</p>
      <div style={{overflowX:'auto',marginBottom:'0.75rem'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'1.01rem'}}>
          <thead><tr style={{background:C.lightBg}}>{['Date','Amount','Reason','Proof','Due','Status',canApprove?'':null].filter(h=>h!==null).map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.length===0&&<tr><td style={{...td,color:C.slate}} colSpan={7}>No advances.</td></tr>}
            {rows.map((a,i)=>{
              const overdue=!a.reconciled&&a.due_date&&a.due_date<today()
              return(<tr key={a.id} style={{background:i%2?C.white:C.cream}}>
                <td style={td}>{a.advance_date}</td>
                <td style={td}>{fmtMoney(a.amount,a.currency)}</td>
                <td style={{...td,maxWidth:200}}>{a.reason||'—'}</td>
                <td style={td}><ReceiptUpload coImplementerId={ci.id} path={a.receipt_url} onUploaded={p=>attachReceipt(a.id,p)}/></td>
                <td style={{...td,color:overdue?C.red:C.navy}}>{a.due_date||'—'}{overdue?' ⚠':''}</td>
                <td style={td}>{a.reconciled?<Badge text="reconciled" color={C.green}/>:<Badge text={overdue?'overdue':'open'} color={overdue?C.red:C.amber}/>}</td>
                {canApprove&&<td style={td}>{!a.reconciled&&<button style={solidBtn(C.teal,true)} onClick={()=>reconcile(a.id)}>Reconcile</button>}{a.reconciled&&a.applied_invoice_id&&<span style={hint}>netted on invoice</span>}</td>}
              </tr>)
            })}
          </tbody>
        </table>
      </div>
      <div style={{...fGrid,alignItems:'end'}}>
        <div><label style={lbl}>Amount</label><input type="number" step="0.01" style={inp} value={f.amount} onChange={e=>setF(x=>({...x,amount:e.target.value}))}/></div>
        <div><label style={lbl}>Currency</label><select style={inp} value={f.currency} onChange={e=>setF(x=>({...x,currency:e.target.value}))}>{['USD','GBP','EUR','UGX','NGN','KES'].map(x=><option key={x}>{x}</option>)}</select></div>
        <div><label style={lbl}>Date</label><input type="date" style={inp} value={f.advance_date} onChange={e=>setF(x=>({...x,advance_date:e.target.value}))}/></div>
        <div><label style={lbl}>Due date</label><input type="date" style={inp} value={f.due_date} onChange={e=>setF(x=>({...x,due_date:e.target.value}))}/></div>
        <div style={{gridColumn:'span 2'}}><label style={lbl}>Reason</label><input style={inp} value={f.reason} onChange={e=>setF(x=>({...x,reason:e.target.value}))}/></div>
        <div><label style={lbl}>Proof</label><ReceiptUpload coImplementerId={ci.id} path={f.receipt_url} onUploaded={p=>setF(x=>({...x,receipt_url:p}))}/></div>
        <div><button style={solidBtn(C.amber)} onClick={add}>+ Request advance</button></div>
      </div>
    </div>
  )
}

// ─── INVOICE ─────────────────────────────────────────────────
function InvoiceSection({ci,period,draft,clientName,entries,expenses,advances,setAdvances,invoices,setInvoices,alreadyIssued,busy,setBusy,setMsg,canApprove}){
  const d=draft
  const cur=curOf(ci)
  const invoiceNumber=`INV-${String(ci.id).replace(/[^a-zA-Z0-9]/g,'').slice(-6)}-${period}`
  const nothingToBill=d.days<=0&&d.expApproved<=0
  const dueDate=addDays(today(),14)

  function buildInvoiceHtml(inv){
    const lineRows=[
      `<tr><td>Consulting — ${fmtDays(inv.days)} day(s) @ ${fmtMoney(inv.day_rate,inv.currency)}</td><td style="text-align:right">${fmtMoney(inv.time_amount,inv.currency)}</td></tr>`,
      inv.expenses_amount?`<tr><td>Approved expense reclaims</td><td style="text-align:right">${fmtMoney(inv.expenses_amount,inv.currency)}</td></tr>`:'',
      inv.advance_applied?`<tr><td>Less: advance netted off</td><td style="text-align:right">−${fmtMoney(inv.advance_applied,inv.currency)}</td></tr>`:'',
    ].join('')
    return `<!doctype html><html><head><meta charset="utf-8"><title>${inv.invoice_number}</title>
<style>body{font-family:Segoe UI,system-ui,sans-serif;color:#1b2a3a;max-width:720px;margin:2rem auto;padding:0 1.5rem}
h1{font-family:Georgia,serif} table{width:100%;border-collapse:collapse;margin-top:1rem}
td,th{padding:.5rem .6rem;border-bottom:1px solid #ddd} .tot{font-weight:700;font-size:1.1rem}
.meta{color:#556;font-size:.85rem;line-height:1.6}</style></head><body>
<h1>Invoice ${inv.invoice_number}</h1>
<div class="meta"><strong>${ci.name}</strong><br>${ci.email||''}<br>Period: ${inv.period}<br>Issued: ${today()}<br>Due: ${inv.due_date||dueDate}</div>
<table><thead><tr><th style="text-align:left">Item</th><th style="text-align:right">Amount</th></tr></thead>
<tbody>${lineRows}<tr class="tot"><td>Net payable</td><td style="text-align:right">${fmtMoney(inv.net_amount,inv.currency)}</td></tr></tbody></table>
<p class="meta">Canvas Coach · This invoice posts into Clearview as cost-to-serve for the co-implementer's assigned engagements.</p>
</body></html>`
  }
  function download(inv){
    try{
      const blob=new Blob([buildInvoiceHtml(inv)],{type:'text/html'})
      const url=URL.createObjectURL(blob)
      const a=document.createElement('a');a.href=url;a.download=`${inv.invoice_number}.html`;document.body.appendChild(a);a.click()
      a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch(e){setMsg('Download failed: '+(e.message||e))}
  }

  async function issue(){
    if(nothingToBill)return setMsg('Nothing to invoice for this period yet — approve some days or expenses first.')
    if(d.blocked)return setMsg('Blocked: this co-implementer has an unreconciled advance larger than the period earnings. Reconcile it before issuing.')
    setBusy(true)
    const inv={
      invoice_number:invoiceNumber, co_implementer_id:ci.id, period,
      days:d.days, day_rate:d.rate, time_amount:d.timeAmount, expenses_amount:d.expApproved,
      advance_applied:d.advanceApplied, net_amount:d.net, currency:cur,
      due_date:dueDate, status:'issued', issued_at:new Date().toISOString(),
    }
    const {data,error}=await supabase.from('coach_invoices').insert([inv]).select().single()
    if(error){setBusy(false);return setMsg('Could not issue invoice: '+error.message)}
    // Issuing nets and reconciles the applied advances against this invoice.
    if(d.openAdvances.length){
      const ids=d.openAdvances.map(a=>a.id)
      const patch={reconciled:true,reconciled_at:new Date().toISOString(),applied_invoice_id:data.id}
      const {error:advErr}=await supabase.from('coach_advances').update(patch).in('id',ids)
      if(advErr){setBusy(false);return setMsg('Invoice issued but advances not reconciled: '+advErr.message)}
      setAdvances(prev=>prev.map(a=>ids.includes(a.id)?{...a,...patch}:a))
    }
    setInvoices(prev=>[data,...prev]);setBusy(false);setMsg('Invoice issued.')
    download(data)
  }

  const previewInv={invoice_number:invoiceNumber,period,days:d.days,day_rate:d.rate,time_amount:d.timeAmount,expenses_amount:d.expApproved,advance_applied:d.advanceApplied,net_amount:d.net,currency:cur,due_date:dueDate}

  return(
    <div>
      {alreadyIssued
        ? <div style={{...card,margin:0,marginBottom:'0.85rem',border:`1px solid ${C.green}`,background:'var(--cv-tint-actual)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.6rem'}}>
              <div><Badge text={alreadyIssued.status} color={alreadyIssued.status==='paid'?C.green:C.teal}/> <strong style={{marginLeft:6}}>{alreadyIssued.invoice_number}</strong> · {fmtMoney(alreadyIssued.net_amount,alreadyIssued.currency)} · due {alreadyIssued.due_date||'—'}</div>
              <div style={{display:'flex',gap:'0.4rem'}}>
                <button style={addBtn(true)} onClick={()=>download(alreadyIssued)}>Download</button>
                {canApprove&&alreadyIssued.status!=='paid'&&<button style={solidBtn(C.green,true)} onClick={async()=>{const patch={status:'paid',paid_at:new Date().toISOString()};const {error}=await supabase.from('coach_invoices').update(patch).eq('id',alreadyIssued.id);if(error)return setMsg('Could not mark paid: '+error.message);setInvoices(prev=>prev.map(i=>i.id!==alreadyIssued.id?i:{...i,...patch}))}}>Mark paid</button>}
              </div>
            </div>
          </div>
        : <div style={{...card,margin:0,marginBottom:'0.85rem',border:`1px solid ${C.border}`}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.5rem'}}><strong>Draft invoice {invoiceNumber}</strong><span style={hint}>auto-calculated · due {dueDate}</span></div>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'1.07rem'}}>
              <tbody>
                <tr><td style={td}>Consulting — {fmtDays(d.days)} day(s) @ {fmtMoney(d.rate,cur)}</td><td style={{...td,textAlign:'right'}}>{fmtMoney(d.timeAmount,cur)}</td></tr>
                {d.expApproved>0&&<tr><td style={td}>Approved expense reclaims</td><td style={{...td,textAlign:'right'}}>{fmtMoney(d.expApproved,cur)}</td></tr>}
                {d.advanceApplied>0&&<tr><td style={{...td,color:C.amber}}>Less: advance netted off</td><td style={{...td,textAlign:'right',color:C.amber}}>−{fmtMoney(d.advanceApplied,cur)}</td></tr>}
                <tr><td style={{...td,fontWeight:700,borderTop:`2px solid ${C.border}`}}>Net payable</td><td style={{...td,textAlign:'right',fontWeight:700,color:C.teal,borderTop:`2px solid ${C.border}`}}>{fmtMoney(d.net,cur)}</td></tr>
              </tbody>
            </table>
            {d.blocked&&<div style={{marginTop:'0.7rem',padding:'0.6rem 0.8rem',borderRadius:6,background:'var(--cv-tint-amber)',border:`1px solid ${C.red}`,color:C.red,fontSize:'1.01rem'}}>⛔ Blocked: an unreconciled advance of {fmtMoney(d.openAdvanceTotal,cur)} exceeds this period's earnings. Reconcile the advance before issuing.</div>}
            {!d.blocked&&d.advanceApplied>0&&<div style={{marginTop:'0.7rem',fontSize:'1.01rem',color:C.slate}}>Issuing will net off and reconcile the open advance of {fmtMoney(d.advanceApplied,cur)}.</div>}
            {!canApprove&&<div style={{marginTop:'0.7rem',fontSize:'1.01rem',color:C.slate}}>This updates automatically as your timesheets and expenses are approved. Your coach issues the final invoice.</div>}
            <div style={{display:'flex',gap:'0.5rem',marginTop:'0.85rem'}}>
              {canApprove&&<button style={{...solidBtn(),opacity:(nothingToBill||d.blocked||busy)?0.5:1,cursor:(nothingToBill||d.blocked||busy)?'not-allowed':'pointer'}} disabled={nothingToBill||d.blocked||busy} onClick={issue}>{busy?'Issuing…':'Issue invoice'}</button>}
              <button style={addBtn()} onClick={()=>download(previewInv)}>Preview / download draft</button>
            </div>
          </div>}

      {invoices.length>0&&<div>
        <div style={{...secH,fontSize:'1.11rem'}}>Invoice history</div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'1.01rem'}}>
            <thead><tr style={{background:C.lightBg}}>{['Number','Period','Days','Net','Due','Status',''].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{invoices.map((iv,i)=><tr key={iv.id} style={{background:i%2?C.white:C.cream}}>
              <td style={td}>{iv.invoice_number}</td><td style={td}>{iv.period}</td><td style={td}>{fmtDays(iv.days)}</td>
              <td style={td}>{fmtMoney(iv.net_amount,iv.currency)}</td><td style={td}>{iv.due_date||'—'}</td>
              <td style={td}><Badge text={iv.status} color={iv.status==='paid'?C.green:iv.status==='issued'?C.teal:C.slate}/></td>
              <td style={td}><button style={addBtn(true)} onClick={()=>download(iv)}>Download</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>}
    </div>
  )
}
