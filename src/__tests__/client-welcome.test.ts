// ============================================================
// THE LETTER A NEW BUSINESS GETS. 12 September 2026.
//
// Habib: I would also like a similar email sent to the Clearview financial
// model when a client is created.
//
// Nothing went at all. Somebody filled in a long form about their business,
// pressed Submit, saw a thank you on the screen and then heard nothing, with
// no record in their own inbox that it had arrived and nothing about what
// happens next.
//
// The dangerous part of fixing it is that the intake form is a public page, so
// whatever sends this letter is reachable by anybody. These tests hold the
// four things that make that safe.
// ============================================================
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const ROUTE = fs.readFileSync('app/api/client-welcome/route.ts', 'utf8')
const FORM = fs.readFileSync('src/components/intake/ClientIntakeForm.tsx', 'utf8')
const SHEET = fs.readFileSync('src/components/intake/SpreadsheetUpload.tsx', 'utf8')

describe('an unauthenticated caller cannot misuse it', () => {
  it('takes a client id and nothing else, so the letter cannot be aimed', () => {
    // The address comes off the client record. A caller who could pass an
    // address would have a way to post a branded letter at anybody.
    expect(ROUTE).toContain("const clientId = String(body.clientId || '')")
    expect(ROUTE).toContain("cleanEmail(client.contact_email || '')")
    expect(ROUTE).not.toMatch(/body\.(to|email|address)\b/)
  })

  it('will not let a caller put words in it', () => {
    // Every paragraph is fixed text in this file. The only things that vary
    // are the business name and the contact name, both escaped.
    expect(ROUTE).toContain('escapeHtml(business)')
    expect(ROUTE).not.toMatch(/body\.(subject|heading|message|paragraphs)\b/)
  })

  it('sends once per client and refuses afterwards', () => {
    expect(ROUTE).toContain('if (client.welcome_sent_at)')
    expect(ROUTE).toContain('alreadySent: true')
    expect(ROUTE).toContain("update({ welcome_sent_at:")
  })

  it('is rate limited on top of that', () => {
    expect(ROUTE).toContain("checkRateLimit(admin, `client-welcome:${clientId}`, 3, 3600)")
  })
})

describe('what the letter says', () => {
  it('says what Clearview is and what happens next', () => {
    expect(ROUTE).toContain('What Clearview is.')
    expect(ROUTE).toContain('What happens next.')
  })

  it('does not promise a sign in that does not exist yet', () => {
    // A business that has just submitted an intake form has no account. The
    // account is made later by a coach through /api/invite-user. Telling
    // somebody to sign in when they cannot is worse than telling them nothing.
    expect(ROUTE).toContain('You are then sent your own sign in')
    expect(ROUTE).not.toMatch(/Sign in now|ctaLabel: 'Sign in'/)
  })

  it('gives the inbox a preview line of its own', () => {
    expect(ROUTE).toContain('preheader:')
  })

  it('invites a correction while one is still cheap', () => {
    expect(ROUTE).toContain('easier to correct at this stage')
  })
})

describe('where it is sent from', () => {
  it('goes when a client fills the form in themselves', () => {
    expect(FORM).toContain("fetch('/api/client-welcome'")
  })

  it('goes when a coach loads a spreadsheet for a new client', () => {
    expect(SHEET).toContain("fetch('/api/client-welcome'")
  })

  it('never turns a mail failure into a failed submission', () => {
    // Everything is already saved by that point. Surfacing it as "submission
    // failed" would invite somebody to send the whole form a second time.
    for (const src of [FORM, SHEET]) {
      const at = src.indexOf("fetch('/api/client-welcome'")
      expect(src.slice(at, at + 400)).toContain('catch')
    }
  })
})
