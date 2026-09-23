// ============================================================
// The months that already exist.
//
// 23 September 2026. The market intelligence board was built to read
// portfolio_snapshots, which began filing on 20 September and therefore holds
// one month. Habib, looking at the result: "there are clients in the financial
// model that have historical data, but this is showing nothing".
//
// He is right, and the history was never missing. Every financial model on the
// platform carries its own month-by-month figures, and the single client
// Intelligence tab already draws trends from them. runGenericModel returns
// con.act_rev, con.act_gp and con.act_ebitda: one entry per month, null for a
// month that has not happened. That is real history, for the real clients,
// available today.
//
// This turns those per-client arrays into one portfolio series per calendar
// month. Pure: arrays in, series out.
//
// TWO THINGS IT WILL NOT DO.
//
//   It will not treat a plan as history. Only months with an actual reading
//   are included; a forecast is not something that happened.
//
//   It will not add money across currencies. A portfolio spanning naira and
//   two different shillings has no meaningful total, so money is reported in
//   one currency and the others are named and left out.
// ============================================================

/** One month of one client's own record. */
export interface ClientMonth {
  /** First day of the calendar month, YYYY-MM-01. */
  period: string
  revenue: number | null
  grossProfit: number | null
  ebitda: number | null
}

export interface ClientMonthly {
  clientId: string
  currency: string
  months: ClientMonth[]
}

export interface MonthlyPoint {
  /** YYYY-MM. */
  month: string
  label: string
  /** Businesses with an actual reading that month. */
  n: number
  revenue: number | null
  grossMargin: number | null
  ebitdaMargin: number | null
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function monthKeyOf(period: string): string {
  return typeof period === 'string' && period.length >= 7 ? period.slice(0, 7) : ''
}

export function labelOf(key: string): string {
  const [y, m] = key.split('-')
  const i = Number(m) - 1
  return MONTH_NAMES[i] && y ? `${MONTH_NAMES[i]} ${y.slice(2)}` : key
}

/**
 * Pulls one client's actual months out of a run of the engine.
 *
 * A month counts as history only when the engine recorded an actual revenue
 * for it. Everything else in those arrays is plan, and a plan is not a thing
 * that happened.
 */
export function clientMonthsFrom(
  con: { act_rev?: (number | null)[]; act_gp?: (number | null)[]; act_ebitda?: (number | null)[] },
  periodFor: (index: number) => string,
): ClientMonth[] {
  const rev = con.act_rev || []
  const gp = con.act_gp || []
  const ebitda = con.act_ebitda || []
  const out: ClientMonth[] = []
  for (let i = 0; i < rev.length; i++) {
    const r = rev[i]
    if (r === null || r === undefined || !Number.isFinite(r)) continue
    out.push({
      period: periodFor(i),
      revenue: r,
      grossProfit: typeof gp[i] === 'number' && Number.isFinite(gp[i] as number) ? (gp[i] as number) : null,
      ebitda: typeof ebitda[i] === 'number' && Number.isFinite(ebitda[i] as number) ? (ebitda[i] as number) : null,
    })
  }
  return out
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** The currency most of these clients keep their books in. Ties settle alphabetically. */
export function reportingCurrency(clients: ClientMonthly[]): string | null {
  const counts: Record<string, number> = {}
  for (const c of clients) {
    const cur = (c.currency || '').trim().toUpperCase()
    if (!cur) continue
    counts[cur] = (counts[cur] || 0) + 1
  }
  const found = Object.keys(counts).sort()
  if (found.length === 0) return null
  return found.reduce((best, c) => (counts[c] > counts[best] ? c : best), found[0])
}

export function currenciesOf(clients: ClientMonthly[]): string[] {
  const counts: Record<string, number> = {}
  for (const c of clients) {
    const cur = (c.currency || '').trim().toUpperCase()
    if (!cur) continue
    counts[cur] = (counts[cur] || 0) + 1
  }
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))
}

/**
 * Every calendar month any of these clients has a reading for, oldest first.
 *
 * `limit` keeps the most recent months when a long-running model would
 * otherwise produce a table nobody can read across.
 */
export function monthsAcross(clients: ClientMonthly[], limit = 24): string[] {
  const seen = new Set<string>()
  for (const c of clients) {
    for (const m of c.months) {
      const key = monthKeyOf(m.period)
      if (key) seen.add(key)
    }
  }
  return Array.from(seen).sort().slice(-limit)
}

/**
 * The portfolio's own month-by-month record.
 *
 * Revenue is a total and so is reported in one currency only. The margins are
 * ratios, carry no currency, and are medians across every client with a
 * reading that month, so one large client cannot move them.
 */
export function aggregateMonthly(
  clients: ClientMonthly[], months: string[], currency: string | null,
): MonthlyPoint[] {
  return months.map((month) => {
    const readings = clients
      .map((c) => ({ c, m: c.months.find((x) => monthKeyOf(x.period) === month) }))
      .filter((x): x is { c: ClientMonthly; m: ClientMonth } => !!x.m)

    // Money is added only within one currency. A client whose currency was
    // never recorded is kept, because dropping it would silently shrink a
    // total; one in a different currency is left out, because including it
    // would silently corrupt one.
    const forMoney = readings.filter(({ c }) => {
      const cur = (c.currency || '').trim().toUpperCase()
      return !currency || !cur || cur === currency
    })

    const revenues = forMoney
      .map(({ m }) => m.revenue)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))

    const grossMargins = readings
      .map(({ m }) => (m.revenue && m.revenue > 0 && m.grossProfit !== null
        ? (m.grossProfit / m.revenue) * 100 : null))
      .filter((v): v is number => v !== null && Number.isFinite(v))

    const ebitdaMargins = readings
      .map(({ m }) => (m.revenue && m.revenue > 0 && m.ebitda !== null
        ? (m.ebitda / m.revenue) * 100 : null))
      .filter((v): v is number => v !== null && Number.isFinite(v))

    return {
      month,
      label: labelOf(month),
      n: readings.length,
      revenue: revenues.length ? revenues.reduce((s, v) => s + v, 0) : null,
      grossMargin: median(grossMargins),
      ebitdaMargin: median(ebitdaMargins),
    }
  })
}

export interface Change {
  from: number | null
  to: number | null
  diff: number | null
  pct: number | null
  months: number
}

/** First reading to last, stepping over months with nothing in them. */
export function changeAcross(values: (number | null)[]): Change {
  const present = values.map((v, i) => ({ v, i })).filter((x) => x.v !== null && Number.isFinite(x.v as number))
  if (present.length < 2) {
    return { from: null, to: present[0] ? (present[0].v as number) : null, diff: null, pct: null, months: 0 }
  }
  const a = present[0], b = present[present.length - 1]
  const from = a.v as number, to = b.v as number
  return { from, to, diff: to - from, pct: from === 0 ? null : ((to - from) / from) * 100, months: b.i - a.i }
}
