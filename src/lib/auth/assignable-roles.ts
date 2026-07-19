// ============================================================
// Which roles an actor is allowed to ASSIGN to another user.
//
// Pure, unit-tested rule shared by the role-changing paths so the
// privilege matrix lives in one place. Prevents vertical privilege
// escalation: without this, a route that accepts any role string lets a
// CEO promote someone (or themselves) to super_coach — a cross-tenant
// platform admin.
// ============================================================

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
