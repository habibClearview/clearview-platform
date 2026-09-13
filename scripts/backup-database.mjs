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
// This takes a plain, readable copy of every record and keeps it somewhere
// else, so there is always a version that can be opened and looked at without
// touching anything live. It is not a replacement for Supabase's backup. It is
// the second one, which is the one you find out you needed.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not copy the recordings, the
// receipts or the signed documents: those are large files in storage rather
// than records, and quietly writing somebody's voice to a second place is a
// decision that belongs to a person, not to a nightly job.
//
// THE RECORDS NEVER LEAVE HERE IN THE CLEAR. 13 September 2026, after the AI
// review refused the first version of this and was right to.
//
// The first version wrote every client record into a GitHub build artifact.
// I had been pleased with myself for keeping them out of the git history, and
// missed that an artifact is barely better: anybody with read access to the
// repository, or any leaked token carrying actions:read, could have downloaded
// the whole customer database, and it would have sat there for ninety days.
// For a platform holding people's names, addresses and money, that is a worse
// front door than the database it was copying.
//
// So this script writes the records to a folder and stops. What happens to
// that folder is the workflow's business, and the workflow will not let it
// leave unencrypted. The one thing that always travels is the manifest, which
// is table names and counts and nothing else.
// ============================================================
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

// Read when the job runs rather than when the file loads, so the suite can
// drive this against a stand-in server without setting the real ones.
function settings() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed. Nothing was backed up.')
  return { url, key, outDir: process.env.BACKUP_DIR || 'backup', headers: { apikey: key, Authorization: `Bearer ${key}` } }
}

/**
 * Every table the database is willing to talk about.
 *
 * Asked of the database rather than kept as a list in this file, because a
 * list in a file is a list that goes stale, and the table it forgets is the
 * one somebody needed back.
 */
export async function tableNames({ url, headers }) {
  const res = await fetch(`${url}/rest/v1/`, { headers })
  if (!res.ok) throw new Error(`Could not read the table list (${res.status})`)
  const spec = await res.json()
  const names = Object.keys(spec.definitions || spec.components?.schemas || {}).sort()
  if (!names.length) throw new Error('The database named no tables at all, which cannot be right.')
  return names
}

/** Every row of one table, in pages, so a large one cannot be half copied. */
export async function rowsOf(table, { url, headers }) {
  const PAGE = 1000
  const all = []
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${url}/rest/v1/${encodeURIComponent(table)}?select=*`, {
      headers: { ...headers, Range: `${from}-${from + PAGE - 1}` },
    })
    // A table this key cannot read is reported rather than silently skipped.
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text().catch(() => '')}`.slice(0, 200))
    const page = await res.json()
    all.push(...page)
    if (page.length < PAGE) return all
  }
}

export const run = async () => {
  const cfg = settings()
  const { outDir } = cfg
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(outDir, stamp)
  await mkdir(dir, { recursive: true })

  const tables = await tableNames(cfg)
  const counts = {}
  const failed = []
  let rowTotal = 0

  for (const t of tables) {
    try {
      const rows = await rowsOf(t, cfg)
      if (!rows.length) continue
      await writeFile(path.join(dir, `${t}.json`), JSON.stringify(rows, null, 1))
      counts[t] = rows.length
      rowTotal += rows.length
    } catch (e) {
      failed.push(`${t}: ${e.message}`)
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
    // The list comes from what the API is willing to describe. A table the API
    // does not expose is not in it, and would otherwise be absent without
    // anybody noticing, so the limit is written down rather than assumed away.
    scope: 'Every table the REST API exposes. A table hidden from the API is not copied.',
  }
  await writeFile(path.join(dir, '_manifest.json'), JSON.stringify(manifest, null, 2))

  // READ IT BACK BEFORE CLAIMING IT WORKED. A file of the right size that
  // cannot be parsed is the failure this whole job exists to prevent, and it
  // is invisible unless something opens it.
  //
  // TABLE BY TABLE, NOT JUST THE TOTAL. The review caught that comparing only
  // the grand total would pass a bug that lost ten rows from one table and
  // gained ten in another, which is the shape a real bug here would take.
  const { readFile, readdir } = await import('node:fs/promises')
  const wrong = []
  for (const f of await readdir(dir)) {
    if (f === '_manifest.json') continue
    const table = f.replace(/\.json$/, '')
    let got = null
    try { got = JSON.parse(await readFile(path.join(dir, f), 'utf8')).length } catch { got = null }
    if (got !== counts[table]) wrong.push(`${table}: wrote ${counts[table]}, read back ${got === null ? 'nothing readable' : got}`)
  }
  if (wrong.length) {
    for (const w of wrong) console.error(`::error::${w}`)
    console.error('::error::The copy is not trustworthy. Nothing has been kept.')
    process.exit(1)
  }

  console.log(`Backed up ${rowTotal} rows across ${Object.keys(counts).length} tables, and read every one back.`)
  for (const [t, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${t}: ${n}`)

  // A table that could not be read is a warning, not a silent gap. The backup
  // still stands for everything else, and the gap is named.
  if (failed.length) {
    console.log('')
    for (const f of failed) console.log(`::warning::Not copied. ${f}`)
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
