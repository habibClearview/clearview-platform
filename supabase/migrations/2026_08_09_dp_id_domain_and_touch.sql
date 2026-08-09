-- ============================================================
-- One list of gate identifiers, and updated_at that actually updates.
--
-- TWO SEPARATE THINGS, BOTH ABOUT TRUSTING A COLUMN.
--
-- 1. dp_id was plain text everywhere. The comments said the allowed values were
--    setup, phase_0, dp01 to dp09 and handover, but nothing enforced it, so a
--    row carrying 'phase0' or 'DP01' or a typo was accepted and then silently
--    detached from its gate: the loader keys gate data by dp_id, so the
--    meeting or session simply stopped appearing anywhere, with no error to
--    explain it. A shared check constraint turns that into a refused write at
--    the moment it happens.
--
--    Null stays allowed where it already was. A session not yet assigned to a
--    block is a real state and this does not change it.
--
-- 2. updated_at defaulted to now() and never moved again. Every writer had to
--    remember to set it, and one that forgot left the column reading as the
--    creation time forever. Anything built on "when did this last change",
--    including the tracker's last reviewed line and any future sync, was
--    reading a number that stopped being true the moment the row was created.
--    A trigger makes it true without anybody having to remember.
--
-- Existing rows carrying a value outside the list are corrected to null first,
-- because a value nothing can join to is already detached and null at least
-- says so honestly. Additive: no column is dropped or retyped.
-- ============================================================

-- The one definition, so the app and the database cannot disagree about what a
-- gate identifier is.
create or replace function public.is_gate_id(value text)
returns boolean
language sql
immutable
as $$
  select value is null or value in (
    'setup', 'phase_0',
    'dp01', 'dp02', 'dp03', 'dp04', 'dp05', 'dp06', 'dp07', 'dp08', 'dp09',
    'handover'
  );
$$;

-- Detach anything already outside the list, then bind the column.
do $$
declare
  t record;
begin
  for t in
    select table_name from information_schema.columns
    where table_schema = 'public'
      and column_name = 'dp_id'
      and table_name in (
        'engagement_meetings', 'gtcv_sessions', 'gtcv_gate_signoffs',
        'deliverable_gate_map', 'evidence_library'
      )
  loop
    execute format('update public.%I set dp_id = null where not public.is_gate_id(dp_id)', t.table_name);
    execute format(
      'alter table public.%I drop constraint if exists %I',
      t.table_name, t.table_name || '_dp_id_is_gate');
    execute format(
      'alter table public.%I add constraint %I check (public.is_gate_id(dp_id))',
      t.table_name, t.table_name || '_dp_id_is_gate');
  end loop;
end $$;

-- gtcv_gate_signoffs.dp_id is not null, so its rows cannot be detached to null.
-- The constraint above still holds for it: anything already stored outside the
-- list would have failed the update above, and none exists.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Attach the trigger to every table in this work that carries updated_at.
do $$
declare
  t record;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'updated_at'
      and (
        c.table_name like 'gtcv\_%'
        or c.table_name in (
          'engagement_config', 'engagement_parties', 'engagement_deliverables',
          'deliverable_gate_map', 'engagement_charters', 'charter_comments',
          'engagement_meetings', 'engagement_invoice_packs'
        )
      )
  loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t.table_name);
    execute format(
      'create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',
      t.table_name);
  end loop;
end $$;
