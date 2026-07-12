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

export interface RevenueStream { key: string; label: string; value: number; tag: string; barFrac: number }
export interface RevenueStreams { streams: RevenueStream[]; total: number }
/**
 * Three revenue streams, matching the coach's real commercial model
 * (docs/gtcv/README.md): programme-funded advisory (a donor programme pays),
 * self-funded GtCV advisory (an independent client pays for canvas work), and
 * Clearview subscriptions (an independent client on the financial/Clearview
 * product). barFrac is each stream's value relative to the largest stream, so
 * bars are comparative, never fabricated targets.
 */
export function revenueStreams(clients: FeeClient[], programmesById: Record<string, DealProgramme>): RevenueStreams {
  let programmeAdvisory = 0, selfFundedGtcv = 0, clearviewSubscriptions = 0
  for (const c of clients) {
    const amount = fee(c)
    if (amount <= 0) continue
    const programme = c.programme_id ? programmesById[c.programme_id] : undefined
    if (programme && programme.type === 'donor_programme') programmeAdvisory += amount
    else if (isIndependent(c) && c.engagement_mode === 'canvas') selfFundedGtcv += amount
    else if (isIndependent(c) && c.engagement_mode === 'financial') clearviewSubscriptions += amount
  }
  const values = [programmeAdvisory, selfFundedGtcv, clearviewSubscriptions]
  const max = Math.max(1, ...values)
  const streams: RevenueStream[] = [
    { key: 'programme_advisory', label: 'Programme advisory', value: programmeAdvisory, tag: 'Grant-funded', barFrac: programmeAdvisory / max },
    { key: 'self_funded_gtcv', label: 'Self-funded GtCV advisory', value: selfFundedGtcv, tag: 'Independent · growing', barFrac: selfFundedGtcv / max },
    { key: 'clearview_subscriptions', label: 'Clearview subscriptions', value: clearviewSubscriptions, tag: 'Independent · recurring', barFrac: clearviewSubscriptions / max },
  ]
  return { streams, total: programmeAdvisory + selfFundedGtcv + clearviewSubscriptions }
}

export interface DealCard {
  id: string; name: string; subtitle: string
  value: number; currency: string
  stage: string; barFrac: number
}
// Most-progressed deals first; ties broken by value, largest first.
const STAGE_RANK: Record<string, number> = { won: 0, proposal: 1, scoping: 2, conversation: 3, lost: 4 }

/** Open + won deals, ordered by how far along they are. Bars are relative to the largest deal value in view -- no invented quota. */
export function dealCards(programmes: DealProgramme[]): DealCard[] {
  const withStage = programmes.filter(p => p.deal_stage)
  const maxValue = Math.max(1, ...withStage.map(p => Number(p.deal_value) || 0))
  return withStage
    .map(p => ({
      id: p.id,
      name: p.name,
      subtitle: [p.funder, p.country].filter(Boolean).join(' · ') || (p.type === 'donor_programme' ? 'Donor programme' : 'Direct client'),
      value: Number(p.deal_value) || 0,
      currency: p.deal_currency || 'USD',
      stage: p.deal_stage as string,
      barFrac: (Number(p.deal_value) || 0) / maxValue,
    }))
    .sort((a, b) => {
      const rankDiff = (STAGE_RANK[a.stage] ?? 9) - (STAGE_RANK[b.stage] ?? 9)
      return rankDiff !== 0 ? rankDiff : b.value - a.value
    })
}
