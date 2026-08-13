// ============================================================
// THE FIELDS THAT HOLD MORE THAN ONE VALUE  (T1.21, T1.22)
//
// "On one activity, add a second value to who pays, a second to what it
// delivers, a second to the assumption underneath, and a second to what would
// prove it wrong. See: each field holding both values. The activity is still
// one activity."
//
// Four fields, and they are four because a room genuinely has more than one
// answer to each: two funders pay for the same activity, an activity delivers
// two things, and there is rarely one assumption underneath anything.
//
// THE FALLBACK MATTERS. Until the migration has run there are no value rows at
// all, and the four original columns still hold what was typed. So a field with
// no rows reads its column instead, and Tool 1 shows what it always showed. No
// screen goes blank waiting for a migration.
// ============================================================

/** The four fields, and the headings T1.23 says must not be renamed. */
export const VALUE_FIELDS = [
  { key: 'delivers', heading: 'What it delivers', placeholder: 'What it actually delivers' },
  { key: 'who_pays', heading: 'Who pays', placeholder: 'Who pays for it now' },
  { key: 'assumption', heading: 'Assumption underneath', placeholder: 'What has to be true' },
  { key: 'disproof', heading: 'What would prove it wrong', placeholder: 'Evidence that would kill it' },
] as const

export type ValueField = (typeof VALUE_FIELDS)[number]['key']

export const VALUE_FIELD_KEYS: ValueField[] = VALUE_FIELDS.map((f) => f.key)

/** One row of gtcv_activity_values. */
export interface ActivityValue {
  id: string
  activity_id: string
  field: string
  value: string | null
  sort_order: number | null
}

/** An activity, as far as this module cares: the four legacy columns. */
export interface ActivityColumns {
  id: string
  delivers?: string | null
  who_pays?: string | null
  assumption?: string | null
  disproof?: string | null
}

/** One value on screen. A legacy one has no id, because it has no row yet. */
export interface ShownValue {
  /** Null where this came from the original column rather than a value row. */
  id: string | null
  value: string
}

/**
 * What one field of one activity shows.
 *
 * Value rows win where there are any. Where there are none, the original column
 * stands in, so nothing typed before the migration disappears and nothing is
 * shown twice.
 */
export function valuesFor(
  activity: ActivityColumns,
  field: ValueField,
  values: ActivityValue[],
): ShownValue[] {
  const rows = values
    .filter((v) => v.activity_id === activity.id && v.field === field)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  if (rows.length > 0) {
    return rows.map((r) => ({ id: r.id, value: r.value || '' }))
  }
  const legacy = (activity[field] || '').trim()
  return legacy ? [{ id: null, value: legacy }] : []
}

/**
 * Whether this field can still be added to from the ORIGINAL column only.
 *
 * The first press of "+ another" on a field that has never had a value row has
 * to carry the column's text across first, or the existing answer would sit
 * beneath a new empty box and then be overwritten by the mirror-back. This
 * reports that the carry-across is needed.
 */
export function needsCarryAcross(
  activity: ActivityColumns,
  field: ValueField,
  values: ActivityValue[],
): boolean {
  const hasRows = values.some((v) => v.activity_id === activity.id && v.field === field)
  return !hasRows && (activity[field] || '').trim().length > 0
}

/** How many values a field is holding, for a count on screen. */
export function valueCount(
  activity: ActivityColumns,
  field: ValueField,
  values: ActivityValue[],
): number {
  return valuesFor(activity, field, values).length
}
