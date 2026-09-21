-- ============================================================
-- ClearView reads their list, instead of them retyping it into ours.
--
-- 20 September 2026. Habib: "what is supposed to happen is that clearview
-- pulls these details from the existing system - the cataloque and price list
-- is likely on their systems - can clearview not update the cataloque on their
-- clearview workspace by collating from the system they have already".
--
-- WHAT WAS WRONG.
--
-- The API shipped earlier today made an outside system name each sale by
-- ClearView's own catalogue id. That meant somebody had to sit down and pair
-- every product in their system with a product in ours before a single sale
-- could be sent. For a veterinary business with several hundred drug lines
-- that is days of work, and it has to be redone every time they add a product.
-- The catalogue already exists in their system. We should read it.
--
-- WHAT THIS ADDS.
--
--   external_id: the identifier the OTHER system already uses for that
--   product. Once a catalogue item carries it, their system sends sales under
--   its own product codes and nothing is mapped by hand, ever.
--
--   A place to record where a catalogue came from and when it was last read,
--   so a coach can see that the price list is current without asking anybody.
--
--   catalogue_sources: an address ClearView fetches a price list from on a
--   schedule, which is the pulling half. One row per business unit.
--
-- SAFE TO APPLY: additive only.
-- ============================================================

alter table field_catalogue
  add column if not exists external_id text;
alter table field_catalogue
  add column if not exists external_source text;
alter table field_catalogue
  add column if not exists last_imported_at timestamptz;

comment on column field_catalogue.external_id is
  'The identifier this product carries in the business''s own system. Set when a catalogue is imported, and is what lets that system send sales under its own product codes with nothing mapped by hand.';

-- One external id per business unit, so a second import updates the item it
-- already created rather than making a duplicate. Partial, because items
-- created by hand in ClearView have no external id and there is no way to tell
-- two of those apart.
create unique index if not exists uq_field_catalogue_external
  on field_catalogue (client_id, business_unit_id, external_id)
  where external_id is not null;

-- ============================================================
-- Where a price list is fetched from.
--
-- The pulling half. A coach sets an address once and ClearView reads it on a
-- schedule, so a price changed in their system reaches the workspace without
-- anybody sending anything.
-- ============================================================

create table if not exists catalogue_sources (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  business_unit_id text not null,
  -- The revenue line every imported product rolls up into until a coach files
  -- it somewhere more specific. Their system has no idea how this business's
  -- revenue is broken down, so one decision here beats a question per product.
  default_plan_line_id text not null,
  -- Where to read from. Must be https.
  url text not null,
  -- Sent as an Authorization header when reading, if their system needs one.
  -- Stored because ClearView is the caller here, unlike an API key, which is
  -- why this is the one credential on the platform that is kept rather than
  -- hashed. It is never returned by any endpoint.
  auth_header text,
  -- 'json' today. Left open because a business's export is whatever their
  -- software produces, not whatever we would have chosen.
  format text not null default 'json',
  active boolean not null default true,
  last_run_at timestamptz,
  last_status text,
  last_detail text,
  created_at timestamptz not null default now(),
  unique (client_id, business_unit_id)
);

alter table catalogue_sources enable row level security;

drop policy if exists catalogue_sources_read on catalogue_sources;
create policy catalogue_sources_read on catalogue_sources for select using (my_role() = 'super_coach' or can_view_client(client_id));

drop policy if exists catalogue_sources_write on catalogue_sources;
create policy catalogue_sources_write on catalogue_sources for all using (can_manage_client_access(client_id)) with check (can_manage_client_access(client_id));
