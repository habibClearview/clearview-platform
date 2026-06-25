// @ts-nocheck
// ============================================================
// ANALYTICS VIEW — All analytical modules in one component
// Drop into any client dashboard
// Canvas Coach | habibonifade.com
// ============================================================
import { useState, useMemo } from 'react'
import {
  buildDebtSchedule, buildCreditRiskAssessment, buildGoingConcernAssessment,
  buildInvestmentReadiness, buildCashflowProjection, buildCloseOutRecommendation,
  buildOperationalCashflow, extractModelSnapshot, extractGrantRepayments,
} from '@/lib/analytics-engine'

const CC = {
  navy:'#1B2A4A', cyan:'#00B4D8', cream:'#F8F4EE', white:'#FFFFFF',
  slate:'#4A5A6A', border:'#D8E0E8', teal:'#1A9DAA', red:'#C0392B',
  green:'#1A7A4A', amber:'#B8860B', lightBg:'#F0F4F8',
}

function compactCurrency(n, cc='UGX') {
  const v=Math.round(n||0),abs=Math.abs(v),sign=v<0?'-':''
  if(abs>=1_000_000_000)return`${sign}${cc} ${(abs/1_000_000_000).toFixed(1)}B`
  if(abs>=1_000_000)return`${sign}${cc} ${(abs/1_000_000).toFixed(1)}M`
  if(abs>=1_000)return`${sign}${cc} ${(abs/1_000).toFixed(0)}K`
  return`${sign}${cc} ${abs}`
}
function pct(n){return`${(n*100).toFixed(1)}%`}

const card = {background:CC.white,border:`1px solid ${CC.border}`,borderRadius:8,padding:'1.25rem',marginBottom:'1.25rem'}
const lbl = {display:'block',fontWeight:600,fontSize:'0.82rem',marginBottom:'0.25rem',color:CC.navy}
const inp = {width:'100%',padding:'0.45rem 0.6rem',border:`1px solid ${CC.border}`,borderRadius:4,fontSize:'0.85rem',fontFamily:'inherit',background:'#F4F8FC',color:CC.navy,boxSizing:'border-box'}
const secH = {fontFamily:'Georgia,serif',fontSize:'1.15rem',fontWeight:700,color:CC.navy,margin:'0 0 1rem'}

function FlagBadge({type,message}){
  const bg=type==='red'?'#FDF0EE':type==='green'?'#E8F5EE':'#FFF8E8'
  const border=type==='red'?CC.red:type==='green'?CC.green:CC.amber
  const dot=type==='red'?CC.red:type==='green'?CC.green:CC.amber
  return(
    <div style={{background:bg,border:`1px solid ${border}`,borderRadius:6,padding:'0.65rem 0.85rem',marginBottom:'0.5rem',display:'flex',alignItems:'flex-start',gap:'0.6rem'}}>
      <span style={{width:8,height:8,borderRadius:'50%',background:dot,marginTop:'0.4rem',flexShrink:0,display:'inline-block'}}/>
      <span style={{fontSize:'0.85rem',color:CC.navy,lineHeight:1.5}}>{message}</span>
    </div>
  )
}

function ScoreBar({score,max,color}){
  const pctVal=Math.min(100,(score/max)*100)
  return(
    <div style={{background:'#E8ECF0',borderRadius:999,height:8,overflow:'hidden',marginTop:'0.3rem'}}>
      <div style={{width:`${pctVal}%`,height:'100%',background:color||CC.cyan,borderRadius:999,transition:'width 0.4s ease'}}/>
    </div>
  )
}

function ClassificationBadge({label}){
  const bg=label==='Stable'||label==='Strong'||label==='Investment Ready'||label==='Viable'?CC.green
    :label==='At Risk'||label==='Marginal'||label==='Near Ready'||label==='Conditionally Viable'||label==='Watch'||label==='Adequate'?CC.amber
    :CC.red
  return(
    <span style={{fontFamily:'monospace',fontSize:'0.78rem',fontWeight:700,padding:'0.25rem 0.7rem',borderRadius:20,background:bg,color:CC.white,letterSpacing:'0.04em'}}>{label}</span>
  )
}

function SectionTab({tabs,active,onChange}){
  return(
    <div style={{display:'flex',gap:'0.4rem',flexWrap:'wrap',marginBottom:'1.5rem',borderBottom:`1px solid ${CC.border}`,paddingBottom:'0.75rem'}}>
      {tabs.map(([id,label])=>(
        <button key={id} onClick={()=>onChange(id)} style={{fontFamily:'monospace',fontSize:'0.78rem',padding:'0.5rem 1rem',border:`1px solid ${active===id?CC.cyan:CC.border}`,borderRadius:5,background:active===id?CC.cyan:CC.white,color:active===id?CC.navy:CC.slate,cursor:'pointer',fontWeight:active===id?700:400}}>{label}</button>
      ))}
    </div>
  )
}

export default function AnalyticsView({ result, debtObligations, monthLabels, cc, clientName, onSaveAssessments, savedAssessments }){
  const months = 24
  const [activeSection, setActiveSection] = useState('credit')
  const [coachAssessments, setCoachAssessments] = useState(savedAssessments || {
    creditOverride: null,
    creditNote: '',
    management: 2,
    commercialModel: 2,
    managementCapability: 2,
    marketEvidence: 2,
    governance: 2,
    immediateActions: '',
    nearTermActions: '',
    requiredFollowUp: '',
    coachNotes: '',
  })

  const snapshot = useMemo(() => extractModelSnapshot(result), [result])
  const grantRepay = useMemo(() => extractGrantRepayments(result.cashFlow, months), [result])
  const debtSchedule = useMemo(() => buildDebtSchedule(debtObligations || [], months), [debtObligations])

  const creditRisk = useMemo(() => buildCreditRiskAssessment(
    snapshot, debtSchedule,
    coachAssessments.creditOverride ? { classification: coachAssessments.creditOverride, note: coachAssessments.creditNote } : undefined
  ), [snapshot, debtSchedule, coachAssessments])

  const goingConcern = useMemo(() => buildGoingConcernAssessment(
    snapshot, debtSchedule, { management: coachAssessments.management }
  ), [snapshot, debtSchedule, coachAssessments])

  const investmentReadiness = useMemo(() => buildInvestmentReadiness(
    snapshot, debtSchedule, {
      commercialModel: coachAssessments.commercialModel,
      managementCapability: coachAssessments.managementCapability,
      marketEvidence: coachAssessments.marketEvidence,
      governance: coachAssessments.governance,
    }
  ), [snapshot, debtSchedule, coachAssessments])

  const closeOut = useMemo(() => buildCloseOutRecommendation(
    creditRisk, goingConcern, investmentReadiness, {
      immediateActions: coachAssessments.immediateActions ? coachAssessments.immediateActions.split('\n').filter(Boolean) : undefined,
      nearTermActions: coachAssessments.nearTermActions ? coachAssessments.nearTermActions.split('\n').filter(Boolean) : undefined,
      requiredFollowUp: coachAssessments.requiredFollowUp ? coachAssessments.requiredFollowUp.split('\n').filter(Boolean) : undefined,
      coachNotes: coachAssessments.coachNotes,
    }
  ), [creditRisk, goingConcern, investmentReadiness, coachAssessments])

  const cashflowProjection = useMemo(() => buildCashflowProjection(snapshot, debtSchedule, grantRepay, 0, 6), [snapshot, debtSchedule, grantRepay])

  function updateAssessment(field, value) {
    const next = { ...coachAssessments, [field]: value }
    setCoachAssessments(next)
    onSaveAssessments?.(next)
  }

  const tabs = [
    ['credit', 'Credit Risk'],
    ['going_concern', 'Going Concern'],
    ['investment', 'Investment Readiness'],
    ['cashflow_proj', '6-Month Projection'],
    ['closeout', 'Close-Out'],
    ['coach_inputs', 'Coach Inputs'],
  ]

  return(
    <div>
      {/* Summary strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
        <div style={{...card,padding:'1rem',borderTop:`4px solid ${creditRisk.classification==='Stable'?CC.green:creditRisk.classification==='At Risk'?CC.amber:CC.red}`}}>
          <div style={{fontFamily:'monospace',fontSize:'0.68rem',color:CC.slate,textTransform:'uppercase',marginBottom:'0.4rem'}}>Credit Risk</div>
          <ClassificationBadge label={creditRisk.classification}/>
          <div style={{fontSize:'0.78rem',color:CC.slate,marginTop:'0.4rem'}}>Score {creditRisk.score}/100</div>
        </div>
        <div style={{...card,padding:'1rem',borderTop:`4px solid ${goingConcern.overallRating==='Strong'?CC.green:goingConcern.overallRating==='Adequate'?CC.cyan:goingConcern.overallRating==='Marginal'?CC.amber:CC.red}`}}>
          <div style={{fontFamily:'monospace',fontSize:'0.68rem',color:CC.slate,textTransform:'uppercase',marginBottom:'0.4rem'}}>Going Concern</div>
          <ClassificationBadge label={goingConcern.overallRating}/>
          <div style={{fontSize:'0.78rem',color:CC.slate,marginTop:'0.4rem'}}>{goingConcern.overallScore}/20</div>
        </div>
        <div style={{...card,padding:'1rem',borderTop:`4px solid ${investmentReadiness.tier==='Investment Ready'?CC.green:investmentReadiness.tier==='Near Ready'?CC.cyan:CC.amber}`}}>
          <div style={{fontFamily:'monospace',fontSize:'0.68rem',color:CC.slate,textTransform:'uppercase',marginBottom:'0.4rem'}}>Investment Readiness</div>
          <ClassificationBadge label={investmentReadiness.tier}/>
          <div style={{fontSize:'0.78rem',color:CC.slate,marginTop:'0.4rem'}}>{investmentReadiness.overallScore}/30</div>
        </div>
        <div style={{...card,padding:'1rem',borderTop:`4px solid ${closeOut.viabilityRating==='Viable'?CC.green:closeOut.viabilityRating==='Conditionally Viable'?CC.cyan:CC.red}`}}>
          <div style={{fontFamily:'monospace',fontSize:'0.68rem',color:CC.slate,textTransform:'uppercase',marginBottom:'0.4rem'}}>Viability</div>
          <ClassificationBadge label={closeOut.viabilityRating}/>
          <div style={{fontSize:'0.78rem',color:CC.slate,marginTop:'0.4rem'}}>Repayment: {closeOut.repaymentOutlook}</div>
        </div>
        <div style={{...card,padding:'1rem',borderTop:`4px solid ${cashflowProjection.gapMonths.length===0?CC.green:CC.amber}`}}>
          <div style={{fontFamily:'monospace',fontSize:'0.68rem',color:CC.slate,textTransform:'uppercase',marginBottom:'0.4rem'}}>6-Month Cashflow</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:cashflowProjection.gapMonths.length===0?CC.green:CC.amber}}>
            {cashflowProjection.gapMonths.length===0?'No Gaps':`${cashflowProjection.gapMonths.length} Gap${cashflowProjection.gapMonths.length>1?'s':''}`}
          </div>
          {cashflowProjection.recommendedFacility>0&&<div style={{fontSize:'0.78rem',color:CC.slate,marginTop:'0.3rem'}}>Facility: {compactCurrency(cashflowProjection.recommendedFacility,cc)}</div>}
        </div>
        <div style={{...card,padding:'1rem',borderTop:`4px solid ${CC.teal}`}}>
          <div style={{fontFamily:'monospace',fontSize:'0.68rem',color:CC.slate,textTransform:'uppercase',marginBottom:'0.4rem'}}>Avg DSCR Y1</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:creditRisk.dscrAvgY1>=1.5?CC.green:creditRisk.dscrAvgY1>=1.0?CC.amber:CC.red}}>{creditRisk.dscrAvgY1.toFixed(2)}x</div>
          <div style={{fontSize:'0.78rem',color:CC.slate,marginTop:'0.3rem'}}>Debt service coverage</div>
        </div>
      </div>

      <SectionTab tabs={tabs} active={activeSection} onChange={setActiveSection}/>

      {/* ── CREDIT RISK ── */}
      {activeSection==='credit'&&(
        <div>
          <div style={card}>
            <h3 style={secH}>Credit Risk Dashboard</h3>
            <div style={{display:'flex',alignItems:'center',gap:'1.5rem',marginBottom:'1.5rem',flexWrap:'wrap'}}>
              <div style={{textAlign:'center'}}>
                <div style={{fontFamily:'Georgia,serif',fontSize:'3rem',fontWeight:700,color:creditRisk.classification==='Stable'?CC.green:creditRisk.classification==='At Risk'?CC.amber:CC.red,lineHeight:1}}>{creditRisk.score}</div>
                <div style={{fontFamily:'monospace',fontSize:'0.68rem',color:CC.slate,marginTop:'0.2rem'}}>OUT OF 100</div>
              </div>
              <div>
                <ClassificationBadge label={creditRisk.classification}/>
                <div style={{fontSize:'0.85rem',color:CC.slate,marginTop:'0.5rem',maxWidth:400}}>{creditRisk.rationale}</div>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
              <div style={{background:CC.lightBg,borderRadius:6,padding:'0.85rem 1rem'}}>
                <div style={{fontFamily:'monospace',fontSize:'0.68rem',color:CC.slate,marginBottom:'0.3rem'}}>AVG DSCR Y1</div>
                <div style={{fontFamily:'Georgia,serif',fontSize:'1.4rem',fontWeight:700,color:creditRisk.dscrAvgY1>=1.5?CC.green:creditRisk.dscrAvgY1>=1.0?CC.amber:CC.red}}>{creditRisk.dscrAvgY1.toFixed(2)}x</div>
                <div style={{fontSize:'0.75rem',color:CC.slate,marginTop:'0.2rem'}}>{creditRisk.dscrAvgY1>=1.5?'Strong':'creditRisk.dscrAvgY1>=1.0?Adequate:Weak'}</div>
              </div>
              <div style={{background:CC.lightBg,borderRadius:6,padding:'0.85rem 1rem'}}>
                <div style={{fontFamily:'monospace',fontSize:'0.68rem',color:CC.slate,marginBottom:'0.3rem'}}>LIQUIDITY GAPS</div>
                <div style={{fontFamily:'Georgia,serif',fontSize:'1.4rem',fontWeight:700,color:creditRisk.liquidityGapMonths.length===0?CC.green:CC.red}}>{creditRisk.liquidityGapMonths.length}</div>
                <div style={{fontSize:'0.75rem',color:CC.slate,marginTop:'0.2rem'}}>Cash-negative months</div>
              </div>
              <div style={{background:CC.lightBg,borderRadius:6,padding:'0.85rem 1rem'}}>
                <div style={{fontFamily:'monospace',fontSize:'0.68rem',color:CC.slate,marginBottom:'0.3rem'}}>REVENUE TREND</div>
                <div style={{fontFamily:'Georgia,serif',fontSize:'1.4rem',fontWeight:700,color:creditRisk.revenueGrowthTrend==='growing'?CC.green:creditRisk.revenueGrowthTrend==='stable'?CC.amber:CC.red,textTransform:'capitalize'}}>{creditRisk.revenueGrowthTrend}</div>
                <div style={{fontSize:'0.75rem',color:CC.slate,marginTop:'0.2rem'}}>Q1 vs Q4 Year 1</div>
              </div>
            </div>
            {creditRisk.flags.map((f,i)=><FlagBadge key={i} type={f.type} message={f.message}/>)}
          </div>

          {/* DSCR monthly table */}
          <div style={card}>
            <h3 style={secH}>DSCR by Month — Year 1</h3>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.78rem',fontFamily:'monospace'}}>
                <thead><tr style={{background:CC.navy,color:CC.white}}><th style={{padding:'7px 10px',textAlign:'left',fontWeight:600}}>Metric</th>{monthLabels.slice(0,12).map(m=><th key={m} style={{padding:'7px 8px',textAlign:'right',fontWeight:500,whiteSpace:'nowrap'}}>{m}</th>)}</tr></thead>
                <tbody>
                  <tr style={{background:CC.cream}}><td style={{padding:'6px 10px',fontFamily:"'Segoe UI',sans-serif",fontWeight:600}}>EBITDA</td>{result.consolidated.ebitda.slice(0,12).map((v,i)=><td key={i} style={{padding:'6px 8px',textAlign:'right',color:v>=0?CC.green:CC.red}}>{compactCurrency(v,cc)}</td>)}</tr>
                  <tr><td style={{padding:'6px 10px',fontFamily:"'Segoe UI',sans-serif",fontWeight:600}}>Debt Service</td>{debtSchedule.totalRepayment.slice(0,12).map((v,i)=><td key={i} style={{padding:'6px 8px',textAlign:'right'}}>{compactCurrency(v,cc)}</td>)}</tr>
                  <tr style={{background:CC.lightBg}}><td style={{padding:'6px 10px',fontFamily:"'Segoe UI',sans-serif",fontWeight:700}}>DSCR</td>{creditRisk.dscr.slice(0,12).map((v,i)=><td key={i} style={{padding:'6px 8px',textAlign:'right',fontWeight:700,color:v>=1.5?CC.green:v>=1.0?CC.amber:CC.red}}>{v.toFixed(2)}x</td>)}</tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── GOING CONCERN ── */}
      {activeSection==='going_concern'&&(
        <div>
          <div style={card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'1rem',flexWrap:'wrap',gap:'0.75rem'}}>
              <h3 style={{...secH,margin:0}}>Going Concern Assessment</h3>
              <div style={{textAlign:'right'}}>
                <ClassificationBadge label={goingConcern.overallRating}/>
                <div style={{fontFamily:'monospace',fontSize:'0.78rem',color:CC.slate,marginTop:'0.3rem'}}>{goingConcern.overallScore} / 20</div>
              </div>
            </div>
            {goingConcern.flags.map((f,i)=><FlagBadge key={i} type={f.type} message={f.message}/>)}
          </div>
          <div style={card}>
            <h3 style={secH}>Five Indicators</h3>
            {goingConcern.indicators.map((ind,i)=>(
              <div key={i} style={{marginBottom:'1.25rem',paddingBottom:'1.25rem',borderBottom:i<goingConcern.indicators.length-1?`1px solid ${CC.border}`:'none'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.4rem'}}>
                  <div style={{fontWeight:700,fontSize:'0.9rem',color:CC.navy}}>{ind.name}</div>
                  <div style={{display:'flex',alignItems:'center',gap:'0.6rem'}}>
                    <span style={{fontFamily:'monospace',fontSize:'0.82rem',fontWeight:700,color:CC.navy}}>{ind.score}/{ind.maxScore}</span>
                    <ClassificationBadge label={ind.rating}/>
                  </div>
                </div>
                <ScoreBar score={ind.score} max={ind.maxScore} color={ind.score>=3?CC.green:ind.score>=2?CC.amber:CC.red}/>
                <div style={{fontSize:'0.82rem',color:CC.slate,marginTop:'0.4rem',lineHeight:1.5}}>{ind.evidence}</div>
                {ind.name==='Management & Governance'&&(
                  <div style={{marginTop:'0.6rem'}}>
                    <label style={lbl}>Coach assessment (0-4)</label>
                    <input type="range" min="0" max="4" step="1" value={coachAssessments.management} onChange={e=>updateAssessment('management',Number(e.target.value))} style={{width:'100%',accentColor:CC.cyan}}/>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.72rem',color:CC.slate,marginTop:'0.2rem'}}><span>0 — Concern</span><span>2 — Adequate</span><span>4 — Strong</span></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── INVESTMENT READINESS ── */}
      {activeSection==='investment'&&(
        <div>
          <div style={card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'1rem',flexWrap:'wrap',gap:'0.75rem'}}>
              <h3 style={{...secH,margin:0}}>Investment Readiness Score</h3>
              <div style={{textAlign:'right'}}>
                <ClassificationBadge label={investmentReadiness.tier}/>
                <div style={{fontFamily:'monospace',fontSize:'0.78rem',color:CC.slate,marginTop:'0.3rem'}}>{investmentReadiness.overallScore} / 30</div>
              </div>
            </div>
            <ScoreBar score={investmentReadiness.overallScore} max={30} color={investmentReadiness.overallScore>=24?CC.green:investmentReadiness.overallScore>=17?CC.cyan:CC.amber}/>
            <div style={{marginTop:'1rem'}}>{investmentReadiness.flags.map((f,i)=><FlagBadge key={i} type={f.type} message={f.message}/>)}</div>
          </div>
          <div style={card}>
            <h3 style={secH}>Six Dimensions</h3>
            {investmentReadiness.dimensions.map((dim,i)=>(
              <div key={i} style={{marginBottom:'1.25rem',paddingBottom:'1.25rem',borderBottom:i<investmentReadiness.dimensions.length-1?`1px solid ${CC.border}`:'none'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.4rem'}}>
                  <div style={{fontWeight:700,fontSize:'0.9rem',color:CC.navy}}>{dim.name}</div>
                  <span style={{fontFamily:'monospace',fontSize:'0.85rem',fontWeight:700,color:dim.score>=4?CC.green:dim.score>=3?CC.cyan:dim.score>=2?CC.amber:CC.red}}>{dim.score}/{dim.maxScore}</span>
                </div>
                <ScoreBar score={dim.score} max={dim.maxScore} color={dim.score>=4?CC.green:dim.score>=3?CC.cyan:dim.score>=2?CC.amber:CC.red}/>
                <div style={{fontSize:'0.82rem',color:CC.slate,marginTop:'0.4rem',lineHeight:1.5}}>{dim.evidence}</div>
                {dim.coachAssessment!==undefined&&(
                  <div style={{marginTop:'0.6rem'}}>
                    <label style={lbl}>Coach score (0-5)</label>
                    <input type="range" min="0" max="5" step="1" value={dim.coachAssessment??2} onChange={e=>{
                      const fieldMap={'Commercial Model Clarity':'commercialModel','Management Capability':'managementCapability','Market Evidence':'marketEvidence','Governance & Record-Keeping':'governance'}
                      const field=fieldMap[dim.name]
                      if(field)updateAssessment(field,Number(e.target.value))
                    }} style={{width:'100%',accentColor:CC.cyan}}/>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.72rem',color:CC.slate,marginTop:'0.2rem'}}><span>0</span><span>2</span><span>5</span></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 6-MONTH CASHFLOW PROJECTION ── */}
      {activeSection==='cashflow_proj'&&(
        <div>
          <div style={card}>
            <h3 style={secH}>6-Month Cashflow Projection</h3>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:'1rem',marginBottom:'1.25rem'}}>
              <div style={{background:CC.lightBg,borderRadius:6,padding:'0.85rem 1rem'}}><div style={{fontFamily:'monospace',fontSize:'0.68rem',color:CC.slate,marginBottom:'0.3rem'}}>PROJECTED CASH IN</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:CC.navy}}>{compactCurrency(cashflowProjection.projectedCashIn.reduce((a,b)=>a+b,0),cc)}</div><div style={{fontSize:'0.75rem',color:CC.slate}}>6-month total</div></div>
              <div style={{background:CC.lightBg,borderRadius:6,padding:'0.85rem 1rem'}}><div style={{fontFamily:'monospace',fontSize:'0.68rem',color:CC.slate,marginBottom:'0.3rem'}}>PROJECTED CASH OUT</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:CC.navy}}>{compactCurrency(cashflowProjection.projectedCashOut.reduce((a,b)=>a+b,0),cc)}</div><div style={{fontSize:'0.75rem',color:CC.slate}}>6-month total</div></div>
              <div style={{background:CC.lightBg,borderRadius:6,padding:'0.85rem 1rem'}}><div style={{fontFamily:'monospace',fontSize:'0.68rem',color:CC.slate,marginBottom:'0.3rem'}}>LIQUIDITY GAPS</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:cashflowProjection.gapMonths.length===0?CC.green:CC.red}}>{cashflowProjection.gapMonths.length}</div><div style={{fontSize:'0.75rem',color:CC.slate}}>Months with cash shortfall</div></div>
              {cashflowProjection.recommendedFacility>0&&<div style={{background:'#FFF8E8',borderRadius:6,padding:'0.85rem 1rem',border:`1px solid ${CC.amber}`}}><div style={{fontFamily:'monospace',fontSize:'0.68rem',color:CC.amber,marginBottom:'0.3rem'}}>RECOMMENDED FACILITY</div><div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:CC.amber}}>{compactCurrency(cashflowProjection.recommendedFacility,cc)}</div><div style={{fontSize:'0.75rem',color:CC.slate}}>To cover gaps + 20% buffer</div></div>}
            </div>
            {cashflowProjection.gapMonths.length>0&&(
              <div style={{background:'#FDF0EE',border:`1px solid ${CC.red}`,borderRadius:6,padding:'0.85rem 1rem',marginBottom:'1rem'}}>
                <div style={{fontFamily:'monospace',fontSize:'0.72rem',color:CC.red,marginBottom:'0.4rem',fontWeight:700}}>CASHFLOW GAPS IDENTIFIED</div>
                {cashflowProjection.gapMonths.map((g,i)=>(
                  <div key={i} style={{fontSize:'0.82rem',color:CC.navy,marginBottom:'0.2rem'}}>
                    {monthLabels[g.monthIdx]}: shortfall of <strong style={{color:CC.red}}>{compactCurrency(Math.abs(g.gap),cc)}</strong>
                  </div>
                ))}
              </div>
            )}
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.78rem',fontFamily:'monospace'}}>
                <thead><tr style={{background:CC.navy,color:CC.white}}><th style={{padding:'7px 10px',textAlign:'left',fontWeight:600,minWidth:180}}>Line</th>{cashflowProjection.months.map(m=><th key={m} style={{padding:'7px 8px',textAlign:'right',fontWeight:500,whiteSpace:'nowrap'}}>{monthLabels[m]}</th>)}</tr></thead>
                <tbody>
                  <tr style={{background:CC.cream}}><td style={{padding:'6px 10px',fontFamily:"'Segoe UI',sans-serif",fontWeight:600}}>Cash In</td>{cashflowProjection.projectedCashIn.map((v,i)=><td key={i} style={{padding:'6px 8px',textAlign:'right',color:CC.green}}>{compactCurrency(v,cc)}</td>)}</tr>
                  <tr><td style={{padding:'6px 10px',fontFamily:"'Segoe UI',sans-serif",fontWeight:600}}>Cash Out</td>{cashflowProjection.projectedCashOut.map((v,i)=><td key={i} style={{padding:'6px 8px',textAlign:'right',color:CC.red}}>{compactCurrency(-v,cc)}</td>)}</tr>
                  <tr style={{background:CC.lightBg}}><td style={{padding:'6px 10px',fontFamily:"'Segoe UI',sans-serif",fontWeight:700}}>Net</td>{cashflowProjection.projectedNet.map((v,i)=><td key={i} style={{padding:'6px 8px',textAlign:'right',fontWeight:700,color:v>=0?CC.green:CC.red}}>{compactCurrency(v,cc)}</td>)}</tr>
                  <tr style={{background:CC.navy}}><td style={{padding:'6px 10px',fontFamily:"'Segoe UI',sans-serif",fontWeight:700,color:CC.white}}>Closing Cash</td>{cashflowProjection.projectedClosingCash.map((v,i)=><td key={i} style={{padding:'6px 8px',textAlign:'right',fontWeight:700,color:v>=0?'#7DCEA0':CC.red}}>{compactCurrency(v,cc)}</td>)}</tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── CLOSE-OUT RECOMMENDATION ── */}
      {activeSection==='closeout'&&(
        <div>
          <div style={{...card,borderTop:`4px solid ${closeOut.viabilityRating==='Viable'?CC.green:closeOut.viabilityRating==='Conditionally Viable'?CC.cyan:CC.red}`}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'1rem',flexWrap:'wrap',gap:'0.75rem'}}>
              <h3 style={{...secH,margin:0}}>Close-Out Recommendation — {clientName}</h3>
              <ClassificationBadge label={closeOut.viabilityRating}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'1rem',marginBottom:'1.25rem'}}>
              {[['Viability',closeOut.viabilityRating],['Repayment Outlook',closeOut.repaymentOutlook],['Stability Status',closeOut.stabilityStatus]].map(([label,val])=>(
                <div key={label} style={{background:CC.lightBg,borderRadius:6,padding:'0.85rem 1rem'}}>
                  <div style={{fontFamily:'monospace',fontSize:'0.68rem',color:CC.slate,marginBottom:'0.3rem',textTransform:'uppercase'}}>{label}</div>
                  <ClassificationBadge label={val}/>
                </div>
              ))}
            </div>
            <div style={{background:CC.cream,borderRadius:6,padding:'1rem',marginBottom:'1rem',borderLeft:`4px solid ${CC.cyan}`}}>
              <div style={{fontFamily:'monospace',fontSize:'0.72rem',color:CC.cyan,marginBottom:'0.4rem',fontWeight:700}}>EXIT RECOMMENDATION</div>
              <div style={{fontSize:'0.88rem',color:CC.navy,lineHeight:1.6}}>{closeOut.exitRecommendation}</div>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:'1.25rem',marginBottom:'1.25rem'}}>
            <div style={card}>
              <h4 style={{fontFamily:'Georgia,serif',color:CC.navy,margin:'0 0 0.75rem',fontSize:'0.95rem'}}>Immediate Actions (30 days)</h4>
              {closeOut.immediateActions.map((a,i)=><div key={i} style={{display:'flex',gap:'0.5rem',fontSize:'0.85rem',color:CC.navy,marginBottom:'0.4rem',lineHeight:1.5}}><span style={{color:CC.red,fontWeight:700,flexShrink:0}}>→</span>{a}</div>)}
              {closeOut.immediateActions.length===0&&<div style={{fontSize:'0.85rem',color:CC.slate}}>No immediate actions required.</div>}
            </div>
            <div style={card}>
              <h4 style={{fontFamily:'Georgia,serif',color:CC.navy,margin:'0 0 0.75rem',fontSize:'0.95rem'}}>Near-Term Actions (60-90 days)</h4>
              {closeOut.nearTermActions.map((a,i)=><div key={i} style={{display:'flex',gap:'0.5rem',fontSize:'0.85rem',color:CC.navy,marginBottom:'0.4rem',lineHeight:1.5}}><span style={{color:CC.amber,fontWeight:700,flexShrink:0}}>→</span>{a}</div>)}
            </div>
            <div style={card}>
              <h4 style={{fontFamily:'Georgia,serif',color:CC.navy,margin:'0 0 0.75rem',fontSize:'0.95rem'}}>Required Follow-Up</h4>
              {closeOut.requiredFollowUp.map((a,i)=><div key={i} style={{display:'flex',gap:'0.5rem',fontSize:'0.85rem',color:CC.navy,marginBottom:'0.4rem',lineHeight:1.5}}><span style={{color:CC.cyan,fontWeight:700,flexShrink:0}}>→</span>{a}</div>)}
            </div>
          </div>

          {closeOut.coachNotes&&(
            <div style={{...card,background:'#FFF8E8',border:`1px solid ${CC.amber}`}}>
              <div style={{fontFamily:'monospace',fontSize:'0.72rem',color:CC.amber,marginBottom:'0.4rem',fontWeight:700}}>COACH NOTES</div>
              <div style={{fontSize:'0.88rem',color:CC.navy,lineHeight:1.6}}>{closeOut.coachNotes}</div>
            </div>
          )}
        </div>
      )}

      {/* ── COACH INPUTS ── */}
      {activeSection==='coach_inputs'&&(
        <div>
          <div style={card}>
            <h3 style={secH}>Coach Assessment Inputs</h3>
            <p style={{fontSize:'0.85rem',color:CC.slate,marginBottom:'1.25rem',lineHeight:1.6}}>These inputs feed into the Going Concern, Investment Readiness, and Close-Out modules. They represent the coach's qualitative judgement that cannot be derived from the financial model alone.</p>

            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:'1.25rem',marginBottom:'1.5rem'}}>
              <div>
                <label style={lbl}>Credit Risk Override</label>
                <select style={inp} value={coachAssessments.creditOverride||''} onChange={e=>updateAssessment('creditOverride',e.target.value||null)}>
                  <option value="">Auto (from model)</option>
                  <option value="Stable">Override: Stable</option>
                  <option value="At Risk">Override: At Risk</option>
                  <option value="High Risk">Override: High Risk</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Management quality (0-4)</label>
                <input type="range" min="0" max="4" step="1" value={coachAssessments.management} onChange={e=>updateAssessment('management',Number(e.target.value))} style={{width:'100%',accentColor:CC.cyan}}/>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.72rem',color:CC.slate}}><span>Concern</span><span>Adequate</span><span>Strong</span></div>
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
              {[['Commercial Model Clarity','commercialModel'],['Management Capability','managementCapability'],['Market Evidence','marketEvidence'],['Governance & Record-Keeping','governance']].map(([label,field])=>(
                <div key={field}>
                  <label style={lbl}>{label} (0-5)</label>
                  <input type="range" min="0" max="5" step="1" value={coachAssessments[field]} onChange={e=>updateAssessment(field,Number(e.target.value))} style={{width:'100%',accentColor:CC.cyan}}/>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.7rem',color:CC.slate}}><span>0</span><span style={{fontWeight:700,color:CC.cyan}}>{coachAssessments[field]}/5</span><span>5</span></div>
                </div>
              ))}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginBottom:'1rem'}}>
              <div>
                <label style={lbl}>Immediate Actions (one per line)</label>
                <textarea style={{...inp,minHeight:90,resize:'vertical'}} value={coachAssessments.immediateActions} onChange={e=>updateAssessment('immediateActions',e.target.value)} placeholder="Action 1&#10;Action 2&#10;Action 3"/>
              </div>
              <div>
                <label style={lbl}>Near-Term Actions (one per line)</label>
                <textarea style={{...inp,minHeight:90,resize:'vertical'}} value={coachAssessments.nearTermActions} onChange={e=>updateAssessment('nearTermActions',e.target.value)} placeholder="Action 1&#10;Action 2"/>
              </div>
              <div>
                <label style={lbl}>Required Follow-Up (one per line)</label>
                <textarea style={{...inp,minHeight:90,resize:'vertical'}} value={coachAssessments.requiredFollowUp} onChange={e=>updateAssessment('requiredFollowUp',e.target.value)} placeholder="Follow-up 1&#10;Follow-up 2"/>
              </div>
              <div>
                <label style={lbl}>Coach Notes (appears in Close-Out)</label>
                <textarea style={{...inp,minHeight:90,resize:'vertical'}} value={coachAssessments.coachNotes} onChange={e=>updateAssessment('coachNotes',e.target.value)} placeholder="Any additional context or observations..."/>
              </div>
            </div>

            {coachAssessments.creditOverride&&(
              <div>
                <label style={lbl}>Rationale for credit override (mandatory)</label>
                <textarea style={{...inp,minHeight:60,resize:'vertical',borderColor:CC.amber}} value={coachAssessments.creditNote} onChange={e=>updateAssessment('creditNote',e.target.value)} placeholder="Explain why you are overriding the model classification..."/>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
