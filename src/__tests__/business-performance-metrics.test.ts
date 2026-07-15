import { describe, it, expect } from 'vitest'
import {
  grossMarginPct, ebitdaMarginPct, operatingMarginPct, netMarginPct,
  revenueGrowthPct, revenueGrowthPctFromSeries, ruleOf40, isRuleOf40Strong,
  burnMultiple, roiPct, cac, clv, ltvToCac, cacPaybackMonths, churnRatePct,
  netRevenueRetentionPct, mrr, arr, computeFreePerformance,
} from '../lib/business-performance-metrics'

describe('margins', () => {
  it('gross margin is (gp/revenue) as a whole percent', () => {
    expect(grossMarginPct(390, 1000)).toBe(39)
  })
  it('ebitda margin', () => {
    expect(ebitdaMarginPct(240, 1000)).toBe(24)
  })
  it('operating margin nets off depreciation', () => {
    expect(operatingMarginPct(240, 20, 1000)).toBe(22)
  })
  it('net margin', () => {
    expect(netMarginPct(170, 1000)).toBe(17)
  })
  it('returns null on zero revenue, never NaN/Infinity', () => {
    expect(grossMarginPct(390, 0)).toBeNull()
    expect(ebitdaMarginPct(240, 0)).toBeNull()
    expect(netMarginPct(170, 0)).toBeNull()
  })
})

describe('revenue growth', () => {
  it('period-over-period', () => {
    expect(revenueGrowthPct(1000, 1220)).toBe(22)
  })
  it('negative growth is preserved', () => {
    expect(revenueGrowthPct(1000, 920)).toBe(-8)
  })
  it('null when previous revenue is zero', () => {
    expect(revenueGrowthPct(0, 500)).toBeNull()
  })
  it('from a monthly series: year 2 vs year 1', () => {
    const rev = [...Array(12).fill(100), ...Array(12).fill(138)] // 1200 -> 1656 = +38%
    expect(revenueGrowthPctFromSeries(rev)).toBe(38)
  })
  it('null when there is not a full second year', () => {
    expect(revenueGrowthPctFromSeries(Array(18).fill(100))).toBeNull()
  })
})

describe('rule of 40', () => {
  it('adds growth% and margin%', () => {
    expect(ruleOf40(38, 24)).toBe(62)
  })
  it('is null if either input is missing (no fake score)', () => {
    expect(ruleOf40(null, 24)).toBeNull()
    expect(ruleOf40(38, null)).toBeNull()
  })
  it('strong threshold is 40 inclusive', () => {
    expect(isRuleOf40Strong(40)).toBe(true)
    expect(isRuleOf40Strong(39)).toBe(false)
    expect(isRuleOf40Strong(null)).toBe(false)
  })
})

describe('burn multiple', () => {
  it('net burn / net new revenue', () => {
    expect(burnMultiple(200, 400)).toBe(0.5)
  })
  it('null when cash-generative (no burn)', () => {
    expect(burnMultiple(0, 400)).toBeNull()
    expect(burnMultiple(-50, 400)).toBeNull()
  })
  it('null when no new revenue', () => {
    expect(burnMultiple(200, 0)).toBeNull()
  })
})

describe('roi', () => {
  it('net profit / capital', () => {
    expect(roiPct(280, 1000)).toBe(28)
  })
  it('null on zero capital', () => {
    expect(roiPct(280, 0)).toBeNull()
  })
})

describe('customer cluster', () => {
  it('cac', () => {
    expect(cac(420000, 10)).toBe(42000)
    expect(cac(420000, 0)).toBeNull()
  })
  it('clv', () => {
    expect(clv(10000, 4, 3)).toBe(120000)
  })
  it('ltv:cac', () => {
    expect(ltvToCac(380000, 42000)).toBe(9)
    expect(ltvToCac(380000, 0)).toBeNull()
  })
  it('cac payback in months', () => {
    expect(cacPaybackMonths(42000, 13125)).toBe(3.2)
    expect(cacPaybackMonths(42000, 0)).toBeNull()
  })
  it('churn %', () => {
    expect(churnRatePct(8, 100)).toBe(8)
    expect(churnRatePct(8, 0)).toBeNull()
  })
  it('net revenue retention %', () => {
    expect(netRevenueRetentionPct(1000, 1180)).toBe(118)
    expect(netRevenueRetentionPct(0, 1180)).toBeNull()
  })
  it('mrr and arr', () => {
    expect(mrr(200, 120000)).toBe(24000000)
    expect(arr(24000000)).toBe(288000000)
  })
})

describe('computeFreePerformance', () => {
  const metrics = { total_revenue: 1656, total_gp: 646, total_ebitda: 397, total_npat: 281 }
  const monthlyRevenue = [...Array(12).fill(100), ...Array(12).fill(138)] // +38%

  it('assembles the free cluster with growth, margins and rule of 40', () => {
    const p = computeFreePerformance({ metrics, monthlyRevenue })
    expect(p.revenueGrowthPct).toBe(38)
    expect(p.grossMarginPct).toBe(39)
    expect(p.ebitdaMarginPct).toBe(24)
    expect(p.netMarginPct).toBe(17)
    expect(p.ruleOf40).toBe(62)
    expect(p.ruleOf40Strong).toBe(true)
    expect(p.revenue).toBe(1656)
  })

  it('leaves growth and rule of 40 null when there is only one year of data', () => {
    const p = computeFreePerformance({ metrics, monthlyRevenue: Array(12).fill(100) })
    expect(p.revenueGrowthPct).toBeNull()
    expect(p.ruleOf40).toBeNull()
    expect(p.grossMarginPct).toBe(39) // margins still compute
  })

  it('computes burn only when cash falls and revenue grows', () => {
    const cashFalling = [1000, 900, 800, 700, 600, 500, 500, 500, 500, 500, 500, 500]
    const p = computeFreePerformance({ metrics, monthlyRevenue, monthlyCashClose: cashFalling })
    // burned = 1000 - 500 = 500; net new revenue = 1656 - 1200 = 456; 500/456 = 1.10
    expect(p.burnMultiple).toBe(1.1)
  })

  it('burn is null for a cash-generative business', () => {
    const cashRising = Array.from({ length: 12 }, (_, i) => 1000 + i * 100)
    const p = computeFreePerformance({ metrics, monthlyRevenue, monthlyCashClose: cashRising })
    expect(p.burnMultiple).toBeNull()
  })
})
