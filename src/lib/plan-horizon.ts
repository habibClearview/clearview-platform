// ============================================================
// How many months a plan actually covers.
//
// 23 September 2026. Habib's market intelligence page showed revenue growth of
// −100% and debt cover of −60.7× for every business and for the portfolio.
// Neither figure described anything that happened or was forecast.
//
// The cause. A model carries planning_months, and separately each plan line
// carries a figure for every one of those months. Extending the horizon (see
// extendPlanningHorizon in generic-engine.ts) appends zeros, so a business that
// moved from a one-year plan to a two-year plan and has not yet filled in the
// second year holds twelve months of real figures followed by twelve months of
// nothing.
//
// The engine then treats those empty months as forecast. Revenue in year two is
// zero, so year-on-year growth is −100%. Shared costs and debt repayments carry
// on, so EBITDA is deeply negative, so debt cover is deeply negative. The annual
// totals behind every margin are summed across the whole horizon, so a year of
// pure loss is added to a year of trading.
//
// A month nobody has entered a figure for is not a forecast of zero. This finds
// the last month the plan actually reaches and stops there, so every figure
// derived from the model describes the plan that exists.
//
// It will not cut a month a business has recorded actuals for, whatever the plan
// says, because that month happened.
// ============================================================

import type { GenericModelConfig, GenericPlanLine } from './generic-engine'

/** Every per-month array on a plan line, by the names the engine reads. */
const LINE_ARRAYS = [
  'monthly_plan', 'buy_price', 'sell_price', 'volume',
  'fee_per_engagement', 'cost_per_engagement', 'engagements',
] as const

/**
 * The arrays that say a business plans to TRADE in a month.
 *
 * Costs are deliberately not among them. A shared overhead line filled to the
 * end of the array is the usual shape of an unfilled horizon: somebody set the
 * admin cost and never came back to the sales figures. Reading that as a plan
 * is what produced twelve months of forecast loss against no revenue, and with
 * it a debt cover of −60.7×. A plan reaches as far as its selling does.
 */
const REVENUE_ARRAYS = ['monthly_plan', 'sell_price', 'volume', 'fee_per_engagement', 'engagements'] as const

function lastNonZero(arr: unknown): number {
  if (!Array.isArray(arr)) return -1
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i]
    if (typeof v === 'number' && Number.isFinite(v) && v !== 0) return i
  }
  return -1
}

/**
 * The last month index carrying any planned figure at all, or -1 where the
 * plan is entirely empty.
 */
export function lastPlannedMonthIndex(config: GenericModelConfig): number {
  let last = -1
  const consider = (arr: unknown) => { const i = lastNonZero(arr); if (i > last) last = i }

  ;(config.plan_lines || [])
    .filter((l: any) => l?.category === 'revenue' && l?.active !== false)
    .forEach((l: any) => REVENUE_ARRAYS.forEach((k) => consider(l?.[k])))

  return last
}

function sliceArr(arr: unknown, months: number): unknown {
  return Array.isArray(arr) ? arr.slice(0, months) : arr
}

/**
 * The config cut back to the months it actually plans for.
 *
 * `minMonths` protects months the business has already recorded actuals for:
 * those happened, and a plan that has not caught up with them is not a reason
 * to drop them. Returns the config untouched when there is nothing to cut,
 * so an unaffected business is bit-for-bit unchanged.
 */
export function trimToPlannedMonths(config: GenericModelConfig, minMonths = 0): GenericModelConfig {
  const declared = config.planning_months
  if (!Number.isFinite(declared) || declared <= 0) return config

  const planned = lastPlannedMonthIndex(config) + 1
  // An entirely empty plan is left alone: there is nothing to judge, and
  // cutting it to zero months would break every consumer downstream.
  if (planned <= 0) return config

  const months = Math.max(planned, minMonths)
  if (months >= declared) return config

  const trimLine = (l: GenericPlanLine): GenericPlanLine => {
    const out: any = { ...l }
    LINE_ARRAYS.forEach((k) => { if (Array.isArray((l as any)[k])) out[k] = sliceArr((l as any)[k], months) })
    return out as GenericPlanLine
  }

  const settings: any = { ...(config.settings as any) }
  if (Array.isArray(settings.trade_credit_lines)) {
    settings.trade_credit_lines = settings.trade_credit_lines.map((t: any) => ({
      ...t,
      monthly_new: sliceArr(t?.monthly_new, months),
      monthly_settled: sliceArr(t?.monthly_settled, months),
      monthly_balance: sliceArr(t?.monthly_balance, months),
    }))
  }

  return {
    ...config,
    planning_months: months,
    plan_lines: (config.plan_lines || []).map(trimLine),
    shared_lines: (config.shared_lines || []).map((l: any) => ({ ...l, monthly_plan: sliceArr(l?.monthly_plan, months) })),
    settings,
  }
}
