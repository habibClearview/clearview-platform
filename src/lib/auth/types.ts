// ============================================================
// AUTH TYPES
// ============================================================
export type UserRole =
  | 'super_coach'     // Habib — sees everything, invisible to client
  | 'coach'           // Co-implementer / associate coach
  | 'ceo'             // Client CEO — full control, all units
  | 'finance_manager' // Approves actuals, manages users
  | 'unit_head'       // Sees and edits their own unit only
  | 'accounts_assistant' // Enters actuals for assigned units only

export interface AppUser {
  id: string
  email: string
  role: UserRole
  full_name: string
  client_id: string | null
  // For unit_head and accounts_assistant: which units they can access
  assigned_unit_ids: string[]
}

export function canApproveSpendrequests(role: UserRole): boolean {
  return role === 'ceo' || role === 'super_coach'
}

export function canEditPlan(role: UserRole): boolean {
  return ['super_coach', 'ceo', 'finance_manager', 'unit_head'].includes(role)
}

export function canLockPlan(role: UserRole): boolean {
  return ['super_coach', 'ceo', 'finance_manager'].includes(role)
}

export function canSubmitSpendRequest(role: UserRole): boolean {
  return ['finance_manager', 'unit_head', 'accounts_assistant'].includes(role)
}

export function canEnterActuals(role: UserRole): boolean {
  return ['super_coach', 'ceo', 'finance_manager', 'unit_head', 'accounts_assistant'].includes(role)
}

export function canSeeAllUnits(role: UserRole): boolean {
  return ['super_coach', 'ceo', 'finance_manager'].includes(role)
}

export function canManageUsers(role: UserRole): boolean {
  return ['super_coach', 'ceo'].includes(role)
}

export function roleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    super_coach: 'Coach',
    coach: 'Co-Implementer',
    ceo: 'CEO',
    finance_manager: 'Finance Manager',
    unit_head: 'Unit Head',
    accounts_assistant: 'Accounts Assistant',
  }
  return labels[role] || role
}
