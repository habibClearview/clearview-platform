// ============================================================
// A SIGN-IN LINK INSIDE THE LETTER
//
// The welcome used to say "your sign-in arrives in a separate email", which
// leaves a new client holding a letter about a platform they cannot open,
// waiting on a second message from a different sender with different wording.
// One letter, one link, opened while they are still reading it.
//
// generateLink is what makes that possible: it returns a one-time link WITHOUT
// sending Supabase's own email, so the only message the client receives is the
// one Habib wrote and read first.
//
// 'invite' is for an address with no account yet and creates one. 'recovery'
// is for an address that already has an account and lets them set a new
// password. Which of the two it needs is discovered by asking, because trying
// to invite an existing user fails in a way that reads like a bug.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js'

export type SignInKind = 'invite' | 'recovery'

export interface SignInLink {
  email: string
  link: string
  kind: SignInKind
  userId: string | null
}

/** The auth user for an address, or null. Paged, because listUsers is paged. */
export async function findAuthUser(
  admin: SupabaseClient,
  email: string,
): Promise<{ id: string } | null> {
  const wanted = email.trim().toLowerCase()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const hit = (data?.users || []).find((u: { email?: string }) => (u.email || '').toLowerCase() === wanted)
    if (hit) return { id: (hit as { id: string }).id }
    if (!data?.users?.length || data.users.length < 200) break
  }
  return null
}

/**
 * A one-time link for this address, creating the account when there is not one.
 * Nothing is emailed by Supabase: the caller puts the link in its own letter.
 */
export async function signInLinkFor(
  admin: SupabaseClient,
  email: string,
  redirectTo: string,
  metadata?: Record<string, unknown>,
): Promise<SignInLink> {
  const existing = await findAuthUser(admin, email)
  const kind: SignInKind = existing ? 'recovery' : 'invite'
  const { data, error } = await admin.auth.admin.generateLink({
    type: kind,
    email,
    options: { redirectTo, ...(kind === 'invite' && metadata ? { data: metadata } : {}) },
  } as never)
  if (error || !data?.properties?.action_link) {
    throw new Error(error?.message || 'Could not generate a sign-in link')
  }
  return {
    email,
    link: data.properties.action_link,
    kind,
    userId: existing?.id || (data as { user?: { id?: string } })?.user?.id || null,
  }
}
