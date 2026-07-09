// Core cell-reading helpers and layout constants for parsing the
// Clearview Data Capture spreadsheet template (new template v7, "Unit
// N Figures" sheets). Extracted from SpreadsheetUpload.tsx so the
// layout assumptions that caused two separate silent off-by-one bugs
// (month columns shifted by one, revenue/cost rows shifted by one) can
// be locked in with regression tests against the exact same code the
// upload component actually runs -- not a re-implementation that could
// drift from it.
//
// Every offset below was verified directly against a real client's
// completed template (Viester Farm), cross-checked with an independent
// read (openpyxl), not assumed from the template's own documentation.

export function cellStr(ws: any, addr: string): string {
  const cell = ws[addr]
  return cell ? String(cell.v ?? '').trim() : ''
}

export function cellNum(ws: any, addr: string): number {
  const cell = ws[addr]
  const v = cell ? cell.v : 0
  return typeof v === 'number' ? v : (parseFloat(v) || 0)
}

// Converts a 0-indexed column number to its spreadsheet letter (0='A',
// 2='C', etc). This exact function, called with the wrong starting
// index (3 instead of 2), was the source of the month-column bug --
// colLetter(3) = 'D', but the real template's first month column is C.
export function colLetter(idx: number): string {
  let s = ''
  idx += 1
  while (idx > 0) {
    const rem = (idx - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    idx = Math.floor((idx - 1) / 26)
  }
  return s
}

// New template v7 ("Unit N Figures" sheets) layout, verified directly
// against a real completed file:
// - Row 4, column B: the unit name
// - Row 6: header row (Category/Figure Type in A/B, month labels from
//   column C onward -- M-3, M-2, M-1, M0, M+1...)
// - Row 8, column A: "REVENUE — PRODUCT CATEGORIES" section header
// - Row 9 onward: each product occupies 2 rows (Sales Revenue, then
//   Cost of Goods), for up to 8 products -- rows 9-24
// - Rows 25-26: blank spacer
// - Row 27, column C: "Salaries, wages, casual labour" staff section note
// - Rows 28-31: staff cost lines (up to 4)
// - Rows 32-33: blank spacer
// - Row 34, column A: "DIRECT OVERHEADS" section header
// - Rows 35-38: overhead cost lines (up to 4)
export const NEW_TEMPLATE_LAYOUT = {
  unitNameCell: { row: 4, col: 'B' },
  headerRow: 6,
  monthStartCol: 2, // colLetter(2) = 'C'
  revSectionHeaderRow: 8,
  revSectionStart: 9,
  nRevSlots: 8,
  staffSectionStart: 9 + (8 * 2) + 3, // = 28
  nStaffSlots: 4,
  opexSectionStart: (9 + (8 * 2) + 3) + 4 + 3, // = 35
  nOpexSlots: 4,
} as const

export function findMonthColumns(ws: any, headerRow: number, monthStartCol: number): { monthCols: number[]; thisMonthColIdx: number } {
  const monthCols: number[] = []
  let thisMonthColIdx = -1
  for (let c = monthStartCol; c < monthStartCol + 30; c++) {
    const val = cellStr(ws, `${colLetter(c)}${headerRow}`)
    if (!val) break
    monthCols.push(c)
    const upper = val.toUpperCase()
    if (upper.includes('M0') || upper.includes('NOW') || upper.includes('THIS MONTH')) {
      thisMonthColIdx = monthCols.length - 1
    }
  }
  return { monthCols, thisMonthColIdx }
}
