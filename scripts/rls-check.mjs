#!/usr/bin/env node
// ============================================================
// Row level security check.
//
// WHY THIS EXISTS. The public anon key ships inside the browser bundle. That is
// how Supabase is meant to work, and it is only safe because row level security
// stands behind it. A table created without it is therefore not a slightly weak
// table, it is a table any stranger can read with a key they can copy out of
// the page source. On this project that had already happened to seventy one
// tables, and nothing anywhere said so: the application looked healthy, every
// page worked, and the exposure was invisible until somebody asked the
// database directly.
//
// So this asks. It lists every table in the public schema that has row level
// security switched off and exits non-zero if there are any. It changes
// nothing.
//
// A table that genuinely has no business being reached by a browser still
// passes by having row level security on with no policy at all: the service
// role is not subject to row level security, so a server side route keeps
// working while everything else gets nothing. That is the right shape for a
// counter or a queue, and it is what this expects to see.
//
// Usage:
//   node scripts/rls-check.mjs
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Without them it
// says so and exits non-zero, because "could not check" is not "checked and
// fine". That distinction is the whole point of the script.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('rls-check: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  console.error('Without them this cannot tell a safe schema from an unchecked one, so it fails.')
  process.exit(1)
}

// Reading pg_class needs SQL, and PostgREST does not expose the catalogue. The
// project keeps a read only helper for exactly this: a database function that
// returns the tables missing row level security. If it is absent, say so rather
// than pass quietly.
const RPC = 'tables_without_rls'

async function main() {
  let res
  try {
    res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${RPC}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
  } catch (error) {
    console.error(`rls-check: could not reach the database: ${error.message}`)
    process.exit(1)
  }

  if (res.status === 404) {
    console.error(`rls-check: the ${RPC}() function is not in this database.`)
    console.error('It is created by supabase/migrations/2026_08_09_rls_check_function.sql.')
    console.error('Apply that migration, then run this again.')
    process.exit(1)
  }

  if (!res.ok) {
    console.error(`rls-check: the database refused the request (HTTP ${res.status}).`)
    console.error(await res.text())
    process.exit(1)
  }

  const rows = await res.json()
  const names = (Array.isArray(rows) ? rows : []).map((r) => r.table_name).sort()

  if (names.length === 0) {
    console.log('OK — every table in the public schema has row level security enabled.')
    return
  }

  console.error(`FAIL — ${names.length} table${names.length === 1 ? '' : 's'} in the public schema have row level security switched off.`)
  console.error('Anyone holding the public anon key can read these, and that key is in the browser bundle:')
  for (const name of names) console.error(`  ${name}`)
  console.error('')
  console.error('Fix: enable row level security and add the policies the table needs. A table')
  console.error('only the service role touches still needs it enabled, with no policy.')
  process.exit(1)
}

main().catch((error) => {
  console.error(`rls-check: ${error.message}`)
  process.exit(1)
})
