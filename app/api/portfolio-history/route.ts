// ============================================================
// API ROUTE: /api/portfolio-history
//
// The monthly record behind the market intelligence page. One row per
// engagement per month, filed by the scheduled job and never rewritten, turned
// into one series per indicator.
//
// 23 September 2026. The page had a single reading and no history, so nobody
// could see whether anything had moved. This is the other half.
//
// Same four filters as /api/portfolio-intelligence, and the same restriction:
// super_coach only, because this is Habib's own view across every client on
// the platform rather than a per-client one.
//
// THE PAGE MUST WORK ON A SHORT RECORD. The monthly job began in September
// 2026, so early on there are one or two months here and a series is mostly
// gaps. That is reported honestly -- months present, months read, and a null
// for every month with nothing in it -- rather than padded to look fuller.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/auth/api-authz'
import {
  groupByMonth, monthsIn, buildSeries, stageCounts, slippedBackByMonth,
  verifiedShare, atMarketReadyOrAbove, aboveLenderComfort, median, total,
  readCount, dominantCurrency, currenciesPresent, sameCurrency,
  type SnapshotRow, type HistoryFilter,
} from '@/lib/portfolio-history'

export const dynamic = 'force-dynamic'

/** How far back the page ever reads. Two years of months is more than any chart needs. */
const MAX_MONTHS = 24

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const requesterToken = body?.requesterToken
    const filter = (body?.filter || {}) as HistoryFilter

    const admin = getAdminClient()
    const { data: { user }, error: authErr } = await admin.auth.getUser(requesterToken)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: profile } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role !== 'super_coach') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { data: rows, error } = await admin
      .from('portfolio_snapshots')
      .select('client_id, ref_code, snapshot_month, engagement_mode, sector, country, programme_id, ' +
              'readiness_stage, ir_score, confidence_score, declared_revenue, verified_revenue, ' +
              'unattributed_revenue, fac_amount, currency, gross_margin_pct, ebitda_margin_pct, net_margin_pct, ' +
              'revenue_growth_pct, cost_ratio_pct, dscr_min, decision_points_signed, ' +
              'decision_points_total, skipped_reason')
      .order('snapshot_month', { ascending: true })

    if (error) {
      console.error('Portfolio history read failed:', error.message)
      return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
    }

    const all = (rows || []) as unknown as SnapshotRow[]
    // A canvas engagement has no revenue, margin or debt cover, so mixing it
    // into a financial median would drag every figure toward nothing.
    const financial = all.filter((r) => (r.engagement_mode || 'financial') === 'financial')

    const months = monthsIn(financial).slice(-MAX_MONTHS)
    const grouped = groupByMonth(financial, filter)

    // MONEY IS NEVER ADDED ACROSS CURRENCIES. A portfolio spanning Nigeria,
    // Kenya and Uganda holds naira and two different shillings, and a total
    // across them means nothing while looking perfectly reasonable. Every
    // money series below is built from the rows reporting in one currency;
    // percentages, counts and scores carry no currency and use them all.
    const inView = Object.values(grouped).flat()
    const currency = dominantCurrency(inView)
    const currencies = currenciesPresent(inView)
    const moneyGrouped: typeof grouped = {}
    for (const [month, rows] of Object.entries(grouped)) moneyGrouped[month] = sameCurrency(rows, currency)

    // Everything that could be filtered on, taken from the whole record rather
    // than the filtered slice, so choosing one sector does not empty the list
    // of the others.
    const options = {
      sectors: Array.from(new Set(all.map((r) => r.sector).filter(Boolean))).sort(),
      countries: Array.from(new Set(all.map((r) => r.country).filter(Boolean))).sort(),
      programmeIds: Array.from(new Set(all.map((r) => r.programme_id).filter(Boolean))).sort(),
    }

    // THE SMALL-SAMPLE RULE STAYS ON. A month read from fewer than five
    // businesses is withheld, so nobody can work out an individual business
    // from an aggregate. It was briefly switched off here because a coach with
    // three clients saw nothing; review was right that a gate asserted in a
    // comment is not a control, and the test in
    // src/__tests__/portfolio-history-gate.test.ts now pins the gate instead.
    // Turning this off is a separate decision with its own evidence, not a
    // side effect of a presentation change.
    const series: Record<string, unknown> = {
      revenue: buildSeries(moneyGrouped, months, (r) => total(r.map((x) => x.declared_revenue))),
      verified: buildSeries(moneyGrouped, months, verifiedShare),
      unattributed: buildSeries(moneyGrouped, months, (r) => total(r.map((x) => x.unattributed_revenue))),
      readiness: buildSeries(grouped, months, (r) => median(r.map((x) => x.ir_score))),
      confidence: buildSeries(grouped, months, (r) => median(r.map((x) => x.confidence_score))),
      grossMargin: buildSeries(grouped, months, (r) => median(r.map((x) => x.gross_margin_pct))),
      ebitdaMargin: buildSeries(grouped, months, (r) => median(r.map((x) => x.ebitda_margin_pct))),
      netMargin: buildSeries(grouped, months, (r) => median(r.map((x) => x.net_margin_pct))),
      revenueGrowth: buildSeries(grouped, months, (r) => median(r.map((x) => x.revenue_growth_pct))),
      costRatio: buildSeries(grouped, months, (r) => median(r.map((x) => x.cost_ratio_pct))),
      absorbable: buildSeries(moneyGrouped, months, (r) => total(r.map((x) => x.fac_amount))),
      // Counts of the population identify nobody, so they are not suppressed.
      engagements: buildSeries(grouped, months, (r) => r.length, false),
      marketReady: buildSeries(grouped, months, atMarketReadyOrAbove, false),
      aboveComfort: buildSeries(grouped, months, aboveLenderComfort, false),
      decisionsSigned: buildSeries(grouped, months, (r) => total(r.map((x) => x.decision_points_signed)), false),
      slipped: slippedBackByMonth(financial, months, filter),
    }

    return NextResponse.json({
      months,
      series,
      // What the money figures are reported in, and what was left out of them.
      currency,
      currencies,
      stages: stageCounts(grouped, months),
      options,
      // What the record actually holds, so the page can say so rather than
      // drawing an empty chart and leaving a reader to wonder.
      recordStartedAt: months[0] || null,
      latestMonth: months[months.length - 1] || null,
      monthsOnRecord: months.length,
      engagementsLatest: months.length ? readCount(grouped[months[months.length - 1]] || []) : 0,
    })
  } catch (err) {
    console.error('Portfolio history error:', err)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
