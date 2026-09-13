// ============================================================
// THE BACKUP HAS TO BE THE ONE THING THAT WORKS
//
// 13 September 2026. Habib: this is critical for the survival of the business.
//
// Every other safeguard protects against inconvenience. This one protects
// against the end of it, and it is the only job where a silent failure is
// invisible until the worst possible day. So it is driven here against a
// stand-in server, end to end, and the failures it must not have quietly are
// each held by a test.
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import fs from 'fs'
import { run, tableNames, rowsOf } from '../../scripts/backup-database.mjs'

const WORKFLOW = fs.readFileSync('.github/workflows/backup-database.yml', 'utf8')
const SCRIPT = fs.readFileSync('scripts/backup-database.mjs', 'utf8')

/** A stand-in for the database: a table list, and rows for each table. */
function serverWith(tables: Record<string, unknown[]>, opts: { refuse?: string[] } = {}) {
  return vi.fn(async (url: string, init: any) => {
    const u = String(url)
    if (u.endsWith('/rest/v1/')) {
      return {
        ok: true,
        json: async () => ({ definitions: Object.fromEntries(Object.keys(tables).map((t) => [t, {}])) }),
      }
    }
    const name = decodeURIComponent(u.split('/rest/v1/')[1].split('?')[0])
    if (opts.refuse?.includes(name)) {
      return { ok: false, status: 403, text: async () => 'permission denied' }
    }
    const [from, to] = String(init.headers.Range).split('-').map(Number)
    return { ok: true, json: async () => (tables[name] || []).slice(from, to + 1) }
  })
}

let dir: string
let realFetch: any

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'cv-backup-'))
  process.env.SUPABASE_URL = 'https://example.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  process.env.BACKUP_DIR = dir
  realFetch = globalThis.fetch
})

afterEach(async () => {
  globalThis.fetch = realFetch
  await rm(dir, { recursive: true, force: true })
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.BACKUP_DIR
})

async function onlyRun(): Promise<string> {
  const [stamp] = await readdir(dir)
  return path.join(dir, stamp)
}

describe('it actually copies the records', () => {
  it('writes every table that has rows, and reads every line back', async () => {
    globalThis.fetch = serverWith({
      engagement_clients: [{ id: 'c1', name: 'Ikore' }, { id: 'c2', name: 'Elegant Beauty' }],
      field_transactions: [{ id: 't1', amount: 28000 }],
      empty_table: [],
    }) as any

    await run()
    const out = await onlyRun()
    const files = (await readdir(out)).sort()

    expect(files).toEqual(['_manifest.json', 'engagement_clients.json', 'field_transactions.json'])

    const clients = JSON.parse(await readFile(path.join(out, 'engagement_clients.json'), 'utf8'))
    expect(clients).toHaveLength(2)
    expect(clients[1].name).toBe('Elegant Beauty')

    const manifest = JSON.parse(await readFile(path.join(out, '_manifest.json'), 'utf8'))
    expect(manifest.rows).toBe(3)
    expect(manifest.tablesWithRows).toBe(2)
    expect(manifest.failed).toEqual([])
  })

  it('does not write a file for a table with nothing in it', async () => {
    // Ninety of the tables are empty. A folder of ninety empty files is a
    // folder nobody reads, and the point of this is that somebody can open it.
    globalThis.fetch = serverWith({ a: [], b: [{ id: 1 }] }) as any
    await run()
    expect(await readdir(await onlyRun())).not.toContain('a.json')
  })

  it('gets the whole of a table bigger than one page', async () => {
    // The recordings and the transactions will pass a thousand rows. A backup
    // that silently stops at the first page is the failure this exists for.
    const many = Array.from({ length: 2350 }, (_, i) => ({ id: i }))
    globalThis.fetch = serverWith({ field_transactions: many }) as any
    await run()
    const rows = JSON.parse(await readFile(path.join(await onlyRun(), 'field_transactions.json'), 'utf8'))
    expect(rows).toHaveLength(2350)
    expect(rows[2349].id).toBe(2349)
  })

  it('asks the database which tables exist rather than keeping a list', async () => {
    // A list in a file is a list that goes stale, and the table it forgets is
    // the one somebody needed back.
    globalThis.fetch = serverWith({ one: [{ a: 1 }], two: [{ b: 2 }] }) as any
    expect(await tableNames({ url: 'https://example.test', headers: {} } as any)).toEqual(['one', 'two'])
  })
})

describe('it never claims to have worked when it has not', () => {
  it('refuses to run at all without credentials, rather than making an empty folder', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    await expect(run()).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('names a table it could not read instead of skipping it quietly', async () => {
    globalThis.fetch = serverWith(
      { readable: [{ id: 1 }], locked: [{ id: 2 }] },
      { refuse: ['locked'] },
    ) as any
    await run()
    const manifest = JSON.parse(await readFile(path.join(await onlyRun(), '_manifest.json'), 'utf8'))
    expect(manifest.failed.join(' ')).toContain('locked')
    // And the rest of the backup still stands.
    expect(manifest.rows).toBe(1)
  })

  it('reads the copy back before saying it is a copy', async () => {
    expect(SCRIPT).toContain('READ IT BACK BEFORE CLAIMING IT WORKED')
    expect(SCRIPT).toContain('if (reread !== rowTotal)')
    expect(SCRIPT).toContain('The copy is not trustworthy')
  })

  it('fails the job when the credentials are missing, rather than passing quietly', () => {
    // A green tick that means "did not look" is worse than no tick at all, and
    // on a backup it is the worst of the lot.
    expect(WORKFLOW).toContain('No backup was taken')
    expect(WORKFLOW).toContain('exit 1')
    expect(WORKFLOW).toContain('if-no-files-found: error')
  })
})

describe('where the copy is kept', () => {
  it('is kept off the repository, because a git history cannot be unpicked', () => {
    // A record deleted at somebody's request has to actually go, and it cannot
    // if it is also a commit nobody can remove.
    expect(WORKFLOW).toContain('upload-artifact')
    expect(WORKFLOW).toContain('retention-days: 90')
    expect(WORKFLOW).not.toContain('git commit')
  })

  it('runs on its own every night, and can be run by hand', () => {
    expect(WORKFLOW).toContain("cron: '30 2 * * *'")
    expect(WORKFLOW).toContain('workflow_dispatch')
  })

  it('leaves the recordings alone', () => {
    // Quietly writing somebody's voice to a second place is a decision that
    // belongs to a person, not to a nightly job.
    expect(SCRIPT).toContain('It does not copy the recordings')
    expect(SCRIPT).not.toContain('storage/v1')
  })

  it('does not start copying a database just because something imported it', () => {
    expect(SCRIPT).toContain("process.argv[1].endsWith('backup-database.mjs')")
  })
})
