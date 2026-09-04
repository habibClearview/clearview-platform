import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { buildScopeEmail } from '@/lib/email'

// ============================================================
// THE WELCOME EMAIL HAD NO BUTTON. 4 September 2026.
// buildScopeEmail and /api/engagement-email have existed for weeks; nothing
// in the app ever called them with stage 'scope', so the one email that
// brings a new client onto the platform could not be sent. Tanager signing
// is what surfaced it.
// ============================================================
const SETTINGS = fs.readFileSync('src/components/gtcv/EngagementSettings.tsx', 'utf8')

describe('the welcome email', () => {
  const built = buildScopeEmail({
    clientName: 'Tanager',
    engagementTitle: 'Commercial viability',
    recipientName: 'Ada',
    coachName: 'Habib Onifade',
    journeyUrl: 'https://clearview.habibonifade.com/engagement/tanager',
  } as never)

  it('names the client, the coach and the journey link', () => {
    expect(built.subject).toContain('Commercial viability')
    expect(built.html).toContain('Tanager')
    expect(built.html).toContain('Habib Onifade')
    expect(built.html).toContain('https://clearview.habibonifade.com/engagement/tanager')
  })

  it('uses the language the rest of the system uses', () => {
    // "Decision Point" is the agreed name. This one is client-facing, so it
    // is the last place that should still say something else.
    expect(built.html).toContain('Decision Points')
    expect(built.html).not.toMatch(/decision blocks/i)
    expect(built.html).not.toMatch(/\bZone \d/)
  })
})

describe('the button that sends it', () => {
  it('exists on the engagement setup tab', () => {
    expect(SETTINGS).toContain('sendEngagementEmail')
    expect(SETTINGS).toContain("stage: 'scope'")
  })

  it('reads the client contact and the parties, without duplicates', () => {
    expect(SETTINGS).toContain('new Set([client?.contact_email, ...partyEmails]')
  })

  it('does not call email switched off a success', () => {
    // The route answers 200 with emailConfigured false. Reporting that as sent
    // is the worst answer: the coach stops waiting for a reply never coming.
    expect(SETTINGS).toContain('emailConfigured === false')
  })

  it('offers nothing to press when there is nobody to send to', () => {
    expect(SETTINGS).toContain('No email address on the client or on any party yet')
  })
})
