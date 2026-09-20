-- ============================================================
-- Clearview: one API, one kind of key.
--
-- 20 September 2026. Habib: "I need to develop an API that captures the
-- data set clearview require for all the features ... i want an API with
-- best practice on how it is shared with people that i need to send it to."
--
-- Until now an outside system could only come in through a field operator
-- token, which was designed for a phone held by a person, is stored in the
-- database in readable form, and is scoped to a single business unit. That
-- is the wrong shape for handing to another company's software.
--
-- WHAT IS DIFFERENT HERE, AND WHY.
--
--   The key is never stored. Only its SHA-256 hash is. If this table were
--   ever read by the wrong person, no working key comes out of it. The key
--   itself is shown once, at the moment it is created, and can never be
--   retrieved again -- it has to be replaced instead. That is the single
--   most important difference from every other token on this platform.
--
--   A visible prefix is stored alongside the hash so a key can be named,
--   listed and revoked without anybody knowing what it is.
--
--   Scopes are explicit and additive. A key that may write sales cannot
--   read results unless it was given that scope too. The default is the
--   narrowest thing that works.
--
--   A key may be tied to one business unit, or to all of a client's units.
--   It can never reach a second client: client_id is read off the key and
--   never off the request.
--
-- SAFE TO APPLY: additive only. Nothing existing is dropped or altered.
-- Depends on my_role() and can_manage_client_access(text), both already
-- present.
-- ============================================================

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  -- One key, one business unit. A business recording under three units gets
  -- three keys. This is not a limitation worked around later: it is how the
  -- rest of the platform already thinks about who may write where, and a key
  -- that could write anywhere would be the one piece of this design that had
  -- no precedent to lean on.
  business_unit_id text not null,
  -- THE WRITE PATH. An API key does not get a private route into the figures.
  -- It owns a field operator row, created with the key and named after it, and
  -- everything it sends goes down the same path a phone's entries go down:
  -- same table, same constraints, same aggregation, same month-end close, same
  -- reconciliation against payments. A second write path would be a second set
  -- of rules to keep in step, and they would drift.
  --
  -- It also means an integration is visible where a coach already looks. It
  -- appears on the Field Operators screen, its entries appear in history, and
  -- switching that operator off stops it.
  operator_id uuid not null references field_operators(id) on delete cascade,
  -- What a human calls this key, e.g. 'Clinic till system'. Never secret.
  label text not null,
  -- The first characters of the key, stored so a key can be recognised in a
  -- list without being known. Never enough to authenticate with.
  key_prefix text not null,
  -- SHA-256 of the whole key, lowercase hex. The key itself is never stored.
  key_hash text not null unique,
  -- Additive permissions. See src/lib/api-keys.ts for the list and what each
  -- one opens. An empty array is a key that can do nothing, which is a valid
  -- and deliberately safe state.
  scopes text[] not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  last_used_at timestamptz,
  -- Total successful calls. Cheap to keep, and the only way to tell a key
  -- that was never wired up from one that stopped working.
  use_count bigint not null default 0
);

create index if not exists idx_api_keys_hash on api_keys(key_hash);
create index if not exists idx_api_keys_client on api_keys(client_id);

alter table api_keys enable row level security;

-- Reading the list of keys is transparency: anybody who may already see this
-- client's data may see who holds a key to it. Nothing secret is in the row.
drop policy if exists api_keys_read on api_keys;
create policy api_keys_read on api_keys for select using (my_role() = 'super_coach' or can_view_client(client_id));

-- Issuing and revoking is narrower, and matches client_access_grants exactly:
-- whoever actively manages the client, never a funder.
drop policy if exists api_keys_write on api_keys;
create policy api_keys_write on api_keys for all using (can_manage_client_access(client_id)) with check (can_manage_client_access(client_id));


-- ============================================================
-- The holding pen.
--
-- The field sync endpoint refuses a line naming a product it does not know
-- and drops it. The sale is then only in the sender's log, if they kept one.
-- Every integration eventually sends something unrecognised -- a new product,
-- a renamed one, a typo -- and the first time it happens the connection looks
-- broken to the business, because figures simply go missing with no trace.
--
-- Anything that arrives well-formed but unmappable is parked here instead,
-- with the reason and the original payload, so a coach can file it and nothing
-- is ever silently lost.
-- ============================================================

create table if not exists api_inbox (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  business_unit_id text,
  api_key_id uuid references api_keys(id),
  -- 'sale' | 'cost' | 'actual' | 'payment'
  kind text not null,
  -- The sender's own reference for this item, so they can be told what became
  -- of it, and so the same item arriving twice is parked only once.
  external_ref text,
  -- Exactly what arrived, untouched, so nothing is lost in translation.
  payload jsonb not null,
  -- Why it could not be filed, in words a coach can act on.
  reason text not null,
  received_at timestamptz not null default now(),
  -- Set when a coach files or discards it. Null means still waiting.
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  -- 'filed' | 'discarded'
  resolution text
);

create index if not exists idx_api_inbox_client on api_inbox(client_id, resolved_at);
create unique index if not exists idx_api_inbox_dedupe
  on api_inbox(client_id, kind, external_ref)
  where external_ref is not null and resolved_at is null;

alter table api_inbox enable row level security;

drop policy if exists api_inbox_read on api_inbox;
create policy api_inbox_read on api_inbox for select using (my_role() = 'super_coach' or can_view_client(client_id));

drop policy if exists api_inbox_write on api_inbox;
create policy api_inbox_write on api_inbox for all using (can_manage_client_access(client_id)) with check (can_manage_client_access(client_id));


-- ============================================================
-- Recording that a key was used.
--
-- A plain update from the route would need a read then a write to move the
-- counter, and two calls racing would lose one of them. One statement in the
-- database does it correctly and costs the route a single round trip it does
-- not wait on.
-- ============================================================
create or replace function note_api_key_use(p_key_id uuid) returns void
language sql security definer set search_path = public
as $$
  update api_keys
     set last_used_at = now(), use_count = use_count + 1
   where id = p_key_id;
$$;
revoke all on function note_api_key_use(uuid) from public;
grant execute on function note_api_key_use(uuid) to service_role;
