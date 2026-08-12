-- ============================================================
-- WHAT A HYPOTHESIS IS BUILT FROM  (C26 as replaced, 12 August 2026)
--
-- The C26 replacement: "A hypothesis is: this service, made up of these
-- specific activities, solves this problem or set of problems, for this type of
-- client. Tool 3 shows which activities and which problems each hypothesis is
-- built from."
--
-- Nothing recorded that. A hypothesis held a sentence, four scores and a
-- service, and the activities and problems it came from lived only in the
-- memory of whoever typed it. So Tool 3 could not show what C26 requires,
-- because the fact was never kept.
--
-- WHY A JOIN TABLE AND NOT TWO ARRAY COLUMNS. A hypothesis is built from
-- SEVERAL activities and SEVERAL problems, so either shape holds a list. The
-- difference is what happens when an activity is deleted: a foreign key with
-- ON DELETE CASCADE takes the link with it, and an array of identifiers does
-- not. An array would leave a hypothesis claiming to be built from an activity
-- that no longer exists, which is the kind of quiet wrongness that shows up in
-- a report months later and cannot be explained.
--
-- A ROW IS ONE LINK. Either an activity or a problem, never a bare row: the
-- check refuses a link that points at nothing. A problem already knows its own
-- activity, so naming a problem implies its activity without repeating it.
--
-- Nothing renamed, nothing dropped. Every row that exists reads exactly as it
-- did, and a hypothesis with no links is a hypothesis nobody has attributed
-- yet, which is a normal state and not an error.
-- ============================================================

create table if not exists gtcv_hypothesis_sources (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  hypothesis_id uuid not null references gtcv_hypotheses_shortlist(id) on delete cascade,
  activity_id uuid references gtcv_assumptions(id) on delete cascade,
  problem_id uuid references gtcv_problem_owner_budget(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- A link points at something. A row naming neither is not a link.
  constraint gtcv_hypothesis_sources_points_somewhere
    check (activity_id is not null or problem_id is not null)
);

create index if not exists gtcv_hypothesis_sources_hypothesis_idx
  on gtcv_hypothesis_sources (hypothesis_id);
create index if not exists gtcv_hypothesis_sources_client_idx
  on gtcv_hypothesis_sources (client_id);

-- The same activity named twice on one hypothesis is the same fact twice, and
-- would draw it twice on screen. Partial, because one of the two columns is
-- always null and a plain unique index would not catch it.
create unique index if not exists gtcv_hypothesis_sources_activity_once
  on gtcv_hypothesis_sources (hypothesis_id, activity_id)
  where activity_id is not null;
create unique index if not exists gtcv_hypothesis_sources_problem_once
  on gtcv_hypothesis_sources (hypothesis_id, problem_id)
  where problem_id is not null;

alter table gtcv_hypothesis_sources enable row level security;
drop policy if exists gtcv_hypothesis_sources_view on gtcv_hypothesis_sources;
create policy gtcv_hypothesis_sources_view on gtcv_hypothesis_sources
  for select using (can_view_client(client_id));
drop policy if exists gtcv_hypothesis_sources_manage on gtcv_hypothesis_sources;
create policy gtcv_hypothesis_sources_manage on gtcv_hypothesis_sources
  for all using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));

comment on table gtcv_hypothesis_sources is
  'C26 as replaced. Which activities and which problems each hypothesis is built from, so Tool 3 can show it instead of the room remembering it.';
