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

const WHICH_PART_ROW = 5           // B5 label, C5 = unit name entered by client
const HEADER_ROW = 7               // month headers now on row 7
const PRODUCT_BLOCK_START_ROW = 8  // 1-indexed, B8 = first product name
const ROWS_PER_PRODUCT = 7         // name, revenue, 4 cost lines, 1 spacer
const PRODUCT_SLOTS = 4
const COST_LINES_PER_PRODUCT = 4
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
      if (!bd) throw new Error('Business Details sheet not found. Please use the Clearview Data Capture template.')

      // Support both old template (sheets starting with "Products") and
      // new template v7. A real completed v7 template names each sheet
      // after its business unit -- "Unit 1 VET & LIVESTOCK", "Unit 2
      // AGRO-INPUT" -- not literally "Unit N Figures" (that pattern only
      // matches an UNUSED blank slot sheet, e.g. "Unit 5 Figures" on a
      // business with fewer than 5 units). Matching on "starts with Unit
      // <number>" catches every real per-unit sheet regardless of what
      // the user named the rest of it.
      const isNewTemplate = wb.SheetNames.some(n => /^unit\s*\d+/i.test(n))
      const productSheetNames = isNewTemplate
        ? wb.SheetNames.filter(n => /^unit\s*\d+/i.test(n))
        : wb.SheetNames.filter(n => n.toLowerCase().startsWith('products'))

      if (productSheetNames.length === 0) throw new Error('No Products & Figures sheet found. Please use the Clearview Data Capture template.')

      const business = {
        business_name: cellStr(bd,'C5'),
        contact_name: cellStr(bd,'C6'),
        contact_email: cellStr(bd,'C7'),
        contact_phone: cellStr(bd,'C8'),
        country: cellStr(bd,'C9') || 'Uganda',
        sector: cellStr(bd,'C10'),
        currency: cellStr(bd,'C11') || 'UGX',
        year_established: cellStr(bd,'C12'),
        legal_structure: cellStr(bd,'C13'),
        sales_channel: cellStr(bd,'C14'),
        season_name: cellStr(bd,'C20'),
        past_months: cellNum(bd,'C22') || 3,
        future_months: cellNum(bd,'C23') || 12,
        year_round: cellStr(bd,'C24') || 'Year-round',
        // Capital Structure (Section C, rows 28-36)
        shareholder_contribution: cellNum(bd,'C28') || 0,
        grant_non_repayable: cellNum(bd,'C29') || 0,
        grant_recoverable: cellNum(bd,'C30') || 0,
        bank_loan: cellNum(bd,'C31') || 0,
        annual_interest_rate: cellNum(bd,'C32') ?? 18,
        loan_tenor_years: cellNum(bd,'C33') ?? 2,
        grace_period_months: cellNum(bd,'C34') || 0,
        fixed_assets: cellNum(bd,'C35') || 0,
        opening_cash_balance: cellNum(bd,'C36') || 0,
        corporate_tax_rate: cellNum(bd,'C39') ?? 30,
        shared_cost_fixed_pct: cellNum(bd,'C40') ?? 50,
        dso: cellNum(bd,'C43') || 0,
        dpo: cellNum(bd,'C44') || 0,
      }
      if (!business.business_name) throw new Error('Business Name is missing in the Business Details sheet.')

      // Read business units from Business Details Section F (rows 50-57) for new template
      // or from Structure sheet for old template
      const st = wb.Sheets['Structure']
      let units: {name:string,headcount:number}[] = []

      if (isNewTemplate) {
        // New template: units in Business Details rows 50-57
        for (let r = 50; r <= 57; r++) {
          const name = cellStr(bd, `A${r}`)
          const hc = cellNum(bd, `C${r}`) || 0
          if (name) units.push({ name, headcount: hc })
        }
      } else if (st) {
        // Old template: units from Structure sheet
        const structureAnswer = cellStr(st,'C6').toLowerCase()
        if (structureAnswer.startsWith('y')) {
          for (let i = 9; i <= 13; i++) {
            const name = cellStr(st, `C${i}`)
            if (name) units.push({ name, headcount: 0 })
          }
        }
      }
      const hasUnits = units.length > 0

      // Parse every product sheet found. Each contributes products tagged with
      // the unit name declared in its "Which Part Is This For?" cell.
      type ParsedProduct = {name:string, costLines:{name:string,values:number[]}[], revenue:number[], unitName:string}
      const allProducts: ParsedProduct[] = []
      const allCommonCosts: {name:string,values:number[],unitName:string}[] = []
      let pastMonths = 0, futureMonths = 0, monthColsCount = 0
      const unassignedSheets: string[] = []

      for (const sheetName of productSheetNames) {
        const pf = wb.Sheets[sheetName]

        // Determine unit name for this sheet
        // New template: unit name in cell C4 ("BUSINESS UNIT NAME:" label
        // is in A4, the value the client typed is in C4)
        // Old template: unit name in WHICH_PART_ROW constant
        const sheetUnitName = isNewTemplate
          ? cellStr(pf, 'C4')
          : cellStr(pf, `C${WHICH_PART_ROW}`)

        // Find month columns
        // New template: headers in row 6, data starts col C (0-indexed col 2)
        // Old template: HEADER_ROW and MONTH_START_COL constants
        const headerRow = isNewTemplate ? 6 : HEADER_ROW
        const monthStartCol = isNewTemplate ? 2 : MONTH_START_COL

        let monthCols: number[] = []
        let thisMonthColIdx = -1
        for (let c = monthStartCol; c < monthStartCol + 30; c++) {
          const addr = `${colLetter(c)}${headerRow}`
          const val = cellStr(pf, addr)
          if (!val) break
          monthCols.push(c)
          const upper = val.toUpperCase()
          if (upper.includes('M0') || upper.includes('NOW') || upper.includes('THIS MONTH')) {
            thisMonthColIdx = monthCols.length - 1
          }
        }
        if (monthCols.length === 0) continue

        const sheetPast = thisMonthColIdx >= 0 ? thisMonthColIdx : 0
        const sheetFuture = monthCols.length - sheetPast - 1
        pastMonths = Math.max(pastMonths, sheetPast)
        futureMonths = Math.max(futureMonths, sheetFuture)
        monthColsCount = Math.max(monthColsCount, monthCols.length)

        function readVals(rowNum: number): number[] {
          return monthCols.map(c => {
            const v = cellNum(pf, `${colLetter(c)}${rowNum}`)
            return v ?? 0
          })
        }

        // Resolve unit -- flagged as "unassigned" only if this sheet
        // actually turns out to hold real data (checked below, after
        // parsing): an unused blank template sheet (e.g. a leftover
        // "Unit 5" slot on a business with only 4 units) still carries
        // its placeholder instruction text in the unit-name cell, which
        // would otherwise wrongly read as "an unmatched name" and flag a
        // sheet the coach never actually used.
        let resolvedUnitName = ''
        let unitNameUnmatched = false
        if (hasUnits) {
          if (!sheetUnitName) {
            unitNameUnmatched = true
            resolvedUnitName = units[0]?.name || ''
          } else {
            const match = units.find(u => u.name.trim().toLowerCase() === sheetUnitName.trim().toLowerCase())
            if (match) resolvedUnitName = match.name
            else { unitNameUnmatched = true; resolvedUnitName = units[0]?.name || '' }
          }
        }
        let sheetHadContent = false

        if (isNewTemplate) {
          // New template v7: paired rows, starting row 9 (row 8 is the
          // section header, note in C8; row 9 is the FIRST product's
          // Sales Revenue row, immediately followed by its Cost of Goods
          // row). Product name is in Col A on the Sales Revenue row only
          // (blank on the Cost of Goods row below it). Data starts Col C.
          //
          // Reads every product-pair row until hitting the literal
          // "STAFF COSTS" section header text, rather than assuming a
          // fixed 8-product count or stopping at the first blank pair --
          // a business that only filled in 2 of the template's 8 product
          // slots (real example: a unit selling just two product lines)
          // leaves slots 3-8 blank in the MIDDLE of the section, not at
          // the end, so stopping at the first blank pair both missed
          // nothing here but silently walked the row cursor no further
          // than that blank pair, which then threw off every section
          // below it (staff, overheads) that scans forward from wherever
          // the revenue section left off.
          const revSectionStart = 9
          let r = revSectionStart
          while (r < revSectionStart + 80) {
            if (cellStr(pf, `A${r}`).toUpperCase().includes('STAFF COSTS')) break
            const name = cellStr(pf, `A${r}`)
            const revenue = readVals(r)
            const cogValues = readVals(r + 1)
            if (name) {
              const costLines: {name:string,values:number[]}[] = []
              if (cogValues.some(v => v > 0)) costLines.push({ name: 'Cost of Goods', values: cogValues })
              allProducts.push({ name, costLines, revenue, unitName: resolvedUnitName })
              sheetHadContent = true
            }
            r += 2
          }

          // Staff and overheads sections: every real data row in both has
          // "Amount" in column B (the section header and blank spacer
          // rows between sections never do), so that's used as the row
          // marker rather than a fixed line count -- scan forward past
          // the header/spacer to find where each section's data starts,
          // then read every consecutive "Amount" row.
          function findAmountRow(fromRow: number): number {
            for (let scan = fromRow; scan < fromRow + 15; scan++) {
              if (cellStr(pf, `B${scan}`).toUpperCase() === 'AMOUNT') return scan
            }
            return -1
          }
          // section is 'staff' or 'overheads' -- carried through to
          // confirmUpload so it can set the model's distinct 'staff' vs
          // 'direct_opex' plan-line category (GenericDashboard's P&L
          // shows these as separate sections, and revenue-per-head reads
          // 'staff' specifically). Previously lost here, so every cost
          // line -- staff and overhead alike -- landed in 'direct_opex',
          // leaving the Staff section empty and Overheads inflated with
          // staff costs mixed in.
          function readAmountSection(fromRow: number, fallbackName: string, section: 'staff'|'overheads'): number {
            let row = fromRow
            while (cellStr(pf, `B${row}`).toUpperCase() === 'AMOUNT') {
              const name = cellStr(pf, `A${row}`)
              const vals = readVals(row)
              if (name || vals.some(v => v > 0)) {
                allCommonCosts.push({ name: name || fallbackName, values: vals, unitName: resolvedUnitName, section })
                sheetHadContent = true
              }
              row++
            }
            return row
          }
          // Only read cost lines for a sheet that actually named at least
          // one product -- the blank template ships with generic
          // placeholder labels ("Staff / Salaries", "Overheads")
          // pre-filled even on an unused unit slot, all figures zero;
          // without this guard an unused "Unit 5" sheet on a 4-unit
          // business would contribute two harmless-looking but noisy
          // zero-value cost lines and a spurious "unassigned sheet"
          // warning for a sheet the coach never touched.
          if (sheetHadContent) {
            const staffStart = findAmountRow(r)
            if (staffStart > 0) {
              const afterStaff = readAmountSection(staffStart, 'Staff', 'staff')
              const opexStart = findAmountRow(afterStaff)
              if (opexStart > 0) readAmountSection(opexStart, 'Overheads', 'overheads')
            }
          }

        } else {
          // Old template: name in col C, revenue on next row, cost lines following
          let row = PRODUCT_BLOCK_START_ROW
          for (let p = 0; p < PRODUCT_SLOTS; p++) {
            const name = cellStr(pf, `C${row}`)
            const revenueRow = row + 1
            const costLines: {name:string,values:number[]}[] = []
            for (let cl = 0; cl < COST_LINES_PER_PRODUCT; cl++) {
              const costRow = row + 2 + cl
              const costName = cellStr(pf, `C${costRow}`)
              if (costName) costLines.push({ name: costName, values: readVals(costRow) })
            }
            if (name) { allProducts.push({ name, costLines, revenue: readVals(revenueRow), unitName: resolvedUnitName }); sheetHadContent = true }
            row += ROWS_PER_PRODUCT
          }

          let commonRow = -1
          for (let r = row; r < row + 10; r++) {
            if (cellStr(pf, `B${r}`).toUpperCase().includes('COMMON COSTS')) { commonRow = r + 1; break }
          }
          if (commonRow > 0 && !hasUnits) {
            for (let cl = 0; cl < 4; cl++) {
              const r = commonRow + cl
              const name = cellStr(pf, `C${r}`)
              // Old template has no staff/overheads split -- one "Common
              // Costs" bucket, kept as overheads to match prior behaviour.
              if (name) { allCommonCosts.push({ name, values: readVals(r), unitName: resolvedUnitName, section: 'overheads' }); sheetHadContent = true }
            }
          }
        }

        if (unitNameUnmatched && sheetHadContent) unassignedSheets.push(sheetName)
      }

      if (allProducts.length === 0) throw new Error('No products found. Please name at least one product on a Products & Figures sheet.')

      setPreview({
        business, hasUnits, units, products: allProducts, commonCosts: allCommonCosts,
        pastMonths, futureMonths, monthColsCount, unassignedSheets,
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
      const { business, hasUnits, units, products, commonCosts, pastMonths, unassignedSheets } = preview
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
      // Build unit id lookup by name so products can be assigned to the correct unit.
      // `units` (with headcount already resolved for the new template, 0 for the
      // old one) came from handleFile's parse and is already sitting in `preview`
      // -- no need to re-read the Business Details sheet here, and re-reading it
      // isn't even possible: `bd` was a local inside handleFile, out of scope in
      // this function, so the previous version of this block threw a
      // ReferenceError on every single upload that reached this point.
      const unitIdByName: Record<string,string> = {}
      const keys = hasUnits
        ? units.map((u:any,i:number)=>({id:genId('unit'),name:u.name,headcount:u.headcount||0,idx:i}))
        : [{id:wholeKey,name:business.business_name,headcount:0,idx:0}]
      keys.forEach((k:any,ki:number)=>{
        unitIdByName[k.name] = k.id
        businessUnits.push({
          id:k.id, name:k.name, short:(k.name||'').split(' ').map((w:string)=>w[0]).join('').toUpperCase().slice(0,4),
          type:'mixed', color:['#00B4D8','#1A9DAA','#B8860B','#6B4A8B','#1A7A4A'][ki%5],
          headcount: k.headcount || 0, active:true, sort_order:ki,
        })
      })

      products.forEach((p:any) => {
        const unitId = hasUnits ? (unitIdByName[p.unitName] || keys[0].id) : wholeKey
        const revId = genId('rev')
        planLines.push({ id: revId, unit_id: unitId, name: p.name, category:'revenue', line_type:'standard',
          monthly_plan: planArray(p.revenue), active:true })
        p.costLines.forEach((c:any) => {
          planLines.push({ id: genId('cost'), unit_id: unitId, name: `${p.name} — ${c.name}`, category:'cost_of_sales', line_type:'standard',
            monthly_plan: planArray(c.values), active:true })
        })
      })

      commonCosts.forEach((c:any) => {
        const unitId = hasUnits ? (unitIdByName[c.unitName] || keys[0].id) : wholeKey
        // The model has a distinct 'staff' category from 'direct_opex'
        // (GenericDashboard's P&L shows them as separate sections, and
        // revenue-per-head reads 'staff' specifically) -- every cost
        // line used to land in 'direct_opex' regardless of which section
        // of the spreadsheet it actually came from.
        planLines.push({ id: genId('common'), unit_id: unitId, name: c.name, category: c.section==='staff'?'staff':'direct_opex', line_type:'standard',
          monthly_plan: planArray(c.values), active:true })
      })

      const { error: configErr } = await supabase.from('generic_model_config').insert([{
        client_id: client.id, business_name: business.business_name, currency: business.currency,
        start_date: new Date(new Date().setMonth(new Date().getMonth()-pastMonths)).toISOString().split('T')[0],
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

      // Historical actuals: offsets < 0 relative to "this month" column.
      // Grouped into ONE combined line_values object per (unit_id, period)
      // before upserting -- upserting once per (line, period), as this used
      // to, replaces the whole line_values JSON column on each write, so
      // every line but the last one processed for a given unit+period was
      // silently discarded. A unit almost always has more than one plan
      // line (revenue plus several cost lines), so this was losing real
      // data on every upload, not an edge case.
      // i <= pastMonths, not i < pastMonths -- pastMonths itself is the
      // "M0 (Now)" column, the current calendar month, not a future one.
      // The engine's own actual/plan calendar rule (isPastOrCurrentMonth
      // in generic-engine.ts) treats the current month as actual too;
      // excluding it here meant the exact month the client filled in as
      // "now" was silently never written as an actual at all, only ever
      // read back as a plan figure -- the P&L Variance view (which
      // compares actual to plan) showed zero actual for every unit.
      const actualsByUnitPeriod: Record<string, {unit_id:string, period:string, values:Record<string,number>}> = {}
      for (const line of planLines) {
        for (let i = 0; i <= pastMonths; i++) {
          const val = line.monthly_plan[i]
          if (!val) continue
          const offset = i - pastMonths
          const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()+offset)
          const period = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
          const key = `${line.unit_id}|${period}`
          if (!actualsByUnitPeriod[key]) actualsByUnitPeriod[key] = { unit_id: line.unit_id, period, values: {} }
          actualsByUnitPeriod[key].values[line.id] = val
        }
      }
      for (const { unit_id, period, values } of Object.values(actualsByUnitPeriod)) {
        await supabase.from('generic_actuals').upsert({
          client_id: client.id, unit_id, period,
          line_values: values, submitted: true, submitted_at: new Date().toISOString(),
          submitted_by: business.contact_name, entered_by: business.contact_name,
        }, { onConflict: 'client_id,unit_id,period' })
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
