// @ts-nocheck
'use client'
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import QRCode from 'qrcode'
import { mostRecentTokenUse } from '@/lib/field-auth'
import { supabase } from '@/lib/supabase'
import {
  fmt, fmtFull, pct, buildMonthLabels, buildYearGroups, collapseYear, defaultExpandedYears, extendPlanningHorizon, type YearAggregation, type YearGroup,
  runGenericModel, defaultGenericConfig,
  blankLine, spreadLine, serviceFeeLine,
  type GenericModelConfig, type GenericBusinessUnit,
  type GenericPlanLine, type LineCategory, type LineType, type UnitType,
} from '@/lib/generic-engine'
import { buildDebtSchedule, defaultCoachAssessment, dscrLabel, dscrColor, dscrRating, computeScoresTimeSeries, computeTradeCredit } from '@/lib/scoring-engine'
import { computeNPV, computeIRR, buildInvestmentCashFlows, computeCustomerGrowthSummary, annualRateToMonthlyRate, monthlyRateToAnnualRate } from '@/lib/investment-metrics'
import { computeLiquidityReadinessScore, computeLRSTimeSeries, computeFitScore, FIT_SCORE_PRESETS, LRS_WEIGHTS } from '@/lib/liquidity-readiness'
import { combinedActual, computeActualsTotals, applyPeriodActual, buildHybridConsolidated, computeCatalogueLineTotal } from '@/lib/actuals'
import { computeExceptionReport, canClosePeriod, periodForMonthIndex, monthIndexForPeriod, type UnitRevenueCheck } from '@/lib/month-end-close'
import { yearStartPeriod, canCloseCalendarYear, computeYearEndBalanceSheet } from '@/lib/annual-close'
import BuildStamp from '@/components/BuildStamp'
import VerificationRecognition from '@/components/generic/VerificationRecognition'

// ── Design tokens ────────────────────────────────────────────
const C = {
  navy:'var(--cv-navy)', cyan:'var(--cv-cyan)', cream:'var(--cv-cream)', white:'var(--cv-card)',
  slate:'var(--cv-slate)', border:'var(--cv-border)', teal:'var(--cv-teal)',
  red:'var(--cv-red)', green:'var(--cv-green)', amber:'var(--cv-amber)', purple:'var(--cv-purple)',
  lightBg:'var(--cv-alt)', planBg:'var(--cv-card)', actualBg:'var(--cv-tint-actual)',
}

// ── Style helpers ────────────────────────────────────────────
const card: React.CSSProperties = {background:C.white,border:'1px solid var(--cv-border-soft)',borderRadius:14,padding:'1.4rem 1.6rem',marginBottom:'1.35rem',boxShadow:'0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)'}
const secH: React.CSSProperties = {fontFamily:'Georgia,serif',fontSize:'1.05rem',fontWeight:700,color:C.navy,marginBottom:'0.75rem'}
const inp:  React.CSSProperties = {width:'100%',padding:'0.42rem 0.6rem',border:`1px solid ${C.border}`,borderRadius:4,fontSize:'0.92rem',fontFamily:'inherit',background:'var(--cv-bg-2)',color:C.navy,boxSizing:'border-box'}
const lbl:  React.CSSProperties = {display:'block',fontWeight:600,fontSize:'0.86rem',marginBottom:'0.22rem',color:C.navy}
const hint: React.CSSProperties = {fontSize:'0.8rem',color:C.slate,lineHeight:1.4,marginTop:'0.18rem'}
const fGrid:React.CSSProperties = {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:'1.1rem'}
const kpiGrid:React.CSSProperties = {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:'1rem',marginBottom:'1.25rem'}
const addBtn = (sm=false, col=C.cyan): React.CSSProperties => ({fontFamily:'monospace',fontSize:sm?'0.68rem':'0.72rem',padding:sm?'0.28rem 0.6rem':'0.38rem 0.8rem',border:`1px solid ${col}`,borderRadius:4,background:'transparent',color:col,cursor:'pointer'})
const solidBtn = (col=C.cyan, sm=false): React.CSSProperties => ({fontFamily:'monospace',fontSize:sm?'0.72rem':'0.78rem',fontWeight:600,padding:sm?'0.35rem 0.8rem':'0.5rem 1.1rem',border:'none',borderRadius:4,background:col,color:col===C.white?'var(--cv-navy)':'var(--cv-on-accent)',cursor:'pointer'})
const delBtn: React.CSSProperties = {fontSize:'0.8rem',color:C.red,background:'transparent',border:`1px solid ${C.border}`,borderRadius:3,cursor:'pointer',padding:'0.18rem 0.42rem'}

function navBtn(active: boolean): React.CSSProperties {
  return {fontFamily:'monospace',fontSize:'0.8rem',padding:'0.65rem 1rem',border:'none',background:'transparent',
    color:active?C.cyan:'var(--cv-wa-60)',cursor:'pointer',
    borderBottom:active?`3px solid ${C.cyan}`:'3px solid transparent',
    fontWeight:active?700:400,whiteSpace:'nowrap'}
}

// Spend-request categories. Plain-language labels from the approved mockup
// mapped onto the ORIGINAL stored category keys (cost_of_sales / staff /
// direct_opex / shared). Expanding the label list is UI-only: submitted and
// stored values stay inside the original key set, so existing rows, the P&L
// mapping, and the FM->CEO approval flow are all unaffected. No schema change.
const SPEND_CATEGORY_OPTIONS: {label:string;value:string}[] = [
  {label:'Cost of sales',          value:'cost_of_sales'},
  {label:'Staff & casual labour',  value:'staff'},
  {label:'Travel & accommodation', value:'direct_opex'},
  {label:'Marketing & promotion',  value:'direct_opex'},
  {label:'Equipment',              value:'direct_opex'},
  {label:'Rent & utilities',       value:'shared'},
  {label:'Other',                  value:'direct_opex'},
]
// Colour tag per stored category key (used by the category chips).
function categoryColor(cat?: string): string {
  return cat==='cost_of_sales' ? C.red
    : cat==='staff' ? C.purple
    : cat==='shared' ? C.amber
    : cat==='direct_opex' ? C.teal
    : C.slate
}

// Strip patronising preamble and waffle from any AI narrative before it is
// shown. The generation prompt and house style already forbid these, but
// older stored stories still contain them and models occasionally slip, so
// this cleans the displayed text regardless of what is stored.
function cleanStory(text: string): string {
  if (!text) return text
  let t = text.trim()
  const preambles = [
    /^(dear|hello|hi|hey|greetings)\b[^.!?\n]{0,40}[,:]\s+/i,
    /^let me be (honest|clear|straight)( with you)?[,.:;\s-]+/i,
    /^(to be|being) (honest|frank|clear)[,.:;\s-]+/i,
    /^honestly[,.:;\s-]+/i,
    /^here(?:'s| is| are)[^.!?]*[.:]\s+/i,
    /^i (want|need|have) to (flag|say|tell you|be honest)[^.!?]*[.:,]\s+/i,
    /^let me tell you[,.:;\s-]+/i,
    /^in (summary|short|brief)[,.:;\s-]+/i,
    /^a (quick )?note (on|about)[^.!?]*[.:]\s+/i,
    /^(so|well|now|look|first(ly)?|overall)[,]\s+/i,
    /^this (is a |month'?s )?(status )?report[^.!?]*[.:]\s+/i,
  ]
  let changed = true
  while (changed) {
    changed = false
    for (const re of preambles) {
      if (re.test(t)) { t = t.replace(re, '').trim(); t = t.charAt(0).toUpperCase() + t.slice(1); changed = true }
    }
  }
  // Strip markdown and symbol formatting the model sometimes emits despite the
  // house style: headings, bold/italic stars, code ticks, bullet markers, and
  // dashes used as punctuation. In-word hyphens (e.g. "break-even") are kept.
  t = t
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')     // # headings
    .replace(/\*\*(.+?)\*\*/g, '$1')         // **bold**
    .replace(/\*(.+?)\*/g, '$1')             // *italic*
    .replace(/^\s*[-*•·]\s+/gm, '')          // "- " or "* " bullet lines
    .replace(/[`#*]/g, '')                    // any stray ticks, hashes, stars
    .replace(/\s*[–—]\s*/g, ', ')            // en/em dash used as punctuation
    .replace(/\s+-\s+/g, ', ')               // spaced hyphen used as a dash
    .replace(/\n{3,}/g, '\n\n')             // collapse runs of blank lines
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')          // tidy space before punctuation
    .trim()
  return t
}

// ── Shared components ────────────────────────────────────────
function KPI({label,value,sub,color}:{label:string;value:string;sub?:string;color?:string}) {
  const accent = color || C.cyan
  return (
    <div style={{background:C.white,borderRadius:14,padding:'1.15rem 1.3rem 1.25rem',borderTop:`3px solid ${accent}`,boxShadow:'0 1px 2px var(--cv-shadow-1), 0 12px 32px var(--cv-shadow-2)'}}>
      <div style={{fontFamily:'monospace',fontSize:'0.8rem',letterSpacing:'0.14em',color:C.slate,textTransform:'uppercase',marginBottom:'0.45rem'}}>{label}</div>
      <div style={{fontFamily:'Georgia,serif',fontSize:'1.75rem',fontWeight:700,color:color||C.navy,lineHeight:1.05}}>{value}</div>
      {sub&&<div style={{fontSize:'0.8rem',color:C.slate,marginTop:'0.32rem'}}>{sub}</div>}
    </div>
  )
}

function Badge({text,color}:{text:string;color?:string}) {
  return <span style={{fontFamily:'monospace',fontSize:'0.72rem',padding:'0.1rem 0.42rem',borderRadius:4,background:color||C.slate,color:'var(--cv-on-accent)',display:'inline-block'}}>{text}</span>
}

// Rounded category chip for spend requests (matches the mockup's .cat pill).
function CategoryTag({category}:{category?:string}) {
  if (!category) return null
  return <span style={{fontFamily:'monospace',fontSize:'0.72rem',fontWeight:700,borderRadius:20,padding:'0.14rem 0.55rem',background:categoryColor(category),color:'var(--cv-on-accent)',whiteSpace:'nowrap',textTransform:'capitalize',display:'inline-block'}}>{category.replace(/_/g,' ')}</span>
}

// FM -> CEO -> Done approval-stage tracker dots (mockup .stage). Reads only
// the spend request's existing status + review timestamps; no new data.
function StageTracker({r}:{r:any}) {
  const done=C.green, on=C.amber, wait='var(--cv-border)', bad=C.red
  let fm:string, ceo:string, fin:string
  if (r.status==='approved')          { fm=done; ceo=done; fin=done }
  else if (r.status==='rejected')     { if (r.ceo_decided_at) { fm=done; ceo=bad; fin=wait } else { fm=bad; ceo=wait; fin=wait } }
  else if (r.status==='pending_ceo')  { fm=done; ceo=on; fin=wait }
  else                                { fm=on; ceo=wait; fin=wait } // pending_fm
  const dot=(c:string)=><span style={{width:9,height:9,borderRadius:'50%',background:c,display:'inline-block',flexShrink:0}}/>
  const lab:React.CSSProperties={fontFamily:'monospace',fontSize:'0.72rem',color:C.slate}
  return (
    <div style={{display:'flex',alignItems:'center',gap:'0.4rem',flexWrap:'wrap'}} aria-label="Approval stage">
      {dot(fm)}<span style={lab}>FM</span>
      {dot(ceo)}<span style={lab}>CEO</span>
      {dot(fin)}<span style={lab}>Done</span>
    </div>
  )
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

function PLRow({label,values,bold,highlight,negate,months,cc,actualMask,closedMask}:{label:string;values:number[];bold?:boolean;highlight?:boolean;negate?:boolean;months:string[];cc:string;actualMask?:boolean[];closedMask?:boolean[]}) {
  const total = values.reduce((s,v)=>s+v,0)
  const display = (v:number) => negate ? fmtFull(-Math.abs(v),cc) : fmtFull(v,cc)
  return (
    <tr style={{background:highlight?'var(--cv-tint-cyan)':bold?C.lightBg:C.white}}>
      <td style={{padding:'7px 10px',fontWeight:bold?700:400,color:C.navy,minWidth:160,fontSize:'0.86rem'}}>{label}</td>
      {values.map((v,i)=>{
        const isActual = actualMask?.[i]
        const isClosed = isActual && closedMask?.[i]
        return (
        <td key={i} style={{padding:'7px 8px',textAlign:'right',fontFamily:'monospace',fontSize:'0.86rem',
          color:isClosed?'var(--cv-on-accent)':negate?C.red:v<0?C.red:C.navy,fontWeight:bold?700:400,
          background:isClosed?'var(--cv-header)':isActual?'var(--cv-tint-teal)':undefined,
          borderBottom:isActual&&!isClosed?`2px solid ${C.teal}`:undefined}}>
          {display(v)}
        </td>
        )
      })}
      <td style={{padding:'7px 8px',textAlign:'right',fontFamily:'monospace',fontSize:'0.86rem',fontWeight:700,color:negate?C.red:total<0?C.red:C.navy,borderLeft:`2px solid ${C.border}`}}>
        {display(total)}
      </td>
    </tr>
  )
}

function PLTable({title,rows,months,cc,showExport,closedMask}:{title?:string;rows:{label:string;values:number[];bold?:boolean;highlight?:boolean;negate?:boolean;actualMask?:boolean[]}[];months:string[];cc:string;showExport?:boolean;closedMask?:boolean[]}) {
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
      <div style={{padding:'0.45rem 1.1rem',fontSize:'0.8rem',color:C.slate,background:C.lightBg,borderBottom:`1px solid ${C.border}`}}>
        Tip: each column headed FY is one year. Click a year to open or close its monthly detail.
      </div>
      {hasActuals&&(
        <div style={{padding:'0.5rem 1.1rem',fontSize:'0.8rem',fontFamily:'monospace',color:C.teal,display:'flex',alignItems:'center',gap:'1rem',flexWrap:'wrap',background:'var(--cv-tint-teal-soft)'}}>
          <span style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>
            <span style={{width:10,height:10,borderRadius:2,background:'var(--cv-tint-teal)',border:`2px solid ${C.teal}`,display:'inline-block'}}></span>
            Real data, still updating (live)
          </span>
          <span style={{display:'flex',alignItems:'center',gap:'0.4rem',color:C.navy}}>
            <span style={{width:10,height:10,borderRadius:2,background:'var(--cv-header)',display:'inline-block'}}></span>
            Closed -- final, locked at month-end
          </span>
        </div>
      )}
      <div style={{overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.86rem',fontFamily:'monospace'}}>
          <thead>
            <tr style={{background:'var(--cv-header)'}}>
              <th style={{textAlign:'left',padding:'8px 10px',color:'var(--cv-on-accent)',minWidth:160,fontSize:'0.86rem'}}></th>
              {months.map((m,i)=><th key={i} style={{textAlign:'right',padding:'8px 8px',color:'var(--cv-on-accent)',whiteSpace:'nowrap',fontSize:'0.8rem'}}>{m}</th>)}
              <th style={{textAlign:'right',padding:'8px 8px',color:C.cyan,whiteSpace:'nowrap',fontSize:'0.8rem',borderLeft:`2px solid var(--cv-wa-20)`}}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i)=><PLRow key={i} {...r} months={months} cc={cc} closedMask={closedMask}/>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Collapsible year/month P&L presentation. Year columns are entirely
// data-driven (buildYearGroups derives however many calendar years the
// model's start_date + months span) -- there is no fixed list of years
// anywhere in this component, so a model later extended to cover more
// years renders more columns automatically, with no code change needed
// here. Each year defaults to collapsed except the one containing
// today's date, which starts expanded (the year someone is most likely
// checking in on right now).
function PLTableCollapsible({title,rows,months,startDate,cc,showExport,closedMask}:{title?:string;rows:{label:string;values:number[];bold?:boolean;highlight?:boolean;negate?:boolean;actualMask?:boolean[];aggregation?:YearAggregation}[];months:string[];startDate:string;cc:string;showExport?:boolean;closedMask?:boolean[]}) {
  const yearGroups = useMemo(() => buildYearGroups(startDate, months.length), [startDate, months.length])
  const currentYear = new Date().getUTCFullYear()
  const [expanded, setExpanded] = useState<Record<number, boolean>>(() => defaultExpandedYears(yearGroups, currentYear))
  function toggle(year: number) { setExpanded(e => ({...e, [year]: !e[year]})) }
  function toggleKeyHandler(year: number) {
    return (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(year) } }
  }

  function exportCSV() {
    // Export always includes full monthly detail regardless of the
    // current expand/collapse state on screen -- collapsing a year is a
    // display convenience, not a reason to omit real data from an export.
    const headers = ['', ...months, ...yearGroups.map(g => `FY ${g.label}`)]
    const data = rows.map(r => {
      const yearTotals = yearGroups.map(g => String(Math.round(collapseYear(r.values, r.actualMask, g.monthIndices, r.aggregation).value)))
      return [r.label, ...r.values.map(v => String(Math.round(v))), ...yearTotals]
    })
    const csv = [headers, ...data].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], {type: 'text/csv'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${title || 'export'}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const hasActuals = rows.some(r => r.actualMask?.some(Boolean))

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
      <div style={{padding:'0.45rem 1.1rem',fontSize:'0.8rem',color:C.slate,background:C.lightBg,borderBottom:`1px solid ${C.border}`}}>
        Tip: each column headed FY is one year. Click a year to open or close its monthly detail.
      </div>
      {hasActuals&&(
        <div style={{padding:'0.5rem 1.1rem',fontSize:'0.8rem',fontFamily:'monospace',color:C.teal,display:'flex',alignItems:'center',gap:'1rem',flexWrap:'wrap',background:'var(--cv-tint-teal-soft)'}}>
          <span style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>
            <span style={{width:10,height:10,borderRadius:2,background:'var(--cv-tint-teal)',border:`2px solid ${C.teal}`,display:'inline-block'}}></span>
            Real data, still updating (live)
          </span>
          <span style={{display:'flex',alignItems:'center',gap:'0.4rem',color:C.navy}}>
            <span style={{width:10,height:10,borderRadius:2,background:'var(--cv-header)',display:'inline-block'}}></span>
            Closed -- final, locked at month-end
          </span>
          <span style={{display:'flex',alignItems:'center',gap:'0.4rem',color:C.amber}}>
            <span style={{width:10,height:10,borderRadius:2,background:'var(--cv-tint-amber-2)',border:`2px solid ${C.amber}`,display:'inline-block'}}></span>
            Year in progress -- part actual, part plan
          </span>
        </div>
      )}
      <div style={{overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.86rem',fontFamily:'monospace'}}>
          <thead>
            <tr style={{background:'var(--cv-header)'}}>
              <th style={{textAlign:'left',padding:'8px 10px',color:'var(--cv-on-accent)',minWidth:160,fontSize:'0.86rem',position:'sticky',left:0,background:'var(--cv-header)'}}></th>
              {yearGroups.map(g => expanded[g.year] ? (
                <React.Fragment key={g.year}>
                  {g.monthIndices.map(i => (
                    <th key={i} style={{textAlign:'right',padding:'8px 8px',color:'var(--cv-wa-75)',whiteSpace:'nowrap',fontSize:'0.8rem',fontWeight:400}}>{months[i]}</th>
                  ))}
                  <th onClick={()=>toggle(g.year)} onKeyDown={toggleKeyHandler(g.year)} tabIndex={0} role="button" aria-label={`Collapse FY ${g.label}`} style={{textAlign:'right',padding:'8px 10px',color:C.cyan,whiteSpace:'nowrap',fontSize:'0.8rem',cursor:'pointer',userSelect:'none',borderLeft:'2px solid var(--cv-wa-20)'}}>
                    FY {g.label} <span style={{fontSize:'0.72rem'}}>&#9666;</span>
                  </th>
                </React.Fragment>
              ) : (
                <th key={g.year} onClick={()=>toggle(g.year)} onKeyDown={toggleKeyHandler(g.year)} tabIndex={0} role="button" aria-label={`Expand FY ${g.label}`} style={{textAlign:'right',padding:'8px 10px',color:C.cyan,whiteSpace:'nowrap',fontSize:'0.8rem',cursor:'pointer',userSelect:'none',borderLeft:'2px solid var(--cv-wa-20)'}}>
                  FY {g.label} <span style={{fontSize:'0.72rem'}}>&#9662;</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r,ri)=>(
              <tr key={ri} style={{background:r.highlight?'var(--cv-tint-cyan)':r.bold?C.lightBg:C.white}}>
                <td style={{padding:'7px 10px',fontWeight:r.bold?700:400,color:C.navy,minWidth:160,fontSize:'0.86rem',position:'sticky',left:0,background:r.highlight?'var(--cv-tint-cyan)':r.bold?C.lightBg:C.white}}>{r.label}</td>
                {yearGroups.map(g => {
                  const cell = collapseYear(r.values, r.actualMask, g.monthIndices, r.aggregation)
                  const displayVal = (v:number) => r.negate ? fmtFull(-Math.abs(v),cc) : fmtFull(v,cc)
                  return expanded[g.year] ? (
                    <React.Fragment key={g.year}>
                      {g.monthIndices.map(i => {
                        const isActual = r.actualMask?.[i]
                        const isClosed = isActual && closedMask?.[i]
                        return (
                          <td key={i} style={{padding:'7px 8px',textAlign:'right',fontFamily:'monospace',fontSize:'0.86rem',
                            color:isClosed?'var(--cv-on-accent)':r.negate?C.red:r.values[i]<0?C.red:C.navy,fontWeight:r.bold?700:400,
                            background:isClosed?'var(--cv-header)':isActual?'var(--cv-tint-teal)':undefined,
                            borderBottom:isActual&&!isClosed?`2px solid ${C.teal}`:undefined}}>
                            {displayVal(r.values[i])}
                          </td>
                        )
                      })}
                      <td onClick={()=>toggle(g.year)} onKeyDown={toggleKeyHandler(g.year)} tabIndex={0} role="button" aria-label={`Collapse FY ${g.label}`} style={{padding:'7px 10px',textAlign:'right',fontFamily:'monospace',fontSize:'0.86rem',fontWeight:700,cursor:'pointer',
                        color:r.negate?C.red:cell.value<0?C.red:C.navy,
                        background:cell.isFullyActual?'var(--cv-tint-teal)':cell.isPartiallyActual?'var(--cv-tint-amber-2)':undefined,
                        borderLeft:`2px solid ${C.border}`}}>
                        {displayVal(cell.value)}
                      </td>
                    </React.Fragment>
                  ) : (
                    <td key={g.year} onClick={()=>toggle(g.year)} onKeyDown={toggleKeyHandler(g.year)} tabIndex={0} role="button" aria-label={`Expand FY ${g.label}`} style={{padding:'7px 10px',textAlign:'right',fontFamily:'monospace',fontSize:'0.86rem',fontWeight:r.bold?700:400,cursor:'pointer',
                      color:r.negate?C.red:cell.value<0?C.red:C.navy,
                      background:cell.isFullyActual?'var(--cv-tint-teal)':cell.isPartiallyActual?'var(--cv-tint-amber-2)':undefined,
                      borderLeft:`2px solid ${C.border}`}}>
                      {displayVal(cell.value)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Collapsible year/month trend for a single score dimension (Credit
// Risk, Going Concern, or Investment Readiness) -- the same collapsible
// mechanism as the P&L/BS/CF tabs, but built directly around
// computeScoresTimeSeries' already-computed per-year and per-month
// results rather than routing through PLTableCollapsible's aggregation
// logic, since the "collapsed year" value here is the year computed
// directly by the scoring engine, not a sum/endpoint of monthly values.
// Works identically whether the underlying data is all-plan (a
// prospective client with no live actuals at all) or a mix of actual
// and plan -- every period always has a real, computed value.
function ScoreTrendCard({
  title, years, monthsByYear, rows,
}: {
  title: string
  years: {label:string; monthIndices:number[]; result:any}[]
  monthsByYear: Record<string, {label:string; monthIndices:number[]; result:any}[]>
  rows: {label:string; getValue:(r:any)=>string|number; getColor:(r:any)=>string}[]
}) {
  const currentYear = new Date().getUTCFullYear()
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    const hasCurrent = years.some(y => y.label === String(currentYear))
    years.forEach((y, idx) => { init[y.label] = hasCurrent ? y.label === String(currentYear) : idx === 0 })
    return init
  })
  function toggle(label: string) { setExpanded(e => ({...e, [label]: !e[label]})) }
  function toggleKey(label: string) { return (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(label) } } }

  return (
    <div style={{...card,padding:0,overflow:'hidden',marginBottom:'1.25rem'}}>
      <div style={{padding:'0.85rem 1.1rem',borderBottom:`1px solid ${C.border}`,fontFamily:'Georgia,serif',fontSize:'0.95rem',fontWeight:700,color:C.navy}}>{title}</div>
      <div style={{overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.86rem',fontFamily:'monospace'}}>
          <thead>
            <tr style={{background:'var(--cv-header)'}}>
              <th style={{textAlign:'left',padding:'8px 10px',color:'var(--cv-on-accent)',minWidth:160,fontSize:'0.86rem',position:'sticky',left:0,background:'var(--cv-header)'}}></th>
              {years.map(y => expanded[y.label] ? (
                <React.Fragment key={y.label}>
                  {(monthsByYear[y.label]||[]).map((m,i) => (
                    <th key={i} style={{textAlign:'right',padding:'8px 8px',color:'var(--cv-wa-75)',whiteSpace:'nowrap',fontSize:'0.8rem',fontWeight:400}}>{m.label}</th>
                  ))}
                  <th onClick={()=>toggle(y.label)} onKeyDown={toggleKey(y.label)} tabIndex={0} role="button" aria-label={`Collapse FY ${y.label}`}
                    style={{textAlign:'right',padding:'8px 10px',color:C.cyan,whiteSpace:'nowrap',fontSize:'0.8rem',cursor:'pointer',userSelect:'none',borderLeft:'2px solid var(--cv-wa-20)'}}>
                    FY {y.label} <span style={{fontSize:'0.72rem'}}>&#9666;</span>
                  </th>
                </React.Fragment>
              ) : (
                <th key={y.label} onClick={()=>toggle(y.label)} onKeyDown={toggleKey(y.label)} tabIndex={0} role="button" aria-label={`Expand FY ${y.label}`}
                  style={{textAlign:'right',padding:'8px 10px',color:C.cyan,whiteSpace:'nowrap',fontSize:'0.8rem',cursor:'pointer',userSelect:'none',borderLeft:'2px solid var(--cv-wa-20)'}}>
                  FY {y.label} <span style={{fontSize:'0.72rem'}}>&#9662;</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row,ri)=>(
              <tr key={row.label} style={ri%2===1?{background:C.lightBg}:undefined}>
                <td style={{padding:'7px 10px',fontWeight:ri===0?700:400,color:C.navy,minWidth:160,fontSize:ri===0?'0.8rem':'0.75rem',position:'sticky',left:0,background:ri%2===1?C.lightBg:C.white}}>{row.label}</td>
                {years.map(y => expanded[y.label] ? (
                  <React.Fragment key={y.label}>
                    {(monthsByYear[y.label]||[]).map((m,i) => (
                      <td key={i} style={{padding:'7px 8px',textAlign:'right',fontFamily:'monospace',fontSize:'0.86rem',fontWeight:ri===0?700:400,color:row.getColor(m.result)}}>
                        {row.getValue(m.result)}
                      </td>
                    ))}
                    <td onClick={()=>toggle(y.label)} style={{padding:'7px 10px',textAlign:'right',fontFamily:'monospace',fontSize:'0.86rem',fontWeight:ri===0?700:400,cursor:'pointer',color:row.getColor(y.result),borderLeft:`2px solid ${C.border}`}}>
                      {row.getValue(y.result)}
                    </td>
                  </React.Fragment>
                ) : (
                  <td key={y.label} onClick={()=>toggle(y.label)} style={{padding:'7px 10px',textAlign:'right',fontFamily:'monospace',fontSize:'0.86rem',fontWeight:ri===0?700:400,cursor:'pointer',color:row.getColor(y.result),borderLeft:`2px solid ${C.border}`}}>
                    {row.getValue(y.result)}
                  </td>
                ))}
              </tr>
            ))}
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
  // Which periods (YYYY-MM-01 strings) have been closed via month-end
  // close -- lets the P&L distinguish a "live, still updating" actual
  // month from a "closed, final" one (docs/ACCOUNTING_ARCHITECTURE.md
  // section 5: the live highlight moves to the new current month at close).
  const [closedPeriods, setClosedPeriods] = useState<Set<string>>(new Set())

  // Light/dark theme. Dashboard defaults to light (matching the mockup).
  // Applied globally via document.documentElement.dataset.theme, so the
  // choice is shared with the field app page too.
  const [theme, setTheme] = useState<'light'|'dark'>('light')
  useEffect(() => {
    const saved = localStorage.getItem('cv-theme')
    const initial = saved === 'light' || saved === 'dark' ? saved : 'light'
    setTheme(initial)
    if (initial === 'dark') document.documentElement.dataset.theme = 'dark'
    else delete document.documentElement.dataset.theme
  }, [])
  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('cv-theme', next)
      if (next === 'dark') document.documentElement.dataset.theme = 'dark'
      else delete document.documentElement.dataset.theme
      return next
    })
  }
  // Set an explicit theme mode. Reuses the exact persistence the header
  // toggle uses (localStorage 'cv-theme' + document.documentElement.dataset
  // .theme), so the Appearance control in Settings and the header stay in
  // sync. Passed down to SettingsTab. 'auto' resolves to the device's current
  // preference via matchMedia and is stored as the concrete light/dark value
  // it resolves to -- the app has no separate 'auto' persistence to invent.
  const setThemeMode = (mode: 'light'|'dark'|'auto') => {
    const resolved: 'light'|'dark' = mode === 'auto'
      ? (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : mode
    setTheme(resolved)
    localStorage.setItem('cv-theme', resolved)
    if (resolved === 'dark') document.documentElement.dataset.theme = 'dark'
    else delete document.documentElement.dataset.theme
  }

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

  const loadClosedPeriods = useCallback(() => {
    if (!clientId) return
    supabase.from('generic_period_close').select('period').eq('client_id', clientId).eq('closed', true)
      .then(({data, error}) => {
        // Explicit error handling -- a silent fallback to an empty set on
        // error would make every period appear open/live in the P&L even
        // if some are genuinely closed, which is the wrong direction to
        // fail for a "what's final vs still live" display.
        if (error) { console.error('Failed to load closed periods:', error); return }
        setClosedPeriods(new Set((data||[]).map((r:any) => r.period)))
      })
  }, [clientId])

  useEffect(() => { loadClosedPeriods() }, [loadClosedPeriods])

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
      <button onClick={P.onSignOut} style={solidBtn('var(--cv-header)')}>Sign Out</button>
    </div>
  )
  if (!config) return <Spinner/>

  const activeUnits = config.business_units.filter(u => u.active)

  // Grouped so inputs sit together and outputs sit together: Overview (home),
  // then the input tabs, then the reporting/output tabs, then admin.
  const mainNav = [
    ['overview','Overview'],
    ['intelligence','Clearview Intelligence'],
    ['planning','Planning'],
    ['actuals_wc','Actuals & Working Capital'],
    ['pl','P&L'],
    ['cashflow','Cash Flow'],
    ['balancesheet','Balance Sheet'],
    ['approvals',`Approvals${pendingApprovalCount>0?` (${pendingApprovalCount})`:''}`],
    ['settings','Settings'],
  ]

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.cream,color:C.navy,minHeight:'100vh'}}>
      <BuildStamp/>
      {/* Header */}
      <header style={{background:'var(--cv-header)',borderBottom:`3px solid ${C.cyan}`}}>
        <div style={{maxWidth:1600,margin:'0 auto',padding:'1.25rem 1.5rem',display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'1rem'}}>
          <div>
            <div style={{fontFamily:'monospace',fontSize:'0.72rem',letterSpacing:'0.15em',color:C.cyan,marginBottom:'0.28rem'}}>CANVAS COACH — CLEARVIEW</div>
            <div style={{display:'flex',alignItems:'center',gap:'0.7rem',flexWrap:'wrap'}}>
              <h1 style={{fontFamily:'Georgia,serif',fontSize:'1.5rem',fontWeight:700,color:'var(--cv-on-accent)',margin:'0.1rem 0 0.15rem'}}>{config.business_name || 'New Client'}</h1>
              {result?.scores&&(
                <span style={{fontFamily:'monospace',fontSize:'0.72rem',fontWeight:700,letterSpacing:'0.04em',padding:'0.2rem 0.65rem',borderRadius:20,background:'var(--cv-wa-10)',color:result.scores.classColor,border:`1px solid ${result.scores.classColor}`,display:'inline-flex',alignItems:'center',gap:'0.4rem'}}>
                  <span style={{width:7,height:7,borderRadius:7,background:result.scores.classColor,display:'inline-block'}}/>{result.scores.classification}
                </span>
              )}
            </div>
            <div style={{fontSize:'0.86rem',color:'var(--cv-wa-85)'}}>
              {activeUnits.length} unit{activeUnits.length!==1?'s':''} · {cc} · {P.fullName}
              {saving&&<span style={{marginLeft:8,color:C.amber}}>· Saving...</span>}
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
            <span style={{fontFamily:'monospace',fontSize:'0.72rem',color:C.cyan,border:`1px solid var(--cv-cyan-40)`,borderRadius:4,padding:'0.18rem 0.5rem',textTransform:'uppercase'}}>{P.role.replace('_',' ')}</span>
            <button onClick={toggleTheme} aria-label="Toggle light or dark theme" title="Toggle light/dark theme" style={{fontFamily:'monospace',fontSize:'0.72rem',background:'transparent',border:`1px solid var(--cv-wa-45)`,borderRadius:4,color:'var(--cv-wa-85)',cursor:'pointer',padding:'0.18rem 0.5rem'}}>{theme==='dark'?'☀':'☾'} Theme</button>
            <button onClick={P.onSignOut} style={{fontFamily:'monospace',fontSize:'0.72rem',background:'transparent',border:`1px solid var(--cv-wa-45)`,borderRadius:4,color:'var(--cv-wa-85)',cursor:'pointer',padding:'0.18rem 0.5rem'}}>Sign out</button>
          </div>
        </div>
      </header>

      {/* Nav */}
      <nav style={{background:'var(--cv-nav)',borderBottom:`1px solid var(--cv-cyan-dim)`,overflowX:'auto'}}>
        <div style={{maxWidth:1600,margin:'0 auto',padding:'0 1.5rem',display:'flex'}}>
          {mainNav.map(([id,label])=>(
            <button key={id} style={navBtn(view===id)} onClick={()=>setView(id)}>{label}</button>
          ))}
        </div>
      </nav>

      {/* Main */}
      <main style={{maxWidth:1600,margin:'0 auto',padding:'1.5rem'}}>
        {view==='overview'    && <OverviewTab config={config} result={result} months={months} cc={cc} P={P} onSave={saveConfig} pendingApprovalCount={pendingApprovalCount} onGoToApprovals={()=>setView('approvals')} onGoToIntelligence={()=>setView('intelligence')}/>}
        {view==='approvals'   && <ApprovalsAndSpendTab clientId={clientId} config={config} cc={cc} P={P}/>}
        {view==='intelligence'&& <ClearviewIntelligenceTab clientId={clientId} config={config} result={result} months={months} cc={cc} P={P} onSave={saveConfig} closedPeriods={closedPeriods} onNavigate={setView}/>}
        {view==='planning'    && <PlanningTab config={config} result={result} months={months} cc={cc} P={P} onSave={saveConfig}/>}
        {view==='pl'          && <PLTab config={config} result={result} months={months} cc={cc} P={P} closedPeriods={closedPeriods}/>}
        {view==='cashflow'    && <CashFlowTab config={config} result={result} months={months} cc={cc} closedPeriods={closedPeriods}/>}
        {view==='balancesheet'&& <BalanceSheetTab config={config} result={result} months={months} cc={cc} P={P} closedPeriods={closedPeriods} onCloseStatusChanged={loadClosedPeriods}/>}
        {view==='actuals_wc'  && <ActualsAndWorkingCapitalTab config={config} result={result} months={months} cc={cc} P={P} onSave={saveConfig} onCloseStatusChanged={loadClosedPeriods}/>}
        {view==='settings'    && <SettingsAndAdminTab config={config} result={result} months={months} cc={cc} clientId={clientId} P={P} onSave={saveConfig} theme={theme} setThemeMode={setThemeMode}/>}
      </main>

      <footer style={{textAlign:'center',padding:'1.5rem',fontFamily:'monospace',fontSize:'0.72rem',color:C.slate,borderTop:`1px solid ${C.border}`,marginTop:'2rem'}}>
        Canvas Coach · Clearview · {config.business_name} · habibonifade.com · Confidential
      </footer>
    </div>
  )
}
// ── Overview visuals: donut score card + revenue/cost trend chart ──
function ScoreDonut({label,display,frac,rating,color,onClick}:{label:string;display:string;frac:number;rating:string;color:string;onClick?:()=>void}) {
  const r=26, circ=2*Math.PI*r, f=Math.max(0,Math.min(1,frac||0))
  return (
    <div onClick={onClick} style={{background:C.white,borderRadius:14,padding:'1.05rem 1.15rem',borderLeft:`4px solid ${color}`,boxShadow:'0 1px 2px var(--cv-shadow-1), 0 12px 32px var(--cv-shadow-2)',display:'flex',alignItems:'center',gap:'0.9rem',cursor:onClick?'pointer':'default'}}>
      <svg width="60" height="60" viewBox="0 0 62 62" style={{flexShrink:0}}>
        <circle cx="31" cy="31" r={r} fill="none" style={{stroke:'var(--cv-border-soft)'}} strokeWidth="6"/>
        <circle cx="31" cy="31" r={r} fill="none" style={{stroke:color}} strokeWidth="6" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ*(1-f)} transform="rotate(-90 31 31)"/>
      </svg>
      <div style={{minWidth:0}}>
        <div style={{fontSize:'0.8rem',color:C.slate,marginBottom:'0.18rem'}}>{label}</div>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.45rem',fontWeight:700,color:C.navy,lineHeight:1}}>{display}</div>
        <div style={{fontSize:'0.8rem',fontWeight:700,color,marginTop:'0.22rem'}}>{rating}</div>
      </div>
    </div>
  )
}

function TrendChart({months,revenue,cost,ebitda,cc}:{months:string[];revenue:number[];cost:number[];ebitda:number[];cc:string}) {
  const n=months.length
  if(!n) return null
  const W=680,H=220,padL=48,padR=14,padT=14,padB=26
  const all=[...revenue,...cost,...ebitda].filter(v=>typeof v==='number'&&isFinite(v))
  const maxV=Math.max(1,...all), minV=Math.min(0,...all)
  const span=(maxV-minV)||1
  const x=(i:number)=> padL+(n<=1?0:(i/(n-1))*(W-padL-padR))
  const y=(v:number)=> padT+(1-(((v||0)-minV)/span))*(H-padT-padB)
  const path=(arr:number[])=>arr.map((v,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(v||0).toFixed(1)}`).join(' ')
  const area=`${path(revenue)} L${x(n-1).toFixed(1)},${y(minV).toFixed(1)} L${x(0).toFixed(1)},${y(minV).toFixed(1)} Z`
  const ticks=[minV,minV+span/2,maxV]
  const xi=Array.from(new Set([0,Math.round((n-1)/3),Math.round(2*(n-1)/3),n-1]))
  const short=(v:number)=>{const a=Math.abs(v);return a>=1e9?`${(v/1e9).toFixed(1)}B`:a>=1e6?`${(v/1e6).toFixed(0)}M`:a>=1e3?`${(v/1e3).toFixed(0)}K`:`${Math.round(v)}`}
  return (
    <div style={{overflowX:'auto'}}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{display:'block',minWidth:420}}>
        {ticks.map((t,i)=>(<g key={i}>
          <line x1={padL} y1={y(t)} x2={W-padR} y2={y(t)} style={{stroke:'var(--cv-border-soft)'}}/>
          <text x={4} y={y(t)+3} fontSize="9" style={{fill:C.slate}} fontFamily="monospace">{short(t)}</text>
        </g>))}
        <path d={area} style={{fill:C.cyan}} opacity="0.1"/>
        <path d={path(cost)} fill="none" style={{stroke:C.amber}} strokeWidth="2"/>
        <path d={path(ebitda)} fill="none" style={{stroke:C.green}} strokeWidth="2"/>
        <path d={path(revenue)} fill="none" style={{stroke:C.teal}} strokeWidth="2.5"/>
        {xi.map(i=>(<text key={i} x={x(i)} y={H-7} fontSize="9" style={{fill:C.slate}} textAnchor="middle" fontFamily="monospace">{months[i]||`M${i+1}`}</text>))}
      </svg>
    </div>
  )
}

const ovLabel: React.CSSProperties = {fontFamily:'monospace',fontSize:'0.8rem',letterSpacing:'0.14em',color:C.slate,textTransform:'uppercase',margin:'0.25rem 0 0.7rem'}

// ── OVERVIEW TAB ─────────────────────────────────────────────
function OverviewTab({config,result,months,cc,P,onSave,pendingApprovalCount,onGoToApprovals,onGoToIntelligence}) {
  const [story,setStory] = useState<any>(null)
  useEffect(()=>{
    if(!config.client_id) return
    supabase.from('coach_briefings').select('*').eq('client_id',config.client_id).order('generated_at',{ascending:false}).limit(1)
      .then(({data}:any)=>setStory(data?.[0]||null))
  },[config.client_id])
  if (!result) return (
    <div style={card}>
      <div style={{...secH,marginBottom:'0.5rem'}}>Welcome to Clearview</div>
      <p style={{color:C.slate,fontSize:'0.92rem',lineHeight:1.7}}>
        This financial planning platform is ready for {config.business_name||'your business'}.
        Start by going to <strong>Settings</strong> to define your business units and revenue lines,
        then go to <strong>Planning</strong> to enter your financial plan.
      </p>
    </div>
  )
  const m = result.metrics
  const s = result.scores
  return (
    <div>
      {pendingApprovalCount>0&&(
        <div style={{background:'var(--cv-tint-amber)',border:`1px solid ${C.amber}`,borderRadius:8,padding:'0.85rem 1.1rem',marginBottom:'1.25rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontWeight:600,color:C.amber}}>⏳ {pendingApprovalCount} spend request{pendingApprovalCount>1?'s':''} awaiting approval</span>
          <button style={addBtn(true,C.amber)} onClick={onGoToApprovals}>Review now →</button>
        </div>
      )}
      {/* Headline scores -- the interpreted verdict, alongside the raw
          numbers below. Kept as a compact banner rather than merged into
          the KPI grid: these are composite, judgment-weighted scores,
          not the same kind of figure as Revenue/EBITDA, and the deeper
          narrative/coach assessment/events behind them stay in Clearview
          Intelligence -- this just removes the need to click through
          just to see where the business currently stands on each. */}
      {s&&(<>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',flexWrap:'wrap',gap:'0.5rem'}}>
          <div style={ovLabel}>Clearview Intelligence</div>
          <button type="button" style={{...addBtn(true),borderColor:C.border,color:C.teal,marginBottom:'0.7rem'}} onClick={onGoToIntelligence}>See full analysis →</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(215px,1fr))',gap:'1rem',marginBottom:'1.6rem'}}>
          <ScoreDonut label="Credit Risk" display={`${s.score}/100`} frac={s.score/100} rating={s.classification} color={s.classColor} onClick={onGoToIntelligence}/>
          <ScoreDonut label="Going Concern" display={`${s.gcScore}/20`} frac={s.gcScore/20} rating={s.gcRating} color={s.gcColor} onClick={onGoToIntelligence}/>
          <ScoreDonut label="Investment Readiness" display={`${s.irScore}/30`} frac={s.irScore/30} rating={s.irTier} color={s.irColor} onClick={onGoToIntelligence}/>
          <ScoreDonut label="Debt Service" display={dscrLabel(s)} frac={s.hasDebt?Math.min((s.dscrMin||0)/2.5,1):0} rating={s.hasDebt?dscrRating(s):'No debt'} color={dscrColor(s,{green:C.green,amber:C.amber,red:C.red,slate:C.slate})} onClick={onGoToIntelligence}/>
        </div>
      </>)}
      <div style={ovLabel}>Financial Snapshot</div>
      <div style={kpiGrid}>
        <KPI label="Total Revenue" value={fmt(m.total_revenue,cc)} color={C.navy}/>
        <KPI label="Gross Profit" value={fmt(m.total_gp,cc)} sub={pct(m.gross_margin)} color={m.total_gp>=0?C.green:C.red}/>
        <KPI label="EBITDA" value={fmt(m.total_ebitda,cc)} sub={pct(m.net_margin)} color={m.total_ebitda>=0?C.teal:C.red}/>
        <KPI label="Min Cash" value={fmt(m.min_cash,cc)} sub={`Month ${m.min_cash_month}`} color={m.min_cash>=0?C.navy:C.red}/>
        <KPI label="Breakeven" value={fmt(m.business_breakeven,cc)} sub="Annual revenue needed" color={C.amber}/>
        <KPI label="Revenue/Head" value={fmt(m.revenue_per_head,cc)} sub={`${m.total_headcount} staff`} color={C.purple}/>
      </div>
      <div style={ovLabel}>Overview</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))',gap:'1.25rem',marginBottom:'1.6rem',alignItems:'stretch'}}>
        {result.con&&Array.isArray(result.con.rev)&&(
          <div style={{...card,marginBottom:0,height:360,display:'flex',flexDirection:'column'}}>
            <div style={{...secH,fontSize:'1rem',marginBottom:'0.55rem'}}>Revenue and cost trend</div>
            <div style={{display:'flex',gap:'1.2rem',marginBottom:'0.75rem',fontSize:'0.8rem',color:C.slate,flexWrap:'wrap'}}>
              <span><span style={{display:'inline-block',width:10,height:10,borderRadius:10,background:C.teal,marginRight:6,verticalAlign:'middle'}}/>Revenue</span>
              <span><span style={{display:'inline-block',width:10,height:10,borderRadius:10,background:C.amber,marginRight:6,verticalAlign:'middle'}}/>Total cost</span>
              <span><span style={{display:'inline-block',width:10,height:10,borderRadius:10,background:C.green,marginRight:6,verticalAlign:'middle'}}/>EBITDA</span>
            </div>
            <div style={{flex:1,minHeight:0,display:'flex',alignItems:'center'}}>
              <TrendChart months={months} revenue={result.con.rev} cost={result.con.rev.map((r:number,i:number)=>r-((result.con.ebitda&&result.con.ebitda[i])||0))} ebitda={result.con.ebitda||[]} cc={cc}/>
            </div>
          </div>
        )}
        <div style={{...card,marginBottom:0,height:360,display:'flex',flexDirection:'column'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.5rem'}}>
            <div style={{...secH,fontSize:'1rem',marginBottom:0}}>This Month&apos;s Story</div>
            <span style={{fontFamily:'monospace',fontSize:'0.72rem',letterSpacing:'0.1em',color:C.purple,border:`1px solid ${C.purple}`,borderRadius:4,padding:'0.1rem 0.42rem'}}>OPUS</span>
          </div>
          {story ? (
            <>
              <div style={{fontSize:'0.8rem',color:C.slate,marginBottom:'0.6rem'}}>{story.period_covered||''}{story.generated_at?` · generated ${new Date(story.generated_at).toLocaleDateString('en-GB')}`:''}</div>
              <div style={{flex:1,minHeight:0,fontSize:'0.92rem',color:C.navy,lineHeight:1.7,whiteSpace:'pre-wrap',overflowY:'auto'}}>{cleanStory(story.briefing_text)}</div>
            </>
          ) : (
            <div style={{flex:1,display:'flex',alignItems:'center'}}>
              <p style={{fontSize:'0.92rem',color:C.slate,lineHeight:1.7,margin:0}}>
                No month story yet. Open{' '}
                <span onClick={onGoToIntelligence} style={{color:C.teal,fontWeight:700,cursor:'pointer',textDecoration:'underline'}}>Clearview Intelligence</span>
                {' '}and generate This Month&apos;s Story to see it here.
              </p>
            </div>
          )}
        </div>
      </div>
      {/* Unit performance cards */}
      <div style={{...secH,marginTop:'0.5rem'}}>Business Unit Performance</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:'1.25rem',marginBottom:'1.5rem',alignItems:'stretch'}}>
        {result.allocUnits.map(u => {
          const pl = result.unitPL[u.id]
          if (!pl) return null
          const metric = (label:string,value:string,color:string) => (
            <div style={{background:C.lightBg,borderRadius:8,padding:'0.7rem 0.8rem'}}>
              <div style={{color:C.slate,fontSize:'0.72rem',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:'0.25rem'}}>{label}</div>
              <div style={{fontWeight:700,fontSize:'0.95rem',color,fontFamily:'monospace'}}>{value}</div>
            </div>
          )
          return (
            <div key={u.id} style={{...card,borderTop:`4px solid ${u.color||C.cyan}`,marginBottom:0,display:'flex',flexDirection:'column'}}>
              <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'0.85rem'}}>
                <span style={{width:9,height:9,borderRadius:9,background:u.color||C.cyan,display:'inline-block',flexShrink:0}}/>
                <div style={{fontWeight:700,fontSize:'0.95rem',color:C.navy}}>{u.name}</div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.6rem'}}>
                {metric('Revenue',fmt(pl.ann_rev,cc),C.navy)}
                {metric('Gross Profit',fmt(pl.ann_gp,cc),pl.ann_gp>=0?C.green:C.red)}
                {metric('EBITDA',fmt(pl.ann_ebitda,cc),pl.ann_ebitda>=0?C.teal:C.red)}
                {metric('GP Margin',pct(pl.gp_margin),C.navy)}
              </div>
              {/* Sub-units if any */}
              {result.subUnitsByParent[u.id]&&(
                <div style={{marginTop:'0.85rem',borderTop:`1px solid ${C.border}`,paddingTop:'0.6rem'}}>
                  <div style={{fontSize:'0.72rem',color:C.slate,marginBottom:'0.4rem',fontFamily:'monospace',letterSpacing:'0.08em'}}>SUB-UNITS</div>
                  {result.subUnitsByParent[u.id].map(su=>{
                    const spl = result.unitPL[su.id]
                    return spl ? (
                      <div key={su.id} style={{display:'flex',justifyContent:'space-between',fontSize:'0.86rem',padding:'0.25rem 0'}}>
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
          <td colSpan={colSpanBefore} style={{padding:'3px 8px 3px 24px',fontSize:'0.8rem',color:C.slate}}>↳ {label}</td>
          {arr.map((v,m)=>(
            <td key={m} style={{padding:'2px 4px'}}>
              {canEdit
                ? <input type="number" style={{width:74,padding:'2px 4px',border:`1px solid ${C.border}`,borderRadius:3,fontSize:'0.72rem',fontFamily:'monospace',textAlign:'right',background:C.lightBg,color:C.slate}}
                    value={v??''} placeholder="0"
                    onChange={e=>onUpdate(field,m,Number(e.target.value))}/>
                : <span style={{display:'block',textAlign:'right',padding:'2px 4px',fontSize:'0.72rem',color:C.slate}}>{isCurrency?fmt(v,cc):v.toLocaleString()}</span>
              }
            </td>
          ))}
          <td style={{padding:'3px 8px',textAlign:'right',fontSize:'0.8rem',color:C.slate,borderLeft:`2px solid ${C.border}`}}>{field===totalField?total.toLocaleString():''}</td>
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
  // Cost of Sales product scope: '__whole__' = whole unit / shared, otherwise a
  // revenue line id. NOTE: no persisted cost->revenue link exists in the model
  // (GenericPlanLine has no revenue_line_id), so this is a presentation-only
  // grouping for now -- selecting a product does not filter or persist a link.
  const [costProduct, setCostProduct] = useState<string>('__whole__')

  const unit = config.business_units.find(u=>u.id===selUnit)
  const lines = config.plan_lines.filter(l=>l.unit_id===selUnit&&l.category===selSection&&l.active)
  // Revenue lines of the selected unit -- feed the Cost of Sales product selector.
  const revLines = config.plan_lines.filter(l=>l.unit_id===selUnit&&l.category==='revenue'&&l.active)

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

  // Bulk setter for a line's whole monthly_plan array -- same onSave contract
  // and same plan_lines.map shape as updateLine (the per-month editor), just
  // writing the entire array at once so a fill helper is a single save rather
  // than a loop of stale-config updates. Used only by the FILL buttons below.
  function setLineMonthlyPlan(lineId:string, arr:number[]) {
    onSave({...config, plan_lines: config.plan_lines.map(l =>
      l.id===lineId ? {...l, monthly_plan: arr} : l
    )})
  }

  // ── Per-line FILL helpers ──────────────────────────────────
  // All operate purely on monthly_plan via setLineMonthlyPlan (same path as the
  // manual month inputs). monthly_plan is the real driver for standard revenue
  // lines and for every cost/staff/overhead line; spread & service-fee lines
  // drive off their sub-fields instead, so fills are not offered on them.
  function fillSameEachMonth(l:GenericPlanLine) {
    let val = l.monthly_plan.find(v=>v) // first non-zero
    if (val===undefined||val===0) {
      const entered = typeof window!=='undefined' ? window.prompt('Value to use for every month?','0') : null
      if (entered===null) return
      val = Number(entered)||0
    }
    setLineMonthlyPlan(l.id, l.monthly_plan.map(()=>val as number))
  }
  function fillGrow5(l:GenericPlanLine) {
    // Per-calendar-year +5%: base is the first non-zero month, held flat within
    // each 12-month year and stepped up 5% compounding at each year boundary.
    let base = l.monthly_plan.find(v=>v)
    if (base===undefined||base===0) {
      const entered = typeof window!=='undefined' ? window.prompt('Starting monthly value to grow 5%/yr?','0') : null
      if (entered===null) return
      base = Number(entered)||0
    }
    const b = base as number
    setLineMonthlyPlan(l.id, l.monthly_plan.map((_,m)=>Math.round(b*Math.pow(1.05,Math.floor(m/12)))))
  }
  function fillCopyLast(l:GenericPlanLine) {
    // Copy the last edited (last non-zero) month forward to every later month.
    let lastIdx = -1
    for (let i=0;i<l.monthly_plan.length;i++) if (l.monthly_plan[i]) lastIdx=i
    if (lastIdx<0) return
    const val = l.monthly_plan[lastIdx]
    setLineMonthlyPlan(l.id, l.monthly_plan.map((v,i)=>i>lastIdx?val:v))
  }
  function clearLine(l:GenericPlanLine) {
    setLineMonthlyPlan(l.id, l.monthly_plan.map(()=>0))
  }

  // Set the active scenario -- same mechanism as the Scenarios tab: the engine
  // reads whichever scenario carries active:true and applies its multipliers.
  const scenarios = config.settings.scenarios||[]
  const activeScenarioId = scenarios.find(s=>s.active)?.id||''
  function setActiveScenario(id:string) {
    onSave({...config, settings:{...config.settings,
      scenarios: scenarios.map(s=>({...s, active:s.id===id}))
    }})
  }

  const sections: [LineCategory,string][] = [['revenue','Revenue'],['cost_of_sales','Cost of Sales'],['staff','Staff'],['direct_opex','Overheads']]
  const sectionAccent: Record<string,string> = {revenue:C.green, cost_of_sales:C.red, staff:C.purple, direct_opex:C.amber}
  const accent = sectionAccent[selSection]||C.cyan
  const typeBadge = (lt:LineType):[string,string] =>
    lt==='spread' ? ['Spread',C.purple] : lt==='service_fee' ? ['Service',C.teal] : ['Standard',C.slate]

  const unitRevenue = result?.unitPL[selUnit]
  const totals = selSection==='revenue' ? unitRevenue?.rev : selSection==='cost_of_sales' ? unitRevenue?.cogs : selSection==='staff' ? unitRevenue?.staff : unitRevenue?.opex

  return (
    <div>
      {/* Unit selector */}
      <div style={{display:'flex',gap:'0.45rem',marginBottom:'1.25rem',flexWrap:'wrap',alignItems:'center'}}>
        {config.business_units.filter(u=>u.active).map(u=>(
          <button key={u.id} style={{fontFamily:'monospace',fontSize:'0.8rem',padding:'0.45rem 0.85rem',
            border:`2px solid ${selUnit===u.id?(u.color||C.cyan):C.border}`,borderRadius:4,
            background:selUnit===u.id?(u.color||C.cyan):C.white,
            color:selUnit===u.id?'var(--cv-on-accent)':C.navy,cursor:'pointer'}}
            onClick={()=>setSelUnit(u.id)}>
            {u.name}
          </button>
        ))}
      </div>

      {/* Section tabs */}
      <div style={{display:'flex',gap:'0.35rem',marginBottom:'1.25rem',borderBottom:`1px solid ${C.border}`,paddingBottom:'0.5rem'}}>
        {sections.map(([cat,label])=>(
          <button key={cat} style={{fontFamily:'monospace',fontSize:'0.8rem',padding:'0.4rem 0.85rem',border:'none',
            background:selSection===cat?'var(--cv-header)':C.white,color:selSection===cat?'var(--cv-on-accent)':C.slate,
            borderRadius:4,cursor:'pointer',fontWeight:selSection===cat?700:400}}
            onClick={()=>setSelSection(cat)}>
            {label}
          </button>
        ))}
      </div>

      {/* Instruction bar — calm workflow guidance + plan/actual legend */}
      <div style={{display:'flex',alignItems:'center',gap:'0.9rem',flexWrap:'wrap',background:C.lightBg,border:'1px solid var(--cv-border-soft)',borderLeft:`4px solid ${accent}`,borderRadius:10,padding:'0.7rem 1rem',marginBottom:'1.1rem'}}>
        <span style={{fontSize:'0.92rem',color:C.navy,lineHeight:1.5}}>Set your assumptions first, then fill each line month by month — use the quick-fill buttons or type directly into any cell.</span>
        <span style={{display:'flex',alignItems:'center',gap:'0.9rem',marginLeft:'auto',fontSize:'0.8rem',color:C.slate,whiteSpace:'nowrap'}}>
          <span style={{display:'inline-flex',alignItems:'center',gap:'0.35rem'}}><span style={{width:11,height:11,borderRadius:3,background:C.green,display:'inline-block'}}/>posted actual</span>
          <span style={{display:'inline-flex',alignItems:'center',gap:'0.35rem'}}><span style={{width:11,height:11,borderRadius:3,background:C.border,display:'inline-block'}}/>plan</span>
        </span>
      </div>

      {/* Assumptions strip — real settings only (scenario). Payment-terms drivers
          do not exist in this model, so they are omitted rather than faked. */}
      <div style={{display:'flex',alignItems:'center',gap:'1.1rem',flexWrap:'wrap',background:C.white,border:'1px solid var(--cv-border-soft)',borderLeft:`4px solid ${C.cyan}`,borderRadius:10,padding:'0.75rem 1.1rem',marginBottom:'1.4rem',boxShadow:'0 1px 2px var(--cv-shadow-1)'}}>
        <div style={{fontFamily:'Georgia,serif',fontSize:'0.92rem',fontWeight:700,color:C.navy}}>Assumptions</div>
        <div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
          <label style={{...lbl,marginBottom:0}}>Scenario</label>
          {scenarios.length>0
            ? <select style={{...inp,width:'auto',minWidth:210}} value={activeScenarioId} disabled={!P.canEditPlan}
                onChange={e=>setActiveScenario(e.target.value)} aria-label="Active scenario">
                {scenarios.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            : <span style={{...hint,marginTop:0}}>No scenarios defined — add them in the Scenarios tab.</span>
          }
        </div>
        <span style={{...hint,marginTop:0,maxWidth:360}}>Scenario multipliers are edited in the Scenarios tab. This model has no payment-terms (DSO/DPO) drivers, so those controls are intentionally omitted.</span>
      </div>

      {/* Cost of Sales — product / revenue-line scope selector */}
      {selSection==='cost_of_sales' && (
        <div style={{display:'flex',alignItems:'center',gap:'0.9rem',flexWrap:'wrap',background:C.white,border:'1px solid var(--cv-border-soft)',borderLeft:`4px solid ${C.red}`,borderRadius:10,padding:'0.75rem 1.1rem',marginBottom:'1.3rem',boxShadow:'0 1px 2px var(--cv-shadow-1)'}}>
          <label style={{...lbl,marginBottom:0}}>Costs for</label>
          <select style={{...inp,width:'auto',minWidth:220}} value={costProduct} onChange={e=>setCostProduct(e.target.value)} aria-label="Cost of sales product scope">
            <option value="__whole__">Whole unit / shared</option>
            {revLines.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <span style={{...hint,marginTop:0,maxWidth:440}}>Working view only: cost lines are not yet linked to a specific revenue line in the data model, so every cost line for this unit is shown regardless of the selection above.</span>
        </div>
      )}

      {/* Section header + add */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1rem',fontWeight:700,color:C.navy}}>{unit?.name} — {sections.find(s=>s[0]===selSection)?.[1]}</div>
        {P.canEditPlan&&<button style={addBtn(true,accent)} onClick={()=>addLine(selSection)}>+ Add {selSection==='cost_of_sales'?'a cost':'line'}</button>}
      </div>

      {/* Line cards */}
      {lines.length===0 && (
        <div style={{...card,textAlign:'center',color:C.slate,fontSize:'0.92rem'}}>No lines yet. Use “+ Add” above to create one.</div>
      )}
      {lines.map((l,ri)=>{
        const isSpread = selSection==='revenue' && l.line_type==='spread'
        const isServiceFee = selSection==='revenue' && l.line_type==='service_fee'
        // For spread/service-fee lines, revenue is derived from the source
        // fields (matches the formula in generic-engine.ts exactly) rather
        // than monthly_plan, which the engine ignores for these line types.
        // Spread revenue is the GROSS sale value (sell price x volume) --
        // buy cost is a separate Cost of Sales line in the engine, not
        // netted against revenue. Must match generic-engine.ts exactly or
        // this row shows a different number than the sub-row total below it.
        const revenueByMonth = isSpread
          ? (l.volume??[]).map((v,m)=>(l.sell_price?.[m]??0)*v)
          : isServiceFee
          ? (l.engagements??[]).map((e,m)=>(l.fee_per_engagement?.[m]??0)*e)
          : l.monthly_plan
        const total = revenueByMonth.reduce((s,v)=>s+v,0)
        // Quick-fill writes monthly_plan; that is only the real driver for
        // standard/non-revenue lines. Spread & service lines drive off their
        // sub-fields, so fills are not offered for them (avoids a no-op).
        const canFill = !(isSpread||isServiceFee)
        const [badgeLabel,badgeColor] = typeBadge(l.line_type)
        return (
          <div key={l.id} style={{...card,padding:0,overflow:'hidden'}}>
            {/* Header with coloured accent bar */}
            <div style={{display:'flex',alignItems:'center',gap:'0.85rem',padding:'0.8rem 1.1rem',borderLeft:`5px solid ${accent}`,background:C.lightBg,borderBottom:'1px solid var(--cv-border-soft)',flexWrap:'wrap'}}>
              <div style={{flex:'1 1 220px',minWidth:180}}>
                {P.canEditPlan
                  ? <input style={{...inp,background:'transparent',border:'none',padding:0,fontSize:'0.95rem',fontWeight:700,fontFamily:'Georgia,serif',color:C.navy}}
                      value={l.name} onChange={e=>updateLineName(l.id,e.target.value)} aria-label="Line name"/>
                  : <span style={{fontSize:'0.95rem',fontWeight:700,fontFamily:'Georgia,serif',color:C.navy}}>{l.name}</span>
                }
              </div>
              {selSection==='revenue' && P.canEditPlan && (
                <select style={{...inp,width:'auto',padding:'0.3rem 0.5rem',fontSize:'0.8rem'}}
                  value={l.line_type} onChange={e=>changeLineType(l.id,e.target.value as LineType)} aria-label="Line type">
                  <option value="standard">Standard</option>
                  <option value="spread">Spread</option>
                  <option value="service_fee">Service fee</option>
                </select>
              )}
              <span style={{fontFamily:'monospace',fontSize:'0.72rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',color:badgeColor,border:`1px solid ${badgeColor}`,borderRadius:20,padding:'0.15rem 0.6rem',whiteSpace:'nowrap'}}>{badgeLabel}</span>
              <div style={{textAlign:'right',minWidth:100}}>
                <div style={{fontSize:'0.72rem',color:C.slate,textTransform:'uppercase',letterSpacing:'0.06em'}}>Annual total</div>
                <div style={{fontFamily:'monospace',fontSize:'0.95rem',fontWeight:700,color:C.navy}}>{fmt(total,cc)}</div>
              </div>
              {P.canEditPlan&&<button style={delBtn} onClick={()=>deleteLine(l.id)} aria-label={`Delete ${l.name}`}>×</button>}
            </div>

            {/* Per-line quick-fill helpers (write monthly_plan via the same save path) */}
            {P.canEditPlan && canFill && (
              <div style={{display:'flex',gap:'0.4rem',flexWrap:'wrap',padding:'0.65rem 1.1rem 0',alignItems:'center'}}>
                <span style={{fontSize:'0.8rem',color:C.slate,marginRight:'0.15rem'}}>Quick fill:</span>
                <button style={addBtn(true)} onClick={()=>fillSameEachMonth(l)}>Same each month</button>
                <button style={addBtn(true)} onClick={()=>fillGrow5(l)}>Grow 5% / yr</button>
                <button style={addBtn(true)} onClick={()=>fillCopyLast(l)}>Copy last month →</button>
                <button style={addBtn(true,C.red)} onClick={()=>clearLine(l)}>Clear</button>
              </div>
            )}

            {/* Month inputs (+ spread/service sub-rows unchanged) */}
            <div style={{overflowX:'auto',padding:'0.7rem 1.1rem 1.1rem'}}>
              <table style={{borderCollapse:'collapse',fontSize:'0.8rem',fontFamily:'monospace'}}>
                <thead>
                  <tr>
                    <th style={{minWidth:96}}></th>
                    {months.map((m,i)=><th key={i} style={{textAlign:'right',padding:'2px 4px',color:C.slate,whiteSpace:'nowrap',fontSize:'0.72rem',fontWeight:600}}>{m}</th>)}
                    <th style={{textAlign:'right',padding:'2px 8px',color:C.navy,fontWeight:700,fontSize:'0.72rem',borderLeft:`2px solid ${C.border}`}}>Total</th>
                    {P.canEditPlan&&<th style={{width:16}}></th>}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{padding:'3px 8px',fontSize:'0.72rem',color:C.slate,whiteSpace:'nowrap'}}>{(isSpread||isServiceFee)?'↳ Revenue':'Monthly plan'}</td>
                    {(isSpread||isServiceFee)
                      ? revenueByMonth.map((v,m)=>(
                          <td key={m} style={{padding:'2px 4px'}}>
                            <span style={{display:'block',textAlign:'right',padding:'3px 5px',fontSize:'0.8rem',color:C.slate}}>{fmt(v,cc)}</span>
                          </td>
                        ))
                      : l.monthly_plan.map((v,m)=>(
                          <td key={m} style={{padding:'2px 4px'}}>
                            {P.canEditPlan
                              ? <input type="number" style={{width:80,padding:'3px 5px',border:`1px solid ${C.border}`,borderRadius:3,fontSize:'0.8rem',fontFamily:'monospace',textAlign:'right',background:C.white,color:C.navy}}
                                  value={v??''} placeholder="0"
                                  onChange={e=>updateLine(l.id,m,Number(e.target.value))}/>
                              : <span style={{display:'block',textAlign:'right',padding:'3px 5px',fontSize:'0.8rem'}}>{fmt(v,cc)}</span>
                            }
                          </td>
                        ))}
                    <td style={{padding:'3px 8px',textAlign:'right',fontWeight:700,color:C.navy,borderLeft:`2px solid ${C.border}`}}>{fmt(total,cc)}</td>
                    {P.canEditPlan&&<td></td>}
                  </tr>
                  {isSpread && (
                    <LineFieldSubRows l={l} months={months} cc={cc} canEdit={P.canEditPlan}
                      rowBg={C.white} colSpanBefore={1}
                      rows={SPREAD_SUBROWS} totalField="volume"
                      onUpdate={(field,m,val)=>updateLineArrayField(l.id,field as any,m,val)}/>
                  )}
                  {isServiceFee && (
                    <LineFieldSubRows l={l} months={months} cc={cc} canEdit={P.canEditPlan}
                      rowBg={C.white} colSpanBefore={1}
                      rows={SERVICE_FEE_SUBROWS} totalField="engagements"
                      onUpdate={(field,m,val)=>updateLineArrayField(l.id,field as any,m,val)}/>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {/* Section total */}
      {totals&&(
        <div style={{...card,padding:0,overflow:'hidden',borderTop:`3px solid ${accent}`}}>
          <div style={{overflowX:'auto',padding:'0.8rem 1.1rem'}}>
            <table style={{borderCollapse:'collapse',fontSize:'0.8rem',fontFamily:'monospace'}}>
              <tbody>
                <tr style={{background:'var(--cv-header)'}}>
                  <td style={{padding:'6px 10px',fontWeight:700,color:'var(--cv-on-accent)',fontSize:'0.86rem',whiteSpace:'nowrap'}}>Section total</td>
                  {totals.map((v,i)=><td key={i} style={{padding:'6px 4px',textAlign:'right',fontSize:'0.8rem',color:C.cyan,fontWeight:700,minWidth:74}}>{fmt(v,cc)}</td>)}
                  <td style={{padding:'6px 10px',textAlign:'right',fontWeight:700,color:C.cyan,borderLeft:'2px solid var(--cv-wa-20)'}}>{fmt(totals.reduce((s,v)=>s+v,0),cc)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Shared lines section */}
      {selSection==='staff'&&(
        <div style={card}>
          <SectionHeader title="Shared / Central Costs" action={P.canEditPlan?<button style={addBtn(true)} onClick={()=>{
            const id=`shared_${Date.now()}`
            onSave({...config,shared_lines:[...config.shared_lines,blankLine(id,'shared','New shared cost','shared',config.planning_months)]})
          }}>+ Add Shared Cost</button>:null}/>
          <p style={{fontSize:'0.92rem',color:C.slate,marginBottom:'0.75rem'}}>Central costs (CEO salary, office costs etc) allocated across all units by headcount and revenue.</p>
          {config.shared_lines.map((l,ri)=>(
            <div key={l.id} style={{display:'flex',gap:'0.75rem',alignItems:'center',marginBottom:'0.5rem',padding:'0.4rem 0.6rem',background:ri%2===0?C.cream:C.white,borderRadius:4}}>
              <div style={{flex:1}}>
                {P.canEditPlan
                  ? <input style={{...inp,background:'transparent',border:'none',padding:0,fontSize:'0.92rem'}}
                      value={l.name} onChange={e=>onSave({...config,shared_lines:config.shared_lines.map(sl=>sl.id===l.id?{...sl,name:e.target.value}:sl)})}/>
                  : <span style={{fontSize:'0.92rem',color:C.navy}}>{l.name}</span>
                }
              </div>
              <div style={{width:140}}>
                {P.canEditPlan
                  ? <input type="number" style={{...inp,textAlign:'right',fontFamily:'monospace',fontSize:'0.92rem'}}
                      value={l.monthly_plan[0]??''} placeholder="Monthly amount"
                      onChange={e=>onSave({...config,shared_lines:config.shared_lines.map(sl=>sl.id===l.id?{...sl,monthly_plan:Array(config.planning_months).fill(Number(e.target.value))}:sl)})}/>
                  : <span style={{fontFamily:'monospace',fontSize:'0.92rem',color:C.navy,display:'block',textAlign:'right'}}>{fmt(l.monthly_plan[0],cc)}/mo</span>
                }
              </div>
              <div style={{fontFamily:'monospace',fontSize:'0.86rem',color:C.slate,width:100,textAlign:'right'}}>{fmt(l.monthly_plan.reduce((s,v)=>s+v,0),cc)}/yr</div>
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

  function updateScenario(id:string, field:'label'|'rev_mult'|'cost_mult', value:string|number) {
    onSave({...config,settings:{...config.settings,
      scenarios:scenarios.map(s=>s.id===id?{...s,[field]:value}:s)
    }})
  }

  function addScenario() {
    const newId = 'scenario_'+Date.now()
    onSave({...config,settings:{...config.settings,
      scenarios:[...scenarios,{id:newId,label:'New Scenario',rev_mult:1.0,cost_mult:1.0,active:false}]
    }})
  }

  function deleteScenario(id:string) {
    if (id==='base') return // the base case is never deletable -- always a real 1.0x baseline to compare against
    const wasActive = scenarios.find(s=>s.id===id)?.active
    const remaining = scenarios.filter(s=>s.id!==id)
    onSave({...config,settings:{...config.settings,
      scenarios: wasActive ? remaining.map(s=>({...s,active:s.id==='base'})) : remaining,
    }})
  }

  return (
    <div>
      <div style={card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
          <div style={secH}>Scenarios</div>
          {P.canEditPlan&&<button type="button" style={addBtn()} onClick={addScenario}>+ New Scenario</button>}
        </div>
        {scenarios.map(sc=>(
          <div key={sc.id} style={{display:'flex',alignItems:'center',gap:'1rem',padding:'0.75rem',border:`1px solid ${sc.active?C.cyan:C.border}`,borderRadius:6,marginBottom:'0.5rem',background:sc.active?'var(--cv-tint-cyan)':C.white}}>
            <input type="radio" checked={sc.active} onChange={()=>setActiveScenario(sc.id)} style={{cursor:'pointer'}} aria-label={`Set ${sc.label} as active`}/>
            <div style={{flex:1}}>
              {P.canEditPlan ? (
                <input style={{...inp,fontWeight:700,fontSize:'0.92rem',padding:'0.2rem 0.4rem',marginBottom:'0.3rem'}}
                  value={sc.label} onChange={e=>updateScenario(sc.id,'label',e.target.value)} aria-label={`Name for scenario ${sc.label}`}/>
              ) : (
                <div style={{fontWeight:700,fontSize:'0.92rem',color:C.navy}}>{sc.label}</div>
              )}
              {P.canEditPlan ? (
                <div style={{display:'flex',gap:'0.75rem',alignItems:'center',fontSize:'0.86rem',color:C.slate}}>
                  <span>Revenue ×</span>
                  <input type="number" step="0.01" style={{width:70,padding:'0.25rem 0.4rem',border:`1px solid ${C.border}`,borderRadius:4,fontFamily:'monospace',fontSize:'0.86rem'}}
                    value={sc.rev_mult} onChange={e=>updateScenario(sc.id,'rev_mult',e.target.value===''?1:Number(e.target.value))} aria-label={`Revenue multiplier for ${sc.label}`}/>
                  <span>Costs ×</span>
                  <input type="number" step="0.01" style={{width:70,padding:'0.25rem 0.4rem',border:`1px solid ${C.border}`,borderRadius:4,fontFamily:'monospace',fontSize:'0.86rem'}}
                    value={sc.cost_mult} onChange={e=>updateScenario(sc.id,'cost_mult',e.target.value===''?1:Number(e.target.value))} aria-label={`Cost multiplier for ${sc.label}`}/>
                </div>
              ) : (
                <div style={{fontSize:'0.86rem',color:C.slate}}>Revenue ×{sc.rev_mult} · Costs ×{sc.cost_mult}</div>
              )}
            </div>
            {sc.active&&<Badge text="Active" color={C.cyan}/>}
            {P.canEditPlan&&sc.id!=='base'&&<button type="button" style={delBtn} onClick={()=>deleteScenario(sc.id)} aria-label={`Delete ${sc.label}`}>×</button>}
          </div>
        ))}
      </div>
      {result&&(
        <PLTableCollapsible title="Scenario P&L" rows={[
          {label:'Revenue',values:result.con.rev,bold:true},
          {label:'Gross Profit',values:result.con.gp,highlight:true},
          {label:'EBITDA',values:result.con.ebitda,bold:true,highlight:true},
        ]} months={months} startDate={config.start_date} cc={cc} showExport/>
      )}
    </div>
  )
}
// ── ACTUALS TAB ───────────────────────────────────────────────
function ActualsTab({config,months,cc,P,onSave,onCloseStatusChanged}) {
  const [selUnit, setSelUnit] = useState(config.business_units.find(u=>u.active&&(!P.unitIds.length||P.unitIds.includes(u.id)))?.id||'')
  const [selPeriod, setSelPeriod] = useState(()=>{
    const d=new Date(); d.setDate(1)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
  })
  const [lineValues, setLineValues] = useState<Record<string,number>>({})
  const [fieldLineValues, setFieldLineValues] = useState<Record<string,number>>({})
  const [catalogueQuantities, setCatalogueQuantities] = useState<Record<string,Record<string,number>>>({})
  const [entryMode, setEntryMode] = useState<Record<string,'catalogue'|'manual'>>({})
  const [unitCatalogue, setUnitCatalogue] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [allActuals, setAllActuals] = useState<any[]>([])
  const [periodClose, setPeriodClose] = useState<any>(null)
  const [periodCloseVerified, setPeriodCloseVerified] = useState(false)
  const [staleCatalogue, setStaleCatalogue] = useState<any[]>([])
  const [closing, setClosing] = useState(false)
  // "One month · guided" (this existing single-month form) vs
  // "Many months · grid" (the multi-month catch-up grid). The guided path's
  // logic is entirely unchanged; the grid is a separate self-contained view.
  const [view, setView] = useState<'guided'|'grid'>('guided')

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
        setCatalogueQuantities(data?.catalogue_quantities||{})
        setSubmitted(data?.submitted||false)
        setLoading(false)
      })
  },[selUnit,selPeriod])

  // Catalogue items for the SELECTED UNIT, available to any authorized
  // user entering actuals -- not gated behind canSeeAll like the
  // staleness check above, which feeds a different, FM/CEO/coach-only
  // exception report. This is the same field_catalogue table and same
  // price-locked entry principle the field app already uses: pick an
  // item, enter a quantity, the price is never manually typed.
  useEffect(()=>{
    if (!selUnit) { setUnitCatalogue([]); return }
    let active = true
    supabase.from('field_catalogue').select('id,plan_line_id,name,item_type,price,unit_label')
      .eq('client_id',config.client_id).eq('business_unit_id',selUnit).eq('active',true)
      .then(({data})=>{ if (active) setUnitCatalogue(data||[]) })
    return () => { active = false }
  },[selUnit,config.client_id])

  useEffect(()=>{
    if (!canSeeAll) return
    supabase.from('generic_actuals').select('*')
      .eq('client_id',config.client_id).eq('period',selPeriod)
      .then(({data})=>setAllActuals(data||[]))
  },[selPeriod,canSeeAll])

  // periodClose MUST be fetched for every user, not just canSeeAll roles --
  // it drives both the save() guard and the input disabled state below.
  // Gating this fetch behind canSeeAll left periodClose permanently null
  // for regular unit-level users, meaning a CLOSED period stayed fully
  // editable and submittable for them -- the hard lock was silently
  // bypassed for exactly the users it's most meant to constrain.
  useEffect(()=>{
    let active = true
    // Fail closed: while this fetch is in flight (or if it errors), treat
    // the period as NOT verified -- both save() and the input disabled
    // state must refuse to assume "open" during that window. A user
    // selecting a closed month and saving before the lookup returns, or a
    // stale response from a previously-selected period landing late and
    // applying the wrong lock state, would otherwise bypass the whole
    // point of a hard gate.
    setPeriodClose(null)
    setPeriodCloseVerified(false)
    supabase.from('generic_period_close').select('*')
      .eq('client_id',config.client_id).eq('period',selPeriod)
      .maybeSingle()
      .then(({data,error})=>{
        if (!active) return // a newer selPeriod/client_id change already superseded this request
        if (error) {
          alert('Could not verify whether this period is closed. Editing is disabled until it can be verified.')
          return
        }
        setPeriodClose(data)
        setPeriodCloseVerified(true)
      })
    return () => { active = false }
  },[selPeriod,config.client_id])

  // Catalogue staleness data is genuinely FM/CEO/coach-only -- it feeds
  // the exception report, which only those roles act on.
  useEffect(()=>{
    if (!canSeeAll) return
    supabase.from('field_catalogue').select('id,name,cost_price,cost_price_updated_at')
      .eq('client_id',config.client_id).eq('active',true).not('cost_price','is',null)
      .then(({data})=>setStaleCatalogue(data||[]))
  },[selPeriod,canSeeAll,config.client_id])

  async function save(submit=false) {
    if (!periodCloseVerified) { alert('Close status is still loading. Please try again in a moment.'); return }
    if (periodClose?.closed) { alert('This period is closed and cannot be edited. Ask your Finance Manager to reopen it first.'); return }
    setSaving(true)
    const {error} = await supabase.from('generic_actuals').upsert({
      client_id:config.client_id, unit_id:selUnit, period:selPeriod,
      line_values:lineValues, catalogue_quantities:catalogueQuantities, submitted:submit||(submitted&&!canSeeAll),
      submitted_at:submit?new Date().toISOString():undefined,
      submitted_by:submit?P.fullName:undefined,
      entered_by:P.fullName, entered_at:new Date().toISOString(),
      updated_at:new Date().toISOString(),
    },{onConflict:'client_id,unit_id,period'})
    if (!error) { if(submit) setSubmitted(true) }
    setSaving(false)
  }

  // Month-end close: computes the exception report from real data --
  // stale cost prices (client-wide) and, per unit, actual revenue vs
  // planned revenue for this period. See docs/ACCOUNTING_ARCHITECTURE.md
  // section 5. Uses the shared, tested src/lib/month-end-close.ts so this
  // exact logic (not a copy) is what tests exercise.
  // Uses the shared, tested src/lib/month-end-close.ts monthIndexForPeriod
  // instead of a local copy -- both this and closedMask above rely on the
  // same UTC-safe period<->month-index arithmetic.

  const unitRevenueChecks: UnitRevenueCheck[] = canSeeAll ? visibleUnits.map(u => {
    const mIdx = monthIndexForPeriod(config.start_date, selPeriod)
    const revLines = config.plan_lines.filter((l:any) => l.unit_id === u.id && l.category === 'revenue' && l.active)
    const plannedRevenue = revLines.reduce((s:number,l:any) => s + (mIdx >= 0 && mIdx < (l.monthly_plan||[]).length ? (l.monthly_plan[mIdx]||0) : 0), 0)
    const unitRow = allActuals.find((a:any) => a.unit_id === u.id)
    const actualRevenue = unitRow
      ? revLines.reduce((s:number,l:any) => s + combinedActual(l.id, unitRow.line_values||{}, unitRow.field_line_values||{}), 0)
      : null
    return { unit_id: u.id, unit_name: u.name, planned_revenue: plannedRevenue, actual_revenue: actualRevenue }
  }) : []

  const exceptionReport = canSeeAll ? computeExceptionReport(staleCatalogue, unitRevenueChecks) : []
  const blockingExceptions = exceptionReport.filter(e => e.severity === 'blocking')
  const canClose = canClosePeriod(exceptionReport)

  async function closePeriod() {
    if (!periodCloseVerified) { alert('Close status is still loading. Please try again in a moment.'); return }
    if (!canClose) return
    setClosing(true)
    const {error} = await supabase.from('generic_period_close').upsert({
      client_id: config.client_id, period: selPeriod, closed: true,
      closed_at: new Date().toISOString(), closed_by: P.fullName,
      exception_report: exceptionReport,
    }, {onConflict:'client_id,period'})
    if (!error) { setPeriodClose({ closed: true, closed_at: new Date().toISOString(), closed_by: P.fullName }); onCloseStatusChanged?.() }
    else alert('Could not close this period. Please try again.')
    setClosing(false)
  }

  async function reopenPeriod() {
    if (!periodCloseVerified) { alert('Close status is still loading. Please try again in a moment.'); return }
    if (!confirm('Reopen this period for editing? This should only be done to correct a genuine mistake.')) return
    setClosing(true)
    const {error} = await supabase.from('generic_period_close')
      .update({ closed: false }).eq('client_id', config.client_id).eq('period', selPeriod)
    if (!error) { setPeriodClose((prev:any) => ({ ...prev, closed: false })); onCloseStatusChanged?.() }
    else alert('Could not reopen this period. Please try again.')
    setClosing(false)
  }

  // "Confirm still accurate" -- reuses the existing catalogue PATCH route
  // with the SAME cost_price value, which refreshes cost_price_updated_at
  // to now() without changing the actual price. No separate endpoint needed.
  async function confirmCostPriceStillAccurate(itemId: string, currentCostPrice: number) {
    try {
      const res = await fetch('/api/field/admin/catalogue', {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ id: itemId, cost_price: currentCostPrice }),
      })
      if (!res.ok) throw new Error('confirm failed')
      const {data,error} = await supabase.from('field_catalogue').select('id,name,cost_price,cost_price_updated_at')
        .eq('client_id',config.client_id).eq('active',true).not('cost_price','is',null)
      if (error) throw error
      setStaleCatalogue(data||[])
    } catch {
      alert('Could not confirm this cost price. Please try again.')
    }
  }

  const lines = config.plan_lines.filter(l=>l.unit_id===selUnit&&l.active&&!l.name.startsWith('Add '))
  const sections:[string,string][] = [['revenue','Revenue'],['cost_of_sales','Cost of Sales'],['staff','Staff'],['direct_opex','Overheads']]

  // Combined = manually entered + field-app-derived, for the same line.
  // Never sourced from a single shared value -- see docs/ACCOUNTING_ARCHITECTURE.md
  // section 4 for why these must stay in separate columns internally.
  // Uses the shared src/lib/actuals.ts so tests exercise the same function.
  const combined = (lineId:string) => combinedActual(lineId, lineValues, fieldLineValues)
  const { totalRev, totalCOGS, totalCost, grossProfit, netResult } = computeActualsTotals(lines, lineValues, fieldLineValues)

  // Catalogue items available for a given plan line -- if any exist,
  // catalogue-priced entry (pick an item, enter a quantity, price is
  // never manually typed) is the default; a line with none falls back to
  // the round-figure entry unchanged. Matches the field app's own
  // price-locked entry principle, now available for manual dashboard
  // entry too -- for the paper-only outlets round-figure entry remains
  // available as an explicit per-line fallback, never removed.
  const catalogueItemsForLine = (lineId:string) => unitCatalogue.filter(c=>c.plan_line_id===lineId)

  function isCatalogueMode(lineId:string): boolean {
    const items = catalogueItemsForLine(lineId)
    if (items.length === 0) return false
    return entryMode[lineId] !== 'manual' // defaults to catalogue mode whenever items exist
  }

  // Updates one catalogue item's quantity for a line, recomputes that
  // line's total as the sum of quantity x price across every catalogue
  // item mapped to it, and writes the result into lineValues -- the
  // single source of truth actually saved and used by the engine.
  // catalogue_quantities is saved alongside purely so the quantity
  // breakdown survives a reload, never read by the engine itself.
  function updateQuantity(lineId:string, itemId:string, qty:number) {
    const nextQuantities = {...(catalogueQuantities[lineId]||{}), [itemId]: qty}
    setCatalogueQuantities(cq => ({...cq, [lineId]: nextQuantities}))
    const total = computeCatalogueLineTotal(catalogueItemsForLine(lineId), nextQuantities)
    setLineValues(v => ({...v, [lineId]: total}))
  }

  const segBtn = (active:boolean): React.CSSProperties => ({fontFamily:'monospace',fontSize:'0.8rem',border:0,
    background:active?'var(--cv-header)':'transparent',color:active?'var(--cv-on-accent)':C.slate,
    padding:'0.42rem 0.85rem',borderRadius:7,cursor:'pointer',fontWeight:active?700:400})
  const unitSelect = canSeeAll ? (
    <select style={{fontFamily:'monospace',fontSize:'0.86rem',padding:'0.38rem 0.6rem',border:`1px solid ${C.border}`,borderRadius:4,background:C.white,color:C.navy}}
      value={selUnit} onChange={e=>setSelUnit(e.target.value)}>
      {visibleUnits.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
    </select>
  ) : null

  return (
    <div>
      {/* View toggle (segmented control) + selectors */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'0.6rem',flexWrap:'wrap',marginBottom:'1.1rem'}}>
        <div style={{display:'inline-flex',background:C.lightBg,borderRadius:9,padding:3}}>
          <button style={segBtn(view==='guided')} onClick={()=>setView('guided')}>One month · guided</button>
          <button style={segBtn(view==='grid')} onClick={()=>setView('grid')}>Many months · grid</button>
        </div>
        <div style={{display:'flex',gap:'0.75rem',flexWrap:'wrap',alignItems:'center'}}>
          {unitSelect}
          {view==='guided'&&(
            <>
              <select style={{fontFamily:'monospace',fontSize:'0.86rem',padding:'0.38rem 0.6rem',border:`1px solid ${C.border}`,borderRadius:4,background:C.white,color:C.navy}}
                value={selPeriod} onChange={e=>setSelPeriod(e.target.value)}>
                {periodMonths.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              {submitted&&<Badge text="Submitted" color={C.green}/>}
              {periodClose?.closed&&<Badge text="Closed" color={'var(--cv-header)'}/>}
            </>
          )}
        </div>
      </div>

      {view==='grid'
        ? <ActualsGridView config={config} selUnit={selUnit} cc={cc} P={P} canSeeAll={canSeeAll}/>
        : <>

      {/* This month at a glance */}
      {!loading&&(
        <>
          <div style={ovLabel}>This month at a glance</div>
          <div className="cv-grid-4" style={{marginBottom:'1.35rem'}}>
            <GlanceCard label="Revenue" value={fmt(totalRev,cc)} accent={C.green} valueColor={C.green}
              desc={`${lines.filter(l=>l.category==='revenue'&&combined(l.id)!==0).length} lines entered`}/>
            <GlanceCard label="Total costs" value={fmt(totalCost,cc)} accent={C.red} valueColor={C.red}
              desc="cost of sales + overheads"/>
            <GlanceCard label="Gross profit" value={fmt(grossProfit,cc)} accent={C.teal} valueColor={grossProfit>=0?C.teal:C.red}
              desc={totalRev>0?`${Math.round((grossProfit/totalRev)*100)}% margin`:'—'}/>
            <GlanceCard label="Net result" value={fmt(netResult,cc)} accent={C.navy} valueColor={netResult>=0?C.navy:C.red}
              desc="after all costs"/>
          </div>
        </>
      )}

      {/* Month-End Close -- docs/ACCOUNTING_ARCHITECTURE.md section 5.
          Only shown to roles who can actually close a period. */}
      {canSeeAll&&(
        <div style={{...card,borderLeft:`4px solid ${periodClose?.closed?C.navy:blockingExceptions.length>0?C.red:C.green}`,marginBottom:'1.25rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.5rem'}}>
            <div style={{fontWeight:700,color:C.navy,fontSize:'0.92rem'}}>Month-End Close — {periodMonths.find(m=>m.value===selPeriod)?.label}</div>
            {!periodCloseVerified ? (
              <span style={{fontSize:'0.86rem',color:C.slate}}>Checking close status...</span>
            ) : periodClose?.closed ? (
              <button style={addBtn(true,C.slate)} onClick={reopenPeriod} disabled={closing}>{closing?'...':'Reopen Period'}</button>
            ) : (
              <button style={addBtn(true,canClose?C.green:C.border)} onClick={closePeriod} disabled={!canClose||closing}>
                {closing?'Closing...':'Close This Month'}
              </button>
            )}
          </div>
          {periodClose?.closed ? (
            <div style={{fontSize:'0.86rem',color:C.slate}}>Closed by {periodClose.closed_by} on {new Date(periodClose.closed_at).toLocaleDateString()}. Figures are final -- reopen only to correct a genuine mistake.</div>
          ) : exceptionReport.length===0 ? (
            <div style={{fontSize:'0.86rem',color:C.green}}>No exceptions found. This month is ready to close.</div>
          ) : (
            <div>
              <div style={{fontSize:'0.86rem',color:C.slate,marginBottom:'0.5rem'}}>
                {blockingExceptions.length>0
                  ? `${blockingExceptions.length} item${blockingExceptions.length===1?'':'s'} must be resolved before this month can close:`
                  : 'For your review -- these do not block closing:'}
              </div>
              {exceptionReport.map((exc,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.5rem 0.75rem',background:exc.severity==='blocking'?'var(--cv-tint-red)':'var(--cv-tint-warn)',borderRadius:4,marginBottom:'0.4rem',gap:'0.5rem'}}>
                  <div style={{fontSize:'0.86rem',color:exc.severity==='blocking'?C.red:C.amber}}>{exc.message}</div>
                  {exc.type==='stale_cost_price'&&(()=>{
                    const item = staleCatalogue.find((c:any)=>c.id===exc.ref_id)
                    return item ? <button style={addBtn(true)} onClick={()=>confirmCostPriceStillAccurate(item.id, item.cost_price)}>Confirm Still Accurate</button> : null
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* All units summary */}
      {canSeeAll&&allActuals.length>0&&(
        <div style={card}>
          <div style={{fontWeight:700,color:C.navy,marginBottom:'0.75rem',fontSize:'0.92rem'}}>All Units — {periodMonths.find(m=>m.value===selPeriod)?.label}</div>
          <div style={{overflowX:'auto'}}>
            <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.86rem',fontFamily:'monospace'}}>
              <thead><tr style={{background:'var(--cv-header)',color:'var(--cv-on-accent)'}}>
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
            <div style={{fontFamily:'monospace',fontSize:'0.86rem',color:C.slate}}>Revenue: <strong style={{color:C.green}}>{fmt(totalRev,cc)}</strong> · Total Costs: <strong style={{color:C.red}}>{fmt(totalCost,cc)}</strong> · Gross Profit: <strong style={{color:grossProfit>=0?C.green:C.red}}>{fmt(grossProfit,cc)}</strong> · Net Result: <strong style={{color:netResult>=0?C.green:C.red}}>{fmt(netResult,cc)}</strong></div>
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
                    <div style={{fontFamily:'monospace',fontSize:'0.8rem',letterSpacing:'0.1em',color:cat==='revenue'?C.green:C.red,textTransform:'uppercase',fontWeight:700}}>{label}</div>
                    <div style={{fontFamily:'monospace',fontSize:'0.86rem',fontWeight:700,color:cat==='revenue'?C.green:C.red}}>{fmt(sTotal,cc)}</div>
                  </div>
                  {sLines.map(l=>{
                    const fieldAmt = Number(fieldLineValues[l.id]||0)
                    const items = catalogueItemsForLine(l.id)
                    const catalogueMode = isCatalogueMode(l.id)
                    const disabled = !periodCloseVerified||periodClose?.closed||(submitted&&!canSeeAll)
                    return (
                    <div key={l.id} style={{padding:'0.45rem 0.75rem',background:C.cream,borderRadius:4,marginBottom:'0.5rem'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom: (catalogueMode && items.length>0) ? '0.5rem' : 0}}>
                        <label htmlFor={`actual-${l.id}`} style={{fontWeight:600,fontSize:'0.92rem',color:C.navy,lineHeight:1.3}}>{l.name}</label>
                        {items.length>0 && (
                          <button type="button" disabled={disabled}
                            onClick={()=>setEntryMode(m=>({...m,[l.id]: catalogueMode ? 'manual' : 'catalogue'}))}
                            style={{background:'none',border:'none',color:C.teal,fontSize:'0.8rem',cursor:disabled?'default':'pointer',textDecoration:'underline',padding:0}}>
                            {catalogueMode ? 'Enter as round figure instead' : 'Use catalogue pricing instead'}
                          </button>
                        )}
                      </div>
                      {catalogueMode ? (
                        <div>
                          {items.map(item=>(
                            <div key={item.id} style={{display:'grid',gridTemplateColumns:'1fr 90px 110px',alignItems:'center',gap:'0.5rem',marginBottom:'0.35rem'}}>
                              <span style={{fontSize:'0.86rem',color:C.navy}}>{item.name}{item.unit_label?` (${item.unit_label})`:''}</span>
                              <input type="number" aria-label={`Quantity for ${item.name}`}
                                style={{width:'100%',padding:'0.35rem 0.5rem',border:`1px solid ${C.border}`,borderRadius:4,fontSize:'0.86rem',fontFamily:'monospace',textAlign:'right',background:disabled?'var(--cv-disabled)':C.white,boxSizing:'border-box'}}
                                value={catalogueQuantities[l.id]?.[item.id]??''} placeholder="0" disabled={disabled}
                                onChange={e=>updateQuantity(l.id,item.id,Number(e.target.value))}/>
                              <span style={{fontSize:'0.8rem',color:C.slate,fontFamily:'monospace',textAlign:'right'}}>
                                @ {fmt(Number(item.price||0),cc)} = {fmt((Number(catalogueQuantities[l.id]?.[item.id])||0)*Number(item.price||0),cc)}
                              </span>
                            </div>
                          ))}
                          <div style={{textAlign:'right',fontSize:'0.86rem',fontWeight:700,color:C.navy,marginTop:'0.35rem',borderTop:`1px solid ${C.border}`,paddingTop:'0.35rem'}}>
                            Total: {fmt(lineValues[l.id]||0,cc)}
                          </div>
                        </div>
                      ) : (
                        <div style={{display:'grid',gridTemplateColumns:'1fr 180px',alignItems:'center',gap:'0.75rem'}}>
                          <span/>
                          <input id={`actual-${l.id}`} type="number"
                            style={{width:'100%',padding:'0.42rem 0.6rem',border:`1px solid ${C.border}`,borderRadius:4,fontSize:'0.92rem',fontFamily:'monospace',background:disabled?'var(--cv-disabled)':C.white,color:C.navy,textAlign:'right',boxSizing:'border-box'}}
                            value={lineValues[l.id]??''} placeholder="0"
                            disabled={disabled}
                            onChange={e=>setLineValues(v=>({...v,[l.id]:Number(e.target.value)}))}/>
                        </div>
                      )}
                      {/* Field-app figure is read-only here -- it's written exclusively
                          by aggregate_field_transactions(), never editable by hand.
                          The input above is manual entry only (e.g. a paper-only store);
                          the two are added together for every total on this page. */}
                      {fieldAmt!==0 && (
                        <div style={{fontSize:'0.8rem',color:C.teal,marginTop:'0.3rem',fontFamily:'monospace'}}>
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
              <button style={solidBtn('var(--cv-header)')} disabled={saving} onClick={()=>save(false)}>{saving?'Saving...':'Save Draft'}</button>
              {!submitted&&P.canEnterActuals&&(
                <button style={solidBtn(C.green)} disabled={saving} onClick={()=>save(true)}>Submit for Approval</button>
              )}
            </div>
          </>
        )}
      </div>
        </>
      }
    </div>
  )
}

// ── ACTUALS · MANY MONTHS · GRID VIEW ─────────────────────────
// The multi-month catch-up grid from the approved setup mockup. ONE unit,
// MANY month columns. Rows are the unit's active plan_lines grouped by
// category (same sections/labels as the guided form). Each editable cell
// edits only the MANUAL line_values for its (unit, period, line). Field-app
// figures (field_line_values) are shown but never editable here -- per
// docs/ACCOUNTING_ARCHITECTURE.md section 4 they are field-owned. Closed
// periods (generic_period_close) render read-only and fail closed while the
// close status is still being verified. Reuses the same combinedActual /
// computeActualsTotals as the guided form so totals reconcile exactly.
function parseGridNum(s?:string):number|null {
  if (s===undefined || s===null) return null
  const t = String(s).replace(/[,\s]/g,'').replace(/[^0-9.\-]/g,'')
  if (t==='') return null
  const n = Number(t)
  return isNaN(n) ? null : n
}

function ActualsGridView({config,selUnit,cc,P,canSeeAll}) {
  const [monthsCount, setMonthsCount] = useState(6)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [manual, setManual] = useState<Record<string,string>>({})          // `${period}|${lineId}` -> raw string
  const [loadedManual, setLoadedManual] = useState<Record<string,Record<string,number>>>({})
  const [field, setField] = useState<Record<string,Record<string,number>>>({})
  const [submittedByPeriod, setSubmittedByPeriod] = useState<Record<string,boolean>>({})
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [closedSet, setClosedSet] = useState<Set<string>>(new Set())
  const [closeVerified, setCloseVerified] = useState(false)

  // Rolling last-N months ending on the current month -- same construction
  // as ActualsTab's periodMonths, just a configurable window.
  const periods = useMemo(()=>Array.from({length:monthsCount},(_,i)=>{
    const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-(monthsCount-1)+i)
    return {
      value:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`,
      label:`${d.toLocaleString('en-GB',{month:'short'})} ${String(d.getFullYear()).slice(2)}`,
    }
  }),[monthsCount])

  const lines = config.plan_lines.filter((l:any)=>l.unit_id===selUnit&&l.active&&!l.name.startsWith('Add '))
  const sections:[string,string][] = [['revenue','Revenue'],['cost_of_sales','Cost of Sales'],['staff','Staff'],['direct_opex','Overheads']]
  const sectioned = sections
    .map(([cat,label])=>[label, lines.filter((l:any)=>l.category===cat)] as [string, any[]])
    .filter(([,ls])=>ls.length>0)
  const flatLines = sectioned.flatMap(([,ls])=>ls)

  // Load the unit's actuals for every visible period in one query.
  useEffect(()=>{
    if (!selUnit) return
    let active = true
    setLoading(true)
    const pv = periods.map(p=>p.value)
    supabase.from('generic_actuals').select('*')
      .eq('client_id',config.client_id).eq('unit_id',selUnit).in('period',pv)
      .then(({data})=>{
        if (!active) return
        const lm:Record<string,Record<string,number>>={}, fm:Record<string,Record<string,number>>={}, sm:Record<string,boolean>={}, man:Record<string,string>={}
        ;(data||[]).forEach((row:any)=>{
          lm[row.period]=row.line_values||{}
          fm[row.period]=row.field_line_values||{}
          sm[row.period]=!!row.submitted
          Object.entries(row.line_values||{}).forEach(([lid,v])=>{ man[`${row.period}|${lid}`]=String(v) })
        })
        setLoadedManual(lm); setField(fm); setSubmittedByPeriod(sm); setManual(man); setDirty(new Set()); setLoading(false)
      })
    return ()=>{ active=false }
  },[selUnit,monthsCount,config.client_id])

  // Period-close for the visible window. Fail closed: while this is in
  // flight (or on error) every cell stays read-only, mirroring ActualsTab.
  useEffect(()=>{
    let active = true
    setClosedSet(new Set()); setCloseVerified(false)
    const pv = periods.map(p=>p.value)
    supabase.from('generic_period_close').select('*')
      .eq('client_id',config.client_id).in('period',pv)
      .then(({data,error})=>{
        if (!active) return
        if (error) { alert('Could not verify which months are closed. Editing is disabled until it can be verified.'); return }
        const s=new Set<string>(); (data||[]).forEach((r:any)=>{ if (r.closed) s.add(r.period) })
        setClosedSet(s); setCloseVerified(true)
      })
    return ()=>{ active=false }
  },[monthsCount,config.client_id])

  // A period is locked if it is closed, if the current user has already
  // submitted it and cannot see all units, or while close status is
  // unverified (fail closed).
  const isLocked = (period:string) => !closeVerified || closedSet.has(period) || (!!submittedByPeriod[period] && !canSeeAll)
  const manualNum = (period:string, lineId:string) => { const n=parseGridNum(manual[`${period}|${lineId}`]); return n===null?0:n }
  const fieldNum  = (period:string, lineId:string) => Number(field[period]?.[lineId]||0)
  const cellCombined = (period:string, lineId:string) => manualNum(period,lineId)+fieldNum(period,lineId)

  const manualObjFor = (period:string) => { const o:Record<string,number>={}; lines.forEach((l:any)=>{ o[l.id]=manualNum(period,l.id) }); return o }
  const netFor = (period:string) => computeActualsTotals(lines, manualObjFor(period), field[period]||{}).netResult
  const lineTotal = (lineId:string) => periods.reduce((s,p)=>s+cellCombined(p.value,lineId),0)
  const grandNet  = periods.reduce((s,p)=>s+netFor(p.value),0)

  function setCell(period:string, lineId:string, val:string) {
    if (isLocked(period)) return
    setManual(m=>({...m,[`${period}|${lineId}`]:val}))
    setDirty(d=>{ const n=new Set(d); n.add(period); return n })
  }

  // Paste a block copied from a spreadsheet, starting at the focused cell.
  // Rows split on newlines, columns on tabs. Locked (closed / submitted)
  // cells and field values are never touched -- only manual line_values.
  function handlePaste(e:any, startFlatIdx:number, startPeriodIdx:number) {
    const text = e.clipboardData?.getData('text') || ''
    if (!text.includes('\t') && !text.includes('\n')) return // single value -> let the input handle it normally
    e.preventDefault()
    const rows = text.replace(/\r/g,'').split('\n')
    while (rows.length && rows[rows.length-1]==='') rows.pop()
    const upd:Record<string,string>={}; const dp=new Set(dirty)
    rows.forEach((row:string,r:number)=>{
      row.split('\t').forEach((cell:string,c:number)=>{
        const li=startFlatIdx+r, pi=startPeriodIdx+c
        if (li>=flatLines.length || pi>=periods.length) return
        const period=periods[pi].value
        if (isLocked(period)) return   // never write into a locked cell
        const n=parseGridNum(cell)
        if (n===null) return
        upd[`${period}|${flatLines[li].id}`]=String(n); dp.add(period)
      })
    })
    if (Object.keys(upd).length) { setManual(m=>({...m,...upd})); setDirty(dp) }
  }

  async function save() {
    if (!closeVerified) { alert('Close status is still loading. Please try again in a moment.'); return }
    const toWrite=[...dirty].filter(p=>!closedSet.has(p))
    if (toWrite.length===0) { alert('No changes to save.'); return }
    setSaving(true)
    const now=new Date().toISOString()
    const rows=toWrite.map(period=>{
      // Start from the period's originally-loaded manual values (so keys for
      // lines not shown in this grid survive), then overlay the displayed
      // lines. field_line_values and catalogue_quantities are deliberately
      // omitted: an ON CONFLICT UPDATE only sets provided columns, so field
      // data is never clobbered here. Same upsert shape as ActualsTab.save.
      const base:Record<string,number>={...(loadedManual[period]||{})}
      lines.forEach((l:any)=>{
        const n=parseGridNum(manual[`${period}|${l.id}`])
        if (n===null) delete base[l.id]; else base[l.id]=n
      })
      return {
        client_id:config.client_id, unit_id:selUnit, period,
        line_values:base, submitted:!!submittedByPeriod[period],
        entered_by:P.fullName, entered_at:now, updated_at:now,
      }
    })
    const {error}=await supabase.from('generic_actuals').upsert(rows,{onConflict:'client_id,unit_id,period'})
    if (!error) {
      const nl={...loadedManual}; rows.forEach(r=>{ nl[r.period]=r.line_values }); setLoadedManual(nl); setDirty(new Set())
    } else alert('Could not save. Please try again.')
    setSaving(false)
  }

  const unitName = config.business_units.find((u:any)=>u.id===selUnit)?.name || ''
  const thBase:React.CSSProperties = {background:'var(--cv-header)',color:'var(--cv-on-accent)',padding:'7px 9px',fontWeight:400,fontSize:'0.72rem',textAlign:'right',whiteSpace:'nowrap',fontFamily:'monospace'}
  const grpTd:React.CSSProperties = {background:C.lightBg,color:C.navy,fontFamily:'monospace',fontSize:'0.72rem',letterSpacing:'0.06em',textTransform:'uppercase',fontWeight:700,padding:'5px 9px'}

  return (
    <div style={{...card,padding:0,overflow:'hidden'}}>
      <div style={{padding:'0.85rem 1.1rem',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center',gap:'0.6rem',flexWrap:'wrap'}}>
        <div style={{fontFamily:'Georgia,serif',fontWeight:700,fontSize:'0.98rem',color:C.navy}}>{unitName} · enter what you have</div>
        <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
          <select style={{fontFamily:'monospace',fontSize:'0.8rem',padding:'0.35rem 0.55rem',border:`1px solid ${C.border}`,borderRadius:6,background:C.white,color:C.navy}}
            value={monthsCount} onChange={e=>setMonthsCount(Number(e.target.value))}>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
            <option value={24}>Last 24 months</option>
          </select>
          <button style={solidBtn('var(--cv-header)',true)} disabled={saving||dirty.size===0} onClick={save}>{saving?'Saving...':'Save'}</button>
        </div>
      </div>
      {/* Legend */}
      <div style={{display:'flex',gap:'1.1rem',flexWrap:'wrap',fontFamily:'monospace',fontSize:'0.72rem',color:C.slate,padding:'0.6rem 1.1rem',background:C.lightBg,borderBottom:`1px solid ${C.border}`}}>
        <span style={{display:'inline-flex',alignItems:'center',gap:'0.35rem'}}><span style={{width:11,height:11,borderRadius:3,background:'var(--cv-tint-teal)',border:'1px solid var(--cv-border-soft)'}}/>closed · locked</span>
        <span style={{display:'inline-flex',alignItems:'center',gap:'0.35rem'}}><span style={{width:11,height:11,borderRadius:3,background:'var(--cv-tint-cyan)'}}/>from Clearview Field</span>
        <span style={{display:'inline-flex',alignItems:'center',gap:'0.35rem'}}><span style={{width:11,height:11,borderRadius:3,background:C.white,border:`1px solid ${C.border}`}}/>type here</span>
        <span style={{marginLeft:'auto'}}>Blanks are fine. Fill what you have.</span>
      </div>
      {loading ? <Spinner/> : (
        <div style={{overflowX:'auto'}}>
          <table style={{borderCollapse:'collapse',fontFamily:'monospace',fontSize:'0.86rem',width:'100%',minWidth:720}}>
            <thead><tr>
              <th style={{...thBase,textAlign:'left',minWidth:170}}>Line</th>
              {periods.map(p=>{
                const closed=closedSet.has(p.value)
                return <th key={p.value} style={{...thBase,color:closed?'var(--cv-wa-60)':'var(--cv-on-accent)'}}>{p.label}</th>
              })}
              <th style={{...thBase,borderLeft:'2px solid var(--cv-wa-20)'}}>Total</th>
            </tr></thead>
            <tbody>
              {sectioned.map(([label,ls])=>{
                let flatBase = 0
                for (const [,prev] of sectioned) { if (prev===ls) break; flatBase += prev.length }
                return (
                  <React.Fragment key={label}>
                    <tr>
                      <td style={grpTd}>{label}</td>
                      {periods.map(p=><td key={p.value} style={{...grpTd,background:C.lightBg}}/>)}
                      <td style={{...grpTd,background:C.lightBg}}/>
                    </tr>
                    {ls.map((l:any,li:number)=>{
                      const flatIdx = flatBase + li
                      return (
                        <tr key={l.id}>
                          <td style={{textAlign:'left',padding:'3px 5px 3px 1.6rem',color:'var(--cv-slate)',fontFamily:'inherit'}}>{l.name}</td>
                          {periods.map((p,pi)=>{
                            const locked=isLocked(p.value)
                            const fAmt=fieldNum(p.value,l.id)
                            const hasField=fAmt!==0
                            return (
                              <td key={p.value} style={{padding:'3px 5px',borderBottom:'1px solid var(--cv-border-soft)'}}>
                                <input inputMode="decimal" disabled={locked}
                                  value={manual[`${p.value}|${l.id}`]??''} placeholder={hasField?'0':''}
                                  onChange={e=>setCell(p.value,l.id,e.target.value)}
                                  onPaste={e=>handlePaste(e,flatIdx,pi)}
                                  title={hasField?`+ ${fmt(fAmt,cc)} from Clearview Field · Total ${fmt(cellCombined(p.value,l.id),cc)}`:undefined}
                                  style={{width:'100%',minWidth:66,textAlign:'right',padding:'0.3rem 0.35rem',border:'1px solid transparent',borderRadius:4,fontFamily:'monospace',fontSize:'0.8rem',boxSizing:'border-box',
                                    background:locked?'var(--cv-tint-teal)':hasField?'var(--cv-tint-cyan)':C.white,
                                    color:locked?C.green:C.navy}}/>
                                {hasField&&<div style={{fontSize:'0.72rem',color:C.teal,textAlign:'right',marginTop:'1px',fontFamily:'monospace'}}>+{fmt(fAmt,cc)}</div>}
                              </td>
                            )
                          })}
                          <td style={{fontWeight:700,color:C.navy,background:'var(--cv-alt)',borderLeft:`2px solid ${C.border}`,padding:'3px 6px',textAlign:'right'}}>{fmt(lineTotal(l.id),cc)}</td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
              <tr>
                <td style={{fontWeight:700,color:C.navy,background:'var(--cv-alt)',borderTop:`2px solid ${C.border}`,padding:'5px 5px',textAlign:'left'}}>Net result</td>
                {periods.map(p=>{
                  const n=netFor(p.value)
                  return <td key={p.value} style={{fontWeight:700,background:'var(--cv-alt)',borderTop:`2px solid ${C.border}`,padding:'5px 5px',textAlign:'right',color:n>=0?C.navy:C.red}}>{fmt(n,cc)}</td>
                })}
                <td style={{fontWeight:700,background:'var(--cv-alt)',borderTop:`2px solid ${C.border}`,borderLeft:`2px solid ${C.border}`,padding:'5px 6px',textAlign:'right',color:grandNet>=0?C.navy:C.red}}>{fmt(grandNet,cc)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div style={{fontSize:'0.8rem',color:C.teal,fontFamily:'monospace',padding:'0.6rem 1.1rem',borderTop:`1px solid ${C.border}`}}>
        Tip: copy a block from Excel and paste straight into the grid. Field-app figures are shown in blue and can't be edited by hand; closed months are locked in green.
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
              {SPEND_CATEGORY_OPTIONS.map((o,i)=><option key={i} value={o.value}>{o.label}</option>)}
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
      {!showForm&&(
        <div style={{...card,padding:'0.9rem 1.15rem',fontSize:'0.92rem',lineHeight:1.55,color:C.navy}}>
          <b>Categories a request can use:</b> <span style={{color:C.slate}}>Cost of sales · Staff &amp; casual labour · Travel &amp; accommodation · Marketing &amp; promotion · Equipment · Rent &amp; utilities · Other.</span> A <b style={{color:C.teal}}>promotion</b> is raised as one <b>Marketing Event</b> that bundles its costs (venue, temporary promo staff, travel, hotel) and carries the expected revenue lift, so once it runs you can see whether it paid off.
        </div>
      )}
      {requests.length===0&&!showForm&&<div style={{...card,textAlign:'center',color:C.slate,padding:'2rem'}}>No requests yet.</div>}
      {requests.map(r=>(
        <div key={r.id} style={{...card,borderLeft:`4px solid ${statusColor(r.status)}`}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'0.75rem'}}>
            <div style={{flex:1,minWidth:220}}>
              <div style={{display:'flex',alignItems:'center',gap:'0.6rem',flexWrap:'wrap'}}>
                <span style={{fontWeight:700,fontSize:'1rem',color:C.navy}}>{r.description}</span>
                <CategoryTag category={r.category}/>
              </div>
              <div style={{fontSize:'0.86rem',color:C.slate,marginTop:'0.15rem'}}>
                {config.business_units.find(u=>u.id===r.unit_id)?.name||'General'} · {r.requested_by_name} · {new Date(r.created_at).toLocaleDateString('en-GB')}
              </div>
            </div>
            <div style={{display:'flex',gap:'1rem',alignItems:'center',flexWrap:'wrap'}}>
              <StageTracker r={r}/>
              <span style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:C.navy,whiteSpace:'nowrap'}}>{fmt(r.amount,cc)}</span>
              <Badge text={r.status.replace('_',' ')} color={statusColor(r.status)}/>
            </div>
          </div>
          {r.fm_note&&<div style={{marginTop:'0.5rem',fontSize:'0.86rem',color:C.slate,fontStyle:'italic'}}>FM: {r.fm_note}</div>}
          {r.ceo_note&&<div style={{marginTop:'0.25rem',fontSize:'0.86rem',color:C.slate,fontStyle:'italic'}}>CEO: {r.ceo_note}</div>}
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

  // KPIs computed only from the already-fetched pending queue -- no extra
  // query, no fabricated figures. "Awaiting you" counts what this user can
  // action given their role; "Value pending" sums those same requests.
  const awaitingList = [...(isFM?pendingFM:[]), ...((isCEO||delegatedApprover)?pendingCEO:[])]
  const awaitingCount = awaitingList.length
  const valuePending = awaitingList.reduce((s,r)=>s+(r.amount||0),0)

  const reqRow = (r:any) => (
    <div style={{display:'flex',alignItems:'flex-start',gap:'1rem',flexWrap:'wrap',justifyContent:'space-between'}}>
      <div style={{flex:1,minWidth:220}}>
        <div style={{display:'flex',alignItems:'center',gap:'0.6rem',flexWrap:'wrap'}}>
          <span style={{fontWeight:700,fontSize:'1rem',color:C.navy}}>{r.description}</span>
          <CategoryTag category={r.category}/>
        </div>
        <div style={{fontSize:'0.86rem',color:C.slate,marginTop:'0.15rem'}}>{config.business_units.find(u=>u.id===r.unit_id)?.name||'General'} · {r.requested_by_name} · {new Date(r.created_at).toLocaleDateString('en-GB')}</div>
        {r.fm_note&&<div style={{fontSize:'0.86rem',color:C.slate,fontStyle:'italic',marginTop:'0.25rem'}}>FM note: {r.fm_note}</div>}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:'1rem',flexWrap:'wrap'}}>
        <StageTracker r={r}/>
        <span style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:C.navy,whiteSpace:'nowrap'}}>{fmt(r.amount,cc)}</span>
      </div>
    </div>
  )

  if (loading) return <Spinner/>
  return (
    <div>
      <div style={secH}>Approvals</div>
      {awaitingCount>0&&(
        <div style={kpiGrid}>
          <KPI label="Awaiting you" value={String(awaitingCount)} color={C.amber}/>
          <KPI label="Value pending" value={fmt(valuePending,cc)} color={C.navy}/>
        </div>
      )}
      {isFM&&pendingFM.length>0&&(
        <div style={{...card,borderLeft:`4px solid ${C.amber}`}}>
          <div style={{fontFamily:'monospace',fontSize:'0.8rem',letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:700,color:C.amber,marginBottom:'0.9rem'}}>Pending FM Review ({pendingFM.length})</div>
          {pendingFM.map(r=>(
            <div key={r.id} style={{border:'1px solid var(--cv-border-soft)',borderRadius:12,padding:'1rem 1.1rem',marginBottom:'0.85rem',background:C.lightBg}}>
              {reqRow(r)}
              <textarea style={{...inp,minHeight:50,resize:'vertical',margin:'0.75rem 0 0.5rem'}} placeholder="Add note (optional)" value={notes[r.id]||''} onChange={e=>setNotes(n=>({...n,[r.id]:e.target.value}))}/>
              <div style={{display:'flex',gap:'0.5rem'}}>
                <button style={solidBtn(C.cyan,true)} onClick={()=>fmAction(r.id,true)}>Forward to CEO</button>
                <button style={solidBtn(C.red,true)} onClick={()=>fmAction(r.id,false)}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {(isCEO||delegatedApprover)&&pendingCEO.length>0&&(
        <div style={{...card,borderLeft:`4px solid ${C.cyan}`}}>
          <div style={{fontFamily:'monospace',fontSize:'0.8rem',letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:700,color:C.cyan,marginBottom:'0.9rem'}}>Awaiting CEO Approval ({pendingCEO.length})</div>
          {pendingCEO.map(r=>(
            <div key={r.id} style={{border:'1px solid var(--cv-border-soft)',borderRadius:12,padding:'1rem 1.1rem',marginBottom:'0.85rem',background:C.lightBg}}>
              {reqRow(r)}
              <textarea style={{...inp,minHeight:50,resize:'vertical',margin:'0.75rem 0 0.5rem'}} placeholder="Add note (optional)" value={notes[r.id]||''} onChange={e=>setNotes(n=>({...n,[r.id]:e.target.value}))}/>
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
      .eq('engagement_client_id',clientId)
      .then(({data})=>{ setMembers(data||[]); setLoading(false) })
  },[clientId])

  async function invite() {
    if (!inviteForm.email||!inviteForm.full_name) return
    setSaving(true)
    // Insert pending profile -- actual auth invite handled separately.
    // Uses engagement_client_id, not client_id: client_id has a foreign
    // key to the legacy `clients` table (UUID ids), but clientId here is
    // the text engagement_clients id -- inserting it into client_id would
    // fail the FK constraint outright for every client. See
    // supabase/migrations/2026_07_04_user_profiles_engagement_client_bridge.sql.
    const {data,error} = await supabase.from('user_profiles').insert([{
      engagement_client_id:clientId, email:inviteForm.email, full_name:inviteForm.full_name,
      role:inviteForm.role, assigned_unit_ids:inviteForm.unit_ids,
      status:'invited', invited_at:new Date().toISOString(), invited_by:P.userId,
    }]).select().single()
    if (!error&&data) { setMembers(m=>[...m,data]); setShowInvite(false) }
    else if (error) alert('Could not invite this person. Please try again.')
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
                  <label key={u.id} style={{display:'flex',alignItems:'center',gap:'0.4rem',fontSize:'0.92rem',cursor:'pointer',padding:'0.3rem 0.6rem',border:`1px solid ${inviteForm.unit_ids.includes(u.id)?C.cyan:C.border}`,borderRadius:4,background:inviteForm.unit_ids.includes(u.id)?'var(--cv-tint-cyan)':C.white}}>
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
        <div key={m.id} style={{...card,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.75rem'}}>
          <div style={{display:'flex',gap:'0.85rem',alignItems:'flex-start'}}>
            <div style={{width:38,height:38,borderRadius:10,background:'var(--cv-header)',color:'var(--cv-on-accent)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace',fontSize:'0.8rem',fontWeight:700,flexShrink:0}}>{(m.full_name||'?').split(' ').map((w:string)=>w[0]).join('').toUpperCase().slice(0,2)}</div>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:'0.6rem',flexWrap:'wrap'}}>
              <span style={{fontWeight:700,fontSize:'1rem',color:C.navy}}>{m.full_name}</span>
              <span style={{fontFamily:'monospace',fontSize:'0.72rem',fontWeight:700,border:`1px solid ${C.border}`,borderRadius:20,padding:'0.14rem 0.55rem',color:C.slate,whiteSpace:'nowrap'}}>{roles.find(r=>r[0]===m.role)?.[1]||m.role}</span>
            </div>
            <div style={{fontSize:'0.86rem',color:C.slate,marginTop:'0.15rem'}}>{m.email}</div>
            {m.assigned_unit_ids?.length>0&&(
              <div style={{fontSize:'0.86rem',color:C.slate,marginTop:'0.2rem'}}>
                Units: {m.assigned_unit_ids.map((id:string)=>config.business_units.find(u=>u.id===id)?.name||id).join(', ')}
              </div>
            )}
            {(P.role==='ceo'||P.role==='finance_manager'||P.canManageTeam)&&m.role!=='ceo'&&m.role!=='finance_manager'&&(
              <label style={{display:'flex',alignItems:'center',gap:'0.4rem',fontSize:'0.86rem',color:C.slate,marginTop:'0.35rem',cursor:'pointer'}}>
                <input type="checkbox" checked={!!m.can_manage_catalogue}
                  onChange={async e=>{
                    await supabase.from('user_profiles').update({can_manage_catalogue:e.target.checked}).eq('id',m.id)
                    setMembers(ms=>ms.map(x=>x.id!==m.id?x:{...x,can_manage_catalogue:e.target.checked}))
                  }}/>
                Can manage Field Catalogue (prices & products)
              </label>
            )}
          </div>
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
      <p style={{fontSize:'0.92rem',color:C.slate,lineHeight:1.6,marginBottom:'1.1rem'}}>
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
                <div style={{fontSize:'0.86rem',color:C.slate}}>{unit?.name||op.business_unit_id}{op.phone?` · ${op.phone}`:''} · {op.sync_frequency==='real_time'?'Real time':'End of day'}</div>
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
              <div style={{marginTop:'0.6rem',fontSize:'0.8rem',color:C.slate,fontFamily:'monospace',wordBreak:'break-all'}}>
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
  const [editingFullId, setEditingFullId] = useState<string|null>(null)
  const [editFull, setEditFull] = useState({name:'',item_type:'product',unit_label:'',business_unit_id:'',plan_line_id:''})
  const [savingFull, setSavingFull] = useState(false)
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

  function startFullEdit(item:any) {
    setEditingFullId(item.id)
    setEditFull({name:item.name, item_type:item.item_type, unit_label:item.unit_label||'', business_unit_id:item.business_unit_id, plan_line_id:item.plan_line_id})
  }

  async function saveFullEdit(id:string) {
    if (!editFull.name.trim()) { alert('Item name is required.'); return }
    if (!editFull.business_unit_id || !editFull.plan_line_id) { alert('Business unit and category are required.'); return }
    setSavingFull(true)
    try {
      const res = await fetch('/api/field/admin/catalogue', {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          id, name: editFull.name.trim(), item_type: editFull.item_type,
          unit_label: editFull.unit_label || null,
          business_unit_id: editFull.business_unit_id, plan_line_id: editFull.plan_line_id,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(()=>({}))
        alert(data.error || 'Could not save these changes. Please try again.')
        return
      }
      setEditingFullId(null)
      await load()
    } catch { alert('Could not save these changes. Please try again.') }
    finally { setSavingFull(false) }
  }

  async function saveCostPrice(id:string) {
    if (editCostPrice!=='' && Number(editCostPrice)<0) { alert('Cost price cannot be negative.'); return }
    if (editCostPrice!=='' && !editCostLine) { alert('Select a COGS category to go with the cost price.'); return }
    try {
      const res = await fetch('/api/field/admin/catalogue', {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          id,
          cost_price: editCostPrice===''?null:Number(editCostPrice),
          cogs_plan_line_id: editCostPrice===''?null:editCostLine,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(()=>({}))
        alert(data.error || 'Could not save the cost price. Please try again.')
        return
      }
      setEditingCostId(null)
      await load()
    } catch { alert('Could not save the cost price. Please try again.') }
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
      <p style={{fontSize:'0.92rem',color:C.slate,lineHeight:1.6,marginBottom:'1.1rem'}}>
        This is your price list. Field operators pick an item from here and record how much was sold -- the price shown here is what's used automatically. They never enter a price themselves. The CEO or Finance Manager can grant other staff permission to edit this list from the Team tab.
      </p>

      {!canEdit && <div style={{...card,background:'var(--cv-tint-amber)',border:`1px solid ${C.amber}`,fontSize:'0.92rem',color:C.navy,marginBottom:'1rem'}}>You can view the catalogue but don't have permission to edit it. Ask your CEO or Finance Manager to grant you "Manage Field Catalogue" access in Team if you need to make changes.</div>}

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
              <div style={{fontSize:'0.8rem',color:C.slate,marginTop:'0.25rem'}}>Different brands or sizes of the same thing (e.g. two fertiliser brands) should share one category -- that's what rolls up into a single revenue figure.</div>
            </div>
            <div><label style={lbl}>Price</label><input type="number" style={inp} value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="0"/></div>
            <div><label style={lbl}>Unit Label (optional)</label><input style={inp} value={form.unit_label} onChange={e=>setForm(f=>({...f,unit_label:e.target.value}))} placeholder="e.g. bag, kg, session"/></div>
            <div><label htmlFor="new-item-cost-price" style={lbl}>Cost Price (optional)</label><input id="new-item-cost-price" type="number" style={inp} value={form.cost_price} onChange={e=>setForm(f=>({...f,cost_price:e.target.value}))} placeholder="Leave blank if unknown"/>
              <div style={{fontSize:'0.8rem',color:C.slate,marginTop:'0.25rem'}}>What this actually costs to procure. Never shown to field operators -- when set, every sale automatically books a matching cost-of-sales entry.</div>
            </div>
            {form.cost_price!=='' && (
              <div><label htmlFor="new-item-cogs-line" style={lbl}>COGS Category</label>
                <select id="new-item-cogs-line" style={inp} disabled={!form.business_unit_id} value={form.cogs_plan_line_id} onChange={e=>setForm(f=>({...f,cogs_plan_line_id:e.target.value}))}>
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
            <div style={{fontFamily:'monospace',fontSize:'0.86rem',letterSpacing:'0.06em',color:C.navy,fontWeight:700,marginBottom:'0.6rem',paddingBottom:'0.35rem',borderBottom:`2px solid ${C.navy}`}}>{unit.name}</div>
            {categoryIds.map((catId:any)=>{
              const line = (config.plan_lines||[]).find((l:any)=>l.id===catId)
              const catItems = unitItems.filter((i:any)=>i.plan_line_id===catId)
              return (
                <div key={catId} style={{marginBottom:'0.85rem',marginLeft:'0.5rem'}}>
                  <div style={{fontSize:'0.86rem',color:C.teal,fontWeight:600,marginBottom:'0.4rem'}}>{line?.name||catId} <span style={{color:C.slate,fontWeight:400}}>({catItems.length} {catItems.length===1?'brand':'brands'})</span></div>
                  {catItems.map((item:any)=>(
                    <div key={item.id} style={{...card,opacity:item.active?1:0.55,marginLeft:'0.75rem'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.6rem'}}>
                        <div>
                          <div style={{fontWeight:700,color:C.navy}}>{item.name}{!item.active&&<span style={{marginLeft:8}}><Badge text="Inactive" color={C.red}/></span>}</div>
                          <div style={{fontSize:'0.86rem',color:C.slate}}>{item.item_type==='service'?'Service':'Product'}</div>
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
                              {canEdit&&<button style={addBtn(true)} onClick={()=>startFullEdit(item)}>Edit Item</button>}
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
                            <input type="number" aria-label="Cost price" style={{...inp,width:110,marginBottom:0}} value={editCostPrice} onChange={e=>setEditCostPrice(e.target.value)} placeholder="Leave blank for none" autoFocus/>
                            <select aria-label="COGS category" style={{...inp,width:200,marginBottom:0}} value={editCostLine} onChange={e=>setEditCostLine(e.target.value)}>
                              <option value="">Select COGS category...</option>
                              {cogsLinesForUnit(item.business_unit_id).map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                            <button style={addBtn(true,C.green)} onClick={()=>saveCostPrice(item.id)}>Save</button>
                            <button style={addBtn(true,C.slate)} onClick={()=>setEditingCostId(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <div style={{fontSize:'0.86rem',color:C.slate}}>
                              Cost price: <span style={{fontFamily:'monospace',fontWeight:700,color:item.cost_price!==null&&item.cost_price!==undefined?C.navy:C.amber}}>{item.cost_price!==null&&item.cost_price!==undefined?fmt(item.cost_price,config.currency):'Not set — no automatic COGS'}</span>
                              {item.cost_price_updated_at&&<span style={{marginLeft:8}}>· reviewed {new Date(item.cost_price_updated_at).toLocaleDateString()}</span>}
                            </div>
                            {canEdit&&<button style={addBtn(true)} onClick={()=>{setEditingCostId(item.id);setEditCostPrice(item.cost_price!==null&&item.cost_price!==undefined?String(item.cost_price):'');setEditCostLine(item.cogs_plan_line_id||'')}}>{item.cost_price!==null&&item.cost_price!==undefined?'Edit Cost Price':'Set Cost Price'}</button>}
                          </>
                        )}
                      </div>
                      {editingFullId===item.id&&(
                        <div style={{marginTop:'0.6rem',paddingTop:'0.6rem',borderTop:`1px solid ${C.border}`}}>
                          <div style={fGrid}>
                            <div><label htmlFor={`edit-name-${item.id}`} style={lbl}>Item Name</label><input id={`edit-name-${item.id}`} style={inp} value={editFull.name} onChange={e=>setEditFull(f=>({...f,name:e.target.value}))}/></div>
                            <div><label htmlFor={`edit-type-${item.id}`} style={lbl}>Type</label>
                              <select id={`edit-type-${item.id}`} style={inp} value={editFull.item_type} onChange={e=>setEditFull(f=>({...f,item_type:e.target.value}))}>
                                <option value="product">Product</option>
                                <option value="service">Service</option>
                              </select>
                            </div>
                            <div><label htmlFor={`edit-unit-${item.id}`} style={lbl}>Business Unit</label>
                              <select id={`edit-unit-${item.id}`} style={inp} value={editFull.business_unit_id} onChange={e=>setEditFull(f=>({...f,business_unit_id:e.target.value,plan_line_id:''}))}>
                                {config.business_units.filter((u:any)=>u.active).map((u:any)=><option key={u.id} value={u.id}>{u.name}</option>)}
                              </select>
                              {editFull.business_unit_id!==item.business_unit_id&&item.cost_price!==null&&item.cost_price!==undefined&&(
                                <div style={{fontSize:'0.8rem',color:C.amber,marginTop:'0.25rem'}}>Changing the business unit will clear this item's cost price and COGS category, since those belong to the unit it's leaving. You'll need to set them again for the new unit.</div>
                              )}
                            </div>
                            <div><label htmlFor={`edit-category-${item.id}`} style={lbl}>Category</label>
                              <select id={`edit-category-${item.id}`} style={inp} value={editFull.plan_line_id} onChange={e=>setEditFull(f=>({...f,plan_line_id:e.target.value}))}>
                                <option value="">Select a category...</option>
                                {revenueLinesForUnit(editFull.business_unit_id).map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}
                              </select>
                            </div>
                            <div><label htmlFor={`edit-unitlabel-${item.id}`} style={lbl}>Unit Label (optional)</label><input id={`edit-unitlabel-${item.id}`} style={inp} value={editFull.unit_label} onChange={e=>setEditFull(f=>({...f,unit_label:e.target.value}))} placeholder="e.g. bag, kg, session"/></div>
                          </div>
                          <div style={{display:'flex',gap:'0.6rem',marginTop:'0.6rem'}}>
                            <button style={solidBtn()} disabled={savingFull} onClick={()=>saveFullEdit(item.id)}>{savingFull?'Saving...':'Save Changes'}</button>
                            <button style={addBtn(true,C.slate)} onClick={()=>setEditingFullId(null)}>Cancel</button>
                          </div>
                        </div>
                      )}
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
// Lets a coach grow an existing client's planning horizon by a chosen
// number of additional months, using extendPlanningHorizon() so every
// month-sized array in the config (plan lines, shared costs, trade
// credit) extends together, atomically. Only shown once a client
// already has real plan data -- for a brand-new, empty client the
// ordinary Planning Horizon dropdown above is enough, since there's
// nothing yet that could fall out of sync.
function ExtendHorizonControl({form,setForm}:{form:GenericModelConfig;setForm:(next:GenericModelConfig)=>void}) {
  const [addMonths, setAddMonths] = useState(12)
  const [confirming, setConfirming] = useState(false)

  function apply() {
    let next: GenericModelConfig
    try {
      next = extendPlanningHorizon(form, addMonths)
    } catch (e: any) {
      alert(e?.message || 'Could not extend the planning horizon -- some of this client\'s data may be inconsistent. Please contact support.')
      return
    }
    setForm(next)
    setConfirming(false)
  }

  return (
    <div style={{marginTop:'1.25rem',paddingTop:'1.25rem',borderTop:`1px solid ${C.border}`}}>
      <div style={{fontWeight:700,color:C.navy,marginBottom:'0.5rem',fontSize:'0.9rem'}}>Extend Planning Horizon</div>
      <p style={{fontSize:'0.86rem',color:C.slate,marginBottom:'0.75rem',lineHeight:1.5}}>
        Add more months to this client's plan without disturbing anything already entered. Currently {form.planning_months} months
        (through {buildMonthLabels(form.start_date, form.planning_months).slice(-1)[0]}). New months start at zero, ready to plan.
      </p>
      {!confirming ? (
        <div style={{display:'flex',gap:'0.6rem',alignItems:'center'}}>
          <select style={{...inp,width:'auto'}} value={addMonths} onChange={e=>setAddMonths(Number(e.target.value))}>
            <option value={12}>+ 12 months (1 year)</option>
            <option value={24}>+ 24 months (2 years)</option>
            <option value={36}>+ 36 months (3 years)</option>
            <option value={60}>+ 60 months (5 years)</option>
          </select>
          <button style={addBtn(true)} onClick={()=>setConfirming(true)}>Extend Horizon</button>
        </div>
      ) : (
        <div style={{background:'var(--cv-tint-amber-2)',border:`1px solid ${C.amber}`,borderRadius:6,padding:'0.85rem'}}>
          <p style={{fontSize:'0.86rem',color:C.navy,marginBottom:'0.6rem'}}>
            This will extend the plan to {form.planning_months + addMonths} months (through {buildMonthLabels(form.start_date, form.planning_months + addMonths).slice(-1)[0]}).
            You'll still need to press Save below for this to take effect.
          </p>
          <div style={{display:'flex',gap:'0.5rem'}}>
            <button style={addBtn(true,C.amber)} onClick={apply}>Confirm — Extend by {addMonths} Months</button>
            <button style={addBtn(true,C.slate)} onClick={()=>setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Field operator management -- lists every operator for this client,
// lets a CEO/coach create new ones (issuing a token immediately),
// activate/deactivate, and issue a fresh token. The backend
// (/api/field/admin/operators) already fully supported all of this;
// this was purely a missing UI -- operators previously could only be
// created via direct database access.
function FieldOperatorsSection({clientId,businessUnits}:{clientId:string;businessUnits:{id:string;name:string;active:boolean}[]}) {
  const [operators, setOperators] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({display_name:'', phone:'', business_unit_id:'', sync_frequency:'realtime'})
  const [newLink, setNewLink] = useState<{operatorName:string; url:string; qrDataUrl:string}|null>(null)
  const [busyId, setBusyId] = useState<string|null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/field/admin/operators?client_id=${encodeURIComponent(clientId)}`)
      const data = await res.json()
      if (res.ok) setOperators(data.operators||[])
      else alert(data.error || 'Could not load field operators.')
    } catch { /* leave operators as-is; the list below shows empty rather than a broken page */ }
    setLoading(false)
  }
  useEffect(()=>{ load() },[clientId])

  async function buildShareLink(operatorName: string, token: string) {
    const url = `${window.location.origin}/field?token=${encodeURIComponent(token)}`
    const qrDataUrl = await QRCode.toDataURL(url, { width: 220, margin: 1 })
    setNewLink({operatorName, url, qrDataUrl})
  }

  async function createOperator() {
    if (!form.display_name || !form.business_unit_id) { alert('Name and business unit are required.'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/field/admin/operators', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({client_id: clientId, ...form}),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Could not create operator.'); setCreating(false); return }
      setForm({display_name:'', phone:'', business_unit_id:'', sync_frequency:'realtime'})
      setShowForm(false)
      await load()
      // Isolated from the outer catch deliberately -- the operator is
      // already created and the list already reloaded by this point, so
      // a QR-generation failure here must not surface as "could not
      // create operator", which would wrongly invite a duplicate retry.
      if (data.token?.token) {
        try { await buildShareLink(form.display_name, data.token.token) }
        catch { alert('Operator created, but the share link/QR code could not be generated. Use "New Link" to retry.') }
      }
    } catch {
      alert('No connection -- could not create operator. Please try again.')
    }
    setCreating(false)
  }

  async function toggleActive(operatorId: string, active: boolean) {
    setBusyId(operatorId)
    try {
      const res = await fetch('/api/field/admin/operators', {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({operator_id: operatorId, active}),
      })
      if (res.ok) await load()
      else { const d = await res.json(); alert(d.error || 'Could not update operator.') }
    } catch {
      alert('No connection -- could not update operator. Please try again.')
    }
    setBusyId(null)
  }

  async function issueNewToken(operatorId: string, operatorName: string) {
    setBusyId(operatorId)
    try {
      const res = await fetch('/api/field/admin/operators', {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({operator_id: operatorId, issue_new_token: true}),
      })
      const data = await res.json()
      if (res.ok && data.token?.token) {
        await load()
        try { await buildShareLink(operatorName, data.token.token) }
        catch { alert('New token issued, but the share link/QR code could not be generated. Use "New Link" again to retry.') }
      }
      else alert(data.error || 'Could not issue a new token.')
    } catch {
      alert('No connection -- could not issue a new token. Please try again.')
    }
    setBusyId(null)
  }

  const unitName = (id: string) => businessUnits.find(u=>u.id===id)?.name || id

  return (
    <div style={card}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div style={secH}>Field Operators</div>
        <button type="button" style={addBtn(true)} onClick={()=>setShowForm(!showForm)}>{showForm?'Cancel':'+ New Operator'}</button>
      </div>
      <p style={{fontSize:'0.92rem',color:C.slate,marginBottom:'1rem',lineHeight:1.6}}>
        Create an operator to give them access to Clearview Field for one business unit. Each operator gets their own
        access link and QR code -- share either one to get them started; no login or password needed.
      </p>

      {showForm && (
        <div style={{background:C.cream,borderRadius:6,padding:'1rem',marginBottom:'1.25rem'}}>
          <div style={fGrid}>
            <div><label htmlFor="new-op-name" style={lbl}>Operator Name</label>
              <input id="new-op-name" style={inp} value={form.display_name} onChange={e=>setForm(f=>({...f,display_name:e.target.value}))} placeholder="e.g. Grace Nakato"/>
            </div>
            <div><label htmlFor="new-op-phone" style={lbl}>Phone (optional)</label>
              <input id="new-op-phone" style={inp} value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="e.g. 0772 123 456"/>
            </div>
            <div><label htmlFor="new-op-unit" style={lbl}>Business Unit</label>
              <select id="new-op-unit" style={inp} value={form.business_unit_id} onChange={e=>setForm(f=>({...f,business_unit_id:e.target.value}))}>
                <option value="">Select a unit...</option>
                {businessUnits.filter(u=>u.active).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div><label htmlFor="new-op-freq" style={lbl}>Sync Frequency</label>
              <select id="new-op-freq" style={inp} value={form.sync_frequency} onChange={e=>setForm(f=>({...f,sync_frequency:e.target.value}))}>
                <option value="realtime">Real-time (as entered)</option>
                <option value="end_of_day">Once at end of day</option>
                <option value="daily">Once daily</option>
              </select>
            </div>
          </div>
          <button type="button" style={{...solidBtn('var(--cv-header)'),marginTop:'0.75rem'}} disabled={creating} onClick={createOperator}>{creating?'Creating...':'Create Operator & Generate Link'}</button>
        </div>
      )}

      {newLink && (
        <div style={{background:'var(--cv-tint-teal)',border:`1px solid ${C.teal}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}}>
          <div style={{fontWeight:700,color:C.navy,marginBottom:'0.75rem'}}>Access link for {newLink.operatorName}</div>
          <div style={{display:'flex',gap:'1.25rem',alignItems:'flex-start',flexWrap:'wrap'}}>
            <img src={newLink.qrDataUrl} alt={`QR code for ${newLink.operatorName}'s field access link`} style={{borderRadius:6,border:`1px solid ${C.border}`}}/>
            <div style={{flex:1,minWidth:240}}>
              <div style={{fontSize:'0.86rem',color:C.slate,marginBottom:'0.4rem'}}>Share this link directly, or have them scan the QR code:</div>
              <div style={{display:'flex',gap:'0.5rem'}}>
                <input readOnly aria-label="Field access link URL" style={{...inp,fontFamily:'monospace',fontSize:'0.86rem'}} value={newLink.url} onFocus={e=>e.target.select()}/>
                <button type="button" style={addBtn(true)} onClick={()=>{navigator.clipboard.writeText(newLink.url)}}>Copy</button>
              </div>
              <button type="button" style={{...addBtn(true,C.slate),marginTop:'0.75rem'}} onClick={()=>setNewLink(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{color:C.slate,fontSize:'0.92rem'}}>Loading...</p>
      ) : operators.length===0 ? (
        <p style={{color:C.slate,fontSize:'0.92rem'}}>No field operators yet. Create one above to get started.</p>
      ) : (
        <div style={{overflowX:'auto'}}>
          <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.92rem'}}>
            <thead>
              <tr style={{background:'var(--cv-header)',color:'var(--cv-on-accent)'}}>
                {['Name','Unit','Phone','Status','Last Synced',''].map(h=>(
                  <th key={h} style={{padding:'8px 10px',textAlign:'left',fontWeight:600,fontSize:'0.86rem'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {operators.map((op:any,i:number)=>(
                <tr key={op.id} style={{background:i%2===0?C.cream:C.white}}>
                  <td style={{padding:'8px 10px',fontWeight:600,color:C.navy}}>{op.display_name}</td>
                  <td style={{padding:'8px 10px'}}>{unitName(op.business_unit_id)}</td>
                  <td style={{padding:'8px 10px',color:C.slate}}>{op.phone||'—'}</td>
                  <td style={{padding:'8px 10px'}}><Badge text={op.active?'Active':'Inactive'} color={op.active?C.green:C.slate}/></td>
                  <td style={{padding:'8px 10px',color:C.slate,fontSize:'0.86rem'}}>{mostRecentTokenUse(op.tokens) ? new Date(mostRecentTokenUse(op.tokens)!).toLocaleString() : 'Never'}</td>
                  <td style={{padding:'8px 10px',whiteSpace:'nowrap'}}>
                    <button type="button" disabled={busyId===op.id} style={{...addBtn(true,C.slate),marginRight:'0.4rem'}} onClick={()=>toggleActive(op.id,!op.active)}>
                      {busyId===op.id?'...':op.active?'Deactivate':'Reactivate'}
                    </button>
                    <button type="button" disabled={busyId===op.id} style={addBtn(true)} onClick={()=>issueNewToken(op.id,op.display_name)}>
                      New Link
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Dashboard-side stock view -- every level across every business unit
// for this client (unlike the field app's own stock view, which only
// ever shows one operator's own unit), setting reorder thresholds, and
// recording intra-store transfers. Deliberately a coach/CEO-level
// action: moving inventory between business units is an administrative
// decision, not something an individual field operator does from their
// own limited-scope phone view.
function StockAndTransfersSection({clientId,businessUnits}:{clientId:string;businessUnits:{id:string;name:string;active:boolean}[]}) {
  const [levels, setLevels] = useState<any[]>([])
  const [catalogueByUnit, setCatalogueByUnit] = useState<Record<string,any[]>>({})
  const [loading, setLoading] = useState(true)
  const [showTransferForm, setShowTransferForm] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [transferForm, setTransferForm] = useState({
    from_business_unit_id:'', from_catalogue_item_id:'', to_business_unit_id:'', to_catalogue_item_id:'', quantity:'', notes:'',
  })
  const [editingThresholdId, setEditingThresholdId] = useState<string|null>(null)
  const [thresholdValue, setThresholdValue] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [levelsRes, catalogueRes] = await Promise.all([
        fetch(`/api/field/admin/stock?client_id=${encodeURIComponent(clientId)}`),
        supabase.from('field_catalogue').select('id,name,unit_label,business_unit_id').eq('client_id',clientId).eq('active',true),
      ])
      const levelsData = await levelsRes.json()
      if (levelsRes.ok) setLevels(levelsData.stockLevels||[])
      const byUnit: Record<string,any[]> = {}
      ;(catalogueRes.data||[]).forEach((item:any) => {
        if (!byUnit[item.business_unit_id]) byUnit[item.business_unit_id] = []
        byUnit[item.business_unit_id].push(item)
      })
      setCatalogueByUnit(byUnit)
    } catch { /* leave lists as-is; the view below shows empty rather than a broken page */ }
    setLoading(false)
  }
  useEffect(()=>{ load() },[clientId])

  const unitName = (id: string) => businessUnits.find(u=>u.id===id)?.name || id

  async function saveThreshold(levelId: string) {
    try {
      const res = await fetch('/api/field/admin/stock', {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ stock_level_id: levelId, reorder_threshold: thresholdValue===''?null:Number(thresholdValue) }),
      })
      if (res.ok) { setEditingThresholdId(null); await load() }
      else { const d = await res.json(); alert(d.error || 'Could not update the reorder threshold.') }
    } catch {
      alert('No connection -- could not update the reorder threshold. Please try again.')
    }
  }

  async function submitTransfer() {
    const f = transferForm
    if (!f.from_business_unit_id || !f.from_catalogue_item_id || !f.to_business_unit_id || !f.to_catalogue_item_id || !f.quantity) {
      alert('Every field is required for a transfer.'); return
    }
    setTransferring(true)
    try {
      const res = await fetch('/api/field/admin/stock', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ client_id: clientId, ...f, quantity: Number(f.quantity) }),
      })
      const data = await res.json()
      if (res.ok) {
        setShowTransferForm(false)
        setTransferForm({from_business_unit_id:'',from_catalogue_item_id:'',to_business_unit_id:'',to_catalogue_item_id:'',quantity:'',notes:''})
        await load()
      } else {
        alert(data.error || 'Could not record the transfer.')
      }
    } catch {
      alert('No connection -- could not record the transfer. Please try again.')
    }
    setTransferring(false)
  }

  return (
    <div style={card}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div style={secH}>Stock & Transfers</div>
        <button type="button" style={addBtn(true)} onClick={()=>setShowTransferForm(!showTransferForm)}>{showTransferForm?'Cancel':'+ New Transfer'}</button>
      </div>
      <p style={{fontSize:'0.92rem',color:C.slate,marginBottom:'1rem',lineHeight:1.6}}>
        Stock is tracked automatically as operators record sales, and updated when they receive new stock in the field app.
        Use a transfer here to move inventory between business units -- e.g. produce grown on the farm being moved into the
        shop for resale.
      </p>

      {showTransferForm && (
        <div style={{background:C.cream,borderRadius:6,padding:'1rem',marginBottom:'1.25rem'}}>
          <div style={fGrid}>
            <div><label style={lbl}>From Unit</label>
              <select style={inp} value={transferForm.from_business_unit_id} onChange={e=>setTransferForm(f=>({...f,from_business_unit_id:e.target.value,from_catalogue_item_id:''}))}>
                <option value="">Select...</option>
                {businessUnits.filter(u=>u.active).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div><label style={lbl}>From Item</label>
              <select style={inp} value={transferForm.from_catalogue_item_id} onChange={e=>setTransferForm(f=>({...f,from_catalogue_item_id:e.target.value}))} disabled={!transferForm.from_business_unit_id}>
                <option value="">Select a unit first...</option>
                {(catalogueByUnit[transferForm.from_business_unit_id]||[]).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div><label style={lbl}>To Unit</label>
              <select style={inp} value={transferForm.to_business_unit_id} onChange={e=>setTransferForm(f=>({...f,to_business_unit_id:e.target.value,to_catalogue_item_id:''}))}>
                <option value="">Select...</option>
                {businessUnits.filter(u=>u.active).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div><label style={lbl}>To Item</label>
              <select style={inp} value={transferForm.to_catalogue_item_id} onChange={e=>setTransferForm(f=>({...f,to_catalogue_item_id:e.target.value}))} disabled={!transferForm.to_business_unit_id}>
                <option value="">Select a unit first...</option>
                {(catalogueByUnit[transferForm.to_business_unit_id]||[]).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Quantity</label>
              <input type="number" style={inp} value={transferForm.quantity} onChange={e=>setTransferForm(f=>({...f,quantity:e.target.value}))}/>
            </div>
            <div><label style={lbl}>Notes (optional)</label>
              <input style={inp} value={transferForm.notes} onChange={e=>setTransferForm(f=>({...f,notes:e.target.value}))}/>
            </div>
          </div>
          <button type="button" style={{...solidBtn('var(--cv-header)'),marginTop:'0.75rem'}} disabled={transferring} onClick={submitTransfer}>{transferring?'Recording...':'Record Transfer'}</button>
        </div>
      )}

      {loading ? (
        <p style={{color:C.slate,fontSize:'0.92rem'}}>Loading...</p>
      ) : levels.length===0 ? (
        <p style={{color:C.slate,fontSize:'0.92rem'}}>No stock recorded yet. Levels appear here once operators record sales or receive stock in the field app.</p>
      ) : (
        <div style={{overflowX:'auto'}}>
          <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.92rem'}}>
            <thead>
              <tr style={{background:'var(--cv-header)',color:'var(--cv-on-accent)'}}>
                {['Unit','Item','On Hand','Reorder Threshold',''].map(h=>(
                  <th key={h} style={{padding:'8px 10px',textAlign:'left',fontWeight:600,fontSize:'0.86rem'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {levels.map((level:any,i:number)=>{
                const low = level.reorder_threshold != null && level.quantity_on_hand <= level.reorder_threshold
                return (
                  <tr key={level.id} style={{background:low?'var(--cv-tint-amber)':i%2===0?C.cream:C.white}}>
                    <td style={{padding:'8px 10px'}}>{unitName(level.business_unit_id)}</td>
                    <td style={{padding:'8px 10px',fontWeight:600,color:C.navy}}>{level.catalogue?.name||'Item'}</td>
                    <td style={{padding:'8px 10px',fontFamily:'monospace',fontWeight:700}}>{level.quantity_on_hand}{level.catalogue?.unit_label?` ${level.catalogue.unit_label}`:''}</td>
                    <td style={{padding:'8px 10px'}}>
                      {editingThresholdId===level.id ? (
                        <div style={{display:'flex',gap:'0.4rem'}}>
                          <input type="number" style={{width:70,padding:'0.3rem 0.4rem',border:`1px solid ${C.border}`,borderRadius:4,fontSize:'0.86rem'}} value={thresholdValue} onChange={e=>setThresholdValue(e.target.value)}/>
                          <button type="button" style={addBtn(true)} onClick={()=>saveThreshold(level.id)}>Save</button>
                        </div>
                      ) : (
                        <span onClick={()=>{setEditingThresholdId(level.id);setThresholdValue(String(level.reorder_threshold??''))}} style={{cursor:'pointer',color:level.reorder_threshold!=null?C.navy:C.slate,textDecoration:'underline',fontSize:'0.86rem'}}>
                          {level.reorder_threshold ?? 'Set threshold'}
                        </span>
                      )}
                    </td>
                    <td style={{padding:'8px 10px'}}>{low && <Badge text="Low Stock" color={C.amber}/>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SettingsTab({config,P,onSave,theme,setThemeMode}) {
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

  const sections = [['general','General'],['units','Business Units'],['capital','Capital Structure'],['credit','Debt Obligations'],['delegation','Approval Delegation'],['field_operators','Field Operators'],['stock','Stock & Transfers']]

  return (
    <div>
      <div style={{display:'flex',gap:'0.4rem',marginBottom:'1.4rem',flexWrap:'wrap'}}>
        {sections.map(([id,label])=>(
          <button key={id} style={subtabPill(activeSection===id)} onClick={()=>setActiveSection(id)}>{label}</button>
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
            {form.plan_lines.length===0 ? (
              <div><label style={lbl}>Planning Horizon (months)</label><select style={inp} value={form.planning_months} onChange={e=>setForm(f=>({...f,planning_months:Number(e.target.value)}))}>
                <option value={12}>12 months</option>
                <option value={24}>24 months</option>
                <option value={36}>36 months</option>
              </select></div>
            ) : (
              <div>
                <label style={lbl}>Planning Horizon</label>
                <div style={{...inp,display:'flex',alignItems:'center',color:C.slate,background:C.lightBg}}>{form.planning_months} months (extend below)</div>
              </div>
            )}
            <div><label style={lbl}>Shared Cost Allocation (% by headcount)</label>
              <input type="number" min={0} max={100} style={inp} value={Math.round((form.settings.shared_cost_fixed_pct||0.5)*100)} onChange={e=>setForm(f=>({...f,settings:{...f.settings,shared_cost_fixed_pct:Number(e.target.value)/100}}))}/>
              <div style={hint}>Remainder allocated by revenue share</div>
            </div>
            <div><label style={lbl}>Corporate Tax Rate (%)</label>
              <input type="number" min={0} max={100} style={inp} value={Math.round((form.settings.corporate_tax_rate||0.30)*100)} onChange={e=>setForm(f=>({...f,settings:{...f.settings,corporate_tax_rate:Number(e.target.value)/100}}))}/>
            </div>
            <div><label style={lbl}>Opening Cash Balance</label><input type="number" style={inp} value={form.settings.opening_cash_balance||0} onChange={e=>setForm(f=>({...f,settings:{...f.settings,opening_cash_balance:Number(e.target.value)}}))}/></div>
          </div>
          {form.plan_lines.length>0 && <ExtendHorizonControl form={form} setForm={setForm}/>}
          <div style={{marginTop:'1.25rem',paddingTop:'1.15rem',borderTop:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.8rem'}}>
            <div>
              <label style={lbl}>Appearance</label>
              <div style={{display:'inline-flex',background:C.lightBg,border:`1px solid ${C.border}`,borderRadius:9,padding:3,gap:2}}>
                {([['light','Light'],['dark','Dark'],['auto','Auto']] as const).map(([mode,label])=>{
                  const active = theme===mode
                  return (
                    <button key={mode} type="button" onClick={()=>setThemeMode?.(mode)}
                      style={{fontFamily:'monospace',fontSize:'0.8rem',fontWeight:700,padding:'0.4rem 0.85rem',border:'none',borderRadius:7,cursor:'pointer',
                        background:active?'var(--cv-header)':'transparent',color:active?'var(--cv-on-accent)':C.slate}}>{label}</button>
                  )
                })}
              </div>
              <div style={hint}>Light and dark are saved on this device. Auto matches your device setting now.</div>
            </div>
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
                    <div style={{fontSize:'0.92rem',fontWeight:700,color:C.navy}}>{su.name}</div>
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
            <p style={{fontSize:'0.86rem',color:C.slate,marginBottom:'0.85rem'}}>Use this if the business has more than one loan -- bank loans, SACCO loans, or other non-bank facilities. Supplements the single Bank Loan field above; each is tracked separately in DSCR.</p>
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
          <p style={{fontSize:'0.92rem',color:C.slate,marginBottom:'1rem',lineHeight:1.7}}>The CEO can delegate final approval authority to another person. The delegated approver can approve spend requests in place of the CEO.</p>
          <div style={fGrid}>
            <div><label style={lbl}>Delegated Approver (User ID)</label>
              <input style={inp} value={form.settings.delegated_approver_id||''} placeholder="Leave blank to remove delegation"
                onChange={e=>setForm(f=>({...f,settings:{...f.settings,delegated_approver_id:e.target.value||undefined}}))}/>
              <div style={hint}>Enter the user ID of the person you are delegating to. Find user IDs in the Team tab.</div>
            </div>
          </div>
        </div>
      )}

      {activeSection==='field_operators'&&<FieldOperatorsSection clientId={config.client_id} businessUnits={config.business_units}/>}
      {activeSection==='stock'&&<StockAndTransfersSection clientId={config.client_id} businessUnits={config.business_units}/>}

      <div style={{marginTop:'1.25rem',display:'flex',gap:'0.75rem'}}>
        <button style={solidBtn('var(--cv-header)')} disabled={saving} onClick={save}>{saving?'Saving...':'Save All Settings'}</button>
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

// ── Clearview Intelligence: mockup-faithful building blocks ──────
// Section label: the small uppercase monospace kicker that heads each
// band in the approved mockups (".lab"). Optional right-aligned link.
function SectionLabel({children,right}:{children:React.ReactNode;right?:React.ReactNode}) {
  return (
    <div style={{fontFamily:'monospace',fontSize:'0.8rem',letterSpacing:'0.12em',textTransform:'uppercase',color:C.slate,margin:'1.4rem 0 0.7rem',display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:'0.75rem'}}>
      <span>{children}</span>{right}
    </div>
  )
}

// Driver / trade-credit stat card: border-left accent, no donut (mockup ".sc"
// without an svg). Value and rating colours are passed explicitly since the
// mockups colour them independently of the border.
function StatCard({label,value,rating,color,valueColor,ratingColor}:{label:string;value:string;rating?:string;color:string;valueColor?:string;ratingColor?:string}) {
  return (
    <div style={{background:C.white,borderRadius:14,padding:'1rem 1.15rem',display:'flex',alignItems:'center',gap:'0.85rem',boxShadow:'0 1px 2px var(--cv-shadow-1), 0 12px 32px var(--cv-shadow-2)',borderLeft:`4px solid ${color}`}}>
      <div style={{minWidth:0}}>
        <div style={{fontSize:'0.72rem',color:C.slate}}>{label}</div>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.35rem',fontWeight:700,color:valueColor||C.navy,lineHeight:1.05}}>{value}</div>
        {rating&&<div style={{fontSize:'0.8rem',fontWeight:700,color:ratingColor||color,marginTop:'0.2rem'}}>{rating}</div>}
      </div>
    </div>
  )
}

// Small progress ring used in the going-concern factor cards and LRS
// dimension cards. Geometry matches the mockup rings (r17 in a 42 box).
function MiniDonut({frac,color,center,size=42}:{frac:number;color:string;center:React.ReactNode;size?:number}) {
  const cx=size/2, r=cx-4, circ=2*Math.PI*r, f=Math.max(0,Math.min(1,frac||0))
  return (
    <div style={{position:'relative',flex:'0 0 auto',width:size,height:size}}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" style={{stroke:'var(--cv-border-soft)'}} strokeWidth="5"/>
        <circle cx={cx} cy={cx} r={r} fill="none" style={{stroke:color}} strokeWidth="5" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ*(1-f)} transform={`rotate(-90 ${cx} ${cx})`}/>
      </svg>
      <span style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace',fontWeight:700,fontSize:'0.72rem',color}}>{center}</span>
    </div>
  )
}

// SVG polygon radar. Generic over any number of axes -- pentagon for the
// five going-concern factors, heptagon for the seven LRS dimensions. Each
// axis carries a 0..1 fraction. Rings/spokes use theme border tokens.
function RadarChart({axes,color}:{axes:{label:string;frac:number}[];color:string}) {
  const cx=150, cy=145, R=104, n=axes.length
  const ang=(i:number)=> -Math.PI/2 + i*2*Math.PI/n
  const pt=(i:number,rad:number):[number,number]=>[cx+rad*Math.cos(ang(i)), cy+rad*Math.sin(ang(i))]
  const poly = axes.map((a,i)=>{const [x,y]=pt(i,R*Math.max(0,Math.min(1,a.frac||0)));return `${x.toFixed(1)},${y.toFixed(1)}`}).join(' ')
  return (
    <svg width="100%" viewBox="0 0 300 290" style={{maxWidth:300}}>
      <g fill="none" style={{stroke:'var(--cv-border-soft)'}}>{[0.25,0.5,0.75,1].map((f,i)=><circle key={i} cx={cx} cy={cy} r={R*f}/>)}</g>
      <g style={{stroke:'var(--cv-border-soft)'}}>{axes.map((a,i)=>{const [x,y]=pt(i,R);return <line key={i} x1={cx} y1={cy} x2={x} y2={y}/>})}</g>
      <polygon points={poly} fill={color} fillOpacity={0.17} stroke={color} strokeWidth="2"/>
      <g fontSize="8" style={{fill:C.slate}} textAnchor="middle" fontFamily="monospace">
        {axes.map((a,i)=>{const [x,y]=pt(i,R+18);return <text key={i} x={x} y={y+3}>{a.label}</text>})}
      </g>
    </svg>
  )
}

// "Do this next" action prompt. Wide gradient banner (going concern) or a
// compact in-grid card (LRS), both with the cyan accent from the mockups.
function ActionBanner({kicker,title,body,lift,cta,onCta,compact}:{kicker:string;title:string;body:string;lift?:string;cta:string;onCta?:()=>void;compact?:boolean}) {
  if (compact) return (
    <div style={{background:'var(--cv-tint-cyan)',border:'1px solid var(--cv-cyan-40)',borderTop:`3px solid ${C.cyan}`,borderRadius:14,boxShadow:'0 6px 20px var(--cv-shadow-2)',padding:'0.75rem 0.85rem',display:'flex',flexDirection:'column'}}>
      <div style={{fontFamily:'monospace',fontSize:'0.8rem',letterSpacing:'0.1em',textTransform:'uppercase',color:C.teal,fontWeight:700,marginBottom:'0.3rem'}}>{kicker}</div>
      <div style={{fontWeight:700,fontSize:'0.86rem',lineHeight:1.2,marginBottom:'0.25rem',color:C.navy}}>{title}</div>
      <div style={{fontSize:'0.72rem',color:C.slate,lineHeight:1.35,flex:1}}>{body}</div>
      {lift&&<div style={{fontFamily:'monospace',fontSize:'0.72rem',color:C.green,fontWeight:700,marginTop:'0.3rem'}}>&#9650; {lift}</div>}
      <div onClick={onCta} role="button" tabIndex={0} style={{marginTop:'0.45rem',fontFamily:'monospace',fontSize:'0.72rem',fontWeight:700,color:C.navy,background:C.cyan,borderRadius:8,padding:'0.38rem 0.5rem',textAlign:'center',cursor:onCta?'pointer':'default'}}>{cta}</div>
    </div>
  )
  return (
    <div style={{marginTop:'0.85rem',background:'var(--cv-tint-cyan)',border:'1px solid var(--cv-cyan-40)',borderLeft:`4px solid ${C.cyan}`,borderRadius:14,padding:'0.85rem 1.1rem',display:'flex',alignItems:'center',gap:'1rem',flexWrap:'wrap'}}>
      <div style={{flex:1,minWidth:200}}>
        <div style={{fontFamily:'monospace',fontSize:'0.8rem',letterSpacing:'0.1em',textTransform:'uppercase',color:C.teal,fontWeight:700}}>{kicker}</div>
        <div style={{fontWeight:700,fontSize:'0.9rem',color:C.navy}}>{title}</div>
        <div style={{fontSize:'0.86rem',color:C.slate}}>{body}</div>
      </div>
      <div onClick={onCta} role="button" tabIndex={0} style={{marginLeft:'auto',fontFamily:'monospace',fontSize:'0.8rem',fontWeight:700,color:C.navy,background:C.cyan,borderRadius:8,padding:'0.5rem 0.8rem',cursor:onCta?'pointer':'default'}}>{cta}</div>
    </div>
  )
}

// Grouped investor/bank metric card (mockup ".mg"). Only rows with a real
// value are passed in; nothing is fabricated.
function MetricGroup({title,color,rows}:{title:string;color:string;rows:{k:string;v:string;vColor?:string}[]}) {
  return (
    <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:14,boxShadow:'0 8px 24px var(--cv-shadow-2)',overflow:'hidden'}}>
      <div style={{padding:'0.65rem 0.9rem',fontFamily:'monospace',fontSize:'0.72rem',letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--cv-on-accent)',fontWeight:700,background:color}}>{title}</div>
      {rows.map((r,i)=>(
        <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'0.45rem 0.9rem',borderTop:'1px solid var(--cv-border-soft)',fontSize:'0.86rem'}}>
          <span style={{color:C.slate}}>{r.k}</span>
          <span style={{fontFamily:'monospace',fontWeight:700,color:r.vColor||C.navy}}>{r.v}</span>
        </div>
      ))}
    </div>
  )
}

// Card that heads a section with a Georgia serif title (mockup ".card-h").
const cardHead: React.CSSProperties = {padding:'0.8rem 1.1rem',borderBottom:`1px solid ${C.border}`,fontFamily:'Georgia,serif',fontWeight:700,fontSize:'0.95rem',color:C.navy}

// Split a generated story into a bold headline (first line / sentence) and
// the remaining body, matching the mockup story card.
function splitStory(text:string):{head:string;body:string} {
  const t=(text||'').trim()
  if(!t) return {head:'',body:''}
  const nl=t.indexOf('\n')
  if(nl>0) return {head:t.slice(0,nl).trim(), body:t.slice(nl+1).trim()}
  const mm=t.match(/^([\s\S]*?[.!?])\s+([\s\S]+)$/)
  if(mm) return {head:mm[1].trim(), body:mm[2].trim()}
  return {head:t, body:''}
}

function ClearviewIntelligenceTab({clientId,config,result,months,cc,P,onSave,closedPeriods,onNavigate}) {
  const [activeSection,setActiveSection]=useState('summary')
  const [healthReports, setHealthReports] = useState<any[]>([])
  const [investmentAssessments, setInvestmentAssessments] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [fieldAppPeriods, setFieldAppPeriods] = useState<Set<string>>(new Set())
  const [narrative, setNarrative] = useState<any>(null)
  const [previousStories, setPreviousStories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generatingNarrative, setGeneratingNarrative] = useState(false)
  const [generatingHealth, setGeneratingHealth] = useState(false)
  const [expandedStory, setExpandedStory] = useState<string|null>(null)
  const [healthOpen, setHealthOpen] = useState(false)
  const [discountRate, setDiscountRate] = useState(0.15) // 15% default -- a reasonable starting assumption for an African SME's cost of capital, but always adjustable, never presented as definitive

  useEffect(()=>{
    Promise.all([
      supabase.from('ai_health_checks').select('*').eq('client_id',clientId).order('period',{ascending:false}).limit(1),
      supabase.from('investment_readiness').select('*').eq('client_id',clientId).order('generated_at',{ascending:false}).limit(1),
      supabase.from('management_events').select('*').eq('client_id',clientId).order('date',{ascending:false}).limit(1000),
      supabase.from('coach_briefings').select('*').eq('client_id',clientId).order('generated_at',{ascending:false}).limit(12),
      supabase.from('generic_actuals').select('period,field_line_values').eq('client_id',clientId),
    ]).then(([h,i,e,n,a])=>{
      setHealthReports(h.data||[])
      setInvestmentAssessments(i.data||[])
      setEvents(e.data||[])
      setNarrative(n.data?.[0]||null)
      // The most recent briefing is the current month's story; older rows
      // populate the collapsed "previous months' stories" list in Summary.
      setPreviousStories((n.data||[]).slice(1))
      // A period counts as having real field-app data if ANY business
      // unit's row for that period has a non-empty field_line_values --
      // used by Liquidity Readiness's Visibility dimension (Transactions
      // Digitally Captured), not fabricated or defaulted to false.
      const periodsWithFieldData = new Set<string>()
      ;(a.data||[]).forEach((row:any) => {
        if (row.field_line_values && Object.keys(row.field_line_values).length > 0) periodsWithFieldData.add(row.period)
      })
      setFieldAppPeriods(periodsWithFieldData)
      setLoading(false)
    })
  },[clientId])

  function updateAssess(field:string, value:unknown) {
    const current = config.settings.coach_assessment || defaultCoachAssessment()
    const next = {...current,[field]:value}
    onSave({...config,settings:{...config.settings,coach_assessment:next}})
  }

  function Badge2({label,color}:{label:string;color:string}) {
    return <span style={{fontFamily:'monospace',fontSize:'0.86rem',fontWeight:700,padding:'0.25rem 0.7rem',borderRadius:20,background:color,color:'var(--cv-on-accent)'}}>{label}</span>
  }

  if (loading) return <Spinner/>
  if (!result) return (
    <div style={{...card,textAlign:'center',padding:'2.5rem'}}>
      <div style={{fontWeight:700,color:C.navy,marginBottom:'0.5rem'}}>Set up your financial plan first</div>
      <p style={{color:C.slate,fontSize:'0.92rem'}}>Clearview Business Intelligence needs business units and a financial plan to generate analysis.</p>
    </div>
  )

  const m = result.metrics
  const s = result.scores
  const assess = config.settings.coach_assessment || defaultCoachAssessment()
  const months_n = months.length
  const warnings = findCashWarningMonths(result, months)
  const latestHealth = healthReports[0]
  const latestInvestment = investmentAssessments[0]
  // Single source of truth for the bank loan's shape as a DebtObligation
  // -- previously constructed twice (once for debtSched, once for the
  // score time series below), byte-for-byte identical but at real risk
  // of silently drifting apart if one were ever edited without the other.
  const bankLoanObligation = config.settings.capital_structure?.bank_loan > 0 ? [{
    drawdownMonth:1, annualRate:config.settings.capital_structure?.annual_interest_rate||0.18,
    tenorMonths:(config.settings.capital_structure?.loan_tenor_years||2)*12,
    gracePeriodMonths:0, principal:config.settings.capital_structure?.bank_loan, repaymentType:'amortising',
  }] : []
  const debtSched = buildDebtSchedule(bankLoanObligation, months_n)

  // Score trend, for the collapsible year/month presentation of Credit
  // Risk / Going Concern / Investment Readiness -- computed once here,
  // shared by all three ScoreTrendCard instances below. Works whether
  // this client has any live actuals yet or not, since it only draws on
  // whatever the engine has already produced for every month.
  const yearGroups = buildYearGroups(config.start_date, config.planning_months)
  const monthLabelsFull = buildMonthLabels(config.start_date, config.planning_months)
  const scoreSeries = computeScoresTimeSeries({
    rev: result.con.rev, ebitda: result.con.ebitda, cogs: result.con.cogs, cashClose: result.cf.close,
    totalEquityByMonth: result.bs.total_equity, totalLiabilitiesByMonth: result.bs.total_liabilities,
    debtObligations: bankLoanObligation,
    tradeCreditLines: config.settings.trade_credit_lines || [],
    assess,
  }, yearGroups, monthLabelsFull)
  const monthsByYearLabel: Record<string, typeof scoreSeries.monthsByYear[number]> = {}
  yearGroups.forEach(g => { monthsByYearLabel[g.label] = scoreSeries.monthsByYear[g.year] })

  // Liquidity Readiness Score time series -- same year/month structure
  // as scoreSeries above, sharing yearGroups/monthLabelsFull.
  const periodIsActual: boolean[] = result.con.act_ebitda.map((v:number|null) => v !== null)
  const monthsClosedFlags: boolean[] = months.map((_:string, i:number) =>
    closedPeriods?.has(periodForMonthIndex(config.start_date, i)) ?? false
  )
  const monthsWithFieldAppFlags: boolean[] = months.map((_:string, i:number) =>
    fieldAppPeriods.has(periodForMonthIndex(config.start_date, i))
  )
  const capitalStructure = config.settings.capital_structure
  const capitalAtRisk = (capitalStructure?.shareholder_contribution||0) + (capitalStructure?.grant_recoverable||0)
  const lrsCashFlows = buildInvestmentCashFlows(capitalAtRisk, result.cf.op_cash, result.cf.inv_cash)
  const lrsMonthlyIrr = computeIRR(lrsCashFlows)
  const lrsAnnualIrr = lrsMonthlyIrr !== null ? monthlyRateToAnnualRate(lrsMonthlyIrr) : null
  const lrsCustomerGrowth = computeCustomerGrowthSummary(events)
  const lrsSeries = computeLRSTimeSeries({
    rev: result.con.rev, ebitda: result.con.ebitda, grossProfit: result.con.gp,
    cashClose: result.cf.close, opex: result.con.opex,
    totalEquityByMonth: result.bs.total_equity, totalLiabilitiesByMonth: result.bs.total_liabilities,
    businessBreakeven: result.metrics.business_breakeven,
    monthsWithActuals: periodIsActual, monthsClosed: monthsClosedFlags, monthsWithFieldApp: monthsWithFieldAppFlags,
    customersAcquiredTotal: lrsCustomerGrowth.totalCustomersAcquired,
    irr: lrsAnnualIrr, revenuePerHead: result.metrics.revenue_per_head,
    dscrMin: s.dscrMin, hasDebt: s.hasDebt, cashGaps: s.cashGaps, tradeCreditDpo: s.tradeCredit.dpo,
    assess,
  }, yearGroups, monthLabelsFull)
  const lrsMonthsByYearLabel: Record<string, typeof lrsSeries.monthsByYear[number]> = {}
  yearGroups.forEach(g => { lrsMonthsByYearLabel[g.label] = lrsSeries.monthsByYear[g.year] })
  const lrsCurrent = lrsSeries.years[lrsSeries.years.length-1]?.result || computeLiquidityReadinessScore({
    annualRevenue:0,annualEbitda:0,annualGrossProfit:0,cashClose:[0],monthlyOpex:[0],businessBreakeven:0,
    totalEquity:0,totalLiabilities:0,dscrMin:null,hasDebt:false,cashGaps:0,tradeCreditDpo:0,
    monthsOfActualData:0,monthsElapsed:0,monthsClosed:0,fieldAppMonths:0,revenueGrowthRate:0,
    customersAcquired:0,irr:null,revenuePerHead:0,assess,
  })

  // ── Derived figures for the mockup-faithful sections ─────────
  // All read from the engine outputs already computed above; none of these
  // change any scoring or lib calculation, they only present existing data.
  const tc = s.tradeCredit
  const scoreColorLRS = (v:number) => v>=70?C.green:v>=50?C.teal:v>=30?C.amber:C.red
  const lastIdx = Math.max(0, months_n-1)
  // Latest full calendar year (12 months); falls back to the last group for
  // very short plans. Used for the investor/bank coverage ratios, which are
  // annual by convention -- the engine's *total_* metrics sum the whole plan.
  const fullYearGroups = yearGroups.filter((g:any)=>g.monthIndices.length>=12)
  const lastYearGroup = fullYearGroups[fullYearGroups.length-1] || yearGroups[yearGroups.length-1] || {monthIndices:months.map((_:string,i:number)=>i)}
  const sumOver = (arr:number[], idxs:number[]) => idxs.reduce((sum:number,i:number)=>sum+(arr[i]||0),0)
  // No depreciation/amortisation is modelled, so EBIT == EBITDA here.
  const annualEbit = sumOver(result.con.ebitda, lastYearGroup.monthIndices)
  const annualInterest = sumOver(debtSched.totalInterest, lastYearGroup.monthIndices)
  const loanLiab = result.bs.loan_liability?.[lastIdx] || 0
  const totalEquityLast = result.bs.total_equity?.[lastIdx] || 0
  const capitalEmployed = totalEquityLast + loanLiab
  const ebitdaMargin = m.total_revenue>0 ? m.total_ebitda/m.total_revenue : null
  const roce = capitalEmployed>0 ? annualEbit/capitalEmployed : null
  const debtToEbitda = (s.hasDebt && annualEbit>0) ? loanLiab/annualEbit : null
  const gearing = (s.hasDebt && totalEquityLast>0) ? loanLiab/totalEquityLast : null
  const interestCover = annualInterest>0 ? annualEbit/annualInterest : null
  const latestOpex = result.con.opex?.[lastIdx] || 0
  const currentCash = result.cf.close?.[lastIdx] || 0
  const runwayMonths = latestOpex>0 ? currentCash/latestOpex : null
  // Revenue CAGR across full calendar years only, so a partial start/end year
  // can't distort it; N/A when there aren't two full years to compare.
  const annualRevs = fullYearGroups.map((g:any)=>sumOver(result.con.rev, g.monthIndices))
  const revenueCagr = (annualRevs.length>=2 && annualRevs[0]>0)
    ? Math.pow(annualRevs[annualRevs.length-1]/annualRevs[0], 1/(annualRevs.length-1)) - 1 : null
  // Payback: first month the cumulative capital-at-risk cash flow turns
  // non-negative, from the same series NPV/IRR already use. N/A with no
  // capital at risk (nothing to pay back).
  const paybackYears = (() => {
    if (capitalAtRisk<=0) return null
    let cum=0
    for (let i=0;i<lrsCashFlows.length;i++){ cum+=lrsCashFlows[i]; if (cum>=0) return i/12 }
    return null
  })()
  const cashWarnMin = warnings.length>0 ? warnings.reduce((a,b)=>b.balance<a.balance?b:a) : null

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

Write a short health check for the CEO in plain continuous prose. Begin with the overall status, one of Green, Amber or Red, and the one reason for it, in a single sentence. Then a sentence or two on what is going well, then the main concerns, then the most important actions this month. Plain sentences only. No lists, no numbered points, no headings, no bold, no dashes, no symbols. Under 150 words.`
      const response = await fetch('/api/ai-generate',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prompt,max_tokens:500})
      })
      const data = await response.json()
      const text = cleanStory(data.text||'Report unavailable')
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
      const prompt = `This month's status report for ${config.business_name}.

Data:
Revenue: ${cc} ${m.total_revenue.toLocaleString()}, trend ${s.revTrend}
EBITDA: ${cc} ${m.total_ebitda.toLocaleString()} (${(m.net_margin*100).toFixed(1)}% margin)
Minimum cash: ${cc} ${m.min_cash.toLocaleString()}; months where cash goes negative: ${warnings.length}
Break-even revenue: ${cc} ${m.business_breakeven.toLocaleString()}
Staff cost ratio: ${(m.staff_cost_pct*100).toFixed(1)}%
Credit Risk: ${s.score}/100 (${s.classification}); Going Concern: ${s.gcScore}/20; Investment Readiness: ${s.irScore}/30
Business units: ${config.business_units.filter(u=>u.active).map(u=>u.name).join(', ')}

Write a status report, not a letter. Do not address the reader. Do not open with any preamble or greeting. Start with the single most important fact. State what is going well, then what is getting worse (revenue direction, whether cash covers outflow, cost pressure), then the one action that matters most this month. At most 5 short factual sentences, under 80 words. No repetition, no filler.`
      const response = await fetch('/api/ai-generate',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prompt,max_tokens:350})
      })
      const data = await response.json()
      const text = data.text||'Narrative unavailable'
      const {data:saved} = await supabase.from('coach_briefings').insert([{
        client_id:clientId, briefing_text:cleanStory(text), visit_context:'Monthly Narrative',
        period_covered:new Date().toLocaleString('en-GB',{month:'long',year:'numeric'}),
        generated_at:new Date().toISOString(),
      }]).select().single()
      if (saved) {
        setNarrative(prev => { if (prev) setPreviousStories(list => [prev, ...list]); return saved })
      }
    } catch(e) { alert('Narrative generation failed') }
    setGeneratingNarrative(false)
  }

  const tabList:[string,string][] = [
    ['summary','Summary'],['credit','Credit Risk'],
    ['going_concern','Going Concern'],['liquidity_readiness','Liquidity Readiness'],
    ['verification','Verification & Recognition'],
    ['coach','Coach Assessment'],['events','Marketing Events'],
  ]

  return (
    <div>
      <div style={{display:'flex',gap:'0.4rem',flexWrap:'wrap',marginBottom:'1.2rem',overflowX:'auto'}}>
        {tabList.map(t=>(
          <button key={t[0]} onClick={()=>setActiveSection(t[0])} style={{fontFamily:'monospace',fontSize:'0.8rem',padding:'0.42rem 0.85rem',border:`1px solid ${activeSection===t[0]?C.cyan:C.border}`,borderRadius:8,background:activeSection===t[0]?C.cyan:C.white,color:activeSection===t[0]?C.navy:C.slate,cursor:'pointer',fontWeight:activeSection===t[0]?700:400,whiteSpace:'nowrap'}}>{t[1]}</button>
        ))}
      </div>

      {activeSection==='verification'&&(() => {
        // All derived from figures already computed above -- no new scoring,
        // no fabricated data. Record-based badges reflect real state now; the
        // Payments Verified badge and confidence lift arrive once
        // reconciliation runs against a linked wallet.
        const monthsElapsed = periodIsActual.length
        const monthsWithActuals = periodIsActual.filter(Boolean).length
        const monthsClosed = monthsClosedFlags.filter(Boolean).length
        const fieldDataMonths = monthsWithFieldAppFlags.filter(Boolean).length
        return (
        <div>
          <SectionLabel>Verification &amp; Recognition</SectionLabel>
          <VerificationRecognition
            clientId={clientId}
            monthsElapsed={monthsElapsed}
            monthsWithActuals={monthsWithActuals}
            monthsClosed={monthsClosed}
            fieldDataMonths={fieldDataMonths}
          />
        </div>
        )
      })()}

      {activeSection==='summary'&&(() => {
        const {head,body} = splitStory(narrative ? cleanStory(narrative.briefing_text) : '')
        const lrsWord = lrsCurrent.score>=70?'Strong':lrsCurrent.score>=50?'Building':lrsCurrent.score>=30?'Developing':'Early'
        const minCashMonthLabel = months[(m.min_cash_month||1)-1] || `Month ${m.min_cash_month}`
        return (
        <div>
          <SectionLabel>Where the business stands</SectionLabel>
          <div className="cv-grid-4">
            <ScoreDonut label="Credit Risk" display={`${s.score}/100`} frac={s.score/100} rating={s.classification} color={s.classColor}/>
            <ScoreDonut label="Going Concern" display={`${s.gcScore}/20`} frac={s.gcScore/20} rating={s.gcRating} color={s.gcColor}/>
            <ScoreDonut label="Investment Readiness" display={`${s.irScore}/30`} frac={s.irScore/30} rating={s.irTier} color={s.irColor}/>
            <ScoreDonut label="Liquidity Readiness" display={`${Math.round(lrsCurrent.score)}/100`} frac={lrsCurrent.score/100} rating={lrsWord} color={scoreColorLRS(lrsCurrent.score)}/>
          </div>

          <SectionLabel>This month&#39;s story</SectionLabel>
          <div style={{...card,padding:0,overflow:'hidden'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.9rem 1.2rem',borderBottom:`1px solid ${C.border}`,flexWrap:'wrap',gap:'0.5rem'}}>
              <div>
                <span style={{fontFamily:'Georgia,serif',fontWeight:700,fontSize:'1.05rem',color:C.navy}}>This Month&#39;s Story</span>
                <span style={{fontFamily:'monospace',fontSize:'0.72rem',color:C.purple,border:`1px solid ${C.purple}`,borderRadius:4,padding:'0.1rem 0.38rem',marginLeft:'0.4rem'}}>OPUS</span>
                {narrative&&<div style={{fontSize:'0.8rem',color:C.slate,fontFamily:'monospace',marginTop:'0.15rem'}}>{narrative.period_covered} · generated {new Date(narrative.generated_at).toLocaleDateString('en-GB')}</div>}
              </div>
              <div style={{display:'flex',gap:'0.5rem'}}>
                <button onClick={()=>window.print()} style={{...addBtn(true,C.cyan),color:C.teal,fontWeight:700}}>Print</button>
                <button onClick={generateNarrative} disabled={generatingNarrative} style={solidBtn(C.purple,true)}>{generatingNarrative?'Writing...':(narrative?'Regenerate':'Generate')}</button>
              </div>
            </div>
            <div style={{padding:'1.1rem 1.3rem',fontSize:'0.92rem',lineHeight:1.7,color:C.navy,maxWidth:'74ch'}}>
              {narrative ? (
                <>
                  {head&&<div style={{fontWeight:700,fontSize:'1rem',marginBottom:'0.45rem'}}>{head}</div>}
                  {body&&<div style={{whiteSpace:'pre-wrap'}}>{body}</div>}
                </>
              ) : <p style={{color:C.slate,margin:0}}>Generate a plain-English story of how the business is doing this month, written for the CEO.</p>}
            </div>
          </div>

          <SectionLabel>Watch &amp; key numbers</SectionLabel>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(290px,1fr))',gap:'1rem'}}>
            <div style={{background:'var(--cv-tint-red)',border:`1px solid ${C.red}`,borderLeft:`4px solid ${C.red}`,borderRadius:16,boxShadow:'0 8px 26px var(--cv-shadow-2)',padding:'1rem 1.15rem'}}>
              <div style={{display:'flex',alignItems:'center',gap:'0.5rem',fontWeight:700,color:C.red,fontSize:'0.92rem',marginBottom:'0.35rem'}}><span aria-hidden="true">&#9888;</span> Cash flow early warning</div>
              {warnings.length===0 ? (
                <div style={{fontSize:'0.92rem',color:C.slate,lineHeight:1.5}}>No cash shortfall projected across the planning period.</div>
              ) : (
                <>
                  <div style={{fontSize:'0.92rem',color:C.navy,lineHeight:1.5}}>Cash falls below zero. Lowest point is <b>{fmt(m.min_cash,cc)} in {minCashMonthLabel}</b>, with <b>{warnings.length} month{warnings.length>1?'s':''}</b> at risk across the plan.</div>
                  <div style={{margin:'0.6rem 0 0.2rem'}}>
                    {(() => {
                      const vals = result.cf.close; const nn=vals.length; if(!nn) return null
                      const W=300,H=52, mx=Math.max(...vals,0), mn=Math.min(...vals,0), sp=(mx-mn)||1
                      const xx=(i:number)=> nn<=1?0:(i/(nn-1))*W
                      const yy=(v:number)=> (H-6)-((v-mn)/sp)*(H-12)
                      const pts=vals.map((v:number,i:number)=>`${xx(i).toFixed(1)},${yy(v).toFixed(1)}`).join(' ')
                      return <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="52" preserveAspectRatio="none"><line x1="0" y1={yy(0)} x2={W} y2={yy(0)} style={{stroke:C.red}} strokeDasharray="3 3" opacity="0.5"/><polyline fill="none" style={{stroke:C.red}} strokeWidth="2" points={pts}/></svg>
                    })()}
                  </div>
                  <span onClick={()=>onNavigate&&onNavigate('cashflow')} style={{fontFamily:'monospace',fontSize:'0.8rem',color:C.red,fontWeight:700,cursor:'pointer'}}>See Cash Flow &rarr;</span>
                </>
              )}
            </div>
            <div style={{...card,padding:0,overflow:'hidden',margin:0}}>
              <div style={cardHead}>Key numbers</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr'}}>
                {([
                  ['Debt service (min)', dscrLabel(s), dscrColor(s,C)],
                  ['Break-even revenue', fmt(m.business_breakeven,cc), C.navy],
                  ['Days to collect (DSO)', `${tc.dso.toFixed(0)}d`, C.navy],
                  ['Days to pay (DPO)', `${tc.dpo.toFixed(0)}d`, C.navy],
                  ['Cash conversion gap', `${tc.cashConversionGap.toFixed(0)}d`, tc.cashConversionGap<=0?C.green:tc.cashConversionGap>30?C.red:C.amber],
                  ['Staff cost % revenue', pct(m.staff_cost_pct), C.navy],
                ] as [string,string,string][]).map(([l,v,col],i)=>(
                  <div key={i} style={{padding:'0.7rem 1.15rem',borderTop:'1px solid var(--cv-border-soft)',borderRight:i%2===0?'1px solid var(--cv-border-soft)':undefined}}>
                    <div style={{fontFamily:'monospace',fontSize:'0.8rem',letterSpacing:'0.06em',textTransform:'uppercase',color:C.slate,marginBottom:'0.25rem'}}>{l}</div>
                    <div style={{fontFamily:'monospace',fontWeight:700,fontSize:'1rem',color:col}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <SectionLabel>Business health check <span style={{fontWeight:400,textTransform:'none',letterSpacing:0,color:C.slate}}>· for your coach</span></SectionLabel>
          <div style={{...card,padding:0,overflow:'hidden'}}>
            <div onClick={()=>setHealthOpen(o=>!o)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.8rem 1.1rem',borderBottom:healthOpen?`1px solid ${C.border}`:'none',gap:'0.5rem',flexWrap:'wrap',cursor:'pointer'}}>
              <span style={{fontFamily:'Georgia,serif',fontWeight:700,fontSize:'0.95rem',color:C.navy}}>Business health check{latestHealth&&<span style={{fontFamily:'monospace',fontSize:'0.8rem',color:C.slate,fontWeight:400}}> · {new Date(latestHealth.period).toLocaleString('en-GB',{month:'short',year:'numeric'})}</span>}</span>
              <span style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
                <button onClick={(e)=>{e.stopPropagation();generateHealthCheck()}} style={solidBtn(C.purple,true)} disabled={generatingHealth}>{generatingHealth?'Generating...':'Generate This Month'}</button>
                <span style={{color:C.slate,fontFamily:'monospace'}}>{healthOpen?'▴':'▾'}</span>
              </span>
            </div>
            {healthOpen && (
              <div style={{padding:'1rem 1.2rem'}}>
                {latestHealth ? (
                  <div style={{fontSize:'0.92rem',color:C.navy,lineHeight:1.7,whiteSpace:'pre-wrap',maxWidth:'74ch'}}>{cleanStory(latestHealth.report_text)}</div>
                ) : <p style={{color:C.slate,fontSize:'0.92rem',margin:0}}>No health check generated yet this month.</p>}
              </div>
            )}
          </div>

          <SectionLabel>Previous months&#39; stories</SectionLabel>
          <div style={{...card,padding:0,overflow:'hidden'}}>
            {previousStories.length===0 ? (
              <div style={{padding:'1rem 1.2rem',color:C.slate,fontSize:'0.92rem'}}>No earlier stories yet. Each regenerated story moves the current one into this list.</div>
            ) : previousStories.map((st:any,i:number)=>{
              const open = expandedStory===(st.id||String(i))
              const key = st.id||String(i)
              return (
                <div key={key}>
                  <div onClick={()=>setExpandedStory(open?null:key)} style={{display:'flex',alignItems:'center',gap:'0.8rem',padding:'0.8rem 1.2rem',borderTop:i===0?undefined:'1px solid var(--cv-border-soft)',cursor:'pointer'}}>
                    <span style={{fontFamily:'monospace',fontSize:'0.8rem',color:C.slate,width:90,flex:'0 0 auto'}}>{st.period_covered||new Date(st.generated_at).toLocaleDateString('en-GB',{month:'short',year:'numeric'})}</span>
                    <span style={{flex:1,fontSize:'0.86rem',color:C.navy,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:open?'normal':'nowrap',lineHeight:1.5}}>{cleanStory(st.briefing_text)}</span>
                    <span style={{color:C.slate,fontFamily:'monospace'}}>{open?'▴':'▾'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        )
      })()}

      {activeSection==='credit'&&(() => {
        const hasTc = tc.dso>0||tc.dpo>0
        const gap = tc.cashConversionGap
        const trendCol = s.revTrend==='Growing'?C.green:s.revTrend==='Stable'?C.amber:C.red
        const gapCol = gap<=0?C.green:gap>30?C.red:C.amber
        return (
        <div>
          <SectionLabel>Credit Risk · Score</SectionLabel>
          <div className="cv-grid-4">
            <ScoreDonut label="Credit Risk" display={`${s.score}/100`} frac={s.score/100} rating={s.classification} color={s.classColor}/>
            <StatCard label="Minimum DSCR" value={dscrLabel(s)} rating={!s.hasDebt?'No debt':s.dscrMin===null?'Not yet due':dscrRating(s)} color={dscrColor(s,C)} valueColor={dscrColor(s,C)} ratingColor={dscrColor(s,C)}/>
            <StatCard label="Revenue trend" value={s.revTrend} rating={s.revTrend==='Growing'?'Healthy':s.revTrend==='Stable'?'Steady':'Watch'} color={trendCol} valueColor={trendCol} ratingColor={trendCol}/>
            <StatCard label="Cash-negative months" value={String(s.cashGaps)} rating={s.cashGaps===0?'None':'Risk'} color={s.cashGaps===0?C.green:C.red} valueColor={s.cashGaps===0?C.green:C.red} ratingColor={s.cashGaps===0?C.green:C.red}/>
          </div>

          <SectionLabel right={<span onClick={()=>onNavigate&&onNavigate('actuals_wc')} style={{color:C.teal,textTransform:'none',letterSpacing:0,cursor:'pointer'}}>Enter on Actuals &amp; Working Capital &rarr;</span>}>Payment behaviour · trade credit</SectionLabel>
          <div className="cv-grid-4">
            <StatCard label="Days to collect (DSO)" value={hasTc?`${tc.dso.toFixed(0)}d`:'n/a'} rating={hasTc?(tc.dso>45?'Slow':'Normal'):'No data'} color={hasTc&&tc.dso>45?C.red:C.green} valueColor={hasTc&&tc.dso>45?C.red:C.navy} ratingColor={hasTc&&tc.dso>45?C.red:C.slate}/>
            <StatCard label="Days to pay (DPO)" value={hasTc?`${tc.dpo.toFixed(0)}d`:'n/a'} rating={hasTc?'Normal':'No data'} color={C.green} ratingColor={C.slate}/>
            <StatCard label="Cash conversion gap" value={hasTc?`${gap.toFixed(0)}d`:'n/a'} rating={hasTc?(gap<=0?'Supplier-financed':gap>30?'Cash tied up':'Manageable'):'No data'} color={gapCol} valueColor={hasTc?gapCol:C.navy} ratingColor={hasTc?gapCol:C.slate}/>
            <StatCard label="Peak receivable" value={fmt(tc.peakReceivable,cc)} rating={tc.peakReceivable>0?'Exposure':'None'} color={C.amber} ratingColor={C.amber}/>
          </div>

          <SectionLabel>Credit Risk — the numbers</SectionLabel>
          <ScoreTrendCard title="Credit Risk Trend" years={scoreSeries.years} monthsByYear={monthsByYearLabel} rows={[
            {label:'Credit Risk Score /100', getValue:(r:any)=>r.score, getColor:(r:any)=>r.classColor},
            {label:'Rating', getValue:(r:any)=>r.classification, getColor:(r:any)=>r.classColor},
            {label:'Minimum DSCR', getValue:(r:any)=>dscrLabel(r), getColor:(r:any)=>dscrColor(r,C)},
            {label:'Trade credit · DSO (days)', getValue:(r:any)=>r.tradeCredit.dso.toFixed(0), getColor:()=>C.navy},
            {label:'Trade credit · DPO (days)', getValue:(r:any)=>r.tradeCredit.dpo.toFixed(0), getColor:()=>C.navy},
            {label:'Trade credit · Cash conversion gap', getValue:(r:any)=>r.tradeCredit.cashConversionGap.toFixed(0), getColor:(r:any)=>r.tradeCredit.cashConversionGap<=0?C.green:r.tradeCredit.cashConversionGap>60?C.red:C.amber},
            {label:'Trade credit · Receivables outstanding', getValue:(r:any)=>fmt(r.tradeCredit.peakReceivable,cc), getColor:()=>C.navy},
          ]}/>
        </div>
        )
      })()}

      {activeSection==='going_concern'&&(() => {
        const facColor = (f:number) => f>=0.7?C.green:f>=0.4?C.amber:C.red
        const hasTc = tc.dso>0||tc.dpo>0
        const gcFactors = [
          {key:'debt', name:'Debt Service Coverage', radar:'Debt service', sc:s.gcDebtServiceFactor, max:4,
            headVal: dscrLabel(s), headRating: !s.hasDebt?'No debt':s.dscrMin===null?'Not yet due':dscrRating(s),
            sub:`DSCR ${dscrLabel(s)}${s.hasDebt&&s.dscrMin!==null&&s.dscrMin<1?' — not covering debt in the tightest month.':'.'}`},
          {key:'liq', name:'Liquidity Position', radar:'Liquidity', sc:s.gcLiquidityFactor, max:4,
            headVal: m.min_cash>=0?'Positive':'Negative', headRating: m.min_cash>=0?'Covered':`${s.cashGaps} month${s.cashGaps>1?'s':''} at risk`,
            sub:`Minimum cash ${fmt(m.min_cash,cc)}${s.cashGaps>0?`, negative in ${s.cashGaps} month(s).`:'.'}`},
          {key:'rev', name:'Revenue Sustainability', radar:'Revenue', sc:s.gcRevenueSustainabilityFactor, max:4,
            headVal: s.revTrend, headRating: s.revTrend,
            sub: hasTc?`Cash conversion gap ${tc.cashConversionGap.toFixed(0)} days; revenue ${s.revTrend.toLowerCase()}.`:`Revenue trend ${s.revTrend.toLowerCase()} across the plan.`},
          {key:'prof', name:'Operational Profitability', radar:'Profitability', sc:s.gcProfitabilityFactor, max:3,
            headVal: fmt(m.total_ebitda,cc), headRating: m.total_ebitda>=0?'Profitable':'Loss-making',
            sub:`EBITDA ${m.total_ebitda>=0?'positive':'negative'}, margin ${ebitdaMargin!==null?pct(ebitdaMargin):'n/a'}.`},
          {key:'mgmt', name:'Management & Governance', radar:'Management', sc:s.gcManagementFactor, max:5,
            headVal: `${s.gcManagementFactor}/5`, headRating: 'Assessed',
            sub:'Set on the Coach Assessment tab.'},
        ]
        const weakest = [...gcFactors].sort((a,b)=>(a.sc/a.max)-(b.sc/b.max))
        const heads = weakest.slice(0,2)
        const cashIssue = s.cashGaps>0 || (s.hasDebt && s.dscrMin!==null && s.dscrMin<1)
        return (
        <div>
          <div style={{...card,marginBottom:'1.1rem'}}>
            <h2 style={{fontFamily:'Georgia,serif',fontSize:'1.15rem',margin:'0 0 0.4rem',color:C.navy}}>Going Concern</h2>
            <p style={{fontSize:'0.92rem',color:C.slate,lineHeight:1.5,margin:0}}>Whether the business can keep operating and meet its obligations over the next year. One score out of 20, built from five factors: debt service, liquidity, revenue sustainability, operational profitability, and management.</p>
          </div>

          <SectionLabel>Score &amp; key drivers</SectionLabel>
          <div className="cv-grid-3">
            <ScoreDonut label="Going Concern" display={`${s.gcScore}/20`} frac={s.gcScore/20} rating={s.gcRating} color={s.gcColor}/>
            {heads.map(f=>(
              <ScoreDonut key={f.key} label={f.name} display={f.headVal} frac={f.sc/f.max} rating={f.headRating} color={facColor(f.sc/f.max)}/>
            ))}
          </div>

          <SectionLabel>Five factors</SectionLabel>
          <div className="cv-gc-grid">
            <div className="cv-dim-radar" style={{...card,margin:0,padding:0,overflow:'hidden',display:'flex',flexDirection:'column'}}>
              <div style={cardHead}>Going concern profile</div>
              <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'0.4rem'}}>
                <RadarChart color={s.gcColor} axes={gcFactors.map(f=>({label:f.radar,frac:f.sc/f.max}))}/>
              </div>
            </div>
            {gcFactors.map(f=>{
              const col = facColor(f.sc/f.max)
              return (
                <div key={f.key} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:14,boxShadow:'0 6px 20px var(--cv-shadow-1)',borderTop:`3px solid ${col}`,padding:'0.8rem 0.9rem',display:'flex',flexDirection:'column'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'0.65rem'}}>
                    <MiniDonut frac={f.sc/f.max} color={col} center={`${f.sc}/${f.max}`}/>
                    <div style={{fontWeight:700,fontSize:'0.86rem',lineHeight:1.15,color:C.navy}}>{f.name}</div>
                  </div>
                  <div style={{fontSize:'0.8rem',color:C.slate,marginTop:'0.5rem',borderTop:'1px solid var(--cv-border-soft)',paddingTop:'0.45rem',flex:1}}>{f.sub}</div>
                </div>
              )
            })}
          </div>

          <ActionBanner kicker="Do this next"
            title={cashIssue?'Fix the cash shortfall to lift the score':`Strengthen ${weakest[0].name}`}
            body={cashIssue?`Liquidity and debt service are the two weak factors. Closing the ${s.cashGaps} negative month${s.cashGaps>1?'s':''} raises Going Concern the fastest.`:`${weakest[0].name} is the lowest factor at ${weakest[0].sc}/${weakest[0].max}. Improving it lifts Going Concern the most.`}
            cta={cashIssue?'Open Cash Flow →':'Review Coach Assessment →'}
            onCta={cashIssue?(()=>onNavigate&&onNavigate('cashflow')):(()=>setActiveSection('coach'))}/>

          <SectionLabel>Score trend · month by month, collapsible to years</SectionLabel>
          <ScoreTrendCard title="Going Concern Trend" years={scoreSeries.years} monthsByYear={monthsByYearLabel} rows={[
            {label:'Going Concern /20', getValue:(r:any)=>r.gcScore, getColor:(r:any)=>r.gcColor},
            {label:'Rating', getValue:(r:any)=>r.gcRating, getColor:(r:any)=>r.gcColor},
            {label:'Debt Service /4', getValue:(r:any)=>r.gcDebtServiceFactor, getColor:(r:any)=>facColor(r.gcDebtServiceFactor/4)},
            {label:'Liquidity /4', getValue:(r:any)=>r.gcLiquidityFactor, getColor:(r:any)=>facColor(r.gcLiquidityFactor/4)},
            {label:'Revenue Sustainability /4', getValue:(r:any)=>r.gcRevenueSustainabilityFactor, getColor:(r:any)=>facColor(r.gcRevenueSustainabilityFactor/4)},
            {label:'Operational Profitability /3', getValue:(r:any)=>r.gcProfitabilityFactor, getColor:(r:any)=>facColor(r.gcProfitabilityFactor/3)},
            {label:'Management /5', getValue:(r:any)=>r.gcManagementFactor, getColor:(r:any)=>facColor(r.gcManagementFactor/5)},
          ]}/>
        </div>
        )
      })()}

      {activeSection==='liquidity_readiness'&&(() => {
        // Reuses capitalAtRisk/lrsCashFlows/lrsAnnualIrr already computed
        // once above for the LRS time series -- IRR is an iterative
        // Newton-Raphson/bisection routine, so recomputing it here under
        // different names would be wasted work with a real risk of the
        // two silently drifting apart. NPV still needs its own
        // calculation since it depends on the adjustable discountRate.
        const monthlyDiscountRate = annualRateToMonthlyRate(discountRate)
        const npv = computeNPV(lrsCashFlows, monthlyDiscountRate)
        const irr = lrsAnnualIrr
        const growth = computeCustomerGrowthSummary(events)
        const dimLabels: [keyof typeof lrsCurrent.dimensions, string][] = [
          ['marketOpportunity','Market Opportunity'],['visibility','Visibility'],['trust','Trust'],
          ['profitability','Profitability'],['capacity','Capacity'],['resilience','Resilience'],['compliance','Compliance'],
        ]
        const scoreColor = (v:number) => v>=70?C.green:v>=50?C.teal:v>=30?C.amber:C.red
        return (
          <div>
            <div style={{...card,marginBottom:'1.1rem'}}>
              <h2 style={{fontFamily:'Georgia,serif',fontSize:'1.15rem',margin:'0 0 0.4rem',color:C.navy}}>Liquidity Readiness Score</h2>
              <p style={{fontSize:'0.92rem',color:C.slate,lineHeight:1.5,margin:0}}>
                How ready this business is for productive liquidity to flow into it, as one core score across seven weighted
                dimensions. Bank Fit and Investor Fit are the same seven dimensions weighted for each lens; the underlying data never changes.
              </p>
            </div>
            <InvestmentPitchDownload clientId={clientId}/>

            <SectionLabel>Score &amp; fit</SectionLabel>
            {(() => {
              const bankFit = computeFitScore(lrsCurrent, FIT_SCORE_PRESETS.bank.weights)
              const investorFit = computeFitScore(lrsCurrent, FIT_SCORE_PRESETS.investor.weights)
              const lrsWord = lrsCurrent.score>=70?'Strong':lrsCurrent.score>=50?'Building':lrsCurrent.score>=30?'Developing':'Early'
              return (
                <div className="cv-grid-3">
                  <ScoreDonut label="Liquidity Readiness" display={`${Math.round(lrsCurrent.score)}/100`} frac={lrsCurrent.score/100} rating={lrsWord} color={scoreColor(lrsCurrent.score)}/>
                  <ScoreDonut label="Bank Fit" display={`${Math.round(bankFit)}/100`} frac={bankFit/100} rating="Re-weighted" color={scoreColor(bankFit)}/>
                  <ScoreDonut label="Investor Fit" display={`${Math.round(investorFit)}/100`} frac={investorFit/100} rating="Re-weighted" color={scoreColor(investorFit)}/>
                </div>
              )
            })()}

            <SectionLabel>Seven weighted dimensions</SectionLabel>
            {(() => {
              const dims = dimLabels.map(([key,label])=>({key,label,dim:lrsCurrent.dimensions[key],weight:LRS_WEIGHTS[key]}))
              const weakest = [...dims].sort((a,b)=>a.dim.score-b.dim.score)[0]
              const maxLift = Math.max(1, Math.round(weakest.weight*(100-weakest.dim.score)))
              const fieldWeak = weakest.key==='visibility'
              return (
                <div className="cv-dim-grid">
                  <div className="cv-dim-radar" style={{...card,margin:0,padding:0,overflow:'hidden',display:'flex',flexDirection:'column'}}>
                    <div style={cardHead}>Readiness profile</div>
                    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'0.4rem'}}>
                      <RadarChart color={C.teal} axes={dims.map(d=>({label:d.label.split(' ')[0],frac:d.dim.score/100}))}/>
                    </div>
                  </div>
                  {dims.map(d=>{
                    const col = scoreColor(d.dim.score)
                    return (
                      <div key={d.key} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:14,boxShadow:'0 6px 20px var(--cv-shadow-1)',borderTop:`3px solid ${col}`,padding:'0.75rem 0.85rem'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'0.6rem'}}>
                          <MiniDonut frac={d.dim.score/100} color={col} center={Math.round(d.dim.score)}/>
                          <div><div style={{fontWeight:700,fontSize:'0.86rem',lineHeight:1.12,color:C.navy}}>{d.label}</div><div style={{fontSize:'0.72rem',color:C.slate,fontFamily:'monospace'}}>{(d.weight*100).toFixed(0)}%</div></div>
                        </div>
                        <div style={{marginTop:'0.5rem',display:'grid',gap:'0.1rem',borderTop:'1px solid var(--cv-border-soft)',paddingTop:'0.4rem'}}>
                          {d.dim.indicators.slice(0,2).map(ind=>(
                            <div key={ind.label} style={{display:'flex',justifyContent:'space-between',gap:'0.5rem',fontSize:'0.72rem',color:C.slate}}><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ind.label}</span><b style={{fontFamily:'monospace',color:C.navy,fontWeight:700}}>{Math.round(ind.value)}</b></div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  <ActionBanner compact kicker="Do this next"
                    title={fieldWeak?'Post monthly sales in Field':`Improve ${weakest.label}`}
                    body={`${weakest.label} is weakest at ${Math.round(weakest.dim.score)} and lifts the score fastest.`}
                    lift={`up to +${maxLift}`}
                    cta={fieldWeak?'Open Clearview Field →':'Open Coach Assessment →'}
                    onCta={fieldWeak?(()=>onNavigate&&onNavigate('actuals_wc')):(()=>setActiveSection('coach'))}/>
                </div>
              )
            })()}

            <SectionLabel>Metrics investors and banks look at</SectionLabel>
            {(() => {
              const npvL = computeNPV(lrsCashFlows, annualRateToMonthlyRate(discountRate))
              const profitRows:{k:string;v:string;vColor?:string}[] = [
                {k:'Gross margin', v: pct(m.gross_margin)},
                {k:'EBITDA margin', v: ebitdaMargin!==null?pct(ebitdaMargin):'n/a'},
                {k:'Net margin', v: pct(m.net_margin)},
              ]
              if (roce!==null) profitRows.push({k:'ROCE', v: pct(roce)})
              const debtRows:{k:string;v:string;vColor?:string}[] = [
                {k:'DSCR (min)', v: dscrLabel(s), vColor: dscrColor(s,C)},
              ]
              if (interestCover!==null) debtRows.push({k:'Interest cover', v:`${interestCover.toFixed(1)}x`})
              if (debtToEbitda!==null) debtRows.push({k:'Debt / EBITDA', v:`${debtToEbitda.toFixed(1)}x`})
              if (gearing!==null) debtRows.push({k:'Gearing', v:`${gearing.toFixed(1)}x`})
              const liqRows:{k:string;v:string;vColor?:string}[] = []
              if (runwayMonths!==null) liqRows.push({k:'Cash runway', v:`${runwayMonths.toFixed(1)} mo`, vColor: runwayMonths>=3?C.navy:C.amber})
              liqRows.push({k:'Cash cycle', v:`${tc.cashConversionGap.toFixed(0)}d`, vColor: tc.cashConversionGap<=0?C.green:tc.cashConversionGap>30?C.red:C.amber})
              // Current & quick ratio, computed honestly from what the model
              // actually holds -- nothing fabricated. Current assets = latest
              // cash (floored at 0 for the ratio; a negative balance is an
              // overdraft, flagged separately) + receivables outstanding.
              // Current liabilities = payables outstanding + loan principal due
              // within the next 12 months (summed from the debt schedule's
              // per-month principal, starting at the current month). Quick
              // ratio == current ratio because no inventory sits on the balance
              // sheet. n/a when there are no current liabilities.
              const cashLast = result.bs.cash?.[lastIdx] || 0
              const receivablesLast = tc.totalReceivableOutstanding?.[lastIdx] || 0
              const payablesLast = tc.totalPayableOutstanding?.[lastIdx] || 0
              const curBoundary = result.cf.act_mask.lastIndexOf(true)
              const loanFromIdx = curBoundary>=0 ? curBoundary : 0
              const loanCurrentPortion = (debtSched.totalPrincipal||[]).slice(loanFromIdx, loanFromIdx+12).reduce((a:number,b:number)=>a+b,0)
              const currentAssets = Math.max(0, cashLast) + receivablesLast
              const currentLiabilities = payablesLast + loanCurrentPortion
              const ratioColor = (r:number) => r>=1.5?C.green:r>=1?C.amber:C.red
              if (currentLiabilities>0) {
                const cr = currentAssets/currentLiabilities
                liqRows.push({k:'Current ratio', v: cr.toFixed(2), vColor: ratioColor(cr)})
                liqRows.push({k:'Quick ratio', v: cr.toFixed(2), vColor: ratioColor(cr)})
              } else {
                liqRows.push({k:'Current ratio', v:'n/a'})
                liqRows.push({k:'Quick ratio', v:'n/a'})
              }
              const retRows:{k:string;v:string;vColor?:string}[] = [
                {k:'Revenue CAGR', v: revenueCagr!==null?pct(revenueCagr):'n/a'},
                {k:'NPV', v: fmt(npvL,cc), vColor: npvL>=0?C.green:C.red},
                {k:'IRR', v: lrsAnnualIrr!==null?pct(lrsAnnualIrr):'n/a'},
                {k:'Payback', v: paybackYears!==null?`${paybackYears.toFixed(1)}y`:'n/a'},
              ]
              return (
                <>
                  <div className="cv-grid-4">
                    <MetricGroup title="Profitability" color={C.green} rows={profitRows}/>
                    <MetricGroup title="Debt & coverage" color={C.red} rows={debtRows}/>
                    <MetricGroup title="Liquidity" color={C.cyan} rows={liqRows}/>
                    <MetricGroup title="Returns & value" color={C.purple} rows={retRows}/>
                  </div>
                  <p style={{fontSize:'0.8rem',color:C.slate,marginTop:'0.5rem',lineHeight:1.5}}>
                    Current ratio = (cash + receivables outstanding) &divide; (payables outstanding + loan principal due in the next 12 months).
                    Quick ratio equals the current ratio here because no inventory is held on the balance sheet. Cash is floored at zero for the
                    ratio (a negative balance is an overdraft, flagged separately in the cash warning). EBIT equals EBITDA here as no depreciation
                    is modelled; coverage ratios use the latest full financial year.
                  </p>
                </>
              )
            })()}

            {latestInvestment&&(
              <div style={{...card,marginTop:'1.1rem'}}>
                <div style={{fontWeight:700,fontSize:'0.92rem',color:C.navy,marginBottom:'0.5rem'}}>AI Narrative Assessment</div>
                <div style={{fontSize:'0.92rem',color:C.navy,lineHeight:1.75,whiteSpace:'pre-wrap'}}>{latestInvestment.assessment_text}</div>
              </div>
            )}

            <SectionLabel>Score trend · month by month, collapsible to years</SectionLabel>

            <ScoreTrendCard title="Liquidity Readiness Trend" years={lrsSeries.years} monthsByYear={lrsMonthsByYearLabel} rows={[
              {label:'Liquidity Readiness Score /100', getValue:(r:any)=>Math.round(r.score), getColor:(r:any)=>scoreColor(r.score)},
              ...dimLabels.map(([key,label])=>({
                label, getValue:(r:any)=>Math.round(r.dimensions[key].score), getColor:(r:any)=>scoreColor(r.dimensions[key].score),
              })),
            ]}/>

            <div style={card}>
              <div style={secH}>Investment Metrics</div>
              <p style={{fontSize:'0.92rem',color:C.slate,marginBottom:'1rem',lineHeight:1.6}}>
                Net Present Value and Internal Rate of Return, calculated against the capital genuinely at risk for a return
                (shareholder contributions and recoverable grants -- not non-repayable grants or loan principal, which have their own
                separate return: interest, already reflected in Credit Risk) and the business's projected Free Cash Flow (Operating
                Cash Flow less spend on Fixed Assets).
              </p>
              <div style={{display:'flex',alignItems:'center',gap:'0.6rem',marginBottom:'1rem'}}>
                <label htmlFor="discount-rate" style={{fontSize:'0.86rem',color:C.slate}}>Discount rate assumption:</label>
                <input id="discount-rate" type="number" min={1} max={100} value={Math.round(discountRate*100)} onChange={e=>setDiscountRate(Number(e.target.value)/100)} style={{width:70,padding:'0.3rem 0.5rem',border:`1px solid ${C.border}`,borderRadius:4,fontFamily:'monospace'}}/>
                <span style={{fontSize:'0.86rem',color:C.slate}}>% -- adjust to your own cost of capital or required return</span>
              </div>
              <div style={kpiGrid}>
                <KPI label="Capital at Risk" value={fmt(capitalAtRisk,cc)} sub="Shareholder + recoverable grant"/>
                <KPI label="Net Present Value" value={fmt(npv,cc)} sub={`at ${(discountRate*100).toFixed(0)}%`} color={npv>=0?C.green:C.red}/>
                <KPI label="Internal Rate of Return" value={irr!==null?pct(irr):'N/A'} sub={irr===null?'No real IRR (check cash flow signs)':'Annualised'} color={irr!==null&&irr>discountRate?C.green:C.red}/>
              </div>
              {capitalAtRisk===0&&(
                <div style={{background:'var(--cv-tint-amber)',border:`1px solid ${C.amber}`,borderRadius:6,padding:'0.75rem 1rem',marginBottom:'1rem',fontSize:'0.86rem',color:C.navy}}>
                  No shareholder contribution or recoverable grant is recorded in Capital Structure (Settings) -- NPV/IRR above are
                  calculated against zero capital at risk, which makes them of limited meaning. Enter the real capital structure for
                  an accurate result.
                </div>
              )}
              <div style={{marginTop:'1.25rem',paddingTop:'1.25rem',borderTop:`1px solid ${C.border}`}}>
                <div style={{fontWeight:700,fontSize:'0.92rem',color:C.navy,marginBottom:'0.75rem'}}>Customer Growth (whole business, all recorded marketing events)</div>
                <div style={kpiGrid}>
                  <KPI label="Customers Acquired" value={growth.totalCustomersAcquired.toLocaleString()}/>
                  <KPI label="Blended CAC" value={growth.blendedCAC!==null?fmt(growth.blendedCAC,cc):'N/A'} sub={growth.blendedCAC===null?'No customers recorded yet':undefined}/>
                  <KPI label="Revenue Lift" value={fmt(growth.totalRevenueLift,cc)} sub="From tracked events"/>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {activeSection==='coach'&&(
        <div style={card}>
          <div style={secH}>Coach Assessment (Business Profile)</div>
          <p style={{fontSize:'0.92rem',color:C.slate,marginBottom:'1.5rem',lineHeight:1.6}}>
            Every qualitative input the platform uses lives here, grouped by exactly which score it feeds into.
            Everything else on Credit Risk, Going Concern, and Liquidity Readiness is computed directly from the financial
            model -- these are the only figures a human judgement call, not a calculation.
          </p>
          {[
            {group:'Feeds: Going Concern and Investment Readiness', items:[
              {label:'Management Capability',field:'managementCapability',max:5},
              {label:'Commercial Model Clarity',field:'commercialModel',max:5},
              {label:'Market Evidence',field:'marketEvidence',max:5},
            ]},
            {group:'Feeds: Liquidity Readiness — Visibility', items:[
              {label:'KPI Reporting',field:'kpiReporting',max:5},
            ]},
            {group:'Feeds: Liquidity Readiness — Trust (and Compliance: Policies)', items:[
              {label:'Audit Trail',field:'auditTrail',max:5},
              {label:'Supplier Relationships',field:'supplierRelationships',max:5},
              {label:'Governance & Record-Keeping',field:'governance',max:5},
            ]},
            {group:'Feeds: Liquidity Readiness — Capacity', items:[
              {label:'Production Capacity',field:'productionCapacity',max:5},
              {label:'Inventory Availability',field:'inventoryAvailability',max:5},
            ]},
            {group:'Feeds: Liquidity Readiness — Resilience', items:[
              {label:'Customer Diversification',field:'customerDiversification',max:5},
              {label:'Supplier Diversification',field:'supplierDiversification',max:5},
              {label:'Business Continuity',field:'businessContinuity',max:5},
            ]},
            {group:'Feeds: Liquidity Readiness — Compliance', items:[
              {label:'Registration',field:'registrationCompliance',max:5},
              {label:'Tax Compliance',field:'taxCompliance',max:5},
              {label:'Licences',field:'licenceCompliance',max:5},
            ]},
          ].map(section=>(
            <div key={section.group} style={{marginBottom:'1.75rem'}}>
              <div style={{fontSize:'0.8rem',fontWeight:700,color:C.teal,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:'0.75rem',borderBottom:`1px solid ${C.border}`,paddingBottom:'0.4rem'}}>{section.group}</div>
              <div style={fGrid}>
                {section.items.map(item=>(
                  <div key={item.field}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.3rem'}}>
                      <label htmlFor={`assess-${item.field}`} style={{fontWeight:600,fontSize:'0.92rem',color:C.navy}}>{item.label}</label>
                      <span style={{fontFamily:'monospace',fontWeight:700,color:C.cyan}}>{(assess as any)[item.field] ?? 2}/{item.max}</span>
                    </div>
                    <input id={`assess-${item.field}`} type="range" min="0" max={item.max} step="1" value={(assess as any)[item.field] ?? 2} onChange={e=>updateAssess(item.field,Number(e.target.value))} style={{width:'100%',accentColor:C.cyan,marginBottom:'0.2rem'}}/>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginTop:'0.5rem'}}>
            {[{label:'Immediate Actions (30 days)',field:'immediateActions'},{label:'Near-Term Actions (60-90 days)',field:'nearTermActions'},{label:'Required Follow-Up',field:'followUp'},{label:'Coach Notes',field:'coachNotes'}].map(item=>(
              <div key={item.field}>
                <label style={{display:'block',fontWeight:600,fontSize:'0.92rem',marginBottom:'0.25rem',color:C.navy}}>{item.label}</label>
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
// Mirrors the engine's legacy running-balance simulation for a SINGLE line,
// used only to (a) render legacy flow-based lines read-only as an outstanding
// series and (b) seed monthly_balance when the user converts one to the new
// month-end balance input. Kept byte-for-byte consistent with
// computeTradeCredit's legacy path (same Math.min settlement cap, same floor).
function legacyOutstanding(line:any, months:number): number[] {
  const out:number[] = []
  let bal = 0
  for (let i=0;i<months;i++){
    const n = line.monthly_new?.[i] || 0
    const rawS = line.monthly_settled?.[i] || 0
    const s = Math.min(rawS, bal + n)
    bal = Math.max(0, bal + n - s)
    out.push(bal)
  }
  return out
}

const TC_ALL = '__all__'
const TC_UNASSIGNED = '__unassigned__'

function WorkingCapitalTab({config,result,months,cc,P,onSave}) {
  const lines: any[] = config.settings.trade_credit_lines || []
  const canEdit = P.canEditPlan
  const activeUnits = config.business_units.filter((u:any)=>u.active)
  const hasUnassigned = lines.some(l=>!l.unit_id)
  const [selUnit, setSelUnit] = useState<string>(activeUnits[0]?.id || TC_ALL)

  // The set of lines shown / metered for the current selection.
  const unitLines = selUnit===TC_ALL ? lines
    : selUnit===TC_UNASSIGNED ? lines.filter(l=>!l.unit_id)
    : lines.filter(l=>l.unit_id===selUnit)

  // Per-unit revenue/cogs come from the engine result the same way the P&L
  // unit views derive them (result.unitPL[uid] / result.con) -- never a new
  // derivation. Consolidated and Unassigned (whole-business legacy) use the
  // consolidated arrays.
  const isWhole = selUnit===TC_ALL || selUnit===TC_UNASSIGNED
  const cogsArr: number[] = isWhole ? (result?.con?.cogs || []) : (result?.unitPL?.[selUnit]?.cogs || [])
  const revArr: number[]  = isWhole ? (result?.con?.rev  || []) : (result?.unitPL?.[selUnit]?.rev  || [])
  // The metric figures come straight from the shared engine function applied
  // to just this unit's lines and this unit's rev/cogs -- nothing fabricated.
  const tc = computeTradeCredit(unitLines, cogsArr, revArr, months.length)

  function persist(next:any[]) {
    onSave({...config, settings:{...config.settings, trade_credit_lines: next}})
  }
  function addLine(type:'payable'|'receivable') {
    const id = `tc_${Date.now()}`
    // New lines are BALANCE-based per unit: month-end outstanding only. The
    // legacy monthly_new/monthly_settled are deliberately omitted.
    const newLine:any = {
      id, name: '', type,
      unit_id: (selUnit===TC_ALL || selUnit===TC_UNASSIGNED) ? undefined : selUnit,
      monthly_balance: Array(config.planning_months).fill(0),
    }
    persist([...lines, newLine])
  }
  function updateLineName(id:string, name:string) {
    persist(lines.map(l=>l.id===id?{...l,name}:l))
  }
  function removeLine(id:string) {
    persist(lines.filter(l=>l.id!==id))
  }
  function updateBalance(id:string, idx:number, val:number) {
    persist(lines.map(l=>{
      if (l.id!==id) return l
      const base = (l.monthly_balance && l.monthly_balance.length===config.planning_months)
        ? l.monthly_balance : Array(config.planning_months).fill(0)
      return {...l, monthly_balance: base.map((v:number,i:number)=>i===idx?val:v)}
    }))
  }
  // Non-destructive conversion: seed monthly_balance from the legacy running
  // outstanding so the line switches to the balance path while its original
  // monthly_new/monthly_settled arrays are kept on record.
  function convertLegacy(id:string) {
    persist(lines.map(l=> l.id===id
      ? {...l, monthly_balance: legacyOutstanding(l, config.planning_months)}
      : l))
  }

  const payableLines = unitLines.filter(l=>l.type==='payable')
  const receivableLines = unitLines.filter(l=>l.type==='receivable')
  const s = result?.scores

  const unitTabs = [
    {id:TC_ALL, name:'All units'},
    ...activeUnits.map((u:any)=>({id:u.id, name:u.name})),
    ...(hasUnassigned?[{id:TC_UNASSIGNED, name:'Unassigned'}]:[]),
  ]

  return (
    <div>
      <div style={{background:'var(--cv-tint-cyan)',borderRadius:6,padding:'0.85rem 1rem',marginBottom:'1.25rem'}}>
        <p style={{fontSize:'0.92rem',color:C.navy,lineHeight:1.6,margin:0}}>
          Track, per business unit, the credit you extend to customers or partners (Receivable) and the credit your suppliers extend to you (Payable). For each month simply enter the <strong>outstanding balance at month end</strong> — what customers still owe you, and what you still owe suppliers — read straight off your debtors and creditors book. The days-to-collect (DSO), days-to-pay (DPO) and the cash impact are all worked out automatically and feed into Cash Flow and Going Concern.
        </p>
      </div>

      {/* Business-unit selector */}
      <div style={{display:'flex',gap:'0.45rem',marginBottom:'1rem',flexWrap:'wrap'}}>
        {unitTabs.map(u=>{
          const bu = activeUnits.find((x:any)=>x.id===u.id)
          const accent = bu?.color || C.cyan
          const on = selUnit===u.id
          return (
            <button key={u.id} style={{fontFamily:'monospace',fontSize:'0.8rem',padding:'0.45rem 0.85rem',
              border:`2px solid ${on?accent:C.border}`,borderRadius:4,
              background:on?accent:C.white,color:on?'var(--cv-on-accent)':C.navy,cursor:'pointer'}}
              onClick={()=>setSelUnit(u.id)}>{u.name}</button>
          )
        })}
      </div>

      {s && (()=>{
        const dso=tc.dso, dpo=tc.dpo, gap=tc.cashConversionGap
        const payOut=tc.totalPayableOutstanding[tc.totalPayableOutstanding.length-1]||0
        const recOut=tc.totalReceivableOutstanding[tc.totalReceivableOutstanding.length-1]||0
        // Ring fill is a purely visual gauge over a 90-day reference window --
        // no new score is computed; the day counts themselves come straight
        // from the engine's tradeCredit output.
        const ringFrac=(d:number)=>Math.max(0,Math.min(1,d/90))
        const gapCol=gap<=0?C.green:gap>30?C.red:C.amber
        const scopeLabel = selUnit===TC_ALL ? 'all units' : selUnit===TC_UNASSIGNED ? 'unassigned lines' : (activeUnits.find((u:any)=>u.id===selUnit)?.name || 'unit')
        return (
          <>
            <div style={ovLabel}>Payment behaviour · {scopeLabel}</div>
            <div className="cv-grid-3" style={{marginBottom:'1.35rem'}}>
              <div style={{background:C.white,borderRadius:14,padding:'0.95rem 1.1rem',boxShadow:'0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-2)',borderLeft:`4px solid ${C.navy}`}}>
                <div style={{fontFamily:'monospace',fontSize:'0.8rem',letterSpacing:'0.08em',textTransform:'uppercase',color:C.slate,marginBottom:'0.45rem'}}>Days to collect · DSO</div>
                <div style={{display:'flex',alignItems:'center',gap:'0.8rem'}}>
                  <MiniDonut frac={ringFrac(dso)} color={C.amber} size={46} center=""/>
                  <div>
                    <div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:C.navy,lineHeight:1.05}}>{dso.toFixed(0)}d</div>
                    <div style={{fontSize:'0.72rem',color:C.slate,fontFamily:'monospace'}}>{fmt(recOut,cc)} outstanding</div>
                  </div>
                </div>
              </div>
              <div style={{background:C.white,borderRadius:14,padding:'0.95rem 1.1rem',boxShadow:'0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-2)',borderLeft:`4px solid ${C.navy}`}}>
                <div style={{fontFamily:'monospace',fontSize:'0.8rem',letterSpacing:'0.08em',textTransform:'uppercase',color:C.slate,marginBottom:'0.45rem'}}>Days to pay · DPO</div>
                <div style={{display:'flex',alignItems:'center',gap:'0.8rem'}}>
                  <MiniDonut frac={ringFrac(dpo)} color={C.teal} size={46} center=""/>
                  <div>
                    <div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:C.navy,lineHeight:1.05}}>{dpo.toFixed(0)}d</div>
                    <div style={{fontSize:'0.72rem',color:C.slate,fontFamily:'monospace'}}>{fmt(payOut,cc)} outstanding</div>
                  </div>
                </div>
              </div>
              <GlanceCard label="Cash conversion gap" value={`${gap.toFixed(0)}d`} accent={gapCol} valueColor={gapCol}
                desc={gap>0?`you pay ${gap.toFixed(0)} days before you collect`:'you collect before you pay'}/>
            </div>
          </>
        )
      })()}

      <div style={card}>
        <SectionHeader title="What customers still owe you (month-end)" action={canEdit?<button style={addBtn(true)} onClick={()=>addLine('receivable')}>+ Add Receivable Line</button>:null}/>
        <p style={{fontSize:'0.8rem',color:C.slate,margin:'0 0 0.6rem'}}>Enter the outstanding balance at the end of each month — the total your customers or partners have not yet paid.</p>
        <TradeCreditBalanceGrid lines={receivableLines} months={months} cc={cc} canEdit={canEdit} planningMonths={config.planning_months}
          updateLineName={updateLineName} removeLine={removeLine} updateBalance={updateBalance} convertLegacy={convertLegacy}
          emptyText="No receivable lines yet. Use this for credit given to customers or licensing partners."/>
      </div>

      <div style={card}>
        <SectionHeader title="What you still owe suppliers (month-end)" action={canEdit?<button style={addBtn(true)} onClick={()=>addLine('payable')}>+ Add Supplier Credit Line</button>:null}/>
        <p style={{fontSize:'0.8rem',color:C.slate,margin:'0 0 0.6rem'}}>Enter the outstanding balance at the end of each month — the total you have not yet paid your suppliers.</p>
        <TradeCreditBalanceGrid lines={payableLines} months={months} cc={cc} canEdit={canEdit} planningMonths={config.planning_months}
          updateLineName={updateLineName} removeLine={removeLine} updateBalance={updateBalance} convertLegacy={convertLegacy}
          emptyText="No supplier credit lines yet."/>
      </div>
    </div>
  )
}

// Month-end OUTSTANDING balance grid: one row per line, months across. New
// (balance-based) lines are editable; legacy flow-based lines (monthly_new/
// monthly_settled, no monthly_balance) render read-only as their computed
// outstanding series with a one-click "convert to month-end balances".
function TradeCreditBalanceGrid({lines,months,cc,canEdit,planningMonths,updateLineName,removeLine,updateBalance,convertLegacy,emptyText}:any) {
  if (!lines || lines.length===0) return <p style={{color:C.slate,fontSize:'0.92rem',margin:0}}>{emptyText}</p>
  return (
    <div style={{overflowX:'auto'}}>
      <table style={{borderCollapse:'collapse',fontSize:'0.86rem',minWidth:640}}>
        <thead><tr>
          <th style={{padding:'4px 6px',textAlign:'left',minWidth:160,background:C.lightBg,color:C.navy,fontWeight:600}}>Outstanding at month end</th>
          {months.map((m:string,i:number)=><th key={i} style={{padding:'4px 5px',textAlign:'center',minWidth:78,background:C.lightBg,color:C.navy,fontWeight:600}}>{m}</th>)}
        </tr></thead>
        <tbody>
          {lines.map((line:any)=>{
            const isLegacy = line.monthly_balance===undefined
            const values:number[] = isLegacy
              ? legacyOutstanding(line, planningMonths)
              : (line.monthly_balance.length===planningMonths ? line.monthly_balance : Array(planningMonths).fill(0))
            return (
              <React.Fragment key={line.id}>
                <tr>
                  <td style={{padding:'4px 6px',minWidth:160}}>
                    <div style={{display:'flex',gap:'0.35rem',alignItems:'center'}}>
                      <input style={{...inp,fontWeight:600,fontSize:'0.8rem',padding:'0.3rem 0.4rem'}} placeholder="e.g. Input Supplier, Licensing Partner"
                        value={line.name} disabled={!canEdit} onChange={e=>updateLineName(line.id,e.target.value)}/>
                      {canEdit && <button style={{background:'transparent',border:'none',color:C.red,cursor:'pointer',fontSize:'1.1rem'}} onClick={()=>removeLine(line.id)}>×</button>}
                    </div>
                    {isLegacy && (
                      <div style={{marginTop:'0.25rem'}}>
                        <span style={{fontFamily:'monospace',fontSize:'0.72rem',padding:'0.05rem 0.35rem',borderRadius:4,background:C.lightBg,color:C.slate,border:`1px solid ${C.border}`}}>legacy new/settled · read-only</span>
                        {canEdit && <button style={{...addBtn(true),marginLeft:'0.35rem',fontSize:'0.72rem',padding:'0.15rem 0.4rem'}} onClick={()=>convertLegacy(line.id)}>Convert to month-end balances</button>}
                      </div>
                    )}
                  </td>
                  {values.map((v:number,i:number)=>(
                    <td key={i} style={{padding:'2px 3px'}}>
                      <input type="number" disabled={!canEdit || isLegacy}
                        style={{width:70,padding:'0.28rem 0.32rem',fontSize:'0.8rem',textAlign:'right',border:`1px solid ${C.border}`,borderRadius:3,background:(canEdit&&!isLegacy)?C.white:'var(--cv-disabled)',color:C.navy}}
                        value={isLegacy ? (v||'') : (v??'')} placeholder="0"
                        onChange={e=>updateBalance(line.id,i,Number(e.target.value))}/>
                    </td>
                  ))}
                </tr>
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
      <p style={{fontSize:'0.8rem',color:C.slate,marginTop:'0.4rem'}}>All figures in {cc}. Enter the balance still outstanding at the end of each month; the cash impact (the month-to-month change) is worked out automatically.</p>
    </div>
  )
}
// ── P&L TAB (Unit + Consolidated merged with toggle) ─────────
// ── PLAN vs ACTUAL VARIANCE VIEW ──────────────────────────────
// Additive to the P&L "Statement" view -- it changes nothing there.
// Every number shown here is either read straight off `result` (the
// engine's own plan arrays rev/cogs/staff/opex + derived gp/ebitda and
// its actual arrays act_*), or summed from config.plan_lines / the loaded
// per-line actuals using the SAME formulas the engine uses internally
// (sell*vol for spread revenue, buy*vol for the spread's cost-of-sales
// contribution, fee*engagements for service revenue, monthly_plan
// otherwise), so a group's line detail reconciles with its header. No
// calculation in src/lib is touched.
function PLVarianceView({ config, result, months, cc, view, selUnit, setSelUnit, lineActuals }) {
  const [period, setPeriod] = useState<'month'|'quarter'|'ytd'>('ytd')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggle = (k:string) => setExpanded(e => ({ ...e, [k]: !e[k] }))

  // Scenario multipliers, read the same way the engine reads them, so the
  // per-line plan we compute here matches the plan totals on `result`.
  const activeScenario = config.settings?.scenarios?.find((s:any)=>s.active) || { rev_mult:1, cost_mult:1 }
  const rev_mult = activeScenario.rev_mult ?? 1
  const cost_mult = activeScenario.cost_mult ?? 1
  const n = months.length

  // "Today" as a column index against the plan start -- same UTC arithmetic
  // the engine uses, so today lands on exactly the same month.
  const startD = new Date(config.start_date)
  const now = new Date()
  let todayIdx = (now.getUTCFullYear()-startD.getUTCFullYear())*12 + (now.getUTCMonth()-startD.getUTCMonth())
  todayIdx = Math.max(0, Math.min(n-1, todayIdx))

  // Every period option is bounded at the current month, so plan and actual
  // are always summed over the SAME already-elapsed months -- a true
  // like-for-like variance, never plan-over-a-full-quarter vs actual-over-
  // one-month.
  const rangeIdx: number[] = (() => {
    if (period==='month') return [todayIdx]
    if (period==='ytd') return Array.from({length: todayIdx+1}, (_,i)=>i)
    const qStartCal = Math.floor(now.getUTCMonth()/3)*3
    const back = now.getUTCMonth() - qStartCal
    const qStart = Math.max(0, todayIdx - back)
    return Array.from({length: todayIdx - qStart + 1}, (_,i)=> qStart+i)
  })()
  const rangeLabel = rangeIdx.length===1 ? months[rangeIdx[0]] : `${months[rangeIdx[0]]} – ${months[rangeIdx[rangeIdx.length-1]]}`

  const sumRange = (arr:(number|null|undefined)[]) => rangeIdx.reduce((s,i)=> s + (arr?.[i] ?? 0), 0)

  const unitIds: string[] = view==='consolidated'
    ? config.business_units.filter((u:any)=>u.active).map((u:any)=>u.id)
    : [selUnit]

  // Per-line actual (combined manual + Field, exactly as elsewhere in this
  // file) summed over the range; null when the line has NO recorded actual
  // anywhere in range -> shown as a dash, never fabricated.
  function lineActualInfo(lineId:string): number|null {
    let total = 0, hasAny = false
    unitIds.forEach(uid => {
      const byMonth = lineActuals?.[uid]
      if (!byMonth) return
      rangeIdx.forEach(i => {
        const v = byMonth[i]?.[lineId]
        if (v !== undefined) { total += v; hasAny = true }
      })
    })
    return hasAny ? total : null
  }

  // Per-line PLAN over the range, using the exact formulas the engine uses
  // to build its category totals.
  function linePlanRange(line:any, role:'revenue'|'cost'): number {
    let t = 0
    rangeIdx.forEach(m => {
      if (line.line_type==='spread' && line.sell_price && line.volume && line.buy_price) {
        t += role==='revenue'
          ? (line.sell_price[m]||0)*(line.volume[m]||0)*rev_mult
          : (line.buy_price[m]||0)*(line.volume[m]||0)*cost_mult
      } else if (line.line_type==='service_fee' && line.fee_per_engagement && line.engagements && line.cost_per_engagement) {
        t += role==='revenue'
          ? (line.fee_per_engagement[m]||0)*(line.engagements[m]||0)*rev_mult
          : (line.cost_per_engagement[m]||0)*(line.engagements[m]||0)*cost_mult
      } else {
        t += (line.monthly_plan?.[m]||0) * (role==='revenue' ? rev_mult : cost_mult)
      }
    })
    return t
  }

  function drillLines(groupKey:string): {id:string;name:string;plan:number;actual:number|null;kind:'revenue'|'cost'}[] {
    const active = config.plan_lines.filter((l:any)=> l.active && unitIds.includes(l.unit_id))
    if (groupKey==='revenue') {
      return active.filter((l:any)=> l.category==='revenue').map((l:any)=>(
        { id:l.id, name:l.name, plan: linePlanRange(l,'revenue'), actual: lineActualInfo(l.id), kind:'revenue' as const }
      ))
    }
    if (groupKey==='cost_of_sales') {
      const rows: any[] = []
      active.filter((l:any)=> l.category==='cost_of_sales').forEach((l:any)=>{
        rows.push({ id:l.id, name:l.name, plan: linePlanRange(l,'cost'), actual: lineActualInfo(l.id), kind:'cost' })
      })
      // The spread/service buy-side costs are folded into COGS by the engine
      // but are NOT their own cost_of_sales plan_lines -- surface them so the
      // group's PLAN reconciles with its header. They have no independent
      // actual (the line's actual is booked against revenue), so actual is a
      // dash by construction.
      active.filter((l:any)=> l.line_type==='spread').forEach((l:any)=>{
        rows.push({ id:l.id+'::cogs', name:`${l.name} — buy cost`, plan: linePlanRange(l,'cost'), actual:null, kind:'cost' })
      })
      active.filter((l:any)=> l.line_type==='service_fee').forEach((l:any)=>{
        rows.push({ id:l.id+'::svc', name:`${l.name} — delivery cost`, plan: linePlanRange(l,'cost'), actual:null, kind:'cost' })
      })
      return rows
    }
    if (groupKey==='staff') {
      return active.filter((l:any)=> l.category==='staff').map((l:any)=>(
        { id:l.id, name:l.name, plan: linePlanRange(l,'cost'), actual: lineActualInfo(l.id), kind:'cost' as const }
      ))
    }
    if (groupKey==='direct_opex') {
      return active.filter((l:any)=> l.category==='direct_opex').map((l:any)=>(
        { id:l.id, name:l.name, plan: linePlanRange(l,'cost'), actual: lineActualInfo(l.id), kind:'cost' as const }
      ))
    }
    return []
  }

  const pl = view==='unit' ? result.unitPL[selUnit] : null
  const con = result.con

  type Kind = 'revenue'|'cost'|'profit'
  interface StmtRow { key:string; label:string; kind:Kind; bold?:boolean; highlight?:boolean; plan:number; actual:number|null; drill?:string; note?:string }

  let rows: StmtRow[] = []
  if (view==='unit') {
    if (!pl) return <div style={card}><p style={{color:C.slate}}>No data for this unit.</p></div>
    rows = [
      { key:'rev',    label:'Revenue',                   kind:'revenue', bold:true, plan:sumRange(pl.rev),    actual:sumRange(pl.act_rev),    drill:'revenue' },
      { key:'cogs',   label:'Cost of sales',             kind:'cost',               plan:sumRange(pl.cogs),   actual:sumRange(pl.act_cogs),   drill:'cost_of_sales' },
      { key:'gp',     label:'Gross profit',              kind:'profit',  bold:true, highlight:true, plan:sumRange(pl.gp),  actual:sumRange(pl.act_gp) },
      { key:'staff',  label:'Staff costs',               kind:'cost',               plan:sumRange(pl.staff),  actual:sumRange(pl.act_staff),  drill:'staff' },
      { key:'opex',   label:'Other operating expenses',  kind:'cost',               plan:sumRange(pl.opex),   actual:sumRange(pl.act_opex),   drill:'direct_opex' },
      { key:'shared', label:'Shared costs (allocated)',  kind:'cost',               plan:sumRange(pl.shared), actual:sumRange(pl.shared),     note:'allocated — no separate actual' },
      { key:'ebitda', label:'EBITDA',                    kind:'profit',  bold:true, highlight:true, plan:sumRange(pl.ebitda), actual:sumRange(pl.act_ebitda) },
    ]
  } else {
    // Actual total operating costs at the consolidated level are not stored
    // as a single actual array, but equal actual GP minus actual EBITDA by
    // construction (the engine's own identity), so derive them from those.
    const actTotOpex = rangeIdx.reduce((s,i)=> s + ((con.act_gp[i]!=null && con.act_ebitda[i]!=null) ? (con.act_gp[i]-con.act_ebitda[i]) : 0), 0)
    rows = [
      { key:'rev',      label:'Revenue',               kind:'revenue', bold:true, plan:sumRange(con.rev),  actual:sumRange(con.act_rev),  drill:'revenue' },
      { key:'cogs',     label:'Cost of sales',         kind:'cost',               plan:sumRange(con.cogs), actual:sumRange(con.act_cogs), drill:'cost_of_sales' },
      { key:'gp',       label:'Gross profit',          kind:'profit',  bold:true, highlight:true, plan:sumRange(con.gp), actual:sumRange(con.act_gp) },
      { key:'opex',     label:'Total operating costs', kind:'cost',               plan:sumRange(con.opex), actual:actTotOpex, note:'staff + overheads + shared' },
      { key:'ebitda',   label:'EBITDA',                kind:'profit',  bold:true, highlight:true, plan:sumRange(con.ebitda), actual:sumRange(con.act_ebitda) },
      { key:'interest', label:'Finance costs',         kind:'cost',               plan:sumRange(con.interest), actual:sumRange(con.interest), note:'from loan terms — not a plan/actual figure' },
      { key:'nbt',      label:'Profit before tax',     kind:'profit',  bold:true, plan:sumRange(con.nbt),  actual:sumRange(con.act_nbt) },
      { key:'tax',      label:'Tax',                   kind:'cost',               plan:sumRange(con.tax),  actual:sumRange(con.act_tax) },
      { key:'npat',     label:'Profit for the period', kind:'profit',  bold:true, highlight:true, plan:sumRange(con.npat), actual:sumRange(con.act_npat) },
    ]
  }

  // Favourable variance: for a cost, spending LESS than plan is good; for
  // revenue/profit, EARNING more is good. Positive => favourable (green).
  const favVar = (kind:Kind, plan:number, actual:number) => kind==='cost' ? (plan - actual) : (actual - plan)
  const favColor = (f:number) => f > 0.5 ? C.green : f < -0.5 ? C.red : C.slate
  const costDisp = (v:number) => `(${fmtFull(Math.abs(v), cc)})`
  const signMoney = (v:number) => `${v>=0?'+':'−'}${fmtFull(Math.abs(v), cc)}`
  const signPct  = (v:number) => `${v>=0?'+':'−'}${pct(Math.abs(v))}`
  const valDisp = (kind:Kind, v:number) => kind==='cost' ? costDisp(v) : fmtFull(v, cc)

  const periods: [string,string][] = [['month','This month'],['quarter','Quarter'],['ytd','Year to date']]
  const headlineKeys = view==='unit' ? ['rev','cogs','gp','ebitda'] : ['rev','cogs','gp','ebitda']
  const headlineRows = headlineKeys.map(k => rows.find(r=>r.key===k)).filter(Boolean) as StmtRow[]

  const th: React.CSSProperties = { padding:'8px 10px', textAlign:'right', fontWeight:600, fontSize:'0.8rem' }

  return (
    <div>
      {/* Unit selector (unit view only) -- mirrors the Statement view control */}
      {view==='unit' && (
        <div style={{display:'flex',gap:'0.45rem',marginBottom:'1rem',flexWrap:'wrap'}}>
          {config.business_units.filter((u:any)=>u.active).map((u:any)=>(
            <button key={u.id} style={{fontFamily:'monospace',fontSize:'0.8rem',padding:'0.45rem 0.85rem',
              border:`2px solid ${selUnit===u.id?(u.color||C.cyan):C.border}`,borderRadius:4,
              background:selUnit===u.id?(u.color||C.cyan):C.white,
              color:selUnit===u.id?'var(--cv-on-accent)':C.navy,cursor:'pointer'}}
              onClick={()=>setSelUnit(u.id)}>{u.name}</button>
          ))}
        </div>
      )}

      {/* Period selector */}
      <div style={{display:'flex',alignItems:'center',gap:'0.75rem',flexWrap:'wrap',marginBottom:'1.1rem'}}>
        <div style={{display:'inline-flex',border:`1px solid ${C.border}`,borderRadius:6,overflow:'hidden'}}>
          {periods.map(([id,label])=>(
            <button key={id} onClick={()=>setPeriod(id as any)}
              style={{fontFamily:'monospace',fontSize:'0.8rem',padding:'0.42rem 0.9rem',border:'none',cursor:'pointer',
                background:period===id?'var(--cv-header)':C.white,color:period===id?'var(--cv-on-accent)':C.slate,
                fontWeight:period===id?700:400}}>{label}</button>
          ))}
        </div>
        <span style={{fontSize:'0.8rem',color:C.slate}}>Comparing plan vs actual over <strong style={{color:C.navy}}>{rangeLabel}</strong></span>
      </div>

      {/* Headline strip */}
      <div style={{...kpiGrid,marginBottom:'1.25rem'}}>
        {headlineRows.map(r=>{
          const actual = r.actual ?? 0
          const f = favVar(r.kind, r.plan, actual)
          const fp = r.plan!==0 ? f/Math.abs(r.plan) : 0
          const col = favColor(f)
          return (
            <div key={r.key} style={{background:C.white,borderRadius:14,padding:'1.1rem 1.25rem 1.2rem',borderTop:`3px solid ${col}`,boxShadow:'0 1px 2px var(--cv-shadow-1), 0 12px 32px var(--cv-shadow-2)'}}>
              <div style={{fontFamily:'monospace',fontSize:'0.8rem',letterSpacing:'0.13em',color:C.slate,textTransform:'uppercase',marginBottom:'0.4rem'}}>{r.label} vs plan</div>
              <div style={{fontFamily:'Georgia,serif',fontSize:'1.5rem',fontWeight:700,color:C.navy,lineHeight:1.05}}>{r.actual===null?'—':valDisp(r.kind, actual)}</div>
              <div style={{fontSize:'0.8rem',marginTop:'0.35rem',color:col,fontWeight:600}}>
                {r.actual===null?'no actual yet':`${signMoney(f)} · ${signPct(fp)}`}
              </div>
              <div style={{fontSize:'0.72rem',color:C.slate,marginTop:'0.12rem'}}>plan {valDisp(r.kind, r.plan)}</div>
            </div>
          )
        })}
      </div>

      {/* Variance table */}
      <div style={{...card,padding:0,overflow:'hidden'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.85rem 1.1rem',borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontFamily:'Georgia,serif',fontSize:'0.95rem',fontWeight:700,color:C.navy}}>
            {view==='unit' ? `${config.business_units.find((u:any)=>u.id===selUnit)?.name} — Plan vs Actual` : `${config.business_name} — Consolidated Plan vs Actual`}
          </div>
          <div style={{fontSize:'0.8rem',color:C.slate}}>{rangeLabel}</div>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.86rem'}}>
            <thead>
              <tr style={{background:'var(--cv-header)',color:'var(--cv-on-accent)'}}>
                <th style={{padding:'8px 10px',textAlign:'left',fontWeight:600,fontSize:'0.8rem'}}>Line</th>
                <th style={th}>Plan</th>
                <th style={th}>Actual</th>
                <th style={th}>Variance</th>
                <th style={th}>Var %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r,ri)=>{
                const hasActual = r.actual !== null
                const actual = r.actual ?? 0
                const f = favVar(r.kind, r.plan, actual)
                const fp = r.plan!==0 ? f/Math.abs(r.plan) : 0
                const col = favColor(f)
                const canDrill = !!r.drill
                const open = canDrill && expanded[r.key]
                const bg = r.highlight?'var(--cv-tint-cyan)':r.bold?C.lightBg:(ri%2===0?C.cream:C.white)
                const lines = open ? drillLines(r.drill as string) : []
                // Biggest unfavourable driver within the group (most negative
                // favourable variance, and only if it is genuinely unfavourable).
                let worstId = ''; let worstF = 0
                lines.forEach(l=>{ if(l.actual!==null){ const lf=favVar(l.kind,l.plan,l.actual); if(lf<worstF){worstF=lf;worstId=l.id} } })
                return (
                  <React.Fragment key={r.key}>
                    <tr style={{background:bg,cursor:canDrill?'pointer':'default'}} onClick={canDrill?()=>toggle(r.key):undefined}>
                      <td style={{padding:'8px 10px',fontWeight:r.bold?700:400,color:C.navy,minWidth:200,fontSize:'0.86rem'}}>
                        {canDrill && <span style={{display:'inline-block',width:14,color:C.slate}}>{open?'▾':'▸'}</span>}
                        {r.label}
                        {r.note && <span style={{fontSize:'0.72rem',color:C.slate,marginLeft:6,fontWeight:400}}>{r.note}</span>}
                      </td>
                      <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace',fontSize:'0.86rem',color:C.navy,fontWeight:r.bold?700:400}}>{valDisp(r.kind, r.plan)}</td>
                      <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace',fontSize:'0.86rem',color:C.navy,fontWeight:r.bold?700:400}}>{hasActual?valDisp(r.kind, actual):'—'}</td>
                      <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace',fontSize:'0.86rem',color:col,fontWeight:700}}>{hasActual?signMoney(f):'—'}</td>
                      <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace',fontSize:'0.86rem',color:col,fontWeight:600}}>{hasActual?signPct(fp):'—'}</td>
                    </tr>
                    {open && lines.length===0 && (
                      <tr style={{background:C.white}}><td colSpan={5} style={{padding:'6px 10px 6px 30px',fontSize:'0.8rem',color:C.slate}}>No component lines.</td></tr>
                    )}
                    {open && lines.map(l=>{
                      const lHas = l.actual !== null
                      const lAct = l.actual ?? 0
                      const lf = favVar(l.kind, l.plan, lAct)
                      const lfp = l.plan!==0 ? lf/Math.abs(l.plan) : 0
                      const lcol = favColor(lf)
                      return (
                        <tr key={r.key+'/'+l.id} style={{background:'var(--cv-bg-2)'}}>
                          <td style={{padding:'6px 10px 6px 34px',fontSize:'0.86rem',color:C.slate}}>
                            {l.name}
                            {l.id===worstId && <span style={{fontFamily:'monospace',fontSize:'0.72rem',padding:'0.05rem 0.35rem',borderRadius:4,background:C.red,color:'var(--cv-on-accent)',marginLeft:6}}>biggest driver</span>}
                          </td>
                          <td style={{padding:'6px 10px',textAlign:'right',fontFamily:'monospace',fontSize:'0.8rem',color:C.slate}}>{valDisp(l.kind, l.plan)}</td>
                          <td style={{padding:'6px 10px',textAlign:'right',fontFamily:'monospace',fontSize:'0.8rem',color:C.slate}}>{lHas?valDisp(l.kind, lAct):'—'}</td>
                          <td style={{padding:'6px 10px',textAlign:'right',fontFamily:'monospace',fontSize:'0.8rem',color:lHas?lcol:C.slate,fontWeight:600}}>{lHas?signMoney(lf):'—'}</td>
                          <td style={{padding:'6px 10px',textAlign:'right',fontFamily:'monospace',fontSize:'0.8rem',color:lHas?lcol:C.slate}}>{lHas?signPct(lfp):'—'}</td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{padding:'0.6rem 1.1rem',borderTop:`1px solid ${C.border}`,fontSize:'0.72rem',color:C.slate,lineHeight:1.5}}>
          Costs shown in (parentheses). Green = favourable (more revenue or less cost than plan); red = unfavourable. Lines with no recorded actual show a dash — never a fabricated figure.
        </div>
      </div>
    </div>
  )
}

function PLTab({config,result,months,cc,P,closedPeriods}) {
  const [plMode, setPlMode] = useState<'statement'|'variance'>('statement')
  const [viewMode, setViewMode] = useState<'unit'|'consolidated'|'margins'>('unit')
  const [selUnit, setSelUnit] = useState(config.business_units.find(u=>u.active)?.id||'')
  // Per-line actuals for the Plan vs Actual drill-down. Loaded the same way
  // the top-level hybrid P&L loads generic_actuals (line_values combined with
  // field_line_values via combinedActual), but keyed by [unit][monthIndex]
  // [lineId] so a period-bounded sum is trivial and reconciles with the
  // engine's act_* arrays. Reading only -- no calculation change.
  const [lineActuals, setLineActuals] = useState<Record<string, Record<number, Record<string, number>>>>({})
  useEffect(() => {
    const clientId = config?.client_id
    if (!clientId) return
    supabase.from('generic_actuals').select('unit_id,period,line_values,field_line_values')
      .eq('client_id', clientId)
      .then(({data, error}) => {
        if (error) { console.error('Failed to load generic_actuals for P&L variance drill-down:', error); return }
        const start = new Date(config.start_date)
        const map: Record<string, Record<number, Record<string, number>>> = {}
        ;(data||[]).forEach((row:any) => {
          const lv = row.line_values || {}
          const flv = row.field_line_values || {}
          const ids = new Set([...Object.keys(lv), ...Object.keys(flv)])
          if (ids.size === 0) return
          const d = new Date(row.period)
          const mIdx = (d.getUTCFullYear()-start.getUTCFullYear())*12 + (d.getUTCMonth()-start.getUTCMonth())
          if (mIdx < 0) return
          if (!map[row.unit_id]) map[row.unit_id] = {}
          if (!map[row.unit_id][mIdx]) map[row.unit_id][mIdx] = {}
          ids.forEach(id => { map[row.unit_id][mIdx][id] = (map[row.unit_id][mIdx][id]||0) + combinedActual(id, lv, flv) })
        })
        setLineActuals(map)
      })
  }, [config?.client_id, config?.start_date])

  if (!result) return <div style={card}><p style={{color:C.slate}}>Set up your planning data first.</p></div>
  const varView: 'unit'|'consolidated' = viewMode==='consolidated' ? 'consolidated' : 'unit'

  // Which month indices correspond to a CLOSED period -- distinct from
  // "has actual data" (actualMask below). A month can have actual data
  // and still be open/live; once closed, it's final.
  // docs/ACCOUNTING_ARCHITECTURE.md section 5.
  const closedMask: boolean[] = months.map((_:string, i:number) =>
    closedPeriods?.has(periodForMonthIndex(config.start_date, i)) ?? false
  )

  // hybridRow (per-row independent actual/plan blending) was removed
  // here. It let each row (Revenue, Cost, GP, EBITDA...) decide actual
  // vs plan independently, which could show some rows as actual and
  // others as plan within the SAME month's column -- not a real
  // accounting practice, and not what a Budget vs Actual comparison
  // does. Replaced with a single per-month completeness signal
  // (periodIsActual, derived from act_ebitda/act_gp) applied uniformly
  // to every row, so a period is either entirely actual or entirely
  // plan, never a blend.

  return (
    <div>
      {/* View-mode toggle: Statement (unchanged) vs Plan vs Actual variance */}
      <div style={{display:'inline-flex',border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden',marginBottom:'1.1rem'}}>
        {([['statement','Statement'],['variance','Plan vs Actual']] as [string,string][]).map(([id,label])=>(
          <button key={id} onClick={()=>setPlMode(id as any)}
            style={{fontFamily:'monospace',fontSize:'0.86rem',padding:'0.55rem 1.3rem',border:'none',cursor:'pointer',
              background:plMode===id?C.cyan:C.white,color:plMode===id?C.navy:C.slate,fontWeight:plMode===id?700:400}}>{label}</button>
        ))}
      </div>

      <div style={{display:'flex',gap:'0.5rem',marginBottom:'1.25rem'}}>
        <button style={{fontFamily:'monospace',fontSize:'0.86rem',padding:'0.5rem 1.1rem',border:'none',
          background:viewMode==='unit'?'var(--cv-header)':C.white,color:viewMode==='unit'?'var(--cv-on-accent)':C.slate,
          borderRadius:4,cursor:'pointer',fontWeight:viewMode==='unit'?700:400}}
          onClick={()=>setViewMode('unit')}>By Business Unit</button>
        <button style={{fontFamily:'monospace',fontSize:'0.86rem',padding:'0.5rem 1.1rem',border:'none',
          background:viewMode==='consolidated'?'var(--cv-header)':C.white,color:viewMode==='consolidated'?'var(--cv-on-accent)':C.slate,
          borderRadius:4,cursor:'pointer',fontWeight:viewMode==='consolidated'?700:400}}
          onClick={()=>setViewMode('consolidated')}>Consolidated</button>
        {plMode==='statement' && (
          <button style={{fontFamily:'monospace',fontSize:'0.86rem',padding:'0.5rem 1.1rem',border:'none',
            background:viewMode==='margins'?'var(--cv-header)':C.white,color:viewMode==='margins'?'var(--cv-on-accent)':C.slate,
            borderRadius:4,cursor:'pointer',fontWeight:viewMode==='margins'?700:400}}
            onClick={()=>setViewMode('margins')}>Margins & Break-Even</button>
        )}
      </div>

      {plMode==='variance' && (
        <PLVarianceView config={config} result={result} months={months} cc={cc}
          view={varView} selUnit={selUnit} setSelUnit={setSelUnit} lineActuals={lineActuals}/>
      )}

      {plMode==='statement' && viewMode==='margins' && <MarginsTab config={config} result={result} months={months} cc={cc}/>}

      {plMode==='statement' && viewMode==='unit' && (() => {
        const pl = result.unitPL[selUnit]
        if (!pl) return <div style={card}><p style={{color:C.slate}}>No data for this unit.</p></div>
        // One signal per month for this unit, under the calendar rule: a
        // past/current month is actual, a future month is plan -- the
        // WHOLE column switches together, never some rows actual and
        // others plan in the same period. pl.act_ebitda[m] !== null is
        // correct by construction as that signal: under the calendar
        // rule act_ebitda is non-null for exactly the past/current
        // months (see generic-engine.ts).
        const periodIsActual: boolean[] = pl.act_ebitda.map(v => v !== null)
        // Every row must use the SAME actual-or-zero treatment for a
        // past/current period -- act_gp/act_ebitda already compute this
        // correctly internally (?? 0 baked into the engine's own
        // calculation), but the RAW act_rev/act_cogs arrays are still
        // null whenever nothing was entered for that specific category
        // this month, even in a past/current period. Passing them to
        // applyPeriodActual without ?? 0 meant Revenue could fall back
        // to the PLANNED figure (since its own actual was null) in the
        // very same column where GP/EBITDA showed the actual-derived
        // figure (zero) -- recreating the exact mixing bug this tab
        // exists to prevent, just relocated to Revenue/Cost of Sales
        // instead of Staff/Overheads.
        const revValues    = applyPeriodActual(pl.rev, pl.act_rev.map(v => v ?? 0), periodIsActual)
        const cogsValues   = applyPeriodActual(pl.cogs, pl.act_cogs.map(v => v ?? 0), periodIsActual)
        const gpValues     = applyPeriodActual(pl.gp, pl.act_gp, periodIsActual)
        const staffValues  = applyPeriodActual(pl.staff, pl.act_staff.map(v => v ?? 0), periodIsActual)
        const opexValues   = applyPeriodActual(pl.opex, pl.act_opex.map(v => v ?? 0), periodIsActual)
        const ebitdaValues = applyPeriodActual(pl.ebitda, pl.act_ebitda, periodIsActual)
        const rows = [
          {label:'Revenue',values:revValues,bold:true,actualMask:periodIsActual},
          {label:'Cost of Sales',values:cogsValues,negate:true,actualMask:periodIsActual},
          {label:'Gross Profit',values:gpValues,bold:true,highlight:true,actualMask:periodIsActual},
          {label:'Staff Costs',values:staffValues,negate:true,actualMask:periodIsActual},
          {label:'Direct Overheads',values:opexValues,negate:true,actualMask:periodIsActual},
          // Shared Costs always uses its planned/allocated value even in
          // an actual period -- that allocation is an internal planning
          // mechanism (headcount/revenue-share split of a pooled cost)
          // with no independent actual-tracking source of its own. Still
          // marked with the same period-level signal as every other row,
          // so the whole column reads as one consistent period, not a
          // mix.
          {label:'Shared Costs',values:pl.shared,negate:true,actualMask:periodIsActual},
          {label:'EBITDA',values:ebitdaValues,bold:true,highlight:true,actualMask:periodIsActual},
        ]
        // The summary cards below MUST be built from these exact same
        // hybrid arrays, not the engine's pl.ann_rev/ann_gp/ann_ebitda
        // (which are pure planned-only sums, computed once and never
        // touched by any actual data). Using the stale planned totals
        // here produced a real, visible bug: Annual Revenue showed a
        // modest planned figure while Gross Profit/EBITDA showed a
        // wildly different, much larger negative figure -- two
        // completely different data sources on the same screen, driven
        // by a single corrupted planning cell that only reached the
        // GP/EBITDA sums, not the revenue sum. Summing the displayed
        // rows instead guarantees the cards can never diverge from the
        // table above them, because they're the same numbers.
        const sum = (arr: number[]) => arr.reduce((s, v) => s + v, 0)
        const hybridAnnRev = sum(revValues)
        const hybridAnnGp = sum(gpValues)
        const hybridAnnEbitda = sum(ebitdaValues)
        const hybridAnnStaff = sum(staffValues)
        return (
          <div>
            <div style={{display:'flex',gap:'0.45rem',marginBottom:'1.25rem',flexWrap:'wrap'}}>
              {config.business_units.filter(u=>u.active).map(u=>(
                <button key={u.id} style={{fontFamily:'monospace',fontSize:'0.8rem',padding:'0.45rem 0.85rem',
                  border:`2px solid ${selUnit===u.id?(u.color||C.cyan):C.border}`,borderRadius:4,
                  background:selUnit===u.id?(u.color||C.cyan):C.white,
                  color:selUnit===u.id?'var(--cv-on-accent)':C.navy,cursor:'pointer'}}
                  onClick={()=>setSelUnit(u.id)}>
                  {u.name}
                </button>
              ))}
            </div>
            <div style={{...kpiGrid,marginBottom:'1.25rem'}}>
              <KPI label="Annual Revenue" value={fmtFull(hybridAnnRev,cc)}/>
              <KPI label="Gross Profit" value={fmtFull(hybridAnnGp,cc)} sub={pct(hybridAnnRev>0?hybridAnnGp/hybridAnnRev:0)} color={hybridAnnGp>=0?C.green:C.red}/>
              <KPI label="EBITDA" value={fmtFull(hybridAnnEbitda,cc)} sub={pct(hybridAnnRev>0?hybridAnnEbitda/hybridAnnRev:0)} color={hybridAnnEbitda>=0?C.teal:C.red}/>
              <KPI label="Staff Cost %" value={pct(hybridAnnRev>0?hybridAnnStaff/hybridAnnRev:0)} sub={`${pl.staff_efficiency.headcount} staff`} color={C.amber}/>
            </div>
            <PLTableCollapsible title={`${config.business_units.find(u=>u.id===selUnit)?.name} — P&L`} rows={rows} months={months} startDate={config.start_date} cc={cc} showExport closedMask={closedMask}/>
          </div>
        )
      })()}

      {plMode==='statement' && viewMode==='consolidated' && (() => {
        // buildHybridConsolidated is the single source of truth for
        // turning the consolidated P&L into hybrid (actual-or-plan, per
        // the calendar rule) arrays -- also used by the Annual tab, so
        // both can't silently diverge the way they did before (Annual
        // Revenue vs Gross Profit reading from two different sources).
        const { periodIsActual, rev: revValues, cogs: cogsValues, gp: gpValues, opex: opexValues,
                ebitda: ebitdaValues, nbt: nbtValues, tax: taxValues, npat: npatValues } = buildHybridConsolidated(result.con)
        const rows = [
          {label:'Revenue',values:revValues,bold:true,actualMask:periodIsActual},
          {label:'Cost of Sales',values:cogsValues,negate:true,actualMask:periodIsActual},
          {label:'Gross Profit',values:gpValues,bold:true,highlight:true,actualMask:periodIsActual},
          {label:'Total Operating Costs',values:opexValues,negate:true,actualMask:periodIsActual},
          {label:'EBITDA',values:ebitdaValues,bold:true,highlight:true,actualMask:periodIsActual},
          {label:'Interest',values:result.con.interest,negate:true},
          {label:'Net Profit Before Tax',values:nbtValues,bold:true,actualMask:periodIsActual},
          {label:'Tax',values:taxValues,negate:true,actualMask:periodIsActual},
          {label:'Net Profit After Tax',values:npatValues,bold:true,highlight:true,actualMask:periodIsActual},
        ]
        return <PLTableCollapsible title={`${config.business_name} — Consolidated P&L`} rows={rows} months={months} startDate={config.start_date} cc={cc} showExport closedMask={closedMask}/>
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
          <button key={id} style={{fontFamily:'monospace',fontSize:'0.86rem',padding:'0.5rem 1rem',
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
              <div style={{fontSize:'0.92rem',color:C.slate,lineHeight:1.7}}>
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
                  <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.86rem'}}>
                    <thead>
                      <tr style={{background:'var(--cv-header)',color:'var(--cv-on-accent)'}}>
                        {['Revenue Line','Break-Even Revenue','Current Revenue','Gap / Surplus','Variable Cost %'].map(h=>(
                          <th key={h} style={{padding:'8px 10px',textAlign:'left',fontWeight:600,fontSize:'0.86rem'}}>{h}</th>
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
            <p style={{color:C.slate,fontSize:'0.92rem'}}>No spread lines defined. In Planning, add a revenue line and set its type to "Spread" to track buy price, sell price, and margin per unit.</p>
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
                <PLTableCollapsible title="" rows={[
                  {label:'Volume (units)',values:s.volume},
                  {label:'Buy Price',values:s.buy_price,aggregation:'endOfPeriod'},
                  {label:'Sell Price',values:s.sell_price,aggregation:'endOfPeriod'},
                  {label:'Spread per Unit',values:s.spread_per_unit,highlight:true,aggregation:'endOfPeriod'},
                  {label:'Total Spread Revenue',values:s.total_spread,bold:true},
                ]} months={months} startDate={config.start_date} cc={cc} showExport/>
              </div>
            ))}
          </div>
        )
      })()}

      {section==='service' && (() => {
        const allMargins = result.allocUnits.flatMap(u => result.unitPL[u.id]?.service_margins||[])
        if (allMargins.length===0) return (
          <div style={card}>
            <p style={{color:C.slate,fontSize:'0.92rem'}}>No service fee lines defined. In Planning, add a revenue line and set its type to "Service Fee" to track fee, cost of delivery, and margin per engagement.</p>
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
                <PLTableCollapsible title="" rows={[
                  {label:'Engagements',values:s.engagements},
                  {label:'Fee per Engagement',values:s.fee,aggregation:'endOfPeriod'},
                  {label:'Cost per Engagement',values:s.cost,negate:true,aggregation:'endOfPeriod'},
                  {label:'Margin per Engagement',values:s.margin.map((mv,i)=>s.engagements[i]>0?mv/s.engagements[i]:0),highlight:true,aggregation:'endOfPeriod'},
                  {label:'Total Margin',values:s.margin,bold:true},
                ]} months={months} startDate={config.start_date} cc={cc} showExport/>
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
              <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.86rem'}}>
                <thead>
                  <tr style={{background:'var(--cv-header)',color:'var(--cv-on-accent)'}}>
                    {['Unit','Headcount','Revenue','Staff Cost','Revenue/Head','Staff Cost %'].map(h=>(
                      <th key={h} style={{padding:'8px 10px',textAlign:'left',fontWeight:600,fontSize:'0.86rem'}}>{h}</th>
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
          <PLTableCollapsible title="Staff Cost Trend" rows={[
            {label:'Total Staff Costs',values:result.allocUnits.reduce((acc,u)=>{
              const pl = result.unitPL[u.id]
              return pl ? acc.map((v,m2)=>v+pl.staff[m2]) : acc
            },Array(months.length).fill(0)),bold:true},
          ]} months={months} startDate={config.start_date} cc={cc} showExport/>
        </div>
      )}
    </div>
  )
}

// Delegated categorization review queue: costs an operator recorded in
// the field app that didn't match any existing cost line -- described
// freely instead. A coach assigns each one to a real plan line here,
// which promotes it into a genuine field_transactions row (so it flows
// into the normal actuals aggregation) rather than it sitting outside
// the numbers indefinitely.
function UncategorizedCostsSection({config,P}:{config:GenericModelConfig;P:any}) {
  const [pending, setPending] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [categorizingId, setCategorizingId] = useState<string|null>(null)
  const [chosenLineId, setChosenLineId] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/field/admin/uncategorized-costs?client_id=${encodeURIComponent(config.client_id)}`)
      const data = await res.json()
      if (res.ok) setPending(data.pendingCosts||[])
    } catch { /* leave list as-is; shows empty rather than a broken page */ }
    setLoading(false)
  }
  useEffect(()=>{ load() },[config.client_id])

  const unitName = (id: string) => config.business_units.find(u=>u.id===id)?.name || id
  const costLinesForUnit = (unitId: string) => config.plan_lines.filter(l=>l.unit_id===unitId&&l.active&&(l.category==='direct_opex'||l.category==='cost_of_sales'))

  async function categorize(cost: any) {
    if (!chosenLineId) { alert('Select a plan line first.'); return }
    const line = config.plan_lines.find(l=>l.id===chosenLineId)
    if (!line) return
    setSaving(true)
    try {
      const res = await fetch('/api/field/admin/uncategorized-costs', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ uncategorized_cost_id: cost.id, plan_line_id: line.id, plan_line_name: line.name, category: line.category, categorized_by: P.fullName }),
      })
      const data = await res.json()
      if (res.ok) { setCategorizingId(null); setChosenLineId(''); await load() }
      else alert(data.error || 'Could not categorize this cost.')
    } catch {
      alert('No connection -- could not categorize this cost. Please try again.')
    }
    setSaving(false)
  }

  return (
    <div style={card}>
      <div style={secH}>Needs Categorizing</div>
      <p style={{fontSize:'0.92rem',color:C.slate,marginBottom:'1rem',lineHeight:1.6}}>
        Costs recorded in the field app that didn't match any existing cost line -- an operator described what happened,
        and it's waiting for you to assign it to the right category. Until then, it isn't counted in any financial statement.
      </p>
      {loading ? (
        <p style={{color:C.slate,fontSize:'0.92rem'}}>Loading...</p>
      ) : pending.length===0 ? (
        <p style={{color:C.slate,fontSize:'0.92rem'}}>Nothing waiting -- every field-recorded cost has a category.</p>
      ) : (
        pending.map(cost=>(
          <div key={cost.id} style={{background:C.cream,border:`1px solid ${C.amber}`,borderRadius:8,padding:'0.85rem 1rem',marginBottom:'0.6rem'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'0.5rem'}}>
              <div>
                <div style={{fontWeight:700,fontSize:'0.9rem',color:C.navy}}>{cost.description}</div>
                <div style={{fontSize:'0.86rem',color:C.slate,marginTop:'0.15rem'}}>{unitName(cost.business_unit_id)} · {cost.transaction_date}</div>
              </div>
              <div style={{fontFamily:'monospace',fontWeight:700,fontSize:'0.95rem',color:C.red,whiteSpace:'nowrap'}}>{fmt(cost.amount,config.currency)}</div>
            </div>
            {categorizingId===cost.id ? (
              <div style={{display:'flex',gap:'0.5rem',marginTop:'0.6rem'}}>
                <select style={{flex:1,padding:'0.4rem 0.5rem',border:`1px solid ${C.border}`,borderRadius:4,fontSize:'0.86rem'}} value={chosenLineId} onChange={e=>setChosenLineId(e.target.value)}>
                  <option value="">Select the right category...</option>
                  {costLinesForUnit(cost.business_unit_id).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <button type="button" disabled={saving} style={addBtn(true)} onClick={()=>categorize(cost)}>{saving?'Saving...':'Confirm'}</button>
                <button type="button" style={addBtn(true,C.slate)} onClick={()=>{setCategorizingId(null);setChosenLineId('')}}>Cancel</button>
              </div>
            ) : (
              <button type="button" style={{marginTop:'0.6rem',padding:'0.4rem 0.75rem',background:'transparent',color:C.teal,border:`1px solid ${C.teal}`,borderRadius:6,fontSize:'0.86rem',cursor:'pointer',fontWeight:600}} onClick={()=>setCategorizingId(cost.id)}>
                Categorize
              </button>
            )}
          </div>
        ))
      )}
    </div>
  )
}

// ── ACTUALS & WORKING CAPITAL TAB (toggle between two existing components) ──
// Rounded "subtab pill" mode switcher (cyan active pill), matching the
// Intelligence tab's section pills and the approved mockup .subtab style.
function subtabPill(active: boolean): React.CSSProperties {
  return {fontFamily:'monospace',fontSize:'0.8rem',padding:'0.42rem 0.85rem',
    border:`1px solid ${active?C.cyan:C.border}`,borderRadius:8,
    background:active?C.cyan:C.white,color:active?C.navy:C.slate,
    cursor:'pointer',fontWeight:active?700:400,whiteSpace:'nowrap',
    display:'inline-flex',alignItems:'center',gap:'0.4rem'}
}

function ActualsAndWorkingCapitalTab({config,result,months,cc,P,onSave,onCloseStatusChanged}) {
  const [mode, setMode] = useState<'actuals'|'workingcapital'|'uncategorized'>('actuals')
  // Count of field-recorded costs still needing a category -- surfaced as a
  // small badge on the "Needs Categorizing" pill. Read-only: fetching the
  // count here does not change UncategorizedCostsSection's own behaviour.
  const [uncatCount, setUncatCount] = useState(0)
  useEffect(()=>{
    let active = true
    fetch(`/api/field/admin/uncategorized-costs?client_id=${encodeURIComponent(config.client_id)}`)
      .then(r=>r.ok?r.json():{pendingCosts:[]})
      .then(d=>{ if(active) setUncatCount((d.pendingCosts||[]).length) })
      .catch(()=>{})
    return ()=>{ active=false }
  },[config.client_id])
  return (
    <div>
      <div style={{display:'flex',gap:'0.4rem',marginBottom:'1.25rem',overflowX:'auto'}}>
        <button style={subtabPill(mode==='actuals')} onClick={()=>setMode('actuals')}>Monthly Actuals</button>
        <button style={subtabPill(mode==='workingcapital')} onClick={()=>setMode('workingcapital')}>Working Capital · Trade Credit</button>
        <button style={subtabPill(mode==='uncategorized')} onClick={()=>setMode('uncategorized')}>
          Needs Categorizing
          {uncatCount>0 && <b style={{color:mode==='uncategorized'?C.navy:C.amber}}>{uncatCount}</b>}
        </button>
      </div>
      {mode==='actuals' && <ActualsTab config={config} months={months} cc={cc} P={P} onSave={onSave} onCloseStatusChanged={onCloseStatusChanged}/>}
      {mode==='workingcapital' && <WorkingCapitalTab config={config} result={result} months={months} cc={cc} P={P} onSave={onSave}/>}
      {mode==='uncategorized' && <UncategorizedCostsSection config={config} P={P}/>}
    </div>
  )
}
// ── APPROVALS & SPEND REQUESTS TAB (toggle, reuses existing components) ──
function ApprovalsAndSpendTab({clientId,config,cc,P}) {
  const [mode, setMode] = useState<'approvals'|'requests'>('approvals')
  return (
    <div>
      <div style={{display:'flex',gap:'0.4rem',marginBottom:'1.4rem',flexWrap:'wrap'}}>
        <button style={subtabPill(mode==='approvals')} onClick={()=>setMode('approvals')}>Approvals</button>
        <button style={subtabPill(mode==='requests')} onClick={()=>setMode('requests')}>My Spend Requests</button>
      </div>
      {mode==='approvals' && <ApprovalsTab clientId={clientId} config={config} cc={cc} P={P}/>}
      {mode==='requests' && <SpendRequestsTab clientId={clientId} config={config} cc={cc} P={P}/>}
    </div>
  )
}
// ── SETTINGS & ADMIN TAB (Settings + Scenarios + Team merged, toggle) ──
function SettingsAndAdminTab({config,result,months,cc,clientId,P,onSave,theme,setThemeMode}) {
  const [mode, setMode] = useState<'settings'|'scenarios'|'team'|'catalogue'|'field'>('settings')
  return (
    <div>
      <div style={{display:'flex',gap:'0.4rem',marginBottom:'1.4rem',flexWrap:'wrap'}}>
        <button style={subtabPill(mode==='settings')} onClick={()=>setMode('settings')}>General Settings</button>
        <button style={subtabPill(mode==='scenarios')} onClick={()=>setMode('scenarios')}>Scenarios</button>
        <button style={subtabPill(mode==='team')} onClick={()=>setMode('team')}>Team</button>
        <button style={subtabPill(mode==='catalogue')} onClick={()=>setMode('catalogue')}>Catalogue</button>
        <button style={subtabPill(mode==='field')} onClick={()=>setMode('field')}>Clearview Field</button>
      </div>
      {mode==='settings' && <SettingsTab config={config} P={P} onSave={onSave} theme={theme} setThemeMode={setThemeMode}/>}
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

  // Collapsible year/month trend -- grouped by the events' own dates,
  // not the model's planning window, since a marketing event can happen
  // any time regardless of the plan's start/end. Reuses
  // computeCustomerGrowthSummary (already used for the whole-business
  // Liquidity Readiness figures) per period rather than a separate
  // aggregation formula.
  const eventsByYear: Record<string, any[]> = {}
  events.forEach((evt:any) => {
    if (!evt.date) return
    const year = String(new Date(evt.date).getUTCFullYear())
    if (!eventsByYear[year]) eventsByYear[year] = []
    eventsByYear[year].push(evt)
  })
  const eventYears = Object.keys(eventsByYear).sort()
  const eventTrendYears = eventYears.map(year => ({
    label: year, monthIndices: [], result: computeCustomerGrowthSummary(eventsByYear[year]),
  }))
  const eventTrendMonthsByYear: Record<string, any[]> = {}
  eventYears.forEach(year => {
    const byMonth: Record<string, any[]> = {}
    eventsByYear[year].forEach((evt:any) => {
      const monthLabel = new Date(evt.date).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })
      if (!byMonth[monthLabel]) byMonth[monthLabel] = []
      byMonth[monthLabel].push(evt)
    })
    const monthOrder = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    eventTrendMonthsByYear[year] = monthOrder.filter(m=>byMonth[m]).map(monthLabel => ({
      label: monthLabel, monthIndices: [], result: computeCustomerGrowthSummary(byMonth[monthLabel]),
    }))
  })

  return (
    <div>
      {eventYears.length>0 && (
        <ScoreTrendCard title="Marketing Events Trend" years={eventTrendYears} monthsByYear={eventTrendMonthsByYear} rows={[
          {label:'Customers Acquired', getValue:(r:any)=>r.totalCustomersAcquired, getColor:()=>C.navy},
          {label:'Blended CAC', getValue:(r:any)=>r.blendedCAC!==null?fmt(r.blendedCAC,cc):'N/A', getColor:()=>C.navy},
          {label:'Revenue Lift', getValue:(r:any)=>fmt(r.totalRevenueLift,cc), getColor:()=>C.green},
        ]}/>
      )}
      <div style={card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
          <div style={secH}>Customer Acquisition Cost by Channel</div>
          {P.canEditPlan&&<button style={addBtn()} onClick={()=>setShowForm(!showForm)}>+ Add Event</button>}
        </div>
        {channelRows.length===0 ? (
          <p style={{color:C.slate,fontSize:'0.92rem'}}>No promotion events recorded yet. Add one below to start tracking cost per customer acquired, by channel.</p>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.86rem'}}>
              <thead>
                <tr style={{background:'var(--cv-header)',color:'var(--cv-on-accent)'}}>
                  {['Channel','Events','Total Cost','Customers Acquired','Cost per Customer (CAC)','Revenue Lift'].map(h=>(
                    <th key={h} style={{padding:'8px 10px',textAlign:'left',fontWeight:600,fontSize:'0.86rem'}}>{h}</th>
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
            <p style={{fontSize:'0.8rem',color:C.slate,marginTop:'0.6rem'}}>Lower cost per customer means a more efficient channel. Channels with no customers recorded cannot be ranked -- add a customer count to each event to see this.</p>
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
                  <div style={{fontWeight:600,fontSize:'0.92rem',color:C.navy}}>{evt.name}</div>
                  <div style={{fontSize:'0.8rem',color:C.slate}}>{evt.date} · {evt.channel||'No channel set'}</div>
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
    <div style={{background:'var(--cv-tint-cyan)',borderRadius:6,padding:'0.85rem 1rem',marginBottom:'1.25rem',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.75rem'}}>
      <div>
        <div style={{fontWeight:700,fontSize:'0.92rem',color:C.navy}}>Investment Pitch Summary</div>
        <div style={{fontSize:'0.86rem',color:C.slate}}>A one-page Word document with the financial summary and scores, ready to send to a lender or investor.</div>
      </div>
      <button style={solidBtn('var(--cv-header)')} disabled={downloading} onClick={download}>
        {downloading ? 'Generating...' : 'Download Word Document'}
      </button>
      {error && (
        <div style={{width:'100%',background:'var(--cv-tint-red)',border:`2px solid ${C.red}`,borderRadius:6,padding:'0.85rem 1rem',marginTop:'0.5rem'}}>
          <div style={{fontWeight:700,color:C.red,fontSize:'0.92rem',marginBottom:'0.3rem'}}>⚠ Could not generate the document</div>
          <div style={{color:C.red,fontSize:'0.86rem'}}>{error}</div>
        </div>
      )}
    </div>
  )
}

// Small "at a glance" position card (mockup ".kc"): a border-left accent,
// a monospace uppercase label, a serif value and a monospace descriptor.
// Shared by the Cash Flow and Balance Sheet tabs. Colours come from C tokens.
function GlanceCard({label,value,desc,accent,valueColor,descColor}:{label:string;value:string;desc?:React.ReactNode;accent:string;valueColor?:string;descColor?:string}) {
  return (
    <div style={{background:C.white,borderRadius:14,padding:'0.95rem 1.1rem',boxShadow:'0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-2)',borderLeft:`4px solid ${accent}`}}>
      <div style={{fontFamily:'monospace',fontSize:'0.8rem',letterSpacing:'0.08em',textTransform:'uppercase',color:C.slate,marginBottom:'0.35rem'}}>{label}</div>
      <div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:valueColor||C.navy,lineHeight:1.1}}>{value}</div>
      {desc&&<div style={{fontSize:'0.72rem',marginTop:'0.18rem',fontFamily:'monospace',color:descColor||C.slate,display:'flex',alignItems:'center',gap:'0.35rem'}}>{desc}</div>}
    </div>
  )
}

// Cash close series drawn as a solid line over the actuals and a dashed line
// over the projection, with an amber "today · projection starts" marker at the
// actual/plan boundary. No calculation -- it plots cf.close as the engine
// produced it. nowIdx is the last actual month (from cf.act_mask).
function CashProjectionChart({vals,months,nowIdx,minIdx,cc}:{vals:number[];months:string[];nowIdx:number;minIdx:number;cc:string}) {
  const n=vals.length
  if(!n) return null
  const W=680,H=200,padL=52,padR=14,padT=24,padB=26
  const maxV=Math.max(0,...vals), minV=Math.min(0,...vals), span=(maxV-minV)||1
  const x=(i:number)=> padL+(n<=1?0:(i/(n-1))*(W-padL-padR))
  const y=(v:number)=> padT+(1-(((v||0)-minV)/span))*(H-padT-padB)
  const pts=(from:number,to:number)=>{const a=[];for(let i=Math.max(0,from);i<=Math.min(n-1,to);i++)a.push(`${x(i).toFixed(1)},${y(vals[i]).toFixed(1)}`);return a.join(' ')}
  const nb=Math.max(0,Math.min(n-1,nowIdx))
  const short=(v:number)=>{const a=Math.abs(v);const s=v<0?'-':'';return a>=1e9?`${s}${(a/1e9).toFixed(1)}B`:a>=1e6?`${s}${(a/1e6).toFixed(0)}M`:a>=1e3?`${s}${(a/1e3).toFixed(0)}K`:`${Math.round(v)}`}
  const ticks=[minV,minV+span/2,maxV]
  const xi=Array.from(new Set([0,Math.round((n-1)/3),Math.round(2*(n-1)/3),n-1]))
  return (
    <div style={{overflowX:'auto'}}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{display:'block',minWidth:420}}>
        {ticks.map((t,i)=>(<g key={i}>
          <line x1={padL} y1={y(t)} x2={W-padR} y2={y(t)} style={{stroke:t===0?C.red:'var(--cv-border-soft)'}} strokeDasharray={t===0?'3 3':undefined} opacity={t===0?0.55:1}/>
          <text x={4} y={y(t)+3} fontSize="9" style={{fill:t===0?C.red:C.slate}} fontFamily="monospace">{short(t)}</text>
        </g>))}
        {/* today / projection-start marker at the actual/plan boundary */}
        <line x1={x(nb)} y1={padT-8} x2={x(nb)} y2={H-padB} style={{stroke:C.amber}} strokeDasharray="4 3" strokeWidth="1.5"/>
        <text x={x(nb)} y={padT-11} fontSize="8.5" style={{fill:C.amber}} fontFamily="monospace" textAnchor="middle">today · projection starts</text>
        {nb>0 && <polyline fill="none" style={{stroke:C.teal}} strokeWidth="2.5" points={pts(0,nb)}/>}
        {nb<n-1 && <polyline fill="none" style={{stroke:C.teal}} strokeWidth="2.5" strokeDasharray="6 4" points={pts(nb,n-1)}/>}
        {nb===n-1 && n===1 && <circle cx={x(0)} cy={y(vals[0])} r="3" style={{fill:C.teal}}/>}
        <circle cx={x(minIdx)} cy={y(vals[minIdx])} r="4" style={{fill:C.red}}/>
        <text x={x(minIdx)} y={y(vals[minIdx])+16} fontSize="9" style={{fill:C.red}} fontFamily="monospace" textAnchor="middle">{months[minIdx]||`M${minIdx+1}`} low</text>
        {xi.map(i=>(<text key={i} x={x(i)} y={H-7} fontSize="9" style={{fill:C.slate}} textAnchor="middle" fontFamily="monospace">{months[i]||`M${i+1}`}</text>))}
      </svg>
    </div>
  )
}

// ── CASH FLOW TAB ────────────────────────────────────────────
function CashFlowTab({config,result,months,cc,closedPeriods}) {
  if (!result) return <div style={card}><p style={{color:C.slate}}>Set up your planning data first.</p></div>
  const cf = result.cf
  // Values in cf.op_cash/net/open/close are ALREADY hybrid (the engine
  // substitutes actual NPAT where available -- see generic-engine.ts) --
  // act_mask just marks which months that reflects, for display.
  const closedMask: boolean[] = months.map((_:string, i:number) =>
    closedPeriods?.has(periodForMonthIndex(config.start_date, i)) ?? false
  )
  const rows = [
    {label:'Opening Cash',values:cf.open,bold:true,actualMask:cf.act_mask,aggregation:'startOfPeriod' as const},
    {label:'Net Profit After Tax',values:result.con.npat.map((v:number,i:number)=>result.con.act_npat[i]!==null?result.con.act_npat[i]:v),actualMask:cf.act_mask},
    {label:'Operating Cash Flow',values:cf.op_cash,bold:true,actualMask:cf.act_mask},
    {label:'Capital & Financing',values:cf.fin_cash},
    {label:'Fixed Asset Purchases',values:cf.inv_cash||Array(months.length).fill(0),negate:false},
    {label:'Net Change in Cash',values:cf.net,bold:true,actualMask:cf.act_mask},
    {label:'Closing Cash',values:cf.close,bold:true,highlight:true,actualMask:cf.act_mask,aggregation:'endOfPeriod' as const},
  ]
  const debt = result.debtSchedule
  const hasLoan = debt && debt.totalPrincipal.some((v:number)=>v>0)
  const loanRows = hasLoan ? [
    {label:'Interest',values:debt.totalInterest},
    {label:'Principal',values:debt.totalPrincipal},
    {label:'Total Debt Service',values:debt.totalRepayment,bold:true},
    {label:'Closing Loan Balance',values:debt.totalOutstanding,bold:true,highlight:true,aggregation:'endOfPeriod' as const},
  ] : []

  // "Today" = the last actual month (the actual/plan boundary the engine
  // already marks on every month via cf.act_mask). Everything after it is
  // projection. If no month is actual yet, treat month 1 as the boundary.
  const lastActualIdx = cf.act_mask.lastIndexOf(true)
  const nowIdx = lastActualIdx>=0 ? lastActualIdx : 0
  const warn = findCashWarningMonths(result, months)
  const minIdx = Math.max(0, Math.min(cf.close.length-1, (result.metrics.min_cash_month||1)-1))
  const minCash = result.metrics.min_cash
  const minLabel = months[minIdx] || `Month ${result.metrics.min_cash_month}`
  const cashNow = cf.close[nowIdx] ?? 0
  const cashNowLabel = months[nowIdx] || `Month ${nowIdx+1}`
  const projClose = cf.close[cf.close.length-1] ?? 0

  return (
    <div>
      <SectionLabel>Cash at a glance</SectionLabel>
      <div className="cv-grid-4">
        <GlanceCard label={`Cash now (${cashNowLabel})`} value={fmt(cashNow,cc)} desc={lastActualIdx>=0?'latest actual':'plan · no actuals yet'} accent={cashNow>=0?C.navy:C.red} valueColor={cashNow>=0?C.navy:C.red}/>
        <GlanceCard label="Projected low" value={fmt(minCash,cc)} desc={minLabel} accent={minCash>=0?C.teal:C.red} valueColor={minCash>=0?C.navy:C.red}/>
        <GlanceCard label="Months negative" value={String(warn.length)} desc="in the projection" accent={warn.length>0?C.red:C.green} valueColor={warn.length>0?C.red:C.green}/>
        <GlanceCard label="Projected closing" value={fmt(projClose,cc)} desc="end of plan" accent={C.teal} valueColor={projClose>=0?C.navy:C.red}/>
      </div>

      {warn.length>0 && (
        <div style={{marginTop:'1.1rem',background:'var(--cv-tint-red)',border:`1px solid ${C.red}`,borderLeft:`4px solid ${C.red}`,borderRadius:14,padding:'0.85rem 1.1rem',display:'flex',alignItems:'center',gap:'0.9rem',flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:220}}>
            <div style={{display:'flex',alignItems:'center',gap:'0.5rem',fontWeight:700,color:C.red,fontSize:'0.92rem'}}><span aria-hidden="true">&#9888;</span> Cash flow early warning</div>
            <div style={{fontSize:'0.92rem',color:C.navy,lineHeight:1.5,marginTop:'0.2rem'}}>The projection dips below zero, lowest <b>{fmt(minCash,cc)} in {minLabel}</b>, with <b>{warn.length} month{warn.length>1?'s':''}</b> at risk across the plan. Arrange working capital before then.</div>
          </div>
        </div>
      )}

      <div style={{...card,padding:0,overflow:'hidden',marginTop:'1.1rem'}}>
        <div style={{...cardHead,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.5rem'}}>
          <span>Cash balance over time</span>
          <span style={{display:'flex',gap:'1rem',fontSize:'0.8rem',color:C.slate,fontFamily:'monospace'}}>
            <span><span style={{display:'inline-block',width:22,borderTop:`2px solid ${C.teal}`,verticalAlign:'middle',marginRight:5}}/>Actual to date</span>
            <span><span style={{display:'inline-block',width:22,borderTop:`2px dashed ${C.teal}`,verticalAlign:'middle',marginRight:5}}/>Projected</span>
          </span>
        </div>
        <div style={{padding:'0.8rem 1rem 1rem'}}>
          <CashProjectionChart vals={cf.close} months={months} nowIdx={nowIdx} minIdx={minIdx} cc={cc}/>
        </div>
      </div>

      <p style={{fontSize:'0.8rem',color:C.slate,margin:'0 0 0.5rem',lineHeight:1.5}}>Green cells are posted actuals to date. Columns after {cashNowLabel} are projected.</p>
      <PLTableCollapsible title="Cash Flow Statement" rows={rows} months={months} startDate={config.start_date} cc={cc} showExport closedMask={closedMask}/>
      {hasLoan && <PLTableCollapsible title="Loan Repayment Schedule" rows={loanRows} months={months} startDate={config.start_date} cc={cc} showExport/>}
    </div>
  )
}

// ── BALANCE SHEET TAB ────────────────────────────────────────
// Year-end close, migrated out of the old separate Annual tab (removed
// entirely -- its other content, the annual KPI/Cash Flow/Balance Sheet
// figures, was purely redundant with what the collapsible year columns
// on the P&L/Cash Flow/Balance Sheet tabs already show). This is the one
// piece that wasn't just a display: closing a year is a real, permanent
// action (see docs/ACCOUNTING_ARCHITECTURE.md section 6), so it needed
// an actual new home rather than being dropped. Lives on the Balance
// Sheet tab specifically, since what gets locked is the year-end Balance
// Sheet snapshot.
//
// Built around CALENDAR years (buildYearGroups), replacing the old
// rolling-12-months-from-start_date fiscal year concept -- matching the
// same calendar-year grouping the collapsible P&L/BS/CF views use, and
// correctly treating a partial first or last year as a legitimate,
// closeable period once every month it actually contains is closed,
// rather than requiring exactly 12.
function YearCloseControls({config,result,closedPeriods,P,onCloseStatusChanged}:{config:GenericModelConfig;result:any;closedPeriods:Set<string>|undefined;P:any;onCloseStatusChanged?:()=>void}) {
  const [yearCloses, setYearCloses] = useState<Record<string,any>>({})
  const [closing, setClosing] = useState<string|null>(null)
  const canSeeAll = ['super_coach','ceo','finance_manager'].includes(P.role)

  useEffect(()=>{
    // Gated on canSeeAll -- generic_year_close includes closing_snapshot
    // (a full Balance Sheet position), which only finance-level roles
    // should ever have in the browser at all. Checking this here, not
    // just at render, means a hidden role never issues the request in
    // the first place, rather than fetching it and only hiding the
    // display.
    if (!canSeeAll) return
    supabase.from('generic_year_close').select('*').eq('client_id',config.client_id)
      .then(({data,error})=>{
        if (error) { console.error('Failed to load year closes:', error); return }
        const byPeriod: Record<string,any> = {}
        ;(data||[]).forEach((r:any)=>{ byPeriod[r.year_start_period] = r })
        setYearCloses(byPeriod)
      })
  },[config.client_id,canSeeAll])

  if (!canSeeAll || !result) return null

  const groups = buildYearGroups(config.start_date, config.planning_months)

  async function closeYear(group: YearGroup) {
    const key = yearStartPeriod(group, periodForMonthIndex, config.start_date)
    const yc = yearCloses[key]
    if (yc?.closed) return
    if (!canCloseCalendarYear(group, closedPeriods||new Set(), periodForMonthIndex, config.start_date)) {
      alert('Every month in this year must be individually closed first (Actuals & Working Capital tab).')
      return
    }
    setClosing(key)
    try {
      const range = { startMonthIndex: group.monthIndices[0], endMonthIndex: group.monthIndices[group.monthIndices.length-1] }
      const snapshot = computeYearEndBalanceSheet(result.bs, range)
      const closedAt = new Date().toISOString()
      const { error } = await supabase.from('generic_year_close').upsert({
        client_id: config.client_id, year_start_period: key, closed: true,
        closed_at: closedAt, closed_by: P.fullName, closing_snapshot: snapshot,
      }, { onConflict: 'client_id,year_start_period' })
      if (error) { alert('Could not close this year. Please try again.'); return }
      setYearCloses(prev => ({...prev, [key]: { closed:true, closed_at:closedAt, closed_by:P.fullName, closing_snapshot:snapshot }}))
      onCloseStatusChanged?.()
    } catch (e) {
      console.error('Could not close this year:', e)
      alert('Could not close this year. Please try again.')
    } finally {
      setClosing(null)
    }
  }

  const anyClosable = groups.some(g => canCloseCalendarYear(g, closedPeriods||new Set(), periodForMonthIndex, config.start_date))

  return (
    <div style={{marginBottom:'1.25rem',padding:'0.9rem 1rem',border:`1px solid ${C.border}`,borderLeft:`4px solid ${C.navy}`,borderRadius:8,background:C.lightBg}}>
      <div style={{fontWeight:700,color:C.navy,fontSize:'0.9rem',marginBottom:'0.25rem'}}>Year-End Close</div>
      <p style={{margin:'0 0 0.75rem',fontSize:'0.86rem',color:C.slate,lineHeight:1.5,maxWidth:'46rem'}}>
        Each box below is one financial year. Once every month in a year has been closed on the Actuals tab, you can lock that year here so its year-end balance sheet is frozen and cannot change. A box stays inactive until all of that year's months are closed, so {anyClosable ? 'the years ready to lock show a green button' : 'nothing is clickable yet'}. Locking is optional and only affects finance-level users.
      </p>
      <div style={{display:'flex',gap:'0.6rem',flexWrap:'wrap'}}>
        {groups.map(group => {
          const key = yearStartPeriod(group, periodForMonthIndex, config.start_date)
          const yc = yearCloses[key]
          const canClose = canCloseCalendarYear(group, closedPeriods||new Set(), periodForMonthIndex, config.start_date)
          return (
            <div key={group.year} style={{display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.45rem 0.75rem',border:`1px solid ${yc?.closed?C.navy:C.border}`,borderRadius:6,fontSize:'0.86rem',background:yc?.closed?C.white:C.white}}>
              <span style={{fontWeight:700,color:C.navy}}>FY {group.label}</span>
              {yc?.closed ? (
                <span title={`Closed by ${yc.closed_by} on ${new Date(yc.closed_at).toLocaleDateString()}`}><Badge text="Closed" color={'var(--cv-header)'}/></span>
              ) : (
                <button type="button" style={addBtn(true,canClose?C.green:C.border)} onClick={()=>closeYear(group)} disabled={!canClose||closing===key}>
                  {closing===key?'Closing...':canClose?'Close This Year':'Not all months closed yet'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BalanceSheetTab({config,result,months,cc,P,closedPeriods,onCloseStatusChanged}:{config:GenericModelConfig;result:any;months:string[];cc:string;P:any;closedPeriods:Set<string>|undefined;onCloseStatusChanged?:()=>void}) {
  if (!result) return <div style={card}><p style={{color:C.slate}}>Set up your planning data first.</p></div>
  const bs = result.bs
  const closedMask: boolean[] = months.map((_:string, i:number) =>
    closedPeriods?.has(periodForMonthIndex(config.start_date, i)) ?? false
  )
  const rows = [
    {label:'ASSETS',values:Array(months.length).fill(0),bold:true,aggregation:'endOfPeriod' as const},
    {label:'Cash & Bank',values:bs.cash,actualMask:bs.act_mask,aggregation:'endOfPeriod' as const},
    {label:'Fixed Assets',values:bs.fixed_assets,aggregation:'endOfPeriod' as const},
    {label:'Total Assets',values:bs.total_assets,bold:true,highlight:true,actualMask:bs.act_mask,aggregation:'endOfPeriod' as const},
    {label:'EQUITY',values:Array(months.length).fill(0),bold:true,aggregation:'endOfPeriod' as const},
    {label:'Share Capital',values:bs.share_capital,aggregation:'endOfPeriod' as const},
    {label:'Grant Equity',values:bs.grant_equity,aggregation:'endOfPeriod' as const},
    {label:'Retained Earnings',values:bs.retained_earnings,actualMask:bs.act_mask,aggregation:'endOfPeriod' as const},
    {label:'Total Equity',values:bs.total_equity,bold:true,actualMask:bs.act_mask,aggregation:'endOfPeriod' as const},
    {label:'LIABILITIES',values:Array(months.length).fill(0),bold:true,aggregation:'endOfPeriod' as const},
    {label:'Grant Liability',values:bs.grant_liability,aggregation:'endOfPeriod' as const},
    {label:'Loan Liability',values:bs.loan_liability,aggregation:'endOfPeriod' as const},
    {label:'Total Liabilities',values:bs.total_liabilities,bold:true,aggregation:'endOfPeriod' as const},
    {label:'Total Equity & Liabilities',values:bs.total_equity_and_liabilities,bold:true,highlight:true,actualMask:bs.act_mask,aggregation:'endOfPeriod' as const},
  ]
  // Latest month-end position. The engine guarantees the accounting identity
  // (Assets = Equity + Liabilities) holds every month -- we compare the two
  // latest totals to show the check, never to recompute anything.
  const last = bs.total_assets.length-1
  const totalAssets = bs.total_assets[last] ?? 0
  const totalEquity = bs.total_equity[last] ?? 0
  const totalLiab = bs.total_liabilities[last] ?? 0
  const totalEandL = bs.total_equity_and_liabilities[last] ?? 0
  const balanced = Math.abs(totalAssets - totalEandL) < 1
  return (
    <div>
      <SectionLabel>Position at latest close</SectionLabel>
      <div className="cv-grid-4" style={{marginBottom:'1.25rem'}}>
        <GlanceCard label="Total assets" value={fmt(totalAssets,cc)} desc="cash, receivables & fixed assets" accent={C.navy}/>
        <GlanceCard label="Total equity" value={fmt(totalEquity,cc)} desc="capital, grants & retained earnings" accent={C.teal} valueColor={totalEquity>=0?C.navy:C.red}/>
        <GlanceCard label="Total liabilities" value={fmt(totalLiab,cc)} desc="loans, payables & grant liability" accent={C.amber}/>
        <GlanceCard label="Balance check" value={balanced?'Balanced':'Check figures'} valueColor={balanced?C.green:C.amber} accent={balanced?C.green:C.amber}
          desc={<><span aria-hidden="true">{balanced?'✓':'⚠'}</span> Assets = Equity + Liabilities</>} descColor={balanced?C.green:C.amber}/>
      </div>
      <YearCloseControls config={config} result={result} closedPeriods={closedPeriods} P={P} onCloseStatusChanged={onCloseStatusChanged}/>
      <p style={{fontSize:'0.8rem',color:C.slate,margin:'0 0 0.5rem',lineHeight:1.5}}>Each FY column is the year-end position; click a year to open its month-end balances. Green cells are posted actuals.</p>
      <PLTableCollapsible title="Balance Sheet" rows={rows} months={months} startDate={config.start_date} cc={cc} showExport closedMask={closedMask}/>
    </div>
  )
}

