import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import {
  MAX_ANSWER_TEXT,
  isRefusal,
  readAnswer,
  refuseSubmission,
  type Question,
  type Refusal,
} from '../lib/stage1-questions'

// ============================================================
// WHAT THE PARTICIPANT ROUTE REFUSES, AND WHAT IT LEAVES ALONE.
//
// The route itself is a thin wrapper: it fetches the room's state, asks these
// functions what to do, and answers. So these are the tests of the guards, and
// they run without a server or a database, which is why they run at all.
// ============================================================

const OPEN = 'q-open'

function state(open: string | null, revealed = false) {
  return { open_question_id: open, revealed }
}

describe('Guard: the question must be the one currently open', () => {
  it('lets through an answer to the open question', () => {
    expect(refuseSubmission(state(OPEN), OPEN)).toBeNull()
  })

  it('refuses when nothing is open at all', () => {
    const r = refuseSubmission(state(null), OPEN)
    expect(r?.status).toBe(409)
    expect(r?.error).toBe('Nothing is open at the moment')
  })

  it('refuses when there is no room state row yet', () => {
    expect(refuseSubmission(null, OPEN)?.status).toBe(409)
    expect(refuseSubmission(undefined, OPEN)?.status).toBe(409)
  })

  it('refuses a question that WAS open and has since been moved on from', () => {
    // The heart of it. A late answer to the previous question is refused, not
    // quietly re-pointed at the current one.
    const r = refuseSubmission(state('q-two'), 'q-one')
    expect(r?.status).toBe(409)
    expect(r?.error).toBe('That question is no longer open')
  })

  it('refuses a question that has not been opened yet', () => {
    expect(refuseSubmission(state(OPEN), 'q-later')?.error).toBe('That question is no longer open')
  })

  it('refuses a submission that names no question at all', () => {
    expect(refuseSubmission(state(OPEN), undefined)?.status).toBe(409)
    expect(refuseSubmission(state(OPEN), '')?.status).toBe(409)
    expect(refuseSubmission(state(OPEN), null)?.status).toBe(409)
  })
})

describe('Guard: a revealed question is closed (R11)', () => {
  it('refuses the open question once it has been revealed', () => {
    const r = refuseSubmission(state(OPEN, true), OPEN)
    expect(r?.status).toBe(409)
    expect(r?.error).toBe('That question has been revealed and is closed')
  })

  it('the not-open refusal is reached before the revealed one', () => {
    // Somebody answering a question that has both moved on AND been revealed is
    // told the plainer of the two things, and neither answer reveals which
    // question is open now.
    expect(refuseSubmission(state('q-two', true), 'q-one')?.error)
      .toBe('That question is no longer open')
  })
})

const collect: Pick<Question, 'question_type' | 'target_fields' | 'options' | 'scale_min' | 'scale_max'> = {
  question_type: 'collect',
  target_fields: [
    { column: 'service_name', heading: 'Service' },
    { column: 'activity', heading: 'Activity' },
  ],
  options: [],
  scale_min: 1,
  scale_max: 5,
}

const score = { ...collect, question_type: 'score' as const, target_fields: [] }
const classify = {
  ...collect,
  question_type: 'classify' as const,
  target_fields: [],
  options: ['Signal', 'Story'],
}

describe('What a collect answer writes', () => {
  it('keeps only the columns the question asks for', () => {
    const a = readAnswer(collect, { values: { service_name: 'Training', activity: 'Field days', other: 'x' } })
    expect(isRefusal(a)).toBe(false)
    if (isRefusal(a)) return
    expect(Object.keys(a.values).sort()).toEqual(['activity', 'service_name'])
    expect(a.values.service_name).toBe('Training')
  })

  it('refuses an answer with nothing in any box', () => {
    const a = readAnswer(collect, { values: { service_name: '   ', activity: '' } })
    expect(isRefusal(a)).toBe(true)
    expect((a as Refusal).status).toBe(400)
    expect((a as Refusal).error).toBe('There is nothing to send yet')
  })

  it('accepts an answer with only one of several boxes filled', () => {
    const a = readAnswer(collect, { values: { service_name: 'Training' } })
    expect(isRefusal(a)).toBe(false)
    if (isRefusal(a)) return
    expect(a.values.activity).toBe('')
  })

  it('cuts a very long answer off rather than refusing it', () => {
    const a = readAnswer(collect, { values: { service_name: 'x'.repeat(MAX_ANSWER_TEXT + 500) } })
    if (isRefusal(a)) throw new Error('should not refuse')
    expect(a.values.service_name.length).toBe(MAX_ANSWER_TEXT)
  })
})

describe('What a score answer writes', () => {
  it('accepts a value on the scale', () => {
    const a = readAnswer(score, { score: 4 })
    if (isRefusal(a)) throw new Error('should not refuse')
    expect(a.score_value).toBe(4)
  })

  it('refuses a value off the scale, at either end', () => {
    expect(isRefusal(readAnswer(score, { score: 0 }))).toBe(true)
    expect(isRefusal(readAnswer(score, { score: 6 }))).toBe(true)
  })

  it('refuses a value that is not a whole number, and one that is not a number', () => {
    expect(isRefusal(readAnswer(score, { score: 3.5 }))).toBe(true)
    expect(isRefusal(readAnswer(score, { score: 'four' }))).toBe(true)
    expect(isRefusal(readAnswer(score, {}))).toBe(true)
  })

  it('checks against the question\'s own scale, not a fixed one to five', () => {
    const wide = { ...score, scale_min: 0, scale_max: 10 }
    if (isRefusal(readAnswer(wide, { score: 9 }))) throw new Error('9 is on a 0 to 10 scale')
    expect(isRefusal(readAnswer(wide, { score: 11 }))).toBe(true)
  })
})

describe('What a classify answer writes', () => {
  it('accepts one of the options offered', () => {
    const a = readAnswer(classify, { option: 'Story' })
    if (isRefusal(a)) throw new Error('should not refuse')
    expect(a.option_value).toBe('Story')
  })

  it('refuses anything that is not on the list, including a near miss', () => {
    expect(isRefusal(readAnswer(classify, { option: 'story' }))).toBe(true)
    expect(isRefusal(readAnswer(classify, { option: 'Signal ' }))).toBe(true)
    expect(isRefusal(readAnswer(classify, { option: '' }))).toBe(true)
    expect(isRefusal(readAnswer(classify, {}))).toBe(true)
  })
})

// ============================================================
// THE SCRIPT TAG.
//
// Two halves, because the danger has two halves. What is stored has to be
// exactly what was typed, and what is drawn has to be drawn as text.
// ============================================================

const SCRIPT = '<script>alert("x")</script>'

describe('A submitted script tag is text, on the way in and on the way out', () => {
  it('is stored exactly as typed, neither escaped nor stripped', () => {
    const a = readAnswer(collect, { values: { service_name: SCRIPT } })
    if (isRefusal(a)) throw new Error('should not refuse')
    // Character for character. Escaping here would corrupt a legitimate answer
    // containing a less-than sign, and would do nothing the display does not
    // already do.
    expect(a.values.service_name).toBe(SCRIPT)
  })

  it('an answer that is markup and nothing else is still an answer', () => {
    const a = readAnswer(collect, { values: { service_name: '<img src=x onerror=alert(1)>' } })
    expect(isRefusal(a)).toBe(false)
  })

  it('a script tag inside a classify option is still not an option', () => {
    expect(isRefusal(readAnswer(classify, { option: `Story${SCRIPT}` }))).toBe(true)
  })

  it('nothing on any Stage 1 screen inserts submitted text as raw markup', () => {
    // The other half, and the one that actually matters on the projector.
    // React draws a string as text; the single way to escape that is
    // dangerouslySetInnerHTML. So the test is that no Stage 1 screen contains
    // it. Checked by reading the files rather than by believing they do not.
    const root = path.resolve(__dirname, '../..')
    const screens = [
      'app/room/page.tsx',
      'app/coach/facilitate/page.tsx',
      'app/api/room/route.ts',
      'app/api/facilitate/route.ts',
      'src/components/gtcv/RoomAnswers.tsx',
      'src/components/gtcv/PendingRows.tsx',
    ]
    let checked = 0
    for (const rel of screens) {
      const full = path.join(root, rel)
      if (!existsSync(full)) continue
      checked += 1
      expect(readFileSync(full, 'utf8')).not.toContain('dangerouslySetInnerHTML')
    }
    // If none of them existed the test would pass while proving nothing, so it
    // insists on having read at least the route, which exists from the start.
    expect(checked).toBeGreaterThan(0)
  })
})
