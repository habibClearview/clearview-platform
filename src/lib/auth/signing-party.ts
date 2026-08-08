// ============================================================
// Who is actually signing.
//
// A signature is the only thing in this platform that is meant to bind a
// person to a decision. Everything else can be corrected later; a signature
// is the record that says a named party agreed to a named wording on a named
// date. So the one rule that matters is that the identity on a signature is
// never taken from the request body. The body says which button was pressed.
// The server decides who pressed it.
//
// Two legitimate ways a signature reaches the record:
//
//   SELF      the signer is signed in and presses Sign. Their party record is
//             found by user_id, and the role and name written to the record
//             come from that party row, not from the request. A party who is
//             not a signatory cannot sign at all.
//
//   IN ROOM   the gate is signed on paper in a session and the lead consultant
//             enters it. This is real: an Executive Director signs a printed
//             decision output in the room and somebody has to put it in the
//             system. It requires manage rights, it must name the party being
//             recorded, and it is stored as what it is. recorded_by_user_id
//             carries the person who typed it, so the record never claims the
//             signer logged in when they did not.
//
// Anything else is refused. In particular a party cannot sign as another
// party, and someone with only view access cannot record a signature for
// anyone, including themselves if they are not a signatory.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js'

export interface EngagementParty {
  id: string
  client_id: string
  party_role: string
  name: string
  email: string | null
  is_signatory: boolean
  user_id: string | null
}

export type SigningMode = 'self' | 'in_room'

export interface ResolvedSigner {
  party: EngagementParty
  mode: SigningMode
  /** The account that typed this in, always the authenticated caller. */
  recordedBy: string
  /** The signer's own account, null when they have no login. */
  signerUserId: string | null
}

export interface SignerRefusal {
  error: string
  status: 400 | 403 | 404
}

export function isRefusal(r: ResolvedSigner | SignerRefusal): r is SignerRefusal {
  return (r as SignerRefusal).error !== undefined
}

/**
 * Work out who is signing, from the session and the engagement's own party
 * list. `onBehalfOfPartyId` is the in room path and requires manage rights.
 */
export async function resolveSigner(
  admin: SupabaseClient,
  opts: {
    clientId: string
    userId: string
    canManage: boolean
    /** Set only when recording a signature given on paper in a session. */
    onBehalfOfPartyId?: string | null
    /**
     * What the screen believed the role to be. Checked against the party the
     * server resolved, so a mismatch is refused rather than silently
     * rewritten. Optional: a caller that does not send it gets the server's
     * answer without the extra check.
     */
    expectedRole?: string | null
  },
): Promise<ResolvedSigner | SignerRefusal> {
  const { clientId, userId, canManage, onBehalfOfPartyId, expectedRole } = opts

  const { data: parties, error } = await admin
    .from('engagement_parties')
    .select('id, client_id, party_role, name, email, is_signatory, user_id')
    .eq('client_id', clientId)

  if (error) return { error: 'Could not read the engagement parties', status: 403 }
  const list = (parties || []) as EngagementParty[]

  if (onBehalfOfPartyId) {
    if (!canManage) {
      return { error: 'Only the lead consultant can record a signature given in the room', status: 403 }
    }
    const party = list.find((p) => p.id === onBehalfOfPartyId)
    if (!party) return { error: 'That party is not on this engagement', status: 404 }
    if (!party.is_signatory) return { error: 'That party does not sign', status: 403 }
    if (expectedRole && expectedRole !== party.party_role) {
      return { error: 'The role does not match that party', status: 400 }
    }
    return { party, mode: 'in_room', recordedBy: userId, signerUserId: party.user_id }
  }

  const own = list.find((p) => p.user_id === userId)
  if (!own) {
    return {
      error: 'You are not recorded as a party on this engagement, so you cannot sign. The lead consultant can add you in Engagement Setup.',
      status: 403,
    }
  }
  if (!own.is_signatory) {
    return { error: 'You are on this engagement but you are not a signatory', status: 403 }
  }
  if (expectedRole && expectedRole !== own.party_role) {
    return { error: 'You can only sign as yourself', status: 403 }
  }

  return { party: own, mode: 'self', recordedBy: userId, signerUserId: userId }
}
