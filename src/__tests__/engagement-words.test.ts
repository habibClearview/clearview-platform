// ============================================================
// THE THREE QUESTIONS, WITH THIS ENGAGEMENT'S OWN WORDS IN THEM
//
// Habib, 17 September 2026, replacing the Three Questions. Two of the three
// name something that varies by engagement: the service being commercialised,
// and the funder. The old questions said "your organisation" and "grant
// funding" and were answered as generally as they were asked.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  serviceWord, servicePhrase, funderWord, threeQuestions, SERVICE_FALLBACK,
  THREE_QUESTIONS_INTRO, VERBATIM_HELPER, ANSWER_PLACEHOLDER,
} from '@/lib/engagement-words'

const programmes = [{ id: 'prog_1', funder: 'Tanager' }, { id: 'prog_2', funder: '  ' }]

describe('the service this engagement commercialises', () => {
  it('is used exactly as it was typed', () => {
    expect(serviceWord({ commercialised_service: 'gender and nutrition service' }))
      .toBe('gender and nutrition service')
  })

  it('falls back to "this service" rather than leaving a hole', () => {
    expect(serviceWord({ commercialised_service: '' })).toBe(SERVICE_FALLBACK)
    expect(serviceWord({ commercialised_service: '   ' })).toBe(SERVICE_FALLBACK)
    expect(serviceWord(null)).toBe(SERVICE_FALLBACK)
    expect(serviceWord(undefined)).toBe(SERVICE_FALLBACK)
  })
})

describe('the funder', () => {
  it('comes from the programme the engagement sits under', () => {
    // Ikore's funder is reached through Ignite. Asked whether to add a second
    // funder field on the engagement, Habib said to leave it as it is.
    expect(funderWord({ programme_id: 'prog_1' }, programmes)).toBe('Tanager')
  })

  it('is empty for an engagement with no programme behind it', () => {
    expect(funderWord({ programme_id: null }, programmes)).toBe('')
    expect(funderWord({}, programmes)).toBe('')
  })

  it('is empty when the programme names no funder', () => {
    expect(funderWord({ programme_id: 'prog_2' }, programmes)).toBe('')
    expect(funderWord({ programme_id: 'gone' }, programmes)).toBe('')
    expect(funderWord({ programme_id: 'prog_1' }, null)).toBe('')
  })
})

describe('the three questions', () => {
  const named = threeQuestions('the gender and nutrition service', 'Tanager')

  it('names the service in the first one, so it is answered about the service', () => {
    expect(named[0]).toBe(
      'In 18 months, what would the gender and nutrition service need to be earning, and from whom, for you to call it a success?',
    )
  })

  it('asks the second one the same way for everybody', () => {
    expect(named[1]).toBe('What do you believe is stopping this service from earning that revenue today?')
  })

  it('names the funder in the third one', () => {
    expect(named[2]).toBe("What would have to be true for this service to run without Tanager's support?")
  })

  it('asks a different third question when there is no funder, not the same one with a hole in it', () => {
    // A question with a blank where a name should be reads as a mistake, and
    // the person answering stops to wonder what was meant.
    const unfunded = threeQuestions('this service', '')
    expect(unfunded[2]).toBe('What would have to be true for this service to run without grant support?')
    expect(unfunded[2]).not.toContain("'s support")
  })

  it('is always three, in the method order', () => {
    expect(named).toHaveLength(3)
    expect(threeQuestions(SERVICE_FALLBACK, '')).toHaveLength(3)
  })

  it('reads correctly whether or not the service has a name', () => {
    // The article travels with the name. Written the other way these would be
    // "the this service" and "what would gender and nutrition service need".
    expect(servicePhrase({ commercialised_service: 'gender and nutrition service' }))
      .toBe('the gender and nutrition service')
    expect(servicePhrase({ commercialised_service: '' })).toBe('this service')
    expect(threeQuestions(servicePhrase({ commercialised_service: '' }), '')[0])
      .toBe('In 18 months, what would this service need to be earning, and from whom, for you to call it a success?')
  })

  it('carries no dash in any of the words the platform supplies', () => {
    // Habib's standing rule for client-facing copy.
    const copy = [...named, ...threeQuestions('this service', ''),
      THREE_QUESTIONS_INTRO, VERBATIM_HELPER, ANSWER_PLACEHOLDER].join(' ')
    expect(copy).not.toMatch(/[—–]/)
  })
})
