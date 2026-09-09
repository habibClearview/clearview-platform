-- ============================================================
-- ONE LIST OF THE PEOPLE ON AN ENGAGEMENT. 9 September 2026.
--
-- The Cover carried two lists of the same people. "Who receives it" held a
-- title, a name, an address and which of the two letters they get. "Who is on
-- this engagement" held a role, a name, an organisation, a title, an address
-- and whether they sign. Same people, two places to type them, two places to
-- correct them, and no way for either to know about the other. Habib's words:
-- there is no need to have two lists of the same names with attributes that
-- can be on the same line, and it clutters the whole system.
--
-- The party list wins, because it is the one the Charter signs, the Cover
-- reads and row-level security scopes. Receiving a letter becomes an attribute
-- of a person on the engagement rather than a second list of people.
--
--   letter          which letter this person gets: the paying client's, the
--                   served organisation's, or none. Null means they are on the
--                   engagement and are not written to, which is a real and
--                   ordinary state: a field team member does not need the
--                   welcome letter.
--   letter_sent_at  when the provider accepted their letter. Null means it has
--                   not gone, which is also the honest answer for anybody
--                   written to before this was recorded.
--
-- SAFE TO RUN TWICE.
-- ============================================================
alter table engagement_parties
  add column if not exists letter text,
  add column if not exists letter_sent_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'engagement_parties_letter_check'
  ) then
    alter table engagement_parties
      add constraint engagement_parties_letter_check
      check (letter is null or letter in ('payer', 'served'));
  end if;
end $$;

comment on column engagement_parties.letter is
  'Which welcome letter this person receives: payer, served, or none. The recipient list is an attribute of the party, never a second list of people.';
comment on column engagement_parties.letter_sent_at is
  'When the provider accepted this person''s letter. Null means it has not gone.';
