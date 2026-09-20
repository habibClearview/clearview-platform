// ============================================================
// What happens to what an outside system sends.
//
// 20 September 2026. The two rules under test throughout:
//   a price is never taken from the sender unless they say so explicitly, and
//   nothing well-formed is thrown away.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  decideSale, decideCost, decideActuals, monthKey, isoDate, isoMoment,
  cleanPaymentMethod, externalRef, positiveNumber,
  type CatalogueItem, type PlanLine,
} from '@/lib/api-writes'

const TODAY = '2026-09-20'

const item = (over: Partial<CatalogueItem> = {}): CatalogueItem => ({
  id: 'cat1', name: 'Deworming dose', price: 5000, plan_line_id: 'rev1',
  unit_label: 'dose', cost_price: 2000, cogs_plan_line_id: 'cos1', ...over,
})
const catalogue = (...items: CatalogueItem[]) => new Map(items.map((i) => [i.id, i]))

const line = (over: Partial<PlanLine> = {}): PlanLine => ({
  id: 'cost1', name: 'Fuel', category: 'direct_opex', unit_id: 'u1', active: true, ...over,
})
const lines = (...ls: PlanLine[]) => new Map(ls.map((l) => [l.id, l]))

describe('a sale', () => {
  it('takes its price from the price list, not from the sender', () => {
    const d = decideSale(
      { external_ref: 'a', catalogue_item_id: 'cat1', quantity: 3 } as any,
      catalogue(item()), TODAY,
    )
    expect(d.row!.unit_price).toBe(5000)
    expect(d.row!.amount).toBe(15000)
    expect(d.row!.price_overridden).toBe(false)
  })

  it('ignores an amount the sender puts in, because the amount is ours to work out', () => {
    const d = decideSale(
      { external_ref: 'a', catalogue_item_id: 'cat1', quantity: 2, amount: 999999 } as any,
      catalogue(item()), TODAY,
    )
    expect(d.row!.amount).toBe(10000)
  })

  it('accepts a price the sender names explicitly, and records that they did', () => {
    const d = decideSale(
      { external_ref: 'a', catalogue_item_id: 'cat1', quantity: 1, unit_price: 4800 } as any,
      catalogue(item()), TODAY,
    )
    expect(d.row!.unit_price).toBe(4800)
    expect(d.row!.price_overridden).toBe(true)
    expect(d.row!.price_alert).toBe(false)
  })

  it('flags a named price that strays more than a tenth from the price list', () => {
    const d = decideSale(
      { external_ref: 'a', catalogue_item_id: 'cat1', quantity: 1, unit_price: 3000 } as any,
      catalogue(item()), TODAY,
    )
    expect(d.row!.price_alert).toBe(true)
    expect(d.priceAlert).toContain('Deworming dose')
  })

  it('accepts a giveaway priced at zero rather than treating it as missing', () => {
    const d = decideSale(
      { external_ref: 'a', catalogue_item_id: 'cat1', quantity: 1, unit_price: 0 } as any,
      catalogue(item()), TODAY,
    )
    expect(d.row!.amount).toBe(0)
    expect(d.parked).toBeNull()
  })

  it('parks an unknown product with a reason a coach can act on, instead of dropping it', () => {
    const d = decideSale(
      { external_ref: 'a', catalogue_item_id: 'nope', quantity: 1 } as any,
      catalogue(item()), TODAY,
    )
    expect(d.row).toBeNull()
    expect(d.parked!.reason).toContain('not in this business unit')
    expect(d.parked!.payload).toBeTruthy()
    expect(d.parked!.external_ref).toBe('a')
  })

  it.each([
    ['no quantity', {}],
    ['zero', { quantity: 0 }],
    ['negative', { quantity: -2 }],
    ['not a number', { quantity: 'three' }],
  ])('parks a sale with %s rather than booking nothing silently', (_n, over) => {
    const d = decideSale(
      { external_ref: 'a', catalogue_item_id: 'cat1', ...over } as any,
      catalogue(item()), TODAY,
    )
    expect(d.row).toBeNull()
    expect(d.parked!.reason).toContain('quantity')
  })

  it('parks a negative named price', () => {
    const d = decideSale(
      { catalogue_item_id: 'cat1', quantity: 1, unit_price: -5 } as any,
      catalogue(item()), TODAY,
    )
    expect(d.row).toBeNull()
  })

  it('falls back to today when no date is sent', () => {
    const d = decideSale({ catalogue_item_id: 'cat1', quantity: 1 } as any, catalogue(item()), TODAY)
    expect(d.row!.transaction_date).toBe(TODAY)
  })

  it('keeps the exact moment separately from the day, because matching a payment needs it', () => {
    const d = decideSale(
      { catalogue_item_id: 'cat1', quantity: 1, occurred_at: '2026-09-18T09:14:22Z' } as any,
      catalogue(item()), TODAY,
    )
    expect(d.row!.transaction_date).toBe('2026-09-18')
    expect(d.row!.captured_at).toBe('2026-09-18T09:14:22.000Z')
  })

  it('never lets a sender name the business it is writing to', () => {
    const d = decideSale(
      { catalogue_item_id: 'cat1', quantity: 1, client_id: 'somebody_else', business_unit_id: 'other' } as any,
      catalogue(item()), TODAY,
    )
    expect(d.row).not.toHaveProperty('client_id')
    expect(d.row).not.toHaveProperty('business_unit_id')
  })
})

describe('a cost', () => {
  it('files against the line it names', () => {
    const d = decideCost({ cost_line_id: 'cost1', amount: 45000 } as any, lines(line()), 'u1', TODAY)
    expect(d.row!.plan_line_id).toBe('cost1')
    expect(d.row!.amount).toBe(45000)
  })

  it('takes the heading from the line itself, never from the sender', () => {
    const d = decideCost(
      { cost_line_id: 'cost1', amount: 10, category: 'staff' } as any,
      lines(line({ category: 'direct_opex' })), 'u1', TODAY,
    )
    expect(d.row!.category).toBe('direct_opex')
  })

  it('parks a line belonging to another business unit', () => {
    const d = decideCost({ cost_line_id: 'cost1', amount: 10 } as any, lines(line({ unit_id: 'other' })), 'u1', TODAY)
    expect(d.row).toBeNull()
    expect(d.parked!.reason).toContain('does not belong')
  })

  it('parks a line that has been switched off', () => {
    const d = decideCost({ cost_line_id: 'cost1', amount: 10 } as any, lines(line({ active: false })), 'u1', TODAY)
    expect(d.row).toBeNull()
  })

  it('parks a cost aimed at a revenue line', () => {
    const d = decideCost(
      { cost_line_id: 'rev1', amount: 10 } as any,
      lines(line({ id: 'rev1', name: 'Consultations', category: 'revenue' })), 'u1', TODAY,
    )
    expect(d.row).toBeNull()
    expect(d.parked!.reason).toContain('not a spending heading')
  })

  it('repeats the sender own words back when no line was named, so a coach can file it', () => {
    const d = decideCost({ amount: 10, description: 'Generator repair' } as any, lines(line()), 'u1', TODAY)
    expect(d.parked!.reason).toContain('Generator repair')
  })

  it('books a cost of sales line as a cost and everything else as an expense', () => {
    const cos = decideCost({ cost_line_id: 'c', amount: 1 } as any,
      lines(line({ id: 'c', category: 'cost_of_sales' })), 'u1', TODAY)
    const opex = decideCost({ cost_line_id: 'o', amount: 1 } as any,
      lines(line({ id: 'o', category: 'direct_opex' })), 'u1', TODAY)
    expect(cos.row!.transaction_type).toBe('cost')
    expect(opex.row!.transaction_type).toBe('expense')
  })
})

describe('a month of totals', () => {
  const ls = lines(line({ id: 'a', name: 'Fuel' }), line({ id: 'b', name: 'Rent' }))

  it('takes one figure per line', () => {
    const d = decideActuals('2026-03', [{ line_id: 'a', amount: 100 }, { line_id: 'b', amount: 200 }], ls, 'u1')
    expect(d.values).toEqual({ a: 100, b: 200 })
    expect(d.parked).toHaveLength(0)
  })

  it('adds up two entries for the same line rather than letting the second win', () => {
    const d = decideActuals('2026-03', [{ line_id: 'a', amount: 100 }, { line_id: 'a', amount: 50 }], ls, 'u1')
    expect(d.values.a).toBe(150)
  })

  it('accepts a figure of zero, which is a real answer and not a missing one', () => {
    const d = decideActuals('2026-03', [{ line_id: 'a', amount: 0 }], ls, 'u1')
    expect(d.values.a).toBe(0)
  })

  it('accepts a negative figure, because a refund month is a real month', () => {
    const d = decideActuals('2026-03', [{ line_id: 'a', amount: -40 }], ls, 'u1')
    expect(d.values.a).toBe(-40)
  })

  it('parks a line from another unit rather than filing it here', () => {
    const d = decideActuals('2026-03', [{ line_id: 'zzz', amount: 1 }], ls, 'u1')
    expect(d.values).toEqual({})
    expect(d.parked[0].reason).toContain('does not belong')
  })

  it('parks a figure that is not a number', () => {
    const d = decideActuals('2026-03', [{ line_id: 'a', amount: 'lots' }], ls, 'u1')
    expect(d.parked[0].reason).toContain('not a number')
  })

  it('keeps the good lines when one line in the same call is bad', () => {
    const d = decideActuals('2026-03', [{ line_id: 'a', amount: 10 }, { line_id: 'x', amount: 10 }], ls, 'u1')
    expect(d.values).toEqual({ a: 10 })
    expect(d.parked).toHaveLength(1)
  })
})

describe('reading what was sent', () => {
  it.each([
    ['a month', '2026-03', '2026-03'],
    ['a date inside the month', '2026-03-14', '2026-03'],
    ['a full moment', '2026-03-14T08:00:00Z', '2026-03'],
  ])('accepts %s', (_n, sent, expected) => {
    expect(monthKey(sent)).toBe(expected)
  })

  it.each(['', 'March', '2026-13', null, 7])('refuses %s as a month', (sent) => {
    expect(monthKey(sent as any)).toBeNull()
  })

  it('falls back rather than storing an unreadable date', () => {
    expect(isoDate('not a date', TODAY)).toBe(TODAY)
    expect(isoDate(undefined, TODAY)).toBe(TODAY)
  })

  it('answers null for an unreadable moment rather than inventing one', () => {
    expect(isoMoment('rubbish')).toBeNull()
    expect(isoMoment(undefined)).toBeNull()
  })

  it('keeps only payment methods the figures understand', () => {
    expect(cleanPaymentMethod('mobile_money')).toBe('mobile_money')
    expect(cleanPaymentMethod('crypto')).toBeNull()
    expect(cleanPaymentMethod(99)).toBeNull()
  })

  it('trims a reference and refuses an empty one', () => {
    expect(externalRef('  abc  ')).toBe('abc')
    expect(externalRef('   ')).toBeNull()
    expect(externalRef(null)).toBeNull()
  })

  it('will not accept infinity as a quantity', () => {
    expect(positiveNumber(Infinity)).toBeNull()
    expect(positiveNumber('4')).toBe(4)
  })
})
