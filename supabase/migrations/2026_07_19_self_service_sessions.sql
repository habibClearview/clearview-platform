-- ============================================================
-- SELF-SERVICE: let a signed-in user see and manage their OWN devices
--
-- Powers the "Devices" panel: when you log in you can see every place
-- your account is currently signed in (browser/OS, IP, last-active),
-- sign out one device, or sign out every OTHER device but this one.
--
-- Why SQL functions: the auth schema (auth.sessions) is not reachable
-- through PostgREST, so a plain query can't read it. These SECURITY
-- DEFINER functions are the read/revoke path — and every one of them is
-- hard-scoped to auth.uid() (the caller's own id), so a user can only
-- ever see or end THEIR OWN sessions, never anyone else's. That makes
-- them safe to grant directly to `authenticated` (called from the
-- browser), with no service-role API route needed.
--
--   * search_path = '' pins every reference to be schema-qualified
--     (guards against search_path hijacking).
--   * EXECUTE revoked from PUBLIC, granted to `authenticated` only
--     (anonymous visitors cannot call them).
--
-- HONEST LIMIT (same as elsewhere): revoking a session stops that device
-- from refreshing, but a page it already has open keeps its current
-- short-lived access token until that expires (typically within the
-- hour), then it is locked out.
--
-- SAFE TO APPLY: creates three functions + their grants. Changes no data
-- on apply. Paste into the Supabase SQL editor and Run.
-- ============================================================

-- 1) List the caller's own active sessions, newest activity first.
--    is_current flags the row for the device making this call, matched on
--    the session_id claim in the request's JWT.
create or replace function public.list_my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  last_active timestamptz,
  user_agent text,
  ip text,
  is_current boolean
)
language sql
security definer
set search_path = ''
as $$
  select
    s.id,
    s.created_at,
    coalesce(s.updated_at, s.created_at) as last_active,
    s.user_agent,
    host(s.ip) as ip,
    (s.id = nullif(
      (nullif(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'session_id',
      '')::uuid) as is_current
  from auth.sessions s
  where s.user_id = auth.uid()
  order by coalesce(s.updated_at, s.created_at) desc;
$$;

-- 2) Revoke ONE of the caller's own sessions. The user_id = auth.uid()
--    predicate is what stops anyone signing out a session that is not
--    theirs, even if they pass someone else's session id.
create or replace function public.revoke_my_session(target_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  revoked integer;
begin
  delete from auth.sessions
    where id = target_session_id and user_id = auth.uid();
  get diagnostics revoked = row_count;
  return revoked;
end;
$$;

-- 3) Revoke all the caller's OTHER sessions, keeping the one passed in
--    (normally the current device). Scoped to auth.uid() as above.
create or replace function public.revoke_my_other_sessions(keep_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  revoked integer;
begin
  delete from auth.sessions
    where user_id = auth.uid()
      and id is distinct from keep_session_id;
  get diagnostics revoked = row_count;
  return revoked;
end;
$$;

-- Lock all three to signed-in users only (no anonymous access).
revoke all on function public.list_my_sessions() from public;
revoke all on function public.revoke_my_session(uuid) from public;
revoke all on function public.revoke_my_other_sessions(uuid) from public;
grant execute on function public.list_my_sessions() to authenticated;
grant execute on function public.revoke_my_session(uuid) to authenticated;
grant execute on function public.revoke_my_other_sessions(uuid) to authenticated;
