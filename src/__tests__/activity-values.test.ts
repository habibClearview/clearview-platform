// ============================================================
// T1.21 AND T1.22. MORE THAN ONE VALUE, AND REMOVING ONE OF THEM
//
// T1.21 fails if any of the four fields takes only one value.
// T1.22 fails if removing one value clears the whole field.
// Both are asserted here, along with the fallback that keeps the screen
// working before the migration has run.
// ============================================================
import { describe, expect, it } from 'vitest'
import {
  needsCarryAcross,
  valueCount,
  valuesFor,
  VALUE_FIELDS,
  VALUE_FIELD_KEYS,
  type ActivityValue,
} from '@/lib/activity-values'

const activity = {
  id: 'a1',
  delivers: 'Training days',
  who_pays: 'The programme',
  assumption: 'Facilitators stay',
  disproof: 'Half leave in a year',
}

const val = (id: string, field: string, value: string, sort_order = 0): ActivityValue =>
  ({ id, activity_id: 'a1', field, value, sort_order })

describe('T1.21. each of the four fields holds more than one value', () => {
  it('covers exactly the four fields, with their headings unchanged', () => {
    expect(VALUE_FIELD_KEYS).toEqual(['delivers', 'who_pays', 'assumption', 'disproof'])
    expect(VALUE_FIELDS.map((f) => f.heading)).toEqual([
      'What it delivers', 'Who pays', 'Assumption underneath', 'What would prove it wrong',
    ])
  })

  it('holds two values on one field, on one activity', () => {
    const values = [val('v1', 'who_pays', 'The programme', 0), val('v2', 'who_pays', 'The ministry', 1)]
    const shown = valuesFor(activity, 'who_pays', values)
    expect(shown.map((s) => s.value)).toEqual(['The programme', 'The ministry'])
  })

  it('holds several on every one of the four at once', () => {
    const values = VALUE_FIELD_KEYS.flatMap((f, i) => [
      val(`${f}-1`, f, `${f} first`, 0),
      val(`${f}-2`, f, `${f} second`, 1),
    ])
    for (const f of VALUE_FIELD_KEYS) {
      expect(valueCount(activity, f, values)).toBe(2)
    }
  })

  it('keeps them in the order they were added', () => {
    const values = [val('v2', 'delivers', 'Second', 1), val('v1', 'delivers', 'First', 0)]
    expect(valuesFor(activity, 'delivers', values).map((s) => s.value)).toEqual(['First', 'Second'])
  })

  it('does not let one field\'s values leak into another', () => {
    const values = [val('v1', 'who_pays', 'The programme', 0)]
    expect(valuesFor(activity, 'assumption', values).map((s) => s.value)).toEqual(['Facilitators stay'])
  })

  it('does not let one activity\'s values leak onto another', () => {
    const values = [{ ...val('v1', 'who_pays', 'Someone else', 0), activity_id: 'a2' }]
    expect(valuesFor(activity, 'who_pays', values).map((s) => s.value)).toEqual(['The programme'])
  })
})

describe('T1.22. removing one value leaves the rest alone', () => {
  it('leaves the first value untouched when the second is gone', () => {
    const before = [val('v1', 'who_pays', 'The programme', 0), val('v2', 'who_pays', 'The ministry', 1)]
    const after = before.filter((v) => v.id !== 'v2')
    expect(valuesFor(activity, 'who_pays', after).map((s) => s.value)).toEqual(['The programme'])
  })

  it('removing the FIRST leaves the second, rather than shifting the wrong one out', () => {
    // Each value carries its own identity, so "remove the second" is never an
    // index calculation against a list two people are editing at once.
    const before = [val('v1', 'who_pays', 'The programme', 0), val('v2', 'who_pays', 'The ministry', 1)]
    const after = before.filter((v) => v.id !== 'v1')
    expect(valuesFor(activity, 'who_pays', after).map((s) => s.value)).toEqual(['The ministry'])
  })

  it('falls back to the original column once the last row is gone', () => {
    // Not a blank field: the column still holds what the room typed.
    expect(valuesFor(activity, 'who_pays', []).map((s) => s.value)).toEqual(['The programme'])
  })
})

describe('before the migration has run, nothing goes blank', () => {
  it('shows the original column when there are no value rows', () => {
    const shown = valuesFor(activity, 'delivers', [])
    expect(shown).toEqual([{ id: null, value: 'Training days' }])
  })

  it('shows nothing for a field that was never filled in', () => {
    expect(valuesFor({ id: 'a1' }, 'delivers', [])).toEqual([])
  })

  it('does not show the column AND a row for the same field', () => {
    const values = [val('v1', 'delivers', 'Training days', 0)]
    expect(valuesFor(activity, 'delivers', values)).toHaveLength(1)
  })

  it('knows when the column still has to be carried across', () => {
    expect(needsCarryAcross(activity, 'who_pays', [])).toBe(true)
    expect(needsCarryAcross(activity, 'who_pays', [val('v1', 'who_pays', 'x', 0)])).toBe(false)
    expect(needsCarryAcross({ id: 'a1' }, 'who_pays', [])).toBe(false)
  })
})
