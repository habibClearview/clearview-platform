// ============================================================
// THE LINK, THE DATES AND THE MILESTONES.
//
// Three things that are easy to get quietly wrong and impossible to notice on
// a screen: a link that only works on the machine it was copied on, a contract
// date that moves a day when the server is not in Nairobi, and a timeline built
// from deliverables that have no milestone against them.
// ============================================================
import { describe, it, expect } from 'vitest'
import { slugify, PUBLIC_SITE } from '@/lib/walkthrough/links'
import { axisDate, spanLabel, middleLabel, milestonesFrom } from '@/lib/walkthrough/loader'

describe('the end of the address', () => {
  it('is lower case letters, numbers and hyphens, whatever is typed', () => {
    expect(slugify('Tanager')).toBe('tanager')
    expect(slugify('IGNITE+ Nigeria')).toBe('ignite-nigeria')
    expect(slugify('  Ikore Integrated  ')).toBe('ikore-integrated')
    expect(slugify('Tanager!!!')).toBe('tanager')
    expect(slugify('')).toBe('')
  })

  it('never ends in a hyphen, however long the name is', () => {
    const long = slugify('a'.repeat(70) + ' something')
    expect(long.endsWith('-')).toBe(false)
    expect(long.length).toBeLessThanOrEqual(64)
  })

  it('the public site is the address a funder would type', () => {
    expect(PUBLIC_SITE).toBe('https://habibonifade.com')
  })
})

describe('a contract date is the day it says', () => {
  it('reads a date as the calendar day, not as a moment in London', () => {
    // A date-only value read as a moment is midnight UTC, which is the day
    // before in the Americas and can be the day after further east. A contract
    // that starts on 1 March must not print as 28 February anywhere.
    expect(axisDate('2026-03-01')).toBe('1 MAR 2026')
    expect(axisDate('2026-09-07')).toBe('7 SEP 2026')
    expect(axisDate('2027-03-15')).toBe('15 MAR 2027')
  })

  it('says nothing when there is no date, rather than guessing', () => {
    expect(axisDate('')).toBeNull()
    expect(axisDate(null)).toBeNull()
    expect(axisDate('not a date')).toBeNull()
  })

  it('names the middle month and how long it runs', () => {
    expect(middleLabel('2026-09-07', '2027-03-15')).toBe('DEC 2026')
    expect(spanLabel('2026-09-07', '2027-03-15')).toBe('Six months.')
    expect(spanLabel('2026-01-01', '2027-12-31')).toBe('Two years.')
  })
})

describe('the timeline is built from the deliverables already recorded', () => {
  it('groups the deliverables under their payment milestone, in order', () => {
    const out = milestonesFrom([
      { milestone_no: 2, milestone_label: 'Phase I', title: 'Service bundles' },
      { milestone_no: 1, milestone_label: 'Inception', title: 'Inception report' },
      { milestone_no: 1, milestone_label: 'Inception', title: 'Workplan' },
    ])
    expect(out.map((m) => m.title)).toEqual(['Inception', 'Phase I'])
    expect(out[0].detail).toBe('Inception report, Workplan.')
  })

  it('leaves out a deliverable with no milestone against it', () => {
    const out = milestonesFrom([
      { milestone_no: null, title: 'Something nobody grouped' },
      { milestone_no: 1, milestone_label: 'Inception', title: 'Inception report' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Inception')
  })

  it('gives nothing when the engagement has no deliverables', () => {
    expect(milestonesFrom([])).toEqual([])
  })
})
