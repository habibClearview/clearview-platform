import { describe, it, expect } from 'vitest'
import {
  syntheticPlanLinesFromDrivers,
  summariseByChannel,
  driverMonthlyValue,
  isDriverLineId,
  DRIVER_REV_PREFIX,
  DRIVER_COST_PREFIX,
  type Channel,
  type Driver,
} from '../lib/drivers-engine'

const M = 12

function chan(p: Partial<Channel>): Channel {
  return { id: 'ch1', name: 'Walk-in', unit_id: 'u1', active: true, ...p }
}
function drv(p: Partial<Driver>): Driver {
  return {
    id: 'd1', name: 'Walk-in customers', kind: 'sales', unit_id: 'u1', channel_id: 'ch1',
    unit_label: 'customers', mode: 'smart', quantity: new Array(M).fill(10), rate: 100,
    active: true, ...p,
  }
}

describe('driverMonthlyValue', () => {
  it('REG: smart = quantity × rate', () => {
    expect(driverMonthlyValue(drv({ quantity: [10, 20], rate: 5 }), 2)).toEqual([50, 100])
  })
  it('REG: flat = the quantity series as-is (rate ignored)', () => {
    expect(driverMonthlyValue(drv({ mode: 'flat', quantity: [300, 400], rate: 999 }), 2)).toEqual([300, 400])
  })
  it('REG: coerces missing/NaN months to 0 and pads to length', () => {
    expect(driverMonthlyValue(drv({ quantity: [10], rate: 2 }), 3)).toEqual([20, 0, 0])
  })
})

describe('syntheticPlanLinesFromDrivers — sales drivers', () => {
  it('REG: a smart sales driver makes one revenue line = quantity × rate', () => {
    const lines = syntheticPlanLinesFromDrivers([chan({})], [drv({ quantity: new Array(M).fill(10), rate: 100 })], M, 'u1')
    expect(lines).toHaveLength(1)
    expect(lines[0].category).toBe('revenue')
    expect(lines[0].id).toBe(`${DRIVER_REV_PREFIX}d1`)
    expect(lines[0].unit_id).toBe('u1')
    expect(lines[0].monthly_plan.every(v => v === 1000)).toBe(true)
    expect(lines[0].monthly_plan).toHaveLength(M)
  })

  it('REG: a spread driver (unit_cost set) also emits a matching COGS line → margin = qty × (rate − cost)', () => {
    const lines = syntheticPlanLinesFromDrivers([chan({})], [drv({ quantity: new Array(M).fill(10), rate: 100, unit_cost: 60 })], M, 'u1')
    expect(lines).toHaveLength(2)
    const rev = lines.find(l => l.category === 'revenue')!
    const cogs = lines.find(l => l.category === 'cost_of_sales')!
    expect(rev.monthly_plan[0]).toBe(1000)   // 10 × 100
    expect(cogs.monthly_plan[0]).toBe(600)   // 10 × 60
    // spread margin per month = 1000 − 600 = 400 = 10 × (100 − 60)
    expect(rev.monthly_plan[0] - cogs.monthly_plan[0]).toBe(400)
    expect(cogs.id).toBe(`${DRIVER_COST_PREFIX}d1`)
  })

  it('REG: a smart sales driver with zero sell price but a positive buy price still emits its COGS line', () => {
    // volume 10, rate 0 (no revenue), unit_cost 60 → COGS 600/month, no revenue line
    const lines = syntheticPlanLinesFromDrivers([chan({})], [drv({ quantity: new Array(M).fill(10), rate: 0, unit_cost: 60 })], M, 'u1')
    expect(lines).toHaveLength(1)
    expect(lines[0].category).toBe('cost_of_sales')
    expect(lines[0].monthly_plan[0]).toBe(600)
  })

  it('REG: a flat sales driver does NOT emit a COGS line even if unit_cost is set', () => {
    const lines = syntheticPlanLinesFromDrivers([chan({})], [drv({ mode: 'flat', quantity: new Array(M).fill(500), unit_cost: 60 })], M, 'u1')
    expect(lines).toHaveLength(1)
    expect(lines[0].category).toBe('revenue')
    expect(lines[0].monthly_plan[0]).toBe(500)
  })
})

describe('syntheticPlanLinesFromDrivers — cost drivers', () => {
  it('REG: a cost driver lands in its chosen bucket (default direct_opex)', () => {
    const lines = syntheticPlanLinesFromDrivers([], [drv({ id: 'c1', kind: 'cost', channel_id: null, quantity: new Array(M).fill(3), rate: 2000 })], M, 'u1')
    expect(lines).toHaveLength(1)
    expect(lines[0].category).toBe('direct_opex')
    expect(lines[0].monthly_plan[0]).toBe(6000) // 3 × 2000
  })
  it('REG: a cost driver can target cost_of_sales', () => {
    const lines = syntheticPlanLinesFromDrivers([], [drv({ id: 'c1', kind: 'cost', channel_id: null, cost_category: 'cost_of_sales', quantity: new Array(M).fill(1), rate: 50 })], M, 'u1')
    expect(lines[0].category).toBe('cost_of_sales')
  })
})

describe('syntheticPlanLinesFromDrivers — unit resolution & skipping', () => {
  it('REG: a driver with no unit inherits its channel unit', () => {
    const lines = syntheticPlanLinesFromDrivers([chan({ id: 'ch1', unit_id: 'unitX' })], [drv({ unit_id: null, channel_id: 'ch1' })], M, null)
    expect(lines[0].unit_id).toBe('unitX')
  })
  it('REG: with no driver unit and no channel unit, it uses the fallback unit', () => {
    const lines = syntheticPlanLinesFromDrivers([], [drv({ unit_id: null, channel_id: null })], M, 'fallbackU')
    expect(lines[0].unit_id).toBe('fallbackU')
  })
  it('REG: with nowhere to attach (no unit anywhere), the driver is skipped', () => {
    const lines = syntheticPlanLinesFromDrivers([], [drv({ unit_id: null, channel_id: null })], M, null)
    expect(lines).toHaveLength(0)
  })
  it('REG: inactive and all-zero drivers produce nothing', () => {
    expect(syntheticPlanLinesFromDrivers([chan({})], [drv({ active: false })], M, 'u1')).toHaveLength(0)
    expect(syntheticPlanLinesFromDrivers([chan({})], [drv({ quantity: new Array(M).fill(0) })], M, 'u1')).toHaveLength(0)
  })
})

describe('summariseByChannel', () => {
  it('REG: rolls up revenue, cogs and margin per channel over the horizon', () => {
    const channels = [chan({ id: 'walkin', name: 'Walk-in' }), chan({ id: 'export', name: 'Export' })]
    const drivers = [
      drv({ id: 'a', channel_id: 'walkin', quantity: new Array(M).fill(10), rate: 100, unit_cost: 60 }), // rev 12000, cogs 7200
      drv({ id: 'b', channel_id: 'export', quantity: new Array(M).fill(5), rate: 300, unit_cost: 200 }), // rev 18000, cogs 12000
    ]
    const s = summariseByChannel(channels, drivers, M)
    const walkin = s.find(x => x.channel_id === 'walkin')!
    const exp = s.find(x => x.channel_id === 'export')!
    expect(walkin.revenue).toBe(12000)
    expect(walkin.cogs).toBe(7200)
    expect(walkin.margin).toBe(4800)
    expect(exp.margin).toBe(6000)
    expect(exp.marginPct).toBeCloseTo(33.33, 1)
  })
  it('REG: sales drivers with no channel roll up under Unassigned', () => {
    const s = summariseByChannel([], [drv({ id: 'x', channel_id: null, quantity: new Array(M).fill(1), rate: 10 })], M)
    expect(s).toHaveLength(1)
    expect(s[0].channel_id).toBeNull()
    expect(s[0].channel_name).toBe('Unassigned')
    expect(s[0].revenue).toBe(120)
  })
  it('REG: cost drivers are not counted as channel revenue', () => {
    const s = summariseByChannel([chan({})], [drv({ id: 'c', kind: 'cost', channel_id: 'ch1', quantity: new Array(M).fill(1), rate: 100 })], M)
    expect(s).toHaveLength(0)
  })

  it('REG: a zero-revenue sales driver with positive unit_cost still contributes COGS to its channel', () => {
    // Consistency with the plan-line side: a rate:0 + unit_cost:60 driver must
    // still show its COGS (and negative margin) in the channel summary.
    const s = summariseByChannel([chan({ id: 'ch1', name: 'Walk-in' })], [drv({ id: 'z', channel_id: 'ch1', quantity: new Array(M).fill(10), rate: 0, unit_cost: 60 })], M)
    expect(s).toHaveLength(1)
    expect(s[0].revenue).toBe(0)
    expect(s[0].cogs).toBe(600 * M)
    expect(s[0].margin).toBe(-600 * M)
    expect(s[0].marginPct).toBeNull()
  })
})

describe('isDriverLineId', () => {
  it('REG: recognises driver-derived line ids', () => {
    expect(isDriverLineId(`${DRIVER_REV_PREFIX}x`)).toBe(true)
    expect(isDriverLineId(`${DRIVER_COST_PREFIX}x`)).toBe(true)
    expect(isDriverLineId('rev_1')).toBe(false)
    expect(isDriverLineId(null)).toBe(false)
  })
})
