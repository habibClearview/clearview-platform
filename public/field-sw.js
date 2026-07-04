// Clearview Field Service Worker.
//
// Two jobs, matching spec section 5 (Offline and Sync Architecture):
// 1. Cache the app shell so the /field page itself loads with zero
//    connectivity, not just the data entry (spec: "the app works with
//    zero connectivity -- network is only needed for sync, not for use").
// 2. Background Sync: when the device regains connectivity, automatically
//    flush the queued sales/costs to /api/field/sync -- even if the
//    operator has closed the tab. This is what makes sync genuinely
//    automatic rather than depending on the operator remembering to press
//    "Sync Now" while the app happens to be open.
//
// Reads the same IndexedDB database as src/lib/field-db.ts (Dexie, main
// thread) using the raw IndexedDB API here, since a Service Worker is a
// plain static file and Dexie's page-side build isn't meant to run inside
// one. Both operate on the identical underlying object stores.

// ⚠️ SCHEMA MUST STAY IN SYNC WITH src/lib/field-db.ts ⚠️
// This is a plain static file, not bundled, so it can't import the Dexie
// schema directly -- these constants are manually kept identical to the
// version() call and store names in field-db.ts. If you change either
// there, update DB_VERSION and the store names below to match, or this
// Service Worker will open a stale/incompatible version of the database.
// The openDB() check below fails loudly (throws, logged to the SW console)
// rather than silently missing data if the two ever drift apart.
const DB_NAME = 'clearview_field_queue'
const DB_VERSION = 1
const EXPECTED_STORES = ['sales', 'costs', 'meta'] // must match field-db.ts's stores: {...} keys
const CACHE_NAME = 'clearview-field-shell-v1'
const SYNC_TAG = 'clearview-field-sync'

// ── App shell caching ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting()
  // Precache the shell document itself so the very first visit after
  // install can load with zero connectivity -- without this, "zero
  // connectivity" only actually worked starting from the SECOND visit
  // (the fetch handler below caches lazily, after a successful online
  // load). Next.js's per-build hashed JS/CSS filenames aren't known
  // statically here without a build-time manifest, so those still cache
  // lazily on first successful fetch -- but the page itself, which is
  // what actually renders the offline-capable UI, is guaranteed available.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add('/field').catch(() => {}))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  // Only handle same-origin GET requests for the field app and its assets.
  // API calls (POST /api/field/sync etc.) go straight to the network --
  // caching those would risk serving stale/wrong data.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        }
        return response
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/field')))
  )
})

// ── Background Sync ─────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(flushQueue())
  }
})

// Some browsers (notably iOS Safari) don't support the Background Sync API
// at all -- for those, the page's own "Sync Now" button and an
// online-event listener are the fallback. This handler is the automatic
// path for browsers that do support it (primarily Chromium-based).
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onsuccess = () => {
      const db = req.result
      const missing = EXPECTED_STORES.filter((name) => !db.objectStoreNames.contains(name))
      if (missing.length > 0) {
        // field-db.ts's Dexie schema changed without this file being
        // updated to match -- fail loudly instead of silently missing
        // data on whatever store(s) no longer exist here.
        reject(new Error(`field-sw.js schema drift: missing object store(s) [${missing.join(', ')}]. Update EXPECTED_STORES/DB_VERSION in public/field-sw.js to match src/lib/field-db.ts.`))
        return
      }
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  })
}

function getAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function getMeta(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readonly')
    const req = tx.objectStore('meta').get(key)
    req.onsuccess = () => resolve(req.result ? req.result.value : null)
    req.onerror = () => reject(req.error)
  })
}

function deleteMany(db, storeName, keys) {
  return new Promise((resolve, reject) => {
    if (keys.length === 0) return resolve()
    const tx = db.transaction(storeName, 'readwrite')
    keys.forEach((k) => tx.objectStore(storeName).delete(k))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function flushQueue() {
  const db = await openDB()
  const token = await getMeta(db, 'token')
  if (!token) return

  const [sales, costs] = await Promise.all([getAll(db, 'sales'), getAll(db, 'costs')])
  if (sales.length === 0 && costs.length === 0) return

  const transactions = [
    ...sales.map((s) => ({
      local_id: s.local_id,
      catalogue_item_id: s.catalogue_item_id, quantity: s.quantity,
      override_price: s.override_price, payment_method: s.payment_method,
      customer_id: s.customer_id, transaction_date: s.transaction_date, notes: s.notes,
    })),
    ...costs.map((c) => ({
      local_id: c.local_id,
      plan_line_id: c.plan_line_id, plan_line_name: c.plan_line_name,
      transaction_type: 'expense', category: 'direct_opex', amount: c.amount,
      transaction_date: c.transaction_date, notes: c.notes,
    })),
  ]

  try {
    const res = await fetch('/api/field/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, device_id: 'sw_background_sync', transactions }),
    })
    const data = await res.json()
    // This condition must stay identical to shouldClearQueue() in
    // src/lib/field-db.ts -- field-sw.js is a plain static file and can't
    // import that shared helper directly, so if the decision logic ever
    // changes there, update this line to match.
    // Only clear the queue when the server reports zero errors. A response
    // can be success:true with a populated errors array (e.g. one bad
    // catalogue_item_id in the batch) -- clearing everything in that case
    // would silently delete entries the server never actually saved. Every
    // row carries a stable local_id and the server dedupes on it (see
    // app/api/field/sync/route.ts), so it's always safe to leave the queue
    // intact and retry the whole batch next time -- already-saved rows are
    // silently skipped server-side, not duplicated.
    if (res.ok && data.success && (!data.errors || data.errors.length === 0)) {
      await deleteMany(db, 'sales', sales.map((s) => s.local_id))
      await deleteMany(db, 'costs', costs.map((c) => c.local_id))
      const clients = await self.clients.matchAll()
      clients.forEach((client) => client.postMessage({ type: 'field-sync-complete', synced_at: new Date().toISOString() }))
    }
    // If the request failed, or the server reported errors, the queue is
    // left as-is -- nothing is lost, and the next sync attempt (background
    // or manual) will retry the same entries.
  } catch (err) {
    // No connectivity or request failed -- leave the queue for next time.
  }
}
