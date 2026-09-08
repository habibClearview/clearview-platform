// ============================================================
// SENT TO A CLIENT'S DASHBOARD WITHOUT PRESSING ANYTHING
//
// Habib was signed out while working and landed on Bwayele Vet's dashboard, a
// client he had not chosen, with no way back to his own screen.
//
// TWO FAULTS, ONE AFTER THE OTHER.
//
// The return path is one value shared by every tab, and every tab wrote it.
// Opening a client's financial model from the coach screen opens a new tab, so
// a tab sitting in the background on that client's dashboard was the one that
// decided where he came back to when the idle rule fired. A background tab is
// not where somebody was.
//
// And the path had no age, so one left over from a previous day would still be
// followed the next morning.
//
// Then, having arrived, there was no link back. The client dashboard offered a
// sign-out and nothing else.
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  RETURN_TO_KEY, RETURN_TO_AT_KEY, RETURN_TO_MAX_AGE_MS, returnPathIsFresh, isSafeReturnPath,
} from '@/lib/auth/session-guard'

const NOW = 1_757_000_000_000

describe('a return path is only followed while it is fresh', () => {
  it('follows one written a moment ago', () => {
    expect(returnPathIsFresh(NOW, String(NOW - 5_000))).toBe(true)
  })

  it('follows one written just inside the allowance', () => {
    expect(returnPathIsFresh(NOW, String(NOW - RETURN_TO_MAX_AGE_MS + 1_000))).toBe(true)
  })

  it('ignores one from earlier today, let alone yesterday', () => {
    expect(returnPathIsFresh(NOW, String(NOW - RETURN_TO_MAX_AGE_MS - 1))).toBe(false)
    expect(returnPathIsFresh(NOW, String(NOW - 26 * 60 * 60 * 1000))).toBe(false)
  })

  it('ignores a stamp from the future rather than trusting the clock', () => {
    expect(returnPathIsFresh(NOW, String(NOW + 60_000))).toBe(false)
  })

  it('treats a missing or unreadable stamp as no claim at all', () => {
    for (const bad of [null, undefined, '', 'soon', '0', '-1']) {
      expect(returnPathIsFresh(NOW, bad as string | null)).toBe(false)
    }
  })

  it('the allowance is long enough to come straight back and no longer', () => {
    expect(RETURN_TO_MAX_AGE_MS).toBe(30 * 60 * 1000)
  })

  it('still refuses a path that is not a plain same-origin one', () => {
    // Freshness is a second gate, never a replacement for the first.
    for (const hostile of ['//evil.example', 'https://evil.example', '/ok\\..']) {
      expect(isSafeReturnPath(hostile)).toBe(false)
    }
    expect(isSafeReturnPath('/coach?client=abc')).toBe(true)
  })
})

describe('only the tab somebody is looking at may claim the return path', () => {
  const GUARD = readFileSync('src/lib/auth/useSessionGuard.ts', 'utf8')

  it('a background tab does not decide where you come back to', () => {
    expect(GUARD).toContain("document.visibilityState === 'visible'")
    expect(GUARD).toContain('looking && isSafeReturnPath(here)')
  })

  it('and it stamps when it wrote it', () => {
    expect(GUARD).toContain('RETURN_TO_AT_KEY')
  })
})

describe('the sign-in page honours both rules', () => {
  const HOME = readFileSync('app/page.tsx', 'utf8')

  it('reads the stamp and the path together', () => {
    expect(HOME).toContain('isSafeReturnPath(saved) && returnPathIsFresh(Date.now(), savedAt)')
  })

  it('clears both, so a path is followed once whatever happens', () => {
    expect(HOME).toContain(`localStorage.removeItem(RETURN_TO_KEY)`)
    expect(HOME).toContain(`localStorage.removeItem(RETURN_TO_AT_KEY)`)
  })
})

describe('every writer of the return path stamps it', () => {
  // A writer that does not stamp writes a path that will never be followed,
  // which is a silent way of losing somebody's place.
  const WRITERS = [
    'src/lib/auth/useSessionGuard.ts',
    'src/components/auth/RequireSignIn.tsx',
    'app/client/page.tsx',
    'app/dashboard/funder/page.tsx',
  ]

  for (const file of WRITERS) {
    it(`${file} writes both`, () => {
      const text = readFileSync(file, 'utf8')
      expect(text).toContain(`setItem(${RETURN_TO_KEY === 'cv:return-to' ? 'RETURN_TO_KEY' : ''}`)
      expect(text).toContain('RETURN_TO_AT_KEY')
    })
  }

  it('the two keys are distinct', () => {
    expect(RETURN_TO_AT_KEY).not.toBe(RETURN_TO_KEY)
  })
})

describe('a coach can get back to their own dashboard', () => {
  it('from a client’s financial dashboard', () => {
    const text = readFileSync('src/components/generic/GenericDashboard.tsx', 'utf8')
    expect(text).toContain("['super_coach','coach'].includes(P.role)")
    expect(text).toContain('Coach Dashboard')
  })

  it('from the journey canvas, and everybody else goes to their own', () => {
    const text = readFileSync('src/components/engagement/EngagementJourneyView.tsx', 'utf8')
    expect(text).toContain("role === 'super_coach' || role === 'coach'")
    expect(text).toContain('href="/coach"')
    expect(text).toContain('href="/dashboard/funder"')
    expect(text).toContain('href="/client"')
  })
})
