import { describe, it, expect } from 'vitest'
import fs from 'fs'
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
    expect(payer.html).toMatch(/read only form/)
    expect(payer.html).toMatch(/Add as many of your team to the platform as you require/)
    expect(payer.html).toMatch(/invitation to any remote working session/)
    expect(payer.html).not.toMatch(/attendance in person is required/)
  })

  it('the served letter asks for the chief executive in the room', () => {
    expect(served.html).toMatch(/Your attendance in person is required/)
    expect(served.html).toMatch(/nine decisions belong to the person who carries the organisation/)
    expect(served.html).toMatch(/tested with paying clients/)
  })

  it('both offer access today, at the front door', () => {
    for (const m of [payer, served]) {
      expect(m.html).toMatch(/habibonifade\.com/)
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

describe('the voice the letters are written in', () => {
  const both = [
    buildScopeEmail({ ...base, brief: BRIEF, audience: 'payer', recipientName: 'Morgan Mercer', recipientTitle: 'Mr' } as never),
    buildScopeEmail({ ...base, brief: BRIEF, audience: 'served', recipientName: 'Uche Amaonwu', recipientTitle: 'Mr' } as never),
  ]

  it('use no dashes in the prose', () => {
    for (const m of both) {
      const prose = m.html.replace(/<[^>]+>/g, ' ')
      expect(prose).not.toMatch(/[\u2014\u2013]/)
      expect(prose).not.toMatch(/\s-\s/)
    }
  })

  it('never use the "not X but Y" construction', () => {
    for (const m of both) {
      const prose = m.html.replace(/<[^>]+>/g, ' ')
      expect(prose).not.toMatch(/\brather than\b/i)
      expect(prose).not.toMatch(/\bnot\b[^.]{0,40}\bbut\b/i)
    }
  })

  it('tie the nine decisions to the canvas, in the same words in both', () => {
    for (const m of both) {
      expect(m.html).toMatch(/nine sequential decision points/)
      expect(m.html).toMatch(/internal and external commercial evidence has been collected and judged/)
    }
  })

  it('name the Engagement Charter', () => {
    for (const m of both) expect(m.html).toMatch(/Engagement Charter/)
  })
})

describe('the letter can be rewritten', () => {
  it('an edited letter is the letter that is sent', () => {
    const edited = '# My own heading\n\nMy own words entirely.\n\n- one\n- two'
    const m = buildScopeEmail({ ...base, audience: 'served', brief: { ...BRIEF, letterServed: edited } } as never)
    expect(m.html).toContain('<b>My own heading</b>')
    expect(m.html).toContain('My own words entirely.')
    expect(m.html).toContain('<li style="margin:0 0 7px;">one</li>')
    // and none of the generated wording survives
    expect(m.html).not.toMatch(/nine sequential decision points/)
  })

  it('the payer edit does not leak into the served letter', () => {
    const m = buildScopeEmail({ ...base, audience: 'served', brief: { ...BRIEF, letterPayer: 'PAYER ONLY' } } as never)
    expect(m.html).not.toContain('PAYER ONLY')
  })

  it('an empty edit falls back to the generated letter', () => {
    const m = buildScopeEmail({ ...base, audience: 'served', brief: { ...BRIEF, letterServed: '   ' } } as never)
    expect(m.html).toMatch(/nine sequential decision points/)
  })

  it('a letter someone typed markup into is still text', () => {
    const m = buildScopeEmail({ ...base, audience: 'served', brief: { ...BRIEF, letterServed: '<script>x</script>' } } as never)
    expect(m.html).not.toContain('<script>x</script>')
  })
})

describe('everyone gets it, by name, at the same time', () => {
  const ROUTE3 = fs.readFileSync('app/api/engagement-email/route.ts', 'utf8')
  const PACK2 = fs.readFileSync('src/components/gtcv/WelcomePack.tsx', 'utf8')

  it('sends one letter per person, never a To or CC line', () => {
    // A shared To line puts one salutation and one sign-in link in front of
    // everybody, and shows each recipient the whole list.
    expect(ROUTE3).toContain('for (const person of list)')
    expect(ROUTE3).toContain('sendEmail({ to: person.email')
    expect(ROUTE3).toContain('audience: person.audience')
    expect(ROUTE3).toContain('recipientName: person.name')
  })

  it('lets a funder lead and a served CEO get different letters in one send', () => {
    expect(ROUTE3).toContain("audience: person.audience")
    expect(PACK2).toContain('Paying client letter')
    expect(PACK2).toContain('Served client letter')
  })

  it('names the addresses it could not do rather than counting them as sent', () => {
    expect(ROUTE3).toContain('sentTo, failed')
  })

  it('keeps a recipient list on the brief, deduplicated', () => {
    const brief = briefFromConfig({ brief: { recipients: [
      { email: 'A@x.org', name: 'One', audience: 'payer' },
      { email: 'a@x.org', name: 'Duplicate', audience: 'served' },
      { email: 'no-at-sign', name: 'Bad' },
      { name: 'No address' },
    ] } })
    expect(brief.recipients).toHaveLength(1)
    expect(brief.recipients?.[0].email).toBe('a@x.org')
    expect(brief.recipients?.[0].audience).toBe('payer')
  })

  it('defaults an unknown audience to the served letter', () => {
    const brief = briefFromConfig({ brief: { recipients: [{ email: 'x@y.org', audience: 'nonsense' }] } })
    expect(brief.recipients?.[0].audience).toBe('served')
  })
})

describe('the preview is visible', () => {
  const PACK3 = fs.readFileSync('src/components/gtcv/WelcomePack.tsx', 'utf8')

  it('is not an iframe the app own security headers refuse', () => {
    // frame-ancestors none and default-src self meant the browser drew
    // "refused to connect" where the letter should have been.
    expect(PACK3).not.toContain('srcDoc')
    expect(PACK3).toContain('dangerouslySetInnerHTML={{ __html: emailPreview.html }}')
  })
})
