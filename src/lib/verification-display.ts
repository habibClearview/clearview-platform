// Human-facing presentation for the verification layer: how confidence labels,
// badges, and wallet-link readiness states are described to a business owner and
// their coach. Kept out of the React components so the wording is testable and
// lives in one place. See docs/RECONCILIATION_SPEC.md §5, §7, §8, §10.
//
// Pure module: strings and small mappers only, no I/O.

import type { Badge, ConfidenceLabel, PeriodSignals } from './confidence'

// Wallet-link readiness (provider_links.status). Copy matches the Uganda script
// in the spec -- accurate regardless of exact API timing.
export type ReadinessStatus = 'not_started' | 'wallet_activated' | 'link_pending' | 'tier1_active'

export interface Display {
  title: string
  blurb: string
  tone: 'good' | 'neutral' | 'warn'
}

export const CONFIDENCE_DISPLAY: Record<ConfidenceLabel, Display> = {
  verified: {
    title: 'Verified',
    blurb: 'Sales confirmed against real payments from an independent source.',
    tone: 'good',
  },
  triangulated: {
    title: 'Corroborated',
    blurb: 'Consistent with your costs and stock — trustworthy without a payment link.',
    tone: 'good',
  },
  self_reported_plausible: {
    title: 'Self-reported',
    blurb: 'Based on your own records — consistent and plausible, nothing contradicts it.',
    tone: 'neutral',
  },
  flagged: {
    title: 'Needs a look',
    blurb: 'Some figures do not line up yet and are worth a second look.',
    tone: 'warn',
  },
}

export interface BadgeDisplay {
  icon: string
  title: string
  earnedBlurb: string
  howToEarn: string
}

export const BADGE_DISPLAY: Record<Badge, BadgeDisplay> = {
  payments_verified: {
    icon: '✅',
    title: 'Payments Verified',
    earnedBlurb: 'Your sales are confirmed against real mobile-money payments.',
    howToEarn: 'Connect your mobile-money account so sales verify automatically.',
  },
  consistently_reported: {
    icon: '📈',
    title: 'Consistently Reported',
    earnedBlurb: 'Several months of steady, consistent records.',
    howToEarn: 'Keep recording each month — a few consistent months earns this.',
  },
  records_complete: {
    icon: '🗂️',
    title: 'Records Complete',
    earnedBlurb: 'Every month has its figures entered.',
    howToEarn: 'Fill in actuals for every month with no gaps.',
  },
  books_closed: {
    icon: '🔒',
    title: 'Books Closed',
    earnedBlurb: 'Your months are formally closed on time.',
    howToEarn: 'Close each month once its figures are final.',
  },
}

// Order badges are shown in (most prestigious first).
export const BADGE_ORDER: Badge[] = [
  'payments_verified',
  'consistently_reported',
  'records_complete',
  'books_closed',
]

export const READINESS_DISPLAY: Record<ReadinessStatus, Display> = {
  not_started: {
    title: 'Working on your own records',
    blurb: 'The system works today on the figures you record.',
    tone: 'neutral',
  },
  wallet_activated: {
    title: 'One step away',
    blurb: 'You have a business wallet — you are one step from automatic verification.',
    tone: 'neutral',
  },
  link_pending: {
    title: 'Connecting',
    blurb: 'Automatic verification is being connected — coming shortly.',
    tone: 'neutral',
  },
  tier1_active: {
    title: 'Verifying automatically',
    blurb: 'Your transactions now verify themselves against your real payments.',
    tone: 'good',
  },
}

/**
 * Assemble the confidence PeriodSignals from primitives a dashboard already has,
 * so the caller doesn't have to remember every field. Reconciliation figures
 * default to zero (a cash-only / unlinked business), which the confidence model
 * treats as "no verification signal", never as a penalty.
 */
export function buildPeriodSignals(input: {
  declaredValue: number
  matchedValue?: number
  unattributedInboundValue?: number
  hasActuals: boolean
  recordsComplete: boolean
  cogsConsistent: boolean
  internallyConsistent: boolean
  monthsConsistentStreak: number
  monthClosedOnTime: boolean
}): PeriodSignals {
  return {
    matchedValue: input.matchedValue ?? 0,
    unattributedInboundValue: input.unattributedInboundValue ?? 0,
    declaredValue: input.declaredValue,
    hasActuals: input.hasActuals,
    recordsComplete: input.recordsComplete,
    cogsConsistent: input.cogsConsistent,
    internallyConsistent: input.internallyConsistent,
    monthsConsistentStreak: input.monthsConsistentStreak,
    monthClosedOnTime: input.monthClosedOnTime,
  }
}

/** Split all badges into earned vs still-to-earn, in display order. */
export function partitionBadges(earned: Badge[]): { earned: Badge[]; locked: Badge[] } {
  const earnedSet = new Set(earned)
  return {
    earned: BADGE_ORDER.filter(b => earnedSet.has(b)),
    locked: BADGE_ORDER.filter(b => !earnedSet.has(b)),
  }
}
