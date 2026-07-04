import { describe, it, expect } from 'vitest'
import { shouldClearQueue } from '../lib/field-db'
import { friendlyDbError } from '../lib/field-errors'

// Tests for Clearview Field API route logic
// Tests the validation and transformation logic without HTTP or DB

function validateTransaction(t: any, operator: any) {
  if (!t.plan_line_id) return { valid: false, error: 'Missing plan_line_id' }
  if (t.amount === undefined || t.amount === null) return { valid: false, error: 'Missing amount' }
  if (!t.transaction_type) return { valid: false, error: 'Missing transaction_type' }
  if (!t.category) return { valid: false, error: 'Missing category' }
  return {
    valid: true,
    row: {
      client_id: operator.client_id,        // always from operator, never from request
      business_unit_id: operator.business_unit_id,  // always from operator
      plan_line_id: t.plan_line_id,
      plan_line_name: t.plan_line_name || '',
      transaction_type: t.transaction_type,
      category: t.category,
      amount: Number(t.amount),
      quantity: t.quantity ? Number(t.quantity) : null,
      unit_price: t.unit_price ? Number(t.unit_price) : null,
      payment_method: t.payment_method || null,
      customer_id: t.customer_id || null,
      transaction_date: t.transaction_date || new Date().toISOString().split('T')[0],
      operator_id: operator.id,
      notes: t.notes || null,
    }
  }
}

function buildCatalogue(planLines: any[], unitId: string) {
  return planLines
    .filter(l => l.unit_id === unitId && l.active)
    .map(l => ({
      id: l.id,
      name: l.name,
      category: l.category,
      line_type: l.line_type || 'standard',
      // No prices -- operator enters actual price at transaction time
    }))
}

const mockOperator = { id: 'op1', client_id: 'client_test', business_unit_id: 'u1', active: true }

describe('Field Auth — Catalogue Building', () => {
  const planLines = [
    { id: 'rev1', unit_id: 'u1', name: 'Egg Sales', category: 'revenue', active: true },
    { id: 'cogs1', unit_id: 'u1', name: 'Feed Cost', category: 'cost_of_sales', active: true },
    { id: 'rev2', unit_id: 'u2', name: 'Maize Sales', category: 'revenue', active: true }, // different unit
    { id: 'rev3', unit_id: 'u1', name: 'Off-layers', category: 'revenue', active: false }, // inactive
  ]

  it('returns only lines for the operator\'s unit', () => {
    const catalogue = buildCatalogue(planLines, 'u1')
    expect(catalogue.map(l => l.id)).not.toContain('rev2')
    expect(catalogue.map(l => l.id)).toContain('rev1')
  })

  it('excludes inactive lines', () => {
    const catalogue = buildCatalogue(planLines, 'u1')
    expect(catalogue.map(l => l.id)).not.toContain('rev3')
  })

  it('does not include pre-filled prices', () => {
    const catalogue = buildCatalogue(planLines, 'u1')
    catalogue.forEach(item => {
      expect(item).not.toHaveProperty('standard_price')
      expect(item).not.toHaveProperty('price')
    })
  })
})

describe('Field Sync — Transaction Validation', () => {
  it('accepts valid sale transaction', () => {
    const result = validateTransaction({
      plan_line_id: 'rev1', plan_line_name: 'Eggs',
      transaction_type: 'sale', category: 'revenue',
      amount: 5000, payment_method: 'cash',
    }, mockOperator)
    expect(result.valid).toBe(true)
  })

  it('rejects transaction missing plan_line_id', () => {
    const result = validateTransaction({ amount: 5000, transaction_type: 'sale', category: 'revenue' }, mockOperator)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('plan_line_id')
  })

  it('rejects transaction missing amount', () => {
    const result = validateTransaction({ plan_line_id: 'rev1', transaction_type: 'sale', category: 'revenue' }, mockOperator)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('amount')
  })

  it('accepts zero amount as valid', () => {
    const result = validateTransaction({
      plan_line_id: 'rev1', transaction_type: 'sale',
      category: 'revenue', amount: 0
    }, mockOperator)
    expect(result.valid).toBe(true)
    expect(result.row?.amount).toBe(0)
  })

  it('CRITICAL: client_id always comes from operator, never from request body', () => {
    const result = validateTransaction({
      plan_line_id: 'rev1', transaction_type: 'sale',
      category: 'revenue', amount: 5000,
      client_id: 'hacker_client',  // attacker trying to inject different client_id
    }, mockOperator)
    expect(result.valid).toBe(true)
    expect(result.row?.client_id).toBe('client_test')  // must be operator's client, not request
    expect(result.row?.client_id).not.toBe('hacker_client')
  })

  it('CRITICAL: business_unit_id always comes from operator', () => {
    const result = validateTransaction({
      plan_line_id: 'rev1', transaction_type: 'sale',
      category: 'revenue', amount: 5000,
      business_unit_id: 'different_unit',  // attacker trying to inject different unit
    }, mockOperator)
    expect(result.row?.business_unit_id).toBe('u1')
    expect(result.row?.business_unit_id).not.toBe('different_unit')
  })

  it('amount is parsed as a number', () => {
    const result = validateTransaction({
      plan_line_id: 'rev1', transaction_type: 'sale',
      category: 'revenue', amount: '5000',  // string from JSON
    }, mockOperator)
    expect(typeof result.row?.amount).toBe('number')
    expect(result.row?.amount).toBe(5000)
  })

  it('optional fields default to null when missing', () => {
    const result = validateTransaction({
      plan_line_id: 'rev1', transaction_type: 'sale',
      category: 'revenue', amount: 5000,
    }, mockOperator)
    expect(result.row?.quantity).toBeNull()
    expect(result.row?.customer_id).toBeNull()
    expect(result.row?.payment_method).toBeNull()
    expect(result.row?.notes).toBeNull()
  })
})

describe('Field Customers — Validation', () => {
  function validateCustomer(body: any, operator: any) {
    if (!body.name) return { error: 'Customer name required' }
    return {
      customer: {
        client_id: operator.client_id,
        business_unit_id: operator.business_unit_id,
        name: body.name.trim(),
        phone: body.phone || null,
        village: body.village || null,
        location_notes: body.location_notes || null,
        created_by: operator.id,
      }
    }
  }

  it('requires customer name', () => {
    const result = validateCustomer({}, mockOperator)
    expect(result.error).toBeDefined()
  })

  it('trims whitespace from name', () => {
    const result = validateCustomer({ name: '  John Okello  ' }, mockOperator)
    expect(result.customer?.name).toBe('John Okello')
  })

  it('client_id comes from operator', () => {
    const result = validateCustomer({ name: 'John' }, mockOperator)
    expect(result.customer?.client_id).toBe('client_test')
  })

  it('optional fields are null when missing', () => {
    const result = validateCustomer({ name: 'John' }, mockOperator)
    expect(result.customer?.phone).toBeNull()
    expect(result.customer?.village).toBeNull()
  })

  it('preserves optional fields when provided', () => {
    const result = validateCustomer({ name: 'John', village: 'Gulu', phone: '0777123456' }, mockOperator)
    expect(result.customer?.village).toBe('Gulu')
    expect(result.customer?.phone).toBe('0777123456')
  })
})

// ── Field Operator Admin (creation, tokens, expiry) ────────────
// Re-implements the pure transformation logic from
// app/api/field/admin/operators/route.ts for testing without HTTP/DB.

function computeExpiresAt(expiresInDays: string | number | undefined): string | null {
  if (!expiresInDays) return null
  return new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000).toISOString()
}

function deriveTransactionType(category: string): 'sale' | 'expense' {
  return category === 'revenue' ? 'sale' : 'expense'
}

describe('Field Operator Admin — token expiry', () => {
  it('REG: no expiry given means the token never expires (null)', () => {
    expect(computeExpiresAt(undefined)).toBeNull()
    expect(computeExpiresAt('')).toBeNull()
    expect(computeExpiresAt(0)).toBeNull()
  })

  it('REG: expiry in days computes a future ISO date roughly that many days out', () => {
    const result = computeExpiresAt(30)
    expect(result).not.toBeNull()
    const diffDays = (new Date(result!).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    expect(diffDays).toBeGreaterThan(29.9)
    expect(diffDays).toBeLessThan(30.1)
  })

  it('REG: expiry accepts a string number from a form input', () => {
    const result = computeExpiresAt('7')
    const diffDays = (new Date(result!).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    expect(diffDays).toBeGreaterThan(6.9)
    expect(diffDays).toBeLessThan(7.1)
  })
})

describe('Field Capture — transaction type derivation', () => {
  it('REG: revenue category maps to "sale"', () => {
    expect(deriveTransactionType('revenue')).toBe('sale')
  })
  it('REG: cost_of_sales, staff, and direct_opex all map to "expense"', () => {
    expect(deriveTransactionType('cost_of_sales')).toBe('expense')
    expect(deriveTransactionType('staff')).toBe('expense')
    expect(deriveTransactionType('direct_opex')).toBe('expense')
  })
})

// ── Catalogue-driven sale amount + price alert (app/api/field/sync/route.ts) ──
// Re-implements the pure pricing logic for testing without HTTP/DB. The
// operator only ever supplies catalogue_item_id + quantity (+ an optional
// override_price for bulk sales) -- price and amount are always computed
// here, never trusted from the client for the standard case.

const PRICE_ALERT_THRESHOLD = 0.10

function computeSaleAmount(catalogueItem: { price: number }, quantity: number, overridePrice?: number) {
  const overridden = overridePrice !== undefined
  const priceUsed = overridden ? overridePrice : catalogueItem.price
  const standardPrice = catalogueItem.price
  const deviates = standardPrice > 0 && Math.abs(priceUsed - standardPrice) / standardPrice > PRICE_ALERT_THRESHOLD
  return {
    amount: quantity * priceUsed,
    unit_price: priceUsed,
    price_overridden: overridden,
    price_alert: overridden && deviates,
  }
}

describe('Field Capture — catalogue-driven sale amount', () => {
  const catalogueItem = { price: 1500 }

  it('REG: with no override, amount is quantity x the catalogue standard price', () => {
    const result = computeSaleAmount(catalogueItem, 10)
    expect(result.amount).toBe(15000)
    expect(result.unit_price).toBe(1500)
    expect(result.price_overridden).toBe(false)
  })

  it('REG: the operator never determines price for a standard sale -- only quantity affects amount', () => {
    const a = computeSaleAmount(catalogueItem, 3)
    const b = computeSaleAmount(catalogueItem, 7)
    // Same catalogue item, different quantities -- unit_price must be identical, only amount scales.
    expect(a.unit_price).toBe(b.unit_price)
    expect(b.amount).toBe(a.unit_price * 7)
  })

  it('REG: bulk override uses the override price, not the catalogue price, for the amount', () => {
    const result = computeSaleAmount(catalogueItem, 100, 1300)
    expect(result.amount).toBe(130000)
    expect(result.price_overridden).toBe(true)
  })

  it('REG: an override within 10% of standard price does not trigger a price alert', () => {
    const result = computeSaleAmount(catalogueItem, 10, 1400) // ~6.7% below standard
    expect(result.price_alert).toBe(false)
  })

  it('REG: an override more than 10% below standard price triggers a price alert', () => {
    const result = computeSaleAmount(catalogueItem, 10, 1200) // 20% below standard
    expect(result.price_alert).toBe(true)
  })

  it('REG: an override more than 10% above standard price also triggers a price alert', () => {
    const result = computeSaleAmount(catalogueItem, 10, 1800) // 20% above standard
    expect(result.price_alert).toBe(true)
  })

  it('REG: no override never triggers a price alert, regardless of catalogue price', () => {
    const result = computeSaleAmount(catalogueItem, 10)
    expect(result.price_alert).toBe(false)
  })
})

// ── Sync queue-clearing decision (app/field/page.tsx, public/field-sw.js) ──
// Imports the real shouldClearQueue from src/lib/field-db.ts rather than
// re-implementing the check here -- a regression in the actual guard
// against silent data loss will now fail this test, not just a copy of it.
// public/field-sw.js applies the identical condition inline (it's a plain
// static file and can't import this shared helper); see the cross-reference
// comment there.

describe('Field Sync — friendly error messages', () => {
  // Imports the real friendlyDbError from src/lib/field-errors.ts rather
  // than re-implementing it here -- same reasoning as shouldClearQueue
  // above: a regression in the actual translation is caught, not a copy.

  it('REG: a raw Postgres check-constraint error never reaches the operator as-is', () => {
    const raw = 'new row for relation "field_transactions" violates check constraint "field_transactions_payment_method_check"'
    const friendly = friendlyDbError(raw)
    expect(friendly).not.toContain('relation')
    expect(friendly).not.toContain('field_transactions_payment_method_check')
    expect(friendly.toLowerCase()).toContain('payment method')
  })

  it('REG: a foreign key violation gets a plain-English explanation', () => {
    const raw = 'insert or update on table "field_transactions" violates foreign key constraint "field_transactions_customer_id_fkey"'
    expect(friendlyDbError(raw).toLowerCase()).toContain('no longer exists')
  })

  it('REG: an unrecognised error still gets a non-technical, reassuring fallback', () => {
    const friendly = friendlyDbError('some completely unexpected database error XKCD1234')
    expect(friendly).not.toContain('XKCD1234')
    expect(friendly.toLowerCase()).toContain('safe')
  })
})

describe('Field Sync — queue-clearing decision', () => {
  it('REG: a fully successful sync (no errors) clears the queue', () => {
    expect(shouldClearQueue({ success: true })).toBe(true)
    expect(shouldClearQueue({ success: true, errors: [] })).toBe(true)
  })

  it('REG: success:true WITH populated errors does NOT clear the queue -- this is the exact bug that risked silent data loss', () => {
    expect(shouldClearQueue({ success: true, errors: ['Unknown catalogue item: xyz'] })).toBe(false)
  })

  it('REG: a failed request never clears the queue, regardless of errors content', () => {
    expect(shouldClearQueue({ success: false })).toBe(false)
    expect(shouldClearQueue({ success: false, errors: [] })).toBe(false)
  })

  it('REG: price alerts are a separate field from errors and must not block clearing -- a flagged bulk override still synced successfully', () => {
    // price_alerts live in a different response field entirely; a response
    // with only price_alerts (no errors) should still clear the queue.
    const response = { success: true, errors: undefined, price_alerts: ['Fertiliser: override 1200 vs standard 1500'] }
    expect(shouldClearQueue(response)).toBe(true)
  })
})
