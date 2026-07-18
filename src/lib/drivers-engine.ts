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

// Resolve which business unit(s) a driver's lines attach to:
//   - its own unit if set, else its channel's unit → a single, precise unit;
//   - otherwise it is a WHOLE-BUSINESS driver, spread EVENLY across every active
//     unit. Splitting (rather than dumping the whole amount on the first unit)
//     keeps the consolidated total correct AND avoids overstating one unit's P&L
//     while understating the others — the per-unit statements stay honest.
// Returns the list of units to attach to (one for a unit/channel-scoped driver,
// all of them for a whole-business driver); empty means nowhere to attach.
function resolveUnitIds(d: Driver, channelById: Map<string, Channel>, allUnitIds: string[]): string[] {
  if (d.unit_id) return [d.unit_id]
  const chan = d.channel_id ? channelById.get(d.channel_id) : undefined
  if (chan?.unit_id) return [chan.unit_id]
  return allUnitIds
}

/**
 * Turn active drivers into synthetic plan lines to concat into config.plan_lines
 * before running the engine.
 *  - A sales driver → a 'revenue' line (quantity × rate, or the flat figure). If
 *    a per-unit buy cost (unit_cost) is set in smart mode, it ALSO emits a
 *    matching 'cost_of_sales' line, so gross margin = quantity × (rate − unit_cost)
 *    — the spread. Move the quantity and both revenue and COGS move together.
 *  - A cost driver → a cost line in its chosen bucket (default direct_opex).
 *  - A WHOLE-BUSINESS driver (no unit and no channel unit) is split evenly across
 *    all `unitIds`, one line per unit carrying an equal share, so consolidated is
 *    exact and no single unit is over/under-stated. A unit/channel-scoped driver
 *    produces one line on that unit.
 * Inactive drivers, all-zero drivers, and drivers with nowhere to attach (whole
 * business but no units) are skipped. Every line's monthly_plan is exactly
 * planningMonths long.
 */
export function syntheticPlanLinesFromDrivers(
  channels: Channel[],
  drivers: Driver[],
  planningMonths: number,
  unitIds: string[],
): GenericPlanLine[] {
  const lines: GenericPlanLine[] = []
  if (!Array.isArray(drivers) || planningMonths <= 0) return lines
  const channelById = new Map<string, Channel>((channels || []).map(c => [c.id, c]))
  const allUnits = (Array.isArray(unitIds) ? unitIds : []).filter(Boolean)

  for (const d of drivers) {
    if (!d || d.active === false) continue
    const targetUnits = resolveUnitIds(d, channelById, allUnits)
    if (targetUnits.length === 0) continue
    const n = targetUnits.length
    // Split whole-business drivers evenly; a single-unit driver keeps its full
    // value and its plain (unsuffixed) id, so unit/channel-scoped lines are
    // unchanged. Whole-business lines get a per-unit id suffix to stay unique.
    const split = (series: number[]) => n === 1 ? series : series.map(v => v / n)
    const suffix = (unitId: string) => n === 1 ? '' : `__${unitId}`

    if (d.kind === 'sales') {
      // Evaluate revenue AND (spread) COGS independently, and emit each line only
      // when it is non-zero. A sales driver with zero sell price but a positive
      // buy price still produces a COGS line — dropping it (as a revenue-only
      // zero check would) would silently lose that cost.
      const rev = driverMonthlyValue(d, planningMonths)
      const hasRev = rev.some(v => v !== 0)
      const cogsFull = (d.mode === 'smart' && d.unit_cost != null && Number(d.unit_cost) > 0)
        ? ensureLen(d.quantity, planningMonths).map(v => v * Number(d.unit_cost))
        : null
      const hasCogs = !!cogsFull && cogsFull.some(v => v !== 0)
      for (const unitId of targetUnits) {
        if (hasRev) {
          lines.push({
            id: `${DRIVER_REV_PREFIX}${d.id}${suffix(unitId)}`, unit_id: unitId, name: `Driver: ${d.name}`,
            category: 'revenue', line_type: 'standard', monthly_plan: split(rev), active: true,
          } as GenericPlanLine)
        }
        if (hasCogs && cogsFull) {
          lines.push({
            id: `${DRIVER_COST_PREFIX}${d.id}${suffix(unitId)}`, unit_id: unitId, name: `Driver COGS: ${d.name}`,
            category: 'cost_of_sales', line_type: 'standard', monthly_plan: split(cogsFull), active: true,
          } as GenericPlanLine)
        }
      }
    } else {
      const monthly = driverMonthlyValue(d, planningMonths)
      if (!monthly.some(v => v !== 0)) continue
      const cat: DriverCostCategory = d.cost_category || 'direct_opex'
      for (const unitId of targetUnits) {
        lines.push({
          id: `${DRIVER_COST_PREFIX}${d.id}${suffix(unitId)}`, unit_id: unitId, name: `Driver: ${d.name}`,
          category: cat, line_type: 'standard', monthly_plan: split(monthly), active: true,
        } as GenericPlanLine)
      }
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
