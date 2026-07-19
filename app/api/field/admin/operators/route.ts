import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { resolveFieldAdminActor, actorMayAccessClient } from '@/lib/auth/field-admin-authz'

// Lazy init -- must never call createClient() at module level on Vercel.
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase environment variables not configured')
  return createClient(url, key)
}

function generateToken(): string {
  return randomBytes(24).toString('hex')
}

// ── GET: list operators (+ their active tokens) for a client ──
export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('client_id')
    if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

    const supabase = getSupabase()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!actorMayAccessClient(actor, clientId)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    // Tokens ARE returned here (the dashboard needs them to show each operator's
    // field link), but only now that the caller is authenticated AND confined to
    // their own business — so this is a business admin seeing their own
    // operators' links, not the previous open, cross-tenant credential dump.
    const { data: operators, error } = await supabase
      .from('field_operators')
      .select('*, tokens:field_operator_tokens(id, token, expires_at, last_used_at, created_at)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ operators: operators || [] })
  } catch (err: any) {
    console.error('Field admin GET error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ── POST: create an operator and issue its first token ──
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { client_id, business_unit_id, display_name, phone, role, sync_frequency, expires_in_days } = body

    if (!client_id) return NextResponse.json({ error: 'client_id required' }, { status: 400 })
    if (!business_unit_id) return NextResponse.json({ error: 'business_unit_id required' }, { status: 400 })
    if (!display_name) return NextResponse.json({ error: 'display_name required' }, { status: 400 })

    const supabase = getSupabase()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!actorMayAccessClient(actor, client_id)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const { data: operator, error: opErr } = await supabase
      .from('field_operators')
      .insert({
        client_id, business_unit_id,
        display_name: String(display_name).trim(),
        phone: phone || null,
        role: role || 'field_operator',
        active: true,
        sync_frequency: sync_frequency || 'end_of_day',
      })
      .select()
      .single()

    if (opErr) throw opErr

    const expiresAt = expires_in_days
      ? new Date(Date.now() + Number(expires_in_days) * 24 * 60 * 60 * 1000).toISOString()
      : null

    const { data: tokenRow, error: tokenErr } = await supabase
      .from('field_operator_tokens')
      .insert({
        token: generateToken(),
        operator_id: operator.id,
        client_id, business_unit_id,
        expires_at: expiresAt,
      })
      .select()
      .single()

    if (tokenErr) throw tokenErr

    return NextResponse.json({ operator, token: tokenRow }, { status: 201 })
  } catch (err: any) {
    console.error('Field admin POST error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ── PATCH: deactivate/reactivate an operator, or issue a fresh
// token (e.g. after the old one was lost or expired) ──
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { operator_id, active, issue_new_token, expires_in_days } = body
    if (!operator_id) return NextResponse.json({ error: 'operator_id required' }, { status: 400 })

    const supabase = getSupabase()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // Resolve the operator's business up front and authorize against it before
    // any change (this PATCH takes only operator_id, no client_id).
    const { data: opRow, error: opLookupErr } = await supabase
      .from('field_operators')
      .select('client_id, business_unit_id')
      .eq('id', operator_id)
      .single()
    if (opLookupErr || !opRow) return NextResponse.json({ error: 'Operator not found' }, { status: 404 })
    if (!actorMayAccessClient(actor, opRow.client_id)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    if (active !== undefined) {
      const { error } = await supabase
        .from('field_operators')
        .update({ active: !!active, updated_at: new Date().toISOString() })
        .eq('id', operator_id)
      if (error) throw error
    }

    let newToken = null
    if (issue_new_token) {
      const expiresAt = expires_in_days
        ? new Date(Date.now() + Number(expires_in_days) * 24 * 60 * 60 * 1000).toISOString()
        : null

      const { data: tokenRow, error: tokenErr } = await supabase
        .from('field_operator_tokens')
        .insert({
          token: generateToken(),
          operator_id,
          client_id: opRow.client_id,
          business_unit_id: opRow.business_unit_id,
          expires_at: expiresAt,
        })
        .select()
        .single()
      if (tokenErr) throw tokenErr
      newToken = tokenRow
    }

    return NextResponse.json({ success: true, token: newToken })
  } catch (err: any) {
    console.error('Field admin PATCH error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
