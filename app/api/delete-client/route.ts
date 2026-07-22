// ============================================================
// API ROUTE: /api/delete-client
// Permanently deletes a client organisation and its dependent records.
//
// Why this exists: the coach dashboard used to delete a client from the
// browser by removing only two child tables and then the client row — WITHOUT
// checking the result. When a client had records in a table with a RESTRICT
// foreign key (market events, Clair chats, the user_profiles login bridge),
// the client delete silently failed but the UI still hid the client, so it
// "came back" on the next login. This route deletes ALL dependents in a safe
// order using the service role, then the client, and returns whether it truly
// succeeded. Owner-level action: super_coach only.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken } from '@/lib/auth/api-authz'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  try {
    const { clientId } = (await req.json()) as { clientId?: string }
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const token = getBearerToken(req)
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const admin = getAdminClient()
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // Only a super_coach may delete a whole client organisation.
    const { data: actor } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
    if (!actor || actor.role !== 'super_coach') return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    // Best-effort delete of a dependent table by its client column. A table
    // that doesn't exist on this environment (42P01) is fine — skip it. Other
    // errors are logged but not fatal here; if something truly still blocks the
    // client row, the final delete below surfaces it.
    const del = async (table: string, col: string) => {
      const { error } = await admin.from(table).delete().eq(col, clientId)
      if (error && error.code !== '42P01') console.warn(`delete-client: clearing ${table} failed: ${error.code} ${error.message}`)
    }

    // Clair chat: messages reference conversations, so clear messages first.
    await del('clair_messages', 'client_id')
    await del('clair_conversations', 'client_id')
    // Market events (NOT NULL FK — the usual blocker).
    await del('generic_market_events', 'client_id')
    // Field app data.
    await del('field_transactions', 'client_id')
    await del('field_stock_levels', 'client_id')
    await del('field_catalogue', 'client_id')
    await del('field_customers', 'client_id')
    await del('field_operators', 'client_id')
    await del('catalogue_value_lists', 'client_id')
    // Financial model + actuals + close records.
    await del('generic_actuals', 'client_id')
    await del('generic_model_config', 'client_id')
    await del('month_end_closes', 'client_id')
    await del('year_end_closes', 'client_id')
    await del('management_events', 'client_id')
    // Intake links.
    await del('client_intake_links', 'client_id')
    // Logins scoped to this client (revokes access; leaves the auth user, which
    // can do nothing without a profile — same principle as remove-co-implementer).
    await del('user_profiles', 'engagement_client_id')

    // Finally the client itself — THIS result is authoritative.
    const { error: delErr } = await admin.from('engagement_clients').delete().eq('id', clientId)
    if (delErr) {
      console.error('delete-client: final delete failed', delErr.code, delErr.message)
      // Surface the real reason (authenticated super_coach admin action) so a
      // still-blocking table can be added, rather than a silent no-op.
      const detail = [delErr.code, delErr.message].filter(Boolean).join(': ')
      return NextResponse.json({
        error: `Could not delete this client. Something is still linked to it. Reason: ${detail || 'unknown'}`,
      }, { status: 409 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('delete-client: unexpected error', e)
    return NextResponse.json({ error: 'Could not delete this client' }, { status: 500 })
  }
}
