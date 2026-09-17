// ============================================================
// THE ENGAGEMENT CHARTER AS HABIB REWROTE IT
//
// 17 September 2026. The old Charter was six sections of principle: what the
// method rests on, what it asks, who owns what. The new one is an agreement:
// who commits what, how a decision is made, how a decision is CHANGED, what
// the funder sees, and when the engagement is finished.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  CHARTER_SECTIONS, CHARTER_ROLES, INDEPENDENCE_ELEMENTS, fillCharter,
} from '@/lib/charter-sections'

describe('the shape of the charter', () => {
  it('is ten sections, numbered one to ten in order', () => {
    expect(CHARTER_SECTIONS.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('carries the titles Habib gave, word for word', () => {
    expect(CHARTER_SECTIONS.map((s) => s.title)).toEqual([
      'What this engagement is for',
      'Who is involved and what each commits',
      'How the work runs',
      'How decisions are made',
      'How decisions change',
      'What the funder sees and does',
      'How progress is measured',
      'Handover and close',
      'How this maps to the contract',
      'Signatures',
    ])
  })

  it('shows the contract mapping only when it has been filled in', () => {
    const contract = CHARTER_SECTIONS.find((s) => s.number === 9)
    expect(contract?.optional).toBe(true)
    // And it is the only optional one: everything else is part of the agreement.
    expect(CHARTER_SECTIONS.filter((s) => s.optional)).toHaveLength(1)
  })
})

describe('who commits what', () => {
  it('names every role by function, never by headcount', () => {
    // An organisation with one person doing finance and outreach signs the
    // same charter as one with two.
    const names = CHARTER_ROLES.map((r) => r.role)
    expect(names).toEqual([
      'Chief executive', 'Service lead', 'Finance lead', 'Business development lead',
      'Lead practitioner (coach)', 'Co-implementer', 'Funder',
    ])
    for (const n of names) expect(n).not.toMatch(/\d/)
  })

  it('asks each role for something specific, not for engagement', () => {
    // The old charter asked the leadership for "senior engagement", which
    // commits nobody to anything.
    for (const r of CHARTER_ROLES) {
      expect(r.commits.length, r.role).toBeGreaterThan(40)
      expect(r.commits.toLowerCase()).not.toContain('senior engagement')
    }
  })
})

describe('the words the method must not lose', () => {
  it('still says a decision point opens only when the one before it is signed', () => {
    const how = CHARTER_SECTIONS.find((s) => s.number === 3)!.body.join(' ')
    expect(how).toContain('opens only when the one before it is signed')
    // And the count is stated the way Habib states it.
    expect(how).toContain('eleven decision points')
    expect(how).toContain('Clearing the Ground')
    expect(how).toContain('Handover')
  })

  it('says a signed decision can be changed, which the old charter never did', () => {
    const change = CHARTER_SECTIONS.find((s) => s.number === 5)!.body.join(' ')
    expect(change).toContain('reopens the decision point')
    expect(change).toContain('original decision stays on the record')
  })

  it('confirms independence on five elements at close', () => {
    expect(INDEPENDENCE_ELEMENTS).toHaveLength(5)
    const close = CHARTER_SECTIONS.find((s) => s.number === 8)!.body.join(' ')
    for (const e of INDEPENDENCE_ELEMENTS) expect(close).toContain(e)
  })
})

describe('the engagement own words', () => {
  it('fills in the organisation, the service and the funder', () => {
    expect(fillCharter('{organisation} commercialises {service} with {funder}.', {
      organisation: 'Ikore', service: 'gender and nutrition service', funder: 'Tanager',
    })).toBe('Ikore commercialises the gender and nutrition service with Tanager.')
  })

  it('never leaves a hole where a name should be', () => {
    // A charter with a blank in it is a charter somebody has to ask about
    // before they can sign it.
    // And the article travels with the name, so neither reads "the this
    // service" nor drops the "the" from a named one.
    const filled = fillCharter('{organisation} commercialises {service} with {funder}.', {})
    expect(filled).toBe('the organisation commercialises this service with the funder.')
    expect(filled).not.toContain('{')
  })

  it('leaves no placeholder anywhere in the finished charter', () => {
    const all = CHARTER_SECTIONS.flatMap((s) => s.body)
      .map((line) => fillCharter(line, { organisation: 'Ikore' })).join(' ')
    expect(all).not.toMatch(/\{[a-z_]+\}/)
  })
})

describe('the copy carries no dashes', () => {
  it('in any sentence, title or role', () => {
    const everything = [
      ...CHARTER_SECTIONS.flatMap((s) => [s.title, ...s.body, ...(s.fields || []).map((f) => f.label)]),
      ...CHARTER_ROLES.flatMap((r) => [r.role, r.commits]),
      ...INDEPENDENCE_ELEMENTS,
    ].join(' ')
    expect(everything).not.toMatch(/[—–]/)
  })
})
