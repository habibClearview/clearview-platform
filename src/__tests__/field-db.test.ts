// @vitest-environment jsdom
//
// Tests the IndexedDB-backed offline queue (src/lib/field-db.ts) using
// fake-indexeddb, an in-memory IndexedDB implementation for Node test
// environments. This is the queue that replaced localStorage per the
// Clearview Field spec's offline-first requirement (section 5).
//
// jsdom (rather than the project's default 'node' environment) is used
// for this file only, via the directive above -- field-db.ts checks
// `typeof window !== 'undefined'` before instantiating its database,
// since it can be imported during SSR where indexedDB doesn't exist.
// jsdom provides a real `window` before this file's imports are
// evaluated, which a manual globalThis shim cannot do reliably --
// import statements are hoisted above other top-level code in ES
// modules, so a shim placed after an import always runs too late.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'

import {
  addQueuedSale, addQueuedCost, addQueuedUncategorizedCost,
  listQueuedSales, listQueuedCosts, listQueuedUncategorizedCosts,
  removeQueuedSale, removeQueuedCost, removeQueuedUncategorizedCost,
  clearSyncedSales, clearSyncedCosts, clearSyncedUncategorizedCosts,
  queueCounts, setStoredToken, getStoredToken, fieldDB,
} from '../lib/field-db'

beforeEach(async () => {
  // Fresh database state between tests -- delete and let the next call
  // recreate it, since Dexie opens lazily on first real operation.
  if (fieldDB) {
    await fieldDB.sales.clear()
    await fieldDB.costs.clear()
    await fieldDB.uncategorizedCosts.clear()
    await fieldDB.meta.clear()
  }
})

describe('Field offline queue — sales', () => {
  it('REG: a queued sale can be added and then listed back', async () => {
    await addQueuedSale({
      local_id: 'local_1', catalogue_item_id: 'cat_1', item_name: 'Maize 90kg bag',
      item_type: 'product', standard_price: 150000, quantity: 5,
      transaction_date: '2026-07-04',
    })
    const sales = await listQueuedSales()
    expect(sales).toHaveLength(1)
    expect(sales[0].item_name).toBe('Maize 90kg bag')
    expect(sales[0].quantity).toBe(5)
  })

  it('REG: sales are listed in the order they were queued', async () => {
    await addQueuedSale({ local_id: 'a', catalogue_item_id: 'c1', item_name: 'First', item_type: 'product', standard_price: 100, quantity: 1, transaction_date: '2026-07-04' })
    await addQueuedSale({ local_id: 'b', catalogue_item_id: 'c2', item_name: 'Second', item_type: 'product', standard_price: 100, quantity: 1, transaction_date: '2026-07-04' })
    const sales = await listQueuedSales()
    expect(sales.map(s => s.local_id)).toEqual(['a', 'b'])
  })

  it('REG: removing a sale by local_id leaves the others intact', async () => {
    await addQueuedSale({ local_id: 'a', catalogue_item_id: 'c1', item_name: 'Keep', item_type: 'product', standard_price: 100, quantity: 1, transaction_date: '2026-07-04' })
    await addQueuedSale({ local_id: 'b', catalogue_item_id: 'c2', item_name: 'Remove', item_type: 'product', standard_price: 100, quantity: 1, transaction_date: '2026-07-04' })
    await removeQueuedSale('b')
    const sales = await listQueuedSales()
    expect(sales.map(s => s.local_id)).toEqual(['a'])
  })

  it('REG: clearSyncedSales only removes the specific ids given, not everything', async () => {
    await addQueuedSale({ local_id: 'a', catalogue_item_id: 'c1', item_name: 'Synced', item_type: 'product', standard_price: 100, quantity: 1, transaction_date: '2026-07-04' })
    await addQueuedSale({ local_id: 'b', catalogue_item_id: 'c2', item_name: 'Still pending', item_type: 'product', standard_price: 100, quantity: 1, transaction_date: '2026-07-04' })
    // Simulates a sync that was in flight when a new entry ('b') was added --
    // only the snapshot that was actually sent to the server gets cleared.
    await clearSyncedSales(['a'])
    const sales = await listQueuedSales()
    expect(sales.map(s => s.local_id)).toEqual(['b'])
  })
})

describe('Field offline queue — costs', () => {
  it('REG: a queued cost can be added and then listed back', async () => {
    await addQueuedCost({ local_id: 'c1', plan_line_id: 'pl1', plan_line_name: 'Transport', amount: 50000, transaction_date: '2026-07-04' })
    const costs = await listQueuedCosts()
    expect(costs).toHaveLength(1)
    expect(costs[0].amount).toBe(50000)
  })

  it('REG: removing a cost by local_id works independently of the sales queue', async () => {
    await addQueuedSale({ local_id: 'sale_a', catalogue_item_id: 'c1', item_name: 'X', item_type: 'product', standard_price: 100, quantity: 1, transaction_date: '2026-07-04' })
    await addQueuedCost({ local_id: 'cost_a', plan_line_id: 'pl1', plan_line_name: 'Transport', amount: 50000, transaction_date: '2026-07-04' })
    await removeQueuedCost('cost_a')
    expect(await listQueuedCosts()).toHaveLength(0)
    expect(await listQueuedSales()).toHaveLength(1) // untouched
  })
})

describe('Field offline queue — uncategorized costs (delegated categorization)', () => {
  it('REG: an uncategorized cost can be added and then listed back, with no plan_line_id at all', async () => {
    await addQueuedUncategorizedCost({ local_id: 'u1', description: 'Motorbike repair', amount: 35000, transaction_date: '2026-07-08' })
    const costs = await listQueuedUncategorizedCosts()
    expect(costs).toHaveLength(1)
    expect(costs[0].description).toBe('Motorbike repair')
    expect(costs[0].amount).toBe(35000)
    expect((costs[0] as any).plan_line_id).toBeUndefined()
  })

  it('REG: removing an uncategorized cost by local_id works independently of the categorized costs queue', async () => {
    await addQueuedCost({ local_id: 'cost_a', plan_line_id: 'pl1', plan_line_name: 'Transport', amount: 50000, transaction_date: '2026-07-04' })
    await addQueuedUncategorizedCost({ local_id: 'u1', description: 'Something odd', amount: 10000, transaction_date: '2026-07-08' })
    await removeQueuedUncategorizedCost('u1')
    expect(await listQueuedUncategorizedCosts()).toHaveLength(0)
    expect(await listQueuedCosts()).toHaveLength(1) // untouched
  })

  it('REG: clearSyncedUncategorizedCosts only removes the specific ids given, not everything', async () => {
    await addQueuedUncategorizedCost({ local_id: 'u1', description: 'A', amount: 1000, transaction_date: '2026-07-08' })
    await addQueuedUncategorizedCost({ local_id: 'u2', description: 'B', amount: 2000, transaction_date: '2026-07-08' })
    await clearSyncedUncategorizedCosts(['u1'])
    const remaining = await listQueuedUncategorizedCosts()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].local_id).toBe('u2')
  })
})

describe('Field offline queue — counts', () => {
  it('REG: queueCounts reflects sales, costs, and uncategorized costs independently', async () => {
    await addQueuedSale({ local_id: 's1', catalogue_item_id: 'c1', item_name: 'X', item_type: 'product', standard_price: 100, quantity: 1, transaction_date: '2026-07-04' })
    await addQueuedSale({ local_id: 's2', catalogue_item_id: 'c1', item_name: 'X', item_type: 'product', standard_price: 100, quantity: 1, transaction_date: '2026-07-04' })
    await addQueuedCost({ local_id: 'c1', plan_line_id: 'pl1', plan_line_name: 'Transport', amount: 50000, transaction_date: '2026-07-04' })
    await addQueuedUncategorizedCost({ local_id: 'u1', description: 'Odd cost', amount: 5000, transaction_date: '2026-07-08' })
    const counts = await queueCounts()
    expect(counts).toEqual({ sales: 2, costs: 1, uncategorizedCosts: 1 })
  })

  it('REG: an empty queue reports zero counts, not an error', async () => {
    expect(await queueCounts()).toEqual({ sales: 0, costs: 0, uncategorizedCosts: 0 })
  })
})

describe('Field offline queue — stored token (for Service Worker background sync)', () => {
  it('REG: a stored token can be set and read back', async () => {
    await setStoredToken('abc123')
    expect(await getStoredToken()).toBe('abc123')
  })

  it('REG: setting a new token overwrites the previous one', async () => {
    await setStoredToken('first')
    await setStoredToken('second')
    expect(await getStoredToken()).toBe('second')
  })

  it('REG: with no token ever set, getStoredToken returns null, not an error', async () => {
    expect(await getStoredToken()).toBeNull()
  })
})
