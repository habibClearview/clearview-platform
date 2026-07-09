import { describe, it, expect } from 'vitest'
import { cellStr, cellNum, colLetter, findMonthColumns, NEW_TEMPLATE_LAYOUT } from '@/lib/intake-spreadsheet-parser'

// A minimal mock worksheet in the SheetJS shape: a flat object keyed by
// A1-style addresses, each value an object with a `.v` property. Built
// to mirror the exact layout of a real "Unit N Figures" sheet, so these
// tests lock in the verified offsets that two separate off-by-one bugs
// previously got wrong.
function mockSheet(cells: Record<string, string | number>): any {
  const ws: any = {}
  for (const [addr, v] of Object.entries(cells)) ws[addr] = { v }
  return ws
}

describe('colLetter — the exact function whose wrong argument caused the month-column bug', () => {
  it('REG: 0-indexed column 2 is C, not D -- the month columns start at C', () => {
    expect(colLetter(2)).toBe('C')
  })
  it('REG: the full A-Z range maps correctly', () => {
    expect(colLetter(0)).toBe('A')
    expect(colLetter(1)).toBe('B')
    expect(colLetter(3)).toBe('D')
    expect(colLetter(25)).toBe('Z')
  })
})

describe('cellNum — reading numeric cells', () => {
  it('REG: a real numeric cell reads its value', () => {
    expect(cellNum(mockSheet({ C9: 30000000 }), 'C9')).toBe(30000000)
  })
  it('REG: a missing cell reads as 0, not NaN or undefined', () => {
    expect(cellNum(mockSheet({}), 'Z99')).toBe(0)
  })
  it('REG: a clean numeric string parses', () => {
    expect(cellNum(mockSheet({ C9: '5000' }), 'C9')).toBe(5000)
  })
})

describe('cellStr — reading and trimming text cells', () => {
  it('REG: trims surrounding whitespace (the real file has trailing spaces everywhere)', () => {
    expect(cellStr(mockSheet({ B4: '  goat breeding  ' }), 'B4')).toBe('goat breeding')
  })
  it('REG: a missing cell reads as empty string', () => {
    expect(cellStr(mockSheet({}), 'Z99')).toBe('')
  })
})

describe('findMonthColumns — locating the month header columns', () => {
  it('REG: with headers starting at column C (the real, correct layout), finds all months and locates M0 correctly', () => {
    // Header row 6: C=M-3, D=M-2, E=M-1, F=M0(Now), G=M+1, then blank
    const ws = mockSheet({
      C6: 'M-3', D6: 'M-2', E6: 'M-1', F6: 'M0\n(Now)', G6: 'M+1',
    })
    const { monthCols, thisMonthColIdx } = findMonthColumns(ws, NEW_TEMPLATE_LAYOUT.headerRow, NEW_TEMPLATE_LAYOUT.monthStartCol)
    expect(monthCols.length).toBe(5)
    // M0 is the 4th column (index 3), meaning exactly 3 historical months precede it
    expect(thisMonthColIdx).toBe(3)
  })

  it('REG: stops at the first blank header, does not run past the real months', () => {
    const ws = mockSheet({ C6: 'M-3', D6: 'M-2', E6: 'M0 (Now)' /* F6 blank */ })
    const { monthCols } = findMonthColumns(ws, 6, 2)
    expect(monthCols.length).toBe(3)
  })

  it('REG: if the caller wrongly started at column D (the original bug), M-3 would be skipped -- this test documents why monthStartCol must be 2', () => {
    const ws = mockSheet({ C6: 'M-3', D6: 'M-2', E6: 'M-1', F6: 'M0 (Now)' })
    // Starting at 3 (column D) instead of 2 (column C) -- the original bug
    const { monthCols, thisMonthColIdx } = findMonthColumns(ws, 6, 3)
    expect(monthCols.length).toBe(3) // only D,E,F -- C (M-3) skipped entirely
    expect(thisMonthColIdx).toBe(2) // M0 now looks like it has only 2 months before it, not 3 -- the silent corruption
  })
})

describe('NEW_TEMPLATE_LAYOUT — the verified offsets, locked in against future drift', () => {
  it('REG: month columns start at index 2 (column C), the value confirmed against a real uploaded file', () => {
    expect(NEW_TEMPLATE_LAYOUT.monthStartCol).toBe(2)
    expect(colLetter(NEW_TEMPLATE_LAYOUT.monthStartCol)).toBe('C')
  })
  it('REG: revenue section starts at row 9 (the first Sales Revenue row), not row 10 (which is the first Cost of Goods row)', () => {
    expect(NEW_TEMPLATE_LAYOUT.revSectionStart).toBe(9)
    expect(NEW_TEMPLATE_LAYOUT.revSectionHeaderRow).toBe(8)
  })
  it('REG: staff section starts at row 28, overheads at row 35 -- the exact positions verified in the real file', () => {
    expect(NEW_TEMPLATE_LAYOUT.staffSectionStart).toBe(28)
    expect(NEW_TEMPLATE_LAYOUT.opexSectionStart).toBe(35)
  })
  it('REG: the section-start arithmetic is internally consistent -- revenue occupies its slots, then a 3-row gap to staff, then staff slots, then a 3-row gap to overheads', () => {
    // revenue: rows 9..(9+8*2-1)=24, then +3 (rows 25,26 blank + row 27 header) => staff at 28
    expect(NEW_TEMPLATE_LAYOUT.revSectionStart + NEW_TEMPLATE_LAYOUT.nRevSlots * 2 + 3).toBe(NEW_TEMPLATE_LAYOUT.staffSectionStart)
    // staff: rows 28..31, then +3 (rows 32,33 blank + row 34 header) => overheads at 35
    expect(NEW_TEMPLATE_LAYOUT.staffSectionStart + NEW_TEMPLATE_LAYOUT.nStaffSlots + 3).toBe(NEW_TEMPLATE_LAYOUT.opexSectionStart)
  })
})

describe('End-to-end row/column resolution using the shared constants (the exact combination the two bugs got wrong)', () => {
  it('REG: reading the first product\'s revenue and cost-of-goods lands on the right rows AND the right first column', () => {
    // Mirror the real file: product "breeding nannies" with revenue on
    // row 9 and cost of goods on row 10, months starting at column C.
    const ws = mockSheet({
      C6: 'M-3', D6: 'M-2', E6: 'M-1', F6: 'M0 (Now)',
      A9: 'breeding nannies', B9: 'Sales Revenue', C9: 30000000, D9: 0, E9: 28000000, F9: 0,
      B10: 'Cost of Goods', C10: 3300000, D10: 0, E10: 4500000, F10: 1000000,
    })
    const { monthCols } = findMonthColumns(ws, NEW_TEMPLATE_LAYOUT.headerRow, NEW_TEMPLATE_LAYOUT.monthStartCol)
    const readVals = (row: number) => monthCols.map(c => cellNum(ws, `${colLetter(c)}${row}`))

    const revRow = NEW_TEMPLATE_LAYOUT.revSectionStart // 9
    const cogRow = revRow + 1 // 10

    expect(cellStr(ws, `A${revRow}`)).toBe('breeding nannies')
    // Revenue: the real M-3 (30M) is included and first, not skipped
    expect(readVals(revRow)).toEqual([30000000, 0, 28000000, 0])
    // Cost of goods reads from row 10, NOT mistaken for the revenue row
    expect(readVals(cogRow)).toEqual([3300000, 0, 4500000, 1000000])
  })
})
