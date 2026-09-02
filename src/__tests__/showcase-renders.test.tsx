// @vitest-environment jsdom
// ============================================================
// THE SHOWCASE LINK IS COMPLETE, AND SAYS DECISION POINT.
//
// This exists because a prospect opened the link and read "The nine blocks"
// above eight of them. Nothing failed: BLOCK held dp01 to dp08, the page
// looped dp01 to dp09, and `if (!b) return null` dropped the ninth in silence.
// A missing entry in fixed intellectual property is exactly the kind of fault
// that no compiler, no build and no rendering test can see unless the test
// counts.
//
// So it counts. It also checks the two things Habib asked for on the same
// screen: one word for a block across the whole system, and the work that
// happens before the first decision point being visible to someone deciding
// whether to buy.
// ============================================================
import { describe, expect, it } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'

import ShowcaseView from '@/components/engagement/ShowcaseView'
import {
  BLOCK, CANVAS_BLOCK_IDS, CANVAS_ROWS, TRANSITION_ROW, SPINE_BLOCK_ID,
  BEFORE_THE_CANVAS, RUNS_UNDERNEATH, dpLabel, dpNumber,
} from '@/lib/gtcv-blocks'

const VIEW = {
  organisation: null, programme: null, country: null,
  gatesComplete: 3, gatesTotal: 12, underWay: true, expiresAt: null,
}

function render(view: any) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => { root.render(<ShowcaseView view={view} />) })
  return host
}

describe('the method definition', () => {
  it('defines every block the canvas draws, the ninth included', () => {
    expect(CANVAS_BLOCK_IDS).toHaveLength(9)
    for (const id of CANVAS_BLOCK_IDS) {
      expect(BLOCK[id], `${id} is drawn on the canvas but not defined`).toBeTruthy()
      expect(BLOCK[id].title).toBeTruthy()
      expect(BLOCK[id].q).toBeTruthy()
      expect(BLOCK[id].bullets.length).toBeGreaterThan(0)
      expect(BLOCK[id].short).toBeTruthy()
    }
  })

  it('draws each block exactly once, and the ninth full width', () => {
    const drawn = [...CANVAS_ROWS.flat(), ...TRANSITION_ROW, SPINE_BLOCK_ID]
    expect(new Set(drawn).size).toBe(drawn.length)
    expect(drawn.sort()).toEqual(
      ['dp01', 'dp02', 'dp03', 'dp04', 'dp05', 'dp06', 'dp07', 'dp08', 'dp09'],
    )
    expect(SPINE_BLOCK_ID).toBe('dp09')
  })

  it('has one word for a block and it is not a code', () => {
    expect(dpLabel('dp01')).toBe('Decision Point 1')
    expect(dpLabel('dp09')).toBe('Decision Point 9')
    expect(dpNumber('dp07')).toBe(7)
    expect(dpNumber('phase_0')).toBeNull()
    expect(dpLabel('phase_0')).toBe('Clearing the ground')
  })
})

describe('the showcase link a prospect opens', () => {
  it('shows all nine decision points, named as decision points', () => {
    const host = render(VIEW)
    const text = host.textContent || ''
    for (const id of CANVAS_BLOCK_IDS) {
      expect(text, `${id} missing from the page`).toContain(BLOCK[id].title)
      expect(text).toContain(dpLabel(id))
    }
    // The count in the heading has to match the count on the page. This is the
    // assertion the old page would have failed.
    expect(host.querySelectorAll('.box').length).toBe(8)
    expect(host.querySelectorAll('.spine-box').length).toBe(1)
  })

  it('gives every box the number a phone sorts it by', () => {
    // On a narrow screen the canvas stops being a three column drawing and
    // becomes one column, and the order comes from this custom property
    // rather than from the markup — the wide canvas has to keep six above
    // five. If React ever stopped writing custom properties through, the
    // phone would silently read 1,2,3,4,6,5,7,8 and nobody would notice.
    const host = render(VIEW)
    const boxes = Array.from(host.querySelectorAll('.box')) as HTMLElement[]
    const orders = boxes.map((b) => b.style.getPropertyValue('--n').trim())
    expect(orders).toEqual(['10', '20', '30', '40', '60', '50', '70', '80'])
    const spine = host.querySelector('.spine-box') as HTMLElement
    expect(spine.style.getPropertyValue('--n').trim()).toBe('90')
  })

  it('never calls a block a zone, a DP code or a numbered block', () => {
    const text = render(VIEW).textContent || ''
    expect(text).not.toMatch(/\bZone \d/)
    expect(text).not.toMatch(/\bDP\s?\d/)
    expect(text).not.toMatch(/\bBlock \d/)
  })

  it('shows what happens before the first decision point, and what runs underneath', () => {
    const text = render(VIEW).textContent || ''
    for (const s of [...BEFORE_THE_CANVAS, ...RUNS_UNDERNEATH]) {
      expect(text, `${s.label} missing`).toContain(s.label)
    }
    expect(text).toContain('Engagement Charter')
    expect(text).toContain('Pre-engagement diagnostic')
    expect(text).toContain('Evidence library')
  })

  it('reports how far a live engagement has got, and nothing about it', () => {
    const text = render(VIEW).textContent || ''
    expect(text).toContain('3 of 12 gates closed on evidence')
  })

  it('shows the same dead-link page for a token that has no view', () => {
    const text = render(null).textContent || ''
    expect(text).toContain('This link is not open')
    expect(text).not.toContain('Decision Point 1')
  })
})
