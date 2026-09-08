'use client'
// ============================================================
// TAKING AN ENGAGEMENT BACK OUT OF PEOPLE'S BROWSERS
//
// An early prototype dashboard kept the whole of an engagement in localStorage
// under gtcv_engagement_v1, and never wrote a field of it to the database:
// the pre-engagement answers, the commitment sign-off, the decision record,
// the evidence entries, the stakeholder list. Two live routes rendered it,
// including the one every funder was sent to on sign-in.
//
// The routes are gone. The copy is not. It sits in the browser of anybody who
// opened either route, outside row-level security, outside the audit trail,
// and readable by anything else running on that machine. Removing the code
// does not remove that, so this removes it: on first load of any page, if the
// key is there, it goes.
//
// It is deliberately blind to what the value contains. Nothing was ever read
// back from it into the database, so there is nothing to rescue, and a prompt
// asking a client whether to keep a copy of their own engagement in their
// browser only invites the wrong answer.
// ============================================================
import { useEffect } from 'react'

/** The prototype's one key. Named here because the code that wrote it is gone. */
export const ABANDONED_KEYS = ['gtcv_engagement_v1'] as const

/** Removes each abandoned key. Returns the ones that were actually present. */
export function purgeAbandoned(store: Pick<Storage, 'getItem' | 'removeItem'>): string[] {
  const removed: string[] = []
  for (const key of ABANDONED_KEYS) {
    try {
      if (store.getItem(key) === null) continue
      store.removeItem(key)
      removed.push(key)
    } catch {
      // A storage that refuses to be read or written is a storage that is not
      // holding anything readable either. Nothing to do and nothing to report.
    }
  }
  return removed
}

export default function PurgeBrowserCopy() {
  useEffect(() => {
    try { purgeAbandoned(window.localStorage) } catch { /* no storage at all */ }
  }, [])
  return null
}
