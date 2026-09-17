// ============================================================
// THE WORDS ON THE SCREENS, AND THE RULES THEY HAVE TO KEEP.
//
// Habib's rules for anything a funder reads: no dashes of any kind, plain
// English, and no mention of artificial intelligence anywhere. A rule nobody
// checks is a rule that lasts until the next edit, so it is checked here across
// every screen, in both modes.
//
// Also checked: a walkthrough for an engagement that has recorded nothing still
// reads as sentences rather than showing gaps where a name should be.
// ============================================================
import { describe, it, expect } from 'vitest'
import { buildSteps } from '@/lib/walkthrough/steps'
import { buildContext, GENERIC_CONTEXT, preparedLine, FALLBACK } from '@/lib/walkthrough/context'
import { speakerNotes } from '@/lib/walkthrough/notes'

const TANAGER = buildContext({
  funder: 'Tanager',
  org: 'Ikore',
  service: 'gender and nutrition service',
  programme: 'IGNITE+ Nigeria',
  market: 'African agricultural institutions',
  close: 'In March 2027',
  portfolio: 'the other organisations in IGNITE+',
  timeline: {
    start: '7 SEP 2026', middle: 'DEC 2026', end: '15 MAR 2027', span: 'Six months.',
    milestones: [
      { title: 'Inception', detail: 'Inception report.' },
      { title: 'Phase I', detail: 'Service bundles.' },
      { title: 'Phase II', detail: 'Go to market.' },
      { title: 'Final', detail: 'Handover pack.' },
    ],
  },
  workspaceUrl: 'https://clearview.habibonifade.com/engagement/ikore',
})

/** Every word either walkthrough puts on a screen, as one block of text. */
function allCopy(ctx: any): string {
  return buildSteps(ctx).map((s) => (s.kind === 'scene' ? s.scene!() : `${s.kicker}${s.title!.join(' ')}${s.html!()}`)).join('\n')
    + '\n' + speakerNotes(ctx).join('\n')
}

describe('the walkthrough copy keeps the house rules', () => {
  it('contains no dash of any kind, in either mode', () => {
    for (const ctx of [TANAGER, GENERIC_CONTEXT]) {
      const text = allCopy(ctx)
      // The em dash, the en dash, the horizontal bar and the minus sign. The
      // ordinary hyphen inside a word is not one of these.
      const found = text.match(/[—–―−]/g)
      expect(found, `found ${found?.join(' ')}`).toBeNull()
    }
  })

  it('never mentions artificial intelligence', () => {
    for (const ctx of [TANAGER, GENERIC_CONTEXT]) {
      const text = allCopy(ctx).toLowerCase()
      expect(text).not.toMatch(/\bartificial intelligence\b/)
      expect(text).not.toMatch(/\bmachine learning\b/)
      expect(text).not.toMatch(/(^|[^a-z])ai([^a-z]|$)/)
    }
  })
})

describe('an engagement that recorded nothing still reads as sentences', () => {
  it('falls back to the funder, the organisation and the service', () => {
    const bare = buildContext({})
    expect(bare.funder).toBe(FALLBACK.funder)
    expect(bare.org).toBe(FALLBACK.org)
    expect(bare.service).toBe(FALLBACK.service)
    expect(bare.close).toBe(FALLBACK.close)
    expect(bare.portfolio).toBe(FALLBACK.portfolio)
    expect(bare.named).toBe(false)
    const text = allCopy(bare)
    expect(text).not.toMatch(/\{\w+\}/)
    expect(text).not.toMatch(/undefined|null/)
  })

  it('the header says what it is when there is nobody to prepare it for', () => {
    expect(preparedLine('', '', '')).toBe(FALLBACK.prepared)
    expect(preparedLine('Tanager', 'Ikore', 'IGNITE+ Nigeria'))
      .toBe('Prepared for Tanager and Ikore · IGNITE+ Nigeria')
  })

  it('the service keeps its article with it, so nothing reads "the this service"', () => {
    const bare = buildContext({})
    expect(allCopy(bare)).not.toContain('the this service')
    expect(allCopy(TANAGER)).toContain('the gender and nutrition service')
  })
})

describe('what changes between the two modes', () => {
  it('a named engagement shows nineteen screens, and one with no dates eighteen', () => {
    expect(buildSteps(TANAGER)).toHaveLength(19)
    expect(buildSteps(GENERIC_CONTEXT)).toHaveLength(18)
    expect(buildSteps(TANAGER).map((s) => s.name)).toContain('Timeline')
    expect(buildSteps(GENERIC_CONTEXT).map((s) => s.name)).not.toContain('Timeline')
  })

  it('the generic reveal screen has the agreed headline and no button', () => {
    const steps = buildSteps(GENERIC_CONTEXT)
    const reveal = steps.find((s) => s.name === 'Live reveal')!.scene!()
    expect(reveal).toContain('Every decision, on the record.')
    expect(reveal).toContain('Open to the funder from day one.')
    expect(reveal).toContain('The funder signs in to the same record')
    expect(reveal).not.toContain('revealBtn')
  })

  it('the client reveal screen opens the workspace in a new tab', () => {
    const reveal = buildSteps(TANAGER).find((s) => s.name === 'Live reveal')!.scene!()
    expect(reveal).toContain('Open the Ikore workspace')
    expect(reveal).toContain('target="_blank"')
    expect(reveal).toContain('https://clearview.habibonifade.com/engagement/ikore')
  })

  it('the paying customer sentence is left out when nobody has named one', () => {
    const named = buildSteps(TANAGER).find((s) => s.name === 'Decision Point 2')!.html!()
    expect(named).toContain('African agricultural institutions')
    const bare = buildSteps(buildContext({ funder: 'Tanager', org: 'Ikore' }))
      .find((s) => s.name === 'Decision Point 2')!.html!()
    expect(bare).not.toContain('the paying customers are')
  })

  it('the holding screen carries the programme, and the generic one does not', () => {
    expect(buildSteps(TANAGER)[0].scene!()).toContain('IGNITE+ Nigeria')
    expect(buildSteps(TANAGER)[0].scene!()).toContain('Prepared for Tanager and Ikore.')
    expect(buildSteps(GENERIC_CONTEXT)[0].scene!()).toContain('How the work runs.')
  })
})

describe('a name is never allowed to be markup', () => {
  it('escapes anything typed into a setting', () => {
    const nasty = buildSteps(buildContext({ funder: '<script>x</script>', org: 'Ikore' }))
    expect(nasty[0].scene!()).not.toContain('<script>')
    expect(nasty[0].scene!()).toContain('&lt;script&gt;')
  })
})

describe('the speaker notes', () => {
  it('give one note per screen, in both modes', () => {
    expect(speakerNotes(TANAGER)).toHaveLength(buildSteps(TANAGER).length)
    expect(speakerNotes(GENERIC_CONTEXT)).toHaveLength(buildSteps(GENERIC_CONTEXT).length)
  })

  it('name the engagement in client mode and nobody in generic mode', () => {
    expect(speakerNotes(TANAGER)[1]).toContain('Tanager')
    expect(speakerNotes(GENERIC_CONTEXT).join(' ')).not.toContain('Tanager')
    expect(speakerNotes(GENERIC_CONTEXT).join(' ')).not.toContain('Ikore')
  })
})
