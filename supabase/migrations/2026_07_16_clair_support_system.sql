-- ============================================================
-- Clearview: Clair support system tables (Clair Step 2).
--
-- Four tables for the support agent, designed and approved in
-- docs/support-playbook/CLAIR_SCHEMA_PROPOSAL.md:
--   1. support_playbook_entries  -- Clair's machine-readable knowledge
--   2. support_conversations     -- every chat with Clair
--   3. support_escalations       -- anything Clair couldn't resolve
--   4. support_action_log        -- record of any action Clair takes (unused until Step 7)
--
-- Conventions (enforced by .github/scripts/validate-migration.py):
--   - client_id columns are TEXT (match engagement_clients.id)
--   - columns referencing auth.users are UUID (match auth.users.id)
--   - every new table is guarded so it will not clobber an existing one
--   - row-level security is enabled on every table
--
-- SAFE TO APPLY: additive only -- four brand-new tables, no existing table
-- or column touched. Reads are scoped by RLS (super_coach sees all;
-- co_implementer sees only clients they can already view via can_view_client,
-- the same helper the access-grant policies use). Writes are done only by the
-- token-authenticated backend (service role), which bypasses RLS -- the same
-- pattern as the existing field-sync and access-grant routes -- so there are
-- deliberately no INSERT/UPDATE policies for ordinary users. Paste into the
-- Supabase SQL editor and Run.
-- ============================================================

create table if not exists support_playbook_entries (
  id uuid primary key default gen_random_uuid(),
  feature_area text not null,
  symptom_tags text[] not null default '{}',
  tier smallint not null check (tier in (1, 2, 3)),
  applies_to_roles text[] not null default '{}',
  user_facing_description text not null,
  diagnostic_questions text[] not null default '{}',
  safe_fix text,                                   -- null = no safe fix, always escalate
  escalation_criteria text,
  source_file text not null,
  updated_at timestamptz not null default now()
);

create table if not exists support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  acting_role text not null,
  client_id text references engagement_clients(id),   -- nullable: not every chat concerns one client
  channel text not null check (channel in ('internal', 'client', 'field')),
  messages jsonb not null default '[]'::jsonb,
  resolved_tier smallint check (resolved_tier in (1, 2, 3)),
  created_at timestamptz not null default now()
);

create table if not exists support_escalations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references support_conversations(id),
  client_id text references engagement_clients(id),
  summary text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  assigned_to_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists support_action_log (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  target_user_id uuid references auth.users(id),
  triggered_by text not null,                          -- 'clair' or a human user id
  conversation_id uuid references support_conversations(id),
  result text,
  created_at timestamptz not null default now()
);

alter table support_playbook_entries enable row level security;
alter table support_conversations enable row level security;
alter table support_escalations enable row level security;
alter table support_action_log enable row level security;

-- Playbook: any internal user may read it; the backend (service role) writes it.
drop policy if exists playbook_read on support_playbook_entries;
create policy playbook_read on support_playbook_entries for select using (my_role() in ('super_coach', 'co_implementer'));

-- Conversations/escalations: super_coach reads all; others only clients they can
-- already view. Fail-closed -- a row with no client_id is visible to super_coach only.
drop policy if exists conversations_read on support_conversations;
create policy conversations_read on support_conversations for select using (my_role() = 'super_coach' or (client_id is not null and can_view_client(client_id)));

drop policy if exists escalations_read on support_escalations;
create policy escalations_read on support_escalations for select using (my_role() = 'super_coach' or (client_id is not null and can_view_client(client_id)));

-- Action log: super_coach only (audit surface). Backend writes via service role.
drop policy if exists action_log_read on support_action_log;
create policy action_log_read on support_action_log for select using (my_role() = 'super_coach');
