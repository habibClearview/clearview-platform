// ============================================================
// Every button that jumps somewhere must jump to a place that exists.
//
// WHY THIS EXISTS. "What needs you" had three buttons pointing at a tab that
// had been removed from this screen when deliverables and the fee moved to the
// coach's own business area. Clicking one set the screen to a tab with nothing
// behind it, so the whole content area went blank. Nothing failed, nothing
// logged, and the page simply emptied in front of whoever pressed it.
//
// That is the same shape as most of the faults found in this project: the code
// compiled, the types were satisfied, the tests passed, and the thing did not
// work. A jump target is a string, and a string that no longer names anything
// is invisible to everything except a person clicking.
// ============================================================

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CANVAS_TABS, TAB_GROUPS } from '@/lib/coach-types'

/** Where a jump is allowed to land. */
const TAB_IDS = new Set(CANVAS_TABS.map((t) => t.id))

/** The files that hand a tab name to the screen. */
const JUMPERS = ['src/components/gtcv/WhatNeedsYou.tsx']

function literalTargets(file: string): string[] {
  const source = readFileSync(join(process.cwd(), file), 'utf8')
  // Only quoted targets. A target held in a variable is checked by the test
  // below it, which pins the values that variable can hold.
  return Array.from(source.matchAll(/goTo:\s*'([^']+)'/g)).map((m) => m[1])
}

describe('a button that jumps somewhere', () => {
  it('always names a tab that exists', () => {
    for (const file of JUMPERS) {
      const targets = literalTargets(file)
      expect(targets.length, `${file} has no jump targets, so this test is watching nothing`).toBeGreaterThan(0)
      for (const target of targets) {
        expect(TAB_IDS, `${file} jumps to "${target}", which is not a tab`).toContain(target)
      }
    }
  })

  it('can still reach a zone by its own identifier', () => {
    // The two targets held in a variable are gate identifiers, and every gate
    // has a tab of the same name. If that ever stops being true the jumps from
    // the gate reminders break in exactly the way this file exists to prevent.
    for (const tab of CANVAS_TABS) {
      if (!tab.dpId) continue
      // phase_0 is the one gate whose tab is named differently, on purpose.
      if (tab.dpId === 'phase_0') continue
      expect(TAB_IDS, `gate ${tab.dpId} has no tab of the same name`).toContain(tab.dpId)
    }
  })

  it('gives every tab a heading that exists', () => {
    const groupIds = new Set(TAB_GROUPS.map((g) => g.id))
    for (const tab of CANVAS_TABS) {
      expect(groupIds, `${tab.id} is filed under "${tab.group}", which is not a heading`).toContain(tab.group)
    }
  })

  it('numbers each heading on its own, rather than in one long run', () => {
    // One run of numbers to twenty four implied a single sequence that does not
    // exist, and made the work look like twelve steps when the method has nine
    // decision points. Each heading counts its own.
    const byGroup = new Map<string, string[]>()
    for (const tab of CANVAS_TABS) {
      byGroup.set(tab.group, [...(byGroup.get(tab.group) || []), tab.marker])
    }
    for (const [group, markers] of Array.from(byGroup.entries())) {
      expect(new Set(markers).size, `${group} repeats a marker`).toBe(markers.length)
    }
    // The work is the nine decision points, with the ground clearing and the
    // handover either side of them and not numbered as if they were steps.
    const work = byGroup.get('work') || []
    expect(work).toEqual(['P0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'HO'])
  })
})
