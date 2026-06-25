// @ts-nocheck
'use client'
import { useState, useMemo } from 'react'
import {
  buildDebtSchedule,
  buildCreditRiskAssessment,
  extractModelSnapshot,
} from '@/lib/analytics-engine'

const CC = { navy:'#1B2A4A', cyan:'#00B4D8', cream:'#F8F4EE', white:'#FFFFFF', slate:'#4A5A6A', border:'#D8E0E8', green:'#1A7A4A', amber:'#B8860B', red:'#C0392B' }

export default function AnalyticsView({ result, debtObligations, monthLabels, cc, clientName, onSaveAssessments, savedAssessments }) {
  const [error, setError] = useState(null)

  const snapshot = useMemo(() => {
    try { return extractModelSnapshot(result) }
    catch(e) { setError('extractModelSnapshot: ' + e.message); return null }
  }, [result])

  const debtSchedule = useMemo(() => {
    try { return buildDebtSchedule(debtObligations || [], 24) }
    catch(e) { setError('buildDebtSchedule: ' + e.message); return null }
  }, [debtObligations])

  const creditRisk = useMemo(() => {
    if (!snapshot || !debtSchedule) return null
    try { return buildCreditRiskAssessment(snapshot, debtSchedule) }
    catch(e) { setError('buildCreditRiskAssessment: ' + e.message); return null }
  }, [snapshot, debtSchedule])

  if (error) return (
    <div style={{background:'#FDF0EE',border:'1px solid #C0392B',borderRadius:8,padding:'1.5rem',color:'#C0392B',fontFamily:'monospace',fontSize:'0.85rem'}}>
      <strong>Analytics Error:</strong> {error}
    </div>
  )

  if (!snapshot || !debtSchedule || !creditRisk) return (
    <div style={{padding:'2rem',color:CC.slate}}>Loading analytics...</div>
  )

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <div style={{background:CC.white,border:`1px solid ${CC.border}`,borderRadius:8,padding:'1.5rem',marginBottom:'1.25rem'}}>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:CC.navy,marginBottom:'1rem'}}>Credit Risk — {clientName}</div>
        <div style={{display:'flex',alignItems:'center',gap:'1.5rem',flexWrap:'wrap'}}>
          <div>
            <div style={{fontFamily:'monospace',fontSize:'0.7rem',color:CC.slate,marginBottom:'0.3rem'}}>CLASSIFICATION</div>
            <span style={{fontFamily:'monospace',fontSize:'0.85rem',fontWeight:700,padding:'0.3rem 0.8rem',borderRadius:20,background:creditRisk.classification==='Stable'?CC.green:creditRisk.classification==='At Risk'?CC.amber:CC.red,color:CC.white}}>{creditRisk.classification}</span>
          </div>
          <div>
            <div style={{fontFamily:'monospace',fontSize:'0.7rem',color:CC.slate,marginBottom:'0.3rem'}}>SCORE</div>
            <div style={{fontFamily:'Georgia,serif',fontSize:'2rem',fontWeight:700,color:CC.navy}}>{creditRisk.score}<span style={{fontSize:'1rem',color:CC.slate}}>/100</span></div>
          </div>
          <div>
            <div style={{fontFamily:'monospace',fontSize:'0.7rem',color:CC.slate,marginBottom:'0.3rem'}}>AVG DSCR Y1</div>
            <div style={{fontFamily:'Georgia,serif',fontSize:'2rem',fontWeight:700,color:creditRisk.dscrAvgY1>=1.5?CC.green:creditRisk.dscrAvgY1>=1.0?CC.amber:CC.red}}>{creditRisk.dscrAvgY1.toFixed(2)}<span style={{fontSize:'1rem',color:CC.slate}}>x</span></div>
          </div>
          <div>
            <div style={{fontFamily:'monospace',fontSize:'0.7rem',color:CC.slate,marginBottom:'0.3rem'}}>REVENUE TREND</div>
            <div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:creditRisk.revenueGrowthTrend==='growing'?CC.green:creditRisk.revenueGrowthTrend==='stable'?CC.amber:CC.red,textTransform:'capitalize'}}>{creditRisk.revenueGrowthTrend}</div>
          </div>
        </div>
        <div style={{marginTop:'1rem'}}>
          {creditRisk.flags.map((f,i) => (
            <div key={i} style={{background:f.type==='red'?'#FDF0EE':f.type==='green'?'#E8F5EE':'#FFF8E8',border:`1px solid ${f.type==='red'?CC.red:f.type==='green'?CC.green:CC.amber}`,borderRadius:6,padding:'0.65rem 0.85rem',marginBottom:'0.5rem',fontSize:'0.85rem',color:CC.navy}}>
              {f.message}
            </div>
          ))}
        </div>
        <div style={{marginTop:'1rem',fontSize:'0.8rem',color:CC.slate,fontStyle:'italic'}}>{creditRisk.rationale}</div>
      </div>
      <div style={{background:'#E8F5EE',border:`1px solid ${CC.green}`,borderRadius:6,padding:'1rem',fontSize:'0.85rem',color:CC.navy}}>
        Full analytics (Going Concern, Investment Readiness, Close-Out, 6-Month Projection) coming next session.
      </div>
    </div>
  )
}
