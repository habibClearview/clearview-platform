import { describe, it, expect } from 'vitest'
import {
  briefFromConfig, briefIntoConfig, periodInWords, accessLines, openingSequence,
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
  services: ['canvas'] as const,
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

describe('the two audiences are told different things', () => {
  const served = buildScopeEmail({ ...base, brief: BRIEF, audience: 'served', recipientName: 'Uche' } as never)
  const payer = buildScopeEmail({ ...base, brief: BRIEF, audience: 'payer', recipientName: 'Morgan' } as never)

  it('names both organisations, and which is which, in both copies', () => {
    for (const m of [served, payer]) {
      expect(m.html).toContain('Tanager')
      expect(m.html).toContain('Ikore International Development Ltd')
      expect(m.html).toMatch(/commissioning and paying for this work/)
      expect(m.html).toMatch(/the work is delivered to/)
    }
  })

  it('gives the payer reports, read-only gates and comments', () => {
    expect(payer.html).toContain('read only')
    expect(payer.html).toMatch(/progress report at each Decision Point/i)
    expect(payer.html).toMatch(/invitation to join any remote one/i)
    // and does NOT tell them their ED signs the gates off
    expect(payer.html).not.toMatch(/Your Executive Director signs off/)
  })

  it('gives the served organisation the work', () => {
    expect(served.html).toMatch(/Your Executive Director signs off/)
    expect(served.html).toMatch(/Engagement Charter to read, comment on, and sign/)
  })

  it('does not call it the payer\'s platform in the payer\'s subject line', () => {
    expect(payer.subject).toBe('Ikore International Development Ltd: the engagement platform is ready')
    expect(served.subject).toBe('Ikore International Development Ltd: your engagement platform is ready')
  })

  it('leads with the pre-engagement meeting, because nothing starts without it', () => {
    const first = openingSequence(BRIEF)[0]
    expect(first).toMatch(/pre-engagement questions/)
    expect(first).toContain('Tanager')
    expect(first).toContain('Ikore International Development Ltd')
    expect(served.html).toMatch(/pre-engagement questions/)
    expect(payer.html).toMatch(/pre-engagement questions/)
  })

  it('names the service that was bought, and the period, and the reference', () => {
    expect(served.html).toContain(SERVICE_LABEL.canvas)
    expect(served.html).toContain('7 September 2026 to 15 March 2027')
    expect(served.html).toContain('Purchase Order 149')
  })

  it('lists what the ToR says it produces', () => {
    expect(served.html).toContain('Refined service bundles')
    expect(served.html).toContain('Pricing models')
  })

  it('opens in Habib\'s own words when he has written any', () => {
    const own = buildScopeEmail({
      ...base, audience: 'served',
      brief: { ...BRIEF, welcomeIntro: 'Delighted to be starting this with you both.' },
    } as never)
    expect(own.html).toContain('Delighted to be starting this with you both.')
    expect(own.html).not.toContain('I am glad to be working with you. This is the platform')
  })

  it('escapes a brief somebody typed markup into', () => {
    const nasty = buildScopeEmail({
      ...base, audience: 'served', brief: { ...BRIEF, payerName: '<script>x</script>' },
    } as never)
    expect(nasty.html).not.toContain('<script>x</script>')
  })

  it('still works with no brief at all', () => {
    const bare = buildScopeEmail({ ...base, audience: 'served' } as never)
    expect(bare.html).toContain(SERVICE_LABEL.canvas)
    expect(bare.html).not.toContain('undefined')
  })
})

describe('the access lists say different things', () => {
  it('do not overlap on the thing that separates them', () => {
    expect(accessLines('payer').join(' ')).toMatch(/read only/)
    expect(accessLines('served').join(' ')).not.toMatch(/read only/)
  })

  it('cover every service the platform sells', () => {
    expect(SERVICE_TYPES).toHaveLength(4)
    for (const t of SERVICE_TYPES) expect(SERVICE_LABEL[t]).toBeTruthy()
  })
})
