// ============================================================
// THE FIXTURE CANNOT BE POINTED AT A REAL CLIENT
//
// The checks that found three row-level security holes on 8 September were run
// against a live engagement, and the data they changed had to be put back by
// hand afterwards. Habib's instruction was that this must never be how it
// works: the test engagement exists so the checks have somewhere to write.
//
// The rule is only worth anything if it cannot be talked out of, so it is
// tested here rather than trusted. Everything below is about refusing.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  TEST_SLUG, TEST_EMAILS, TEST_LOGINS, isTestLogin,
  refuseUnlessTestEngagement, testPassword,
} from '@/lib/test-engagement'

describe('the checks run against the test engagement and nothing else', () => {
  it('allows the test engagement', () => {
    expect(refuseUnlessTestEngagement(TEST_SLUG)).toBeNull()
  })

  it('allows it whatever case or padding it arrives in', () => {
    expect(refuseUnlessTestEngagement('  Test-Engagement  ')).toBeNull()
  })

  it('refuses a real engagement and says which one it was pointed at', () => {
    const refusal = refuseUnlessTestEngagement('ikore')
    expect(refusal).toContain('ikore')
    expect(refusal).toContain('Nothing was done')
  })

  it('refuses an engagement whose name merely looks like a test', () => {
    // A client called Test Aggregators Ltd is a client.
    expect(refuseUnlessTestEngagement('test-aggregators')).not.toBeNull()
    expect(refuseUnlessTestEngagement('testing-services-uganda')).not.toBeNull()
  })

  it('refuses when no engagement is named at all', () => {
    for (const nothing of [null, undefined, '', '   ']) {
      expect(refuseUnlessTestEngagement(nothing)).not.toBeNull()
    }
  })
})

describe('only the fixture’s own logins can be deleted', () => {
  it('recognises the three it made', () => {
    for (const email of TEST_EMAILS) expect(isTestLogin(email)).toBe(true)
  })

  it('recognises them however they are typed', () => {
    expect(isTestLogin('  TEST-CLIENT@CLEARVIEW.INVALID ')).toBe(true)
  })

  it('does not recognise a real address', () => {
    for (const real of ['habib@habibonifade.com', 'someone@ikore.org', '', null, undefined]) {
      expect(isTestLogin(real)).toBe(false)
    }
  })

  it('does not recognise an address that merely starts the same way', () => {
    expect(isTestLogin('test-client@clearview.invalid.example.com')).toBe(false)
    expect(isTestLogin('test-client@realdomain.com')).toBe(false)
  })
})

describe('the addresses cannot reach a person', () => {
  it('every login is on a domain that can never be delegated', () => {
    // .invalid is reserved by RFC 2606, so a letter to one of these cannot
    // arrive anywhere however badly a send goes wrong.
    for (const { email } of TEST_LOGINS) expect(email.endsWith('.invalid')).toBe(true)
  })

  it('covers the client, their team and the funder', () => {
    expect(TEST_LOGINS.map((l) => l.role).sort()).toEqual(['ceo', 'finance_manager', 'funder'])
  })

  it('every login says what it exists to prove', () => {
    for (const l of TEST_LOGINS) expect(l.proves.length).toBeGreaterThan(20)
  })
})

describe('the passwords are not guessable and are never reused', () => {
  it('two runs do not produce the same one', () => {
    expect(testPassword()).not.toEqual(testPassword())
  })

  it('is long enough to be worth having', () => {
    expect(testPassword().length).toBeGreaterThanOrEqual(20)
  })
})
