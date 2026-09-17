// ============================================================
// THE APPROVED DESIGN, CHECKED AS NUMBERS.
//
// The walkthrough is a port of a design Habib approved as nineteen
// screenshots, so the numbers in it are the agreement. A later edit that
// rounds the header logo to 64 pixels or softens a corner is not a small
// change, it is a different design, and nothing else in the repository would
// notice. These fail if any of the values he specified moves.
//
// The other half of the job is scoping: every rule has to stay inside the
// walkthrough's own wrapper, or dropping this into ClearView repaints pages
// that have nothing to do with it.
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WALKTHROUGH_CSS, WALKTHROUGH_PAIRING_CSS, WALKTHROUGH_ROOM_CSS } from '@/lib/walkthrough/styles'
import { WIDE, TALL } from '@/lib/walkthrough/geometry'

const ROOT = process.cwd()
const REFERENCE = join(ROOT, 'docs/walkthrough-reference/reference.html')

/** Every selector in the stylesheet, one per rule. */
function selectors(css: string): string[] {
  const out: string[] = []
  const body = css.replace(/@media[^{]+\{/g, '').replace(/@keyframes[^{]+\{[\s\S]*?\}\s*\}/g, '')
  for (const m of Array.from(body.matchAll(/(^|\})\s*([^{}@]+)\{/g))) {
    const sel = m[2].trim()
    if (sel) out.push(sel)
  }
  return out
}

describe('the walkthrough cannot paint anything but itself', () => {
  it('every rule is inside the walkthrough wrapper', () => {
    const strays: string[] = []
    for (const sel of selectors(WALKTHROUGH_CSS + WALKTHROUGH_PAIRING_CSS + WALKTHROUGH_ROOM_CSS)) {
      for (const one of sel.split(',')) {
        const t = one.trim()
        if (!t) continue
        if (!t.startsWith('.gtcvw')) strays.push(t)
      }
    }
    expect(strays, `not scoped: ${strays.join(' | ')}`).toEqual([])
  })

  it('styles nothing global: no html, body or bare element rules', () => {
    expect(WALKTHROUGH_CSS).not.toMatch(/(^|\})\s*(html|body)\s*[,{]/)
    expect(WALKTHROUGH_CSS).not.toMatch(/(^|\})\s*:root\s*\{/)
  })
})

describe('the laptop rules never reach the projector', () => {
  it('everything that changes the approved sizes is behind a width limit', () => {
    // Above 1400 points nothing in here applies, which is the width the
    // walkthrough is shown at in a room. A rule that escaped that limit would
    // quietly shrink the design Habib approved.
    const blocks = WALKTHROUGH_ROOM_CSS.split('@media').map((b) => b.trim()).filter((b) => b.length > 0)
    for (const b of blocks) {
      const head = b.slice(0, b.indexOf('{'))
      expect(head).toContain('min-width: 721px')
    }
    // The block that changes sizes is the bounded one; the unbounded block only
    // stops the header wrapping and sets the question list to fit a line.
    const unbounded = blocks.find((b) => !b.includes('max-width: 1400px')) || ''
    expect(unbounded).not.toMatch(/logo\{height|padding:10px 20px|font-size:19px/)
  })
})

describe('the values Habib specified', () => {
  const css = WALKTHROUGH_CSS

  it('the header is the size it is so it reads from the back of a room', () => {
    expect(css).toContain('.gtcvw .logo{height:68px')
    expect(css).toContain('padding:18px 36px')
    expect(css).toContain('.gtcvw .brand .name b{font-weight:600;font-size:26px')
    expect(css).toContain('font-size:14px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--blue)')
  })

  it('the narration panel is square cornered and the sizes given', () => {
    expect(css).toContain('padding:24px 26px;background:var(--panel);border:1px solid var(--line-2)')
    expect(css).toContain('.gtcvw .narr h2{font-weight:700;font-size:31px')
    expect(css).toContain('grid-template-columns:minmax(0,1fr) 400px;gap:24px;padding:16px 24px')
  })

  it('the tiles carry the ClearView canvas colours at the widths given', () => {
    expect(css).toContain('--cv-card:#192439')
    expect(css).toContain('--cv-border:#51678E')
    expect(css).toContain('fill:var(--cv-card);stroke:var(--cv-border);stroke-width:1.8')
    expect(css).toContain('.gtcvw .g-name{font-weight:600;font-size:18.5px')
    expect(css).toContain('.gtcvw .fit{display:inline-block;font-family:var(--font);font-size:9.5px')
  })

  it('the primary buttons are the blue on near black', () => {
    expect(css).toContain('--blue:#00AFEF')
    expect(css).toContain('--on-blue:#111111')
    expect(css).toContain('.gtcvw .nb.primary{background:var(--blue);color:var(--on-blue)')
  })

  it('the light room is the second palette, not an inversion', () => {
    expect(css).toContain('.gtcvw[data-room="light"]{--ground:#F5F5DC')
    expect(css).toContain('--blue:#0083BA')
  })

  it('the pairing corner is 96 by 96, cream, with the code under it', () => {
    expect(WALKTHROUGH_PAIRING_CSS).toContain('width:96px;height:96px')
    expect(WALKTHROUGH_PAIRING_CSS).toContain('padding:12px')
    expect(WALKTHROUGH_PAIRING_CSS).toContain('font-size:12px;font-weight:600;letter-spacing:.14em;color:rgba(245,245,220,.5)')
    expect(WALKTHROUGH_PAIRING_CSS).toContain('transition:opacity .4s')
  })

  it('respects somebody who has asked for less movement', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})

describe('the stylesheet is the reference stylesheet', () => {
  it('holds a rule for every rule the reference holds', () => {
    // Two of the reference's rules are dropped, because they style html and
    // body and a wrapper inside an application cannot set those. One rule is
    // added, which gives the phone its own scrolling middle so that Back and
    // Next stay on screen. Net, one fewer. Any other difference means a rule
    // was lost in the copying, and a lost rule is a piece of the design gone.
    const ref = readFileSync(REFERENCE, 'utf8')
    const refCss = ref.split('<style>')[1].split('</style>')[0].replace(/\/\*[\s\S]*?\*\//g, '')
    const count = (s: string) => (s.match(/\{/g) || []).length - (s.match(/@media|@keyframes/g) || []).length
    const DROPPED_HTML_AND_BODY = 2
    const ADDED_PHONE_SCROLL = 1
    expect(count(WALKTHROUGH_CSS)).toBe(count(refCss) - DROPPED_HTML_AND_BODY + ADDED_PHONE_SCROLL)
  })
})

describe('the canvas geometry is the approved geometry', () => {
  it('the wide layout is 1200 by 780 with the boxes where they were drawn', () => {
    expect(WIDE.vb).toEqual([1200, 780])
    expect(WIDE.G.d1).toEqual([170, 104, 280, 160])
    expect(WIDE.G.d2).toEqual([460, 104, 280, 160])
    expect(WIDE.G.d3).toEqual([750, 104, 280, 160])
    expect(WIDE.G.d4).toEqual([170, 274, 280, 160])
    expect(WIDE.G.d6).toEqual([460, 274, 280, 160])
    expect(WIDE.G.d5).toEqual([750, 274, 280, 160])
    expect(WIDE.G.d7).toEqual([170, 446, 425, 120])
    expect(WIDE.G.d8).toEqual([605, 446, 425, 120])
    expect(WIDE.G.d9).toEqual([170, 578, 860, 82])
    expect(WIDE.G.cg).toEqual([20, 74, 130, 586])
    expect(WIDE.G.ho).toEqual([1050, 74, 130, 586])
    expect(WIDE.setup).toEqual([20, 14, 1160, 44])
  })

  it('the record chips and the ownership bar are where they were drawn', () => {
    expect(WIDE.rec.x).toBe(20)
    expect(WIDE.rec.y).toBe(708)
    expect(WIDE.rec.w).toBe(48)
    expect(WIDE.rec.h).toBe(30)
    expect(WIDE.rec.gap).toBe(8)
    expect(WIDE.own.x).toBe(680)
    expect(WIDE.own.w).toBe(500)
    expect(WIDE.own.h).toBe(16)
  })

  it('the phone layout is the second geometry, not the first one squeezed', () => {
    expect(TALL.vb).toEqual([400, 598])
    expect(TALL.compact).toBe(true)
    expect(TALL.G.d1).toEqual([8, 106, 120, 100])
  })

  it('the three readings sit under the four stage scale', () => {
    expect(WIDE.scale).toMatchObject({ x: 562, y: 596, w: 108, h: 20 })
    expect(WIDE.readX.map((r) => r[0])).toEqual([615, 723, 831])
    expect(WIDE.readX.map((r) => r[1])).toEqual(['KICK-OFF', 'MID-POINT', 'CLOSE'])
  })
})
