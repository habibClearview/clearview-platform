// ============================================================
// A GATE THAT BLOCKS EVERYTHING IS THE SAME AS NO GATE
//
// 17 September 2026. The AI review looked at a change, decided it was fine, and
// said so in full: "## Verdict: **APPROVED**". The gate then blocked the pull
// request, because it reads the first line letters-only and that line reduces
// to VERDICTAPPROVED, which does not start with APPROVED. It could not read a
// verdict it had been handed in plain English, and failed closed on the model's
// own heading.
//
// Failing closed is the right instinct and is kept. What is wrong is failing
// closed on a clear answer: a gate that cannot be passed stops being a check on
// the work and becomes a thing everybody learns to route around.
//
// These run the real script rather than reading it, because the fault was
// precisely that the code and the comment above it disagreed.
// ============================================================
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'

function verdict(review: string): string {
  const out = execFileSync('python3', [
    '-c',
    [
      'import sys, json',
      "sys.path.insert(0, '.github/scripts')",
      'import ai_review',
      'print(json.dumps(ai_review.read_verdict(json.loads(sys.stdin.read()))))',
    ].join('\n'),
  ], { input: JSON.stringify(review), encoding: 'utf8' })
  return JSON.parse(out.trim())
}

describe('reading the verdict the model actually wrote', () => {
  it('reads the approval that blocked this very pull request', () => {
    expect(verdict('## Verdict: **APPROVED**\n\nNo merge-blocking issues found.')).toBe('success')
  })

  it('reads a plain one, which always worked', () => {
    expect(verdict('APPROVED - nothing to flag')).toBe('success')
    expect(verdict('BLOCKED - an auth hole')).toBe('failure')
  })

  it('reads one wearing markdown, which is how a model writes for people', () => {
    expect(verdict('**APPROVED**')).toBe('success')
    expect(verdict('## Verdict: **BLOCKED**\n\nData loss in the migration.')).toBe('failure')
    expect(verdict('Result: APPROVED')).toBe('success')
  })

  it('lets BLOCKED win when it comes first, which is the whole point', () => {
    expect(verdict('Some notes first\nBLOCKED - data loss')).toBe('failure')
  })

  it('still refuses to guess when the review says neither', () => {
    // This is what fails the gate closed, and it must keep doing so.
    expect(verdict('I had a look and I am not sure.')).toBeNull()
    expect(verdict('')).toBeNull()
  })

  it('does not read a passing mention of the word as a verdict', () => {
    expect(verdict('This would be approved if the migration were reversible.')).toBeNull()
  })
})
