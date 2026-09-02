-- ============================================================
-- Clearview / Canvas Coach: multiple simultaneous services per payer.
--
-- Real gap: a payer (a programme, or an independent/subscriber client)
-- could only ever be tied to ONE service via engagement_clients'
-- engagement_mode (canvas | financial) on a single client row. That's
-- wrong -- e.g. a programme like CSJ paying for the Clearview financial
-- model for 6 beneficiaries today does not mean CSJ can't ALSO pay for
-- GtCV canvas for a different beneficiary, engage the coach directly for
-- advisory, or subscribe to Portfolio Intelligence, all at the same time.
--
-- This adds a service_engagements table: one row per (payer, service
-- type, optional beneficiary). It is purely additive and runs ALONGSIDE
-- the existing engagement_clients model -- nothing existing is migrated,
-- dropped, or altered, so every feature that reads engagement_clients
-- today keeps working exactly as it does now. This table only powers the
-- new "Services" list on a programme's/independent client's own page.
--
-- SAFE TO APPLY: additive only (CREATE TABLE IF NOT EXISTS). Paste into
-- the Supabase SQL editor and Run.
-- ============================================================

create table if not exists service_engagements (
  id text primary key,
  -- Who pays. Exactly one of these two is set -- a programme (donor or
  -- direct-client programme), or an independent client paying for itself.
  payer_programme_id text references programmes(id) on delete cascade,
  payer_client_id text references engagement_clients(id) on delete cascade,
  -- Who is actually served/using the service. Nullable: some services
  -- (e.g. a Portfolio Intelligence subscription, or advisory delivered
  -- directly to the payer's own team) have no distinct beneficiary
  -- organisation -- the payer IS the one being served.
  beneficiary_client_id text references engagement_clients(id) on delete set null,
  service_type text not null check (service_type in ('advisory','canvas','financial','portfolio_intelligence')),
  status text not null default 'active' check (status in ('active','paused','complete')),
  fee numeric,
  fee_currency text default 'USD',
  fee_status text check (fee_status in ('paid','invoiced','unpaid')),
  start_date date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint service_engagements_one_payer check (
    (payer_programme_id is not null and payer_client_id is null)
    or (payer_programme_id is null and payer_client_id is not null)
  )
);

create index if not exists service_engagements_payer_programme_idx on service_engagements(payer_programme_id);
create index if not exists service_engagements_payer_client_idx on service_engagements(payer_client_id);
create index if not exists service_engagements_beneficiary_idx on service_engagements(beneficiary_client_id);

-- RLS: super_coach only, matching co_implementers / programmes (see
-- 2026_07_11_coach_payments_deals_fees.sql for the same pattern).
alter table service_engagements enable row level security;
drop policy if exists client_scoped on service_engagements;
create policy client_scoped on service_engagements for all using (my_role() = 'super_coach');
