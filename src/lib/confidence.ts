// Confidence & badges: how much a period's declared figures can be trusted,
// and what recognition a business has earned. See docs/RECONCILIATION_SPEC.md.
//
// The load-bearing design rule (spec §7): VERIFICATION ONLY EVER ADDS. A cash-
// heavy business that keeps honest, consistent, complete records must not score
// lower than it would have before reconciliation existed just because it can't
// payment-verify. So the confidence score is built from a base every business
// can reach on records alone (consistency + completeness), and payment
// verification is a bonus stacked ON TOP -- never a gate below it. This is
// enforced by tests: score is monotonic in matched value, and a fully-
// consistent cash business clears the self-reported floor.
//
// Pure module: no clock, no I/O. The caller assembles PeriodSignals from data
// the platform already tracks (actuals presence, COGS, close status, streaks)
// plus the reconciliation result, and gets back a label, a 0-100 score, the
// reasons behind it, and the earned badges.

export type ConfidenceLabel =
  | 'verified'                // a meaningful share of value is payment-confirmed
  | 'triangulated'            // not payment-verified, but corroborated by other data
  | 'self_reported_plausible' // declared, internally consistent -- the honest floor
  | 'flagged'                 // something doesn't add up; needs a human

export type Badge =
  | 'payments_verified'       // has at least one payment-matched sale this period
  | 'consistently_reported'   // a run of internally-consistent months
  | 'records_complete'        // every elapsed month has actuals
  | 'books_closed'            // this month formally closed on time

// Share of DECLARED revenue value that is payment-confirmed. At/above this, the
// period is 'verified'. Half of revenue confirmed by independent payments is a
// strong, defensible bar for a lender.
export const VERIFIED_SHARE_THRESHOLD = 0.5
// Consecutive consistent months required for the Consistently Reported badge.
export const CONSISTENCY_STREAK_FOR_BADGE = 3
// Inbound money with no matching entry, as a share of declared revenue, above
// which the period is flagged (materially more money arrived than was logged).
export const UNATTRIBUTED_FLAG_SHARE = 0.25

// Score composition (max 100): a base reachable WITHOUT any verification, plus a
// verification bonus on top. The base is what protects cash businesses.
const CONSISTENCY_POINTS = 40 // internally consistent, no red flags
const COMPLETENESS_POINTS = 30 // records/actuals present for the period
const VERIFICATION_POINTS = 30 // matched share of declared value -- the bonus

export interface PeriodSignals {
  // --- Reconciliation (may all be zero for a cash-only or unlinked business) ---
  matchedValue: number
  unattributedInboundValue: number
  // --- Declared figures ---
  declaredValue: number // total declared revenue value for the period
  // --- Corroboration / consistency, from data the platform already has ---
  hasActuals: boolean          // this month has actuals entered
  recordsComplete: boolean     // every elapsed month has actuals
  cogsConsistent: boolean      // COGS present and consistent with revenue (triangulation)
  internallyConsistent: boolean // no cash-negative anomalies or red flags
  monthsConsistentStreak: number
  monthClosedOnTime: boolean
}

export interface ConfidenceResult {
  label: ConfidenceLabel
  score: number // 0-100
  verifiedShare: number // matched / declared, 0..1
  reasons: string[]
  badges: Badge[]
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

/** Fraction of declared revenue value confirmed by an independent payment. */
export function verifiedShareOfDeclared(matchedValue: number, declaredValue: number): number {
  if (declaredValue <= 0) return 0
  return clamp01(matchedValue / declaredValue)
}

export function deriveBadges(s: PeriodSignals): Badge[] {
  const badges: Badge[] = []
  if (s.matchedValue > 0) badges.push('payments_verified')
  if (s.monthsConsistentStreak >= CONSISTENCY_STREAK_FOR_BADGE) badges.push('consistently_reported')
  if (s.recordsComplete) badges.push('records_complete')
  if (s.monthClosedOnTime) badges.push('books_closed')
  return badges
}

export function assessConfidence(s: PeriodSignals): ConfidenceResult {
  const verifiedShare = verifiedShareOfDeclared(s.matchedValue, s.declaredValue)
  const unattributedShare = s.declaredValue > 0 ? s.unattributedInboundValue / s.declaredValue : 0
  const reasons: string[] = []

  // Base score -- reachable on records alone, no wallet required.
  let score = 0
  if (s.internallyConsistent) {
    score += CONSISTENCY_POINTS
    reasons.push('Figures are internally consistent.')
  } else {
    reasons.push('Internal inconsistencies detected in this period.')
  }
  if (s.hasActuals) score += COMPLETENESS_POINTS * (s.recordsComplete ? 1 : 0.5)
  if (s.recordsComplete) reasons.push('Records are complete for every elapsed month.')

  // Verification bonus -- stacked on top, never subtracted.
  const verificationBonus = VERIFICATION_POINTS * verifiedShare
  score += verificationBonus
  if (verifiedShare > 0) {
    reasons.push(`${Math.round(verifiedShare * 100)}% of declared revenue is confirmed by independent payments.`)
  }

  score = Math.round(Math.max(0, Math.min(100, score)))

  // Label. Order matters: a genuine red flag overrides an otherwise-good score.
  let label: ConfidenceLabel
  const flagged = (!s.internallyConsistent && s.hasActuals) || unattributedShare > UNATTRIBUTED_FLAG_SHARE
  if (unattributedShare > UNATTRIBUTED_FLAG_SHARE) {
    reasons.push(`Inbound payments exceed declared revenue by a material margin (${Math.round(unattributedShare * 100)}%).`)
  }
  if (flagged) {
    label = 'flagged'
  } else if (verifiedShare >= VERIFIED_SHARE_THRESHOLD) {
    label = 'verified'
  } else if (s.cogsConsistent && s.hasActuals && s.internallyConsistent) {
    label = 'triangulated'
  } else {
    // The honest floor: declared, plausible, not contradicted by anything.
    label = 'self_reported_plausible'
  }

  return { label, score, verifiedShare, reasons, badges: deriveBadges(s) }
}
