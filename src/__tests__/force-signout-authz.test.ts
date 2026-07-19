import { describe, it, expect } from 'vitest'
import { canForceSignout } from '../lib/auth/force-signout-authz'

const CLIENT_A = 'client_aaa'
const CLIENT_B = 'client_bbb'

describe('canForceSignout', () => {
  it('super_coach may sign out any user, in any organisation', () => {
    const admin = { role: 'super_coach', engagement_client_id: null }
    expect(canForceSignout(admin, { role: 'ceo', engagement_client_id: CLIENT_A })).toBe(true)
    expect(canForceSignout(admin, { role: 'unit_head', engagement_client_id: CLIENT_B })).toBe(true)
    expect(canForceSignout(admin, { role: 'super_coach', engagement_client_id: null })).toBe(true)
  })

  it('ceo may sign out any user in their OWN organisation', () => {
    const ceo = { role: 'ceo', engagement_client_id: CLIENT_A }
    expect(canForceSignout(ceo, { role: 'finance_manager', engagement_client_id: CLIENT_A })).toBe(true)
    expect(canForceSignout(ceo, { role: 'unit_head', engagement_client_id: CLIENT_A })).toBe(true)
  })

  it('ceo may NOT reach into another organisation', () => {
    const ceo = { role: 'ceo', engagement_client_id: CLIENT_A }
    expect(canForceSignout(ceo, { role: 'unit_head', engagement_client_id: CLIENT_B })).toBe(false)
    expect(canForceSignout(ceo, { role: 'ceo', engagement_client_id: CLIENT_B })).toBe(false)
  })

  it('finance_manager may sign out only unit heads / accounts assistants in their own org', () => {
    const fm = { role: 'finance_manager', engagement_client_id: CLIENT_A }
    expect(canForceSignout(fm, { role: 'unit_head', engagement_client_id: CLIENT_A })).toBe(true)
    expect(canForceSignout(fm, { role: 'accounts_assistant', engagement_client_id: CLIENT_A })).toBe(true)
    // ...but not a peer or a superior
    expect(canForceSignout(fm, { role: 'finance_manager', engagement_client_id: CLIENT_A })).toBe(false)
    expect(canForceSignout(fm, { role: 'ceo', engagement_client_id: CLIENT_A })).toBe(false)
    // ...and never across organisations
    expect(canForceSignout(fm, { role: 'unit_head', engagement_client_id: CLIENT_B })).toBe(false)
  })

  it('a unit_head or accounts_assistant may never force-sign-out anyone', () => {
    const uh = { role: 'unit_head', engagement_client_id: CLIENT_A }
    const aa = { role: 'accounts_assistant', engagement_client_id: CLIENT_A }
    expect(canForceSignout(uh, { role: 'unit_head', engagement_client_id: CLIENT_A })).toBe(false)
    expect(canForceSignout(aa, { role: 'accounts_assistant', engagement_client_id: CLIENT_A })).toBe(false)
  })

  it('an actor with a null/blank engagement id (and not super_coach) is denied', () => {
    // Guards the tenant check: a non-admin must have a real org to match on,
    // so a null id can never be treated as "same org" as a null target.
    const orphan = { role: 'ceo', engagement_client_id: null }
    expect(canForceSignout(orphan, { role: 'unit_head', engagement_client_id: null })).toBe(false)
  })

  it('an unknown role is denied by default', () => {
    const weird = { role: 'auditor', engagement_client_id: CLIENT_A }
    expect(canForceSignout(weird, { role: 'unit_head', engagement_client_id: CLIENT_A })).toBe(false)
  })
})
