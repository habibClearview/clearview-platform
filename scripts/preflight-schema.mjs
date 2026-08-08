#!/usr/bin/env node
// ============================================================
// Schema preflight.
//
// The GtCV surfaces read and write tables that were created before this
// repository kept migrations, so their CREATE TABLE statements are not here.
// A fresh Supabase project, or a rollback, therefore comes up looking healthy
// while half the app has nothing to talk to. The failure is quiet: a query
// against a missing table returns an error the surface reports as "could not
// load", and a coach reads that as a glitch rather than a broken deployment.
//
// This turns that into a loud failure at deploy time. It asks the database
// which of the tables the app depends on actually exist, and exits non-zero
// when any are absent. It changes nothing: it is a read and a report.
//
// It checks existence only, not row level security. RLS matters at least as
// much, because a table that exists without it lets every engagement read
// every other engagement's rows while nothing on screen says so, but the REST
// surface answers the same way either way, so it cannot be seen from here.
// The migration validator in .github/scripts/validate-migration.py is what
// enforces RLS, at the point where a table is created.
//
// Usage:
//   node scripts/preflight-schema.mjs
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
// environment. Without them it says so and exits non-zero, because "could not
// check" is not the same as "checked and fine".
// ============================================================

// Tables the GtCV work depends on that predate this repository's migrations.
// If one of these is missing, the deployment is broken whatever else is right.
const INHERITED = [
  'engagement_clients',
  'user_profiles',
  'co_implementers',
  'canvas_decision_points',
  'evidence_library',
  'handover_record',
  'client_access_grants',
]

// Tables this work created. Their migrations are in supabase/migrations, so a
// missing one means the migrations were not applied to this project.
const OWNED = [
  'engagement_config',
  'engagement_parties',
  'engagement_deliverables',
  'deliverable_gate_map',
  'engagement_charters',
  'charter_signatures',
  'charter_comments',
  'engagement_meetings',
  'engagement_invoice_packs',
  'gtcv_service_inventory',
  'gtcv_partner_map',
  'gtcv_channel_logic',
  'gtcv_customer_segments',
  'gtcv_problem_scores',
  'gtcv_propositions',
  'gtcv_proposition_tests',
  'gtcv_ab_tests',
  'gtcv_pipeline',
  'gtcv_pilot_sessions',
  'gtcv_assumptions',
  'gtcv_problem_owner_budget',
  'gtcv_hypotheses_shortlist',
  'gtcv_signal_story',
  'gtcv_continue_pause_kill',
  'gtcv_readiness_scores',
  'gtcv_sessions',
  'gtcv_session_attendance',
  'gtcv_gate_signoffs',
  'gtcv_interview_captures',
  'gtcv_cost_lines',
  'gtcv_pricing_tiers',
  'gtcv_market_prices',
  'gtcv_fixed_costs',
]

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Schema preflight: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  console.error('Not being able to check is not the same as checking and finding nothing wrong.')
  process.exit(1)
}

const wanted = [...INHERITED, ...OWNED]

/**
 * Ask each table for zero rows. A table that exists answers with an empty
 * list; a table that does not answers 404 with PGRST205. This uses the REST
 * surface rather than a catalogue query because REST is what the app itself
 * uses, so it tests the path that actually matters.
 */
async function probe(table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (res.ok) return { table, present: true }
  const body = await res.text().catch(() => '')
  // 404 with PGRST205 is the answer this script is looking for: the table is
  // not there. Anything else, in particular a 401 or 403, means the check
  // itself did not run, and reporting that as a missing table would send
  // somebody hunting for a schema problem that does not exist.
  const notFound = res.status === 404 || body.includes('PGRST205')
  return {
    table,
    present: false,
    unchecked: !notFound,
    status: res.status,
    detail: body.slice(0, 200),
  }
}

const results = await Promise.all(wanted.map(probe))
const unchecked = results.filter((r) => r.unchecked)
if (unchecked.length > 0) {
  console.error('Schema preflight could not run. The database answered, but not with an answer about')
  console.error('these tables, which usually means the key is wrong or lacks the rights to read them.')
  console.error(`First response: ${unchecked[0].table} returned ${unchecked[0].status}`)
  console.error(unchecked[0].detail)
  process.exit(1)
}

const missing = results.filter((r) => !r.present)

const missingInherited = missing.filter((r) => INHERITED.includes(r.table))
const missingOwned = missing.filter((r) => OWNED.includes(r.table))

if (missing.length === 0) {
  console.log(`Schema preflight: all ${wanted.length} tables present.`)
  process.exit(0)
}

console.error(`Schema preflight FAILED. ${missing.length} of ${wanted.length} tables are missing.`)

if (missingInherited.length > 0) {
  console.error('')
  console.error('Missing tables this repository does not create:')
  for (const r of missingInherited) console.error(`  ${r.table}  (${r.status})`)
  console.error('')
  console.error('These predate the migrations kept here, so applying supabase/migrations will not')
  console.error('bring them back. Restore them from a project that has them, or from a backup,')
  console.error('before this deployment can work.')
}

if (missingOwned.length > 0) {
  console.error('')
  console.error('Missing tables this repository does create:')
  for (const r of missingOwned) console.error(`  ${r.table}  (${r.status})`)
  console.error('')
  console.error('Apply the files in supabase/migrations in filename order to this project.')
}

process.exit(1)
