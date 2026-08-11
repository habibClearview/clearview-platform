// ============================================================
// STAGE 2: THE RULES BEHIND A PERSONAL LINK
//
// Written the same way as the Stage 1 rules: no React, no database, so every
// decision can be exercised by a test rather than by standing up a server.
//
// A PERSONAL LINK IS NOT A NEW KIND OF ACCESS. It reaches the same room the
// code reaches. What it changes is that the room already knows who is holding
// it, so the same eight people do not type a code every week for twenty-six
// weeks. It can never open anything the code could not.
// ============================================================

/** The grant type that marks a link as one person's, for a whole engagement. */
export const PERSONAL_GRANT_TYPE = 'gtcv_person'

/**
 * The word in the address that carries the link (Q17, approved 11 August 2026).
 *
 * Short, meaningless, and gone after the first open: the amendment to R5 says
 * the value is consumed on first opening and removed, so that from then on the
 * address reads exactly /room. A link left sitting in an address bar is a link
 * that gets screenshotted into a group chat.
 */
export const PERSONAL_LINK_PARAM = 'p'

/**
 * What a revoked person sees (Q18, answered 11 August 2026, word for word).
 *
 * Nothing else. No explanation and no removal language: this appears on a
 * phone in a lit room, and "you have been removed from this engagement" on
 * somebody's face in front of everybody is worse than saying little.
 */
export const LINK_CLOSED = 'This link is no longer open. Please speak to your facilitator.'

/**
 * What the room is told before answering an anonymous question (Q12, answered
 * 11 August 2026, in Habib's own words).
 *
 * THIS SENTENCE IS THE CONSENT. R39 records who made every submission,
 * including on a question shown as anonymous. A room told "anonymous" that
 * later discovered the record kept their name would have been misled, and the
 * anonymous question is usually the one people would not put their name to.
 * So it is said on the participant's own screen, not only aloud by a
 * facilitator who may forget.
 *
 * Do not soften it, shorten it, or hide it behind a link.
 */
export const ANONYMOUS_NOTICE =
  'Your name is not shown on screen and is not shown to anyone in this room, but it is recorded in the system.'

/** The word beside a visitor's answer (Q16). Facilitator's list only. */
export const GUEST_LABEL = 'Guest'

/** The address a team member is sent. */
export function personalLinkUrl(origin: string, token: string): string {
  return `${origin}/room?${PERSONAL_LINK_PARAM}=${encodeURIComponent(token)}`
}

/**
 * What gets copied for sending by messaging app (R36).
 *
 * The email half of R36 is NOT built. Nothing in this platform sends email,
 * and sending client names and their permanent links to an outside company is
 * exactly what Rule 9 forbids without the specification naming the service.
 * Instructed 11 August 2026: "Do not send any email. Build the copy-for-
 * messaging route now."
 *
 * Deliberately plain. This is pasted into WhatsApp, so it must survive being
 * read on a small screen by somebody who was not in the room when it was
 * explained.
 */
export function personalLinkMessage(name: string, organisation: string | null, url: string): string {
  const who = (name || '').trim() || 'Hello'
  const org = (organisation || '').trim()
  return [
    `${who}, this is your own link for the sessions${org ? ` with ${org}` : ''}.`,
    '',
    url,
    '',
    'Open it once and it will remember you. You do not need a code, a password or an app.',
    'Keep it to yourself: anyone who opens it will be answering as you.',
  ].join('\n')
}

export interface PersonalGrant {
  grant_type: string | null
  revoked_at: string | null
  expires_at: string | null
  party_id: string | null
  client_id: string | null
}

export type LinkRefusal =
  | 'not_a_personal_link'
  | 'revoked'
  | 'expired'
  | 'engagement_closed'
  | null

/**
 * Whether a personal link still opens anything, and if not, why.
 *
 * THE REASON NEVER REACHES THE PERSON HOLDING IT. Every refusal shows them the
 * one sentence above. The reason is for the log, so that a coach asking "why
 * did Grace's link stop" has an answer.
 *
 * R37: revocation has to bite IMMEDIATELY, which means this is checked on
 * every request and not only when somebody first opens their link. A browser
 * that was handed a cookie an hour ago cannot be reached to take it back, so
 * the check has to happen at the moment the answer arrives.
 *
 * Q15, amended 11 August 2026: "permanent" means for the life of the
 * engagement. A link that still opens a client's room a year later, on a phone
 * that has since been sold, is a standing key. So a closed engagement closes
 * its links.
 *
 * 'complete' is the closed state. 'paused' is NOT: a paused engagement is one
 * that resumes, and killing eight people's links on a pause would be a
 * destruction dressed up as a rule.
 */
export function refusePersonalLink(
  grant: PersonalGrant | null | undefined,
  engagementStatus: string | null | undefined,
  nowMs: number,
): LinkRefusal {
  if (!grant || grant.grant_type !== PERSONAL_GRANT_TYPE || !grant.party_id) {
    return 'not_a_personal_link'
  }
  if (grant.revoked_at) return 'revoked'
  // A personal link is issued with no expiry. One that has an expiry date and
  // has passed it is still refused, because a date that exists is a date
  // somebody meant.
  if (grant.expires_at && new Date(grant.expires_at).getTime() <= nowMs) return 'expired'
  if (engagementStatus === 'complete') return 'engagement_closed'
  return null
}

/**
 * R39 again, as a rule rather than as a column.
 *
 * What a submission records about who made it. Two separate things, because
 * the facilitator is allowed to know one of them and never the other:
 *
 *   identityPartyId   who it was. Recorded always. Shown to nobody, ever.
 *   isGuest           whether they came in on the room code. Shown in the
 *                     facilitator's pending list and never on the projector.
 *   displayName       the name an interface may draw, which is empty unless
 *                     the question is a named one. Unchanged from Stage 1.
 */
export interface SubmissionIdentity {
  identityPartyId: string | null
  isGuest: boolean
  displayName: string | null
}

export function submissionIdentity(
  who: { personId: string | null; personName: string | null },
  questionIsNamed: boolean,
): SubmissionIdentity {
  return {
    identityPartyId: who.personId,
    // No person means they came in on the room code. R38.
    isGuest: !who.personId,
    // R18 stands: on an anonymous question there is no name in the row, so
    // there is none for an interface to leak. R39 is served by the column
    // above, which no interface reads.
    displayName: questionIsNamed ? who.personName : null,
  }
}

/**
 * Whether the participant page must show the consent sentence.
 *
 * Only on an anonymous question, because that is the only place where what the
 * screen implies and what the record holds are different things.
 */
export function showsAnonymousNotice(questionIsNamed: boolean | null | undefined): boolean {
  return questionIsNamed === false
}
