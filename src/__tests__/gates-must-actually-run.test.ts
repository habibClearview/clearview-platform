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
import { execSync } from 'node:child_process'

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

describe('a value pasted with a line break still works', () => {
  // 13 September 2026. Habib set both repository values correctly, and both
  // the backup and this very gate failed with "Failed to parse URL", because
  // the address had been copied out of a web page and carried a carriage
  // return and a newline with it. Everything was right and nothing worked.
  // Every script that reads these values trims them.
  const SCRIPTS = [
    'scripts/rls-check.mjs',
    'scripts/preflight-schema.mjs',
    'scripts/check-push-channel.mjs',
    'scripts/smoke-write-paths.mjs',
    'scripts/backup-database.mjs',
  ]

  it('every script that reads the address trims it', () => {
    for (const file of SCRIPTS) {
      const src = readFileSync(file, 'utf8')
      const reads = src.match(/process\.env\.(NEXT_PUBLIC_)?SUPABASE_URL[^\n]*/g) || []
      expect(reads.length).toBeGreaterThan(0)
      for (const line of reads) expect(line).toContain('.trim()')
    }
  })

  it('and trims the keys with it', () => {
    for (const file of SCRIPTS) {
      const src = readFileSync(file, 'utf8')
      const reads = src.match(/process\.env\.SUPABASE_SERVICE_ROLE_KEY[^\n]*/g) || []
      for (const line of reads) expect(line).toContain('.trim()')
    }
  })
})

describe('the site itself reads the address through one place', () => {
  // 13 September 2026. The moment the SUPABASE_URL repository variable existed
  // with a line break on the end, EVERY PAGE of the site failed to build:
  // creating a Supabase client with an unparseable address throws where the
  // module loads. Three separate things broke on one pasted value and none of
  // them said why.
  //
  // Every read now goes through src/lib/supabase-env.ts, which trims. This
  // test fails if a new one goes round it.
  it('nothing outside the helper reads these values raw', () => {
    const offenders = execSync(
      "grep -rln 'process\\.env\\.\\(NEXT_PUBLIC_\\)\\?SUPABASE_\\(URL\\|SERVICE_ROLE_KEY\\|ANON_KEY\\)' src app --include=*.ts --include=*.tsx || true",
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)
      .filter((f) => f !== 'src/lib/supabase-env.ts' && !f.includes('__tests__'))
    expect(offenders).toEqual([])
  })

  it('the helper trims the address and both keys', () => {
    const ENV = readFileSync('src/lib/supabase-env.ts', 'utf8')
    expect(ENV).toContain("(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\\/+$/, '')")
    expect(ENV).toContain("(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()")
    expect(ENV).toContain("(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()")
  })

  it('the browser client is built from it', () => {
    const SB = readFileSync('src/lib/supabase.ts', 'utf8')
    expect(SB).toContain('createClient(supabaseUrl(), supabaseAnonKey())')
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
