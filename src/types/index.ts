// ============================================================
// CLEARVIEW PLATFORM — TYPE DEFINITIONS
// ============================================================

export type ClientType = 'agri_aggregator' | 'service_lsp'
export type UserRole = 'super_coach' | 'assigned_coach' | 'client_admin' | 'client_staff'

export interface UserProfile {
  id: string
  client_id: string | null
  role: UserRole
  full_name: string
  email: string
  assigned_client_ids?: string[]
}

export interface Client {
  id: string
  name: string
  slug: string
  client_type: ClientType
  engagement_id?: string
  brand_theme?: Record<string, string>
  archived: boolean
  created_at: string
}

export interface ModelConfig {
  id: string
  client_id: string
  config: Record<string, unknown>
  version: number
  updated_at: string
  updated_by?: string
}

export interface MonthlyActual {
  id: string
  client_id: string
  business_unit: string
  period: string
  revenue: number
  cost_of_sales: number
  staff_cost: number
  direct_operating_cost: number
  admin_cost_allocated: number
  actuals_data: Record<string, number>
  notes: string
  entered_by?: string
  entered_at: string
}

export interface Scenario {
  id: string
  client_id: string
  name: string
  overrides: Record<string, unknown>
  created_at: string
}
