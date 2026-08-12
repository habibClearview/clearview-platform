'use client'
// ============================================================
// THE COLLAPSING, WIRED TO A SCREEN  (PART J, C64 to C66)
//
// The rules live in src/lib/phase-zero-collapse.ts with no React in them, so
// they can be tested without standing a screen up. This is only the wiring:
// read once on arrival, write on every change, so a move from Tool 2 to Tool 3
// finds the same things folded.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import {
  allCollapsed,
  isCollapsed,
  readCollapsed,
  setMany,
  toggle,
  writeCollapsed,
  type CollapseLevel,
} from '@/lib/phase-zero-collapse'

export function useCollapse(clientId: string) {
  // Starts empty rather than reading storage here, because this runs on the
  // server too and sessionStorage does not exist there. The effect below fills
  // it in on arrival, which is the first moment there is a window to read.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (clientId) setCollapsed(readCollapsed(clientId))
  }, [clientId])

  const apply = useCallback((next: Set<string>) => {
    setCollapsed(next)
    if (clientId) writeCollapsed(clientId, next)
  }, [clientId])

  return {
    /** Whether one row is folded. Everything not named is open. */
    is: useCallback(
      (level: CollapseLevel, id: string) => isCollapsed(collapsed, level, id),
      [collapsed],
    ),
    /** Fold or open one row. */
    toggle: useCallback(
      (level: CollapseLevel, id: string) => apply(toggle(collapsed, level, id)),
      [collapsed, apply],
    ),
    /** Fold or open a whole level at once. */
    setAll: useCallback(
      (level: CollapseLevel, ids: string[], shouldCollapse: boolean) =>
        apply(setMany(collapsed, level, ids, shouldCollapse)),
      [collapsed, apply],
    ),
    /** Whether every one of these is folded, for the label on the fold-all press. */
    allOf: useCallback(
      (level: CollapseLevel, ids: string[]) => allCollapsed(collapsed, level, ids),
      [collapsed],
    ),
  }
}
