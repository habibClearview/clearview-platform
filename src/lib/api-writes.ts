// ============================================================
// What arrives from an outside system, and what it becomes.
//
// 20 September 2026.
//
// Every function here is pure: values in, values out, no database and no
// request. The endpoints do the fetching and the storing; these functions make
// the decisions, which is the part worth testing.
//
// TWO RULES THAT RUN THROUGH ALL OF IT.
//
//   1. Nothing the sender says about who they are is believed. The client and
//      the business unit come off the key. A field naming either is ignored,
//      not rejected, because an integrator who sends one is being helpful
//      rather than hostile and their sale should still go in.
//
//   2. Nothing well-formed is thrown away. An item we cannot file goes to the
//      holding pen with the reason and the original payload. The sender is
//      told, and a coach can file it later. The only things refused outright
//      are items so malformed there is nothing to park.
// ============================================================

/** The reason an item could not be filed, in words a coach can act on. */
export type ParkReason = string

export interface Parked {
  external_ref: string | null
  payload: unknown
  reason: ParkReason
}

export interface SaleInput {
  external_ref?: unknown
  catalogue_item_id?: unknown
  quantity?: unknown
  unit_price?: unknown
  occurred_at?: unknown
  date?: unknown
  payment_method?: unknown
  notes?: unknown
}

export const PAYMENT_METHODS = ['cash', 'credit', 'mobile_money', 'bank'] as const

/** A date the database will accept, or null. Accepts a date or a full moment. */
export function isoDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value) return fallback
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return fallback
  return d.toISOString().slice(0, 10)
}

export function isoMoment(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function positiveNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function finiteNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function cleanPaymentMethod(value: unknown): string | null {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value)
    ? value
    : null
}

/** The sender's own reference, which is how we avoid booking anything twice. */
export function externalRef(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null
}

// Carries the two fields buildAutoCogsRow needs as required rather than
// optional, so a catalogue row fetched without them cannot be passed into the
// automatic cost-of-sales booking by mistake.
export interface CatalogueItem {
  id: string
  name: string
  price: number
  plan_line_id: string
  unit_label?: string | null
  cost_price: number | null | undefined
  cogs_plan_line_id: string | null | undefined
}

export interface SaleDecision {
  /** The row to write, or null when the item was parked instead. */
  row: Record<string, unknown> | null
  parked: Parked | null
  /** Set when the price sent differs materially from the catalogue's own. */
  priceAlert: string | null
}

/** How far a sent price may stray from the catalogue before a coach is told. */
export const PRICE_ALERT_THRESHOLD = 0.10

/**
 * One sale, judged.
 *
 * The price comes from the catalogue unless the sender explicitly names a
 * different one, exactly as it does for a phone. A business that discounts in
 * the real world can say so; a business that does not never has to think about
 * price at all, and cannot get it wrong.
 */
export function decideSale(
  input: SaleInput,
  catalogue: Map<string, CatalogueItem>,
  today: string,
): SaleDecision {
  const ref = externalRef(input.external_ref)
  const park = (reason: string): SaleDecision =>
    ({ row: null, parked: { external_ref: ref, payload: input, reason }, priceAlert: null })

  const itemId = typeof input.catalogue_item_id === 'string' ? input.catalogue_item_id : ''
  if (!itemId) return park('No catalogue_item_id was sent, so there is no way to tell what was sold.')

  const item = catalogue.get(itemId)
  if (!item) {
    return park(`The catalogue item "${itemId}" is not in this business unit's price list, or has been switched off. It may be a new product that needs adding and pricing.`)
  }

  const quantity = positiveNumber(input.quantity)
  if (quantity === null) {
    return park(`A sale of "${item.name}" arrived with no usable quantity. A quantity must be a number above zero.`)
  }

  const standard = Number(item.price)
  let price = standard
  let overridden = false
  if (input.unit_price !== undefined && input.unit_price !== null) {
    const sent = finiteNumber(input.unit_price)
    if (sent === null || sent < 0) {
      return park(`A sale of "${item.name}" named a price that is not a number at or above zero.`)
    }
    price = sent
    overridden = true
  }

  const strays = overridden && standard > 0
    && Math.abs(price - standard) / standard > PRICE_ALERT_THRESHOLD

  return {
    row: {
      plan_line_id: item.plan_line_id,
      plan_line_name: item.name,
      unit_label: item.unit_label || null,
      transaction_type: 'sale',
      category: 'revenue',
      amount: quantity * price,
      quantity,
      unit_price: price,
      payment_method: cleanPaymentMethod(input.payment_method),
      transaction_date: isoDate(input.date ?? input.occurred_at, today),
      captured_at: isoMoment(input.occurred_at),
      notes: typeof input.notes === 'string' ? input.notes.slice(0, 500) : null,
      catalogue_item_id: item.id,
      price_overridden: overridden,
      price_alert: strays,
      local_id: ref,
    },
    parked: null,
    priceAlert: strays ? `${item.name}: sent ${price}, price list says ${standard}` : null,
  }
}

export interface CostInput {
  external_ref?: unknown
  cost_line_id?: unknown
  amount?: unknown
  date?: unknown
  occurred_at?: unknown
  payment_method?: unknown
  notes?: unknown
  description?: unknown
}

export interface PlanLine {
  id: string
  name: string
  category: string
  unit_id: string
  active: boolean
}

export const SPENDING_CATEGORIES = ['cost_of_sales', 'staff', 'direct_opex', 'shared']

export interface CostDecision {
  row: Record<string, unknown> | null
  parked: Parked | null
}

/**
 * One cost, judged.
 *
 * The category is never taken from the sender. It is read off the cost line
 * itself, so an amount cannot be filed under the wrong heading by a sender who
 * guessed. This is the bug the phone's own sync had, and it is not repeated.
 */
export function decideCost(
  input: CostInput,
  lines: Map<string, PlanLine>,
  unitId: string,
  today: string,
): CostDecision {
  const ref = externalRef(input.external_ref)
  const park = (reason: string): CostDecision =>
    ({ row: null, parked: { external_ref: ref, payload: input, reason } })

  const lineId = typeof input.cost_line_id === 'string' ? input.cost_line_id : ''
  if (!lineId) {
    const described = typeof input.description === 'string' && input.description
      ? ` (described as "${input.description}")`
      : ''
    return park(`A cost${described} arrived without a cost_line_id, so there is no heading to file it under.`)
  }

  const line = lines.get(lineId)
  if (!line || !line.active || line.unit_id !== unitId) {
    return park(`The cost line "${lineId}" does not belong to this business unit, or has been switched off.`)
  }
  if (!SPENDING_CATEGORIES.includes(line.category)) {
    return park(`"${line.name}" is not a spending heading, so a cost cannot be filed against it.`)
  }

  const amount = finiteNumber(input.amount)
  if (amount === null || amount < 0) {
    return park(`A cost against "${line.name}" arrived with no usable amount. An amount must be a number at or above zero.`)
  }

  return {
    row: {
      plan_line_id: line.id,
      plan_line_name: line.name,
      transaction_type: line.category === 'cost_of_sales' ? 'cost' : 'expense',
      category: line.category,
      amount,
      quantity: null,
      unit_price: null,
      payment_method: cleanPaymentMethod(input.payment_method),
      transaction_date: isoDate(input.date ?? input.occurred_at, today),
      captured_at: isoMoment(input.occurred_at),
      notes: typeof input.notes === 'string' ? input.notes.slice(0, 500) : null,
      catalogue_item_id: null,
      price_overridden: false,
      price_alert: false,
      local_id: ref,
    },
    parked: null,
  }
}

/**
 * A month key the actuals table will accept: YYYY-MM.
 *
 * Accepts a month, a date or a moment, because all three are things a
 * bookkeeping system will send and all three mean the same month.
 */
export function monthKey(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 7)
}

export interface ActualDecision {
  month: string
  /** line id to amount, for lines that belong to this unit. */
  values: Record<string, number>
  parked: Parked[]
}

/**
 * A month's totals, one figure per line.
 *
 * The route for a business whose bookkeeper closes a month rather than a till
 * that rings every sale. Both land in the same place; this one simply arrives
 * once a month with the answer already added up.
 */
export function decideActuals(
  month: string,
  entries: unknown,
  lines: Map<string, PlanLine>,
  unitId: string,
): ActualDecision {
  const values: Record<string, number> = {}
  const parked: Parked[] = []
  const list = Array.isArray(entries) ? entries : []

  for (const raw of list) {
    const e = (raw || {}) as { line_id?: unknown; amount?: unknown }
    const ref = externalRef((raw as any)?.external_ref)
    const lineId = typeof e.line_id === 'string' ? e.line_id : ''
    const line = lineId ? lines.get(lineId) : undefined
    if (!line || !line.active || line.unit_id !== unitId) {
      parked.push({
        external_ref: ref,
        payload: raw,
        reason: `The line "${lineId || '(none sent)'}" does not belong to this business unit, or has been switched off.`,
      })
      continue
    }
    const amount = finiteNumber(e.amount)
    if (amount === null) {
      parked.push({
        external_ref: ref,
        payload: raw,
        reason: `The figure sent for "${line.name}" is not a number.`,
      })
      continue
    }
    // A line sent twice in one call is added up rather than the second
    // silently winning, because two entries for one line in one month is what
    // a sender does when their own books split it.
    values[line.id] = (values[line.id] || 0) + amount
  }

  return { month, values, parked }
}
