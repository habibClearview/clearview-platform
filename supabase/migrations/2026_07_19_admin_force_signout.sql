-- ============================================================
-- ADMIN: force sign-out a specific user (revoke all their sessions)
--
-- Gives the platform admin a way to remotely end EVERY active session
-- for one chosen user — for a lost/forgotten device or when someone
-- leaves — without deleting or deactivating the account.
--
-- Why a SQL function (not the supabase-js admin API): supabase-js has no
-- "sign out user by id" call — its admin signOut needs that user's own
-- JWT, which the admin does not have. The reliable, server-side way to
-- revoke a user's sessions is to delete their rows in auth.sessions,
-- which cascades to auth.refresh_tokens (FK ON DELETE CASCADE) so no
-- device can mint a new access token. The auth schema is NOT reachable
-- through PostgREST, so we expose a tightly-scoped SECURITY DEFINER
-- function in public that does exactly this and nothing else.
--
-- HONEST LIMIT (same as the user-facing "sign out — all devices"): an
-- access token already issued to an open page stays valid until it
-- expires (typically within the hour). Revoking sessions stops any
-- further refresh, so the device is locked out once that token lapses.
--
-- SECURITY:
--   * SECURITY DEFINER so it can touch the auth schema, but
--     `set search_path = ''` forces every reference to be fully
--     schema-qualified (guards against search_path hijacking).
--   * EXECUTE is revoked from PUBLIC and granted ONLY to service_role,
--     so a normal signed-in user (anon/authenticated) can NEVER call it
--     via RPC. The only caller is the server-side admin API route, which
--     additionally checks the requester's role before invoking it.
--
-- SAFE TO APPLY: creates one function + adjusts its grants. Changes no
-- data on apply. Paste into the Supabase SQL editor and Run.
-- ============================================================

create or replace function public.admin_force_signout(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  revoked integer;
begin
  -- End every session for this user. The cascade to auth.refresh_tokens
  -- invalidates the long-lived tokens on all their devices at once.
  delete from auth.sessions where user_id = target_user_id;
  get diagnostics revoked = row_count;
  return revoked;
end;
$$;

-- Lock the function down: no one may execute it except the service role
-- used by the server-side admin API.
revoke all on function public.admin_force_signout(uuid) from public;
grant execute on function public.admin_force_signout(uuid) to service_role;
