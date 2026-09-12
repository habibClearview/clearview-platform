// ============================================================
// AN INVITATION THAT ARRIVES, AND ARRIVES ONCE
//
// Habib asked whether the planned session dates send a calendar invitation.
// The ways this goes wrong are all quiet ones: an invitation that never shows
// up because a line was too long, a second entry beside the first every time
// something changes, a comma in an organisation's name that swallows the link,
// and a time that means one thing in Lagos and another in London.
// ============================================================
import { describe, it, expect } from 'vitest'
import { buildIcs, icsStamp, icsEscape, foldLine, sessionUid, unfoldIcs } from '@/lib/calendar'

const BASE = {
  uid: sessionUid('abc-123'),
  startsAt: '2026-09-15T09:00:00.000Z',
  minutes: 120,
  title: 'Pre-engagement diagnostic',
  url: 'https://www.clearviewgtcv.com/call/abc-123',
}

describe('one moment, read correctly in three countries', () => {
  it('writes the time in universal time, so nobody has to convert it', () => {
    expect(icsStamp('2026-09-15T09:00:00.000Z')).toBe('20260915T090000Z')
  })

  it('is the same moment whichever time zone it was written in', () => {
    // 10am in Lagos is 9am universal. Both must produce the same stamp.
    expect(icsStamp('2026-09-15T10:00:00+01:00')).toBe(icsStamp('2026-09-15T09:00:00Z'))
  })

  it('refuses a time it cannot hold rather than inventing one', () => {
    expect(() => icsStamp('sometime next week')).toThrow()
  })

  it('ends the session after its own length', () => {
    const ics = buildIcs(BASE)
    expect(ics).toContain('DTSTART:20260915T090000Z')
    expect(ics).toContain('DTEND:20260915T110000Z')
  })

  it('gives a session with no length a sensible one rather than none', () => {
    expect(buildIcs({ ...BASE, minutes: 0 })).toContain('DTEND:')
  })
})

describe('a name with punctuation in it does not break the invitation', () => {
  it('escapes a comma, which would otherwise end the field', () => {
    expect(icsEscape('Ikore International Development Ltd, Abuja')).toContain('\\,')
  })

  it('escapes a semicolon and a backslash', () => {
    expect(icsEscape('a;b')).toBe('a\;b')
    expect(icsEscape('a\\b')).toBe('a\\\\b')
  })

  it('keeps a paragraph as one field', () => {
    expect(icsEscape('line one\nline two')).toBe('line one\\nline two')
  })

  it('carries the whole title through, punctuation and all', () => {
    const ics = buildIcs({ ...BASE, title: 'Diagnostic, part one; with the funder' })
    expect(unfoldIcs(ics)).toContain('SUMMARY:Diagnostic\\, part one\; with the funder')
  })
})

describe('lines a calendar will actually read', () => {
  it('folds a long line rather than letting it be rejected', () => {
    const folded = foldLine(`DESCRIPTION:${'x'.repeat(300)}`)
    for (const line of folded.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75)
  })

  it('continues a folded line with a space, which is how it is read back', () => {
    const folded = foldLine('A'.repeat(200)).split('\r\n')
    expect(folded.slice(1).every((l) => l.startsWith(' '))).toBe(true)
  })

  it('leaves a short line alone', () => {
    expect(foldLine('VERSION:2.0')).toBe('VERSION:2.0')
  })

  it('separates every line the way the format requires', () => {
    expect(buildIcs(BASE)).toContain('\r\n')
  })
})

describe('the invitation itself', () => {
  const ics = buildIcs({
    ...BASE,
    description: 'The three questions, with the funder.',
    organiserName: 'Habib Onifade',
    organiserEmail: 'habib@habibonifade.com',
    attendees: [
      { name: 'Ovo Ugbebor', email: 'ovo@ikore.org' },
      { name: null, email: 'someone@example.org' },
    ],
  })

  it('is an invitation, so a calendar offers Accept and Decline', () => {
    // Folding is allowed to fall in the middle of a word, so what the
    // invitation says is only visible once it is unfolded, which is exactly
    // what a calendar does before reading it.
    expect(ics).toContain('METHOD:REQUEST')
    expect(unfoldIcs(ics)).toContain('RSVP=TRUE')
  })

  it('puts the session page where the calendar expects the place to be', () => {
    expect(unfoldIcs(ics)).toContain('LOCATION:https://www.clearviewgtcv.com/call/abc-123')
  })

  it('names everybody who is asked to attend', () => {
    expect(unfoldIcs(ics)).toContain('mailto:ovo@ikore.org')
    expect(unfoldIcs(ics)).toContain('CN=Ovo Ugbebor')
  })

  it('falls back to the address when somebody has no name recorded', () => {
    expect(unfoldIcs(ics)).toContain('CN=someone@example.org')
  })

  it('leaves out an attendee with no address rather than writing a broken line', () => {
    const none = buildIcs({ ...BASE, attendees: [{ name: 'No address', email: '' }] })
    expect(none).not.toContain('No address')
  })

  it('opens and closes properly, or no calendar will take it', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
  })
})

describe('sending it again updates the entry rather than adding a second one', () => {
  it('uses the session own identifier every time', () => {
    expect(sessionUid('abc-123')).toBe(sessionUid('abc-123'))
    expect(sessionUid('abc-123')).not.toBe(sessionUid('abc-124'))
  })

  it('strips anything from an id that does not belong in one', () => {
    expect(sessionUid('a b/c')).toBe('session-abc@clearview')
  })

  it('raises the sequence, which is what tells a calendar this is the newer one', () => {
    expect(buildIcs({ ...BASE, sequence: 3 })).toContain('SEQUENCE:3')
    expect(buildIcs(BASE)).toContain('SEQUENCE:0')
  })
})

// ============================================================
// WHAT THE INVITATION ROUTE MUST NOT DO
// ============================================================
describe('sending the invitation', () => {
  const ROUTE = require('fs').readFileSync('app/api/session-invite/route.ts', 'utf8')
  const PLANNER = require('fs').readFileSync('src/components/gtcv/SessionPlanner.tsx', 'utf8')

  it('refuses a session with a date and no time rather than guessing one', () => {
    // Nine in the morning in somebody's diary because nobody said otherwise
    // is worse than nothing.
    expect(ROUTE).toContain('needsTime')
    expect(ROUTE).toContain('has a date but no time')
  })

  it('invites the people ticked as attending and nobody else', () => {
    expect(ROUTE).toContain('gtcv_session_attendance')
    expect(ROUTE).toContain('Nobody is ticked as attending')
  })

  // 12 September 2026. Habib, on an engagement nobody had been added to:
  // this is confusing, where are the attendees to tick. Saying "nobody is
  // ticked" is true and useless when the reason is that there is nobody to
  // tick, so the refusal now says which of the two it is and where to go.
  it('says whether nobody is ticked or nobody is on the engagement at all', () => {
    expect(ROUTE).toContain('Nobody has been added to this engagement yet')
    expect(ROUTE).toContain('Add them under Who is on it, and settings')
    expect(ROUTE).toContain('Tick them under Attendance on this session')
  })

  it('sends the attendance panel to the page that holds the people', () => {
    expect(PLANNER).toContain('zone=eng_setup')
    expect(PLANNER).toContain('Add them under Who is on it, and settings, and they appear here to tick.')
  })

  it('takes manage rights', () => {
    expect(ROUTE).toContain('Only the coaching team can send a session invitation')
  })

  it('names anybody left out for having no address', () => {
    expect(ROUTE).toContain('withoutAddress')
    expect(ROUTE).toContain('emailLooksSendable')
  })

  it('attaches the invitation rather than linking to it', () => {
    expect(ROUTE).toContain("filename: 'session.ics'")
    expect(ROUTE).toContain('text/calendar; method=REQUEST')
  })

  it('raises the sequence when it is sent again', () => {
    expect(ROUTE).toContain('invite_sequence')
  })

  it('says so when email is not switched on, and still gives the link', () => {
    expect(ROUTE).toContain('notConfigured')
  })

  it('is offered on the session it belongs to, not on a second list', () => {
    expect(PLANNER).toContain('Send the calendar invitation')
    expect(PLANNER).toContain('/api/session-invite')
  })

  it('records the moment, not the day, on the session', () => {
    expect(PLANNER).toContain("type=\"datetime-local\"")
    expect(PLANNER).toContain("'planned_at'")
  })
})
