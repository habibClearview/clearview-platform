import { describe, it, expect } from 'vitest'
import { shouldClearQueue } from '../lib/field-db'
import { friendlyDbError } from '../lib/field-errors'
import { buildAutoCogsRow, type CatalogueItemForCogs } from '../lib/field-cogs'
import { isPlanLineValidForUnit } from '../lib/catalogue-validation'

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

describe('Field Sync — aggregation error messaging distinguishes permanent vs transient failures', () => {
  // Re-implements the branch from app/api/field/sync/route.ts: a closed
  // period rejects aggregation permanently (via the DB trigger in
  // supabase/migrations/2026_07_04_month_end_close.sql) and will NEVER
  // "catch up automatically" -- unlike a genuine transient failure, so
  // the message shown must not imply a retry will eventually fix it.
  function aggregationErrorMessage(rawMessage: string): string {
    return rawMessage.includes('is closed and cannot be edited')
      ? 'Your entries were saved, but the period they belong to has already been closed by your Finance Manager. Ask them to reopen it if these figures need to be included.'
      : 'Your entries were saved, but the summary figures haven\'t updated yet. They\'ll catch up automatically -- no need to re-enter anything.'
  }

  it('REG: a closed-period rejection tells the operator it needs a Finance Manager, not a wait', () => {
    const msg = aggregationErrorMessage('This period (2026-06-01) is closed and cannot be edited. Ask your Finance Manager to reopen it first.')
    expect(msg.toLowerCase()).toContain('finance manager')
    expect(msg.toLowerCase()).not.toContain('automatically')
  })

  it('REG: a genuine transient aggregation error still says it will catch up automatically', () => {
    const msg = aggregationErrorMessage('connection timeout')
    expect(msg.toLowerCase()).toContain('automatically')
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

// ── Field Sync — per-entry queue clearing via synced_local_ids ──
// Models the exact scenario reported live: a sync batch with some entries
// that succeeded and others that permanently fail validation (e.g. a
// queued sale referencing a catalogue item that belongs to a different
// business unit -- it will keep failing on every retry, forever, no
// matter how many times "Sync Now" is pressed). The old all-or-nothing
// rule meant the good entries never cleared either, since the batch
// always had at least one error. This re-implements the same filtering
// logic used in both app/field/page.tsx and public/field-sw.js.

function selectEntriesToClear(queuedLocalIds: string[], syncedLocalIds: string[]): string[] {
  const synced = new Set(syncedLocalIds)
  return queuedLocalIds.filter(id => synced.has(id))
}

describe('Field Sync — per-entry clearing via synced_local_ids', () => {
  it('REG: entries the server confirms synced are cleared even when other entries in the same batch failed', () => {
    const queued = ['good-1', 'good-2', 'bad-wrong-unit-1', 'bad-wrong-unit-2']
    const synced = ['good-1', 'good-2'] // the 2 bad ones never made it into synced_local_ids
    const toClear = selectEntriesToClear(queued, synced)
    expect(toClear).toEqual(['good-1', 'good-2'])
    // Critically, the bad ones are NOT in the result -- they stay queued
    expect(toClear).not.toContain('bad-wrong-unit-1')
    expect(toClear).not.toContain('bad-wrong-unit-2')
  })

  it('REG: a permanently bad entry does not block genuinely good entries from clearing on repeated retries', () => {
    // Simulates pressing "Sync Now" three times in a row -- the 2 bad
    // entries never leave the queue (they fail the same way every time),
    // but they must not prevent the good ones from clearing on attempt 1.
    let queued = ['good-1', 'good-2', 'bad-1', 'bad-2']
    for (let attempt = 0; attempt < 3; attempt++) {
      const synced = queued.filter(id => id.startsWith('good')) // server always accepts the good ones, rejects the bad ones
      const toClear = selectEntriesToClear(queued, synced)
      queued = queued.filter(id => !toClear.includes(id))
    }
    expect(queued).toEqual(['bad-1', 'bad-2']) // only the permanently bad ones remain, not stuck good ones
  })

  it('REG: if the server reports zero synced_local_ids (e.g. the whole batch failed at the database step), nothing is cleared', () => {
    const queued = ['a', 'b', 'c']
    const toClear = selectEntriesToClear(queued, [])
    expect(toClear).toEqual([])
  })

  it('REG: an entry with no local_id (older client) is never mistakenly matched against another entry\'s id', () => {
    const queued = ['real-id-1', undefined as any].filter(Boolean)
    const synced = ['real-id-1']
    expect(selectEntriesToClear(queued, synced)).toEqual(['real-id-1'])
  })
})

// ── Standard costing: automatic COGS generation (app/api/field/sync/route.ts) ──
// Imports the real buildAutoCogsRow from src/lib/field-cogs.ts rather than
// re-implementing it here -- a regression in the actual COGS-generation
// logic is now caught, not a copy of it. Per docs/ACCOUNTING_ARCHITECTURE.md
// section 3: standard costing means COGS is always quantity x the
// catalogue's STANDARD cost price, never affected by a sale-side bulk
// override on the sell price -- what the goods actually cost the business
// doesn't change just because they were sold at a discount.

describe('Standard Costing — automatic COGS generation', () => {
  it('REG: no COGS row is generated when the catalogue item has no cost price set -- never fabricates a cost that was never provided', () => {
    const item: CatalogueItemForCogs = { id: 'c1', name: 'Maize', cost_price: null, cogs_plan_line_id: null }
    expect(buildAutoCogsRow(item, 10, 'local_1')).toBeNull()
  })

  it('REG: a COGS row is generated when cost_price and cogs_plan_line_id are both set', () => {
    const item: CatalogueItemForCogs = { id: 'c1', name: 'Maize', cost_price: 8000, cogs_plan_line_id: 'cogs_line_1' }
    const row = buildAutoCogsRow(item, 10, 'local_1')
    expect(row).not.toBeNull()
    expect(row!.amount).toBe(80000)
    expect(row!.plan_line_id).toBe('cogs_line_1')
    expect(row!.category).toBe('cost_of_sales')
  })

  it('REG: COGS uses the STANDARD cost price, completely independent of any sell-side bulk override -- the goods did not get cheaper to buy just because they were sold at a discount', () => {
    const item: CatalogueItemForCogs = { id: 'c1', name: 'Maize', cost_price: 8000, cogs_plan_line_id: 'cogs_line_1' }
    // Same quantity, regardless of what sell-price override was used for
    // the revenue side -- buildAutoCogsRow doesn't even take a sell price,
    // by design, because it's irrelevant to what COGS should be.
    const row = buildAutoCogsRow(item, 10, 'local_1')
    expect(row!.unit_price).toBe(8000)
    expect(row!.amount).toBe(80000)
  })

  it('REG: the COGS local_id is deterministically derived from the sale local_id -- a retry of the same sale must produce the identical COGS local_id, or idempotency dedup would not protect the COGS side', () => {
    const item: CatalogueItemForCogs = { id: 'c1', name: 'Maize', cost_price: 8000, cogs_plan_line_id: 'cogs_line_1' }
    const first = buildAutoCogsRow(item, 10, 'local_abc')
    const retry = buildAutoCogsRow(item, 10, 'local_abc')
    expect(first!.local_id).toBe(retry!.local_id)
    expect(first!.local_id).toBe('local_abc_cogs')
  })

  it('REG: cost_price of exactly zero is still a valid, deliberately-set cost -- must not be treated the same as "not set"', () => {
    // A donated or free-of-cost input is a real business scenario --
    // 0 is a real answer, not the absence of one. Only null/undefined
    // means "not set".
    const item: CatalogueItemForCogs = { id: 'c1', name: 'Free Sample', cost_price: 0, cogs_plan_line_id: 'cogs_line_1' }
    const row = buildAutoCogsRow(item, 10, 'local_1')
    expect(row).not.toBeNull()
    expect(row!.amount).toBe(0)
  })
})

// ── Catalogue PATCH: cost_price/cogs_plan_line_id atomicity ──────────────
// Re-implements the effective-state validation from
// app/api/field/admin/catalogue/route.ts's PATCH handler: a set cost
// price always needs a COGS category, checked against what the update
// would ACTUALLY produce (existing value merged with the incoming
// change), not just the fields present in a single request.

function computeEffectiveCostState(
  existing: { cost_price: number | null; cogs_plan_line_id: string | null },
  patch: { cost_price?: number | null; cogs_plan_line_id?: string | null }
) {
  const effectiveCostPrice = patch.cost_price !== undefined ? patch.cost_price : existing.cost_price
  const effectiveCogsLine = patch.cogs_plan_line_id !== undefined ? patch.cogs_plan_line_id : existing.cogs_plan_line_id
  const valid = !(effectiveCostPrice !== null && effectiveCostPrice !== undefined && !effectiveCogsLine)
  return { effectiveCostPrice, effectiveCogsLine, valid }
}

describe('Catalogue PATCH — cost_price/cogs_plan_line_id atomicity', () => {
  it('REG: setting cost_price without cogs_plan_line_id, when neither existed before, is invalid', () => {
    const result = computeEffectiveCostState({ cost_price: null, cogs_plan_line_id: null }, { cost_price: 5000 })
    expect(result.valid).toBe(false)
  })

  it('REG: clearing cogs_plan_line_id while an existing cost_price remains is invalid -- this is the exact gap CodeRabbit caught', () => {
    // Item already has both set; a PATCH that only touches
    // cogs_plan_line_id (clearing it) must be rejected because it would
    // leave a costed item with nowhere for COGS to post -- checking only
    // the fields present in THIS request would miss this entirely.
    const result = computeEffectiveCostState({ cost_price: 5000, cogs_plan_line_id: 'line_a' }, { cogs_plan_line_id: null })
    expect(result.valid).toBe(false)
  })

  it('REG: setting cost_price when cogs_plan_line_id already exists on the record is valid', () => {
    const result = computeEffectiveCostState({ cost_price: null, cogs_plan_line_id: 'line_a' }, { cost_price: 5000 })
    expect(result.valid).toBe(true)
  })

  it('REG: providing both cost_price and cogs_plan_line_id together in one request is valid', () => {
    const result = computeEffectiveCostState({ cost_price: null, cogs_plan_line_id: null }, { cost_price: 5000, cogs_plan_line_id: 'line_a' })
    expect(result.valid).toBe(true)
  })

  it('REG: clearing cost_price entirely is always valid, regardless of cogs_plan_line_id', () => {
    const result = computeEffectiveCostState({ cost_price: 5000, cogs_plan_line_id: 'line_a' }, { cost_price: null })
    expect(result.valid).toBe(true)
  })

  it('REG: a patch touching unrelated fields (e.g. just active status) does not disturb an already-valid cost/COGS pairing', () => {
    const result = computeEffectiveCostState({ cost_price: 5000, cogs_plan_line_id: 'line_a' }, {})
    expect(result.valid).toBe(true)
    expect(result.effectiveCostPrice).toBe(5000)
    expect(result.effectiveCogsLine).toBe('line_a')
  })
})

// ── Catalogue PATCH: business_unit_id change auto-clears cost_price/cogs_plan_line_id ──
// Re-implements the auto-clear logic from the PATCH handler: moving an
// item to a different business unit invalidates any existing
// cogs_plan_line_id, since a COGS category belongs to one specific
// unit's plan lines.

function computeStateAfterUnitMove(
  existing: { cost_price: number | null; cogs_plan_line_id: string | null },
  businessUnitIdChanging: boolean
) {
  if (businessUnitIdChanging && existing.cost_price !== null) {
    return { cost_price: null, cogs_plan_line_id: null }
  }
  return { cost_price: existing.cost_price, cogs_plan_line_id: existing.cogs_plan_line_id }
}

describe('Catalogue PATCH — business_unit_id change clears stale cost/COGS pairing', () => {
  it('REG: moving a costed item to a different unit clears both cost_price and cogs_plan_line_id', () => {
    const result = computeStateAfterUnitMove({ cost_price: 5000, cogs_plan_line_id: 'line_a' }, true)
    expect(result.cost_price).toBeNull()
    expect(result.cogs_plan_line_id).toBeNull()
  })

  it('REG: moving an item with no cost price set is a no-op for cost/COGS fields', () => {
    const result = computeStateAfterUnitMove({ cost_price: null, cogs_plan_line_id: null }, true)
    expect(result.cost_price).toBeNull()
    expect(result.cogs_plan_line_id).toBeNull()
  })

  it('REG: NOT moving business unit leaves an existing cost/COGS pairing untouched', () => {
    const result = computeStateAfterUnitMove({ cost_price: 5000, cogs_plan_line_id: 'line_a' }, false)
    expect(result.cost_price).toBe(5000)
    expect(result.cogs_plan_line_id).toBe('line_a')
  })
})

// ── Catalogue PATCH: plan_line_id must actually belong to business_unit_id ──
// Imports and exercises the real isPlanLineValidForUnit directly (not a
// reimplementation) -- a regression in the route's own cross-unit check
// is now caught, not a copy of it.

describe('Catalogue PATCH — plan_line_id must belong to the effective business_unit_id', () => {
  const planLines = [
    { id: 'rev_a', unit_id: 'unit_a', category: 'revenue', active: true },
    { id: 'rev_b', unit_id: 'unit_b', category: 'revenue', active: true },
    { id: 'cogs_a', unit_id: 'unit_a', category: 'cost_of_sales', active: true },
    { id: 'rev_a_inactive', unit_id: 'unit_a', category: 'revenue', active: false },
  ]

  it('REG: a revenue line that genuinely belongs to the given unit is valid', () => {
    expect(isPlanLineValidForUnit(planLines, 'rev_a', 'unit_a')).toBe(true)
  })

  it('REG: a revenue line belonging to a DIFFERENT unit is rejected -- the exact cross-unit mismatch this check exists for', () => {
    expect(isPlanLineValidForUnit(planLines, 'rev_a', 'unit_b')).toBe(false)
    expect(isPlanLineValidForUnit(planLines, 'rev_b', 'unit_a')).toBe(false)
  })

  it('REG: a cost_of_sales line is rejected even for the right unit -- catalogue items only roll up into revenue', () => {
    expect(isPlanLineValidForUnit(planLines, 'cogs_a', 'unit_a')).toBe(false)
  })

  it('REG: an inactive revenue line is rejected even for the right unit', () => {
    expect(isPlanLineValidForUnit(planLines, 'rev_a_inactive', 'unit_a')).toBe(false)
  })

  it('REG: a nonexistent plan_line_id is rejected', () => {
    expect(isPlanLineValidForUnit(planLines, 'does_not_exist', 'unit_a')).toBe(false)
  })
})

describe('isPlanLineValidForUnit — generalized expectedCategory (used by field sync cost entries)', () => {
  const planLines = [
    { id: 'rev_a', unit_id: 'unit_a', category: 'revenue', active: true },
    { id: 'cogs_a', unit_id: 'unit_a', category: 'cost_of_sales', active: true },
    { id: 'opex_livestock', unit_id: 'unit_livestock', category: 'direct_opex', active: true },
    { id: 'opex_cropfarm', unit_id: 'unit_cropfarm', category: 'direct_opex', active: true },
  ]

  it('REG: a cost_of_sales line is valid for its own unit when cost_of_sales is the expected category', () => {
    expect(isPlanLineValidForUnit(planLines, 'cogs_a', 'unit_a', 'cost_of_sales')).toBe(true)
  })

  it('REG: the exact live scenario -- a cost entry submitted under the Livestock operator referencing a Crop Farm plan line is rejected', () => {
    // This is what was found live: a cost entry synced under
    // operator.business_unit_id = unit_livestock, but referencing
    // opex_cropfarm (a direct_opex line that genuinely belongs to Crop
    // Farm) -- silently misfiling that amount under the wrong unit's
    // actuals, since neither unit's own actuals lookup would ever find
    // it in the right place.
    expect(isPlanLineValidForUnit(planLines, 'opex_cropfarm', 'unit_livestock', 'direct_opex')).toBe(false)
    // The genuinely correct pairing must still be valid
    expect(isPlanLineValidForUnit(planLines, 'opex_livestock', 'unit_livestock', 'direct_opex')).toBe(true)
  })

  it('REG: a line with the right unit but the wrong category is rejected -- a cost entry cannot reference a revenue line', () => {
    expect(isPlanLineValidForUnit(planLines, 'rev_a', 'unit_a', 'direct_opex')).toBe(false)
  })
})
