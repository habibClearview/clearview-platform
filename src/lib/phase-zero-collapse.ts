// ============================================================
// COLLAPSING, AT THREE LEVELS  (PART J, C64 to C66)
//
// C64  a service collapses to hide its activities
// C65  an activity collapses to hide its problems
// C66  an agreed answer collapses to hide the submissions behind it
//
// AND IT IS REMEMBERED BETWEEN TOOLS. A room that collapses eight of ten
// activities to argue about the other two, then moves from Tool 2 to Tool 3,
// must not find all ten open again. So the state outlives the component and the
// tool, and the handover's note is followed: "Session storage is enough; it
// does not need a column."
//
// WHY SESSION STORAGE AND NOT A COLUMN. What is collapsed is a fact about one
// person's screen for the length of one session, not a fact about the
// engagement. Written to the database it would be shared, and one facilitator
// tidying their own view would fold up the projection everybody else is reading.
// Session storage is also per-tab, which is what the projected second tab needs:
// C52's projection carries no controls, and it must not inherit somebody's
// folded-up working view.
//
// WHAT IS STORED IS WHAT IS CLOSED, never what is open. Everything starts open,
// so an empty store is a correct and complete description of a fresh screen,
// and an activity created after the collapsing happened is open like the rest
// rather than mysteriously folded away.
// ============================================================

/** C64 to C66. The three things that collapse, and they are three. */
export type CollapseLevel = 'service' | 'activity' | 'answer'

/** Where one engagement's collapsed set lives for the length of a session. */
export function storageKey(clientId: string): string {
  return `gtcv.collapsed.${clientId}`
}

/** One entry: which level, and which row of it. */
export function entryKey(level: CollapseLevel, id: string): string {
  return `${level}:${id}`
}

/**
 * Read the collapsed set.
 *
 * Anything unreadable is treated as nothing collapsed, because a screen that
 * refuses to draw because it could not parse a display preference is a worse
 * failure than a screen that opens everything.
 */
export function readCollapsed(clientId: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.sessionStorage.getItem(storageKey(clientId))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((v) => typeof v === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

/** Write the collapsed set. A full store is not worth breaking a room over. */
export function writeCollapsed(clientId: string, collapsed: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(storageKey(clientId), JSON.stringify(Array.from(collapsed)))
  } catch {
    /* Storage refused. The screen still works, it just forgets. */
  }
}

/** Whether one row is collapsed. Everything not named is open. */
export function isCollapsed(collapsed: Set<string>, level: CollapseLevel, id: string): boolean {
  return collapsed.has(entryKey(level, id))
}

/** The set with one row's state flipped. A new Set, so React sees the change. */
export function toggle(collapsed: Set<string>, level: CollapseLevel, id: string): Set<string> {
  const next = new Set(collapsed)
  const key = entryKey(level, id)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

/**
 * Collapse or open every one of a list at once.
 *
 * The press a room actually uses: ten activities open, one argument, fold the
 * lot and open the two that matter.
 */
export function setMany(
  collapsed: Set<string>,
  level: CollapseLevel,
  ids: string[],
  shouldCollapse: boolean,
): Set<string> {
  const next = new Set(collapsed)
  for (const id of ids) {
    const key = entryKey(level, id)
    if (shouldCollapse) next.add(key)
    else next.delete(key)
  }
  return next
}

/** True where every one of the ids is collapsed. An empty list is not collapsed. */
export function allCollapsed(collapsed: Set<string>, level: CollapseLevel, ids: string[]): boolean {
  return ids.length > 0 && ids.every((id) => isCollapsed(collapsed, level, id))
}
