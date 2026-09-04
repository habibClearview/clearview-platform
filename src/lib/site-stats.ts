// ============================================================
// THE FIGURES ON THE PUBLIC SITE, AND WHERE EACH ONE CAME FROM.
//
// Two kinds of number appear on habibonifade.com and they carry different
// risks, so they are kept apart here.
//
// OWN is Habib's own work. Those figures are defensible because he did the
// work and holds the records.
//
// MARKET is a claim about the world. A programme manager who reads the OECD's
// aid data for a living will check these, and being wrong in front of that
// reader costs more than the figure gains. So each one carries the publication
// it came from and a link, and the site renders the citation beside the claim
// rather than in a footnote nobody opens.
//
// A figure without a source does not belong in this file, and a figure that is
// not in this file does not belong on the site.
// ============================================================

export interface SiteStat {
  /** What sits before the number, e.g. a currency. */
  pre?: string
  /** The number itself. Counts up on screen. */
  n: number
  /** What sits after it, e.g. a unit. */
  post?: string
  /** What the number means, in a sentence a reader finishes. */
  label: string
  /** Who published it. Rendered beside the claim. */
  source?: string
  /** Where a reader checks it. */
  url?: string
}

/** Habib's own work. Evidenced by the engagements themselves. */
export const OWN_STATS: SiteStat[] = [
  {
    pre: 'UGX ', n: 33, post: 'bn',
    label: 'of trade a UGX 1bn reserve was structured to unlock',
  },
  {
    n: 98, post: '%+',
    label: 'repayment across a structured credit cluster',
  },
  {
    n: 832, post: '',
    label: 'households profiled in a liquidity study',
  },
  {
    n: 7, post: '',
    label: 'countries across Africa',
  },
]

/**
 * Claims about the world. Every one is sourced.
 *
 * ON THE 28 PER CENT. This is the top of the range the OECD projected for the
 * fall in net bilateral aid to sub-Saharan Africa in 2025. The actual figures
 * have since been published and are worse: bilateral ODA fell 26.4 per cent
 * and total ODA 23.1 per cent, the largest annual contraction on record. The
 * projection is kept because the sentence is about the range organisations
 * were told to plan against; the actual is in ACTUALS below for when the copy
 * is ready to use it.
 */
export const MARKET_STATS: SiteStat[] = [
  {
    n: 28, post: '%',
    label: 'the top of the range bilateral aid to sub-Saharan Africa was projected to fall by in 2025',
    source: 'OECD, Cuts in Official Development Assistance, June 2025',
    url: 'https://www.oecd.org/en/publications/2025/06/cuts-in-official-development-assistance_e161f0c5/full-report.html',
  },
  {
    n: 11, post: '',
    label: 'donor countries with cuts announced through to 2027, together nearly three quarters of all aid',
    source: 'OECD, Cuts in Official Development Assistance, June 2025',
    url: 'https://www.oecd.org/en/publications/2025/06/cuts-in-official-development-assistance_e161f0c5/full-report.html',
  },
  {
    pre: '$', n: 65, post: 'm',
    // The design said "average". It is the median, and a reader who works in
    // blended finance knows the difference. Corrected here.
    label: 'the median blended finance deal in 2024, up from 38m across the three years before',
    source: 'Convergence, State of Blended Finance 2025',
    url: 'https://www.convergence.finance/resource/state-of-blended-finance-2025/view',
  },
]

/** Published actuals, stronger than the projection and available when wanted. */
export const ACTUALS = {
  bilateralFall2025: 26.4,
  totalFall2025: 23.1,
  source: 'OECD, preliminary 2025 data, April 2026',
  url: 'https://www.oecd.org/en/about/news/press-releases/2026/04/international-aid-fell-sharply-in-2025-says-oecd.html',
}

/** The newsletter, confirmed by Habib. Kit holds a separate, smaller list. */
export const LINKEDIN_READERS = 1145
