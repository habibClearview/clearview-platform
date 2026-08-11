// ============================================================
// The room cookie.
//
// The tests that matter are the forgery ones. The whole reason the participant
// identifier lives in a cookie the server signs, rather than in the body of
// the request, is that a participant must not be able to answer as somebody
// else or change somebody else's answer. If altering the cookie were to
// succeed, R11 and R18 would both be unenforceable.
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest'
import {
  newIdentity, encodeIdentity, decodeIdentity, ROOM_COOKIE,
} from '@/lib/stage1-room-identity'

beforeAll(() => {
  // A secret to sign with. Invented here; never a real key.
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret-for-signing-the-room-cookie'
})

describe('joining a room', () => {
  it('gives each browser its own participant identifier', () => {
    const a = newIdentity('client-1')
    const b = newIdentity('client-1')
    expect(a.participantId).not.toBe(b.participantId)
  })

  it('carries the engagement, so a cookie from one room is not one for another', () => {
    expect(newIdentity('client-1').clientId).toBe('client-1')
  })

  it('leaves the person empty in Stage 1 but keeps room for it', () => {
    const id = newIdentity('client-1')
    expect(id.personId).toBeNull()
    expect(id.personName).toBeNull()
  })

  it('holds a person when a personal link named one, ready for Stage 2', () => {
    const id = newIdentity('client-1', { id: 'person-7', name: 'Ada' })
    expect(id.personId).toBe('person-7')
    expect(id.personName).toBe('Ada')
  })
})

describe('reading the cookie back', () => {
  it('returns exactly what was put in', () => {
    const id = newIdentity('client-1', { id: 'person-7', name: 'Ada' })
    expect(decodeIdentity(encodeIdentity(id))).toEqual(id)
  })

  it('treats a missing cookie as a browser that has not joined', () => {
    expect(decodeIdentity(undefined)).toBeNull()
    expect(decodeIdentity(null)).toBeNull()
    expect(decodeIdentity('')).toBeNull()
  })

  it('refuses a cookie with no signature at all', () => {
    const payload = Buffer.from(JSON.stringify(newIdentity('client-1'))).toString('base64url')
    expect(decodeIdentity(payload)).toBeNull()
  })

  it('refuses a cookie whose contents were altered', () => {
    // The forgery that matters: claiming to be another participant.
    const mine = newIdentity('client-1')
    const cookie = encodeIdentity(mine)
    const signature = cookie.slice(cookie.lastIndexOf('.') + 1)

    const forged = { ...mine, participantId: 'somebody-elses-id' }
    const forgedPayload = Buffer.from(JSON.stringify(forged)).toString('base64url')

    expect(decodeIdentity(`${forgedPayload}.${signature}`)).toBeNull()
  })

  it('refuses a cookie moved to a different engagement', () => {
    // The other forgery that matters: reaching another organisation's room.
    const mine = newIdentity('client-1')
    const cookie = encodeIdentity(mine)
    const signature = cookie.slice(cookie.lastIndexOf('.') + 1)

    const moved = { ...mine, clientId: 'client-someone-else' }
    const movedPayload = Buffer.from(JSON.stringify(moved)).toString('base64url')

    expect(decodeIdentity(`${movedPayload}.${signature}`)).toBeNull()
  })

  it('refuses a signature that is simply wrong', () => {
    const cookie = encodeIdentity(newIdentity('client-1'))
    const payload = cookie.slice(0, cookie.lastIndexOf('.'))
    expect(decodeIdentity(`${payload}.notarealsignature`)).toBeNull()
  })

  it('refuses nonsense rather than throwing', () => {
    // A page that errors on a stale cookie is worse than one that treats the
    // browser as new, because the participant cannot do anything about it.
    expect(decodeIdentity('...')).toBeNull()
    expect(decodeIdentity('rubbish.rubbish')).toBeNull()
    expect(() => decodeIdentity('a'.repeat(5000))).not.toThrow()
  })
})

describe('the cookie name', () => {
  it('is the one the routes and the page agree on', () => {
    expect(ROOM_COOKIE).toBe('gtcv_room')
  })
})
