import { describe, it, expect } from 'vitest'
import { computeSeasonalCashProjection, type SeasonalProjectionInputs } from '../lib/seasonal-cash-projection'

// 24 months, alternating high (200) / low (100) revenue every other
// month, so there's a real, unambiguous seasonal shape with two full
// years of history to average across.
function makeSeasonalInputs(overrides: Partial<SeasonalProjectionInputs> = {}): SeasonalProjectionInputs {
  const months = 24
  const rev = Array.from({ length: months }, (_, i) => (i % 2 === 0 ? 200 : 100))
  const gp = rev.map(r => r * 0.5) // flat 50% gross margin
  return {
    cfClose: Array(months).fill(500),
    rev, gp,
    debtRepayment: Array(months).fill(0),
    monthsClosedFlags: Array(months).fill(true),
    currentMonthIndex: months - 1,
    latestMonthlyOpex: 40,
    ...overrides,
  }
}

describe('computeSeasonalCashProjection — data sufficiency gates', () => {
  it('REG: fewer than 3 closed months returns "insufficient" and no projection at all', () => {
    const r = computeSeasonalCashProjection(makeSeasonalInputs({
      monthsClosedFlags: [true, true, false, ...Array(21).fill(false)],
    }))
    expect(r.dataConfidence).toBe('insufficient')
    expect(r.projectedClose).toEqual([])
    expect(r.troughValue).toBeNull()
  })

  it('REG: 3-5 closed months is "limited" but still produces a real projection', () => {
    const flags = Array(24).fill(false)
    ;[0, 1, 2, 3].forEach(i => { flags[i] = true })
    const r = computeSeasonalCashProjection(makeSeasonalInputs({ monthsClosedFlags: flags, currentMonthIndex: 3 }))
    expect(r.dataConfidence).toBe('limited')
    expect(r.projectedClose.length).toBe(12)
  })

  it('REG: 6 or more closed months is "reliable"', () => {
    const flags = Array(24).fill(false)
    for (let i = 0; i < 6; i++) flags[i] = true
    const r = computeSeasonalCashProjection(makeSeasonalInputs({ monthsClosedFlags: flags, currentMonthIndex: 5 }))
    expect(r.dataConfidence).toBe('reliable')
  })
})

describe('computeSeasonalCashProjection — the seasonal pattern is genuinely detected, not flat', () => {
  it('REG: months that historically ran high project higher gross profit than months that historically ran low', () => {
    const r = computeSeasonalCashProjection(makeSeasonalInputs())
    // currentMonthIndex = 23 (odd -> historically a "low" position). Month
    // offset +1 lands on position 0 (historically "high"); offset +2 lands
    // on position 1 (historically "low"). The net-cash swing between
    // consecutive months should reflect that real alternation, not be flat.
    const net = r.projectedClose.map((v, i) => i === 0 ? v - 500 : v - r.projectedClose[i - 1])
    expect(net[0]).toBeGreaterThan(net[1]) // offset+1 (high) > offset+2 (low)
    expect(net[2]).toBeGreaterThan(net[3]) // pattern repeats
  })

  it('REG: a business with no seasonal variation at all (flat revenue) projects a flat pattern', () => {
    const flatRev = Array(12).fill(150)
    const r = computeSeasonalCashProjection(makeSeasonalInputs({
      rev: flatRev, gp: flatRev.map(v => v * 0.5),
      monthsClosedFlags: Array(12).fill(true), currentMonthIndex: 11, cfClose: Array(12).fill(500),
    }))
    const net = r.projectedClose.map((v, i) => i === 0 ? v - 500 : v - r.projectedClose[i - 1])
    net.forEach(n => expect(n).toBeCloseTo(net[0], 6))
  })
})

describe('computeSeasonalCashProjection — uses gross profit, not raw revenue, as the cash driver', () => {
  it('REG: a high-revenue, zero-margin business does not project inflated cash from revenue alone', () => {
    const rev = Array(12).fill(1_000_000) // huge revenue
    const gp = Array(12).fill(0) // but zero gross margin -- nothing left after cost of sales
    const r = computeSeasonalCashProjection(makeSeasonalInputs({
      rev, gp, monthsClosedFlags: Array(12).fill(true), currentMonthIndex: 11,
      cfClose: Array(12).fill(500), latestMonthlyOpex: 40,
    }))
    // Net cash each month should be driven by gp (0) minus opex (40), i.e.
    // -40/month, NOT by the huge revenue figure. If the raw-revenue formula
    // from the original spec were used instead, this would show a massive
    // cash surplus instead of a steady decline.
    expect(r.projectedClose[0]).toBeCloseTo(500 - 40, 6)
    expect(r.projectedClose[11]).toBeLessThan(500)
  })
})

describe('computeSeasonalCashProjection — trough identification', () => {
  it('REG: troughValue and troughMonthOffset correctly identify the real minimum of projectedClose', () => {
    const r = computeSeasonalCashProjection(makeSeasonalInputs())
    expect(r.troughMonthOffset).not.toBeNull()
    const actualMin = Math.min(...r.projectedClose)
    expect(r.troughValue).toBeCloseTo(actualMin, 6)
    expect(r.projectedClose[r.troughMonthOffset! - 1]).toBeCloseTo(actualMin, 6)
  })

  it('REG: debt service pulls the trough down and can push it negative', () => {
    // debtRepayment must extend past currentMonthIndex+HORIZON_MONTHS -- the
    // projection looks up currentMonthIndex+f for f up to 12, so a 24-month
    // array with currentMonthIndex=23 leaves nothing for it to find there.
    const withoutDebt = computeSeasonalCashProjection(makeSeasonalInputs())
    const withDebt = computeSeasonalCashProjection(makeSeasonalInputs({ debtRepayment: Array(36).fill(60) }))
    expect(withDebt.troughValue!).toBeLessThan(withoutDebt.troughValue!)
  })
})

describe('computeSeasonalCashProjection — stress overlays', () => {
  it('REG: input price rise (+15% opex) always produces less cash than the base projection', () => {
    const r = computeSeasonalCashProjection(makeSeasonalInputs())
    r.stressClose_inputRise.forEach((v, i) => expect(v).toBeLessThan(r.projectedClose[i]))
  })

  it('REG: a delayed-repayment stress reduces cash at the trough and fully recovers the month after', () => {
    const r = computeSeasonalCashProjection(makeSeasonalInputs())
    const idx = r.troughMonthOffset! - 1
    expect(r.stressClose_4wk[idx]).toBeLessThan(r.projectedClose[idx])
    if (idx + 1 < r.stressClose_4wk.length) {
      expect(r.stressClose_4wk[idx + 1]).toBeCloseTo(r.projectedClose[idx + 1], 6)
    }
  })

  it('REG: a 4-week delay hits at least as hard as a 2-week delay at the trough month', () => {
    const r = computeSeasonalCashProjection(makeSeasonalInputs())
    const idx = r.troughMonthOffset! - 1
    const drop2wk = r.projectedClose[idx] - r.stressClose_2wk[idx]
    const drop4wk = r.projectedClose[idx] - r.stressClose_4wk[idx]
    expect(drop4wk).toBeGreaterThanOrEqual(drop2wk)
  })

  it('REG: with no real trough (insufficient data), stress arrays degrade gracefully rather than crashing', () => {
    const r = computeSeasonalCashProjection(makeSeasonalInputs({ monthsClosedFlags: Array(24).fill(false) }))
    expect(r.stressClose_2wk).toEqual([])
    expect(r.stressClose_4wk).toEqual([])
  })
})

describe('computeSeasonalCashProjection — confidence bands', () => {
  it('REG: a cycle position with only one historical instance uses the 30% default variation, not a computed (meaningless) stddev', () => {
    // Only 3 closed months -- every cycle position has at most one
    // historical instance.
    const flags = Array(24).fill(false)
    ;[0, 1, 2].forEach(i => { flags[i] = true })
    const r = computeSeasonalCashProjection(makeSeasonalInputs({ monthsClosedFlags: flags, currentMonthIndex: 2 }))
    // Band should be meaningfully wide (driven by the 30% default) relative
    // to the projected value, not collapsed to zero-width from a
    // single-point "average".
    const bandWidth = r.projectedCloseUpperBand[0] - r.projectedCloseLowerBand[0]
    expect(bandWidth).toBeGreaterThan(0)
  })

  it('REG: the upper band is always >= projected close, and the lower band is always <= projected close', () => {
    const r = computeSeasonalCashProjection(makeSeasonalInputs())
    r.projectedClose.forEach((v, i) => {
      expect(r.projectedCloseUpperBand[i]).toBeGreaterThanOrEqual(v)
      expect(r.projectedCloseLowerBand[i]).toBeLessThanOrEqual(v)
    })
  })
})

describe('computeSeasonalCashProjection — starting point', () => {
  it('REG: the projection starts from the real current closing cash balance, not zero', () => {
    const r = computeSeasonalCashProjection(makeSeasonalInputs({ cfClose: Array(24).fill(9_999) }))
    // First projected month = starting cash + that month's net cash --
    // should be in the neighbourhood of 9,999, not near zero.
    expect(r.projectedClose[0]).toBeGreaterThan(9_000)
  })
})
