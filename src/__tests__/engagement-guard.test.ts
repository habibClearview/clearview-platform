import { describe, it, expect } from 'vitest'
import fs from 'fs'

// ============================================================
// WHAT A RECIPIENT SEES. 8 September 2026.
//
// /engagement/[slug] and its charter had no session check of any kind. Signed
// out they rendered their own shell to anybody: headings, the path, the nine
// blocks, and no data, because row-level security returned none. Nothing
// leaked. What it LOOKED like to the person holding it was a brochure, and
// that is what a real recipient of a real first letter was shown.
// ============================================================
const GUARD = fs.readFileSync('src/components/auth/RequireSignIn.tsx', 'utf8')
const JOURNEY = fs.readFileSync('app/engagement/[slug]/page.tsx', 'utf8')
const CHARTER = fs.readFileSync('app/engagement/[slug]/charter/page.tsx', 'utf8')

describe('a client-facing page knows who is looking', () => {
  it('guards both the journey and the Charter', () => {
    for (const route of [JOURNEY, CHARTER]) {
      expect(route).toContain('RequireSignIn')
      expect(route).toContain("'use client'")
    }
  })

  it('uses one guard, so the next page added cannot forget', () => {
    expect(GUARD).toContain('supabase.auth.getSession()')
  })

  it('brings them back to the page they were sent to', () => {
    // Not dropped on a dashboard and left to find their engagement again.
    expect(GUARD).toContain('RETURN_TO_KEY')
    expect(GUARD).toContain('isSafeReturnPath(here)')
  })

  it('asks them to sign in when the check cannot answer', () => {
    // A slow check must not hold the page open, and open is not the safe default.
    expect(GUARD).toContain('setTimeout')
    expect(GUARD).toMatch(/if \(!cancelled\) toSignIn\(\)/)
  })
})

describe('a link that failed is explained, not redirected away from', () => {
  it('stands aside when the address carries an auth error', () => {
    // Redirecting throws away the fragment, and with it the only explanation
    // the recipient was ever going to get. They would arrive at a bare
    // password box having been told nothing.
    expect(GUARD).toContain("p.get('error') || p.get('error_code')")
    expect(GUARD).toMatch(/if \(p\.get\('error'\) \|\| p\.get\('error_code'\)\) return/)
  })

  it('leaves the explaining to LinkProblem in the root layout', () => {
    expect(fs.readFileSync('app/layout.tsx', 'utf8')).toContain('<LinkProblem />')
  })
})
