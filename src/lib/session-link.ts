// ============================================================
// Resolving a session link.
//
// This is the only thing standing between a link passed round a room and the
// engagement behind it, so it is written the same way as the showcase loader:
// an allowlist of what may leave, and the same answer for every kind of
// failure.
//
// WHAT A SESSION LINK IS. One block, one session, one engagement, until it
// expires. Whoever holds it can add what they think and read what the room has
// added in that session. Nothing else.
//
// WHAT IT CANNOT REACH. The block's working tables. The evidence. The Charter,
// the signatures, the parties, the deliverables, the fee, any other block, any
// other engagement. None of those are read here, so none of them can be
// returned by a page that only receives what this returns.
//
// EVERY FAILURE LOOKS THE SAME. A token that never existed, one that was
// revoked, one that has expired, one issued for something other than a session,
// and an engagement that has been deleted all return null. Telling a stranger
// which of those it was tells them something about a token they do not hold.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { gateLabel } from '@/lib/gtcv-gates'
import { normaliseJoinCode } from '@/lib/join-code'

/** The grant type that marks a link as a session capture link. */
export const SESSION_GRANT_TYPE = 'gtcv_session'

export interface SessionLinkView {
  clientId: string
  /** The organisation, so the room knows whose session they are in. */
  organisation: string | null
  dpId: string
  /** The method's name for the block, so the page can title itself. */
  blockLabel: string | null
  sessionId: string | null
  /** The session's own title and purpose, when it was issued against one. */
  sessionTitle: string | null
  sessionPurpose: string | null
  expiresAt: string | null
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function loadSessionLink(token: string): Promise<SessionLinkView | null> {
  if (!token || typeof token !== 'string' || token.length < 16 || token.length > 200) return null

  const admin = getAdminClient()

  const { data: grant, error } = await admin
    .from('client_access_grants')
    .select('id, client_id, grant_type, expires_at, revoked_at, scope_dp_id, scope_session_id')
    .eq('access_token', token)
    .maybeSingle()

  if (error) {
    console.error('loadSessionLink: grant lookup failed', error)
    return null
  }
  if (!grant || !grant.client_id) return null
  if (grant.grant_type !== SESSION_GRANT_TYPE) return null
  if (grant.revoked_at) return null
  if (grant.expires_at && new Date(grant.expires_at).getTime() <= Date.now()) return null
  // A session link with no block is not a session link. Refusing here means a
  // grant row edited into the wrong shape opens nothing rather than everything.
  if (!grant.scope_dp_id) return null

  const [{ data: client }, { data: session }] = await Promise.all([
    admin.from('engagement_clients').select('name').eq('id', grant.client_id).maybeSingle(),
    grant.scope_session_id
      ? admin.from('gtcv_sessions').select('title, purpose, client_id')
          .eq('id', grant.scope_session_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (!client) return null

  // A session that belongs to a different engagement is not this one's, whatever
  // the grant says. Checked rather than trusted, because the pair is what makes
  // the scope meaningful.
  const ownSession = session && (session as { client_id?: string }).client_id === grant.client_id
    ? (session as { title: string | null; purpose: string | null })
    : null

  // Record that the link was opened. Useful to the coach, invisible to the room,
  // and never a reason to refuse the page.
  await admin
    .from('client_access_grants')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('id', grant.id)
    .then(({ error: e }) => { if (e) console.error('loadSessionLink: access stamp failed', e) })

  return {
    clientId: grant.client_id,
    organisation: client.name ?? null,
    dpId: grant.scope_dp_id,
    blockLabel: gateLabel(grant.scope_dp_id),
    sessionId: grant.scope_session_id ?? null,
    sessionTitle: ownSession?.title ?? null,
    sessionPurpose: ownSession?.purpose ?? null,
    expiresAt: grant.expires_at ?? null,
  }
}

/**
 * Turn a code somebody typed into the session token it stands for.
 *
 * WHY THIS SITS HERE rather than in the route. It is the same job as
 * loadSessionLink: take something a stranger handed us and decide, carefully
 * and with one answer for every failure, what it opens. Both belong in the one
 * file that is written to be read that way, so a change to how a session is
 * resolved cannot be made in one place and forgotten in the other.
 *
 * THE CODE IS THE AUTHORISATION, and it is a weak one on its own, so it is
 * never the whole story. The caller must rate limit before this is reached; a
 * short code with no ceiling on attempts is a code that gets guessed. The route
 * that calls this does both, and says so.
 *
 * WHAT IT RETURNS. The long token, or null. Never the engagement, never the
 * block, never the organisation. Somebody who guessed a code should learn
 * nothing from this answer that they did not already have; what the session
 * actually is comes from loadSessionLink afterwards, on the page itself.
 */
export async function resolveJoinCode(code: string | null | undefined): Promise<string | null> {
  const clean = normaliseJoinCode(code)
  if (!clean) return null

  const admin = getAdminClient()
  const { data: grant, error } = await admin
    .from('client_access_grants')
    .select('access_token, grant_type, expires_at, revoked_at, scope_dp_id')
    .eq('join_code', clean)
    .is('revoked_at', null)
    .maybeSingle()

  if (error) {
    console.error('resolveJoinCode: lookup failed', error)
    return null
  }
  if (!grant) return null
  if (grant.grant_type !== SESSION_GRANT_TYPE) return null
  // A session link with no block is not a session link, the same rule the
  // token path applies.
  if (!grant.scope_dp_id) return null
  if (grant.expires_at && new Date(grant.expires_at).getTime() <= Date.now()) return null

  return grant.access_token ?? null
}
