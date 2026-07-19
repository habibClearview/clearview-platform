import { describe, it, expect } from 'vitest'
import { actorMayAccessClient } from '../lib/auth/field-admin-authz'

const CLIENT_A = 'client_aaa'
const CLIENT_B = 'client_bbb'

describe('actorMayAccessClient', () => {
  it('super_coach may act on any business', () => {
    expect(actorMayAccessClient({ role: 'super_coach', engagement_client_id: null }, CLIENT_A)).toBe(true)
    expect(actorMayAccessClient({ role: 'super_coach', engagement_client_id: null }, CLIENT_B)).toBe(true)
  })

  it('a client user may act only on their OWN business', () => {
    const ceo = { role: 'ceo', engagement_client_id: CLIENT_A }
    expect(actorMayAccessClient(ceo, CLIENT_A)).toBe(true)
    expect(actorMayAccessClient(ceo, CLIENT_B)).toBe(false)
  })

  it('a null/blank client id, or a non-admin with no tenant, is denied', () => {
    expect(actorMayAccessClient({ role: 'ceo', engagement_client_id: CLIENT_A }, null)).toBe(false)
    expect(actorMayAccessClient({ role: 'ceo', engagement_client_id: null }, CLIENT_A)).toBe(false)
    expect(actorMayAccessClient({ role: 'ceo', engagement_client_id: null }, null)).toBe(false)
  })
})
