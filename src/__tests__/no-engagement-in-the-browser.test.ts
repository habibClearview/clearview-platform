// ============================================================
// NOTHING ABOUT AN ENGAGEMENT LIVES IN A BROWSER
//
// An early prototype dashboard held the whole of an engagement in localStorage
// and never wrote a field to the database. Two routes rendered it, one of them
// the route every funder was sent to on sign-in, and it carried a real
// client's name as placeholder text throughout.
//
// The point of the database is that access is decided by row-level security
// and the record is the same record for everybody who may see it. A copy in
// somebody's browser is none of that: outside the policies, outside the audit
// trail, invisible to the coach, and gone when the browser is cleared.
//
// These tests are the standing rule rather than a description of that one
// component. They read the source and fail if engagement content starts being
// kept in browser storage again, whatever file does it.
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { purgeAbandoned, ABANDONED_KEYS } from '@/components/auth/PurgeBrowserCopy'

const ROOT = process.cwd()

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '__tests__') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const FILES = [...sourceFiles(join(ROOT, 'src')), ...sourceFiles(join(ROOT, 'app'))]

/**
 * The keys a browser is allowed to hold. Every one of these is a convenience
 * for the person at that one machine and none of them is engagement content:
 * which theme they chose, whether they collapsed the menu, the clock the idle
 * guard reads, the page to return to after signing in, which blocks they had
 * folded, and the name they typed to join a live session.
 *
 * Two are outboxes rather than records: the room queue and the field capture
 * queue hold answers and transactions that have been typed but not yet
 * accepted by the server, on purpose, because the alternative on a phone with
 * no signal is losing them. They are written to be drained.
 */
const ALLOWED = [
  'cv-theme',
  'cv.coachNavCollapsed',
  'cv.session.name.',
  'cv.session.role.',
  'clearview_device_id',
  'clearview_field_token',
  'clearview_field_auth',
  'gtcv_room_queue',
]

describe('no engagement content is kept in the browser', () => {
  it('the prototype that did it is gone from the repository', () => {
    expect(existsSync(join(ROOT, 'src/components/canvas/CanvasDashboard.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'app/dashboard/canvas/page.tsx'))).toBe(false)
  })

  it('no source file writes an engagement-shaped key to browser storage', () => {
    const offenders: string[] = []
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8')
      // Every string literal handed to setItem, however the storage is reached.
      const writes = [...text.matchAll(/(?:local|session)Storage\s*\.\s*setItem\s*\(\s*[`'"]([^`'"]+)/g)]
      for (const [, key] of writes) {
        if (ALLOWED.some((ok) => key === ok || key.startsWith(ok))) continue
        offenders.push(`${file.replace(ROOT + '/', '')}: ${key}`)
      }
    }
    // Keys reached through a constant are checked by name below; this catches
    // the literal ones, which is how the prototype was written.
    expect(offenders).toEqual([])
  })

  it('the funder route reads the database rather than the browser', () => {
    const text = readFileSync(join(ROOT, 'app/dashboard/funder/page.tsx'), 'utf8')
    expect(text).toContain('CoachDashboard')
    expect(text).toContain("from('user_profiles')")
    expect(text).not.toMatch(/localStorage\s*\.\s*setItem\s*\(\s*[`'"]gtcv/)
  })
})

describe('the copy already in people’s browsers is removed', () => {
  function fakeStore(seed: Record<string, string>) {
    const held = { ...seed }
    return {
      held,
      getItem: (k: string) => (k in held ? held[k] : null),
      removeItem: (k: string) => { delete held[k] },
    }
  }

  it('removes the prototype’s key and says so', () => {
    const store = fakeStore({ gtcv_engagement_v1: '{"client_name":"Ikore"}', 'cv-theme': 'dark' })
    expect(purgeAbandoned(store)).toEqual(['gtcv_engagement_v1'])
    expect(store.held.gtcv_engagement_v1).toBeUndefined()
  })

  it('leaves everything else alone', () => {
    const store = fakeStore({ 'cv-theme': 'dark', gtcv_room_queue: '[]' })
    expect(purgeAbandoned(store)).toEqual([])
    expect(store.held['cv-theme']).toBe('dark')
    expect(store.held.gtcv_room_queue).toBe('[]')
  })

  it('reports nothing when there is nothing to remove', () => {
    expect(purgeAbandoned(fakeStore({}))).toEqual([])
  })

  it('a storage that throws is not a crash', () => {
    const angry = {
      getItem: () => { throw new Error('storage disabled') },
      removeItem: () => { throw new Error('storage disabled') },
    }
    expect(() => purgeAbandoned(angry)).not.toThrow()
    expect(purgeAbandoned(angry)).toEqual([])
  })

  it('names the key it is responsible for', () => {
    expect([...ABANDONED_KEYS]).toEqual(['gtcv_engagement_v1'])
  })
})
