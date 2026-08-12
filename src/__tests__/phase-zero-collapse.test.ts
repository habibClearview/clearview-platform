// @vitest-environment jsdom
// ============================================================
// PART J. COLLAPSING AT THREE LEVELS, AND BEING REMEMBERED  (C64 to C66)
//
// The behaviour that matters in a room: eight of ten activities folded away to
// argue about the other two, then a move from Tool 2 to Tool 3, and the eight
// are STILL folded. That is asserted here against the same storage the screens
// use, rather than against a mock, so the thing under test is the thing that
// runs.
// ============================================================
import { beforeEach, describe, expect, it } from 'vitest'
import {
  allCollapsed,
  entryKey,
  isCollapsed,
  readCollapsed,
  setMany,
  storageKey,
  toggle,
  writeCollapsed,
} from '@/lib/phase-zero-collapse'

const CLIENT = 'client-1'

beforeEach(() => { window.sessionStorage.clear() })

describe('the three levels', () => {
  it('collapses a service, an activity and an agreed answer separately', () => {
    let set = new Set<string>()
    set = toggle(set, 'service', 'svc-1')   // C64
    set = toggle(set, 'activity', 'act-1')  // C65
    set = toggle(set, 'answer', 'q-1')      // C66
    expect(isCollapsed(set, 'service', 'svc-1')).toBe(true)
    expect(isCollapsed(set, 'activity', 'act-1')).toBe(true)
    expect(isCollapsed(set, 'answer', 'q-1')).toBe(true)
  })

  it('does not confuse one level with another on the same identifier', () => {
    // An activity and an answer could carry the same id. Folding one must not
    // fold the other.
    const set = toggle(new Set<string>(), 'activity', 'same-id')
    expect(isCollapsed(set, 'activity', 'same-id')).toBe(true)
    expect(isCollapsed(set, 'answer', 'same-id')).toBe(false)
    expect(entryKey('activity', 'same-id')).not.toBe(entryKey('answer', 'same-id'))
  })

  it('starts everything open, so a new row is never mysteriously folded', () => {
    expect(isCollapsed(new Set(), 'activity', 'brand-new')).toBe(false)
  })

  it('opens again on a second press', () => {
    let set = toggle(new Set<string>(), 'activity', 'act-1')
    set = toggle(set, 'activity', 'act-1')
    expect(isCollapsed(set, 'activity', 'act-1')).toBe(false)
  })
})

describe('remembered between tools', () => {
  it('survives the move from one tool to the next', () => {
    // Tool 2 folds eight of ten.
    const ten = Array.from({ length: 10 }, (_, i) => `act-${i}`)
    const folded = setMany(new Set<string>(), 'activity', ten.slice(0, 8), true)
    writeCollapsed(CLIENT, folded)

    // Tool 3 mounts fresh and reads the same store.
    const onArrival = readCollapsed(CLIENT)
    expect(onArrival.size).toBe(8)
    expect(isCollapsed(onArrival, 'activity', 'act-0')).toBe(true)
    expect(isCollapsed(onArrival, 'activity', 'act-9')).toBe(false)
  })

  it('keeps one engagement\'s folding away from another\'s', () => {
    writeCollapsed(CLIENT, toggle(new Set<string>(), 'activity', 'act-1'))
    expect(readCollapsed('client-2').size).toBe(0)
    expect(storageKey(CLIENT)).not.toBe(storageKey('client-2'))
  })

  it('treats an unreadable store as nothing collapsed rather than refusing to draw', () => {
    window.sessionStorage.setItem(storageKey(CLIENT), '{not json')
    expect(readCollapsed(CLIENT).size).toBe(0)
  })

  it('ignores anything in the store that is not an entry', () => {
    window.sessionStorage.setItem(storageKey(CLIENT), JSON.stringify(['activity:a', 7, null]))
    expect(readCollapsed(CLIENT).size).toBe(1)
  })

  it('stores what is CLOSED, so an empty store describes a fresh screen', () => {
    writeCollapsed(CLIENT, new Set())
    expect(window.sessionStorage.getItem(storageKey(CLIENT))).toBe('[]')
    expect(readCollapsed(CLIENT).size).toBe(0)
  })
})

describe('folding a whole level at once', () => {
  const ids = ['a', 'b', 'c']

  it('collapses all of them and reports it', () => {
    const set = setMany(new Set<string>(), 'activity', ids, true)
    expect(allCollapsed(set, 'activity', ids)).toBe(true)
  })

  it('opens all of them', () => {
    const set = setMany(setMany(new Set<string>(), 'activity', ids, true), 'activity', ids, false)
    expect(allCollapsed(set, 'activity', ids)).toBe(false)
    expect(set.size).toBe(0)
  })

  it('is not "all collapsed" when one is open', () => {
    const set = setMany(new Set<string>(), 'activity', ['a', 'b'], true)
    expect(allCollapsed(set, 'activity', ids)).toBe(false)
  })

  it('is not "all collapsed" on an empty list', () => {
    expect(allCollapsed(new Set(), 'activity', [])).toBe(false)
  })
})
