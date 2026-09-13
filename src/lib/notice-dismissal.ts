// Setting aside a notice on the coach's own screens, and bringing it back
// when the thing behind it changes. 14 September 2026.
//
// Habib: I should be able to dismiss or set aside any flag.
//
// A client health flag already had this, stored on the client row and
// compared against the date of the health check behind it, so a new check
// brings the flag straight back. The notices on My Business -- new data
// capture submissions, timesheets waiting to be approved -- had no way to be
// set aside at all, and a notice that cannot be put down stops being read.
//
// Those two are not about one record, they are about a SET of records, and
// the set changes. Storing "dismissed at 10:04" would be no use on its own:
// a submission that arrives at 10:05 has to bring the notice back, and the
// tables behind these notices do not all carry a reliable arrival time to
// compare against (timesheets is an older table than the coach's own).
//
// So what is stored is which records were set aside, as a short fingerprint
// of their ids. The notice stays down while the set is exactly the one the
// coach looked at, and comes back the moment anything joins or leaves it.
//
// Nothing here touches the browser. The fingerprint is written to the
// database, so the coach sees the same screen on their phone as on their
// laptop, and nothing about the practice is left sitting in local storage.

/** djb2, the small string hash. Only ever compared against another
 *  fingerprint of the same list -- never used for anything secret. */
function hash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = (((h << 5) + h) ^ text.charCodeAt(i)) >>> 0
  return h.toString(36)
}

// The ids are joined on a character that cannot appear inside one, so two
// different sets can never flatten to the same string.
const JOIN = String.fromCharCode(0)

/** A short, stable stand-in for exactly this set of records. Order of the
 *  ids passed in never matters; membership always does. */
export function noticeFingerprint(ids: string[]): string {
  const clean = Array.from(new Set(ids.map(id => String(id)))).sort()
  return `${clean.length}:${hash(clean.join(JOIN))}`
}

export interface NoticeDismissal { notice_key: string; covers?: string | null }

/** True while the coach has set this exact set of records aside. One more
 *  record, or one fewer, and the notice is shown again. */
export function noticeIsSetAside(dismissal: NoticeDismissal | null | undefined, ids: string[]): boolean {
  if (!dismissal || !dismissal.covers) return false
  return dismissal.covers === noticeFingerprint(ids)
}

/** The notices the coach can set aside, named once so a screen and a stored
 *  row can never drift apart over a spelling. */
export const NOTICE_NEW_SUBMISSIONS = 'new_intake_submissions'
export const NOTICE_TIMESHEETS_AWAITING = 'timesheets_awaiting_approval'
