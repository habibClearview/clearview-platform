// ============================================================
// The deliverable statuses the code writes have to be statuses the database
// accepts.
//
// This exists because of a real fault: the route that adds a deliverable by
// hand wrote status 'agreed', which is not one of the five the check
// constraint allows, so every attempt was refused and the coach saw "could not
// add the deliverable" with nothing to explain it. Nothing caught it. The type
// could not, because a string literal in an object passed to the Supabase
// client is not checked against it, and the type disappears at build time
// anyway.
//
// So the list is a runtime value now, and this reads the route back to check
// that every status literal it writes is in that list. It is a coarse check
// against source text, deliberately: the failure it is guarding against was a
// word that looked right and was not, and coarse is enough to catch that.
// ============================================================

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DELIVERABLE_STATUSES, isDeliverableStatus } from '@/lib/engagement-types'

const ROUTE = resolve(__dirname, '../../app/api/deliverables/route.ts')

describe('deliverable statuses', () => {
  it('recognises each of the five and nothing else', () => {
    for (const status of DELIVERABLE_STATUSES) {
      expect(isDeliverableStatus(status)).toBe(true)
    }
    for (const wrong of ['agreed', 'complete', 'done', '', 'PENDING', null, undefined, 7]) {
      expect(isDeliverableStatus(wrong)).toBe(false)
    }
  })

  it('is the same list the check constraint holds', () => {
    // If this fails, the migration and the code have drifted and one of them
    // has to move. The constraint is in
    // supabase/migrations/2026_08_08_engagement_deliverables.sql.
    expect([...DELIVERABLE_STATUSES]).toEqual([
      'pending', 'in_progress', 'accepted', 'invoiced', 'paid',
    ])
  })

  it('never writes a deliverable status the database would refuse', () => {
    const source = readFileSync(ROUTE, 'utf8')
    const written = Array.from(source.matchAll(/status:\s*'([a-z_]+)'/g), (m) => m[1])
    expect(written.length).toBeGreaterThan(0)
    for (const status of written) {
      expect(isDeliverableStatus(status), `the route writes status '${status}'`).toBe(true)
    }
  })
})
