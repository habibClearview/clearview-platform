// Month-end close: exception report and the 90-day cost-price staleness
// gate. Per docs/ACCOUNTING_ARCHITECTURE.md section 5.
//
// Extracted as pure functions so tests exercise the exact logic the UI
// uses, and so the close action can't be circumvented by a UI bug --
// the hard gate check happens here, not just as a disabled button state.

export const COST_PRICE_STALENESS_DAYS = 90

// Revenue anomaly threshold: how far actual revenue can deviate from
// planned before it's worth a Finance Manager's attention. Informational
// only -- unlike stale cost prices, this does NOT block closing, since
// revenue swings can be entirely legitimate (a big one-off sale, genuine
// seasonality) and a hard block here would be too rigid without more
// sophistication than a simple threshold can offer.
export const REVENUE_ANOMALY_THRESHOLD = 0.5 // 50% deviation from plan

export interface CatalogueItemForStaleness {
  id: string
  name: string
  cost_price: number | null | undefined
  cost_price_updated_at: string | null | undefined
}

export interface ExceptionItem {
  type: 'stale_cost_price' | 'revenue_anomaly'
  // Blocking items must be resolved before the period can close.
  // Informational items are shown but don't prevent closing.
  severity: 'blocking' | 'informational'
  message: string
  ref_id: string
}

// A catalogue item only counts as stale if it actually HAS a cost price
// set (docs/ACCOUNTING_ARCHITECTURE.md is explicit: cost_price is
// optional, and an item with no cost price was never claiming to be
// standard-costed in the first place, so there's nothing to go stale).
export function isCostPriceStale(item: CatalogueItemForStaleness, now: Date = new Date()): boolean {
  if (item.cost_price === null || item.cost_price === undefined) return false
  if (!item.cost_price_updated_at) return true
  const updatedAt = new Date(item.cost_price_updated_at)
  const daysSince = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24)
  return daysSince > COST_PRICE_STALENESS_DAYS
}

export interface UnitRevenueCheck {
  unit_id: string
  unit_name: string
  planned_revenue: number
  actual_revenue: number | null
}

export function computeExceptionReport(
  catalogueItems: CatalogueItemForStaleness[],
  unitRevenueChecks: UnitRevenueCheck[],
  now: Date = new Date()
): ExceptionItem[] {
  const items: ExceptionItem[] = []

  catalogueItems.forEach(item => {
    if (isCostPriceStale(item, now)) {
      items.push({
        type: 'stale_cost_price',
        severity: 'blocking',
        message: `"${item.name}"'s cost price hasn't been reviewed in over ${COST_PRICE_STALENESS_DAYS} days.`,
        ref_id: item.id,
      })
    }
  })

  unitRevenueChecks.forEach(check => {
    if (check.actual_revenue === null) return // no actual data yet for this unit -- nothing to compare
    if (check.planned_revenue === 0) return // avoid a meaningless divide-by-zero "infinite deviation"
    const deviation = Math.abs(check.actual_revenue - check.planned_revenue) / check.planned_revenue
    if (deviation > REVENUE_ANOMALY_THRESHOLD) {
      items.push({
        type: 'revenue_anomaly',
        severity: 'informational',
        message: `${check.unit_name}: actual revenue deviates ${Math.round(deviation * 100)}% from plan (planned ${Math.round(check.planned_revenue).toLocaleString()}, actual ${Math.round(check.actual_revenue).toLocaleString()}).`,
        ref_id: check.unit_id,
      })
    }
  })

  return items
}

// The hard gate: a period cannot close while any BLOCKING exception is
// unresolved. Informational items (like revenue anomalies) are shown for
// awareness but never prevent closing.
export function canClosePeriod(exceptions: ExceptionItem[]): boolean {
  return !exceptions.some(e => e.severity === 'blocking')
}
