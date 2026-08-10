// ============================================================
// BRINGING THE PROBLEMS ACROSS FROM THE SEGMENTS
//
// WHY THIS EXISTS. DP02 works through two tables in order. The first names the
// customer segments and writes down the problem in the customer's own words.
// The second scores those problems on urgency, ownership, willingness to pay
// and access.
//
// The second table used to open with an "Add problem" button that made a blank
// row, so the team retyped a problem they had written minutes earlier, one
// table up, and usually not in the same words. That is friction the platform
// exists to remove, and it costs more than time: the whole point of the first
// table is that the wording is the customer's, and a retyped problem is the
// consultant's paraphrase of it.
//
// WHAT THIS DECIDES. Which segments are waiting to be scored: those with a
// problem written down and no scored row pointing at them yet. That is the
// list the screen offers to bring across.
//
// IT DOES NOT DEDUPLICATE BY WORDING. Two segments can feel the same problem
// and each deserves its own score, because urgency and access differ by
// segment even when the sentence does not. The match is on the segment, never
// on the text.
// ============================================================

export interface SegmentRow {
  id: string
  segment_name?: string | null
  problem_in_their_words?: string | null
}

export interface ScoreRow {
  segment_id?: string | null
}

/** A segment ready to be scored, with the words to carry over. */
export interface CarryOver {
  segmentId: string
  segmentName: string
  problem: string
}

/**
 * The segments whose problem has been written down but not yet scored, in the
 * order the segments are held.
 *
 * A segment with no problem written is left out: there is nothing to carry,
 * and offering it would put another blank row on the screen, which is the
 * thing being removed.
 */
export function segmentsAwaitingScore(
  segments: SegmentRow[],
  scores: ScoreRow[],
): CarryOver[] {
  const alreadyScored = new Set(
    scores.map((s) => s.segment_id).filter((id): id is string => Boolean(id)),
  )
  const out: CarryOver[] = []
  for (const segment of segments) {
    if (alreadyScored.has(segment.id)) continue
    const problem = (segment.problem_in_their_words || '').trim()
    if (!problem) continue
    out.push({
      segmentId: segment.id,
      segmentName: (segment.segment_name || '').trim() || 'Unnamed segment',
      problem,
    })
  }
  return out
}

/**
 * The row to write when a problem is carried across. The wording and the
 * segment travel together, so the scored problem says what the customer said
 * and stays attached to who said it.
 */
export function carriedRow(carry: CarryOver, clientId: string, sortOrder: number) {
  return {
    client_id: clientId,
    segment_id: carry.segmentId,
    segment_label: carry.segmentName,
    problem_statement: carry.problem,
    sort_order: sortOrder,
  }
}
