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
  // 12 September 2026. Habib: the name of the product is wrong, this is not
  // Grant-to-Commercial Viability, this is the Clearview financial model. And
  // the letter should talk about the features, the catalogue, the full
  // accounts compiled, and what the field operators can do.
  it('carries the Clearview name and not the Canvas one', () => {
    const EMAIL = fs.readFileSync('src/lib/email.ts', 'utf8')
    expect(ROUTE).toContain("brand: 'clearview'")
    expect(EMAIL).toContain("clearview: {")
    expect(EMAIL).toContain("eyebrow: 'Clearview'")
    // Not to be confused with the Viability Model decision point, which is a
    // block inside the Canvas and a different thing entirely.
    expect(ROUTE).not.toContain('Grant-to-Commercial Viability')
  })

  it('leaves every existing letter on the Canvas banner', () => {
    // The brand defaults, so no letter that never asked for one changes.
    const EMAIL = fs.readFileSync('src/lib/email.ts', 'utf8')
    expect(EMAIL).toContain("BRANDS[input.brand || 'canvas']")
    expect(EMAIL).toContain("name: 'Grant-to-Commercial Viability'")
  })

  it('names the price list and what it is for', () => {
    expect(ROUTE).toContain('Your price list.')
    expect(ROUTE).toContain('the same thing cannot be sold at two prices')
  })

  it('names the accounts that get compiled', () => {
    expect(ROUTE).toContain('A full set of accounts, compiled for you.')
    expect(ROUTE).toContain('Profit and Loss, Cash Flow and Balance Sheet')
  })

  it('says what a field operator can actually do', () => {
    expect(ROUTE).toContain('Your field team, on any phone.')
    expect(ROUTE).toContain('They record a sale')
    expect(ROUTE).toContain('They record a cost')
    expect(ROUTE).toContain('receive stock')
    expect(ROUTE).toContain('keeps working with no signal')
    expect(ROUTE).toContain('read the words out loud')
  })

  it('says what happens next', () => {
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

  // 12 September 2026. Habib: the first paragraph is wrong, it should say you
  // are invited to set up your business in Clearview. Remove any reference to
  // the coach. And the last sentence about wrong figures should not be there,
  // it should tell the receiver that the field operator just needs to start
  // entering every sale and money spent into the app for all the good things
  // to happen.
  it('opens by inviting them to set the business up', () => {
    expect(ROUTE).toContain('You are invited to set up')
    expect(ROUTE).not.toContain('The details you sent')
  })

  it('never mentions a coach, because the letter is from Clearview', () => {
    const body = ROUTE.slice(ROUTE.indexOf('const html = brandedEmail({'), ROUTE.indexOf('const sent = await sendEmail({'))
    expect(body).not.toMatch(/coach/i)
    const EMAIL = fs.readFileSync('src/lib/email.ts', 'utf8')
    expect(EMAIL).toContain("foot: 'Clearview · habibonifade.com'")
  })

  it('ends on the one thing they have to do', () => {
    // It used to end by inviting a correction to the figures, which puts
    // paperwork in front of somebody at the moment they should be told how
    // little there is to do.
    expect(ROUTE).toContain('Then there is one thing to do.')
    expect(ROUTE).toContain('enter every sale and every amount spent into the app')
    expect(ROUTE).not.toContain('easier to correct at this stage')
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
