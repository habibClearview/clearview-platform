// ============================================================
// THE FIELD PHONE FORGETS WHAT IT DOES NOT NEED
//
// The field capture tool is used in a market with no signal, so it has to hold
// enough on the phone to record a sale: the price list, the cost lines, the
// customers, the segments, the staff, the operator's own name and phone, and
// the client and unit they are recording for. That is real client business and
// personal data sitting in a browser, reachable by anybody holding the phone
// unlocked, and Habib asked for it to be removed with no new friction.
//
// It cannot be removed outright. Without it the app cannot be used where it is
// meant to be used, and a field tool that needs a connection is not a field
// tool. So it is kept for as long as the work lasts and dropped after that.
//
// WHY THIS COSTS NOTHING WHEN THERE IS A CONNECTION. The page asks the server
// for a fresh copy every time it opens, so an expired one is replaced before
// anybody sees a screen. The only moment expiry is felt is opening the app
// offline after a day away, and then the message says what to do and makes
// clear that nothing recorded has been lost.
//
// WHAT IS NEVER TOUCHED. The queue of sales and costs that have been typed and
// not yet accepted by the server. That is somebody's work and it is not this
// file's business. It lives in IndexedDB, is drained on the next connection,
// and survives everything here.
// ============================================================

/**
 * How long the phone may keep the snapshot without hearing from the server.
 *
 * A working day and the night after it. Long enough that a market day with no
 * signal from start to finish never hits it, short enough that a phone put
 * down on Friday is clear by Saturday. Every successful sign-in resets it, and
 * that happens on every page load with a connection.
 */
export const FIELD_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000

/** The snapshot as it is written to the phone: the data, and when it arrived. */
export interface StoredSnapshot<T> {
  savedAt: number
  data: T
}

/** Wrap a fresh snapshot for storage. */
export function wrapSnapshot<T>(data: T, now: number = Date.now()): string {
  return JSON.stringify({ savedAt: now, data } satisfies StoredSnapshot<T>)
}

export type SnapshotRead<T> =
  | { data: T; expired: false }
  /** Nothing usable. `expired` says whether it was ours and too old, which is
   *  the only case worth explaining to the person holding the phone. */
  | { data: null; expired: boolean }

/**
 * Read a stored snapshot, refusing anything older than the allowance.
 *
 * Unreadable, unwrapped and future-dated values are all treated as nothing
 * rather than as an error. A phone whose clock is wrong is not a reason to
 * refuse to work, and an older build wrote the snapshot without a timestamp:
 * that shape is deliberately not accepted, so the first run after this change
 * drops what was already there rather than keeping it forever.
 */
export function readSnapshot<T>(
  raw: string | null | undefined,
  now: number = Date.now(),
  ttl: number = FIELD_SNAPSHOT_TTL_MS,
): SnapshotRead<T> {
  if (!raw) return { data: null, expired: false }
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return { data: null, expired: false } }
  if (!parsed || typeof parsed !== 'object') return { data: null, expired: false }
  const held = parsed as Partial<StoredSnapshot<T>>
  if (typeof held.savedAt !== 'number' || !Number.isFinite(held.savedAt)) {
    // The old unwrapped shape, or something else entirely. Not kept.
    return { data: null, expired: false }
  }
  if (held.data === undefined || held.data === null) return { data: null, expired: false }
  const age = now - held.savedAt
  // A snapshot from the future means the clock moved, not that the data is
  // fresh. Treated as expired, which errs towards asking the server.
  if (age < 0 || age > ttl) return { data: null, expired: true }
  return { data: held.data as T, expired: false }
}

/** What the operator is told when the phone has forgotten and cannot ask. */
export const SNAPSHOT_EXPIRED_OFFLINE =
  'This phone has been away from a connection for more than a day, so it has cleared the price list and customer names it was holding. Connect once and they come straight back. Nothing you recorded has been lost, and it will still be sent.'
