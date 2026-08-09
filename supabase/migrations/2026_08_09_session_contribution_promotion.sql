-- ============================================================
-- A sentence said in the room can become a row in the block's own table.
--
-- WHAT WAS MISSING. A room types forty sentences into a block. The coach can
-- read them and mark each one used, and that is where it stopped. Turning a
-- sentence into a row in the service inventory, or the segment table, or the
-- pilot record meant reading it on one screen and retyping it on another. So it
-- either did not happen, or it happened with the words changed, which is worse:
-- the whole point of capturing what somebody said in the room is that it is
-- what they said, not what the coach remembers a day later.
--
-- WHAT THESE TWO COLUMNS ARE FOR. When a contribution becomes a row, the
-- contribution records where it went. Not the other way round, and for a
-- reason: the working tables have no column for provenance and several of them
-- have no notes column at all, so hanging the trail off the target row would
-- mean either changing eleven tables or losing the trail on some of them.
-- Keeping it here means every promoted sentence can be traced to the row it
-- became, and every row that came from a room can be traced back to the person
-- who said it, whichever end you start from.
--
-- WHY THE TARGET IS NOT A FOREIGN KEY. It points at one of several tables
-- depending on the block, and Postgres cannot express that as a single foreign
-- key. Deliberately loose, and the reading code treats a target that is no
-- longer there as an ordinary outcome rather than an error, because a coach
-- deleting a row they no longer want is normal work and must not leave a trail
-- that breaks a screen.
--
-- The allowed table names are constrained, so a bug or a crafted request cannot
-- write an arbitrary table name here and have later code trust it.
-- ============================================================

alter table public.gtcv_session_contributions
  add column if not exists promoted_to_table text,
  add column if not exists promoted_to_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gtcv_session_contributions_promoted_to_table_check'
  ) then
    alter table public.gtcv_session_contributions
      add constraint gtcv_session_contributions_promoted_to_table_check
      check (
        promoted_to_table is null
        or promoted_to_table in (
          'gtcv_assumptions',
          'gtcv_service_inventory',
          'gtcv_customer_segments',
          'gtcv_propositions',
          'gtcv_partner_map',
          'gtcv_pilot_sessions',
          'gtcv_channel_logic'
        )
      );
  end if;
end $$;

-- Both together or neither. A recorded table with no row, or a row with no
-- table, is a trail that cannot be followed and would only mislead.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gtcv_session_contributions_promoted_pair_check'
  ) then
    alter table public.gtcv_session_contributions
      add constraint gtcv_session_contributions_promoted_pair_check
      check (
        (promoted_to_table is null and promoted_to_id is null)
        or (promoted_to_table is not null and promoted_to_id is not null)
      );
  end if;
end $$;

comment on column public.gtcv_session_contributions.promoted_to_table is
  'The working table this sentence became a row in, if it became one.';
comment on column public.gtcv_session_contributions.promoted_to_id is
  'The row it became. Not a foreign key: the target table varies by block.';
