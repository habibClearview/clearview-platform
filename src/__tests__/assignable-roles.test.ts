import { describe, it, expect } from 'vitest'
import { canAssignRole } from '../lib/auth/assignable-roles'

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
