// ============================================================
// authedFetch — a drop-in `fetch` that attaches the signed-in user's
// Supabase access token as a Bearer header, so server routes can
// authenticate the caller.
//
// Use for same-origin calls to our own /api routes that must know who is
// calling. Never send this token to a third-party host.
// ============================================================
import { supabase } from '@/lib/supabase'

export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const headers = new Headers(init.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}
