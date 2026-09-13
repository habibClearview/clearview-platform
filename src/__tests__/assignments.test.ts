// ============================================================
// PAYER, ASSIGNMENT, SERVED ORGANISATION
//
// Habib, 14 September 2026: "maybe we need to separate paying clients from
// served clients. There are two programmes paying at the moment. Climate
// Smart Jobs has employed my advisory services, including the financial
// modelling service, for their served client Bwaeyale Vet and Viester.
// Tanager has employed my GtCV service for their client Ikore. The Climate
// Smart Job assignment that I entered as won is a new advisory that has no
// financial model included and that is a different assignment. You have the
// finance for each of this but it is not showing in the dashboard."
//
// His practice, exactly as he described it, is the fixture below. Every test
// here is a sentence from that paragraph.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  practiceShape, moneyByPayer, moneyByService, assignmentMoney,
  monthlyAssignmentRevenue, servicesOf, payerIdOf, servedIdsOf, assignmentLabel,
  type Assignment, type AssignmentServed,
} from '@/lib/assignments'

const now = new Date('2026-09-14T00:00:00Z')

// Two payers. Three assignments. Three organisations served.
const CSJ_ADVISORY_AND_MODEL: Assignment = {
  id: 'a1', name: 'Advisory and financial model',
  payer_programme_id: 'csj',
  service_types: ['advisory', 'financial'],
  status: 'active', fee: 30_000, fee_currency: 'USD',
  fee_status: 'paid', fee_paid_at: '2026-09-01',
}
// The won one. A fee, and nobody attached to it yet.
const CSJ_NEW_ADVISORY: Assignment = {
  id: 'a2', name: 'Advisory (new)',
  payer_programme_id: 'csj',
  service_types: ['advisory'],
  status: 'active', fee: 12_000, fee_currency: 'USD',
  fee_status: 'unpaid',
}
const TANAGER_GTCV: Assignment = {
  id: 'a3', name: 'GtCV',
  payer_programme_id: 'tanager',
  service_types: ['canvas'],
  status: 'active', fee: 18_000, fee_currency: 'USD',
  fee_status: 'invoiced', fee_invoiced_at: '2026-09-02',
}
const ASSIGNMENTS = [CSJ_ADVISORY_AND_MODEL, CSJ_NEW_ADVISORY, TANAGER_GTCV]
const SERVED: AssignmentServed[] = [
  { engagement_id: 'a1', client_id: 'bwaeyale' },
  { engagement_id: 'a1', client_id: 'viester' },
  { engagement_id: 'a3', client_id: 'ikore' },
]

describe('the shape of the practice', () => {
  it('is two payers, three assignments and three organisations served', () => {
    const s = practiceShape(ASSIGNMENTS, SERVED)
    expect(s.payers).toBe(2)
    expect(s.assignments).toBe(3)
    expect(s.organisationsServed).toBe(3)
  })

  it('names the assignment that serves nobody yet rather than hiding it', () => {
    expect(practiceShape(ASSIGNMENTS, SERVED).assignmentsWithNobodyYet).toBe(1)
  })

  it('counts a payer once however many assignments it holds', () => {
    // Climate Smart Jobs holds two and is still one paying client.
    expect(practiceShape([CSJ_ADVISORY_AND_MODEL, CSJ_NEW_ADVISORY], SERVED).payers).toBe(1)
  })

  it('counts an organisation once however many assignments serve it', () => {
    const twice: AssignmentServed[] = [
      { engagement_id: 'a1', client_id: 'bwaeyale' },
      { engagement_id: 'a2', client_id: 'bwaeyale' },
    ]
    expect(practiceShape([CSJ_ADVISORY_AND_MODEL, CSJ_NEW_ADVISORY], twice).organisationsServed).toBe(1)
  })

  it('never counts an organisation attached to an assignment that is gone', () => {
    const orphan: AssignmentServed[] = [{ engagement_id: 'deleted', client_id: 'someone' }]
    expect(practiceShape(ASSIGNMENTS, [...SERVED, ...orphan]).organisationsServed).toBe(3)
  })

  it('is all zeroes before anything is recorded, and does not crash', () => {
    expect(practiceShape([], [])).toEqual({
      payers: 0, assignments: 0, organisationsServed: 0, assignmentsWithNobodyYet: 0,
    })
  })
})

describe('the money sits with the payer, once per assignment', () => {
  const lines = moneyByPayer(ASSIGNMENTS, SERVED, 'month', now)
  const csj = lines.find(l => l.payerId === 'csj')
  const tanager = lines.find(l => l.payerId === 'tanager')

  it('gives one line per payer, not one per assignment', () => {
    expect(lines).toHaveLength(2)
  })

  it('adds up both Climate Smart Jobs assignments under Climate Smart Jobs', () => {
    expect(csj?.assignments).toBe(2)
    expect(csj?.organisationsServed).toBe(2)
    expect(csj?.collected).toBe(30_000)
    expect(csj?.awaitingIssue).toBe(12_000)
  })

  it('shows the won assignment money even though it serves nobody', () => {
    // This is the fault the whole change exists to fix: under the old shape
    // the fee hung off a served organisation, so this 12,000 was invisible.
    const onlyTheWonOne = moneyByPayer([CSJ_NEW_ADVISORY], [], 'month', now)
    expect(onlyTheWonOne).toHaveLength(1)
    expect(onlyTheWonOne[0].awaitingIssue).toBe(12_000)
    expect(onlyTheWonOne[0].organisationsServed).toBe(0)
  })

  it('keeps Tanager apart, with its own invoice outstanding', () => {
    expect(tanager?.assignments).toBe(1)
    expect(tanager?.organisationsServed).toBe(1)
    expect(tanager?.invoicedNotPaid).toBe(18_000)
    expect(tanager?.collected).toBe(0)
  })

  it('counts collected money only inside the chosen period', () => {
    const lastYear = moneyByPayer(ASSIGNMENTS, SERVED, 'month', new Date('2026-10-14T00:00:00Z'))
    expect(lastYear.find(l => l.payerId === 'csj')?.collected).toBe(0)
  })
})

describe('money by service', () => {
  const split = moneyByService(ASSIGNMENTS, 'month', now)
  const line = (s: string) => split.services.find(x => x.service === s)

  it('counts an assignment under every service it includes', () => {
    // The Climate Smart Jobs advisory includes the financial model, so it is
    // one assignment appearing under both.
    expect(line('advisory')?.assignments).toBe(2)
    expect(line('financial')?.assignments).toBe(1)
    expect(line('canvas')?.assignments).toBe(1)
  })

  it('never divides a fee that covers more than one service', () => {
    // No record says how 30,000 splits between advisory and the model, so it
    // is not split. It sits on its own line.
    expect(line('advisory')?.ownRevenue).toBe(0)
    expect(line('financial')?.ownRevenue).toBe(0)
    expect(split.combinedAssignments).toBe(1)
    expect(split.combinedRevenue).toBe(30_000)
  })

  it('still adds up to the money collected', () => {
    const ownSum = split.services.reduce((s, l) => s + l.ownRevenue, 0)
    expect(ownSum + split.combinedRevenue).toBe(split.total)
    expect(split.total).toBe(30_000)
  })

  it('shows every service, including the ones with nothing on them yet', () => {
    expect(line('portfolio_intelligence')).toBeTruthy()
    expect(line('portfolio_intelligence')?.assignments).toBe(0)
  })

  it('a single-service assignment keeps its money on its own service', () => {
    const paidCanvas: Assignment = { ...TANAGER_GTCV, fee_status: 'paid', fee_paid_at: '2026-09-03' }
    const r = moneyByService([paidCanvas], 'month', now)
    expect(r.services.find(x => x.service === 'canvas')?.ownRevenue).toBe(18_000)
    expect(r.combinedRevenue).toBe(0)
  })
})

describe('the practice total', () => {
  it('is every assignment fee, counted once', () => {
    const m = assignmentMoney(ASSIGNMENTS, 'month', now)
    expect(m.collected).toBe(30_000)
    expect(m.invoicedNotPaid).toBe(18_000)
    expect(m.awaitingIssue).toBe(12_000)
    expect(m.currency).toBe('USD')
  })

  it('claims no currency when nobody has chosen one', () => {
    expect(assignmentMoney([{ id: 'x', fee: 10 }], 'month', now).currency).toBeNull()
  })

  it('buckets collected fees by the month they came in, with a zero for quiet months', () => {
    const r = monthlyAssignmentRevenue(ASSIGNMENTS, ['2026-08', '2026-09'])
    expect(r['2026-08']).toBe(0)
    expect(r['2026-09']).toBe(30_000)
  })
})

describe('reading an assignment however it was written', () => {
  it('falls back to the single service column on an older row', () => {
    expect(servicesOf({ id: 'x', service_type: 'advisory' })).toEqual(['advisory'])
    expect(servicesOf({ id: 'x', service_types: ['canvas'], service_type: 'advisory' })).toEqual(['canvas'])
    expect(servicesOf({ id: 'x' })).toEqual([])
  })

  it('finds the payer whether it is a programme or an organisation paying for itself', () => {
    expect(payerIdOf({ id: 'x', payer_programme_id: 'csj' })).toBe('csj')
    expect(payerIdOf({ id: 'x', payer_client_id: 'ikore' })).toBe('ikore')
    expect(payerIdOf({ id: 'x' })).toBeNull()
  })

  it('lists the organisations one assignment serves', () => {
    expect(servedIdsOf('a1', SERVED)).toEqual(['bwaeyale', 'viester'])
    expect(servedIdsOf('a2', SERVED)).toEqual([])
  })

  it('never shows a blank name', () => {
    const labels = { advisory: 'Advisory', financial: 'Clearview Financial Model' }
    expect(assignmentLabel(CSJ_ADVISORY_AND_MODEL, labels)).toBe('Advisory and financial model')
    expect(assignmentLabel({ id: 'x', service_types: ['advisory', 'financial'] }, labels))
      .toBe('Advisory + Clearview Financial Model')
    expect(assignmentLabel({ id: 'x' })).toBe('Assignment')
  })
})
