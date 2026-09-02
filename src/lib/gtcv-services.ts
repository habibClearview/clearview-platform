// ============================================================
// THE SERVICES, AND WHICH WORK BELONGS TO WHICH
//
// WHY THIS EXISTS. Decision Point 4 asks whether the numbers hold and Decision Point 5 asks how it
// goes to market, and both of those questions are asked OF A SERVICE. Neither
// screen could say which service a line belonged to, so a break-even was the
// organisation's break-even rather than the service's.
//
// TWO LISTS OF SERVICES, AND THEY ARE NOT THE SAME LIST.
//
//   The inventory (gtcv_service_inventory) is what the organisation delivers
//   TODAY, most of it on grant logic. Clearing the ground and Decision Point 1 work on
//   this: the portfolio of activities under each service the programme
//   currently pays for.
//
//   The propositions (gtcv_propositions) are the NEW services. A value
//   proposition is the commercial offer the organisation intends to sell, and
//   Decision Point 4 builds the financial model for those, not for the inventory. Costing
//   the inventory would model the thing the engagement exists to move away
//   from.
//
// Both are offered through the same picker, so this module normalises either
// into one shape and derives the name the same way for both. A screen chooses
// which list it is working from; it does not choose how a service is named.
//
// NAMING. A row can be part-filled, because it is created live in a session.
// The name falls back through what it was called, then what it delivers, then
// its position, so a row somebody has only just added is still selectable.
//
// SHARED WORK IS NOT A FAILURE TO ANSWER. A cost that genuinely sits across
// every service, an office or a finance lead, belongs to no single service and
// should not be forced to claim one. Null means shared, it is grouped and labelled as
// shared, and it is counted separately rather than hidden.
// ============================================================

/** A service, normalised from whichever list it came from. */
export interface ServiceLike {
  id: string
  service_name?: string | null
  what_it_delivers?: string | null
  sort_order?: number | null
}

/** A row of gtcv_service_inventory: what is delivered today. */
export interface InventoryRow {
  id: string
  service_name?: string | null
  what_it_delivers?: string | null
}

/** A row of gtcv_propositions: a new service the organisation will sell. */
export interface PropositionRow {
  id: string
  segment_label?: string | null
  capability?: string | null
  assembled_statement?: string | null
}

/** The services delivered today, for Phase 0 and Decision Point 1. */
export function servicesFromInventory(rows: InventoryRow[]): ServiceLike[] {
  return rows.map((r) => ({
    id: r.id,
    service_name: r.service_name,
    what_it_delivers: r.what_it_delivers,
  }))
}

/**
 * The new services, for Decision Point 4 and Decision Point 5. A proposition has no name of its own,
 * so the segment it is aimed at is the name a room recognises, and what the
 * organisation can do is the fallback.
 */
export function servicesFromPropositions(rows: PropositionRow[]): ServiceLike[] {
  return rows.map((r) => ({
    id: r.id,
    service_name: r.segment_label,
    what_it_delivers: r.capability || r.assembled_statement,
  }))
}

/** A service, as offered in a picker. */
export interface ServiceOption {
  id: string
  label: string
}

/** Shown wherever work is not tied to one service. */
export const SHARED_SERVICE_LABEL = 'Shared across services'

/** How long a derived name runs before it is cut at a word boundary. */
const NAME_LIMIT = 60

/** How far in the cut must fall before a word boundary is preferred to it. */
const MIN_BEFORE_ELLIPSIS = 20

/**
 * The VISIBLE CHARACTERS of a string, in order.
 *
 * C80. The cut happens at a character boundary, never at a fixed number of
 * storage units. JavaScript measures a string in UTF-16 code units, and one
 * visible character is not reliably one unit: an emoji is two, and in
 * Devanagari, Arabic, Thai, Hangul and any script that writes a letter with
 * marks attached to it, one character is several. Cutting at unit sixty can
 * therefore land INSIDE a character and put half of one on screen — a broken
 * glyph in a service name, in front of a room.
 *
 * Intl.Segmenter groups by grapheme cluster, which is what a reader means by
 * one character. Where it is unavailable, Array.from at least walks whole code
 * points, so an emoji survives even where a combining mark would not.
 */
function characters(text: string): string[] {
  const SegmenterCtor = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (typeof SegmenterCtor === 'function') {
    return Array.from(
      new SegmenterCtor(undefined, { granularity: 'grapheme' }).segment(text),
      (s) => s.segment,
    )
  }
  return Array.from(text)
}

/**
 * A name cut to length, at a word boundary where there is one and at a
 * character boundary always.
 *
 * Counting and slicing both work in characters, so the sixty and the twenty
 * mean the same thing to a reader as they do to the code. For a name written
 * only in ASCII this behaves exactly as it did before.
 */
function shorten(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  const chars = characters(clean)
  if (chars.length <= NAME_LIMIT) return clean
  const cut = chars.slice(0, NAME_LIMIT)
  const lastSpace = cut.lastIndexOf(' ')
  const kept = lastSpace > MIN_BEFORE_ELLIPSIS ? cut.slice(0, lastSpace) : cut
  return `${kept.join('').trimEnd()}...`
}

/** What to call one service on screen. */
export function serviceName(s: ServiceLike, position: number): string {
  const named = (s.service_name || '').trim()
  if (named) return shorten(named)
  const delivers = (s.what_it_delivers || '').trim()
  if (delivers) return shorten(delivers)
  return `Service ${position + 1}`
}

/** Every service as a pickable option, in the order they are held. */
export function serviceOptions(services: ServiceLike[]): ServiceOption[] {
  return services.map((s, i) => ({ id: s.id, label: serviceName(s, i) }))
}

/**
 * The name for a stored reference. An identifier that no longer matches a
 * service is reported as missing rather than silently shown as shared: the two
 * mean different things, and a costing attached to a deleted service is
 * something the coach needs to see.
 */
export function serviceLabelFor(
  services: ServiceLike[],
  serviceId: string | null | undefined,
): string {
  if (!serviceId) return SHARED_SERVICE_LABEL
  const at = services.findIndex((s) => s.id === serviceId)
  if (at === -1) return 'Service no longer listed'
  return serviceName(services[at], at)
}

export interface ServiceGroup<T> {
  /** Null for the shared bucket. */
  id: string | null
  label: string
  rows: T[]
}

/**
 * Rows arranged by the service they belong to, in the order the services are
 * held, with shared work last. Every service appears even when it has no rows
 * yet, because an empty costing for a service that exists is the finding.
 *
 * The key is named rather than assumed: Decision Point 4 and Decision Point 5 rows carry
 * proposition_id, Phase 0 rows carry service_id, and they are different lists.
 */
export function groupByService<T extends Record<string, any>>(
  rows: T[],
  services: ServiceLike[],
  key: string = 'service_id',
): ServiceGroup<T>[] {
  const groups: ServiceGroup<T>[] = services.map((s, i) => ({
    id: s.id,
    label: serviceName(s, i),
    rows: [],
  }))
  const known = new Map(groups.map((g) => [g.id, g]))
  const shared: T[] = []
  const orphaned: T[] = []

  for (const row of rows) {
    const id = row[key] || null
    if (!id) { shared.push(row); continue }
    const group = known.get(id)
    if (group) group.rows.push(row)
    else orphaned.push(row)
  }

  const tail: ServiceGroup<T>[] = []
  if (orphaned.length) tail.push({ id: null, label: 'Service no longer listed', rows: orphaned })
  if (shared.length) tail.push({ id: null, label: SHARED_SERVICE_LABEL, rows: shared })
  return [...groups, ...tail]
}
