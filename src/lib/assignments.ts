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
export function practiceShape(assignments: Assignment[], served: AssignmentServed[]): PracticeShape {
  const payers = new Set<string>()
  const organisations = new Set<string>()
  const ids = new Set(assignments.map(a => a.id))
  let nobodyYet = 0
  for (const a of assignments) {
    const payer = payerIdOf(a)
    if (payer) payers.add(payer)
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
  payerId: string
  assignments: number
  organisationsServed: number
  collected: number
  invoicedNotPaid: number
  awaitingIssue: number
  currency: string | null
}
/**
 * One line per payer: what they bought, who it serves, and where their money
 * stands. This is the invoice's own view, which is the view Habib works from.
 */
export function moneyByPayer(
  assignments: Assignment[], served: AssignmentServed[],
  periodType: PeriodType, now: Date = new Date(),
): PayerLine[] {
  const byPayer = new Map<string, PayerLine>()
  const orgsByPayer = new Map<string, Set<string>>()
  for (const a of assignments) {
    const payerId = payerIdOf(a)
    if (!payerId) continue
    if (!byPayer.has(payerId)) {
      byPayer.set(payerId, {
        payerId, assignments: 0, organisationsServed: 0,
        collected: 0, invoicedNotPaid: 0, awaitingIssue: 0, currency: null,
      })
      orgsByPayer.set(payerId, new Set())
    }
    const line = byPayer.get(payerId) as PayerLine
    line.assignments++
    line.collected += collectedInPeriod(a, periodType, now)
    if (a.fee_status === 'invoiced') line.invoicedNotPaid += money(a)
    if (a.fee_status === 'unpaid') line.awaitingIssue += money(a)
    if (!line.currency && a.fee_currency) line.currency = a.fee_currency
    servedIdsOf(a.id, served).forEach(id => (orgsByPayer.get(payerId) as Set<string>).add(id))
  }
  byPayer.forEach((line, payerId) => { line.organisationsServed = (orgsByPayer.get(payerId) as Set<string>).size })
  return Array.from(byPayer.values())
}

export interface ServiceLine { service: string; assignments: number; ownRevenue: number }
export interface ServiceSplit {
  services: ServiceLine[]
  /** Money on assignments covering more than one service. Shown on its own
   *  line rather than divided between them. */
  combinedRevenue: number
  combinedAssignments: number
  total: number
}
/**
 * Assignments and money per service.
 *
 * A FEE COVERING TWO SERVICES IS NOT SPLIT BETWEEN THEM. The Climate Smart
 * Jobs advisory includes the financial model under one fee, and no record
 * anywhere says how that fee divides. Halving it, or weighting it, would be
 * inventing a number and then printing it as though it were measured. The
 * count says the assignment includes both services, which is true, and the
 * money sits on its own line that names it as covering more than one, which
 * is also true. The three figures still add up to the total.
 */
export function moneyByService(
  assignments: Assignment[], periodType: PeriodType, now: Date = new Date(),
  serviceOrder: string[] = ['advisory', 'canvas', 'financial', 'portfolio_intelligence'],
): ServiceSplit {
  const counts = new Map<string, ServiceLine>()
  serviceOrder.forEach(s => counts.set(s, { service: s, assignments: 0, ownRevenue: 0 }))
  let combinedRevenue = 0
  let combinedAssignments = 0
  let total = 0
  for (const a of assignments) {
    const services = servicesOf(a)
    const collected = collectedInPeriod(a, periodType, now)
    total += collected
    for (const s of services) {
      if (!counts.has(s)) counts.set(s, { service: s, assignments: 0, ownRevenue: 0 })
      ;(counts.get(s) as ServiceLine).assignments++
    }
    if (services.length === 1) {
      ;(counts.get(services[0]) as ServiceLine).ownRevenue += collected
    } else if (services.length > 1) {
      combinedAssignments++
      combinedRevenue += collected
    }
    // An assignment with no service recorded contributes its money to the
    // total and to nothing else, which is exactly what is known about it.
  }
  return { services: Array.from(counts.values()), combinedRevenue, combinedAssignments, total }
}

export interface AssignmentMoney {
  collected: number
  invoicedNotPaid: number
  awaitingIssue: number
  currency: string | null
}
/** The practice's money, from the assignments alone. The old per-organisation
 *  fee fields are deliberately not read here: once a fee is on the assignment
 *  it is counted once, in one place. */
export function assignmentMoney(
  assignments: Assignment[], periodType: PeriodType, now: Date = new Date(),
): AssignmentMoney {
  let collected = 0, invoicedNotPaid = 0, awaitingIssue = 0
  let currency: string | null = null
  for (const a of assignments) {
    collected += collectedInPeriod(a, periodType, now)
    if (a.fee_status === 'invoiced') invoicedNotPaid += money(a)
    if (a.fee_status === 'unpaid') awaitingIssue += money(a)
    if (!currency && a.fee_currency) currency = a.fee_currency
  }
  return { collected, invoicedNotPaid, awaitingIssue, currency }
}

/** Fees collected, bucketed by the month they were collected in -- one entry
 *  per requested period, 0 where nothing came in, never omitted. */
export function monthlyAssignmentRevenue(assignments: Assignment[], periods: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  periods.forEach(p => { out[p] = 0 })
  for (const a of assignments) {
    if (a.fee_status !== 'paid' || !a.fee_paid_at) continue
    const period = a.fee_paid_at.slice(0, 7)
    if (period in out) out[period] += money(a)
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
