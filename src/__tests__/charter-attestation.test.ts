import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { attestationText, ATTESTATION_SUMMARY, ATTESTATION_VERSION } from '@/lib/charter-attestation'

const SIGN = fs.readFileSync('app/api/charter-sign/route.ts', 'utf8')
const VERSION = fs.readFileSync('app/api/charter-version/route.ts', 'utf8')
const RECORD = fs.readFileSync('app/api/charter-record/route.ts', 'utf8')
const VIEW = fs.readFileSync('src/components/engagement/EngagementCharterView.tsx', 'utf8')

describe('pressing the button is consent, not a click', () => {
  it('says what the signer is agreeing to, in their own name', () => {
    const t = attestationText('Engagement Charter', 3, 'Uche Amaonwu')
    expect(t).toContain('Uche Amaonwu')
    expect(t).toContain('version 3')
    expect(t).toContain('agree to it')
    expect(t).toContain('electronic signature')
    expect(t).toContain('same effect as signing it by hand')
  })

  it('is on the screen above the box, not in a dialog that is pressed past', () => {
    // A SIGNATURE IS A NAME, NOT A BUTTON PRESS. 9 September 2026. The words
    // being agreed to now sit beside the signature line where they are read,
    // rather than in a confirm box, and the signature is the person typing
    // their own name.
    expect(VIEW).toContain('attestationText(charter?.title')
    expect(VIEW).toContain('Type your full name')
    expect(VIEW).toContain("signatureMethod: 'typed'")
    expect(VIEW).not.toContain('window.confirm(attestationText')
  })

  it('will not send a signature until a name has been typed', () => {
    expect(VIEW).toContain("!(typedName[p.id] || '').trim()")
  })

  it('still has to be their own name, on the letters alone', () => {
    // A double space or a full stop after an initial is not somebody else.
    expect(SIGN).toContain("replace(/[^a-z]/g, '')")
    expect(SIGN).toContain('stops one person signing as another')
  })

  it('keeps the paper route, as small print rather than as the way to sign', () => {
    expect(VIEW).toContain('record it here')
    expect(VIEW).toContain('If they signed on paper')
  })

  it('shows a signature to everybody as it lands, without a reload', () => {
    expect(VIEW).toContain('EVERYBODY SEES THE SIGNING AS IT HAPPENS')
    expect(VIEW).toContain('setInterval')
  })

  it('is stored with the signature, not looked up later', () => {
    // Otherwise changing this wording would rewrite what somebody already agreed.
    expect(SIGN).toContain('attestation: attestationText(')
    expect(SIGN).toContain('attestation_version: ATTESTATION_VERSION')
    expect(ATTESTATION_VERSION).toBeGreaterThan(0)
    expect(ATTESTATION_SUMMARY).toBeTruthy()
  })
})

describe('every edit is recorded', () => {
  it('logs who changed it and what changed', () => {
    expect(VERSION).toContain("action: 'charter.edited'")
    expect(VERSION).toContain('edited_by: auth.fullName')
    expect(VERSION).toContain("changed: [")
  })

  it('still refuses everyone but the lead consultant, and refuses an issued version', () => {
    expect(VERSION).toContain('requireManager')
    expect(VERSION).toMatch(/This version has been issued\. Re-issue to make changes/)
  })
})

describe('the record can be read by the people relying on it', () => {
  it('is readable by anyone who can view the engagement, not only the coach', () => {
    expect(RECORD).toContain('access.canView')
    expect(RECORD).not.toContain('access.canManage')
  })

  it('shows the signature, the attestation and the fingerprint', () => {
    for (const f of ['attestation', 'content_sha256', 'signed_at', 'signature_method']) {
      expect(RECORD).toContain(f)
    }
    expect(VIEW).toContain('The record of this Charter')
    expect(VIEW).toContain('Wording fingerprint')
    expect(VIEW).toContain('Last edited')
  })

  it('does not publish a whole address on a page', () => {
    // An address is evidence for a dispute, not something to print for everyone.
    expect(RECORD).toContain('function maskIp')
    expect(RECORD).toMatch(/fromAddress: maskIp\(/)
  })
})
