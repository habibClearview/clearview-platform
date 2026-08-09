-- ============================================================
-- The function scripts/rls-check.mjs asks.
--
-- PostgREST does not expose the system catalogue, and it should not. So the one
-- question worth asking of it, which tables are readable by anyone holding the
-- public anon key, needs a function that asks on the caller's behalf and
-- returns nothing else.
--
-- It returns table names only. No row of anybody's data passes through it, and
-- it cannot be persuaded to return one: there is no argument to it.
--
-- It is restricted to the service role. An anonymous caller learning which
-- tables are unprotected would be handed a list of what to read first, so the
-- check that exists to close that hole must not open a smaller one beside it.
--
-- security definer is needed because pg_class is readable but relrowsecurity
-- has to be read as an owner to be trusted. search_path is pinned so the
-- function cannot be redirected at a shadowed catalogue.
-- ============================================================

create or replace function public.tables_without_rls()
returns table (table_name text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select c.relname::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relrowsecurity = false
  order by c.relname;
$$;

revoke all on function public.tables_without_rls() from public;
revoke all on function public.tables_without_rls() from anon;
revoke all on function public.tables_without_rls() from authenticated;
grant execute on function public.tables_without_rls() to service_role;
