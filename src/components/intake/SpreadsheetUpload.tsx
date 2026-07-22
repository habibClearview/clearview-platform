// @ts-nocheck
'use client'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { parseClearviewWorkbook, buildPlanFromParsedUpload } from '@/lib/spreadsheet-parser'

const C = {
  navy:'#1B2A4A', cyan:'#00B4D8', cream:'#F8F4EE', white:'#FFFFFF',
  slate:'#4A5A6A', border:'#D8E0E8', teal:'#1A9DAA',
  red:'#C0392B', green:'#1A7A4A', amber:'#B8860B',
}
const card = {background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.5rem',marginBottom:'1.25rem'}
const secH = {fontFamily:'Georgia,serif',fontSize:'1.1rem',fontWeight:700,color:C.navy,marginBottom:'0.75rem'}
const btn = (col=C.navy) => ({fontFamily:'monospace',fontSize:'0.85rem',fontWeight:600,padding:'0.6rem 1.4rem',border:'none',borderRadius:5,background:col,color:C.white,cursor:'pointer'})

function genId(prefix:string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}` }

// Parsing and plan-building logic now lives in src/lib/spreadsheet-parser.ts
// -- pure, no React/Supabase dependency, fully type-checked and unit
// tested against realistic workbook fixtures (see
// src/__tests__/spreadsheet-parser.test.ts). This component's job is
// just the UI: pick a file, show a preview, and write whatever the pure
// parser produced to the database on confirm.

export default function SpreadsheetUpload({intakeToken,programmeId,onSuccess}:{intakeToken?:string,programmeId?:string,onSuccess?:(clientId:string)=>void}) {
  const [file, setFile] = useState<File|null>(null)
  const [parsing, setParsing] = useState(false)
  const [preview, setPreview] = useState<any|null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleFile(f: File) {
    setFile(f)
    setParsing(true)
    setError('')
    setPreview(null)
    try {
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: false })
      const parsed = parseClearviewWorkbook(wb)
      setPreview(parsed)
    } catch(e:any) {
      setError(e.message || 'Could not read this file. Please make sure it is the Clearview Data Capture template.')
    }
    setParsing(false)
  }

  async function confirmUpload() {
    if (!preview) return
    setSubmitting(true)
    setError('')
    try {
      const { business, hasUnits, unassignedSheets, units } = preview
      const slug = business.business_name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')

      const { data: client, error: clientErr } = await supabase.from('engagement_clients').insert([{
        id: genId('client'), name: business.business_name, slug, type: 'service_lsp',
        engagement_mode: 'financial', status: 'setup', country: business.country, sector: business.sector,
        contact_name: business.contact_name, contact_email: business.contact_email, contact_phone: business.contact_phone,
        clearview_active: true, programme_id: programmeId || null,
        start_date: new Date().toISOString().split('T')[0],
        notes: `Self-submitted intake (spreadsheet upload). Structure: ${hasUnits?'Multiple units':'Single business'}.`,
      }]).select().single()
      if (clientErr) throw clientErr

      const { businessUnits, planLines, totalMonths, actualsRows, catalogueRows } = buildPlanFromParsedUpload(preview, genId)

      const { error: configErr } = await supabase.from('generic_model_config').insert([{
        client_id: client.id, business_name: business.business_name, currency: business.currency,
        start_date: new Date(new Date().setMonth(new Date().getMonth()-preview.pastMonths)).toISOString().split('T')[0],
        planning_months: totalMonths, business_units: businessUnits, plan_lines: planLines, shared_lines: [],
        settings: {
          shared_cost_fixed_pct: (business.shared_cost_fixed_pct ?? 50) / 100,
          corporate_tax_rate: (business.corporate_tax_rate ?? 30) / 100,
          opening_cash_balance: business.opening_cash_balance || 0,
          capital_structure: {
            shareholder_contribution: business.shareholder_contribution || 0,
            grant_non_repayable: business.grant_non_repayable || 0,
            grant_recoverable: business.grant_recoverable || 0,
            bank_loan: business.bank_loan || 0,
            annual_interest_rate: (business.annual_interest_rate ?? 18) / 100,
            loan_tenor_years: business.loan_tenor_years ?? 2,
            grace_period_months: business.grace_period_months || 0,
            fixed_assets: business.fixed_assets || 0,
          },
          dso_days: business.dso || 0,
          dpo_days: business.dpo || 0,
          season_name: business.season_name || '',
          year_round: business.year_round || 'Year-round',
          year_established: business.year_established || '',
          legal_structure: business.legal_structure || '',
          sales_channel: business.sales_channel || '',
          structure_confirmed: true,
          upload_note: unassignedSheets?.length>0 ? `Some sheets could not be matched to a unit by name (${unassignedSheets.join(', ')}) -- their products were placed under "${units[0]?.name}". Coach should review and reassign.` : '',
        },
      }])
      if (configErr) throw configErr

      for (const { unit_id, period, values } of actualsRows) {
        await supabase.from('generic_actuals').upsert({
          client_id: client.id, unit_id, period,
          line_values: values, submitted: true, submitted_at: new Date().toISOString(),
          submitted_by: business.contact_name, entered_by: business.contact_name,
        }, { onConflict: 'client_id,unit_id,period' })
      }

      // Load the product catalogue (v8 sheet), if any, into the field app.
      // These tables are service-role only, so this goes through a server
      // route that needs the caller's session token. On the anonymous intake
      // link there's no session — we skip it there (the financial model is
      // already saved; the coach can add the catalogue later). Any failure
      // here is non-fatal for the same reason.
      if (catalogueRows && catalogueRows.length > 0) {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.access_token) {
            await fetch('/api/ingest-catalogue', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify({ clientId: client.id, items: catalogueRows }),
            })
          }
        } catch { /* non-fatal: the client and financial model are already saved */ }
      }

      setSubmitted(true)
      if (onSuccess) onSuccess(client.id)
    } catch(e:any) {
      setError(e.message || 'Upload failed.')
    }
    setSubmitting(false)
  }

  if (submitted) return (
    <div style={{...card,textAlign:'center'}}>
      <div style={{fontSize:'2rem',marginBottom:'1rem'}}>✓</div>
      <div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:C.navy,marginBottom:'0.5rem'}}>Uploaded successfully</div>
      <p style={{color:C.slate,fontSize:'0.88rem'}}>The client has been created and their data loaded into Clearview.</p>
    </div>
  )

  return (
    <div style={card}>
      <div style={secH}>Upload Completed Spreadsheet</div>
      <p style={{fontSize:'0.85rem',color:C.slate,marginBottom:'1rem',lineHeight:1.7}}>Upload a completed Clearview Data Capture template (.xlsx). This creates the client and loads their figures the same way the web form does.</p>
      <input type="file" accept=".xlsx" onChange={e=>e.target.files?.[0] && handleFile(e.target.files[0])} style={{marginBottom:'1rem'}}/>
      {parsing && <p style={{color:C.slate,fontSize:'0.85rem'}}>Reading file...</p>}
      {error && <div style={{color:C.red,fontSize:'0.85rem',padding:'0.7rem',background:'#FDF0EE',borderRadius:5,marginBottom:'1rem'}}>{error}</div>}
      {preview && (
        <div style={{background:'#EBF8FF',borderRadius:6,padding:'1rem',marginBottom:'1rem'}}>
          <div style={{fontWeight:700,color:C.navy,marginBottom:'0.5rem'}}>{preview.business.business_name}</div>
          <div style={{fontSize:'0.82rem',color:C.slate,marginBottom:'0.3rem'}}>{preview.business.contact_name} · {preview.business.contact_email} · {preview.business.country}</div>
          <div style={{fontSize:'0.82rem',color:C.slate,marginBottom:'0.3rem'}}>Structure: {preview.hasUnits ? `${preview.units.length} units: ${preview.units.map((u:any)=>u.name).join(', ')}` : 'Single business'}</div>
          {preview.hasUnits ? (
            preview.units.map((u:any)=>{
              const unitProducts = preview.products.filter((p:any)=>p.unitName===u.name)
              return (
                <div key={u.name} style={{fontSize:'0.82rem',color:C.slate,marginBottom:'0.2rem'}}>
                  <strong style={{color:C.navy}}>{u.name}:</strong> {unitProducts.length>0 ? unitProducts.map((p:any)=>p.name).join(', ') : <em>no products found for this part</em>}
                </div>
              )
            })
          ) : (
            <div style={{fontSize:'0.82rem',color:C.slate,marginBottom:'0.3rem'}}>Products: {preview.products.map((p:any)=>p.name).join(', ')}</div>
          )}
          <div style={{fontSize:'0.82rem',color:C.slate,marginTop:'0.4rem'}}>{preview.pastMonths} months past data · {preview.futureMonths} months forward plan</div>
          {preview.catalogue?.length>0 && (
            <div style={{fontSize:'0.82rem',color:C.green,marginTop:'0.3rem'}}>Catalogue: {preview.catalogue.length} priced item{preview.catalogue.length===1?'':'s'} for the field app</div>
          )}
          {preview.unassignedSheets?.length>0 && (
            <p style={{fontSize:'0.78rem',color:C.amber,marginTop:'0.6rem'}}>Note: the sheet(s) "{preview.unassignedSheets.join(', ')}" did not have a "Which Part Is This For?" value matching a named part, so their products were placed under "{preview.units[0]?.name}". You should review and reassign these.</p>
          )}
        </div>
      )}
      {preview && (
        <button style={btn(C.green)} disabled={submitting} onClick={confirmUpload}>{submitting?'Creating client...':'Confirm and Create Client'}</button>
      )}
    </div>
  )
}
