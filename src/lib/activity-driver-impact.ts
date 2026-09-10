// ============================================================
// ACTIVITY → DRIVER IMPACT — pure logic.
//
// A market activity doesn't just cost money — it is meant to MOVE a driver
// (e.g. "this radio campaign should add 50 walk-in customers/month"). Because
// the business is spread-based, lifting a volume driver flows through the
// buy/sell spread to margin automatically. This module applies an APPROVED
// activity's expected effect onto the drivers for the months the activity
// covers, returning adjusted drivers. Feed the result into
// syntheticPlanLinesFromDrivers and the lift shows up as extra revenue and
// margin — the real mechanism, not a flat percentage on revenue.
//
// Pure, dependency-light, unit-tested in isolation.
// ============================================================

import { monthIndexForPeriod } from './month-end-close'
import type { Driver } from './drivers-engine'
import type { MarketEvent } from './market-events'

export type DriverEffectMode = 'absolute' | 'percent'

// One expected effect an activity has on one driver.
export interface DriverEffect {
  driver_id: string
  mode: DriverEffectMode   // 'absolute' = add N to the driver's monthly quantity; 'percent' = raise it by N%
  value: number            // units to add (absolute) or percentage points (percent)
}

// A market activity that targets drivers. Extends MarketEvent with the effects
// it is expected to produce (an activity can target several drivers).
export interface TargetingEvent extends MarketEvent {
  driver_effects?: DriverEffect[]
}

function ensureLen(arr: number[] | undefined, n: number): number[] {
  const out = new Array(n).fill(0)
  if (Array.isArray(arr)) for (let i = 0; i < n; i++) out[i] = Number(arr[i]) || 0
  return out
}

/**
 * Apply the driver effects of APPROVED, driver-targeting activities onto a copy
 * of the drivers, for the months each activity covers.
 *
 *  - Only status === 'approved' activities with driver_effects are applied
 *    (a proposed activity is a plan, not yet in the numbers).
 *  - An effect raises the driver's monthly QUANTITY over the activity's window
 *    [start_period, start_period + months_count). 'absolute' adds units;
 *    'percent' multiplies by (1 + value/100). Months outside the planning window
 *    are ignored.
 *  - Effects are additive across activities, and stack on top of the base plan.
 *
 * The returned drivers are new objects (the inputs are never mutated), so the
 * base plan is preserved and the lift is purely the activity's contribution.
 */
export function applyActivityDriverEffects(
  drivers: Driver[],
  events: TargetingEvent[],
  startDate: string,
  planningMonths: number,
): Driver[] {
  if (!Array.isArray(drivers) || drivers.length === 0) return Array.isArray(drivers) ? drivers.slice() : []
  if (!Array.isArray(events) || events.length === 0 || planningMonths <= 0) return drivers.map(d => ({ ...d }))

  // Work on a per-driver copy of the quantity array so we can accumulate effects.
  const byId = new Map<string, { driver: Driver; qty: number[] }>()
  for (const d of drivers) byId.set(d.id, { driver: d, qty: ensureLen(d.quantity, planningMonths) })

  for (const e of events) {
    if (!e || e.status !== 'approved' || !Array.isArray(e.driver_effects) || e.driver_effects.length === 0) continue
    const startIdx = monthIndexForPeriod(startDate, e.start_period)
    const n = Math.max(1, Math.floor(Number(e.months_count) || 1))
    for (const eff of e.driver_effects) {
      const entry = byId.get(eff.driver_id)
      if (!entry) continue
      const val = Number(eff.value) || 0
      if (val === 0) continue
      for (let k = 0; k < n; k++) {
        const idx = startIdx + k
        if (idx < 0 || idx >= planningMonths) continue
        if (eff.mode === 'percent') entry.qty[idx] = entry.qty[idx] * (1 + val / 100)
        else entry.qty[idx] = entry.qty[idx] + val
      }
    }
  }

  return drivers.map(d => {
    const entry = byId.get(d.id)!
    return { ...d, quantity: entry.qty }
  })
}
