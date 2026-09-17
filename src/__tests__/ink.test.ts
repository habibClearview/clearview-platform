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

  // The background of the style object this colour sits in.
  //
  // From the review on #280, twice over. First it took the next eighty
  // characters after the word background, which runs off the end of the value
  // and into whatever property follows, so a cyan BORDER read as a cyan
  // background. Then it searched backwards from the colour, so
  // `{color:'var(--cv-on-accent)', background:C.cyan}` was missed entirely
  // because the background came second.
  //
  // So it now finds the braces this colour actually sits between, and looks
  // for the background anywhere inside them, in either order.
  function enclosingObject(src: string, at: number): string | null {
    let depth = 0
    let open = -1
    for (let i = at; i >= 0; i--) {
      const ch = src[i]
      if (ch === '}') depth++
      else if (ch === '{') { if (depth === 0) { open = i; break } depth-- }
    }
    if (open < 0) return null
    depth = 0
    for (let i = at; i < src.length; i++) {
      const ch = src[i]
      if (ch === '{') depth++
      else if (ch === '}') { if (depth === 0) return src.slice(open + 1, i) ; depth-- }
    }
    return null
  }

  /** The value of the background property, stopping where the value stops. */
  function backgroundValue(src: string, at: number): string | null {
    const obj = enclosingObject(src, at)
    if (obj === null) return null
    const key = obj.search(/\bbackground\s*:/)
    if (key < 0) return null
    let i = obj.indexOf(':', key) + 1
    let depth = 0
    let quote: string | null = null
    const out: string[] = []
    for (; i < obj.length; i++) {
      const ch = obj[i]
      if (quote) {
        out.push(ch)
        if (ch === quote && obj[i - 1] !== '\\') quote = null
        continue
      }
      if (ch === "'" || ch === '"' || ch === '`') { quote = ch; out.push(ch); continue }
      if ('([{'.includes(ch)) depth++
      if (')]}'.includes(ch)) { if (depth === 0) break; depth-- }
      if (ch === ',' && depth === 0) break
      out.push(ch)
    }
    return out.join('')
  }

  // A SCANNER THAT FINDS NOTHING MIGHT BE BROKEN RATHER THAN SATISFIED. These
  // run it over samples with a known answer, so the clean result below means
  // the source is clean and not that the scanner stopped working.
  it('reads the background itself, and not the property after it', () => {
    const ok = "style={{background:'var(--cv-header)',borderBottom:`3px solid ${C.cyan}`,color:'var(--cv-on-accent)'}}"
    expect(backgroundValue(ok, ok.indexOf('--cv-on-accent'))).toBe("'var(--cv-header)'")
  })

  it('catches a light colour hiding in one branch of a background', () => {
    const bad = "style={{background:two?C.purple:C.cyan,color:'var(--cv-on-accent)'}}"
    expect(backgroundValue(bad, bad.indexOf('--cv-on-accent'))).toBe('two?C.purple:C.cyan')
  })

  it('finds the background when it is written after the colour', () => {
    const bad = "style={{color:'var(--cv-on-accent)',background:C.cyan}}"
    expect(backgroundValue(bad, bad.indexOf('--cv-on-accent'))).toBe('C.cyan')
  })

  it('does not reach into a different style object for a background', () => {
    const src = "a={{background:C.cyan}} b={{color:'var(--cv-on-accent)'}}"
    expect(backgroundValue(src, src.indexOf('--cv-on-accent'))).toBeNull()
  })

  it('no screen writes white onto a cyan or teal fill by hand', () => {
    // The pairing this whole file exists to prevent: a background of one of
    // the light accents with --cv-on-accent, which is white, written on it.
    //
    // A BACKGROUND THAT SWITCHES IS TWO BACKGROUNDS. From the review on #280.
    // This first asked "does the background mention a light colour and no dark
    // one", so `background: two ? C.purple : C.cyan` was read as dark and
    // waved through, while the cyan half of it was white on cyan exactly as
    // before. Every colour the background itself can take is now judged, and
    // one light branch is enough to fail.
    const LIGHT = /(C\.cyan|C\.teal|C\.amber|C\.green|cv-cyan|cv-teal|cv-amber|cv-green)/
    const offenders: string[] = []
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8')
      for (const m of s.matchAll(/var\(--cv-on-accent\)/g)) {
        const value = backgroundValue(s, m.index!)
        if (!value) continue
        if (LIGHT.test(value)) offenders.push(`${f}: background:${value.trim().slice(0, 70)}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
