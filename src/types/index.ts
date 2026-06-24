export type UserRole = 'coach' | 'client_admin' | 'client_staff';
export type ClientType = 'agri_aggregator' | 'service_lsp';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  client_id: string | null;
  full_name: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  slug: string;
  client_type: ClientType;
  is_active: boolean;
  created_at: string;
}

export interface ModelConfig {
  id: string;
  client_id: string;
  scenario_id: string | null;
  config_data: Record<string, number | string | boolean>;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface MonthlyActual {
  id: string;
  client_id: string;
  period_year: number;
  period_month: number;
  actuals_data: Record<string, number>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Scenario {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  config_snapshot: Record<string, number | string | boolean>;
  created_at: string;
}

export interface CounterpartyRoster {
  id: string;
  client_id: string;
  name: string;
  type: string;
  location: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ProjectionRow {
  month: number;
  label: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  ebitda: number;
  cashflow: number;
  cumCashflow: number;
}

export interface VarianceRow {
  key: string;
  label: string;
  budget: number;
  actual: number;
  variance: number;
  variancePct: number;
}
