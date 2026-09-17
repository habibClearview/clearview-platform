// ============================================================
// R4: question sets exist for two blocks and no others.
//
// The test that matters most here is the negative one. R4 fails if questions
// are invented for blocks Stage 1 does not cover, and inventing them is the
// easy mistake: nine empty blocks look like nine gaps.
// ============================================================
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { PROBLEM_COLUMNS, ACTIVITY_VALUE_FIELDS, CHAIN_TABLES, planAccept, NOT_FILED_HERE } from '@/lib/stage1-accept'
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

  it('gives every block something to ask, so nothing is greyed out', () => {
    // Habib, 17 September 2026: "All sessions should be able to run in the
    // room so there should be nothing greyed out saying there is no question
    // set." Every block the platform has, not most of them.
    const without = GATES.filter((g) => startingQuestionSet(g.id).length === 0)
    expect(without.map((g) => g.id)).toEqual([])
  })

  it('offers the room every block it has questions for', () => {
    // BLOCKS_WITH_QUESTIONS is what decides whether a block says there is
    // nothing to ask, so it and the sets cannot be allowed to disagree.
    for (const g of GATES) {
      expect(BLOCKS_WITH_QUESTIONS, g.id).toContain(g.id)
    }
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

// ============================================================
// DECISION POINT 9 IS SIX QUESTIONS, NOT NONE
//
// Habib, 17 September 2026: "In decision point 9 the run in the room button
// says there are no questions, but there are six questions that must be
// answered by participants and scored."
//
// The block that exists entirely to score the six fit tests told the room it
// had nothing to ask, so the session was run from paper.
// ============================================================
describe('the Commercial Readiness fit tests', () => {
  const set = startingQuestionSet('dp09')

  it('asks the room all six, and only six', () => {
    expect(set.length).toBe(6)
  })

  it('asks them one at a time, so the spread of opinion is visible', () => {
    // Six separate questions rather than one with six parts: the room's
    // answers to each fit test have to arrive on their own to be discussed.
    expect(set.map(s => s.sort_order)).toEqual([1, 2, 3, 4, 5, 6])
    expect(new Set(set.map(s => s.question_text)).size).toBe(6)
  })

  it('scores them on the diagnostic panel own scale, 0 to 3', () => {
    // 0 no evidence, 1 asserted, 2 evidenced, 3 proven. A 1 to 5 scale here
    // would produce a score the Commercial Readiness table cannot record.
    for (const s of set) {
      expect(s.question_type).toBe('score')
      expect(s.scale_min).toBe(0)
      expect(s.scale_max).toBe(3)
    }
  })

  it('carries the six fit tests by name, word for word', () => {
    const text = set.map(s => s.question_text).join(' | ')
    for (const name of [
      'Problem-Provider Fit', 'Problem-Solution Fit', 'Solution-Customer Fit',
      'Solution-Pilot Fit', 'Solution-Market Fit', 'Solution-Scale Fit',
    ]) {
      expect(text, name).toContain(name)
    }
  })

  it('is listed as a block that has questions, so the room offers them', () => {
    // BLOCKS_WITH_QUESTIONS is what decides whether the block says
    // "no questions have been set up for this block yet".
    expect(BLOCKS_WITH_QUESTIONS).toContain('dp09')
  })
})

// ============================================================
// A PROMPT THAT WRITES TO A COLUMN THAT IS NOT THERE
//
// The room answers, the facilitator presses Accept, and nothing arrives. The
// prompts are new and every one of them names a column it files into, so this
// checks each name against the columns the accept route will actually let
// through, and against the block it belongs to.
// ============================================================
/**
 * Columns the accept chain deliberately routes to a different table, taken
 * from the accept module itself rather than copied, so this cannot go stale.
 */
const ACCEPT_CHAIN: string[] = ['problem', 'activity', ...PROBLEM_COLUMNS, ...ACTIVITY_VALUE_FIELDS]

describe('every prompt files into a real column', () => {
  const route = fs.readFileSync('app/api/facilitate/route.ts', 'utf8')

  /** BLOCK_TABLE, as the route actually declares it. */
  const blockTable: Record<string, string> = {}
  {
    const body = route.slice(route.indexOf('const BLOCK_TABLE'), route.indexOf('}', route.indexOf('const BLOCK_TABLE')))
    for (const m of body.matchAll(/(\w+):\s*'([^']+)'/g)) blockTable[m[1]] = m[2]
  }

  /** BLOCK_COLUMNS, likewise. */
  const blockColumns: Record<string, string[]> = {}
  {
    const start = route.indexOf('const BLOCK_COLUMNS')
    const body = route.slice(start, route.indexOf('\n}', start))
    for (const m of body.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
      blockColumns[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])
    }
  }

  it('found the route own maps, rather than testing nothing', () => {
    // If the parsing above breaks, every check below passes vacuously.
    expect(Object.keys(blockTable).length).toBeGreaterThan(8)
    expect(Object.keys(blockColumns).length).toBeGreaterThan(8)
  })

  it('names a column the accept route will let through', () => {
    const bad: string[] = []
    for (const gate of GATES) {
      for (const seed of startingQuestionSet(gate.id)) {
        for (const f of seed.target_fields) {
          const table = blockTable[gate.id]
          if (!table) { bad.push(`${gate.id} has no table but "${seed.question_text.slice(0, 40)}" files into ${f.column}`); continue }
          const allowed = blockColumns[table] || []
          // A column routed by the accept chain belongs to another table on
          // purpose, but ONLY on the blocks that chain is built out of. It
          // used to be allowed everywhere, which is why this test waved
          // through a Decision Point 3 prompt that would have filed its
          // answer as a Phase 0 problem in a different block.
          const chainAllowed = CHAIN_TABLES.includes(table) && ACCEPT_CHAIN.includes(f.column)
          if (!allowed.includes(f.column) && !chainAllowed) {
            bad.push(`${gate.id} -> ${table} has no column ${f.column}`)
          }
        }
      }
    }
    expect(bad).toEqual([])
  })

  // TWO QUESTIONS PREDATE THE RULE. Decision Point 1 has two prompts that each
  // ask for two things at once, so the room can only ever send one of each.
  // They are named here rather than quietly allowed: the rule holds for every
  // other question, and these two are on the list to be split, which changes a
  // session Habib is currently running and so is not done in passing.
  const KNOWN_DOUBLE = [
    'Name one service this organisation delivers today',
    'What does this service cost us that the budget does not show?',
  ]

  it('gives every person one thing to answer, never two', () => {
    // The rule that cost most of a week: one variable per question, so the
    // room can send three of something instead of one.
    const doubles: string[] = []
    for (const gate of GATES) {
      for (const seed of startingQuestionSet(gate.id)) {
        if (seed.target_fields.length > 1) doubles.push(seed.question_text)
      }
    }
    const unexpected = doubles.filter((t) => !KNOWN_DOUBLE.some((k) => t.startsWith(k)))
    expect(unexpected).toEqual([])
    // And the known two have not quietly multiplied.
    expect(doubles.length).toBe(KNOWN_DOUBLE.length)
  })

  it('gives a question that offers choices some choices to offer', () => {
    for (const gate of GATES) {
      for (const seed of startingQuestionSet(gate.id)) {
        if (seed.question_type === 'classify') {
          expect(seed.options.length, seed.question_text.slice(0, 50)).toBeGreaterThan(1)
        }
      }
    }
  })

  it('gives every scored question a scale that runs the right way', () => {
    for (const gate of GATES) {
      for (const seed of startingQuestionSet(gate.id)) {
        if (seed.question_type === 'score') {
          expect(seed.scale_max, seed.question_text.slice(0, 50)).toBeGreaterThan(seed.scale_min)
        }
      }
    }
  })
})

// ============================================================
// AN ANSWER MUST LAND IN THE BLOCK IT WAS AGREED IN
//
// From the review on #281. ACCEPT_TARGETS is keyed by column name alone, so it
// matched any block that happened to use one of those words. Decision Point 3
// has a column genuinely called "problem" on its propositions table, and the
// new prompt for it would have been filed as a Phase 0 problem, on
// gtcv_problem_owner_budget, in another block entirely. The room would have
// answered, the facilitator would have pressed Accept, and the proposition
// would have stayed empty while a row appeared somewhere nobody was looking.
//
// These run planAccept itself rather than reading the file, because the whole
// fault was that the code and the words about it disagreed.
// ============================================================
describe('where an accepted answer actually goes', () => {
  const anchor = { serviceId: 'svc_1', problemId: 'prb_1', activityId: null }

  it('files a Decision Point 3 problem on the propositions table', () => {
    const plan = planAccept(['problem'], anchor, 'gtcv_propositions')
    expect(plan).toEqual({ mode: 'createRow', table: 'gtcv_propositions' })
  })

  it('still builds the Phase 0 chain, which is what the chain is for', () => {
    const plan = planAccept(['problem'], anchor, 'gtcv_assumptions')
    expect(plan).toMatchObject({ mode: 'createProblem', table: 'gtcv_problem_owner_budget' })
  })

  it('does not route an activity out of a block that is not in the chain', () => {
    const plan = planAccept(['activity'], anchor, 'gtcv_channel_logic')
    expect(plan).toEqual({ mode: 'createRow', table: 'gtcv_channel_logic' })
  })

  it('says what to do when the block files nothing as a row', () => {
    const plan = planAccept(['segment_name'], anchor, null)
    expect(plan).toEqual({ refusal: NOT_FILED_HERE })
    // And the wording suits an answer in words as well as a score, because
    // the pre-engagement questions are answered in sentences.
    expect(NOT_FILED_HERE).toContain('Record what the room agrees')
    expect(NOT_FILED_HERE).not.toContain('the score the room agrees')
  })
})

// ============================================================
// AN ANSWER THE DATABASE WILL REFUSE IS AN ANSWER THROWN AWAY
//
// From the review on #282. Three of the columns these prompts write into
// accept only a short list of words: the adoption test is yes, no or unsure,
// a cost has one of five categories, a pipeline row has one of five stages,
// and a scale route is entry, scale or both. I wrote prompts that asked for
// sentences, or offered options in prettier words than the table allows.
//
// What that costs is worse than an error: the room answers, the facilitator
// presses Accept, the write is refused, and nobody is told. The session's work
// is gone and everybody watched it happen.
//
// So this reads the real constraints out of the migrations, table by table,
// and holds every prompt to them.
// ============================================================
describe('every prompt sends a value its column will accept', () => {
  /** The text columns of every table, with the words each one is limited to. */
  const tables: Record<string, Record<string, string[] | null>> = {}
  {
    const sql = fs.readdirSync('supabase/migrations')
      .filter((f) => f.endsWith('.sql')).sort()
      .map((f) => fs.readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n')
    for (const m of sql.matchAll(/create table if not exists (?:public\.)?([a-z_]+)\s*\(([\s\S]*?)\n\);/g)) {
      const cols: Record<string, string[] | null> = {}
      for (const line of m[2].split('\n')) {
        const c = /^\s*([a-z_]+)\s+text\b(.*)$/.exec(line)
        if (!c) continue
        // Both shapes the schema uses: "check (x in (...))" and
        // "check (x is null or x in (...))".
        const k = /\bin\s*\(([^)]*)\)/.exec(c[2])
        cols[c[1]] = k ? k[1].split(',').map((x) => x.trim().replace(/'/g, '')) : null
      }
      tables[m[1]] = cols
    }
  }

  /** Which table each block's accepted answers land in. */
  const blockTable: Record<string, string> = {}
  {
    const route = fs.readFileSync('app/api/facilitate/route.ts', 'utf8')
    const start = route.indexOf('const BLOCK_TABLE')
    const body = route.slice(start, route.indexOf('}', start))
    for (const m of body.matchAll(/(\w+):\s*'([^']+)'/g)) blockTable[m[1]] = m[2]
  }

  it('read the real schema, rather than testing against nothing', () => {
    expect(Object.keys(tables).length).toBeGreaterThan(40)
    // And it found at least one genuinely constrained column, so the checks
    // below are not all passing because every column looks unconstrained.
    expect(tables['gtcv_customer_segments']?.willing).toEqual(['yes', 'no', 'unsure'])
  })

  it('never asks for a sentence where the column takes one of a few words', () => {
    const bad: string[] = []
    for (const gate of GATES) {
      for (const seed of startingQuestionSet(gate.id)) {
        for (const f of seed.target_fields) {
          const allowed = tables[blockTable[gate.id]]?.[f.column]
          if (!allowed) continue
          if (seed.question_type !== 'classify') {
            bad.push(`${gate.id}.${f.column} takes only ${allowed.join('/')} but is asked as ${seed.question_type}`)
          }
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('never offers the room a choice the column would refuse', () => {
    const bad: string[] = []
    for (const gate of GATES) {
      for (const seed of startingQuestionSet(gate.id)) {
        for (const f of seed.target_fields) {
          const allowed = tables[blockTable[gate.id]]?.[f.column]
          if (!allowed) continue
          for (const o of seed.options) {
            if (!allowed.includes(o)) bad.push(`${gate.id}.${f.column} offers "${o}", allowed ${allowed.join('/')}`)
          }
        }
      }
    }
    expect(bad).toEqual([])
  })
})
