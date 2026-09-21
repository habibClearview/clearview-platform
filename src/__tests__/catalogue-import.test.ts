// ============================================================
// Reading somebody else's price list.
//
// 20 September 2026. Every rule here decides what happens to a real business's
// prices, so each one is pinned down rather than trusted.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  parseCatalogue, planCatalogueImport, readNumber, readActive, pick,
  type ExistingItem, type ImportedItem,
} from '@/lib/catalogue-import'
import { checkSourceUrl, fetchCatalogue } from '@/lib/catalogue-pull'

const NOW = '2026-09-20T00:00:00.000Z'

const existing = (over: Partial<ExistingItem> = {}): ExistingItem => ({
  id: 'x1', external_id: 'SKU1', name: 'Deworming dose', price: 5000,
  plan_line_id: 'rev1', active: true, needs_price: false, ...over,
})
const imported = (over: Partial<ImportedItem> = {}): ImportedItem => ({
  external_id: 'SKU1', name: 'Deworming dose', price: 5000, cost_price: null,
  unit_label: null, item_type: 'product', active: true, ...over,
})

describe('reading whatever column names their system uses', () => {
  it.each([
    ['sku', { sku: 'A1', name: 'Thing', price: 10 }],
    ['code', { code: 'A1', name: 'Thing', price: 10 }],
    ['Item Code with a space and capitals', { 'Item Code': 'A1', name: 'Thing', price: 10 }],
    ['item_number', { item_number: 'A1', product_name: 'Thing', unit_price: 10 }],
    ['product-id with a hyphen', { 'product-id': 'A1', title: 'Thing', 'selling-price': 10 }],
  ])('finds the product code from %s', (_n, row) => {
    const { items } = parseCatalogue([row])
    expect(items).toHaveLength(1)
    expect(items[0].external_id).toBe('A1')
    expect(items[0].name).toBe('Thing')
    expect(items[0].price).toBe(10)
  })

  it('finds the list wherever it is wrapped', () => {
    for (const key of ['items', 'products', 'data', 'results', 'records']) {
      const { items } = parseCatalogue({ [key]: [{ name: 'Thing', price: 1 }] })
      expect(items).toHaveLength(1)
    }
  })

  it('accepts a bare array, which is what most exports are', () => {
    expect(parseCatalogue([{ name: 'Thing', price: 1 }]).items).toHaveLength(1)
  })

  it('uses the name as the code when their system has no code column at all', () => {
    const { items } = parseCatalogue([{ name: 'Deworming dose', price: 5000 }])
    expect(items[0].external_id).toBe('Deworming dose')
  })

  it('settles a row with two code columns by a fixed order, not by key order', () => {
    // sku is preferred over code, and the answer must not depend on which
    // order their system happened to write the keys in.
    const one = parseCatalogue([{ code: 'C', sku: 'S', name: 'Thing' }])
    const other = parseCatalogue([{ sku: 'S', code: 'C', name: 'Thing' }])
    expect(one.items[0].external_id).toBe('S')
    expect(other.items[0].external_id).toBe('S')
  })

  it('reports a row with no name rather than inventing one', () => {
    const { items, problems } = parseCatalogue([{ price: 10 }])
    expect(items).toHaveLength(0)
    expect(problems[0].reason).toContain('no product name')
  })

  it('keeps the first of a repeated code and says so', () => {
    const { items, problems } = parseCatalogue([
      { sku: 'A1', name: 'Thing', price: 1 },
      { sku: 'A1', name: 'Thing again', price: 2 },
    ])
    expect(items).toHaveLength(1)
    expect(items[0].price).toBe(1)
    expect(problems[0].reason).toContain('more than once')
  })

  it('survives rubbish in the list without losing the good rows', () => {
    const { items } = parseCatalogue([null, 'nonsense', 42, { name: 'Real', price: 5 }])
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('Real')
  })

  it('answers empty for something that is not a list at all', () => {
    expect(parseCatalogue(null).items).toHaveLength(0)
    expect(parseCatalogue('hello').items).toHaveLength(0)
  })
})

describe('reading a price out of a spreadsheet export', () => {
  it.each([
    ['a real number', 1500, 1500],
    ['a plain string', '1500', 1500],
    ['thousands separators', '1,500', 1500],
    ['a currency in front', 'UGX 1500', 1500],
    ['a space as separator', '1 500.50', 1500.5],
  ])('reads %s', (_n, sent, expected) => {
    expect(readNumber(sent)).toBe(expected)
  })

  it.each(['', '   ', 'n/a', '-', null, undefined, {}])('refuses %s rather than calling it zero', (sent) => {
    expect(readNumber(sent as any)).toBeNull()
  })

  it('never turns an unreadable price into a free product', () => {
    const { items } = parseCatalogue([{ name: 'Thing', price: 'ask us' }])
    expect(items[0].price).toBeNull()
  })
})

describe('deciding whether a product is still sold', () => {
  it('treats a missing column as still sold, because most exports have none', () => {
    expect(readActive(undefined)).toBe(true)
    expect(readActive('')).toBe(true)
  })

  it.each(['false', 'no', '0', 'inactive', 'discontinued', 'Archived'])('treats %s as no longer sold', (v) => {
    expect(readActive(v)).toBe(false)
  })

  it.each(['true', 'yes', '1', 'active', 'in stock'])('treats %s as still sold', (v) => {
    expect(readActive(v)).toBe(true)
  })
})

describe('what an import does to the catalogue', () => {
  it('creates a product we have never seen', () => {
    const plan = planCatalogueImport([imported({ external_id: 'NEW', name: 'New thing' })], [], 'rev1', 'pull', NOW)
    expect(plan.create).toHaveLength(1)
    expect(plan.create[0].external_id).toBe('NEW')
    expect(plan.create[0].plan_line_id).toBe('rev1')
  })

  it('creates a product with no readable price as unsellable rather than free', () => {
    const plan = planCatalogueImport([imported({ price: null })], [], 'rev1', 'pull', NOW)
    expect(plan.create[0].needs_price).toBe(true)
    expect(plan.create[0].price).toBe(0)
  })

  it('updates a price that changed', () => {
    const plan = planCatalogueImport([imported({ price: 6000 })], [existing()], 'rev1', 'pull', NOW)
    expect(plan.update).toHaveLength(1)
    expect(plan.update[0].changes.price).toBe(6000)
  })

  it('does nothing at all when nothing changed', () => {
    const plan = planCatalogueImport([imported()], [existing()], 'rev1', 'pull', NOW)
    expect(plan.update).toHaveLength(0)
    expect(plan.create).toHaveLength(0)
    expect(plan.deactivate).toHaveLength(0)
    expect(plan.unchanged).toBe(1)
  })

  it('never moves a product the coach has filed under a different revenue line', () => {
    const filed = existing({ plan_line_id: 'rev_special' })
    const plan = planCatalogueImport([imported({ price: 6000 })], [filed], 'rev1', 'pull', NOW)
    expect(plan.update[0].changes).not.toHaveProperty('plan_line_id')
  })

  it('switches off a product that stopped being sent, and never deletes it', () => {
    const plan = planCatalogueImport([], [existing()], 'rev1', 'pull', NOW)
    expect(plan.deactivate).toEqual(['x1'])
    expect(plan).not.toHaveProperty('delete')
  })

  it('leaves a hand-made item alone when their list does not mention it', () => {
    const byHand = existing({ id: 'h1', external_id: null, name: 'Typed in by the coach' })
    const plan = planCatalogueImport([], [byHand], 'rev1', 'pull', NOW)
    expect(plan.deactivate).toHaveLength(0)
  })

  it('adopts a hand-made item by name instead of creating a duplicate of it', () => {
    const byHand = existing({ id: 'h1', external_id: null, name: 'Deworming dose' })
    const plan = planCatalogueImport([imported({ external_id: 'SKU9', name: 'Deworming dose' })], [byHand], 'rev1', 'pull', NOW)
    expect(plan.create).toHaveLength(0)
    expect(plan.update[0].changes.external_id).toBe('SKU9')
  })

  it('un-blocks an item that was waiting for a price when one arrives', () => {
    const waiting = existing({ price: 0, needs_price: true })
    const plan = planCatalogueImport([imported({ price: 4000 })], [waiting], 'rev1', 'pull', NOW)
    expect(plan.update[0].changes.needs_price).toBe(false)
    expect(plan.update[0].changes.price).toBe(4000)
  })

  it('leaves the stored price alone when their export could not be read', () => {
    const plan = planCatalogueImport([imported({ price: null })], [existing({ price: 5000 })], 'rev1', 'pull', NOW)
    expect(plan.update.length === 0 || plan.update[0].changes.price === undefined).toBe(true)
  })

  it('brings a switched-off product back when it reappears', () => {
    const gone = existing({ active: false })
    const plan = planCatalogueImport([imported()], [gone], 'rev1', 'pull', NOW)
    expect(plan.update[0].changes.active).toBe(true)
  })

  it('does not switch off a product twice', () => {
    const plan = planCatalogueImport([], [existing({ active: false })], 'rev1', 'pull', NOW)
    expect(plan.deactivate).toHaveLength(0)
  })
})

describe('the addresses ClearView is willing to fetch from', () => {
  it('accepts an ordinary https address', () => {
    expect(checkSourceUrl('https://their-system.example.com/products').ok).toBe(true)
  })

  it.each([
    ['plain http', 'http://their-system.example.com/products'],
    ['our own machine', 'https://localhost/products'],
    ['a loopback address', 'https://127.0.0.1/products'],
    ['a private network address', 'https://192.168.1.10/products'],
    ['another private range', 'https://10.0.0.5/products'],
    ['the cloud metadata address', 'https://169.254.169.254/latest'],
    ['a name on a private network', 'https://till.local/products'],
    ['a bare machine name', 'https://server/products'],
    ['nonsense', 'not a url'],
    ['nothing', ''],
  ])('refuses %s', (_n, url) => {
    const check = checkSourceUrl(url)
    expect(check.ok).toBe(false)
    expect(check.reason).toBeTruthy()
  })
})

describe('what a coach is told when a read fails', () => {
  const asResponse = (init: { ok: boolean; status: number; body?: string }) => ({
    ok: init.ok, status: init.status,
    headers: new Map([['content-length', String((init.body || '').length)]]) as any,
    text: async () => init.body || '',
  })

  it('explains a refused password rather than showing a status code', async () => {
    const out = await fetchCatalogue('https://x.example.com/p', null,
      (async () => asResponse({ ok: false, status: 401 })) as any)
    expect(out.ok).toBe(false)
    expect(out.detail).toContain('refused us')
  })

  it('explains an address that no longer exists', async () => {
    const out = await fetchCatalogue('https://x.example.com/p', null,
      (async () => asResponse({ ok: false, status: 404 })) as any)
    expect(out.detail).toContain('does not exist')
  })

  it('explains an answer that is not a price list', async () => {
    const out = await fetchCatalogue('https://x.example.com/p', null,
      (async () => asResponse({ ok: true, status: 200, body: '<html>hello</html>' })) as any)
    expect(out.ok).toBe(false)
    expect(out.detail).toContain('not a price list')
  })

  it('reads a good answer', async () => {
    const out = await fetchCatalogue('https://x.example.com/p', null,
      (async () => asResponse({ ok: true, status: 200, body: '[{"name":"Thing","price":5}]' })) as any)
    expect(out.ok).toBe(true)
    expect(parseCatalogue(out.payload).items).toHaveLength(1)
  })

  it('refuses a bad address before making any request at all', async () => {
    let called = false
    const out = await fetchCatalogue('http://localhost/p', null,
      (async () => { called = true; return asResponse({ ok: true, status: 200 }) }) as any)
    expect(called).toBe(false)
    expect(out.ok).toBe(false)
  })

  it('never throws, whatever their system does', async () => {
    const out = await fetchCatalogue('https://x.example.com/p', null,
      (async () => { throw new Error('connection reset') }) as any)
    expect(out.ok).toBe(false)
    expect(out.detail).toContain('could not reach')
  })
})

describe('the sender own product codes', () => {
  it('a code column is what makes mapping unnecessary', () => {
    const { items } = parseCatalogue([{ sku: 'VET-0091', name: 'Deworming dose', price: 5000 }])
    const plan = planCatalogueImport(items, [], 'rev1', 'api', NOW)
    expect(plan.create[0].external_id).toBe('VET-0091')
  })

  it('pick finds nothing when no column matches, which is different from an empty one', () => {
    expect(pick({ colour: 'red' }, 'price')).toBeUndefined()
    expect(pick({ price: '' }, 'price')).toBe('')
  })
})
