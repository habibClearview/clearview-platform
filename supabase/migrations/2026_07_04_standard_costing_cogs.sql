-- ============================================================
-- Clearview Field: standard costing for COGS
-- Run this in the Supabase SQL Editor (Project sxsenbvaitpnumdwvxaj)
--
-- Per docs/ACCOUNTING_ARCHITECTURE.md section 3 (IAS 2 / IFRS for SMEs
-- Section 13 compliant). Every catalogue item can now optionally carry a
-- standard cost price, set by the CEO/Finance Manager, invisible to the
-- field operator. When set, a sale automatically produces a matching
-- cost-of-sales entry (volume x cost price) alongside the revenue entry,
-- with zero extra work for whoever made the sale.
--
-- cost_price is nullable and OPTIONAL, deliberately: if it's never set for
-- an item, no COGS entry is fabricated for it -- matches "no invented
-- figures" rather than guessing a cost that was never actually provided.
-- ============================================================

alter table field_catalogue
  add column if not exists cost_price numeric;

-- Which cost_of_sales-category plan line this item's automatic COGS
-- entries roll up into. Explicit, not inferred -- a unit can have more
-- than one COGS line, so this must be chosen, the same way plan_line_id
-- (the revenue line) already is.
alter table field_catalogue
  add column if not exists cogs_plan_line_id text;

-- Set automatically whenever cost_price is edited (server-side, in
-- app/api/field/admin/catalogue/route.ts) -- this is what the eventual
-- 90-day staleness check (docs/ACCOUNTING_ARCHITECTURE.md section 5) reads
-- to guarantee the IAS 2 "reviewed regularly" requirement isn't missed.
alter table field_catalogue
  add column if not exists cost_price_updated_at timestamptz;

comment on column field_catalogue.cost_price is
  'Standard cost per unit, set by CEO/Finance Manager only. Never returned to the field operator (see app/api/field/auth/route.ts explicit column select). Null means no automatic COGS entry is created for this item.';
comment on column field_catalogue.cogs_plan_line_id is
  'The cost_of_sales-category plan line this item''s automatic COGS entries post against. Explicit, since a unit can have more than one COGS line.';

-- Enforced at the schema level, not just in application code: a set cost
-- price always needs a COGS category to post against, and can never be
-- negative. Without this, a bad write from any future code path (or a
-- direct SQL edit) could leave a costed item silently unable to generate
-- COGS on sync, with no obvious symptom until someone notices margins
-- look wrong.
alter table field_catalogue drop constraint if exists field_catalogue_cost_price_nonneg;
alter table field_catalogue add constraint field_catalogue_cost_price_nonneg
  check (cost_price is null or cost_price >= 0);

alter table field_catalogue drop constraint if exists field_catalogue_cost_price_needs_cogs_line;
alter table field_catalogue add constraint field_catalogue_cost_price_needs_cogs_line
  check (cost_price is null or cogs_plan_line_id is not null);
