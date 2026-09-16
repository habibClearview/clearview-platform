// ============================================================
// WHEN A SESSION IS, AND WHICH ONE IS NEXT
//
// Pulled out of the sessions strip so it can be run rather than read. The
// component imports the Supabase client, which cannot be constructed without
// credentials, so anything left inside it could only ever be tested by
// searching its source for the right words. These two are the parts that were
// actually wrong, so they are the parts that had to be testable.
//
// No React and no Supabase here, and nothing that reads a clock except the
// "now" a caller passes in.
// ============================================================

export interface SessionTiming {
  status?: string | null
  /** The exact moment, where one was given. */
  planned_at?: string | null
  /** A calendar day with no time, which is how a diary entry often starts. */
  planned_date?: string | null
}

// A DATE WITH NO TIME IS A DAY, NOT MIDNIGHT IN GREENWICH. CodeRabbit on #276.
// new Date('2026-09-17') is parsed as UTC midnight, so anybody west of
// Greenwich reads it as the day before: a session planned for Thursday shows
// as Wednesday in Nairobi's morning and in every American timezone all day.
// A date-only session is a calendar day in the reader's own calendar.
function sessionMoment(session: SessionTiming | null | undefined): { at: Date; timed: boolean } | null {
  if (session?.planned_at) {
    const at = new Date(session.planned_at)
    if (!Number.isNaN(at.getTime())) return { at, timed: true }
  }
  const day = String(session?.planned_date || '')
  const parts = day.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (parts) {
    const at = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
    if (!Number.isNaN(at.getTime())) return { at, timed: false }
  }
  return null
}

/** When a session is, in the words somebody would say out loud. */
export function whenText(session: SessionTiming | null | undefined): string {
  const when = sessionMoment(session)
  if (!when) return 'No time set'
  return when.at.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(when.timed ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

/** The next session still to come, or null. Held and cancelled ones are
 *  behind us whatever their date says.
 *
 *  A SESSION WITH A DAY BUT NO TIME IS STILL COMING. CodeRabbit on #276: this
 *  required planned_at, so a session somebody put in the diary as a date was
 *  left out of "next" entirely and the strip read as though nothing were
 *  planned. Its day runs to the end of that day, because a session at some
 *  point on Thursday has not been missed at nine on Thursday morning. */
export function nextSession<S extends SessionTiming>(sessions: S[] | null | undefined, now: Date = new Date()): S | null {
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
  const upcoming = (sessions || [])
    .map(s => ({ s, when: sessionMoment(s) }))
    .filter(({ s, when }) => s.status === 'planned' && !!when
      && (when.timed ? when.at >= now : endOfDay(when.at) >= now))
    .sort((a, b) => a.when!.at.getTime() - b.when!.at.getTime())
  return upcoming[0]?.s || null
}
