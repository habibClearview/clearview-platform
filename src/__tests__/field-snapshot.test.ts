// ============================================================
// THE FIELD PHONE FORGETS, WITHOUT LOSING ANYBODY'S WORK
//
// The field capture tool has to hold the price list, the customers, the staff
// and the operator's own details on the phone, because it is used in a market
// with no signal. Habib asked for that to be removed with no new friction, and
// removing it outright is not possible: without it the app cannot be used
// where it is meant to be used.
//
// So it expires. These tests are about the two things that must both be true:
// it is genuinely gone after a day, and nothing about the expiry can touch the
// queue of work that has been typed and not yet sent.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  FIELD_SNAPSHOT_TTL_MS, wrapSnapshot, readSnapshot, SNAPSHOT_EXPIRED_OFFLINE,
} from '@/lib/field-snapshot'

const NOW = 1_757_000_000_000
const DATA = { operator: { display_name: 'A Person' }, catalogue: [{ id: 'x' }] }

describe('a snapshot is kept for the work and no longer', () => {
  it('comes back unchanged while it is fresh', () => {
    const read = readSnapshot<typeof DATA>(wrapSnapshot(DATA, NOW), NOW + 1000)
    expect(read.data).toEqual(DATA)
    expect(read.expired).toBe(false)
  })

  it('survives a full market day and the night after it', () => {
    const elevenHoursLater = NOW + 11 * 60 * 60 * 1000
    expect(readSnapshot(wrapSnapshot(DATA, NOW), elevenHoursLater).data).toEqual(DATA)
    const justInside = NOW + FIELD_SNAPSHOT_TTL_MS - 1000
    expect(readSnapshot(wrapSnapshot(DATA, NOW), justInside).data).toEqual(DATA)
  })

  it('is gone once the allowance passes, and says that is why', () => {
    const read = readSnapshot(wrapSnapshot(DATA, NOW), NOW + FIELD_SNAPSHOT_TTL_MS + 1)
    expect(read.data).toBeNull()
    expect(read.expired).toBe(true)
  })

  it('the allowance is a working day and a night', () => {
    expect(FIELD_SNAPSHOT_TTL_MS).toBe(24 * 60 * 60 * 1000)
  })
})

describe('what the phone must never treat as fresh', () => {
  it('refuses the old unstamped shape, so the first run drops what was there', () => {
    // Before this change the snapshot was written as the bare object, with no
    // savedAt. Accepting it would keep the very data this is meant to clear.
    const read = readSnapshot(JSON.stringify(DATA), NOW)
    expect(read.data).toBeNull()
  })

  it('refuses a snapshot dated in the future rather than trusting the clock', () => {
    const read = readSnapshot(wrapSnapshot(DATA, NOW + 60_000), NOW)
    expect(read.data).toBeNull()
    expect(read.expired).toBe(true)
  })

  it('treats nothing, rubbish and the wrong shape as nothing', () => {
    for (const raw of [null, undefined, '', 'not json', '[]', '"a string"', '{"savedAt":"soon"}']) {
      expect(readSnapshot(raw as string | null, NOW).data).toBeNull()
    }
  })

  it('a wrapper with no data inside is nothing', () => {
    expect(readSnapshot(JSON.stringify({ savedAt: NOW }), NOW).data).toBeNull()
    expect(readSnapshot(JSON.stringify({ savedAt: NOW, data: null }), NOW).data).toBeNull()
  })
})

describe('the operator is told the truth when it has gone', () => {
  it('says what to do and that nothing recorded has been lost', () => {
    expect(SNAPSHOT_EXPIRED_OFFLINE).toContain('Connect once')
    expect(SNAPSHOT_EXPIRED_OFFLINE).toContain('Nothing you recorded has been lost')
  })
})

describe('expiry cannot reach the work waiting to be sent', () => {
  it('the snapshot module knows nothing about the queue', async () => {
    // The queue is in IndexedDB and this file is the only thing that expires.
    // If it ever imports the queue, the two can be confused, and losing typed
    // work is the one failure that cannot be undone.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../lib/field-snapshot.ts', import.meta.url), 'utf8'),
    )
    expect(source).not.toMatch(/field-db|indexedDB|QueuedSale|QueuedCost/)
  })
})
