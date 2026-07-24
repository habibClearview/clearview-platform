// ============================================================
// Stores & Production — pure engine (Phase 1)
// ============================================================
// Computes stock balances, per-holder positions, movement totals and a
// per-person day-end reconciliation from the movement ledger. Pure functions
// only — no DB, no I/O — so the arithmetic is unit-tested in isolation.
//
// Model recap:
//   * A MOVEMENT changes the position of one catalogue item at one HOLDER.
//   * A holder is either a LOCATION (a place: farm, store, warehouse) or an
//     OPERATOR (a person carrying stock: driver, mobile seller).
//   * A balance is the running sum of every movement's signed delta at a holder.
//     field_stock_movements is the source of truth; balances are derived.
//
// Sign is derived from the movement TYPE, not trusted from the stored quantity —
// so a caller that passes a plain positive quantity, or a legacy row that stored
// a signed one, both produce the correct delta.
// ============================================================

export type MovementType =
  | 'sale'         // out — sold to a customer
  | 'stock_in'     // in  — delivery received
  | 'adjustment'   // signed — stock-count correction (may be + or -)
  | 'transfer_out' // out — dispatched from this holder
  | 'transfer_in'  // in  — received at this holder
  | 'issue'        // out — released to production (consumed)
  | 'produced'     // in  — collected / made
  | 'loss'         // out — breakage / mortality / spoilage

export interface StockMovement {
  catalogue_item_id: string
  movement_type: MovementType
  /** Magnitude of the movement. Its SIGN is ignored; direction comes from the type. */
  quantity: number
  /** Holder = a place (location_id) OR a person (operator_id). Exactly one is set. */
  location_id?: string | null
  operator_id?: string | null
  reason_id?: string | null
}

const INFLOW: ReadonlySet<MovementType> = new Set<MovementType>(['stock_in', 'transfer_in', 'produced'])
const OUTFLOW: ReadonlySet<MovementType> = new Set<MovementType>(['sale', 'transfer_out', 'issue', 'loss'])

/**
 * The effect of one movement on a balance. `adjustment` keeps its given sign (a
 * correction can go either way); every other type takes its direction from the
 * type and the magnitude from |quantity|, so mixed sign conventions can't
 * corrupt a balance.
 */
export function movementDelta(m: StockMovement): number {
  const q = Math.abs(Number(m.quantity) || 0)
  if (m.movement_type === 'adjustment') return Number(m.quantity) || 0
  if (INFLOW.has(m.movement_type)) return q
  if (OUTFLOW.has(m.movement_type)) return -q
  return 0
}

/**
 * Stable key for the holder a movement affects: a place, a person, or neither.
 * A row with BOTH a location and an operator is invalid (a movement has exactly
 * one holder — enforced by a DB CHECK, num_nonnulls(location_id, operator_id) <=
 * 1). If one ever slips through we return a distinct 'invalid' key rather than
 * silently attributing the stock to the place, so it shows up instead of
 * corrupting a real balance.
 */
export function movementHolderKey(m: StockMovement): string {
  const hasLocation = !!m.location_id
  const hasOperator = !!m.operator_id
  if (hasLocation && hasOperator) return 'invalid:dual-holder'
  if (hasLocation) return `location:${m.location_id}`
  if (hasOperator) return `operator:${m.operator_id}`
  return 'unassigned'
}

/**
 * Balances for every item at every holder: itemId → holderKey → balance.
 * Balance is the running sum of movement deltas.
 */
export function balancesByHolder(moves: StockMovement[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const m of moves) {
    if (!m || !m.catalogue_item_id) continue
    const item = (out[m.catalogue_item_id] ||= {})
    const key = movementHolderKey(m)
    item[key] = (item[key] || 0) + movementDelta(m)
  }
  return out
}

/** Balance of one item at one holder (0 if it has never moved there). */
export function itemBalanceAtHolder(moves: StockMovement[], itemId: string, holderKey: string): number {
  return (balancesByHolder(moves)[itemId] || {})[holderKey] || 0
}

/** Total balance of an item across ALL holders (whole-business on-hand). */
export function itemTotalBalance(moves: StockMovement[], itemId: string): number {
  const perHolder = balancesByHolder(moves)[itemId] || {}
  return Object.values(perHolder).reduce((a, b) => a + b, 0)
}

export interface HolderPosition {
  received: number   // stock_in
  produced: number   // produced
  transferredIn: number
  sold: number       // |sale|
  issued: number     // |issue|
  transferredOut: number
  loss: number       // |loss| — breakage/mortality/spoilage
  adjustment: number // signed
  balance: number    // net position at this holder
}

const zeroPosition = (): HolderPosition => ({
  received: 0, produced: 0, transferredIn: 0, sold: 0, issued: 0,
  transferredOut: 0, loss: 0, adjustment: 0, balance: 0,
})

// Fold one movement into a position accumulator (magnitudes positive; balance
// signed). Shared by the per-item and grouped reconcilers.
function accumulate(p: HolderPosition, m: StockMovement): void {
  const q = Math.abs(Number(m.quantity) || 0)
  switch (m.movement_type) {
    case 'stock_in': p.received += q; break
    case 'produced': p.produced += q; break
    case 'transfer_in': p.transferredIn += q; break
    case 'sale': p.sold += q; break
    case 'issue': p.issued += q; break
    case 'transfer_out': p.transferredOut += q; break
    case 'loss': p.loss += q; break
    case 'adjustment': p.adjustment += (Number(m.quantity) || 0); break
  }
  p.balance += movementDelta(m)
}

/**
 * A holder's position for ONE catalogue item, broken out by movement type
 * (magnitudes, positive) plus the net balance. Reconciliation is always
 * per-item — different items (eggs vs birds vs feed) have different units and
 * must NEVER be summed into one balance. For a driver, balance = transferredIn
 * − sold − transferredOut − loss (+adj): the quantity of THIS item they must
 * account for at day-end.
 */
export function reconcileHolder(moves: StockMovement[], holderKey: string, catalogueItemId: string): HolderPosition {
  const p = zeroPosition()
  for (const m of moves) {
    if (movementHolderKey(m) !== holderKey) continue
    if (m.catalogue_item_id !== catalogueItemId) continue
    accumulate(p, m)
  }
  return p
}

/** Every item's position at a holder: itemId → position. The whole day-end
 *  picture for a place or person, one row per item (never combined). */
export function reconcileHolderByItem(moves: StockMovement[], holderKey: string): Record<string, HolderPosition> {
  const out: Record<string, HolderPosition> = {}
  for (const m of moves) {
    if (!m || !m.catalogue_item_id) continue
    if (movementHolderKey(m) !== holderKey) continue
    accumulate((out[m.catalogue_item_id] ||= zeroPosition()), m)
  }
  return out
}

/** Convenience: reconcile one item for a person (operator). */
export function reconcileOperator(moves: StockMovement[], operatorId: string, catalogueItemId: string): HolderPosition {
  return reconcileHolder(moves, `operator:${operatorId}`, catalogueItemId)
}

/** Convenience: reconcile one item for a place (location). */
export function reconcileLocation(moves: StockMovement[], locationId: string, catalogueItemId: string): HolderPosition {
  return reconcileHolder(moves, `location:${locationId}`, catalogueItemId)
}

/** Total breakage/loss (magnitude) across a set of movements, optionally per item. */
export function lossTotal(moves: StockMovement[]): number {
  return moves.reduce((a, m) => a + (m.movement_type === 'loss' ? Math.abs(Number(m.quantity) || 0) : 0), 0)
}

export interface SaleLike {
  channel_id?: string | null
  quantity?: number | null
}

/**
 * Group sale quantities by channel id → total. Null/blank channels roll into
 * an 'unassigned' bucket so nothing is silently dropped. This is the raw input
 * to the Phase-2 sales-mix ratios.
 */
export function salesByChannel(sales: SaleLike[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of sales) {
    const key = s.channel_id || 'unassigned'
    out[key] = (out[key] || 0) + (Number(s.quantity) || 0)
  }
  return out
}
