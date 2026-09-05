import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { canAssignRole, canModifyUserRole } from '../lib/auth/assignable-roles'

describe('canAssignRole', () => {
  it('super_coach may assign any real role', () => {
    for (const r of ['ceo', 'finance_manager', 'unit_head', 'accounts_assistant', 'coach', 'funder']) {
      expect(canAssignRole('super_coach', r)).toBe(true)
    }
  })

  it('super_coach may NOT mint another super_coach through this matrix', () => {
    // super_coach is granted only via the user_profiles row / DB, never assigned here.
    expect(canAssignRole('super_coach', 'super_coach')).toBe(false)
  })

  it('ceo may staff their org but NEVER escalate to ceo or super_coach', () => {
    expect(canAssignRole('ceo', 'finance_manager')).toBe(true)
    expect(canAssignRole('ceo', 'unit_head')).toBe(true)
    expect(canAssignRole('ceo', 'accounts_assistant')).toBe(true)
    expect(canAssignRole('ceo', 'ceo')).toBe(false)
    expect(canAssignRole('ceo', 'super_coach')).toBe(false)
  })

  it('finance_manager may only assign unit_head / accounts_assistant', () => {
    expect(canAssignRole('finance_manager', 'unit_head')).toBe(true)
    expect(canAssignRole('finance_manager', 'accounts_assistant')).toBe(true)
    expect(canAssignRole('finance_manager', 'finance_manager')).toBe(false)
    expect(canAssignRole('finance_manager', 'ceo')).toBe(false)
    expect(canAssignRole('finance_manager', 'super_coach')).toBe(false)
  })

  it('roles with no assignment rights are denied', () => {
    expect(canAssignRole('unit_head', 'accounts_assistant')).toBe(false)
    expect(canAssignRole('accounts_assistant', 'unit_head')).toBe(false)
    expect(canAssignRole('coach', 'ceo')).toBe(false)
    expect(canAssignRole('funder', 'unit_head')).toBe(false)
  })

  it('unknown roles and junk values are denied', () => {
    expect(canAssignRole('ceo', 'wizard')).toBe(false)
    expect(canAssignRole('auditor', 'unit_head')).toBe(false)
    expect(canAssignRole('', '')).toBe(false)
  })
})

describe('canModifyUserRole (target-role hierarchy)', () => {
  it('a finance_manager may NOT demote a CEO (target outranks them)', () => {
    // destination role (unit_head) is assignable, but the target's CURRENT role (ceo) is not.
    expect(canModifyUserRole('finance_manager', 'ceo', 'unit_head')).toBe(false)
  })

  it('a finance_manager may retune a unit_head <-> accounts_assistant', () => {
    expect(canModifyUserRole('finance_manager', 'unit_head', 'accounts_assistant')).toBe(true)
    expect(canModifyUserRole('finance_manager', 'accounts_assistant', 'unit_head')).toBe(true)
  })

  it('a CEO may change staff they administer but NOT another CEO or a super_coach target', () => {
    expect(canModifyUserRole('ceo', 'finance_manager', 'unit_head')).toBe(true)
    expect(canModifyUserRole('ceo', 'ceo', 'finance_manager')).toBe(false)
    expect(canModifyUserRole('ceo', 'super_coach', 'finance_manager')).toBe(false)
  })

  it('super_coach may change ceo/coach/funder targets but not a super_coach target (DB-only)', () => {
    expect(canModifyUserRole('super_coach', 'ceo', 'finance_manager')).toBe(true)
    expect(canModifyUserRole('super_coach', 'coach', 'funder')).toBe(true)
    expect(canModifyUserRole('super_coach', 'super_coach', 'ceo')).toBe(false)
  })

  it('a unit_head/accounts_assistant may never change anyone', () => {
    expect(canModifyUserRole('unit_head', 'accounts_assistant', 'unit_head')).toBe(false)
    expect(canModifyUserRole('accounts_assistant', 'unit_head', 'accounts_assistant')).toBe(false)
  })
})

// ============================================================
// THE PAYING CLIENT STAFFS ITS OWN OVERSIGHT. 5 September 2026.
// Tanager is told in writing that they may put as many of their people on the
// engagement as they want. A funder is read-only everywhere, so a peer is the
// only role they can mint that grants nothing they do not already hold.
// ============================================================
describe('a funder may add colleagues, and nothing else', () => {
  it('may mint a peer', () => {
    expect(canAssignRole('funder', 'funder')).toBe(true)
  })

  it('may not mint anything that can act', () => {
    for (const r of ['super_coach', 'coach', 'ceo', 'finance_manager', 'unit_head', 'accounts_assistant']) {
      expect(canAssignRole('funder', r)).toBe(false)
    }
  })

  it('may not be minted by the organisation being coached', () => {
    // A funder sees the whole programme. A client's CEO handing that out would
    // be handing out sight of engagements that are not theirs.
    for (const r of ['ceo', 'finance_manager']) expect(canAssignRole(r, 'funder')).toBe(false)
  })

  it('is pinned to the inviter\'s own programme by the route', () => {
    const route = fs.readFileSync('app/api/invite-user/route.ts', 'utf8')
    // The cross-organisation guard reads engagement_client_id, which a funder
    // does not have — without this pin a funder could pass any programme id.
    expect(route).toContain('effectiveFunderProgrammeId = inviterProfile.funder_programme_id')
    expect(route).toContain("funder_programme_id: role === 'funder' ? effectiveFunderProgrammeId : null")
    expect(route).toContain("inviterRole === 'funder' && role === 'funder'")
    // and a funder with no programme of their own cannot invite at all
    expect(route).toMatch(/not attached to a programme yet, so it cannot invite anybody/)
  })
})
