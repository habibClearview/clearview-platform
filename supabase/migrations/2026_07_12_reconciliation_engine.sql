-- ============================================================
-- Clearview: reconciliation & verification layer.
--
-- Adds the storage the reconciliation engine needs to VERIFY field-app
-- entries against real mobile-money payments (see
-- docs/RECONCILIATION_SPEC.md): a table for raw normalized provider
-- transactions, a table for per-client wallet links / readiness state,
-- and three additive columns on field_transactions.
--
-- SAFE TO APPLY: every statement is additive (CREATE ... IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS). Nothing existing is dropped or altered, so
-- applying this cannot break any current feature. It is also INERT: no
-- application code writes these until the reconciliation runner is wired
-- in a later step, exactly as the Track-2 migration (#89) was inert until
-- its UI (#91). Paste into the Supabase SQL editor and Run.
--
-- Why a separate provider_transactions table (not a nullable field on
-- field_transactions): an inbound mobile-money payment with no matching
-- field entry has no plan_line_id and no business_unit yet, and
-- field_transactions.plan_line_id is NOT NULL by design. Forcing raw
-- payments into that table is impossible; they get their own home here.
--
-- RLS: a client's own payment data, so scoped to that client
-- (my_engagement_client_id()) with super_coach able to see all, matching
-- the field-table and coach-table patterns. The reconciliation runner and
-- provider webhook route use the service-role key, which bypasses RLS as
-- the field sync route already does.
-- ============================================================

-- 1) Raw normalized provider transactions --------------------------
--    One row per real mobile-money movement, provider-agnostic. This is
--    also the home for "unattributed inbound" -- money that arrived with
--    no matching field entry, held for review and NEVER silently folded
--    into revenue.
create table if not exists provider_transactions (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,                       -- the MSME / engagement_clients.id that owns the wallet
  provider_id text not null,                     -- e.g. 'mtn_ug_momo', 'simulated'
  country text,
  external_ref text not null,                    -- the provider's own transaction id
  amount numeric not null,
  currency text default 'UGX',
  occurred_at timestamptz not null,              -- when the payment actually happened
  direction text not null default 'inbound',     -- inbound | outbound
  raw_payload jsonb,
  reconciliation_state text not null default 'unattributed_inbound',  -- matched | unattributed_inbound | ignored
  matched_transaction_id uuid,                   -- the field_transactions.id it paired with
  business_unit_id text,                         -- filled from the match, else null
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- A webhook replay must never create a second row for the same payment.
create unique index if not exists uq_provider_txn_ref
  on provider_transactions(provider_id, external_ref);
create index if not exists idx_provider_txn_client_state
  on provider_transactions(client_id, reconciliation_state);
create index if not exists idx_provider_txn_client_time
  on provider_transactions(client_id, occurred_at);

-- 2) Per-client wallet links & readiness state ---------------------
--    Drives the onboarding messaging (not_started -> wallet_activated ->
--    link_pending -> tier1_active). One row per (client, provider).
create table if not exists provider_links (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  provider_id text not null,
  country text,
  status text not null default 'not_started',    -- not_started | wallet_activated | link_pending | tier1_active
  linked_at timestamptz,
  revoked_at timestamptz,
  config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_provider_link_client_provider
  on provider_links(client_id, provider_id);

-- 3) Reconciliation columns on field_transactions ------------------
--    All nullable / safe-defaulted, so existing rows and older field-app
--    sync payloads are unaffected.
--    * captured_at: the real moment of sale, plumbed from the field
--      queue's queued_at. transaction_date is a DATE (day-only) and
--      synced_at clusters at end-of-day, so neither can drive a
--      +/-15-minute match window; captured_at is what makes matching
--      possible.
alter table field_transactions add column if not exists captured_at timestamptz;
alter table field_transactions add column if not exists reconciliation_state text default 'declared_only';  -- matched | declared_only | not_applicable
alter table field_transactions add column if not exists matched_provider_txn_id uuid;
create index if not exists idx_field_txn_recon_state
  on field_transactions(client_id, reconciliation_state);

-- 4) RLS -----------------------------------------------------------
alter table provider_transactions enable row level security;
alter table provider_links        enable row level security;

drop policy if exists client_scoped on provider_transactions;
create policy client_scoped on provider_transactions for all
  using (my_role() = 'super_coach' or client_id = my_engagement_client_id());

drop policy if exists client_scoped on provider_links;
create policy client_scoped on provider_links for all
  using (my_role() = 'super_coach' or client_id = my_engagement_client_id());
