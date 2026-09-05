import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { buildScopeEmail, buildTriPartyEmail } from '@/lib/email'

// ============================================================
// THE MECHANISM AROUND THE WELCOME LETTER.
// What the letters SAY is covered in engagement-brief.test.ts. This file is
// about the machinery: that it can be read before it is sent, that the button
// exists, and that the template does not print its own markup.
// ============================================================
const SETTINGS = fs.readFileSync('src/components/gtcv/EngagementSettings.tsx', 'utf8')
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

  it('offers nothing to press when there is nobody to send to', () => {
    expect(SETTINGS).toContain('No email address on the client or on any party yet')
  })
})
