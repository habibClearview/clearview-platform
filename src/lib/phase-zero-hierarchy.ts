// ============================================================
// THE HIERARCHY ON SCREEN  (C26 as replaced 12 August 2026, and C28 as amended)
//
// C26's replacement, in its own words: "Every tool displays a HIERARCHY on
// screen, not labels on rows. The service is anchored at the top, ALONE, as the
// frame, and is never a cell in a row. Beneath it sits every activity in that
// service, each as its own row or group; a service commonly has ten or more.
// Beneath each activity sit the problems that activity solves; one activity may
// solve several problems, or none. THERE IS NO COMBINED 'SERVICE AND ACTIVITY'
// COLUMN ANYWHERE."
//
// What was built before the replacement arrived was exactly the fault it names:
// a first column headed "Service and activity" on every Tool 2 row. This file
// is the shape that replaces it, with no React and no database, so the shape
// can be tested without standing anything up.
//
// C26 OVERRULES C23, AND THIS IS DELIBERATE. C23 said an activity with no
// stated problem is ABSENT from Tool 2, and service-anchor.ts still holds that
// rule as activitiesForToolTwo. The C26 replacement's own test contradicts it:
// "a service with three activities; the first has two problems, the second one,
// the third none ... and the third showing no problems." An activity that is
// absent cannot be shown showing no problems. The replacement is the later and
// more specific instruction and it carries its own test, so it wins here, and
// the third activity appears carrying C22's exact words, 'No problem stated'.
// activitiesForToolTwo is left untouched for anything else that reads it.
// ============================================================
import {
  NO_PROBLEM_STATED,
  problemsOfActivity,
  type Activity,
  type Problem,
  type Service,
} from '@/lib/service-anchor'

export { NO_PROBLEM_STATED }

/** One activity with the problems hanging off it, in order. */
export interface ActivityBranch {
  activity: Activity
  problems: Problem[]
  /** C22. True where nothing has been stated under it yet. */
  noProblemStated: boolean
}

/**
 * The whole of what one tool draws: a service at the top, ALONE, and its
 * activities beneath it.
 *
 * The service is carried here as the frame, not as a value to put in a cell.
 * Nothing in this shape offers a "service and activity" pair, because there is
 * no such thing to offer.
 */
export interface ServiceHierarchy {
  service: Service | null
  branches: ActivityBranch[]
  /** Every problem under the service, flattened. Used for counts, never for rows. */
  problemCount: number
}

/**
 * C26. The hierarchy for one service.
 *
 * EVERY activity of the service, including one with no problems stated. Ten or
 * more is normal, so nothing here caps or samples the list.
 */
export function hierarchyForService(
  service: Service | null,
  activities: Activity[],
  problems: Problem[],
): ServiceHierarchy {
  if (!service) return { service: null, branches: [], problemCount: 0 }
  const mine = activities.filter((a) => a.service_id === service.id && !a.parked_at)
  const branches: ActivityBranch[] = mine.map((activity) => {
    const own = problemsOfActivity(activity.id, problems)
    // A problem row with no words in it is not a stated problem. C22's state is
    // about what the room has SAID, not about how many rows exist.
    const stated = own.filter((p) => (p.problem || '').trim().length > 0)
    return { activity, problems: own, noProblemStated: stated.length === 0 }
  })
  return {
    service,
    branches,
    problemCount: branches.reduce((n, b) => n + b.problems.length, 0),
  }
}

// ------------------------------------------------------------
// C28 AS AMENDED, 12 August 2026
//
// "Do NOT hide unassigned rows. Tools 3 to 5 show the anchored service and its
// rows, and any row with no service appears in the Parked area exactly as
// Tools 1 and 2 already do. Nothing disappears for lack of a service."
//
// This is the amendment that matters most on a live engagement. No row has a
// service yet on most of them, so a filter that showed only the anchored
// service's rows would have shown an EMPTY SCREEN to a room mid-session, and
// the fault would have looked like lost data rather than a filter.
// ------------------------------------------------------------

/** A row of Tool 3, 4 or 5: anything carrying a service and a park. */
export interface AnchorableRow {
  id: string
  service_id?: string | null
  parked_at?: string | null
}

export interface SplitRows<T> {
  /** Rows belonging to the anchored service, not parked. */
  anchored: T[]
  /**
   * Rows with NO service, or parked. These are shown in the Parked area and are
   * never hidden: C28's whole point is that nothing disappears for lack of a
   * service.
   */
  parked: T[]
  /** Rows belonging to a DIFFERENT service. These are the only rows not drawn. */
  elsewhere: T[]
}

/**
 * C28. Which rows this tool draws, and where.
 *
 * Three buckets, not two, because "not this service" and "no service at all"
 * are different facts and only one of them means the row has nowhere to live.
 * A row under another service is not lost — switching the anchor shows it — so
 * it is the only thing that leaves the screen.
 */
export function splitRowsByService<T extends AnchorableRow>(
  rows: T[],
  serviceId: string | null,
): SplitRows<T> {
  const anchored: T[] = []
  const parked: T[] = []
  const elsewhere: T[] = []
  for (const row of rows) {
    if (row.parked_at || !row.service_id) { parked.push(row); continue }
    if (serviceId && row.service_id === serviceId) { anchored.push(row); continue }
    if (!serviceId) { parked.push(row); continue }
    elsewhere.push(row)
  }
  return { anchored, parked, elsewhere }
}

// ------------------------------------------------------------
// C26. WHAT A HYPOTHESIS IS BUILT FROM
//
// "A hypothesis is: this service, made up of these specific activities, solves
// this problem or set of problems, for this type of client."
// ------------------------------------------------------------

/** One row of gtcv_hypothesis_sources. */
export interface HypothesisSource {
  id: string
  hypothesis_id: string
  activity_id: string | null
  problem_id: string | null
}

export interface HypothesisBuild {
  activities: Activity[]
  problems: Problem[]
}

/**
 * The activities and problems one hypothesis is built from.
 *
 * A named problem BRINGS ITS ACTIVITY with it, without the link having to say
 * so twice. A problem already knows its parent, and a screen that showed a
 * problem under no activity would be showing the hierarchy broken.
 *
 * Anything named but no longer present is simply absent rather than shown as a
 * gap: the cascade removes the link at the same moment, so a dangling name here
 * would mean the database disagreed with itself.
 */
export function hypothesisBuild(
  hypothesisId: string,
  sources: HypothesisSource[],
  activities: Activity[],
  problems: Problem[],
): HypothesisBuild {
  const mine = sources.filter((s) => s.hypothesis_id === hypothesisId)
  const problemIds = new Set(mine.map((s) => s.problem_id).filter(Boolean) as string[])
  const namedProblems = problems.filter((p) => problemIds.has(p.id))

  const activityIds = new Set(mine.map((s) => s.activity_id).filter(Boolean) as string[])
  // The activity of every named problem counts as named too.
  for (const p of namedProblems) if (p.activity_id) activityIds.add(p.activity_id)

  return {
    activities: activities.filter((a) => activityIds.has(a.id)),
    problems: namedProblems,
  }
}

/**
 * EVERY PROBLEM THE HIERARCHY CANNOT DRAW. Nothing may be invisible.
 *
 * A parked problem used to appear in NO list anywhere. problemsOfActivity drops
 * it, the hierarchy never reaches it, and the anchor bar's bucket holds only
 * activities — so a problem parked with the × could not be found, edited or
 * restored by anybody, and the work was gone in every way that matters to a
 * room. Three kinds belong in the Parked area:
 *
 *   parked      parked_at is set
 *   orphaned    its activity no longer exists
 *   stranded    its activity has no service, or is itself parked, so the
 *               activity is drawn under no service and its problems went with it
 *
 * A problem under an activity of ANOTHER service is deliberately NOT here.
 * Switching the anchor shows it, so it is already reachable, and listing it as
 * parked would say something untrue about it.
 *
 * 15 AUGUST 2026. THE PARENT IS THE SERVICE NOW.
 *
 * This asked one question — does it hang from a live activity — and on
 * 14 August the problem stopped hanging from an activity at all. So every
 * problem stated the new way, correctly filed under a service, was reported as
 * "not attached to an activity" and shown in Parked. Correct work, in the bin
 * marked broken, which is the third time this shape of mistake has cost a
 * round.
 *
 * A problem with a live service is IN the hierarchy, whether or not any
 * activity solves it yet — that is the ordinary state between Tool 1's first
 * question and its second. The activity rule is kept for problems written
 * before the migration, which have an activity and no service.
 */
export function problemsOutsideHierarchy(
  problems: Problem[],
  activities: Activity[],
  services: { id: string; parked_at?: string | null }[] = [],
): Problem[] {
  const activityById = new Map(activities.map((a) => [a.id, a]))
  const liveService = new Set(services.filter((s) => !s.parked_at).map((s) => s.id))
  return problems.filter((p) => {
    if (p.parked_at) return true
    // The service is the parent. Where one is named, it decides on its own.
    if (p.service_id) return services.length > 0 && !liveService.has(p.service_id)
    const parent = p.activity_id ? activityById.get(p.activity_id) : null
    if (!parent) return true
    return Boolean(parent.parked_at) || !parent.service_id
  })
}

/** What to call an activity on screen when it has no name yet. */
export function activityLabel(a: Activity): string {
  return (a.activity || '').trim() || 'Unnamed activity'
}

/** What to call a problem on screen. C22's words where nothing was stated. */
export function problemLabel(p: Problem): string {
  return (p.problem || '').trim() || NO_PROBLEM_STATED
}


/**
 * THE ORDER TOOL 1'S ONE FLAT TABLE IS DRAWN IN.
 *
 * The service name is written once per group, and "once" is decided by
 * comparing each row with the one above it — so it is only correct if the rows
 * of one service are ADJACENT. That is this function's whole job, and it is
 * here rather than inside the component so it can be proved without standing a
 * screen up.
 *
 * 15 August 2026. It used to rank a row by looking its service up in a list
 * loaded by a DIFFERENT request. Until that request landed every row scored the
 * same, the sort fell through to the problem, two services interleaved, and the
 * name repeated on every row — then it all re-sorted a moment later. Adjacency
 * now comes from the rows themselves; the other list only refines the order the
 * groups appear in.
 */
export function orderActivitiesForTable<
  T extends { service_id?: string | null; problem_id?: string | null; sort_order?: number | null },
>(rows: T[], services: { id: string }[] = []): T[] {
  const known = new Map(services.map((s, i) => [s.id, i]))
  const seen = new Map<string, number>()
  rows.forEach((a) => {
    const key = a.service_id || ''
    if (!seen.has(key)) seen.set(key, seen.size)
  })
  const rank = (id: string | null | undefined) => {
    if (!id) return 1e9
    return known.has(id) ? (known.get(id) as number) : 1e6 + (seen.get(id) ?? 0)
  }
  return rows.slice().sort((a, b) => {
    const sa = rank(a.service_id)
    const sb = rank(b.service_id)
    if (sa !== sb) return sa - sb
    if ((a.service_id || '') !== (b.service_id || '')) {
      return (a.service_id || '') < (b.service_id || '') ? -1 : 1
    }
    const pa = a.problem_id || ''
    const pb = b.problem_id || ''
    if (pa !== pb) return pa < pb ? -1 : 1
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  })
}

// ============================================================
// TOOL 1's ROWS.  15 August 2026.
//
// THE FAULT THIS REPLACES, and it is the one that made Accept look broken:
// the table's rows WERE THE ACTIVITIES. So a problem with no activity under it
// had no row anywhere, and since Tool 1's first question makes exactly that —
// a problem, stated before any activity exists — accepting an answer wrote a
// correct row into the database that the table could not draw. From the
// outside: "I press Accept and nothing appears."
//
// The model is service -> problems -> activities, and the table has to be the
// model. A row is one ACTIVITY, but a problem with none still gets a row of its
// own, so what the room has stated is always on the screen and always has
// somewhere to add the activity that solves it.
//
// Everything is drawn. A service with nothing under it gets one row, so it can
// be added to. Activities under a service but under no problem keep their rows
// in a group of their own — they are real work stated before anybody named the
// problem, and dropping them is how a room stops trusting the screen.
// ============================================================

/**
 * A row the facilitator has asked for but not yet typed into.
 *
 * 15 August 2026. "+ add" used to INSERT a row and leave it blank until
 * somebody typed. Nine of those accumulated on one engagement in a morning,
 * they crowded the room's real answers off the screen, and the rule written to
 * clean them up — delete a blank row when focus leaves it — made adding a
 * second one impossible.
 *
 * A draft is the same row on screen with nothing written anywhere. Type into
 * it and it becomes real; leave it and it was never anything. There is no
 * clean-up rule because there is nothing to clean up.
 */
export interface Tool1Draft {
  key: string
  serviceId: string | null
  /** Set on a draft activity: the problem it will solve. Null on a draft problem. */
  problemId: string | null
  kind: 'activity' | 'problem' | 'service'
}

export interface Tool1Row {
  key: string
  serviceId: string | null
  /** True on the first row of a service, which is where the name is written. */
  firstOfService: boolean
  /** True on the last row of a service, which is where "+ add a problem" sits. */
  lastOfService: boolean
  problemId: string | null
  /** True on the first row of a problem, which is where the problem is written. */
  firstOfProblem: boolean
  /** True on the last row of a problem, where "+ add an activity" sits. */
  lastOfProblem: boolean
  /** The activity this row draws, or null where the problem has none yet. */
  activityId: string | null
  /** Set where this row is a draft: nothing is written until it is typed into. */
  draft: Tool1Draft | null
}

interface RowActivity { id: string; service_id?: string | null; problem_id?: string | null; parked_at?: string | null; sort_order?: number | null }
interface RowProblem { id: string; service_id?: string | null; parked_at?: string | null; sort_order?: number | null }

const bySort = <T extends { sort_order?: number | null }>(a: T, b: T) => (a.sort_order ?? 0) - (b.sort_order ?? 0)

export function buildTool1Rows(
  services: { id: string; parked_at?: string | null; sort_order?: number | null }[],
  problems: RowProblem[],
  activities: RowActivity[],
  drafts: Tool1Draft[] = [],
): Tool1Row[] {
  const live = services.filter((s) => !s.parked_at).slice().sort(bySort)
  const liveProblems = problems.filter((p) => !p.parked_at)
  const liveActivities = activities.filter((a) => !a.parked_at)
  const out: Tool1Row[] = []

  const pushGroup = (serviceId: string | null, problemId: string | null, acts: RowActivity[]) => {
    if (acts.length === 0) {
      out.push({
        key: `${serviceId || 'none'}:${problemId || 'none'}:empty`,
        serviceId, firstOfService: false, lastOfService: false,
        problemId, firstOfProblem: true, lastOfProblem: true, activityId: null,
        draft: null,
      })
    } else {
      acts.forEach((a, i) => out.push({
        key: a.id,
        serviceId, firstOfService: false, lastOfService: false,
        problemId, firstOfProblem: i === 0, lastOfProblem: i === acts.length - 1,
        activityId: a.id, draft: null,
      }))
    }
    // Activity drafts sit at the end of the problem they will solve.
    const mine = drafts.filter((d) => d.kind === 'activity' && d.problemId === problemId)
    mine.forEach((d) => out.push({
      key: d.key,
      serviceId, firstOfService: false, lastOfService: false,
      problemId, firstOfProblem: false, lastOfProblem: false,
      activityId: null, draft: d,
    }))
    if (out.length > 0) {
      // Whichever row ended up last carries the "+ add another activity".
      const last = out[out.length - 1]
      if (last.problemId === problemId) last.lastOfProblem = true
      if (mine.length > 0) {
        for (const r of out) {
          if (r.problemId === problemId && r !== last) r.lastOfProblem = false
        }
      }
    }
  }

  const drawService = (serviceId: string | null) => {
    const startedAt = out.length
    const mine = liveProblems.filter((p) => (p.service_id || null) === serviceId).slice().sort(bySort)
    const ofService = liveActivities.filter((a) => (a.service_id || null) === serviceId)
    for (const p of mine) {
      pushGroup(serviceId, p.id, ofService.filter((a) => a.problem_id === p.id).slice().sort(bySort))
    }
    // Activities stated before anybody named the problem. Present, in a group of
    // their own, never dropped.
    const loose = ofService.filter((a) => !a.problem_id || !mine.some((p) => p.id === a.problem_id))
    if (loose.length > 0) pushGroup(serviceId, null, loose.slice().sort(bySort))
    // Problem drafts: a group of their own, at the end of the service.
    drafts
      .filter((d) => d.kind === 'problem' && d.serviceId === serviceId)
      .forEach((d) => out.push({
        key: d.key,
        serviceId, firstOfService: false, lastOfService: false,
        problemId: null, firstOfProblem: true, lastOfProblem: true,
        activityId: null, draft: d,
      }))
    // A service with nothing at all still needs one row to be seen and added to.
    if (out.length === startedAt) pushGroup(serviceId, null, [])
    out[startedAt].firstOfService = true
    out[out.length - 1].lastOfService = true
  }

  live.forEach((s) => drawService(s.id))
  // A service being named. Nothing is written until it has a name, so pressing
  // "+ add a service" three times and walking away leaves nothing behind — which
  // is where three unnamed services came from.
  drafts.filter((d) => d.kind === 'service').forEach((d) => out.push({
    key: d.key,
    serviceId: null, firstOfService: true, lastOfService: true,
    problemId: null, firstOfProblem: true, lastOfProblem: true,
    activityId: null, draft: d,
  }))
  // ─────────────────────────────────────────────────────────────
  // NO ROW WITHOUT A SERVICE. 2 September 2026.
  //
  // Rows with no service were drawn here so that nothing on the engagement
  // could be invisible. On screen that meant a run of rows reading "Not in a
  // service", "Name a service first", "Name an activity first" across every
  // column — rows that cannot be worked on, cannot be filled in, and say the
  // same thing five times. Habib's words: that should not be, especially since
  // there should be nothing in the other columns unless there is a service.
  //
  // They are still not invisible. The Parked area above the table lists every
  // one of them and is the ONE place they can be pulled into a service, which
  // is the only thing that can usefully be done with them. Showing them twice,
  // once where they can be fixed and once where they cannot, is what made the
  // table look broken.
  // ─────────────────────────────────────────────────────────────
  return out
}
