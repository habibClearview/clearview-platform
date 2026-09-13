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
// WHAT IT COPIES, SAID EXACTLY. The review read an earlier version of this
// paragraph as a promise to leave the recordings out, and the code did not
// keep it. The paragraph was wrong, not the code, and the difference matters
// enough to spell out.
//
//   The FILES are never copied. No audio, no receipt image, no signed
//   document leaves storage. Quietly writing somebody's voice to a second
//   place is a decision that belongs to a person, not to a nightly job, and
//   nothing here so much as asks the storage API a question.
//
//   The RECORDS about them are copied, and must be. A signed transcript is
//   the evidence a gate decision rests on; losing the record of who signed
//   what, and when, would be worse than losing the audio. Those records hold
//   people's words, so they only ever travel encrypted, and the manifest that
//   always travels holds table names and counts alone.
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

/**
 * One request, with a limit on how long it may hang and a second chance.
 *
 * 13 September 2026, the review: one blip used to fail the whole night's
 * backup. Failing loudly on a real fault is the right design and a dropped
 * connection at half past two in the morning is not a real fault, so a
 * request that fails for a reason that might pass is tried twice more, a
 * little further apart each time.
 *
 * Only for the reasons that can pass: a connection that never landed, a
 * timeout, or the server saying it is having trouble. A refusal is an answer,
 * and asking a second time will not change it.
 */
/**
 * Whether an answer is the database saying "not now" rather than "no".
 *
 * 13 September 2026, the AI review. My first version asked again only on a
 * 500, so a 429 failed the whole night on the first hit. A 429 is the one
 * status that literally means come back shortly, and a backup of forty odd
 * tables in quick succession is exactly the shape of traffic that earns one.
 * Treating it as a refusal turned a two second wait into no backup at all.
 *
 * A 4xx that is not 429 stays an answer and is not asked twice.
 */
function worthAskingAgain(status) {
  return status === 429 || status >= 500
}

async function ask(target, headers) {
  let last
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await new Promise((r) => setTimeout(r, attempt * 2000))
    try {
      const res = await fetch(target, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      // Only an explicit "I am having trouble" is worth asking again about.
      // Anything else, a refusal included, is an answer.
      if (!worthAskingAgain(res.status) || attempt === 2) return res
      last = new Error(`the database answered ${res.status}`)
    } catch (e) {
      last = e
    }
  }
  throw last
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
 * Whether an order is one that can be paged through safely.
 *
 * 13 September 2026, CodeRabbit, and it was right. Ordering by a column is not
 * the same as ordering by a column that is DIFFERENT ON EVERY ROW. Two rows
 * created in the same second are tied under `created_at`, and Postgres is free
 * to hand tied rows back in a different order each time it is asked. If that
 * tie straddles the boundary between page one and page two, one of the rows is
 * copied twice and the other is not copied at all. The counts still match, so
 * every check in this file would wave it through.
 *
 * `id` is the one name here that carries the promise of being unique, being
 * the convention this database follows for its primary key. Anything else is
 * treated as no order at all for the purpose of paging: fine for a table that
 * fits in one request, where there is no second page to disagree with the
 * first, and refused beyond that.
 */
export function orderIsUnique(column) {
  return column === 'id'
}

/**
 * A filename that cannot be anything but a filename.
 *
 * 13 September 2026, CodeRabbit. Table names came out of the database's own
 * schema and went straight into a path. That is fine until it is not: a
 * quoted table name can contain a slash, and a table called "../../package"
 * would have had this job writing, and on failure deleting, a file outside the
 * folder it was given. Whether such a table could exist here is beside the
 * point; a backup should not be the thing that decides.
 *
 * Anything outside a small safe set becomes an underscore, and the real name
 * is kept in the manifest so the mapping stays reversible. _manifest is
 * reserved, because a table of that name would otherwise be overwritten by the
 * manifest and then skipped by the check that reads it back.
 */
export function fileNameFor(table) {
  const safe = String(table)
    .replace(/[^A-Za-z0-9._-]/g, '_')
    // Two dots in a row never survive, wherever they sit. A filename with no
    // slash in it cannot climb anywhere, but leaving ".." in the middle of one
    // invites the next person to assume it is handled somewhere else.
    .replace(/\.{2,}/g, '_')
    .replace(/^\.+/, '_')
    .slice(0, 100)
  return `${safe === '_manifest' || safe === '_summary' ? `table_${safe}` : safe}.json`
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

  // Two tables whose names differ only in a character we flatten would land on
  // one file, and the second would silently overwrite the first.
  const taken = new Map()
  return names.map((name) => {
    let file = fileNameFor(name)
    if (taken.has(file)) file = `${file.slice(0, -5)}_${taken.get(file)}.json`
    taken.set(file, (taken.get(file) || 1) + 1)
    return { name, file, orderBy: orderColumnFor(defs[name]) }
  })
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
      // The status and nothing else: the server's own error text ends up in
      // the manifest, which always travels in the clear, and a database error
      // body can carry column names and fragments of rows with it.
      if (!res.ok) throw new Error(`${table}: the database answered ${res.status}`)
      const page = await res.json()
      for (const row of page) {
        await put(`${written ? ',\n' : ''}${JSON.stringify(row)}`)
        written += 1
      }
      if (page.length < PAGE) break
      // A table without a unique order cannot be paged safely: page two is a
      // different question from page one, and either a row written between
      // them or two rows tied on the ordering column can shift what lands
      // where. Under one page neither can happen, because there is only one
      // question. Over one page, refuse rather than write something that
      // looks complete and is not.
      if (!orderIsUnique(orderBy)) {
        throw new Error(
          `${table}: more than ${PAGE} rows and no unique column to order by` +
          `${orderBy ? ` (${orderBy} may repeat)` : ''}, so it cannot be copied safely`,
        )
      }
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

  // The manifest carries the filename each table was written to, so a name
  // that had to be flattened still maps back to the right table here.
  const tableOf = Object.fromEntries(Object.entries(recorded.files || {}).map(([t, f]) => [f, t]))
  for (const f of present) {
    if (f === '_manifest.json') continue
    const table = tableOf[f] ?? f.replace(/\.json$/, '')
    let got = null
    try {
      // It has to BE a list of rows. Anything else with a length, a string of
      // two characters for instance, would otherwise pass for two records.
      const rows = JSON.parse(await readFile(path.join(dir, f), 'utf8'))
      got = Array.isArray(rows) ? rows.length : null
    } catch { got = null }
    if (got !== recorded.counts?.[table]) {
      wrong.push(`${table}: recorded ${recorded.counts?.[table]}, read back ${got === null ? 'nothing readable' : got}`)
    } else {
      sum += got
    }
  }
  for (const table of Object.keys(recorded.counts || {})) {
    const f = recorded.files?.[table] ?? `${table}.json`
    if (!present.includes(f)) wrong.push(`${table}: in the manifest, but no file was written`)
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

  const files = {}
  for (const { name, file, orderBy } of tables) {
    const dest = path.join(dir, file)
    try {
      const written = await writeTable(name, orderBy, dest, cfg)

      // DID IT MOVE WHILE WE READ IT. A row written between two pages shifts
      // everything after it. Asking again afterwards cannot prevent that, but
      // it turns an invisible corruption into a named one.
      //
      // ASKED FOR AN EMPTY TABLE TOO. 13 September 2026, CodeRabbit: this used
      // to skip straight past for a table that read as empty, so a table that
      // was empty when we looked and had rows by the time we finished went
      // into the backup as nothing at all, with no warning against it.
      const now = await countOf(name, cfg).catch(() => null)
      if (now !== null && now !== written) shifted.push(`${name}: copied ${written}, database now says ${now}`)

      if (!written) {
        // An empty table is not worth a file. Ninety empty files make a folder
        // nobody opens, and the point of this is that somebody can.
        await unlink(dest).catch(() => {})
        continue
      }
      counts[name] = written
      files[name] = file
      rowTotal += written
      if (!orderIsUnique(orderBy)) unordered.push(name)
    } catch (e) {
      failed.push(`${name}: ${e.message}`)
      await unlink(dest).catch(() => {})
    }
  }

  // A TABLE THAT COULD NOT BE COPIED FAILS THE WHOLE THING. 13 September 2026,
  // CodeRabbit, and it is the most important of the findings. A refused table,
  // a dropped connection or a full disk only added a line to a list, and the
  // job went on to upload a cheerful green artifact with records missing from
  // it. A backup that is quietly incomplete is worse than no backup, because
  // it is the one you rely on.
  if (failed.length) {
    for (const f of failed) console.error(`::error::Not copied. ${f}`)
    throw new Error(`${failed.length} table${failed.length === 1 ? '' : 's'} could not be copied, so this backup is incomplete and has not been kept.`)
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
    // Which file each table was written to, so a name that had to be flattened
    // to be safe as a filename still maps back to the table it came from.
    files,
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

  // A table that moved underneath the copy is a warning rather than a silent
  // gap. The backup still stands, and what is weaker about it is named. (A
  // table that could not be read at all is not a warning; it has already
  // failed the whole job above.)
  if (shifted.length || unordered.length) console.log('')
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
