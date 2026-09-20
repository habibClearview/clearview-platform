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
import { readFileSync } from 'fs'

/** The visible answer the script would take from an API response. */
function textFrom(payload: unknown): string {
  const out = execFileSync('python3', [
    '-c',
    [
      'import sys, json',
      "sys.path.insert(0, '.github/scripts')",
      'import ai_review',
      'print(json.dumps(ai_review.first_text_block(json.loads(sys.stdin.read()))))',
    ].join('\n'),
  ], { input: JSON.stringify(payload), encoding: 'utf8' })
  return JSON.parse(out.trim())
}

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

// ============================================================
// AND A GATE THAT CANNOT FINISH ITS SENTENCE IS THE SAME AGAIN
//
// 20 September 2026, twice on one pull request. The model reasons before it
// answers, and on a long diff the whole budget went on the reasoning: the
// reply carried one redacted thinking block, no text at all, and stop_reason
// "max_tokens". The gate blocked a clean change for a reason that had nothing
// to do with the change, and a person could only re-run it and hope.
//
// The budget had already been raised once for this. Raising a number was never
// the fix, because any budget can be exhausted by a long enough diff and the
// failure looks identical every time.
// ============================================================
describe('finding the answer among the reasoning', () => {
  it('reads the answer when the model thought first', () => {
    expect(textFrom({
      content: [
        { type: 'thinking', thinking: 'weighing it up', signature: 'x' },
        { type: 'text', text: 'APPROVED - nothing to flag' },
      ],
    })).toBe('APPROVED - nothing to flag')
  })

  it('reads a plain answer with no reasoning block at all', () => {
    expect(textFrom({ content: [{ type: 'text', text: 'BLOCKED - data loss' }] }))
      .toBe('BLOCKED - data loss')
  })

  it('reports nothing when the model never got to an answer', () => {
    // This is the response that blocked twice: reasoning only, and redacted.
    expect(textFrom({
      stop_reason: 'max_tokens',
      content: [{ type: 'thinking', thinking: '', signature: 'EsGyAQ' }],
    })).toBe('')
  })

  it('reports nothing for an empty answer, rather than passing it off as one', () => {
    expect(textFrom({ content: [{ type: 'text', text: '   ' }] })).toBe('')
    expect(textFrom({ content: [] })).toBe('')
    expect(textFrom({})).toBe('')
    expect(textFrom('not even an object')).toBe('')
  })
})

describe('the gate asks again before it gives up', () => {
  const script = readFileSync('.github/scripts/ai_review.py', 'utf8')

  it('makes a second attempt with more room when the first ran out', () => {
    expect(script).toContain('attempts = [')
    expect(script).toContain('16000')
    expect(script).toContain('24000')
    expect(script).toContain("stop == \"max_tokens\"")
  })

  it('does not retry a real fault, which would only delay the answer', () => {
    // An HTTP error means something is actually wrong. It blocks at once.
    expect(script).toContain('API returned HTTP')
    const httpBranch = script.slice(script.indexOf('except urllib.error.HTTPError'))
    expect(httpBranch.slice(0, 400)).toContain('fail_closed')
  })

  it('still fails closed when the second attempt returns nothing either', () => {
    expect(script).toContain('if not review:')
    expect(script).toContain('fail_closed(last_problem)')
  })
})
