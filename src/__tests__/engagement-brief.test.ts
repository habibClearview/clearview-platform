import { describe, it, expect } from 'vitest'
import {
  briefFromConfig, briefIntoConfig, periodInWords, durationInWords, salutation,
  SERVICE_TYPES, SERVICE_LABEL,
} from '@/lib/engagement-brief'
import { buildScopeEmail } from '@/lib/email'

// ============================================================
// TANAGER PAYS. IKORE IS SERVED. 5 September 2026.
// Purchase Order 149 commissions the work; the Scope of Work delivers it to
// Ikore International Development Ltd under IGNITE+. Both organisations read
// the welcome, and telling the payer they are about to do the exercises — or
// the LSP that they are about to be invoiced — loses the room on line one.
// ============================================================
const BRIEF = {
  payerName: 'Tanager',
  payerProgramme: 'IGNITE+',
  servedName: 'Ikore International Development Ltd',
  services: ['canvas'],
  periodStart: '2026-09-07',
  periodEnd: '2027-03-15',
  reference: 'Purchase Order 149',
  deliverables: ['Refined service bundles', 'Pricing models'],
}

const base = {
  engagementTitle: 'IGNITE+',
  clientName: 'Ikore International Development Ltd',
  coachName: 'Habib Onifade',
  engagementMode: 'canvas',
  journeyUrl: 'https://clearview.habibonifade.com/engagement/ikore',
}

describe('the brief believes nothing it is handed', () => {
  it('reads what is there', () => {
    const b = briefFromConfig({ brief: BRIEF })
    expect(b.payerName).toBe('Tanager')
    expect(b.servedName).toBe('Ikore International Development Ltd')
    expect(b.services).toEqual(['canvas'])
  })

  it('drops a service that is not one of the four', () => {
    const b = briefFromConfig({ brief: { ...BRIEF, services: ['canvas', 'nonsense'] } })
    expect(b.services).toEqual(['canvas'])
  })

  it('drops a date that is not a date, rather than printing it', () => {
    const b = briefFromConfig({ brief: { ...BRIEF, periodEnd: 'whenever' } })
    expect(b.periodEnd).toBeUndefined()
    expect(periodInWords(b)).toBe('7 September 2026')
  })

  it('survives junk in the column', () => {
    for (const junk of [null, undefined, 'a string', 42, [], { brief: 'not an object' }]) {
      expect(() => briefFromConfig(junk)).not.toThrow()
    }
    expect(briefFromConfig(null)).toEqual({})
  })

  it('does not wipe the rest of brand_overrides when it saves', () => {
    const merged = briefIntoConfig({ engagement_title: 'IGNITE+ Nigeria' }, BRIEF)
    expect(merged.engagement_title).toBe('IGNITE+ Nigeria')
    expect((merged.brief as { payerName: string }).payerName).toBe('Tanager')
  })

  it('reads the period back in words', () => {
    expect(periodInWords(briefFromConfig({ brief: BRIEF })))
      .toBe('7 September 2026 to 15 March 2027')
  })
})

describe('a client is addressed by name', () => {
  it('takes a title and a full name', () => {
    expect(salutation('Morgan Mercer', 'Mr')).toBe('Dear Mr Morgan Mercer,')
    expect(salutation('Morgan Mercer')).toBe('Dear Morgan Mercer,')
    expect(salutation('Morgan Mercer', 'Dr.')).toBe('Dear Dr Morgan Mercer,')
  })

  it('would rather say nothing than guess', () => {
    // "Dear Morgan," is how you write to a child. With no name, the letter
    // opens "Dear colleague," — the caller must not invent one.
    for (const v of ['', '   ', undefined]) expect(salutation(v as never, 'Mr')).toBeUndefined()
  })
})

describe('how long, in words', () => {
  it('reads the span a person would say', () => {
    expect(durationInWords(BRIEF)).toBe('six months')
    expect(durationInWords({ periodStart: '2026-09-07', periodEnd: '2027-09-07' })).toBe('a year')
  })

  it('says nothing when the dates are not both known', () => {
    expect(durationInWords({ periodStart: '2026-09-07' })).toBeUndefined()
    expect(durationInWords({})).toBeUndefined()
  })
})

describe('the two letters are different letters', () => {
  const base2 = { ...base, brief: BRIEF }
  const payer = buildScopeEmail({ ...base2, audience: 'payer', recipientName: 'Morgan Mercer', recipientTitle: 'Mr' } as never)
  const served = buildScopeEmail({ ...base2, audience: 'served', recipientName: 'Uche Amaonwu', recipientTitle: 'Mr' } as never)

  it('open with a proper salutation', () => {
    expect(payer.html).toContain('Dear Mr Morgan Mercer,')
    expect(served.html).toContain('Dear Mr Uche Amaonwu,')
  })

  it('do not read the contract back to the people who wrote it', () => {
    // They sent the ToR and the purchase order. Restating the deliverables,
    // the charge code or the period as news wastes the only paragraph that
    // gets read properly.
    for (const m of [payer, served]) {
      expect(m.html).not.toContain('What it produces')
      expect(m.html).not.toContain('Who is who')
      expect(m.html).not.toContain('7 September 2026 to 15 March 2027')
    }
  })

  it('the payer letter is about oversight, not about doing the work', () => {
    expect(payer.html).toMatch(/read only/)
    expect(payer.html).toMatch(/Add as many of your team as you like/)
    expect(payer.html).toMatch(/An invitation to any remote working session/)
    expect(payer.html).not.toMatch(/needs you personally, not a delegate/)
  })

  it('the served letter asks for the chief executive in the room', () => {
    expect(served.html).toMatch(/<b>It needs you personally, not a delegate\.<\/b>/)
    expect(served.html).toMatch(/nine decisions/i)
    expect(served.html).toMatch(/without evidence recorded behind it/)
    expect(served.html).toMatch(/does not move past a decision until you are satisfied/)
    expect(served.html).toMatch(/tested with real paying clients/)
  })

  it('both offer access today, at the front door', () => {
    for (const m of [payer, served]) {
      expect(m.html).toContain('https://habibonifade.com')
      expect(m.html).toMatch(/Clearview sign in/)
      expect(m.html).toMatch(/temporary password/)
    }
  })

  it('sign off without printing their own markup', () => {
    for (const m of [payer, served]) {
      expect(m.html).toContain('Lead Practitioner, The Canvas Coach')
      expect(m.html).not.toContain('&lt;br/&gt;')
      expect(m.html).not.toContain('&lt;span')
    }
  })

  it('escape a brief somebody typed markup into', () => {
    const nasty = buildScopeEmail({
      ...base, audience: 'served', brief: { ...BRIEF, payerName: '<script>x</script>' },
    } as never)
    expect(nasty.html).not.toContain('<script>x</script>')
  })

  it('still read as letters with no brief at all', () => {
    for (const aud of ['payer', 'served']) {
      const bare = buildScopeEmail({ ...base, audience: aud } as never)
      expect(bare.html).not.toContain('undefined')
      expect(bare.html).toContain('Dear colleague,')
    }
  })

  it('open in Habib\'s own words when he has written any', () => {
    const own = buildScopeEmail({
      ...base2, audience: 'served', brief: { ...BRIEF, welcomeIntro: 'Delighted to be starting this with you both.' },
    } as never)
    expect(own.html).toContain('Delighted to be starting this with you both.')
    expect(own.html).not.toContain('I am glad to be working with you and your team.')
  })
})

describe('the access lists say different things', () => {
  it('cover every service the platform sells', () => {
    expect(SERVICE_TYPES).toHaveLength(4)
    for (const t of SERVICE_TYPES) expect(SERVICE_LABEL[t]).toBeTruthy()
  })
})
