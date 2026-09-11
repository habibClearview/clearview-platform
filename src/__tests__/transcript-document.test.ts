// ============================================================
// EVIDENCE THAT CAN LEAVE THE PLATFORM
//
// 11 September 2026. Habib: I think there is a need to make sure the evidence
// is downloadable or shareable so it can be presented without the platform.
//
// A transcript that exists only behind a login is not evidence a funder, an
// auditor or a board can be shown. What makes the document evidence rather
// than a printout is what is on its face: the version the signatures were
// given on, every signature with the moment it was given, and the reference
// matching the evidence library entry.
// ============================================================
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { buildTranscriptDocument, TRANSCRIPT_ATTESTATION } from '@/lib/transcript-document'

const ROUTE = fs.readFileSync('app/api/transcript-document/route.ts', 'utf8')
const PANEL = fs.readFileSync('src/components/gtcv/TranscriptPanel.tsx', 'utf8')

const base = {
  organisation: 'Ikore International Development Ltd',
  sessionTitle: 'Pre-engagement conversation',
  recordedAt: '2026-09-11T09:00:00.000Z',
  seconds: 1860,
  version: 2,
  status: 'signed',
  issuedAt: '2026-09-11T10:00:00.000Z',
  body: '[00:00] Ovo Ugbebor: We work with smallholders.\n\n[00:31] Habib Onifade: How many?',
  wereInTheRoom: ['Ovo Ugbebor', 'Habib Onifade'],
  signatures: [
    { signer_name: 'Ovo Ugbebor', signer_role: 'lsp_ed', signature_method: 'typed', signed_at: '2026-09-11T11:00:00.000Z', version: 2 },
  ],
  reference: 'E-014',
}

describe('the document that comes out', () => {
  it('is a real Word file, the same kind as the Charter', async () => {
    const { buffer, fileName } = await buildTranscriptDocument(base)
    // A .docx is a zip, and every zip begins PK.
    expect(buffer.length).toBeGreaterThan(1000)
    expect(buffer.subarray(0, 2).toString()).toBe('PK')
    expect(fileName.endsWith('.docx')).toBe(true)
  })

  it('names the organisation and the session in the file name', async () => {
    const { fileName } = await buildTranscriptDocument(base)
    expect(fileName).toContain('Ikore')
    expect(fileName).toContain('Pre-engagement')
    expect(fileName).toContain('v2')
  })

  it('survives an organisation whose name is all punctuation', async () => {
    const { fileName } = await buildTranscriptDocument({ ...base, organisation: '!!!', sessionTitle: '???' })
    expect(fileName).toBe('engagement-session-transcript-v2.docx')
  })

  it('is produced even when nobody has signed yet', async () => {
    const { buffer } = await buildTranscriptDocument({ ...base, signatures: [], status: 'issued' })
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it('is produced even when the words are empty', async () => {
    const { buffer } = await buildTranscriptDocument({ ...base, body: '' })
    expect(buffer.length).toBeGreaterThan(1000)
  })
})

describe('what makes it evidence rather than a printout', () => {
  it('says what a signature on it means, on the document itself', () => {
    // A signature nobody can read the meaning of is a name on a page.
    expect(TRANSCRIPT_ATTESTATION).toContain('a record of what they said')
    expect(TRANSCRIPT_ATTESTATION).toContain('applies to the version named above')
    expect(TRANSCRIPT_ATTESTATION).toContain('no signature is ever carried onto words its signer did not read')
  })

  it('carries only the signatures given on the version being downloaded', () => {
    // A signature from an earlier version belongs to the words that version
    // carried, not to these.
    expect(ROUTE).toContain(".eq('version', transcript.version || 1)")
  })

  it('carries the evidence reference, so the paper and the entry match', () => {
    expect(ROUTE).toContain("from('evidence_library')")
    expect(ROUTE).toContain('reference: evidence?.reference')
  })
})

describe('what does not travel with it', () => {
  it('leaves the audio on the platform, and says so', () => {
    // A recording of somebody's voice that can be forwarded cannot afterwards
    // be withdrawn, and consent was given for this engagement rather than for
    // wherever a file might reach.
    const lib = fs.readFileSync('src/lib/transcript-document.ts', 'utf8')
    expect(lib).toContain('cannot afterwards be withdrawn')
    expect(lib).toContain('not attached to this document')
  })

  it('is not an address anybody can hold', () => {
    expect(PANEL).toContain('Authorization: `Bearer ${data.session.access_token}`')
    expect(ROUTE).toContain("'Cache-Control': 'private, no-store'")
  })
})

describe('who may take it', () => {
  it('is anybody on the engagement, not only the coaching team', () => {
    // They were either in the room or work under what was decided in it, and a
    // party who cannot obtain the record they signed is asked to take it on
    // trust.
    expect(ROUTE).toContain("'view'")
    expect(ROUTE).not.toContain("'manage'")
  })

  it('is offered on the screen wherever a transcript exists', () => {
    expect(PANEL).toContain("'Download it'")
  })
})
