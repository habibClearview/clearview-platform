// ============================================================
// THE WALKTHROUGH SAYS WHAT CLEARVIEW SAYS.
//
// The point of reading the canvas wording from gtcv-blocks.ts rather than
// typing it out again is that renaming a decision point in ClearView renames it
// on the walkthrough. These tests fail the moment the two drift, which is the
// only way to know, because nobody opens both screens side by side.
// ============================================================
import { describe, it, expect } from 'vitest'
import { INFO, ORDER, COLUMN_BARS, SCALE, FIT_TESTS, fullLabel, CHIP } from '@/lib/walkthrough/canvas-words'
import { BLOCK, SPINE, CANVAS_COLUMNS, dpLabel } from '@/lib/gtcv-blocks'

const OF: Record<string, string> = {
  d1: 'dp01', d2: 'dp02', d3: 'dp03', d4: 'dp04', d5: 'dp05',
  d6: 'dp06', d7: 'dp07', d8: 'dp08', d9: 'dp09',
}

describe('the canvas wording comes from ClearView', () => {
  it('every decision point carries ClearView\'s own name and question', () => {
    for (const [key, id] of Object.entries(OF)) {
      expect(INFO[key].name).toBe(BLOCK[id].title)
      expect(INFO[key].q).toBe(BLOCK[id].q)
    }
  })

  it('Decision Point 6 asks the whole question, not the half in the screenshot', () => {
    // The screenshot cut it off at "who do we partner with?". ClearView's is
    // the longer one, and the longer one is what must appear.
    expect(INFO.d6.q).toBe(BLOCK.dp06.q)
    expect(INFO.d6.q).toContain('as that entity')
  })

  it('the three columns are ClearView\'s, without the canvas arrows', () => {
    const plain = CANVAS_COLUMNS.map((c) => c.label.replace(/[←→]/g, '').trim())
    expect(COLUMN_BARS.map((c) => c[0])).toEqual(plain)
  })

  it('the readiness scale and the six fit tests are ClearView\'s', () => {
    expect(SCALE.map((s) => s[0])).toEqual(SPINE.stages.map((s) => s.label))
    expect(FIT_TESTS).toEqual(SPINE.fits.map((f) => f.t))
    expect(FIT_TESTS).toHaveLength(6)
  })

  it('every fit tag is the one ClearView closes that decision on', () => {
    for (const [key, id] of Object.entries(OF)) {
      if (key === 'd9') continue
      expect(INFO[key].fit?.[0]).toBe(BLOCK[id].fit)
    }
  })

  it('the diagnostic spine carries no fit tag, because there is no room for one', () => {
    // 82 pixels tall, already holding the four stage scale, three readings and
    // its own name. A tag here sits on top of the name.
    expect(INFO.d9.fit).toBeUndefined()
    expect(INFO.d9.short).toBe('')
  })

  it('says "Decision Point 1" wherever there is room, and "DP 01" only on the badge', () => {
    expect(fullLabel('d1')).toBe(dpLabel('dp01'))
    expect(fullLabel('d1')).toBe('Decision Point 1')
    expect(INFO.d1.num).toBe('DP 01')
    expect(fullLabel('cg')).toBe('Clearing the ground')
    expect(fullLabel('ho')).toBe('Handover')
  })

  it('the column colour of each decision point matches ClearView\'s own', () => {
    const expected: Record<string, string> = {
      d1: 'gold', d4: 'gold', d2: 'slate', d7: 'slate',
      d3: 'cyan', d5: 'cyan', d8: 'cyan', d9: 'cyan', d6: 'lav',
    }
    for (const [key, colour] of Object.entries(expected)) expect(INFO[key].c).toBe(colour)
  })

  it('all eleven are drawn, and each has a chip', () => {
    expect(ORDER).toHaveLength(11)
    for (const k of ORDER) {
      expect(INFO[k]).toBeTruthy()
      expect(CHIP[k]).toBeTruthy()
    }
  })

  it('only the two zone words the design prints are printed', () => {
    // Threshold is deliberately not shown beside the badge; Transition and
    // Diagnostic spine are.
    expect(INFO.d7.kind).toBe('Transition')
    expect(INFO.d8.kind).toBe('Transition')
    expect(INFO.d9.kind).toBe('Diagnostic spine')
    expect(INFO.d6.kind).toBe('Threshold')
    expect(INFO.d1.kind).toBeUndefined()
  })
})
