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
 */
export function problemsOutsideHierarchy(problems: Problem[], activities: Activity[]): Problem[] {
  const activityById = new Map(activities.map((a) => [a.id, a]))
  return problems.filter((p) => {
    if (p.parked_at) return true
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
