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
  currenciesOf, changeAcross, monthKeyOf, labelOf,
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
    expect(months[0]).toEqual({ period: '2026-01-01', revenue: 100, grossProfit: 40, ebitda: 10 })
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
