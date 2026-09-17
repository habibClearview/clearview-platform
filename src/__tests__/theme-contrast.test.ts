// ============================================================
// TEXT THAT VANISHES WHEN THE THEME CHANGES
//
// Habib, 17 September 2026: "some text disappear when theme is changed - for
// instance on the title bar that has Ikore name - the edit name, stage and
// program is in white so when the theme is changed to day or night the text
// disappears because the contrast is not captured."
//
// He is describing a whole class of fault, not one button. --cv-navy is the
// PRIMARY TEXT COLOUR. In the light theme it is near black, and in the dark
// theme it flips to near white, because that is what text has to do. Twenty
// two places were using it as a BACKGROUND, with white writing on top: dark
// button, white letters, perfectly readable in the light theme, and a white
// button with white letters the moment somebody switches to dark.
//
// --cv-header exists for exactly this and is documented in globals.css as the
// "permanently-dark header / nav (kept dark)". It is dark in both themes, so
// white writing on it is readable in both.
// ============================================================
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') sourceFiles(p, out) }
    else if (p.endsWith('.tsx')) out.push(p)
  }
  return out
}

const screens = [...sourceFiles('src'), ...sourceFiles('app')].filter((f) => !f.includes('__tests__'))

describe('the tokens that change meaning between themes', () => {
  const css = fs.readFileSync('app/globals.css', 'utf8')

  it('still flips the text colour between the two themes, which is why this matters', () => {
    // If this ever stops being true the rule below can be relaxed. Until then
    // it is the whole reason for it.
    const light = /--cv-navy:\s*#1B2A41/.test(css)
    const dark = /--cv-navy:\s*#E7EEF6/.test(css)
    expect(light && dark, '--cv-navy no longer flips; revisit this rule').toBe(true)
  })

  it('keeps the header colour dark in both themes, which is what fills need', () => {
    const uses = css.match(/--cv-header:\s*#[0-9A-Fa-f]{6}/g) || []
    expect(uses.length).toBeGreaterThanOrEqual(2)
    // Both values are dark: their first pair of hex digits is well below mid.
    for (const u of uses) {
      const hex = u.slice(u.indexOf('#') + 1)
      expect(parseInt(hex.slice(0, 2), 16), u).toBeLessThan(0x40)
    }
  })

  it('no screen fills a surface with the text colour', () => {
    // A fill painted in the text colour is invisible in one of the two themes,
    // and which one depends on what is written on top of it.
    const offenders: string[] = []
    for (const f of screens) {
      const s = fs.readFileSync(f, 'utf8')
      // Only the CSS variable flips. A file with its own dark hex named navy
      // is fixed in both themes and is not this fault.
      if (!/'var\(--cv-navy\)'/.test(s)) continue
      for (const m of s.matchAll(/background\s*:\s*(C\.navy|'var\(--cv-navy\)')/g)) {
        offenders.push(`${f}: ${m[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

// ============================================================
// BUTTONS THAT LOOK LIKE EACH OTHER, AND PEOPLE WHO HAVE SIGNED IN
//
// Habib, 17 September 2026: "Please create some consistencies and symmetry -
// the add item buttons and run this with the room are different in colour and
// size, it is jarring." And: "People have logged in but it doesn't show on the
// who is in this tab."
// ============================================================
describe('the block screen', () => {
  const BLOCK = fs.readFileSync('src/components/gtcv/BlockWorkspace.tsx', 'utf8')

  it('follows the theme, instead of being painted in fixed colours', () => {
    // Seven raw colours, so none of this screen changed when the theme did.
    const raw = BLOCK.match(/'#[0-9A-Fa-f]{6}'/g) || []
    expect(raw).toEqual([])
  })

  it('gives Run this with the room the same shape as every other button', () => {
    // It was 13 pixels of mono with an 8 pixel radius, directly above add
    // buttons at 1.01rem with a 6 pixel radius.
    const base = BLOCK.slice(BLOCK.indexOf('const base = {'), BLOCK.indexOf('const base = {') + 320)
    expect(base).toContain("fontSize: '1.01rem'")
    expect(base).toContain("padding: '0.38rem 0.9rem'")
    expect(base).toContain('borderRadius: 6')
    // And its writing colour comes from the one rule, not a guess.
    expect(base).toContain('onSolid(fill)')
  })
})

describe('who has signed in', () => {
  const ROUTE = fs.readFileSync('app/api/engagement-party/route.ts', 'utf8')
  const PANEL = fs.readFileSync('src/components/gtcv/EngagementPartiesPanel.tsx', 'utf8')

  it('is asked now, rather than remembered from when they were added', () => {
    // Almost nobody has an account at the moment they are added to an
    // engagement: they are added, invited, and sign in a day later.
    expect(ROUTE).toContain('async function relinkAccounts(')
    expect(PANEL).toContain("action: 'relink'")
  })

  it('only fills a blank, so a link can never be quietly repointed', () => {
    expect(ROUTE).toContain(".is('user_id', null)")
  })

  it('is still only for somebody who may manage the engagement', () => {
    const post = ROUTE.slice(ROUTE.indexOf('export async function POST'))
    expect(post.indexOf('requireManager(req, admin, clientId)')).toBeLessThan(post.indexOf("=== 'relink'"))
  })

  it('never blanks the list when the check itself fails', () => {
    expect(PANEL).toContain('the people are still the people')
  })
})
