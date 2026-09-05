import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { buildScopeEmail, buildTriPartyEmail } from '@/lib/email'

// ============================================================
// THE WELCOME EMAIL. 4 September 2026.
// It had no button, it rendered its own <b> tags as text, and it said
// "for Tanager on Tanager". It is the first thing a new client ever sees
// from the platform, and Tanager is the first client to get it.
// ============================================================
const SETTINGS = fs.readFileSync('src/components/gtcv/EngagementSettings.tsx', 'utf8')
const ROUTE = fs.readFileSync('app/api/engagement-email/route.ts', 'utf8')

const cfg = {
  clientName: 'Tanager',
  engagementTitle: 'Tanager',
  recipientName: 'Ada',
  coachName: 'Habib Onifade',
  engagementMode: 'canvas',
  journeyUrl: 'https://clearview.habibonifade.com/engagement/tanager',
} as never

describe('the welcome email', () => {
  const built = buildScopeEmail(cfg)

  it('renders its markup instead of printing it', () => {
    // paragraphs are escaped by default, so a builder that writes <b> into a
    // plain string ships "<b>Tanager</b>" to the reader as text.
    expect(built.html).toContain('<b>Tanager</b>')
    expect(built.html).not.toContain('&lt;b&gt;')
  })

  it('says the name once when the engagement has no separate title', () => {
    expect(built.html).not.toContain('Tanager on Tanager')
  })

  it('names the programme the work sits under', () => {
    const titled = buildScopeEmail({
      ...(cfg as object), brief: { payerName: 'Tanager', payerProgramme: 'IGNITE+' },
    } as never)
    expect(titled.html).toContain('under IGNITE+')
  })

  it('carries the guide, not just a link', () => {
    for (const heading of ['Who is who', 'What happens first']) {
      expect(built.html).toContain(heading)
    }
    expect(built.html).toContain('Open the engagement')
    expect(built.html).toContain('https://clearview.habibonifade.com/engagement/tanager')
  })

  it('tells them the sign-in arrives separately', () => {
    // Otherwise they press the link, find no password, and email to ask.
    expect(built.html).toMatch(/sign-in arrives in a separate email/i)
  })

  it('uses the language the rest of the system uses', () => {
    expect(built.html).toContain('Decision Points')
    expect(built.html).not.toMatch(/decision blocks/i)
    expect(built.html).not.toMatch(/\bZone \d/)
  })

  it('uses a font a mail client can resolve', () => {
    // The template's own comment says email clients do not support CSS
    // variables, and three var(--cv-font) had crept in under it.
    const src = fs.readFileSync('src/lib/email.ts', 'utf8')
    expect(src).not.toContain('font-family:var(--cv-font)')
  })

  it('escapes a client name that contains markup', () => {
    const nasty = buildScopeEmail({ ...(cfg as object), clientName: '<script>x</script>' } as never)
    expect(nasty.html).not.toContain('<script>x</script>')
  })

  it('says something honest for a financial-mode engagement', () => {
    const fin = buildScopeEmail({ ...(cfg as object), engagementMode: 'financial' } as never)
    expect(fin.html).toContain('financial mode')
    // and does not promise the nine Decision Points that mode does not run
    expect(fin.html).not.toContain('What it tracks')
  })
})

describe('the guide describes the engagement, not the coach\'s screens', () => {
  const built = buildScopeEmail(cfg)

  it('does not describe the coach\'s own tab list', () => {
    // CANVAS_TABS is what the COACH sees in their client view.
    for (const coachTab of ['Cover', 'Engagement Tracker', 'Hypothesis Tracker', 'Pre-engagement diagnostic']) {
      expect(built.html).not.toContain(coachTab)
    }
  })

  it('does not send a canvas client into the financial model', () => {
    // A separate service. Telling a GtCV client about a dashboard they did not
    // buy, and have no data in, is how the first impression is lost.
    expect(built.html).not.toContain('financial dashboard')
  })

  it('does not promise a document upload that does not exist', () => {
    expect(built.html).not.toMatch(/upload (your )?(contract|scope|terms of reference|tor)/i)
  })
})

describe('the tri-party email had the same escaping fault', () => {
  it('renders its markup too', () => {
    const built = buildTriPartyEmail(cfg)
    expect(built.html).toContain('<b>Tanager</b>')
    expect(built.html).not.toContain('&lt;b&gt;')
  })
})

describe('reading it before it is sent', () => {
  it('the preview is built by the route that sends, not a second copy', () => {
    expect(ROUTE).toContain('isPreview')
    // built first, then either returned or handed to the provider
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

describe('the button that sends it', () => {
  it('exists, reads client and parties, and does not call email-off a success', () => {
    expect(SETTINGS).toContain("stage: 'scope'")
    expect(SETTINGS).toContain('new Set([client?.contact_email, ...partyEmails]')
    expect(SETTINGS).toContain('emailConfigured === false')
    expect(SETTINGS).toContain('No email address on the client or on any party yet')
  })
})
