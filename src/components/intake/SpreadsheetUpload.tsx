// @ts-nocheck
'use client'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'

const C = {
  navy:'#1B2A4A', cyan:'#00B4D8', cream:'#F8F4EE', white:'#FFFFFF',
  slate:'#4A5A6A', border:'#D8E0E8', teal:'#1A9DAA',
  red:'#C0392B', green:'#1A7A4A', amber:'#B8860B',
}
const card = {background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.5rem',marginBottom:'1.25rem'}
const secH = {fontFamily:'Georgia,serif',fontSize:'1.1rem',fontWeight:700,color:C.navy,marginBottom:'0.75rem'}
const btn = (col=C.navy) => ({fontFamily:'monospace',fontSize:'0.85rem',fontWeight:600,padding:'0.6rem 1.4rem',border:'none',borderRadius:5,background:col,color:C.white,cursor:'pointer'})

function genId(prefix:string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}` }

const PRODUCT_BLOCK_START_ROW = 7  // 1-indexed, B7 = first product name
const ROWS_PER_PRODUCT = 7         // name, revenue, 4 cost lines, 1 spacer
const PRODUCT_SLOTS = 4
const COST_LINES_PER_PRODUCT = 4
const COMMON_COSTS_START_OFFSET = 1 // rows after last product block, before common cost header
const COMMON_COST_SLOTS = 4
const MONTH_START_COL = 2 // column C (0-indexed: A=0,B=1,C=2)

export default function SpreadsheetUpload({intakeToken,programmeId,onSuccess}:{intakeToken?:string,programmeId?:string,onSuccess?:(clientId:string)=>void}) {
  const [file, setFile] = useState<File|null>(null)
  const [parsing, setParsing] = useState(false)
  const [preview, setPreview] = useState<any|null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  function cellStr(ws:any, addr:string): string {
    const cell = ws[addr]
    return cell ? String(cell.v ?? '').trim() : ''
  }
  function cellNum(ws:any, addr:string): number {
    const cell = ws[addr]
    const v = cell ? cell.v : 0
    return typeof v === 'number' ? v : (parseFloat(v) || 0)
  }
  function colLetter(idx:number): string {
    let s = ''
    idx += 1
    while (idx > 0) {
      const rem = (idx - 1) % 26
      s = String.fromCharCode(65 + rem) + s
      idx = Math.floor((idx - 1) / 26)
    }
    return s
  }

  async function handleFile(f: File) {
    setFile(f)
    setParsing(true)
    setError('')
    setPreview(null)
    try {
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: false })

      const bd = wb.Sheets['Business Details']
      const st = wb.Sheets['Structure']
      const pf = wb.Sheets['Products & Figures']
      if (!bd || !st || !pf) throw new Error('This does not look like the Clearview Data Capture template. Missing required sheets.')

      const business = {
        business_name: cellStr(bd,'C4'),
        contact_name: cellStr(bd,'C5'),
        contact_email: cellStr(bd,'C6'),
        contact_phone: cellStr(bd,'C7'),
        country: cellStr(bd,'C8') || 'Uganda',
        sector: cellStr(bd,'C9'),
        currency: cellStr(bd,'C10') || 'UGX',
      }
      if (!business.business_name) throw new Error('Business Name is missing in the Business Details sheet.')

      const structureAnswer = cellStr(st,'C6').toLowerCase()
      const hasUnits = structureAnswer.startsWith('y')
      const units: {name:string}[] = []
      if (hasUnits) {
        for (let i = 9; i <= 13; i++) {
          const name = cellStr(st, `C${i}`)
          if (name) units.push({ name })
        }
      }

      // Detect month columns from header row 6: find "THIS MONTH" column, count columns either side
      const headerRow = 6
      let monthCols: number[] = []
      let thisMonthColIdx = -1
      for (let c = MONTH_START_COL; c < MONTH_START_COL + 30; c++) {
        const addr = `${colLetter(c)}${headerRow}`
        const val = cellStr(pf, addr)
        if (!val) break
        monthCols.push(c)
        if (val.toUpperCase().includes('THIS MONTH')) thisMonthColIdx = monthCols.length - 1
      }
      if (monthCols.length === 0) throw new Error('Could not find month columns in Products & Figures sheet.')
      const pastMonths = thisMonthColIdx >= 0 ? thisMonthColIdx : 0
      const futureMonths = monthCols.length - pastMonths - 1

      // Parse products
      const products: {name:string, costLines:{name:string,row:number}[], revenueRow:number}[] = []
      let row = PRODUCT_BLOCK_START_ROW
      for (let p = 0; p < PRODUCT_SLOTS; p++) {
        const name = cellStr(pf, `B${row}`)
        const revenueRow = row + 1
        const costLines: {name:string,row:number}[] = []
        for (let cl = 0; cl < COST_LINES_PER_PRODUCT; cl++) {
          const costRow = row + 2 + cl
          const costName = cellStr(pf, `C${costRow}`)
          if (costName) costLines.push({ name: costName, row: costRow })
        }
        if (name) products.push({ name, costLines, revenueRow })
        row += ROWS_PER_PRODUCT
      }

      // Parse common costs (only relevant when hasUnits is false)
      // Find the COMMON COSTS row by scanning column B for the label
      let commonRow = -1
      for (let r = row; r < row + 10; r++) {
        if (cellStr(pf, `B${r}`).toUpperCase().includes('COMMON COSTS')) { commonRow = r + 1; break }
      }
      const commonCosts: {name:string,row:number}[] = []
      if (commonRow > 0) {
        for (let cl = 0; cl < COMMON_COST_SLOTS; cl++) {
          const r = commonRow + cl
          const name = cellStr(pf, `C${r}`)
          if (name) commonCosts.push({ name, row: r })
        }
      }

      function readMonthValues(rowNum: number): number[] {
        return monthCols.map(c => cellNum(pf, `${colLetter(c)}${rowNum}`))
      }

      if (products.length === 0) throw new Error('No products found. Please name at least one product in the Products & Figures sheet.')

      setPreview({
        business, hasUnits, units, products, commonCosts,
        pastMonths, futureMonths, monthColsCount: monthCols.length,
        readMonthValues,
      })
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
      const { business, hasUnits, units, products, commonCosts, pastMonths, readMonthValues } = preview
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

      const businessUnits: any[] = []
      const planLines: any[] = []
      const totalMonths = Math.max(preview.monthColsCount, 24)

      function planArray(values:number[]): number[] {
        return Array.from({length:totalMonths},(_,i)=> values[i] ?? 0)
      }

      const wholeKey = 'whole'
      const keys = hasUnits ? units.map((u:any,i:number)=>({id:genId('unit'),name:u.name,idx:i})) : [{id:wholeKey,name:business.business_name,idx:0}]

      // Single-unit case: all products + common costs go under the one unit
      // Multi-unit case: this template does not capture per-unit product breakdown
      // (the spreadsheet does not ask which unit each product belongs to),
      // so all products are placed in the first unit and flagged for coach review.
      keys.forEach((k:any,ki:number)=>{
        businessUnits.push({
          id:k.id, name:k.name, short:(k.name||'').split(' ').map((w:string)=>w[0]).join('').toUpperCase().slice(0,4),
          type:'mixed', color:['#00B4D8','#1A9DAA','#B8860B','#6B4A8B','#1A7A4A'][ki%5],
          headcount:0, active:true, sort_order:ki,
        })
      })
      const primaryUnitId = keys[0].id

      products.forEach((p:any) => {
        const revId = genId('rev')
        planLines.push({ id: revId, unit_id: primaryUnitId, name: p.name, category:'revenue', line_type:'standard',
          monthly_plan: planArray(readMonthValues(p.revenueRow)), active:true })
        p.costLines.forEach((c:any) => {
          planLines.push({ id: genId('cost'), unit_id: primaryUnitId, name: `${p.name} — ${c.name}`, category:'cost_of_sales', line_type:'standard',
            monthly_plan: planArray(readMonthValues(c.row)), active:true })
        })
      })

      if (!hasUnits) {
        commonCosts.forEach((c:any) => {
          planLines.push({ id: genId('common'), unit_id: primaryUnitId, name: c.name, category:'direct_opex', line_type:'standard',
            monthly_plan: planArray(readMonthValues(c.row)), active:true })
        })
      }

      const { error: configErr } = await supabase.from('generic_model_config').insert([{
        client_id: client.id, business_name: business.business_name, currency: business.currency,
        start_date: new Date(new Date().setMonth(new Date().getMonth()-pastMonths)).toISOString().split('T')[0],
        planning_months: totalMonths, business_units: businessUnits, plan_lines: planLines, shared_lines: [],
        settings: { shared_cost_fixed_pct:0.5, corporate_tax_rate:0.30, opening_cash_balance:0,
          structure_confirmed: false,
          upload_note: hasUnits ? 'Uploaded via spreadsheet -- all products placed under first unit; coach should review and reassign to correct units.' : '' },
      }])
      if (configErr) throw configErr

      // Historical actuals: offsets < 0 relative to "this month" column
      for (const line of planLines) {
        for (let i = 0; i < pastMonths; i++) {
          const val = line.monthly_plan[i]
          if (!val) continue
          const offset = i - pastMonths
          const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()+offset)
          const period = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
          await supabase.from('generic_actuals').upsert({
            client_id: client.id, unit_id: line.unit_id, period,
            line_values: { [line.id]: val }, submitted: true, submitted_at: new Date().toISOString(),
            submitted_by: business.contact_name, entered_by: business.contact_name,
          }, { onConflict: 'client_id,unit_id,period' })
        }
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
          <div style={{fontSize:'0.82rem',color:C.slate,marginBottom:'0.3rem'}}>Products: {preview.products.map((p:any)=>p.name).join(', ')}</div>
          <div style={{fontSize:'0.82rem',color:C.slate}}>{preview.pastMonths} months past data · {preview.futureMonths} months forward plan</div>
          {preview.hasUnits && (
            <p style={{fontSize:'0.78rem',color:C.amber,marginTop:'0.6rem'}}>Note: this template does not record which unit each product belongs to. All products will be placed under "{preview.units[0]?.name}" -- you will need to reassign them to the correct units afterward.</p>
          )}
        </div>
      )}
      {preview && (
        <button style={btn(C.green)} disabled={submitting} onClick={confirmUpload}>{submitting?'Creating client...':'Confirm and Create Client'}</button>
      )}
    </div>
  )
}
