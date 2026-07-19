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

create table if not exists public.audit_log (
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

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id);

alter table public.audit_log enable row level security;

-- Only the platform admin may read the log. (Writes come from the service role,
-- which bypasses RLS; there is deliberately NO write policy for normal users.)
drop policy if exists audit_log_super_coach_read on public.audit_log;
create policy audit_log_super_coach_read
  on public.audit_log
  for select
  using (public.my_role() = 'super_coach');

-- Belt-and-braces: no direct table privileges for client roles.
revoke all on public.audit_log from anon, authenticated;
