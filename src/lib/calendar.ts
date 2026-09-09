// ============================================================
// THE CALENDAR INVITATION
//
// Habib asked whether the planned session dates send a calendar invitation.
// They did not. This is what makes one, in the format every calendar reads,
// written here rather than fetched from a service so that nothing about an
// engagement's schedule leaves for a third party to format it.
//
// WHY ONE ABSOLUTE MOMENT AND NOT A LOCAL TIME. An engagement runs across
// Nigeria, Kenya and the United Kingdom. Nine in the morning is three
// different moments in those three places, and the difference is a missed
// session. The invitation carries the moment in universal time and every
// person's calendar shows it in their own, which is the one arrangement that
// cannot be misread.
//
// WHY THE LINK IS THE LOCATION. The session is held on the platform, so the
// place the session happens is the session's own page. Putting it in the
// location field is what makes the calendar entry a thing you press at the
// right moment rather than a reminder to go and find the link.
//
// No network and no database here, so all of it is tested.
// ============================================================

export interface CalendarEvent {
  /** Stable for the life of the session, so an update replaces rather than duplicates. */
  uid: string
  startsAt: string
  minutes: number
  title: string
  description?: string
  /** The session's own page. */
  url?: string
  organiserName?: string
  organiserEmail?: string
  attendees?: { name?: string | null; email: string }[]
  /** Raised each time the invitation is sent again, so calendars take the newer one. */
  sequence?: number
}

/** A moment as a calendar writes it: 20260315T090000Z. */
export function icsStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) throw new Error('That is not a time a calendar can hold')
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}`
    + `T${two(d.getUTCHours())}${two(d.getUTCMinutes())}${two(d.getUTCSeconds())}Z`
}

/**
 * Text as a calendar file may carry it.
 *
 * A comma or a semicolon in an organisation's name ends a field early and the
 * rest of the invitation is read as something else, which is how an invitation
 * arrives with half a title and no link.
 */
export function icsEscape(text: string): string {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Lines no longer than a calendar file allows.
 *
 * The format sets a limit of 75 octets a line and a line over it is rejected
 * outright by some calendars, which is a session that silently never appears.
 * A continued line begins with one space.
 */
export function foldLine(line: string): string {
  const limit = 74
  if (line.length <= limit) return line
  const parts: string[] = [line.slice(0, limit)]
  let rest = line.slice(limit)
  while (rest.length > limit - 1) {
    parts.push(` ${rest.slice(0, limit - 1)}`)
    rest = rest.slice(limit - 1)
  }
  if (rest.length) parts.push(` ${rest}`)
  return parts.join('\r\n')
}

/**
 * The reverse of folding, which is how a calendar reads the file back.
 *
 * Folding is allowed to fall anywhere, including in the middle of a word, so
 * anything that wants to look at what an invitation actually says has to
 * unfold it first. Used by the tests, and by anything that ever has to read an
 * invitation rather than write one.
 */
export function unfoldIcs(ics: string): string {
  return String(ics).replace(/\r\n[ \t]/g, '')
}

/** The invitation itself. */
export function buildIcs(event: CalendarEvent): string {
  const start = new Date(event.startsAt)
  const end = new Date(start.getTime() + Math.max(15, event.minutes || 60) * 60_000)

  const description = [event.description, event.url ? `Join here: ${event.url}` : '']
    .filter(Boolean).join('\n\n')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Clearview//Engagement sessions//EN',
    'CALSCALE:GREGORIAN',
    // An invitation rather than a copy of somebody's diary, which is what
    // makes a calendar offer Accept and Decline.
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${icsStamp(start.toISOString())}`,
    `DTEND:${icsStamp(end.toISOString())}`,
    `SEQUENCE:${Math.max(0, Math.trunc(event.sequence ?? 0))}`,
    'STATUS:CONFIRMED',
    `SUMMARY:${icsEscape(event.title)}`,
    ...(description ? [`DESCRIPTION:${icsEscape(description)}`] : []),
    ...(event.url ? [`LOCATION:${icsEscape(event.url)}`, `URL:${icsEscape(event.url)}`] : []),
    ...(event.organiserEmail
      ? [`ORGANIZER;CN=${icsEscape(event.organiserName || event.organiserEmail)}:mailto:${event.organiserEmail}`]
      : []),
    ...(event.attendees || []).filter((a) => a.email).map((a) =>
      `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE`
      + `;CN=${icsEscape(a.name || a.email)}:mailto:${a.email}`),
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.map(foldLine).join('\r\n')
}

/**
 * The identifier a calendar uses to recognise this session again.
 *
 * Built from the session's own id, so sending the invitation a second time
 * after a change updates the entry already in somebody's calendar rather than
 * putting a second one beside it.
 */
export function sessionUid(sessionId: string): string {
  return `session-${String(sessionId).replace(/[^A-Za-z0-9-]/g, '')}@clearview`
}
