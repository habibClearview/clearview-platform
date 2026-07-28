-- ============================================================
-- CUSTOMER LEADS  [additive]
--
-- Backs the "BUSINESS > Customers & Marketing > Funnel" tab: a lightweight
-- sales/marketing funnel tracked per officer (the salesperson / marketer who
-- owns the relationship). A lead moves lead -> prospect -> client; the UI
-- reports counts per stage, conversion % between stages, and a per-officer
-- breakdown.
--
-- This is deliberately SEPARATE from field_customers. field_customers records
-- an actual customer captured in the field app (a completed relationship);
-- customer_leads tracks the pipeline that precedes it, including people who
-- never convert. Keeping them apart means promoting a lead to 'client' never
-- has to mutate field data, and abandoned leads never pollute the customer
-- list.
--
-- DESIGN (reuses existing repo patterns):
--   * client_id is TEXT (matches engagement_clients.id and every other
--     client-scoped field_* / catalogue_* table; the migration validator
--     requires client_id to be TEXT).
--   * 'officer' is a free-text label (the sales/marketing person's name),
--     not an FK to auth users -- the officer running a funnel is frequently a
--     field agent who is not a platform login, so a text label is the honest
--     model and matches how field_operators names are surfaced.
--   * RLS follows the writable client-scoped pattern used by
--     field_stock_levels / field_stock_movements
--     (2026_07_08_field_stock_tracking.sql): a single FOR ALL policy scoping
--     to the caller's engagement client, with super_coach able to see every
--     client. my_role() / my_engagement_client_id() are the existing
--     security-definer helpers from 2026_07_04_comprehensive_rls_audit.sql.
--
-- SAFE TO APPLY: purely additive. One new table, two indexes, RLS + one
-- policy. Nothing existing is altered or removed. Paste into the Supabase SQL
-- editor and Run.
-- ============================================================

create table if not exists customer_leads (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  name text,
  contact text,
  officer text,                          -- the sales/marketing person who owns the lead
  stage text not null default 'lead'
    check (stage in ('lead', 'prospect', 'client')),
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Funnel counts and per-officer grouping both read by client first.
create index if not exists idx_customer_leads_client_stage
  on customer_leads (client_id, stage);
create index if not exists idx_customer_leads_client_officer
  on customer_leads (client_id, officer);

alter table customer_leads enable row level security;

-- Client-scoped read + write. super_coach sees/edits every client; a client's
-- own users see/edit only their engagement client's leads. Mirrors the
-- field_stock_* policies exactly.
drop policy if exists client_scoped_customer_leads on customer_leads;
create policy client_scoped_customer_leads on customer_leads
  for all using (
    my_role() = 'super_coach' or client_id = my_engagement_client_id()
  )
  with check (
    my_role() = 'super_coach' or client_id = my_engagement_client_id()
  );
