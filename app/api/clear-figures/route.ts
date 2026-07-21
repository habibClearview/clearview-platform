// ============================================================
// API ROUTE: /api/clear-figures
// Server-side, authenticated "Clear all figures for this business".
//
// This wipes every figure feeding a client's statements — the whole plan,
// opening cash, capital structure, working capital, drivers (in the model
// config), every posted monthly figure in generic_actuals (INCLUDING the
// Clearview Field values), and all market events — while keeping the business
// shell (units, currency, dates, prefs).
//
// WHY A SERVER ROUTE, not a browser Supabase call: this is irreversible data
// destruction. RLS on generic_actuals/generic_market_events lets ANY user tied
// to the client's engagement_client_id write/delete — so a UI-only role check
// (a disabled button) could be bypassed from dev tools by a junior/viewer
// account and destroy financial history. This route is the gatekeeper: it
// authenticates the caller, re-derives their role from the database (never from
// the request), requires an approver role (super_coach / coach / ceo) AND that
// they may actually see this client, and only then performs the wipe with the
// service role. Each write is scoped to the one client_id.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken, requesterCanViewClient } from '@/lib/auth/api-authz'
import { clearedBusinessFigures, type GenericModelConfig } from '@/lib/generic-engine'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Only these roles may clear a business's figures. Mirrors the dashboard gate,
// but enforced here where it cannot be bypassed.
const APPROVER_ROLES = ['super_coach', 'coach', 'ceo']

export async function POST(req: NextRequest) {
  try {
    const { clientId } = (await req.json()) as { clientId?: string }
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const token = getBearerToken(req)
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const admin = getAdminClient()

    // 1) Authenticate the caller from their token.
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // 2) Re-derive the caller's role server-side (never trust the browser).
    const { data: actor, error: actorErr } = await admin
      .from('user_profiles').select('role').eq('id', user.id).single()
    if (actorErr || !actor) {
      if (actorErr) console.error('clear-figures — actor lookup error:', actorErr)
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // 3) Authorize: an approver role AND actually scoped to this client
    //    (super_coach sees all; ceo only their own; coach only assigned — the
    //    can_view_client RLS policy decides scope via the caller's own token).
    const roleOk = APPROVER_ROLES.includes(actor.role)
    const scopeOk = await requesterCanViewClient(token, clientId)
    if (!roleOk || !scopeOk) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // 4) Perform the wipe (service role, each write scoped to this client).
    //    4a) Clear the config-resident figures, keeping the shell.
    const { data: cfgRow, error: cfgReadErr } = await admin
      .from('generic_model_config').select('*').eq('client_id', clientId).maybeSingle()
    if (cfgReadErr) { console.error('clear-figures — config read error:', cfgReadErr); return NextResponse.json({ error: 'Could not clear figures' }, { status: 500 }) }
    if (cfgRow) {
      const current: GenericModelConfig = {
        client_id: cfgRow.client_id, business_name: cfgRow.business_name, currency: cfgRow.currency,
        start_date: cfgRow.start_date, planning_months: cfgRow.planning_months,
        business_units: cfgRow.business_units || [], plan_lines: cfgRow.plan_lines || [],
        shared_lines: cfgRow.shared_lines || [], settings: cfgRow.settings || {},
      }
      const cleared = clearedBusinessFigures(current)
      const { error: cfgWriteErr } = await admin.from('generic_model_config').update({
        plan_lines: cleared.plan_lines, shared_lines: cleared.shared_lines,
        settings: cleared.settings, updated_at: new Date().toISOString(), updated_by: user.id,
      }).eq('client_id', clientId)
      if (cfgWriteErr) { console.error('clear-figures — config write error:', cfgWriteErr); return NextResponse.json({ error: 'Could not clear figures' }, { status: 500 }) }
    }

    // 4b) Blank every posted monthly figure in ONE bulk statement — manual
    //     entries, catalogue quantities AND Clearview Field values.
    const { error: actErr } = await admin.from('generic_actuals').update({
      line_values: {}, catalogue_quantities: {}, field_line_values: {},
      submitted: false, approved: false, approved_at: null, approved_by: null,
      review_note: null, updated_at: new Date().toISOString(),
    }).eq('client_id', clientId)
    if (actErr) { console.error('clear-figures — actuals clear error:', actErr); return NextResponse.json({ error: 'Could not clear posted figures' }, { status: 500 }) }

    // 4c) Remove market events for this client.
    const { error: evtErr } = await admin.from('generic_market_events').delete().eq('client_id', clientId)
    if (evtErr) { console.error('clear-figures — market events delete error:', evtErr); return NextResponse.json({ error: 'Could not clear market events' }, { status: 500 }) }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('clear-figures — unexpected error:', e)
    return NextResponse.json({ error: 'Could not clear figures' }, { status: 500 })
  }
}
