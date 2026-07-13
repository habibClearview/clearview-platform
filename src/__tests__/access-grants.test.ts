import { describe, it, expect } from 'vitest'
import { grantStatus, isGrantActive, generateAccessToken, expiryFromDays, GRANT_TYPE_LABELS, GRANT_SCOPE_LABELS, emailSatisfiesGrant, requiresEmailConfirmation } from '../lib/access-grants'

const NOW = '2026-07-13T12:00:00.000Z'

describe('grantStatus / isGrantActive', () => {
  it('REG: a grant with no revocation and no expiry is active', () => {
    expect(grantStatus({ revoked_at: null, expires_at: null }, NOW)).toBe('active')
    expect(isGrantActive({ revoked_at: null, expires_at: null }, NOW)).toBe(true)
  })

  it('REG: a revoked grant is revoked regardless of expiry', () => {
    expect(grantStatus({ revoked_at: '2026-07-01T00:00:00.000Z', expires_at: null }, NOW)).toBe('revoked')
    expect(grantStatus({ revoked_at: '2026-07-01T00:00:00.000Z', expires_at: '2027-01-01T00:00:00.000Z' }, NOW)).toBe('revoked')
  })

  it('REG: an expiry in the past is expired, not active, even without revocation', () => {
    expect(grantStatus({ revoked_at: null, expires_at: '2026-07-01T00:00:00.000Z' }, NOW)).toBe('expired')
    expect(isGrantActive({ revoked_at: null, expires_at: '2026-07-01T00:00:00.000Z' }, NOW)).toBe(false)
  })

  it('REG: an expiry in the future is still active', () => {
    expect(grantStatus({ revoked_at: null, expires_at: '2027-01-01T00:00:00.000Z' }, NOW)).toBe('active')
  })

  it('REG: an expiry exactly at "now" counts as expired, not active -- no open boundary', () => {
    expect(grantStatus({ revoked_at: null, expires_at: NOW }, NOW)).toBe('expired')
  })

  it('REG: revocation is checked before expiry -- a revoked-and-expired grant reports revoked', () => {
    expect(grantStatus({ revoked_at: '2026-06-01T00:00:00.000Z', expires_at: '2026-06-15T00:00:00.000Z' }, NOW)).toBe('revoked')
  })
})

describe('generateAccessToken', () => {
  it('REG: produces a 48-character lowercase hex string (24 random bytes)', () => {
    const token = generateAccessToken()
    expect(token).toMatch(/^[0-9a-f]{48}$/)
  })

  it('REG: two calls never produce the same token', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateAccessToken()))
    expect(seen.size).toBe(50)
  })
})

describe('expiryFromDays', () => {
  const nowMs = new Date('2026-07-13T00:00:00.000Z').getTime()

  it('REG: null/undefined/0/negative all mean "no expiry"', () => {
    expect(expiryFromDays(null, nowMs)).toBeNull()
    expect(expiryFromDays(undefined, nowMs)).toBeNull()
    expect(expiryFromDays(0, nowMs)).toBeNull()
    expect(expiryFromDays(-5, nowMs)).toBeNull()
  })

  it('REG: a positive day count returns nowMs + that many days, as ISO', () => {
    const result = expiryFromDays(30, nowMs)
    expect(result).toBe(new Date(nowMs + 30 * 24 * 60 * 60 * 1000).toISOString())
  })
})

describe('GRANT_TYPE_LABELS', () => {
  it('REG: every grant type has a plain-English label', () => {
    expect(GRANT_TYPE_LABELS.investor).toBeTruthy()
    expect(GRANT_TYPE_LABELS.programme_officer).toBeTruthy()
    expect(GRANT_TYPE_LABELS.subscriber).toBeTruthy()
    expect(GRANT_TYPE_LABELS.other).toBeTruthy()
  })
})

describe('GRANT_SCOPE_LABELS', () => {
  it('REG: every scope has a plain-English label', () => {
    expect(GRANT_SCOPE_LABELS.client).toBeTruthy()
    expect(GRANT_SCOPE_LABELS.portfolio).toBeTruthy()
    expect(GRANT_SCOPE_LABELS.segment).toBeTruthy()
  })
})

describe('emailSatisfiesGrant', () => {
  it('REG: a grant with no grantee_email has no gate -- any submitted email satisfies it', () => {
    expect(emailSatisfiesGrant({ grantee_email: null }, 'anyone@example.com')).toBe(true)
  })

  it('REG: an exact match satisfies the gate', () => {
    expect(emailSatisfiesGrant({ grantee_email: 'investor@fund.com' }, 'investor@fund.com')).toBe(true)
  })

  it('REG: a case difference still satisfies the gate', () => {
    expect(emailSatisfiesGrant({ grantee_email: 'Investor@Fund.com' }, 'investor@fund.com')).toBe(true)
  })

  it('REG: surrounding whitespace on the submitted email is ignored', () => {
    expect(emailSatisfiesGrant({ grantee_email: 'investor@fund.com' }, '  investor@fund.com  ')).toBe(true)
  })

  it('REG: a genuinely different email does not satisfy the gate', () => {
    expect(emailSatisfiesGrant({ grantee_email: 'investor@fund.com' }, 'someone-else@fund.com')).toBe(false)
  })
})

describe('requiresEmailConfirmation', () => {
  it('REG: true only when the coach actually set a grantee_email', () => {
    expect(requiresEmailConfirmation({ grantee_email: 'investor@fund.com' })).toBe(true)
    expect(requiresEmailConfirmation({ grantee_email: null })).toBe(false)
  })
})
