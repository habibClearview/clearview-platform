-- ============================================================
-- PART H, THE TWO SWITCHES. PART I, THE EVIDENCE RECORD. (C56 to C63)
--
-- WHY TWO SWITCHES AND NOT ONE. They govern different fears.
--   Answers visible  governs ANCHORING: the first answer seen sets what
--                    everybody else writes.
--   Authors visible  governs SAFETY: whether a junior person will contradict
--                    a senior one in front of the room.
-- One switch controlling both forces a room to choose between the two, and the
-- commonest useful setting — answers visible, authors hidden — is the one a
-- single switch cannot express.
--
-- is_named is NOT dropped. It is what Stage 1 wrote and what R18, R19 and the
-- consent sentence are built on. authors_visible is seeded from it so nothing
-- changes meaning on the day this ships.
-- ============================================================
alter table gtcv_questions add column if not exists answers_visible boolean;
alter table gtcv_questions add column if not exists authors_visible boolean;

-- C57. Defaults: collect shows both; score and classify hide both until reveal.
update gtcv_questions
   set answers_visible = coalesce(answers_visible, question_type = 'collect'),
       authors_visible = coalesce(authors_visible, is_named)
 where answers_visible is null or authors_visible is null;

comment on column gtcv_questions.answers_visible is
  'C56. Whether participants see each other''s answers before the reveal. Governs anchoring.';
comment on column gtcv_questions.authors_visible is
  'C56. Whether names appear at all. Governs safety. Where false, no name appears anywhere, ever, including every export (C58, C62).';

-- ------------------------------------------------------------
-- C61 to C63. HOW A DECISION WAS REACHED, not only what was decided.
--
-- A conclusion without its path cannot be defended to a client or a funder six
-- months later. So the whole path is written down once, at the moment of
-- agreement, as a snapshot: every submission, the distribution, whether authors
-- were visible AT THE TIME, when the reveal happened, the agreed answer, the
-- dissent, and who locked it.
--
-- authors_were_visible IS THE PROMISE. C62: where authors were hidden in the
-- room, they stay hidden in the record and in every export, permanently. A
-- promise made in the room is not undone by a later report. Nothing in this
-- table holds a name where that flag is false.
-- ------------------------------------------------------------
create table if not exists gtcv_question_records (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  question_id uuid references gtcv_questions(id) on delete set null,
  gate_id text,
  question_text text,
  question_type text,
  submissions jsonb not null default '[]'::jsonb,
  distribution jsonb,
  authors_were_visible boolean not null default false,
  revealed_at timestamptz,
  agreed_value text,
  dissent jsonb not null default '[]'::jsonb,
  locked_by_user_id uuid,
  locked_by_name text,
  locked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists gtcv_question_records_client_idx on gtcv_question_records (client_id, gate_id);

alter table gtcv_question_records enable row level security;
drop policy if exists gtcv_question_records_view on gtcv_question_records;
create policy gtcv_question_records_view on gtcv_question_records
  for select using (can_view_client(client_id));
drop policy if exists gtcv_question_records_manage on gtcv_question_records;
create policy gtcv_question_records_manage on gtcv_question_records
  for all using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));

comment on table gtcv_question_records is
  'C61. The whole path to a decision, snapshotted at agreement. C62: where authors_were_visible is false, no name is in here and none may ever be added.';
