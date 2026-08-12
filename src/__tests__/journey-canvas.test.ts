// ============================================================
// PART K. THE JOURNEY CANVAS, AND THE PROMISE IT MUST NOT BREAK
//
// The rule under test is C70: where authors were hidden in the room, the
// dissent shows WITHOUT the name — in the live view, in the fixed version, and
// in anything printed from either. It is enforced twice, at write and at
// render, and this asserts the render half against rows that DO contain names,
// because the write half is what is being backstopped.
// ============================================================
import { describe, expect, it } from 'vitest'
import {
  agreedByOf,
  decisionOf,
  dissentOf,
  fixedVersionStamp,
  journeyCanvas,
  type EvidenceEntry,
  type GateSignoff,
  type QuestionRecord,
} from '@/lib/journey-canvas'

const record = (over: Partial<QuestionRecord> = {}): QuestionRecord => ({
  id: 'rec-1',
  gate_id: 'dp01',
  question_text: 'Which activities are actually paid for?',
  question_type: 'collect',
  submissions: [],
  agreed_value: 'Four of the eleven',
  dissent: [],
  authors_were_visible: true,
  revealed_at: '2026-08-12T09:00:00Z',
  locked_by_name: 'Habib Onifade',
  locked_at: '2026-08-12T09:05:00Z',
  ...over,
})

describe('C70. dissent where authors were hidden', () => {
  const hidden = record({
    authors_were_visible: false,
    // A name IS present in the row. The render must drop it anyway.
    dissent: [{ note: 'The training is not costed', name: 'Grace Adeyemi' }],
  })

  it('shows the dissent', () => {
    expect(dissentOf(hidden)).toHaveLength(1)
    expect(dissentOf(hidden)[0].note).toBe('The training is not costed')
  })

  it('shows it WITHOUT the name, even though the row holds one', () => {
    const [line] = dissentOf(hidden)
    expect(line.name).toBeNull()
    expect(line.nameWithheld).toBe(true)
    // Nothing anywhere in the rendered line carries the name.
    expect(JSON.stringify(line)).not.toContain('Grace')
  })

  it('treats a missing flag as hidden, never as permission', () => {
    // A row where the flag was never set must not be read as "names are fine".
    for (const flag of [null, undefined] as unknown[]) {
      const line = dissentOf(record({
        authors_were_visible: flag as boolean | null,
        dissent: [{ note: 'Disagree', name: 'Grace Adeyemi' }],
      }))[0]
      expect(line.name).toBeNull()
      expect(line.nameWithheld).toBe(true)
    }
  })

  it('shows the name where the room DID allow it', () => {
    const shown = record({
      authors_were_visible: true,
      dissent: [{ note: 'The training is not costed', name: 'Grace Adeyemi' }],
    })
    const [line] = dissentOf(shown)
    expect(line.name).toBe('Grace Adeyemi')
    expect(line.nameWithheld).toBe(false)
  })

  it('leaves out a dissent with no words in it', () => {
    expect(dissentOf(record({ dissent: [{ note: '   ', name: 'X' }] }))).toEqual([])
  })

  it('handles a record with no dissent at all', () => {
    expect(dissentOf(record({ dissent: null }))).toEqual([])
  })
})

describe('who agreed', () => {
  const submissions = [
    { name: 'Grace Adeyemi', at: '2026-08-12T09:01:00Z' },
    { name: 'Samuel Okoro', at: '2026-08-12T09:02:00Z' },
    { name: 'Grace Adeyemi', at: '2026-08-12T09:03:00Z' },
  ]

  it('names them where the room allowed names', () => {
    expect(agreedByOf(record({ authors_were_visible: true, submissions })))
      .toEqual(['Grace Adeyemi', 'Samuel Okoro'])
  })

  it('names NOBODY where authors were hidden, and gives the count instead', () => {
    const hidden = record({ authors_were_visible: false, submissions })
    expect(agreedByOf(hidden)).toEqual([])
    const line = decisionOf(hidden)
    expect(line.agreedBy).toEqual([])
    // A count is not identifying. Four names in a room of five identifies the fifth.
    expect(line.submissionCount).toBe(3)
    expect(line.namesWithheld).toBe(true)
    expect(JSON.stringify(line)).not.toContain('Grace')
  })
})

describe('one decision, as the canvas draws it', () => {
  it('carries the decision, when it was taken, and who recorded it', () => {
    const line = decisionOf(record())
    expect(line.agreed).toBe('Four of the eleven')
    expect(line.at).toBe('2026-08-12T09:05:00Z')
    expect(line.recordedBy).toBe('Habib Onifade')
  })

  it('falls back to the reveal time where nothing was locked', () => {
    expect(decisionOf(record({ locked_at: null })).at).toBe('2026-08-12T09:00:00Z')
  })

  it('says so rather than showing an empty question', () => {
    expect(decisionOf(record({ question_text: '  ' })).question).toBe('Question not recorded')
  })

  it('reports no agreement as null rather than as an empty string', () => {
    expect(decisionOf(record({ agreed_value: '   ' })).agreed).toBeNull()
  })
})

describe('the whole canvas', () => {
  const records = [
    record({ id: 'r1', gate_id: 'dp01' }),
    record({ id: 'r2', gate_id: 'dp01', question_text: 'Second question' }),
    record({ id: 'r3', gate_id: 'dp04' }),
  ]
  const signoffs: GateSignoff[] = [
    { dp_id: 'dp01', signer_role: 'executive_director', signer_name: 'A Director', decision: 'signed', note: null, signed_at: '2026-08-12T10:00:00Z' },
  ]
  const evidence: EvidenceEntry[] = [
    { reference: 'E-001', dp_id: 'dp01', description: 'Budget extract' },
    { reference: 'E-002', dp_id: 'dp07', description: 'Pilot notes' },
  ]
  const canvas = journeyCanvas(records, signoffs, evidence)

  it('shows every gate, including the ones nothing has happened at', () => {
    // The gaps are the part a coach and a funder both read first.
    expect(canvas).toHaveLength(12)
    expect(canvas.map((g) => g.id)).toContain('handover')
    expect(canvas.find((g) => g.id === 'handover')?.empty).toBe(true)
  })

  it('puts each gate\'s decisions, evidence and signatures under it', () => {
    const dp01 = canvas.find((g) => g.id === 'dp01')!
    expect(dp01.decisions.map((d) => d.id)).toEqual(['r1', 'r2'])
    expect(dp01.evidence.map((e) => e.reference)).toEqual(['E-001'])
    expect(dp01.signoffs.map((s) => s.signer_name)).toEqual(['A Director'])
    expect(dp01.empty).toBe(false)
  })

  it('does not leak one gate\'s evidence onto another', () => {
    expect(canvas.find((g) => g.id === 'dp04')!.evidence).toEqual([])
    expect(canvas.find((g) => g.id === 'dp07')!.evidence.map((e) => e.reference)).toEqual(['E-002'])
  })

  it('keeps the method\'s order', () => {
    const ids = canvas.map((g) => g.id)
    expect(ids.indexOf('phase_0')).toBeLessThan(ids.indexOf('dp01'))
    expect(ids.indexOf('dp09')).toBeLessThan(ids.indexOf('handover'))
  })

  it('carries the promise through the whole canvas, not just one record', () => {
    const withHidden = journeyCanvas([
      record({ id: 'h1', gate_id: 'dp02', authors_were_visible: false, dissent: [{ note: 'No', name: 'Grace Adeyemi' }] }),
    ], [], [])
    expect(JSON.stringify(withHidden)).not.toContain('Grace')
  })
})

describe('C69. the fixed version says when it was fixed', () => {
  it('stamps a date and a time', () => {
    const stamp = fixedVersionStamp(new Date('2026-08-12T14:30:00Z'))
    expect(stamp).toContain('Fixed version')
    expect(stamp).toContain('12 August 2026')
    // Two copies in a room with no way to say which is later is the failure
    // this guards against, so the time is part of the stamp.
    expect(stamp).toMatch(/\d{2}:\d{2}/)
  })
})
