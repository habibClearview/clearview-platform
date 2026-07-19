-- ============================================================
-- SECURITY (CRITICAL): stop self-elevation & tenant-hopping via user_profiles
--
-- THE HOLE: the `client_scoped` RLS policy on user_profiles is
--   for all using (id = auth.uid() or my_role()='super_coach' or ...)
-- with NO `with check` clause. For UPDATE/INSERT, Postgres reuses the
-- USING expression as the check, so the `id = auth.uid()` branch lets a
-- signed-in user write to THEIR OWN row with no restriction on which
-- columns change. A normal user can therefore PATCH their own row via the
-- browser PostgREST endpoint to set role='super_coach' (instant
-- platform-admin over every tenant) or change engagement_client_id /
-- client_id to hop into another business. This defeats the entire
-- multi-tenant model and every API-layer role check.
--
-- THE FIX: a trigger that lets the sanctioned paths through (the
-- service-role admin API, a genuine super_coach, and the DB owner during
-- migrations) but forbids a normal signed-in user from creating a profile
-- row or changing the privilege/tenant columns
-- (role, engagement_client_id, client_id, assigned_unit_ids). Normal
-- users may still edit benign fields on their own row (e.g. full_name).
-- DELETE is revoked from clients so a row can't be dropped and re-inserted
-- with a higher role.
--
-- Legitimate role/unit/tenant changes continue to work: they go through
-- the /api/update-user and /api/invite-user routes, which use the
-- service-role key (current_user = 'service_role') and are allowed here.
--
-- SAFE TO APPLY: adds one trigger + tightens grants. Changes no data.
-- Paste into the Supabase SQL editor and Run.
-- ============================================================

create or replace function public.protect_user_profile_privilege_columns()
returns trigger
-- SECURITY INVOKER (default): runs as the caller, so current_user reflects
-- whether this write is the service-role admin API or a normal signed-in user.
language plpgsql
as $$
begin
  -- Sanctioned paths may change anything:
  --  * service_role  -> the server-side admin API (/api/update-user, invite)
  --  * postgres / supabase_admin -> migrations & dashboard
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  -- A genuine platform admin acting directly may also change anything.
  if public.my_role() = 'super_coach' then
    return new;
  end if;

  -- Everyone else is a normal signed-in user acting on their own row.
  -- They may not create profile rows directly...
  if tg_op = 'INSERT' then
    raise exception 'Direct profile creation is not permitted';
  end if;
  -- ...and may not change the columns that grant privilege or tenant scope.
  if new.role is distinct from old.role
     or new.engagement_client_id is distinct from old.engagement_client_id
     or new.client_id is distinct from old.client_id
     or new.assigned_unit_ids is distinct from old.assigned_unit_ids then
    raise exception 'You are not permitted to change your role or organisation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_user_profile_privilege on public.user_profiles;
create trigger trg_protect_user_profile_privilege
  before insert or update on public.user_profiles
  for each row execute function public.protect_user_profile_privilege_columns();

-- Profile lifecycle (create/delete) is service-role only; prevents a
-- delete-then-reinsert path around the trigger.
revoke delete on public.user_profiles from authenticated, anon;
