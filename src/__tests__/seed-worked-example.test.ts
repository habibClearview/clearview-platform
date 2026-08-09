// ============================================================
// The worked example loader writes SQL that will be run against a real
// database, so the things worth testing are the ones that would be silent
// failures rather than errors: an identifier that changes between runs and
// quietly duplicates every row, a reference that resolves to nothing and
// detaches a proposition from its segment, a quotation mark in a verbatim that
// ends the string early and turns the rest of a sentence into SQL.
//
// The script is run as a child process rather than imported, because that is
// how it is actually used and because its output is the whole of its
// behaviour.
// ============================================================

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCRIPT = resolve(__dirname, '../../scripts/seed-worked-example.mjs')
const EXAMPLE = resolve(__dirname, '../../scripts/worked-examples/agricultural-advisory.json')

function run(args: string[]): string {
  return execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8' })
}

function runExpectingFailure(args: string[]): string {
  try {
    execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: 'pipe' })
  } catch (error: any) {
    return String(error.stderr || '')
  }
  throw new Error('Expected the script to refuse, and it did not')
}

describe('the worked example loader', () => {
  it('refuses to run without being told which engagement to load into', () => {
    expect(runExpectingFailure([])).toContain('Refusing to guess')
  })

  it('refuses a client id it would have to escape', () => {
    expect(runExpectingFailure(["--client=ikore'; drop table users; --"])).toContain(
      'characters this script will not write'
    )
  })

  it('produces the same identifiers every time it runs', () => {
    const first = run(['--client=client-test'])
    const second = run(['--client=client-test'])
    expect(first).toBe(second)
  })

  it('gives two engagements different identifiers for the same example row', () => {
    const one = run(['--client=client-one'])
    const two = run(['--client=client-two'])
    const idsOf = (sql: string) => sql.match(/values \('([0-9a-f-]{36})'/g) || []
    const overlap = idsOf(one).filter((id) => idsOf(two).includes(id))
    expect(overlap).toEqual([])
  })

  it('resolves every reference to an identifier that is inserted somewhere', () => {
    const sql = run(['--client=client-test'])
    const inserted = new Set(
      Array.from(sql.matchAll(/values \('([0-9a-f-]{36})'/g), (m) => m[1])
    )
    // Any other uuid appearing in the file is a reference, and it has to point
    // at a row this same file creates.
    const referenced = Array.from(sql.matchAll(/'([0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12})'/g), (m) => m[1])
    const dangling = referenced.filter((id) => !inserted.has(id))
    expect(dangling).toEqual([])
    // And the example does contain references, so this test is not passing on
    // an empty set.
    expect(referenced.length).toBeGreaterThan(inserted.size)
  })

  it('escapes quotation marks in the example text', () => {
    const sql = run(['--client=client-test'])
    // Every apostrophe inside a literal has to be doubled. An odd number of
    // quotation marks on a line means one of them closed a string early.
    for (const line of sql.split('\n')) {
      if (!line.includes("'")) continue
      const count = (line.match(/'/g) || []).length
      expect(count % 2, `unbalanced quoting: ${line.slice(0, 120)}`).toBe(0)
    }
  })

  it('writes deletes only when purge is asked for', () => {
    expect(run(['--client=client-test'])).not.toContain('delete from')
    expect(run(['--client=client-test', '--purge'])).toContain('delete from')
  })

  it('never writes a signature, a gate sign off or a charter row', () => {
    const sql = run(['--client=client-test', '--purge'])
    for (const table of [
      'gtcv_gate_signoffs',
      'charter_signatures',
      'engagement_charters',
      'charter_comments',
      'engagement_parties',
    ]) {
      expect(sql).not.toContain(table)
    }
  })

  it('never lets an upsert move a row to a different engagement', () => {
    const sql = run(['--client=client-test'])
    expect(sql).not.toContain('client_id = excluded.client_id')
  })

  it('ships an example whose content is invented rather than borrowed', () => {
    // The staging database carries a warning against real client information.
    // These are the names that would mean the warning had been ignored.
    const text = readFileSync(EXAMPLE, 'utf8').toLowerCase()
    for (const name of ['tanager', 'ikore', 'ignite']) {
      expect(text).not.toContain(name)
    }
  })

  it('keeps the example free of the punctuation the house style excludes', () => {
    const text = readFileSync(EXAMPLE, 'utf8')
    expect(text).not.toMatch(/[—–]/)
    expect(text).not.toMatch(/ - /)
  })
})
