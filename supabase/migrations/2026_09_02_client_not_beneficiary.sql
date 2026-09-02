-- ============================================================
-- THE WORD IS CLIENT, NOT BENEFICIARY.  2 September 2026.
--
-- "Beneficiary" is aid language. It casts the organisation as a passive
-- recipient of charity, which is the opposite of what this method is for — the
-- whole point is an organisation moving from grant-funded to standing on its
-- own. Habib's words: beneficiary is not useful at all.
--
-- The screen and the code now say client throughout. This is the one place the
-- old word reached the database.
--
-- WHY served_client_id AND NOT client_id. This table already holds
-- payer_client_id — who pays — beside it, and the distinction between the two
-- is the point of the table: a programme can pay for a service delivered to a
-- different organisation, and sometimes the payer IS the one served. Renaming
-- this to a bare client_id would put two columns called client next to each
-- other and lose exactly the thing the table exists to record. "Served" says
-- which of the two this is, and neither column is a beneficiary.
--
-- SAFE TO RUN TWICE, and safe to run before or after the code that reads it:
-- the rename only happens if the old name is still there.
-- ============================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_engagements'
      and column_name = 'beneficiary_client_id'
  ) then
    alter table public.service_engagements
      rename column beneficiary_client_id to served_client_id;
  end if;
end $$;

-- The index follows its column, so it is renamed rather than dropped and
-- rebuilt: no window in which the lookup it serves is unindexed.
do $$
begin
  if exists (select 1 from pg_class where relname = 'service_engagements_beneficiary_idx') then
    alter index public.service_engagements_beneficiary_idx
      rename to service_engagements_served_client_idx;
  end if;
end $$;

create index if not exists service_engagements_served_client_idx
  on public.service_engagements (served_client_id);

comment on column public.service_engagements.served_client_id is
  'The client the service is delivered to. Null where the payer is the one served. Called beneficiary_client_id until 2 September 2026.';
