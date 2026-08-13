// ============================================================
// THE SERVICE IS THE ANCHOR  (C1 to C19, C22 to C24, C30 to C32)
//
// The rules of the hierarchy, with no React and no database, so the shape of
// the work can be tested without standing anything up.
//
// WHY THIS EXISTS AT ALL, in the correction's own words: "the purpose of this
// zone is to arrive at a set of services, each with a defined set of
// activities, solving a defined set of problems, for a named actor who would
// pay. Without the service present, the room is examining a pile of activities
// and the work cannot reach its conclusion."
//
// So this file is not a display helper. It is the method.
// ============================================================

/** C1. What a service IS, as opposed to what the room decided about it. */
export type ServiceState = 'current' | 'redesigned' | 'new'

/**
 * C29 as amended, 12 August 2026. What the room decided at Tool 5.
 *
 * THE SAME FOUR WORDS AT EVERY LEVEL. The platform already had a decision
 * vocabulary on gtcv_service_inventory.decision, and the instruction was to use
 * it rather than introduce carry, kill and pause as separate words. A platform
 * where an activity is "killed" and a service is "stopped" is one where two
 * words mean one thing, and somebody eventually writes a report that counts
 * them separately.
 *
 * The counter still SAYS killed, paused and carried forward, because those are
 * the words C30 puts on screen and they are the right words for a room. See
 * COUNTER_LABELS: what is displayed and what is stored are different things,
 * and only one of them has to match the rest of the platform.
 */
export type ItemDecision = 'keep' | 'redesign' | 'pause' | 'stop'

/** C30's words for the room, over the four values above. */
export const COUNTER_LABELS = {
  startedWith: 'Activities started with',
  noProblemStated: 'No problem stated',
  killed: 'Killed',
  paused: 'Paused',
  carriedForward: 'Carried forward',
}

/** C12. The three removal actions, and they are three, not one. */
export type RemovalAction = 'delete' | 'move' | 'park'

/**
 * C12. The words on screen, exactly. A single undifferentiated "remove" is
 * named as a failure by C12's own test, because the three do very different
 * things and only one of them is recoverable.
 */
export const REMOVAL_LABELS: Record<RemovalAction, string> = {
  delete: 'Delete',
  move: 'Move to another service',
  park: 'Park',
}

/**
 * C16. Park is what happens when nobody chose.
 *
 * "Delete is never the default." A default that destroys is a default that
 * destroys somebody's work in a live room, at speed, with twenty people
 * watching and no way back.
 */
export const DEFAULT_REMOVAL: RemovalAction = 'park'

/** C13. Deleting asks first, and the question uses the word. */
export function deleteConfirmation(what: string): string {
  return `Delete ${what}? This leaves nothing behind and cannot be undone.`
}

/** C22. The state, and the words for it. Not an empty cell. */
export const NO_PROBLEM_STATED = 'No problem stated'

/**
 * C43, with the addition made on 12 August 2026. What a participant is told
 * when a late answer could not be counted.
 *
 * NEVER FAIL SILENTLY. In Habib's words: "A person who typed an answer and
 * watched it disappear will assume the system is broken and stop
 * contributing." That is the real cost — not the lost answer, the lost person,
 * for the rest of the session.
 */
export const LATE_ANSWER_REFUSED = 'That question has closed. Your answer was not recorded.'

/**
 * C43. Whether a late answer is still accepted.
 *
 * The rule, approved 12 August 2026: accepted only where the participant had
 * that question on screen when it closed, and NEVER after a reveal. A reveal is
 * the moment the room reads the numbers off the wall, and an answer arriving
 * after that would change what everybody has already seen.
 *
 * This replaces the Stage 1 guard for the immediately previous question only.
 * Everything else that guard refused, it still refuses: a question from another
 * block, one never opened, one two questions ago.
 */
export function acceptsLateAnswer(
  answeringQuestionId: string | null | undefined,
  previousQuestionId: string | null | undefined,
  previousWasRevealed: boolean,
): boolean {
  if (!answeringQuestionId || !previousQuestionId) return false
  if (answeringQuestionId !== previousQuestionId) return false
  return !previousWasRevealed
}

export interface Problem {
  id: string
  activity_id: string | null
  problem: string | null
  parked_at: string | null
  decision: ItemDecision | null
}

export interface Activity {
  id: string
  service_id: string | null
  activity: string | null
  parked_at: string | null
  decision: ItemDecision | null
}

export interface Service {
  id: string
  service_name: string | null
  service_state: ServiceState | null
  decision: string | null
  /** T1.6. A service can be parked now, and comes back with its activities. */
  parked_at?: string | null
}

/**
 * C22 and C23. An activity with nothing stated under it.
 *
 * Derived from having no problems rather than stored as a flag, because a
 * stored flag can disagree with the rows and then two screens tell a room two
 * different things. A problem whose words are blank does not count: an empty
 * row is not a stated problem.
 */
export function hasNoProblemStated(activityId: string, problems: Problem[]): boolean {
  return !problems.some(
    (p) => p.activity_id === activityId && (p.problem || '').trim().length > 0,
  )
}

/**
 * C23. Which activities Tool 2 shows.
 *
 * An activity with no stated problem is ABSENT, not present with empty boxes.
 * C23's test fails if it appears there at all, because Tool 2 asks who owns the
 * problem and who holds the budget for it, and there is no problem to own.
 * C24 then resolves it at Tool 5 with everything else, rather than killing it
 * at the moment the gap appears.
 */
export function activitiesForToolTwo(activities: Activity[], problems: Problem[]): Activity[] {
  return activities.filter(
    (a) => a.service_id && !a.parked_at && !hasNoProblemStated(a.id, problems),
  )
}

/**
 * C7 and C15. What is in the parked bucket.
 *
 * Two kinds of thing, and they are treated the same on screen but are not the
 * same: something the facilitator parked, and something that was written before
 * services were the anchor and never had one. Neither is deleted, both are
 * visible, and either can be pulled into any service including one created
 * afterwards.
 */
export function parkedActivities(activities: Activity[]): Activity[] {
  return activities.filter((a) => !a.service_id || Boolean(a.parked_at))
}

/** The activities of one service, excluding anything parked. */
export function activitiesOfService(serviceId: string, activities: Activity[]): Activity[] {
  return activities.filter((a) => a.service_id === serviceId && !a.parked_at)
}

/** C3. The problems of one activity. Zero is a valid answer, not an error. */
export function problemsOfActivity(activityId: string, problems: Problem[]): Problem[] {
  return problems.filter((p) => p.activity_id === activityId && !p.parked_at)
}

// ------------------------------------------------------------
// PART D. THE COUNTER  (C30, C31)
//
// Five figures, and they are five because the room needs to see what it threw
// away as well as what it kept. A single total hides the whole of the work.
// ------------------------------------------------------------
export interface Counter {
  startedWith: number
  noProblemStated: number
  killed: number
  paused: number
  carriedForward: number
}

/**
 * The five figures for one service, or for the whole engagement.
 *
 * startedWith counts every activity that belongs to the service, whatever was
 * decided about it, because "started with" is the number the room began the
 * session holding. Killing one does not reduce it; that is the point of
 * showing it beside the kills.
 *
 * Parked activities are NOT counted. They have left the service, and counting
 * them under a service they no longer belong to would make the figures
 * disagree with the screen above them.
 */
export function counterFor(activities: Activity[], problems: Problem[]): Counter {
  const live = activities.filter((a) => a.service_id && !a.parked_at)
  return {
    startedWith: live.length,
    noProblemStated: live.filter((a) => hasNoProblemStated(a.id, problems)).length,
    // Stored in the platform's words, counted into the room's words. A
    // redesigned activity is one that carries forward: it survives the gate,
    // in a different shape.
    killed: live.filter((a) => a.decision === 'stop').length,
    paused: live.filter((a) => a.decision === 'pause').length,
    carriedForward: live.filter((a) => a.decision === 'keep' || a.decision === 'redesign').length,
  }
}

export function counterForService(
  serviceId: string,
  activities: Activity[],
  problems: Problem[],
): Counter {
  return counterFor(activitiesOfService(serviceId, activities), problems)
}

/**
 * C31. The portfolio figures, which must equal the sum of the service figures.
 *
 * Computed from the same function over the same rows rather than added up
 * separately, so the two CANNOT disagree. C31's test is that they agree, and
 * the surest way to pass a test about two numbers matching is to have one
 * number.
 */
export function counterForPortfolio(activities: Activity[], problems: Problem[]): Counter {
  return counterFor(activities, problems)
}

/**
 * C2. Whether an activity may be created.
 *
 * Refused with no parent service. This is enforced here and in the route
 * rather than by a database constraint, because a NOT NULL constraint would
 * also refuse the rows that already exist with no service, and taking a live
 * engagement down to enforce a rule about new rows is not a trade anybody
 * would make.
 */
export function refuseOrphanActivity(serviceId: string | null | undefined): string | null {
  if (!serviceId) return 'Choose which service this activity belongs to'
  return null
}

/**
 * C18. Making a new service out of things that already exist.
 *
 * Returns what moves. The items keep their identity and their problems: this
 * is a change of parent, never a copy, because a copy would leave the room
 * looking at the same activity twice and unable to tell which one was real.
 */
export function moveIntoService(
  serviceId: string,
  activityIds: string[],
  activities: Activity[],
): Activity[] {
  const wanted = new Set(activityIds)
  return activities
    .filter((a) => wanted.has(a.id))
    // Moving something out of the bucket clears the park, because it now has a
    // home. C15's test pulls a parked activity into a new service and expects
    // it to arrive complete.
    .map((a) => ({ ...a, service_id: serviceId, parked_at: null }))
}

// ------------------------------------------------------------
// PART E. WHO THE PARTICIPANT IS, ON SCREEN  (C33, C34)
// ------------------------------------------------------------

/**
 * C34. The line a participant sees on every question after the first.
 *
 * Organisation, then name, then role, in that order, because in a room with
 * three organisations in it the organisation is what tells you which of the
 * three Graces this is.
 *
 * C33: it is a LINE, never boxes. Asking for a name on every question is the
 * fault this replaces.
 * C36: there is no edit control beside it. Identity is corrected on the coach
 * dashboard, so a person cannot become somebody else halfway through a session.
 */
export function identityLine(
  organisation: string | null | undefined,
  name: string | null | undefined,
  role: string | null | undefined,
): string {
  return [organisation, name, role]
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .join(', ')
}

/** C38. Where this question sits in the set the room is working through. */
export function questionPosition(index: number, total: number): string {
  return `Question ${index + 1} of ${total}`
}

// ------------------------------------------------------------
// PART H. THE TWO VISIBILITY SWITCHES  (C56 to C60)
//
// They govern different fears and so they are two.
//   Answers visible  ANCHORING. The first answer seen sets what others write.
//   Authors visible  SAFETY. Whether a junior person will contradict a senior
//                    one in front of the room.
// A single switch forces a room to choose between the two, and the commonest
// useful setting — answers visible, authors hidden — is exactly the one it
// cannot express.
// ------------------------------------------------------------
export interface Visibility {
  answersVisible: boolean
  authorsVisible: boolean
}

/** C57. Where a new question starts. Changeable before and during (C56). */
export function defaultVisibility(type: 'collect' | 'score' | 'classify'): Visibility {
  return type === 'collect'
    ? { answersVisible: true, authorsVisible: true }
    : { answersVisible: false, authorsVisible: false }
}

/**
 * Whether other people's answers may leave the server yet.
 *
 * Enforced by NOT SENDING, the same way R14 was: a screen that never received
 * a value cannot leak one, and a reveal is the only thing that changes it.
 */
export function mayShowAnswers(v: Visibility, revealed: boolean): boolean {
  return v.answersVisible || revealed
}

/**
 * C58 and C62. Whether a name may appear ANYWHERE.
 *
 * Not "on this screen". Anywhere: the participant page, the projection, the
 * block, every export, every report, and at any later date. So this is asked
 * before a name is put into anything, including the permanent record, and a
 * reveal does NOT change it. Revealing answers is not revealing people.
 */
export function mayShowNames(v: Visibility): boolean {
  return v.authorsVisible
}
