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

  it('is shown before the signature is taken', () => {
    expect(VIEW).toContain('attestationText(')
    // and the signature only happens if they accept it
    expect(VIEW).toMatch(/if \(!window\.confirm\(attestationText\([\s\S]{0,140}\)\) return/)
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
    expect(RECORD).toContain('fromAddress: maskIp(ev?.ip)')
  })
})
