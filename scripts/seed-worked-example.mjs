#!/usr/bin/env node
// ============================================================
// Load a worked example into an engagement.
//
// WHY THIS EXISTS. A coach opening a decision block for the first time, with a
// client watching, sees an empty table and has to explain what would go in it.
// That is the worst moment to be explaining a method. A worked example turns
// the first minute of every block into a demonstration rather than a
// description: here is what a filled inventory looks like, here is what an
// interview record looks like when it was done properly, here is what a
// proposition looks like after it has been revised twice.
//
// It is also how a team practises. Working surfaces are easier to trust once
// somebody has seen them holding something.
//
// NOTHING HERE IS TIED TO ONE ENGAGEMENT. The script takes a client id and an
// example file. The example is data, not code, so a second example for a
// different sector is a new JSON file and no change to this script. Nothing in
// this file names an organisation, a funder or a person.
//
// WHAT IT WRITES. SQL, to stdout. It does not connect to anything and it
// cannot damage anything by being run. The SQL it writes is upsert only: every
// row carries an identifier derived from the client id and the row's place in
// the example, so loading the same example twice updates the same rows rather
// than making a second copy. That also means an edit made in the app is
// overwritten if the example is loaded again, which is why --purge exists as
// an explicit flag rather than as the default.
//
// WHAT IT DOES NOT WRITE. Signatures, gate sign offs and charter records. Those
// say that a named person agreed to something, and inventing one is not a
// demonstration, it is a forgery. A worked example ends where identity begins.
//
// Usage:
//   node scripts/seed-worked-example.mjs --client=<client_id> [--example=<path>] [--purge]
//
//   --client   the engagement to load into. Required, because there is no
//              sensible default and guessing one would be how a worked example
//              ends up on top of somebody's real work.
//   --example  path to the example file. Defaults to the agricultural advisory
//              example that ships alongside this script.
//   --purge    delete the client's existing rows in the touched tables first.
//              Off by default. Use it when an engagement has half-filled tables
//              from an earlier attempt and the example should replace them.
//
// Then apply the SQL however migrations are applied in your environment.
// ============================================================

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_EXAMPLE = resolve(HERE, 'worked-examples/agricultural-advisory.json')

// Tables whose primary key is text rather than uuid. Their identifiers are
// readable on purpose: an evidence reference is quoted in claims and in funder
// packs, so it has to be something a person can say out loud.
const TEXT_KEYED = new Set(['evidence_library', 'canvas_decision_points'])

// Tables where the row that matters is identified by something other than its
// primary key. canvas_decision_points already holds a row per gate on any
// engagement that exists, created long before this example did, so matching on
// the generated identifier would insert a second row for the same gate and the
// unique index would refuse it. Matching on (client_id, dp_id) updates the row
// that is already there and leaves its own identifier alone.
const CONFLICT_TARGET = {
  canvas_decision_points: ['client_id', 'dp_id'],
}

// The order matters. A row that points at another row has to be written after
// the row it points at, or the foreign key refuses it.
const WRITE_ORDER = [
  'canvas_decision_points',
  'gtcv_service_inventory',
  'gtcv_customer_segments',
  'gtcv_problem_scores',
  'gtcv_hypotheses_shortlist',
  'gtcv_problem_owner_budget',
  'gtcv_interview_captures',
  'gtcv_signal_story',
  'gtcv_propositions',
  'gtcv_proposition_tests',
  'gtcv_pricing_tiers',
  'gtcv_cost_lines',
  'gtcv_fixed_costs',
  'gtcv_market_prices',
  'gtcv_ab_tests',
  'gtcv_pipeline',
  'gtcv_partner_map',
  'gtcv_pilot_sessions',
  'gtcv_channel_logic',
  'gtcv_assumptions',
  'gtcv_continue_pause_kill',
  'gtcv_readiness_scores',
  'gtcv_sessions',
  'evidence_library',
]

function parseArgs(argv) {
  const out = {}
  for (const arg of argv.slice(2)) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(arg)
    if (!m) fail(`Unrecognised argument: ${arg}`)
    out[m[1]] = m[2] === undefined ? true : m[2]
  }
  return out
}

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

// A stable identifier, so loading the example twice touches the same rows.
// Derived from the client as well as the table and the key, so the same example
// loaded into two engagements produces two independent sets rather than one set
// that each engagement keeps overwriting.
function stableUuid(clientId, table, key) {
  const hash = createHash('sha1').update(`${clientId}|${table}|${key}`).digest('hex')
  // Shaped as a version 5 uuid: the variant and version nibbles are set so the
  // value is a well formed uuid rather than a hex string that happens to fit.
  const version = `5${hash.slice(13, 16)}`
  const variant = ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    version,
    variant + hash.slice(18, 20),
    hash.slice(20, 32),
  ].join('-')
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`Cannot write ${value} as SQL`)
    return String(value)
  }
  return `'${String(value).replace(/'/g, "''")}'`
}

function sqlIdentifier(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) fail(`Refusing to write an identifier that needs quoting: ${name}`)
  return name
}

// Walk every row once to learn where each declared key lives, so a reference
// written anywhere in the file can be resolved without caring about order.
function collectKeys(tables, clientId) {
  const index = new Map()
  for (const [table, rows] of Object.entries(tables)) {
    rows.forEach((row, position) => {
      if (!row._key) return
      if (index.has(row._key)) fail(`Duplicate key in the example: ${row._key}`)
      index.set(row._key, {
        table,
        id: TEXT_KEYED.has(table) ? `${clientId}:${row._key}` : stableUuid(clientId, table, row._key),
      })
    })
  }
  return index
}

function rowIdentity(table, row, position, clientId) {
  const key = row._key || `row:${position}`
  if (TEXT_KEYED.has(table)) return `${clientId}:${key}`
  return stableUuid(clientId, table, key)
}

function resolveValue(value, keyIndex, where) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    if (!('_ref' in value)) fail(`Unexpected object value at ${where}`)
    const target = keyIndex.get(value._ref)
    if (!target) fail(`Reference to an undeclared key at ${where}: ${value._ref}`)
    return target.id
  }
  return value
}

function main() {
  const args = parseArgs(process.argv)
  const clientId = args.client
  if (!clientId || clientId === true) {
    fail('Missing --client=<client_id>. Refusing to guess which engagement to load into.')
  }
  if (!/^[A-Za-z0-9_-]+$/.test(clientId)) {
    fail(`Client id contains characters this script will not write into SQL: ${clientId}`)
  }

  const examplePath = args.example && args.example !== true ? resolve(args.example) : DEFAULT_EXAMPLE
  let example
  try {
    example = JSON.parse(readFileSync(examplePath, 'utf8'))
  } catch (error) {
    fail(`Could not read the example at ${examplePath}: ${error.message}`)
  }

  const tables = example.tables || {}
  const unknown = Object.keys(tables).filter((t) => !WRITE_ORDER.includes(t))
  if (unknown.length) {
    fail(`The example writes tables this script has no ordering for: ${unknown.join(', ')}`)
  }

  const keyIndex = collectKeys(tables, clientId)
  const lines = []

  lines.push('-- ============================================================')
  lines.push(`-- Worked example: ${example.name || examplePath}`)
  lines.push(`-- Loaded into: ${clientId}`)
  lines.push('--')
  lines.push('-- Generated by scripts/seed-worked-example.mjs. Every organisation, person')
  lines.push('-- and figure below is invented. Upsert only, so running it twice changes')
  lines.push('-- nothing that running it once did not already do.')
  lines.push('-- ============================================================')
  lines.push('')
  lines.push('begin;')
  lines.push('')

  const present = WRITE_ORDER.filter((table) => Array.isArray(tables[table]) && tables[table].length)

  if (args.purge) {
    lines.push('-- --purge was passed: the client\'s existing rows in these tables go first.')
    lines.push('-- Tables matched on a natural key are left alone: the upsert below already')
    lines.push('-- replaces the row that is there, and deleting it would take the engagement\'s')
    lines.push('-- own record with it rather than the example\'s copy of one.')
    // Reverse order, so a child is removed before the parent it points at.
    for (const table of [...present].reverse()) {
      if (CONFLICT_TARGET[table]) continue
      lines.push(`delete from public.${sqlIdentifier(table)} where client_id = ${sqlLiteral(clientId)};`)
    }
    lines.push('')
  }

  for (const table of present) {
    const rows = tables[table]
    lines.push(`-- ${table}: ${rows.length} row${rows.length === 1 ? '' : 's'}`)

    rows.forEach((row, position) => {
      const id = rowIdentity(table, row, position, clientId)
      const columns = ['id', 'client_id']
      const values = [sqlLiteral(id), sqlLiteral(clientId)]

      for (const [column, raw] of Object.entries(row)) {
        if (column === '_key') continue
        const resolved = resolveValue(raw, keyIndex, `${table}.${column}`)
        columns.push(sqlIdentifier(column))
        values.push(sqlLiteral(resolved))
      }

      const conflict = CONFLICT_TARGET[table] || ['id']

      // client_id is never updated: a row cannot change which engagement it
      // belongs to, and an upsert that allowed it would be a way to move one.
      // The conflict columns are left out too, because updating the thing the
      // match was made on is how a row quietly becomes a different row.
      const untouched = new Set(['id', 'client_id', ...conflict])
      const updates = columns
        .filter((c) => !untouched.has(c))
        .map((c) => `${c} = excluded.${c}`)

      lines.push(
        `insert into public.${sqlIdentifier(table)} (${columns.join(', ')})\n` +
          `  values (${values.join(', ')})\n` +
          `  on conflict (${conflict.map(sqlIdentifier).join(', ')}) do update set ${updates.join(', ')};`
      )
    })

    lines.push('')
  }

  lines.push('commit;')
  lines.push('')

  process.stdout.write(lines.join('\n'))
}

main()
