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

// ============================================================
// A LINK YOU CANNOT GET AT. 12 September 2026.
//
// Habib: the Generate a client addition link does not appear to work, when you
// click there is nowhere to copy the link from.
//
// There was not. Pressing Generate created the link and relabelled the same
// button from Generate to Copy, so the only sign anything had happened was one
// word changing, and the address itself never appeared anywhere. Pressing it
// again called the clipboard, which a browser may refuse and always refuses on
// an insecure page, with nothing written to catch the refusal, so a browser
// saying no looked exactly like a button that worked.
// ============================================================
describe('an intake link somebody has to send', () => {
  const DASH = fs.readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')

  it('shows the address instead of hiding it behind a button', () => {
    expect(DASH).toContain("import CopyLink from '@/components/common/CopyLink'")
    expect(DASH).toContain('label="The link for a prospective client"')
    expect(DASH).toContain('The data capture link for ${client.name}')
  })

  it('never calls the clipboard without catching a refusal', () => {
    // CopyLink is the one place that handles it, by selecting the address and
    // saying to copy it by hand.
    const copy = fs.readFileSync('src/components/common/CopyLink.tsx', 'utf8')
    expect(copy).toContain('catch {')
    expect(copy).toContain('would not let the page copy for you')
    expect(DASH).not.toContain('navigator.clipboard.writeText(`https://clearview.habibonifade.com/intake/')
  })

  it('builds the address from the site it is actually on', () => {
    // It was pinned to clearview.habibonifade.com, so a link copied from
    // staging sent the client to production and the other way round.
    expect(DASH).toContain("${typeof window==='undefined'?'':window.location.origin}/intake/")
    expect(DASH).not.toContain("'https://clearview.habibonifade.com/intake/")
  })

  it('says so when the link cannot be created', () => {
    // The failure used to be swallowed whole, so a link that could not be made
    // looked the same as one nobody had pressed for yet.
    expect(DASH).toContain("setErr(error?.message||'The link could not be created.')")
  })
})
