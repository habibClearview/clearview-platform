import { describe, it, expect } from 'vitest'
import {
  assessConfidence, deriveBadges, verifiedShareOfDeclared,
  VERIFIED_SHARE_THRESHOLD, type PeriodSignals,
} from '../lib/confidence'

// A fully honest, well-run CASH business: complete records, consistent, closed
// on time -- but nothing payment-verified. This is the case the whole design
// must protect.
function cashBusiness(over: Partial<PeriodSignals> = {}): PeriodSignals {
  return {
    matchedValue: 0,
    unattributedInboundValue: 0,
    declaredValue: 100_000,
    hasActuals: true,
    recordsComplete: true,
    cogsConsistent: true,
    internallyConsistent: true,
    monthsConsistentStreak: 6,
    monthClosedOnTime: true,
    ...over,
  }
}

describe('verifiedShareOfDeclared', () => {
  it('is 0 when nothing is declared', () => {
    expect(verifiedShareOfDeclared(50_000, 0)).toBe(0)
  })
  it('is the matched fraction of declared, clamped to 1', () => {
    expect(verifiedShareOfDeclared(50_000, 100_000)).toBe(0.5)
    expect(verifiedShareOfDeclared(150_000, 100_000)).toBe(1)
  })
})

describe('assessConfidence — cash is not punished', () => {
  it('a consistent, complete cash business clears the honest floor (not flagged, respectable score)', () => {
    const r = assessConfidence(cashBusiness())
    expect(r.label).not.toBe('flagged')
    expect(['triangulated', 'self_reported_plausible']).toContain(r.label)
    // base = consistency (40) + completeness (30), no verification needed
    expect(r.score).toBeGreaterThanOrEqual(70)
  })

  it('verification only ever ADDS: same business with matched value scores >= the cash version', () => {
    const cash = assessConfidence(cashBusiness())
    const verified = assessConfidence(cashBusiness({ matchedValue: 60_000 }))
    expect(verified.score).toBeGreaterThanOrEqual(cash.score)
    expect(verified.label).toBe('verified') // 60% >= threshold
  })

  it('score is monotonic in matched value', () => {
    const scores = [0, 25_000, 50_000, 75_000, 100_000].map(
      m => assessConfidence(cashBusiness({ matchedValue: m })).score,
    )
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1])
    }
  })
})

describe('assessConfidence — labels', () => {
  it('verified when matched share meets the threshold', () => {
    const r = assessConfidence(cashBusiness({ matchedValue: 100_000 * VERIFIED_SHARE_THRESHOLD }))
    expect(r.label).toBe('verified')
  })

  it('triangulated when corroborated but not payment-verified', () => {
    const r = assessConfidence(cashBusiness({ matchedValue: 0, cogsConsistent: true }))
    expect(r.label).toBe('triangulated')
  })

  it('self_reported_plausible when consistent but not corroborated by COGS', () => {
    const r = assessConfidence(cashBusiness({ matchedValue: 0, cogsConsistent: false }))
    expect(r.label).toBe('self_reported_plausible')
  })

  it('flagged when inbound payments materially exceed declared revenue', () => {
    const r = assessConfidence(cashBusiness({ unattributedInboundValue: 40_000, declaredValue: 100_000 }))
    expect(r.label).toBe('flagged')
  })

  it('flagged when the period is internally inconsistent', () => {
    const r = assessConfidence(cashBusiness({ internallyConsistent: false }))
    expect(r.label).toBe('flagged')
  })

  it('an empty period (no actuals, no data) is not flagged and not verified', () => {
    const r = assessConfidence({
      matchedValue: 0, unattributedInboundValue: 0, declaredValue: 0,
      hasActuals: false, recordsComplete: false, cogsConsistent: false,
      internallyConsistent: true, monthsConsistentStreak: 0, monthClosedOnTime: false,
    })
    expect(r.label).toBe('self_reported_plausible')
    expect(r.score).toBe(40) // consistency base only
  })
})

describe('deriveBadges — cash businesses can still earn recognition', () => {
  it('a cash business earns everything except payments_verified', () => {
    const badges = deriveBadges(cashBusiness())
    expect(badges).toContain('consistently_reported')
    expect(badges).toContain('records_complete')
    expect(badges).toContain('books_closed')
    expect(badges).not.toContain('payments_verified')
  })

  it('a business with a matched payment earns payments_verified', () => {
    const badges = deriveBadges(cashBusiness({ matchedValue: 10_000 }))
    expect(badges).toContain('payments_verified')
  })

  it('no consistency streak means no consistently_reported badge', () => {
    const badges = deriveBadges(cashBusiness({ monthsConsistentStreak: 1 }))
    expect(badges).not.toContain('consistently_reported')
  })
})
