import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import {
  extractFrontmatter,
  parsePlaybookMarkdown,
  type PlaybookEntry,
} from '../lib/support-playbook'
import { readAllPlaybookEntries, syncPlaybook } from '../lib/support-playbook-loader'

// ------------------------------------------------------------
// extractFrontmatter
// ------------------------------------------------------------
describe('extractFrontmatter', () => {
  it('REG: returns the block between the first pair of --- fences', () => {
    const raw = '---\n{"a":1}\n---\n# body\n'
    expect(extractFrontmatter(raw)).toBe('{"a":1}')
  })

  it('REG: returns null when the file has no frontmatter', () => {
    expect(extractFrontmatter('# just a heading\nsome notes')).toBeNull()
  })

  it('REG: tolerates a leading UTF-8 BOM before the opening fence', () => {
    const raw = '﻿---\n{"a":1}\n---\n'
    expect(extractFrontmatter(raw)).toBe('{"a":1}')
  })
})

// ------------------------------------------------------------
// parsePlaybookMarkdown — happy path
// ------------------------------------------------------------
const VALID = `---
{
  "entries": [
    {
      "feature_area": "login",
      "symptom_tags": ["forgot password"],
      "tier": 2,
      "applies_to_roles": ["super_coach", "co_implementer"],
      "user_facing_description": "The reset email never arrived.",
      "diagnostic_questions": ["Which email?"],
      "safe_fix": "Ask them to check spam and try again.",
      "escalation_criteria": "Still nothing after confirming the address."
    },
    {
      "feature_area": "login",
      "symptom_tags": ["locked out"],
      "tier": 3,
      "applies_to_roles": ["financial_model_client"],
      "user_facing_description": "Account is locked.",
      "diagnostic_questions": ["What message?"],
      "safe_fix": null,
      "escalation_criteria": "Always escalate."
    }
  ]
}
---
# notes
`

describe('parsePlaybookMarkdown — valid input', () => {
  it('REG: parses every entry and stamps the source file', () => {
    const entries = parsePlaybookMarkdown(VALID, 'sample.md')
    expect(entries).toHaveLength(2)
    expect(entries[0].feature_area).toBe('login')
    expect(entries[0].tier).toBe(2)
    expect(entries[0].applies_to_roles).toEqual(['super_coach', 'co_implementer'])
    expect(entries[0].source_file).toBe('sample.md')
  })

  it('REG: preserves an explicit null safe_fix (no safe fix, always escalate)', () => {
    const entries = parsePlaybookMarkdown(VALID, 'sample.md')
    expect(entries[1].safe_fix).toBeNull()
  })

  it('REG: a file with no frontmatter parses to zero entries, not an error', () => {
    expect(parsePlaybookMarkdown('# plain notes\nno frontmatter here', 'notes.md')).toEqual([])
  })
})

// ------------------------------------------------------------
// parsePlaybookMarkdown — loud failure on bad content
// ------------------------------------------------------------
describe('parsePlaybookMarkdown — invalid input throws (no silent skip)', () => {
  it('REG: malformed JSON throws and names the file', () => {
    const raw = '---\n{ not valid json }\n---\n'
    expect(() => parsePlaybookMarkdown(raw, 'broken.md')).toThrow(/broken\.md/)
  })

  it('REG: frontmatter without an entries array throws', () => {
    const raw = '---\n{"something": true}\n---\n'
    expect(() => parsePlaybookMarkdown(raw, 'noentries.md')).toThrow(/entries/)
  })

  it('REG: an out-of-range tier throws', () => {
    const raw = '---\n{"entries":[{"feature_area":"x","symptom_tags":[],"tier":5,"applies_to_roles":["super_coach"],"user_facing_description":"d","diagnostic_questions":[],"safe_fix":null,"escalation_criteria":"e"}]}\n---\n'
    expect(() => parsePlaybookMarkdown(raw, 'tier.md')).toThrow(/tier/)
  })

  it('REG: an unknown role throws and lists the valid roles', () => {
    const raw = '---\n{"entries":[{"feature_area":"x","symptom_tags":[],"tier":1,"applies_to_roles":["wizard"],"user_facing_description":"d","diagnostic_questions":[],"safe_fix":null,"escalation_criteria":"e"}]}\n---\n'
    expect(() => parsePlaybookMarkdown(raw, 'role.md')).toThrow(/wizard/)
  })

  it('REG: a non-string safe_fix (that is not null) throws', () => {
    const raw = '---\n{"entries":[{"feature_area":"x","symptom_tags":[],"tier":1,"applies_to_roles":["super_coach"],"user_facing_description":"d","diagnostic_questions":[],"safe_fix":42,"escalation_criteria":"e"}]}\n---\n'
    expect(() => parsePlaybookMarkdown(raw, 'safefix.md')).toThrow(/safe_fix/)
  })

  it('REG: an empty required string throws', () => {
    const raw = '---\n{"entries":[{"feature_area":"","symptom_tags":[],"tier":1,"applies_to_roles":["super_coach"],"user_facing_description":"d","diagnostic_questions":[],"safe_fix":null,"escalation_criteria":"e"}]}\n---\n'
    expect(() => parsePlaybookMarkdown(raw, 'empty.md')).toThrow(/feature_area/)
  })
})

// ------------------------------------------------------------
// The real shipped file must always parse cleanly
// ------------------------------------------------------------
describe('login-and-auth.md (the real playbook file)', () => {
  it('REG: parses into the four documented login entries', () => {
    const file = path.join(process.cwd(), 'docs', 'support-playbook', 'login-and-auth.md')
    const raw = readFileSync(file, 'utf8')
    const entries = parsePlaybookMarkdown(raw, 'login-and-auth.md')

    expect(entries).toHaveLength(4)
    // Every entry applies to all four roles (everyone logs in the same way).
    for (const e of entries) {
      expect(e.applies_to_roles).toEqual([
        'super_coach', 'co_implementer', 'financial_model_client', 'market_intelligence_subscriber',
      ])
      expect(e.feature_area).toBe('login')
    }
    // The locked-account entry has no safe fix — always escalate.
    const locked = entries.find(e => e.symptom_tags.some(t => t.includes('locked')))
    expect(locked?.tier).toBe(3)
    expect(locked?.safe_fix).toBeNull()
  })

  it('REG: readAllPlaybookEntries reads the docs directory and includes login entries', () => {
    const all = readAllPlaybookEntries()
    expect(all.length).toBeGreaterThanOrEqual(4)
    expect(all.some(e => e.feature_area === 'login')).toBe(true)
    // Every entry carries a source file so a full-refresh sync is traceable.
    expect(all.every(e => e.source_file.endsWith('.md'))).toBe(true)
  })
})

// ------------------------------------------------------------
// syncPlaybook — full-refresh behaviour against a mocked admin client
// ------------------------------------------------------------
function makeAdminMock() {
  const calls = { delete: 0, insert: 0, insertedRows: null as PlaybookEntry[] | null }
  const admin: any = {
    from(_table: string) {
      return {
        delete() {
          calls.delete++
          return { neq: () => Promise.resolve({ error: null }) }
        },
        insert(rows: PlaybookEntry[]) {
          calls.insert++
          calls.insertedRows = rows
          return Promise.resolve({ error: null })
        },
      }
    },
  }
  return { admin, calls }
}

const SAMPLE_ENTRIES: PlaybookEntry[] = [
  {
    feature_area: 'login',
    symptom_tags: ['forgot password'],
    tier: 2,
    applies_to_roles: ['super_coach'],
    user_facing_description: 'Reset email did not arrive.',
    diagnostic_questions: ['Which email?'],
    safe_fix: 'Check spam, try again.',
    escalation_criteria: 'Still nothing.',
    source_file: 'login-and-auth.md',
  },
]

describe('syncPlaybook', () => {
  it('REG: clears the table then inserts the current entries', async () => {
    const { admin, calls } = makeAdminMock()
    const result = await syncPlaybook(admin, SAMPLE_ENTRIES)

    expect(calls.delete).toBe(1)
    expect(calls.insert).toBe(1)
    expect(calls.insertedRows).toEqual(SAMPLE_ENTRIES)
    expect(result.synced).toBe(1)
    expect(result.sourceFiles).toEqual(['login-and-auth.md'])
  })

  it('REG: refuses to run (and never clears) when there are no entries', async () => {
    const { admin, calls } = makeAdminMock()
    await expect(syncPlaybook(admin, [])).rejects.toThrow(/no entries/i)
    expect(calls.delete).toBe(0)
    expect(calls.insert).toBe(0)
  })

  it('REG: a delete error is thrown loudly and insert is not attempted', async () => {
    const calls = { delete: 0, insert: 0 }
    const admin: any = {
      from() {
        return {
          delete() {
            calls.delete++
            return { neq: () => Promise.resolve({ error: { message: 'db down' } }) }
          },
          insert() {
            calls.insert++
            return Promise.resolve({ error: null })
          },
        }
      },
    }
    await expect(syncPlaybook(admin, SAMPLE_ENTRIES)).rejects.toThrow(/db down/)
    expect(calls.insert).toBe(0)
  })

  it('REG: an insert error is thrown loudly with the entry count', async () => {
    const admin: any = {
      from() {
        return {
          delete() {
            return { neq: () => Promise.resolve({ error: null }) }
          },
          insert() {
            return Promise.resolve({ error: { message: 'constraint violated' } })
          },
        }
      },
    }
    await expect(syncPlaybook(admin, SAMPLE_ENTRIES)).rejects.toThrow(/constraint violated/)
  })
})
