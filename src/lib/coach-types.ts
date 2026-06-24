// ============================================================
// COACH PLATFORM TYPES
// ============================================================

export type ClientType =
  | 'crop_aggregator'    // CONAS, Wonderland — input centres + FGE + farm
  | 'livestock_aggregator' // Kenali, Viester — goat/cattle aggregation
  | 'farmer_group_enterprise' // Konya, Rubangangeyo — equipment-based FGE
  | 'service_lsp'        // Ikore — service company, no physical goods

export type ProgrammeType =
  | 'donor_programme'    // Palladium CSJ, Ignite — donor pays for coach to work with LSPs
  | 'direct_client'      // Client pays Canvas Coach directly
  | 'blended'            // Mix of donor and direct

export type EngagementStatus =
  | 'setup'
  | 'phase_0'
  | 'dp01' | 'dp02' | 'dp03' | 'dp04' | 'dp05'
  | 'dp06' | 'dp07' | 'dp08' | 'dp09'
  | 'complete'
  | 'paused'

export type DPStatus = '○' | '◐' | '✓' | '⚠'

export interface Programme {
  id: string
  name: string               // e.g. "Palladium CSJ", "Ignite", "Direct"
  type: ProgrammeType
  funder: string             // e.g. "FCDO", "Ignite", "Self-funded"
  country: string
  startDate: string
  endDate: string
  notes: string
  clientIds: string[]
  coImplementerIds: string[]
}

export interface EngagementClient {
  id: string
  name: string
  slug: string               // URL slug — e.g. "conas", "wonderland"
  type: ClientType
  programmeId: string
  country: string
  sector: string
  contactName: string        // CEO / Executive Director name
  contactEmail: string
  contactPhone: string
  status: EngagementStatus
  dpStatus: Record<string, DPStatus>  // dp01 → '✓', dp02 → '◐' etc
  startDate: string
  expectedClose: string
  clearviewActive: boolean   // Whether Clearview platform is active for this client
  notes: string
  financialHeadline?: {
    revenue: number
    ebitda: number
    cash: number
    currency: string
        lastUpdated: string
  }
}

export interface CoImplementer {
  id: string
  name: string
  email: string
  phone: string
  country: string
  specialisation: string
  programmeIds: string[]     // Programmes they are assigned to
  clientIds: string[]        // Specific clients they work with
  active: boolean
  notes: string
}

export interface CoachState {
  programmes: Programme[]
  clients: EngagementClient[]
  coImplementers: CoImplementer[]
}

// ── CLIENT TYPE METADATA ──────────────────────────────────
export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  crop_aggregator: 'Crop Aggregator with Input',
  livestock_aggregator: 'Livestock Aggregator',
  farmer_group_enterprise: 'Farmer Group Enterprise',
  service_lsp: 'Service LSP',
}

export const CLIENT_TYPE_COLORS: Record<ClientType, string> = {
  crop_aggregator: '#1A7A4A',
  livestock_aggregator: '#B8860B',
  farmer_group_enterprise: '#1B2A4A',
  service_lsp: '#00B4D8',
}

export const DP_LABELS: Record<string, string> = {
  phase_0: 'Phase 0 — Assumption Clearing',
  dp01: 'DP01 — Service Reality Audit',
  dp02: 'DP02 — Customer & Problem Clarity',
  dp03: 'DP03 — Value Proposition Architecture',
  dp04: 'DP04 — Commercial Viability Model',
  dp05: 'DP05 — Market Entry Design',
  dp06: 'DP06 — Identity & Partner Architecture',
  dp07: 'DP07 — Pilot & Learn Architecture',
  dp08: 'DP08 — Scale & Expansion Pathway',
  dp09: 'DP09 — Commercial Readiness Diagnostic',
}

export const STATUS_ORDER: EngagementStatus[] = [
  'setup','phase_0','dp01','dp02','dp03','dp04',
  'dp05','dp06','dp07','dp08','dp09','complete','paused'
]

export function statusLabel(s: EngagementStatus): string {
  if (s === 'setup') return 'Setting Up'
  if (s === 'complete') return 'Complete'
  if (s === 'paused') return 'Paused'
  if (s === 'phase_0') return 'Phase 0'
  return s.toUpperCase().replace('_','-')
}

export function statusColor(s: EngagementStatus): string {
  if (s === 'complete') return '#1A7A4A'
  if (s === 'paused') return '#8B2E2E'
  if (s === 'setup') return '#4A5A6A'
  return '#00B4D8'
}

// Default state — pre-loaded with known clients
export function defaultCoachState(): CoachState {
  return {
    programmes: [
      {
        id: 'csj', name: 'Palladium CSJ', type: 'donor_programme',
        funder: 'FCDO', country: 'Uganda', startDate: '2025-01-01',
        endDate: '2026-12-31', notes: 'CSJ/Wiigot Northern Uganda programme',
        clientIds: ['conas','wonderland','kenali','viester','konya'],
        coImplementerIds: [],
      },
      {
        id: 'ignite', name: 'Ignite', type: 'donor_programme',
        funder: 'Ignite', country: 'Uganda', startDate: '2026-06-01',
        endDate: '2027-05-31', notes: 'GtCV canvas delivery for LSP clients',
        clientIds: ['ikore'],
        coImplementerIds: [],
      },
    ],
    clients: [
      {
        id: 'conas', name: 'CONAS Agricultural Hub', slug: 'conas',
        type: 'crop_aggregator', programmeId: 'csj',
        country: 'Uganda', sector: 'Agricultural Services',
        contactName: '', contactEmail: '', contactPhone: '',
        status: 'dp04', dpStatus: { phase_0:'✓', dp01:'✓', dp02:'✓', dp03:'✓', dp04:'◐' },
        startDate: '2025-06-01', expectedClose: '2026-06-30',
        clearviewActive: true, notes: 'Clearview live. Five input profit centres. 20 FGEs.',
      },
      {
        id: 'wonderland', name: 'Wonderland Farm Services', slug: 'wonderland',
        type: 'crop_aggregator', programmeId: 'csj',
        country: 'Uganda', sector: 'Agricultural Services',
        contactName: 'Bernard', contactEmail: '', contactPhone: '',
        status: 'dp04', dpStatus: { phase_0:'✓', dp01:'✓', dp02:'✓', dp03:'✓', dp04:'◐' },
        startDate: '2025-06-01', expectedClose: '2026-06-30',
        clearviewActive: true, notes: 'Bernard (CEO). Input business + FGE aggregation.',
      },
      {
        id: 'kenali', name: 'Kenali Group', slug: 'kenali',
        type: 'livestock_aggregator', programmeId: 'csj',
        country: 'Uganda', sector: 'Livestock',
        contactName: 'Kenneth Opio', contactEmail: '', contactPhone: '',
        status: 'dp02', dpStatus: { phase_0:'✓', dp01:'✓', dp02:'◐' },
        startDate: '2025-06-01', expectedClose: '2026-12-31',
        clearviewActive: false, notes: 'Kenneth Opio (MD). Goat aggregation.',
      },
      {
        id: 'viester', name: 'Viester Animal Breeding Farm', slug: 'viester',
        type: 'livestock_aggregator', programmeId: 'csj',
        country: 'Uganda', sector: 'Livestock',
        contactName: 'Ogenrwoth Victor', contactEmail: '', contactPhone: '',
        status: 'dp02', dpStatus: { phase_0:'✓', dp01:'✓', dp02:'◐' },
        startDate: '2025-06-01', expectedClose: '2026-12-31',
        clearviewActive: false, notes: 'Ogenrwoth Victor (Executive Director). Goat aggregation.',
      },
      {
        id: 'konya', name: 'Konya FGE', slug: 'konya',
        type: 'farmer_group_enterprise', programmeId: 'csj',
        country: 'Uganda', sector: 'Agricultural Equipment',
        contactName: '', contactEmail: '', contactPhone: '',
        status: 'dp01', dpStatus: { phase_0:'✓', dp01:'◐' },
        startDate: '2025-06-01', expectedClose: '2026-12-31',
        clearviewActive: false, notes: 'Acholi region. Equipment-based FGE.',
      },
      {
        id: 'ikore', name: 'Ikore', slug: 'ikore',
        type: 'service_lsp', programmeId: 'ignite',
        country: 'Uganda', sector: 'Advisory Services',
        contactName: '', contactEmail: '', contactPhone: '',
        status: 'setup', dpStatus: {},
        startDate: '2026-06-01', expectedClose: '2027-05-31',
        clearviewActive: false, notes: 'Ignite programme. Service LSP.',
      },
    ],
    coImplementers: [],
  }
}
