// ============================================================
// The small-sample rule was switched off here, so the gate that makes that
// safe has to be pinned.
//
// 23 September 2026. /api/portfolio-history no longer withholds a month read
// from fewer than five businesses. That rule exists so a shared or anonymised
// view cannot identify one business from an aggregate, and turning it off is
// only defensible because this route is the coach's own view of the coach's
// own clients, behind the super_coach role.
//
// Review, correctly: that is an assertion in a comment, and a comment does not
// enforce anything. These tests fail if the role check is weakened or removed,
// so the two changes can never drift apart.
// ============================================================
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { MIN_FOR_PUBLICATION } from '@/lib/portfolio-history'

const route = fs.readFileSync(
  path.resolve(__dirname, '../../app/api/portfolio-history/route.ts'), 'utf8',
)

describe('the month-by-month record is super_coach only', () => {
  it('refuses a request with no valid session', () => {
    expect(route).toContain('admin.auth.getUser(requesterToken)')
    expect(route).toMatch(/if \(authErr \|\| !user\) return NextResponse\.json\(\s*\{ error: 'Not authenticated' \}, \{ status: 401 \}/)
  })

  it('reads the role from the database, not from the request', () => {
    expect(route).toContain("from('user_profiles').select('role').eq('id', user.id)")
    // The role must come from the row, never from anything the caller sent.
    expect(route).not.toMatch(/body\??\.\s*role/)
  })

  it('refuses every role except super_coach', () => {
    expect(route).toMatch(/profile\.role !== 'super_coach'/)
    expect(route).toMatch(/status: 403/)
  })

  it('makes both checks before it reads a single snapshot row', () => {
    const roleCheck = route.indexOf("profile.role !== 'super_coach'")
    const firstRead = route.indexOf("from('portfolio_snapshots')")
    expect(roleCheck).toBeGreaterThan(-1)
    expect(firstRead).toBeGreaterThan(-1)
    expect(roleCheck).toBeLessThan(firstRead)
  })

  it('has no other way in: no token grant, no public GET', () => {
    expect(route).not.toContain('access_grant')
    expect(route).not.toContain('segment_filter')
    expect(route).not.toMatch(/export async function GET/)
  })

  it('still withholds a month read from fewer than five businesses', () => {
    // The money and median series must not pass the suppression flag off.
    for (const key of ['revenue', 'verified', 'readiness', 'confidence', 'absorbable']) {
      const line = route.split('\n').find((l) => l.trim().startsWith(key + ':'))
      expect(line, `${key} series missing`).toBeTruthy()
      expect(line!.includes(', false)'), `${key} must keep the small-sample rule`).toBe(false)
    }
  })
})

describe('the small-sample rule is still there for anything shared outside', () => {
  it('keeps the threshold exported rather than deleting it', () => {
    expect(MIN_FOR_PUBLICATION).toBe(5)
  })

  it('is the same threshold the sector table uses, not a second copy', () => {
    const dashboard = fs.readFileSync(
      path.resolve(__dirname, '../../src/components/coach/CoachDashboard.tsx'), 'utf8',
    )
    expect(dashboard).toContain('MIN_FOR_PUBLICATION')
    expect(dashboard).not.toMatch(/row\.count\s*<\s*5/)
  })
})
