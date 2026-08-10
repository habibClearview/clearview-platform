// ============================================================
// What each zone is for.
//
// The point of these is coverage and drift. A zone with no brief opens
// straight into its tables again, which is the thing being fixed, and a brief
// for a gate that does not exist is copy nobody will ever see. Both are easy
// to introduce by editing one of the two files and not the other, so the
// tests tie them together rather than checking the wording.
// ============================================================
import { describe, it, expect } from 'vitest'
import { GATES } from '@/lib/gtcv-gates'
import { ZONE_BRIEFS, zoneBrief } from '@/lib/gtcv-zone-brief'

describe('zone briefs', () => {
  it('covers every gate the method defines', () => {
    const missing = GATES.filter((g) => !zoneBrief(g.id)).map((g) => g.id)
    expect(missing).toEqual([])
  })

  it('describes no gate that does not exist', () => {
    const known = new Set(GATES.map((g) => g.id))
    const stray = Object.keys(ZONE_BRIEFS).filter((id) => !known.has(id))
    expect(stray).toEqual([])
  })

  it('gives every zone a question, something to produce, and a signal', () => {
    for (const gate of GATES) {
      const brief = zoneBrief(gate.id)!
      expect(brief.question.trim().length, `${gate.id} question`).toBeGreaterThan(10)
      expect(brief.outputs.length, `${gate.id} outputs`).toBeGreaterThan(0)
      expect(brief.signal.trim().length, `${gate.id} signal`).toBeGreaterThan(10)
    }
  })

  it('has no blank or duplicated output on any zone', () => {
    for (const gate of GATES) {
      const outputs = zoneBrief(gate.id)!.outputs
      expect(outputs.every((o) => o.trim().length > 0), `${gate.id} blank output`).toBe(true)
      expect(new Set(outputs).size, `${gate.id} duplicate output`).toBe(outputs.length)
    }
  })

  it('asks a question rather than making a statement', () => {
    // The question is the one thing the zone exists to settle. A line that
    // does not ask anything is a description that has drifted into the slot.
    for (const gate of GATES) {
      expect(zoneBrief(gate.id)!.question.trim().endsWith('?'), `${gate.id} question`).toBe(true)
    }
  })

  it('returns nothing for an identifier the method does not use', () => {
    expect(zoneBrief('dp99')).toBeNull()
    expect(zoneBrief('')).toBeNull()
  })
})
