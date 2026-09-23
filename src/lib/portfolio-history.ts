// ============================================================
// The monthly record, turned into something a page can draw.
//
// 23 September 2026. Habib: the portfolio intelligence page showed a single
// reading with no history, so a programme director could not see whether
// anything had moved, and a funder could not say what their money changed.
//
// portfolio_snapshots holds one row per engagement per month, filed by the
// scheduled job and never rewritten. This turns those rows into one series per
// indicator, on the same four filters the page already has.
//
// EVERY FUNCTION HERE IS PURE. Rows in, series out, no database and no
// request, because these are the rules that decide what a funder reads and a
// wrong one is invisible until somebody quotes it.
//
// TWO RULES THAT RUN THROUGH ALL OF IT.
//
//   A median is never a mean. One large engagement must not be able to move a
//   portfolio figure, which is exactly what an average lets it do.
//
//   Below five engagements in a month, nothing is published for that month. At
//   three a reader can work out who they are. The month is returned as null
//   and the page shows the gap rather than hiding it.
// ============================================================

/** The fewest engagements a month must hold before a figure may be published. */
export const MIN_FOR_PUBLICATION = 5

export type ReadinessStage = 'pre_investment' | 'development_stage' | 'near_ready' | 'investment_ready'

/** Bottom to top. Moving down this list is what "slipped back" means. */
export const STAGE_ORDER: ReadinessStage[] = [
  'pre_investment', 'development_stage', 'near_ready', 'investment_ready',
]

export interface SnapshotRow {
  client_id: string
  ref_code: string
  snapshot_month: string
  currency?: string | null
  engagement_mode?: string | null
  sector?: string | null
  country?: string | null
  programme_id?: string | null
  readiness_stage?: string | null
  ir_score?: number | null
  confidence_score?: number | null
  declared_revenue?: number | null
  verified_revenue?: number | null
  unattributed_revenue?: number | null
  fac_amount?: number | null
  gross_margin_pct?: number | null
  ebitda_margin_pct?: number | null
  net_margin_pct?: number | null
  revenue_growth_pct?: number | null
  cost_ratio_pct?: number | null
  dscr_min?: number | null
  decision_points_signed?: number | null
  decision_points_total?: number | null
  skipped_reason?: string | null
}

export interface HistoryFilter {
  programmeId?: string
  sector?: string
  country?: string
  readinessStage?: string
}

/**
 * Whether a row belongs in the view.
 *
 * A readiness filter asks "engagements that were at this stage", which is a
 * question about each month separately, not about where they are now. So it is
 * applied per row, and a month in which an engagement sat elsewhere simply has
 * one fewer row.
 */
export function matches(row: SnapshotRow, filter: HistoryFilter): boolean {
  if (filter.programmeId && row.programme_id !== filter.programmeId) return false
  if (filter.sector && row.sector !== filter.sector) return false
  if (filter.country && row.country !== filter.country) return false
  if (filter.readinessStage && row.readiness_stage !== filter.readinessStage) return false
  return true
}

/** The months present, oldest first, as YYYY-MM. */
export function monthsIn(rows: SnapshotRow[]): string[] {
  const seen = new Set<string>()
  for (const r of rows) {
    if (typeof r.snapshot_month === 'string' && r.snapshot_month.length >= 7) {
      seen.add(r.snapshot_month.slice(0, 7))
    }
  }
  return Array.from(seen).sort()
}

/** A readable label for a month key: "Mar 26". */
export function monthLabel(key: string): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [y, m] = key.split('-')
  const i = Number(m) - 1
  if (!names[i] || !y) return key
  return names[i] + ' ' + y.slice(2)
}

function numbers(values: (number | null | undefined)[]): number[] {
  return values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
}

/**
 * The middle value. Not the mean: on a portfolio of twenty, one large
 * engagement moves a mean and cannot move a median, and a portfolio figure
 * that one member can move is not a portfolio figure.
 */
export function median(values: (number | null | undefined)[]): number | null {
  const n = numbers(values).sort((a, b) => a - b)
  if (n.length === 0) return null
  const mid = Math.floor(n.length / 2)
  return n.length % 2 ? n[mid] : (n[mid - 1] + n[mid]) / 2
}

export function total(values: (number | null | undefined)[]): number | null {
  const n = numbers(values)
  return n.length === 0 ? null : n.reduce((s, v) => s + v, 0)
}

export type Grouped = Record<string, SnapshotRow[]>

/** Rows that pass the filter, bucketed by month. */
export function groupByMonth(rows: SnapshotRow[], filter: HistoryFilter = {}): Grouped {
  const out: Grouped = {}
  for (const row of rows) {
    if (!matches(row, filter)) continue
    const key = typeof row.snapshot_month === 'string' ? row.snapshot_month.slice(0, 7) : ''
    if (!key) continue
    if (!out[key]) out[key] = []
    out[key].push(row)
  }
  return out
}

/**
 * How many engagements a month actually read. A month whose rows all carry a
 * skipped_reason read nothing, and must not be presented as a month with a
 * figure of zero.
 */
export function readCount(rows: SnapshotRow[]): number {
  return rows.filter((r) => !r.skipped_reason).length
}

export interface SeriesPoint {
  month: string
  label: string
  value: number | null
  /** How many engagements stood behind the figure. */
  n: number
  /** Set when there is a figure but it is withheld for being too few. */
  withheld?: boolean
}

/**
 * One indicator across every month.
 *
 * `suppressBelowMin` is false only for counts of the population itself (how
 * many engagements, how many at a stage), which are not disclosive: knowing
 * three engagements exist tells a reader nothing about which three.
 */
export function buildSeries(
  grouped: Grouped,
  months: string[],
  compute: (rows: SnapshotRow[]) => number | null,
  suppressBelowMin = true,
): SeriesPoint[] {
  return months.map((month) => {
    const rows = grouped[month] || []
    const n = readCount(rows)
    if (n === 0) return { month, label: monthLabel(month), value: null, n: 0 }
    if (suppressBelowMin && n < MIN_FOR_PUBLICATION) {
      return { month, label: monthLabel(month), value: null, n, withheld: true }
    }
    return { month, label: monthLabel(month), value: compute(rows.filter((r) => !r.skipped_reason)), n }
  })
}

// ------------------------------------------------------------
// The indicators themselves
// ------------------------------------------------------------

/**
 * Verified share of declared revenue.
 *
 * Deliberately a share of the totals rather than the median of each
 * engagement's own share, because the question a funder asks is how much of
 * the money in this portfolio is confirmed, not how the typical engagement is
 * doing. Money that arrived but was never matched to a sale is counted
 * nowhere here; it has its own line.
 */
export function verifiedShare(rows: SnapshotRow[]): number | null {
  const declared = total(rows.map((r) => r.declared_revenue))
  const verified = total(rows.map((r) => r.verified_revenue))
  if (declared === null || verified === null || declared <= 0) return null
  return (verified / declared) * 100
}

/** How many engagements sit at market ready or better. */
export function atMarketReadyOrAbove(rows: SnapshotRow[]): number {
  return rows.filter((r) =>
    r.readiness_stage === 'near_ready' || r.readiness_stage === 'investment_ready').length
}

/** How many could service a loan at the level most lenders look for. */
export const LENDER_COMFORT_DSCR = 1.5
export function aboveLenderComfort(rows: SnapshotRow[]): number {
  return rows.filter((r) => typeof r.dscr_min === 'number' && r.dscr_min >= LENDER_COMFORT_DSCR).length
}

/**
 * How many engagements now sit lower than the best stage they have reached.
 *
 * Worked out across the whole history rather than within a month, because a
 * fall is only visible against what came before. An engagement that recovers
 * stops being counted: the figure is who is below their own best now, not who
 * ever stumbled.
 */
export function slippedBackByMonth(
  rows: SnapshotRow[], months: string[], filter: HistoryFilter = {},
): SeriesPoint[] {
  // THE READINESS FILTER IS DELIBERATELY IGNORED HERE.
  //
  // Filtering to one stage keeps only the months an engagement sat at that
  // stage, so it can never be seen below its own best and the answer is always
  // zero. A reader would take that as "nobody went backwards" when it actually
  // means "not measurable with this filter", which is the worse of the two
  // mistakes. A fall is only visible across stages, so this series is drawn
  // from the other three filters and says so on the page.
  const { readinessStage: _ignored, ...crossStage } = filter
  const kept = rows.filter((r) => matches(r, crossStage) && !r.skipped_reason)
  const best: Record<string, number> = {}
  const counts: Record<string, number> = {}

  for (const month of months) {
    const inMonth = kept.filter((r) => r.snapshot_month.slice(0, 7) === month)
    for (const r of inMonth) {
      const rank = STAGE_ORDER.indexOf(r.readiness_stage as ReadinessStage)
      if (rank < 0) continue
      if (best[r.client_id] === undefined || rank > best[r.client_id]) best[r.client_id] = rank
    }
    counts[month] = inMonth.filter((r) => {
      const rank = STAGE_ORDER.indexOf(r.readiness_stage as ReadinessStage)
      return rank >= 0 && best[r.client_id] !== undefined && rank < best[r.client_id]
    }).length
  }

  return months.map((month) => {
    const n = kept.filter((r) => r.snapshot_month.slice(0, 7) === month).length
    return { month, label: monthLabel(month), value: n === 0 ? null : counts[month], n }
  })
}

/** How many engagements stood at each stage, every month. */
export function stageCounts(grouped: Grouped, months: string[]): Record<ReadinessStage, SeriesPoint[]> {
  const out = {} as Record<ReadinessStage, SeriesPoint[]>
  for (const stage of STAGE_ORDER) {
    out[stage] = buildSeries(grouped, months, (rows) =>
      rows.filter((r) => r.readiness_stage === stage).length, false)
  }
  return out
}

export interface Movement {
  from: number | null
  to: number | null
  diff: number | null
  pct: number | null
  /** How many months apart the two readings are. */
  months: number
}

/**
 * The change across a series, from its first published reading to its last.
 *
 * Skips months with nothing in them at either end, so a gap in the record
 * narrows the window rather than producing a change against null.
 */
export function movement(series: SeriesPoint[]): Movement {
  const withValue = series.map((p, i) => ({ p, i })).filter((x) => x.p.value !== null)
  if (withValue.length < 2) {
    const only = withValue[0]
    return { from: null, to: only ? only.p.value : null, diff: null, pct: null, months: 0 }
  }
  const a = withValue[0], b = withValue[withValue.length - 1]
  const diff = (b.p.value as number) - (a.p.value as number)
  const from = a.p.value as number
  return {
    from, to: b.p.value as number, diff,
    pct: from === 0 ? null : (diff / from) * 100,
    months: b.i - a.i,
  }
}

/** Whether a movement is good news, given which direction is good. */
export function reading(m: Movement, goodDirection: 'up' | 'down'): 'up' | 'down' | 'flat' | 'unknown' {
  if (m.diff === null || m.from === null) return 'unknown'
  const rel = m.from === 0 ? (m.diff === 0 ? 0 : 1) : Math.abs(m.diff / m.from)
  if (rel < 0.03) return 'flat'
  const better = goodDirection === 'up' ? m.diff > 0 : m.diff < 0
  return better ? 'up' : 'down'
}

// ------------------------------------------------------------
// Money is never added across currencies
// ------------------------------------------------------------

/**
 * The currency most of these engagements report in.
 *
 * A portfolio spanning Nigeria, Kenya and Uganda holds naira, shillings and
 * shillings again, and adding them produces a number that means nothing while
 * looking perfectly reasonable. The rest of this platform reports money per
 * currency and never blends; so does this.
 *
 * Ties are settled alphabetically so the same portfolio always reports in the
 * same currency rather than flipping between two of equal size.
 */
export function dominantCurrency(rows: SnapshotRow[]): string | null {
  const counts: Record<string, number> = {}
  for (const r of rows) {
    const c = typeof r.currency === 'string' ? r.currency.trim().toUpperCase() : ''
    if (!c) continue
    counts[c] = (counts[c] || 0) + 1
  }
  const found = Object.keys(counts).sort()
  if (found.length === 0) return null
  return found.reduce((best, c) => (counts[c] > counts[best] ? c : best), found[0])
}

/** Every currency present, most common first, for saying what was left out. */
export function currenciesPresent(rows: SnapshotRow[]): string[] {
  const counts: Record<string, number> = {}
  for (const r of rows) {
    const c = typeof r.currency === 'string' ? r.currency.trim().toUpperCase() : ''
    if (!c) continue
    counts[c] = (counts[c] || 0) + 1
  }
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))
}

/**
 * The rows that may be added together: one currency only.
 *
 * A row with no currency recorded is kept, because the overwhelming majority
 * of this platform is single-currency per engagement and dropping an unlabelled
 * row would silently shrink a total. A row labelled with a different currency
 * is excluded, because including it would silently corrupt one.
 */
export function sameCurrency(rows: SnapshotRow[], currency: string | null): SnapshotRow[] {
  if (!currency) return rows
  return rows.filter((r) => {
    const c = typeof r.currency === 'string' ? r.currency.trim().toUpperCase() : ''
    return !c || c === currency
  })
}
