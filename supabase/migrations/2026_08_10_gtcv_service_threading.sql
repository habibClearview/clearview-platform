-- ============================================================
-- WHICH SERVICE IS THIS FOR?
--
-- THE GAP. An organisation sells several services, and each is a portfolio of
-- activities. Clearing the ground establishes what the organisation actually
-- does for each service the programme pays for; DP01 names those services;
-- DP04 asks whether the numbers hold and DP05 asks how it goes to market. Both
-- of those questions are asked OF A SERVICE.
--
-- Nothing below DP01 could say which service a row belonged to. A cost line, a
-- pricing tier, a message test and a pipeline row all hung off the engagement
-- and nothing else, so a break-even was the organisation's break-even rather
-- than the service's, and "does this service sustain us", the central question
-- of DP04, could not be answered on screen.
--
-- THE SPINE IS THE SERVICE INVENTORY. gtcv_service_inventory holds the
-- services in the organisation's own words. It is the earliest point at which
-- a service exists, so it is what everything else points at. A DP03
-- proposition is then what one service becomes for one segment, which is why
-- it gets the same reference rather than being the spine itself.
--
-- NULL IS AN ANSWER, NOT A GAP. A cost that genuinely sits across every
-- service, an office or a finance lead, has no service and should not be made
-- to claim one. Null reads as shared, and is grouped and counted as shared.
--
-- ON DELETE SET NULL, not cascade: removing a service from the inventory must
-- never delete the costing built under it.
--
-- ADDITIVE. Every column is nullable with no default.
-- ============================================================

-- An earlier version of this file pointed these at gtcv_propositions. The
-- propositions are DP03 output, which is later than the point services are
-- named and narrower than the question being asked. The columns had been
-- created but never written to, so they are removed rather than left as a
-- second, competing answer to "which service".
alter table gtcv_cost_lines     drop column if exists proposition_id;
alter table gtcv_pricing_tiers  drop column if exists proposition_id;
alter table gtcv_ab_tests       drop column if exists proposition_id;
alter table gtcv_pipeline       drop column if exists proposition_id;

alter table gtcv_cost_lines
  add column if not exists service_id uuid
  references gtcv_service_inventory(id) on delete set null;

alter table gtcv_pricing_tiers
  add column if not exists service_id uuid
  references gtcv_service_inventory(id) on delete set null;

alter table gtcv_ab_tests
  add column if not exists service_id uuid
  references gtcv_service_inventory(id) on delete set null;

alter table gtcv_pipeline
  add column if not exists service_id uuid
  references gtcv_service_inventory(id) on delete set null;

-- A proposition is one service offered to one segment. It already carries the
-- segment; this gives it the service.
alter table gtcv_propositions
  add column if not exists service_id uuid
  references gtcv_service_inventory(id) on delete set null;

-- Clearing the ground runs before the inventory is necessarily filled in, so
-- an assumption can name its service in text and be tied to the inventory row
-- later. Both are kept: the text is what the room said, the reference is what
-- it was reconciled to.
alter table gtcv_assumptions
  add column if not exists service_name text;
alter table gtcv_assumptions
  add column if not exists service_id uuid
  references gtcv_service_inventory(id) on delete set null;

create index if not exists gtcv_cost_lines_client_service_idx
  on gtcv_cost_lines (client_id, service_id);
create index if not exists gtcv_pricing_tiers_client_service_idx
  on gtcv_pricing_tiers (client_id, service_id);
create index if not exists gtcv_ab_tests_client_service_idx
  on gtcv_ab_tests (client_id, service_id);
create index if not exists gtcv_pipeline_client_service_idx
  on gtcv_pipeline (client_id, service_id);
create index if not exists gtcv_propositions_client_service_idx
  on gtcv_propositions (client_id, service_id);
create index if not exists gtcv_assumptions_client_service_idx
  on gtcv_assumptions (client_id, service_id);

comment on column gtcv_cost_lines.service_id is
  'The service this cost belongs to. Null means shared across services.';
comment on column gtcv_pricing_tiers.service_id is
  'The service this tier prices.';
comment on column gtcv_ab_tests.service_id is
  'The service this message was testing.';
comment on column gtcv_pipeline.service_id is
  'The service this opportunity is for.';
comment on column gtcv_propositions.service_id is
  'The service this proposition offers. A proposition is one service for one segment.';
comment on column gtcv_assumptions.service_name is
  'The service this activity sits under, as the room said it, before the inventory exists.';
