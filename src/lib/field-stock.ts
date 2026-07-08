// Field stock tracking. field_stock_levels holds the current on-hand
// quantity per (business_unit_id, catalogue_item_id); field_stock_movements
// is the full ledger behind it. quantity_on_hand is never edited
// directly -- it's always the running sum of every movement recorded
// for that item, so there's a real audit trail behind the number an
// operator checks before promising a customer stock.

export type StockMovementType = 'sale' | 'stock_in' | 'adjustment' | 'transfer_out' | 'transfer_in'

// The signed quantity delta a movement applies to quantity_on_hand.
// Sales and transfers-out always reduce stock; stock received and
// transfers-in always increase it. A manual adjustment can go either
// way, so its sign is whatever the caller (a coach correcting for
// spoilage, loss, or a stocktake discrepancy) explicitly records --
// never inferred.
export function stockMovementDelta(movementType: StockMovementType, quantity: number): number {
  const magnitude = Math.abs(quantity)
  switch (movementType) {
    case 'sale':
    case 'transfer_out':
      return -magnitude
    case 'stock_in':
    case 'transfer_in':
      return magnitude
    case 'adjustment':
      // Adjustments carry their own sign -- a positive adjustment (e.g.
      // correcting an undercount) increases stock, a negative one (e.g.
      // spoilage or loss) decreases it.
      return quantity
  }
}

// Applies a single movement to a starting on-hand quantity, returning
// the new balance. Never lets stock go negative in the RESULT -- a
// sale that would take stock below zero is still recorded (the ledger
// entry itself is never rejected or rewritten, since the sale genuinely
// happened), but the resulting on-hand balance is floored at zero
// rather than showing an impossible negative number, with the
// shortfall visible by comparing the movement's own delta against the
// balance actually reached.
export function applyStockMovement(currentQuantity: number, movementType: StockMovementType, movementQuantity: number): number {
  const delta = stockMovementDelta(movementType, movementQuantity)
  return Math.max(0, currentQuantity + delta)
}

// Recomputes a full on-hand balance from scratch given every movement
// in order -- used to verify field_stock_levels.quantity_on_hand
// genuinely matches its own ledger (field_stock_movements), rather than
// trusting a stored running total that could have drifted from a bug
// or a manual database edit.
export function recomputeStockFromMovements(movements: {movement_type: StockMovementType; quantity: number}[]): number {
  return movements.reduce((balance, m) => applyStockMovement(balance, m.movement_type, m.quantity), 0)
}

export interface StockValidationInput {
  movementType: StockMovementType
  quantity: number
  currentQuantity: number
}

// A sale or transfer-out that would take stock below zero is flagged
// (not silently allowed, not silently blocked) -- the coach's own
// judgment call is whether this represents a genuine backorder /
// negative-stock situation worth recording anyway, or a data entry
// mistake worth catching before it happens.
export function wouldGoNegative(input: StockValidationInput): boolean {
  if (input.movementType !== 'sale' && input.movementType !== 'transfer_out') return false
  return input.currentQuantity - Math.abs(input.quantity) < 0
}
