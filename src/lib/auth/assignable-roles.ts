// ============================================================
// Which roles an actor is allowed to ASSIGN to another user.
//
// Pure, unit-tested rule shared by the role-changing paths so the
// privilege matrix lives in one place. Prevents vertical privilege
// escalation: without this, a route that accepts any role string lets a
// CEO promote someone (or themselves) to super_coach — a cross-tenant
// platform admin.
// ============================================================

// Roles permitted to manage another user's unit assignments.
export const UNIT_MANAGER_ROLES = ['ceo', 'super_coach', 'finance_manager']
// Roles permitted to deactivate / reactivate another user.
export const DEACTIVATOR_ROLES = ['ceo', 'super_coach']

export function canManageUnits(role: string): boolean {
  return UNIT_MANAGER_ROLES.includes(role)
}
export function canDeactivateUsers(role: string): boolean {
  return DEACTIVATOR_ROLES.includes(role)
}

export const ASSIGNABLE_ROLES: Record<string, string[]> = {
  // Platform admin may assign any real role.
  super_coach: ['ceo', 'finance_manager', 'unit_head', 'accounts_assistant', 'coach', 'funder'],
  // A client's CEO may staff their own org, but never mint a peer CEO or a platform admin.
  ceo: ['finance_manager', 'unit_head', 'accounts_assistant'],
  // A finance manager may only manage the roles below them.
  finance_manager: ['unit_head', 'accounts_assistant'],
}

/**
 * True when `actorRole` may set a user's role to `targetRole`.
 * Anything not explicitly listed is denied (no `super_coach`/`ceo` self-mint).
 */
export function canAssignRole(actorRole: string, targetRole: string): boolean {
  return (ASSIGNABLE_ROLES[actorRole] || []).includes(targetRole)
}

/**
 * True when `actorRole` may change a user whose CURRENT role is
 * `targetCurrentRole` to `targetNewRole`.
 *
 * Enforces the hierarchy in BOTH directions: the actor must be allowed to
 * administer the target's current role AND to assign the new one. Without the
 * current-role check, a finance_manager (who may assign unit_head) could demote
 * a CEO to unit_head — the destination is allowed, but the target outranks them.
 */
export function canModifyUserRole(actorRole: string, targetCurrentRole: string, targetNewRole: string): boolean {
  return canAssignRole(actorRole, targetCurrentRole) && canAssignRole(actorRole, targetNewRole)
}
