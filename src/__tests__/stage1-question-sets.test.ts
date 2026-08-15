// ============================================================
// R4: question sets exist for two blocks and no others.
//
// The test that matters most here is the negative one. R4 fails if questions
// are invented for blocks Stage 1 does not cover, and inventing them is the
// easy mistake: nine empty blocks look like nine gaps.
// ============================================================
import { describe, it, expect } from 'vitest'
import { GATES } from '@/lib/gtcv-gates'
import {
  startingQuestionSet, BLOCKS_WITH_QUESTIONS, NO_QUESTIONS_YET,
} from '@/lib/stage1-question-sets'

describe('R4, which blocks have questions', () => {
  it('gives Clearing the ground a set', () => {
    expect(startingQuestionSet('phase_0').length).toBeGreaterThan(0)
  })

  it('gives DP01 Service Reality a set', () => {
    expect(startingQuestionSet('dp01').length).toBeGreaterThan(0)
  })

  it('gives every other block none, without error', () => {
    const others = GATES.filter((g) => !BLOCKS_WITH_QUESTIONS.includes(g.id))
    for (const gate of others) {
      expect(startingQuestionSet(gate.id), `${gate.id} should have no questions`).toEqual([])
    }
    // Nine of the eleven, so the negative case is the majority of the platform.
    expect(others.length).toBe(GATES.length - 2)
  })

  it('returns nothing for a block identifier that does not exist', () => {
    expect(startingQuestionSet('dp99')).toEqual([])
    expect(startingQuestionSet('')).toEqual([])
  })
})

describe('R2, every question carries its five properties', () => {
  const all = [...startingQuestionSet('phase_0'), ...startingQuestionSet('dp01')]

  it('has text, a type, a named setting, target fields and a block, on every one', () => {
    for (const q of all) {
      expect(q.question_text.trim().length, q.question_text).toBeGreaterThan(10)
      expect(['collect', 'score', 'classify']).toContain(q.question_type)
      expect(typeof q.is_named).toBe('boolean')
      expect(Array.isArray(q.target_fields)).toBe(true)
      expect(q.gate_id.length).toBeGreaterThan(0)
    }
  })

  // 15 August 2026. This asked for 1..n across the whole block, which was the
  // same thing while every question on a block belonged to one tool. Phase 0 is
  // five tools, each with its own list and its own bar, so the order that has
  // to hold is: no repeats anywhere on the block, and each TOOL's questions
  // ascending in the order that tool asks them. A gap between two tools' blocks
  // of numbers is deliberate — it is room for a sixth question in Tool 1
  // without renumbering Tool 2 underneath it.
  it('numbers them with no repeats, and in order within each tool', () => {
    for (const gate of BLOCKS_WITH_QUESTIONS) {
      const set = startingQuestionSet(gate)
      const orders = set.map((q) => q.sort_order)
      expect(new Set(orders).size, `${gate} repeats a sort_order`).toBe(orders.length)
      for (const tool of Array.from(new Set(set.map((q) => q.tool)))) {
        const ofTool = set.filter((q) => q.tool === tool).map((q) => q.sort_order)
        expect(ofTool, `${gate} tool ${tool} is out of order`).toEqual([...ofTool].sort((a, b) => a - b))
      }
    }
  })

  it('gives every question a tool, because a block can be five of them', () => {
    for (const q of all) expect(q.tool, q.question_text).toBeGreaterThanOrEqual(1)
  })
})

describe('R19, the defaults hold in the shipped sets', () => {
  const all = [...startingQuestionSet('phase_0'), ...startingQuestionSet('dp01')]

  it('leaves every score and classify question anonymous', () => {
    for (const q of all.filter((x) => x.question_type !== 'collect')) {
      expect(q.is_named, q.question_text).toBe(false)
    }
  })

  it('leaves every collect question named', () => {
    for (const q of all.filter((x) => x.question_type === 'collect')) {
      expect(q.is_named, q.question_text).toBe(true)
    }
  })
})

describe('R13, a collect question asks for its fields separately', () => {
  it('gives every collect question at least one field, each with a heading', () => {
    const collects = [...startingQuestionSet('phase_0'), ...startingQuestionSet('dp01')]
      .filter((q) => q.question_type === 'collect')
    expect(collects.length).toBeGreaterThan(0)
    for (const q of collects) {
      expect(q.target_fields.length, q.question_text).toBeGreaterThan(0)
      for (const f of q.target_fields) {
        expect(f.column.trim().length).toBeGreaterThan(0)
        expect(f.heading.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('never asks a score or classify question for table fields', () => {
    const others = [...startingQuestionSet('phase_0'), ...startingQuestionSet('dp01')]
      .filter((q) => q.question_type !== 'collect')
    for (const q of others) expect(q.target_fields).toEqual([])
  })
})

describe('R15, a classify question offers a fixed list', () => {
  it('gives every classify question at least two options', () => {
    const classifies = [...startingQuestionSet('phase_0'), ...startingQuestionSet('dp01')]
      .filter((q) => q.question_type === 'classify')
    expect(classifies.length).toBeGreaterThan(0)
    for (const q of classifies) {
      expect(q.options.length, q.question_text).toBeGreaterThanOrEqual(2)
    }
  })

  it('gives no options to a question that is not classify', () => {
    const others = [...startingQuestionSet('phase_0'), ...startingQuestionSet('dp01')]
      .filter((q) => q.question_type !== 'classify')
    for (const q of others) expect(q.options).toEqual([])
  })
})

describe('Q8, the wording for a block with no questions', () => {
  it('is exactly the sentence given, character for character', () => {
    expect(NO_QUESTIONS_YET).toBe('No questions have been set up for this block yet.')
  })
})
