// ============================================================
// GtCV DP04 COMMERCIAL VIABILITY, the calculation module.
//
// Pure arithmetic. No React, no Supabase, no formatting decisions that belong
// to a screen. Everything here is a function of its inputs, which is what
// makes it testable and what makes the cost floor a single source of truth
// rather than a number that gets retyped on three tabs.
//
// The rules implemented here come from the GtCV Financial Model Workbook
// (Cost Model tab, Pricing and Break-Even tab) and the Handbook chapter on
// Decision Point 04:
//
//   COST FLOOR
//     The sum of five cost categories for one delivery cycle: Direct Labour,
//     Direct Materials, Travel and Logistics, Quality Assurance, Overhead
//     Allocation. Computed once, consumed everywhere. No price may sit below
//     it. A cost missing a category is not a lower cost, it is an incomplete
//     one.
//
//   OVERHEAD CHECK
//     Overhead should be at least 20 percent of direct costs. Overhead is the
//     category organisations most often leave out, and leaving it out means
//     the organisation is quietly subsidising its commercial work from its
//     core budget without knowing it. Below 20 percent is flagged, never
//     silently corrected.
//
//   PRICING TIERS
//     Three required, Entry, Standard and Premium, plus two optional once the
//     first three are validated. Per tier, margin is price minus cost floor,
//     and percent above floor is margin divided by cost floor. A price below
//     the floor is a structural deficit and is flagged as one.
//
//   BREAK EVEN
//     Break even deliveries per year is annual fixed costs divided by
//     contribution per delivery, where contribution is price minus the cost
//     floor. The handbook worked example: fixed costs of 120,000, a price of
//     3,000 and a cost floor of 1,200 gives 120,000 / 1,800, which is 67
//     deliveries a year. Deliveries are whole, so the result rounds up.
//
//   MARKET PRICE REFERENCE
//     At least three sources before the range is worth reading. The range is
//     reported against the floor so an unaffordable floor is visible early.
//
//   CURRENCY
//     Set once per engagement and applied everywhere. This module never
//     assumes one. formatAmount takes the currency it is given and prints
//     nothing when it is not given.
//
// WHAT THIS MODULE IS NOT: the ClearView financial engine. The deeper
// modelling the dashboard runs already lives in src/lib/generic-engine.ts.
// DP04 is the workbook's cost and pricing surface, a simpler and separate
// thing, and it links to the engine rather than reimplementing it.
// ============================================================

// ─── the five cost categories, fixed by the method ───────────

export type CostCategory =
  | 'direct_labour'
  | 'direct_materials'
  | 'travel_logistics'
  | 'quality_assurance'
  | 'overhead'

export interface CostCategoryMeta {
  value: CostCategory
  label: string
  /** True for the four categories that make up direct costs. */
  direct: boolean
  /** What belongs in this category, in the workbook's terms. */
  hint: string
}

/** The five categories in workbook order. Overhead is last and is the one to watch. */
export const COST_CATEGORIES: CostCategoryMeta[] = [
  {
    value: 'direct_labour',
    label: 'Direct Labour',
    direct: true,
    hint: 'Staff and consultant time directly required to deliver this service once: preparation, delivery, write up, follow up, internal coordination.',
  },
  {
    value: 'direct_materials',
    label: 'Direct Materials',
    direct: true,
    hint: 'Materials consumed or produced in delivery: printed resources, licences used for this service, translation, report production.',
  },
  {
    value: 'travel_logistics',
    label: 'Travel and Logistics',
    direct: true,
    hint: 'All travel, accommodation, per diem, venue, equipment hire and logistics attributed to this delivery. Never estimate below actuals.',
  },
  {
    value: 'quality_assurance',
    label: 'Quality Assurance',
    direct: true,
    hint: 'Reviewing outputs, handling feedback, revision cycles, supervision. Most organisations budget nothing here at all.',
  },
  {
    value: 'overhead',
    label: 'Overhead Allocation',
    direct: false,
    hint: 'The share of organisational running costs attributed to this service: management time, finance, HR, rent, IT, insurance. The category most commonly excluded.',
  },
]

export const COST_CATEGORY_VALUES: CostCategory[] = COST_CATEGORIES.map((c) => c.value)

export const DIRECT_COST_CATEGORIES: CostCategory[] = COST_CATEGORIES.filter((c) => c.direct).map((c) => c.value)

export function costCategoryLabel(value: string): string {
  const found = COST_CATEGORIES.find((c) => c.value === value)
  return found ? found.label : value
}

/** Overhead should be at least this share of direct costs. Below it is flagged. */
export const OVERHEAD_MINIMUM_SHARE = 0.2

/** Market price reference needs at least this many sources to be worth reading. */
export const MINIMUM_MARKET_SOURCES = 3

/** Months in a year, used to annualise monthly fixed costs. */
export const MONTHS_PER_YEAR = 12

/**
 * The three tiers the method requires, in order. Two further tiers may be
 * added once these three are validated in the pilot, and they have no fixed
 * name, so tier naming is matched loosely rather than by exact string.
 */
export const REQUIRED_TIERS: { key: string; label: string; hint: string }[] = [
  { key: 'entry', label: 'Entry', hint: 'Minimum viable version that still produces a real outcome. For first time buyers testing the service.' },
  { key: 'standard', label: 'Standard', hint: 'The core service. The main revenue tier, and where break even lives.' },
  { key: 'premium', label: 'Premium', hint: 'The full ongoing relationship. Design it now even if it is not offered yet.' },
]

// ─── shared numeric helpers ──────────────────────────────────

/** Coerce anything to a finite number. Blank, null and rubbish all become 0. */
export function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Coerce to a finite number, or null when there is no number at all.
 * Used where "not priced yet" has to stay distinct from "priced at zero".
 */
export function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Print an amount in the engagement currency. The currency is always passed
 * in, never assumed. With no currency the number prints on its own.
 */
export function formatAmount(value: number, currency?: string | null, maximumFractionDigits = 0): string {
  // The locale is pinned. Left to the environment, the same figure prints as
  // 1,250 on one machine and 1.250 on another, and a costing document that
  // reads differently depending on who opened it is not a costing document.
  const body = num(value).toLocaleString('en-GB', { maximumFractionDigits })
  const cur = (currency || '').trim()
  return cur ? `${cur} ${body}` : body
}

/** Print a ratio as a percentage string, for example 0.235 becomes 23.5%. */
export function formatPercent(ratio: number | null, digits = 1): string {
  if (ratio === null || !Number.isFinite(ratio)) return '-'
  return `${(ratio * 100).toFixed(digits)}%`
}

// ─── cost lines and the cost floor ───────────────────────────

export interface CostLineInput {
  id?: string
  category: CostCategory | string
  item?: string | null
  unit?: string | null
  qty_per_cycle?: number | string | null
  unit_cost?: number | string | null
  annual_deliveries?: number | string | null
  notes?: string | null
  sort_order?: number | null
}

export interface CostLineResult {
  id: string | null
  category: string
  item: string | null
  unit: string | null
  qtyPerCycle: number
  unitCost: number
  annualDeliveries: number
  /** qty per cycle multiplied by unit cost. */
  costPerCycle: number
  /** cost per cycle multiplied by the annual deliveries entered on this line. */
  annualCost: number
}

/** Cost of one line for one delivery cycle: quantity multiplied by unit cost. */
export function costPerCycle(line: CostLineInput): number {
  return num(line.qty_per_cycle) * num(line.unit_cost)
}

/**
 * Annual cost of one line at the annual delivery count entered on that line.
 * The workbook keeps annual deliveries per line because different inputs
 * recur at different rates, so this is deliberately not a global multiplier.
 */
export function annualLineCost(line: CostLineInput): number {
  return costPerCycle(line) * num(line.annual_deliveries)
}

export function evaluateCostLine(line: CostLineInput): CostLineResult {
  return {
    id: line.id ?? null,
    category: String(line.category),
    item: line.item ?? null,
    unit: line.unit ?? null,
    qtyPerCycle: num(line.qty_per_cycle),
    unitCost: num(line.unit_cost),
    annualDeliveries: num(line.annual_deliveries),
    costPerCycle: costPerCycle(line),
    annualCost: annualLineCost(line),
  }
}

export interface CategorySubtotal {
  category: CostCategory
  label: string
  direct: boolean
  lines: CostLineResult[]
  /** Subtotal of this category for one delivery cycle. */
  costPerCycle: number
  /** Subtotal of this category across a year, at the entered volumes. */
  annualCost: number
  /** True when the category has no lines carrying any cost at all. */
  empty: boolean
}

/** Subtotal one category from a full set of lines. */
export function categorySubtotal(lines: CostLineInput[], category: CostCategory): CategorySubtotal {
  const meta = COST_CATEGORIES.find((c) => c.value === category)
  const evaluated = (lines || []).filter((l) => l && l.category === category).map(evaluateCostLine)
  const perCycle = evaluated.reduce((sum, l) => sum + l.costPerCycle, 0)
  const annual = evaluated.reduce((sum, l) => sum + l.annualCost, 0)
  return {
    category,
    label: meta ? meta.label : String(category),
    direct: meta ? meta.direct : true,
    lines: evaluated,
    costPerCycle: perCycle,
    annualCost: annual,
    empty: perCycle === 0,
  }
}

export interface CostFloorResult {
  /** All five categories, always, in workbook order, even when empty. */
  categories: CategorySubtotal[]
  /** The cost floor: sum of the five categories for one delivery cycle. */
  costFloor: number
  /** Sum of the five categories across a year at the entered volumes. */
  annualCost: number
  /** The four direct categories for one delivery cycle. */
  directCosts: number
  /** Overhead allocation for one delivery cycle. */
  overhead: number
  /** Overhead divided by direct costs, or null when there are no direct costs yet. */
  overheadShareOfDirect: number | null
  /** What overhead would need to be to reach the 20 percent minimum. */
  overheadMinimum: number
  /** How far below the minimum overhead sits. Zero when it is not below. */
  overheadShortfall: number
  /** True when overhead is below 20 percent of direct costs and there are direct costs to measure against. */
  overheadBelowMinimum: boolean
  /** Categories carrying no cost. An incomplete cost floor cannot be relied on. */
  emptyCategories: CostCategory[]
  /** True when all five categories carry a cost. */
  complete: boolean
}

/**
 * Build the cost floor from a set of cost lines. This is the single
 * calculation of the floor. Everything downstream, tiers and break even,
 * consumes the number it produces.
 */
export function buildCostFloor(lines: CostLineInput[]): CostFloorResult {
  const categories = COST_CATEGORY_VALUES.map((c) => categorySubtotal(lines || [], c))

  const costFloor = categories.reduce((sum, c) => sum + c.costPerCycle, 0)
  const annualCost = categories.reduce((sum, c) => sum + c.annualCost, 0)
  const directCosts = categories.filter((c) => c.direct).reduce((sum, c) => sum + c.costPerCycle, 0)
  const overhead = categories.filter((c) => !c.direct).reduce((sum, c) => sum + c.costPerCycle, 0)

  const overheadShareOfDirect = directCosts > 0 ? overhead / directCosts : null
  const overheadMinimum = directCosts * OVERHEAD_MINIMUM_SHARE
  const belowMinimum = directCosts > 0 && overhead < overheadMinimum
  const emptyCategories = categories.filter((c) => c.empty).map((c) => c.category)

  return {
    categories,
    costFloor,
    annualCost,
    directCosts,
    overhead,
    overheadShareOfDirect,
    overheadMinimum,
    overheadShortfall: belowMinimum ? overheadMinimum - overhead : 0,
    overheadBelowMinimum: belowMinimum,
    emptyCategories,
    complete: emptyCategories.length === 0,
  }
}

// ─── fixed costs ─────────────────────────────────────────────

export interface FixedCostInput {
  id?: string
  item?: string | null
  monthly_amount?: number | string | null
  sort_order?: number | null
}

export interface FixedCostsResult {
  monthlyTotal: number
  annualTotal: number
  lineCount: number
}

/** Total the monthly fixed costs and annualise them. */
export function buildFixedCosts(items: FixedCostInput[]): FixedCostsResult {
  const list = items || []
  const monthlyTotal = list.reduce((sum, i) => sum + num(i && i.monthly_amount), 0)
  return {
    monthlyTotal,
    annualTotal: monthlyTotal * MONTHS_PER_YEAR,
    lineCount: list.length,
  }
}

// ─── break even ──────────────────────────────────────────────

/** Contribution per delivery: what one sale puts towards fixed costs. */
export function contributionPerDelivery(price: number, costFloor: number): number {
  return price - costFloor
}

/**
 * Break even deliveries per year: annual fixed costs divided by contribution.
 *
 * Returns null when the price does not clear the floor, because in that case
 * there is no volume that reaches break even. Selling more of a loss making
 * delivery makes the loss larger, and reporting a very large number would
 * suggest otherwise. Deliveries are whole, so the result rounds up.
 */
export function breakEvenDeliveries(annualFixedCosts: number, price: number, costFloor: number): number | null {
  const contribution = contributionPerDelivery(price, costFloor)
  if (contribution <= 0) return null
  if (annualFixedCosts <= 0) return 0
  return Math.ceil(annualFixedCosts / contribution)
}

/**
 * Annual surplus or deficit at a target volume: what the year produces once
 * fixed costs are paid. Negative is a deficit.
 */
export function surplusAtTargetVolume(
  annualFixedCosts: number,
  price: number,
  costFloor: number,
  targetDeliveries: number,
): number {
  return contributionPerDelivery(price, costFloor) * num(targetDeliveries) - annualFixedCosts
}

// ─── pricing tiers ───────────────────────────────────────────

export interface PricingTierInput {
  id?: string
  tier_name?: string | null
  included?: string | null
  target_client?: string | null
  price?: number | string | null
  sort_order?: number | null
}

export interface PricingTierResult {
  id: string | null
  tierName: string | null
  included: string | null
  targetClient: string | null
  /** Null until a price is entered. Zero is a real price, not a missing one. */
  price: number | null
  costFloor: number
  /** Price minus cost floor. Null while the tier is unpriced. */
  margin: number | null
  /** Margin divided by cost floor, as a ratio. Null when unpriced or the floor is zero. */
  marginRatio: number | null
  /** The same figure expressed as a percentage, which is what the workbook column shows. */
  percentAboveFloor: number | null
  /** True when a price has been entered and it sits below the cost floor. */
  belowFloor: boolean
  /** Plain language for the flag, or null when there is nothing to flag. */
  deficitWarning: string | null
  /** Contribution towards fixed costs from one delivery at this price. */
  contribution: number | null
  /** Deliveries a year needed to cover fixed costs at this price. Null when the price never breaks even. */
  breakEvenDeliveries: number | null
  /** True when the target volume reaches or passes break even. Null when unpriced. */
  clearsTargetVolume: boolean | null
  /** Annual surplus, or deficit when negative, at the target volume. */
  annualSurplusOrDeficit: number | null
}

/**
 * Evaluate one pricing tier against the cost floor and the break even inputs.
 * The cost floor is passed in rather than recomputed so there is exactly one
 * floor in play across the whole surface.
 */
export function evaluateTier(
  tier: PricingTierInput,
  costFloor: number,
  options: { annualFixedCosts?: number; targetDeliveries?: number } = {},
): PricingTierResult {
  const annualFixed = num(options.annualFixedCosts)
  const target = num(options.targetDeliveries)
  const price = numOrNull(tier ? tier.price : null)

  const base = {
    id: (tier && tier.id) ?? null,
    tierName: (tier && tier.tier_name) ?? null,
    included: (tier && tier.included) ?? null,
    targetClient: (tier && tier.target_client) ?? null,
    price,
    costFloor,
  }

  if (price === null) {
    return {
      ...base,
      margin: null,
      marginRatio: null,
      percentAboveFloor: null,
      belowFloor: false,
      deficitWarning: null,
      contribution: null,
      breakEvenDeliveries: null,
      clearsTargetVolume: null,
      annualSurplusOrDeficit: null,
    }
  }

  const margin = price - costFloor
  const marginRatio = costFloor > 0 ? margin / costFloor : null
  const belowFloor = margin < 0
  const breakEven = breakEvenDeliveries(annualFixed, price, costFloor)
  const surplus = surplusAtTargetVolume(annualFixed, price, costFloor, target)

  return {
    ...base,
    margin,
    marginRatio,
    percentAboveFloor: marginRatio === null ? null : marginRatio * 100,
    belowFloor,
    deficitWarning: belowFloor
      ? 'This price sits below the cost floor. Every delivery at this price loses money, and selling more of it makes the loss larger. This is a structural deficit, not a discount.'
      : margin === 0
        ? 'This price exactly meets the cost floor. It covers delivery and contributes nothing towards fixed costs.'
        : null,
    contribution: margin,
    breakEvenDeliveries: breakEven,
    clearsTargetVolume: breakEven === null ? false : target >= breakEven,
    annualSurplusOrDeficit: surplus,
  }
}

export interface TierCoverage {
  key: string
  label: string
  hint: string
  present: boolean
  priced: boolean
}

/**
 * Which of the three required tiers are present, and which of those carry a
 * price. Matching is loose on purpose: the method fixes the three roles, not
 * the words an organisation chooses for them, and the optional fourth and
 * fifth tiers have no fixed name at all.
 */
export function requiredTierCoverage(tiers: PricingTierInput[]): TierCoverage[] {
  const list = tiers || []
  // A row is claimed by one required tier and then taken out of the running.
  // Matching each key independently let a single row named, for example,
  // "Entry to Standard bundle" satisfy both entry and standard, so the coach
  // was shown a complete set of tiers that did not exist and no gap was
  // raised. One row, one tier.
  const claimed = new Set<number>()
  return REQUIRED_TIERS.map((req) => {
    const index = list.findIndex((t, i) =>
      !claimed.has(i) && String((t && t.tier_name) || '').toLowerCase().includes(req.key))
    const match = index >= 0 ? list[index] : null
    if (index >= 0) claimed.add(index)
    return {
      key: req.key,
      label: req.label,
      hint: req.hint,
      present: Boolean(match),
      priced: Boolean(match) && numOrNull(match!.price) !== null,
    }
  })
}

// ─── market price reference ──────────────────────────────────

export interface MarketPriceInput {
  id?: string
  source?: string | null
  price?: number | string | null
  quality_level?: string | null
  source_date?: string | null
  notes?: string | null
  sort_order?: number | null
}

export interface MarketRangeResult {
  /** Rows entered, including any with no price yet. */
  entryCount: number
  /** Rows carrying a usable price. Only these count towards the minimum. */
  pricedCount: number
  low: number | null
  high: number | null
  median: number | null
  /** True when there are at least three priced sources. */
  enoughSources: boolean
  /** How many priced sources sit below the cost floor. */
  belowFloorCount: number
  /** True when every priced source sits below the floor: the floor is above the market. */
  floorAboveMarket: boolean
  /** True when the floor sits inside the observed range. */
  floorWithinRange: boolean
}

/**
 * The market price range, read against the cost floor. A floor above every
 * observed price is the signal the handbook names: reduce the cost of
 * delivery, reframe the value, or accept the segment is not viable at this
 * price point.
 */
export function buildMarketRange(prices: MarketPriceInput[], costFloor: number): MarketRangeResult {
  const list = prices || []
  const values = list
    .map((p) => numOrNull(p && p.price))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b)

  const low = values.length ? values[0] : null
  const high = values.length ? values[values.length - 1] : null
  const median = values.length
    ? values.length % 2 === 1
      ? values[(values.length - 1) / 2]
      : (values[values.length / 2 - 1] + values[values.length / 2]) / 2
    : null
  const belowFloorCount = values.filter((v) => v < costFloor).length

  return {
    entryCount: list.length,
    pricedCount: values.length,
    low,
    high,
    median,
    enoughSources: values.length >= MINIMUM_MARKET_SOURCES,
    belowFloorCount,
    floorAboveMarket: values.length > 0 && belowFloorCount === values.length,
    floorWithinRange: low !== null && high !== null && costFloor >= low && costFloor <= high,
  }
}

// ─── the whole DP04 surface, in one call ─────────────────────

export interface ViabilityInput {
  costLines?: CostLineInput[]
  tiers?: PricingTierInput[]
  marketPrices?: MarketPriceInput[]
  fixedCosts?: FixedCostInput[]
  /** Deliveries the organisation plans for in a year. */
  targetDeliveries?: number | string | null
  /** Set once per engagement, applied everywhere. Never assumed here. */
  currency?: string | null
}

export interface ViabilityFlag {
  /** 'deficit' blocks a commercial decision, 'gap' means the work is incomplete. */
  level: 'deficit' | 'gap'
  message: string
}

export interface ViabilityResult {
  currency: string | null
  cost: CostFloorResult
  costFloor: number
  fixed: FixedCostsResult
  targetDeliveries: number
  tiers: PricingTierResult[]
  tierCoverage: TierCoverage[]
  market: MarketRangeResult
  /** Everything the coach needs told plainly, in one place. */
  flags: ViabilityFlag[]
}

/**
 * Build the whole DP04 readout from raw rows. The cost floor is computed
 * once here and handed to every tier, which is the point: one floor, one
 * number, used everywhere.
 */
export function buildViability(input: ViabilityInput): ViabilityResult {
  const cost = buildCostFloor(input.costLines || [])
  const fixed = buildFixedCosts(input.fixedCosts || [])
  const targetDeliveries = num(input.targetDeliveries)

  const tiers = (input.tiers || []).map((t) =>
    evaluateTier(t, cost.costFloor, { annualFixedCosts: fixed.annualTotal, targetDeliveries }),
  )
  const tierCoverage = requiredTierCoverage(input.tiers || [])
  const market = buildMarketRange(input.marketPrices || [], cost.costFloor)

  const flags: ViabilityFlag[] = []

  if (cost.emptyCategories.length > 0) {
    flags.push({
      level: 'gap',
      message: `No cost entered for ${cost.emptyCategories.map(costCategoryLabel).join(', ')}. A cost floor missing a category is not a lower cost, it is an incomplete one.`,
    })
  }

  if (cost.overheadBelowMinimum) {
    flags.push({
      level: 'gap',
      message: `Overhead is ${formatPercent(cost.overheadShareOfDirect)} of direct costs, below the 20 percent minimum. Overhead exists whether it is attributed or not, so this floor understates what delivery really costs.`,
    })
  }

  const missingTiers = tierCoverage.filter((t) => !t.present)
  if (missingTiers.length > 0) {
    flags.push({
      level: 'gap',
      message: `Missing required tier: ${missingTiers.map((t) => t.label).join(', ')}. The method requires Entry, Standard and Premium before the optional tiers are added.`,
    })
  }

  tiers.filter((t) => t.belowFloor).forEach((t) => {
    flags.push({
      level: 'deficit',
      message: `${t.tierName || 'This tier'} is priced below the cost floor. Every delivery at this price loses money. This is a structural deficit, not a discount.`,
    })
  })

  if (!market.enoughSources) {
    flags.push({
      level: 'gap',
      message: `Only ${market.pricedCount} market price source${market.pricedCount === 1 ? '' : 's'} entered. The method asks for at least ${MINIMUM_MARKET_SOURCES} before the range can be read against the floor.`,
    })
  }

  if (market.floorAboveMarket) {
    flags.push({
      level: 'deficit',
      message: 'The cost floor sits above every market price recorded. Reduce the cost of delivery, reframe the value proposition against a larger outcome, or accept that this segment is not viable at this price point.',
    })
  }

  if (fixed.monthlyTotal === 0) {
    flags.push({
      level: 'gap',
      message: 'No fixed costs entered, so break even cannot be calculated. Fixed costs are what the organisation pays whether it delivers or not.',
    })
  }

  if (targetDeliveries === 0) {
    flags.push({
      level: 'gap',
      message: 'No target delivery volume set. Break even is a number of deliveries, so it needs a plan to be read against.',
    })
  }

  return {
    currency: input.currency ?? null,
    cost,
    costFloor: cost.costFloor,
    fixed,
    targetDeliveries,
    tiers,
    tierCoverage,
    market,
    flags,
  }
}
