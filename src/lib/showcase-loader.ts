// ============================================================
// The showcase allowlist.
//
// This is the only thing standing between a prospect with a link and an
// engagement's private record, so it is written as an allowlist rather than as
// a set of exclusions. An exclusion list is a promise that you thought of
// everything; an allowlist is a statement of the few things that may leave.
//
// WHAT MAY LEAVE, AND WHY EACH ONE IS SAFE
//   the method                 fixed intellectual property, the same for every
//                              engagement, and the thing being shown off
//   how far along it is        a count of gates closed, not which, and not what
//                              any of them established
//   the programme and country  named only when the engagement has agreed to be
//                              named, and withheld entirely otherwise
//
// WHAT NEVER LEAVES. Party names and email addresses. Signatures and who gave
// them. Evidence entries, their references and their contents. The gate
// synthesis. Comments. The Charter and its wording. Deliverables, amounts,
// claims and every other commercial field. Any identifier that would let a
// reader guess at a row.
//
// WHY THIS RUNS ON THE SERVER. Filtering in the browser filters nothing: the
// data has already been sent by the time anything hides it. The page that uses
// this is a server component and receives only what this function returns, so
// there is no larger payload sitting behind it to be found.
//
// Nothing here is specific to any client. The same link works for any
// engagement that has one issued.
// ============================================================
import { createClient } from '@supabase/supabase-js'

/** The grant type that marks a link as a showcase rather than a real grant. */
export const SHOWCASE_GRANT_TYPE = 'gtcv_showcase'

export interface ShowcaseView {
  /** The organisation's name, or null when the engagement has not agreed to be named. */
  organisation: string | null
  /** The programme, likewise only when naming is agreed. */
  programme: string | null
  /** The country, likewise. */
  country: string | null
  /** How many of the engagement's gates are closed, and how many there are. */
  gatesComplete: number
  gatesTotal: number
  /** Whether the engagement is under way at all, without saying where. */
  underWay: boolean
  /** When the link stops working, so a reader knows it is not permanent. */
  expiresAt: string | null
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * Resolve a showcase token into the allowlisted view, or null.
 *
 * Returns null for every failure: a token that does not exist, one that has
 * been revoked, one that has expired, one issued for something other than a
 * showcase, and an engagement that has not switched showcasing on. The caller
 * shows the same page for all of them, because telling a stranger which of
 * those it was tells them something about a token they do not hold.
 */
export async function loadShowcaseView(token: string): Promise<ShowcaseView | null> {
  if (!token || typeof token !== 'string' || token.length < 16 || token.length > 200) return null

  const admin = getAdminClient()

  const { data: grant, error } = await admin
    .from('client_access_grants')
    .select('id, client_id, grant_type, expires_at, revoked_at')
    .eq('access_token', token)
    .maybeSingle()

  if (error) {
    console.error('loadShowcaseView: grant lookup failed', error)
    return null
  }
  if (!grant || !grant.client_id) return null
  if (grant.grant_type !== SHOWCASE_GRANT_TYPE) return null
  if (grant.revoked_at) return null
  if (grant.expires_at && new Date(grant.expires_at).getTime() <= Date.now()) return null

  // The engagement has to have showcasing switched on. A token alone is not
  // enough, so revoking at the engagement level kills every link at once.
  const { data: config } = await admin
    .from('engagement_config')
    .select('showcase_enabled, showcase_name_client')
    .eq('client_id', grant.client_id)
    .maybeSingle()

  if (!config?.showcase_enabled) return null

  const mayName = Boolean(config.showcase_name_client)

  // Only the columns the allowlist permits are selected. Selecting the row and
  // picking fields afterwards would mean the rest had already been read, and a
  // future edit could easily let one through.
  const [{ data: client }, { data: gates }] = await Promise.all([
    admin.from('engagement_clients')
      .select('name, country, programme_id')
      .eq('id', grant.client_id)
      .maybeSingle(),
    admin.from('canvas_decision_points')
      .select('status')
      .eq('client_id', grant.client_id),
  ])

  let programme: string | null = null
  if (mayName && client?.programme_id) {
    const { data: p } = await admin
      .from('programmes').select('name').eq('id', client.programme_id).maybeSingle()
    programme = p?.name ?? null
  }

  const rows = gates || []
  const gatesComplete = rows.filter((g) => g.status === 'complete').length
  const gatesTotal = rows.length

  // Record that the link was opened. Useful to the coach and invisible to the
  // reader. A failure here is not a reason to refuse the page.
  await admin
    .from('client_access_grants')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('id', grant.id)
    .then(({ error: e }) => { if (e) console.error('loadShowcaseView: access stamp failed', e) })

  return {
    organisation: mayName ? (client?.name ?? null) : null,
    programme,
    country: mayName ? (client?.country ?? null) : null,
    gatesComplete,
    gatesTotal,
    underWay: gatesComplete > 0 || rows.some((g) => g.status === 'in_progress'),
    expiresAt: grant.expires_at ?? null,
  }
}
