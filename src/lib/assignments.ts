// ============================================================
// ASSIGNMENTS: WHAT WAS BOUGHT, BY WHOM, FOR WHOM
//
// Habib, 14 September 2026: "I suspect you are confused about the client
// counts, and maybe we need to separate paying clients from served clients...
// You have the finance for each of this but it is not showing in the
// dashboard." And: "the fee should be on the client, it is the client I
// invoiced."
//
// The word "client" was doing two jobs at once, and the money was attached to
// the wrong one. Three things, named apart:
//
//   PAYER                who signs and pays, and who the invoice is made out
//                        to. Climate Smart Jobs, Tanager.
//   ASSIGNMENT           one thing bought from that payer. Carries the fee and
//                        the services it includes, and serves zero or more
//                        organisations.
//   SERVED ORGANISATION  who the work is done with. Bwaeyale Vet, Viester,
//                        Ikore. Holds no money.
//
// Two payers, three assignments, three organisations served. Those are three
// different numbers and the screen had only one.
//
// THE FEE SITS WITH THE PAYER, ONCE PER ASSIGNMENT, because that is once per
// invoice raised. Climate Smart Jobs holds two fees because it was invoiced
// twice for two different pieces of work.
//
// AN ASSIGNMENT WITH NOBODY ATTACHED STILL COUNTS. The won Climate Smart Jobs
// advisory has a fee and no served organisation yet. Under the old shape the
// fee hung off a served organisation, so this assignment had nowhere to keep
// its money and was invisible everywhere. That is the fault this exists to
// fix, so every function here works from the assignment and never from who it
// serves.
//
// No React and no Supabase, so all of it is tested.
// ============================================================
import { periodRange, type PeriodType } from '@/lib/coach-business-metrics'

export interface Assignment {
  id: string
  name?: string | null
  /** Exactly one of these is set: the payer is a programme, or an
   *  organisation paying for its own work. */
  payer_programme_id?: string | null
  payer_client_id?: string | null
  /** Every service this one assignment includes. */
  service_types?: string[] | null
  /** The single-service column the table has always had. Read only as a
   *  fallback, so a row written before service_types existed still works. */
  service_type?: string | null
  status?: string | null
  fee?: number | null
  fee_currency?: string | null
  fee_status?: 'paid' | 'invoiced' | 'unpaid' | null
  fee_invoiced_at?: string | null
  fee_paid_at?: string | null
}

/** Which organisations an assignment serves. Many rows per assignment. */
export interface AssignmentServed { engagement_id: string; client_id: string }

const money = (a: Assignment) => Number(a.fee) || 0

// MONEY IN TWO CURRENCIES IS TWO AMOUNTS. 14 September 2026. Habib: "I do not
// know how £5k and $35000 add up to £40k." They do not. Every total here used
// to be one number carrying whichever currency it happened to meet first, so a
// pound fee and a dollar fee were added together and printed under one sign.
//
// Every figure is now a list, one entry per currency, and nothing is ever
// converted: no exchange rate is recorded anywhere on this platform, and
// inventing one would turn a wrong total into a confident wrong total.
export interface CurrencyAmount { currency: string | null; amount: number }

function addAmount(into: CurrencyAmount[], currency: string | null, amount: number): void {
  if (!amount) return
  const key = currency || null
  const hit = into.find(e => e.currency === key)
  if (hit) hit.amount += amount
  else into.push({ currency: key, amount })
}

/** Largest first, so the biggest figure leads wherever a list is printed. */
function tidy(list: CurrencyAmount[]): CurrencyAmount[] {
  return list.filter(e => e.amount !== 0).sort((a, b) => b.amount - a.amount)
}

/** The services an assignment includes, however the row was written. */
export function servicesOf(a: Assignment): string[] {
  const many = (a.service_types || []).filter(Boolean)
  if (many.length) return many
  return a.service_type ? [a.service_type] : []
}

/** Who this assignment is billed to. Null only for a row with neither payer
 *  set, which the table's own constraint does not allow. */
export function payerIdOf(a: Assignment): string | null {
  return a.payer_programme_id || a.payer_client_id || null
}

/** The organisations one assignment serves, in the order given. */
export function servedIdsOf(id: string, served: AssignmentServed[]): string[] {
  return served.filter(s => s.engagement_id === id).map(s => s.client_id)
}

// A PAYING CLIENT IS AN ORGANISATION, NOT A DATABASE ROW. Every Pipeline deal
// is its own row in programmes, so the second piece of work Climate Smart Jobs
// commissioned is a second row carrying the same name. Counting rows would
// report three paying clients where there are two, and split one
// organisation's money across two lines of the same table. The name is what is
// on the invoice, so the name identifies the payer.
export type PayerName = (id: string) => string
function payerKey(id: string, payerName: PayerName): string {
  const name = (payerName(id) || '').trim()
  return name ? name.toLowerCase() : id
}

export interface PracticeShape {
  payers: number
  assignments: number
  organisationsServed: number
  /** Assignments with nobody attached yet. Real work, real money, and the
   *  screen says so rather than hiding them. */
  assignmentsWithNobodyYet: number
}
/**
 * The three numbers that belong side by side at the top of My Business. A
 * payer is counted once however many assignments it holds; an organisation is
 * counted once however many assignments serve it.
 */
export function practiceShape(
  assignments: Assignment[], served: AssignmentServed[], payerName: PayerName = id => id,
): PracticeShape {
  const payers = new Set<string>()
  const organisations = new Set<string>()
  const ids = new Set(assignments.map(a => a.id))
  let nobodyYet = 0
  for (const a of assignments) {
    const payer = payerIdOf(a)
    if (payer) payers.add(payerKey(payer, payerName))
    if (servedIdsOf(a.id, served).length === 0) nobodyYet++
  }
  for (const s of served) if (ids.has(s.engagement_id)) organisations.add(s.client_id)
  return {
    payers: payers.size,
    assignments: assignments.length,
    organisationsServed: organisations.size,
    assignmentsWithNobodyYet: nobodyYet,
  }
}

/** Cash collected inside the period: fee_status paid, with fee_paid_at in it. */
function collectedInPeriod(a: Assignment, periodType: PeriodType, now: Date): number {
  const { start, end } = periodRange(periodType, now)
  if (a.fee_status !== 'paid' || !a.fee_paid_at) return 0
  const when = new Date(a.fee_paid_at)
  return when >= start && when < end ? money(a) : 0
}

export interface PayerLine {
  /** One of the payer's row ids, so a screen can still open the record. */
  payerId: string
  /** What the payer is called, which is what identifies them. */
  payer: string
  assignments: number
  organisationsServed: number
  collected: CurrencyAmount[]
  invoicedNotPaid: CurrencyAmount[]
  awaitingIssue: CurrencyAmount[]
}
/**
 * One line per payer: what they bought, who it serves, and where their money
 * stands. This is the invoice's own view, which is the view Habib works from.
 */
export function moneyByPayer(
  assignments: Assignment[], served: AssignmentServed[],
  periodType: PeriodType, now: Date = new Date(), payerName: PayerName = id => id,
): PayerLine[] {
  const byPayer = new Map<string, PayerLine>()
  const orgsByPayer = new Map<string, Set<string>>()
  for (const a of assignments) {
    const rowId = payerIdOf(a)
    if (!rowId) continue
    const payerId = payerKey(rowId, payerName)
    if (!byPayer.has(payerId)) {
      byPayer.set(payerId, {
        payerId: rowId, payer: payerName(rowId) || rowId,
        assignments: 0, organisationsServed: 0,
        collected: [], invoicedNotPaid: [], awaitingIssue: [],
      })
      orgsByPayer.set(payerId, new Set())
    }
    const line = byPayer.get(payerId) as PayerLine
    line.assignments++
    addAmount(line.collected, a.fee_currency || null, collectedInPeriod(a, periodType, now))
    if (a.fee_status === 'invoiced') addAmount(line.invoicedNotPaid, a.fee_currency || null, money(a))
    if (a.fee_status === 'unpaid') addAmount(line.awaitingIssue, a.fee_currency || null, money(a))
    servedIdsOf(a.id, served).forEach(id => (orgsByPayer.get(payerId) as Set<string>).add(id))
  }
  byPayer.forEach((line, payerId) => {
    line.organisationsServed = (orgsByPayer.get(payerId) as Set<string>).size
    line.collected = tidy(line.collected)
    line.invoicedNotPaid = tidy(line.invoicedNotPaid)
    line.awaitingIssue = tidy(line.awaitingIssue)
  })
  return Array.from(byPayer.values())
}

export interface ServiceLine {
  service: string
  /** How many paying clients hold this service. This is the figure Habib
   *  works from: "under advisory £5k and 1 client" means one payer, Climate
   *  Smart Jobs, however many pieces of paper that took. */
  payingClients: number
  assignments: number
  ownRevenue: CurrencyAmount[]
}
export interface ServiceSplit {
  services: ServiceLine[]
  /** Money on assignments covering more than one service. Shown on its own
   *  line rather than divided between them. */
  combinedRevenue: CurrencyAmount[]
  combinedAssignments: number
  total: CurrencyAmount[]
}
/**
 * Paying clients, assignments and money per service.
 *
 * A SERVICE IS COUNTED IN PAYING CLIENTS. 14 September 2026. Habib: "Under
 * GtCV is $35000 and it is 1 client for GtCV. I don't know where you got GtCV
 * client 2." The count was assignments, and Tanager's GtCV had been recorded
 * twice, once as a deal and once through the old Services box, so one piece of
 * work read as two. Counting who is paying for the service cannot do that: one
 * payer is one client whatever the paperwork looks like.
 *
 * A FEE COVERING TWO SERVICES IS NOT SPLIT BETWEEN THEM. No record says how
 * such a fee divides, and halving it would be inventing a number and printing
 * it as though it were measured. The count says the assignment includes both
 * services, which is true, and the money sits on its own line that names it as
 * covering more than one, which is also true.
 */
export function moneyByService(
  assignments: Assignment[], periodType: PeriodType, now: Date = new Date(),
  serviceOrder: string[] = ['advisory', 'canvas', 'financial', 'portfolio_intelligence'],
  payerName: PayerName = id => id,
): ServiceSplit {
  const counts = new Map<string, ServiceLine>()
  const payersOf = new Map<string, Set<string>>()
  const line = (s: string) => {
    if (!counts.has(s)) {
      counts.set(s, { service: s, payingClients: 0, assignments: 0, ownRevenue: [] })
      payersOf.set(s, new Set())
    }
    return counts.get(s) as ServiceLine
  }
  serviceOrder.forEach(s => line(s))
  const combinedRevenue: CurrencyAmount[] = []
  let combinedAssignments = 0
  const total: CurrencyAmount[] = []
  for (const a of assignments) {
    const services = servicesOf(a)
    const collected = collectedInPeriod(a, periodType, now)
    addAmount(total, a.fee_currency || null, collected)
    const payer = payerIdOf(a)
    for (const s of services) {
      line(s).assignments++
      if (payer) (payersOf.get(s) as Set<string>).add(payerKey(payer, payerName))
    }
    if (services.length === 1) {
      addAmount(line(services[0]).ownRevenue, a.fee_currency || null, collected)
    } else if (services.length > 1) {
      combinedAssignments++
      addAmount(combinedRevenue, a.fee_currency || null, collected)
    }
    // An assignment with no service recorded contributes its money to the
    // total and to nothing else, which is exactly what is known about it.
  }
  counts.forEach((l, s) => {
    l.payingClients = (payersOf.get(s) as Set<string>).size
    l.ownRevenue = tidy(l.ownRevenue)
  })
  return {
    services: Array.from(counts.values()),
    combinedRevenue: tidy(combinedRevenue),
    combinedAssignments,
    total: tidy(total),
  }
}

export interface AssignmentMoney {
  collected: CurrencyAmount[]
  invoicedNotPaid: CurrencyAmount[]
  awaitingIssue: CurrencyAmount[]
}
/** The practice's money, from the assignments alone, one figure per currency.
 *  Nothing is converted and nothing is added across currencies. */
export function assignmentMoney(
  assignments: Assignment[], periodType: PeriodType, now: Date = new Date(),
): AssignmentMoney {
  const collected: CurrencyAmount[] = []
  const invoicedNotPaid: CurrencyAmount[] = []
  const awaitingIssue: CurrencyAmount[] = []
  for (const a of assignments) {
    const cur = a.fee_currency || null
    addAmount(collected, cur, collectedInPeriod(a, periodType, now))
    if (a.fee_status === 'invoiced') addAmount(invoicedNotPaid, cur, money(a))
    if (a.fee_status === 'unpaid') addAmount(awaitingIssue, cur, money(a))
  }
  return { collected: tidy(collected), invoicedNotPaid: tidy(invoicedNotPaid), awaitingIssue: tidy(awaitingIssue) }
}

/** Fees collected, bucketed by the month they were collected in -- one entry
 *  per requested period, 0 where nothing came in, never omitted.
 *
 *  ONE CURRENCY ONLY. A bar chart adding pounds to dollars draws a shape that
 *  means nothing, so the caller says which currency it is drawing and this
 *  counts only that one. Everything else is left out and named elsewhere. */
export function monthlyAssignmentRevenue(
  assignments: Assignment[], periods: string[], currency: string | null = null,
): Record<string, number> {
  const out: Record<string, number> = {}
  periods.forEach(p => { out[p] = 0 })
  for (const a of assignments) {
    if (a.fee_status !== 'paid' || !a.fee_paid_at) continue
    if ((a.fee_currency || null) !== currency) continue
    const period = a.fee_paid_at.slice(0, 7)
    if (period in out) out[period] += money(a)
  }
  return out
}

/** The currency the practice has most money in, which is the one a single
 *  chart can honestly be drawn in. Null when there is nothing to draw. */
export function leadingCurrency(assignments: Assignment[]): string | null {
  const totals: CurrencyAmount[] = []
  for (const a of assignments) addAmount(totals, a.fee_currency || null, money(a))
  return tidy(totals)[0]?.currency ?? null
}

// THE FIGURES WERE ALWAYS THERE, ON THE PIPELINE. 14 September 2026. Habib
// entered his fees as deal values on the programmes, and nothing on the
// platform ever read that table for money, so every screen showed nothing and
// asked him to type it all again.
//
// A deal is already an assignment in everything but name: a programme row
// carries deal_value, deal_currency and deal_services, and deal_services holds
// exactly the same four service keys an assignment does. So a deal is read AS
// an assignment, here, in the code. Nothing has to be copied anywhere first
// and nothing has to be typed twice.
//
// An assignment recorded properly always wins. A deal only stands in where
// nothing has been recorded for that programme yet, so the moment Habib edits
// one on the Assignments screen his own words replace the deal's.

// AN ORGANISATION DOES NOT PAY FOR ITS OWN WORK WHEN A PROGRAMME PAYS.
// 14 September 2026. Habib: "At what point did I mention that Ikore is a
// paying client?" He never did. He said Tanager pays for Ikore.
//
// It came from the platform. The old Services box made whichever page you
// were on the payer, so a service recorded from Ikore's own page wrote Ikore
// down as paying Ikore, and the Paying Clients count then reported a served
// organisation as a payer.
//
// The record itself says which it is: an organisation that sits under a
// programme is served by that programme's money. An organisation with no
// programme genuinely is paying for its own work and is left exactly as it
// is. This is applied on reading, so nothing has to be run against the
// database for the screen to stop saying something untrue.
export function withCorrectedPayer(
  assignments: Assignment[], clients: { id: string; programme_id?: string | null }[],
): Assignment[] {
  const programmeOf = new Map(clients.map(c => [c.id, c.programme_id || null]))
  return assignments.map(a => {
    if (!a.payer_client_id) return a
    const programme = programmeOf.get(a.payer_client_id)
    if (!programme) return a
    return { ...a, payer_programme_id: programme, payer_client_id: null }
  })
}

export interface DealProgrammeLike {
  id: string
  name?: string | null
  deal_stage?: string | null
  deal_value?: number | null
  deal_currency?: string | null
  deal_services?: string[] | null
}

/** The id a deal's stand-in assignment takes, matching what the migration
 *  writes, so applying the migration later cannot produce a second copy. */
export const dealAssignmentId = (programmeId: string) => `asg_deal_${programmeId}`

/**
 * Every deal with money on it, read as the assignment it already is. A deal
 * not taken forward is not an assignment and is left out. A programme that
 * already has an assignment of its own is left out too, because what was
 * recorded on purpose beats what is being inferred.
 */
export function assignmentsFromDeals(
  programmes: DealProgrammeLike[], recorded: Assignment[],
): Assignment[] {
  const spokenFor = new Set(recorded.map(a => a.payer_programme_id).filter(Boolean) as string[])
  return programmes
    .filter(p => Number(p.deal_value) > 0 && p.deal_stage !== 'lost' && !spokenFor.has(p.id))
    .map(p => {
      const services = (p.deal_services || []).filter(Boolean)
      return {
        id: dealAssignmentId(p.id),
        name: p.name || null,
        payer_programme_id: p.id,
        // A DEAL WITH NO SERVICES TICKED IS NOT AN ADVISORY. CodeRabbit on
        // #268. Falling back to advisory would have put work on the Services
        // tiles that nobody ever recorded. It stays unclassified: its money is
        // still in the total, and it is counted under no service, which is
        // exactly what is known about it.
        service_types: services.length ? services : null,
        service_type: services[0] || null,
        status: 'active',
        fee: Number(p.deal_value),
        fee_currency: p.deal_currency || null,
        // The least that is true of a deal with a value: the amount is
        // agreed. Nothing on a deal records an invoice or a payment, so
        // neither is claimed.
        fee_status: 'unpaid' as const,
      }
    })
}

/** Who a deal's stand-in assignment serves: the organisations already sitting
 *  under that programme. */
export function servedFromProgrammes(
  stood: Assignment[], clients: { id: string; programme_id?: string | null }[],
): AssignmentServed[] {
  const out: AssignmentServed[] = []
  for (const a of stood) {
    if (!a.payer_programme_id) continue
    for (const c of clients) {
      if (c.programme_id === a.payer_programme_id) out.push({ engagement_id: a.id, client_id: c.id })
    }
  }
  return out
}

/** A name for an assignment that never comes out blank: what Habib called it,
 *  or the services it covers, or a plain last resort. */
export function assignmentLabel(a: Assignment, serviceLabels: Record<string, string> = {}): string {
  const named = (a.name || '').trim()
  if (named) return named
  const services = servicesOf(a).map(s => serviceLabels[s] || s)
  return services.length ? services.join(' + ') : 'Assignment'
}
