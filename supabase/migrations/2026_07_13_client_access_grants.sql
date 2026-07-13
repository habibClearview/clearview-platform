-- ============================================================
-- Clearview: external access grants (coach-managed access model).
--
-- Lets a coach hand an investor, programme officer, or subscriber a
-- link to a client's Investment Readiness Brief WITHOUT giving them a
-- real login, and without the client ever self-serving the document to
-- a third party directly. Every grant is created, time-limited, and
-- revocable only by whoever already manages that client (the same
-- population can_view_client() already grants read access to) --
-- matches the user's own stated requirement: "I do not want random
-- access to data that is worth commercial returns."
--
-- SAFE TO APPLY: additive only (CREATE ... IF NOT EXISTS). Nothing
-- existing is dropped or altered. Paste into the Supabase SQL editor
-- and Run.
--
-- Depends on can_view_client(text), added in
-- 2026_07_13_funder_coimplementer_access.sql -- run that migration
-- first if it has not already been applied.
--
-- Redemption of a grant's token (the external party visiting the link)
-- happens through app/api/access-grant/[token]/route.ts, which uses the
-- service-role key and so bypasses RLS entirely, exactly like the
-- existing field-sync and provider-webhook routes. No anonymous RLS
-- policy is added on this table -- only an authenticated coach/
-- co-implementer/funder session can read or write it directly.
-- ============================================================

create table if not exists client_access_grants (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  granted_by uuid references auth.users(id),
  grantee_name text not null,
  grantee_email text,
  grant_type text not null default 'investor',  -- investor | programme_officer | subscriber | other
  access_token text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_accessed_at timestamptz
);
create index if not exists idx_client_access_grants_client
  on client_access_grants(client_id);
create index if not exists idx_client_access_grants_token
  on client_access_grants(access_token);

-- Anyone who can already see a client's data (super_coach, an assigned
-- co-implementer, or the programme funder) can see WHO has been granted
-- external access -- read-only transparency. Creating or revoking a
-- grant is narrower: only super_coach or an assigned co-implementer,
-- never a funder -- a funder can see a client's numbers because their
-- programme paid for the engagement, but handing that client's data to
-- a THIRD party is a decision for whoever actively manages the client,
-- not a side effect of programme funding.
create or replace function can_manage_client_access(target_client_id text) returns boolean
language sql security definer stable set search_path = public
as $$
  select
    my_role() = 'super_coach'
    or (my_role() = 'coach' and exists (
      select 1 from co_implementers ci
      where ci.id = my_co_implementer_id() and target_client_id = any(ci.client_ids)
    ));
$$;
revoke all on function can_manage_client_access(text) from public;
grant execute on function can_manage_client_access(text) to authenticated;

alter table client_access_grants enable row level security;

drop policy if exists coach_funder_read on client_access_grants;
create policy coach_funder_read on client_access_grants for select
  using (can_view_client(client_id));

drop policy if exists coach_manage on client_access_grants;
create policy coach_manage on client_access_grants for all
  using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));
