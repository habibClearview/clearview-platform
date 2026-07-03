import { describe, it, expect } from 'vitest'

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
