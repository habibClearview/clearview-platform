// ============================================================
// Reading somebody else's price list.
//
// 20 September 2026.
//
// A business's product list already exists, in whatever software they bought.
// This turns that list into ClearView catalogue items without anybody typing
// anything, and keeps it current.
//
// THE PROBLEM THIS SOLVES.
//
// Nobody agrees on what to call a column. One system says "sku", another
// "code", another "item_number". One says "price", another "unit_price",
// another "selling_price". Demanding our spelling means every business needs a
// developer before they can start, which is the friction that kills the whole
// idea. So we accept what they send and look for the meaning rather than the
// word.
//
// WHAT AN IMPORT NEVER DOES.
//
//   It never deletes. A product that stops appearing is switched off, so the
//   sales history recorded against it is still readable and a product that
//   vanishes for one bad export comes back on the next good one.
//
//   It never moves a product a coach has filed. Once somebody in ClearView
//   has put an item under a particular revenue line, later imports leave that
//   alone and only update its price. Otherwise every import would undo the
//   coach's work.
// ============================================================

/** What we end up with, whatever shape it arrived in. */
export interface ImportedItem {
  external_id: string
  name: string
  price: number | null
  cost_price: number | null
  unit_label: string | null
  item_type: 'product' | 'service'
  active: boolean
}

export interface ImportProblem {
  row: unknown
  reason: string
}

export interface ParsedCatalogue {
  items: ImportedItem[]
  problems: ImportProblem[]
}

// The names other systems actually use, in the order we prefer them. Matching
// ignores case, spaces, hyphens and underscores, so "Item Code", "item_code"
// and "itemcode" are all the same column.
const FIELD_ALIASES: Record<string, string[]> = {
  external_id: ['externalid', 'id', 'sku', 'code', 'itemcode', 'productcode', 'itemnumber', 'productid', 'itemid', 'barcode', 'ref', 'reference'],
  name: ['name', 'productname', 'itemname', 'description', 'product', 'item', 'title'],
  price: ['price', 'unitprice', 'sellingprice', 'saleprice', 'retailprice', 'rate', 'amount'],
  cost_price: ['costprice', 'cost', 'buyingprice', 'purchaseprice', 'buyprice', 'wholesaleprice'],
  unit_label: ['unit', 'unitlabel', 'uom', 'unitofmeasure', 'measure', 'packsize'],
  item_type: ['type', 'itemtype', 'category', 'kind'],
  active: ['active', 'isactive', 'enabled', 'status', 'instock'],
}

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-.]/g, '')
}

/**
 * Finds the value for one of our fields in a row that uses somebody else's
 * column names. Returns undefined when no column matches, which is different
 * from a column that is present and empty.
 *
 * A row carrying two columns we recognise is settled by the order of the alias
 * list above, not by the order the keys happen to appear in. So the same export
 * always reads the same way, whichever order their system serialised it in.
 */
export function pick(row: Record<string, unknown>, field: keyof typeof FIELD_ALIASES): unknown {
  const aliases = FIELD_ALIASES[field]
  const byNormalised = new Map<string, unknown>()
  for (const [k, v] of Object.entries(row)) {
    const n = normaliseKey(k)
    if (!byNormalised.has(n)) byNormalised.set(n, v)
  }
  for (const alias of aliases) {
    if (byNormalised.has(alias)) return byNormalised.get(alias)
  }
  return undefined
}

/**
 * A number out of whatever arrived. Handles "1,500", "UGX 1500", "1 500.00"
 * and a real number, because an export from a spreadsheet contains all of
 * them. Returns null for anything it cannot read, never zero, because a price
 * that could not be read is not a free product.
 */
export function readNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[^0-9.\-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * Whether a row says the product is still sold. Anything that is not clearly a
 * no counts as a yes, because most exports have no such column at all and
 * treating a missing column as "switched off" would empty the catalogue.
 */
export function readActive(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  if (typeof value === 'boolean') return value
  const s = String(value).trim().toLowerCase()
  return !['false', 'no', 'n', '0', 'inactive', 'disabled', 'discontinued', 'archived', 'out of stock'].includes(s)
}

function readType(value: unknown): 'product' | 'service' {
  return String(value ?? '').trim().toLowerCase().includes('service') ? 'service' : 'product'
}

/** Text, trimmed and capped, or null. */
function readText(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null
  const s = String(value).trim()
  return s ? s.slice(0, max) : null
}

/**
 * Turns whatever their system produced into items we can store.
 *
 * Accepts a bare list, or an object with the list under any of the usual
 * names, because an export is as likely to be {"items": [...]} as it is to be
 * a plain array.
 */
export function parseCatalogue(payload: unknown): ParsedCatalogue {
  let rows: unknown[] = []
  if (Array.isArray(payload)) {
    rows = payload
  } else if (payload && typeof payload === 'object') {
    const holder = payload as Record<string, unknown>
    for (const key of ['items', 'products', 'data', 'catalogue', 'catalog', 'results', 'records', 'rows']) {
      if (Array.isArray(holder[key])) { rows = holder[key] as unknown[]; break }
    }
  }

  const items: ImportedItem[] = []
  const problems: ImportProblem[] = []
  const seen = new Set<string>()

  for (const raw of rows) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      problems.push({ row: raw, reason: 'This entry is not a product record.' })
      continue
    }
    const row = raw as Record<string, unknown>

    const name = readText(pick(row, 'name'), 200)
    // Falling back to the name as the identifier matters: plenty of small
    // systems export a price list with no code column at all, and refusing
    // those would exclude exactly the businesses this is for.
    const external = readText(pick(row, 'external_id'), 200) || name
    if (!external || !name) {
      problems.push({ row: raw, reason: 'This entry has no product name, so there is nothing to call it.' })
      continue
    }
    if (seen.has(external)) {
      problems.push({ row: raw, reason: `"${name}" appears more than once under the same code. Only the first was read.` })
      continue
    }
    seen.add(external)

    const price = readNumber(pick(row, 'price'))
    const cost = readNumber(pick(row, 'cost_price'))

    items.push({
      external_id: external,
      name,
      // A price that could not be read stays null rather than becoming zero.
      // The item is created anyway and marked as needing a price, so it is
      // visible and unsellable instead of invisible or free.
      price: price !== null && price >= 0 ? price : null,
      cost_price: cost !== null && cost >= 0 ? cost : null,
      unit_label: readText(pick(row, 'unit_label'), 40),
      item_type: readType(pick(row, 'item_type')),
      active: readActive(pick(row, 'active')),
    })
  }

  return { items, problems }
}

export interface ExistingItem {
  id: string
  external_id: string | null
  name: string
  price: number
  plan_line_id: string
  active: boolean
  needs_price: boolean
  /** True once a person in ClearView has filed this item themselves. */
  filed_by_hand?: boolean
}

export interface CataloguePlan {
  create: Array<Record<string, unknown>>
  update: Array<{ id: string; changes: Record<string, unknown> }>
  deactivate: string[]
  unchanged: number
}

/**
 * What to do to the ClearView catalogue so it matches the list that arrived.
 *
 * Pure: takes the parsed list and what is already stored, returns the work. No
 * database, so every rule below is testable, which matters because a wrong
 * rule here quietly rewrites a business's prices.
 */
export function planCatalogueImport(
  incoming: ImportedItem[],
  existing: ExistingItem[],
  defaultPlanLineId: string,
  source: string,
  now: string,
): CataloguePlan {
  const byExternal = new Map(existing.filter((e) => e.external_id).map((e) => [e.external_id as string, e]))
  // A business's first import meets items a coach typed in by hand, which have
  // no external id. Matching those by name adopts them instead of creating a
  // duplicate of every product they already had.
  const byName = new Map(existing.filter((e) => !e.external_id).map((e) => [e.name.trim().toLowerCase(), e]))

  const plan: CataloguePlan = { create: [], update: [], deactivate: [], unchanged: 0 }
  const touched = new Set<string>()

  for (const item of incoming) {
    const match = byExternal.get(item.external_id) || byName.get(item.name.trim().toLowerCase())

    if (!match) {
      plan.create.push({
        external_id: item.external_id,
        external_source: source,
        last_imported_at: now,
        name: item.name,
        item_type: item.item_type,
        price: item.price ?? 0,
        // An item whose price we could not read is created but cannot be sold
        // until somebody prices it. Better a visible gap than a product
        // quietly selling at nothing.
        needs_price: item.price === null,
        cost_price: item.cost_price,
        unit_label: item.unit_label,
        plan_line_id: defaultPlanLineId,
        active: item.active,
      })
      continue
    }

    touched.add(match.id)
    const changes: Record<string, unknown> = {}
    if (match.external_id !== item.external_id) changes.external_id = item.external_id
    if (match.name !== item.name) changes.name = item.name
    if (item.price !== null && Number(match.price) !== item.price) {
      changes.price = item.price
      // A price arriving is what un-blocks an item that was waiting for one.
      if (match.needs_price) changes.needs_price = false
    }
    if (item.cost_price !== null) changes.cost_price = item.cost_price
    if (item.unit_label) changes.unit_label = item.unit_label
    if (match.active !== item.active) changes.active = item.active

    // plan_line_id is deliberately absent from every update. Once a coach has
    // filed an item under a revenue line, an import must not move it back to
    // the default, or every import would undo their work.

    if (Object.keys(changes).length === 0) {
      plan.unchanged += 1
      continue
    }
    changes.external_source = source
    changes.last_imported_at = now
    plan.update.push({ id: match.id, changes })
  }

  // Anything this source created before and did not send this time has gone
  // from their system. Switched off, never deleted, so the sales recorded
  // against it stay readable.
  for (const e of existing) {
    if (touched.has(e.id)) continue
    if (!e.external_id) continue
    if (!e.active) continue
    plan.deactivate.push(e.id)
  }

  return plan
}
