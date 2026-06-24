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

// ============================================================
// CONAS MODEL TYPES
// ============================================================

export interface CropParameters {
  id: string
  name: string
  unit: string
  farmgateBuyPrice: number
  marketSellPrice: number
  yieldPerAcre: number
  active: boolean
}

export interface CropPlantingPlan {
  cropId: string
  acresPerFgePerMonth: number[]  // 12 values
  landUnderUsePerMonth: number[] // 12 values (total)
  harvestMonths: number[]        // month indices where harvest occurs
}

export interface BusinessUnit {
  id: string
  name: string
  short: string
  color: string
  headcount: number
  active: boolean
}

export interface StaffLine {
  id: string
  role: string
  monthlySalary: number
  headcount: number
  businessUnitId: string
  startMonth: number
  active: boolean
}

export interface OverheadLine {
  id: string
  name: string
  monthlyAmount: number
  businessUnitId: string
  startMonth: number
  active: boolean
  isShared: boolean
}

export interface CONASInputs {
  global: {
    businessName: string
    currency: string
    modelStartDate: string
    fgeCount: number
    scenario: string
    openingCashBalance: number
    transferPriceMargin: number       // internal margin e.g. 0.055
    sharedCostFixedPct: number        // 0.5 = 50% by headcount
    corporateTaxRate: number
  }
  crops: CropParameters[]
  plantingPlan: CropPlantingPlan[]
  businessUnits: BusinessUnit[]
  staff: StaffLine[]
  overheads: OverheadLine[]
  capitalStructure: {
    shareholderContribution: number
    grantNonRepayable: number
    grantRecoverable: number
    bankLoan: number
    annualInterestRate: number
    loanTenorYears: number
  }
  scenarios: Array<{
    id: string
    label: string
    fgeCount: number
    revenueMultiplier: number
    costMultiplier: number
  }>
  monthlyActuals: Record<string, number[]>
  monthlyActualsNotes: string[]
}
