// ============================================================
// A GATE THAT CANNOT LOOK MUST SAY SO IN RED
//
// The row-level-security gate exited 0 with a warning whenever its credentials
// were absent. They have never been set, so the gate had never once run: its
// check step took zero seconds and showed a green tick on every pull request,
// and that tick meant "did not look". I told Habib this check was protecting
// him. It was not.
//
// The public anon key ships inside the browser bundle, which is safe only
// because row level security stands behind it. Seventy one tables here were
// once created without it and nothing said so. This is the check that is meant
// to notice, so it is the last check that may pass quietly.
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const RLS = readFileSync('.github/workflows/rls-check.yml', 'utf8')

describe('the row level security gate', () => {
  it('fails when it cannot reach the database, instead of passing', () => {
    expect(RLS).toContain('exit 1')
    expect(RLS).not.toContain('exit 0')
  })

  it('says loudly what is wrong, not as a warning somebody scrolls past', () => {
    expect(RLS).toContain('::error::Row level security was NOT checked')
    expect(RLS).not.toContain('::warning::Row level security was not checked')
  })

  it('names the two values to set and where they are set', () => {
    expect(RLS).toContain('SUPABASE_URL repository variable')
    expect(RLS).toContain('SUPABASE_SERVICE_ROLE_KEY repository secret')
    expect(RLS).toContain('Secrets and variables')
  })

  it('still runs the real check when it can reach the database', () => {
    expect(RLS).toContain('node scripts/rls-check.mjs')
  })

  it('reads the credentials into the job environment, where an if can test them', () => {
    // The secrets context is not dependable inside a step-level if, which is
    // why this is tested in the shell rather than in a condition.
    expect(RLS).toContain('NEXT_PUBLIC_SUPABASE_URL: ${{ vars.SUPABASE_URL }}')
    expect(RLS).toContain('SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}')
  })
})

describe('restoring a backup tells absent apart from unreadable', () => {
  const RESTORE = readFileSync('scripts/restore-database.mjs', 'utf8')

  it('only a missing folder counts as missing', () => {
    // Every failure used to read as an absent folder, so a destination that
    // exists and cannot be listed was treated as free ground: nothing was
    // moved aside, and the rename then failed about the wrong thing.
    expect(RESTORE).toContain("if (e && e.code === 'ENOENT') destExists = false")
  })

  it('anything else stops the restore with what actually happened', () => {
    expect(RESTORE).toContain('cannot be read, so it is not safe to restore into it')
    expect(RESTORE).not.toContain('try { occupants = await readdir(dest) } catch { destExists = false }')
  })
})
