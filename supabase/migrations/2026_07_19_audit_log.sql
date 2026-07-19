-- ============================================================
-- Audit log — an append-only record of sensitive administrative actions
-- (role changes, user invites, forced sign-outs, deactivations). Gives an
-- after-the-fact trail of "who did what to whom, when".
--
-- Writes happen from server-side API routes using the service-role key (which
-- bypasses RLS). Reads are restricted by RLS to super_coach only. There are no
-- INSERT/UPDATE/DELETE policies for ordinary users, so authenticated/anon
-- clients can neither write nor tamper with the log.
-- ============================================================

create table if not exists public.admin_audit_log (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  actor_id      uuid,               -- who performed the action (auth.users.id)
  actor_email   text,
  actor_role    text,
  action        text not null,      -- e.g. 'user.role_changed', 'user.invited'
  target_id     text,               -- who/what it was done to
  target_email  text,
  detail        jsonb,              -- structured before/after or extra context
  ip            text
);

create index if not exists admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_actor_idx on public.admin_audit_log (actor_id);

alter table public.admin_audit_log enable row level security;

-- Only the platform admin may read the log. (Writes come from the service role,
-- which bypasses RLS; there is deliberately NO write policy for normal users.)
drop policy if exists admin_audit_log_super_coach_read on public.admin_audit_log;
create policy admin_audit_log_super_coach_read
  on public.admin_audit_log
  for select
  using (public.my_role() = 'super_coach');

-- RLS filters ROWS, but the table-level privilege check still runs first, and
-- PostgREST connects every logged-in user (including super_coach) as the
-- `authenticated` Postgres role. So we MUST grant SELECT to authenticated for
-- the policy to be reachable at all — the policy above then limits the visible
-- rows to super_coach. We deliberately grant ONLY select: inserts/updates/
-- deletes come from the service role (which bypasses RLS), never from clients.
grant select on public.admin_audit_log to authenticated;
revoke all on public.admin_audit_log from anon;
