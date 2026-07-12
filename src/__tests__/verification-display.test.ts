import { describe, it, expect } from 'vitest'
import {
  CONFIDENCE_DISPLAY, BADGE_DISPLAY, BADGE_ORDER, READINESS_DISPLAY,
  buildPeriodSignals, partitionBadges,
} from '../lib/verification-display'
import { assessConfidence } from '../lib/confidence'

describe('display maps are complete', () => {
  it('has copy for every confidence label', () => {
    for (const label of ['verified', 'triangulated', 'self_reported_plausible', 'flagged'] as const) {
      expect(CONFIDENCE_DISPLAY[label].title).toBeTruthy()
      expect(CONFIDENCE_DISPLAY[label].blurb).toBeTruthy()
    }
  })
  it('has copy for every badge, and BADGE_ORDER covers them all', () => {
    for (const b of BADGE_ORDER) {
      expect(BADGE_DISPLAY[b].title).toBeTruthy()
      expect(BADGE_DISPLAY[b].howToEarn).toBeTruthy()
    }
    expect(BADGE_ORDER).toHaveLength(Object.keys(BADGE_DISPLAY).length)
  })
  it('has copy for every readiness status', () => {
    for (const s of ['not_started', 'wallet_activated', 'link_pending', 'tier1_active'] as const) {
      expect(READINESS_DISPLAY[s].blurb).toBeTruthy()
    }
  })
})

describe('buildPeriodSignals defaults reconciliation to zero (cash-safe)', () => {
  it('a cash business with good records is not flagged and earns non-payment badges', () => {
    const signals = buildPeriodSignals({
      declaredValue: 100_000,
      hasActuals: true, recordsComplete: true, cogsConsistent: true,
      internallyConsistent: true, monthsConsistentStreak: 4, monthClosedOnTime: true,
    })
    const r = assessConfidence(signals)
    expect(r.label).not.toBe('flagged')
    expect(r.badges).not.toContain('payments_verified')
    expect(r.badges).toContain('records_complete')
  })
})

describe('partitionBadges', () => {
  it('splits into earned and locked in display order', () => {
    const { earned, locked } = partitionBadges(['records_complete', 'books_closed'])
    expect(earned).toEqual(['records_complete', 'books_closed'])
    expect(locked).toEqual(['payments_verified', 'consistently_reported'])
  })
  it('all locked when nothing earned', () => {
    expect(partitionBadges([]).locked).toEqual(BADGE_ORDER)
  })
})
