-- The letters the practice sends, in the practice's own words. 13 September 2026.
--
-- Habib: I need to read the welcome email to the co-implementer and would need
-- to be able to make the same sort of edit as the other welcome emails.
--
-- The engagement welcome letters are edited per client and stored on the
-- engagement. The co-implementer letter belongs to the practice rather than to
-- any one client, so it needs a home of its own. One row per letter, keyed by
-- name. An empty or missing row means the generated letter is used.
create table if not exists coach_letters (
  key text primary key,
  body text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table coach_letters is
  'Practice-wide letter text a super coach has edited. Empty body means use the generated letter.';

alter table coach_letters enable row level security;

-- The same boundary every other coach-team row uses: this is the super coach's
-- own correspondence, and nobody else may read or change it.
drop policy if exists super_coach_only on coach_letters;
create policy super_coach_only on coach_letters for all using (my_role() = 'super_coach');

-- The welcome letter goes once per co-implementer. Carried here so a single
-- run applies everything this change needs.
alter table co_implementers
  add column if not exists welcome_sent_at timestamptz;

comment on column co_implementers.welcome_sent_at is
  'When the co-implementer welcome letter was sent. Null means it has not gone yet.';
