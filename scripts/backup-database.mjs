// ============================================================
// A COPY OF EVERY RECORD, TAKEN WITHOUT ANYBODY REMEMBERING TO
//
// 13 September 2026. Habib asked for the platform to be robust enough to
// survive, and the first thing on that list was a backup that has actually
// been read back rather than assumed.
//
// Supabase takes its own backup every night. That is real and it is not
// enough, for three reasons.
//
//   It lives inside Supabase. An account problem, a billing lapse or a
//   mistaken project deletion takes the backups with the thing they protect.
//
//   Restoring one puts it back OVER the live project. There is no way to open
//   it, look inside and check it is right without destroying what is there.
//
//   Nobody had ever read one. An untested backup is a belief.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not copy the recordings, the
// receipts or the signed documents: those are large files in storage rather
// than records, and quietly writing somebody's voice to a second place is a
// decision that belongs to a person, not to a nightly job.
//
// THE RECORDS NEVER LEAVE HERE IN THE CLEAR. The first version wrote every
// client record into a GitHub build artifact. I had been pleased with myself
// for keeping them out of the git history, and missed that an artifact is
// barely better: anybody with read access to the repository, or any leaked
// token carrying actions:read, could have downloaded the whole customer
// database. So this writes to a folder and stops. What happens to that folder
// is the workflow's business, and the workflow will not let it leave
// unencrypted. The one thing that always travels is the manifest, which is
// table names and counts and nothing else.
//
// WHAT THE REVIEW CAUGHT, AND WHY EACH ONE MATTERED. CodeRabbit read the first
// draft and found four real faults. A backup is the one job where a silent
// fault stays invisible until the worst possible day, so each is fixed here
// rather than noted for later:
//
//   Nothing bounded how long a request could hang. Supabase can accept a
//   connection and then stop answering, and the job would have sat there until
//   GitHub killed it hours later, with every later backup queued behind it.
//
//   The whole of a table was held in memory and then serialised again, so a
//   table large enough would kill the process before it wrote anything. Pages
//   are streamed straight to the file now and never all held at once.
//
//   Pages were read in no particular order, so a row inserted or deleted while
//   the copy was running could shift every later page and silently duplicate
//   or drop records. Each table is now read in a fixed order where it has a
//   column to order by, and its count is asked again at the end, so a table
//   that moved underneath the copy is named rather than trusted.
//
//   Reading it back compared the grand total only, which would pass a fault
//   that lost ten rows from one table and gained ten in another. It is checked
//   table by table against the manifest now, and the manifest itself is parsed
//   rather than assumed to be sound.
// ============================================================
import { createWriteStream } from 'node:fs'
import { writeFile, mkdir, readFile, readdir, unlink } from 'node:fs/promises'
import { once } from 'node:events'
import path from 'node:path'

/** Nothing waits for ever. Supabase answers in milliseconds or it is broken. */
const REQUEST_TIMEOUT_MS = 30_000
const PAGE = 1000

// Read when the job runs rather than when the file loads, so the suite can
// drive this against a stand-in server without setting the real ones.
function settings() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed. Nothing was backed up.')
  return { url, key, outDir: process.env.BACKUP_DIR || 'backup', headers: { apikey: key, Authorization: `Bearer ${key}` } }
}

/** One request, with a limit on how long it is allowed to hang. */
function ask(target, headers) {
  return fetch(target, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
}

/**
 * A column to read a table in a fixed order by.
 *
 * Without one, two pages of the same table are two unrelated questions, and a
 * row written between them shifts everything after it. A primary key would be
 * ideal; the API does not reliably say which column that is, so this takes the
 * conventional ones in the order they can be trusted. A table with none of
 * them is read unordered and SAID SO in the manifest, rather than quietly
 * passing for as sound as the others.
 */
export function orderColumnFor(definition) {
  const cols = Object.keys(definition?.properties || {})
  for (const candidate of ['id', 'created_at', 'inserted_at', 'key', 'name']) {
    if (cols.includes(candidate)) return candidate
  }
  return null
}

/**
 * Every table the database is willing to talk about, and how to order each.
 *
 * Asked of the database rather than kept as a list in this file, because a
 * list in a file is a list that goes stale, and the table it forgets is the
 * one somebody needed back.
 */
export async function describeTables({ url, headers }) {
  const res = await ask(`${url}/rest/v1/`, headers)
  if (!res.ok) throw new Error(`Could not read the table list (${res.status})`)
  const spec = await res.json()
  const defs = spec.definitions || spec.components?.schemas || {}
  const names = Object.keys(defs).sort()
  if (!names.length) throw new Error('The database named no tables at all, which cannot be right.')
  return names.map((name) => ({ name, orderBy: orderColumnFor(defs[name]) }))
}

/** How many rows the database says a table holds, right now. */
export async function countOf(table, { url, headers }) {
  const res = await ask(`${url}/rest/v1/${encodeURIComponent(table)}?select=*`, {
    ...headers, Prefer: 'count=exact', Range: '0-0',
  })
  if (!res.ok) return null
  const total = Number(String(res.headers?.get?.('content-range') || '').split('/')[1])
  return Number.isFinite(total) ? total : null
}

/**
 * Write one table to a file, a page at a time.
 *
 * The rows are streamed straight out rather than collected, so what this costs
 * in memory does not grow with the size of the table. Half a million rows
 * costs the same here as ten.
 */
export async function writeTable(table, orderBy, dest, cfg) {
  const { url, headers } = cfg
  const out = createWriteStream(dest)
  const put = (s) => (out.write(s) ? Promise.resolve() : once(out, 'drain'))

  let written = 0
  try {
    await put('[\n')
    for (let from = 0; ; from += PAGE) {
      const order = orderBy ? `&order=${encodeURIComponent(orderBy)}.asc` : ''
      const res = await ask(`${url}/rest/v1/${encodeURIComponent(table)}?select=*${order}`, {
        ...headers, Range: `${from}-${from + PAGE - 1}`,
      })
      // A table this key cannot read is reported rather than silently skipped.
      if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text().catch(() => '')}`.slice(0, 200))
      const page = await res.json()
      for (const row of page) {
        await put(`${written ? ',\n' : ''}${JSON.stringify(row)}`)
        written += 1
      }
      if (page.length < PAGE) break
    }
    await put('\n]\n')
  } finally {
    out.end()
    await once(out, 'close')
  }
  return written
}

/**
 * Prove the copy can be read back, table by table, against its own manifest.
 *
 * A file of the right size that cannot be parsed is the failure this whole job
 * exists to prevent, and it is invisible unless something opens it.
 *
 * AGAINST THE MANIFEST, NOT JUST THE TOTAL. Comparing only the grand total
 * would pass a fault that lost ten rows from one table and gained ten in
 * another, which is the shape a real fault here would take. The manifest is
 * parsed rather than trusted, because it is the first thing somebody restoring
 * from this will open, and a manifest that will not parse is as bad as a
 * missing one.
 */
export async function verify(dir) {
  let recorded
  try {
    recorded = JSON.parse(await readFile(path.join(dir, '_manifest.json'), 'utf8'))
  } catch {
    throw new Error('The manifest is missing or unreadable, so nothing about this copy can be trusted.')
  }
  const present = await readdir(dir)
  const wrong = []
  let sum = 0

  for (const f of present) {
    if (f === '_manifest.json') continue
    const table = f.replace(/\.json$/, '')
    let got = null
    try { got = JSON.parse(await readFile(path.join(dir, f), 'utf8')).length } catch { got = null }
    if (got !== recorded.counts?.[table]) {
      wrong.push(`${table}: recorded ${recorded.counts?.[table]}, read back ${got === null ? 'nothing readable' : got}`)
    } else {
      sum += got
    }
  }
  for (const table of Object.keys(recorded.counts || {})) {
    if (!present.includes(`${table}.json`)) wrong.push(`${table}: in the manifest, but no file was written`)
  }
  if (sum !== recorded.rows) wrong.push(`the manifest says ${recorded.rows} rows in total, the files hold ${sum}`)

  if (wrong.length) {
    for (const w of wrong) console.error(`::error::${w}`)
    throw new Error(`The copy is not trustworthy, so nothing has been kept. ${wrong.join('; ')}`)
  }
  return { tables: Object.keys(recorded.counts || {}).length, rows: sum }
}

export const run = async () => {
  const cfg = settings()
  const { outDir } = cfg
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(outDir, stamp)
  await mkdir(dir, { recursive: true })

  const tables = await describeTables(cfg)
  const counts = {}
  const failed = []
  const unordered = []
  const shifted = []
  let rowTotal = 0

  for (const { name, orderBy } of tables) {
    const dest = path.join(dir, `${name}.json`)
    try {
      const written = await writeTable(name, orderBy, dest, cfg)
      if (!written) {
        // An empty table is not worth a file. Ninety empty files make a folder
        // nobody opens, and the point of this is that somebody can.
        await unlink(dest).catch(() => {})
        continue
      }
      counts[name] = written
      rowTotal += written
      if (!orderBy) unordered.push(name)

      // DID IT MOVE WHILE WE READ IT. A row written between two pages shifts
      // everything after it. Asking again afterwards cannot prevent that, but
      // it turns an invisible corruption into a named one.
      const now = await countOf(name, cfg).catch(() => null)
      if (now !== null && now !== written) shifted.push(`${name}: copied ${written}, database now says ${now}`)
    } catch (e) {
      failed.push(`${name}: ${e.message}`)
      await unlink(dest).catch(() => {})
    }
  }

  // THE MANIFEST CARRIES NO RECORDS. Table names and counts only, so it is the
  // one thing safe to hand to anybody who can see the build, and it is what
  // proves the job ran and what it found.
  const manifest = {
    takenAt: new Date().toISOString(),
    project: cfg.url,
    tablesSeen: tables.length,
    tablesWithRows: Object.keys(counts).length,
    rows: rowTotal,
    counts,
    failed,
    // Named rather than buried. Each of these is a way this copy is weaker
    // than it looks, and somebody restoring from it deserves to know which.
    readWithoutAStableOrder: unordered,
    changedWhileBeingCopied: shifted,
    scope: 'Every table the REST API exposes. A table hidden from the API is not copied.',
  }
  await writeFile(path.join(dir, '_manifest.json'), JSON.stringify(manifest, null, 2))

  // Read it back before claiming it worked. Its own function, so the suite can
  // hand it a broken folder and watch it refuse, rather than reading this file
  // and taking the comment's word for it. The review was right that a test
  // asserting on source text proves nothing about behaviour.
  await verify(dir)

  console.log(`Backed up ${rowTotal} rows across ${Object.keys(counts).length} tables, and read every one back.`)
  for (const [t, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${t}: ${n}`)

  // A table that could not be read, or that moved underneath the copy, is a
  // warning rather than a silent gap. The backup still stands for everything
  // else, and what is weaker about it is named.
  if (failed.length || shifted.length || unordered.length) console.log('')
  for (const f of failed) console.log(`::warning::Not copied. ${f}`)
  for (const s of shifted) console.log(`::warning::Changed while being copied. ${s}`)
  if (unordered.length) {
    console.log(`::warning::Read without a stable order, so a change during the copy could shift rows: ${unordered.join(', ')}`)
  }
}

// Only when somebody actually runs the file. Importing it, as the suite does,
// must not start copying a database.
if (process.argv[1] && process.argv[1].endsWith('backup-database.mjs')) {
  run().catch((e) => {
    console.error(`::error::The backup did not complete. ${e.message}`)
    process.exit(1)
  })
}
