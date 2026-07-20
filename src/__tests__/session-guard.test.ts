import { describe, it, expect } from 'vitest'
import { isIdle, IDLE_MS, HEARTBEAT_MS } from '@/lib/auth/session-guard'

describe('isIdle', () => {
  const now = 1_000_000_000_000

  it('is NOT idle right after activity', () => {
    expect(isIdle(now, now, IDLE_MS)).toBe(false)
    expect(isIdle(now, now - 1000, IDLE_MS)).toBe(false)
  })

  it('is idle once the gap reaches the timeout', () => {
    expect(isIdle(now, now - IDLE_MS, IDLE_MS)).toBe(true)
    expect(isIdle(now, now - (IDLE_MS + 1), IDLE_MS)).toBe(true)
  })

  it('is NOT idle just before the timeout', () => {
    expect(isIdle(now, now - (IDLE_MS - 1), IDLE_MS)).toBe(false)
  })

  it('treats a missing/blank last-activity as active (never signs out on bad data)', () => {
    expect(isIdle(now, null, IDLE_MS)).toBe(false)
    expect(isIdle(now, undefined, IDLE_MS)).toBe(false)
    expect(isIdle(now, NaN, IDLE_MS)).toBe(false)
    expect(isIdle(now, 0, IDLE_MS)).toBe(false)
  })

  it('uses a short idle window and a frequent check interval', () => {
    expect(IDLE_MS).toBeLessThanOrEqual(5 * 60 * 1000)
    expect(HEARTBEAT_MS).toBeLessThanOrEqual(30 * 1000)
  })
})
