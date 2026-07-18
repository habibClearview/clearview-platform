// ============================================================
// SUPPORT PLAYBOOK — server-side reader + database sync (Clair Step 3)
//
// The markdown files in docs/support-playbook/*.md are the SINGLE SOURCE OF
// TRUTH for Clair's knowledge. This module reads them off disk and mirrors them
// into the support_playbook_entries table so Clair can search them at answer
// time. It runs on the server only (filesystem + service-role database access).
//
// Design choices, all in service of the project rule "no silent failures":
//   - We parse every file BEFORE touching the database. If any file is
//     malformed, we throw with the file name and never write a partial state.
//   - The sync is a full refresh: clear the table, then insert every current
//     entry. Because the files are the only source, this keeps the table exactly
//     in step with the repo — including removing entries whose file was deleted.
//   - Every database error is thrown (with context), never swallowed.
//
// Two callers: a daily Vercel Cron (keeps the table fresh automatically) and a
// manual "sync now" button for the super coach. Both reuse the Supabase
// service-role key already configured in Vercel — no new secret is introduced.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { parsePlaybookMarkdown, type PlaybookEntry } from './support-playbook'

// Resolved from the running app's working directory. On Vercel the markdown
// files are bundled into the serverless function via outputFileTracingIncludes
// in next.config.js — without that, this read would fail in production.
export const PLAYBOOK_DIR = path.join(process.cwd(), 'docs', 'support-playbook')

export interface SyncResult {
  synced: number
  sourceFiles: string[]
}

/**
 * Read and parse every playbook markdown file on disk. Files with no
 * frontmatter (plain notes, README, the schema proposal) parse to zero entries
 * and are simply not represented — they contribute nothing rather than erroring.
 * A file WITH frontmatter that is malformed throws (via parsePlaybookMarkdown),
 * naming the file and entry, so a bad edit is caught loudly at sync time.
 */
export function readAllPlaybookEntries(): PlaybookEntry[] {
  let files: string[]
  try {
    files = readdirSync(PLAYBOOK_DIR).filter(f => f.endsWith('.md'))
  } catch (e: any) {
    throw new Error(`Playbook sync: cannot read ${PLAYBOOK_DIR} — ${e.message}`)
  }

  const entries: PlaybookEntry[] = []
  for (const file of files.sort()) {
    const raw = readFileSync(path.join(PLAYBOOK_DIR, file), 'utf8')
    entries.push(...parsePlaybookMarkdown(raw, file))
  }
  return entries
}

/** Build the Supabase service-role client used to write the playbook table. */
export function getPlaybookAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Playbook sync: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured.')
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Serialises syncs within a single serverless instance so the daily cron and a
// manual "sync now" cannot interleave their insert/delete steps. (Two separate
// instances could still overlap, but the refresh self-heals on the next run, and
// the insert-then-delete order below means an overlap never empties the table.)
let inFlight: Promise<SyncResult> | null = null

/**
 * Mirror the markdown files into support_playbook_entries as a full refresh.
 *
 * Safety comes from ordering. We (1) parse everything first, so a bad file
 * throws before we touch the database; (2) note the rows that exist now;
 * (3) insert the fresh rows so they coexist with the old ones; (4) only then
 * delete the previously-noted rows. If the insert fails, the old rows are still
 * there — the table is never left empty. If the delete fails, a few stale rows
 * linger and are cleaned up by the next sync. `entries` is injectable so the
 * sync can be tested without the filesystem; in production it reads from disk.
 */
export async function syncPlaybook(
  admin: SupabaseClient,
  entries: PlaybookEntry[] = readAllPlaybookEntries(),
): Promise<SyncResult> {
  if (inFlight) return inFlight
  inFlight = doSync(admin, entries).finally(() => { inFlight = null })
  return inFlight
}

async function doSync(admin: SupabaseClient, entries: PlaybookEntry[]): Promise<SyncResult> {
  if (entries.length === 0) {
    // A repo with no playbook entries almost certainly means a broken read or a
    // bad deploy, not a deliberate empty state. Refuse rather than wipe the table.
    throw new Error('Playbook sync: no entries found on disk — refusing to clear the table.')
  }

  // 1. Snapshot the ids that exist right now — these are the rows to remove once
  //    the new set is safely in place.
  const { data: existing, error: readErr } = await admin
    .from('support_playbook_entries')
    .select('id')
  if (readErr) {
    throw new Error(`Playbook sync: failed to read existing entries — ${readErr.message}`)
  }
  const oldIds = (existing || []).map((r: { id: string }) => r.id)

  // 2. Insert the fresh rows first. They get new ids and coexist with the old
  //    rows, so a failure here leaves the previous knowledge intact.
  const { error: insErr } = await admin.from('support_playbook_entries').insert(entries)
  if (insErr) {
    throw new Error(`Playbook sync: failed to insert ${entries.length} entries — ${insErr.message}`)
  }

  // 3. Now that the new rows are committed, remove the old ones. A failure here
  //    only leaves duplicates behind, which the next sync clears.
  if (oldIds.length > 0) {
    const { error: delErr } = await admin
      .from('support_playbook_entries')
      .delete()
      .in('id', oldIds)
    if (delErr) {
      throw new Error(`Playbook sync: inserted new entries but failed to remove ${oldIds.length} old ones — ${delErr.message}`)
    }
  }

  const sourceFiles = Array.from(new Set(entries.map(e => e.source_file))).sort()
  return { synced: entries.length, sourceFiles }
}
