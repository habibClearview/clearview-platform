// ============================================================
// The months that already exist inside each financial model.
//
// 23 September 2026. Written after shipping a board that read an empty table
// and showed a page of dashes, when every client's own model already carried
// its months.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  clientMonthsFrom, monthsAcross, aggregateMonthly, reportingCurrency,
  currenciesOf, changeAcross, monthKeyOf, labelOf, likeForLikeRevenue,
  type ClientMonthly,
} from '@/lib/portfolio-monthly'

const periodFor = (i: number) => {
  const m = 1 + i
  return `2026-${String(m).padStart(2, '0')}-01`
}

const client = (id: string, currency: string, months: [string, number, number, number][]): ClientMonthly => ({
  clientId: id, currency,
  months: months.map(([period, revenue, grossProfit, ebitda]) => ({ period, revenue, grossProfit, ebitda })),
})

describe('pulling a client’s own months out of the engine', () => {
  it('keeps only the months that actually happened', () => {
    const con = {
      act_rev: [100, 120, null, null],
      act_gp: [40, 50, null, null],
      act_ebitda: [10, 12, null, null],
    }
    const months = clientMonthsFrom(con, periodFor)
    expect(months).toHaveLength(2)
    expect(months[0]).toEqual({ period: '2026-01-01', plannedRevenue: null, revenue: 100, grossProfit: 40, ebitda: 10 })
  })

  it('carries the planned figure for the same month, where the model has one', () => {
    const months = clientMonthsFrom({
      act_rev: [100, 120, null], act_gp: [40, 50, null], act_ebitda: [10, 12, null],
      rev: [90, 150, 200],
    }, periodFor)
    expect(months.map(m => m.plannedRevenue)).toEqual([90, 150])
  })

  it('never treats a plan as history', () => {
    // Every month is forecast: nothing has happened, so nothing is returned.
    expect(clientMonthsFrom({ act_rev: [null, null, null] }, periodFor)).toHaveLength(0)
  })

  it('keeps a month of genuinely nil revenue, which is a real reading', () => {
    const months = clientMonthsFrom({ act_rev: [0], act_gp: [0], act_ebitda: [-5] }, periodFor)
    expect(months).toHaveLength(1)
    expect(months[0].revenue).toBe(0)
  })

  it('keeps a month whose profit was not recorded rather than dropping the month', () => {
    const months = clientMonthsFrom({ act_rev: [100], act_gp: [null], act_ebitda: [null] }, periodFor)
    expect(months[0].revenue).toBe(100)
    expect(months[0].grossProfit).toBeNull()
  })

  it('copes with an engine result carrying no actuals at all', () => {
    expect(clientMonthsFrom({}, periodFor)).toEqual([])
  })
})

describe('the months across a portfolio', () => {
  it('lists every month any client has, oldest first, once each', () => {
    const clients = [
      client('a', 'UGX', [['2026-02-01', 1, 0, 0], ['2026-01-01', 1, 0, 0]]),
      client('b', 'UGX', [['2026-02-01', 1, 0, 0], ['2026-03-01', 1, 0, 0]]),
    ]
    expect(monthsAcross(clients)).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('keeps the most recent when a model runs long', () => {
    const many = client('a', 'UGX', Array.from({ length: 30 }, (_, i) =>
      [`2025-${String((i % 12) + 1).padStart(2, '0')}-01`, 1, 0, 0] as [string, number, number, number]))
    expect(monthsAcross([many], 6)).toHaveLength(6)
  })

  it('reads a month key and a label the way a person writes them', () => {
    expect(monthKeyOf('2026-03-01')).toBe('2026-03')
    expect(labelOf('2026-03')).toBe('Mar 26')
  })
})

describe('the portfolio month by month', () => {
  const clients = [
    client('a', 'UGX', [['2026-01-01', 100, 40, 10], ['2026-02-01', 120, 48, 12]]),
    client('b', 'UGX', [['2026-01-01', 200, 60, 20], ['2026-02-01', 240, 84, 24]]),
  ]
  const months = monthsAcross(clients)

  it('adds revenue and reports how many businesses stood behind it', () => {
    const s = aggregateMonthly(clients, months, 'UGX')
    expect(s[0].revenue).toBe(300)
    expect(s[0].n).toBe(2)
    expect(s[1].revenue).toBe(360)
  })

  it('takes the middle business for a margin, never the average', () => {
    // 40% and 30% -> median 35%, which an average would also give at two
    // members; the third makes the difference visible.
    const three = [...clients, client('c', 'UGX', [['2026-01-01', 1000, 900, 0]])]
    const s = aggregateMonthly(three, monthsAcross(three), 'UGX')
    expect(s[0].grossMargin).toBe(40)
  })

  it('leaves a month nobody read as a gap rather than zero', () => {
    const sparse = [client('a', 'UGX', [['2026-01-01', 100, 40, 10], ['2026-03-01', 150, 60, 15]])]
    const s = aggregateMonthly(sparse, ['2026-01', '2026-02', '2026-03'], 'UGX')
    expect(s[1].revenue).toBeNull()
    expect(s[1].n).toBe(0)
  })

  it('shows a figure even when only one business read that month', () => {
    // There is no anonymity to protect on a coach's view of their own
    // clients, and blanking the page was the whole complaint.
    const one = [client('a', 'UGX', [['2026-01-01', 100, 40, 10]])]
    const s = aggregateMonthly(one, ['2026-01'], 'UGX')
    expect(s[0].revenue).toBe(100)
    expect(s[0].grossMargin).toBe(40)
  })
})

describe('money is never added across currencies', () => {
  const mixed = [
    client('a', 'UGX', [['2026-01-01', 100, 40, 10]]),
    client('b', 'UGX', [['2026-01-01', 200, 60, 20]]),
    client('c', 'KES', [['2026-01-01', 5, 2, 1]]),
  ]

  it('reports in the currency most of them use', () => {
    expect(reportingCurrency(mixed)).toBe('UGX')
    expect(currenciesOf(mixed)).toEqual(['UGX', 'KES'])
  })

  it('leaves the other currency out of the total rather than adding it', () => {
    const s = aggregateMonthly(mixed, ['2026-01'], 'UGX')
    expect(s[0].revenue).toBe(300)
  })

  it('still counts every business in a margin, which carries no currency', () => {
    const s = aggregateMonthly(mixed, ['2026-01'], 'UGX')
    expect(s[0].n).toBe(3)
    expect(s[0].grossMargin).toBe(40)
  })

  it('keeps a client whose currency was never recorded', () => {
    const some = [client('a', 'UGX', [['2026-01-01', 100, 40, 10]]),
                  client('b', '', [['2026-01-01', 50, 20, 5]])]
    expect(aggregateMonthly(some, ['2026-01'], 'UGX')[0].revenue).toBe(150)
  })

  it('settles a tie the same way whichever order they arrive in', () => {
    const tied = [client('a', 'KES', []), client('b', 'UGX', [])]
    expect(reportingCurrency(tied)).toBe(reportingCurrency([...tied].reverse()))
  })
})

describe('the change across a record', () => {
  it('measures first reading to last', () => {
    const c = changeAcross([10, 12, 15])
    expect(c.from).toBe(10); expect(c.to).toBe(15); expect(c.diff).toBe(5); expect(c.months).toBe(2)
  })

  it('steps over gaps at either end', () => {
    const c = changeAcross([null, 20, null, 30, null])
    expect(c.from).toBe(20); expect(c.to).toBe(30); expect(c.months).toBe(2)
  })

  it('refuses to claim a change from a single reading', () => {
    const c = changeAcross([null, 42])
    expect(c.diff).toBeNull(); expect(c.to).toBe(42)
  })

  it('does not divide by a starting figure of nil', () => {
    expect(changeAcross([0, 5]).pct).toBeNull()
  })
})

describe('likeForLikeRevenue', () => {
  const mk = (id: string, currency: string, rows: [string, number][]) => ({
    clientId: id, currency,
    months: rows.map(([period, revenue]) => ({ period, revenue, grossProfit: null, ebitda: null })),
  })

  it('returns null when there is only one month to compare', () => {
    const c = [mk('a', 'UGX', [['2026-01-01', 100]])]
    expect(likeForLikeRevenue(c, ['2026-01'], 'UGX')).toBeNull()
  })

  it('counts every business when they all reported in both months', () => {
    const clients = [
      mk('a', 'UGX', [['2026-01-01', 100], ['2026-02-01', 120]]),
      mk('b', 'UGX', [['2026-01-01', 200], ['2026-02-01', 260]]),
    ]
    const r = likeForLikeRevenue(clients, ['2026-01', '2026-02'], 'UGX')!
    expect(r.from).toBe(300)
    expect(r.to).toBe(380)
    expect(r.diff).toBe(80)
    expect(r.businesses).toBe(2)
    expect(r.restricted).toBe(false)
  })

  it('leaves out a business that reported in only one of the two months', () => {
    const clients = [
      mk('a', 'UGX', [['2026-01-01', 100], ['2026-02-01', 120]]),
      // Behind on its bookkeeping: nothing filed for February.
      mk('late', 'UGX', [['2026-01-01', 900]]),
    ]
    const r = likeForLikeRevenue(clients, ['2026-01', '2026-02'], 'UGX')!
    expect(r.from).toBe(100)
    expect(r.to).toBe(120)
    expect(r.diff).toBe(20)
    expect(r.businesses).toBe(1)
    expect(r.restricted).toBe(true)
  })

  it('never adds money across currencies', () => {
    const clients = [
      mk('ugx', 'UGX', [['2026-01-01', 100], ['2026-02-01', 120]]),
      mk('kes', 'KES', [['2026-01-01', 5000], ['2026-02-01', 6000]]),
    ]
    const r = likeForLikeRevenue(clients, ['2026-01', '2026-02'], 'UGX')!
    expect(r.from).toBe(100)
    expect(r.to).toBe(120)
    expect(r.businesses).toBe(1)
  })

  it('reports nothing comparable rather than a made-up zero', () => {
    const clients = [
      mk('a', 'UGX', [['2026-01-01', 100]]),
      mk('b', 'UGX', [['2026-02-01', 200]]),
    ]
    const r = likeForLikeRevenue(clients, ['2026-01', '2026-02'], 'UGX')!
    expect(r.from).toBeNull()
    expect(r.to).toBeNull()
    expect(r.diff).toBeNull()
    expect(r.businesses).toBe(0)
    expect(r.restricted).toBe(true)
  })

  it('names the months it compared', () => {
    const clients = [mk('a', 'UGX', [['2025-10-01', 100], ['2026-02-01', 120]])]
    const r = likeForLikeRevenue(clients, ['2025-10', '2025-11', '2026-02'], 'UGX')!
    expect(r.fromLabel).toBe('Oct 25')
    expect(r.toLabel).toBe('Feb 26')
    expect(r.months).toBe(2)
  })
})
