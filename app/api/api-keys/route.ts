// ============================================================
// API ROUTE: /api/api-keys
//
// Where a coach issues, lists and withdraws the keys an outside system uses.
// 20 September 2026.
//
// THE ONE RULE THAT SHAPES THIS FILE.
//
// A key is shown exactly once, in the answer to the call that creates it, and
// is never obtainable again from anywhere. Only its hash is stored. A coach
// who loses a key withdraws it and issues another, which takes ten seconds and
// is the honest cost of a store that cannot leak working keys.
//
// So GET never returns a key, and there is deliberately no endpoint that
// could.
//
// Creating a key also creates the field operator that owns its writes, so
// everything it sends travels the same path a phone's entries travel and is
// visible to a coach in the same places.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/auth/api-authz'
import { resolveFieldAdminActor, actorMayAccessClient, actorMayManageTeam } from '@/lib/auth/field-admin-authz'
import { generateKey, cleanScopes } from '@/lib/api-keys'

export const dynamic = 'force-dynamic'

/** Keys for one client. Never includes a key itself. */
export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('client_id')
    if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

    const supabase = getAdminClient()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!actorMayAccessClient(actor, clientId)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('api_keys')
      .select('id, label, key_prefix, business_unit_id, scopes, created_at, expires_at, revoked_at, last_used_at, use_count')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) throw error

    // How many items are sitting in the holding pen, because a coach looking
    // at this screen is the person who needs to know.
    const { count: waiting } = await supabase
      .from('api_inbox')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .is('resolved_at', null)

    return NextResponse.json({ keys: data || [], waiting_in_inbox: waiting || 0 })
  } catch (err) {
    console.error('GET /api/api-keys failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/** Issue a key. The only moment the key itself exists outside the sender. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const clientId = body?.client_id
    const businessUnitId = body?.business_unit_id
    const label = typeof body?.label === 'string' ? body.label.trim() : ''
    const scopes = cleanScopes(body?.scopes)
    const expiresInDays = Number(body?.expires_in_days)

    if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })
    if (!businessUnitId) return NextResponse.json({ error: 'business_unit_id required' }, { status: 400 })
    if (!label) return NextResponse.json({ error: 'Give the key a name so you can recognise it later' }, { status: 400 })

    const supabase = getAdminClient()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!actorMayAccessClient(actor, clientId)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    // Issuing a key is handing someone the ability to write into this
    // business's figures, which is the same weight as adding a person to the
    // team, so it takes the same right.
    if (!actorMayManageTeam(actor)) {
      return NextResponse.json({ error: 'Only a coach or the business owner may issue a key' }, { status: 403 })
    }

    // The operator that will own every write this key makes.
    const { data: operator, error: opErr } = await supabase
      .from('field_operators')
      .insert({
        client_id: clientId,
        business_unit_id: businessUnitId,
        display_name: label,
        role: 'system',
        sync_frequency: 'real_time',
        active: true,
      })
      .select('id')
      .single()
    if (opErr || !operator) {
      console.error('Could not create the operator behind an API key:', opErr?.message)
      return NextResponse.json({ error: 'Could not create the key' }, { status: 500 })
    }

    const { key, hash, prefix } = generateKey()
    const expiresAt = Number.isFinite(expiresInDays) && expiresInDays > 0
      ? new Date(Date.now() + expiresInDays * 86400_000).toISOString()
      : null

    const { data: row, error } = await supabase
      .from('api_keys')
      .insert({
        client_id: clientId,
        business_unit_id: businessUnitId,
        operator_id: operator.id,
        label,
        key_prefix: prefix,
        key_hash: hash,
        scopes,
        // created_by is left unset. The shared actor this route authenticates
        // with carries a role and a client, not the signed-in user's id, and
        // widening it is a change to code every field admin route depends on.
        // The column stays for when that id is available here.
        expires_at: expiresAt,
      })
      .select('id, label, key_prefix, business_unit_id, scopes, created_at, expires_at')
      .single()

    if (error) {
      // The key row failed, so the operator it would have owned is an orphan
      // that would otherwise sit on the Field Operators screen forever.
      await supabase.from('field_operators').delete().eq('id', operator.id)
      console.error('Could not store an API key:', error.message)
      return NextResponse.json({ error: 'Could not create the key' }, { status: 500 })
    }

    return NextResponse.json({
      key_record: row,
      // Shown once. There is no way to see it again.
      key,
      warning: 'Copy this key now. It is not stored and cannot be shown again. If it is lost, withdraw it and issue another.',
    })
  } catch (err) {
    console.error('POST /api/api-keys failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/** Withdraw a key. Takes effect on the next call the holder makes. */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const supabase = getAdminClient()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // Which client this key belongs to is read from the key, never from the
    // request, so a caller cannot name a client they may reach in order to
    // withdraw a key belonging to one they may not.
    const { data: existing } = await supabase
      .from('api_keys')
      .select('id, client_id, operator_id')
      .eq('id', id)
      .maybeSingle()
    if (!existing) return NextResponse.json({ error: 'No such key' }, { status: 404 })
    if (!actorMayAccessClient(actor, existing.client_id) || !actorMayManageTeam(actor)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { error } = await supabase
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    // The operator goes quiet too, so a withdrawn key cannot keep writing
    // through the path it owns.
    await supabase.from('field_operators').update({ active: false }).eq('id', existing.operator_id)

    return NextResponse.json({ revoked: true })
  } catch (err) {
    console.error('DELETE /api/api-keys failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
