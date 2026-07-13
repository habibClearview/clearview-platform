// Pure calculations behind the coach's "My Business at a glance" screen: the
// coach's OWN commercial numbers (engagement fees, revenue mix, deal
// pipeline) -- distinct from the operational client/programme roster shown
// elsewhere in the dashboard. Every figure here is derived from real fields
// on engagement_clients / programmes (see
// supabase/migrations/2026_07_11_coach_payments_deals_fees.sql and
// 2026_07_12_engagement_fee_dates.sql); nothing is invented or hardcoded.
//
// Kept dependency-free (no React, no Supabase) so it's exhaustively unit
// tested and the component only has to map numbers to pixels.

export interface FeeClient {
  id: string
  engagement_mode: 'canvas' | 'financial'
  programme_id?: string | null
  engagement_fee?: number | null
  fee_currency?: string | null
  fee_status?: 'paid' | 'invoiced' | 'unpaid' | null
  fee_invoiced_at?: string | null
  fee_paid_at?: string | null
}

export interface DealProgramme {
  id: string
  name: string
  funder?: string | null
  country?: string | null
  type?: 'donor_programme' | 'direct_client' | 'blended' | null
  deal_stage?: string | null
  deal_value?: number | null
  deal_probability?: number | null
  deal_currency?: string | null
}

const fee = (c: FeeClient) => Number(c.engagement_fee) || 0
const isIndependent = (c: FeeClient) => !c.programme_id

export interface EngagementSplit { total: number; gtcv: number; clearview: number }
export function engagementSplit(clients: FeeClient[]): EngagementSplit {
  const gtcv = clients.filter(c => c.engagement_mode === 'canvas').length
  const clearview = clients.filter(c => c.engagement_mode === 'financial').length
  return { total: clients.length, gtcv, clearview }
}

export interface IndependentClientsResult { count: number; revenueShare: number }
/** Independent = self-paying, not attached to a funded programme (no programme_id). */
export function independentClients(clients: FeeClient[]): IndependentClientsResult {
  const independent = clients.filter(isIndependent)
  const totalFee = clients.reduce((s, c) => s + fee(c), 0)
  const independentFee = independent.reduce((s, c) => s + fee(c), 0)
  return { count: independent.length, revenueShare: totalFee > 0 ? independentFee / totalFee : 0 }
}

/** Sum of fees marked paid whose fee_paid_at falls within the given calendar year. */
export function feesReceivedInYear(clients: FeeClient[], year: number): number {
  return clients
    .filter(c => c.fee_status === 'paid' && c.fee_paid_at && new Date(c.fee_paid_at).getUTCFullYear() === year)
    .reduce((s, c) => s + fee(c), 0)
}

/** Currently outstanding: invoiced but not yet paid. */
export function outstandingInvoiced(clients: FeeClient[]): number {
  return clients.filter(c => c.fee_status === 'invoiced').reduce((s, c) => s + fee(c), 0)
}

/** Sum of fees marked paid whose fee_paid_at falls within the given calendar
 *  month ('YYYY-MM', the same period-string convention coach_invoices uses --
 *  see periodForDate in TeamPayments.tsx). */
export function feesReceivedInMonth(clients: FeeClient[], period: string): number {
  return clients
    .filter(c => c.fee_status === 'paid' && c.fee_paid_at && c.fee_paid_at.slice(0, 7) === period)
    .reduce((s, c) => s + fee(c), 0)
}

/** The last n calendar months as 'YYYY-MM' period keys, oldest first, ending
 *  with the current month. */
export function recentMonthPeriods(n: number, now: Date = new Date()): string[] {
  const out: string[] = []
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  for (let i = 0; i < n; i++) {
    out.unshift(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
    d.setUTCMonth(d.getUTCMonth() - 1)
  }
  return out
}

/** Fees collected (fee_status='paid'), bucketed by the month fee_paid_at falls
 *  in -- one entry per requested period, 0 where nothing was collected that
 *  month (never omitted, so a caller can always align it 1:1 with periods). */
export function monthlyFeeRevenue(clients: FeeClient[], periods: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  periods.forEach(p => { out[p] = feesReceivedInMonth(clients, p) })
  return out
}

export interface CoachInvoiceForCost { period: string; status: string; time_amount?: number | null; expenses_amount?: number | null }
/** Team cost-to-serve, bucketed by invoice period -- time + expenses on every
 *  ISSUED (non-draft) invoice, matching "fee - cost-to-serve = margin"
 *  (docs/gtcv/README.md). Advance amounts are deliberately excluded: an
 *  advance is a cash-timing mechanism (already recorded as a cost when
 *  disbursed, see coach_advances), netting it off again here would
 *  double-count it as a cost incurred in this period too. */
export function monthlyTeamCost(invoices: CoachInvoiceForCost[], periods: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  periods.forEach(p => { out[p] = 0 })
  invoices.forEach(inv => {
    if (inv.status === 'draft') return
    if (!(inv.period in out)) return
    out[inv.period] += (Number(inv.time_amount) || 0) + (Number(inv.expenses_amount) || 0)
  })
  return out
}

/**
 * Average days between invoicing and payment, over PAID fees that have both
 * dates recorded. Returns null (not 0) when there's no data yet -- 0 days
 * would falsely read as "instant collection".
 */
export function averageDaysToCollect(clients: FeeClient[]): number | null {
  const settled = clients.filter(c => c.fee_status === 'paid' && c.fee_invoiced_at && c.fee_paid_at)
  if (settled.length === 0) return null
  const totalDays = settled.reduce((s, c) => {
    const days = (new Date(c.fee_paid_at as string).getTime() - new Date(c.fee_invoiced_at as string).getTime()) / 86_400_000
    return s + Math.max(0, days)
  }, 0)
  return totalDays / settled.length
}

export interface RevenueStream { key: string; label: string; value: number; clientCount: number; tag: string; description: string; barFrac: number }
export interface RevenueStreams { streams: RevenueStream[]; total: number }
/**
 * Three revenue streams, matching the coach's real commercial model
 * (docs/gtcv/README.md): programme-funded advisory (a donor programme pays),
 * self-funded GtCV advisory (an independent client pays for canvas work), and
 * Clearview subscriptions (an independent client on the financial/Clearview
 * product). barFrac is each stream's value relative to the largest stream, so
 * bars are comparative, never fabricated targets. clientCount is the real
 * number of clients contributing to that stream's value.
 */
export function revenueStreams(clients: FeeClient[], programmesById: Record<string, DealProgramme>): RevenueStreams {
  let programmeAdvisory = 0, selfFundedGtcv = 0, clearviewSubscriptions = 0
  let programmeAdvisoryClients = 0, selfFundedGtcvClients = 0, clearviewSubscriptionsClients = 0
  for (const c of clients) {
    const amount = fee(c)
    if (amount <= 0) continue
    const programme = c.programme_id ? programmesById[c.programme_id] : undefined
    if (programme && programme.type === 'donor_programme') { programmeAdvisory += amount; programmeAdvisoryClients++ }
    else if (isIndependent(c) && c.engagement_mode === 'canvas') { selfFundedGtcv += amount; selfFundedGtcvClients++ }
    else if (isIndependent(c) && c.engagement_mode === 'financial') { clearviewSubscriptions += amount; clearviewSubscriptionsClients++ }
  }
  const values = [programmeAdvisory, selfFundedGtcv, clearviewSubscriptions]
  const max = Math.max(1, ...values)
  const plural = (n: number) => `${n} client${n === 1 ? '' : 's'}`
  const streams: RevenueStream[] = [
    { key: 'programme_advisory', label: 'Programme advisory', value: programmeAdvisory, clientCount: programmeAdvisoryClients, tag: 'Grant-funded', description: `GtCV paid by programmes · ${plural(programmeAdvisoryClients)}`, barFrac: programmeAdvisory / max },
    { key: 'self_funded_gtcv', label: 'Self-funded GtCV advisory', value: selfFundedGtcv, clientCount: selfFundedGtcvClients, tag: 'Independent · growing', description: `Independent NGOs paying themselves · ${plural(selfFundedGtcvClients)}`, barFrac: selfFundedGtcv / max },
    { key: 'clearview_subscriptions', label: 'Clearview subscriptions', value: clearviewSubscriptions, clientCount: clearviewSubscriptionsClients, tag: 'Independent · recurring', description: `Independent · recurring · ${plural(clearviewSubscriptionsClients)}`, barFrac: clearviewSubscriptions / max },
  ]
  return { streams, total: programmeAdvisory + selfFundedGtcv + clearviewSubscriptions }
}

export interface DealWinRate { wonCount: number; totalCount: number; pct: number }
/** Win rate across every deal that has a stage set (won / total-with-stage). */
export function dealWinRate(programmes: DealProgramme[]): DealWinRate {
  const withStage = programmes.filter(p => p.deal_stage)
  const wonCount = withStage.filter(p => p.deal_stage === 'won').length
  return { wonCount, totalCount: withStage.length, pct: withStage.length > 0 ? wonCount / withStage.length : 0 }
}

export interface DealCard {
  id: string; name: string; subtitle: string
  value: number; currency: string
  stage: string; barFrac: number
}
// Most-progressed deals first; ties broken by value, largest first.
const STAGE_RANK: Record<string, number> = { won: 0, proposal: 1, scoping: 2, conversation: 3, lost: 4 }
// Design default when a deal has no coach-entered probability yet -- a fixed
// per-stage weighting (not a claimed measurement), same idea as the stage
// badge colour. A coach-entered deal_probability always takes priority over
// this. Single source of truth for "how likely is this deal" -- used for
// BOTH a deal card's progress bar and the pipeline's weighted-value total,
// so the two can never silently disagree about the same deal (they used to:
// the progress bar applied this fallback, the weighted total didn't, and
// counted any deal with no probability entered as worth exactly $0).
const STAGE_DEFAULT_PROBABILITY: Record<string, number> = { won: 1, proposal: 0.65, scoping: 0.4, conversation: 0.2, lost: 0.05 }
export function dealProbability(p: Pick<DealProgramme, 'deal_stage' | 'deal_probability'>): number {
  const stage = p.deal_stage || 'conversation'
  const explicit = p.deal_probability
  return explicit != null
    ? Math.max(0, Math.min(1, Number(explicit) / 100))
    : (STAGE_DEFAULT_PROBABILITY[stage] ?? 0.1)
}

/** Open + won deals, ordered by how far along they are. Bar reflects deal_probability when the coach has set it; otherwise a fixed per-stage default -- never derived from dollar value, which has no bearing on how likely/advanced a deal is. */
export function dealCards(programmes: DealProgramme[]): DealCard[] {
  const withStage = programmes.filter(p => p.deal_stage)
  return withStage
    .map(p => {
      const stage = p.deal_stage as string
      return {
        id: p.id,
        name: p.name,
        subtitle: [p.funder, p.country].filter(Boolean).join(' · ') || (p.type === 'donor_programme' ? 'Donor programme' : 'Direct client'),
        value: Number(p.deal_value) || 0,
        currency: p.deal_currency || 'USD',
        stage,
        barFrac: dealProbability(p),
      }
    })
    .sort((a, b) => {
      const rankDiff = (STAGE_RANK[a.stage] ?? 9) - (STAGE_RANK[b.stage] ?? 9)
      return rankDiff !== 0 ? rankDiff : b.value - a.value
    })
}

const OPEN_DEAL_STAGES = ['conversation', 'scoping', 'proposal']
/** Sum of deal_value x probability across every OPEN deal (won/lost excluded -- nothing left to weight). Uses the same dealProbability fallback as the card progress bar. */
export function weightedPipelineValue(programmes: DealProgramme[]): number {
  return programmes
    .filter(p => OPEN_DEAL_STAGES.includes(p.deal_stage || ''))
    .reduce((s, p) => s + (Number(p.deal_value) || 0) * dealProbability(p), 0)
}

export interface PipelineSnapshot {
  stages: { stage: string; count: number; value: number; currency: string }[]
  closedCount: number   // won, all-time (a point-in-time count -- no stage-change history is recorded, so this cannot be "won this month")
  openCount: number     // conversation + scoping + proposal, regardless of stage
}
/** A current, point-in-time read of the pipeline -- deliberately NOT a trend over time, since deal_stage is a snapshot field with no recorded history of past changes. */
export function pipelineSnapshot(programmes: DealProgramme[]): PipelineSnapshot {
  const funnel = dealFunnel(programmes)
  return {
    stages: funnel.stages,
    closedCount: programmes.filter(p => p.deal_stage === 'won').length,
    openCount: programmes.filter(p => OPEN_DEAL_STAGES.includes(p.deal_stage || '')).length,
  }
}

// ─── Engagements table ─────────────────────────────────────────
// The real 10-stage canvas progression (phase_0 + dp01..dp09), matching
// buildEmptyCanvas in coach-types.ts. NOT the same as the "Zone" naming or
// numeric "Commercial Readiness" score in the separate, disconnected
// single-client canvas-types.ts prototype -- this uses only the live,
// Supabase-backed canvas_decision_points a GtCV client actually has.
export const CANVAS_STAGE_ORDER = ['phase_0', 'dp01', 'dp02', 'dp03', 'dp04', 'dp05', 'dp06', 'dp07', 'dp08', 'dp09']
const CANVAS_STAGE_LABEL: Record<string, string> = {
  phase_0: 'Phase 0 · assumption clearing', dp01: 'DP01 · service reality', dp02: 'DP02 · customer clarity',
  dp03: 'DP03 · value proposition', dp04: 'DP04 · viability model', dp05: 'DP05 · market entry',
  dp06: 'DP06 · identity & partners', dp07: 'DP07 · pilot 1', dp08: 'DP08 · pilot 2', dp09: 'DP09 · commercial readiness',
}

export interface CanvasDP { dp_id: string; status?: string | null }
export interface CanvasProgress { doneCount: number; totalCount: number; currentLabel: string; currentIndex: number }
/**
 * doneCount/totalCount out of the client's REAL canvas_decision_points rows
 * (a client with no canvas rows yet -- e.g. not started, or a Clearview-only
 * client with no GtCV canvas at all -- correctly shows 0/0, never a fake 9).
 * currentLabel names the first not-done stage in the real recorded order.
 * currentIndex is that stage's position in CANVAS_STAGE_ORDER (-1 if no
 * canvas rows exist at all, CANVAS_STAGE_ORDER.length once complete) -- lets
 * a caller compare progress ACROSS clients (e.g. furthest/nearest in a
 * programme) without re-deriving the stage order itself.
 */
export function canvasProgress(dps: CanvasDP[]): CanvasProgress {
  const byId = new Map(dps.map(d => [d.dp_id, d.status]))
  const present = CANVAS_STAGE_ORDER.filter(id => byId.has(id))
  const doneCount = present.filter(id => byId.get(id) === '✓').length
  const current = present.find(id => byId.get(id) !== '✓')
  const currentIndex = present.length === 0 ? -1 : current ? CANVAS_STAGE_ORDER.indexOf(current) : CANVAS_STAGE_ORDER.length
  return {
    currentIndex,
    doneCount,
    totalCount: present.length,
    currentLabel: present.length === 0 ? 'Not started' : current ? CANVAS_STAGE_LABEL[current] : 'Complete',
  }
}

export interface EngagementCoImplementer { id: string; name: string; client_ids?: string[] | null }
/** Names of every co-implementer assigned to this client (client_ids is the only real link -- there is no reverse field on the client). */
export function coImplementerNamesForClient(clientId: string, coImplementers: EngagementCoImplementer[]): string[] {
  return coImplementers.filter(ci => (ci.client_ids || []).includes(clientId)).map(ci => ci.name)
}

export interface EngagementStatusClient { status?: string | null; fee_status?: string | null }
/**
 * A single display status merging two REAL, distinct fields: the engagement's
 * own lifecycle (status='complete' -> "Closed") takes priority once the
 * engagement is done; otherwise the fee collection state (fee_status) is
 * shown. Never invents a status value neither field actually holds.
 */
export function engagementDisplayStatus(c: EngagementStatusClient): { label: string; key: 'closed' | 'paid' | 'invoiced' | 'unpaid' | 'unset' } {
  if (c.status === 'complete') return { label: 'Closed', key: 'closed' }
  if (c.fee_status === 'paid') return { label: 'Paid up', key: 'paid' }
  if (c.fee_status === 'invoiced') return { label: 'Invoiced', key: 'invoiced' }
  if (c.fee_status === 'unpaid') return { label: 'Unpaid', key: 'unpaid' }
  return { label: 'Not set', key: 'unset' }
}

// ─── Co-implementer performance (only what's honestly computable) ─────
// "On-time gates", "utilisation %", and issue/flag notes were checked against
// the real schema and DO NOT EXIST anywhere (no due-date field to compare a
// sign-off against, no capacity/available-hours field, no structured flag
// field) -- deliberately not built here rather than fabricated. Only real,
// summable timesheet data is computed.
export interface TimesheetEntry { co_implementer_id: string; hours?: number | null; status?: string | null; entry_date?: string | null }
export interface CoImplementerWorkload { pendingHours: number; approvedHours: number; sessionsThisMonth: number }
export function coImplementerWorkload(coImplementerId: string, entries: TimesheetEntry[], now: Date = new Date()): CoImplementerWorkload {
  const mine = entries.filter(e => e.co_implementer_id === coImplementerId)
  const pendingHours = mine.filter(e => e.status === 'submitted').reduce((s, e) => s + (Number(e.hours) || 0), 0)
  const approvedHours = mine.filter(e => e.status === 'approved').reduce((s, e) => s + (Number(e.hours) || 0), 0)
  const y = now.getUTCFullYear(), m = now.getUTCMonth()
  const sessionsThisMonth = mine.filter(e => {
    if (!e.entry_date) return false
    const d = new Date(e.entry_date)
    return d.getUTCFullYear() === y && d.getUTCMonth() === m
  }).length
  return { pendingHours, approvedHours, sessionsThisMonth }
}

// ─── Client Health (portfolio view) ────────────────────────────────
// The mockup's "Avg Commercial Readiness /18" and "Avg Liquidity Readiness
// /100" dials do NOT exist at the coach layer: those scores are computed
// live inside each CLIENT's own dashboard session from that client's
// actuals/config, and are never written anywhere the coach's portfolio view
// can read across every client at once. Building those numbers here would
// mean inventing them. Instead this uses the real signal that already
// exists and is already live: ai_health_checks (an AI-generated report per
// Clearview client per period), classified by the SAME keyword logic
// already shipped in ClearviewHealthSummary -- extracted here so it's
// tested once instead of living only inline in a component.
export type HealthLabel = 'Needs attention' | 'Watch' | 'Healthy' | 'Reviewed' | 'No data'
export interface HealthStatus { label: HealthLabel; dot: string }
export function healthStatusFromReportText(text?: string | null): HealthStatus {
  if (!text) return { label: 'No data', dot: '⚪' }
  const lower = text.toLowerCase()
  if (lower.includes('red') || lower.includes('at risk') || lower.includes('concern')) return { label: 'Needs attention', dot: '🔴' }
  if (lower.includes('amber') || lower.includes('caution')) return { label: 'Watch', dot: '🟡' }
  if (lower.includes('green') || lower.includes('healthy') || lower.includes('strong')) return { label: 'Healthy', dot: '🟢' }
  return { label: 'Reviewed', dot: '🔵' }
}

export interface HealthReport { client_id: string; report_text?: string | null; generated_at?: string | null; period?: string | null }
export interface PortfolioHealthCounts { needsAttention: number; watch: number; healthy: number; reviewed: number; noData: number }
/** Counts across every financial/Clearview client's latest health report -- real counts of a real, already-computed status, never an averaged score. */
export function portfolioHealthCounts(clients: { id: string }[], latestReportByClient: Record<string, HealthReport | null>): PortfolioHealthCounts {
  const counts: PortfolioHealthCounts = { needsAttention: 0, watch: 0, healthy: 0, reviewed: 0, noData: 0 }
  for (const c of clients) {
    const label = healthStatusFromReportText(latestReportByClient[c.id]?.report_text).label
    if (label === 'Needs attention') counts.needsAttention++
    else if (label === 'Watch') counts.watch++
    else if (label === 'Healthy') counts.healthy++
    else if (label === 'Reviewed') counts.reviewed++
    else counts.noData++
  }
  return counts
}

export interface ProgrammeGroup<C> { programme: DealProgramme | null; clients: C[] }
/** Groups clients under their real programme; clients with no programme_id land in a null-programme ("independent") bucket -- never dropped. */
export function groupClientsByProgramme<C extends { programme_id?: string | null }>(
  clients: C[], programmesById: Record<string, DealProgramme>,
): ProgrammeGroup<C>[] {
  const groups = new Map<string, ProgrammeGroup<C>>()
  const independent: C[] = []
  for (const c of clients) {
    const programme = c.programme_id ? programmesById[c.programme_id] : undefined
    if (!programme) { independent.push(c); continue }
    if (!groups.has(programme.id)) groups.set(programme.id, { programme, clients: [] })
    groups.get(programme.id)!.clients.push(c)
  }
  const result = Array.from(groups.values())
  if (independent.length > 0) result.push({ programme: null, clients: independent })
  return result
}

// ─── Programmes & Deals (pipeline funnel + real per-deal detail) ──────
// "Owner" (who's chasing the deal) and "Do next" (a next-action narrative)
// were checked against the schema before building the deal-funnel view and
// DO NOT EXIST -- no owner field on programmes, no structured next-action
// field anywhere. Neither is built here. "LSPs" (client count) and
// "Likelihood" both map directly onto real fields already used elsewhere
// (programme membership, deal_probability).
const FUNNEL_STAGES = ['conversation', 'scoping', 'proposal', 'won'] as const
export interface FunnelStage { stage: string; count: number; value: number; currency: string }
export interface DealFunnel { stages: FunnelStage[]; conversionPct: number }
/** conversionPct = won / (won + lost) -- of deals that reached a terminal outcome, the share that were won. 0 when nothing has closed yet, never NaN. */
export function dealFunnel(programmes: DealProgramme[]): DealFunnel {
  const cur = programmes.find(p => p.deal_currency)?.deal_currency || 'USD'
  const stages = FUNNEL_STAGES.map(stage => {
    const inStage = programmes.filter(p => (p.deal_stage || 'conversation') === stage)
    return { stage, count: inStage.length, value: inStage.reduce((s, p) => s + (Number(p.deal_value) || 0), 0), currency: cur }
  })
  const won = programmes.filter(p => p.deal_stage === 'won').length
  const lost = programmes.filter(p => p.deal_stage === 'lost').length
  return { stages, conversionPct: won + lost > 0 ? won / (won + lost) : 0 }
}

/** Real count of engagement_clients under this programme -- the mockup's "LSPs" figure. */
export function clientCountForProgramme(programmeId: string, clients: { programme_id?: string | null }[]): number {
  return clients.filter(c => c.programme_id === programmeId).length
}

export interface CanvasSpread { furthestLabel: string; nearestLabel: string; startedCount: number }
/**
 * Across every client in a programme with at least one real canvas row,
 * the furthest-along and least-along stage labels -- the mockup's
 * "Furthest zone / Nearest zone" for a won deal. Clients with no canvas
 * rows at all are excluded from the comparison (nothing to compare), and
 * counted separately in startedCount so they're never silently folded in
 * as "at zone 0".
 */
export function programmeCanvasSpread(progressList: CanvasProgress[]): CanvasSpread | null {
  const started = progressList.filter(p => p.currentIndex >= 0)
  if (started.length === 0) return null
  const furthest = started.reduce((a, b) => (b.currentIndex > a.currentIndex ? b : a))
  const nearest = started.reduce((a, b) => (b.currentIndex < a.currentIndex ? b : a))
  return { furthestLabel: furthest.currentLabel, nearestLabel: nearest.currentLabel, startedCount: started.length }
}
