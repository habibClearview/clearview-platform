-- ============================================================
-- THE OTHER THREE TOOLS JOIN THE HIERARCHY. (C4, C11, C12 to C16, C28)
--
-- WHAT I GOT WRONG. I decided that Tools 3, 4 and 5 kept their single Delete,
-- reasoning that C12's test names an activity and C7's bucket names activities
-- and problems. Instructed 12 August 2026: controls in all five tools, and the
-- service in Tools 3, 4 and 5. So the reasoning was too narrow — C28 already
-- said these tools "operate on activities and problems within a Service, with
-- the Service visible throughout", and I read past it.
--
-- Three tables gain the same two columns the other two already have, so Park
-- means the same thing in all five tools and nothing in a workshop has to be
-- destroyed to get it off a table.
--
-- All nullable. Nothing renamed. Every row that exists reads exactly as it did.
-- ============================================================

alter table gtcv_hypotheses_shortlist
  add column if not exists parked_at timestamptz;
alter table gtcv_hypotheses_shortlist
  add column if not exists service_id uuid
  references gtcv_service_inventory(id) on delete set null;

alter table gtcv_signal_story
  add column if not exists parked_at timestamptz;
alter table gtcv_signal_story
  add column if not exists service_id uuid
  references gtcv_service_inventory(id) on delete set null;

alter table gtcv_continue_pause_kill
  add column if not exists parked_at timestamptz;
alter table gtcv_continue_pause_kill
  add column if not exists service_id uuid
  references gtcv_service_inventory(id) on delete set null;

comment on column gtcv_hypotheses_shortlist.parked_at is
  'C15. Parked rather than deleted, so nothing a workshop throws out at ten in the morning is gone by four.';
comment on column gtcv_signal_story.parked_at is
  'C15. Parked rather than deleted.';
comment on column gtcv_continue_pause_kill.parked_at is
  'C15. Parked rather than deleted.';
