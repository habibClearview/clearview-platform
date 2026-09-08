import { describe, it, expect } from 'vitest'
import fs from 'fs'

// ============================================================
// AN EXPIRED LINK IN FRONT OF A REAL CLIENT. 8 September 2026.
//
// Habib sent the first letters. A recipient pressed the button and landed on
// clearview.habibonifade.com/engagement/ikore#error=access_denied&
// error_code=otp_expired. The fragment is invisible to the server, so the page
// rendered normally: an engagement they were not signed in to, no explanation,
// nothing to press. Whatever expired the link, that is the part that costs
// credibility.
// ============================================================
const LP = fs.readFileSync('src/components/auth/LinkProblem.tsx', 'utf8')
const LAYOUT = fs.readFileSync('app/layout.tsx', 'utf8')

describe('a link that does not work says so', () => {
  it('watches every page, because the link can land on any of them', () => {
    expect(LAYOUT).toContain('<LinkProblem />')
  })

  it('reads the reason out of the fragment, where Supabase puts it', () => {
    expect(LP).toContain('window.location.hash')
    expect(LP).toContain("p.get('error_code') || p.get('error')")
  })

  it('names the cause a recipient could not guess', () => {
    // Single use, and some mail systems open links to check them.
    expect(LP).toContain('otp_expired')
    expect(LP).toContain('email systems open them automatically')
  })

  it('offers a way back in, not only an apology', () => {
    expect(LP).toContain('Send me a new link')
    expect(LP).toContain('resetPasswordForEmail')
  })

  it('does not say whether the address has an account', () => {
    expect(LP).toContain('If that address has an account')
  })

  it('tells them nothing is broken and nothing is lost', () => {
    expect(LP).toMatch(/Nothing is wrong with your account/)
  })

  it('stays out of the way when there is no error', () => {
    expect(LP).toContain('if (!code) return null')
  })
})
