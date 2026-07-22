// ============================================================
// Clearview Data Capture spreadsheet parser -- pure logic, no React, no
// Supabase, fully type-checked (unlike the UI component that calls it,
// SpreadsheetUpload.tsx, which is @ts-nocheck). Extracted specifically
// so this can be unit-tested against realistic workbook fixtures: three
// separate real-world bugs in this parsing logic (wrong sheet-name
// pattern, wrong row/column offsets, a hardcoded staff/overhead line
// count) all shipped to production undetected, because the only way
// they'd ever have been exercised before was a coach uploading a real
// completed file in a real browser. See src/__tests__/spreadsheet-parser.test.ts.
import * as XLSX from 'xlsx'

const WHICH_PART_ROW = 5           // Old template: B5 label, C5 = unit name entered by client
const HEADER_ROW = 7               // Old template: month headers on row 7
const PRODUCT_BLOCK_START_ROW = 8  // Old template: 1-indexed, C8 = first product name
const ROWS_PER_PRODUCT = 7         // Old template: name, revenue, 4 cost lines, 1 spacer
const PRODUCT_SLOTS = 4
const COST_LINES_PER_PRODUCT = 4
const MONTH_START_COL = 2          // Old template: column C (0-indexed: A=0,B=1,C=2)

function cellStr(ws: XLSX.WorkSheet, addr: string): string {
  const cell = (ws as any)[addr]
  return cell ? String(cell.v ?? '').trim() : ''
}
function cellNum(ws: XLSX.WorkSheet, addr: string): number {
  const cell = (ws as any)[addr]
  const v = cell ? cell.v : 0
  return typeof v === 'number' ? v : (parseFloat(v) || 0)
}
function colLetter(idx: number): string {
  let s = ''
  idx += 1
  while (idx > 0) {
    const rem = (idx - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    idx = Math.floor((idx - 1) / 26)
  }
  return s
}

export interface ParsedBusiness {
  business_name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  country: string
  sector: string
  currency: string
  year_established: string
  legal_structure: string
  sales_channel: string
  season_name: string
  past_months: number
  future_months: number
  year_round: string
  shareholder_contribution: number
  grant_non_repayable: number
  grant_recoverable: number
  bank_loan: number
  annual_interest_rate: number
  loan_tenor_years: number
  grace_period_months: number
  fixed_assets: number
  opening_cash_balance: number
  corporate_tax_rate: number
  shared_cost_fixed_pct: number
  dso: number
  dpo: number
}

export interface ParsedProduct {
  name: string
  costLines: { name: string; values: number[] }[]
  revenue: number[]
  unitName: string
}

export interface ParsedCommonCost {
  name: string
  values: number[]
  unitName: string
  section: 'staff' | 'overheads'
}

// One product row from the optional "Catalogue" sheet (v8+). This carries the
// field-app pricing detail (retail/cost price, unit label) and the grouping
// dimensions (category, type). It links to a revenue product by matching
// productName (and unitName when the business has units). Absent entirely on a
// v7 workbook, which simply has no Catalogue sheet.
export interface ParsedCatalogueItem {
  unitName: string
  productName: string
  category: string
  productType: string
  unitLabel: string
  retailPrice: number
  costPrice: number
}

export interface ParsedUpload {
  business: ParsedBusiness
  hasUnits: boolean
  units: { name: string; headcount: number }[]
  products: ParsedProduct[]
  commonCosts: ParsedCommonCost[]
  catalogue: ParsedCatalogueItem[]
  pastMonths: number
  futureMonths: number
  monthColsCount: number
  unassignedSheets: string[]
}

// Reads the optional "Catalogue" sheet. Returns [] when the sheet is absent
// (every v7 workbook) so callers never need to special-case template version.
// The header row is located by scanning for the row whose first two columns
// read like "Business Unit" / "Product", rather than a hardcoded row number,
// so small layout tweaks to the template don't silently misread every row.
export function parseCatalogueSheet(wb: XLSX.WorkBook): ParsedCatalogueItem[] {
  const cat = wb.Sheets['Catalogue']
  if (!cat) return []
  let headerRow = -1
  for (let r = 1; r <= 12; r++) {
    const a = cellStr(cat, `A${r}`).toLowerCase()
    const b = cellStr(cat, `B${r}`).toLowerCase()
    if (a.includes('business unit') && b.includes('product')) { headerRow = r; break }
  }
  if (headerRow < 0) return []

  const items: ParsedCatalogueItem[] = []
  for (let r = headerRow + 1; r < headerRow + 500; r++) {
    const product = cellStr(cat, `B${r}`)
    const unit = cellStr(cat, `A${r}`)
    // Stop only after a long run of blank rows; a single gap between entries
    // must not end the read. Peek ahead: if this row and the next 3 are all
    // blank in the Product column, we're past the data.
    if (!product) {
      const ahead = [1, 2, 3].every(k => !cellStr(cat, `B${r + k}`))
      if (ahead) break
      continue
    }
    // Skip the greyed sample row shipped in the blank template.
    if (product.toLowerCase().startsWith('(example)') || unit.toLowerCase().startsWith('(example)')) continue
    items.push({
      unitName: unit.replace(/^\(example\)\s*/i, '').trim(),
      productName: product.trim(),
      category: cellStr(cat, `C${r}`).trim(),
      productType: cellStr(cat, `D${r}`).trim(),
      unitLabel: cellStr(cat, `E${r}`).trim(),
      retailPrice: cellNum(cat, `F${r}`) || 0,
      costPrice: cellNum(cat, `G${r}`) || 0,
    })
  }
  return items
}

export function parseClearviewWorkbook(wb: XLSX.WorkBook): ParsedUpload {
  const bd = wb.Sheets['Business Details']
  if (!bd) throw new Error('Business Details sheet not found. Please use the Clearview Data Capture template.')

  // A real completed v7 template names each per-unit sheet after its
  // business unit -- "Unit 1 VET & LIVESTOCK", "Unit 2 AGRO-INPUT" -- not
  // literally "Unit N Figures" (that pattern only matches an UNUSED blank
  // slot sheet, e.g. "Unit 5 Figures" on a business with fewer than 5
  // units). Matching on "starts with Unit <number>" catches every real
  // per-unit sheet regardless of what the rest of the name is.
  const isNewTemplate = wb.SheetNames.some(n => /^unit\s*\d+/i.test(n))
  const productSheetNames = isNewTemplate
    ? wb.SheetNames.filter(n => /^unit\s*\d+/i.test(n))
    : wb.SheetNames.filter(n => n.toLowerCase().startsWith('products'))

  if (productSheetNames.length === 0) throw new Error('No Products & Figures sheet found. Please use the Clearview Data Capture template.')

  const business: ParsedBusiness = {
    business_name: cellStr(bd, 'C5'),
    contact_name: cellStr(bd, 'C6'),
    contact_email: cellStr(bd, 'C7'),
    contact_phone: cellStr(bd, 'C8'),
    country: cellStr(bd, 'C9') || 'Uganda',
    sector: cellStr(bd, 'C10'),
    currency: cellStr(bd, 'C11') || 'UGX',
    year_established: cellStr(bd, 'C12'),
    legal_structure: cellStr(bd, 'C13'),
    sales_channel: cellStr(bd, 'C14'),
    season_name: cellStr(bd, 'C20'),
    past_months: cellNum(bd, 'C22') || 3,
    future_months: cellNum(bd, 'C23') || 12,
    year_round: cellStr(bd, 'C24') || 'Year-round',
    shareholder_contribution: cellNum(bd, 'C28') || 0,
    grant_non_repayable: cellNum(bd, 'C29') || 0,
    grant_recoverable: cellNum(bd, 'C30') || 0,
    bank_loan: cellNum(bd, 'C31') || 0,
    annual_interest_rate: cellNum(bd, 'C32') ?? 18,
    loan_tenor_years: cellNum(bd, 'C33') ?? 2,
    grace_period_months: cellNum(bd, 'C34') || 0,
    fixed_assets: cellNum(bd, 'C35') || 0,
    opening_cash_balance: cellNum(bd, 'C36') || 0,
    corporate_tax_rate: cellNum(bd, 'C39') ?? 30,
    shared_cost_fixed_pct: cellNum(bd, 'C40') ?? 50,
    dso: cellNum(bd, 'C43') || 0,
    dpo: cellNum(bd, 'C44') || 0,
  }
  if (!business.business_name) throw new Error('Business Name is missing in the Business Details sheet.')

  // Business units: Section F (rows 50-57) for the new template, or the
  // Structure sheet for the old one.
  const st = wb.Sheets['Structure']
  const units: { name: string; headcount: number }[] = []
  if (isNewTemplate) {
    for (let r = 50; r <= 57; r++) {
      const name = cellStr(bd, `A${r}`)
      const hc = cellNum(bd, `C${r}`) || 0
      if (name) units.push({ name, headcount: hc })
    }
  } else if (st) {
    const structureAnswer = cellStr(st, 'C6').toLowerCase()
    if (structureAnswer.startsWith('y')) {
      for (let i = 9; i <= 13; i++) {
        const name = cellStr(st, `C${i}`)
        if (name) units.push({ name, headcount: 0 })
      }
    }
  }
  const hasUnits = units.length > 0

  const allProducts: ParsedProduct[] = []
  const allCommonCosts: ParsedCommonCost[] = []
  let pastMonths = 0, futureMonths = 0, monthColsCount = 0
  const unassignedSheets: string[] = []

  for (const sheetName of productSheetNames) {
    const pf = wb.Sheets[sheetName]

    // Unit name: new template has it in C4 ("BUSINESS UNIT NAME:" label
    // is in A4, the value the client typed is in C4); old template uses
    // WHICH_PART_ROW.
    const sheetUnitName = isNewTemplate ? cellStr(pf, 'C4') : cellStr(pf, `C${WHICH_PART_ROW}`)

    // Month columns: new template headers are on row 6, starting at
    // column C (0-indexed col 2); old template uses HEADER_ROW/MONTH_START_COL.
    const headerRow = isNewTemplate ? 6 : HEADER_ROW
    const monthStartCol = isNewTemplate ? 2 : MONTH_START_COL

    const monthCols: number[] = []
    let thisMonthColIdx = -1
    for (let c = monthStartCol; c < monthStartCol + 30; c++) {
      const val = cellStr(pf, `${colLetter(c)}${headerRow}`)
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

    const readVals = (rowNum: number): number[] => monthCols.map(c => cellNum(pf, `${colLetter(c)}${rowNum}`) ?? 0)

    // Resolve unit -- flagged as "unassigned" only if this sheet turns
    // out to hold real data (checked at the end of the loop iteration):
    // an unused blank template sheet (e.g. a leftover "Unit 5" slot on a
    // business with only 4 units) still carries its placeholder
    // instruction text in the unit-name cell, which would otherwise
    // wrongly read as "an unmatched name" and flag a sheet the coach
    // never actually used.
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
      // section header, note in C8; row 9 is the FIRST product's Sales
      // Revenue row, immediately followed by its Cost of Goods row).
      // Product name is in Col A on the Sales Revenue row only. Data
      // starts Col C.
      //
      // Reads every product-pair row until hitting the literal "STAFF
      // COSTS" section header text, rather than assuming a fixed
      // 8-product count or stopping at the first blank pair -- a
      // business that only filled in 2 of the template's 8 product slots
      // leaves slots 3-8 blank in the MIDDLE of the section, not at the
      // end.
      const revSectionStart = 9
      let r = revSectionStart
      while (r < revSectionStart + 80) {
        if (cellStr(pf, `A${r}`).toUpperCase().includes('STAFF COSTS')) break
        const name = cellStr(pf, `A${r}`)
        const revenue = readVals(r)
        const cogValues = readVals(r + 1)
        if (name) {
          const costLines: { name: string; values: number[] }[] = []
          if (cogValues.some(v => v > 0)) costLines.push({ name: 'Cost of Goods', values: cogValues })
          allProducts.push({ name, costLines, revenue, unitName: resolvedUnitName })
          sheetHadContent = true
        }
        r += 2
      }

      // Staff and overheads sections: every real data row in both has
      // "Amount" in column B (the section header and blank spacer rows
      // between sections never do), so that's used as the row marker
      // rather than a fixed line count.
      const findAmountRow = (fromRow: number): number => {
        for (let scan = fromRow; scan < fromRow + 15; scan++) {
          if (cellStr(pf, `B${scan}`).toUpperCase() === 'AMOUNT') return scan
        }
        return -1
      }
      const readAmountSection = (fromRow: number, fallbackName: string, section: 'staff' | 'overheads'): number => {
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
      // one product -- the blank template ships with generic placeholder
      // labels ("Staff / Salaries", "Overheads") pre-filled even on an
      // unused unit slot, all figures zero.
      if (sheetHadContent) {
        const staffStart = findAmountRow(r)
        if (staffStart > 0) {
          const afterStaff = readAmountSection(staffStart, 'Staff', 'staff')
          const opexStart = findAmountRow(afterStaff)
          if (opexStart > 0) readAmountSection(opexStart, 'Overheads', 'overheads')
        }
      }
    } else {
      // Old template: name in col C, revenue on next row, cost lines following.
      let row = PRODUCT_BLOCK_START_ROW
      for (let p = 0; p < PRODUCT_SLOTS; p++) {
        const name = cellStr(pf, `C${row}`)
        const revenueRow = row + 1
        const costLines: { name: string; values: number[] }[] = []
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

  return {
    business, hasUnits, units, products: allProducts, commonCosts: allCommonCosts,
    catalogue: parseCatalogueSheet(wb),
    pastMonths, futureMonths, monthColsCount, unassignedSheets,
  }
}

export interface BuiltPlanLine {
  id: string
  unit_id: string
  name: string
  category: 'revenue' | 'cost_of_sales' | 'staff' | 'direct_opex'
  line_type: 'standard'
  monthly_plan: number[]
  active: true
}

export interface BuiltActualsRow {
  unit_id: string
  period: string
  values: Record<string, number>
}

// A field-catalogue row ready to be written by the /api/ingest-catalogue
// server route. category / productType are carried as NAMES; the server
// resolves them to catalogue_value_lists ids (creating the list entry if it
// doesn't exist yet). plan_line_id is the revenue line this item's sales roll
// up into (null if the catalogue product name didn't match any revenue line).
// cost_price is only carried when there is a cogs_plan_line_id to post the
// cost against — the database enforces that a costed item always has one.
export interface BuiltCatalogueRow {
  business_unit_id: string
  plan_line_id: string | null
  cogs_plan_line_id: string | null
  name: string
  category: string
  product_type: string
  unit_label: string
  price: number
  cost_price: number | null
}

export interface BuiltPlan {
  businessUnits: { id: string; name: string; short: string; type: string; color: string; headcount: number; active: true; sort_order: number }[]
  planLines: BuiltPlanLine[]
  totalMonths: number
  actualsRows: BuiltActualsRow[]
  catalogueRows: BuiltCatalogueRow[]
}

// Turns a ParsedUpload into the plan lines, business units, and actuals
// rows to write to the database. Pure and deterministic given `now` and
// `genId` -- no Supabase calls -- so it's directly testable, including
// the exact period-string math that determines which calendar month
// each historical actuals row lands on.
export function buildPlanFromParsedUpload(parsed: ParsedUpload, genId: (prefix: string) => string, now: Date = new Date()): BuiltPlan {
  const { business, hasUnits, units, products, commonCosts, catalogue, pastMonths } = parsed
  const totalMonths = Math.max(parsed.monthColsCount, 24)
  const planArray = (values: number[]): number[] => Array.from({ length: totalMonths }, (_, i) => values[i] ?? 0)

  const wholeKey = 'whole'
  const unitIdByName: Record<string, string> = {}
  const keys = hasUnits
    ? units.map((u, i) => ({ id: genId('unit'), name: u.name, headcount: u.headcount || 0, idx: i }))
    : [{ id: wholeKey, name: business.business_name, headcount: 0, idx: 0 }]

  const businessUnits: BuiltPlan['businessUnits'] = keys.map((k, ki) => {
    unitIdByName[k.name] = k.id
    return {
      id: k.id, name: k.name, short: (k.name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 4),
      type: 'mixed', color: ['#00B4D8', '#1A9DAA', '#B8860B', '#6B4A8B', '#1A7A4A'][ki % 5],
      headcount: k.headcount || 0, active: true, sort_order: ki,
    }
  })

  const planLines: BuiltPlanLine[] = []
  // Remember each product's revenue line id and its first cost-of-sales line
  // id, keyed by unit+product name, so catalogue rows can be linked to the
  // exact plan lines this same upload creates.
  const revLineByKey: Record<string, string> = {}
  const cogsLineByKey: Record<string, string> = {}
  const keyFor = (unitId: string, name: string) => `${unitId}|${(name || '').trim().toLowerCase()}`
  products.forEach(p => {
    const unitId = hasUnits ? (unitIdByName[p.unitName] || keys[0].id) : wholeKey
    const revId = genId('rev')
    planLines.push({ id: revId, unit_id: unitId, name: p.name, category: 'revenue', line_type: 'standard', monthly_plan: planArray(p.revenue), active: true })
    revLineByKey[keyFor(unitId, p.name)] = revId
    p.costLines.forEach(c => {
      const costId = genId('cost')
      planLines.push({ id: costId, unit_id: unitId, name: `${p.name} — ${c.name}`, category: 'cost_of_sales', line_type: 'standard', monthly_plan: planArray(c.values), active: true })
      if (!cogsLineByKey[keyFor(unitId, p.name)]) cogsLineByKey[keyFor(unitId, p.name)] = costId
    })
  })
  commonCosts.forEach(c => {
    const unitId = hasUnits ? (unitIdByName[c.unitName] || keys[0].id) : wholeKey
    // The model has a distinct 'staff' category from 'direct_opex' --
    // GenericDashboard's P&L shows them as separate sections, and
    // revenue-per-head reads 'staff' specifically.
    planLines.push({ id: genId('common'), unit_id: unitId, name: c.name, category: c.section === 'staff' ? 'staff' : 'direct_opex', line_type: 'standard', monthly_plan: planArray(c.values), active: true })
  })

  // Historical actuals: i <= pastMonths, not i < pastMonths -- pastMonths
  // itself is the "M0 (Now)" column, the current calendar month, not a
  // future one. Grouped into ONE combined line_values object per
  // (unit_id, period) -- upserting once per (line, period) would each
  // overwrite the whole line_values JSON column, discarding every other
  // line already written for the same unit+period.
  const actualsByUnitPeriod: Record<string, BuiltActualsRow> = {}
  for (const line of planLines) {
    for (let i = 0; i <= pastMonths; i++) {
      const val = line.monthly_plan[i]
      if (!val) continue
      const offset = i - pastMonths
      const d = new Date(now)
      d.setDate(1)
      d.setMonth(d.getMonth() + offset)
      const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      const key = `${line.unit_id}|${period}`
      if (!actualsByUnitPeriod[key]) actualsByUnitPeriod[key] = { unit_id: line.unit_id, period, values: {} }
      actualsByUnitPeriod[key].values[line.id] = val
    }
  }

  // Catalogue rows: link each catalogue item to the revenue line (and, when
  // it has a cost price, the cost-of-sales line) this upload just created.
  const catalogueRows: BuiltCatalogueRow[] = (catalogue || []).map(item => {
    const unitId = hasUnits ? (unitIdByName[item.unitName] || keys[0].id) : wholeKey
    const key = keyFor(unitId, item.productName)
    const planLineId = revLineByKey[key] || null
    const cogsLineId = cogsLineByKey[key] || null
    // Only carry a cost price when there's a cost-of-sales line to post it
    // against — the database rejects a costed item with no COGS line.
    const cost = item.costPrice > 0 && cogsLineId ? item.costPrice : null
    return {
      business_unit_id: unitId,
      plan_line_id: planLineId,
      cogs_plan_line_id: cost != null ? cogsLineId : null,
      name: item.productName,
      category: item.category,
      product_type: item.productType,
      unit_label: item.unitLabel,
      price: item.retailPrice,
      cost_price: cost,
    }
  })

  return { businessUnits, planLines, totalMonths, actualsRows: Object.values(actualsByUnitPeriod), catalogueRows }
}
