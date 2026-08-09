-- ============================================================
-- The service role can reach the tables the server side routes use.
--
-- WHAT WAS WRONG, AND WHY NOTHING SHOWED IT. Every table created by the
-- engagement and canvas work granted select, insert, update and delete to
-- authenticated and stopped there. The service role got nothing. Thirty nine
-- tables in all, including engagement_config, engagement_parties,
-- engagement_charters, charter_signatures, gtcv_gate_signoffs and every canvas
-- working table.
--
-- Nothing showed it because the two ways into the data are not the same way.
-- A page in the browser reads with the signed in user's own role, which had the
-- grant, so every table looked healthy on screen and the seeded work appeared
-- exactly as expected. The API routes read with the service role, which did
-- not, and PostgREST answers a missing grant with "permission denied for
-- table", which the routes report as a failure to load or to save. So the
-- reading half of the application worked and the writing half did not, and the
-- half that did not is the half a client sees at the moment that matters:
-- signing the Charter, closing a gate, opening the showcase link.
--
-- The showcase link is how it was found. The page returned "this link is not
-- open" for a token that was valid, unexpired, unrevoked and pointed at an
-- engagement with showcasing switched on. The loader was not wrong. It could
-- not read engagement_config.
--
-- THE FIX IS IN TWO PARTS, BECAUSE ONE WOULD NOT HOLD. Granting on what exists
-- today repairs today. Setting the default for what is created tomorrow is what
-- stops the same gap being reintroduced by the next migration that remembers
-- authenticated and forgets the service role.
--
-- The service role is not subject to row level security, which is exactly why
-- it is only ever used from server side code that has already established who
-- is calling. This grant does not widen what any user can reach. It restores
-- what the routes were written to assume.
-- ============================================================

-- Part one: everything that exists now.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Part two: everything created from here on, whichever role creates it. The
-- default applies per creating role, so it is set for both roles that create
-- objects in this project.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;

-- The same gap exists for authenticated on any table created without the grant
-- being written out, and the same reasoning applies: a table row level security
-- protects but nobody can reach is not secure, it is broken. Row level security
-- remains the thing that decides which rows, this only decides whether the
-- table can be addressed at all.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
