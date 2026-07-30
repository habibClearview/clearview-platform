-- ============================================================
-- RECRUITMENT  (customer_leads enrichment)  [additive]
--
-- Turns the sales funnel into a proper recruitment log:
--   * officer_staff_id  -- links the lead to the STAFF member who recruited it
--                          (from the roster) instead of only a free-text name,
--                          so conversion KPIs land on a real, unique person.
--   * location          -- where the recruited customer is
--   * business_size     -- rough size (their own words / a band)
--   * expected_spend     -- what the recruiter expects them to buy per month;
--                          later compared against actual sales for accountability
--
-- The free-text `officer` column stays (kept in step with the linked staff
-- member's name) so existing rows and the per-officer breakdown keep working.
--
-- Also (re)grants customer_leads to authenticated — belt-and-braces, in case
-- Supabase auto-grant did not fire (same issue we hit on `staff`). RLS still
-- scopes rows to the caller's client.
--
-- SAFE TO APPLY: additive + idempotent. Requires `customer_leads`
-- (2026_07_28_customer_leads.sql) and `staff` (2026_07_28_staff.sql).
-- ============================================================

alter table customer_leads add column if not exists officer_staff_id uuid references staff(id);
alter table customer_leads add column if not exists location text;
alter table customer_leads add column if not exists business_size text;
alter table customer_leads add column if not exists expected_spend numeric;

create index if not exists idx_customer_leads_officer_staff
  on customer_leads (officer_staff_id);

grant select, insert, update, delete on customer_leads to authenticated;
