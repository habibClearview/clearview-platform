// ============================================================
// SUPPORT PLAYBOOK — parsing (Clair Step 3)
//
// Clair's knowledge lives in docs/support-playbook/*.md. Each file starts with
// a frontmatter block (fenced by `---`) containing a JSON object with an
// `entries` array — one entry per distinct problem the file covers. The rest of
// the file is human-readable notes.
//
// We parse JSON (not YAML) on purpose: it needs no third-party dependency, it
// fails loudly and unambiguously on a typo (JSON.parse throws with a position),
// and the content is authored by us, not hand-edited by end users. Every parse
// error throws with the file name — no silent skipping (project rule: no silent
// failures).
//
// Pure functions only — no filesystem, no database. The server-side reader and
// the DB sync live in support-playbook-loader.ts so this module stays testable
// in isolation.
// ============================================================

export type SupportRole =
  | 'super_coach'
  | 'co_implementer'
  | 'financial_model_client'
  | 'market_intelligence_subscriber'

// Mirrors the support_playbook_entries table columns (snake_case) so a parsed
// entry maps straight onto a database row.
export interface PlaybookEntry {
  feature_area: string
  symptom_tags: string[]
  tier: 1 | 2 | 3
  applies_to_roles: SupportRole[]
  user_facing_description: string
  diagnostic_questions: string[]
  safe_fix: string | null          // null = no safe fix, always escalate
  escalation_criteria: string
  source_file: string
}

const VALID_ROLES: SupportRole[] = [
  'super_coach', 'co_implementer', 'financial_model_client', 'market_intelligence_subscriber',
]

function requireString(v: unknown, field: string, file: string, index: number): string {
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`Playbook ${file} entry #${index + 1}: "${field}" must be a non-empty string.`)
  }
  return v
}

// Validates an array of strings. Every element must be a non-blank string (a
// blank tag or question is useless and almost always a typo). Pass minLength to
// require the array itself be non-empty — used for the fields Clair depends on
// (symptom_tags to match, applies_to_roles to scope); left 0 for fields that may
// legitimately be empty (a trivial entry can have no diagnostic questions).
function requireStringArray(
  v: unknown, field: string, file: string, index: number, minLength = 0,
): string[] {
  if (!Array.isArray(v)) {
    throw new Error(`Playbook ${file} entry #${index + 1}: "${field}" must be an array of strings.`)
  }
  if (v.length < minLength) {
    throw new Error(`Playbook ${file} entry #${index + 1}: "${field}" must have at least ${minLength} item(s).`)
  }
  if (v.some(x => typeof x !== 'string' || x.trim() === '')) {
    throw new Error(`Playbook ${file} entry #${index + 1}: "${field}" must contain only non-empty strings.`)
  }
  return v as string[]
}

/**
 * Extract the JSON frontmatter block (between the first pair of `---` fences)
 * from a markdown file's raw text. Returns null if the file has no frontmatter
 * (e.g. a plain notes/README doc that isn't a playbook file) — the caller skips
 * those rather than treating them as an error.
 */
export function extractFrontmatter(raw: string): string | null {
  const m = raw.match(/^﻿?---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/)
  return m ? m[1] : null
}

/**
 * Parse one playbook markdown file into its entries. Throws (never silently
 * skips) if the file HAS frontmatter but it is malformed or an entry is invalid.
 * Returns [] only for a file with no frontmatter at all.
 */
export function parsePlaybookMarkdown(raw: string, sourceFile: string): PlaybookEntry[] {
  const front = extractFrontmatter(raw)
  if (front === null) return []

  let data: any
  try {
    data = JSON.parse(front)
  } catch (e: any) {
    throw new Error(`Playbook ${sourceFile}: frontmatter is not valid JSON — ${e.message}`)
  }

  const entries = data?.entries
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`Playbook ${sourceFile}: frontmatter must contain a non-empty "entries" array.`)
  }

  return entries.map((e: any, i: number): PlaybookEntry => {
    const tier = e?.tier
    if (tier !== 1 && tier !== 2 && tier !== 3) {
      throw new Error(`Playbook ${sourceFile} entry #${i + 1}: "tier" must be 1, 2, or 3.`)
    }
    const roles = requireStringArray(e?.applies_to_roles, 'applies_to_roles', sourceFile, i, 1) as SupportRole[]
    const badRole = roles.find(r => !VALID_ROLES.includes(r))
    if (badRole) {
      throw new Error(`Playbook ${sourceFile} entry #${i + 1}: unknown role "${badRole}". Valid roles: ${VALID_ROLES.join(', ')}.`)
    }
    // safe_fix must be stated explicitly: a string (the fix) or null (there is no
    // safe fix — always escalate). Omitting the key is rejected so "no safe fix"
    // is always a deliberate authoring choice, never an accidental gap.
    if (!('safe_fix' in (e ?? {}))) {
      throw new Error(`Playbook ${sourceFile} entry #${i + 1}: "safe_fix" must be present — use null to mean "no safe fix, always escalate".`)
    }
    const safeFix = e.safe_fix
    if (safeFix !== null && (typeof safeFix !== 'string' || safeFix.trim() === '')) {
      throw new Error(`Playbook ${sourceFile} entry #${i + 1}: "safe_fix" must be a non-empty string or null.`)
    }
    return {
      feature_area: requireString(e?.feature_area, 'feature_area', sourceFile, i),
      symptom_tags: requireStringArray(e?.symptom_tags, 'symptom_tags', sourceFile, i, 1),
      tier,
      applies_to_roles: roles,
      user_facing_description: requireString(e?.user_facing_description, 'user_facing_description', sourceFile, i),
      diagnostic_questions: requireStringArray(e?.diagnostic_questions, 'diagnostic_questions', sourceFile, i),
      safe_fix: safeFix === null ? null : safeFix,
      escalation_criteria: requireString(e?.escalation_criteria, 'escalation_criteria', sourceFile, i),
      source_file: sourceFile,
    }
  })
}
