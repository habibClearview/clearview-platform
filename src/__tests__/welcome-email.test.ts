import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { buildScopeEmail, buildTriPartyEmail } from '@/lib/email'
import { briefFromConfig, briefIntoConfig, cleanEmail, emailLooksSendable } from '@/lib/engagement-brief'
import { readFileSync } from 'node:fs'

// ============================================================
// THE MECHANISM AROUND THE WELCOME LETTER.
// What the letters SAY is covered in engagement-brief.test.ts. This file is
// about the machinery: that it can be read before it is sent, that the button
// exists, and that the template does not print its own markup.
// ============================================================
const SETTINGS = fs.readFileSync('src/components/gtcv/WelcomePack.tsx', 'utf8')
const DASH = fs.readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')
const ROUTE = fs.readFileSync('app/api/engagement-email/route.ts', 'utf8')

const cfg = {
  clientName: 'Tanager',
  engagementTitle: 'Tanager',
  recipientName: 'Morgan Mercer',
  recipientTitle: 'Mr',
  coachName: 'Habib Onifade',
  engagementMode: 'canvas',
  journeyUrl: 'https://clearview.habibonifade.com/engagement/tanager',
} as never

describe('the template renders markup instead of printing it', () => {
  it('in the welcome letter', () => {
    const built = buildScopeEmail(cfg)
    expect(built.html).not.toContain('&lt;b&gt;')
    expect(built.html).not.toContain('&lt;br/&gt;')
  })

  it('in the tri-party email, which had the same fault', () => {
    const built = buildTriPartyEmail(cfg)
    expect(built.html).toContain('<b>Tanager</b>')
    expect(built.html).not.toContain('&lt;b&gt;')
  })

  it('uses a font a mail client can resolve', () => {
    // The template's own comment says email clients do not support CSS
    // variables, and three var(--cv-font) had crept in under it.
    expect(fs.readFileSync('src/lib/email.ts', 'utf8')).not.toContain('font-family:var(--cv-font)')
  })
})

describe('reading it before it is sent', () => {
  it('the preview is built by the route that sends, not a second copy', () => {
    expect(ROUTE).toContain('isPreview')
    expect(ROUTE.indexOf('buildScopeEmail(cfg)')).toBeLessThan(ROUTE.indexOf('if (isPreview)'))
    expect(ROUTE.indexOf('if (isPreview)')).toBeLessThan(ROUTE.indexOf('await sendEmail('))
  })

  it('a preview does not send, spend the send budget, or need email switched on', () => {
    expect(ROUTE).toMatch(/isPreview[\s\S]{0,120}checkRateLimit/)
    expect(ROUTE.indexOf('if (isPreview)')).toBeLessThan(ROUTE.indexOf('emailAvailable()'))
  })

  it('the screen shows it, with its subject', () => {
    expect(SETTINGS).toContain('preview: true')
    expect(SETTINGS).toContain('emailPreview.subject')
    // Not in an iframe: the app's own frame-ancestors and default-src refuse
    // its own srcdoc frame, which drew "refused to connect" instead of the letter.
    expect(SETTINGS).not.toContain('srcDoc')
  })
})

describe('where the welcome pack lives', () => {
  it('is on the Cover tab, the screen opening a client lands on', () => {
    // It was five tabs deep beside the momentum flag, which is where Habib
    // looked for it and did not find it.
    expect(DASH).toContain("shownTab==='cover'&&<>{mayRun?<WelcomePack")
    expect(DASH).toContain("import WelcomePack from '@/components/gtcv/WelcomePack'")
  })

  it('is where a won deal lands you', () => {
    // Marking a deal Won pre-filled the client form and then stopped. It now
    // opens the client it just made, on the tab the welcome pack is on.
    expect(DASH).toContain('cameFromAWonDeal')
    expect(DASH).toMatch(/cameFromAWonDeal\)\{setSelClientId\(data\.id\);setActiveTab\('cover'\)/)
  })

  it('takes the contract straight off the signed document', () => {
    expect(SETTINGS).toContain('/api/tor-extract')
    expect(SETTINGS).toContain('Read it from the contract')
  })

  it('exists in exactly one place, so the screen and the letter cannot drift', () => {
    const settings = fs.readFileSync('src/components/gtcv/EngagementSettings.tsx', 'utf8')
    expect(settings).not.toContain('The engagement brief')
    expect(settings).not.toContain('Send the welcome email')
  })
})

describe('the letter can be edited on the screen', () => {
  it('has an editor, saved per audience', () => {
    // Habib asked for this twice. A template with one editable line is not a
    // letter he can send over his own name.
    expect(SETTINGS).toContain('Edit the letter')
    expect(SETTINGS).toContain('Save the letter')
    expect(SETTINGS).toMatch(/\? 'letterPayer' : 'letterServed'/)
  })

  it('can be put back to the generated letter', () => {
    expect(SETTINGS).toContain('Start again from the generated letter')
  })

  it('loads the generated text to edit when nothing is saved yet', () => {
    expect(SETTINGS).toContain('wantText: true')
    expect(ROUTE).toContain('letterText(cfg)')
  })
})

describe('the stage of the engagement is findable', () => {
  it('the button that holds it says so', () => {
    // It read "Edit Name / Type / Programme", so the one control that moves an
    // engagement to pre-engagement was behind a label that never mentioned it.
    expect(DASH).toContain('Edit name, stage and programme')
    expect(DASH).not.toContain('Edit Name / Type / Programme')
  })

  it('and the stage before the work starts is called what Habib calls it', () => {
    expect(fs.readFileSync('src/lib/coach-types.ts', 'utf8')).toContain("setup:'Pre-engagement'")
  })
})

describe('the send screen', () => {
  it('reads the letter as one of the people who will receive it', () => {
    // It used to have its own name and title boxes, separate from the
    // recipient list, so leaving them empty produced "Dear colleague," and
    // that read as the letter about to be sent.
    expect(SETTINGS).toContain('Read it as')
    expect(SETTINGS).toContain('recipientName: previewing ? previewing.name')
    expect(SETTINGS).toContain('audience: previewing ? previewing.audience')
    expect(SETTINGS).not.toContain('recipientName: toName')
  })

  it('says which recipients would open "Dear colleague,"', () => {
    expect(SETTINGS).toContain('nameless')
    expect(SETTINGS).toContain('no name on the list')
  })

  it('edits the letter for whichever side is being read', () => {
    expect(SETTINGS).toContain("(previewing ? previewing.audience : welcomeAudience) === 'payer'")
  })

  it('reads the client contact and the parties, without duplicates', () => {
    expect(SETTINGS).toContain('new Set([client?.contact_email, ...partyEmails]')
  })

  it('does not call email switched off a success', () => {
    expect(SETTINGS).toContain('emailConfigured === false')
  })

  it('lets the letter be read when there is nobody to send it to', () => {
    // It used to hide the whole thing behind "no email address yet", which is
    // exactly when you most want to read what you are about to send.
    expect(SETTINGS).toContain('the letter can be read but not sent')
  })
})

// ============================================================
// THE LETTER LANDS ON THEIR DASHBOARD
//
// It used to land on /engagement/[slug], the journey canvas: a picture of the
// engagement rather than the place the work is done, identical for everybody,
// with nothing on it saying the reader was signed in. A client who had just
// set a password arrived at what read as a brochure, three times over, and
// each time I looked for a routing fault instead of opening the page.
//
// The destination is now /client, which resolves who the reader is from their
// own session and serves the dashboard their role gets. These tests hold the
// button's wording to the same promise, because a button that says one thing
// and does another is how the last three hours were spent.
// ============================================================
describe('the welcome letter opens the reader’s dashboard', () => {
  const cfg = {
    engagementTitle: 'Test engagement',
    clientName: 'Test Organisation',
    coachName: 'Habib Onifade',
    journeyUrl: 'https://clearview.habibonifade.com/client',
    engagementMode: 'canvas' as const,
    brief: {},
    audience: 'served' as const,
  }

  it('the button goes where the letter says it goes', () => {
    const { html } = buildScopeEmail({ ...cfg, signInIncluded: true })
    expect(html).toContain('https://clearview.habibonifade.com/client')
    expect(html).toContain('open your dashboard')
  })

  it('says so whether or not it carries the sign-in', () => {
    const withSignIn = buildScopeEmail({ ...cfg, signInIncluded: true }).html
    const without = buildScopeEmail({ ...cfg, signInIncluded: false }).html
    expect(withSignIn).toContain('Set your password and open your dashboard')
    expect(without).toContain('Open your dashboard')
  })

  it('the payer’s letter lands in the same place, and their own role decides what they get', () => {
    const { html } = buildScopeEmail({ ...cfg, audience: 'payer', signInIncluded: true })
    expect(html).toContain('https://clearview.habibonifade.com/client')
  })

  it('no letter still points at the journey canvas', () => {
    for (const audience of ['payer', 'served'] as const) {
      const { html } = buildScopeEmail({ ...cfg, audience, signInIncluded: true })
      expect(html).not.toMatch(/href="[^"]*\/engagement\//)
    }
  })
})

// ============================================================
// ADDING SOMEBODY AFTER THE LETTERS HAVE GONE
//
// Habib asked what happens if he adds a recipient once the first email has
// already been sent. The answer was that he could not send to that person
// alone: the send walked every saved recipient, so reaching the new person
// meant posting a second copy to everybody who already had one, and nothing
// anywhere recorded who those people were.
//
// A recipient now carries the moment their letter was accepted. These tests
// hold the two rules that make it safe: the record is of what happened rather
// than what was attempted, and it can never be read as a licence to write to
// an address that is not on the engagement.
// ============================================================
describe('the record of who has had the letter', () => {
  it('keeps the moment a letter was accepted', () => {
    const brief = briefFromConfig({
      brief: {
        recipients: [
          { email: 'first@example.com', name: 'First Person', audience: 'served', sentAt: '2026-09-08T09:15:00.000Z' },
          { email: 'second@example.com', name: 'Second Person', audience: 'served' },
        ],
      },
    })
    expect(brief.recipients?.[0].sentAt).toBe('2026-09-08T09:15:00.000Z')
    expect(brief.recipients?.[1].sentAt).toBeUndefined()
  })

  it('treats a recipient saved before this existed as not sent to', () => {
    const brief = briefFromConfig({
      brief: { recipients: [{ email: 'old@example.com', audience: 'served' }] },
    })
    expect(brief.recipients?.[0].sentAt).toBeUndefined()
  })

  it('refuses a stamp that is not a real moment, rather than storing nonsense', () => {
    for (const bad of ['soon', '', 'yesterday', 42, null]) {
      const brief = briefFromConfig({
        brief: { recipients: [{ email: 'a@example.com', audience: 'served', sentAt: bad }] },
      })
      expect(brief.recipients?.[0].sentAt).toBeUndefined()
    }
  })

  it('normalises whatever shape a date arrives in', () => {
    const brief = briefFromConfig({
      brief: { recipients: [{ email: 'a@example.com', audience: 'served', sentAt: '2026-09-08' }] },
    })
    expect(brief.recipients?.[0].sentAt).toBe('2026-09-08T00:00:00.000Z')
  })

  it('survives a round trip through the config it is stored in', () => {
    const original = briefFromConfig({
      brief: { recipients: [{ email: 'a@example.com', audience: 'payer', sentAt: '2026-09-08T09:15:00.000Z' }] },
    })
    const stored = briefIntoConfig({ somethingElse: true }, original)
    const back = briefFromConfig(stored)
    expect(back.recipients?.[0].sentAt).toBe('2026-09-08T09:15:00.000Z')
    expect((stored as Record<string, unknown>).somethingElse).toBe(true)
  })
})

describe('a narrowed send can never become a wider one', () => {
  const ROUTE = readFileSync('app/api/engagement-email/route.ts', 'utf8')

  it('sends only to people already saved on the engagement', () => {
    expect(ROUTE).toContain('onlyEmails')
    expect(ROUTE).toContain('const known = new Set(saved.map((p) => p.email.toLowerCase()))')
    expect(ROUTE).toContain('list = saved.filter((p) => wanted.has(p.email.toLowerCase()))')
  })

  it('refuses an unknown address by name instead of quietly dropping it', () => {
    expect(ROUTE).toContain('is not')
    expect(ROUTE).toContain('Add them to the recipients and save before sending')
  })

  it('records only the addresses the provider accepted', () => {
    expect(ROUTE).toContain('const justSent = new Set(sentTo.map((e) => e.toLowerCase()))')
    expect(ROUTE).toContain('sentAt: new Date().toISOString()')
  })
})

// ============================================================
// ONE PERSON, ONE PRESS
//
// Habib added a recipient and could not send to that person alone. Ticking
// three boxes to untick two of them is not a way to write to one person, and a
// row that has been typed but not saved had no send button and no explanation,
// which reads as the platform refusing to add them at all.
// ============================================================
describe('sending to one person', () => {
  const PACK = readFileSync('src/components/gtcv/WelcomePack.tsx', 'utf8')

  it('every recipient carries their own send', () => {
    expect(PACK).toContain('onClick={() => sendWelcome([r.email], `one:${r.email}`)}')
    expect(PACK).toContain("'Send to them'")
    expect(PACK).toContain("'Send again'")
  })

  it('the row button and the bulk button go through the same routine', () => {
    // Two copies of a send is two ways for it to behave differently.
    expect(PACK).toContain('async function sendWelcome(emails, label)')
    expect(PACK).toContain("onClick={() => sendWelcome(sendTo, 'welcome')}")
  })

  it('sending to one person names only that person', () => {
    expect(PACK).toContain('...(people.length ? { onlyEmails: emails } : {})')
  })

  it('a second copy is asked for out loud, whichever button is pressed', () => {
    expect(PACK).toContain('has' + "' : '" + 'have')
    expect(PACK).toContain('already had this letter. Send it again?')
  })

  it('a typed but unsaved recipient is named, with what to press', () => {
    expect(PACK).toContain('not saved yet, so')
    expect(PACK).toContain('Save the recipients</b> above first')
  })

  it('one send at a time, so two presses cannot overlap', () => {
    expect(PACK).toContain('disabled={!!busy || !journeyUrl}')
  })
})

// ============================================================
// AN ADDRESS PASTED OUT OF A MAIL CLIENT
//
// Habib pasted kemiasuni@tanagerintl.org and the send came back "Unable to
// validate email address: invalid format", beside three working addresses at
// the same domain. What was actually stored was "kemiasuni@tanagerintl.org>",
// with a closing angle bracket: copying a name and address out of a mail
// client gives "Kemi Asuni <kemiasuni@tanagerintl.org>", and the tail of it
// survived the paste. The address really was malformed and nothing said which
// character was the problem.
// ============================================================
describe('an address is cleaned on the way in', () => {
  it('takes off the bracket that survives a half-copied paste', () => {
    expect(cleanEmail('kemiasuni@tanagerintl.org>')).toBe('kemiasuni@tanagerintl.org')
    expect(cleanEmail('<kemiasuni@tanagerintl.org')).toBe('kemiasuni@tanagerintl.org')
  })

  it('reads a name and address as the address', () => {
    expect(cleanEmail('Kemi Asuni <kemiasuni@tanagerintl.org>')).toBe('kemiasuni@tanagerintl.org')
    expect(cleanEmail('"Onuoha, Nkemjika" <nkemjika.onuoha@ikore.org>')).toBe('nkemjika.onuoha@ikore.org')
  })

  it('takes off a trailing comma, semicolon, full stop or space', () => {
    for (const messy of ['ovo@ikore.org,', 'ovo@ikore.org;', 'ovo@ikore.org.', '  ovo@ikore.org  ']) {
      expect(cleanEmail(messy)).toBe('ovo@ikore.org')
    }
  })

  it('lowercases, because an address is not case sensitive and a list is', () => {
    expect(cleanEmail('Ovo@Ikore.Org')).toBe('ovo@ikore.org')
  })
})

describe('what can actually be sent to', () => {
  it('accepts the real ones', () => {
    for (const good of ['ovo@ikore.org', 'nkemjika.onuoha@ikore.org', 'kemiasuni@tanagerintl.org', 'habib@habibonifade.com']) {
      expect(emailLooksSendable(good)).toBe(true)
    }
  })

  it('refuses what a person can see is wrong', () => {
    for (const bad of [
      'kemiasuni@tanagerintl.org>', 'ovo@ikore', 'ovo@', '@ikore.org', 'ovo ikore.org',
      'two people@ikore.org', 'ovo@ikore.org, nkemjika@ikore.org', '', 'a@b.c'.repeat(60),
    ]) {
      expect(emailLooksSendable(bad)).toBe(false)
    }
  })

  it('a saved recipient list drops nothing silently that the screen has not named', () => {
    // The list refuses a malformed address; the screen names it before saving,
    // so nobody discovers a missing recipient by counting the list.
    const brief = briefFromConfig({
      brief: {
        recipients: [
          { email: 'Kemi Asuni <kemiasuni@tanagerintl.org>', name: 'Oluwakemi Asuni', audience: 'payer' },
          { email: 'ovo@ikore.org', role: 'Managing Partner', audience: 'served' },
          { email: 'not an address', name: 'Nobody', audience: 'served' },
        ],
      },
    })
    expect(brief.recipients?.map((r) => r.email)).toEqual(['kemiasuni@tanagerintl.org', 'ovo@ikore.org'])
  })
})

// ============================================================
// THE LETTERS THAT WENT BEFORE ANYTHING RECORDED THEM
//
// Habib knows at least two of the funders received theirs. The platform does
// not, because nothing was writing it down when those letters went out. Putting
// a date on a letter I cannot see would be inventing a record, so this lets him
// say so himself, and take it back, without sending anything.
// ============================================================
describe('recording a letter that went before the record existed', () => {
  const PACK = readFileSync('src/components/gtcv/WelcomePack.tsx', 'utf8')

  it('every recipient can be marked as already having had it', () => {
    expect(PACK).toContain("'Already had it'")
    expect(PACK).toContain('is recorded as already having had it. Nothing was sent.')
  })

  it('says plainly that nothing is sent, because the button sits beside one that does', () => {
    expect(PACK).toContain('Record that they already had this letter, without sending anything')
  })

  it('can be taken back, and asks first', () => {
    expect(PACK).toContain("'Not actually sent'")
    expect(PACK).toContain('Nothing is sent either way.')
    expect(PACK).toContain('is back on the list to be written to.')
  })

  it('writes to the saved list, not to the browser', () => {
    expect(PACK).toContain("await api('PATCH', { clientId, brief: { ...brief, recipients: next } })")
  })

  it('one at a time, so a mark and a send cannot overlap', () => {
    expect(PACK).toContain('disabled={!!busy}')
  })
})
