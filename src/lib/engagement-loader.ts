// ============================================================
// Engagement view loader (read-only, no React).
//
// loadEngagementView(slugOrId) assembles the full engagement into one typed
// EngagementView: the engagement_clients row plus the whole GtCV commercial
// layer (config, parties, deliverables, gate map, latest charter + its
// comments and signatures, meetings) and the per-DP gate status read from the
// EXISTING canvas tables (canvas_decision_points).
//
// It uses the browser Supabase client, so every read is RLS-scoped to the
// signed-in viewer, exactly like app/dashboard/[slug]/page.tsx. Pure data
// assembly: it fetches, maps and returns, and never renders anything.
//
// Everything is CONFIG driven. No client, person, place or currency is
// hardcoded here; the same loader serves any engagement.
// ============================================================
import { supabase } from '@/lib/supabase'
import {
  CANVAS_DP_IDS,
  type DpId,
  type EngagementView,
  type EngagementClientSummary,
  type EngagementConfig,
  type EngagementParty,
  type EngagementDeliverable,
  type DeliverableGateMap,
  type EngagementCharter,
  type CharterComment,
  type CharterSignature,
  type EngagementMeeting,
  type GateStatusValue,
  type DpGateStatus,
} from '@/lib/engagement-types'

// The canvas_decision_points.status symbols (see coach-types.ts DPStatus)
// mapped to plain-language gate status. A missing row defaults to not_started.
function gateStatusFromSymbol(symbol: string | null | undefined): GateStatusValue {
  switch (symbol) {
    case '✓': return 'complete'      // check mark
    case '◐': return 'in_progress'   // half circle
    case '⚠': return 'blocked'       // warning sign
    default: return 'not_started'         // open circle or no row
  }
}

// The DP the engagement is working now: the first in-progress gate; failing
// that, the first not-started gate that immediately follows a completed one
// (so a fresh, all-not-started engagement returns null, not Decision Point 1). null once
// everything is complete or nothing has started.
function deriveCurrentDp(status: Record<DpId, GateStatusValue>): DpId | null {
  const inProgress = CANVAS_DP_IDS.find((id) => status[id] === 'in_progress')
  if (inProgress) return inProgress
  for (let i = 0; i < CANVAS_DP_IDS.length; i++) {
    const id = CANVAS_DP_IDS[i]
    if (status[id] !== 'complete') {
      const prev = i > 0 ? CANVAS_DP_IDS[i - 1] : null
      if (prev && status[prev] === 'complete') return id
    }
  }
  return null
}

/**
 * Resolve the engagement_clients row from either its slug or its (text) id.
 * Tries slug first, then id, so a caller can pass whichever it holds.
 */
async function resolveClient(slugOrId: string): Promise<EngagementClientSummary | null> {
  const cols = 'id,slug,name,status,programme_id,engagement_mode'
  const bySlug = await supabase
    .from('engagement_clients')
    .select(cols)
    .eq('slug', slugOrId)
    .maybeSingle()
  if (bySlug.data) return bySlug.data as EngagementClientSummary
  const byId = await supabase
    .from('engagement_clients')
    .select(cols)
    .eq('id', slugOrId)
    .maybeSingle()
  if (byId.data) return byId.data as EngagementClientSummary
  return null
}

/**
 * Assemble the full engagement view for a slug or id. Returns null only when
 * the client row cannot be resolved (not found, or not visible to the viewer
 * under RLS). Every other table degrades to an empty list / null rather than
 * throwing, so a partially configured engagement still renders.
 */
export async function loadEngagementView(slugOrId: string): Promise<EngagementView | null> {
  if (!slugOrId) return null

  const client = await resolveClient(slugOrId)
  if (!client) return null
  const clientId = client.id

  // Everything scoped by client_id can load in parallel.
  const [
    programmeRes,
    configRes,
    partiesRes,
    deliverablesRes,
    gateMapRes,
    charterRes,
    meetingsRes,
    canvasRes,
  ] = await Promise.all([
    client.programme_id
      ? supabase.from('programmes').select('name').eq('id', client.programme_id).maybeSingle()
      : Promise.resolve({ data: null } as { data: { name: string } | null }),
    supabase.from('engagement_config').select('*').eq('client_id', clientId).maybeSingle(),
    supabase.from('engagement_parties').select('*').eq('client_id', clientId).order('sort_order'),
    supabase.from('engagement_deliverables').select('*').eq('client_id', clientId).order('sort_order'),
    supabase.from('deliverable_gate_map').select('*').eq('client_id', clientId),
    supabase
      .from('engagement_charters')
      .select('*')
      .eq('client_id', clientId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('engagement_meetings').select('*').eq('client_id', clientId).order('starts_at'),
    // Gate status source: the EXISTING canvas tables. dp_id and status
    // (DPStatus symbol) are all the journey page needs.
    supabase.from('canvas_decision_points').select('dp_id,status,label,ceo_signed_off').eq('client_id', clientId),
  ])

  const programme_name = (programmeRes.data as { name: string } | null)?.name ?? null
  const config = (configRes.data as EngagementConfig | null) ?? null
  const parties = (partiesRes.data as EngagementParty[] | null) ?? []
  const deliverables = (deliverablesRes.data as EngagementDeliverable[] | null) ?? []
  const gate_map = (gateMapRes.data as DeliverableGateMap[] | null) ?? []
  const charter = (charterRes.data as EngagementCharter | null) ?? null
  const meetings = (meetingsRes.data as EngagementMeeting[] | null) ?? []
  const canvasRows = (canvasRes.data as { dp_id: string; status: string | null; label: string | null; ceo_signed_off: boolean | null }[] | null) ?? []

  // The latest charter's comments and signatures depend on its id, so they
  // load once the charter is known. Both degrade to [] when there is no
  // charter yet.
  let charter_comments: CharterComment[] = []
  let signatures: CharterSignature[] = []
  if (charter) {
    const [commentsRes, sigRes] = await Promise.all([
      supabase
        .from('charter_comments')
        .select('*')
        .eq('charter_id', charter.id)
        .order('created_at'),
      supabase
        .from('charter_signatures')
        .select('*')
        .eq('charter_id', charter.id)
        .order('signed_at'),
    ])
    charter_comments = (commentsRes.data as CharterComment[] | null) ?? []
    signatures = (sigRes.data as CharterSignature[] | null) ?? []
  }

  // Per-DP gate status. Default EVERY canvas DP to not_started, then overlay
  // whatever real canvas_decision_points rows exist. If canvas rows never
  // load, the whole canvas correctly shows not_started rather than a guess.
  // TODO: canvas_decision_points is the current source of gate status. If a
  // future engagement stores gate status elsewhere, extend this overlay.
  const byDp = new Map(canvasRows.map((r) => [r.dp_id, r]))
  const gate_status = {} as Record<DpId, GateStatusValue>
  const gate_detail: DpGateStatus[] = []
  for (const id of CANVAS_DP_IDS) {
    const row = byDp.get(id)
    const status = gateStatusFromSymbol(row?.status)
    gate_status[id] = status
    gate_detail.push({
      dp_id: id,
      status,
      raw_symbol: row?.status ?? null,
      label: row?.label ?? null,
      ceo_signed_off: !!row?.ceo_signed_off,
    })
  }

  const current_dp_id = deriveCurrentDp(gate_status)

  // A failed read and an engagement with nothing recorded look identical once
  // the rows are gone, so the failures are carried out with the view. A page
  // that shows every gate as not started when the gate query failed is telling
  // the coach something untrue about their engagement, and telling it
  // confidently. Callers show a warning when this list is not empty.
  const load_errors = [
    ['configuration', configRes.error],
    ['parties', partiesRes.error],
    ['deliverables', deliverablesRes.error],
    ['the deliverable mapping', gateMapRes.error],
    ['the Charter', charterRes.error],
    ['meetings', meetingsRes.error],
    ['the gate status', canvasRes.error],
  ]
    .filter(([, e]) => Boolean(e))
    .map(([what]) => what as string)

  if (load_errors.length > 0) {
    console.error('loadEngagementView: some queries failed', load_errors)
  }

  return {
    client,
    programme_name,
    config,
    parties,
    deliverables,
    gate_map,
    charter,
    charter_comments,
    signatures,
    meetings,
    gate_status,
    gate_detail,
    current_dp_id,
    load_errors,
  }
}
