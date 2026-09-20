// ============================================================
// TAKING THE MONTHLY PHOTOGRAPH.
//
// The decisions about WHEN and WHETHER, separated from the database and the
// network so they can be tested directly. The route that runs this (see
// app/api/monthly-snapshot/route.ts) does the talking to Supabase; everything
// that could be got wrong is here.
//
// WHY IT IS CHECKED DAILY AND WRITTEN MONTHLY. A job that runs once a month
// and fails has lost that month, and nobody finds out until somebody looks at
// a chart a year later and sees a gap. A job that looks every day and writes
// only when the month is not yet recorded cannot lose a month: it simply
// catches up the next morning. The cost of the extra checks is one query a
// day that usually finds the work already done.
// ============================================================
import { anonymizedRefCode, readinessStage, type ClientSnapshot } from './portfolio-intelligence'

/** The first day of the month a moment falls in, as a plain calendar date. */
export function monthKey(when: Date | string = new Date()): string {
  const d = typeof when === 'string' ? new Date(when + (when.length === 10 ? 'T12:00:00Z' : '')) : when
  if (Number.isNaN(d.getTime())) throw new Error('monthKey needs a real date')
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

/** The month before a given month key, so a gap can be described. */
export function previousMonth(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`
}

/**
 * Which engagements still need a reading for this month.
 *
 * A reading that was skipped counts as taken: the month recorded that it could
 * not be read, which is a fact worth keeping, and retrying it every day for
 * the rest of the month would just rewrite the same failure.
 */
export function stillToTake(
  allClientIds: string[],
  alreadyTaken: { client_id: string }[],
): string[] {
  const done = new Set(alreadyTaken.map((r) => r.client_id))
  return allClientIds.filter((id) => !done.has(id))
}

export interface SnapshotRow {
  client_id: string
  ref_code: string
  snapshot_month: string
  engagement_mode: string
  sector: string | null
  country: string | null
  programme_id: string | null
  currency: string | null
  consent_to_be_named: boolean
  ir_score: number | null
  ir_tier: string | null
  readiness_stage: string | null
  confidence_score: number | null
  confidence_badges: string[] | null
  annual_revenue: number | null
  declared_revenue: number | null
  verified_revenue: number | null
  unattributed_revenue: number | null
  fac_amount: number | null
  fac_band: string | null
  revenue_growth_pct: number | null
  cost_ratio_pct: number | null
  gross_margin_pct: number | null
  ebitda_margin_pct: number | null
  net_margin_pct: number | null
  rule_of_40: number | null
  dscr_min: number | null
  burn_multiple: number | null
  roi_pct: number | null
  decision_points_signed: number | null
  decision_points_total: number | null
  readiness_checkpoints_taken: number | null
  detail: unknown
  skipped_reason: string | null
}

/** Anything that is not a real number becomes nothing, never nought. */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** What the coaching side of an engagement had reached this month. */
export interface CoachingProgress {
  decisionPointsSigned: number
  decisionPointsTotal: number
  readinessCheckpointsTaken: number
}

/**
 * One month's reading of one engagement with a financial model behind it.
 *
 * NO NAME GOES IN. Not the organisation's and not a person's. The photograph
 * carries the engagement's id and a reference code derived from it, and a name
 * is only ever resolved by looking at the live record. That is what makes
 * "remove the name from every photograph" a thing that needs no work.
 */
export function financialRow(
  snapshot: ClientSnapshot,
  month: string,
  extra: {
    declaredRevenue?: number | null
    verifiedRevenue?: number | null
    unattributedRevenue?: number | null
    coaching?: CoachingProgress | null
  } = {},
): SnapshotRow {
  const p = snapshot.performance || null
  return {
    client_id: snapshot.clientId,
    ref_code: anonymizedRefCode(snapshot.clientId),
    snapshot_month: month,
    engagement_mode: 'financial',
    sector: snapshot.sector ?? null,
    country: snapshot.country ?? null,
    programme_id: snapshot.programmeId ?? null,
    currency: snapshot.currency ?? null,
    consent_to_be_named: !!snapshot.consentToBeNamed,
    ir_score: num(snapshot.irScore),
    ir_tier: snapshot.irTier ?? null,
    readiness_stage: snapshot.irTier ? readinessStage(snapshot.irTier) : null,
    confidence_score: num(snapshot.confidenceScore),
    confidence_badges: snapshot.confidenceBadges ?? null,
    annual_revenue: num(snapshot.annualRevenue),
    declared_revenue: num(extra.declaredRevenue),
    verified_revenue: num(extra.verifiedRevenue),
    unattributed_revenue: num(extra.unattributedRevenue),
    fac_amount: num((snapshot.fac as any)?.amount ?? (snapshot.fac as any)?.capacity),
    fac_band: ((snapshot.fac as any)?.band ?? null) as string | null,
    revenue_growth_pct: num(p?.revenueGrowthPct),
    cost_ratio_pct: num(p?.costRatioPct),
    gross_margin_pct: num(p?.grossMarginPct),
    ebitda_margin_pct: num(p?.ebitdaMarginPct),
    net_margin_pct: num(p?.netMarginPct),
    rule_of_40: num(p?.ruleOf40),
    dscr_min: num(p?.dscrMin),
    burn_multiple: num(p?.burnMultiple),
    roi_pct: num(p?.roiPct),
    decision_points_signed: extra.coaching ? extra.coaching.decisionPointsSigned : null,
    decision_points_total: extra.coaching ? extra.coaching.decisionPointsTotal : null,
    readiness_checkpoints_taken: extra.coaching ? extra.coaching.readinessCheckpointsTaken : null,
    // The whole reading, minus the one field that is a name.
    detail: stripNames(snapshot),
    skipped_reason: null,
  }
}

/**
 * One month's reading of a coaching engagement, which has no financial model.
 *
 * Most of Habib's work is this kind. Leaving it out would have meant a record
 * that missed the thing the method is actually about.
 */
export function coachingRow(
  client: { id: string; sector?: string | null; country?: string | null; programme_id?: string | null },
  month: string,
  coaching: CoachingProgress,
  consentToBeNamed = false,
): SnapshotRow {
  return {
    client_id: client.id,
    ref_code: anonymizedRefCode(client.id),
    snapshot_month: month,
    engagement_mode: 'canvas',
    sector: client.sector ?? null,
    country: client.country ?? null,
    programme_id: client.programme_id ?? null,
    currency: null,
    consent_to_be_named: !!consentToBeNamed,
    ir_score: null, ir_tier: null, readiness_stage: null,
    confidence_score: null, confidence_badges: null,
    annual_revenue: null, declared_revenue: null, verified_revenue: null,
    unattributed_revenue: null,
    fac_amount: null, fac_band: null,
    revenue_growth_pct: null, cost_ratio_pct: null, gross_margin_pct: null,
    ebitda_margin_pct: null, net_margin_pct: null, rule_of_40: null,
    dscr_min: null, burn_multiple: null, roi_pct: null,
    decision_points_signed: coaching.decisionPointsSigned,
    decision_points_total: coaching.decisionPointsTotal,
    readiness_checkpoints_taken: coaching.readinessCheckpointsTaken,
    detail: { coaching },
    skipped_reason: null,
  }
}

/**
 * A month that could not be read.
 *
 * A gap and a failure are different facts, and a chart that cannot tell them
 * apart invites the wrong conclusion. This records the failure.
 */
export function skippedRow(clientId: string, month: string, reason: string, mode = 'financial'): SnapshotRow {
  const blank = coachingRow({ id: clientId }, month, {
    decisionPointsSigned: 0, decisionPointsTotal: 0, readinessCheckpointsTaken: 0,
  })
  return {
    ...blank,
    engagement_mode: mode,
    decision_points_signed: null,
    decision_points_total: null,
    readiness_checkpoints_taken: null,
    detail: null,
    skipped_reason: reason.slice(0, 300),
  }
}

/**
 * The reading with every name taken out of it before it is filed.
 *
 * The snapshot the portfolio view works from carries the organisation's name,
 * because that view is for the one person allowed to see it. A photograph kept
 * for years is a different thing, and keeps no name at all.
 */
export function stripNames(snapshot: ClientSnapshot): Record<string, unknown> {
  const { name, businessUnits, ...rest } = snapshot as any
  return {
    ...rest,
    // The units are kept as shares, because which unit earns what is a real
    // finding, but a unit name can identify a business as surely as its own.
    businessUnits: Array.isArray(businessUnits)
      ? businessUnits.map((u: any, i: number) => ({
        position: i + 1,
        sharePct: num(u?.sharePct ?? u?.share) ?? null,
        revenue: num(u?.revenue) ?? null,
      }))
      : [],
  }
}
