// Standard costing: builds the automatic cost-of-sales entry for a sale,
// when the catalogue item has a cost price set. Extracted into its own
// module (rather than inline in app/api/field/sync/route.ts) so tests
// exercise the exact function the route uses, not a copy that can
// silently drift out of sync -- the route file itself can only export
// GET/POST/etc per Next.js route handler conventions, so an arbitrary
// helper can't live there and be imported elsewhere.
//
// Per docs/ACCOUNTING_ARCHITECTURE.md section 3 (IAS 2 / IFRS for SMEs
// Section 13): COGS is always quantity x the catalogue's STANDARD cost
// price, never affected by a sale-side bulk override on the sell price.

export interface CatalogueItemForCogs {
  id: string
  name: string
  cost_price: number | null | undefined
  cogs_plan_line_id: string | null | undefined
}

export interface AutoCogsRow {
  plan_line_id: string
  plan_line_name: string
  transaction_type: 'cogs_auto'
  category: 'cost_of_sales'
  amount: number
  quantity: number
  unit_price: number
  catalogue_item_id: string
  local_id: string | null
}

// Returns null when no cost price is set -- no COGS is ever fabricated
// for an item that never had one. cost_price of exactly 0 is a real,
// deliberately-set cost (e.g. a donated input), not "not set" -- only
// null/undefined means that.
export function buildAutoCogsRow(
  item: CatalogueItemForCogs,
  quantity: number,
  saleLocalId: string | null | undefined
): AutoCogsRow | null {
  if (item.cost_price === null || item.cost_price === undefined || !item.cogs_plan_line_id) return null
  return {
    plan_line_id: item.cogs_plan_line_id,
    plan_line_name: `${item.name} (COGS)`,
    transaction_type: 'cogs_auto',
    category: 'cost_of_sales',
    amount: quantity * item.cost_price,
    quantity,
    unit_price: item.cost_price,
    catalogue_item_id: item.id,
    // Deterministic, derived from the sale's own local_id -- a retry of
    // the same sale must produce the same COGS local_id too, or the
    // idempotency dedup on the sale wouldn't protect the COGS side.
    local_id: saleLocalId ? `${saleLocalId}_cogs` : null,
  }
}
