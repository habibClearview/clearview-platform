import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { buildScopeEmail, buildTriPartyEmail } from '@/lib/email'

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

  it('the screen shows it sandboxed, with its subject', () => {
    expect(SETTINGS).toContain('preview: true')
    expect(SETTINGS).toContain('sandbox=""')
    expect(SETTINGS).toContain('emailPreview.subject')
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
    expect(SETTINGS).toContain("welcomeAudience === 'payer' ? 'letterPayer' : 'letterServed'")
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
  it('asks who the letter is to, and which of the two letters it is', () => {
    expect(SETTINGS).toContain('recipientName: toName, recipientTitle: toTitle')
    expect(SETTINGS).toContain('audience: welcomeAudience')
    expect(SETTINGS).toContain('the paying client')
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
    expect(SETTINGS).toContain('it can be read but not sent')
  })
})
