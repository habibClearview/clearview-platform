// ============================================================
// Tests for the GtCV DP04 commercial viability calculations.
//
// These cover the four rules the method will not bend on, because getting any
// of them wrong produces a commercial decision that looks sound and is not:
//
//   1. The cost floor is the sum of all five categories. Miss one and the
//      floor understates what delivery costs.
//   2. Overhead below 20 percent of direct costs is flagged, not corrected.
//   3. A price below the floor produces a negative margin and is named as a
//      structural deficit.
//   4. Break even matches the handbook worked example.
//
// The figures below are invented for the test. No client is named anywhere,
// and the currency is passed in rather than assumed, which is the same rule
// the surface follows.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  buildCostFloor,
  buildFixedCosts,
  buildMarketRange,
  buildViability,
  breakEvenDeliveries,
  categorySubtotal,
  contributionPerDelivery,
  costPerCycle,
  evaluateTier,
  formatAmount,
  formatPercent,
  requiredTierCoverage,
  surplusAtTargetVolume,
  COST_CATEGORY_VALUES,
  MINIMUM_MARKET_SOURCES,
  OVERHEAD_MINIMUM_SHARE,
} from '@/lib/gtcv-costing'

// A complete, healthy cost baseline. Direct costs total 1,000 per cycle and
// overhead is 250, which is 25 percent of direct costs and therefore above
// the minimum. The floor is 1,250.
const HEALTHY_LINES = [
  { category: 'direct_labour', item: 'Lead facilitator', unit: 'day', qty_per_cycle: 5, unit_cost: 100, annual_deliveries: 10 },
  { category: 'direct_labour', item: 'Co facilitator', unit: 'day', qty_per_cycle: 5, unit_cost: 40, annual_deliveries: 10 },
  { category: 'direct_materials', item: 'Printed workbooks', unit: 'set', qty_per_cycle: 25, unit_cost: 4, annual_deliveries: 10 },
  { category: 'travel_logistics', item: 'Venue hire', unit: 'day', qty_per_cycle: 5, unit_cost: 20, annual_deliveries: 10 },
  { category: 'quality_assurance', item: 'Output review', unit: 'day', qty_per_cycle: 1, unit_cost: 100, annual_deliveries: 10 },
  { category: 'overhead', item: 'Management and finance share', unit: 'allocation', qty_per_cycle: 1, unit_cost: 250, annual_deliveries: 10 },
]

describe('cost per line', () => {
  it('multiplies quantity per cycle by unit cost', () => {
    expect(costPerCycle({ category: 'direct_labour', qty_per_cycle: 5, unit_cost: 100 })).toBe(500)
  })

  it('treats blank and non numeric entries as zero rather than failing', () => {
    expect(costPerCycle({ category: 'direct_labour', qty_per_cycle: null, unit_cost: 100 })).toBe(0)
    expect(costPerCycle({ category: 'direct_labour', qty_per_cycle: '', unit_cost: '' })).toBe(0)
    expect(costPerCycle({ category: 'overhead', qty_per_cycle: 'not a number', unit_cost: 10 })).toBe(0)
  })

  it('reads numbers held as strings, which is what an input returns', () => {
    expect(costPerCycle({ category: 'direct_materials', qty_per_cycle: '25', unit_cost: '4' })).toBe(100)
  })
})

describe('category subtotals', () => {
  it('sums only the lines in that category', () => {
    const labour = categorySubtotal(HEALTHY_LINES, 'direct_labour')
    expect(labour.lines).toHaveLength(2)
    expect(labour.costPerCycle).toBe(700) // 500 + 200
    expect(labour.label).toBe('Direct Labour')
    expect(labour.direct).toBe(true)
  })

  it('annualises at the delivery count entered on the line', () => {
    const labour = categorySubtotal(HEALTHY_LINES, 'direct_labour')
    expect(labour.annualCost).toBe(7000) // 700 per cycle across 10 deliveries
  })

  it('reports an empty category rather than omitting it', () => {
    const qa = categorySubtotal([{ category: 'direct_labour', qty_per_cycle: 1, unit_cost: 10 }], 'quality_assurance')
    expect(qa.empty).toBe(true)
    expect(qa.costPerCycle).toBe(0)
    expect(qa.lines).toHaveLength(0)
  })
})

describe('the cost floor', () => {
  it('sums all five categories', () => {
    const cost = buildCostFloor(HEALTHY_LINES)
    // 700 labour + 100 materials + 100 travel + 100 QA + 250 overhead
    expect(cost.costFloor).toBe(1250)
    expect(cost.directCosts).toBe(1000)
    expect(cost.overhead).toBe(250)
    expect(cost.costFloor).toBe(cost.directCosts + cost.overhead)
  })

  it('always returns all five categories, in workbook order, even when empty', () => {
    const cost = buildCostFloor([])
    expect(cost.categories.map((c) => c.category)).toEqual(COST_CATEGORY_VALUES)
    expect(cost.costFloor).toBe(0)
    expect(cost.complete).toBe(false)
    expect(cost.emptyCategories).toHaveLength(5)
  })

  it('marks the floor complete only when every category carries a cost', () => {
    const cost = buildCostFloor(HEALTHY_LINES)
    expect(cost.complete).toBe(true)
    expect(cost.emptyCategories).toEqual([])

    const missingQa = buildCostFloor(HEALTHY_LINES.filter((l) => l.category !== 'quality_assurance'))
    expect(missingQa.complete).toBe(false)
    expect(missingQa.emptyCategories).toEqual(['quality_assurance'])
    // The floor drops, which is exactly the trap: a lower number that is not a lower cost.
    expect(missingQa.costFloor).toBe(1150)
  })

  it('annualises the whole floor at the entered volumes', () => {
    const cost = buildCostFloor(HEALTHY_LINES)
    expect(cost.annualCost).toBe(12500) // 1,250 across 10 deliveries
  })
})

describe('the overhead check', () => {
  it('does not flag overhead at or above 20 percent of direct costs', () => {
    const cost = buildCostFloor(HEALTHY_LINES)
    expect(cost.overheadShareOfDirect).toBeCloseTo(0.25, 10)
    expect(cost.overheadBelowMinimum).toBe(false)
    expect(cost.overheadShortfall).toBe(0)
  })

  it('flags overhead below 20 percent of direct costs and says how far below', () => {
    const thin = HEALTHY_LINES.map((l) =>
      l.category === 'overhead' ? { ...l, unit_cost: 50 } : l,
    )
    const cost = buildCostFloor(thin)
    expect(cost.directCosts).toBe(1000)
    expect(cost.overhead).toBe(50)
    expect(cost.overheadShareOfDirect).toBeCloseTo(0.05, 10)
    expect(cost.overheadBelowMinimum).toBe(true)
    expect(cost.overheadMinimum).toBe(200) // 20 percent of 1,000
    expect(cost.overheadShortfall).toBe(150)
  })

  it('flags overhead left out entirely', () => {
    const cost = buildCostFloor(HEALTHY_LINES.filter((l) => l.category !== 'overhead'))
    expect(cost.overhead).toBe(0)
    expect(cost.overheadBelowMinimum).toBe(true)
    expect(cost.emptyCategories).toContain('overhead')
  })

  it('sits exactly on the boundary without flagging', () => {
    const cost = buildCostFloor([
      { category: 'direct_labour', qty_per_cycle: 1, unit_cost: 1000 },
      { category: 'direct_materials', qty_per_cycle: 1, unit_cost: 0.0001 },
      { category: 'travel_logistics', qty_per_cycle: 1, unit_cost: 0.0001 },
      { category: 'quality_assurance', qty_per_cycle: 1, unit_cost: 0.0001 },
      { category: 'overhead', qty_per_cycle: 1, unit_cost: 1000 * OVERHEAD_MINIMUM_SHARE + 1 },
    ])
    expect(cost.overheadBelowMinimum).toBe(false)
  })

  it('reports no share at all when there are no direct costs to measure against', () => {
    const cost = buildCostFloor([{ category: 'overhead', qty_per_cycle: 1, unit_cost: 500 }])
    expect(cost.overheadShareOfDirect).toBeNull()
    expect(cost.overheadBelowMinimum).toBe(false)
  })
})

describe('pricing tiers', () => {
  const floor = 1250

  it('computes margin and percent above the floor', () => {
    const tier = evaluateTier({ tier_name: 'Standard', price: 2000 }, floor)
    expect(tier.margin).toBe(750)
    expect(tier.marginRatio).toBeCloseTo(0.6, 10)
    expect(tier.percentAboveFloor).toBeCloseTo(60, 10)
    expect(tier.belowFloor).toBe(false)
    expect(tier.deficitWarning).toBeNull()
  })

  it('produces a negative margin and flags a price below the floor', () => {
    const tier = evaluateTier({ tier_name: 'Entry', price: 800 }, floor)
    expect(tier.margin).toBe(-450)
    expect(tier.margin).toBeLessThan(0)
    expect(tier.percentAboveFloor).toBeCloseTo(-36, 10)
    expect(tier.belowFloor).toBe(true)
    expect(tier.deficitWarning).toContain('structural deficit')
  })

  it('never reports a break even for a price below the floor', () => {
    const tier = evaluateTier({ tier_name: 'Entry', price: 800 }, floor, {
      annualFixedCosts: 120000,
      targetDeliveries: 50,
    })
    expect(tier.breakEvenDeliveries).toBeNull()
    expect(tier.clearsTargetVolume).toBe(false)
    // Selling fifty at a loss of 450 each, on top of the fixed costs.
    expect(tier.annualSurplusOrDeficit).toBe(-142500)
  })

  it('flags a price that exactly meets the floor as contributing nothing', () => {
    const tier = evaluateTier({ tier_name: 'Entry', price: floor }, floor)
    expect(tier.margin).toBe(0)
    expect(tier.belowFloor).toBe(false)
    expect(tier.deficitWarning).toContain('contributes nothing')
  })

  it('leaves an unpriced tier blank rather than treating it as zero', () => {
    const tier = evaluateTier({ tier_name: 'Premium', price: null }, floor)
    expect(tier.price).toBeNull()
    expect(tier.margin).toBeNull()
    expect(tier.percentAboveFloor).toBeNull()
    expect(tier.belowFloor).toBe(false)
    expect(tier.clearsTargetVolume).toBeNull()
  })

  it('reports which of the three required tiers are present and priced', () => {
    const coverage = requiredTierCoverage([
      { tier_name: 'Entry, minimum viable', price: 1500 },
      { tier_name: 'Standard core service', price: null },
    ])
    expect(coverage.map((c) => c.key)).toEqual(['entry', 'standard', 'premium'])
    expect(coverage[0]).toMatchObject({ present: true, priced: true })
    expect(coverage[1]).toMatchObject({ present: true, priced: false })
    expect(coverage[2]).toMatchObject({ present: false, priced: false })
  })
})

describe('break even', () => {
  it('matches the handbook worked example', () => {
    // Fixed costs 120,000, price 3,000, cost floor 1,200.
    // 120,000 / 1,800 is 66.67, which rounds up to 67 deliveries a year.
    expect(contributionPerDelivery(3000, 1200)).toBe(1800)
    expect(breakEvenDeliveries(120000, 3000, 1200)).toBe(67)
  })

  it('rounds up, because a delivery cannot be sold in fractions', () => {
    expect(breakEvenDeliveries(1000, 300, 100)).toBe(5) // 1000 / 200 is exactly 5
    expect(breakEvenDeliveries(1001, 300, 100)).toBe(6) // 5.005 rounds up
  })

  it('returns null when the price never clears the floor', () => {
    expect(breakEvenDeliveries(120000, 1200, 1200)).toBeNull()
    expect(breakEvenDeliveries(120000, 800, 1200)).toBeNull()
  })

  it('needs no deliveries at all when there are no fixed costs', () => {
    expect(breakEvenDeliveries(0, 3000, 1200)).toBe(0)
  })

  it('reports the surplus or deficit at the target volume', () => {
    // 100 deliveries at a contribution of 1,800 is 180,000, less 120,000 fixed.
    expect(surplusAtTargetVolume(120000, 3000, 1200, 100)).toBe(60000)
    // 50 deliveries falls short of the 67 needed.
    expect(surplusAtTargetVolume(120000, 3000, 1200, 50)).toBe(-30000)
  })

  it('annualises monthly fixed costs by twelve', () => {
    const fixed = buildFixedCosts([
      { item: 'Salaries', monthly_amount: 8000 },
      { item: 'Office', monthly_amount: 1500 },
      { item: 'Software', monthly_amount: 500 },
    ])
    expect(fixed.monthlyTotal).toBe(10000)
    expect(fixed.annualTotal).toBe(120000)
    expect(fixed.lineCount).toBe(3)
  })

  it('says whether the target volume clears break even', () => {
    const clears = evaluateTier({ tier_name: 'Standard', price: 3000 }, 1200, {
      annualFixedCosts: 120000,
      targetDeliveries: 70,
    })
    expect(clears.breakEvenDeliveries).toBe(67)
    expect(clears.clearsTargetVolume).toBe(true)
    expect(clears.annualSurplusOrDeficit).toBe(6000)

    const short = evaluateTier({ tier_name: 'Standard', price: 3000 }, 1200, {
      annualFixedCosts: 120000,
      targetDeliveries: 60,
    })
    expect(short.clearsTargetVolume).toBe(false)
    expect(short.annualSurplusOrDeficit).toBe(-12000)
  })
})

describe('market price reference', () => {
  it('reports the range and the median across priced sources', () => {
    const range = buildMarketRange(
      [
        { source: 'Comparable provider A', price: 2000 },
        { source: 'Comparable provider B', price: 3500 },
        { source: 'Comparable provider C', price: 2800 },
      ],
      1250,
    )
    expect(range.low).toBe(2000)
    expect(range.high).toBe(3500)
    expect(range.median).toBe(2800)
    expect(range.pricedCount).toBe(3)
    expect(range.enoughSources).toBe(true)
    expect(range.belowFloorCount).toBe(0)
    expect(range.floorAboveMarket).toBe(false)
  })

  it('needs at least three priced sources', () => {
    const range = buildMarketRange(
      [{ source: 'A', price: 2000 }, { source: 'B', price: null }, { source: 'C' }],
      1250,
    )
    expect(range.entryCount).toBe(3)
    expect(range.pricedCount).toBe(1)
    expect(range.enoughSources).toBe(false)
    expect(MINIMUM_MARKET_SOURCES).toBe(3)
  })

  it('names the case where the floor sits above every observed price', () => {
    const range = buildMarketRange(
      [{ source: 'A', price: 800 }, { source: 'B', price: 950 }, { source: 'C', price: 1100 }],
      1250,
    )
    expect(range.belowFloorCount).toBe(3)
    expect(range.floorAboveMarket).toBe(true)
    expect(range.floorWithinRange).toBe(false)
  })

  it('recognises a floor sitting inside the observed range', () => {
    const range = buildMarketRange(
      [{ source: 'A', price: 900 }, { source: 'B', price: 1400 }, { source: 'C', price: 2000 }],
      1250,
    )
    expect(range.floorWithinRange).toBe(true)
    expect(range.floorAboveMarket).toBe(false)
  })
})

describe('the whole DP04 readout', () => {
  const input = {
    costLines: HEALTHY_LINES,
    tiers: [
      { tier_name: 'Entry, minimum viable', price: 1500 },
      { tier_name: 'Standard, core service', price: 2500 },
      { tier_name: 'Premium, full engagement', price: 4000 },
    ],
    marketPrices: [
      { source: 'Comparable provider A', price: 2000 },
      { source: 'Comparable provider B', price: 3000 },
      { source: 'Comparable provider C', price: 4200 },
    ],
    fixedCosts: [{ item: 'Salaries', monthly_amount: 5000 }],
    targetDeliveries: 60,
    currency: 'EUR',
  }

  it('computes the floor once and hands the same number to every tier', () => {
    const v = buildViability(input)
    expect(v.costFloor).toBe(1250)
    v.tiers.forEach((t) => expect(t.costFloor).toBe(1250))
  })

  it('raises no flags when the model is complete and every price clears the floor', () => {
    const v = buildViability(input)
    expect(v.flags).toEqual([])
  })

  it('carries the engagement currency through without assuming one', () => {
    expect(buildViability(input).currency).toBe('EUR')
    expect(buildViability({ ...input, currency: 'UGX' }).currency).toBe('UGX')
    expect(buildViability({ ...input, currency: undefined }).currency).toBeNull()
  })

  it('raises a deficit flag for a tier priced below the floor', () => {
    const v = buildViability({
      ...input,
      tiers: [...input.tiers.slice(1), { tier_name: 'Entry, minimum viable', price: 800 }],
    })
    const deficits = v.flags.filter((f) => f.level === 'deficit')
    expect(deficits).toHaveLength(1)
    expect(deficits[0].message).toContain('below the cost floor')
    expect(deficits[0].message).toContain('structural deficit')
  })

  it('raises a gap flag when overhead is below the minimum', () => {
    const v = buildViability({
      ...input,
      costLines: HEALTHY_LINES.map((l) => (l.category === 'overhead' ? { ...l, unit_cost: 50 } : l)),
    })
    expect(v.flags.some((f) => f.level === 'gap' && f.message.includes('20 percent minimum'))).toBe(true)
  })

  it('raises gap flags for a missing tier, a thin market and no fixed costs', () => {
    const v = buildViability({
      costLines: HEALTHY_LINES,
      tiers: [{ tier_name: 'Standard', price: 2500 }],
      marketPrices: [{ source: 'A', price: 2000 }],
      fixedCosts: [],
      targetDeliveries: 0,
      currency: 'GHS',
    })
    const messages = v.flags.map((f) => f.message).join(' ')
    expect(messages).toContain('Entry, Premium')
    expect(messages).toContain('market price source')
    expect(messages).toContain('No fixed costs entered')
    expect(messages).toContain('No target delivery volume set')
  })

  it('survives being handed nothing at all', () => {
    const v = buildViability({})
    expect(v.costFloor).toBe(0)
    expect(v.tiers).toEqual([])
    expect(v.fixed.annualTotal).toBe(0)
    expect(v.flags.length).toBeGreaterThan(0)
  })
})

describe('presentation helpers', () => {
  it('prints the currency it is given and nothing when it is given none', () => {
    expect(formatAmount(1250, 'EUR')).toBe('EUR 1,250')
    expect(formatAmount(1250, 'KES')).toBe('KES 1,250')
    expect(formatAmount(1250, '')).toBe('1,250')
    expect(formatAmount(1250, null)).toBe('1,250')
  })

  it('prints a ratio as a percentage', () => {
    expect(formatPercent(0.25)).toBe('25.0%')
    expect(formatPercent(-0.36)).toBe('-36.0%')
    expect(formatPercent(null)).toBe('-')
  })
})
