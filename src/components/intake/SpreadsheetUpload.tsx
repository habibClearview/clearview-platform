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

export default function SpreadsheetUpload({intakeToken,programmeId,existingClient,onSuccess}:{intakeToken?:string,programmeId?:string,existingClient?:{id:string,name:string},onSuccess?:(clientId:string)=>void}) {
  const [file, setFile] = useState<File|null>(null)
  const [parsing, setParsing] = useState(false)
  const [preview, setPreview] = useState<any|null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  // The client we just created, kept so we can offer a one-click CEO invite
  // on the success screen using the email captured in the sheet.
  const [created, setCreated] = useState<{id:string,email:string,name:string}|null>(null)
  const [inviteState, setInviteState] = useState<'idle'|'sending'|'sent'|'error'>('idle')
  const [inviteMsg, setInviteMsg] = useState('')

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

      // Either load into an existing client (chosen from the coach dashboard) or
      // create a brand-new one. Loading into an existing client does NOT touch
      // its organisation/Cover record — it only (re)loads the financial model,
      // actuals and catalogue — so it can't overwrite the client's contact
      // details or duplicate the client.
      let clientId: string
      if (existingClient) {
        clientId = existingClient.id
      } else {
        const { data: client, error: clientErr } = await supabase.from('engagement_clients').insert([{
          id: genId('client'), name: business.business_name, slug, type: 'service_lsp',
          engagement_mode: 'financial', status: 'setup', country: business.country, sector: business.sector,
          contact_name: business.contact_name, contact_email: business.contact_email, contact_phone: business.contact_phone,
          clearview_active: true, programme_id: programmeId || null,
          start_date: new Date().toISOString().split('T')[0],
          notes: `Self-submitted intake (spreadsheet upload). Structure: ${hasUnits?'Multiple units':'Single business'}.`,
        }]).select().single()
        if (clientErr) throw clientErr
        clientId = client.id
      }

      const { businessUnits, planLines, totalMonths, actualsRows, catalogueRows } = buildPlanFromParsedUpload(preview, genId)

      const configFields = {
        business_name: business.business_name, currency: business.currency,
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
      }

      if (existingClient) {
        // Load into an existing client. To avoid ANY chance of wiping a live
        // model, this is only allowed when the client's model is still empty
        // (no plan lines). If it already has a model, refuse and tell the coach
        // to edit it in Settings/Planning instead. This also sidesteps any
        // ambiguity about the upsert conflict key: we explicitly UPDATE the
        // existing (empty) config row, or INSERT one if none exists yet.
        const { data: existingCfg, error: cfgReadErr } = await supabase
          .from('generic_model_config').select('id, plan_lines').eq('client_id', clientId).maybeSingle()
        if (cfgReadErr) throw cfgReadErr
        if (existingCfg && Array.isArray(existingCfg.plan_lines) && existingCfg.plan_lines.length > 0) {
          setError(`${existingClient.name} already has a financial model, so loading a file would overwrite it. Loading a file into an existing client is only for one whose model is still empty. To change a model that already has figures, edit it in Settings and Planning (or clear it first).`)
          setSubmitting(false)
          return
        }
        if (existingCfg) {
          const { error: updErr } = await supabase.from('generic_model_config').update(configFields).eq('client_id', clientId)
          if (updErr) throw updErr
        } else {
          const { error: insErr } = await supabase.from('generic_model_config').insert([{ client_id: clientId, ...configFields }])
          if (insErr) throw insErr
        }
      } else {
        const { error: configErr } = await supabase.from('generic_model_config').insert([{ client_id: clientId, ...configFields }])
        if (configErr) throw configErr
      }

      for (const { unit_id, period, values } of actualsRows) {
        await supabase.from('generic_actuals').upsert({
          client_id: clientId, unit_id, period,
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
            const catRes = await fetch('/api/ingest-catalogue', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify({ clientId, items: catalogueRows }),
            })
            // Non-fatal (the client + financial model are already saved), but
            // never silent: log so a failing catalogue load is detectable.
            if (!catRes.ok) console.error('Catalogue ingest failed:', catRes.status, await catRes.text().catch(()=>''))
          } else {
            console.warn('Catalogue not loaded: no session token (anonymous intake upload). The financial model was saved; add the catalogue from the coach dashboard.')
          }
        } catch (e) { console.error('Catalogue ingest request errored (non-fatal):', e) }
      }

      setCreated({ id: clientId, email: business.contact_email || '', name: business.contact_name || '' })
      setSubmitted(true)
      if (onSuccess) onSuccess(clientId)
    } catch(e:any) {
      setError(e.message || 'Upload failed.')
    }
    setSubmitting(false)
  }

  // One-click CEO invite: uses the coach's session to send the invitation to
  // the email captured in the sheet. Only works for a signed-in coach — on the
  // anonymous intake link there's no session, so we show guidance instead.
  async function sendCeoInvite() {
    if (!created?.email) return
    setInviteState('sending'); setInviteMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setInviteState('error')
        setInviteMsg('You need to be signed in as the coach to send the invite. Open this client from your coach dashboard and use “Client team & logins”.')
        return
      }
      const res = await fetch('/api/invite-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: created.email, fullName: created.name || created.email, role: 'ceo',
          clientId: created.id, assignedUnitIds: [], coImplementerId: null, funderProgrammeId: null,
          inviterToken: session.access_token,
        }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) { setInviteState('error'); setInviteMsg(data.error || 'Could not send the invitation.'); return }
      setInviteState('sent'); setInviteMsg(`Invitation sent to ${created.email}. They'll get an email to set their password.`)
    } catch {
      setInviteState('error'); setInviteMsg('Could not send the invitation. Please try from the coach dashboard.')
    }
  }

  if (submitted) return (
    <div style={{...card,textAlign:'center'}}>
      <div style={{fontSize:'2rem',marginBottom:'1rem'}}>✓</div>
      <div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:C.navy,marginBottom:'0.5rem'}}>Uploaded successfully</div>
      <p style={{color:C.slate,fontSize:'0.88rem'}}>{existingClient ? `The figures were loaded into ${existingClient.name}.` : 'The client has been created and their data loaded into Clearview.'}</p>
      {created?.email && inviteState !== 'sent' && (
        <div style={{marginTop:'1.25rem'}}>
          <button style={btn(C.teal)} disabled={inviteState==='sending'} onClick={sendCeoInvite}>
            {inviteState==='sending' ? 'Sending…' : `Send CEO login invite to ${created.email}`}
          </button>
          <p style={{fontSize:'0.78rem',color:C.slate,marginTop:'0.5rem'}}>Sends the CEO an email to set their password. You can also do this later from the coach dashboard.</p>
        </div>
      )}
      {inviteState==='sent' && <div style={{marginTop:'1.1rem',color:C.green,fontSize:'0.9rem'}}>✓ {inviteMsg}</div>}
      {inviteState==='error' && <div style={{marginTop:'1.1rem',color:C.red,fontSize:'0.85rem'}}>{inviteMsg}</div>}
      {!created?.email && <p style={{fontSize:'0.8rem',color:C.amber,marginTop:'0.9rem'}}>No CEO email was in the sheet, so no invite was sent. Add the CEO from the coach dashboard’s “Client team &amp; logins”.</p>}
    </div>
  )

  return (
    <div style={card}>
      <div style={secH}>{existingClient ? `Upload figures into ${existingClient.name}` : 'Upload Completed Spreadsheet'}</div>
      <p style={{fontSize:'0.85rem',color:C.slate,marginBottom:'1rem',lineHeight:1.7}}>{existingClient
        ? `Upload a completed Clearview Data Capture template (.xlsx). This loads the figures into ${existingClient.name} — it does NOT create a new client, and it leaves the organisation and contact details untouched.`
        : 'Upload a completed Clearview Data Capture template (.xlsx). This creates the client and loads their figures the same way the web form does.'}</p>
      {existingClient && (
        <div style={{fontSize:'0.82rem',color:C.amber,background:'#FBF3E2',border:`1px solid ${C.amber}`,borderRadius:5,padding:'0.6rem 0.7rem',marginBottom:'1rem'}}>
          This only works when {existingClient.name}’s model is still empty (nothing entered in Planning yet), so it can never overwrite figures that are already there. To add a brand-new client instead, close this and use “Upload Spreadsheet” at the top of the client list.
        </div>
      )}
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
        <button style={btn(C.green)} disabled={submitting} onClick={confirmUpload}>{submitting?(existingClient?'Loading figures...':'Creating client...'):(existingClient?`Confirm and load into ${existingClient.name}`:'Confirm and Create Client')}</button>
      )}
    </div>
  )
}
