// ============================================================
// A zone stays shut until the one before it is signed off.
//
// That is the discipline the method rests on, and it is the thing the canvas
// wrongly claimed to enforce before it enforced anything. So it is tested here
// rather than trusted, and the two exceptions are tested too: the first gate is
// always open, and the consultant is never locked out.
// ============================================================

import { describe, expect, it } from 'vitest'
import { GATES, gateIsOpen, gateShutBecause } from '@/lib/gtcv-gates'

/** Everything complete up to and including the gate named, nothing after. */
function completeThrough(lastComplete: string) {
  const cutoff = GATES.findIndex((g) => g.id === lastComplete)
  return (id: string) => {
    const at = GATES.findIndex((g) => g.id === id)
    return at >= 0 && at <= cutoff ? 'complete' : 'not_started'
  }
}

const asOrganisation = { isCoachingTeam: false }
const asConsultant = { isCoachingTeam: true }

describe('working the zones in order', () => {
  it('opens the first one to everybody, whatever has been signed', () => {
    const nothing = () => 'not_started'
    expect(gateIsOpen(GATES[0].id, nothing, asOrganisation)).toBe(true)
  })

  it('keeps a zone shut until the one before it is signed off', () => {
    const upToDp01 = completeThrough('dp01')
    // dp02 follows dp01, which is complete.
    expect(gateIsOpen('dp02', upToDp01, asOrganisation)).toBe(true)
    // dp03 follows dp02, which is not.
    expect(gateIsOpen('dp03', upToDp01, asOrganisation)).toBe(false)
  })

  it('is not satisfied by evidence submitted or work in progress', () => {
    // The point of a gate is the signature, not the paperwork before it.
    for (const nearly of ['in_progress', 'evidence_submitted', 'needs_revisiting']) {
      const statusOf = (id: string) => (id === 'dp01' ? nearly : 'not_started')
      expect(gateIsOpen('dp02', statusOf, asOrganisation), nearly).toBe(false)
    }
  })

  it('never locks the consultant out', () => {
    const nothing = () => 'not_started'
    for (const g of GATES) {
      expect(gateIsOpen(g.id, nothing, asConsultant), g.id).toBe(true)
      expect(gateShutBecause(g.id, nothing, asConsultant), g.id).toBe(null)
    }
  })

  it('opens exactly one zone ahead of where the engagement has got to', () => {
    const upToDp04 = completeThrough('dp04')
    const open = GATES.filter((g) => gateIsOpen(g.id, upToDp04, asOrganisation)).map((g) => g.id)
    // Everything closed, plus the one immediately after the last closed one.
    expect(open).toEqual(['setup', 'phase_0', 'dp01', 'dp02', 'dp03', 'dp04', 'dp05'])
  })

  it('says which zone is in the way, by name', () => {
    const upToDp01 = completeThrough('dp01')
    const why = gateShutBecause('dp03', upToDp01, asOrganisation)
    expect(why).toContain('Customer and Problem Clarity')
    expect(why).toContain('signed off')
    expect(gateShutBecause('dp02', upToDp01, asOrganisation)).toBe(null)
  })

  it('walks the whole method one zone at a time', () => {
    // Signing off each gate in turn opens the next and nothing further.
    for (let i = 0; i < GATES.length - 1; i++) {
      const statusOf = completeThrough(GATES[i].id)
      expect(gateIsOpen(GATES[i + 1].id, statusOf, asOrganisation), GATES[i + 1].id).toBe(true)
      if (i + 2 < GATES.length) {
        expect(gateIsOpen(GATES[i + 2].id, statusOf, asOrganisation), GATES[i + 2].id).toBe(false)
      }
    }
  })
})
