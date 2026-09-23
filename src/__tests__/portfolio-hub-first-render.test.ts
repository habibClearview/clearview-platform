// ============================================================
// Nothing may read `data` before the guard that waits for it.
//
// 23 September 2026. Build 1504507 shipped and the whole Market Intelligence
// tab showed "This section couldn't load". The cause: derived values added for
// the new sections read data.monthly, and they sat ABOVE the
// `if (loading) return ...` guard. `data` is null until the first fetch lands,
// so the component threw on its very first render, before it had anything to
// draw. Types, tests and the build all passed; only opening the page showed it.
//
// This reads the component and fails if any statement that touches `data`
// appears above that guard again. It is a text check because the component
// fetches on mount and cannot be rendered here, and a text check that catches
// this is worth more than no check at all.
// ============================================================
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(
  path.resolve(__dirname, '../../src/components/coach/CoachDashboard.tsx'), 'utf8',
)

/** The portfolio section: from its declaration to the next top-level function. */
function hubBody(): string {
  const start = src.indexOf('function PortfolioIntelligenceHub(')
  expect(start).toBeGreaterThan(-1)
  const after = src.indexOf('\nfunction ', start + 10)
  return src.slice(start, after === -1 ? src.length : after)
}

describe('the portfolio section on its first render', () => {
  it('waits for the data before anything reads it', () => {
    const body = hubBody()
    const guard = body.indexOf('if(loading)return')
    expect(guard, 'the loading guard went missing').toBeGreaterThan(-1)

    const before = body.slice(0, guard).split('\n')
    const offenders: string[] = []
    before.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '')
      // setData and the fetch that fills it are fine; reading through it is not.
      if (/\bdata\s*[.?[]/.test(code) && !/setData|data\s*=/.test(code)) {
        offenders.push(`line ${i + 1}: ${line.trim().slice(0, 90)}`)
      }
    })
    expect(offenders, 'these read `data` before the loading guard').toEqual([])
  })

  it('still has the guard before the page is drawn', () => {
    const body = hubBody()
    expect(body.indexOf('if(loading)return')).toBeLessThan(body.indexOf('return('))
  })

  it('keeps every hook above the guard, so the count never changes', () => {
    const body = hubBody()
    const guard = body.indexOf('if(loading)return')
    const after = body.slice(guard)
    const late = after.match(/\buse(State|Effect|Callback|Memo|Ref)\s*\(/g) || []
    expect(late, 'a hook below an early return changes the hook count between renders').toEqual([])
  })
})
