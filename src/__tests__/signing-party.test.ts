// ============================================================
// THE ONLY SIGNATORY COULD NOT SIGN
//
// Ovo Ugbebor was added to the Ikore engagement as Managing Partner and its
// primary signatory, and has a login. The party row and the account had never
// been introduced, because a party carries user_id only when it was created
// with a login already attached. So signing in and pressing Sign here answered
// "you are not recorded as a party on this engagement", and the screen had
// already greyed the button and said only Ovo Ugbebor could sign that line,
// while being Ovo Ugbebor.
//
// A signature is the one thing here meant to bind a person to a decision, so
// these tests are as much about what must still be refused as about what now
// works. The address used to match is the one the provider verified at
// sign-in. Nothing in the request body is ever consulted for identity.
// ============================================================
import { describe, it, expect } from 'vitest'
import { resolveSigner, isRefusal } from '@/lib/auth/signing-party'

const CLIENT = 'client_test'
const ACCOUNT = 'user-ovo'

interface Row {
  id: string
  client_id: string
  party_role: string
  name: string
  email: string | null
  is_signatory: boolean
  user_id: string | null
}

const OVO: Row = {
  id: 'party-ovo', client_id: CLIENT, party_role: 'lsp_ed', name: 'Ovo Ugbebor',
  email: 'Ovo@Ikore.org', is_signatory: true, user_id: null,
}

/** A stand-in for the admin client: the party list, the account, and what was written. */
function fakeAdmin(rows: Row[], email: string | null, opts: { updateFails?: boolean } = {}) {
  const updates: { id: string; user_id: string }[] = []
  return {
    updates,
    from() {
      return {
        select: () => ({ eq: async () => ({ data: rows, error: null }) }),
        update(patch: { user_id: string }) {
          return {
            eq(_c: string, id: string) {
              return {
                is: async () => {
                  if (opts.updateFails) return { error: { message: 'no' } }
                  updates.push({ id, user_id: patch.user_id })
                  return { error: null }
                },
              }
            },
          }
        },
      }
    },
    auth: { admin: { getUserById: async () => ({ data: { user: email ? { email } : null } }) } },
  } as never
}

const self = (admin: never, extra: Record<string, unknown> = {}) =>
  resolveSigner(admin, { clientId: CLIENT, userId: ACCOUNT, canManage: false, ...extra })

describe('a signatory whose account has not been attached yet', () => {
  it('is matched by the address they signed in with', async () => {
    const r = await self(fakeAdmin([OVO], 'ovo@ikore.org'))
    expect(isRefusal(r)).toBe(false)
    if (isRefusal(r)) return
    expect(r.party.name).toBe('Ovo Ugbebor')
    expect(r.mode).toBe('self')
    expect(r.signerUserId).toBe(ACCOUNT)
  })

  it('is matched whatever case either address is written in', async () => {
    const r = await self(fakeAdmin([{ ...OVO, email: '  OVO@IKORE.ORG ' }], 'ovo@ikore.org'))
    expect(isRefusal(r)).toBe(false)
  })

  it('attaches the account to the party, so it happens once', async () => {
    const admin = fakeAdmin([OVO], 'ovo@ikore.org')
    await self(admin)
    expect((admin as unknown as { updates: unknown[] }).updates).toEqual([{ id: 'party-ovo', user_id: ACCOUNT }])
  })

  it('still signs when attaching the account fails', async () => {
    // Losing the link is a nuisance. Refusing a signature the person is
    // entitled to give is a failure.
    const r = await self(fakeAdmin([OVO], 'ovo@ikore.org', { updateFails: true }))
    expect(isRefusal(r)).toBe(false)
  })

  it('prefers an account already attached over any address', async () => {
    const attached: Row = { ...OVO, id: 'party-attached', user_id: ACCOUNT, email: 'someone.else@ikore.org' }
    const r = await self(fakeAdmin([attached, { ...OVO, id: 'party-loose' }], 'ovo@ikore.org'))
    expect(isRefusal(r)).toBe(false)
    if (isRefusal(r)) return
    expect(r.party.id).toBe('party-attached')
  })
})

describe('what matching by address must never do', () => {
  it('refuses when two parties share the address, rather than guessing', async () => {
    const rows = [OVO, { ...OVO, id: 'party-two', name: 'Someone Else' }]
    const r = await self(fakeAdmin(rows, 'ovo@ikore.org'))
    expect(isRefusal(r)).toBe(true)
    if (!isRefusal(r)) return
    expect(r.error).toContain('More than one party')
    expect(r.status).toBe(403)
  })

  it('refuses somebody whose address is on no party', async () => {
    const r = await self(fakeAdmin([OVO], 'stranger@example.com'))
    expect(isRefusal(r)).toBe(true)
    if (!isRefusal(r)) return
    expect(r.error).toContain('not recorded as a party')
  })

  it('refuses when the account has no address at all', async () => {
    expect(isRefusal(await self(fakeAdmin([OVO], null)))).toBe(true)
  })

  it('does not take over a party that already belongs to another account', async () => {
    const taken: Row = { ...OVO, user_id: 'somebody-else' }
    const r = await self(fakeAdmin([taken], 'ovo@ikore.org'))
    expect(isRefusal(r)).toBe(true)
  })

  it('does not let a non-signatory sign', async () => {
    const r = await self(fakeAdmin([{ ...OVO, is_signatory: false }], 'ovo@ikore.org'))
    expect(isRefusal(r)).toBe(true)
    if (!isRefusal(r)) return
    expect(r.error).toContain('not a signatory')
  })

  it('does not let anybody sign as another role', async () => {
    const r = await self(fakeAdmin([OVO], 'ovo@ikore.org'), { expectedRole: 'client_funder' })
    expect(isRefusal(r)).toBe(true)
    if (!isRefusal(r)) return
    expect(r.error).toContain('only sign as yourself')
  })
})

describe('a transcript is signed by whoever was in the room', () => {
  // A Charter is signed by the people whose office is to sign it. A transcript
  // is signed by the people whose words it is, which is not the same list: the
  // field team member who answered three questions signs their own words and
  // signs nothing else.
  it('lets somebody who is not a named signatory sign', async () => {
    const r = await resolveSigner(fakeAdmin([{ ...OVO, is_signatory: false }], 'ovo@ikore.org'), {
      clientId: CLIENT, userId: ACCOUNT, canManage: false, requireSignatory: false,
    })
    expect(isRefusal(r)).toBe(false)
  })

  it('still refuses somebody who is not on the engagement at all', async () => {
    const r = await resolveSigner(fakeAdmin([OVO], 'stranger@example.com'), {
      clientId: CLIENT, userId: 'user-stranger', canManage: false, requireSignatory: false,
    })
    expect(isRefusal(r)).toBe(true)
  })

  it('lets the lead consultant record a non-signatory answering in the room', async () => {
    const r = await resolveSigner(fakeAdmin([{ ...OVO, is_signatory: false }], 'coach@example.com'), {
      clientId: CLIENT, userId: 'user-coach', canManage: true,
      onBehalfOfPartyId: 'party-ovo', requireSignatory: false,
    })
    expect(isRefusal(r)).toBe(false)
    if (isRefusal(r)) return
    expect(r.mode).toBe('in_room')
  })

  it('keeps the signatory rule everywhere it is not switched off', async () => {
    // The default has to stay strict, or one new caller quietly opens the
    // Charter to everybody on the engagement.
    const r = await self(fakeAdmin([{ ...OVO, is_signatory: false }], 'ovo@ikore.org'))
    expect(isRefusal(r)).toBe(true)
  })
})

describe('recording a signature given on paper is unchanged', () => {
  it('needs manage rights', async () => {
    const r = await resolveSigner(fakeAdmin([OVO], 'coach@example.com'), {
      clientId: CLIENT, userId: 'user-coach', canManage: false, onBehalfOfPartyId: 'party-ovo',
    })
    expect(isRefusal(r)).toBe(true)
    if (!isRefusal(r)) return
    expect(r.error).toContain('Only the lead consultant')
  })

  it('records who typed it and does not claim the signer logged in', async () => {
    const r = await resolveSigner(fakeAdmin([OVO], 'coach@example.com'), {
      clientId: CLIENT, userId: 'user-coach', canManage: true, onBehalfOfPartyId: 'party-ovo',
    })
    expect(isRefusal(r)).toBe(false)
    if (isRefusal(r)) return
    expect(r.mode).toBe('in_room')
    expect(r.recordedBy).toBe('user-coach')
    expect(r.signerUserId).toBeNull()
  })
})
