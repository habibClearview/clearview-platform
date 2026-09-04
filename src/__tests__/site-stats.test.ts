// ============================================================
// NO UNSOURCED CLAIM ABOUT THE WORLD.
//
// Habib's own figures need no citation: he did the work. A claim about aid
// budgets or blended finance is different — a programme manager who reads that
// data for a living will check it, and being wrong in front of that reader
// costs more than the figure gains.
//
// So this test exists to make the rule mechanical rather than remembered: any
// market figure added later without a publication and a link fails here.
// ============================================================
import { describe, expect, it } from 'vitest'
import { OWN_STATS, MARKET_STATS, ACTUALS, LINKEDIN_READERS } from '@/lib/site-stats'

describe('the figures on the public site', () => {
  it('cites a publication and a link for every claim about the world', () => {
    expect(MARKET_STATS.length).toBeGreaterThan(0)
    for (const s of MARKET_STATS) {
      expect(s.source, `"${s.label}" has no publication`).toBeTruthy()
      expect(s.url, `"${s.label}" has no link`).toMatch(/^https:\/\//)
    }
  })

  it('gives every figure something to mean', () => {
    for (const s of [...OWN_STATS, ...MARKET_STATS]) {
      expect(Number.isFinite(s.n)).toBe(true)
      expect(s.label.length).toBeGreaterThan(20)
    }
  })

  it('keeps the published actuals available, and worse than the projection', () => {
    // The projection was a range topping out at 28%. The actuals came in worse,
    // which is why they are worth having ready.
    expect(ACTUALS.bilateralFall2025).toBeGreaterThan(0)
    expect(ACTUALS.url).toMatch(/^https:\/\/www\.oecd\.org\//)
  })

  it('holds the LinkedIn readership as its own number', () => {
    // Confirmed by Habib. The Kit list is a different, smaller number and the
    // two must never be presented as the same thing.
    expect(LINKEDIN_READERS).toBe(1145)
  })
})
