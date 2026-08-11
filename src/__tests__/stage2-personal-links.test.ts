import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import path from 'path'
import {
  ANONYMOUS_NOTICE,
  GUEST_LABEL,
  LINK_CLOSED,
  PERSONAL_GRANT_TYPE,
  PERSONAL_LINK_PARAM,
  personalLinkMessage,
  personalLinkUrl,
  refusePersonalLink,
  showsAnonymousNotice,
  submissionIdentity,
} from '../lib/stage2-personal-links'

const NOW = Date.UTC(2026, 7, 11, 12, 0, 0)

function grant(over: Record<string, unknown> = {}) {
  return {
    grant_type: PERSONAL_GRANT_TYPE,
    revoked_at: null,
    expires_at: null,
    party_id: 'party-1',
    client_id: 'client-1',
    ...over,
  }
}

describe('R37. A personal link stops the moment it is withdrawn', () => {
  it('lets a live link through', () => {
    expect(refusePersonalLink(grant(), 'active', NOW)).toBeNull()
  })

  it('refuses a revoked link', () => {
    expect(refusePersonalLink(grant({ revoked_at: '2026-08-11T11:00:00Z' }), 'active', NOW)).toBe('revoked')
  })

  it('refuses a link that is not there at all', () => {
    expect(refusePersonalLink(null, 'active', NOW)).toBe('not_a_personal_link')
    expect(refusePersonalLink(undefined, 'active', NOW)).toBe('not_a_personal_link')
  })

  it('refuses a grant of some other kind, even a valid one', () => {
    // A session link must never be usable as a personal link. It would carry
    // an identity it was never issued with.
    expect(refusePersonalLink(grant({ grant_type: 'gtcv_session' }), 'active', NOW)).toBe('not_a_personal_link')
    expect(refusePersonalLink(grant({ party_id: null }), 'active', NOW)).toBe('not_a_personal_link')
  })
})

describe('R34 as amended. Permanent means for the life of the engagement', () => {
  it('a finished engagement closes its links', () => {
    expect(refusePersonalLink(grant(), 'complete', NOW)).toBe('engagement_closed')
  })

  it('a PAUSED engagement does not', () => {
    // A pause is a thing that resumes. Killing eight people's links on a pause
    // would be a destruction dressed up as a rule.
    expect(refusePersonalLink(grant(), 'paused', NOW)).toBeNull()
  })

  it('runs through every working state of an engagement', () => {
    for (const s of ['setup', 'phase_0', 'dp01', 'dp05', 'dp09', 'active', null, undefined]) {
      expect(refusePersonalLink(grant(), s, NOW)).toBeNull()
    }
  })

  it('honours an expiry date if one was ever written', () => {
    expect(refusePersonalLink(grant({ expires_at: '2026-08-11T11:59:00Z' }), 'active', NOW)).toBe('expired')
    expect(refusePersonalLink(grant({ expires_at: '2026-09-11T00:00:00Z' }), 'active', NOW)).toBeNull()
  })
})

describe('R39. What a submission records about who made it', () => {
  const person = { personId: 'party-1', personName: 'Grace Achieng' }
  const guest = { personId: null, personName: null }

  it('records the person on a NAMED question, and shows their name', () => {
    const r = submissionIdentity(person, true)
    expect(r.identityPartyId).toBe('party-1')
    expect(r.displayName).toBe('Grace Achieng')
    expect(r.isGuest).toBe(false)
  })

  it('records the person on an ANONYMOUS question, and shows NO name', () => {
    // The heart of R39 against R18. The record has an owner. The screen has
    // nothing to show, because there is nothing in the column screens read.
    const r = submissionIdentity(person, false)
    expect(r.identityPartyId).toBe('party-1')
    expect(r.displayName).toBeNull()
    expect(r.isGuest).toBe(false)
  })

  it('marks somebody who came in on the room code as a guest', () => {
    expect(submissionIdentity(guest, true).isGuest).toBe(true)
    expect(submissionIdentity(guest, false).isGuest).toBe(true)
  })

  it('a guest on an anonymous question leaves no name and no identity', () => {
    const r = submissionIdentity(guest, false)
    expect(r.displayName).toBeNull()
    expect(r.identityPartyId).toBeNull()
  })
})

describe('R39. The consent sentence', () => {
  it('appears on an anonymous question and only there', () => {
    expect(showsAnonymousNotice(false)).toBe(true)
    expect(showsAnonymousNotice(true)).toBe(false)
    // No question open is not an anonymous question.
    expect(showsAnonymousNotice(null)).toBe(false)
    expect(showsAnonymousNotice(undefined)).toBe(false)
  })

  it('is the sentence that was agreed, word for word', () => {
    // Pinned. This sentence IS the consent for R39; a later tidy-up that
    // softens it would remove the thing that makes recording identity honest.
    expect(ANONYMOUS_NOTICE).toBe(
      'Your name is not shown on screen and is not shown to anyone in this room, but it is recorded in the system.',
    )
  })
})

describe('The two other sentences that were given word for word', () => {
  it('a withdrawn link says one thing and explains nothing', () => {
    expect(LINK_CLOSED).toBe('This link is no longer open. Please speak to your facilitator.')
    // No removal language. This is read on a phone in a lit room.
    expect(LINK_CLOSED.toLowerCase()).not.toContain('remov')
    expect(LINK_CLOSED.toLowerCase()).not.toContain('revok')
  })

  it('a visitor is called Guest', () => {
    expect(GUEST_LABEL).toBe('Guest')
  })
})

describe('R34 and R36. The link and the message', () => {
  it('puts the value in the address under the agreed short name', () => {
    expect(personalLinkUrl('https://x.test', 'abc123')).toBe('https://x.test/room?p=abc123')
    expect(PERSONAL_LINK_PARAM).toBe('p')
  })

  it('escapes a token rather than pasting it in raw', () => {
    expect(personalLinkUrl('https://x.test', 'a b&c')).toBe('https://x.test/room?p=a%20b%26c')
  })

  it('writes a message that carries the link and warns it is personal', () => {
    const m = personalLinkMessage('Grace', 'Ikore', 'https://x.test/room?p=t')
    expect(m).toContain('Grace')
    expect(m).toContain('Ikore')
    expect(m).toContain('https://x.test/room?p=t')
    expect(m).toContain('anyone who opens it will be answering as you')
    // R6 still holds on the other side of that link.
    expect(m).toContain('You do not need a code, a password or an app')
  })

  it('still works for somebody with no organisation and no name', () => {
    const m = personalLinkMessage('', null, 'https://x.test/room?p=t')
    expect(m).toContain('Hello')
    expect(m).toContain('https://x.test/room?p=t')
  })
})

// ============================================================
// THE ONE THAT MATTERS MOST.
//
// The instruction was: "Who may see it: nobody, in any interface, ever. Not
// the facilitator, not a report, not an export... If a route or an export
// would reveal it, that is a fault and you tell me."
//
// A comment saying so is not enforcement. This is.
// ============================================================
describe('identity_party_id is never read by anything', () => {
  const root = path.resolve(__dirname, '../..')

  function walk(dir: string, out: string[] = []): string[] {
    if (!existsSync(dir)) return out
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) walk(full, out)
      else if (/\.(ts|tsx|mjs|js)$/.test(entry)) out.push(full)
    }
    return out
  }

  const files = [...walk(path.join(root, 'app')), ...walk(path.join(root, 'src')), ...walk(path.join(root, 'scripts'))]

  it('is written in exactly one place and read in none', () => {
    expect(files.length).toBeGreaterThan(50)

    const offenders: string[] = []
    for (const f of files) {
      // This test file names the column in order to test for it.
      if (f.endsWith('stage2-personal-links.test.ts')) continue
      const text = readFileSync(f, 'utf8')
      if (!text.includes('identity_party_id')) continue

      // The participant route WRITES it. That is the only allowed mention in
      // code, and only there.
      const isTheWriter = f.endsWith(path.join('app', 'api', 'room', 'route.ts'))
      if (!isTheWriter) { offenders.push(path.relative(root, f)); continue }

      // Even in the writer, it must never appear inside a .select(...).
      for (const m of text.match(/\.select\([^)]*\)/g) || []) {
        if (m.includes('identity_party_id')) offenders.push(`${path.relative(root, f)} selects it`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('no route hands the whole submission row back with a bare star select', () => {
    // select('*') on gtcv_submissions would carry the identity out without
    // ever naming it, which is how this rule gets broken by accident.
    const offenders: string[] = []
    for (const f of files) {
      if (f.endsWith('stage2-personal-links.test.ts')) continue
      const text = readFileSync(f, 'utf8')
      if (!text.includes('gtcv_submissions')) continue
      if (/from\('gtcv_submissions'\)\s*\.\s*select\(\s*['"`]\*/.test(text)) {
        offenders.push(path.relative(root, f))
      }
    }
    expect(offenders).toEqual([])
  })
})
