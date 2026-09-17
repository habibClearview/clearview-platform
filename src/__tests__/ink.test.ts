// ============================================================
// NO WHITE WRITING ON A CYAN BUTTON
//
// Habib, 17 September 2026: "A single rule I have repeated so many times is
// that white text on a cyan background in the buttons makes it difficult to
// see the text - DO NOT USE WHITE ON CYAN... Please make it all uniform
// across the platform."
//
// He is right that he has said it many times. It was fixed three times, in
// three separate files, each keeping its own private copy of the same
// function. Every screen built afterwards started from a different file and
// got it wrong again, so the rule kept coming back. Three copies of a rule is
// the same as no rule.
//
// It is one function now, and this is the test that keeps it one.
// ============================================================
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { onSolid } from '@/lib/ink'

describe('what colour the writing goes on a coloured button', () => {
  it('puts dark ink on cyan, teal, green and amber', () => {
    for (const fill of ['var(--cv-cyan)', 'var(--cv-teal)', 'var(--cv-green)', 'var(--cv-amber)']) {
      expect(onSolid(fill), fill).toBe('var(--cv-on-cyan)')
    }
  })

  it('keeps white on the dark fills, which carry it perfectly well', () => {
    for (const fill of ['var(--cv-navy)', 'var(--cv-red)', 'var(--cv-purple)', 'var(--cv-slate)']) {
      expect(onSolid(fill), fill).toBe('var(--cv-on-accent)')
    }
  })

  it('puts navy on a pale surface, rather than white on white', () => {
    for (const fill of ['var(--cv-card)', 'transparent', '#FFFFFF', 'white']) {
      expect(onSolid(fill), fill).toBe('var(--cv-navy)')
    }
  })

  it('does not fall over on nothing at all', () => {
    expect(onSolid(null)).toBe('var(--cv-on-accent)')
    expect(onSolid(undefined)).toBe('var(--cv-on-accent)')
  })
})

// The rule is only uniform while there is one of it. This walks the source.
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') sourceFiles(p, out) }
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p)
  }
  return out
}

describe('the rule stays in one place', () => {
  const files = [...sourceFiles('src'), ...sourceFiles('app')]
    .filter(f => !f.includes('__tests__'))

  it('is defined once, in src/lib/ink.ts', () => {
    const definers = files.filter(f => /function onSolid\s*\(/.test(fs.readFileSync(f, 'utf8')))
    expect(definers).toEqual(['src/lib/ink.ts'])
  })

  it('no screen writes white onto a cyan or teal fill by hand', () => {
    // The pairing this whole file exists to prevent: a background of one of
    // the light accents with --cv-on-accent, which is white, written on it.
    const LIGHT = /(C\.cyan|C\.teal|C\.amber|C\.green|cv-cyan|cv-teal|cv-amber|cv-green)/
    const DARK = /(C\.navy|C\.red|C\.purple|C\.slate|cv-navy|cv-red|cv-purple|cv-slate|cv-header|C\.white|C\.cream)/
    const offenders: string[] = []
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8')
      for (const m of s.matchAll(/var\(--cv-on-accent\)/g)) {
        const before = s.slice(Math.max(0, m.index! - 700), m.index!)
        const b = before.lastIndexOf('background')
        if (b < 0) continue
        const seg = before.slice(b, b + 80)
        if (LIGHT.test(seg) && !DARK.test(seg)) offenders.push(`${f}: ${seg.trim().slice(0, 60)}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
