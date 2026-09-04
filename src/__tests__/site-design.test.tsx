// @vitest-environment jsdom
// ============================================================
// THE SITE IS THE APPROVED DESIGN, NOT AN INTERPRETATION OF IT.
//
// The first attempt at this ported the design's DATA and then rewrote the
// markup, which produced a different site: the wrong header, missing calls to
// action, the score page's display type gone. So these tests check the things
// that went wrong, against the design's own values.
//
// They are deliberately about identity rather than appearance. A test cannot
// tell whether a page looks right; it can tell whether the header still has a
// menu button rather than a navigation bar, whether both hero buttons are
// there, and whether every screen the design defines still has an address.
// ============================================================
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import { SERVICES, MENU, QUESTIONS, STATS, CANVAS, PROOF_ALL, RESOURCES, VIDEOS } from '@/components/site/design/data'
import { SCREEN_PATH } from '@/components/site/design/CanvasCoachSite'

const SRC = fs.readFileSync('src/components/site/design/CanvasCoachSite.tsx', 'utf8')

describe('the design came across whole', () => {
  it('keeps the header the design has, not a navigation bar', () => {
    expect(SRC).toContain('Clearview sign in')
    expect(SRC).toContain('openMenu')
    expect(SRC).toContain('closeMenu')
  })

  it('keeps both calls to action in the hero', () => {
    expect(SRC).toContain('Score your organisation')
    expect(SRC).toContain('See what I do')
  })

  it('keeps the display type on the diagnostic', () => {
    // The score page opens on a large headline, which a previous version
    // replaced with body copy.
    expect(SRC).toContain('The same ten I ask')
    expect(SRC).toContain('Begin. Question 1 of 10.')
  })

  it('gives every screen in the design a real address', () => {
    const screens = ['home', 'gtcv', 'intel', 'icc', 'idcms', 'tralimm', 'proof', 'library', 'videos', 'assess', 'contact']
    for (const s of screens) expect(SCREEN_PATH[s], `${s} has no address`).toBeTruthy()
    expect(new Set(Object.values(SCREEN_PATH)).size).toBe(screens.length)
  })

  it('links the newsletter, both socials and the platform', () => {
    expect(SRC).toContain('linkedin.com/newsletters/viable-by-design')
    expect(SRC).toContain('linkedin.com/in/habibonifade')
    expect(SRC).toContain('youtube.com/@DevTVorg')
    expect(SRC).toContain('clearview.habibonifade.com')
    expect(SRC).toContain('mailto:hello@habibonifade.com')
  })

  it('captures through the server, never through a form id in the browser', () => {
    expect(SRC).toContain('/api/subscribe')
    expect(SRC).toContain('/api/readiness')
    expect(SRC).not.toContain('app.kit.com/forms')
    expect(SRC).not.toMatch(/KIT_API_KEY|kit_[0-9a-f]{8}/)
  })

  it('sources every claim about the world', () => {
    for (const url of [
      'oecd.org/en/publications/2025/06/cuts-in-official-development-assistance',
      'convergence.finance/resource/state-of-blended-finance-2025',
    ]) expect(SRC).toContain(url)
    // The design called it the average; Convergence publishes a median.
    expect(SRC).toContain('the median blended finance deal')
  })
})

describe('the design\'s own data', () => {
  it('is all present', () => {
    expect(SERVICES).toHaveLength(5)
    expect(MENU).toHaveLength(7)
    expect(QUESTIONS).toHaveLength(10)
    expect(STATS).toHaveLength(4)
    expect(CANVAS).toHaveLength(8)
    expect(PROOF_ALL.length).toBeGreaterThanOrEqual(7)
    expect(RESOURCES.length).toBeGreaterThan(0)
    expect(VIDEOS.length).toBeGreaterThan(0)
  })

  it('names the decision points the way the rest of the system does', () => {
    expect(SRC).not.toMatch(/\bZone \d/)
    expect(SRC).not.toMatch(/\bDP\s?\d/)
  })
})
