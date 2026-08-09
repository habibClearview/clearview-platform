// ============================================================
// Where a sentence said in the room belongs in the block's own table.
//
// WHAT THIS SOLVES. A room adds what it would have said, and every one of those
// sentences is raw material for exactly one table: what a room says in the
// service audit is a service, what it says in the customer block is a problem
// in somebody's own words, what it says during a pilot is a verbatim response.
// Retyping it by hand is how the words get changed, and changed words are the
// one thing a verbatim record cannot survive.
//
// WHY IT IS NOT A MAP OF ALL TWELVE BLOCKS. Four of them have no home for a
// sentence, and inventing one would be worse than leaving it out:
//
//   setup      nothing is filled in here, it is where the engagement is named
//   dp04       cost lines and prices are numbers, and the cost table demands a
//              category from a fixed list, so a sentence would arrive filed
//              under a heading nobody chose
//   dp09       readiness is a set of scores
//   handover   the independence tests are a fixed list, not a growing one
//
// Those four keep marking, which is what they had. A block with no target says
// so in plain words rather than offering a button that quietly does the wrong
// thing.
//
// WHY THE TARGET COLUMN IS THE ONE IT IS. In each case it is the column that
// holds what somebody said or observed, rather than the column that holds a
// name or a score. The row arrives with that column filled and everything else
// blank, which is honest: it is a draft, visible in the table where the coach
// is already working, waiting to be completed. That is the point. A sentence
// sitting in a session log is a sentence nobody acts on.
//
// EVERY TARGET WAS CHECKED AGAINST THE REAL SCHEMA. client_id is the only
// column any of these tables requires, and none of the columns written here
// carries a check constraint, so a row with one sentence in it is a row the
// database accepts. That was read from the database rather than assumed,
// because writing a value a constraint refuses is how three of this project's
// faults happened.
// ============================================================

export interface PromotionTarget {
  /** The table the sentence becomes a row in. */
  table: string
  /** The column that receives the sentence, whole and unedited. */
  column: string
  /** What the coach is told will happen, in the words of the method. */
  describes: string
}

export const PROMOTION_TARGETS: Record<string, PromotionTarget> = {
  phase_0: {
    table: 'gtcv_assumptions',
    column: 'assumption',
    describes: 'an assumption to be cleared',
  },
  dp01: {
    table: 'gtcv_service_inventory',
    column: 'service_name',
    describes: 'a service in the inventory',
  },
  dp02: {
    table: 'gtcv_customer_segments',
    column: 'problem_in_their_words',
    describes: 'a problem in the customer’s own words',
  },
  dp03: {
    table: 'gtcv_propositions',
    column: 'assembled_statement',
    describes: 'a proposition to work on',
  },
  dp06: {
    table: 'gtcv_partner_map',
    column: 'what_they_bring',
    describes: 'a partner to map',
  },
  dp07: {
    table: 'gtcv_pilot_sessions',
    column: 'verbatim_responses',
    describes: 'a verbatim response in the pilot record',
  },
  dp08: {
    table: 'gtcv_channel_logic',
    column: 'channel_logic',
    describes: 'a channel to think through',
  },
}

/**
 * The target for a block, or null where a sentence has no home.
 *
 * The lookup asks whether the map itself carries the key, rather than reading
 * it straight off. Every plain object in JavaScript inherits keys it was never
 * given, and `__proto__` is one of them, so a request naming that as its block
 * was getting an object back instead of nothing. A route that then read a table
 * name off it would be writing somewhere nobody chose. Found by the test below
 * on the first run, which is the argument for having written it.
 */
export function promotionTargetFor(dpId: string | null | undefined): PromotionTarget | null {
  if (!dpId) return null
  if (!Object.prototype.hasOwnProperty.call(PROMOTION_TARGETS, dpId)) return null
  const target = PROMOTION_TARGETS[dpId]
  // A target is only usable if it names both a table and a column.
  if (!target || typeof target.table !== 'string' || typeof target.column !== 'string') return null
  return target
}

/**
 * The row to insert. Built here rather than in the route so the shape is one
 * thing that can be tested without a database.
 *
 * Only two columns are ever written: the engagement, and the sentence. Nothing
 * is guessed on the coach's behalf, because a guessed score or a guessed
 * decision is indistinguishable from a recorded one once it is in the table.
 */
export function promotionRow(
  target: PromotionTarget,
  clientId: string,
  contribution: string,
): Record<string, string> {
  return { client_id: clientId, [target.column]: contribution }
}

/** Table names this feature is ever allowed to touch, matching the migration. */
export const PROMOTION_TABLES: string[] = Array.from(
  new Set(Object.values(PROMOTION_TARGETS).map((t) => t.table)),
)
