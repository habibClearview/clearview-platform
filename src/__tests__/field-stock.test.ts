import { describe, it, expect } from 'vitest'
import { stockMovementDelta, applyStockMovement, recomputeStockFromMovements, wouldGoNegative } from '../lib/field-stock'

describe('stockMovementDelta — the signed quantity change per movement type', () => {
  it('REG: a sale always reduces stock, regardless of the sign of the quantity passed in', () => {
    expect(stockMovementDelta('sale', 10)).toBe(-10)
    expect(stockMovementDelta('sale', -10)).toBe(-10) // magnitude, not the raw signed value
  })

  it('REG: stock_in always increases stock', () => {
    expect(stockMovementDelta('stock_in', 25)).toBe(25)
  })

  it('REG: transfer_out reduces stock, transfer_in increases it', () => {
    expect(stockMovementDelta('transfer_out', 5)).toBe(-5)
    expect(stockMovementDelta('transfer_in', 5)).toBe(5)
  })

  it('REG: an adjustment carries its own sign -- positive corrects upward, negative corrects downward', () => {
    expect(stockMovementDelta('adjustment', 8)).toBe(8)
    expect(stockMovementDelta('adjustment', -8)).toBe(-8)
  })
})

describe('applyStockMovement — applying one movement to a running balance', () => {
  it('REG: a normal sale reduces the balance correctly', () => {
    expect(applyStockMovement(100, 'sale', 30)).toBe(70)
  })

  it('REG: stock received increases the balance correctly', () => {
    expect(applyStockMovement(50, 'stock_in', 20)).toBe(70)
  })

  it('REG: a sale larger than current stock floors the resulting balance at zero, never negative', () => {
    expect(applyStockMovement(10, 'sale', 15)).toBe(0)
  })

  it('REG: a negative adjustment larger than current stock also floors at zero', () => {
    expect(applyStockMovement(5, 'adjustment', -20)).toBe(0)
  })

  it('REG: transfer_out and transfer_in compose correctly across two applications (the two sides of one transfer)', () => {
    const sourceAfter = applyStockMovement(100, 'transfer_out', 20)
    const destAfter = applyStockMovement(30, 'transfer_in', 20)
    expect(sourceAfter).toBe(80)
    expect(destAfter).toBe(50)
  })
})

describe('recomputeStockFromMovements — rebuilding the balance from the full ledger, not trusting a stored total', () => {
  it('REG: recomputes the correct final balance from a realistic sequence of movements', () => {
    const movements: {movement_type: any; quantity: number}[] = [
      { movement_type: 'stock_in', quantity: 100 },
      { movement_type: 'sale', quantity: 30 },
      { movement_type: 'sale', quantity: 20 },
      { movement_type: 'adjustment', quantity: -5 }, // spoilage
      { movement_type: 'stock_in', quantity: 50 },
    ]
    // 0 + 100 - 30 - 20 - 5 + 50 = 95
    expect(recomputeStockFromMovements(movements)).toBe(95)
  })

  it('REG: an empty movement history (a brand-new catalogue item, never touched) recomputes to exactly zero', () => {
    expect(recomputeStockFromMovements([])).toBe(0)
  })

  it('REG: recomputing is order-dependent -- the same movements in a different order can genuinely produce a different floored result', () => {
    const sellFirst: {movement_type: any; quantity: number}[] = [
      { movement_type: 'sale', quantity: 10 },
      { movement_type: 'stock_in', quantity: 10 },
    ]
    const receiveFirst: {movement_type: any; quantity: number}[] = [
      { movement_type: 'stock_in', quantity: 10 },
      { movement_type: 'sale', quantity: 10 },
    ]
    expect(recomputeStockFromMovements(sellFirst)).toBe(10)
    expect(recomputeStockFromMovements(receiveFirst)).toBe(0)
  })
})

describe('wouldGoNegative — flagging a sale or transfer that would exceed on-hand stock', () => {
  it('REG: a sale within available stock is not flagged', () => {
    expect(wouldGoNegative({ movementType: 'sale', quantity: 10, currentQuantity: 20 })).toBe(false)
  })

  it('REG: a sale exceeding available stock IS flagged', () => {
    expect(wouldGoNegative({ movementType: 'sale', quantity: 25, currentQuantity: 20 })).toBe(true)
  })

  it('REG: a sale exactly exhausting stock (reaching zero, not below) is not flagged', () => {
    expect(wouldGoNegative({ movementType: 'sale', quantity: 20, currentQuantity: 20 })).toBe(false)
  })

  it('REG: transfer_out is checked the same way as a sale', () => {
    expect(wouldGoNegative({ movementType: 'transfer_out', quantity: 25, currentQuantity: 20 })).toBe(true)
  })

  it('REG: stock_in, transfer_in, and adjustment are never flagged -- there is no "insufficient stock" concept for receiving or adjusting', () => {
    expect(wouldGoNegative({ movementType: 'stock_in', quantity: 1000, currentQuantity: 0 })).toBe(false)
    expect(wouldGoNegative({ movementType: 'transfer_in', quantity: 1000, currentQuantity: 0 })).toBe(false)
    expect(wouldGoNegative({ movementType: 'adjustment', quantity: -1000, currentQuantity: 0 })).toBe(false)
  })
})
