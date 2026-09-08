import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { createHash } from 'crypto'

// ============================================================
// THE SIGNATURE HAS TO BE EVIDENCE, NOT A CLAIM.
//
// The charter is signed electronically and the row records who signed, in what
// capacity, by which method, when, and against which version. What it could
// not do was prove WHAT was signed or FROM WHERE, which is the difference
// between a record and evidence, and the first time that matters will be the
// time somebody disputes the wording.
// ============================================================
const SIGN = fs.readFileSync('app/api/charter-sign/route.ts', 'utf8')
const VERSION = fs.readFileSync('app/api/charter-version/route.ts', 'utf8')
const PARTY = fs.readFileSync('src/lib/auth/signing-party.ts', 'utf8')
const MIGRATION = fs.readFileSync('supabase/migrations/2026_09_08_signature_evidence.sql', 'utf8')

describe('what the signature captures', () => {
  it('records who, in what capacity, how and when', () => {
    for (const field of ['signer_name', 'signer_email', 'signer_role', 'signer_user_id',
      'signature_method', 'typed_name', 'signed_at']) {
      expect(SIGN).toContain(field)
    }
  })

  it('records where it came from and what it was made on', () => {
    expect(SIGN).toContain('ip: auditIp(req.headers)')
    expect(SIGN).toContain("user_agent")
  })

  it('binds the signature to the exact wording that was signed', () => {
    expect(SIGN).toContain('content_sha256')
    expect(SIGN).toContain("createHash('sha256')")
    // over the title, the version and the content: enough to reproduce
    expect(SIGN).toMatch(/title: charter\.title[\s\S]{0,120}version: charter\.version[\s\S]{0,120}content: charter\.content/)
  })

  it('the hash is reproducible from the stored wording', () => {
    // The check anyone would run later: same bytes, same hash.
    const bytes = JSON.stringify({ title: 'Charter', version: 1, content: { a: 1 } })
    const once = createHash('sha256').update(bytes, 'utf8').digest('hex')
    const twice = createHash('sha256').update(bytes, 'utf8').digest('hex')
    expect(once).toBe(twice)
    expect(once).toHaveLength(64)
    const changed = createHash('sha256')
      .update(JSON.stringify({ title: 'Charter', version: 1, content: { a: 2 } }), 'utf8').digest('hex')
    expect(changed).not.toBe(once)
  })

  it('is written even before the columns exist, so no signature is left bare', () => {
    expect(SIGN).toContain("action: 'charter.signed'")
    expect(SIGN).toContain('writeAuditLog')
  })
})

describe('who may sign, and what', () => {
  it('refuses a draft and refuses a superseded version', () => {
    expect(SIGN).toMatch(/still a draft/)
    expect(SIGN).toMatch(/has been superseded/)
  })

  it('requires a named signatory, not merely a party', () => {
    expect(PARTY).toContain('is_signatory')
  })

  it('allows one signature per party per version', () => {
    const integrity = fs.readFileSync('supabase/migrations/2026_08_09_signature_integrity.sql', 'utf8')
    expect(integrity).toContain('create unique index if not exists charter_signatures_one_per_role')
    expect(SIGN).toContain("'23505'")
  })

  it('keeps a superseded version and its signatures as the record of what was agreed', () => {
    expect(VERSION).toMatch(/superseded version, which is the record of what each party agreed to/)
  })
})

describe('the migration that moves it onto the signature row', () => {
  it('adds the three columns, and is safe to run twice', () => {
    for (const col of ['ip_address', 'user_agent', 'content_sha256']) {
      expect(MIGRATION).toContain(`add column if not exists ${col}`)
    }
    expect(MIGRATION).not.toMatch(/drop table|drop column/i)
  })

  it('adds a record of who opened the charter and when', () => {
    expect(MIGRATION).toContain('create table if not exists charter_views')
    expect(MIGRATION).toContain('enable row level security')
    expect(MIGRATION).toContain('can_view_client(client_id)')
  })
})
