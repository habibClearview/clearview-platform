-- ============================================================
-- STAGE 1: QUESTIONS, SUBMISSIONS AND ROOM STATE
--
-- Requirements R1 to R32. Nothing here changes an existing table, an existing
-- column, or an existing name. Three new tables only.
--
-- WHY THE PENDING ROWS DO NOT LIVE IN THE BLOCK'S OWN DATABASE TABLE. R20 says
-- answers arrive as pending rows in that block's table, displayed beneath the
-- existing rows and marked as pending, and fails only if they land in a
-- separate list that has to be copied by hand. Keeping them in
-- gtcv_submissions and drawing them beneath the block's rows satisfies that,
-- and R21 turns one into a real row in a single click. The alternative, adding
-- a pending flag to gtcv_assumptions and gtcv_service_inventory, would change
-- the shape of two tables Section 4 protects, for no gain a coach can see.
--
-- WHO CAN WRITE. A participant has no account (R6), so submissions are written
-- through a server route holding the service key, exactly as the existing
-- session capture does. Nothing here is writable by an anonymous browser
-- directly, which is why these tables carry no permissive insert policy.
-- ============================================================

-- ------------------------------------------------------------
-- Question (R1, R2). Ordered within a block; belongs to exactly one block.
-- ------------------------------------------------------------
create table if not exists gtcv_questions (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  -- The block. Matches the identifiers in src/lib/gtcv-gates.ts.
  gate_id text not null,
  -- R1: an ordered set.
  sort_order int not null default 0,

  -- R2, property 1: the question text as shown to participants.
  question_text text not null default '',
  -- R2, property 2: its type. The three names are the method's, exactly.
  question_type text not null check (question_type in ('collect', 'score', 'classify')),
  -- R2, property 3: whether answers are named or anonymous.
  -- R19 sets the defaults per type; the column carries whatever was chosen.
  is_named boolean not null default false,
  -- R2, property 4 and 5: which fields of the block's table the answers land
  -- in. A list of {column, heading}: the column the value writes to, and the
  -- heading the participant sees above the box (R13).
  target_fields jsonb not null default '[]'::jsonb,

  -- R15: a classify question offers a fixed list, never free text.
  options jsonb not null default '[]'::jsonb,

  -- R30 and the answer to Q9: a suggested length in minutes that pre-fills the
  -- timer. Null means the timer starts empty and the facilitator types a number.
  suggested_minutes int check (suggested_minutes is null or suggested_minutes > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gtcv_questions_client_gate_idx
  on gtcv_questions (client_id, gate_id, sort_order);

-- ------------------------------------------------------------
-- Submission (R10, R11, R12, R14, R18).
-- ------------------------------------------------------------
create table if not exists gtcv_submissions (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  question_id uuid not null references gtcv_questions(id) on delete cascade,

  -- Who sent it. The participant identifier is the browser's own, minted on
  -- first visit and kept in that browser. It is what lets R11 find and change
  -- an answer, and R10 keep several from the same person separately.
  participant_id text not null,
  -- R18: the name is stored ONLY where the question is named. On an anonymous
  -- question this stays null, so there is no name to leak into any screen or
  -- any record the facilitator can read.
  participant_name text,

  -- A collect answer holds one value per target field, keyed by column name.
  values jsonb not null default '{}'::jsonb,
  -- A score answer holds a number.
  score_value int,
  -- A classify answer holds one of the question's options.
  option_value text,

  -- R32: the moment the participant pressed submit on their own device, which
  -- may be well before the moment it reached the database over a poor
  -- connection. The room's record should read in the order people spoke.
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- R21: what the facilitator did with it. 'pending' until they act.
  disposition text not null default 'pending'
    check (disposition in ('pending', 'accepted', 'merged', 'discarded'))
);

create index if not exists gtcv_submissions_question_idx
  on gtcv_submissions (question_id, submitted_at);
create index if not exists gtcv_submissions_client_idx
  on gtcv_submissions (client_id);
-- R11: finding this participant's existing answer to change it.
create index if not exists gtcv_submissions_participant_idx
  on gtcv_submissions (question_id, participant_id);

-- ------------------------------------------------------------
-- Room state (R3, R8, R11, R14, R27, R30). One row per engagement.
-- ------------------------------------------------------------
create table if not exists gtcv_room_state (
  client_id text primary key references engagement_clients(id) on delete cascade,

  -- R3: one question is open, never a whole block. Null means nothing is open,
  -- which is the state R7 describes.
  open_question_id uuid references gtcv_questions(id) on delete set null,

  -- R11 and R14: answers are hidden and changeable until this is true, and
  -- visible and locked after.
  revealed boolean not null default false,

  -- R30: the timer, visible to participants as well as the facilitator.
  -- Held as the moment it was started and how long it runs, so every screen
  -- works out the same remaining time from the same two values rather than
  -- each counting down on its own.
  timer_started_at timestamptz,
  timer_seconds int check (timer_seconds is null or timer_seconds > 0),
  timer_paused_with_seconds_left int,

  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Live updating (R8, R27, R29).
--
-- These three tables are added to the publication the database uses to tell
-- open browsers that a row has changed. Without this the Participant Page and
-- the Facilitator View would have to ask, which R27 rules out by name.
--
-- The publication already exists on this project and carried no tables before
-- this migration.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'gtcv_submissions'
  ) then
    alter publication supabase_realtime add table gtcv_submissions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'gtcv_room_state'
  ) then
    alter publication supabase_realtime add table gtcv_room_state;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'gtcv_questions'
  ) then
    alter publication supabase_realtime add table gtcv_questions;
  end if;
end $$;

-- Realtime sends the whole row on an update, so a change can be applied
-- without re-reading. Without this only the primary key arrives.
alter table gtcv_submissions replica identity full;
alter table gtcv_room_state  replica identity full;
alter table gtcv_questions   replica identity full;

-- ------------------------------------------------------------
-- Access. Read follows the same rule as every other engagement table: you can
-- read an engagement you can view. Writing is done by the server routes, which
-- hold the service key and bypass these policies, so no policy grants an
-- anonymous browser a direct write.
-- ------------------------------------------------------------
alter table gtcv_questions   enable row level security;
alter table gtcv_submissions enable row level security;
alter table gtcv_room_state  enable row level security;

drop policy if exists gtcv_questions_read on gtcv_questions;
create policy gtcv_questions_read on gtcv_questions
  for select using (can_view_client(client_id));

drop policy if exists gtcv_questions_write on gtcv_questions;
create policy gtcv_questions_write on gtcv_questions
  for all using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));

drop policy if exists gtcv_submissions_read on gtcv_submissions;
create policy gtcv_submissions_read on gtcv_submissions
  for select using (can_view_client(client_id));

drop policy if exists gtcv_submissions_write on gtcv_submissions;
create policy gtcv_submissions_write on gtcv_submissions
  for all using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));

drop policy if exists gtcv_room_state_read on gtcv_room_state;
create policy gtcv_room_state_read on gtcv_room_state
  for select using (can_view_client(client_id));

drop policy if exists gtcv_room_state_write on gtcv_room_state;
create policy gtcv_room_state_write on gtcv_room_state
  for all using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));

comment on table gtcv_questions is
  'Stage 1 R1, R2. An ordered set of questions per block.';
comment on table gtcv_submissions is
  'Stage 1. One answer from one participant. Pending until the facilitator acts on it (R21).';
comment on table gtcv_room_state is
  'Stage 1 R3. Which single question is open, whether it is revealed, and the timer.';
