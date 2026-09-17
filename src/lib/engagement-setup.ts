// ============================================================
// IS THIS ENGAGEMENT SET UP, AND IF NOT, WHAT IS MISSING
//
// Habib, 17 September 2026: "why is the engagement set up not showing that
// ikore has been setup - what more does it need to be set up - contract was
// uploaded, invitations has been sent to people, what else does it need for
// the status to show that the engagement has been set up?"
//
// A fair question with no answer on the screen. The stage an engagement shows
// is a field somebody sets by hand, so the platform knew perfectly well what
// was outstanding and never said. He was left guessing at a checklist that
// exists, in writing, in the method: the pre-engagement zone brief names three
// things that must exist before Decision Point 1 opens.
//
//   The parties named, with whoever signs each gate identified
//   The Charter issued and signed by every signatory
//   The deliverables and their payment milestones recorded against the contract
//
// Those three, checked against the record rather than remembered. Uploading the
// contract and sending invitations are real work and neither of them is on this
// list, which is exactly why it needed writing down.
//
// This file does the arithmetic and nothing else: no database, no browser, so
// every rule below can be run in a test rather than clicked through.
// ============================================================

export interface SetupParty {
  id: string
  name?: string | null
  email?: string | null
  party_role?: string | null
  is_signatory?: boolean | null
}

/**
 * The three parties who must sign the Charter, by the role they are recorded
 * under on the engagement.
 *
 * Habib, 17 September 2026: "the charter does not have anywhere for the lead
 * coach and Tanager to sign, these are the 3 parties including Ikore that must
 * sign the charter so all parties have witness at the meeting."
 *
 * The reason is in his last six words. A charter signed by one party and
 * acknowledged by another is a document with one person's name on it. Signed
 * by all three in the same meeting, each has witnessed the others agree, and
 * none of them can later have understood it differently.
 *
 * The platform has always allowed any party to be marked as signing. What it
 * never did was say that one of the three was missing, so it was found out in
 * the room, which is the worst moment to find it out.
 */
export const MUST_SIGN = [
  { role: 'lsp_ed', who: 'the organisation' },
  { role: 'lead_consultant', who: 'the coach' },
  { role: 'funder_rep', who: 'the funder' },
]

export interface SetupCharter {
  id: string
  status?: string | null
  issued_at?: string | null
}

export interface SetupSignature {
  charter_id?: string | null
  party_id?: string | null
  signed_at?: string | null
}

export interface SetupDeliverable {
  milestone_no?: number | null
  payment_amount?: number | string | null
}

export interface SetupStep {
  /** A short name for the step, as it reads on the screen. */
  title: string
  done: boolean
  /**
   * True when this step could not be checked at all, rather than checked and
   * found wanting. A read that failed is not a thing somebody has not done,
   * and saying it is sends them off to redo work that is already there.
   */
  unknown?: boolean
  /** What is true now, in one sentence, whether or not it is done. */
  detail: string
  /** Where to go to finish it, as a tab id. Null when it is done. */
  goTo: string | null
}

export interface SetupState {
  steps: SetupStep[]
  done: boolean
  /** How many of the steps are finished, for the line at the top. */
  finished: number
}

/** A person counts as named once they have a name to be called by. */
function named(parties: SetupParty[]): SetupParty[] {
  return (parties || []).filter((p) => (p.name || '').trim())
}

/**
 * Where the engagement has got to in being set up.
 *
 * Every step answers from the record. A step that cannot be checked because
 * something earlier is missing says so rather than claiming to be incomplete
 * for its own reasons: there is no point telling somebody the Charter is
 * unsigned when nobody has been named to sign it.
 */
export function setupState(input: {
  parties?: SetupParty[] | null
  charter?: SetupCharter | null
  signatures?: SetupSignature[] | null
  deliverables?: SetupDeliverable[] | null
  /** Set when a read failed, so the step says so instead of saying not done. */
  signaturesUnavailable?: boolean
  deliverablesUnavailable?: boolean
}): SetupState {
  const parties = named(input.parties || [])
  const signatories = parties.filter((p) => p.is_signatory)
  const charter = input.charter || null
  const signatures = (input.signatures || []).filter((s) => s.signed_at)
  const deliverables = input.deliverables || []

  // ─── 1. The people ───────────────────────────────────────
  // All three parties have to be on the engagement AND marked as signing.
  const signingRoles = new Set(signatories.map((p) => p.party_role).filter(Boolean))
  const missingSigners = MUST_SIGN.filter((m) => !signingRoles.has(m.role))
  const peopleDone = parties.length > 0 && missingSigners.length === 0
  const people: SetupStep = {
    title: 'The people are named, and all three parties are marked as signing',
    done: peopleDone,
    detail: parties.length === 0
      ? 'Nobody has been added to this engagement yet.'
      : signatories.length === 0
        ? `${parties.length} ${parties.length === 1 ? 'person is' : 'people are'} named, but nobody is marked as signing.`
        : missingSigners.length > 0
          ? `${parties.length} named. Nobody is signing for ${missingSigners.map((m) => m.who).join(', ')}. All three parties sign the Charter, so each has witnessed the others agree.`
          : `${parties.length} named, and all three parties are signing.`,
    goTo: peopleDone ? null : 'eng_setup',
  }

  // ─── 2. The Charter ──────────────────────────────────────
  // Signed by EVERY signatory, which is the point of naming them first. A
  // charter signed by two of three people is not a signed charter.
  const signedBy = new Set(signatures.map((s) => s.party_id).filter(Boolean))
  const outstanding = signatories.filter((p) => !signedBy.has(p.id))
  const issued = !!charter && (!!charter.issued_at || charter.status === 'issued' || charter.status === 'signed')
  const charterUnknown = !!input.signaturesUnavailable
  const charterDone = !charterUnknown && issued && signatories.length > 0 && outstanding.length === 0
  const charterStep: SetupStep = {
    title: 'The Charter is issued and signed by everyone who signs it',
    done: charterDone,
    unknown: charterUnknown,
    detail: charterUnknown
      ? 'The signatures could not be read just now, so this one is not known either way.'
      : !charter
      ? 'No Charter has been drawn up yet.'
      : !issued
        ? 'The Charter is still a draft. It has not been issued for signature.'
        : signatories.length === 0
          ? 'The Charter is issued, but nobody is marked as signing it, so there is nothing to wait for.'
          : outstanding.length === 0
            ? `Signed by all ${signatories.length}.`
            : `Waiting on ${outstanding.map((p) => p.name).join(', ')}.`,
    goTo: charterDone || charterUnknown ? null : 'charter',
  }

  // ─── 3. The deliverables ─────────────────────────────────
  // A deliverable with no payment milestone on it cannot be invoiced, so the
  // contract is not actually recorded against the work.
  const withMilestone = deliverables.filter(
    (d) => d.milestone_no != null && Number(d.payment_amount) > 0,
  )
  const deliverablesUnknown = !!input.deliverablesUnavailable
  const deliverablesDone = !deliverablesUnknown
    && deliverables.length > 0 && withMilestone.length === deliverables.length
  const deliverablesStep: SetupStep = {
    title: 'The deliverables and their payment milestones are recorded',
    done: deliverablesDone,
    unknown: deliverablesUnknown,
    detail: deliverablesUnknown
      ? 'The deliverables could not be read just now, so this one is not known either way.'
      : deliverables.length === 0
      ? 'No deliverables have been recorded from the contract yet.'
      : withMilestone.length === deliverables.length
        ? `${deliverables.length} recorded, each with a payment milestone.`
        : `${deliverables.length} recorded, ${deliverables.length - withMilestone.length} without a payment milestone.`,
    goTo: deliverablesDone || deliverablesUnknown ? null : 'eng_setup',
  }

  const steps = [people, charterStep, deliverablesStep]
  return {
    steps,
    // Not done, and not claiming to be: a step nobody could read is not a step
    // that passed.
    done: steps.every((s) => s.done),
    finished: steps.filter((s) => s.done).length,
  }
}
