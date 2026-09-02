// ============================================================
// Looking at the engagement through somebody else's eyes.
//
// WHY THIS IS HARDER THAN IT LOOKS, AND WHAT IT HONESTLY DOES.
//
// A preview can show one of two things and it matters which. It can show the
// SCREEN somebody gets, which is what the interface hides and reveals for their
// role. Or it can show the DATA they can reach, which is what the database
// would hand over if they asked. Those are not the same, and a preview that
// quietly conflates them is worse than none, because it invites the coach to
// conclude a person cannot see something when the only thing stopping them is a
// hidden button.
//
// So this does the first and states the second. Switching to a role re-renders
// the real screen with that role's rights, using the same functions the
// application uses, not a copy of them. Alongside it, the preview says in words
// what that role can and cannot reach underneath, and says plainly that the
// data on screen was loaded with the coach's own access.
//
// WHAT IT IS NOT. It is not a way to act as somebody else. Nothing written
// while previewing is attributed to the previewed role: the preview changes
// what is shown, never who is writing, and the routes resolve the writer from
// the session regardless. That is why previewing is safe to leave switched on.
// ============================================================
import type { AnyRole } from '@/lib/coach-types'
import { canEdit, canSignOff, canViewCoachGuidance } from '@/lib/coach-types'

export interface PreviewRole {
  /** The role identifier used by the application. */
  id: string
  /** What this person is called in an engagement, in plain words. */
  label: string
  /** Who this actually is, so the coach picks the right one. */
  who: string
  /**
   * How this person's access is decided in the database, in plain words.
   * Written out rather than computed, because the honest answer includes
   * things a function cannot return, such as a role nobody can hold.
   */
  reach: string
  /** True when no account can currently hold this role. */
  unreachable?: boolean
}

/**
 * The roles worth looking through. Two of these are not roles an account can
 * hold today and are marked as such, because a preview that silently omits them
 * would let the coach believe the funder has a login when the funder does not.
 */
export const PREVIEW_ROLES: PreviewRole[] = [
  {
    id: 'super_coach',
    label: 'You, the lead consultant',
    who: 'The person who owns the engagement and signs off the work.',
    reach: 'Everything on every engagement, including the fee and the guidance.',
  },
  {
    id: 'coach',
    label: 'Co-implementer',
    who: 'A consultant working alongside you on named engagements.',
    reach: 'Full access, but only to the engagements they are assigned to. They see the coaching guidance.',
  },
  {
    id: 'ceo',
    label: 'The client',
    who: 'The Executive Director or leadership of the client organisation doing the work.',
    reach: 'Their own engagement only. They can edit the working tables and sign off blocks. They never see the coaching guidance or anything about the fee.',
  },
  {
    // ONE ENTRY, NOT TWO. 2 September 2026. 'finance_manager' and 'unit_head'
    // were separate rows in this list and identical in every function the
    // application has: both read-only, both without the coaching guidance,
    // both without sign-off. Two names for one behaviour taught the coach a
    // distinction that does not exist. The id stays finance_manager because
    // that is a real role an account holds; the preview simply stops pretending
    // there are two things to look at.
    id: 'finance_manager',
    label: 'Their team — read only',
    who: 'Anyone in the client organisation who is not the Executive Director: the finance lead, a service or department lead.',
    reach: 'Their own engagement, and they can read all of it. They cannot change a working table, cannot sign a decision point off, and never see the coaching guidance or anything about the fee.',
  },
  // THE FUNDER IS NOT IN THIS LIST, deliberately. 2 September 2026.
  //
  // No account can hold a funder role, so there is nothing to preview: a funder
  // reaches the engagement through a showcase link, which shows the method and
  // how many gates are closed and nothing the engagement produced. Offering
  // "The funder" here rendered the coach's own dashboard and invited exactly
  // the wrong conclusion — that this is what a funder sees. It is the opposite
  // of what a preview is for.
  //
  // What a funder actually sees is at /showcase/[token], and it is looked at by
  // opening a showcase link, not by pretending to be one here.
]

export interface RoleCapability {
  /** What they may do, in plain words. */
  what: string
  /** Whether they may. */
  allowed: boolean
}

/**
 * What a role may do on screen, answered by the same functions the application
 * uses rather than by a second list that could drift from them.
 */
export function capabilitiesFor(role: AnyRole): RoleCapability[] {
  return [
    { what: 'Edit the working tables in a block', allowed: canEdit(role) },
    { what: 'Move a gate from one state to the next', allowed: canEdit(role) },
    { what: 'Sign off a block', allowed: canSignOff(role) },
    { what: 'See the coaching guidance and the method reference', allowed: canViewCoachGuidance(role) },
    { what: 'See the deliverables, the fee and the claims', allowed: canEdit(role) && canViewCoachGuidance(role) },
    { what: 'Open a session to the room', allowed: canEdit(role) },
  ]
}

export function previewRole(id: string): PreviewRole | null {
  return PREVIEW_ROLES.find((r) => r.id === id) || null
}

/**
 * Only the lead consultant may look through other eyes. A co-implementer
 * previewing the organisation would learn nothing they should not know, but a
 * preview is still a coaching tool, and the person who owns the engagement is
 * the one who needs to know what each party is being shown.
 */
export function mayPreview(role: AnyRole): boolean {
  return role === 'super_coach'
}
