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
import { execFileSync } from 'node:child_process'
import { run, describeTables, orderColumnFor, verify, fileNameFor } from '../../scripts/backup-database.mjs'

const WORKFLOW = fs.readFileSync('.github/workflows/backup-database.yml', 'utf8')
const SCRIPT = fs.readFileSync('scripts/backup-database.mjs', 'utf8')

/** A stand-in for the database: a table list, and rows for each table. */
function serverWith(
  tables: Record<string, unknown[]>,
  opts: { refuse?: string[]; columns?: Record<string, string[]>; countSays?: Record<string, number> } = {},
) {
  return vi.fn(async (url: string, init: any) => {
    const u = String(url)
    if (u.endsWith('/rest/v1/')) {
      return {
        ok: true,
        json: async () => ({
          definitions: Object.fromEntries(Object.keys(tables).map((t) => [
            t,
            { properties: Object.fromEntries((opts.columns?.[t] ?? ['id']).map((c) => [c, {}])) },
          ])),
        }),
      }
    }
    const name = decodeURIComponent(u.split('/rest/v1/')[1].split('?')[0])
    if (opts.refuse?.includes(name)) {
      return { ok: false, status: 403, text: async () => 'permission denied' }
    }
    const rows = tables[name] || []
    // A count request: Range 0-0 with the count preference.
    if (init.headers?.Prefer === 'count=exact') {
      const total = opts.countSays?.[name] ?? rows.length
      return { ok: true, headers: { get: () => `0-0/${total}` }, json: async () => rows.slice(0, 1) }
    }
    const [from, to] = String(init.headers.Range).split('-').map(Number)
    return { ok: true, headers: { get: () => null }, json: async () => rows.slice(from, to + 1) }
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
    const seen = await describeTables({ url: 'https://example.test', headers: {} } as any)
    expect(seen.map((t: any) => t.name)).toEqual(['one', 'two'])
  })
})

describe('it never claims to have worked when it has not', () => {
  it('refuses to run at all without credentials, rather than making an empty folder', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    await expect(run()).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('fails the whole backup when one table could not be copied', async () => {
    // The most important of the review's findings. A refused table, a dropped
    // connection or a full disk used to add a line to a list and let the job
    // upload a cheerful green artifact with records missing from it. A backup
    // that is quietly incomplete is worse than no backup, because it is the
    // one you rely on.
    globalThis.fetch = serverWith(
      { readable: [{ id: 1 }], locked: [{ id: 2 }] },
      { refuse: ['locked'] },
    ) as any
    await expect(run()).rejects.toThrow(/1 table could not be copied/)
  })

  it('never puts the database own error text where it travels in the clear', async () => {
    // The manifest always travels, encrypted or not, and a database error body
    // can carry column names and fragments of rows with it.
    expect(SCRIPT).toContain('the database answered ${res.status}')
    expect(SCRIPT).not.toContain('await res.text()')
  })

  it('reads the copy back as part of taking it, not as an optional extra', async () => {
    // Driven rather than asserted on source text: a run whose files disagree
    // with its manifest must not report success.
    globalThis.fetch = serverWith({ clients: [{ id: 1 }, { id: 2 }] }) as any
    await run()
    const out = await onlyRun()
    const { writeFile } = await import('node:fs/promises')
    await writeFile(path.join(out, 'clients.json'), '[{"id":1}]')  // a row goes missing
    await expect(verify(out)).rejects.toThrow(/not trustworthy/)
  })

  // The review was right that a test reading the source proves nothing about
  // behaviour, so the verification is its own function and these hand it
  // broken folders and watch it refuse.

  it('refuses a file that will not parse, however right its size looks', async () => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(path.join(dir, '_manifest.json'), JSON.stringify({ counts: { clients: 2 }, rows: 2 }))
    await writeFile(path.join(dir, 'clients.json'), '[{"id":1},{"id":2')  // truncated
    await expect(verify(dir)).rejects.toThrow(/clients: recorded 2, read back nothing readable/)
  })

  it('refuses a table that lost rows even when another gained the same number', async () => {
    // The exact fault a grand-total check would wave through.
    const { writeFile } = await import('node:fs/promises')
    await writeFile(path.join(dir, '_manifest.json'), JSON.stringify({ counts: { a: 10, b: 10 }, rows: 20 }))
    await writeFile(path.join(dir, 'a.json'), JSON.stringify(Array.from({ length: 8 }, (_, i) => ({ i }))))
    await writeFile(path.join(dir, 'b.json'), JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ i }))))
    await expect(verify(dir)).rejects.toThrow(/a: recorded 10, read back 8/)
  })

  it('refuses a table the manifest promised and nothing wrote', async () => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(path.join(dir, '_manifest.json'), JSON.stringify({ counts: { missing: 3 }, rows: 3 }))
    await expect(verify(dir)).rejects.toThrow(/missing: in the manifest, but no file was written/)
  })

  it('refuses a file that is not a list of rows at all', async () => {
    // A string of two characters has a length of two and is not two records.
    const { writeFile } = await import('node:fs/promises')
    await writeFile(path.join(dir, '_manifest.json'), JSON.stringify({ counts: { a: 2 }, rows: 2 }))
    await writeFile(path.join(dir, 'a.json'), '"ab"')
    await expect(verify(dir)).rejects.toThrow(/a: recorded 2, read back nothing readable/)
  })

  it('checks a table that read as empty in case it filled up behind us', async () => {
    // It used to skip straight past, so a table that was empty when we looked
    // and had rows by the time we finished went in as nothing, unflagged.
    globalThis.fetch = serverWith({ latecomer: [], other: [{ id: 1 }] }, { countSays: { latecomer: 4 } }) as any
    await run()
    const manifest = JSON.parse(await readFile(path.join(await onlyRun(), '_manifest.json'), 'utf8'))
    expect(manifest.changedWhileBeingCopied.join(' ')).toContain('latecomer: copied 0, database now says 4')
  })

  it('refuses a manifest that will not parse at all', async () => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(path.join(dir, '_manifest.json'), 'not json')
    await expect(verify(dir)).rejects.toThrow(/manifest is missing or unreadable/)
  })

  it('accepts a folder that is actually sound', async () => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(path.join(dir, '_manifest.json'), JSON.stringify({ counts: { a: 2 }, rows: 2 }))
    await writeFile(path.join(dir, 'a.json'), JSON.stringify([{ i: 1 }, { i: 2 }]))
    await expect(verify(dir)).resolves.toEqual({ tables: 1, rows: 2 })
  })

  it('refuses a database that names no tables at all', async () => {
    // An empty table list would otherwise produce a cheerful backup of nothing.
    globalThis.fetch = serverWith({}) as any
    await expect(run()).rejects.toThrow(/named no tables/)
  })

  it('fails the job when the credentials are missing, rather than passing quietly', () => {
    // A green tick that means "did not look" is worse than no tick at all, and
    // on a backup it is the worst of the lot.
    expect(WORKFLOW).toContain('No backup was taken')
    expect(WORKFLOW).toContain('exit 1')
    expect(WORKFLOW).toContain('if-no-files-found: error')
  })
})

describe('the files never move, only the records about them', () => {
  it('never asks the storage API anything at all', async () => {
    // No audio, no receipt image, no signed document leaves storage. The
    // records about them are copied and must be, because losing the record of
    // who signed what would be worse than losing the audio, but the files
    // themselves are a decision for a person rather than a nightly job.
    const server = serverWith({ session_recordings: [{ id: 1 }], recording_tracks: [{ id: 2 }] })
    globalThis.fetch = server as any
    await run()
    const asked = server.mock.calls.map((c: any[]) => String(c[0]))
    expect(asked.some((u) => u.includes('/storage/'))).toBe(false)
    expect(SCRIPT).not.toContain('storage/v1')
  })

  it('says exactly that, rather than promising to leave the recordings out', () => {
    // The review read the old wording as a promise the code did not keep. The
    // wording was wrong, not the code.
    expect(SCRIPT).toContain('The FILES are never copied')
    expect(SCRIPT).toContain('The RECORDS about them are copied, and must be')
  })
})

describe('two tables can never land on one file', () => {
  it('gives a unique file to every table, even when three names flatten to one', async () => {
    // 13 September 2026, CodeRabbit, second round. My first attempt counted
    // attempts per name rather than asking whether the file was spoken for, so
    // three names flattening to the same thing gave a_b.json, a_b_2.json and
    // a_b_2.json again, and the third quietly overwrote the second. Two tables
    // sharing a file is a table missing from the backup.
    globalThis.fetch = serverWith({
      'a/b': [{ id: 1 }],
      'a:b': [{ id: 2 }],
      'a b': [{ id: 3 }],
    }) as any
    await run()
    const dir = await onlyRun()
    const manifest = JSON.parse(await readFile(path.join(dir, '_manifest.json'), 'utf8'))
    const files = Object.values(manifest.files) as string[]
    expect(files).toHaveLength(3)
    expect(new Set(files).size).toBe(3)
    // And every one of them holds the row it was supposed to hold.
    for (const [table, file] of Object.entries(manifest.files)) {
      const rows = JSON.parse(await readFile(path.join(dir, file as string), 'utf8'))
      expect(rows).toHaveLength(manifest.counts[table])
    }
  })
})

describe('a table that moves while it is being copied', () => {
  it('reads each table in a fixed order where it has a column to order by', async () => {
    // Without one, two pages of the same table are two unrelated questions,
    // and a row written between them shifts everything after it.
    const server = serverWith({ clients: [{ id: 1 }] }, { columns: { clients: ['id', 'name'] } })
    globalThis.fetch = server as any
    await run()
    const asked = server.mock.calls.map((c: any[]) => String(c[0])).filter((u) => u.includes('clients'))
    expect(asked.some((u) => u.includes('order=id.asc'))).toBe(true)
  })

  it('names a table it had to read without an order, rather than passing it off as sound', async () => {
    globalThis.fetch = serverWith({ oddity: [{ colour: 'red' }] }, { columns: { oddity: ['colour'] } }) as any
    await run()
    const manifest = JSON.parse(await readFile(path.join(await onlyRun(), '_manifest.json'), 'utf8'))
    expect(manifest.readWithoutAStableOrder).toEqual(['oddity'])
  })

  it('accepts the count of an empty table even when the database refuses the range', async () => {
    // 13 September 2026, the AI review, catching a fault I had made half an
    // hour earlier. Asking for rows 0 to 0 of a table holding none is a range
    // the table cannot satisfy, and PostgREST may answer 416. Harmless while
    // an unreadable count was shrugged off; the moment an unreadable count
    // failed the whole backup, it became a nightly failure on every empty
    // table, and this database has plenty of those. The total is in the
    // header either way, so the status is no longer read.
    globalThis.fetch = vi.fn(async (url: string, init: any) => {
      const u = String(url)
      if (u.endsWith('/rest/v1/')) {
        return {
          ok: true,
          json: async () => ({
            definitions: { empty: { properties: { id: {} } }, full: { properties: { id: {} } } },
          }),
        }
      }
      const empty = u.includes('empty')
      if (init.headers?.Prefer === 'count=exact') {
        // The shape PostgREST gives for a range nothing can satisfy.
        if (empty) return { ok: false, status: 416, headers: { get: () => '*/0' }, text: async () => '' }
        return { ok: true, headers: { get: () => '0-0/1' }, json: async () => [] }
      }
      return { ok: true, headers: { get: () => null }, json: async () => (empty ? [] : [{ id: 1 }]) }
    }) as any

    await run()
    const manifest = JSON.parse(await readFile(path.join(await onlyRun(), '_manifest.json'), 'utf8'))
    // The empty one is not a failure and not a file; the other is copied.
    expect(manifest.counts.empty).toBeUndefined()
    expect(manifest.counts.full).toBe(1)
    expect(manifest.changedWhileBeingCopied).toEqual([])
  })

  it('fails a table whose count the database will not give, rather than skipping the check', async () => {
    // 13 September 2026, CodeRabbit, second round. This used to shrug at a
    // count it could not get, which quietly turned off the one check meant to
    // catch a table shifting underneath the copy. The copy was kept and
    // nothing said the check had not run. A check that can silently not happen
    // is not a check.
    globalThis.fetch = vi.fn(async (url: string, init: any) => {
      const u = String(url)
      if (u.endsWith('/rest/v1/')) {
        return { ok: true, json: async () => ({ definitions: { t: { properties: { id: {} } } } }) }
      }
      // The count is refused; the rows themselves read perfectly well.
      if (init.headers?.Prefer === 'count=exact') return { ok: false, status: 404, text: async () => 'no' }
      return { ok: true, headers: { get: () => null }, json: async () => [{ id: 1 }] }
    }) as any
    await expect(run()).rejects.toThrow(/could not be copied/)
  })

  it('names a table whose count changed underneath the copy', async () => {
    // Asking again afterwards cannot prevent it, but it turns an invisible
    // corruption into a named one.
    globalThis.fetch = serverWith({ busy: [{ id: 1 }, { id: 2 }] }, { countSays: { busy: 5 } }) as any
    await run()
    const manifest = JSON.parse(await readFile(path.join(await onlyRun(), '_manifest.json'), 'utf8'))
    expect(manifest.changedWhileBeingCopied.join(' ')).toContain('busy: copied 2, database now says 5')
  })

  it('refuses to page a table it cannot order, rather than writing something that looks complete', async () => {
    // Page two of an unordered read is a different question from page one. A
    // table under one page cannot be hurt by that; over one page, refusing
    // beats writing a file that looks whole and is not.
    const many = Array.from({ length: 1500 }, (_, i) => ({ colour: `c${i}` }))
    globalThis.fetch = serverWith({ oddity: many }, { columns: { oddity: ['colour'] } }) as any
    await expect(run()).rejects.toThrow(/could not be copied/)
  })

  it('picks the steadiest column available', () => {
    expect(orderColumnFor({ properties: { name: {}, created_at: {}, id: {} } })).toBe('id')
    expect(orderColumnFor({ properties: { name: {}, created_at: {} } })).toBe('created_at')
    expect(orderColumnFor({ properties: { colour: {} } })).toBe(null)
  })

  it('refuses to page a table whose order can repeat', async () => {
    // 13 September 2026, CodeRabbit, and the sharpest finding on this change.
    // Ordering by a column is not the same as ordering by a column that is
    // different on every row. Two rows created in the same second are tied
    // under created_at, and the database may hand tied rows back in a
    // different order each time. A tie straddling the boundary between page
    // one and page two copies one row twice and the other not at all, and the
    // counts still match, so every other check here waves it through.
    const many = Array.from({ length: 1500 }, () => ({ created_at: 'the same second' }))
    globalThis.fetch = serverWith({ tied: many }, { columns: { tied: ['created_at'] } }) as any
    await expect(run()).rejects.toThrow(/could not be copied/)
  })

  it('still pages a table that is ordered by something unique', async () => {
    // The other half. The rule has to refuse the unsafe case without refusing
    // the ordinary one, which is every table in this database.
    const many = Array.from({ length: 2350 }, (_, i) => ({ id: i }))
    globalThis.fetch = serverWith({ clients: many }) as any
    await run()
    const manifest = JSON.parse(await readFile(path.join(await onlyRun(), '_manifest.json'), 'utf8'))
    expect(manifest.counts.clients).toBe(2350)
    expect(manifest.readWithoutAStableOrder).toEqual([])
  })

  it('names a small table read under an order that could repeat', async () => {
    // Under one page there is only one question, so nothing can shift and the
    // copy is sound. It is still named, because somebody restoring from this
    // deserves to know which tables have no key to sort them by.
    globalThis.fetch = serverWith({ notes: [{ created_at: 'x' }] }, { columns: { notes: ['created_at'] } }) as any
    await run()
    const manifest = JSON.parse(await readFile(path.join(await onlyRun(), '_manifest.json'), 'utf8'))
    expect(manifest.readWithoutAStableOrder).toEqual(['notes'])
    expect(manifest.counts.notes).toBe(1)
  })
})

describe('a table name can never build a path', () => {
  // 13 September 2026, CodeRabbit. Table names came out of the database's own
  // schema and went straight into a file path. A quoted table name can contain
  // a slash, and a backup should not be the thing that decides whether that
  // matters.

  it('cannot climb out of the folder it was given', () => {
    const name = fileNameFor('../../package')
    expect(name).not.toContain('/')
    expect(name).not.toContain('..')
    expect(fileNameFor('..')).not.toContain('..')
    expect(fileNameFor('.hidden')).not.toMatch(/^\./)
  })

  it('does not let a table called _manifest overwrite the manifest', () => {
    // It would have been overwritten by the manifest and then skipped by the
    // very check that reads the backup back.
    expect(fileNameFor('_manifest')).toBe('table__manifest.json')
    expect(fileNameFor('_summary')).toBe('table__summary.json')
  })

  it('never lets two tables land on one file', async () => {
    globalThis.fetch = serverWith({ 'a b': [{ id: 1 }], 'a-b': [{ id: 2 }] }) as any
    const seen = await describeTables({ url: 'https://example.test', headers: {} } as any)
    const names = seen.map((t: any) => t.file)
    expect(new Set(names).size).toBe(names.length)
  })

  it('keeps the real table name in the manifest, so the mapping is reversible', async () => {
    globalThis.fetch = serverWith({ 'odd name': [{ id: 1 }] }) as any
    await run()
    const manifest = JSON.parse(await readFile(path.join(await onlyRun(), '_manifest.json'), 'utf8'))
    expect(manifest.files['odd name']).toBe('odd_name.json')
    expect(manifest.counts['odd name']).toBe(1)
  })
})

describe('nothing waits for ever, and one blip is not a failure', () => {
  it('bounds every request, so a database that stops answering cannot hang the job', () => {
    expect(SCRIPT).toContain('AbortSignal.timeout(REQUEST_TIMEOUT_MS)')
    // And every request goes through the one helper that applies it, so a new
    // call cannot forget. Exactly one bare fetch exists, inside that helper.
    expect(SCRIPT.match(/\bfetch\(/g) || []).toHaveLength(1)
  })

  it('tries again when the database says it is having trouble', async () => {
    // A dropped connection at half past two in the morning is not a fault
    // worth waking up to, and failing the night's backup for one is a false
    // alarm that teaches people to ignore the real ones.
    let calls = 0
    const rows = [{ id: 1 }]
    globalThis.fetch = vi.fn(async (url: string, init: any) => {
      const u = String(url)
      if (u.endsWith('/rest/v1/')) {
        return { ok: true, json: async () => ({ definitions: { t: { properties: { id: {} } } } }) }
      }
      calls += 1
      if (calls === 1) return { ok: false, status: 503, text: async () => 'busy' }
      if (init.headers?.Prefer === 'count=exact') {
        return { ok: true, headers: { get: () => '0-0/1' }, json: async () => rows }
      }
      const [from, to] = String(init.headers.Range).split('-').map(Number)
      return { ok: true, headers: { get: () => null }, json: async () => rows.slice(from, to + 1) }
    }) as any
    await run()
    const manifest = JSON.parse(await readFile(path.join(await onlyRun(), '_manifest.json'), 'utf8'))
    expect(manifest.counts.t).toBe(1)
  })

  it('does not keep asking when the answer is a refusal', async () => {
    // A refusal is an answer. Asking again will not change it, and three
    // attempts at every table would turn one permission problem into a very
    // slow failure.
    const server = serverWith({ locked: [{ id: 1 }] }, { refuse: ['locked'] })
    globalThis.fetch = server as any
    await expect(run()).rejects.toThrow(/could not be copied/)
    const asked = server.mock.calls.filter((c: any[]) => String(c[0]).includes('locked'))
    expect(asked.length).toBe(1)
  })

  it('waits and asks again when the database says not now', async () => {
    // 13 September 2026, the AI review. A 429 is the one answer that means
    // come back shortly, and my first version treated it as a refusal, so the
    // first rate limit failed the whole night. Forty odd tables read in quick
    // succession is exactly the traffic that earns one.
    let calls = 0
    const rows = [{ id: 1 }]
    globalThis.fetch = vi.fn(async (url: string, init: any) => {
      const u = String(url)
      if (u.endsWith('/rest/v1/')) {
        return { ok: true, json: async () => ({ definitions: { t: { properties: { id: {} } } } }) }
      }
      calls += 1
      if (calls === 1) return { ok: false, status: 429, text: async () => 'slow down' }
      if (init.headers?.Prefer === 'count=exact') {
        return { ok: true, headers: { get: () => '0-0/1' }, json: async () => rows }
      }
      const [from, to] = String(init.headers.Range).split('-').map(Number)
      return { ok: true, headers: { get: () => null }, json: async () => rows.slice(from, to + 1) }
    }) as any
    await run()
    const manifest = JSON.parse(await readFile(path.join(await onlyRun(), '_manifest.json'), 'utf8'))
    expect(manifest.counts.t).toBe(1)
  })

  it('still treats a plain refusal as an answer', async () => {
    // The other half of the same rule. Widening the retry must not turn every
    // permission problem into three attempts at every table.
    let asked = 0
    globalThis.fetch = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.endsWith('/rest/v1/')) {
        return { ok: true, json: async () => ({ definitions: { t: { properties: { id: {} } } } }) }
      }
      asked += 1
      return { ok: false, status: 403, text: async () => 'no' }
    }) as any
    await expect(run()).rejects.toThrow(/could not be copied/)
    expect(asked).toBe(1)
  })
})

describe('a table too big to hold in memory', () => {
  it('streams pages to the file rather than collecting the whole table', () => {
    // A table large enough would otherwise kill the process before it wrote
    // anything, which on a backup means no backup.
    expect(SCRIPT).toContain('createWriteStream')
    expect(SCRIPT).not.toContain('const all = []')
    expect(SCRIPT).not.toMatch(/JSON\.stringify\(rows/)
  })
})

describe('the records never leave in the clear', () => {
  it('never puts a secret on the job, only on the step that needs it', () => {
    // A job level env is inherited by every step, so checkout, the Node setup
    // and the upload action could all read the service role key.
    const job = WORKFLOW.slice(WORKFLOW.indexOf('  backup:'), WORKFLOW.indexOf('    steps:'))
    expect(job).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(WORKFLOW).toContain('NO SECRET IS SET ON THE JOB')
  })

  // 13 September 2026. The first version of this uploaded every client record
  // as a plain build artifact. The AI review refused it and was right: anybody
  // with read access to the repository, or any leaked token carrying
  // actions:read, could have downloaded the whole customer database, and it
  // would have sat there for ninety days. A worse front door than the database
  // it was copying. These tests hold the fix.

  it('encrypts the records before anything is uploaded', () => {
    expect(WORKFLOW).toContain('openssl enc -aes-256-cbc -pbkdf2')
    expect(WORKFLOW).toContain('-pass env:BACKUP_PASSPHRASE')
  })

  it('keeps nothing but the manifest when there is no passphrase', () => {
    // Safe by default: no setup, no records stored, and the nightly proof that
    // every record can still be read is kept either way.
    expect(WORKFLOW).toContain('NOT kept. Only the manifest is stored')
  })

  it('goes red when no copy was kept, rather than green with only counts', () => {
    // 13 September 2026, the AI review, and the sharpest business point made
    // on this change. Reading every record and keeping only the counts is
    // worth having and is not a backup. A warning in a log nobody opens is how
    // somebody ends up believing they have months of backups and holding none.
    expect(WORKFLOW).toContain('The records must actually be kept')
    expect(WORKFLOW).toContain('NO COPY WAS KEPT')
    // After the upload, so the proof is still kept and the red is about the
    // missing copy rather than a missing run.
    expect(WORKFLOW.indexOf('The records must actually be kept'))
      .toBeGreaterThan(WORKFLOW.indexOf('upload-artifact'))
    // And it says where to set it, because the person reading this will not
    // know where that is.
    expect(WORKFLOW).toContain('New repository secret')
  })

  it('deletes the plain files inside the job, before anything is uploaded', () => {
    expect(WORKFLOW).toContain('rm -rf backup')
    expect(WORKFLOW.indexOf('rm -rf backup')).toBeLessThan(WORKFLOW.indexOf('upload-artifact'))
  })

  it('uploads only the folder it built deliberately, never the raw one', () => {
    expect(WORKFLOW).toContain('path: out/')
    expect(WORKFLOW).not.toContain('path: backup/')
  })

  it('carries no records in the manifest, only names and counts', () => {
    expect(SCRIPT).toContain('THE MANIFEST CARRIES NO RECORDS')
  })

  it('sends only a summary out in the clear, not the table names and counts', () => {
    // "How many clients" is a business figure even though it is not a client
    // record. The detail rides inside the encrypted bundle.
    expect(WORKFLOW).toContain('ONLY A SUMMARY TRAVELS IN THE CLEAR')
    expect(WORKFLOW).toContain('out/_summary.json')
    expect(WORKFLOW).not.toContain('cp "$dir/_manifest.json" out/_manifest.json')
  })

  it('fingerprints the encrypted file with a key, not a bare checksum', () => {
    // The review caught that my first attempt overclaimed. A plain sha256
    // beside the file catches a corrupted download and nothing else, because
    // anybody who can change the file can write a new sha256 next to it.
    expect(WORKFLOW).toContain('openssl dgst -sha256 -hmac')
    expect(WORKFLOW).not.toContain('sha256sum out/records.tar.gz.enc')
  })

  it('derives the fingerprint key slowly, so the published fingerprint is not a fast way to guess the passphrase', () => {
    // Two rounds of review on this one line, and the second caught a hole I
    // opened myself. My first fix separated the two keys with a single
    // SHA-256, which handed somebody holding the artifact a way to test a
    // guessed passphrase for the price of one hash: derive, fingerprint,
    // compare. The whole point of 600,000 rounds on the encryption is that
    // each guess is expensive, and a fast published check gave that away.
    //
    // This runs the real derivation rather than reading the file, so the
    // recipe has to keep working rather than merely keep looking right.
    const derive = (pass: string) => execFileSync('sh', ['-c',
      `openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -S 4d41435f4b455930 -P -pass env:P` +
      ` | awk -F= '/^key=/{print $2}'`,
    ], { env: { ...process.env, P: pass } }).toString().trim()

    const pass = 'a passphrase with spaces and a $dollar'
    const key = derive(pass)
    expect(key).toMatch(/^[0-9A-F]{64}$/)
    expect(key).not.toContain(pass)
    // Same passphrase, same key, or nobody can ever check an old backup.
    expect(derive(pass)).toBe(key)
    // A different passphrase cannot land on it.
    expect(derive('a different passphrase')).not.toBe(key)

    // And the workflow really does pay the same cost rather than handing the
    // passphrase straight to the fingerprint.
    expect(WORKFLOW).toContain('-pbkdf2 -iter 600000')
    expect(WORKFLOW).not.toContain('openssl dgst -sha256 -hmac "$BACKUP_PASSPHRASE"')
    expect(WORKFLOW).toContain('openssl dgst -sha256 -hmac "$mac_key"')
  })

  it('a changed backup does not match its fingerprint', () => {
    // The whole claim, held by running it. Somebody who swaps the encrypted
    // file cannot produce a fingerprint that matches without the passphrase.
    const dir = fs.mkdtempSync(path.join(tmpdir(), 'hmac-'))
    const file = path.join(dir, 'records.tar.gz.enc')
    const fingerprint = (key: string) => execFileSync('sh', ['-c',
      `openssl dgst -sha256 -hmac "$K" "$F" | awk '{print $NF}'`,
    ], { env: { ...process.env, K: key, F: file } }).toString().trim()

    fs.writeFileSync(file, 'the real backup')
    const real = fingerprint('the key')

    fs.writeFileSync(file, 'a substituted backup')
    expect(fingerprint('the key')).not.toBe(real)
    // And without the key, the right content still gives the wrong answer.
    fs.writeFileSync(file, 'the real backup')
    expect(fingerprint('a guess')).not.toBe(real)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('removes the plain records even if the step dies partway', () => {
    // set -e means a failing openssl exits before the cleanup line at the
    // bottom is ever reached. The runner is thrown away either way, so this
    // is depth rather than a hole, but the step whose job is that records
    // never travel in the clear should not depend on its own last line.
    const step = WORKFLOW.slice(WORKFLOW.indexOf('Lock the records, or discard them'))
    expect(step).toContain("trap 'rm -rf backup records.tar.gz' EXIT")
    expect(step.indexOf('trap ')).toBeLessThan(step.indexOf('openssl enc'))
  })

  it('keeps it for thirty days rather than ninety', () => {
    // A record somebody has asked to have deleted should not outlive that
    // request by a season.
    expect(WORKFLOW).toContain('retention-days: 30')
    expect(WORKFLOW).not.toContain('retention-days: 90')
  })

  it('is kept off the repository, because a git history cannot be unpicked', () => {
    expect(WORKFLOW).toContain('upload-artifact')
    expect(WORKFLOW).not.toContain('git commit')
  })

  it('runs on its own every night, and can be run by hand', () => {
    expect(WORKFLOW).toContain("cron: '30 2 * * *'")
    expect(WORKFLOW).toContain('workflow_dispatch')
  })

  it('does not start copying a database just because something imported it', () => {
    expect(SCRIPT).toContain("process.argv[1].endsWith('backup-database.mjs')")
  })
})
