import { describe, it, expect } from 'vitest'
import {
  reconcile, verifiedValueShare, MOBILE_MONEY,
  type FieldEntry, type ProviderTxn,
} from '../lib/reconciliation-engine'

const T0 = 1_700_000_000_000 // fixed ms epoch; engine has no clock of its own
const min = (m: number) => m * 60_000

function field(over: Partial<FieldEntry> = {}): FieldEntry {
  return {
    id: 'f1', clientId: 'c1', businessUnitId: 'shop_1', amount: 50_000,
    paymentMethod: MOBILE_MONEY, capturedAt: T0, ...over,
  }
}
function ptxn(over: Partial<ProviderTxn> = {}): ProviderTxn {
  return { id: 'p1', clientId: 'c1', amount: 50_000, occurredAt: T0, ...over }
}

describe('reconcile', () => {
  it('matches an exact amount within the window', () => {
    const r = reconcile([field()], [ptxn({ occurredAt: T0 + min(5) })])
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0]).toMatchObject({ fieldEntryId: 'f1', providerTxnId: 'p1', businessUnitId: 'shop_1', amount: 50_000 })
    expect(r.declaredOnly).toEqual([])
    expect(r.unattributedInbound).toEqual([])
  })

  it('does not match outside the time window', () => {
    const r = reconcile([field()], [ptxn({ occurredAt: T0 + min(16) })])
    expect(r.matches).toEqual([])
    expect(r.declaredOnly).toEqual(['f1'])
    expect(r.unattributedInbound).toEqual(['p1'])
  })

  it('honours a custom window', () => {
    const r = reconcile([field()], [ptxn({ occurredAt: T0 + min(16) })], { windowMinutes: 20 })
    expect(r.matches).toHaveLength(1)
  })

  it('never matches on a mismatched amount (surfaces both as unmatched)', () => {
    const r = reconcile([field({ amount: 50_000 })], [ptxn({ amount: 49_500 })])
    expect(r.matches).toEqual([])
    expect(r.declaredOnly).toEqual(['f1'])
    expect(r.unattributedInbound).toEqual(['p1'])
  })

  it('a tolerance surfaces a near-miss for review but does NOT auto-match', () => {
    const r = reconcile([field({ amount: 50_000 })], [ptxn({ amount: 49_500 })], { amountTolerance: 1_000 })
    expect(r.matches).toEqual([])
    expect(r.declaredOnly).toEqual(['f1'])
    expect(r.unattributedInbound).toEqual(['p1'])
    const nearMiss = r.reviewCandidates.filter(c => c.reason === 'amount_near_miss')
    expect(nearMiss).toHaveLength(1)
    expect(nearMiss[0]).toMatchObject({ fieldEntryId: 'f1', providerTxnId: 'p1', amountDelta: 500 })
  })

  it('only mobile-money entries are eligible; a cash entry stays declared_only', () => {
    const r = reconcile([field({ paymentMethod: 'cash' })], [ptxn()])
    expect(r.matches).toEqual([])
    expect(r.declaredOnly).toEqual(['f1'])
    expect(r.unattributedInbound).toEqual(['p1'])
  })

  it('skips an already-matched field entry and an already-matched payment', () => {
    const r1 = reconcile([field({ alreadyMatched: true })], [ptxn()])
    expect(r1.matches).toEqual([])
    const r2 = reconcile([field()], [ptxn({ alreadyMatched: true })])
    expect(r2.matches).toEqual([])
  })

  it('a mobile-money entry with no captured_at cannot match and is declared_only', () => {
    const r = reconcile([field({ capturedAt: null })], [ptxn()])
    expect(r.matches).toEqual([])
    expect(r.declaredOnly).toEqual(['f1'])
  })

  it('ignores outbound provider transactions entirely', () => {
    const r = reconcile([field()], [ptxn({ direction: 'outbound' })])
    expect(r.matches).toEqual([])
    expect(r.unattributedInbound).toEqual([])
    expect(r.declaredOnly).toEqual(['f1'])
  })

  it('two units, same amount, same window: pairs earliest-to-earliest deterministically', () => {
    // Two entries in different business units, two payments; pairing is by
    // closest timestamp, each side used once.
    const fields = [
      field({ id: 'fA', businessUnitId: 'shop_1', capturedAt: T0 + min(1) }),
      field({ id: 'fB', businessUnitId: 'shop_2', capturedAt: T0 + min(9) }),
    ]
    const payments = [
      ptxn({ id: 'pA', occurredAt: T0 + min(2) }),
      ptxn({ id: 'pB', occurredAt: T0 + min(10) }),
    ]
    const r = reconcile(fields, payments)
    expect(r.matches).toHaveLength(2)
    const byField = Object.fromEntries(r.matches.map(m => [m.fieldEntryId, m.providerTxnId]))
    expect(byField).toEqual({ fA: 'pA', fB: 'pB' })
    expect(r.declaredOnly).toEqual([])
    expect(r.unattributedInbound).toEqual([])
  })

  it('count imbalance (3 entries, 1 payment): matches one, leaves rest declared, flags imbalance', () => {
    const fields = [
      field({ id: 'fA', capturedAt: T0 + min(1) }),
      field({ id: 'fB', capturedAt: T0 + min(2) }),
      field({ id: 'fC', capturedAt: T0 + min(3) }),
    ]
    const r = reconcile(fields, [ptxn({ id: 'pA', occurredAt: T0 + min(1) })])
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0].fieldEntryId).toBe('fA')
    expect(r.declaredOnly.sort()).toEqual(['fB', 'fC'])
    expect(r.unattributedInbound).toEqual([])
    // one payment fully matched, so no count-imbalance note here
    expect(r.reviewCandidates.filter(c => c.reason === 'count_imbalance')).toHaveLength(0)
  })

  it('flags a count imbalance when unmatched entries and unmatched payments coexist', () => {
    // Same-amount entries and payments that cannot all pair on time: one pair
    // matches, leftovers on both sides.
    const fields = [
      field({ id: 'fA', amount: 10_000, capturedAt: T0 }),
      field({ id: 'fB', amount: 20_000, capturedAt: T0 }),
    ]
    const payments = [
      ptxn({ id: 'pA', amount: 10_000, occurredAt: T0 }),
      ptxn({ id: 'pB', amount: 30_000, occurredAt: T0 }),
    ]
    const r = reconcile(fields, payments)
    expect(r.matches.map(m => m.fieldEntryId)).toEqual(['fA'])
    expect(r.declaredOnly).toEqual(['fB'])
    expect(r.unattributedInbound).toEqual(['pB'])
    expect(r.reviewCandidates.filter(c => c.reason === 'count_imbalance')).toHaveLength(1)
  })

  it('unattributed inbound: a payment with no field entry at all', () => {
    const r = reconcile([], [ptxn()])
    expect(r.matches).toEqual([])
    expect(r.unattributedInbound).toEqual(['p1'])
  })

  it('does not cross clients', () => {
    const r = reconcile([field({ clientId: 'c1' })], [ptxn({ clientId: 'c2' })])
    expect(r.matches).toEqual([])
    expect(r.declaredOnly).toEqual(['f1'])
    expect(r.unattributedInbound).toEqual(['p1'])
  })

  it('is deterministic regardless of input order', () => {
    const fields = [
      field({ id: 'fB', capturedAt: T0 + min(9) }),
      field({ id: 'fA', capturedAt: T0 + min(1) }),
    ]
    const payments = [
      ptxn({ id: 'pB', occurredAt: T0 + min(10) }),
      ptxn({ id: 'pA', occurredAt: T0 + min(2) }),
    ]
    const a = reconcile(fields, payments)
    const b = reconcile([...fields].reverse(), [...payments].reverse())
    expect(a.matches).toEqual(b.matches)
  })
})

describe('verifiedValueShare', () => {
  it('is 0 when there is no mobile-money value to verify', () => {
    expect(verifiedValueShare([field({ paymentMethod: 'cash' })], [])).toBe(0)
  })

  it('is the matched fraction of mobile-money value', () => {
    const entries = [
      field({ id: 'fA', amount: 30_000 }),
      field({ id: 'fB', amount: 10_000 }),
    ]
    const matches = [{ fieldEntryId: 'fA', providerTxnId: 'pA', businessUnitId: 'shop_1', amount: 30_000, timeGapMs: 0 }]
    expect(verifiedValueShare(entries, matches)).toBeCloseTo(0.75)
  })

  it('is 1 when all mobile-money value is matched', () => {
    const entries = [field({ id: 'fA', amount: 40_000 })]
    const matches = [{ fieldEntryId: 'fA', providerTxnId: 'pA', businessUnitId: 'shop_1', amount: 40_000, timeGapMs: 0 }]
    expect(verifiedValueShare(entries, matches)).toBe(1)
  })
})
