-- ============================================================
-- STAGE 2. PERMANENT PERSONAL LINKS  (R33 to R39)
--
-- Nothing here creates a second list of people. The client team is already in
-- engagement_parties, in the tab R33 names, with Role, Name, Job title,
-- Organisation and the email box. R33 adds ONE thing to it: a mobile number.
--
-- Everything else hangs off tables that already do this job.
-- client_access_grants already issues a link, scopes it, records when it was
-- last opened and withdraws it. A personal link is that same row with a
-- different scope: one person, the whole engagement, no expiry date.
-- ============================================================

-- ------------------------------------------------------------
-- R33. The one missing box.
--
-- "either an email address or a mobile number" — the email is already there
-- and its wording is left exactly as it is, because under Section 4 that is
-- user-visible wording and it still says what it says about a login.
-- ------------------------------------------------------------
alter table engagement_parties
  add column if not exists mobile text;

comment on column engagement_parties.mobile is
  'Mobile number, so a personal link can be sent by messaging app to somebody who has no email address.';

-- ------------------------------------------------------------
-- R34. Which person a grant belongs to.
--
-- Null on every grant that already exists, and on every session link and
-- showcase link issued from now on. Only a personal link carries it.
-- ------------------------------------------------------------
alter table client_access_grants
  add column if not exists party_id uuid
  references engagement_parties(id) on delete cascade;

-- One live personal link per person. A second one would mean two links
-- identifying the same person, and revoking one would leave the other open,
-- which is R37 failing quietly.
create unique index if not exists client_access_grants_one_live_person
  on client_access_grants (party_id)
  where party_id is not null and revoked_at is null;

comment on column client_access_grants.party_id is
  'The team member this personal link identifies. Null on every other kind of grant.';

-- ------------------------------------------------------------
-- R39. WHO MADE A SUBMISSION. READ THIS BEFORE TOUCHING EITHER COLUMN.
--
-- Decided 11 August 2026, as a question about consent rather than wording.
--
-- Stage 1 stored NO name on an anonymous question, on the strongest reading of
-- R18. R39 changes that: every submission records who made it, whether the
-- question is shown as anonymous or not.
--
-- The two are reconciled by keeping them in DIFFERENT COLUMNS with different
-- rules, rather than by one column that is sometimes safe.
--
--   participant_name       UNCHANGED FROM STAGE 1. Filled only on a named
--                          question. This is the column interfaces read, and
--                          it is empty on an anonymous question, so an
--                          interface cannot show what is not there.
--
--   identity_party_id      NEW. Always filled where the person is known. NO
--                          ROUTE MAY EVER SELECT THIS COLUMN. Not the
--                          facilitator's route, not a report, not an export.
--
-- The instruction was: "Who may see it: nobody, in any interface, ever. Not
-- the facilitator, not a report, not an export. It exists only so a submission
-- has an owner in the record. If a route or an export would reveal it, that is
-- a fault and you tell me."
--
-- So: adding this column to a select list is a fault, not a feature. There is
-- a test that fails if any route names it. If you are here to expose it,
-- go and ask first.
--
-- It holds the party, not the name. A name copied here would be a second copy
-- of a person's name going stale in a table nobody reads; the party row is
-- the one true place a name lives.
-- ------------------------------------------------------------
alter table gtcv_submissions
  add column if not exists identity_party_id uuid
  references engagement_parties(id) on delete set null;

comment on column gtcv_submissions.identity_party_id is
  'R39. Who made this submission, recorded even on an anonymous question. NO INTERFACE MAY EVER SHOW OR EXPORT THIS. It exists only so a submission has an owner in the record.';

-- ------------------------------------------------------------
-- R38. Whether this came from somebody on the team or a visitor with a code.
--
-- SEPARATE FROM identity_party_id ON PURPOSE. The facilitator is allowed to
-- know that an answer came from a visitor rather than from the team, because
-- that changes what the answer is worth. They are not allowed to know WHICH
-- visitor, or which team member, on an anonymous question. A boolean tells
-- them the first and cannot tell them the second.
--
-- It is shown in the facilitator's pending list and NEVER on the projector.
-- A word beside somebody's answer in front of the room is a public statement
-- that they are not one of us.
-- ------------------------------------------------------------
alter table gtcv_submissions
  add column if not exists is_guest boolean not null default false;

comment on column gtcv_submissions.is_guest is
  'R38. True where the answer came from somebody who joined with the room code rather than a personal link. Shown in the facilitator pending list only, never on the projector.';
