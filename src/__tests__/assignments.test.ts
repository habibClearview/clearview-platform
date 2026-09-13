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
  assignmentsFromDeals, servedFromProgrammes, dealAssignmentId, withCorrectedPayer, leadingCurrency,
  type Assignment, type AssignmentServed,
} from '@/lib/assignments'

const now = new Date('2026-09-14T00:00:00Z')

// Every figure is a list, one entry per currency, because pounds and dollars
// are never added together. This reads one currency out of such a list.
const inCur = (list: { currency: string | null; amount: number }[], cur: string) =>
  list.find(e => e.currency === cur)?.amount ?? 0

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
// Every Pipeline deal is its own row in programmes, so the won Climate Smart
// Jobs advisory sits on a different id under the same payer. The payer's name
// is what is on the invoice, so the name is what identifies them.
const NAMES: Record<string, string> = {
  csj: 'Climate Smart Jobs', csj2: 'Climate Smart Jobs', tanager: 'Tanager',
}
const payerName = (id: string) => NAMES[id] || id
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
    expect(inCur(csj?.collected || [], 'USD')).toBe(30_000)
    expect(inCur(csj?.awaitingIssue || [], 'USD')).toBe(12_000)
  })

  it('shows the won assignment money even though it serves nobody', () => {
    // This is the fault the whole change exists to fix: under the old shape
    // the fee hung off a served organisation, so this 12,000 was invisible.
    const onlyTheWonOne = moneyByPayer([CSJ_NEW_ADVISORY], [], 'month', now)
    expect(onlyTheWonOne).toHaveLength(1)
    expect(inCur(onlyTheWonOne[0].awaitingIssue, 'USD')).toBe(12_000)
    expect(onlyTheWonOne[0].organisationsServed).toBe(0)
  })

  it('keeps Tanager apart, with its own invoice outstanding', () => {
    expect(tanager?.assignments).toBe(1)
    expect(tanager?.organisationsServed).toBe(1)
    expect(inCur(tanager?.invoicedNotPaid || [], 'USD')).toBe(18_000)
    expect(tanager?.collected).toEqual([])
  })

  it('counts collected money only inside the chosen period', () => {
    const lastYear = moneyByPayer(ASSIGNMENTS, SERVED, 'month', new Date('2026-10-14T00:00:00Z'), payerName)
    expect(lastYear.find(l => l.payer === 'Climate Smart Jobs')?.collected).toEqual([])
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

  it('counts PAYING CLIENTS per service, which is the figure Habib works from', () => {
    // Climate Smart Jobs bought advisory twice; that is one paying client for
    // advisory, not two. Recording the same work twice cannot inflate it.
    const r = moneyByService(ASSIGNMENTS, 'month', now, undefined, payerName)
    const l = (s: string) => r.services.find(x => x.service === s)
    expect(l('advisory')?.payingClients).toBe(1)
    expect(l('canvas')?.payingClients).toBe(1)
    expect(l('financial')?.payingClients).toBe(1)
  })

  it('never divides a fee that covers more than one service', () => {
    // No record says how 30,000 splits between advisory and the model, so it
    // is not split. It sits on its own line.
    expect(line('advisory')?.ownRevenue).toEqual([])
    expect(line('financial')?.ownRevenue).toEqual([])
    expect(split.combinedAssignments).toBe(1)
    expect(inCur(split.combinedRevenue, 'USD')).toBe(30_000)
  })

  it('still adds up to the money collected, within each currency', () => {
    const ownSum = split.services.reduce((s, l) => s + inCur(l.ownRevenue, 'USD'), 0)
    expect(ownSum + inCur(split.combinedRevenue, 'USD')).toBe(inCur(split.total, 'USD'))
    expect(inCur(split.total, 'USD')).toBe(30_000)
  })

  // POUNDS AND DOLLARS ARE NEVER ADDED TOGETHER. Habib: "I do not know how
  // £5k and $35000 add up to £40k." They do not, and no exchange rate is
  // recorded anywhere on this platform, so inventing one would turn a wrong
  // total into a confident wrong total.
  it('keeps two currencies as two figures', () => {
    const mixed: Assignment[] = [
      { id: 'gbp', payer_programme_id: 'csj', service_types: ['advisory'], fee: 5_000, fee_currency: 'GBP', fee_status: 'paid', fee_paid_at: '2026-09-01' },
      { id: 'usd', payer_programme_id: 'tanager', service_types: ['canvas'], fee: 35_000, fee_currency: 'USD', fee_status: 'paid', fee_paid_at: '2026-09-01' },
    ]
    const r = moneyByService(mixed, 'month', now, undefined, payerName)
    expect(r.total).toHaveLength(2)
    expect(inCur(r.total, 'GBP')).toBe(5_000)
    expect(inCur(r.total, 'USD')).toBe(35_000)
    const m = assignmentMoney(mixed, 'month', now)
    expect(m.collected).toHaveLength(2)
    expect(inCur(m.collected, 'GBP')).toBe(5_000)
    expect(inCur(m.collected, 'USD')).toBe(35_000)
    // And a chart can only be drawn in one of them.
    expect(leadingCurrency(mixed)).toBe('USD')
    expect(monthlyAssignmentRevenue(mixed, ['2026-09'], 'USD')['2026-09']).toBe(35_000)
    expect(monthlyAssignmentRevenue(mixed, ['2026-09'], 'GBP')['2026-09']).toBe(5_000)
  })

  it('shows every service, including the ones with nothing on them yet', () => {
    expect(line('portfolio_intelligence')).toBeTruthy()
    expect(line('portfolio_intelligence')?.assignments).toBe(0)
  })

  it('a single-service assignment keeps its money on its own service', () => {
    const paidCanvas: Assignment = { ...TANAGER_GTCV, fee_status: 'paid', fee_paid_at: '2026-09-03' }
    const r = moneyByService([paidCanvas], 'month', now)
    expect(inCur(r.services.find(x => x.service === 'canvas')?.ownRevenue || [], 'USD')).toBe(18_000)
    expect(r.combinedRevenue).toEqual([])
  })
})

describe('the practice total', () => {
  it('is every assignment fee, counted once', () => {
    const m = assignmentMoney(ASSIGNMENTS, 'month', now)
    expect(inCur(m.collected, 'USD')).toBe(30_000)
    expect(inCur(m.invoicedNotPaid, 'USD')).toBe(18_000)
    expect(inCur(m.awaitingIssue, 'USD')).toBe(12_000)
  })

  it('claims no currency when nobody has chosen one', () => {
    const m = assignmentMoney([{ id: 'x', fee: 10, fee_status: 'unpaid' }], 'month', now)
    expect(m.awaitingIssue).toEqual([{ currency: null, amount: 10 }])
  })

  it('buckets collected fees by the month they came in, with a zero for quiet months', () => {
    const r = monthlyAssignmentRevenue(ASSIGNMENTS, ['2026-08', '2026-09'], 'USD')
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

// THE FIGURES WERE ALWAYS THERE, ON THE PIPELINE. 14 September 2026. Habib
// entered his fees as deal values on the programmes, and nothing on the
// platform ever read that table for money, so every screen showed nothing and
// asked him to type it all again.
describe('a Pipeline deal read as the assignment it already is', () => {
  const deals = [
    { id: 'csj', name: 'Climate Smart Jobs', deal_stage: 'won', deal_value: 30_000, deal_currency: 'USD', deal_services: ['advisory', 'financial'] },
    { id: 'tanager', name: 'Tanager', deal_stage: 'won', deal_value: 18_000, deal_currency: 'USD', deal_services: ['canvas'] },
    { id: 'gone', name: 'Not taken forward', deal_stage: 'lost', deal_value: 9_000, deal_currency: 'USD', deal_services: ['advisory'] },
    { id: 'nomoney', name: 'No value yet', deal_stage: 'proposal', deal_value: null, deal_currency: null, deal_services: ['advisory'] },
  ]

  it('carries the fee, the currency and the services straight off the deal', () => {
    const made = assignmentsFromDeals(deals, [])
    const csj = made.find(a => a.payer_programme_id === 'csj')
    expect(csj?.fee).toBe(30_000)
    expect(csj?.fee_currency).toBe('USD')
    expect(csj?.service_types).toEqual(['advisory', 'financial'])
    expect(csj?.name).toBe('Climate Smart Jobs')
  })

  it('claims only that the amount is agreed, never that it was invoiced or paid', () => {
    expect(assignmentsFromDeals(deals, [])[0].fee_status).toBe('unpaid')
  })

  it('leaves out a deal not taken forward, and one with no money on it', () => {
    const ids = assignmentsFromDeals(deals, []).map(a => a.payer_programme_id)
    expect(ids).toEqual(['csj', 'tanager'])
  })

  it('stands aside the moment a real assignment exists for that payer', () => {
    const recorded: Assignment[] = [{ id: 'real', payer_programme_id: 'csj', fee: 31_000 }]
    const ids = assignmentsFromDeals(deals, recorded).map(a => a.payer_programme_id)
    expect(ids).toEqual(['tanager'])
  })

  it('never invents a service for a deal that has none ticked', () => {
    // Falling back to advisory would put work on the Services tiles that
    // nobody ever recorded. CodeRabbit on #268.
    const bare = [{ id: 'x', name: 'No services ticked', deal_stage: 'won', deal_value: 5_000, deal_services: null }]
    const made = assignmentsFromDeals(bare, [])
    expect(servicesOf(made[0])).toEqual([])
    // Its money is still counted; it is simply under no service.
    expect(inCur(assignmentMoney(made, 'month', now).awaitingIssue, 'USD')).toBe(0)
    expect(assignmentMoney(made, 'month', now).awaitingIssue[0].amount).toBe(5_000)
    const split = moneyByService(made, 'month', now)
    expect(split.services.every(l => l.assignments === 0)).toBe(true)
  })

  it('takes the id the migration would give it, so applying that later makes no second copy', () => {
    expect(assignmentsFromDeals(deals, [])[0].id).toBe(dealAssignmentId('csj'))
  })

  it('serves the organisations already sitting under that programme', () => {
    const made = assignmentsFromDeals(deals, [])
    const served = servedFromProgrammes(made, [
      { id: 'bwaeyale', programme_id: 'csj' },
      { id: 'viester', programme_id: 'csj' },
      { id: 'ikore', programme_id: 'tanager' },
      { id: 'nobody', programme_id: null },
    ])
    expect(servedIdsOf(dealAssignmentId('csj'), served)).toEqual(['bwaeyale', 'viester'])
    expect(servedIdsOf(dealAssignmentId('tanager'), served)).toEqual(['ikore'])
  })

  it('puts the money on screen without anything being copied anywhere first', () => {
    const made = assignmentsFromDeals(deals, [])
    const m = assignmentMoney(made, 'month', now)
    expect(inCur(m.awaitingIssue, 'USD')).toBe(48_000)
  })
})

// AN ORGANISATION DOES NOT PAY FOR ITS OWN WORK WHEN A PROGRAMME PAYS.
// 14 September 2026. Habib: "At what point did I mention that Ikore is a
// paying client?" He never did. Tanager pays for Ikore. The old Services box
// made whichever page you were on the payer, so a service recorded from
// Ikore's own page wrote Ikore down as paying Ikore.
describe('who is recorded as paying', () => {
  const clients = [
    { id: 'ikore', programme_id: 'tanager' },
    { id: 'selffunded', programme_id: null },
  ]

  it('moves the payer to the programme the organisation sits under', () => {
    const wrong: Assignment[] = [{ id: 'x', payer_client_id: 'ikore', fee: 18_000 }]
    const [fixed] = withCorrectedPayer(wrong, clients)
    expect(fixed.payer_programme_id).toBe('tanager')
    expect(fixed.payer_client_id).toBeNull()
  })

  it('leaves an organisation that genuinely pays for its own work alone', () => {
    const own: Assignment[] = [{ id: 'y', payer_client_id: 'selffunded', fee: 4_000 }]
    expect(withCorrectedPayer(own, clients)[0].payer_client_id).toBe('selffunded')
  })

  it('never touches an assignment a programme already pays for', () => {
    const fine: Assignment[] = [{ id: 'z', payer_programme_id: 'csj', fee: 9_000 }]
    expect(withCorrectedPayer(fine, clients)[0]).toEqual(fine[0])
  })

  it('stops a served organisation being counted as a paying client', () => {
    const wrong: Assignment[] = [{ id: 'x', payer_client_id: 'ikore', fee: 18_000 }]
    const before = practiceShape(wrong, [], id => id)
    const after = practiceShape(withCorrectedPayer(wrong, clients), [], id => id)
    expect(before.payers).toBe(1)   // Ikore, wrongly
    expect(after.payers).toBe(1)    // Tanager, rightly
    expect(payerIdOf(withCorrectedPayer(wrong, clients)[0])).toBe('tanager')
  })
})

// A FEE AGREED IS STILL MONEY. 14 September 2026. Habib: "How can you have 1
// advisory and 0 USD and under GtCV there is 1 client and 0 USD, but look at
// the finance section?" The Services tiles showed cash collected inside the
// period. A fee agreed but not yet invoiced has collected nothing, so a real
// £5,000 piece of work printed as zero beside the client who bought it, while
// Finance showed the same money as awaiting issue.
describe('what a service is worth, as opposed to what has cleared', () => {
  const agreed: Assignment[] = [
    { id: 'adv', payer_programme_id: 'csj', service_types: ['advisory'], fee: 5_000, fee_currency: 'GBP', fee_status: 'unpaid' },
    { id: 'gtcv', payer_programme_id: 'tanager', service_types: ['canvas'], fee: 35_000, fee_currency: 'USD', fee_status: 'unpaid' },
  ]

  it('shows the fee even though nothing has been collected yet', () => {
    const r = moneyByService(agreed, 'month', now, undefined, payerName)
    const l = (s: string) => r.services.find(x => x.service === s)
    expect(inCur(l('advisory')?.fee || [], 'GBP')).toBe(5_000)
    expect(inCur(l('canvas')?.fee || [], 'USD')).toBe(35_000)
    // And is still honest that none of it has cleared.
    expect(l('advisory')?.ownRevenue).toEqual([])
    expect(r.total).toEqual([])
  })

  it('the two currencies stay apart in the agreed total', () => {
    const r = moneyByService(agreed, 'month', now, undefined, payerName)
    expect(inCur(r.totalFee, 'GBP')).toBe(5_000)
    expect(inCur(r.totalFee, 'USD')).toBe(35_000)
    expect(r.totalFee).toHaveLength(2)
  })

  it('a payer line carries what was agreed as well as what cleared', () => {
    const lines = moneyByPayer(agreed, [], 'month', now, payerName)
    const csj = lines.find(l => l.payer === 'Climate Smart Jobs')
    expect(inCur(csj?.fee || [], 'GBP')).toBe(5_000)
    expect(csj?.collected).toEqual([])
    expect(inCur(csj?.awaitingIssue || [], 'GBP')).toBe(5_000)
  })

  it('a fee covering more than one service is agreed but never divided', () => {
    const both: Assignment[] = [
      { id: 'x', payer_programme_id: 'csj', service_types: ['advisory', 'financial'], fee: 5_000, fee_currency: 'GBP', fee_status: 'unpaid' },
    ]
    const r = moneyByService(both, 'month', now, undefined, payerName)
    expect(r.services.find(x => x.service === 'advisory')?.fee).toEqual([])
    expect(inCur(r.combinedFee, 'GBP')).toBe(5_000)
    expect(inCur(r.totalFee, 'GBP')).toBe(5_000)
  })
})
