import { describe, it, expect } from 'vitest'
import { applyActivityDriverEffects, type TargetingEvent } from '../lib/activity-driver-impact'
import { syntheticPlanLinesFromDrivers, type Driver } from '../lib/drivers-engine'

const START = '2026-01-01'
const M = 12

function drv(p: Partial<Driver>): Driver {
  return {
    id: 'd1', name: 'Walk-in customers', kind: 'sales', unit_id: 'u1', channel_id: 'ch1',
    unit_label: 'customers', mode: 'smart', quantity: new Array(M).fill(10), rate: 100,
    unit_cost: 60, active: true, ...p,
  }
}
function ev(p: Partial<TargetingEvent>): TargetingEvent {
  return {
    id: 'e1', client_id: 'c1', unit_id: 'u1', name: 'Radio campaign',
    cost: 1200, start_period: '2026-04-01', months_count: 2,
    cost_category: 'direct_opex', status: 'approved',
    driver_effects: [{ driver_id: 'd1', mode: 'absolute', value: 5 }],
    ...p,
  }
}

describe('applyActivityDriverEffects — which activities apply', () => {
  it('REG: an approved absolute effect adds units to the target driver over its window', () => {
    const out = applyActivityDriverEffects([drv({})], [ev({})], START, M)
    // window Apr(3)–May(4): +5 → 15; other months stay 10
    expect(out[0].quantity[2]).toBe(10) // Mar
    expect(out[0].quantity[3]).toBe(15) // Apr
    expect(out[0].quantity[4]).toBe(15) // May
    expect(out[0].quantity[5]).toBe(10) // Jun
  })

  it('REG: a percent effect multiplies the quantity over the window', () => {
    const out = applyActivityDriverEffects([drv({ quantity: new Array(M).fill(100) })], [ev({ driver_effects: [{ driver_id: 'd1', mode: 'percent', value: 20 }] })], START, M)
    expect(out[0].quantity[3]).toBeCloseTo(120) // +20%
    expect(out[0].quantity[2]).toBe(100)
  })

  it('REG: proposed / rejected activities do NOT move drivers', () => {
    expect(applyActivityDriverEffects([drv({})], [ev({ status: 'proposed' })], START, M)[0].quantity[3]).toBe(10)
    expect(applyActivityDriverEffects([drv({})], [ev({ status: 'rejected' })], START, M)[0].quantity[3]).toBe(10)
  })

  it('REG: an activity with no driver_effects leaves drivers unchanged', () => {
    expect(applyActivityDriverEffects([drv({})], [ev({ driver_effects: [] })], START, M)[0].quantity[3]).toBe(10)
  })

  it('REG: an effect on an unknown driver id is ignored', () => {
    const out = applyActivityDriverEffects([drv({})], [ev({ driver_effects: [{ driver_id: 'nope', mode: 'absolute', value: 99 }] })], START, M)
    expect(out[0].quantity.every(q => q === 10)).toBe(true)
  })

  it('REG: multiple activities targeting the same driver stack additively', () => {
    const events = [
      ev({ id: 'a', start_period: '2026-04-01', months_count: 1, driver_effects: [{ driver_id: 'd1', mode: 'absolute', value: 5 }] }),
      ev({ id: 'b', start_period: '2026-04-01', months_count: 1, driver_effects: [{ driver_id: 'd1', mode: 'absolute', value: 3 }] }),
    ]
    expect(applyActivityDriverEffects([drv({})], events, START, M)[0].quantity[3]).toBe(18) // 10 + 5 + 3
  })

  it('REG: months outside the planning window are ignored', () => {
    const out = applyActivityDriverEffects([drv({})], [ev({ start_period: '2027-12-01', months_count: 3, driver_effects: [{ driver_id: 'd1', mode: 'absolute', value: 5 }] })], START, M)
    expect(out[0].quantity.every(q => q === 10)).toBe(true) // whole window is beyond month 11
  })

  it('REG: the input drivers are never mutated', () => {
    const base = drv({})
    const snapshot = base.quantity.slice()
    applyActivityDriverEffects([base], [ev({})], START, M)
    expect(base.quantity).toEqual(snapshot)
  })
})

describe('activity → driver → spread → margin (end to end through the drivers engine)', () => {
  it('REG: lifting a volume driver raises BOTH revenue and COGS, so margin grows by qty × spread', () => {
    const drivers = [drv({ quantity: new Array(M).fill(10), rate: 100, unit_cost: 60 })] // spread = 40
    const base = syntheticPlanLinesFromDrivers([], drivers, M, 'u1')
    const baseRev = base.find(l => l.category === 'revenue')!.monthly_plan[3]
    const baseCogs = base.find(l => l.category === 'cost_of_sales')!.monthly_plan[3]

    // +5 customers in April
    const lifted = applyActivityDriverEffects(drivers, [ev({ start_period: '2026-04-01', months_count: 1, driver_effects: [{ driver_id: 'd1', mode: 'absolute', value: 5 }] })], START, M)
    const after = syntheticPlanLinesFromDrivers([], lifted, M, 'u1')
    const revA = after.find(l => l.category === 'revenue')!.monthly_plan[3]
    const cogsA = after.find(l => l.category === 'cost_of_sales')!.monthly_plan[3]

    expect(revA - baseRev).toBe(500)   // +5 × 100 sell
    expect(cogsA - baseCogs).toBe(300) // +5 × 60 buy
    // margin lift = revenue lift − cogs lift = 200 = 5 × (100 − 60) = 5 × spread
    expect((revA - baseRev) - (cogsA - baseCogs)).toBe(200)
  })
})
