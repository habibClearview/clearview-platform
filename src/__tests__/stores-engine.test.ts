import { describe, it, expect } from 'vitest'
import {
  movementDelta, movementHolderKey, balancesByHolder, itemBalanceAtHolder,
  itemTotalBalance, reconcileHolder, reconcileHolderByItem, reconcileOperator,
  reconcileLocation, lossTotal, salesByChannel, type StockMovement,
} from '@/lib/stores-engine'

const mv = (p: Partial<StockMovement> & Pick<StockMovement, 'movement_type' | 'quantity'>): StockMovement => ({
  catalogue_item_id: 'egg', location_id: null, operator_id: null, reason_id: null, ...p,
})

describe('movementDelta — direction from type, magnitude from |quantity|', () => {
  it('inflows are positive regardless of stored sign', () => {
    expect(movementDelta(mv({ movement_type: 'stock_in', quantity: 40 }))).toBe(40)
    expect(movementDelta(mv({ movement_type: 'produced', quantity: 420 }))).toBe(420)
    expect(movementDelta(mv({ movement_type: 'transfer_in', quantity: -30 }))).toBe(30) // sign ignored
  })
  it('outflows are negative regardless of stored sign', () => {
    expect(movementDelta(mv({ movement_type: 'sale', quantity: 360 }))).toBe(-360)
    expect(movementDelta(mv({ movement_type: 'issue', quantity: 33 }))).toBe(-33)
    expect(movementDelta(mv({ movement_type: 'loss', quantity: 12 }))).toBe(-12)
    expect(movementDelta(mv({ movement_type: 'transfer_out', quantity: -5 }))).toBe(-5)
  })
  it('adjustment keeps its given sign', () => {
    expect(movementDelta(mv({ movement_type: 'adjustment', quantity: -4 }))).toBe(-4)
    expect(movementDelta(mv({ movement_type: 'adjustment', quantity: 6 }))).toBe(6)
  })
  it('is robust to junk quantities', () => {
    expect(movementDelta(mv({ movement_type: 'sale', quantity: NaN }))).toBe(-0)
    expect(movementDelta(mv({ movement_type: 'stock_in', quantity: undefined as any }))).toBe(0)
  })
})

describe('movementHolderKey — place, person, neither, or invalid', () => {
  it('a location, an operator, or unassigned', () => {
    expect(movementHolderKey(mv({ movement_type: 'stock_in', quantity: 1, location_id: 'farm' }))).toBe('location:farm')
    expect(movementHolderKey(mv({ movement_type: 'sale', quantity: 1, operator_id: 'musa' }))).toBe('operator:musa')
    expect(movementHolderKey(mv({ movement_type: 'stock_in', quantity: 1 }))).toBe('unassigned')
  })
  it('a dual-holder row is flagged invalid, never attributed to the place', () => {
    expect(movementHolderKey(mv({ movement_type: 'stock_in', quantity: 1, location_id: 'farm', operator_id: 'musa' })))
      .toBe('invalid:dual-holder')
  })
})

describe('balances', () => {
  it('sum deltas per item per holder', () => {
    const moves: StockMovement[] = [
      mv({ movement_type: 'stock_in', quantity: 40, location_id: 'store', catalogue_item_id: 'feed' }),
      mv({ movement_type: 'issue', quantity: 33, location_id: 'store', catalogue_item_id: 'feed' }),
      mv({ movement_type: 'produced', quantity: 420, location_id: 'farm', catalogue_item_id: 'egg' }),
      mv({ movement_type: 'loss', quantity: 12, location_id: 'farm', catalogue_item_id: 'egg' }),
    ]
    const b = balancesByHolder(moves)
    expect(b['feed']['location:store']).toBe(7)   // 40 - 33
    expect(b['egg']['location:farm']).toBe(408)   // 420 - 12
  })

  it('itemBalanceAtHolder and itemTotalBalance', () => {
    const moves: StockMovement[] = [
      mv({ movement_type: 'produced', quantity: 100, location_id: 'farm', catalogue_item_id: 'egg' }),
      mv({ movement_type: 'transfer_out', quantity: 60, location_id: 'farm', catalogue_item_id: 'egg' }),
      mv({ movement_type: 'transfer_in', quantity: 60, operator_id: 'musa', catalogue_item_id: 'egg' }),
      mv({ movement_type: 'sale', quantity: 50, operator_id: 'musa', catalogue_item_id: 'egg' }),
    ]
    expect(itemBalanceAtHolder(moves, 'egg', 'location:farm')).toBe(40) // 100 - 60
    expect(itemBalanceAtHolder(moves, 'egg', 'operator:musa')).toBe(10) // 60 - 50
    expect(itemTotalBalance(moves, 'egg')).toBe(50) // 40 + 10 still in the system
  })

  it('ignores rows without an item id', () => {
    const moves = [mv({ movement_type: 'stock_in', quantity: 5, catalogue_item_id: '' as any })]
    expect(balancesByHolder(moves)).toEqual({})
  })
})

describe('reconcileHolder / reconcileOperator — the day-end check (per item)', () => {
  it("breaks a driver's day for one item into loaded, sold, delivered, loss and carried", () => {
    // Musa loads 100 eggs, sells 50 on the road, breaks 5, delivers 40 to the store.
    const moves: StockMovement[] = [
      mv({ movement_type: 'transfer_in', quantity: 100, operator_id: 'musa', catalogue_item_id: 'egg' }),
      mv({ movement_type: 'sale', quantity: 50, operator_id: 'musa', catalogue_item_id: 'egg' }),
      mv({ movement_type: 'loss', quantity: 5, operator_id: 'musa', catalogue_item_id: 'egg' }),
      mv({ movement_type: 'transfer_out', quantity: 40, operator_id: 'musa', catalogue_item_id: 'egg' }),
    ]
    const p = reconcileOperator(moves, 'musa', 'egg')
    expect(p.transferredIn).toBe(100)
    expect(p.sold).toBe(50)
    expect(p.loss).toBe(5)
    expect(p.transferredOut).toBe(40)
    expect(p.balance).toBe(5) // 100 - 50 - 5 - 40 = 5 still carried
  })

  it('NEVER combines different items into one balance', () => {
    // Musa carries eggs AND birds. Their positions must stay separate.
    const moves: StockMovement[] = [
      mv({ movement_type: 'transfer_in', quantity: 100, operator_id: 'musa', catalogue_item_id: 'egg' }),
      mv({ movement_type: 'sale', quantity: 60, operator_id: 'musa', catalogue_item_id: 'egg' }),
      mv({ movement_type: 'transfer_in', quantity: 20, operator_id: 'musa', catalogue_item_id: 'bird' }),
      mv({ movement_type: 'sale', quantity: 8, operator_id: 'musa', catalogue_item_id: 'bird' }),
    ]
    expect(reconcileOperator(moves, 'musa', 'egg').balance).toBe(40)  // 100 - 60
    expect(reconcileOperator(moves, 'musa', 'bird').balance).toBe(12) // 20 - 8
    const byItem = reconcileHolderByItem(moves, 'operator:musa')
    expect(byItem['egg'].balance).toBe(40)
    expect(byItem['bird'].balance).toBe(12)
    expect(Object.keys(byItem).sort()).toEqual(['bird', 'egg'])
  })

  it('a location position reflects received, issued and produced', () => {
    const moves: StockMovement[] = [
      mv({ movement_type: 'stock_in', quantity: 40, location_id: 'store', catalogue_item_id: 'feed' }),
      mv({ movement_type: 'issue', quantity: 33, location_id: 'store', catalogue_item_id: 'feed' }),
      mv({ movement_type: 'adjustment', quantity: -1, location_id: 'store', catalogue_item_id: 'feed' }),
    ]
    const p = reconcileLocation(moves, 'store', 'feed')
    expect(p.received).toBe(40)
    expect(p.issued).toBe(33)
    expect(p.adjustment).toBe(-1)
    expect(p.balance).toBe(6) // 40 - 33 - 1
  })

  it('only counts the requested holder', () => {
    const moves: StockMovement[] = [
      mv({ movement_type: 'sale', quantity: 10, operator_id: 'musa', catalogue_item_id: 'egg' }),
      mv({ movement_type: 'sale', quantity: 99, operator_id: 'other', catalogue_item_id: 'egg' }),
    ]
    expect(reconcileHolder(moves, 'operator:musa', 'egg').sold).toBe(10)
  })
})

describe('lossTotal and salesByChannel', () => {
  it('sums breakage magnitude only', () => {
    const moves: StockMovement[] = [
      mv({ movement_type: 'loss', quantity: 12 }),
      mv({ movement_type: 'loss', quantity: 7 }),
      mv({ movement_type: 'sale', quantity: 100 }),
    ]
    expect(lossTotal(moves)).toBe(19)
  })

  it('groups sales by channel and buckets blanks as unassigned', () => {
    const out = salesByChannel([
      { channel_id: 'store', quantity: 200 },
      { channel_id: 'route', quantity: 50 },
      { channel_id: 'store', quantity: 30 },
      { channel_id: null, quantity: 10 },
    ])
    expect(out).toEqual({ store: 230, route: 50, unassigned: 10 })
  })
})
