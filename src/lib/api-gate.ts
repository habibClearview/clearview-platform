// ============================================================
// The gate every /api/v1 route goes through.
//
// 20 September 2026.
//
// One place decides: is this a real key, is it still alive, is it allowed to
// do this, and is it calling too often. Written once here rather than repeated
// per route, because a check that is repeated is a check that will eventually
// be repeated wrong.
//
// Every refusal answers in the same shape, with a message written for the
// developer on the other end rather than for a log:
//
//   { "error": "...", "detail": "..." }
//
// and never says anything that would help somebody guess a key.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '@/lib/auth/api-authz'
import { checkRateLimit } from '@/lib/rate-limit'
import { ApiKeyRow, Scope, keyRefusal, hasScope, resolveApiKey } from '@/lib/api-keys'

/** Calls allowed per key per minute. Generous for a till, mean for a flood. */
export const RATE_LIMIT_PER_MINUTE = 120
export const RATE_WINDOW_SECONDS = 60

// Every /api/v1 route reaches the database through the one admin client the
// rest of the platform already uses, rather than making its own. It bypasses
// row level security, which is exactly why the gate below runs first and no
// route is allowed to call this directly.
export interface Gated {
  key: ApiKeyRow
  supabase: SupabaseClient<any, any, any>
}

export function apiError(status: number, error: string, detail: string) {
  return NextResponse.json({ error, detail }, { status })
}

/**
 * Resolves and checks the caller. Returns either the key and a database
 * client, or the response to send back. A route must handle both:
 *
 *   const gate = await requireApiKey(req, 'sales.write')
 *   if ('status' in gate) return gate
 *
 * Order matters. The key is identified before the rate limit is applied, so
 * one noisy integration cannot exhaust anybody else's allowance, and an
 * unidentifiable caller is turned away before any counting happens at all.
 */
export async function requireApiKey(
  req: NextRequest,
  scope: Scope,
): Promise<Gated | NextResponse> {
  const supabase = getAdminClient() as SupabaseClient<any, any, any>
  const key = await resolveApiKey(supabase, req.headers.get('authorization'))

  const refusal = keyRefusal(key)
  if (refusal === 'unknown') {
    return apiError(401, 'unauthorized',
      'No usable key was sent. Send your key as an Authorization header: "Authorization: Bearer cv_live_...".')
  }
  if (refusal === 'revoked') {
    return apiError(401, 'key_revoked',
      'This key has been withdrawn. Ask the coach who issued it for a new one.')
  }
  if (refusal === 'expired') {
    return apiError(401, 'key_expired',
      'This key has passed its expiry date. Ask the coach who issued it for a new one.')
  }

  const live = key as ApiKeyRow

  const limit = await checkRateLimit(
    supabase, `apiv1:${live.id}`, RATE_LIMIT_PER_MINUTE, RATE_WINDOW_SECONDS,
  )
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', detail: `This key may make ${RATE_LIMIT_PER_MINUTE} calls a minute. Send fewer, larger batches.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    )
  }

  if (!hasScope(live, scope)) {
    return apiError(403, 'forbidden',
      `This key is not allowed to do that. It would need the "${scope}" permission, which is granted by the coach when the key is created.`)
  }

  return { key: live, supabase }
}

/**
 * Records that a key was used. Never blocks the answer and never fails the
 * request: a key whose counter could not be written is still a key that
 * worked, and telling the caller otherwise would be a lie.
 */
export async function noteKeyUse(supabase: any, keyId: string): Promise<void> {
  try {
    await supabase.rpc('note_api_key_use', { p_key_id: keyId })
  } catch (e) {
    console.error('Could not record API key use:', e)
  }
}

/** Parses a JSON body, answering null rather than throwing on rubbish. */
export async function readJson(req: NextRequest): Promise<any | null> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

/**
 * The list a write endpoint was given. Accepts either a bare array or an
 * object with a named list, because both are things a developer will try, and
 * refusing one of them teaches nothing.
 */
export function itemsFrom(body: any, field: string): any[] | null {
  if (Array.isArray(body)) return body
  if (body && Array.isArray(body[field])) return body[field]
  return null
}

/** How many items one call may carry. Beyond this the answer is a refusal. */
export const MAX_BATCH = 500

/**
 * Whether the business unit this key writes to is still switched on.
 *
 * GET /api/v1/model checked this and the write paths did not, so a coach who
 * switched a whole business unit off, expecting that to cut the connection,
 * would have found sales still posting for as long as any individual product
 * stayed active. Switching a unit off has to mean the same thing everywhere,
 * or it means nothing.
 *
 * Takes the config row when the caller already loaded it, so a route that
 * needs the plan lines anyway does not read the same row twice.
 */
export async function unitIsActive(
  supabase: any,
  clientId: string,
  unitId: string,
  loaded?: { business_units?: unknown } | null,
): Promise<boolean> {
  let row = loaded
  if (!row) {
    const { data } = await supabase
      .from('generic_model_config')
      .select('business_units')
      .eq('client_id', clientId)
      .maybeSingle()
    row = data
  }
  const units = (row?.business_units as any[]) || []
  return units.some((u) => u?.id === unitId && u?.active)
}

/** The same refusal wherever that check fails. */
export function unitUnavailable() {
  return apiError(409, 'unit_unavailable',
    'The business unit this key writes to has been switched off. Ask the coach who issued the key.')
}
