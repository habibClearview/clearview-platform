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

/**
 * Mirror the markdown files into support_playbook_entries as a full refresh.
 *
 * Order matters for safety: we parse everything first (throws before any write
 * if a file is bad), then clear the table, then insert. `entries` is injectable
 * so the sync can be tested without the filesystem; in production it defaults to
 * whatever is on disk.
 */
export async function syncPlaybook(
  admin: SupabaseClient,
  entries: PlaybookEntry[] = readAllPlaybookEntries(),
): Promise<SyncResult> {
  if (entries.length === 0) {
    // A repo with no playbook entries almost certainly means a broken read or a
    // bad deploy, not a deliberate empty state. Refuse rather than wipe the table.
    throw new Error('Playbook sync: no entries found on disk — refusing to clear the table.')
  }

  // Clear existing rows. Supabase requires a filter on delete; this one matches
  // every real row (no row uses the all-zero UUID).
  const { error: delErr } = await admin
    .from('support_playbook_entries')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (delErr) {
    throw new Error(`Playbook sync: failed to clear old entries — ${delErr.message}`)
  }

  // PlaybookEntry columns are already snake_case and match the table exactly;
  // updated_at defaults to now() in the database.
  const { error: insErr } = await admin.from('support_playbook_entries').insert(entries)
  if (insErr) {
    throw new Error(`Playbook sync: failed to insert ${entries.length} entries — ${insErr.message}`)
  }

  const sourceFiles = Array.from(new Set(entries.map(e => e.source_file))).sort()
  return { synced: entries.length, sourceFiles }
}
