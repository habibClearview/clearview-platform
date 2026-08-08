// ============================================================
// The showcase allowlist, checked as a shape rather than as a behaviour.
//
// The loader itself talks to a database, so it is not the thing to unit test.
// What is worth testing, and worth failing loudly, is the shape it returns:
// the showcase page can only render what ShowcaseView carries, so the set of
// keys on that interface IS the security boundary.
//
// A future edit that adds one field to the loader to make a page slightly
// richer is the realistic way this leaks, and it would not look like a mistake
// at the time. This test makes that edit fail here, next to the reason, rather
// than quietly widening what a stranger with a link can see.
// ============================================================
import { describe, expect, it } from 'vitest'
import { SHOWCASE_GRANT_TYPE } from '@/lib/showcase-loader'
import type { ShowcaseView } from '@/lib/showcase-loader'

/**
 * Every key the showcase view is permitted to carry.
 *
 * Adding a key here is a deliberate decision to let one more thing reach
 * somebody with no account and no relationship to the engagement. Before doing
 * it, ask whether a prospect seeing it could learn anything about the
 * organisation, its customers, its finances or the people involved.
 */
const ALLOWED_KEYS = [
  'organisation',
  'programme',
  'country',
  'gatesComplete',
  'gatesTotal',
  'underWay',
  'expiresAt',
] as const

/**
 * Things that must never appear, named explicitly so the failure message says
 * what went wrong rather than just that a count changed.
 */
const FORBIDDEN_KEYS = [
  'parties', 'partyEmails', 'signatures', 'signerName', 'evidence',
  'evidenceSummary', 'comments', 'charter', 'charterContent', 'deliverables',
  'amount', 'payment', 'fee', 'invoice', 'claims', 'clientId', 'token',
  'accessToken', 'captures', 'interviews', 'costFloor', 'pricing', 'gates',
]

describe('the showcase allowlist', () => {
  it('carries exactly the keys it is allowed to carry', () => {
    // Typed as the interface, so this fails to compile the moment the shape
    // grows a key, and fails at runtime if one is added without updating the
    // list above.
    const sample: ShowcaseView = {
      organisation: null,
      programme: null,
      country: null,
      gatesComplete: 0,
      gatesTotal: 12,
      underWay: false,
      expiresAt: null,
    }
    expect(Object.keys(sample).sort()).toEqual([...ALLOWED_KEYS].sort())
  })

  it('names nothing that would identify an engagement or its work', () => {
    for (const key of FORBIDDEN_KEYS) {
      expect(ALLOWED_KEYS as readonly string[]).not.toContain(key)
    }
  })

  it('keeps the three naming fields together, since they are one decision', () => {
    // organisation, programme and country are all withheld or all released by
    // the same switch. Splitting them would let a link say "IGNITE+ Nigeria"
    // while claiming not to name the client, which names them to anybody who
    // knows the programme.
    const naming = ['organisation', 'programme', 'country']
    for (const key of naming) {
      expect(ALLOWED_KEYS as readonly string[]).toContain(key)
    }
  })

  it('uses a grant type that cannot be confused with a real access grant', () => {
    // A showcase link is not an access grant and must not be usable as one.
    // The loader refuses any grant whose type is not exactly this.
    expect(SHOWCASE_GRANT_TYPE).toBe('gtcv_showcase')
    expect(SHOWCASE_GRANT_TYPE).not.toBe('client')
    expect(SHOWCASE_GRANT_TYPE).not.toBe('portfolio')
  })
})
