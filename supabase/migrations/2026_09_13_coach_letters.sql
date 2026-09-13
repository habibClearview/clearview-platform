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
--
-- ONE PRACTICE, AND THIS TABLE IS SCOPED EXACTLY AS THE ROSTER IT DESCRIBES IS.
-- CodeRabbit asked for a per-practice scope on this table. There is no
-- practice, tenant or organisation column anywhere in this schema: co_implementers
-- itself is a single super_coach-scoped table with no owner column, and so are
-- the timesheets, expenses and invoices hanging off it. A second super coach
-- would already share the whole roster, every client and every figure, so
-- scoping this one table and nothing else would give an impression of
-- separation that does not exist.
--
-- If this platform ever serves more than one practice, every coach-team table
-- needs scoping in the same change. Doing it here alone would be worse than
-- not doing it, because it would read as though the job were done.
drop policy if exists super_coach_only on coach_letters;
create policy super_coach_only on coach_letters for all using (my_role() = 'super_coach');

-- The welcome letter goes once per co-implementer. Carried here so a single
-- run applies everything this change needs.
alter table co_implementers
  add column if not exists welcome_sent_at timestamptz;

comment on column co_implementers.welcome_sent_at is
  'When the co-implementer welcome letter was sent. Null means it has not gone yet.';
