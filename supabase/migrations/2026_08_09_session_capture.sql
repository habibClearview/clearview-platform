-- ============================================================
-- Session capture: what a room types in, without anybody logging in.
--
-- THE PROBLEM THIS SOLVES. A working session has eight people in a room and one
-- of them typing. Everything the other seven say has to be remembered, spoken
-- aloud again, and typed by the consultant, which is the friction that makes a
-- session a transcription exercise instead of a working one. Giving each of
-- them an account is worse: accounts have to be created, invited, accepted and
-- remembered, for people who will use them for two hours.
--
-- So a session gets a link. The link opens one block, for one session, and
-- expires. Whoever holds it can add what they think and read what the room has
-- added. That is all it can do.
--
-- WHY A SEPARATE TABLE RATHER THAN LETTING THE ROOM WRITE THE REAL TABLES.
-- A contribution is not a record. It is somebody's sentence, offered in a
-- session, and the coach decides whether it becomes a row in the service
-- inventory or the segment table. Writing straight into the working tables
-- would mean a link handed round a room could overwrite evidence, and it would
-- also lose the thing that makes the session worth running: eight views of the
-- same question, kept apart long enough to be compared.
--
-- promoted_at records when a contribution became part of the real record, so
-- nothing is silently lost and nothing is silently counted twice.
--
-- WHAT THE LINK CANNOT DO. It cannot read the block's working tables, the
-- evidence, the Charter, the deliverables or anything commercial. It cannot
-- reach another block or another engagement. It cannot delete. The scope lives
-- on the grant, server side, and the page is given only what the grant allows.
--
-- Row level security here is deny-by-default with no policy for anonymous or
-- signed-in callers: everything goes through a server route holding the service
-- role, which is the only place the token can be checked. A policy would be a
-- second, weaker way in.
-- ============================================================

-- The scope of a session link. Added to the existing grant table rather than a
-- new one, so revoking, expiring and listing a link all keep working exactly as
-- they already do for the showcase link.
alter table public.client_access_grants
  add column if not exists scope_dp_id text;

alter table public.client_access_grants
  add column if not exists scope_session_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'client_access_grants_scope_dp_id_is_gate'
  ) then
    alter table public.client_access_grants
      add constraint client_access_grants_scope_dp_id_is_gate
      check (public.is_gate_id(scope_dp_id));
  end if;
end $$;

create table if not exists gtcv_session_contributions (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.engagement_clients(id) on delete cascade,

  -- Which block, and which session within it. dp_id is what the contribution is
  -- about; session_id is optional because a link can be issued for a block
  -- without a planned session behind it.
  dp_id text not null,
  session_id uuid references public.gtcv_sessions(id) on delete set null,

  -- Who said it, as they typed it. Not an account: a name in a room. It is kept
  -- because a contribution nobody owns cannot be followed up, and the whole
  -- method turns on being able to go back to the person who said the thing.
  contributor_name text not null,
  contributor_role text,

  contribution text not null,

  -- Set when the coach turns this into a row in the block's real tables, so the
  -- same sentence is not counted twice and nothing quietly disappears.
  promoted_at timestamptz,
  promoted_by uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_session_contributions_client
  on public.gtcv_session_contributions (client_id, dp_id);
create index if not exists idx_session_contributions_session
  on public.gtcv_session_contributions (session_id);

alter table gtcv_session_contributions enable row level security;

-- The coaching team reads and manages contributions through the normal path.
drop policy if exists "session contributions readable" on public.gtcv_session_contributions;
create policy "session contributions readable"
  on public.gtcv_session_contributions for select
  to authenticated
  using (public.can_view_client(client_id));

drop policy if exists "session contributions manageable" on public.gtcv_session_contributions;
create policy "session contributions manageable"
  on public.gtcv_session_contributions for all
  to authenticated
  using (public.can_manage_client_access(client_id))
  with check (public.can_manage_client_access(client_id));

-- The room writes through a server route holding the service role, which is the
-- only place the link's token can be checked. There is deliberately no policy
-- for anon here: a second way in would be a weaker way in.
grant select, insert, update, delete on public.gtcv_session_contributions to authenticated;
grant select, insert, update, delete on public.gtcv_session_contributions to service_role;
