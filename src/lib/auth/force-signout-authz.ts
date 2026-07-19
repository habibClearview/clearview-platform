// ============================================================
// AUTHORISATION: who may force another user's sessions to end
//
// Pure decision function, kept separate from the API route so the
// security-critical rule can be unit-tested in isolation. Both the
// actor and the target are resolved from the database by the caller —
// never from anything the browser sends — before this runs.
// ============================================================

export interface ForceSignoutProfile {
  role: string
  // The TEXT engagement id that scopes a user to one organisation.
  // null for a super_coach (platform admin), who is not tied to a client.
  engagement_client_id: string | null
}

// Roles a finance manager is allowed to sign out (their subordinates only).
const FM_MANAGEABLE_ROLES = ['unit_head', 'accounts_assistant']

/**
 * True when `actor` is permitted to force-revoke every session of `target`.
 *
 * Mirrors the existing "Deactivate" permission surface (force sign-out is
 * strictly less drastic than deactivation, which the same actors can already
 * do):
 *   - super_coach (platform admin): may sign out anyone.
 *   - ceo: may sign out anyone in their OWN organisation.
 *   - finance_manager: may sign out unit heads / accounts assistants in their
 *     own organisation only.
 *   - everyone else: not permitted.
 */
export function canForceSignout(actor: ForceSignoutProfile, target: ForceSignoutProfile): boolean {
  // Platform admin is the deliberate cross-organisation exception.
  if (actor.role === 'super_coach') return true

  // Everyone else must act strictly within their own organisation. A missing
  // actor engagement id, or a mismatch, is an immediate no — this is what stops
  // one client's manager reaching into another client's users.
  if (!actor.engagement_client_id || actor.engagement_client_id !== target.engagement_client_id) {
    return false
  }

  if (actor.role === 'ceo') return true
  if (actor.role === 'finance_manager') return FM_MANAGEABLE_ROLES.includes(target.role)

  return false
}
