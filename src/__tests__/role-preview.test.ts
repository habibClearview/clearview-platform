// ============================================================
// The preview has to tell the truth about each role, and the only way it stays
// true is by asking the same functions the application asks. These tests check
// that it does, and that the two roles nobody can hold are marked rather than
// quietly dropped.
//
// The most important test here is the last one. A preview whose answers came
// from a second hand-written list would drift the moment somebody changed the
// real rules, and it would drift silently, because nothing on screen would look
// wrong. So the test asserts the preview and the application agree, rather than
// asserting a list of expected answers.
// ============================================================

import { describe, expect, it } from 'vitest'
import { canEdit, canSignOff, canViewCoachGuidance } from '@/lib/coach-types'
import { PREVIEW_ROLES, capabilitiesFor, mayPreview, previewRole } from '@/lib/role-preview'

describe('looking through another role', () => {
  it('offers every party in an engagement, including the ones with no login', () => {
    const ids = PREVIEW_ROLES.map((r) => r.id)
    expect(ids).toContain('super_coach')
    expect(ids).toContain('coach')
    expect(ids).toContain('ceo')
    expect(ids).toContain('finance_manager')
    expect(ids).toContain('unit_head')
    expect(ids).toContain('funder')
  })

  it('marks the funder as a role nobody can hold', () => {
    // user_profiles.role permits only super_coach, coach, ceo, finance_manager,
    // unit_head and accounts_assistant. Offering the funder without saying so
    // would let a coach believe a funder has a login when the funder does not.
    expect(previewRole('funder')?.unreachable).toBe(true)
    expect(previewRole('ceo')?.unreachable).toBeUndefined()
  })

  it('explains every role in words rather than leaving one blank', () => {
    for (const r of PREVIEW_ROLES) {
      expect(r.label.length, r.id).toBeGreaterThan(3)
      expect(r.who.length, r.id).toBeGreaterThan(20)
      expect(r.reach.length, r.id).toBeGreaterThan(20)
    }
  })

  it('lets only the lead consultant look through other eyes', () => {
    expect(mayPreview('super_coach')).toBe(true)
    for (const other of ['coach', 'ceo', 'finance_manager', 'unit_head', 'accounts_assistant']) {
      expect(mayPreview(other as any), other).toBe(false)
    }
  })

  it('says the organisation cannot see the guidance or the fee', () => {
    const caps = capabilitiesFor('ceo')
    const guidance = caps.find((c) => c.what.includes('coaching guidance'))
    const fee = caps.find((c) => c.what.includes('fee'))
    expect(guidance?.allowed).toBe(false)
    expect(fee?.allowed).toBe(false)
    // They can still do the work, which is the point of the engagement.
    expect(caps.find((c) => c.what.includes('working tables'))?.allowed).toBe(true)
    expect(caps.find((c) => c.what.includes('Sign off'))?.allowed).toBe(true)
  })

  it('says a team lead can read but not change', () => {
    const caps = capabilitiesFor('unit_head')
    expect(caps.every((c) => !c.allowed)).toBe(true)
  })

  it('answers from the application rules rather than a second copy of them', () => {
    // If somebody changes who may edit, this preview changes with it. A list of
    // expected answers written here would drift instead, and drift silently.
    for (const role of PREVIEW_ROLES.map((r) => r.id)) {
      const caps = capabilitiesFor(role as any)
      expect(caps.find((c) => c.what.includes('working tables'))?.allowed, role).toBe(canEdit(role as any))
      expect(caps.find((c) => c.what.includes('Sign off'))?.allowed, role).toBe(canSignOff(role as any))
      expect(caps.find((c) => c.what.includes('coaching guidance'))?.allowed, role)
        .toBe(canViewCoachGuidance(role as any))
    }
  })
})
