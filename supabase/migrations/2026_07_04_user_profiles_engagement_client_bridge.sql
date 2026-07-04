-- ============================================================
-- Clearview: bridge user_profiles to engagement_clients directly
-- Run this in the Supabase SQL Editor (Project sxsenbvaitpnumdwvxaj)
--
-- Root problem: user_profiles.client_id references the OLDER `clients`
-- table (UUID ids), but every part of the actual Generic Model / Field /
-- Actuals system (generic_actuals, generic_model_config,
-- field_transactions, engagement_clients itself) uses TEXT ids from
-- engagement_clients. Only 2 of 7 real engagement_clients even have a
-- corresponding `clients` row -- the two systems were never reconciled.
--
-- CONAS is unaffected by this migration: it has its own dedicated route
-- (app/dashboard/conas/page.tsx, not the dynamic [slug] route) and uses
-- the UUID `clients.id` consistently throughout its own tables. This
-- fix is additive -- it does not touch or require changing anything
-- CONAS depends on.
--
-- This adds a direct link so app/dashboard/[slug]/page.tsx (and RLS
-- policies) can check "does this user actually belong to this client"
-- with one clean column, not a fragile runtime join through a slug match.
-- ============================================================

alter table user_profiles
  add column if not exists engagement_client_id text references engagement_clients(id);

-- One-time backfill via the existing slug bridge, for any user_profiles
-- row that already has a legacy clients.id and hasn't been backfilled yet.
update user_profiles up
set engagement_client_id = ec.id
from clients c
join engagement_clients ec on ec.slug = c.slug
where up.client_id = c.id
  and up.engagement_client_id is null;

comment on column user_profiles.engagement_client_id is
  'Direct reference to engagement_clients.id (text) -- the ID system actually used by generic_actuals, generic_model_config, field_transactions, etc. Null for super_coach (sees all clients) and for any user not yet migrated off the legacy clients.id reference.';
