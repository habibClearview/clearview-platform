// ============================================================
// The security decisions behind the ClearView API, tested without a database.
//
// 20 September 2026. Every one of these is a rule somebody could break by
// accident in a later change, and would not notice until an outside system
// was already relying on it.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  generateKey, hashKey, looksLikeKey, keyFromHeader, keyRefusal, hasScope,
  cleanScopes, describeKey, hashesMatch, KEY_PREFIX, SCOPES, SCOPE_LABELS,
  type ApiKeyRow,
} from '@/lib/api-keys'

const row = (over: Partial<ApiKeyRow> = {}): ApiKeyRow => ({
  id: 'k1', client_id: 'c1', business_unit_id: 'u1', operator_id: 'o1',
  label: 'Till', scopes: ['sales.write'], expires_at: null, revoked_at: null,
  ...over,
})

describe('generating a key', () => {
  it('produces a key with the recognisable prefix and a matching hash', () => {
    const { key, hash, prefix } = generateKey()
    expect(key.startsWith(KEY_PREFIX)).toBe(true)
    expect(hash).toBe(hashKey(key))
    expect(key.startsWith(prefix)).toBe(true)
  })

  it('never produces the same key twice', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateKey().key))
    expect(seen.size).toBe(200)
  })

  it('stores a prefix too short to authenticate with', () => {
    const { key, prefix } = generateKey()
    expect(prefix.length).toBeLessThan(key.length)
    expect(looksLikeKey(prefix)).toBe(false)
  })
})

describe('recognising a key before touching the database', () => {
  it('accepts a real key', () => {
    expect(looksLikeKey(generateKey().key)).toBe(true)
  })

  it.each([
    ['empty', ''],
    ['a prefix that is not ours', 'zz_other_abcdefghijklmnopqrstuvwxyz0123456789'],
    ['too short', KEY_PREFIX + 'abc'],
    ['characters that are not base64url', KEY_PREFIX + 'a'.repeat(40) + '!!'],
    ['not a string', 12345 as unknown as string],
  ])('refuses %s', (_name, value) => {
    expect(looksLikeKey(value)).toBe(false)
  })
})

describe('taking the key off a request', () => {
  it('reads a Bearer header', () => {
    const { key } = generateKey()
    expect(keyFromHeader(`Bearer ${key}`)).toBe(key)
  })

  it('does not care about the case of the word Bearer', () => {
    const { key } = generateKey()
    expect(keyFromHeader(`bearer ${key}`)).toBe(key)
  })

  it('refuses a header carrying something that is not one of our keys', () => {
    expect(keyFromHeader('Bearer not-a-key')).toBeNull()
  })

  it('refuses a missing header rather than throwing', () => {
    expect(keyFromHeader(null)).toBeNull()
    expect(keyFromHeader(undefined)).toBeNull()
  })
})

describe('whether a key may be used at all', () => {
  it('lets a live key through', () => {
    expect(keyRefusal(row())).toBeNull()
  })

  it('reports an unknown key', () => {
    expect(keyRefusal(null)).toBe('unknown')
  })

  it('reports a withdrawn key, even if it has not expired', () => {
    expect(keyRefusal(row({ revoked_at: '2026-01-01T00:00:00Z' }))).toBe('revoked')
  })

  it('reports an expired key', () => {
    const past = new Date('2026-09-01T00:00:00Z').toISOString()
    expect(keyRefusal(row({ expires_at: past }), new Date('2026-09-20T00:00:00Z'))).toBe('expired')
  })

  it('treats the exact moment of expiry as expired rather than as the last valid instant', () => {
    const at = '2026-09-20T00:00:00Z'
    expect(keyRefusal(row({ expires_at: at }), new Date(at))).toBe('expired')
  })

  it('says withdrawn before expired, because that is the one the holder must act on', () => {
    expect(keyRefusal(row({
      revoked_at: '2026-01-01T00:00:00Z', expires_at: '2026-01-01T00:00:00Z',
    }))).toBe('revoked')
  })
})

describe('what a key is allowed to do', () => {
  it('allows only what it was given', () => {
    const k = row({ scopes: ['sales.write'] })
    expect(hasScope(k, 'sales.write')).toBe(true)
    expect(hasScope(k, 'results.read')).toBe(false)
    expect(hasScope(k, 'payments.write')).toBe(false)
  })

  it('a key with no permissions can do nothing', () => {
    const k = row({ scopes: [] })
    for (const s of SCOPES) expect(hasScope(k, s)).toBe(false)
  })

  it('a null permission list is treated as none, not as everything', () => {
    const k = row({ scopes: null })
    for (const s of SCOPES) expect(hasScope(k, s)).toBe(false)
  })

  it('drops anything unrecognised rather than storing it', () => {
    expect(cleanScopes(['sales.write', 'admin', '*', 42])).toEqual(['sales.write'])
  })

  it('never stores the same permission twice', () => {
    expect(cleanScopes(['sales.write', 'sales.write'])).toEqual(['sales.write'])
  })

  it('treats anything that is not a list as no permissions', () => {
    expect(cleanScopes('sales.write')).toEqual([])
    expect(cleanScopes(null)).toEqual([])
  })

  it('every permission has words a coach can read on the screen', () => {
    for (const s of SCOPES) {
      expect(SCOPE_LABELS[s]).toBeTruthy()
      expect(SCOPE_LABELS[s]).not.toContain('.')
    }
  })
})

describe('what a caller is told about their own key', () => {
  it('never includes the key, its hash or its prefix', () => {
    const described = JSON.stringify(describeKey(row(), 'Clinic'))
    expect(described).not.toContain('cv_live_')
    expect(described.toLowerCase()).not.toContain('hash')
    expect(described.toLowerCase()).not.toContain('prefix')
  })

  it('names the business unit the key is confined to', () => {
    expect(describeKey(row(), 'Clinic').business_unit).toEqual({ id: 'u1', name: 'Clinic' })
  })
})

describe('comparing hashes', () => {
  it('matches a hash with itself', () => {
    const h = hashKey('anything')
    expect(hashesMatch(h, h)).toBe(true)
  })

  it('refuses two different hashes', () => {
    expect(hashesMatch(hashKey('a'), hashKey('b'))).toBe(false)
  })

  it('refuses hashes of different lengths without throwing', () => {
    expect(hashesMatch('abc', hashKey('a'))).toBe(false)
  })
})
