// Clearview Field offline queue -- IndexedDB via Dexie.
//
// Replaces the earlier localStorage-based queue. Per spec section 5, the
// app must work with zero connectivity and only need a network connection
// for sync, not for use. IndexedDB is used here (not localStorage) because:
// - it can hold far more data reliably (localStorage is ~5MB and synchronous,
//   which blocks the main thread on large writes)
// - it's accessible from the Service Worker (see public/field-sw.js), which
//   is what makes Background Sync possible: a queued entry can sync even if
//   the operator has closed the browser tab, the moment connectivity returns
// - it survives longer than localStorage on iOS Safari, which aggressively
//   clears localStorage for infrequently-used sites
//
// Same database name/table shape is used by both this module (main thread,
// via Dexie) and public/field-sw.js (service worker, via raw IndexedDB) --
// they operate on the same underlying store.

import Dexie, { type Table } from 'dexie'

export interface QueuedSale {
  local_id: string
  catalogue_item_id: string
  item_name: string
  item_type: 'product' | 'service'
  standard_price: number
  quantity: number
  override_price?: number
  payment_method?: string
  customer_id?: string
  transaction_date: string
  notes?: string
  queued_at: number
}

export interface QueuedCost {
  local_id: string
  plan_line_id: string
  plan_line_name: string
  amount: number
  transaction_date: string
  notes?: string
  queued_at: number
}

class FieldQueueDB extends Dexie {
  sales!: Table<QueuedSale, string>
  costs!: Table<QueuedCost, string>
  meta!: Table<{ key: string; value: string }, string>

  // ⚠️ SCHEMA MUST STAY IN SYNC WITH public/field-sw.js ⚠️
  // public/field-sw.js is a plain static file, not bundled, so it opens
  // this same IndexedDB database with the raw IndexedDB API instead of
  // Dexie. If you change the version number or store names below, update
  // DB_VERSION and EXPECTED_STORES in field-sw.js to match -- its openDB()
  // check will throw a clear "schema drift" error if they fall out of
  // sync, rather than silently missing data.
  constructor() {
    super('clearview_field_queue')
    this.version(1).stores({
      sales: 'local_id, queued_at',
      costs: 'local_id, queued_at',
      // Service Workers can't read localStorage -- the auth token needs to
      // live somewhere the sync event handler in public/field-sw.js can
      // reach it too. IndexedDB is shared between the page and the SW.
      meta: 'key',
    })
  }
}

// Only instantiate in the browser -- this module can be imported by code
// that also runs during server-side rendering, where indexedDB doesn't exist.
export const fieldDB: FieldQueueDB | null =
  typeof window !== 'undefined' ? new FieldQueueDB() : null

export async function addQueuedSale(sale: Omit<QueuedSale, 'queued_at'>): Promise<void> {
  if (!fieldDB) return
  await fieldDB.sales.add({ ...sale, queued_at: Date.now() })
}

export async function addQueuedCost(cost: Omit<QueuedCost, 'queued_at'>): Promise<void> {
  if (!fieldDB) return
  await fieldDB.costs.add({ ...cost, queued_at: Date.now() })
}

export async function listQueuedSales(): Promise<QueuedSale[]> {
  if (!fieldDB) return []
  return fieldDB.sales.orderBy('queued_at').toArray()
}

export async function listQueuedCosts(): Promise<QueuedCost[]> {
  if (!fieldDB) return []
  return fieldDB.costs.orderBy('queued_at').toArray()
}

export async function removeQueuedSale(localId: string): Promise<void> {
  if (!fieldDB) return
  await fieldDB.sales.delete(localId)
}

export async function removeQueuedCost(localId: string): Promise<void> {
  if (!fieldDB) return
  await fieldDB.costs.delete(localId)
}

export async function clearSyncedSales(localIds: string[]): Promise<void> {
  if (!fieldDB) return
  await fieldDB.sales.bulkDelete(localIds)
}

export async function clearSyncedCosts(localIds: string[]): Promise<void> {
  if (!fieldDB) return
  await fieldDB.costs.bulkDelete(localIds)
}

export async function queueCounts(): Promise<{ sales: number; costs: number }> {
  if (!fieldDB) return { sales: 0, costs: 0 }
  const [sales, costs] = await Promise.all([fieldDB.sales.count(), fieldDB.costs.count()])
  return { sales, costs }
}

// Shared decision used by both the manual "Sync Now" button (app/field/page.tsx)
// and imported directly by tests, so a regression here is actually caught
// rather than a test re-implementing the same logic separately and drifting
// out of sync with it. The server can return success:true with a populated
// Retained for the all-or-nothing case (e.g. a caller that only has a
// success/errors summary, not per-entry local_ids) and its existing test
// coverage, but no longer used to decide queue-clearing in either
// app/field/page.tsx or public/field-sw.js. Both now clear per-entry using
// the server's synced_local_ids (see app/api/field/sync/route.ts), since
// a single permanently bad entry in a batch (e.g. a catalogue item that's
// moved to a different business unit) would otherwise keep every other
// entry in the same batch stuck in the queue forever under an
// all-or-nothing rule.
export function shouldClearQueue(response: { success: boolean; errors?: string[] }): boolean {
  return response.success && (!response.errors || response.errors.length === 0)
}

// The Service Worker's background sync handler needs the auth token to call
// /api/field/sync, but Service Workers cannot read localStorage -- only
// IndexedDB (and caches) are shared between the page and the SW. Mirroring
// the token here is what makes background sync possible while the tab is
// closed.
export async function setStoredToken(token: string): Promise<void> {
  if (!fieldDB) return
  await fieldDB.meta.put({ key: 'token', value: token })
}

export async function getStoredToken(): Promise<string | null> {
  if (!fieldDB) return null
  const row = await fieldDB.meta.get('token')
  return row?.value ?? null
}
