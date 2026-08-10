-- ============================================================
-- CORRECTION: DP04 COSTS THE NEW SERVICES, NOT THE OLD ONES
--
-- The previous migration hung DP04 and DP05 off gtcv_service_inventory. That
-- is wrong, and Habib caught it within the hour.
--
-- The inventory is what the organisation delivers TODAY, most of it on grant
-- logic. The whole point of the method is that DP03 produces value
-- propositions, and a value proposition IS A NEW SERVICE, the commercial offer
-- the organisation intends to sell. DP04 then builds the financial model for
-- those new services, and DP05 takes them to market. Costing the old inventory
-- would model the thing the engagement exists to move away from.
--
-- SO THE TWO HALVES POINT AT DIFFERENT THINGS, and that is the design rather
-- than an inconsistency:
--
--   Clearing the ground and DP01  ->  gtcv_service_inventory
--     what is delivered today, and the portfolio of activities under each
--     service the programme currently pays for.
--
--   DP04 and DP05                 ->  gtcv_propositions
--     the new services, costed, priced and taken to market.
--
-- gtcv_propositions.service_id, added by the previous migration, stays and
-- earns its place: it records which existing service a new one grew out of, so
-- the line from what is delivered today to what will be sold tomorrow is
-- visible rather than implied.
--
-- Nothing had been written to any of the dropped columns.
-- ============================================================

alter table gtcv_cost_lines    drop column if exists service_id;
alter table gtcv_pricing_tiers drop column if exists service_id;
alter table gtcv_ab_tests      drop column if exists service_id;
alter table gtcv_pipeline      drop column if exists service_id;

alter table gtcv_cost_lines
  add column if not exists proposition_id uuid
  references gtcv_propositions(id) on delete set null;

alter table gtcv_pricing_tiers
  add column if not exists proposition_id uuid
  references gtcv_propositions(id) on delete set null;

alter table gtcv_ab_tests
  add column if not exists proposition_id uuid
  references gtcv_propositions(id) on delete set null;

alter table gtcv_pipeline
  add column if not exists proposition_id uuid
  references gtcv_propositions(id) on delete set null;

create index if not exists gtcv_cost_lines_client_prop_idx
  on gtcv_cost_lines (client_id, proposition_id);
create index if not exists gtcv_pricing_tiers_client_prop_idx
  on gtcv_pricing_tiers (client_id, proposition_id);
create index if not exists gtcv_ab_tests_client_prop_idx
  on gtcv_ab_tests (client_id, proposition_id);
create index if not exists gtcv_pipeline_client_prop_idx
  on gtcv_pipeline (client_id, proposition_id);

comment on column gtcv_cost_lines.proposition_id is
  'The new service (DP03 proposition) this cost belongs to. Null means shared across services.';
comment on column gtcv_pricing_tiers.proposition_id is
  'The new service (DP03 proposition) this tier prices.';
comment on column gtcv_ab_tests.proposition_id is
  'The new service (DP03 proposition) this message was testing.';
comment on column gtcv_pipeline.proposition_id is
  'The new service (DP03 proposition) this opportunity is for.';
comment on column gtcv_propositions.service_id is
  'The existing inventory service this new service grew out of, where there is one.';
