// ============================================================
// DRIVERS & CHANNELS — pure planning logic.
//
// The business plans around a handful of DRIVERS — the levers that actually move
// sales and cost (walk-in customers, orders, price, cost per order). SALES
// drivers are grouped into CHANNELS (routes to market: walk-in, retailers, large
// farms, export). A driver is "smart" — its money value is quantity × rate — so
// moving a quantity (e.g. +50 customers) flows straight through to revenue, and,
// for a spread business, through the buy/sell spread to margin. A "flat" driver
// is just a plain monthly figure when the breakdown isn't known yet.
//
// The engine (generic-engine.ts) sums every plan line into its P&L category
// bucket by `category`, so — exactly like market activities — the safe, low-risk
// way to make drivers move the model is to turn each driver into a synthetic
// plan line and add it to config.plan_lines before running the model. Pure,
// dependency-free, unit-tested in isolation.
// ============================================================

import type { GenericPlanLine } from './generic-engine'

export interface Channel {
  id: string
  name: string
  unit_id: string | null   // the business unit this channel belongs to; null = whole business
  active: boolean
}

export type DriverKind = 'sales' | 'cost'
export type DriverMode = 'smart' | 'flat'          // smart = quantity × rate; flat = a plain monthly figure
export type DriverCostCategory = 'cost_of_sales' | 'staff' | 'direct_opex'

export interface Driver {
  id: string
  name: string
  kind: DriverKind
  unit_id: string | null           // effective P&L unit; null = inherit channel's, else fall back
  channel_id: string | null        // sales drivers: the channel they belong to
  unit_label: string               // display only: "customers", "orders", "UGX/order"
  mode: DriverMode
  quantity: number[]               // per-month quantity (smart) OR plain monthly amount (flat)
  rate: number                     // per-unit price/rate (smart mode)
  unit_cost?: number | null        // sales spread: buy price per unit → generates a matching COGS line so margin = qty × (rate − unit_cost)
  cost_category?: DriverCostCategory   // cost drivers: which bucket (default direct_opex)
  active: boolean
}

export const DRIVER_REV_PREFIX = 'drvrev_'
export const DRIVER_COST_PREFIX = 'drvcost_'

export function isDriverLineId(id: string | undefined | null): boolean {
  return typeof id === 'string' && (id.startsWith(DRIVER_REV_PREFIX) || id.startsWith(DRIVER_COST_PREFIX))
}

// Coerce a series to exactly `n` numeric months (missing/NaN → 0).
function ensureLen(arr: number[] | undefined, n: number): number[] {
  const out = new Array(n).fill(0)
  if (Array.isArray(arr)) for (let i = 0; i < n; i++) out[i] = Number(arr[i]) || 0
  return out
}

// The money value a driver contributes per month: quantity × rate (smart) or the
// plain quantity series (flat).
export function driverMonthlyValue(d: Driver, planningMonths: number): number[] {
  const q = ensureLen(d.quantity, planningMonths)
  if (d.mode === 'flat') return q
  const rate = Number(d.rate) || 0
  return q.map(v => v * rate)
}

// Resolve which business unit a driver's line attaches to: its own unit, else its
// channel's unit, else the caller-provided fallback (usually the first unit) so a
// whole-business driver still lands in the consolidated P&L.
function effectiveUnitId(d: Driver, channelById: Map<string, Channel>, fallbackUnitId: string | null): string | null {
  if (d.unit_id) return d.unit_id
  const chan = d.channel_id ? channelById.get(d.channel_id) : undefined
  if (chan?.unit_id) return chan.unit_id
  return fallbackUnitId
}

/**
 * Turn active drivers into synthetic plan lines to concat into config.plan_lines
 * before running the engine.
 *  - A sales driver → a 'revenue' line (quantity × rate, or the flat figure). If
 *    a per-unit buy cost (unit_cost) is set in smart mode, it ALSO emits a
 *    matching 'cost_of_sales' line, so gross margin = quantity × (rate − unit_cost)
 *    — the spread. Move the quantity and both revenue and COGS move together.
 *  - A cost driver → a cost line in its chosen bucket (default direct_opex).
 * Inactive drivers, all-zero drivers, and drivers with nowhere to attach are
 * skipped. Every line's monthly_plan is exactly planningMonths long.
 */
export function syntheticPlanLinesFromDrivers(
  channels: Channel[],
  drivers: Driver[],
  planningMonths: number,
  fallbackUnitId: string | null,
): GenericPlanLine[] {
  const lines: GenericPlanLine[] = []
  if (!Array.isArray(drivers) || planningMonths <= 0) return lines
  const channelById = new Map<string, Channel>((channels || []).map(c => [c.id, c]))

  for (const d of drivers) {
    if (!d || d.active === false) continue
    const unitId = effectiveUnitId(d, channelById, fallbackUnitId)
    if (!unitId) continue

    if (d.kind === 'sales') {
      // Evaluate revenue AND (spread) COGS independently, and emit each line only
      // when it is non-zero. A sales driver with zero sell price but a positive
      // buy price still produces a COGS line — dropping it (as a revenue-only
      // zero check would) would silently lose that cost.
      const rev = driverMonthlyValue(d, planningMonths)
      if (rev.some(v => v !== 0)) {
        lines.push({
          id: `${DRIVER_REV_PREFIX}${d.id}`, unit_id: unitId, name: `Driver: ${d.name}`,
          category: 'revenue', line_type: 'standard', monthly_plan: rev, active: true,
        } as GenericPlanLine)
      }
      if (d.mode === 'smart' && d.unit_cost != null && Number(d.unit_cost) > 0) {
        const cogs = ensureLen(d.quantity, planningMonths).map(v => v * Number(d.unit_cost))
        if (cogs.some(v => v !== 0)) {
          lines.push({
            id: `${DRIVER_COST_PREFIX}${d.id}`, unit_id: unitId, name: `Driver COGS: ${d.name}`,
            category: 'cost_of_sales', line_type: 'standard', monthly_plan: cogs, active: true,
          } as GenericPlanLine)
        }
      }
    } else {
      const monthly = driverMonthlyValue(d, planningMonths)
      if (!monthly.some(v => v !== 0)) continue
      const cat: DriverCostCategory = d.cost_category || 'direct_opex'
      lines.push({
        id: `${DRIVER_COST_PREFIX}${d.id}`, unit_id: unitId, name: `Driver: ${d.name}`,
        category: cat, line_type: 'standard', monthly_plan: monthly, active: true,
      } as GenericPlanLine)
    }
  }
  return lines
}

export interface ChannelSummary {
  channel_id: string | null
  channel_name: string
  revenue: number       // total over the horizon
  cogs: number
  margin: number        // revenue − cogs (the spread contribution)
  marginPct: number | null
}

/**
 * Revenue / COGS / margin per channel over the planning horizon — the "which
 * channel actually makes money" view the CEO uses to decide what to grow or drop.
 * Sales drivers with no channel are grouped under a synthetic "Unassigned" entry.
 */
export function summariseByChannel(channels: Channel[], drivers: Driver[], planningMonths: number): ChannelSummary[] {
  const nameById = new Map<string, string>((channels || []).map(c => [c.id, c.name]))
  // Key by the real channel id (or null for unassigned) — a Map handles a null
  // key natively, so there is no sentinel string that could collide with an
  // actual channel whose id happened to be "__unassigned__".
  const acc = new Map<string | null, { revenue: number; cogs: number }>()

  for (const d of drivers || []) {
    if (!d || d.active === false || d.kind !== 'sales') continue
    const key: string | null = d.channel_id || null
    const bucket = acc.get(key) || { revenue: 0, cogs: 0 }
    const rev = driverMonthlyValue(d, planningMonths).reduce((a, b) => a + b, 0)
    bucket.revenue += rev
    if (d.mode === 'smart' && d.unit_cost != null && Number(d.unit_cost) > 0) {
      const q = ensureLen(d.quantity, planningMonths)
      bucket.cogs += q.reduce((a, b) => a + b * Number(d.unit_cost), 0)
    }
    acc.set(key, bucket)
  }

  return Array.from(acc.entries()).map(([key, v]) => {
    const margin = v.revenue - v.cogs
    return {
      channel_id: key,
      channel_name: key === null ? 'Unassigned' : (nameById.get(key) || key),
      revenue: v.revenue,
      cogs: v.cogs,
      margin,
      marginPct: v.revenue > 0 ? (margin / v.revenue) * 100 : null,
    }
  })
}
