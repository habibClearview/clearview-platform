// ============================================================
// THE SERVICES, AND WHICH WORK BELONGS TO WHICH
//
// WHY THIS EXISTS. An organisation sells several services, and each is a
// portfolio of activities. DP04 asks whether the numbers hold and DP05 asks
// how it goes to market, and both of those questions are asked OF A SERVICE.
// Until now neither screen could say which service a line belonged to, so a
// break-even was the organisation's break-even rather than the service's.
//
// THE SPINE IS THE SERVICE INVENTORY. gtcv_service_inventory holds the
// services in the organisation's own words, which is the earliest point a
// service exists and the thing a room recognises. A DP03 proposition is what
// one service becomes for one segment, so it points at a service rather than
// being one.
//
// NAMING. A service row can be part-filled, because it is created live in a
// session. The name falls back through what the organisation called it, then
// what it delivers, then its position, so a row someone has only just added is
// still selectable. Every screen derives it here, so the same service cannot
// appear under two names on two tabs.
//
// SHARED WORK IS NOT A FAILURE TO ANSWER. A cost that genuinely sits across
// every service, an office or a finance lead, belongs to no single service and
// should not be forced to claim one. Null means shared, it is grouped and labelled as
// shared, and it is counted separately rather than hidden.
// ============================================================

/** The fields of a service inventory row this module needs. */
export interface ServiceLike {
  id: string
  service_name?: string | null
  what_it_delivers?: string | null
  sort_order?: number | null
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

function shorten(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (clean.length <= NAME_LIMIT) return clean
  const cut = clean.slice(0, NAME_LIMIT)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`
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
 * held, with shared work last. Every service appears even when it has no
 * rows yet, because an empty costing for a service that exists is the finding.
 */
export function groupByService<T extends { service_id?: string | null }>(
  rows: T[],
  services: ServiceLike[],
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
    const id = row.service_id || null
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
