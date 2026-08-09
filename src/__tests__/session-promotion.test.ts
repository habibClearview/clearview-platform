// ============================================================
// A sentence goes to one place, whole, and nothing else is invented.
//
// The risk this guards is not that the feature fails loudly. It is that it
// succeeds quietly into the wrong table, or arrives with a score or a decision
// nobody made, which then reads exactly like a record of what the room decided.
// ============================================================

import { describe, expect, it } from 'vitest'
import { GATE_IDS } from '@/lib/gtcv-gates'
import {
  PROMOTION_TABLES,
  PROMOTION_TARGETS,
  promotionRow,
  promotionTargetFor,
} from '@/lib/session-promotion'

describe('turning what the room said into a row', () => {
  it('only names blocks that exist', () => {
    for (const dpId of Object.keys(PROMOTION_TARGETS)) {
      expect(GATE_IDS, dpId).toContain(dpId)
    }
  })

  it('leaves the four blocks with no home for a sentence alone', () => {
    // Named one by one on purpose. Adding a target for any of these should be
    // a decision somebody makes, not something that arrives with a refactor.
    for (const dpId of ['setup', 'dp04', 'dp05', 'dp09', 'handover']) {
      expect(promotionTargetFor(dpId), dpId).toBe(null)
    }
  })

  it('answers null for anything that is not a block', () => {
    expect(promotionTargetFor(null)).toBe(null)
    expect(promotionTargetFor(undefined)).toBe(null)
    expect(promotionTargetFor('')).toBe(null)
    expect(promotionTargetFor('gtcv_service_inventory')).toBe(null)
    expect(promotionTargetFor('__proto__')).toBe(null)
  })

  it('writes the engagement and the sentence, and nothing else at all', () => {
    const target = promotionTargetFor('dp02')!
    const row = promotionRow(target, 'client-somebody', 'They said the fee is decided by the district office.')
    expect(Object.keys(row).sort()).toEqual(['client_id', 'problem_in_their_words'])
    expect(row.client_id).toBe('client-somebody')
  })

  it('carries the sentence across unedited, whitespace and all', () => {
    const said = '  We do the demo plots because the donor asked for them.\nNobody has ever paid for one.  '
    for (const dpId of Object.keys(PROMOTION_TARGETS)) {
      const target = promotionTargetFor(dpId)!
      expect(promotionRow(target, 'c', said)[target.column], dpId).toBe(said)
    }
  })

  it('never invents a score, a decision or a name', () => {
    const invented = [
      'decision', 'status', 'viability', 'urgency', 'problem_urgency', 'segment_name',
      'partner_name', 'service_name_confirmed', 'close_type', 'classification', 'stage',
    ]
    for (const dpId of Object.keys(PROMOTION_TARGETS)) {
      const target = promotionTargetFor(dpId)!
      const row = promotionRow(target, 'c', 'anything')
      for (const field of invented) {
        // service_name is dp01's own target, so it is the sentence, not a guess.
        if (field === target.column) continue
        expect(row, `${dpId}.${field}`).not.toHaveProperty(field)
      }
    }
  })

  it('lists every table it can touch, with no duplicates', () => {
    expect(new Set(PROMOTION_TABLES).size).toBe(PROMOTION_TABLES.length)
    for (const target of Object.values(PROMOTION_TARGETS)) {
      expect(PROMOTION_TABLES).toContain(target.table)
    }
  })

  it('only ever touches gtcv working tables', () => {
    // The route trusts this list to decide what it may write to, so a name
    // reaching it that is not a working table would be the whole hole.
    for (const table of PROMOTION_TABLES) {
      expect(table, table).toMatch(/^gtcv_[a-z_]+$/)
    }
  })

  it('describes each target in words a coach can act on', () => {
    for (const [dpId, target] of Object.entries(PROMOTION_TARGETS)) {
      expect(target.describes.length, dpId).toBeGreaterThan(8)
      // Not the table name dressed up as English.
      expect(target.describes, dpId).not.toContain('gtcv_')
    }
  })
})
