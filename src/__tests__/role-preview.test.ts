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
  // 2 September 2026. These asserted the older design: one entry per role
  // string, funder included and flagged. Habib looked at the list and asked why
  // the views were all the same. Two of them genuinely were — finance_manager
  // and unit_head differ in nothing the application does — and one was for a
  // person who cannot log in at all, so previewing it showed a screen no funder
  // will ever see. A preview that teaches a distinction which does not exist is
  // worse than no preview.
  it('offers one entry per thing a person can actually SEE', () => {
    const ids = PREVIEW_ROLES.map((r) => r.id)
    expect(ids).toContain('super_coach')
    expect(ids).toContain('coach')
    expect(ids).toContain('ceo')
    // The client's team, read only. finance_manager stands for all of them
    // because they behave identically.
    expect(ids).toContain('finance_manager')
    expect(ids).not.toContain('unit_head')
  })

  it('does not offer the funder, who has no login to preview', () => {
    // A funder reaches the engagement through a showcase link, which shows the
    // method and how many gates are closed and nothing the engagement produced.
    // Rendering the coach's dashboard under the label "The funder" invited
    // exactly the wrong conclusion.
    expect(PREVIEW_ROLES.map((r) => r.id)).not.toContain('funder')
    expect(previewRole('funder')).toBeNull()
  })

  it('has no unreachable roles left in the list at all', () => {
    for (const r of PREVIEW_ROLES) expect(r.unreachable, r.label).toBeFalsy()
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
