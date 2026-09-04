// ============================================================
// NO TWO PARTS OF THE SITE MAY OWN THE SAME SHORT CLASS NAME.
//
// The site is one stylesheet across every page, so a class defined in one
// component styles that class everywhere. This has now caused three faults,
// each invisible to the compiler and to every other test:
//
//   .q was the quiz row and the canvas question, so the canvas's questions
//   were laid out as bordered flex rows.
//
//   .dg-fits div matched the card and its three children, so each fit test
//   drew as three stacked boxes.
//
//   .ft was the footer and the fit title, so the footer's background and its
//   82px of padding landed inside all six fit cards.
//
// The rule that separates the safe from the dangerous is not length, it is
// whether the selector is anchored to a parent. ".hb .tier .n" cannot reach
// ".hb .stat .n". ".hb .ft" reaches every .ft on the site.
//
// So: a class may be styled unanchored in at most one file. Style it under a
// parent, or give it a name only its own component would use.
// ============================================================
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

function siteFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.tsx')) out.push(full)
    }
  }
  walk('src/components/site')
  walk('app/site')
  return out
}

/** Selectors of the form ".hb .thing" — one class, no parent to anchor it. */
function unanchored(css: string): string[] {
  const found: string[] = []
  for (const sel of css.match(/\.hb[^{}]*?(?=\{)/g) || []) {
    for (const one of sel.split(',')) {
      const t = one.trim()
      const m = /^\.hb\s+\.([a-zA-Z][\w-]*)\s*(?:[>+~]\s*[a-zA-Z*][\w-]*\s*)?$/.exec(t)
      if (m) found.push(m[1])
    }
  }
  return found
}

describe('the site stylesheet', () => {
  it('lets only one file own each unanchored class', () => {
    const owners = new Map<string, Set<string>>()
    for (const f of siteFiles()) {
      const src = fs.readFileSync(f, 'utf8')
      for (const cls of unanchored(src)) {
        if (!owners.has(cls)) owners.set(cls, new Set())
        owners.get(cls)!.add(path.basename(f))
      }
    }
    const clashes = [...owners.entries()]
      .filter(([, files]) => files.size > 1)
      .map(([cls, files]) => `.${cls} is styled unanchored in ${[...files].sort().join(' and ')}`)
    expect(clashes, clashes.join('; ')).toEqual([])
  })

  it('has no selector that styles a block and its own children alike', () => {
    // ".thing div" catches the card AND every div inside it. Where a rule
    // means "the cards", it has to say "> div".
    const bad: string[] = []
    for (const f of siteFiles()) {
      const src = fs.readFileSync(f, 'utf8')
      for (const sel of src.match(/\.hb\s+\.[\w-]+\s+(?:div|span|p)(?=\s*\{)/g) || []) {
        bad.push(`${path.basename(f)}: "${sel.trim()}" should use > for direct children`)
      }
    }
    // p and span are usually intended to reach descendants; div almost never is.
    const divOnly = bad.filter((b) => / div"/.test(b))
    expect(divOnly, divOnly.join('; ')).toEqual([])
  })
})
