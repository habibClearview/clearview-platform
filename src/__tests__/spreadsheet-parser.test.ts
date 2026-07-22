import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseClearviewWorkbook, buildPlanFromParsedUpload } from '../lib/spreadsheet-parser'

// Builds a worksheet from a sparse {cellAddress: value} map -- lets each
// fixture below read like the real template's own field list (cell
// address -> what a client typed there) instead of a row-by-row grid,
// and makes it obvious exactly which cell each assertion depends on.
function sheetFromCells(cells: Record<string, string | number>): XLSX.WorkSheet {
  let maxRow = 0, maxCol = 0
  for (const addr in cells) {
    const { r, c } = XLSX.utils.decode_cell(addr)
    maxRow = Math.max(maxRow, r)
    maxCol = Math.max(maxCol, c)
  }
  const aoa: any[][] = Array.from({ length: maxRow + 1 }, () => Array(maxCol + 1).fill(undefined))
  for (const addr in cells) {
    const { r, c } = XLSX.utils.decode_cell(addr)
    aoa[r][c] = cells[addr]
  }
  return XLSX.utils.aoa_to_sheet(aoa)
}

// A realistic v7 Business Details sheet -- exact cell positions the real
// template uses, not a simplified stand-in. Two named units (matching a
// business that only uses 2 of the 4 available "Unit N" sheet slots
// below, same shape as the real file that first surfaced these bugs).
function businessDetailsCells(overrides: Record<string, string | number> = {}) {
  return {
    C5: 'Test Vet Centre Limited', C6: 'Jane Doe', C7: 'jane@example.com', C8: '0700000000',
    C9: 'Uganda', C10: 'Veterinary & Agro-Input', C11: 'UGX',
    C12: '2015', C13: 'Limited Company', C14: 'Direct to farmers',
    C20: 'FY2026', C22: 3, C23: 6, C24: 'Year-round',
    C28: 5_000_000, C29: 100_000_000, C30: 6_000_000, C31: 8_000_000,
    C32: 18, C33: 2, C34: 6, C35: 200_000_000, C36: 10_000_000,
    C39: 30, C40: 50, C43: 30, C44: 30,
    A50: 'TEST UNIT A', C50: 3,
    A51: 'TEST UNIT B', C51: 2,
    ...overrides,
  }
}

// Month header row for a real v7 unit sheet: 7 months, M-3..M0..M+3,
// "M0 (Now)" is the 4th column (index 3) -- same convention the real
// template uses (though real files often run to M+12).
const MONTH_HEADERS = { C6: 'M-3', D6: 'M-2', E6: 'M-1', F6: 'M0 (Now)', G6: 'M+1', H6: 'M+2', I6: 'M+3' }

function buildTestWorkbook() {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheetFromCells(businessDetailsCells()), 'Business Details')

  // Unit 1: 3 products filled (of 8 available slots), 4 staff lines, 6
  // overhead lines -- the exact real-world shape (more than the blank
  // template's default 4 overhead slots) that a fixed-count parser
  // silently truncated.
  XLSX.utils.book_append_sheet(wb, sheetFromCells({
    A4: 'BUSINESS UNIT NAME:', C4: 'TEST UNIT A',
    ...MONTH_HEADERS,
    A9: 'WIDGETS', B9: 'Sales Revenue', C9: 10_000_000, D9: 11_000_000, E9: 12_000_000, F9: 13_000_000, G9: 14_000_000, H9: 15_000_000, I9: 16_000_000,
    B10: 'Cost of Goods', C10: 4_000_000, D10: 4_400_000, E10: 4_800_000, F10: 5_200_000, G10: 5_600_000, H10: 6_000_000, I10: 6_400_000,
    A11: 'GADGETS', B11: 'Sales Revenue', C11: 2_000_000, D11: 2_100_000, E11: 2_200_000, F11: 2_300_000, G11: 2_400_000, H11: 2_500_000, I11: 2_600_000,
    B12: 'Cost of Goods', C12: 800_000, D12: 840_000, E12: 880_000, F12: 920_000, G12: 960_000, H12: 1_000_000, I12: 1_040_000,
    A13: 'GIZMOS', B13: 'Sales Revenue', C13: 500_000, D13: 500_000, E13: 500_000, F13: 500_000, G13: 500_000, H13: 500_000, I13: 500_000,
    B14: 'Cost of Goods', C14: 200_000, D14: 200_000, E14: 200_000, F14: 200_000, G14: 200_000, H14: 200_000, I14: 200_000,
    // Rows 15-24: remaining 5 of 8 product slots, left blank (unused).
    A27: 'STAFF COSTS',
    A28: 'Staff / Salaries', B28: 'Amount', C28: 900_000, D28: 900_000, E28: 900_000, F28: 900_000, G28: 900_000, H28: 900_000, I28: 900_000,
    A29: 'WAGES', B29: 'Amount', C29: 100_000, D29: 100_000, E29: 100_000, F29: 100_000, G29: 100_000, H29: 100_000, I29: 100_000,
    A30: 'CASUAL LABOUR', B30: 'Amount', C30: 200_000, D30: 200_000, E30: 200_000, F30: 200_000, G30: 200_000, H30: 200_000, I30: 200_000,
    A31: 'CLEANER', B31: 'Amount', C31: 90_000, D31: 90_000, E31: 90_000, F31: 90_000, G31: 90_000, H31: 90_000, I31: 90_000,
    A34: 'DIRECT OVERHEADS',
    A35: 'RENT', B35: 'Amount', C35: 400_000, D35: 400_000, E35: 400_000, F35: 400_000, G35: 400_000, H35: 400_000, I35: 400_000,
    A36: 'TRANSPORT', B36: 'Amount', C36: 150_000, D36: 150_000, E36: 150_000, F36: 150_000, G36: 150_000, H36: 150_000, I36: 150_000,
    A37: 'ELECTRICITY', B37: 'Amount', C37: 100_000, D37: 100_000, E37: 100_000, F37: 100_000, G37: 100_000, H37: 100_000, I37: 100_000,
    A38: 'WATER', B38: 'Amount', C38: 30_000, D38: 30_000, E38: 30_000, F38: 30_000, G38: 30_000, H38: 30_000, I38: 30_000,
    A39: 'LUNCH', B39: 'Amount', C39: 450_000, D39: 450_000, E39: 450_000, F39: 450_000, G39: 450_000, H39: 450_000, I39: 450_000,
    A40: 'DETERGENT', B40: 'Amount', C40: 40_000, D40: 40_000, E40: 40_000, F40: 40_000, G40: 40_000, H40: 40_000, I40: 40_000,
  }), 'Unit 1 TEST UNIT A')

  // Unit 2: only 1 product used (of 8 slots) -- product data ends after
  // row 10, leaving a large gap of blank slots before "STAFF COSTS" --
  // and fewer staff/overhead lines than Unit 1 has.
  XLSX.utils.book_append_sheet(wb, sheetFromCells({
    A4: 'BUSINESS UNIT NAME:', C4: 'TEST UNIT B',
    ...MONTH_HEADERS,
    A9: 'SERVICES', B9: 'Sales Revenue', C9: 5_000_000, D9: 5_200_000, E9: 5_400_000, F9: 5_600_000, G9: 5_800_000, H9: 6_000_000, I9: 6_200_000,
    B10: 'Cost of Goods', C10: 1_000_000, D10: 1_040_000, E10: 1_080_000, F10: 1_120_000, G10: 1_160_000, H10: 1_200_000, I10: 1_240_000,
    A27: 'STAFF COSTS',
    A28: 'Staff / Salaries', B28: 'Amount', C28: 300_000, D28: 300_000, E28: 300_000, F28: 300_000, G28: 300_000, H28: 300_000, I28: 300_000,
    A34: 'DIRECT OVERHEADS',
    A35: 'RENT', B35: 'Amount', C35: 100_000, D35: 100_000, E35: 100_000, F35: 100_000, G35: 100_000, H35: 100_000, I35: 100_000,
  }), 'Unit 2 TEST UNIT B')

  // Unused blank slot -- carries the template's own placeholder
  // instruction text in C4 (not a real unit name, but not blank either),
  // and zero-value template rows even though nothing was filled in. Must
  // contribute nothing and must not be flagged as "unassigned" -- the
  // business genuinely only has 2 units, this sheet was simply never used.
  XLSX.utils.book_append_sheet(wb, sheetFromCells({
    A4: 'BUSINESS UNIT NAME:', C4: 'Enter name exactly as in Business Details Section F. Leave blank if single business.',
    ...MONTH_HEADERS,
    B9: 'Sales Revenue', C9: 0, D9: 0, E9: 0, F9: 0, G9: 0, H9: 0, I9: 0,
    B10: 'Cost of Goods', C10: 0, D10: 0, E10: 0, F10: 0, G10: 0, H10: 0, I10: 0,
    A27: 'STAFF COSTS',
    A28: 'Staff / Salaries', B28: 'Amount', C28: 0, D28: 0, E28: 0, F28: 0, G28: 0, H28: 0, I28: 0,
    A34: 'DIRECT OVERHEADS',
    A35: 'Overheads', B35: 'Amount', C35: 0, D35: 0, E35: 0, F35: 0, G35: 0, H35: 0, I35: 0,
  }), 'Unit 3 Figures')

  return wb
}

describe('parseClearviewWorkbook', () => {
  it('REG: reads Business Details fields from their real cell positions', () => {
    const parsed = parseClearviewWorkbook(buildTestWorkbook())
    expect(parsed.business.business_name).toBe('Test Vet Centre Limited')
    expect(parsed.business.country).toBe('Uganda')
    expect(parsed.business.grant_recoverable).toBe(6_000_000)
    expect(parsed.business.bank_loan).toBe(8_000_000)
    expect(parsed.business.grace_period_months).toBe(6)
  })

  it('REG: finds every "Unit N <name>" sheet, not just one literally named "Unit N Figures"', () => {
    const parsed = parseClearviewWorkbook(buildTestWorkbook())
    // 2 real units contribute products; the unused "Unit 3 Figures" slot does not
    const unitNames = new Set(parsed.products.map(p => p.unitName))
    expect(unitNames).toEqual(new Set(['TEST UNIT A', 'TEST UNIT B']))
  })

  it('REG: reads the unit name from C4, not B4', () => {
    const parsed = parseClearviewWorkbook(buildTestWorkbook())
    expect(parsed.units.map(u => u.name)).toEqual(['TEST UNIT A', 'TEST UNIT B'])
  })

  it('REG: reads month columns starting at column C, not D -- M0 (Now) correctly identified', () => {
    const parsed = parseClearviewWorkbook(buildTestWorkbook())
    expect(parsed.pastMonths).toBe(3) // M-3, M-2, M-1 precede M0
    expect(parsed.futureMonths).toBe(3) // M+1, M+2, M+3 follow
    const widgets = parsed.products.find(p => p.name === 'WIDGETS')!
    expect(widgets.revenue[parsed.pastMonths]).toBe(13_000_000) // F9, the M0 column
  })

  it('REG: finds every product even with unused slots in between, not just a fixed count', () => {
    const parsed = parseClearviewWorkbook(buildTestWorkbook())
    const unitAProducts = parsed.products.filter(p => p.unitName === 'TEST UNIT A').map(p => p.name)
    expect(unitAProducts).toEqual(['WIDGETS', 'GADGETS', 'GIZMOS'])
    const unitBProducts = parsed.products.filter(p => p.unitName === 'TEST UNIT B').map(p => p.name)
    expect(unitBProducts).toEqual(['SERVICES'])
  })

  it('REG: reads every staff/overhead line present, not capped at 4 -- Unit A has 4 staff + 6 overhead lines', () => {
    const parsed = parseClearviewWorkbook(buildTestWorkbook())
    const unitACosts = parsed.commonCosts.filter(c => c.unitName === 'TEST UNIT A')
    const staff = unitACosts.filter(c => c.section === 'staff').map(c => c.name)
    const overheads = unitACosts.filter(c => c.section === 'overheads').map(c => c.name)
    expect(staff).toEqual(['Staff / Salaries', 'WAGES', 'CASUAL LABOUR', 'CLEANER'])
    expect(overheads).toEqual(['RENT', 'TRANSPORT', 'ELECTRICITY', 'WATER', 'LUNCH', 'DETERGENT'])
  })

  it('REG: Unit B has fewer staff/overhead lines than Unit A -- section length is per-sheet, not a global constant', () => {
    const parsed = parseClearviewWorkbook(buildTestWorkbook())
    const unitBCosts = parsed.commonCosts.filter(c => c.unitName === 'TEST UNIT B')
    expect(unitBCosts.filter(c => c.section === 'staff')).toHaveLength(1)
    expect(unitBCosts.filter(c => c.section === 'overheads')).toHaveLength(1)
  })

  it('REG: an unused blank unit slot contributes nothing and is never flagged as unassigned', () => {
    const parsed = parseClearviewWorkbook(buildTestWorkbook())
    expect(parsed.products.some(p => p.unitName === '' || p.name === '')).toBe(false)
    expect(parsed.commonCosts.filter(c => c.unitName === '')).toHaveLength(0)
    expect(parsed.unassignedSheets).toEqual([])
  })

  it('REG: throws a clear error when Business Details is missing', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheetFromCells({ A1: 'Unit 1 Figures' }), 'Unit 1 Figures')
    expect(() => parseClearviewWorkbook(wb)).toThrow(/Business Details/)
  })

  it('REG: throws a clear error when no products are found anywhere', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheetFromCells(businessDetailsCells()), 'Business Details')
    XLSX.utils.book_append_sheet(wb, sheetFromCells({ A4: 'BUSINESS UNIT NAME:', C4: 'TEST UNIT A', ...MONTH_HEADERS }), 'Unit 1 TEST UNIT A')
    expect(() => parseClearviewWorkbook(wb)).toThrow(/No products found/)
  })
})

describe('buildPlanFromParsedUpload', () => {
  function genIdSeq() {
    let n = 0
    return (prefix: string) => `${prefix}_${n++}`
  }

  it('REG: revenue, cost, staff, and overhead lines each get the correct plan-line category', () => {
    const parsed = parseClearviewWorkbook(buildTestWorkbook())
    const { planLines } = buildPlanFromParsedUpload(parsed, genIdSeq())
    const byName = Object.fromEntries(planLines.map(l => [l.name, l.category]))
    expect(byName['WIDGETS']).toBe('revenue')
    expect(byName['WIDGETS — Cost of Goods']).toBe('cost_of_sales')
    expect(byName['Staff / Salaries']).toBe('staff')
    expect(byName['WAGES']).toBe('staff')
    expect(byName['RENT']).toBe('direct_opex')
    expect(byName['LUNCH']).toBe('direct_opex')
  })

  it('REG: the current month (M0/Now) is written as an actual, not just kept as a plan figure', () => {
    const parsed = parseClearviewWorkbook(buildTestWorkbook())
    const now = new Date('2026-07-14T10:00:00Z')
    const { actualsRows } = buildPlanFromParsedUpload(parsed, genIdSeq(), now)
    const julyRows = actualsRows.filter(r => r.period === '2026-07-01')
    expect(julyRows.length).toBeGreaterThan(0)
    // Every value written for July should be non-zero -- these are real
    // M0 figures from the fixture, not accidentally-zeroed plan data.
    julyRows.forEach(row => {
      expect(Object.values(row.values).some(v => v > 0)).toBe(true)
    })
  })

  it('REG: every past month through the current one gets an actuals row, none skipped', () => {
    const parsed = parseClearviewWorkbook(buildTestWorkbook())
    const now = new Date('2026-07-14T10:00:00Z')
    const { actualsRows } = buildPlanFromParsedUpload(parsed, genIdSeq(), now)
    const periods = new Set(actualsRows.map(r => r.period))
    // pastMonths=3 means April, May, June, July (current) should all appear
    expect(periods).toEqual(new Set(['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01']))
  })

  it('REG: multiple plan lines for the same unit and period merge into one row, none overwritten', () => {
    const parsed = parseClearviewWorkbook(buildTestWorkbook())
    const now = new Date('2026-07-14T10:00:00Z')
    const { actualsRows, planLines } = buildPlanFromParsedUpload(parsed, genIdSeq(), now)
    const unitAId = planLines.find(l => l.name === 'WIDGETS')!.unit_id
    const julyRowForUnitA = actualsRows.find(r => r.unit_id === unitAId && r.period === '2026-07-01')!
    // Unit A has 3 products (rev+cost = 6 lines) + 4 staff + 6 overheads = 16 lines
    expect(Object.keys(julyRowForUnitA.values).length).toBe(16)
  })

  it('REG: future months (beyond the current one) never get an actuals row', () => {
    const parsed = parseClearviewWorkbook(buildTestWorkbook())
    const now = new Date('2026-07-14T10:00:00Z')
    const { actualsRows } = buildPlanFromParsedUpload(parsed, genIdSeq(), now)
    expect(actualsRows.some(r => r.period > '2026-07-01')).toBe(false)
  })
})

describe('catalogue sheet (v8)', () => {
  it('returns [] when there is no Catalogue sheet (v7 workbook)', () => {
    const parsed = parseClearviewWorkbook(buildTestWorkbook())
    expect(parsed.catalogue).toEqual([])
  })

  it('parses catalogue rows, skips the (example) row, and ignores single blank gaps', () => {
    const wb = buildTestWorkbook()
    XLSX.utils.book_append_sheet(wb, sheetFromCells({
      A4: 'Business Unit (match Section F, or blank)', B4: 'Product (match Unit Figures)',
      C4: 'Category', D4: 'Product Type', E4: 'Unit', F4: 'Retail Price', G4: 'Cost Price',
      // greyed sample the blank template ships with -- must be skipped
      A5: '(example) Poultry', B5: 'Eggs', C5: 'Eggs', D5: 'Tray of 30', E5: 'tray', F5: 12000, G5: 9000,
      A6: 'TEST UNIT A', B6: 'WIDGETS', C6: 'Hardware', D6: 'Small', E6: 'box', F6: 5000, G6: 3000,
      // a single blank gap row (7) then more data -- must NOT stop the read
      A8: 'TEST UNIT A', B8: 'GADGETS', C8: 'Hardware', D8: 'Large', E8: 'unit', F8: 15000, G8: 11000,
    }), 'Catalogue')

    const parsed = parseClearviewWorkbook(wb)
    expect(parsed.catalogue.length).toBe(2)
    expect(parsed.catalogue[0]).toEqual({
      unitName: 'TEST UNIT A', productName: 'WIDGETS', category: 'Hardware',
      productType: 'Small', unitLabel: 'box', retailPrice: 5000, costPrice: 3000,
    })
    expect(parsed.catalogue.map(c => c.productName)).toEqual(['WIDGETS', 'GADGETS'])
  })
})

describe('buildPlanFromParsedUpload — catalogue linking', () => {
  function genIdSeq() {
    let n = 0
    return (prefix: string) => `${prefix}_${n++}`
  }
  function workbookWithCatalogue() {
    const wb = buildTestWorkbook()
    XLSX.utils.book_append_sheet(wb, sheetFromCells({
      A4: 'Business Unit', B4: 'Product', C4: 'Category', D4: 'Product Type', E4: 'Unit', F4: 'Retail Price', G4: 'Cost Price',
      A5: 'TEST UNIT A', B5: 'WIDGETS', C5: 'Hardware', D5: 'Small', E5: 'box', F5: 5000, G5: 3000,
      // GADGETS: a genuine ZERO cost (free to produce) with a matching cost line.
      A6: 'TEST UNIT A', B6: 'GADGETS', C6: 'Hardware', D6: 'Medium', E6: 'unit', F6: 7000, G6: 0,
      // GIZMOS: cost cell left BLANK (no cost data) — G7 omitted entirely.
      A7: 'TEST UNIT A', B7: 'GIZMOS', C7: 'Hardware', D7: 'Tiny', E7: 'unit', F7: 3000,
      // NOPRODUCT: no matching revenue line at all.
      A8: 'TEST UNIT A', B8: 'NOPRODUCT', C8: 'Hardware', D8: 'Large', E8: 'unit', F8: 9000, G8: 400,
    }), 'Catalogue')
    return wb
  }

  it('links a catalogue item to its revenue line and cost-of-sales line', () => {
    const parsed = parseClearviewWorkbook(workbookWithCatalogue())
    const { planLines, catalogueRows } = buildPlanFromParsedUpload(parsed, genIdSeq())
    const widget = catalogueRows.find(c => c.name === 'WIDGETS')!
    const revLine = planLines.find(l => l.name === 'WIDGETS' && l.category === 'revenue')!
    const cogsLine = planLines.find(l => l.name === 'WIDGETS — Cost of Goods' && l.category === 'cost_of_sales')!
    expect(widget.plan_line_id).toBe(revLine.id)
    expect(widget.cogs_plan_line_id).toBe(cogsLine.id)
    expect(widget.cost_price).toBe(3000)
    expect(widget.price).toBe(5000)
    expect(widget.category).toBe('Hardware')
  })

  it('keeps a genuine zero cost price (does not drop it as "no data")', () => {
    const parsed = parseClearviewWorkbook(workbookWithCatalogue())
    const { catalogueRows } = buildPlanFromParsedUpload(parsed, genIdSeq())
    const gadget = catalogueRows.find(c => c.name === 'GADGETS')!
    expect(gadget.cost_price).toBe(0)
    expect(gadget.cogs_plan_line_id).not.toBeNull()
  })

  it('treats a blank cost cell as no cost data (null)', () => {
    const parsed = parseClearviewWorkbook(workbookWithCatalogue())
    const gizmoParsed = parsed.catalogue.find(c => c.productName === 'GIZMOS')!
    expect(gizmoParsed.costPrice).toBeNull()
    const { catalogueRows } = buildPlanFromParsedUpload(parsed, genIdSeq())
    const gizmo = catalogueRows.find(c => c.name === 'GIZMOS')!
    expect(gizmo.cost_price).toBeNull()
    expect(gizmo.cogs_plan_line_id).toBeNull()
  })

  it('carries no cost price when there is no cost-of-sales line to post against', () => {
    // NOPRODUCT has no matching revenue line at all, so no plan_line_id and no
    // cogs line — cost price must be dropped (the DB rejects a costed item
    // with no COGS line).
    const parsed = parseClearviewWorkbook(workbookWithCatalogue())
    const { catalogueRows } = buildPlanFromParsedUpload(parsed, genIdSeq())
    const np = catalogueRows.find(c => c.name === 'NOPRODUCT')!
    expect(np.plan_line_id).toBeNull()
    expect(np.cogs_plan_line_id).toBeNull()
    expect(np.cost_price).toBeNull()
  })
})
