// ============================================================
// When is the Engagement Charter actually signed?
//
// This is a tri-party agreement, so the answer is not "somebody signed it".
// It is signed when every named signatory has signed that exact version.
// Getting this wrong in either direction is serious: too eager and the app
// tells a funder an agreement is executed when a party has not signed;
// too reluctant and a fully signed agreement still reads "in review" on the
// copy people file.
//
// The bug this guards against was real. Signing wrote a signature row and
// never moved engagement_charters.status, so no Charter ever became signed.
// ============================================================
import { describe, it, expect } from 'vitest'
import { isCharterFullyExecuted, outstandingSignatories } from '@/lib/engagement-types'

const party = (id: string, is_signatory: boolean) => ({ id, is_signatory })
const sig = (party_id: string) => ({ party_id })

// The real shape: client, lead consultant, co-implementer all sign; the
// finance lead and field team are on the engagement but do not sign.
const PARTIES = [
  party('client', true),
  party('lead', true),
  party('co', true),
  party('finance', false),
  party('field', false),
]

describe('when a Charter counts as fully executed', () => {
  it('is not executed when nobody has signed', () => {
    expect(isCharterFullyExecuted(PARTIES, [])).toBe(false)
  })

  it('is not executed when two of the three signatories have signed', () => {
    const signed = [sig('client'), sig('lead')]
    expect(isCharterFullyExecuted(PARTIES, signed)).toBe(false)
    expect(outstandingSignatories(PARTIES, signed).map((p) => p.id)).toEqual(['co'])
  })

  it('is executed once every signatory has signed', () => {
    const signed = [sig('client'), sig('lead'), sig('co')]
    expect(isCharterFullyExecuted(PARTIES, signed)).toBe(true)
    expect(outstandingSignatories(PARTIES, signed)).toEqual([])
  })

  it('non-signatories signing does not execute the agreement', () => {
    // Everybody on the engagement has signed EXCEPT one required signatory.
    // A naive count of signatures against parties would call this done.
    const signed = [sig('client'), sig('lead'), sig('finance'), sig('field')]
    expect(isCharterFullyExecuted(PARTIES, signed)).toBe(false)
    expect(outstandingSignatories(PARTIES, signed).map((p) => p.id)).toEqual(['co'])
  })

  it('an agreement with no named signatories is never executed', () => {
    // A misconfigured engagement must not report a signed agreement just
    // because there is nobody left to sign it.
    const none = [party('a', false), party('b', false)]
    expect(isCharterFullyExecuted(none, [])).toBe(false)
    expect(isCharterFullyExecuted(none, [sig('a')])).toBe(false)
  })

  it('ignores signatures with no party attached', () => {
    // party_id is nullable (a party can be removed after signing). A null
    // must never be mistaken for a signatory having signed.
    const signed = [sig('client'), sig('lead'), { party_id: null }]
    expect(isCharterFullyExecuted(PARTIES, signed)).toBe(false)
  })

  it('one signatory signing twice does not stand in for the others', () => {
    const signed = [sig('client'), sig('client'), sig('client')]
    expect(isCharterFullyExecuted(PARTIES, signed)).toBe(false)
    expect(outstandingSignatories(PARTIES, signed).map((p) => p.id)).toEqual(['lead', 'co'])
  })
})
