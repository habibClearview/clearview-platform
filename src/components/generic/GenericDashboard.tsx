// @ts-nocheck
'use client'
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  fmt, fmtFull, pct, buildMonthLabels,
  runGenericModel, defaultGenericConfig,
  blankLine, spreadLine, serviceFeeLine,
  type GenericModelConfig, type GenericBusinessUnit,
  type GenericPlanLine, type LineCategory, type LineType, type UnitType,
} from '@/lib/generic-engine'
import { buildDebtSchedule, defaultCoachAssessment, dscrLabel, dscrColor } from '@/lib/scoring-engine'
import { combinedActual, computeActualsTotals } from '@/lib/actuals'

// ── Design tokens ────────────────────────────────────────────
const C = {
  navy:'#1B2A4A', cyan:'#00B4D8', cream:'#F8F4EE', white:'#FFFFFF',
  slate:'#4A5A6A', border:'#D8E0E8', teal:'#1A9DAA',
  red:'#C0392B', green:'#1A7A4A', amber:'#B8860B', purple:'#6B4A8B',
  lightBg:'#F0F4F8', planBg:'#FFFFFF', actualBg:'#E8F6F8',
}

// ── Style helpers ────────────────────────────────────────────
const card: React.CSSProperties = {background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}
const secH: React.CSSProperties = {fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy,marginBottom:'0.75rem'}
const inp:  React.CSSProperties = {width:'100%',padding:'0.42rem 0.6rem',border:`1px solid ${C.border}`,borderRadius:4,fontSize:'0.83rem',fontFamily:'inherit',background:'#F4F8FC',color:C.navy,boxSizing:'border-box'}
const lbl:  React.CSSProperties = {display:'block',fontWeight:600,fontSize:'0.8rem',marginBottom:'0.22rem',color:C.navy}
const hint: React.CSSProperties = {fontSize:'0.7rem',color:C.slate,lineHeight:1.4,marginTop:'0.18rem'}
const fGrid:React.CSSProperties = {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:'1.1rem'}
const kpiGrid:React.CSSProperties = {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:'1rem',marginBottom:'1.25rem'}
const addBtn = (sm=false, col=C.cyan): React.CSSProperties => ({fontFamily:'monospace',fontSize:sm?'0.68rem':'0.72rem',padding:sm?'0.28rem 0.6rem':'0.38rem 0.8rem',border:`1px solid ${col}`,borderRadius:4,background:'transparent',color:col,cursor:'pointer'})
const solidBtn = (col=C.cyan, sm=false): React.CSSProperties => ({fontFamily:'monospace',fontSize:sm?'0.72rem':'0.78rem',fontWeight:600,padding:sm?'0.35rem 0.8rem':'0.5rem 1.1rem',border:'none',borderRadius:4,background:col,color:col===C.white?C.navy:C.white,cursor:'pointer'})
const delBtn: React.CSSProperties = {fontSize:'0.68rem',color:C.red,background:'transparent',border:`1px solid ${C.border}`,borderRadius:3,cursor:'pointer',padding:'0.18rem 0.42rem'}

function navBtn(active: boolean): React.CSSProperties {
  return {fontFamily:'monospace',fontSize:'0.72rem',padding:'0.65rem 1rem',border:'none',background:'transparent',
    color:active?C.cyan:'rgba(255,255,255,0.6)',cursor:'pointer',
    borderBottom:active?`3px solid ${C.cyan}`:'3px solid transparent',
    fontWeight:active?700:400,whiteSpace:'nowrap'}
}

// ── Shared components ────────────────────────────────────────
function KPI({label,value,sub,color}:{label:string;value:string;sub?:string;color?:string}) {
  return (
    <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1rem 1.1rem'}}>
      <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.1em',color:C.slate,textTransform:'uppercase',marginBottom:'0.28rem'}}>{label}</div>
      <div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:color||C.navy}}>{value}</div>
      {sub&&<div style={{fontSize:'0.7rem',color:C.slate,marginTop:'0.18rem'}}>{sub}</div>}
    </div>
  )
}

function Badge({text,color}:{text:string;color?:string}) {
  return <span style={{fontFamily:'monospace',fontSize:'0.63rem',padding:'0.1rem 0.42rem',borderRadius:4,background:color||C.slate,color:C.white,display:'inline-block'}}>{text}</span>
}

function Spinner() {
  return <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'3rem',color:C.slate,fontSize:'0.9rem'}}>Loading...</div>
}

function SectionHeader({title,action}:{title:string;action?:React.ReactNode}) {
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
      <div style={secH}>{title}</div>
      {action}
    </div>
  )
}

function PLRow({label,values,bold,highlight,negate,months,cc,actualMask}:{label:string;values:number[];bold?:boolean;highlight?:boolean;negate?:boolean;months:string[];cc:string;actualMask?:boolean[]}) {
  const total = values.reduce((s,v)=>s+v,0)
  const display = (v:number) => negate ? fmt(-Math.abs(v),cc) : fmt(v,cc)
  return (
    <tr style={{background:highlight?'#EBF8FF':bold?C.lightBg:C.white}}>
      <td style={{padding:'7px 10px',fontWeight:bold?700:400,color:C.navy,minWidth:160,fontSize:'0.8rem'}}>{label}</td>
      {values.map((v,i)=>{
        const isActual = actualMask?.[i]
        return (
        <td key={i} style={{padding:'7px 8px',textAlign:'right',fontFamily:'monospace',fontSize:'0.76rem',color:negate?C.red:v<0?C.red:C.navy,fontWeight:bold?700:400,
          background:isActual?'#EAFAF6':undefined,borderBottom:isActual?`2px solid ${C.teal}`:undefined}}>
          {display(v)}
        </td>
        )
      })}
      <td style={{padding:'7px 8px',textAlign:'right',fontFamily:'monospace',fontSize:'0.76rem',fontWeight:700,color:negate?C.red:total<0?C.red:C.navy,borderLeft:`2px solid ${C.border}`}}>
        {display(total)}
      </td>
    </tr>
  )
}

function PLTable({title,rows,months,cc,showExport}:{title?:string;rows:{label:string;values:number[];bold?:boolean;highlight?:boolean;negate?:boolean;actualMask?:boolean[]}[];months:string[];cc:string;showExport?:boolean}) {
  function exportCSV() {
    const headers = ['',  ...months, 'Total']
    const data = rows.map(r => [r.label, ...r.values.map(v=>String(Math.round(v))), String(Math.round(r.values.reduce((s,v)=>s+v,0)))])
    const csv = [headers,...data].map(r=>r.map(c=>`"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv],{type:'text/csv'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=`${title||'export'}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  const hasActuals = rows.some(r=>r.actualMask?.some(Boolean))
  return (
    <div style={{...card,padding:0,overflow:'hidden'}}>
      {title&&(
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.85rem 1.1rem',borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontFamily:'Georgia,serif',fontSize:'0.95rem',fontWeight:700,color:C.navy}}>{title}</div>
          {showExport&&<div style={{display:'flex',gap:'0.5rem'}}>
            <button style={addBtn(true)} onClick={()=>window.print()}>Print</button>
            <button style={addBtn(true)} onClick={exportCSV}>Export CSV</button>
          </div>}
        </div>
      )}
      {hasActuals&&(
        <div style={{padding:'0.5rem 1.1rem',fontSize:'0.68rem',fontFamily:'monospace',color:C.teal,display:'flex',alignItems:'center',gap:'0.4rem',background:'#F4FDFB'}}>
          <span style={{width:10,height:10,borderRadius:2,background:'#EAFAF6',border:`2px solid ${C.teal}`,display:'inline-block'}}></span>
          Teal-bordered months show real Clearview Field / Actuals data, not plan
        </div>
      )}
      <div style={{overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.77rem',fontFamily:'monospace'}}>
          <thead>
            <tr style={{background:C.navy}}>
              <th style={{textAlign:'left',padding:'8px 10px',color:C.white,minWidth:160,fontSize:'0.75rem'}}></th>
              {months.map((m,i)=><th key={i} style={{textAlign:'right',padding:'8px 8px',color:C.white,whiteSpace:'nowrap',fontSize:'0.72rem'}}>{m}</th>)}
              <th style={{textAlign:'right',padding:'8px 8px',color:C.cyan,whiteSpace:'nowrap',fontSize:'0.72rem',borderLeft:`2px solid rgba(255,255,255,0.2)`}}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i)=><PLRow key={i} {...r} months={months} cc={cc}/>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Permissions ──────────────────────────────────────────────
export interface GenericPermissions {
  role: string
  userId: string
  fullName: string
  clientId: string
  unitIds: string[]   // assigned units (empty = all)
  canEditPlan: boolean
  canApprove: boolean
  canSubmitRequest: boolean
  canEnterActuals: boolean
  canManageTeam: boolean
  canManageCatalogue: boolean
  canViewAI: boolean
  onSignOut: () => void
}

const FULL_PERMISSIONS: GenericPermissions = {
  role:'super_coach', userId:'', fullName:'Coach', clientId:'',
  unitIds:[], canEditPlan:true, canApprove:true, canSubmitRequest:true,
  canEnterActuals:true, canManageTeam:true, canManageCatalogue:true, canViewAI:true, onSignOut:()=>{},
}

// ── Main dashboard component ─────────────────────────────────
export default function GenericDashboard({
  clientId,
  permissions: permProp,
}: {
  clientId: string
  permissions?: GenericPermissions
}) {
  const P = permProp || FULL_PERMISSIONS
  const isSuperCoach = P.role === 'super_coach' || P.role === 'coach'
  const isCEO = P.role === 'ceo'
  const isFM = P.role === 'finance_manager'
  const canSeeAll = isSuperCoach || isCEO || isFM

  const [config, setConfig] = useState<GenericModelConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string|null>(null)
  const [view, setView] = useState('overview')
  const [saving, setSaving] = useState(false)
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0)
  // unit_id -> period -> line_id -> combined (manual + field) value.
  // Feeds runGenericModel's hybrid mode: months with actuals show actuals,
  // months ahead still show plan. See docs/ACCOUNTING_ARCHITECTURE.md.
  const [modelActuals, setModelActuals] = useState<Record<string, Record<string, Record<string, number>>>>({})

  useEffect(() => {
    if (!clientId) return
    supabase.from('generic_spend_requests').select('id',{count:'exact',head:true})
      .eq('client_id',clientId).in('status',['pending_fm','pending_ceo'])
      .then(({count}) => setPendingApprovalCount(count||0))
  }, [clientId, view])

  // Fetch actuals for the P&L's hybrid mode: real data for months that
  // have it, plan for months ahead. Combines line_values (manual) and
  // field_line_values (from Clearview Field) here -- these must never be
  // treated as one shared value, see docs/ACCOUNTING_ARCHITECTURE.md sec 4.
  useEffect(() => {
    if (!clientId) return
    supabase.from('generic_actuals').select('unit_id,period,line_values,field_line_values')
      .eq('client_id', clientId)
      .then(({data, error}) => {
        if (error) { console.error('Failed to load generic_actuals for P&L hybrid mode:', error); return }
        const byUnit: Record<string, Record<string, Record<string, number>>> = {}
        ;(data||[]).forEach((row:any) => {
          const lineValues = row.line_values || {}
          const fieldLineValues = row.field_line_values || {}
          const lineIds = new Set([...Object.keys(lineValues), ...Object.keys(fieldLineValues)])
          if (lineIds.size === 0) return
          if (!byUnit[row.unit_id]) byUnit[row.unit_id] = {}
          byUnit[row.unit_id][row.period] = {}
          lineIds.forEach(lineId => {
            byUnit[row.unit_id][row.period][lineId] = combinedActual(lineId, lineValues, fieldLineValues)
          })
        })
        setModelActuals(byUnit)
      })
  }, [clientId])

  // Load config from Supabase
  useEffect(() => {
    async function load() {
      try {
        const { data, error: err } = await supabase
          .from('generic_model_config')
          .select('*')
          .eq('client_id', clientId)
          .single()
        if (err && err.code !== 'PGRST116') throw err
        if (data) {
          setConfig({
            client_id: data.client_id,
            business_name: data.business_name,
            currency: data.currency,
            start_date: data.start_date,
            planning_months: data.planning_months,
            business_units: data.business_units || [],
            plan_lines: data.plan_lines || [],
            shared_lines: data.shared_lines || [],
            settings: data.settings || {},
          })
        } else {
          setConfig(defaultGenericConfig({ client_id: clientId }))
        }
      } catch(e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    if (clientId) load()
  }, [clientId])

  // Save config to Supabase
  const saveConfig = useCallback(async (newConfig: GenericModelConfig) => {
    setSaving(true)
    try {
      const { error: err } = await supabase
        .from('generic_model_config')
        .upsert({
          client_id: newConfig.client_id,
          business_name: newConfig.business_name,
          currency: newConfig.currency,
          start_date: newConfig.start_date,
          planning_months: newConfig.planning_months,
          business_units: newConfig.business_units,
          plan_lines: newConfig.plan_lines,
          shared_lines: newConfig.shared_lines,
          settings: newConfig.settings,
          updated_at: new Date().toISOString(),
          updated_by: P.userId,
        }, { onConflict: 'client_id' })
      if (err) throw err
      setConfig(newConfig)
    } catch(e: any) {
      alert('Save failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }, [P.userId])

  const months = useMemo(() => config ? buildMonthLabels(config.start_date, config.planning_months) : [], [config])
  const result = useMemo(() => config && config.business_units.length > 0 ? runGenericModel(config, modelActuals) : null, [config, modelActuals])
  const cc = config?.currency || 'UGX'

  if (loading) return <Spinner/>
  if (error) return (
    <div style={{padding:'2rem',fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <div style={{color:C.red,marginBottom:'1rem'}}>Error loading data: {error}</div>
      <button onClick={P.onSignOut} style={solidBtn(C.navy)}>Sign Out</button>
    </div>
  )
  if (!config) return <Spinner/>

  const activeUnits = config.business_units.filter(u => u.active)

  const mainNav = [
    ['overview','Overview'],
    ['approvals',`Approvals${pendingApprovalCount>0?` (${pendingApprovalCount})`:''}`],
    ['intelligence','Clearview Intelligence'],
    ['planning','Planning'],
    ['pl','P&L'],
    ['cashflow','Cash Flow'],
    ['balancesheet','Balance Sheet'],
    ['margins','Margins & Break-Even'],
    ['actuals_wc','Actuals & Working Capital'],
    ['settings','Settings'],
  ]

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.cream,color:C.navy,minHeight:'100vh'}}>
      {/* Header */}
      <header style={{background:C.navy,borderBottom:`3px solid ${C.cyan}`}}>
        <div style={{maxWidth:1600,margin:'0 auto',padding:'1.25rem 1.5rem',display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'1rem'}}>
          <div>
            <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.15em',color:C.cyan,marginBottom:'0.28rem'}}>CANVAS COACH — CLEARVIEW</div>
            <h1 style={{fontFamily:'Georgia,serif',fontSize:'1.5rem',fontWeight:700,color:C.white,margin:'0.1rem 0 0.15rem'}}>{config.business_name || 'New Client'}</h1>
            <div style={{fontSize:'0.76rem',color:'rgba(255,255,255,0.6)'}}>
              {activeUnits.length} unit{activeUnits.length!==1?'s':''} · {cc} · {P.fullName}
              {saving&&<span style={{marginLeft:8,color:C.amber}}>· Saving...</span>}
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
            <span style={{fontFamily:'monospace',fontSize:'0.65rem',color:C.cyan,border:`1px solid rgba(0,180,216,0.4)`,borderRadius:4,padding:'0.18rem 0.5rem',textTransform:'uppercase'}}>{P.role.replace('_',' ')}</span>
            <button onClick={P.onSignOut} style={{fontFamily:'monospace',fontSize:'0.65rem',background:'transparent',border:`1px solid rgba(255,255,255,0.25)`,borderRadius:4,color:'rgba(255,255,255,0.6)',cursor:'pointer',padding:'0.18rem 0.5rem'}}>Sign out</button>
          </div>
        </div>
      </header>

      {/* Nav */}
      <nav style={{background:'#142038',borderBottom:`1px solid rgba(0,180,216,0.15)`,overflowX:'auto'}}>
        <div style={{maxWidth:1600,margin:'0 auto',padding:'0 1.5rem',display:'flex'}}>
          {mainNav.map(([id,label])=>(
            <button key={id} style={navBtn(view===id)} onClick={()=>setView(id)}>{label}</button>
          ))}
        </div>
      </nav>

      {/* Main */}
      <main style={{maxWidth:1600,margin:'0 auto',padding:'1.5rem'}}>
        {view==='overview'    && <OverviewTab config={config} result={result} months={months} cc={cc} P={P} onSave={saveConfig} pendingApprovalCount={pendingApprovalCount} onGoToApprovals={()=>setView('approvals')}/>}
        {view==='approvals'   && <ApprovalsAndSpendTab clientId={clientId} config={config} cc={cc} P={P}/>}
        {view==='intelligence'&& <ClearviewIntelligenceTab clientId={clientId} config={config} result={result} months={months} cc={cc} P={P} onSave={saveConfig}/>}
        {view==='planning'    && <PlanningTab config={config} result={result} months={months} cc={cc} P={P} onSave={saveConfig}/>}
        {view==='pl'          && <PLTab config={config} result={result} months={months} cc={cc} P={P}/>}
        {view==='cashflow'    && <CashFlowTab result={result} months={months} cc={cc}/>}
        {view==='balancesheet'&& <BalanceSheetTab result={result} months={months} cc={cc}/>}
        {view==='margins'     && <MarginsTab config={config} result={result} months={months} cc={cc}/>}
        {view==='actuals_wc'  && <ActualsAndWorkingCapitalTab config={config} result={result} months={months} cc={cc} P={P} onSave={saveConfig}/>}
        {view==='settings'    && <SettingsAndAdminTab config={config} result={result} months={months} cc={cc} clientId={clientId} P={P} onSave={saveConfig}/>}
      </main>

      <footer style={{textAlign:'center',padding:'1.5rem',fontFamily:'monospace',fontSize:'0.67rem',color:C.slate,borderTop:`1px solid ${C.border}`,marginTop:'2rem'}}>
        Canvas Coach · Clearview · {config.business_name} · habibonifade.com · Confidential
      </footer>
    </div>
  )
}
// ── OVERVIEW TAB ─────────────────────────────────────────────
function OverviewTab({config,result,months,cc,P,onSave,pendingApprovalCount,onGoToApprovals}) {
  if (!result) return (
    <div style={card}>
      <div style={{...secH,marginBottom:'0.5rem'}}>Welcome to Clearview</div>
      <p style={{color:C.slate,fontSize:'0.88rem',lineHeight:1.7}}>
        This financial planning platform is ready for {config.business_name||'your business'}.
        Start by going to <strong>Settings</strong> to define your business units and revenue lines,
        then go to <strong>Planning</strong> to enter your financial plan.
      </p>
    </div>
  )
  const m = result.metrics
  return (
    <div>
      {pendingApprovalCount>0&&(
        <div style={{background:'#FFF8E8',border:`1px solid ${C.amber}`,borderRadius:8,padding:'0.85rem 1.1rem',marginBottom:'1.25rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontWeight:600,color:C.amber}}>⏳ {pendingApprovalCount} spend request{pendingApprovalCount>1?'s':''} awaiting approval</span>
          <button style={addBtn(true,C.amber)} onClick={onGoToApprovals}>Review now →</button>
        </div>
      )}
      <div style={kpiGrid}>
        <KPI label="Total Revenue" value={fmt(m.total_revenue,cc)} color={C.navy}/>
        <KPI label="Gross Profit" value={fmt(m.total_gp,cc)} sub={pct(m.gross_margin)} color={m.total_gp>=0?C.green:C.red}/>
        <KPI label="EBITDA" value={fmt(m.total_ebitda,cc)} sub={pct(m.net_margin)} color={m.total_ebitda>=0?C.teal:C.red}/>
        <KPI label="Min Cash" value={fmt(m.min_cash,cc)} sub={`Month ${m.min_cash_month}`} color={m.min_cash>=0?C.navy:C.red}/>
        <KPI label="Break-Even" value={fmt(m.business_breakeven,cc)} sub="Annual revenue needed" color={C.amber}/>
        <KPI label="Revenue/Head" value={fmt(m.revenue_per_head,cc)} sub={`${m.total_headcount} staff`} color={C.purple}/>
      </div>
      {/* Unit performance cards */}
      <div style={{...secH,marginTop:'0.5rem'}}>Business Unit Performance</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
        {result.allocUnits.map(u => {
          const pl = result.unitPL[u.id]
          if (!pl) return null
          return (
            <div key={u.id} style={{...card,borderTop:`4px solid ${u.color||C.cyan}`,marginBottom:0}}>
              <div style={{fontWeight:700,fontSize:'0.9rem',color:C.navy,marginBottom:'0.5rem'}}>{u.name}</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem',fontSize:'0.8rem'}}>
                <div><div style={{color:C.slate,fontSize:'0.7rem'}}>Revenue</div><div style={{fontWeight:700,color:C.navy,fontFamily:'monospace'}}>{fmt(pl.ann_rev,cc)}</div></div>
                <div><div style={{color:C.slate,fontSize:'0.7rem'}}>Gross Profit</div><div style={{fontWeight:700,color:pl.ann_gp>=0?C.green:C.red,fontFamily:'monospace'}}>{fmt(pl.ann_gp,cc)}</div></div>
                <div><div style={{color:C.slate,fontSize:'0.7rem'}}>EBITDA</div><div style={{fontWeight:700,color:pl.ann_ebitda>=0?C.teal:C.red,fontFamily:'monospace'}}>{fmt(pl.ann_ebitda,cc)}</div></div>
                <div><div style={{color:C.slate,fontSize:'0.7rem'}}>GP Margin</div><div style={{fontWeight:700,color:C.navy,fontFamily:'monospace'}}>{pct(pl.gp_margin)}</div></div>
              </div>
              {/* Sub-units if any */}
              {result.subUnitsByParent[u.id]&&(
                <div style={{marginTop:'0.75rem',borderTop:`1px solid ${C.border}`,paddingTop:'0.5rem'}}>
                  <div style={{fontSize:'0.7rem',color:C.slate,marginBottom:'0.35rem',fontFamily:'monospace',letterSpacing:'0.08em'}}>SUB-UNITS</div>
                  {result.subUnitsByParent[u.id].map(su=>{
                    const spl = result.unitPL[su.id]
                    return spl ? (
                      <div key={su.id} style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem',padding:'0.2rem 0',borderBottom:`1px solid ${C.border}`}}>
                        <span style={{color:C.navy}}>{su.name}</span>
                        <span style={{fontFamily:'monospace',color:spl.ann_ebitda>=0?C.green:C.red,fontWeight:700}}>{fmt(spl.ann_ebitda,cc)}</span>
                      </div>
                    ) : null
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── PLANNING TAB ─────────────────────────────────────────────
// ── Spread / Service-fee sub-rows for revenue lines in Planning ──
// Renders the editable source-field rows (buy/sell price + volume, or fee/
// cost + engagements) underneath a revenue line's computed revenue row.
// One shared renderer for both line types -- they differ only in which
// fields/labels apply and which field gets a summed total (the quantity
// field: volume or engagements; price/fee/cost fields show no total since
// summing a price across months isn't meaningful).
function LineFieldSubRows({l,months,cc,canEdit,rowBg,colSpanBefore,rows,totalField,onUpdate}:{
  l:GenericPlanLine, months:string[], cc:string, canEdit:boolean, rowBg:string,
  colSpanBefore:number,
  rows: [string,string,boolean][], // [label, field, isCurrency]
  totalField:string,
  onUpdate:(field:string,m:number,val:number)=>void
}) {
  return <>
    {rows.map(([label,field,isCurrency])=>{
      const arr = ((l as any)[field] as number[]|undefined) ?? Array(months.length).fill(0)
      const total = arr.reduce((s,v)=>s+v,0)
      return (
        <tr key={field} style={{background:rowBg}}>
          <td colSpan={colSpanBefore} style={{padding:'3px 8px 3px 24px',fontSize:'0.68rem',color:C.slate}}>↳ {label}</td>
          {arr.map((v,m)=>(
            <td key={m} style={{padding:'2px 4px'}}>
              {canEdit
                ? <input type="number" style={{width:74,padding:'2px 4px',border:`1px solid ${C.border}`,borderRadius:3,fontSize:'0.66rem',fontFamily:'monospace',textAlign:'right',background:C.lightBg,color:C.slate}}
                    value={v??''} placeholder="0"
                    onChange={e=>onUpdate(field,m,Number(e.target.value))}/>
                : <span style={{display:'block',textAlign:'right',padding:'2px 4px',fontSize:'0.66rem',color:C.slate}}>{isCurrency?fmt(v,cc):v.toLocaleString()}</span>
              }
            </td>
          ))}
          <td style={{padding:'3px 8px',textAlign:'right',fontSize:'0.68rem',color:C.slate,borderLeft:`2px solid ${C.border}`}}>{field===totalField?total.toLocaleString():''}</td>
          {canEdit&&<td></td>}
        </tr>
      )
    })}
  </>
}

const SPREAD_SUBROWS: [string,string,boolean][] = [
  ['Buy price','buy_price',true],
  ['Sell price','sell_price',true],
  ['Volume','volume',false],
]
const SERVICE_FEE_SUBROWS: [string,string,boolean][] = [
  ['Fee per engagement','fee_per_engagement',true],
  ['Cost per engagement','cost_per_engagement',true],
  ['Engagements','engagements',false],
]

function PlanningTab({config,result,months,cc,P,onSave}) {
  const [selUnit, setSelUnit] = useState(config.business_units.find(u=>u.active)?.id||'')
  const [selSection, setSelSection] = useState<LineCategory>('revenue')
  const [saving, setSaving] = useState(false)

  const unit = config.business_units.find(u=>u.id===selUnit)
  const lines = config.plan_lines.filter(l=>l.unit_id===selUnit&&l.category===selSection&&l.active)

  function updateLine(lineId:string, mIdx:number, val:number) {
    const newConfig = {...config, plan_lines: config.plan_lines.map(l =>
      l.id===lineId ? {...l, monthly_plan:l.monthly_plan.map((v,i)=>i===mIdx?val:v)} : l
    )}
    onSave(newConfig)
  }

  function addLine(category:LineCategory) {
    const id = `${selUnit}_${category}_${Date.now()}`
    const newLine = blankLine(id, selUnit, 'New line', category, config.planning_months)
    onSave({...config, plan_lines:[...config.plan_lines, newLine]})
  }

  function updateLineName(lineId:string, name:string) {
    onSave({...config, plan_lines:config.plan_lines.map(l=>l.id===lineId?{...l,name}:l)})
  }

  // Switching a revenue line's type resets its type-specific numbers to zero --
  // a flat monthly figure from Standard doesn't map meaningfully onto buy/sell/
  // volume, so starting clean avoids silently carrying over a wrong number.
  function changeLineType(lineId:string, newType:LineType) {
    const l = config.plan_lines.find(pl=>pl.id===lineId)
    if (!l) return
    const rebuilt = newType==='spread' ? spreadLine(l.id,l.unit_id,l.name,config.planning_months)
      : newType==='service_fee' ? serviceFeeLine(l.id,l.unit_id,l.name,config.planning_months)
      : blankLine(l.id,l.unit_id,l.name,l.category,config.planning_months,'standard')
    onSave({...config, plan_lines:config.plan_lines.map(pl=>pl.id===lineId?rebuilt:pl)})
  }

  // Generic updater for the monthly array fields used by spread and service-fee
  // lines (buy_price, sell_price, volume, fee_per_engagement, cost_per_engagement,
  // engagements) -- all follow the same per-month array shape as monthly_plan.
  function updateLineArrayField(lineId:string, field:'buy_price'|'sell_price'|'volume'|'fee_per_engagement'|'cost_per_engagement'|'engagements', mIdx:number, val:number) {
    onSave({...config, plan_lines: config.plan_lines.map(l => {
      if (l.id!==lineId) return l
      const arr = (l[field] as number[]|undefined) ?? Array(config.planning_months).fill(0)
      return {...l, [field]: arr.map((v,i)=>i===mIdx?val:v)}
    })})
  }

  function deleteLine(lineId:string) {
    onSave({...config, plan_lines:config.plan_lines.map(l=>l.id===lineId?{...l,active:false}:l)})
  }

  const sections: [LineCategory,string][] = [['revenue','Revenue'],['cost_of_sales','Cost of Sales'],['staff','Staff'],['direct_opex','Overheads']]

  const unitRevenue = result?.unitPL[selUnit]
  const totals = selSection==='revenue' ? unitRevenue?.rev : selSection==='cost_of_sales' ? unitRevenue?.cogs : selSection==='staff' ? unitRevenue?.staff : unitRevenue?.opex

  return (
    <div>
      {/* Unit selector */}
      <div style={{display:'flex',gap:'0.45rem',marginBottom:'1.25rem',flexWrap:'wrap',alignItems:'center'}}>
        {config.business_units.filter(u=>u.active).map(u=>(
          <button key={u.id} style={{fontFamily:'monospace',fontSize:'0.71rem',padding:'0.45rem 0.85rem',
            border:`2px solid ${selUnit===u.id?(u.color||C.cyan):C.border}`,borderRadius:4,
            background:selUnit===u.id?(u.color||C.cyan):C.white,
            color:selUnit===u.id?C.white:C.navy,cursor:'pointer'}}
            onClick={()=>setSelUnit(u.id)}>
            {u.name}
          </button>
        ))}
      </div>

      {/* Section tabs */}
      <div style={{display:'flex',gap:'0.35rem',marginBottom:'1.25rem',borderBottom:`1px solid ${C.border}`,paddingBottom:'0.5rem'}}>
        {sections.map(([cat,label])=>(
          <button key={cat} style={{fontFamily:'monospace',fontSize:'0.72rem',padding:'0.4rem 0.85rem',border:'none',
            background:selSection===cat?C.navy:C.white,color:selSection===cat?C.white:C.slate,
            borderRadius:4,cursor:'pointer',fontWeight:selSection===cat?700:400}}
            onClick={()=>setSelSection(cat)}>
            {label}
          </button>
        ))}
      </div>

      {/* Lines */}
      <div style={card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
          <div style={{fontFamily:'Georgia,serif',fontSize:'0.95rem',fontWeight:700,color:C.navy}}>{unit?.name} — {sections.find(s=>s[0]===selSection)?.[1]}</div>
          {P.canEditPlan&&<button style={addBtn(true)} onClick={()=>addLine(selSection)}>+ Add Line</button>}
        </div>

        {/* Header row */}
        <div style={{overflowX:'auto'}}>
          <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.76rem',fontFamily:'monospace'}}>
            <thead>
              <tr style={{background:C.lightBg}}>
                <th style={{textAlign:'left',padding:'6px 8px',fontWeight:600,color:C.navy,minWidth:180,fontSize:'0.75rem'}}>Line</th>
                {selSection==='revenue'&&<th style={{textAlign:'left',padding:'6px 8px',fontWeight:600,color:C.navy,minWidth:110,fontSize:'0.75rem'}}>Type</th>}
                {months.map((m,i)=><th key={i} style={{textAlign:'right',padding:'6px 6px',color:C.slate,whiteSpace:'nowrap',fontSize:'0.68rem'}}>{m}</th>)}
                <th style={{textAlign:'right',padding:'6px 8px',color:C.navy,fontWeight:700,borderLeft:`2px solid ${C.border}`,fontSize:'0.72rem'}}>Total</th>
                {P.canEditPlan&&<th style={{width:30}}></th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l,ri)=>{
                const isSpread = selSection==='revenue' && l.line_type==='spread'
                const isServiceFee = selSection==='revenue' && l.line_type==='service_fee'
                // For spread/service-fee lines, revenue is derived from the source
                // fields (matches the formula in generic-engine.ts exactly) rather
                // than monthly_plan, which the engine ignores for these line types.
                // Spread revenue is the GROSS sale value (sell price x volume) --
                // buy cost is a separate Cost of Sales line in the engine, not
                // netted against revenue. Must match generic-engine.ts exactly or
                // this row shows a different number than the Total row below it.
                const revenueByMonth = isSpread
                  ? (l.volume??[]).map((v,m)=>(l.sell_price?.[m]??0)*v)
                  : isServiceFee
                  ? (l.engagements??[]).map((e,m)=>(l.fee_per_engagement?.[m]??0)*e)
                  : l.monthly_plan
                const total = revenueByMonth.reduce((s,v)=>s+v,0)
                const rowBg = ri%2===0?C.cream:C.white
                return (
                  <React.Fragment key={l.id}>
                  <tr style={{background:rowBg}}>
                    <td style={{padding:'5px 8px'}}>
                      {P.canEditPlan
                        ? <input style={{...inp,background:'transparent',border:'none',padding:0,fontSize:'0.8rem',fontFamily:'inherit'}}
                            value={l.name} onChange={e=>updateLineName(l.id,e.target.value)}/>
                        : <span style={{fontSize:'0.8rem',color:C.navy}}>{l.name}</span>
                      }
                    </td>
                    {selSection==='revenue'&&(
                      <td style={{padding:'5px 8px'}}>
                        {P.canEditPlan
                          ? <select style={{...inp,padding:'0.3rem 0.4rem',fontSize:'0.72rem'}}
                              value={l.line_type} onChange={e=>changeLineType(l.id,e.target.value as LineType)}>
                              <option value="standard">Standard</option>
                              <option value="spread">Spread</option>
                              <option value="service_fee">Service fee</option>
                            </select>
                          : <span style={{fontSize:'0.72rem',color:C.slate}}>{l.line_type==='spread'?'Spread':l.line_type==='service_fee'?'Service fee':'Standard'}</span>
                        }
                      </td>
                    )}
                    {(isSpread||isServiceFee) ? (
                      revenueByMonth.map((v,m)=>(
                        <td key={m} style={{padding:'4px 4px'}}>
                          <span style={{display:'block',textAlign:'right',padding:'3px 5px',fontSize:'0.72rem',fontFamily:'monospace',color:C.slate}}>{fmt(v,cc)}</span>
                        </td>
                      ))
                    ) : l.monthly_plan.map((v,m)=>(
                      <td key={m} style={{padding:'4px 4px'}}>
                        {P.canEditPlan
                          ? <input type="number" style={{width:80,padding:'3px 5px',border:`1px solid ${C.border}`,borderRadius:3,fontSize:'0.72rem',fontFamily:'monospace',textAlign:'right',background:C.white,color:C.navy}}
                              value={v??''} placeholder="0"
                              onChange={e=>updateLine(l.id,m,Number(e.target.value))}/>
                          : <span style={{display:'block',textAlign:'right',padding:'3px 5px',fontSize:'0.72rem'}}>{fmt(v,cc)}</span>
                        }
                      </td>
                    ))}
                    <td style={{padding:'5px 8px',textAlign:'right',fontWeight:700,color:C.navy,borderLeft:`2px solid ${C.border}`}}>{fmt(total,cc)}</td>
                    {P.canEditPlan&&<td><button style={delBtn} onClick={()=>deleteLine(l.id)}>×</button></td>}
                  </tr>
                  {isSpread && (
                    <LineFieldSubRows l={l} months={months} cc={cc} canEdit={P.canEditPlan}
                      rowBg={rowBg} colSpanBefore={selSection==='revenue'?2:1}
                      rows={SPREAD_SUBROWS} totalField="volume"
                      onUpdate={(field,m,val)=>updateLineArrayField(l.id,field as any,m,val)}/>
                  )}
                  {isServiceFee && (
                    <LineFieldSubRows l={l} months={months} cc={cc} canEdit={P.canEditPlan}
                      rowBg={rowBg} colSpanBefore={selSection==='revenue'?2:1}
                      rows={SERVICE_FEE_SUBROWS} totalField="engagements"
                      onUpdate={(field,m,val)=>updateLineArrayField(l.id,field as any,m,val)}/>
                  )}
                  </React.Fragment>
                )
              })}
              {/* Total row */}
              {totals&&(
                <tr style={{background:C.navy}}>
                  <td style={{padding:'6px 8px',fontWeight:700,color:C.white,fontSize:'0.78rem'}}>Total</td>
                  {selSection==='revenue'&&<td></td>}
                  {totals.map((v,i)=><td key={i} style={{padding:'6px 6px',textAlign:'right',fontFamily:'monospace',fontSize:'0.72rem',color:C.cyan,fontWeight:700}}>{fmt(v,cc)}</td>)}
                  <td style={{padding:'6px 8px',textAlign:'right',fontFamily:'monospace',fontWeight:700,color:C.cyan,borderLeft:`2px solid rgba(255,255,255,0.2)`}}>{fmt(totals.reduce((s,v)=>s+v,0),cc)}</td>
                  {P.canEditPlan&&<td></td>}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shared lines section */}
      {selSection==='staff'&&(
        <div style={card}>
          <SectionHeader title="Shared / Central Costs" action={P.canEditPlan?<button style={addBtn(true)} onClick={()=>{
            const id=`shared_${Date.now()}`
            onSave({...config,shared_lines:[...config.shared_lines,blankLine(id,'shared','New shared cost','shared',config.planning_months)]})
          }}>+ Add Shared Cost</button>:null}/>
          <p style={{fontSize:'0.82rem',color:C.slate,marginBottom:'0.75rem'}}>Central costs (CEO salary, office costs etc) allocated across all units by headcount and revenue.</p>
          {config.shared_lines.map((l,ri)=>(
            <div key={l.id} style={{display:'flex',gap:'0.75rem',alignItems:'center',marginBottom:'0.5rem',padding:'0.4rem 0.6rem',background:ri%2===0?C.cream:C.white,borderRadius:4}}>
              <div style={{flex:1}}>
                {P.canEditPlan
                  ? <input style={{...inp,background:'transparent',border:'none',padding:0,fontSize:'0.82rem'}}
                      value={l.name} onChange={e=>onSave({...config,shared_lines:config.shared_lines.map(sl=>sl.id===l.id?{...sl,name:e.target.value}:sl)})}/>
                  : <span style={{fontSize:'0.82rem',color:C.navy}}>{l.name}</span>
                }
              </div>
              <div style={{width:140}}>
                {P.canEditPlan
                  ? <input type="number" style={{...inp,textAlign:'right',fontFamily:'monospace',fontSize:'0.82rem'}}
                      value={l.monthly_plan[0]??''} placeholder="Monthly amount"
                      onChange={e=>onSave({...config,shared_lines:config.shared_lines.map(sl=>sl.id===l.id?{...sl,monthly_plan:Array(config.planning_months).fill(Number(e.target.value))}:sl)})}/>
                  : <span style={{fontFamily:'monospace',fontSize:'0.82rem',color:C.navy,display:'block',textAlign:'right'}}>{fmt(l.monthly_plan[0],cc)}/mo</span>
                }
              </div>
              <div style={{fontFamily:'monospace',fontSize:'0.78rem',color:C.slate,width:100,textAlign:'right'}}>{fmt(l.monthly_plan.reduce((s,v)=>s+v,0),cc)}/yr</div>
              {P.canEditPlan&&<button style={delBtn} onClick={()=>onSave({...config,shared_lines:config.shared_lines.filter(sl=>sl.id!==l.id)})}>×</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── UNIT P&L TAB ─────────────────────────────────────────────
function ScenariosTab({config,result,months,cc,P,onSave}) {
  const scenarios = config.settings.scenarios||[]
  const activeId = scenarios.find(s=>s.active)?.id||'base'

  function setActiveScenario(id:string) {
    onSave({...config,settings:{...config.settings,
      scenarios:scenarios.map(s=>({...s,active:s.id===id}))
    }})
  }

  return (
    <div>
      <div style={card}>
        <div style={secH}>Scenarios</div>
        {scenarios.map(sc=>(
          <div key={sc.id} style={{display:'flex',alignItems:'center',gap:'1rem',padding:'0.75rem',border:`1px solid ${sc.active?C.cyan:C.border}`,borderRadius:6,marginBottom:'0.5rem',background:sc.active?'#EBF8FF':C.white}}>
            <input type="radio" checked={sc.active} onChange={()=>setActiveScenario(sc.id)} style={{cursor:'pointer'}}/>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:'0.88rem',color:C.navy}}>{sc.label}</div>
              <div style={{fontSize:'0.75rem',color:C.slate}}>Revenue ×{sc.rev_mult} · Costs ×{sc.cost_mult}</div>
            </div>
            {sc.active&&<Badge text="Active" color={C.cyan}/>}
          </div>
        ))}
      </div>
      {result&&(
        <PLTable title="Scenario P&L" rows={[
          {label:'Revenue',values:result.con.rev,bold:true},
          {label:'Gross Profit',values:result.con.gp,highlight:true},
          {label:'EBITDA',values:result.con.ebitda,bold:true,highlight:true},
        ]} months={months} cc={cc} showExport/>
      )}
    </div>
  )
}
// ── ACTUALS TAB ───────────────────────────────────────────────
function ActualsTab({config,months,cc,P,onSave}) {
  const [selUnit, setSelUnit] = useState(config.business_units.find(u=>u.active&&(!P.unitIds.length||P.unitIds.includes(u.id)))?.id||'')
  const [selPeriod, setSelPeriod] = useState(()=>{
    const d=new Date(); d.setDate(1)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
  })
  const [lineValues, setLineValues] = useState<Record<string,number>>({})
  const [fieldLineValues, setFieldLineValues] = useState<Record<string,number>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [allActuals, setAllActuals] = useState<any[]>([])

  // Rolling 24 months
  const periodMonths = Array.from({length:24},(_,i)=>{
    const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-12+i)
    return {value:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`,
      label:d.toLocaleString('en-GB',{month:'long',year:'numeric'})}
  })

  const visibleUnits = config.business_units.filter(u=>u.active&&(!P.unitIds.length||P.unitIds.includes(u.id)||P.role==='super_coach'||P.role==='ceo'||P.role==='finance_manager'))
  const canSeeAll = P.role==='super_coach'||P.role==='ceo'||P.role==='finance_manager'

  useEffect(()=>{
    if (!selUnit||!selPeriod) return
    setLoading(true)
    supabase.from('generic_actuals').select('*')
      .eq('client_id',config.client_id).eq('unit_id',selUnit).eq('period',selPeriod)
      .maybeSingle()
      .then(({data})=>{
        // line_values = manually entered (accountant); field_line_values =
        // written exclusively by aggregate_field_transactions(). Kept
        // separate so a field sync can never overwrite a manual entry, and
        // an accountant's save can never erase field data. Combined only
        // for display -- see docs/ACCOUNTING_ARCHITECTURE.md section 4.
        setLineValues(data?.line_values||{})
        setFieldLineValues(data?.field_line_values||{})
        setSubmitted(data?.submitted||false)
        setLoading(false)
      })
  },[selUnit,selPeriod])

  useEffect(()=>{
    if (!canSeeAll) return
    supabase.from('generic_actuals').select('*')
      .eq('client_id',config.client_id).eq('period',selPeriod)
      .then(({data})=>setAllActuals(data||[]))
  },[selPeriod,canSeeAll])

  async function save(submit=false) {
    setSaving(true)
    const {error} = await supabase.from('generic_actuals').upsert({
      client_id:config.client_id, unit_id:selUnit, period:selPeriod,
      line_values:lineValues, submitted:submit||(submitted&&!canSeeAll),
      submitted_at:submit?new Date().toISOString():undefined,
      submitted_by:submit?P.fullName:undefined,
      entered_by:P.fullName, entered_at:new Date().toISOString(),
      updated_at:new Date().toISOString(),
    },{onConflict:'client_id,unit_id,period'})
    if (!error) { if(submit) setSubmitted(true) }
    setSaving(false)
  }

  const lines = config.plan_lines.filter(l=>l.unit_id===selUnit&&l.active&&!l.name.startsWith('Add '))
  const sections:[string,string][] = [['revenue','Revenue'],['cost_of_sales','Cost of Sales'],['staff','Staff'],['direct_opex','Overheads']]

  // Combined = manually entered + field-app-derived, for the same line.
  // Never sourced from a single shared value -- see docs/ACCOUNTING_ARCHITECTURE.md
  // section 4 for why these must stay in separate columns internally.
  // Uses the shared src/lib/actuals.ts so tests exercise the same function.
  const combined = (lineId:string) => combinedActual(lineId, lineValues, fieldLineValues)
  const { totalRev, totalCOGS, totalCost, grossProfit, netResult } = computeActualsTotals(lines, lineValues, fieldLineValues)

  return (
    <div>
      {/* Selectors */}
      <div style={{display:'flex',gap:'0.75rem',flexWrap:'wrap',alignItems:'center',marginBottom:'1.25rem'}}>
        {canSeeAll&&(
          <select style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.38rem 0.6rem',border:`1px solid ${C.border}`,borderRadius:4,background:C.white,color:C.navy}}
            value={selUnit} onChange={e=>setSelUnit(e.target.value)}>
            {visibleUnits.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <select style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.38rem 0.6rem',border:`1px solid ${C.border}`,borderRadius:4,background:C.white,color:C.navy}}
          value={selPeriod} onChange={e=>setSelPeriod(e.target.value)}>
          {periodMonths.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        {submitted&&<Badge text="Submitted" color={C.green}/>}
      </div>

      {/* All units summary */}
      {canSeeAll&&allActuals.length>0&&(
        <div style={card}>
          <div style={{fontWeight:700,color:C.navy,marginBottom:'0.75rem',fontSize:'0.88rem'}}>All Units — {periodMonths.find(m=>m.value===selPeriod)?.label}</div>
          <div style={{overflowX:'auto'}}>
            <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.78rem',fontFamily:'monospace'}}>
              <thead><tr style={{background:C.navy,color:C.white}}>
                {['Business Unit','Revenue','Total Costs','Gross Profit','Status'].map(h=><th key={h} style={{padding:'8px 10px',textAlign:'left',fontWeight:600}}>{h}</th>)}
              </tr></thead>
              <tbody>{allActuals.map((a,i)=>{
                const aLines = config.plan_lines.filter(l=>l.unit_id===a.unit_id&&l.active)
                const aCombined = (lineId:string) => combinedActual(lineId, a.line_values||{}, a.field_line_values||{})
                const rev = aLines.filter(l=>l.category==='revenue').reduce((s,l)=>s+aCombined(l.id),0)
                const cogs = aLines.filter(l=>l.category==='cost_of_sales').reduce((s,l)=>s+aCombined(l.id),0)
                const cost = aLines.filter(l=>l.category!=='revenue').reduce((s,l)=>s+aCombined(l.id),0)
                const gp = rev-cogs
                return (
                  <tr key={a.id} style={{background:i%2===0?C.cream:C.white,cursor:'pointer'}} onClick={()=>setSelUnit(a.unit_id)}>
                    <td style={{padding:'8px 10px',fontWeight:600,color:C.navy}}>{config.business_units.find(u=>u.id===a.unit_id)?.name||a.unit_id}</td>
                    <td style={{padding:'8px 10px',color:C.green}}>{fmt(rev,cc)}</td>
                    <td style={{padding:'8px 10px',color:C.red}}>{fmt(cost,cc)}</td>
                    <td style={{padding:'8px 10px',fontWeight:700,color:gp>=0?C.green:C.red}}>{fmt(gp,cc)}</td>
                    <td style={{padding:'8px 10px'}}><Badge text={a.submitted?'Submitted':'Draft'} color={a.submitted?C.green:C.amber}/></td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Entry form */}
      <div style={card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem',flexWrap:'wrap',gap:'0.5rem'}}>
          <div style={{fontWeight:700,color:C.navy,fontSize:'0.9rem'}}>{config.business_units.find(u=>u.id===selUnit)?.name}</div>
          <div style={{display:'flex',gap:'0.5rem'}}>
            <div style={{fontFamily:'monospace',fontSize:'0.75rem',color:C.slate}}>Revenue: <strong style={{color:C.green}}>{fmt(totalRev,cc)}</strong> · Total Costs: <strong style={{color:C.red}}>{fmt(totalCost,cc)}</strong> · Gross Profit: <strong style={{color:grossProfit>=0?C.green:C.red}}>{fmt(grossProfit,cc)}</strong> · Net Result: <strong style={{color:netResult>=0?C.green:C.red}}>{fmt(netResult,cc)}</strong></div>
          </div>
        </div>
        {loading?<Spinner/>:(
          <>
            {sections.map(([cat,label])=>{
              const sLines = lines.filter(l=>l.category===cat)
              if (sLines.length===0) return null
              const sTotal = sLines.reduce((s,l)=>s+combined(l.id),0)
              return (
                <div key={cat} style={{marginBottom:'1.5rem'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:`2px solid ${cat==='revenue'?C.green:C.red}`,paddingBottom:'0.4rem',marginBottom:'0.75rem'}}>
                    <div style={{fontFamily:'monospace',fontSize:'0.68rem',letterSpacing:'0.1em',color:cat==='revenue'?C.green:C.red,textTransform:'uppercase',fontWeight:700}}>{label}</div>
                    <div style={{fontFamily:'monospace',fontSize:'0.78rem',fontWeight:700,color:cat==='revenue'?C.green:C.red}}>{fmt(sTotal,cc)}</div>
                  </div>
                  {sLines.map(l=>{
                    const fieldAmt = Number(fieldLineValues[l.id]||0)
                    return (
                    <div key={l.id} style={{padding:'0.45rem 0.75rem',background:C.cream,borderRadius:4,marginBottom:'0.5rem'}}>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 180px',alignItems:'center',gap:'0.75rem'}}>
                        <label htmlFor={`actual-${l.id}`} style={{fontWeight:600,fontSize:'0.82rem',color:C.navy,lineHeight:1.3}}>{l.name}</label>
                        <input id={`actual-${l.id}`} type="number"
                          style={{width:'100%',padding:'0.42rem 0.6rem',border:`1px solid ${C.border}`,borderRadius:4,fontSize:'0.83rem',fontFamily:'monospace',background:submitted&&!canSeeAll?'#F5F5F5':C.white,color:C.navy,textAlign:'right',boxSizing:'border-box'}}
                          value={lineValues[l.id]??''} placeholder="0"
                          disabled={submitted&&!canSeeAll}
                          onChange={e=>setLineValues(v=>({...v,[l.id]:Number(e.target.value)}))}/>
                      </div>
                      {/* Field-app figure is read-only here -- it's written exclusively
                          by aggregate_field_transactions(), never editable by hand.
                          The input above is manual entry only (e.g. a paper-only store);
                          the two are added together for every total on this page. */}
                      {fieldAmt!==0 && (
                        <div style={{fontSize:'0.7rem',color:C.teal,marginTop:'0.3rem',fontFamily:'monospace'}}>
                          + {fmt(fieldAmt,cc)} from Clearview Field · Total: {fmt(combined(l.id),cc)}
                        </div>
                      )}
                    </div>
                    )
                  })}
                </div>
              )
            })}
            <div style={{display:'flex',gap:'0.75rem',flexWrap:'wrap',marginTop:'1rem'}}>
              <button style={solidBtn(C.navy)} disabled={saving} onClick={()=>save(false)}>{saving?'Saving...':'Save Draft'}</button>
              {!submitted&&P.canEnterActuals&&(
                <button style={solidBtn(C.green)} disabled={saving} onClick={()=>save(true)}>Submit for Approval</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── MANAGEMENT EVENTS TAB ─────────────────────────────────────
function SpendRequestsTab({clientId,config,cc,P}) {
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({unit_id:'',category:'direct_opex',description:'',amount:0})

  useEffect(()=>{
    let q = supabase.from('generic_spend_requests').select('*').eq('client_id',clientId).order('created_at',{ascending:false})
    if (P.role==='unit_head'||P.role==='accounts_assistant') q = q.eq('requested_by',P.userId)
    q.then(({data})=>{ setRequests(data||[]); setLoading(false) })
  },[clientId,P.userId])

  async function submit() {
    if (!form.description||!form.amount) return
    const {data,error} = await supabase.from('generic_spend_requests').insert([{
      client_id:clientId, ...form, requested_by:P.userId, requested_by_name:P.fullName,
      status:'pending_fm', created_at:new Date().toISOString(), updated_at:new Date().toISOString(),
      currency:config.currency,
    }]).select().single()
    if (!error&&data) { setRequests(r=>[data,...r]); setShowForm(false); setForm({unit_id:'',category:'direct_opex',description:'',amount:0}) }
  }

  const statusColor = (s:string) => s==='approved'?C.green:s==='rejected'?C.red:s==='pending_ceo'?C.cyan:C.amber

  if (loading) return <Spinner/>
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem'}}>
        <div style={secH}>Spend Requests</div>
        {P.canSubmitRequest&&<button style={addBtn()} onClick={()=>setShowForm(!showForm)}>+ New Request</button>}
      </div>
      {showForm&&(
        <div style={{...card,border:`1px solid ${C.cyan}`}}>
          <div style={fGrid}>
            <div><label style={lbl}>Business Unit</label><select style={inp} value={form.unit_id} onChange={e=>setForm(f=>({...f,unit_id:e.target.value}))}>
              <option value="">Select unit</option>
              {config.business_units.filter(u=>u.active&&(!P.unitIds.length||P.unitIds.includes(u.id))).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
            </select></div>
            <div><label style={lbl}>Category</label><select style={inp} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
              {['cost_of_sales','staff','direct_opex','shared'].map(c=><option key={c} value={c}>{c.replace('_',' ')}</option>)}
            </select></div>
            <div><label style={lbl}>Amount ({cc})</label><input type="number" style={inp} value={form.amount||''} onChange={e=>setForm(f=>({...f,amount:Number(e.target.value)}))}/></div>
            <div style={{gridColumn:'1/-1'}}><label style={lbl}>Description</label><textarea style={{...inp,minHeight:60,resize:'vertical'}} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></div>
          </div>
          <div style={{display:'flex',gap:'0.6rem',marginTop:'0.85rem'}}>
            <button style={solidBtn()} onClick={submit}>Submit Request</button>
            <button style={addBtn(true,C.slate)} onClick={()=>setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}
      {requests.length===0&&!showForm&&<div style={{...card,textAlign:'center',color:C.slate,padding:'2rem'}}>No requests yet.</div>}
      {requests.map(r=>(
        <div key={r.id} style={{...card,borderLeft:`4px solid ${statusColor(r.status)}`}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'0.5rem'}}>
            <div>
              <div style={{fontWeight:700,fontSize:'0.88rem',color:C.navy}}>{r.description}</div>
              <div style={{fontSize:'0.75rem',color:C.slate}}>
                {config.business_units.find(u=>u.id===r.unit_id)?.name||'General'} · {r.category?.replace('_',' ')} · {r.requested_by_name} · {new Date(r.created_at).toLocaleDateString('en-GB')}
              </div>
            </div>
            <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
              <span style={{fontFamily:'monospace',fontWeight:700,color:C.navy}}>{fmt(r.amount,cc)}</span>
              <Badge text={r.status.replace('_',' ')} color={statusColor(r.status)}/>
            </div>
          </div>
          {r.fm_note&&<div style={{marginTop:'0.5rem',fontSize:'0.8rem',color:C.slate,fontStyle:'italic'}}>FM: {r.fm_note}</div>}
          {r.ceo_note&&<div style={{marginTop:'0.25rem',fontSize:'0.8rem',color:C.slate,fontStyle:'italic'}}>CEO: {r.ceo_note}</div>}
        </div>
      ))}
    </div>
  )
}

// ── APPROVALS TAB ─────────────────────────────────────────────
function ApprovalsTab({clientId,config,cc,P}) {
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState<Record<string,string>>({})

  const isFM = P.role==='finance_manager'||P.role==='super_coach'
  const isCEO = P.role==='ceo'||P.role==='super_coach'
  // Check delegation
  const delegatedApprover = config.settings?.delegated_approver_id === P.userId

  useEffect(()=>{
    supabase.from('generic_spend_requests').select('*').eq('client_id',clientId)
      .in('status',['pending_fm','pending_ceo']).order('created_at',{ascending:false})
      .then(({data})=>{ setRequests(data||[]); setLoading(false) })
  },[clientId])

  async function fmAction(id:string, forward:boolean) {
    const note = notes[id]||''
    const newStatus = forward ? 'pending_ceo' : 'rejected'
    const {data} = await supabase.from('generic_spend_requests').update({
      status:newStatus, fm_note:note,
      fm_reviewed_at:new Date().toISOString(), fm_reviewed_by:P.fullName,
      updated_at:new Date().toISOString(),
    }).eq('id',id).select().single()
    if (data) setRequests(r=>r.filter(x=>x.id!==id))
  }

  async function ceoAction(id:string, approved:boolean) {
    const note = notes[id]||''
    const {data} = await supabase.from('generic_spend_requests').update({
      status:approved?'approved':'rejected', ceo_note:note,
      ceo_decided_at:new Date().toISOString(), ceo_decided_by:P.fullName,
      updated_at:new Date().toISOString(),
    }).eq('id',id).select().single()
    if (data) setRequests(r=>r.filter(x=>x.id!==id))
  }

  const pendingFM = requests.filter(r=>r.status==='pending_fm')
  const pendingCEO = requests.filter(r=>r.status==='pending_ceo')

  if (loading) return <Spinner/>
  return (
    <div>
      <div style={secH}>Approvals</div>
      {isFM&&pendingFM.length>0&&(
        <div style={{...card,border:`1px solid ${C.amber}`}}>
          <div style={{fontWeight:700,color:C.amber,marginBottom:'0.75rem'}}>Pending FM Review ({pendingFM.length})</div>
          {pendingFM.map(r=>(
            <div key={r.id} style={{border:`1px solid ${C.border}`,borderRadius:6,padding:'0.85rem',marginBottom:'0.75rem',background:C.white}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.5rem'}}>
                <div>
                  <div style={{fontWeight:700,color:C.navy}}>{r.description}</div>
                  <div style={{fontSize:'0.75rem',color:C.slate}}>{config.business_units.find(u=>u.id===r.unit_id)?.name||'General'} · {r.requested_by_name} · {new Date(r.created_at).toLocaleDateString('en-GB')}</div>
                </div>
                <span style={{fontFamily:'monospace',fontWeight:700,color:C.navy}}>{fmt(r.amount,cc)}</span>
              </div>
              <textarea style={{...inp,minHeight:50,resize:'vertical',marginBottom:'0.5rem'}} placeholder="Add note (optional)" value={notes[r.id]||''} onChange={e=>setNotes(n=>({...n,[r.id]:e.target.value}))}/>
              <div style={{display:'flex',gap:'0.5rem'}}>
                <button style={solidBtn(C.cyan,true)} onClick={()=>fmAction(r.id,true)}>Forward to CEO</button>
                <button style={solidBtn(C.red,true)} onClick={()=>fmAction(r.id,false)}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {(isCEO||delegatedApprover)&&pendingCEO.length>0&&(
        <div style={{...card,border:`1px solid ${C.cyan}`}}>
          <div style={{fontWeight:700,color:C.navy,marginBottom:'0.75rem'}}>Awaiting CEO Approval ({pendingCEO.length})</div>
          {pendingCEO.map(r=>(
            <div key={r.id} style={{border:`1px solid ${C.border}`,borderRadius:6,padding:'0.85rem',marginBottom:'0.75rem',background:C.white}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.5rem'}}>
                <div>
                  <div style={{fontWeight:700,color:C.navy}}>{r.description}</div>
                  <div style={{fontSize:'0.75rem',color:C.slate}}>{config.business_units.find(u=>u.id===r.unit_id)?.name||'General'} · {r.requested_by_name} · {new Date(r.created_at).toLocaleDateString('en-GB')}</div>
                  {r.fm_note&&<div style={{fontSize:'0.78rem',color:C.slate,fontStyle:'italic',marginTop:'0.25rem'}}>FM note: {r.fm_note}</div>}
                </div>
                <span style={{fontFamily:'monospace',fontWeight:700,color:C.navy}}>{fmt(r.amount,cc)}</span>
              </div>
              <textarea style={{...inp,minHeight:50,resize:'vertical',marginBottom:'0.5rem'}} placeholder="Add note (optional)" value={notes[r.id]||''} onChange={e=>setNotes(n=>({...n,[r.id]:e.target.value}))}/>
              <div style={{display:'flex',gap:'0.5rem'}}>
                <button style={solidBtn(C.green,true)} onClick={()=>ceoAction(r.id,true)}>Approve</button>
                <button style={solidBtn(C.red,true)} onClick={()=>ceoAction(r.id,false)}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {pendingFM.length===0&&pendingCEO.length===0&&(
        <div style={{...card,textAlign:'center',color:C.slate,padding:'2rem'}}>No pending approvals.</div>
      )}
    </div>
  )
}
// ── TEAM TAB ─────────────────────────────────────────────────
function TeamTab({clientId,config,P}) {
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({email:'',full_name:'',role:'unit_head',unit_ids:[] as string[]})
  const [saving, setSaving] = useState(false)

  useEffect(()=>{
    supabase.from('user_profiles').select('id,role,full_name,email,assigned_unit_ids,status,can_manage_catalogue')
      .eq('client_id',clientId)
      .then(({data})=>{ setMembers(data||[]); setLoading(false) })
  },[clientId])

  async function invite() {
    if (!inviteForm.email||!inviteForm.full_name) return
    setSaving(true)
    // Insert pending profile -- actual auth invite handled separately
    const {data,error} = await supabase.from('user_profiles').insert([{
      client_id:clientId, email:inviteForm.email, full_name:inviteForm.full_name,
      role:inviteForm.role, assigned_unit_ids:inviteForm.unit_ids,
      status:'invited', invited_at:new Date().toISOString(), invited_by:P.userId,
    }]).select().single()
    if (!error&&data) { setMembers(m=>[...m,data]); setShowInvite(false) }
    setSaving(false)
  }

  const roles = [['ceo','CEO'],['finance_manager','Finance Manager'],['unit_head','Unit Head'],['accounts_assistant','Accounts Assistant']]

  if (loading) return <Spinner/>
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem'}}>
        <div style={secH}>Team</div>
        {P.canManageTeam&&<button style={addBtn()} onClick={()=>setShowInvite(!showInvite)}>+ Invite Member</button>}
      </div>
      {showInvite&&(
        <div style={{...card,border:`1px solid ${C.cyan}`}}>
          <div style={fGrid}>
            <div><label style={lbl}>Full Name</label><input style={inp} value={inviteForm.full_name} onChange={e=>setInviteForm(f=>({...f,full_name:e.target.value}))}/></div>
            <div><label style={lbl}>Email</label><input type="email" style={inp} value={inviteForm.email} onChange={e=>setInviteForm(f=>({...f,email:e.target.value}))}/></div>
            <div><label style={lbl}>Role</label><select style={inp} value={inviteForm.role} onChange={e=>setInviteForm(f=>({...f,role:e.target.value}))}>
              {roles.map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select></div>
          </div>
          {(inviteForm.role==='unit_head'||inviteForm.role==='accounts_assistant')&&(
            <div style={{marginTop:'0.75rem'}}>
              <label style={lbl}>Assign to Units</label>
              <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap',marginTop:'0.3rem'}}>
                {config.business_units.filter(u=>u.active).map(u=>(
                  <label key={u.id} style={{display:'flex',alignItems:'center',gap:'0.4rem',fontSize:'0.82rem',cursor:'pointer',padding:'0.3rem 0.6rem',border:`1px solid ${inviteForm.unit_ids.includes(u.id)?C.cyan:C.border}`,borderRadius:4,background:inviteForm.unit_ids.includes(u.id)?'#EBF8FF':C.white}}>
                    <input type="checkbox" checked={inviteForm.unit_ids.includes(u.id)} onChange={e=>setInviteForm(f=>({...f,unit_ids:e.target.checked?[...f.unit_ids,u.id]:f.unit_ids.filter(id=>id!==u.id)}))}/>{u.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div style={{display:'flex',gap:'0.6rem',marginTop:'0.85rem'}}>
            <button style={solidBtn()} disabled={saving} onClick={invite}>{saving?'Saving...':'Add Member'}</button>
            <button style={addBtn(true,C.slate)} onClick={()=>setShowInvite(false)}>Cancel</button>
          </div>
        </div>
      )}
      {members.length===0&&!showInvite&&<div style={{...card,textAlign:'center',color:C.slate,padding:'2rem'}}>No team members yet.</div>}
      {members.map(m=>(
        <div key={m.id} style={{...card,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.5rem'}}>
          <div>
            <div style={{fontWeight:700,color:C.navy}}>{m.full_name}</div>
            <div style={{fontSize:'0.78rem',color:C.slate}}>{m.email} · {roles.find(r=>r[0]===m.role)?.[1]||m.role}</div>
            {m.assigned_unit_ids?.length>0&&(
              <div style={{fontSize:'0.75rem',color:C.slate,marginTop:'0.2rem'}}>
                Units: {m.assigned_unit_ids.map((id:string)=>config.business_units.find(u=>u.id===id)?.name||id).join(', ')}
              </div>
            )}
            {(P.role==='ceo'||P.role==='finance_manager'||P.canManageTeam)&&m.role!=='ceo'&&m.role!=='finance_manager'&&(
              <label style={{display:'flex',alignItems:'center',gap:'0.4rem',fontSize:'0.75rem',color:C.slate,marginTop:'0.35rem',cursor:'pointer'}}>
                <input type="checkbox" checked={!!m.can_manage_catalogue}
                  onChange={async e=>{
                    await supabase.from('user_profiles').update({can_manage_catalogue:e.target.checked}).eq('id',m.id)
                    setMembers(ms=>ms.map(x=>x.id!==m.id?x:{...x,can_manage_catalogue:e.target.checked}))
                  }}/>
                Can manage Field Catalogue (prices & products)
              </label>
            )}
          </div>
          <Badge text={m.status||'active'} color={m.status==='invited'?C.amber:C.green}/>
        </div>
      ))}
    </div>
  )
}

// ── FIELD OPERATORS TAB (Clearview Field mobile capture) ──────
function FieldOperatorManager({clientId,config,P}) {
  const [operators, setOperators] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string|null>(null)
  const [form, setForm] = useState({display_name:'',phone:'',business_unit_id:'',sync_frequency:'end_of_day',expires_in_days:''})

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/field/admin/operators?client_id=${encodeURIComponent(clientId)}`)
      const data = await res.json()
      setOperators(data.operators||[])
    } catch { /* handled by empty state below */ }
    setLoading(false)
  }
  useEffect(()=>{ load() },[clientId])

  async function addOperator() {
    if (!form.display_name || !form.business_unit_id) return
    setSaving(true)
    try {
      await fetch('/api/field/admin/operators', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          client_id:clientId, business_unit_id:form.business_unit_id,
          display_name:form.display_name, phone:form.phone||null,
          sync_frequency:form.sync_frequency,
          expires_in_days:form.expires_in_days||undefined,
        }),
      })
      setForm({display_name:'',phone:'',business_unit_id:'',sync_frequency:'end_of_day',expires_in_days:''})
      setShowAdd(false)
      await load()
    } catch { alert('Could not create operator. Please try again.') }
    setSaving(false)
  }

  async function toggleActive(operatorId:string, active:boolean) {
    await fetch('/api/field/admin/operators', {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({operator_id:operatorId, active}),
    })
    await load()
  }

  async function issueNewToken(operatorId:string) {
    if (!window.confirm('Issue a new token for this operator? Their old token(s) will still work until they expire -- this adds a new one, it does not revoke existing tokens.')) return
    await fetch('/api/field/admin/operators', {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({operator_id:operatorId, issue_new_token:true}),
    })
    await load()
  }

  function fieldLink(token:string) {
    return `${typeof window!=='undefined'?window.location.origin:'https://clearview.habibonifade.com'}/field?token=${token}`
  }

  function copyLink(token:string, id:string) {
    navigator.clipboard?.writeText(fieldLink(token))
    setCopiedId(id)
    setTimeout(()=>setCopiedId(null),2000)
  }

  if (loading) return <Spinner/>
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div style={secH}>Clearview Field — Mobile Operators</div>
        {P.canManageTeam&&<button style={addBtn()} onClick={()=>setShowAdd(!showAdd)}>+ Add Operator</button>}
      </div>
      <p style={{fontSize:'0.82rem',color:C.slate,lineHeight:1.6,marginBottom:'1.1rem'}}>
        Each operator is tied to one business unit and gets a unique link to log sales and costs from their phone. No login required on their end -- the link itself is their access.
      </p>

      {showAdd&&(
        <div style={{...card,border:`1px solid ${C.cyan}`}}>
          <div style={fGrid}>
            <div><label style={lbl}>Operator Name</label><input style={inp} value={form.display_name} onChange={e=>setForm(f=>({...f,display_name:e.target.value}))} placeholder="e.g. John Mukasa"/></div>
            <div><label style={lbl}>Phone (optional)</label><input style={inp} value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
            <div><label style={lbl}>Business Unit</label>
              <select style={inp} value={form.business_unit_id} onChange={e=>setForm(f=>({...f,business_unit_id:e.target.value}))}>
                <option value="">Select a unit...</option>
                {config.business_units.filter(u=>u.active).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Sync Frequency</label>
              <select style={inp} value={form.sync_frequency} onChange={e=>setForm(f=>({...f,sync_frequency:e.target.value}))}>
                <option value="real_time">Real time (when online)</option>
                <option value="end_of_day">End of day</option>
              </select>
            </div>
            <div><label style={lbl}>Link Expires In (days, optional)</label><input type="number" style={inp} value={form.expires_in_days} onChange={e=>setForm(f=>({...f,expires_in_days:e.target.value}))} placeholder="Never expires if blank"/></div>
          </div>
          <div style={{display:'flex',gap:'0.6rem',marginTop:'0.85rem'}}>
            <button style={solidBtn()} disabled={saving} onClick={addOperator}>{saving?'Creating...':'Create Operator & Link'}</button>
            <button style={addBtn(true,C.slate)} onClick={()=>setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {operators.length===0&&!showAdd&&<div style={{...card,textAlign:'center',color:C.slate,padding:'2rem'}}>No field operators yet. Add one to start capturing sales and costs from the field.</div>}

      {operators.map(op=>{
        const unit = config.business_units.find(u=>u.id===op.business_unit_id)
        const activeTokens = (op.tokens||[]).filter((t:any)=>!t.expires_at || new Date(t.expires_at) > new Date())
        const latestToken = activeTokens.sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0]
        return (
          <div key={op.id} style={{...card,opacity:op.active?1:0.55}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'0.6rem'}}>
              <div>
                <div style={{fontWeight:700,color:C.navy}}>{op.display_name}{!op.active&&<span style={{marginLeft:8}}><Badge text="Inactive" color={C.red}/></span>}</div>
                <div style={{fontSize:'0.78rem',color:C.slate}}>{unit?.name||op.business_unit_id}{op.phone?` · ${op.phone}`:''} · {op.sync_frequency==='real_time'?'Real time':'End of day'}</div>
              </div>
              <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap'}}>
                {latestToken&&op.active&&(
                  <button style={addBtn(true)} onClick={()=>copyLink(latestToken.token,op.id)}>{copiedId===op.id?'Copied!':'Copy Field Link'}</button>
                )}
                {op.active&&<button style={addBtn(true,C.teal)} onClick={()=>issueNewToken(op.id)}>New Link</button>}
                {P.canManageTeam&&(
                  op.active
                    ? <button style={addBtn(true,C.red)} onClick={()=>toggleActive(op.id,false)}>Deactivate</button>
                    : <button style={addBtn(true,C.green)} onClick={()=>toggleActive(op.id,true)}>Reactivate</button>
                )}
              </div>
            </div>
            {latestToken&&(
              <div style={{marginTop:'0.6rem',fontSize:'0.7rem',color:C.slate,fontFamily:'monospace',wordBreak:'break-all'}}>
                {fieldLink(latestToken.token)}
                {latestToken.expires_at&&<div style={{color:C.amber,marginTop:'0.2rem'}}>Expires {new Date(latestToken.expires_at).toLocaleDateString()}</div>}
                {latestToken.last_used_at&&<div style={{marginTop:'0.2rem'}}>Last synced {new Date(latestToken.last_used_at).toLocaleString()}</div>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── CATALOGUE (products & services, with pricing) ──────────────
// This is the business's own price list, not the coach's. The CEO or
// Finance Manager grants specific staff (via the "Manage Field Catalogue"
// permission in Team) the right to edit it. Field operators never see or
// enter a price -- they pick an item from here and record a volume; the
// price and revenue amount are always calculated from what's set here.
function CatalogueManager({clientId,config,P}) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string|null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [editingCostId, setEditingCostId] = useState<string|null>(null)
  const [editCostPrice, setEditCostPrice] = useState('')
  const [editCostLine, setEditCostLine] = useState('')
  const [form, setForm] = useState({name:'',item_type:'product',price:'',unit_label:'',business_unit_id:'',plan_line_id:'',cost_price:'',cogs_plan_line_id:''})

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/field/admin/catalogue?client_id=${encodeURIComponent(clientId)}`)
      const data = await res.json()
      setItems(data.items||[])
    } catch { /* handled by empty state below */ }
    setLoading(false)
  }
  useEffect(()=>{ load() },[clientId])

  const revenueLinesForUnit = (unitId:string) =>
    (config.plan_lines||[]).filter((l:any)=>l.unit_id===unitId && l.category==='revenue' && l.active)
  const cogsLinesForUnit = (unitId:string) =>
    (config.plan_lines||[]).filter((l:any)=>l.unit_id===unitId && l.category==='cost_of_sales' && l.active)

  async function addItem() {
    if (!form.name || !form.business_unit_id || !form.plan_line_id || form.price==='') return
    if (form.cost_price!=='' && !form.cogs_plan_line_id) { alert('Select a COGS category to go with the cost price.'); return }
    setSaving(true)
    try {
      await fetch('/api/field/admin/catalogue', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          client_id: clientId, business_unit_id: form.business_unit_id, plan_line_id: form.plan_line_id,
          name: form.name, item_type: form.item_type, price: Number(form.price), unit_label: form.unit_label||null,
          created_by: P.userId,
          cost_price: form.cost_price===''?null:Number(form.cost_price),
          cogs_plan_line_id: form.cogs_plan_line_id||null,
        }),
      })
      setForm({name:'',item_type:'product',price:'',unit_label:'',business_unit_id:'',plan_line_id:'',cost_price:'',cogs_plan_line_id:''})
      setShowAdd(false)
      await load()
    } catch { alert('Could not save this catalogue item. Please try again.') }
    setSaving(false)
  }

  async function savePrice(id:string) {
    if (editPrice==='' || Number(editPrice)<0) return
    await fetch('/api/field/admin/catalogue', {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id, price: Number(editPrice) }),
    })
    setEditingId(null)
    await load()
  }

  async function saveCostPrice(id:string) {
    if (editCostPrice!=='' && !editCostLine) { alert('Select a COGS category to go with the cost price.'); return }
    await fetch('/api/field/admin/catalogue', {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        id,
        cost_price: editCostPrice===''?null:Number(editCostPrice),
        cogs_plan_line_id: editCostPrice===''?null:editCostLine,
      }),
    })
    setEditingCostId(null)
    await load()
  }

  async function toggleActive(id:string, active:boolean) {
    await fetch('/api/field/admin/catalogue', {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id, active }),
    })
    await load()
  }

  const canEdit = P.canManageTeam || P.canManageCatalogue

  if (loading) return <Spinner/>
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div style={secH}>Catalogue — Products &amp; Services</div>
        {canEdit&&<button style={addBtn()} onClick={()=>setShowAdd(!showAdd)}>+ Add Item</button>}
      </div>
      <p style={{fontSize:'0.82rem',color:C.slate,lineHeight:1.6,marginBottom:'1.1rem'}}>
        This is your price list. Field operators pick an item from here and record how much was sold -- the price shown here is what's used automatically. They never enter a price themselves. The CEO or Finance Manager can grant other staff permission to edit this list from the Team tab.
      </p>

      {!canEdit && <div style={{...card,background:'#FFF8E8',border:`1px solid ${C.amber}`,fontSize:'0.82rem',color:C.navy,marginBottom:'1rem'}}>You can view the catalogue but don't have permission to edit it. Ask your CEO or Finance Manager to grant you "Manage Field Catalogue" access in Team if you need to make changes.</div>}

      {showAdd&&canEdit&&(
        <div style={{...card,border:`1px solid ${C.cyan}`}}>
          <div style={fGrid}>
            <div><label style={lbl}>Item Name</label><input style={inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Maize 90kg bag"/></div>
            <div><label style={lbl}>Type</label>
              <select style={inp} value={form.item_type} onChange={e=>setForm(f=>({...f,item_type:e.target.value}))}>
                <option value="product">Product</option>
                <option value="service">Service</option>
              </select>
            </div>
            <div><label style={lbl}>Business Unit</label>
              <select style={inp} value={form.business_unit_id} onChange={e=>setForm(f=>({...f,business_unit_id:e.target.value,plan_line_id:''}))}>
                <option value="">Select a unit...</option>
                {config.business_units.filter((u:any)=>u.active).map((u:any)=><option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Category</label>
              <select style={inp} value={form.plan_line_id} disabled={!form.business_unit_id} onChange={e=>setForm(f=>({...f,plan_line_id:e.target.value}))}>
                <option value="">{form.business_unit_id?'Select a category...':'Select a unit first'}</option>
                {revenueLinesForUnit(form.business_unit_id).map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <div style={{fontSize:'0.7rem',color:C.slate,marginTop:'0.25rem'}}>Different brands or sizes of the same thing (e.g. two fertiliser brands) should share one category -- that's what rolls up into a single revenue figure.</div>
            </div>
            <div><label style={lbl}>Price</label><input type="number" style={inp} value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="0"/></div>
            <div><label style={lbl}>Unit Label (optional)</label><input style={inp} value={form.unit_label} onChange={e=>setForm(f=>({...f,unit_label:e.target.value}))} placeholder="e.g. bag, kg, session"/></div>
            <div><label style={lbl}>Cost Price (optional)</label><input type="number" style={inp} value={form.cost_price} onChange={e=>setForm(f=>({...f,cost_price:e.target.value}))} placeholder="Leave blank if unknown"/>
              <div style={{fontSize:'0.7rem',color:C.slate,marginTop:'0.25rem'}}>What this actually costs to procure. Never shown to field operators -- when set, every sale automatically books a matching cost-of-sales entry.</div>
            </div>
            {form.cost_price!=='' && (
              <div><label style={lbl}>COGS Category</label>
                <select style={inp} disabled={!form.business_unit_id} value={form.cogs_plan_line_id} onChange={e=>setForm(f=>({...f,cogs_plan_line_id:e.target.value}))}>
                  <option value="">{form.business_unit_id?'Select a COGS category...':'Select a unit first'}</option>
                  {cogsLinesForUnit(form.business_unit_id).map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div style={{display:'flex',gap:'0.6rem',marginTop:'0.85rem'}}>
            <button style={solidBtn()} disabled={saving} onClick={addItem}>{saving?'Saving...':'Add to Catalogue'}</button>
            <button style={addBtn(true,C.slate)} onClick={()=>setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {items.length===0&&!showAdd&&<div style={{...card,textAlign:'center',color:C.slate,padding:'2rem'}}>No catalogue items yet. Add your products and services with their prices so field operators can start logging sales.</div>}

      {config.business_units.filter((u:any)=>items.some((i:any)=>i.business_unit_id===u.id)).map((unit:any)=>{
        const unitItems = items.filter((i:any)=>i.business_unit_id===unit.id)
        const categoryIds = Array.from(new Set(unitItems.map((i:any)=>i.plan_line_id)))
        return (
          <div key={unit.id} style={{marginBottom:'1.5rem'}}>
            <div style={{fontFamily:'monospace',fontSize:'0.75rem',letterSpacing:'0.06em',color:C.navy,fontWeight:700,marginBottom:'0.6rem',paddingBottom:'0.35rem',borderBottom:`2px solid ${C.navy}`}}>{unit.name}</div>
            {categoryIds.map((catId:any)=>{
              const line = (config.plan_lines||[]).find((l:any)=>l.id===catId)
              const catItems = unitItems.filter((i:any)=>i.plan_line_id===catId)
              return (
                <div key={catId} style={{marginBottom:'0.85rem',marginLeft:'0.5rem'}}>
                  <div style={{fontSize:'0.78rem',color:C.teal,fontWeight:600,marginBottom:'0.4rem'}}>{line?.name||catId} <span style={{color:C.slate,fontWeight:400}}>({catItems.length} {catItems.length===1?'brand':'brands'})</span></div>
                  {catItems.map((item:any)=>(
                    <div key={item.id} style={{...card,opacity:item.active?1:0.55,marginLeft:'0.75rem'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.6rem'}}>
                        <div>
                          <div style={{fontWeight:700,color:C.navy}}>{item.name}{!item.active&&<span style={{marginLeft:8}}><Badge text="Inactive" color={C.red}/></span>}</div>
                          <div style={{fontSize:'0.78rem',color:C.slate}}>{item.item_type==='service'?'Service':'Product'}</div>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:'0.6rem'}}>
                          {editingId===item.id ? (
                            <>
                              <input type="number" style={{...inp,width:110,marginBottom:0}} value={editPrice} onChange={e=>setEditPrice(e.target.value)} autoFocus/>
                              <button style={addBtn(true,C.green)} onClick={()=>savePrice(item.id)}>Save</button>
                              <button style={addBtn(true,C.slate)} onClick={()=>setEditingId(null)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <div style={{fontFamily:'monospace',fontWeight:700,color:C.navy}}>{fmt(item.price,config.currency)}{item.unit_label?<span style={{color:C.slate,fontWeight:400}}> / {item.unit_label}</span>:null}</div>
                              {canEdit&&<button style={addBtn(true)} onClick={()=>{setEditingId(item.id);setEditPrice(String(item.price))}}>Edit Price</button>}
                              {canEdit&&(item.active
                                ? <button style={addBtn(true,C.red)} onClick={()=>toggleActive(item.id,false)}>Deactivate</button>
                                : <button style={addBtn(true,C.green)} onClick={()=>toggleActive(item.id,true)}>Reactivate</button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      {/* Cost price -- for automatic Gross Profit / COGS
                          (docs/ACCOUNTING_ARCHITECTURE.md section 3). Never
                          shown to field operators; this view is only ever
                          reached by roles who can already see this page. */}
                      <div style={{marginTop:'0.5rem',paddingTop:'0.5rem',borderTop:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.5rem'}}>
                        {editingCostId===item.id ? (
                          <>
                            <input type="number" style={{...inp,width:110,marginBottom:0}} value={editCostPrice} onChange={e=>setEditCostPrice(e.target.value)} placeholder="Leave blank for none" autoFocus/>
                            <select style={{...inp,width:200,marginBottom:0}} value={editCostLine} onChange={e=>setEditCostLine(e.target.value)}>
                              <option value="">Select COGS category...</option>
                              {cogsLinesForUnit(item.business_unit_id).map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                            <button style={addBtn(true,C.green)} onClick={()=>saveCostPrice(item.id)}>Save</button>
                            <button style={addBtn(true,C.slate)} onClick={()=>setEditingCostId(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <div style={{fontSize:'0.78rem',color:C.slate}}>
                              Cost price: <span style={{fontFamily:'monospace',fontWeight:700,color:item.cost_price?C.navy:C.amber}}>{item.cost_price?fmt(item.cost_price,config.currency):'Not set — no automatic COGS'}</span>
                              {item.cost_price_updated_at&&<span style={{marginLeft:8}}>· reviewed {new Date(item.cost_price_updated_at).toLocaleDateString()}</span>}
                            </div>
                            {canEdit&&<button style={addBtn(true)} onClick={()=>{setEditingCostId(item.id);setEditCostPrice(item.cost_price?String(item.cost_price):'');setEditCostLine(item.cogs_plan_line_id||'')}}>{item.cost_price?'Edit Cost Price':'Set Cost Price'}</button>}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ── SETTINGS TAB ─────────────────────────────────────────────
function SettingsTab({config,P,onSave}) {
  const [form, setForm] = useState({...config})
  const [saving, setSaving] = useState(false)
  const [activeSection, setActiveSection] = useState('general')

  async function save() {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  function addUnit() {
    const id = `unit_${Date.now()}`
    const newUnit: any = {id,name:'New Unit',short:'Unit',type:'product',color:C.cyan,headcount:0,active:true,sort_order:form.business_units.length}
    setForm(f=>({...f,business_units:[...f.business_units,newUnit]}))
  }

  function updateUnit(id:string, updates:any) {
    setForm(f=>({...f,business_units:f.business_units.map(u=>u.id===id?{...u,...updates}:u)}))
  }

  function addSubUnit(parentId:string) {
    const id = `unit_${Date.now()}`
    const parent = form.business_units.find(u=>u.id===parentId)
    const newUnit: any = {id,name:`${parent?.name||''} Group 1`,short:'Grp 1',type:parent?.type||'product',color:parent?.color||C.cyan,headcount:0,active:true,parent_id:parentId,sort_order:form.business_units.length}
    setForm(f=>({...f,business_units:[...f.business_units,newUnit]}))
  }

  const sections = [['general','General'],['units','Business Units'],['capital','Capital Structure'],['credit','Debt Obligations'],['delegation','Approval Delegation']]

  return (
    <div>
      <div style={{display:'flex',gap:'0.35rem',marginBottom:'1.25rem',borderBottom:`1px solid ${C.border}`,paddingBottom:'0.5rem'}}>
        {sections.map(([id,label])=>(
          <button key={id} style={{fontFamily:'monospace',fontSize:'0.72rem',padding:'0.4rem 0.85rem',border:'none',
            background:activeSection===id?C.navy:C.white,color:activeSection===id?C.white:C.slate,
            borderRadius:4,cursor:'pointer'}} onClick={()=>setActiveSection(id)}>{label}</button>
        ))}
      </div>

      {activeSection==='general'&&(
        <div style={card}>
          <div style={secH}>General Settings</div>
          <div style={fGrid}>
            <div><label style={lbl}>Business Name</label><input style={inp} value={form.business_name} onChange={e=>setForm(f=>({...f,business_name:e.target.value}))}/></div>
            <div><label style={lbl}>Currency</label><select style={inp} value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))}>
              {['UGX','KES','NGN','GHS','USD','GBP'].map(c=><option key={c} value={c}>{c}</option>)}
            </select></div>
            <div><label style={lbl}>Planning Start Month</label><input type="date" style={inp} value={form.start_date} onChange={e=>setForm(f=>({...f,start_date:e.target.value}))}/></div>
            <div><label style={lbl}>Planning Horizon (months)</label><select style={inp} value={form.planning_months} onChange={e=>setForm(f=>({...f,planning_months:Number(e.target.value)}))}>
              <option value={12}>12 months</option>
              <option value={24}>24 months</option>
              <option value={36}>36 months</option>
            </select></div>
            <div><label style={lbl}>Shared Cost Allocation (% by headcount)</label>
              <input type="number" min={0} max={100} style={inp} value={Math.round((form.settings.shared_cost_fixed_pct||0.5)*100)} onChange={e=>setForm(f=>({...f,settings:{...f.settings,shared_cost_fixed_pct:Number(e.target.value)/100}}))}/>
              <div style={hint}>Remainder allocated by revenue share</div>
            </div>
            <div><label style={lbl}>Corporate Tax Rate (%)</label>
              <input type="number" min={0} max={100} style={inp} value={Math.round((form.settings.corporate_tax_rate||0.30)*100)} onChange={e=>setForm(f=>({...f,settings:{...f.settings,corporate_tax_rate:Number(e.target.value)/100}}))}/>
            </div>
            <div><label style={lbl}>Opening Cash Balance</label><input type="number" style={inp} value={form.settings.opening_cash_balance||0} onChange={e=>setForm(f=>({...f,settings:{...f.settings,opening_cash_balance:Number(e.target.value)}}))}/></div>
          </div>
        </div>
      )}

      {activeSection==='units'&&(
        <div>
          {/* Top-level units */}
          {form.business_units.filter(u=>!u.parent_id).map(u=>(
            <div key={u.id} style={{...card,borderTop:`4px solid ${u.color||C.cyan}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'0.75rem',marginBottom:'1rem'}}>
                <div style={{fontWeight:700,color:C.navy}}>{u.name}</div>
                <div style={{display:'flex',gap:'0.5rem'}}>
                  <button style={addBtn(true)} onClick={()=>addSubUnit(u.id)}>+ Add Sub-Unit</button>
                  <button style={{...delBtn}} onClick={()=>updateUnit(u.id,{active:false})}>Remove</button>
                </div>
              </div>
              <div style={fGrid}>
                <div><label style={lbl}>Unit Name</label><input style={inp} value={u.name} onChange={e=>updateUnit(u.id,{name:e.target.value,short:e.target.value.split(' ').map((w:string)=>w[0]).join('').toUpperCase().slice(0,4)})}/></div>
                <div><label style={lbl}>Short Name</label><input style={inp} value={u.short} onChange={e=>updateUnit(u.id,{short:e.target.value})}/></div>
                <div><label style={lbl}>Type</label><select style={inp} value={u.type} onChange={e=>updateUnit(u.id,{type:e.target.value})}>
                  {[['product','Product / Trading'],['service','Service'],['aggregator','Aggregator'],['mixed','Mixed']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select></div>
                <div><label style={lbl}>Headcount</label><input type="number" style={inp} value={u.headcount} onChange={e=>updateUnit(u.id,{headcount:Number(e.target.value)})}/></div>
                <div><label style={lbl}>Colour</label><input type="color" style={{...inp,height:38,padding:'0.2rem'}} value={u.color||'#1B2A4A'} onChange={e=>updateUnit(u.id,{color:e.target.value})}/></div>
              </div>
              {/* Sub-units */}
              {form.business_units.filter(su=>su.parent_id===u.id&&su.active).map(su=>(
                <div key={su.id} style={{background:C.lightBg,borderRadius:6,padding:'0.85rem',marginTop:'0.75rem'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.5rem'}}>
                    <div style={{fontSize:'0.82rem',fontWeight:700,color:C.navy}}>{su.name}</div>
                    <button style={delBtn} onClick={()=>updateUnit(su.id,{active:false})}>Remove</button>
                  </div>
                  <div style={fGrid}>
                    <div><label style={lbl}>Name</label><input style={inp} value={su.name} onChange={e=>updateUnit(su.id,{name:e.target.value})}/></div>
                    <div><label style={lbl}>Short</label><input style={inp} value={su.short} onChange={e=>updateUnit(su.id,{short:e.target.value})}/></div>
                    <div><label style={lbl}>Headcount</label><input type="number" style={inp} value={su.headcount} onChange={e=>updateUnit(su.id,{headcount:Number(e.target.value)})}/></div>
                  </div>
                </div>
              ))}
            </div>
          ))}
          <button style={addBtn()} onClick={addUnit}>+ Add Business Unit</button>
        </div>
      )}

      {activeSection==='capital'&&(
        <div style={card}>
          <div style={secH}>Capital Structure</div>
          <div style={fGrid}>
            {[
              ['shareholder_contribution','Shareholder Contribution'],
              ['grant_non_repayable','Grant (Non-Repayable)'],
              ['grant_recoverable','Grant (Recoverable)'],
              ['bank_loan','Bank Loan'],
              ['fixed_assets','Fixed Assets'],
            ].map(([key,label])=>(
              <div key={key}><label style={lbl}>{label}</label>
                <input type="number" style={inp}
                  value={(form.settings.capital_structure as any)?.[key]||0}
                  onChange={e=>setForm(f=>({...f,settings:{...f.settings,capital_structure:{...(f.settings.capital_structure||{}),  [key]:Number(e.target.value)}}}))}/>
              </div>
            ))}
            <div><label style={lbl}>Annual Interest Rate (%)</label>
              <input type="number" style={inp} value={Math.round(((form.settings.capital_structure?.annual_interest_rate||0.18)*100))}
                onChange={e=>setForm(f=>({...f,settings:{...f.settings,capital_structure:{...(f.settings.capital_structure||{}),annual_interest_rate:Number(e.target.value)/100}}}))}/>
            </div>
          </div>
        </div>
      )}

      {activeSection==='credit'&&(
        <div>
          <div style={card}>
            <div style={secH}>Additional Debt Obligations</div>
            <p style={{fontSize:'0.8rem',color:C.slate,marginBottom:'0.85rem'}}>Use this if the business has more than one loan -- bank loans, SACCO loans, or other non-bank facilities. Supplements the single Bank Loan field above; each is tracked separately in DSCR.</p>
            {(form.settings.debts||[]).map((d:any,i:number)=>(
              <div key={i} style={{padding:'0.75rem',border:`1px solid ${C.border}`,borderRadius:5,marginBottom:'0.6rem'}}>
                <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr auto',gap:'0.5rem',alignItems:'end',marginBottom:'0.5rem'}}>
                  <div><div style={hint}>Name</div><input style={inp} value={d.name||''} placeholder="e.g. Bank loan, SACCO loan" onChange={e=>{const ds=[...(form.settings.debts||[])];ds[i]={...ds[i],name:e.target.value};setForm(f=>({...f,settings:{...f.settings,debts:ds}}))}}/></div>
                  <div><div style={hint}>Principal ({form.currency})</div><input type="number" style={inp} value={d.principal||0} onChange={e=>{const ds=[...(form.settings.debts||[])];ds[i]={...ds[i],principal:Number(e.target.value)};setForm(f=>({...f,settings:{...f.settings,debts:ds}}))}}/></div>
                  <div><div style={hint}>Annual Rate %</div><input type="number" step="0.5" style={inp} value={((d.annualRate||0)*100).toFixed(1)} onChange={e=>{const ds=[...(form.settings.debts||[])];ds[i]={...ds[i],annualRate:Number(e.target.value)/100};setForm(f=>({...f,settings:{...f.settings,debts:ds}}))}}/></div>
                  <button style={{background:'transparent',border:'none',color:C.red,cursor:'pointer',fontSize:'1.1rem'}} onClick={()=>setForm(f=>({...f,settings:{...f.settings,debts:(f.settings.debts||[]).filter((_:any,j:number)=>j!==i)}}))}>×</button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1.3fr',gap:'0.5rem'}}>
                  <div><div style={hint}>Tenor (months)</div><input type="number" style={inp} value={d.tenorMonths||12} onChange={e=>{const ds=[...(form.settings.debts||[])];ds[i]={...ds[i],tenorMonths:Number(e.target.value)};setForm(f=>({...f,settings:{...f.settings,debts:ds}}))}}/></div>
                  <div><div style={hint}>Grace Period (months)</div><input type="number" style={inp} value={d.gracePeriodMonths||0} onChange={e=>{const ds=[...(form.settings.debts||[])];ds[i]={...ds[i],gracePeriodMonths:Number(e.target.value)};setForm(f=>({...f,settings:{...f.settings,debts:ds}}))}}/></div>
                  <div><div style={hint}>Drawdown Month (1 = plan's first month)</div><input type="number" min="1" style={inp} value={d.drawdownMonth||1} onChange={e=>{const ds=[...(form.settings.debts||[])];ds[i]={...ds[i],drawdownMonth:Number(e.target.value)};setForm(f=>({...f,settings:{...f.settings,debts:ds}}))}}/></div>
                  <div><div style={hint}>Repayment Type</div>
                    <select style={inp} value={d.repaymentType||'amortising'} onChange={e=>{const ds=[...(form.settings.debts||[])];ds[i]={...ds[i],repaymentType:e.target.value};setForm(f=>({...f,settings:{...f.settings,debts:ds}}))}}>
                      <option value="amortising">Amortising (equal principal each month)</option>
                      <option value="bullet">Bullet (full principal at end of tenor)</option>
                      <option value="quarterly">Quarterly (equal principal every 3 months)</option>
                      <option value="seasonal">Seasonal (specific months only)</option>
                    </select>
                  </div>
                </div>
                {d.repaymentType==='seasonal'&&(
                  <div style={{marginTop:'0.5rem'}}>
                    <div style={hint}>Repayment months (comma-separated, 1 = plan's first month, e.g. "6, 12" for a twice-yearly harvest schedule)</div>
                    <input style={inp} value={(d.seasonalMonths||[]).join(', ')}
                      onChange={e=>{
                        const ds=[...(form.settings.debts||[])]
                        const months=e.target.value.split(',').map((x:string)=>parseInt(x.trim(),10)).filter((n:number)=>!isNaN(n)&&n>0)
                        ds[i]={...ds[i],seasonalMonths:months}
                        setForm(f=>({...f,settings:{...f.settings,debts:ds}}))
                      }}/>
                  </div>
                )}
              </div>
            ))}
            <button style={addBtn(true)} onClick={()=>setForm(f=>({...f,settings:{...f.settings,debts:[...(f.settings.debts||[]),{name:'',principal:0,annualRate:0.18,tenorMonths:12,gracePeriodMonths:0,drawdownMonth:1,repaymentType:'amortising'}]}}))}>+ Add Debt Obligation</button>
          </div>
        </div>
      )}

      {activeSection==='delegation'&&(
        <div style={card}>
          <div style={secH}>Approval Delegation</div>
          <p style={{fontSize:'0.85rem',color:C.slate,marginBottom:'1rem',lineHeight:1.7}}>The CEO can delegate final approval authority to another person. The delegated approver can approve spend requests in place of the CEO.</p>
          <div style={fGrid}>
            <div><label style={lbl}>Delegated Approver (User ID)</label>
              <input style={inp} value={form.settings.delegated_approver_id||''} placeholder="Leave blank to remove delegation"
                onChange={e=>setForm(f=>({...f,settings:{...f.settings,delegated_approver_id:e.target.value||undefined}}))}/>
              <div style={hint}>Enter the user ID of the person you are delegating to. Find user IDs in the Team tab.</div>
            </div>
          </div>
        </div>
      )}

      <div style={{marginTop:'1.25rem',display:'flex',gap:'0.75rem'}}>
        <button style={solidBtn(C.navy)} disabled={saving} onClick={save}>{saving?'Saving...':'Save All Settings'}</button>
      </div>
    </div>
  )
}

// ── CLEARVIEW BUSINESS INTELLIGENCE ────────────────────────────
// Consolidates: financial trend, health check, cash flow early warning,
// break-even tracking, investment readiness, credit risk, staff efficiency,
// promotion effectiveness, monthly narrative -- all in one place.

function findCashWarningMonths(result:any, months:string[]) {
  if (!result) return []
  const warnings:{month:string,balance:number}[] = []
  result.cf.close.forEach((bal:number,i:number)=>{
    if (bal<0) warnings.push({month:months[i]||`Month ${i+1}`,balance:bal})
  })
  return warnings
}

function ClearviewIntelligenceTab({clientId,config,result,months,cc,P,onSave}) {
  const [activeSection,setActiveSection]=useState('summary')
  const [healthReports, setHealthReports] = useState<any[]>([])
  const [investmentAssessments, setInvestmentAssessments] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [narrative, setNarrative] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generatingNarrative, setGeneratingNarrative] = useState(false)
  const [generatingHealth, setGeneratingHealth] = useState(false)

  useEffect(()=>{
    Promise.all([
      supabase.from('ai_health_checks').select('*').eq('client_id',clientId).order('period',{ascending:false}).limit(1),
      supabase.from('investment_readiness').select('*').eq('client_id',clientId).order('generated_at',{ascending:false}).limit(1),
      supabase.from('management_events').select('*').eq('client_id',clientId).order('date',{ascending:false}).limit(5),
      supabase.from('coach_briefings').select('*').eq('client_id',clientId).order('generated_at',{ascending:false}).limit(1),
    ]).then(([h,i,e,n])=>{
      setHealthReports(h.data||[])
      setInvestmentAssessments(i.data||[])
      setEvents(e.data||[])
      setNarrative(n.data?.[0]||null)
      setLoading(false)
    })
  },[clientId])

  function updateAssess(field:string, value:unknown) {
    const current = config.settings.coach_assessment || defaultCoachAssessment()
    const next = {...current,[field]:value}
    onSave({...config,settings:{...config.settings,coach_assessment:next}})
  }

  function Badge2({label,color}:{label:string;color:string}) {
    return <span style={{fontFamily:'monospace',fontSize:'0.78rem',fontWeight:700,padding:'0.25rem 0.7rem',borderRadius:20,background:color,color:C.white}}>{label}</span>
  }

  if (loading) return <Spinner/>
  if (!result) return (
    <div style={{...card,textAlign:'center',padding:'2.5rem'}}>
      <div style={{fontWeight:700,color:C.navy,marginBottom:'0.5rem'}}>Set up your financial plan first</div>
      <p style={{color:C.slate,fontSize:'0.88rem'}}>Clearview Business Intelligence needs business units and a financial plan to generate analysis.</p>
    </div>
  )

  const m = result.metrics
  const s = result.scores
  const assess = config.settings.coach_assessment || defaultCoachAssessment()
  const months_n = months.length
  const warnings = findCashWarningMonths(result, months)
  const latestHealth = healthReports[0]
  const latestInvestment = investmentAssessments[0]
  const debtSched = buildDebtSchedule(
    config.settings.capital_structure?.bank_loan > 0 ? [{
      drawdownMonth:1, annualRate:config.settings.capital_structure?.annual_interest_rate||0.18,
      tenorMonths:(config.settings.capital_structure?.loan_tenor_years||2)*12,
      gracePeriodMonths:0, principal:config.settings.capital_structure?.bank_loan, repaymentType:'amortising',
    }] : [], months_n
  )

  async function generateHealthCheck() {
    setGeneratingHealth(true)
    const targetPeriod = new Date().toISOString().slice(0,7)+'-01'
    try {
      const prompt = `You are a financial health advisor for an African MSME. Produce a monthly business health check report for ${config.business_name}.

Financial summary:
- Total revenue: ${cc} ${m.total_revenue.toLocaleString()}
- EBITDA: ${cc} ${m.total_ebitda.toLocaleString()} (${(m.net_margin*100).toFixed(1)}% margin)
- Credit Risk Score: ${s.score}/100 (${s.classification})
- Going Concern: ${s.gcScore}/20 (${s.gcRating})
- Investment Readiness: ${s.irScore}/30 (${s.irTier})
- Minimum cash position: ${cc} ${m.min_cash.toLocaleString()}
- Debt service coverage: ${dscrLabel(s)}
- Break-even revenue: ${cc} ${m.business_breakeven.toLocaleString()}
- Staff cost as % of revenue: ${(m.staff_cost_pct*100).toFixed(1)}%

Write a clear, plain-English health check report for the CEO. Include: 1) Overall status (Green/Amber/Red with reason) 2) Two or three things going well 3) Two or three areas of concern 4) Three specific actions this month. Maximum 300 words.`
      const response = await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1000,messages:[{role:'user',content:prompt}]})
      })
      const data = await response.json()
      const text = data.content?.[0]?.text||'Report unavailable'
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
      const prompt = `You are writing a monthly business narrative for the CEO of ${config.business_name}, an African MSME. Write a complete story of where the business stands right now, in plain conversational English -- not a list, a narrative read top to bottom like a letter.

Data:
- Revenue: ${cc} ${m.total_revenue.toLocaleString()}, EBITDA margin: ${(m.net_margin*100).toFixed(1)}%
- Credit Risk: ${s.score}/100 (${s.classification}); Going Concern: ${s.gcScore}/20 (${s.gcRating}); Investment Readiness: ${s.irScore}/30 (${s.irTier})
- Debt service coverage: ${dscrLabel(s)}
- Break-even revenue: ${cc} ${m.business_breakeven.toLocaleString()}
- Cash shortfall months: ${warnings.length>0?warnings.map(w=>w.month).join(', '):'none'}
- Staff cost ratio: ${(m.staff_cost_pct*100).toFixed(1)}%
- Business units: ${config.business_units.filter(u=>u.active).map(u=>u.name).join(', ')}

Write 4-5 short paragraphs telling the story of this business right now. Speak directly to the owner. No headers, no bullets, no jargon. Maximum 350 words.`
      const response = await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1000,messages:[{role:'user',content:prompt}]})
      })
      const data = await response.json()
      const text = data.content?.[0]?.text||'Narrative unavailable'
      const {data:saved} = await supabase.from('coach_briefings').insert([{
        client_id:clientId, briefing_text:text, visit_context:'Monthly Narrative',
        period_covered:new Date().toLocaleString('en-GB',{month:'long',year:'numeric'}),
        generated_at:new Date().toISOString(),
      }]).select().single()
      if (saved) setNarrative(saved)
    } catch(e) { alert('Narrative generation failed') }
    setGeneratingNarrative(false)
  }

  const tabList:[string,string][] = [
    ['summary','Summary'],['narrative',"This Month's Story"],['credit','Credit Risk'],
    ['going_concern','Going Concern'],['investment','Investment Readiness'],
    ['coach','Coach Assessment'],['events','Marketing Events'],
  ]

  return (
    <div>
      <div style={{...card,background:C.navy,marginBottom:'1.25rem'}}>
        <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.12em',color:C.cyan,marginBottom:'0.3rem'}}>CLEARVIEW BUSINESS INTELLIGENCE</div>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:C.white,marginBottom:'0.5rem'}}>{config.business_name}</div>
        <div style={{display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
          <div><div style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.5)'}}>CREDIT RISK</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.4rem',fontWeight:700,color:s.classColor}}>{s.score}/100</div></div>
          <div><div style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.5)'}}>GOING CONCERN</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.4rem',fontWeight:700,color:s.gcColor}}>{s.gcScore}/20</div></div>
          <div><div style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.5)'}}>INVESTMENT READY</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.4rem',fontWeight:700,color:s.irColor}}>{s.irScore}/30</div></div>
          <div><div style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.5)'}}>CASH WARNINGS</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.4rem',fontWeight:700,color:warnings.length>0?C.red:C.green}}>{warnings.length}</div></div>
        </div>
      </div>

      <div style={{display:'flex',gap:'0.4rem',flexWrap:'wrap',marginBottom:'1.5rem',borderBottom:`2px solid ${C.border}`,paddingBottom:'0.75rem'}}>
        {tabList.map(t=>(
          <button key={t[0]} onClick={()=>setActiveSection(t[0])} style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.5rem 1rem',border:`1px solid ${activeSection===t[0]?C.cyan:C.border}`,borderRadius:5,background:activeSection===t[0]?C.cyan:C.white,color:activeSection===t[0]?C.navy:C.slate,cursor:'pointer',fontWeight:activeSection===t[0]?700:400}}>{t[1]}</button>
        ))}
      </div>

      {activeSection==='summary'&&(
        <div>
          <div style={kpiGrid}>
            <KPI label="Credit Risk" value={`${s.score}/100`} sub={s.classification} color={s.classColor}/>
            <KPI label="Going Concern" value={`${s.gcScore}/20`} sub={s.gcRating} color={s.gcColor}/>
            <KPI label="Investment Readiness" value={`${s.irScore}/30`} sub={s.irTier} color={s.irColor}/>
            <KPI label="Debt Service Coverage (min)" value={dscrLabel(s)} color={dscrColor(s,C)}/>
            <KPI label="Break-Even Revenue" value={fmt(m.business_breakeven,cc)} color={C.amber}/>
            <KPI label="Staff Cost %" value={pct(m.staff_cost_pct)} color={m.staff_cost_pct<0.3?C.green:m.staff_cost_pct<0.5?C.amber:C.red}/>
            <KPI label="Days to Collect (DSO)" value={`${s.tradeCredit.dso.toFixed(0)}d`} color={C.navy}/>
            <KPI label="Days to Pay (DPO)" value={`${s.tradeCredit.dpo.toFixed(0)}d`} color={C.navy}/>
            <KPI label="Cash Conversion Gap" value={`${s.tradeCredit.cashConversionGap.toFixed(0)}d`} color={s.tradeCredit.cashConversionGap<=0?C.green:s.tradeCredit.cashConversionGap>30?C.red:C.amber}/>
          </div>
          <div style={{background:C.navy,borderRadius:8,padding:'1rem 1.25rem'}}>
            <div style={{fontFamily:'monospace',fontSize:'0.65rem',letterSpacing:'0.12em',color:C.cyan,marginBottom:'0.75rem'}}>READING THE PICTURE</div>
            {[
              [!s.hasDebt?'info':s.dscrMin===null?'info':s.dscrMin>=1.5?'ok':s.dscrMin>=1.0?'info':'warn',
                `Debt service coverage: ${!s.hasDebt?'No debt obligations on this plan.':s.dscrMin===null?'Debt exists but no repayment has fallen due yet.':`Minimum DSCR ${s.dscrMin.toFixed(2)}x across periods with a repayment due. ${s.dscrMin>=1.5?'Strong.':s.dscrMin>=1.0?'Adequate but watch closely.':'Weak: not generating enough to service obligations in the tightest period.'}`}`],
              [s.cashGaps===0?'ok':'warn', `Cash position: ${s.cashGaps===0?'Positive throughout the period.':'Negative in '+s.cashGaps+' month(s).'}`],
              [s.revTrend==='Growing'?'ok':s.revTrend==='Stable'?'info':'warn', `Revenue trend: ${s.revTrend} from start to end of period.`],
              [s.irScore>=17?'ok':'info', `Investment readiness: ${s.irTier} (${s.irScore}/30).`],
              [(s.tradeCredit.dso>0||s.tradeCredit.dpo>0)?(s.tradeCredit.cashConversionGap<=0?'ok':s.tradeCredit.cashConversionGap>30?'warn':'info'):'info',
                (s.tradeCredit.dso>0||s.tradeCredit.dpo>0)
                  ? `Trade credit: collecting in ${s.tradeCredit.dso.toFixed(0)} days, paying suppliers in ${s.tradeCredit.dpo.toFixed(0)} days. ${s.tradeCredit.cashConversionGap<=0?'Effectively supplier-financed -- a healthy position.':'Cash is tied up for '+s.tradeCredit.cashConversionGap.toFixed(0)+' days waiting to collect before suppliers are paid.'}`
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
              <button style={solidBtn(C.purple,true)} disabled={generatingNarrative} onClick={generateNarrative}>{generatingNarrative?'Writing...':'Generate Narrative'}</button>
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
            {warnings.length===0 ? (
              <div style={{padding:'0.85rem',background:'#EBFAF0',borderRadius:6,color:C.green,fontSize:'0.85rem',fontWeight:600}}>No cash shortfall projected across the planning period.</div>
            ) : (
              <div>
                {warnings.map((w,i)=>(
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
              <button style={solidBtn(C.purple,true)} disabled={generatingHealth} onClick={generateHealthCheck}>{generatingHealth?'Generating...':'Generate This Month'}</button>
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
        <div style={card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'1.25rem',flexWrap:'wrap',gap:'0.75rem'}}>
            <div style={secH}>Credit Risk Dashboard</div>
            <div style={{display:'flex',alignItems:'center',gap:'1rem'}}>
              <div style={{fontFamily:'Georgia,serif',fontSize:'2.5rem',fontWeight:700,color:s.classColor,lineHeight:1}}>{s.score}</div>
              <div><div style={{fontSize:'0.75rem',color:C.slate}}>out of 100</div><Badge2 label={s.classification} color={s.classColor}/></div>
            </div>
          </div>
          <div style={kpiGrid}>
            <KPI label="Minimum DSCR" value={dscrLabel(s)} color={dscrColor(s,C)}/>
            <KPI label="Revenue Trend" value={s.revTrend} color={s.revTrend==='Growing'?C.green:s.revTrend==='Stable'?C.amber:C.red}/>
            <KPI label="Cash-Negative Months" value={String(s.cashGaps)} color={s.cashGaps===0?C.green:C.red}/>
            <KPI label="Annual EBITDA" value={fmt(m.total_ebitda,cc)} color={m.total_ebitda>=0?C.green:C.red}/>
          </div>
          <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.75rem',fontFamily:'monospace'}}>
            <thead><tr style={{background:C.navy,color:C.white}}><th style={{padding:'7px 10px',textAlign:'left',minWidth:120}}>Metric</th>{months.map((mo,i)=><th key={i} style={{padding:'7px 8px',textAlign:'right',whiteSpace:'nowrap'}}>{mo}</th>)}</tr></thead>
            <tbody>
              <tr style={{background:'#F8F4EE'}}><td style={{padding:'6px 10px',fontWeight:600}}>EBITDA</td>{result.con.ebitda.map((v:number,i:number)=><td key={i} style={{padding:'6px 8px',textAlign:'right',color:v>=0?C.green:C.red}}>{fmt(v,cc)}</td>)}</tr>
              <tr><td style={{padding:'6px 10px',fontWeight:600}}>Debt Service</td>{debtSched.totalRepayment.map((v:number,i:number)=><td key={i} style={{padding:'6px 8px',textAlign:'right'}}>{fmt(v,cc)}</td>)}</tr>
              <tr style={{background:'#F0F4F8'}}><td style={{padding:'6px 10px',fontWeight:700}}>DSCR</td>{s.dscrVals.map((v:number|null,i:number)=><td key={i} style={{padding:'6px 8px',textAlign:'right',fontWeight:700,color:v===null?C.slate:v>=1.5?C.green:v>=1.0?C.amber:C.red}}>{v===null?'–':`${v.toFixed(2)}x`}</td>)}</tr>
            </tbody>
          </table></div>
        </div>
      )}

      {activeSection==='going_concern'&&(
        <div style={card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem',flexWrap:'wrap',gap:'0.75rem'}}>
            <div style={secH}>Going Concern Assessment</div>
            <div style={{display:'flex',alignItems:'center',gap:'1rem'}}><div style={{fontFamily:'Georgia,serif',fontSize:'2.5rem',fontWeight:700,color:s.gcColor,lineHeight:1}}>{s.gcScore}</div><div><div style={{fontSize:'0.75rem',color:C.slate}}>out of 20</div><Badge2 label={s.gcRating} color={s.gcColor}/></div></div>
          </div>
          {[
            {name:'Debt Service Coverage',sc:!s.hasDebt?4:s.dscrMin===null?3:s.dscrMin>=1.5?4:s.dscrMin>=1.0?3:s.dscrMin>=0.5?2:1,max:4,ev:dscrLabel(s),field:null},
            {name:'Liquidity Position',sc:m.min_cash>=0?4:m.min_cash>-10000000?1:0,max:4,ev:'Min cash: '+fmt(m.min_cash,cc),field:null},
            {name:'Revenue Sustainability',sc:3,max:4,ev:'Revenue trend: '+s.revTrend,field:null},
            {name:'Operational Profitability',sc:m.total_ebitda>0?3:2,max:4,ev:'Annual EBITDA: '+fmt(m.total_ebitda,cc),field:null},
            {name:'Management & Governance',sc:Number(assess.managementCapability)||2,max:4,ev:'Coach assessment',field:'managementCapability'},
          ].map(ind=>(
            <div key={ind.name} style={{marginBottom:'1rem',paddingBottom:'1rem',borderBottom:`1px solid ${C.border}`}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.3rem'}}><span style={{fontWeight:600,fontSize:'0.88rem',color:C.navy}}>{ind.name}</span><span style={{fontFamily:'monospace',fontWeight:700,color:ind.sc>=3?C.green:ind.sc>=2?C.amber:C.red}}>{ind.sc}/{ind.max}</span></div>
              <div style={{background:'#E8ECF0',borderRadius:999,height:7}}><div style={{width:(ind.sc/ind.max*100)+'%',height:'100%',background:ind.sc>=3?C.green:ind.sc>=2?C.amber:C.red,borderRadius:999}}/></div>
              <div style={{fontSize:'0.78rem',color:C.slate,marginTop:'0.3rem'}}>{ind.ev}</div>
              {ind.field!=null&&<input type="range" min="0" max={ind.max} step="1" value={(assess as any)[ind.field]||2} onChange={e=>updateAssess(ind.field as string,Number(e.target.value))} style={{width:'100%',accentColor:C.cyan,marginTop:'0.4rem'}}/>}
            </div>
          ))}
        </div>
      )}

      {activeSection==='investment'&&(
        <div style={card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem',flexWrap:'wrap',gap:'0.75rem'}}>
            <div style={secH}>Investment Readiness Score</div>
            <div style={{display:'flex',alignItems:'center',gap:'1rem'}}><div style={{fontFamily:'Georgia,serif',fontSize:'2.5rem',fontWeight:700,color:s.irColor,lineHeight:1}}>{s.irScore}</div><div><div style={{fontSize:'0.75rem',color:C.slate}}>out of 30</div><Badge2 label={s.irTier} color={s.irColor}/></div></div>
          </div>
          <InvestmentPitchDownload clientId={clientId}/>
          {[
            {name:'Financial Viability',sc:s.irFinancial,max:5,ev:'EBITDA margin '+(s.ebitdaMargin*100).toFixed(1)+'%',field:null},
            {name:'Debt Serviceability',sc:s.irDebt,max:5,ev:dscrLabel(s),field:null},
            {name:'Commercial Model Clarity',sc:Number(assess.commercialModel)||2,max:5,ev:'Coach assessment',field:'commercialModel'},
            {name:'Management Capability',sc:Number(assess.managementCapability)||2,max:5,ev:'Coach assessment',field:'managementCapability'},
            {name:'Market Evidence',sc:Number(assess.marketEvidence)||2,max:5,ev:'Coach assessment',field:'marketEvidence'},
            {name:'Governance & Records',sc:Number(assess.governance)||2,max:5,ev:'Coach assessment',field:'governance'},
          ].map(dim=>(
            <div key={dim.name} style={{marginBottom:'1rem',paddingBottom:'1rem',borderBottom:`1px solid ${C.border}`}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.3rem'}}><span style={{fontWeight:600,fontSize:'0.88rem',color:C.navy}}>{dim.name}</span><span style={{fontFamily:'monospace',fontWeight:700,color:dim.sc>=4?C.green:dim.sc>=3?C.teal:dim.sc>=2?C.amber:C.red}}>{dim.sc}/{dim.max}</span></div>
              <div style={{background:'#E8ECF0',borderRadius:999,height:7}}><div style={{width:(dim.sc/dim.max*100)+'%',height:'100%',background:dim.sc>=4?C.green:dim.sc>=3?C.teal:dim.sc>=2?C.amber:C.red,borderRadius:999}}/></div>
              <div style={{fontSize:'0.78rem',color:C.slate,marginTop:'0.3rem'}}>{dim.ev}</div>
              {dim.field!=null&&<input type="range" min="0" max={dim.max} step="1" value={(assess as any)[dim.field]||2} onChange={e=>updateAssess(dim.field as string,Number(e.target.value))} style={{width:'100%',accentColor:C.cyan,marginTop:'0.4rem'}}/>}
            </div>
          ))}
          {latestInvestment&&(
            <div style={{marginTop:'1.25rem',paddingTop:'1.25rem',borderTop:`1px solid ${C.border}`}}>
              <div style={{fontWeight:700,fontSize:'0.85rem',color:C.navy,marginBottom:'0.5rem'}}>AI Narrative Assessment</div>
              <div style={{fontSize:'0.85rem',color:C.navy,lineHeight:1.75,whiteSpace:'pre-wrap'}}>{latestInvestment.assessment_text}</div>
            </div>
          )}
        </div>
      )}

      {activeSection==='coach'&&(
        <div style={card}>
          <div style={secH}>Coach Assessment Inputs</div>
          <p style={{fontSize:'0.85rem',color:C.slate,marginBottom:'1.5rem',lineHeight:1.6}}>These scores feed into Going Concern and Investment Readiness.</p>
          <div style={fGrid}>
            {[{label:'Commercial Model Clarity',field:'commercialModel',max:5},{label:'Management Capability',field:'managementCapability',max:4},{label:'Market Evidence',field:'marketEvidence',max:5},{label:'Governance & Record-Keeping',field:'governance',max:5}].map(item=>(
              <div key={item.field}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.3rem'}}>
                  <label style={{fontWeight:600,fontSize:'0.85rem',color:C.navy}}>{item.label}</label>
                  <span style={{fontFamily:'monospace',fontWeight:700,color:C.cyan}}>{Number((assess as any)[item.field])||2}/{item.max}</span>
                </div>
                <input type="range" min="0" max={item.max} step="1" value={(assess as any)[item.field]||2} onChange={e=>updateAssess(item.field,Number(e.target.value))} style={{width:'100%',accentColor:C.cyan,marginBottom:'0.2rem'}}/>
              </div>
            ))}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginTop:'1.5rem'}}>
            {[{label:'Immediate Actions (30 days)',field:'immediateActions'},{label:'Near-Term Actions (60-90 days)',field:'nearTermActions'},{label:'Required Follow-Up',field:'followUp'},{label:'Coach Notes',field:'coachNotes'}].map(item=>(
              <div key={item.field}>
                <label style={{display:'block',fontWeight:600,fontSize:'0.82rem',marginBottom:'0.25rem',color:C.navy}}>{item.label}</label>
                <textarea value={(assess as any)[item.field]||''} onChange={e=>updateAssess(item.field,e.target.value)} style={{...inp,minHeight:75,resize:'vertical'}} placeholder="One per line..."/>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection==='events'&&(
        <PromotionEventsSection clientId={clientId} config={config} cc={cc} P={P} events={events} setEvents={setEvents}/>
      )}
    </div>
  )
}

// ── WORKING CAPITAL TAB ──────────────────────────────────────
// Trade credit (supplier payables, customer/partner receivables) entered
// as monthly movements -- new credit and amounts settled -- the way real
// bookkeeping works. The outstanding balance and DSO/DPO are derived, not
// entered directly. These movements feed the cash flow statement automatically.
function WorkingCapitalTab({config,result,months,cc,P,onSave}) {
  const lines: any[] = config.settings.trade_credit_lines || []

  function addLine(type:'payable'|'receivable') {
    const id = `tc_${Date.now()}`
    const newLine = {
      id, name: '', type,
      monthly_new: Array(config.planning_months).fill(0),
      monthly_settled: Array(config.planning_months).fill(0),
    }
    onSave({...config, settings:{...config.settings, trade_credit_lines:[...lines, newLine]}})
  }
  function updateLineName(id:string, name:string) {
    onSave({...config, settings:{...config.settings, trade_credit_lines: lines.map(l=>l.id===id?{...l,name}:l)}})
  }
  function removeLine(id:string) {
    onSave({...config, settings:{...config.settings, trade_credit_lines: lines.filter(l=>l.id!==id)}})
  }
  function updateMonth(id:string, field:'monthly_new'|'monthly_settled', idx:number, val:number) {
    onSave({...config, settings:{...config.settings, trade_credit_lines: lines.map(l=>
      l.id===id ? {...l, [field]: l[field].map((v:number,i:number)=>i===idx?val:v)} : l
    )}})
  }

  const payableLines = lines.filter(l=>l.type==='payable')
  const receivableLines = lines.filter(l=>l.type==='receivable')
  const s = result?.scores

  return (
    <div>
      <div style={{background:'#EBF8FF',borderRadius:6,padding:'0.85rem 1rem',marginBottom:'1.25rem'}}>
        <p style={{fontSize:'0.82rem',color:C.navy,lineHeight:1.6,margin:0}}>
          Track supplier credit received (Payable) and credit extended to customers or partners such as licensing partners (Receivable) month by month. Enter <strong>new credit</strong> and what was <strong>actually settled</strong> each month. The outstanding balance and how it affects cash are calculated automatically and feed directly into Cash Flow and Going Concern.
        </p>
      </div>

      {s && (
        <div style={kpiGrid}>
          <KPI label="Days to Collect (DSO)" value={`${s.tradeCredit.dso.toFixed(0)}d`} color={C.navy}/>
          <KPI label="Days to Pay (DPO)" value={`${s.tradeCredit.dpo.toFixed(0)}d`} color={C.navy}/>
          <KPI label="Cash Conversion Gap" value={`${s.tradeCredit.cashConversionGap.toFixed(0)}d`} color={s.tradeCredit.cashConversionGap<=0?C.green:s.tradeCredit.cashConversionGap>30?C.red:C.amber}/>
          <KPI label="Current Payable Outstanding" value={fmt(s.tradeCredit.totalPayableOutstanding[s.tradeCredit.totalPayableOutstanding.length-1]||0,cc)}/>
          <KPI label="Current Receivable Outstanding" value={fmt(s.tradeCredit.totalReceivableOutstanding[s.tradeCredit.totalReceivableOutstanding.length-1]||0,cc)}/>
        </div>
      )}

      <div style={card}>
        <SectionHeader title="Payable -- Supplier Credit" action={P.canEditPlan?<button style={addBtn(true)} onClick={()=>addLine('payable')}>+ Add Supplier Credit Line</button>:null}/>
        {payableLines.length===0 && <p style={{color:C.slate,fontSize:'0.85rem'}}>No supplier credit lines yet.</p>}
        {payableLines.map(line=>(
          <TradeCreditLineGrid key={line.id} line={line} months={months} cc={cc} canEdit={P.canEditPlan}
            updateLineName={updateLineName} removeLine={removeLine} updateMonth={updateMonth}/>
        ))}
      </div>

      <div style={card}>
        <SectionHeader title="Receivable -- Customer / Partner Credit" action={P.canEditPlan?<button style={addBtn(true)} onClick={()=>addLine('receivable')}>+ Add Receivable Line</button>:null}/>
        {receivableLines.length===0 && <p style={{color:C.slate,fontSize:'0.85rem'}}>No receivable lines yet. Use this for credit given to customers or licensing partners.</p>}
        {receivableLines.map(line=>(
          <TradeCreditLineGrid key={line.id} line={line} months={months} cc={cc} canEdit={P.canEditPlan}
            updateLineName={updateLineName} removeLine={removeLine} updateMonth={updateMonth}/>
        ))}
      </div>
    </div>
  )
}

function TradeCreditLineGrid({line,months,cc,canEdit,updateLineName,removeLine,updateMonth}:any) {
  const [expanded,setExpanded] = useState(false)
  return (
    <div style={{marginBottom:'1rem',border:`1px solid ${C.border}`,borderRadius:6,padding:'0.75rem'}}>
      <div style={{display:'flex',gap:'0.5rem',alignItems:'center',marginBottom:'0.5rem'}}>
        <input style={{...inp,fontWeight:700}} placeholder="e.g. Input Supplier, Licensing Partner" value={line.name}
          disabled={!canEdit} onChange={e=>updateLineName(line.id,e.target.value)}/>
        {line.name && <button style={addBtn(true)} onClick={()=>setExpanded(!expanded)}>{expanded?'Hide months':'Enter monthly figures'}</button>}
        {canEdit && <button style={{background:'transparent',border:'none',color:C.red,cursor:'pointer',fontSize:'1.1rem'}} onClick={()=>removeLine(line.id)}>×</button>}
      </div>
      {expanded && line.name && (
        <div style={{overflowX:'auto',marginTop:'0.6rem'}}>
          <table style={{borderCollapse:'collapse',fontSize:'0.74rem'}}>
            <thead><tr>
              <th style={{padding:'4px 6px',textAlign:'left',minWidth:90}}></th>
              {months.map((m:string,i:number)=><th key={i} style={{padding:'4px 5px',textAlign:'center',minWidth:78,background:C.lightBg,color:C.navy,fontWeight:600}}>{m}</th>)}
            </tr></thead>
            <tbody>
              <tr>
                <td style={{padding:'4px 6px',fontWeight:600,color:C.teal,fontSize:'0.72rem'}}>{line.type==='payable'?'New Credit Received':'New Credit Extended'}</td>
                {(line.monthly_new||[]).map((v:number,i:number)=>(
                  <td key={i} style={{padding:'2px 3px'}}>
                    <input type="number" disabled={!canEdit} style={{width:70,padding:'0.28rem 0.32rem',fontSize:'0.7rem',textAlign:'right',border:`1px solid ${C.border}`,borderRadius:3,background:canEdit?C.white:'#F4F4F4'}}
                      value={v??''} placeholder="0" onChange={e=>updateMonth(line.id,'monthly_new',i,Number(e.target.value))}/>
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{padding:'4px 6px',fontWeight:600,color:C.green,fontSize:'0.72rem'}}>{line.type==='payable'?'Paid This Month':'Collected This Month'}</td>
                {(line.monthly_settled||[]).map((v:number,i:number)=>(
                  <td key={i} style={{padding:'2px 3px'}}>
                    <input type="number" disabled={!canEdit} style={{width:70,padding:'0.28rem 0.32rem',fontSize:'0.7rem',textAlign:'right',border:`1px solid ${C.border}`,borderRadius:3,background:canEdit?C.white:'#F4F4F4'}}
                      value={v??''} placeholder="0" onChange={e=>updateMonth(line.id,'monthly_settled',i,Number(e.target.value))}/>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p style={{fontSize:'0.68rem',color:C.slate,marginTop:'0.4rem'}}>All figures in {cc}. The outstanding balance carries forward automatically: new credit increases it, settling reduces it.</p>
        </div>
      )}
    </div>
  )
}
// ── P&L TAB (Unit + Consolidated merged with toggle) ─────────
function PLTab({config,result,months,cc,P}) {
  const [viewMode, setViewMode] = useState<'unit'|'consolidated'>('unit')
  const [selUnit, setSelUnit] = useState(config.business_units.find(u=>u.active)?.id||'')
  if (!result) return <div style={card}><p style={{color:C.slate}}>Set up your planning data first.</p></div>

  // Hybrid: use the actual figure for a month where one exists, plan
  // otherwise. actualMask marks which months in the row are real data, so
  // PLRow can highlight them distinctly. Each row's own actual field
  // (act_rev, act_gp, act_ebitda, etc) determines availability
  // independently -- e.g. actual revenue can exist for a month before
  // actual EBITDA does, if opex actuals haven't been entered yet.
  function hybridRow(planValues:number[], actualValues:(number|null)[]) {
    const values = planValues.map((v,i)=> actualValues[i] !== null ? (actualValues[i] as number) : v)
    const actualMask = actualValues.map(v => v !== null)
    return { values, actualMask }
  }

  return (
    <div>
      <div style={{display:'flex',gap:'0.5rem',marginBottom:'1.25rem'}}>
        <button style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.5rem 1.1rem',border:'none',
          background:viewMode==='unit'?C.navy:C.white,color:viewMode==='unit'?C.white:C.slate,
          borderRadius:4,cursor:'pointer',fontWeight:viewMode==='unit'?700:400}}
          onClick={()=>setViewMode('unit')}>By Business Unit</button>
        <button style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.5rem 1.1rem',border:'none',
          background:viewMode==='consolidated'?C.navy:C.white,color:viewMode==='consolidated'?C.white:C.slate,
          borderRadius:4,cursor:'pointer',fontWeight:viewMode==='consolidated'?700:400}}
          onClick={()=>setViewMode('consolidated')}>Consolidated</button>
      </div>

      {viewMode==='unit' && (() => {
        const pl = result.unitPL[selUnit]
        if (!pl) return <div style={card}><p style={{color:C.slate}}>No data for this unit.</p></div>
        const revH = hybridRow(pl.rev, pl.act_rev)
        const cogsH = hybridRow(pl.cogs, pl.act_cogs)
        const gpH = hybridRow(pl.gp, pl.act_gp)
        const staffH = hybridRow(pl.staff, pl.act_staff)
        const opexH = hybridRow(pl.opex, pl.act_opex)
        const rows = [
          {label:'Revenue',values:revH.values,bold:true,actualMask:revH.actualMask},
          {label:'Cost of Sales',values:cogsH.values,negate:true,actualMask:cogsH.actualMask},
          {label:'Gross Profit',values:gpH.values,bold:true,highlight:true,actualMask:gpH.actualMask},
          {label:'Staff Costs',values:staffH.values,negate:true,actualMask:staffH.actualMask},
          {label:'Direct Overheads',values:opexH.values,negate:true,actualMask:opexH.actualMask},
          // Shared Costs and EBITDA stay plan-only here, deliberately not
          // actual-marked -- there's no per-unit actual EBITDA yet (shared
          // cost allocation has no actuals equivalent), and marking EBITDA
          // as actual while it's still built from a plan-only Shared Costs
          // figure would repeat the exact reconciliation bug fixed in the
          // consolidated view below.
          {label:'Shared Costs',values:pl.shared,negate:true},
          {label:'EBITDA',values:pl.ebitda,bold:true,highlight:true},
        ]
        return (
          <div>
            <div style={{display:'flex',gap:'0.45rem',marginBottom:'1.25rem',flexWrap:'wrap'}}>
              {config.business_units.filter(u=>u.active).map(u=>(
                <button key={u.id} style={{fontFamily:'monospace',fontSize:'0.71rem',padding:'0.45rem 0.85rem',
                  border:`2px solid ${selUnit===u.id?(u.color||C.cyan):C.border}`,borderRadius:4,
                  background:selUnit===u.id?(u.color||C.cyan):C.white,
                  color:selUnit===u.id?C.white:C.navy,cursor:'pointer'}}
                  onClick={()=>setSelUnit(u.id)}>
                  {u.name}
                </button>
              ))}
            </div>
            <PLTable title={`${config.business_units.find(u=>u.id===selUnit)?.name} — P&L`} rows={rows} months={months} cc={cc} showExport/>
            <div style={kpiGrid}>
              <KPI label="Annual Revenue" value={fmt(pl.ann_rev,cc)}/>
              <KPI label="Gross Profit" value={fmt(pl.ann_gp,cc)} sub={pct(pl.gp_margin)} color={pl.ann_gp>=0?C.green:C.red}/>
              <KPI label="EBITDA" value={fmt(pl.ann_ebitda,cc)} sub={pct(pl.ebitda_margin)} color={pl.ann_ebitda>=0?C.teal:C.red}/>
              <KPI label="Staff Cost %" value={pct(pl.staff_efficiency.staff_cost_pct)} sub={`${pl.staff_efficiency.headcount} staff`} color={C.amber}/>
            </div>
          </div>
        )
      })()}

      {viewMode==='consolidated' && (() => {
        const con = result.con
        const revH = hybridRow(con.rev, con.act_rev)
        const cogsH = hybridRow(con.cogs, con.act_cogs)
        const gpH = hybridRow(con.gp, con.act_gp)
        // Total Operating Costs must use the SAME actual coverage as
        // act_ebitda (act_staff and act_opex both present), not stay
        // plan-only -- otherwise a month showing actual Gross Profit and
        // actual EBITDA would display a plan-sourced cost figure between
        // them, and GP minus Operating Costs would not equal EBITDA on
        // screen. This keeps every marked-actual month reconciling exactly:
        // act_gp - actOpexTotal = act_ebitda, by construction.
        const actOpexTotal: (number|null)[] = con.act_staff.map((s:number|null, m:number) =>
          (s !== null && con.act_opex[m] !== null) ? (s + (con.act_opex[m] as number)) : null
        )
        const opexH = hybridRow(con.opex, actOpexTotal)
        const ebitdaH = hybridRow(con.ebitda, con.act_ebitda)
        const rows = [
          {label:'Revenue',values:revH.values,bold:true,actualMask:revH.actualMask},
          {label:'Cost of Sales',values:cogsH.values,negate:true,actualMask:cogsH.actualMask},
          {label:'Gross Profit',values:gpH.values,bold:true,highlight:true,actualMask:gpH.actualMask},
          {label:'Total Operating Costs',values:opexH.values,negate:true,actualMask:opexH.actualMask},
          {label:'EBITDA',values:ebitdaH.values,bold:true,highlight:true,actualMask:ebitdaH.actualMask},
          {label:'Interest',values:con.interest,negate:true},
          {label:'Net Profit Before Tax',values:con.nbt,bold:true},
          {label:'Tax',values:con.tax,negate:true},
          {label:'Net Profit After Tax',values:con.npat,bold:true,highlight:true},
        ]
        return <PLTable title={`${config.business_name} — Consolidated P&L`} rows={rows} months={months} cc={cc} showExport/>
      })()}
    </div>
  )
}
// ── MARGINS & BREAK-EVEN TAB (Spread + Service + Break-Even + Staff merged) ──
function MarginsTab({config,result,months,cc}) {
  const [section, setSection] = useState<'spread'|'service'|'breakeven'|'staff'>('breakeven')
  if (!result) return <div style={card}><p style={{color:C.slate}}>Set up your planning data first.</p></div>
  const m = result.metrics

  const sections: [string,string][] = [
    ['breakeven','Break-Even'],['spread','Spread Analysis'],
    ['service','Service Margins'],['staff','Staff Efficiency'],
  ]

  return (
    <div>
      <div style={{display:'flex',gap:'0.4rem',flexWrap:'wrap',marginBottom:'1.5rem'}}>
        {sections.map(([id,label])=>(
          <button key={id} style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.5rem 1rem',
            border:`1px solid ${section===id?C.cyan:C.border}`,borderRadius:5,
            background:section===id?C.cyan:C.white,color:section===id?C.navy:C.slate,
            cursor:'pointer',fontWeight:section===id?700:400}}
            onClick={()=>setSection(id as any)}>{label}</button>
        ))}
      </div>

      {section==='breakeven' && (
        <div>
          <div style={card}>
            <div style={secH}>Whole Business Break-Even</div>
            <div style={kpiGrid}>
              <KPI label="Break-Even Revenue" value={fmt(m.business_breakeven,cc)} sub="Annual" color={C.amber}/>
              <KPI label="Planned Revenue" value={fmt(m.total_revenue,cc)} color={C.navy}/>
              <KPI label="Gap / Surplus" value={fmt(m.total_revenue-m.business_breakeven,cc)} color={m.total_revenue>=m.business_breakeven?C.green:C.red}/>
              <KPI label="Variable Cost %" value={pct(m.variable_cost_pct)} sub="of revenue" color={C.slate}/>
            </div>
            <div style={{background:C.lightBg,borderRadius:6,padding:'1rem',marginTop:'0.5rem'}}>
              <div style={{fontSize:'0.82rem',color:C.slate,lineHeight:1.7}}>
                At the planned variable cost ratio of <strong>{pct(m.variable_cost_pct)}</strong>, the business needs to generate <strong>{fmt(m.business_breakeven,cc)}</strong> in annual revenue to cover all fixed and shared costs.
                {m.total_revenue>=m.business_breakeven
                  ? ` The current plan exceeds break-even by ${fmt(m.total_revenue-m.business_breakeven,cc)}.`
                  : ` The current plan is ${fmt(m.business_breakeven-m.total_revenue,cc)} below break-even.`}
              </div>
            </div>
          </div>
          {result.allocUnits.map(u=>{
            const pl = result.unitPL[u.id]
            if (!pl||pl.breakeven.length===0) return null
            return (
              <div key={u.id} style={card}>
                <div style={secH}>{u.name}</div>
                <div style={{overflowX:'auto'}}>
                  <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.8rem'}}>
                    <thead>
                      <tr style={{background:C.navy,color:C.white}}>
                        {['Revenue Line','Break-Even Revenue','Current Revenue','Gap / Surplus','Variable Cost %'].map(h=>(
                          <th key={h} style={{padding:'8px 10px',textAlign:'left',fontWeight:600,fontSize:'0.75rem'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pl.breakeven.map((be,i)=>(
                        <tr key={be.line_id} style={{background:i%2===0?C.cream:C.white}}>
                          <td style={{padding:'8px 10px',fontWeight:600,color:C.navy}}>{be.name}</td>
                          <td style={{padding:'8px 10px',fontFamily:'monospace'}}>{fmt(be.breakeven_revenue,cc)}</td>
                          <td style={{padding:'8px 10px',fontFamily:'monospace'}}>{fmt(be.current_revenue,cc)}</td>
                          <td style={{padding:'8px 10px',fontFamily:'monospace',fontWeight:700,color:be.gap>=0?C.green:C.red}}>{fmt(be.gap,cc)}</td>
                          <td style={{padding:'8px 10px',fontFamily:'monospace'}}>{pct(be.variable_cost_pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {section==='spread' && (() => {
        const allSpreads = result.allocUnits.flatMap(u => result.unitPL[u.id]?.spread_analysis||[])
        if (allSpreads.length===0) return (
          <div style={card}>
            <p style={{color:C.slate,fontSize:'0.88rem'}}>No spread lines defined. In Planning, add a revenue line and set its type to "Spread" to track buy price, sell price, and margin per unit.</p>
          </div>
        )
        return (
          <div>
            {allSpreads.map(s=>(
              <div key={s.line_id} style={card}>
                <div style={secH}>{s.name}</div>
                <div style={kpiGrid}>
                  <KPI label="Total Volume" value={s.volume.reduce((a,b)=>a+b,0).toLocaleString()} sub="units"/>
                  <KPI label="Avg Buy Price" value={fmt(s.buy_price.filter(v=>v>0).reduce((a,b)=>a+b,0)/Math.max(1,s.buy_price.filter(v=>v>0).length),cc)} color={C.red}/>
                  <KPI label="Avg Sell Price" value={fmt(s.sell_price.filter(v=>v>0).reduce((a,b)=>a+b,0)/Math.max(1,s.sell_price.filter(v=>v>0).length),cc)} color={C.green}/>
                  <KPI label="Total Spread" value={fmt(s.total_spread.reduce((a,b)=>a+b,0),cc)} color={C.teal}/>
                </div>
                <PLTable title="" rows={[
                  {label:'Volume (units)',values:s.volume},
                  {label:'Buy Price',values:s.buy_price},
                  {label:'Sell Price',values:s.sell_price},
                  {label:'Spread per Unit',values:s.spread_per_unit,highlight:true},
                  {label:'Total Spread Revenue',values:s.total_spread,bold:true},
                ]} months={months} cc={cc} showExport/>
              </div>
            ))}
          </div>
        )
      })()}

      {section==='service' && (() => {
        const allMargins = result.allocUnits.flatMap(u => result.unitPL[u.id]?.service_margins||[])
        if (allMargins.length===0) return (
          <div style={card}>
            <p style={{color:C.slate,fontSize:'0.88rem'}}>No service fee lines defined. In Planning, add a revenue line and set its type to "Service Fee" to track fee, cost of delivery, and margin per engagement.</p>
          </div>
        )
        return (
          <div>
            {allMargins.map(s=>(
              <div key={s.line_id} style={card}>
                <div style={secH}>{s.name}</div>
                <div style={kpiGrid}>
                  <KPI label="Total Engagements" value={s.engagements.reduce((a,b)=>a+b,0).toLocaleString()}/>
                  <KPI label="Avg Fee" value={fmt(s.fee.filter(v=>v>0).reduce((a,b)=>a+b,0)/Math.max(1,s.fee.filter(v=>v>0).length),cc)} color={C.green}/>
                  <KPI label="Avg Cost/Engagement" value={fmt(s.cost.filter(v=>v>0).reduce((a,b)=>a+b,0)/Math.max(1,s.cost.filter(v=>v>0).length),cc)} color={C.red}/>
                  <KPI label="Total Margin" value={fmt(s.margin.reduce((a,b)=>a+b,0),cc)} color={C.teal}/>
                </div>
                <PLTable title="" rows={[
                  {label:'Engagements',values:s.engagements},
                  {label:'Fee per Engagement',values:s.fee},
                  {label:'Cost per Engagement',values:s.cost,negate:true},
                  {label:'Margin per Engagement',values:s.margin.map((mv,i)=>s.engagements[i]>0?mv/s.engagements[i]:0),highlight:true},
                  {label:'Total Margin',values:s.margin,bold:true},
                ]} months={months} cc={cc} showExport/>
              </div>
            ))}
          </div>
        )
      })()}

      {section==='staff' && (
        <div>
          <div style={kpiGrid}>
            <KPI label="Total Headcount" value={String(m.total_headcount)} color={C.navy}/>
            <KPI label="Revenue per Head" value={fmt(m.revenue_per_head,cc)} color={C.teal}/>
            <KPI label="Total Staff Cost" value={fmt(m.total_staff_cost,cc)} color={C.red}/>
            <KPI label="Staff Cost %" value={pct(m.staff_cost_pct)} color={m.staff_cost_pct<0.3?C.green:m.staff_cost_pct<0.5?C.amber:C.red}/>
          </div>
          <div style={card}>
            <div style={secH}>Staff Efficiency by Unit</div>
            <div style={{overflowX:'auto'}}>
              <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.8rem'}}>
                <thead>
                  <tr style={{background:C.navy,color:C.white}}>
                    {['Unit','Headcount','Revenue','Staff Cost','Revenue/Head','Staff Cost %'].map(h=>(
                      <th key={h} style={{padding:'8px 10px',textAlign:'left',fontWeight:600,fontSize:'0.75rem'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.allocUnits.map((u,i)=>{
                    const pl = result.unitPL[u.id]
                    if (!pl) return null
                    return (
                      <tr key={u.id} style={{background:i%2===0?C.cream:C.white}}>
                        <td style={{padding:'8px 10px',fontWeight:600,color:C.navy}}>{u.name}</td>
                        <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace'}}>{u.headcount}</td>
                        <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace'}}>{fmt(pl.ann_rev,cc)}</td>
                        <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace',color:C.red}}>{fmt(pl.ann_staff,cc)}</td>
                        <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace',color:C.teal}}>{fmt(pl.staff_efficiency.revenue_per_head,cc)}</td>
                        <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace',color:pl.staff_efficiency.staff_cost_pct<0.3?C.green:pl.staff_efficiency.staff_cost_pct<0.5?C.amber:C.red,fontWeight:700}}>{pct(pl.staff_efficiency.staff_cost_pct)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <PLTable title="Monthly Staff Cost Trend" rows={[
            {label:'Total Staff Costs',values:result.allocUnits.reduce((acc,u)=>{
              const pl = result.unitPL[u.id]
              return pl ? acc.map((v,m2)=>v+pl.staff[m2]) : acc
            },Array(months.length).fill(0)),bold:true},
          ]} months={months} cc={cc} showExport/>
        </div>
      )}
    </div>
  )
}
// ── ACTUALS & WORKING CAPITAL TAB (toggle between two existing components) ──
function ActualsAndWorkingCapitalTab({config,result,months,cc,P,onSave}) {
  const [mode, setMode] = useState<'actuals'|'workingcapital'>('actuals')
  return (
    <div>
      <div style={{display:'flex',gap:'0.5rem',marginBottom:'1.25rem'}}>
        <button style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.5rem 1.1rem',border:'none',
          background:mode==='actuals'?C.navy:C.white,color:mode==='actuals'?C.white:C.slate,
          borderRadius:4,cursor:'pointer',fontWeight:mode==='actuals'?700:400}}
          onClick={()=>setMode('actuals')}>Monthly Actuals</button>
        <button style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.5rem 1.1rem',border:'none',
          background:mode==='workingcapital'?C.navy:C.white,color:mode==='workingcapital'?C.white:C.slate,
          borderRadius:4,cursor:'pointer',fontWeight:mode==='workingcapital'?700:400}}
          onClick={()=>setMode('workingcapital')}>Working Capital (Trade Credit)</button>
      </div>
      {mode==='actuals' && <ActualsTab config={config} months={months} cc={cc} P={P} onSave={onSave}/>}
      {mode==='workingcapital' && <WorkingCapitalTab config={config} result={result} months={months} cc={cc} P={P} onSave={onSave}/>}
    </div>
  )
}
// ── APPROVALS & SPEND REQUESTS TAB (toggle, reuses existing components) ──
function ApprovalsAndSpendTab({clientId,config,cc,P}) {
  const [mode, setMode] = useState<'approvals'|'requests'>('approvals')
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
      {mode==='approvals' && <ApprovalsTab clientId={clientId} config={config} cc={cc} P={P}/>}
      {mode==='requests' && <SpendRequestsTab clientId={clientId} config={config} cc={cc} P={P}/>}
    </div>
  )
}
// ── SETTINGS & ADMIN TAB (Settings + Scenarios + Team merged, toggle) ──
function SettingsAndAdminTab({config,result,months,cc,clientId,P,onSave}) {
  const [mode, setMode] = useState<'settings'|'scenarios'|'team'|'catalogue'|'field'>('settings')
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
        <button style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.5rem 1.1rem',border:'none',
          background:mode==='catalogue'?C.navy:C.white,color:mode==='catalogue'?C.white:C.slate,
          borderRadius:4,cursor:'pointer',fontWeight:mode==='catalogue'?700:400}}
          onClick={()=>setMode('catalogue')}>Catalogue</button>
        <button style={{fontFamily:'monospace',fontSize:'0.75rem',padding:'0.5rem 1.1rem',border:'none',
          background:mode==='field'?C.navy:C.white,color:mode==='field'?C.white:C.slate,
          borderRadius:4,cursor:'pointer',fontWeight:mode==='field'?700:400}}
          onClick={()=>setMode('field')}>Clearview Field</button>
      </div>
      {mode==='settings' && <SettingsTab config={config} P={P} onSave={onSave}/>}
      {mode==='scenarios' && <ScenariosTab config={config} result={result} months={months} cc={cc} P={P} onSave={onSave}/>}
      {mode==='team' && <TeamTab clientId={clientId} config={config} P={P}/>}
      {mode==='catalogue' && <CatalogueManager clientId={clientId} config={config} P={P}/>}
      {mode==='field' && <FieldOperatorManager clientId={clientId} config={config} P={P}/>}
    </div>
  )
}

// ── PROMOTION EVENTS & CUSTOMER ACQUISITION COST ──────────────
function PromotionEventsSection({clientId,config,cc,P,events,setEvents}) {
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
      setEvents((e:any[])=>[data,...e])
      setShowForm(false)
      setForm({name:'',channel:'',event_type:'promotion',date:new Date().toISOString().split('T')[0],cost:0,description:'',revenue_before:0,revenue_after:0,customers_acquired:0,period_weeks:4,unit_id:''})
    }
    setSaving(false)
  }

  // CAC by channel: total cost / total customers acquired, grouped by channel
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
      <div style={card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
          <div style={secH}>Customer Acquisition Cost by Channel</div>
          {P.canEditPlan&&<button style={addBtn()} onClick={()=>setShowForm(!showForm)}>+ Add Event</button>}
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
                    <td style={{padding:'8px 10px',fontFamily:'monospace',fontWeight:700,color:r.cac===null?C.slate:r.cac<r.cost/Math.max(1,r.customers)*0.8?C.green:C.navy}}>
                      {r.cac===null?'No customers recorded':fmt(r.cac,cc)}
                    </td>
                    <td style={{padding:'8px 10px',fontFamily:'monospace',color:C.green}}>{fmt(r.revenueLift,cc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{fontSize:'0.72rem',color:C.slate,marginTop:'0.6rem'}}>Lower cost per customer means a more efficient channel. Channels with no customers recorded cannot be ranked -- add a customer count to each event to see this.</p>
          </div>
        )}
      </div>

      {showForm&&(
        <div style={{...card,border:`1px solid ${C.cyan}`}}>
          <div style={fGrid}>
            <div><label style={lbl}>Event Name</label><input style={inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
            <div><label style={lbl}>Channel</label><input style={inp} placeholder="e.g. Farmer Field Days, Radio, WhatsApp" value={form.channel} onChange={e=>setForm(f=>({...f,channel:e.target.value}))}/></div>
            <div><label style={lbl}>Type</label><select style={inp} value={form.event_type} onChange={e=>setForm(f=>({...f,event_type:e.target.value}))}>
              {['promotion','marketing','farmer_day','trade_fair','demonstration','other'].map(t=><option key={t} value={t}>{t.replace('_',' ')}</option>)}
            </select></div>
            <div><label style={lbl}>Business Unit</label><select style={inp} value={form.unit_id} onChange={e=>setForm(f=>({...f,unit_id:e.target.value}))}>
              <option value="">All units</option>
              {config.business_units.filter((u:any)=>u.active).map((u:any)=><option key={u.id} value={u.id}>{u.name}</option>)}
            </select></div>
            <div><label style={lbl}>Date</label><input type="date" style={inp} value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
            <div><label style={lbl}>Cost ({cc})</label><input type="number" style={inp} value={form.cost||''} onChange={e=>setForm(f=>({...f,cost:Number(e.target.value)}))}/></div>
            <div><label style={lbl}>Customers Acquired</label><input type="number" style={inp} value={form.customers_acquired||''} placeholder="New customers from this event" onChange={e=>setForm(f=>({...f,customers_acquired:Number(e.target.value)}))}/></div>
            <div><label style={lbl}>Comparison Window (weeks)</label><input type="number" style={inp} value={form.period_weeks} onChange={e=>setForm(f=>({...f,period_weeks:Number(e.target.value)}))}/></div>
            <div><label style={lbl}>Revenue Before ({cc})</label><input type="number" style={inp} value={form.revenue_before||''} onChange={e=>setForm(f=>({...f,revenue_before:Number(e.target.value)}))}/></div>
            <div><label style={lbl}>Revenue After ({cc})</label><input type="number" style={inp} value={form.revenue_after||''} onChange={e=>setForm(f=>({...f,revenue_after:Number(e.target.value)}))}/></div>
            <div style={{gridColumn:'1/-1'}}><label style={lbl}>Description</label><textarea style={{...inp,minHeight:60,resize:'vertical'}} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></div>
          </div>
          <div style={{display:'flex',gap:'0.6rem',marginTop:'0.85rem'}}>
            <button style={solidBtn()} disabled={saving} onClick={saveEvent}>{saving?'Saving...':'Save Event'}</button>
            <button style={addBtn(true,C.slate)} onClick={()=>setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {events.length>0 && (
        <div style={card}>
          <div style={secH}>All Events</div>
          {events.map((evt:any)=>{
            const roi = evt.cost>0 ? (evt.revenue_after-evt.revenue_before-evt.cost)/evt.cost : null
            const cac = evt.customers_acquired>0 ? evt.cost/evt.customers_acquired : null
            return (
              <div key={evt.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.6rem 0.75rem',background:C.lightBg,borderRadius:5,marginBottom:'0.4rem',flexWrap:'wrap',gap:'0.5rem'}}>
                <div>
                  <div style={{fontWeight:600,fontSize:'0.85rem',color:C.navy}}>{evt.name}</div>
                  <div style={{fontSize:'0.7rem',color:C.slate}}>{evt.date} · {evt.channel||'No channel set'}</div>
                </div>
                <div style={{display:'flex',gap:'0.4rem',flexWrap:'wrap'}}>
                  {cac!==null&&<Badge text={`CAC ${fmt(cac,cc)}`} color={C.teal}/>}
                  {roi!==null&&<Badge text={`ROI ${(roi*100).toFixed(0)}%`} color={roi>0?C.green:C.red}/>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── INVESTMENT PITCH DOWNLOAD ────────────────────────────────
function InvestmentPitchDownload({clientId}:{clientId:string}) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  async function download() {
    setDownloading(true)
    setError('')
    try {
      const response = await fetch('/api/investment-pitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || 'Could not generate the document')
      }
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="(.+)"/)
      const fileName = match ? match[1] : 'Investment_Summary.docx'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e.message || 'Download failed')
    }
    setDownloading(false)
  }

  return (
    <div style={{background:'#EBF8FF',borderRadius:6,padding:'0.85rem 1rem',marginBottom:'1.25rem',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.75rem'}}>
      <div>
        <div style={{fontWeight:700,fontSize:'0.88rem',color:C.navy}}>Investment Pitch Summary</div>
        <div style={{fontSize:'0.78rem',color:C.slate}}>A one-page Word document with the financial summary and scores, ready to send to a lender or investor.</div>
      </div>
      <button style={solidBtn(C.navy)} disabled={downloading} onClick={download}>
        {downloading ? 'Generating...' : 'Download Word Document'}
      </button>
      {error && (
        <div style={{width:'100%',background:'#FDF0EE',border:`2px solid ${C.red}`,borderRadius:6,padding:'0.85rem 1rem',marginTop:'0.5rem'}}>
          <div style={{fontWeight:700,color:C.red,fontSize:'0.85rem',marginBottom:'0.3rem'}}>⚠ Could not generate the document</div>
          <div style={{color:C.red,fontSize:'0.8rem'}}>{error}</div>
        </div>
      )}
    </div>
  )
}

// ── CASH FLOW TAB ────────────────────────────────────────────
function CashFlowTab({result,months,cc}) {
  if (!result) return <div style={card}><p style={{color:C.slate}}>Set up your planning data first.</p></div>
  const cf = result.cf
  const rows = [
    {label:'Opening Cash',values:cf.open,bold:true},
    {label:'Net Profit After Tax',values:result.con.npat},
    {label:'Operating Cash Flow',values:cf.op_cash,bold:true},
    {label:'Capital & Financing',values:cf.fin_cash},
    {label:'Fixed Asset Purchases',values:cf.inv_cash||Array(months.length).fill(0),negate:false},
    {label:'Net Change in Cash',values:cf.net,bold:true},
    {label:'Closing Cash',values:cf.close,bold:true,highlight:true},
  ]
  const debt = result.debtSchedule
  const hasLoan = debt && debt.totalPrincipal.some((v:number)=>v>0)
  const loanRows = hasLoan ? [
    {label:'Interest',values:debt.totalInterest},
    {label:'Principal',values:debt.totalPrincipal},
    {label:'Total Debt Service',values:debt.totalRepayment,bold:true},
    {label:'Closing Loan Balance',values:debt.totalOutstanding,bold:true,highlight:true},
  ] : []
  return (
    <div>
      <div style={kpiGrid}>
        <KPI label="Opening Cash" value={fmt(cf.open[0],cc)}/>
        <KPI label="Month 6 Cash" value={fmt(cf.close[5]||0,cc)} color={(cf.close[5]||0)>=0?C.navy:C.red}/>
        <KPI label="Closing Cash" value={fmt(cf.close[cf.close.length-1],cc)} color={cf.close[cf.close.length-1]>=0?C.navy:C.red}/>
        <KPI label="Lowest Point" value={fmt(result.metrics.min_cash,cc)} sub={`Month ${result.metrics.min_cash_month}`} color={result.metrics.min_cash>=0?C.navy:C.red}/>
      </div>
      <PLTable title="Cash Flow Statement" rows={rows} months={months} cc={cc} showExport/>
      {hasLoan && <PLTable title="Loan Repayment Schedule" rows={loanRows} months={months} cc={cc} showExport/>}
    </div>
  )
}

// ── BALANCE SHEET TAB ────────────────────────────────────────
function BalanceSheetTab({result,months,cc}) {
  if (!result) return <div style={card}><p style={{color:C.slate}}>Set up your planning data first.</p></div>
  const bs = result.bs
  const rows = [
    {label:'ASSETS',values:Array(months.length).fill(0),bold:true},
    {label:'Cash & Bank',values:bs.cash},
    {label:'Fixed Assets',values:bs.fixed_assets},
    {label:'Total Assets',values:bs.total_assets,bold:true,highlight:true},
    {label:'EQUITY',values:Array(months.length).fill(0),bold:true},
    {label:'Share Capital',values:bs.share_capital},
    {label:'Grant Equity',values:bs.grant_equity},
    {label:'Retained Earnings',values:bs.retained_earnings},
    {label:'Total Equity',values:bs.total_equity,bold:true},
    {label:'LIABILITIES',values:Array(months.length).fill(0),bold:true},
    {label:'Grant Liability',values:bs.grant_liability},
    {label:'Loan Liability',values:bs.loan_liability},
    {label:'Total Liabilities',values:bs.total_liabilities,bold:true},
    {label:'Total Equity & Liabilities',values:bs.total_equity_and_liabilities,bold:true,highlight:true},
  ]
  return <PLTable title="Balance Sheet" rows={rows} months={months} cc={cc} showExport/>
}
