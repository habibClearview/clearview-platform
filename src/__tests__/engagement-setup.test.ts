// ============================================================
// WHAT AN ENGAGEMENT STILL NEEDS BEFORE IT IS SET UP
//
// Habib, 17 September 2026: "why is the engagement set up not showing that
// ikore has been setup - what more does it need to be set up - contract was
// uploaded, invitations has been sent to people, what else does it need?"
//
// A fair question with no answer on the screen. The three things are in the
// method's own pre-engagement brief, and the platform could have checked them
// against the record at any point and never did.
// ============================================================
import { describe, it, expect } from 'vitest'
import { setupState } from '@/lib/engagement-setup'

// The three parties who must sign, and one person who does not.
const ed = { id: 'p1', name: 'A Director', party_role: 'lsp_ed', is_signatory: true }
const coach = { id: 'p4', name: 'A Coach', party_role: 'lead_consultant', is_signatory: true }
const funder = { id: 'p2', name: 'A Funder', party_role: 'funder_rep', is_signatory: true }
const staffer = { id: 'p3', name: 'Somebody Else', party_role: 'lsp_finance', is_signatory: false }
const allThree = [ed, coach, funder]
const issued = { id: 'c1', status: 'issued', issued_at: '2026-09-01T00:00:00Z' }
const paidDeliverable = { milestone_no: 1, payment_amount: 5000 }

describe('an engagement nobody has touched', () => {
  const s = setupState({})

  it('is not set up, and says so on all three counts', () => {
    expect(s.done).toBe(false)
    expect(s.finished).toBe(0)
    expect(s.steps).toHaveLength(3)
  })

  it('says plainly what is missing rather than showing a blank', () => {
    expect(s.steps[0].detail).toBe('Nobody has been added to this engagement yet.')
    expect(s.steps[1].detail).toBe('No Charter has been drawn up yet.')
    expect(s.steps[2].detail).toBe('No deliverables have been recorded from the contract yet.')
  })

  it('points at where each one is done', () => {
    expect(s.steps.map((x) => x.goTo)).toEqual(['eng_setup', 'charter', 'eng_setup'])
  })
})

describe('the people', () => {
  it('is not finished by naming people if nobody signs', () => {
    // Naming the room is not the same as knowing whose signature closes a gate.
    const s = setupState({ parties: [staffer] })
    expect(s.steps[0].done).toBe(false)
    expect(s.steps[0].detail).toContain('nobody is marked as signing')
  })

  // ALL THREE PARTIES SIGN. Habib, 17 September 2026: "these are the 3 parties
  // including Ikore that must sign the charter so all parties have witness at
  // the meeting." The platform always allowed it and never said when one was
  // missing, so it was found out in the room.
  it('names the party nobody is signing for, rather than just saying not done', () => {
    const s = setupState({ parties: [ed, staffer] })
    expect(s.steps[0].done).toBe(false)
    expect(s.steps[0].detail).toContain('the coach, the funder')
  })

  it('names one missing party on its own', () => {
    const s = setupState({ parties: [ed, coach] })
    expect(s.steps[0].detail).toContain('Nobody is signing for the funder.')
  })

  it('says why all three matter, where it is read', () => {
    const s = setupState({ parties: [ed] })
    expect(s.steps[0].detail).toContain('each has witnessed the others agree')
  })

  it('does not count somebody present but not signing', () => {
    const s = setupState({ parties: [...allThree, staffer] })
    expect(s.steps[0].done).toBe(true)
    expect(s.steps[0].detail).toBe('4 named, and all three parties are signing.')
  })

  it('ignores a row with no name on it', () => {
    const s = setupState({ parties: [{ id: 'x', name: '  ', is_signatory: true }] })
    expect(s.steps[0].done).toBe(false)
  })

  it('is finished once all three parties are signing', () => {
    const s = setupState({ parties: allThree })
    expect(s.steps[0].done).toBe(true)
    expect(s.steps[0].detail).toBe('3 named, and all three parties are signing.')
    expect(s.steps[0].goTo).toBeNull()
  })
})

describe('the Charter', () => {
  it('is not signed while it is still a draft', () => {
    const s = setupState({ parties: [ed], charter: { id: 'c1', status: 'draft' } })
    expect(s.steps[1].done).toBe(false)
    expect(s.steps[1].detail).toContain('still a draft')
  })

  it('names who is being waited on, rather than saying it is unsigned', () => {
    // "Unsigned" sends you looking. A name tells you who to ring.
    const s = setupState({
      parties: [ed, funder],
      charter: issued,
      signatures: [{ charter_id: 'c1', party_id: 'p1', signed_at: '2026-09-02T00:00:00Z' }],
    })
    expect(s.steps[1].done).toBe(false)
    expect(s.steps[1].detail).toBe('Waiting on A Funder.')
  })

  it('does not count a signature that was never signed', () => {
    const s = setupState({
      parties: [ed],
      charter: issued,
      signatures: [{ charter_id: 'c1', party_id: 'p1', signed_at: null }],
    })
    expect(s.steps[1].done).toBe(false)
  })

  it('is finished when every signatory has signed, and only then', () => {
    const s = setupState({
      parties: [...allThree, staffer],
      charter: issued,
      signatures: [
        { charter_id: 'c1', party_id: 'p1', signed_at: '2026-09-02T00:00:00Z' },
        { charter_id: 'c1', party_id: 'p4', signed_at: '2026-09-02T00:00:00Z' },
        { charter_id: 'c1', party_id: 'p2', signed_at: '2026-09-03T00:00:00Z' },
      ],
    })
    // The fourth person does not sign, so the Charter is not waiting on them.
    expect(s.steps[1].done).toBe(true)
    expect(s.steps[1].detail).toBe('Signed by all 3.')
  })
})

describe('the deliverables', () => {
  it('is not finished by a deliverable with no money against it', () => {
    // A deliverable with no payment milestone cannot be invoiced, so the
    // contract is not actually recorded against the work.
    const s = setupState({ deliverables: [{ milestone_no: 1, payment_amount: 0 }] })
    expect(s.steps[2].done).toBe(false)
    expect(s.steps[2].detail).toContain('1 without a payment milestone')
  })

  it('is not finished by a payment with no milestone number', () => {
    const s = setupState({ deliverables: [{ milestone_no: null, payment_amount: 5000 }] })
    expect(s.steps[2].done).toBe(false)
  })

  it('is finished when every deliverable carries its milestone', () => {
    const s = setupState({ deliverables: [paidDeliverable, { milestone_no: 2, payment_amount: '7500' }] })
    expect(s.steps[2].done).toBe(true)
    expect(s.steps[2].detail).toBe('2 recorded, each with a payment milestone.')
  })
})

describe('an engagement that is genuinely ready', () => {
  const s = setupState({
    parties: allThree,
    charter: issued,
    signatures: [
      { charter_id: 'c1', party_id: 'p1', signed_at: '2026-09-02T00:00:00Z' },
      { charter_id: 'c1', party_id: 'p4', signed_at: '2026-09-02T00:00:00Z' },
      { charter_id: 'c1', party_id: 'p2', signed_at: '2026-09-03T00:00:00Z' },
    ],
    deliverables: [paidDeliverable],
  })

  it('says so, on all three', () => {
    expect(s.done).toBe(true)
    expect(s.finished).toBe(3)
    expect(s.steps.every((x) => x.goTo === null)).toBe(true)
  })
})

// ============================================================
// A READ THAT FAILED IS NOT A THING NOBODY HAS DONE
//
// From the review on #283, and it is the same fault this checklist exists to
// prevent, one level up. An unreadable signature list made every signatory
// look outstanding, so the checklist would have sent somebody to chase
// signatures that had already been given.
// ============================================================
describe('when something could not be read', () => {
  it('says the Charter is not known, rather than not signed', () => {
    const s = setupState({
      parties: [ed, funder],
      charter: issued,
      signatures: [],
      signaturesUnavailable: true,
    })
    expect(s.steps[1].done).toBe(false)
    expect(s.steps[1].unknown).toBe(true)
    expect(s.steps[1].detail).toContain('not known either way')
  })

  it('offers nowhere to go, because there may be nothing to do', () => {
    const s = setupState({ parties: [ed], charter: issued, signaturesUnavailable: true })
    expect(s.steps[1].goTo).toBeNull()
  })

  it('says the same about deliverables it could not read', () => {
    const s = setupState({ deliverablesUnavailable: true })
    expect(s.steps[2].unknown).toBe(true)
    expect(s.steps[2].goTo).toBeNull()
    expect(s.steps[2].detail).toContain('not known either way')
  })

  it('never counts an unknown step as finished', () => {
    const s = setupState({
      parties: allThree,
      charter: issued,
      signatures: [{ charter_id: 'c1', party_id: 'p1', signed_at: '2026-09-02T00:00:00Z' }],
      deliverables: [paidDeliverable],
      signaturesUnavailable: true,
    })
    expect(s.done).toBe(false)
    expect(s.finished).toBe(2)
  })

  it('leaves the steps it could read alone', () => {
    // The point of saying "not known" is to keep the rest of the checklist
    // useful, rather than hiding all three because one read failed.
    const s = setupState({ parties: allThree, deliverablesUnavailable: true })
    expect(s.steps[0].done).toBe(true)
    expect(s.steps[0].unknown).toBeFalsy()
  })
})
