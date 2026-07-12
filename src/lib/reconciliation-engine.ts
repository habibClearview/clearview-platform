// Reconciliation engine: pairs field-app entries against real mobile-money
// transactions so a sale can be VERIFIED by two independent sources rather
// than self-declared. See docs/RECONCILIATION_SPEC.md.
//
// This module is deliberately PURE -- it takes plain arrays in and returns a
// plain result out, touching no database, clock, or network. That is what
// lets it be (a) exhaustively unit-tested and (b) run against SIMULATED
// provider data before any live mobile-money API is connected (the v3 build
// order's step 1). A thin runner elsewhere reads rows, calls reconcile(),
// and writes the resulting states back.
//
// Two rules from the spec are encoded here, not left to the caller:
//  1. Amounts are matched EXACTLY. A tolerance never forces a match -- it only
//     surfaces a near-miss (e.g. a payment net of a provider fee) as something
//     for a human to review. Silently fuzzing amounts into a "match" would
//     destroy the integrity of the verified claim.
//  2. When counts don't line up, we pair what we can and leave the rest as
//     declared/unattributed. A mismatch is a useful signal, not a failure to
//     paper over.

export type ReconciliationState = 'matched' | 'declared_only' | 'not_applicable'
export type ProviderTxnState = 'matched' | 'unattributed_inbound' | 'ignored'

/** The mobile-money payment method value stored on field_transactions. */
export const MOBILE_MONEY = 'mobile_money'
export const DEFAULT_WINDOW_MINUTES = 15
export const DEFAULT_AMOUNT_TOLERANCE = 0

// Currency amounts are whole units in practice (UGX/KES/NGN have no minor unit
// in day-to-day mobile money), but comparing with a tiny epsilon rather than
// === guards against any float drift introduced upstream.
const AMOUNT_EPSILON = 1e-6

export interface FieldEntry {
  id: string
  clientId: string
  businessUnitId: string
  amount: number
  paymentMethod: string
  // Real moment of sale (ms epoch), from the field queue's queued_at. Null for
  // legacy rows synced before captured_at existed -- those can't be matched on
  // a time window, so they fall through to declared_only.
  capturedAt: number | null
  alreadyMatched?: boolean
}

export interface ProviderTxn {
  id: string
  clientId: string
  amount: number
  // When the payment actually happened (ms epoch), from the provider.
  occurredAt: number
  direction?: 'inbound' | 'outbound'
  alreadyMatched?: boolean
}

export interface ReconcileConfig {
  // Half-width of the match window in minutes. Mobile-money confirmation delays
  // vary, so this is adjustable per deployment.
  windowMinutes?: number
  // Non-zero only surfaces near-misses for review; it never widens what counts
  // as an automatic match. Default 0 (exact only).
  amountTolerance?: number
}

export interface Match {
  fieldEntryId: string
  providerTxnId: string
  businessUnitId: string
  amount: number
  timeGapMs: number
}

export interface ReviewCandidate {
  reason: 'amount_near_miss' | 'count_imbalance'
  fieldEntryId?: string
  providerTxnId?: string
  amountDelta?: number
  timeGapMs?: number
  detail: string
}

export interface ReconcileResult {
  matches: Match[]
  /** Field entry ids that ended unmatched (cash, unlinked, or no captured_at). */
  declaredOnly: string[]
  /** Inbound provider txn ids with no matching field entry. */
  unattributedInbound: string[]
  reviewCandidates: ReviewCandidate[]
}

interface FeasiblePair {
  field: FieldEntry
  provider: ProviderTxn
  amountDelta: number
  timeGapMs: number
  exact: boolean
}

function isInbound(p: ProviderTxn): boolean {
  return (p.direction ?? 'inbound') === 'inbound'
}

// Deterministic tiebreak so the same inputs always produce the same pairing --
// there is no clock or randomness anywhere in this engine, which the resume/
// replay tooling and the tests both rely on.
function comparePairs(a: FeasiblePair, b: FeasiblePair): number {
  if (a.timeGapMs !== b.timeGapMs) return a.timeGapMs - b.timeGapMs
  if (a.amountDelta !== b.amountDelta) return a.amountDelta - b.amountDelta
  if (a.field.id !== b.field.id) return a.field.id < b.field.id ? -1 : 1
  return a.provider.id < b.provider.id ? -1 : 1
}

/**
 * Pair mobile-money field entries against inbound provider transactions for a
 * single business. Callers should pass one client's data at a time (the engine
 * still guards on clientId, but mixing clients wastes work).
 */
export function reconcile(
  fieldEntries: FieldEntry[],
  providerTxns: ProviderTxn[],
  config: ReconcileConfig = {},
): ReconcileResult {
  const windowMs = (config.windowMinutes ?? DEFAULT_WINDOW_MINUTES) * 60_000
  const tolerance = Math.max(0, config.amountTolerance ?? DEFAULT_AMOUNT_TOLERANCE)

  // A field entry is eligible for matching only if it was paid by mobile money,
  // hasn't already been matched, and carries a real capture time. Everything
  // else (cash, credit, bank, or a legacy row with no captured_at) is not a
  // matching candidate -- but it is still a field entry, so it lands in
  // declared_only below, exactly as the state table requires.
  const eligibleFields = fieldEntries.filter(
    f => f.paymentMethod === MOBILE_MONEY && !f.alreadyMatched && f.capturedAt != null,
  )
  const eligibleProviders = providerTxns.filter(p => isInbound(p) && !p.alreadyMatched)

  // Build every feasible pair within the window, classifying each as an exact
  // match or (when a tolerance is set) a near-miss.
  const exactPairs: FeasiblePair[] = []
  const nearMissPairs: FeasiblePair[] = []
  for (const field of eligibleFields) {
    for (const provider of eligibleProviders) {
      if (field.clientId !== provider.clientId) continue
      const timeGapMs = Math.abs((field.capturedAt as number) - provider.occurredAt)
      if (timeGapMs > windowMs) continue
      const amountDelta = Math.abs(field.amount - provider.amount)
      if (amountDelta <= AMOUNT_EPSILON) {
        exactPairs.push({ field, provider, amountDelta, timeGapMs, exact: true })
      } else if (tolerance > 0 && amountDelta <= tolerance) {
        nearMissPairs.push({ field, provider, amountDelta, timeGapMs, exact: false })
      }
    }
  }

  // Greedy bipartite pairing: commit the smallest time gap first, each side used
  // once. This is the "two business units, same amount, same window" case --
  // pair earliest-to-earliest deterministically, no manual step needed.
  exactPairs.sort(comparePairs)
  const usedFields = new Set<string>()
  const usedProviders = new Set<string>()
  const matches: Match[] = []
  for (const pair of exactPairs) {
    if (usedFields.has(pair.field.id) || usedProviders.has(pair.provider.id)) continue
    usedFields.add(pair.field.id)
    usedProviders.add(pair.provider.id)
    matches.push({
      fieldEntryId: pair.field.id,
      providerTxnId: pair.provider.id,
      businessUnitId: pair.field.businessUnitId,
      amount: pair.provider.amount,
      timeGapMs: pair.timeGapMs,
    })
  }

  // Anything unmatched: field entries are declared_only; inbound provider txns
  // are unattributed_inbound. declaredOnly includes non-mobile-money entries
  // and captured_at-less rows too -- they were never eligible, but they are
  // still self-reported field entries with no confirming payment.
  const declaredOnly = fieldEntries.filter(f => !usedFields.has(f.id)).map(f => f.id)
  const unattributedInbound = providerTxns
    .filter(p => isInbound(p) && !usedProviders.has(p.id))
    .map(p => p.id)

  // Review candidates: near-miss amount pairs where BOTH sides are still
  // unmatched (a fee-adjusted payment a human should confirm), plus a single
  // count-imbalance note when unmatched eligible entries and unmatched inbound
  // payments coexist -- the "3 entries, 1 payment" signal.
  const reviewCandidates: ReviewCandidate[] = []
  nearMissPairs.sort(comparePairs)
  const flaggedFields = new Set<string>()
  const flaggedProviders = new Set<string>()
  for (const pair of nearMissPairs) {
    if (usedFields.has(pair.field.id) || usedProviders.has(pair.provider.id)) continue
    if (flaggedFields.has(pair.field.id) || flaggedProviders.has(pair.provider.id)) continue
    flaggedFields.add(pair.field.id)
    flaggedProviders.add(pair.provider.id)
    reviewCandidates.push({
      reason: 'amount_near_miss',
      fieldEntryId: pair.field.id,
      providerTxnId: pair.provider.id,
      amountDelta: pair.amountDelta,
      timeGapMs: pair.timeGapMs,
      detail: `Field entry ${pair.field.amount} vs payment ${pair.provider.amount} `
        + `(${pair.amountDelta} apart, ${Math.round(pair.timeGapMs / 60_000)}m) -- possibly the same sale net of a fee.`,
    })
  }

  const unmatchedEligibleFieldCount = eligibleFields.filter(f => !usedFields.has(f.id)).length
  const unmatchedInboundCount = eligibleProviders.filter(p => !usedProviders.has(p.id)).length
  if (unmatchedEligibleFieldCount > 0 && unmatchedInboundCount > 0) {
    reviewCandidates.push({
      reason: 'count_imbalance',
      detail: `${unmatchedEligibleFieldCount} unmatched mobile-money entr`
        + `${unmatchedEligibleFieldCount === 1 ? 'y' : 'ies'} and ${unmatchedInboundCount} `
        + `unmatched inbound payment${unmatchedInboundCount === 1 ? '' : 's'} in scope -- review for a missed or mislogged sale.`,
    })
  }

  return { matches, declaredOnly, unattributedInbound, reviewCandidates }
}

/**
 * Value-weighted verified share for a set of field entries in a period:
 * matched value / total mobile-money-or-matched value. Used to feed the
 * Visibility/Trust uplift and the confidence label. Returns 0 when there is
 * nothing to verify (which the scoring layer treats as "no signal", never as a
 * penalty -- see confidence.ts).
 */
export function verifiedValueShare(entries: FieldEntry[], matches: Match[]): number {
  const matchedIds = new Set(matches.map(m => m.fieldEntryId))
  let matchedValue = 0
  let mobileMoneyValue = 0
  for (const e of entries) {
    if (matchedIds.has(e.id)) matchedValue += e.amount
    if (e.paymentMethod === MOBILE_MONEY) mobileMoneyValue += e.amount
  }
  if (mobileMoneyValue <= 0) return 0
  return Math.max(0, Math.min(1, matchedValue / mobileMoneyValue))
}
