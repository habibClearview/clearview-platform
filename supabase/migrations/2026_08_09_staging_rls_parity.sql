-- ============================================================
-- Row level security on the staging tables that were missing it.
--
-- WHAT WAS WRONG. Seventy one tables in this schema had row level security
-- switched off while the public anon key still carried a select grant. The
-- anon key ships inside the browser bundle, so it is public by design and only
-- safe because row level security is supposed to stand behind it. With the
-- policies missing, an unauthenticated request carrying nothing but that
-- public key returned rows from user_profiles, evidence_library,
-- client_access_grants and engagement_clients. That was verified against the
-- REST endpoint, not inferred from the catalogue.
--
-- WHERE THE POLICIES COME FROM. They are not invented here. Production already
-- runs row level security on all of these tables, with policies that the live
-- application has been working against for months. This migration reproduces
-- those policies exactly, so the effect is to remove a drift rather than to
-- impose a new rule that has never been exercised. Anything the application
-- can do today against production it can still do after this runs.
--
-- WHY IT IS SAFE TO RUN TWICE. Every policy is dropped by name before it is
-- created, and enabling row level security on a table that already has it is a
-- no-op. No column is dropped, renamed or retyped and no row is deleted.
--
-- rate_limit_counters gets row level security with no policy at all, which is
-- what production does. Only the service role touches it, and the service role
-- is not subject to row level security, so a policy would only be there to be
-- wrong later.
-- ============================================================


-- ai_health_checks
alter table public.ai_health_checks enable row level security;
drop policy if exists "client_scoped" on public.ai_health_checks;
create policy "client_scoped"
  on public.ai_health_checks
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.ai_health_checks;
create policy "coach_funder_scoped"
  on public.ai_health_checks for select
  using (can_view_client(client_id));

-- audit_log
alter table public.audit_log enable row level security;
drop policy if exists "client_admin_read_own_audit" on public.audit_log;
create policy "client_admin_read_own_audit"
  on public.audit_log for select
  using ((client_id IN ( SELECT user_profiles.client_id
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = ANY (ARRAY['coach'::text, 'client_admin'::text]))))));
drop policy if exists "coaches_read_audit_log" on public.audit_log;
create policy "coaches_read_audit_log"
  on public.audit_log for select
  using ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'coach'::text)))));

-- canvas_assumptions
alter table public.canvas_assumptions enable row level security;
drop policy if exists "client_scoped" on public.canvas_assumptions;
create policy "client_scoped"
  on public.canvas_assumptions
  using (((my_role() = 'super_coach'::text) OR (EXISTS ( SELECT 1
   FROM canvas_engagements ce
  WHERE ((ce.id = canvas_assumptions.engagement_id) AND (ce.client_id = my_engagement_client_id()))))));
drop policy if exists "coach_funder_scoped" on public.canvas_assumptions;
create policy "coach_funder_scoped"
  on public.canvas_assumptions for select
  using ((EXISTS ( SELECT 1
   FROM canvas_engagements ce
  WHERE ((ce.id = canvas_assumptions.engagement_id) AND can_view_client(ce.client_id)))));
drop policy if exists "coach_own_fieldwork" on public.canvas_assumptions;
create policy "coach_own_fieldwork"
  on public.canvas_assumptions
  using ((EXISTS ( SELECT 1
   FROM canvas_engagements ce
  WHERE ((ce.id = canvas_assumptions.engagement_id) AND can_edit_client_canvas(ce.client_id)))));

-- canvas_components
alter table public.canvas_components enable row level security;
drop policy if exists "client_scoped" on public.canvas_components;
create policy "client_scoped"
  on public.canvas_components
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.canvas_components;
create policy "coach_funder_scoped"
  on public.canvas_components for select
  using (can_view_client(client_id));
drop policy if exists "coach_own_fieldwork" on public.canvas_components;
create policy "coach_own_fieldwork"
  on public.canvas_components
  using (can_edit_client_canvas(client_id));

-- canvas_decision_points
alter table public.canvas_decision_points enable row level security;
drop policy if exists "client_scoped" on public.canvas_decision_points;
create policy "client_scoped"
  on public.canvas_decision_points
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.canvas_decision_points;
create policy "coach_funder_scoped"
  on public.canvas_decision_points for select
  using (can_view_client(client_id));
drop policy if exists "coach_own_fieldwork" on public.canvas_decision_points;
create policy "coach_own_fieldwork"
  on public.canvas_decision_points
  using (can_edit_client_canvas(client_id));

-- canvas_decisions
alter table public.canvas_decisions enable row level security;
drop policy if exists "client_scoped" on public.canvas_decisions;
create policy "client_scoped"
  on public.canvas_decisions
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.canvas_decisions;
create policy "coach_funder_scoped"
  on public.canvas_decisions for select
  using (can_view_client(client_id));
drop policy if exists "coach_own_fieldwork" on public.canvas_decisions;
create policy "coach_own_fieldwork"
  on public.canvas_decisions
  using (can_edit_client_canvas(client_id));

-- canvas_dp_status
alter table public.canvas_dp_status enable row level security;
drop policy if exists "client_scoped" on public.canvas_dp_status;
create policy "client_scoped"
  on public.canvas_dp_status
  using (((my_role() = 'super_coach'::text) OR (EXISTS ( SELECT 1
   FROM canvas_engagements ce
  WHERE ((ce.id = canvas_dp_status.engagement_id) AND (ce.client_id = my_engagement_client_id()))))));
drop policy if exists "coach_funder_scoped" on public.canvas_dp_status;
create policy "coach_funder_scoped"
  on public.canvas_dp_status for select
  using ((EXISTS ( SELECT 1
   FROM canvas_engagements ce
  WHERE ((ce.id = canvas_dp_status.engagement_id) AND can_view_client(ce.client_id)))));
drop policy if exists "coach_own_fieldwork" on public.canvas_dp_status;
create policy "coach_own_fieldwork"
  on public.canvas_dp_status
  using ((EXISTS ( SELECT 1
   FROM canvas_engagements ce
  WHERE ((ce.id = canvas_dp_status.engagement_id) AND can_edit_client_canvas(ce.client_id)))));

-- canvas_engagements
alter table public.canvas_engagements enable row level security;
drop policy if exists "client_scoped" on public.canvas_engagements;
create policy "client_scoped"
  on public.canvas_engagements
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.canvas_engagements;
create policy "coach_funder_scoped"
  on public.canvas_engagements for select
  using (can_view_client(client_id));
drop policy if exists "coach_own_fieldwork" on public.canvas_engagements;
create policy "coach_own_fieldwork"
  on public.canvas_engagements
  using (can_edit_client_canvas(client_id));

-- canvas_evidence
alter table public.canvas_evidence enable row level security;
drop policy if exists "client_scoped" on public.canvas_evidence;
create policy "client_scoped"
  on public.canvas_evidence
  using (((my_role() = 'super_coach'::text) OR (EXISTS ( SELECT 1
   FROM canvas_engagements ce
  WHERE ((ce.id = canvas_evidence.engagement_id) AND (ce.client_id = my_engagement_client_id()))))));
drop policy if exists "coach_funder_scoped" on public.canvas_evidence;
create policy "coach_funder_scoped"
  on public.canvas_evidence for select
  using ((EXISTS ( SELECT 1
   FROM canvas_engagements ce
  WHERE ((ce.id = canvas_evidence.engagement_id) AND can_view_client(ce.client_id)))));
drop policy if exists "coach_own_fieldwork" on public.canvas_evidence;
create policy "coach_own_fieldwork"
  on public.canvas_evidence
  using ((EXISTS ( SELECT 1
   FROM canvas_engagements ce
  WHERE ((ce.id = canvas_evidence.engagement_id) AND can_edit_client_canvas(ce.client_id)))));

-- canvas_hypotheses
alter table public.canvas_hypotheses enable row level security;
drop policy if exists "client_scoped" on public.canvas_hypotheses;
create policy "client_scoped"
  on public.canvas_hypotheses
  using (((my_role() = 'super_coach'::text) OR (EXISTS ( SELECT 1
   FROM canvas_engagements ce
  WHERE ((ce.id = canvas_hypotheses.engagement_id) AND (ce.client_id = my_engagement_client_id()))))));
drop policy if exists "coach_funder_scoped" on public.canvas_hypotheses;
create policy "coach_funder_scoped"
  on public.canvas_hypotheses for select
  using ((EXISTS ( SELECT 1
   FROM canvas_engagements ce
  WHERE ((ce.id = canvas_hypotheses.engagement_id) AND can_view_client(ce.client_id)))));
drop policy if exists "coach_own_fieldwork" on public.canvas_hypotheses;
create policy "coach_own_fieldwork"
  on public.canvas_hypotheses
  using ((EXISTS ( SELECT 1
   FROM canvas_engagements ce
  WHERE ((ce.id = canvas_hypotheses.engagement_id) AND can_edit_client_canvas(ce.client_id)))));

-- canvas_interviews
alter table public.canvas_interviews enable row level security;
drop policy if exists "client_scoped" on public.canvas_interviews;
create policy "client_scoped"
  on public.canvas_interviews
  using (((my_role() = 'super_coach'::text) OR (EXISTS ( SELECT 1
   FROM canvas_engagements ce
  WHERE ((ce.id = canvas_interviews.engagement_id) AND (ce.client_id = my_engagement_client_id()))))));
drop policy if exists "coach_funder_scoped" on public.canvas_interviews;
create policy "coach_funder_scoped"
  on public.canvas_interviews for select
  using ((EXISTS ( SELECT 1
   FROM canvas_engagements ce
  WHERE ((ce.id = canvas_interviews.engagement_id) AND can_view_client(ce.client_id)))));
drop policy if exists "coach_own_fieldwork" on public.canvas_interviews;
create policy "coach_own_fieldwork"
  on public.canvas_interviews
  using ((EXISTS ( SELECT 1
   FROM canvas_engagements ce
  WHERE ((ce.id = canvas_interviews.engagement_id) AND can_edit_client_canvas(ce.client_id)))));

-- canvas_stakeholders
alter table public.canvas_stakeholders enable row level security;
drop policy if exists "client_scoped" on public.canvas_stakeholders;
create policy "client_scoped"
  on public.canvas_stakeholders
  using (((my_role() = 'super_coach'::text) OR (EXISTS ( SELECT 1
   FROM canvas_engagements ce
  WHERE ((ce.id = canvas_stakeholders.engagement_id) AND (ce.client_id = my_engagement_client_id()))))));
drop policy if exists "coach_funder_scoped" on public.canvas_stakeholders;
create policy "coach_funder_scoped"
  on public.canvas_stakeholders for select
  using ((EXISTS ( SELECT 1
   FROM canvas_engagements ce
  WHERE ((ce.id = canvas_stakeholders.engagement_id) AND can_view_client(ce.client_id)))));
drop policy if exists "coach_own_fieldwork" on public.canvas_stakeholders;
create policy "coach_own_fieldwork"
  on public.canvas_stakeholders
  using ((EXISTS ( SELECT 1
   FROM canvas_engagements ce
  WHERE ((ce.id = canvas_stakeholders.engagement_id) AND can_edit_client_canvas(ce.client_id)))));

-- canvas_timesheets
alter table public.canvas_timesheets enable row level security;
drop policy if exists "client_scoped" on public.canvas_timesheets;
create policy "client_scoped"
  on public.canvas_timesheets
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.canvas_timesheets;
create policy "coach_funder_scoped"
  on public.canvas_timesheets for select
  using (can_view_client(client_id));
drop policy if exists "coach_own_fieldwork" on public.canvas_timesheets;
create policy "coach_own_fieldwork"
  on public.canvas_timesheets
  using (can_edit_client_canvas(client_id));

-- catalogue_value_lists
alter table public.catalogue_value_lists enable row level security;
drop policy if exists "catalogue_value_lists_read" on public.catalogue_value_lists;
create policy "catalogue_value_lists_read"
  on public.catalogue_value_lists for select
  using (can_view_client(client_id));

-- client_access_grants
alter table public.client_access_grants enable row level security;
drop policy if exists "coach_funder_read" on public.client_access_grants;
create policy "coach_funder_read"
  on public.client_access_grants for select
  using (
CASE
    WHEN (client_id IS NULL) THEN (my_role() = 'super_coach'::text)
    ELSE can_view_client(client_id)
END);
drop policy if exists "coach_manage" on public.client_access_grants;
create policy "coach_manage"
  on public.client_access_grants
  using (
CASE
    WHEN (client_id IS NULL) THEN (my_role() = 'super_coach'::text)
    ELSE can_manage_client_access(client_id)
END)
  with check (
CASE
    WHEN (client_id IS NULL) THEN (my_role() = 'super_coach'::text)
    ELSE can_manage_client_access(client_id)
END);

-- client_intake_links
alter table public.client_intake_links enable row level security;
drop policy if exists "client_scoped" on public.client_intake_links;
create policy "client_scoped"
  on public.client_intake_links
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.client_intake_links;
create policy "coach_funder_scoped"
  on public.client_intake_links for select
  using (can_view_client(client_id));

-- clients
alter table public.clients enable row level security;
drop policy if exists "auth_client_read_self" on public.clients;
create policy "auth_client_read_self"
  on public.clients for select
  using ((id IN ( SELECT user_profiles.client_id
   FROM user_profiles
  WHERE (user_profiles.id = auth.uid()))));
drop policy if exists "coach_read_all_clients" on public.clients;
create policy "coach_read_all_clients"
  on public.clients for select
  using ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'coach'::text)))));

-- co_implementers
alter table public.co_implementers enable row level security;
drop policy if exists "client_scoped" on public.co_implementers;
create policy "client_scoped"
  on public.co_implementers
  using ((my_role() = 'super_coach'::text));
drop policy if exists "coach_own_roster_row" on public.co_implementers;
create policy "coach_own_roster_row"
  on public.co_implementers for select
  using (((my_role() = 'coach'::text) AND (id = my_co_implementer_id())));

-- coach_advances
alter table public.coach_advances enable row level security;
drop policy if exists "client_scoped" on public.coach_advances;
create policy "client_scoped"
  on public.coach_advances
  using ((my_role() = 'super_coach'::text));
drop policy if exists "coach_own_pay_records" on public.coach_advances;
create policy "coach_own_pay_records"
  on public.coach_advances
  using (((my_role() = 'coach'::text) AND (co_implementer_id = my_co_implementer_id())));

-- coach_briefings
alter table public.coach_briefings enable row level security;
drop policy if exists "client_scoped" on public.coach_briefings;
create policy "client_scoped"
  on public.coach_briefings
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.coach_briefings;
create policy "coach_funder_scoped"
  on public.coach_briefings for select
  using (can_view_client(client_id));

-- coach_expenses
alter table public.coach_expenses enable row level security;
drop policy if exists "client_scoped" on public.coach_expenses;
create policy "client_scoped"
  on public.coach_expenses
  using ((my_role() = 'super_coach'::text));
drop policy if exists "coach_own_pay_records" on public.coach_expenses;
create policy "coach_own_pay_records"
  on public.coach_expenses
  using (((my_role() = 'coach'::text) AND (co_implementer_id = my_co_implementer_id())));

-- coach_invoices
alter table public.coach_invoices enable row level security;
drop policy if exists "client_scoped" on public.coach_invoices;
create policy "client_scoped"
  on public.coach_invoices
  using ((my_role() = 'super_coach'::text));
drop policy if exists "coach_own_pay_records" on public.coach_invoices;
create policy "coach_own_pay_records"
  on public.coach_invoices
  using (((my_role() = 'coach'::text) AND (co_implementer_id = my_co_implementer_id())));

-- coach_timesheet_entries
alter table public.coach_timesheet_entries enable row level security;
drop policy if exists "client_scoped" on public.coach_timesheet_entries;
create policy "client_scoped"
  on public.coach_timesheet_entries
  using ((my_role() = 'super_coach'::text));
drop policy if exists "coach_own_pay_records" on public.coach_timesheet_entries;
create policy "coach_own_pay_records"
  on public.coach_timesheet_entries
  using (((my_role() = 'coach'::text) AND (co_implementer_id = my_co_implementer_id())));

-- config_history
alter table public.config_history enable row level security;
drop policy if exists "auth_client_access_config_history" on public.config_history;
create policy "auth_client_access_config_history"
  on public.config_history
  using ((client_id IN ( SELECT user_profiles.client_id
   FROM user_profiles
  WHERE (user_profiles.id = auth.uid()))));

-- counterparty_roster
alter table public.counterparty_roster enable row level security;
drop policy if exists "auth_client_access_counterparty_roster" on public.counterparty_roster;
create policy "auth_client_access_counterparty_roster"
  on public.counterparty_roster
  using ((client_id IN ( SELECT user_profiles.client_id
   FROM user_profiles
  WHERE (user_profiles.id = auth.uid()))));

-- engagement_clients
alter table public.engagement_clients enable row level security;
drop policy if exists "client_scoped" on public.engagement_clients;
create policy "client_scoped"
  on public.engagement_clients
  using (((my_role() = 'super_coach'::text) OR (id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.engagement_clients;
create policy "coach_funder_scoped"
  on public.engagement_clients for select
  using (can_view_client(id));

-- engagement_diagnostic
alter table public.engagement_diagnostic enable row level security;
drop policy if exists "client_scoped" on public.engagement_diagnostic;
create policy "client_scoped"
  on public.engagement_diagnostic
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.engagement_diagnostic;
create policy "coach_funder_scoped"
  on public.engagement_diagnostic for select
  using (can_view_client(client_id));
drop policy if exists "coach_own_fieldwork" on public.engagement_diagnostic;
create policy "coach_own_fieldwork"
  on public.engagement_diagnostic
  using (can_edit_client_canvas(client_id));

-- evidence_library
alter table public.evidence_library enable row level security;
drop policy if exists "client_scoped" on public.evidence_library;
create policy "client_scoped"
  on public.evidence_library
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.evidence_library;
create policy "coach_funder_scoped"
  on public.evidence_library for select
  using (can_view_client(client_id));
drop policy if exists "coach_own_fieldwork" on public.evidence_library;
create policy "coach_own_fieldwork"
  on public.evidence_library
  using (can_edit_client_canvas(client_id));

-- field_catalogue
alter table public.field_catalogue enable row level security;
drop policy if exists "client_scoped" on public.field_catalogue;
create policy "client_scoped"
  on public.field_catalogue
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.field_catalogue;
create policy "coach_funder_scoped"
  on public.field_catalogue for select
  using (can_view_client(client_id));

-- field_credit_transactions
alter table public.field_credit_transactions enable row level security;
drop policy if exists "client_scoped" on public.field_credit_transactions;
create policy "client_scoped"
  on public.field_credit_transactions
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));

-- field_customers
alter table public.field_customers enable row level security;
drop policy if exists "client_scoped" on public.field_customers;
create policy "client_scoped"
  on public.field_customers
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));

-- field_operator_tokens
alter table public.field_operator_tokens enable row level security;
drop policy if exists "client_scoped" on public.field_operator_tokens;
create policy "client_scoped"
  on public.field_operator_tokens
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));

-- field_operators
alter table public.field_operators enable row level security;
drop policy if exists "client_scoped" on public.field_operators;
create policy "client_scoped"
  on public.field_operators
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));

-- field_stock_levels
alter table public.field_stock_levels enable row level security;
drop policy if exists "client_scoped_stock_levels" on public.field_stock_levels;
create policy "client_scoped_stock_levels"
  on public.field_stock_levels
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));

-- field_stock_movements
alter table public.field_stock_movements enable row level security;
drop policy if exists "client_scoped_stock_movements" on public.field_stock_movements;
create policy "client_scoped_stock_movements"
  on public.field_stock_movements
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));

-- field_sync_log
alter table public.field_sync_log enable row level security;
drop policy if exists "client_scoped" on public.field_sync_log;
create policy "client_scoped"
  on public.field_sync_log
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));

-- field_transactions
alter table public.field_transactions enable row level security;
drop policy if exists "client_scoped" on public.field_transactions;
create policy "client_scoped"
  on public.field_transactions
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));

-- field_uncategorized_costs
alter table public.field_uncategorized_costs enable row level security;
drop policy if exists "client_scoped_uncategorized_costs" on public.field_uncategorized_costs;
create policy "client_scoped_uncategorized_costs"
  on public.field_uncategorized_costs
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));

-- field_visit_logs
alter table public.field_visit_logs enable row level security;
drop policy if exists "client_scoped" on public.field_visit_logs;
create policy "client_scoped"
  on public.field_visit_logs
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));

-- file_links
alter table public.file_links enable row level security;
drop policy if exists "client_scoped" on public.file_links;
create policy "client_scoped"
  on public.file_links
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.file_links;
create policy "coach_funder_scoped"
  on public.file_links for select
  using (can_view_client(client_id));
drop policy if exists "coach_own_fieldwork" on public.file_links;
create policy "coach_own_fieldwork"
  on public.file_links
  using (can_edit_client_canvas(client_id));

-- generic_actuals
alter table public.generic_actuals enable row level security;
drop policy if exists "client_scoped" on public.generic_actuals;
create policy "client_scoped"
  on public.generic_actuals
  using ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND ((up.role = 'super_coach'::text) OR (up.engagement_client_id = generic_actuals.client_id))))));
drop policy if exists "coach_funder_scoped" on public.generic_actuals;
create policy "coach_funder_scoped"
  on public.generic_actuals for select
  using (can_view_client(client_id));

-- generic_market_events
alter table public.generic_market_events enable row level security;
drop policy if exists "market_events_delete" on public.generic_market_events;
create policy "market_events_delete"
  on public.generic_market_events for delete
  using ((((my_role() = 'super_coach'::text) OR can_view_client(client_id)) AND ((my_role() = ANY (ARRAY['super_coach'::text, 'coach'::text, 'ceo'::text, 'finance_manager'::text])) OR ((status = 'proposed'::text) AND (created_by_uid = auth.uid())))));
drop policy if exists "market_events_insert" on public.generic_market_events;
create policy "market_events_insert"
  on public.generic_market_events for insert
  with check ((((my_role() = 'super_coach'::text) OR can_view_client(client_id)) AND (status = 'proposed'::text) AND (created_by_uid = auth.uid())));
drop policy if exists "market_events_read" on public.generic_market_events;
create policy "market_events_read"
  on public.generic_market_events for select
  using (((my_role() = 'super_coach'::text) OR can_view_client(client_id)));
drop policy if exists "market_events_update" on public.generic_market_events;
create policy "market_events_update"
  on public.generic_market_events for update
  using (((my_role() = 'super_coach'::text) OR can_view_client(client_id)))
  with check ((((my_role() = 'super_coach'::text) OR can_view_client(client_id)) AND ((my_role() = ANY (ARRAY['super_coach'::text, 'coach'::text, 'ceo'::text, 'finance_manager'::text])) OR ((status = 'proposed'::text) AND (created_by_uid = auth.uid())))));

-- generic_model_config
alter table public.generic_model_config enable row level security;
drop policy if exists "client_scoped" on public.generic_model_config;
create policy "client_scoped"
  on public.generic_model_config
  using ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND ((up.role = 'super_coach'::text) OR (up.engagement_client_id = generic_model_config.client_id))))));
drop policy if exists "coach_funder_scoped" on public.generic_model_config;
create policy "coach_funder_scoped"
  on public.generic_model_config for select
  using (can_view_client(client_id));

-- generic_period_close
alter table public.generic_period_close enable row level security;
drop policy if exists "client_scoped" on public.generic_period_close;
create policy "client_scoped"
  on public.generic_period_close
  using ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND ((up.role = 'super_coach'::text) OR (up.engagement_client_id = generic_period_close.client_id))))));

-- generic_spend_requests
alter table public.generic_spend_requests enable row level security;
drop policy if exists "client_scoped" on public.generic_spend_requests;
create policy "client_scoped"
  on public.generic_spend_requests
  using ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND ((up.role = 'super_coach'::text) OR (up.engagement_client_id = generic_spend_requests.client_id))))));

-- generic_year_close
alter table public.generic_year_close enable row level security;
drop policy if exists "client_scoped_read" on public.generic_year_close;
create policy "client_scoped_read"
  on public.generic_year_close for select
  using (((my_role() = ANY (ARRAY['super_coach'::text, 'ceo'::text, 'finance_manager'::text])) AND ((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id()))));
drop policy if exists "client_scoped_write" on public.generic_year_close;
create policy "client_scoped_write"
  on public.generic_year_close
  using (((my_role() = ANY (ARRAY['super_coach'::text, 'ceo'::text, 'finance_manager'::text])) AND ((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id()))));

-- handover_record
alter table public.handover_record enable row level security;
drop policy if exists "client_scoped" on public.handover_record;
create policy "client_scoped"
  on public.handover_record
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.handover_record;
create policy "coach_funder_scoped"
  on public.handover_record for select
  using (can_view_client(client_id));
drop policy if exists "coach_own_fieldwork" on public.handover_record;
create policy "coach_own_fieldwork"
  on public.handover_record
  using (can_edit_client_canvas(client_id));

-- hypotheses
alter table public.hypotheses enable row level security;
drop policy if exists "client_scoped" on public.hypotheses;
create policy "client_scoped"
  on public.hypotheses
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.hypotheses;
create policy "coach_funder_scoped"
  on public.hypotheses for select
  using (can_view_client(client_id));
drop policy if exists "coach_own_fieldwork" on public.hypotheses;
create policy "coach_own_fieldwork"
  on public.hypotheses
  using (can_edit_client_canvas(client_id));

-- interviews
alter table public.interviews enable row level security;
drop policy if exists "client_scoped" on public.interviews;
create policy "client_scoped"
  on public.interviews
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.interviews;
create policy "coach_funder_scoped"
  on public.interviews for select
  using (can_view_client(client_id));
drop policy if exists "coach_own_fieldwork" on public.interviews;
create policy "coach_own_fieldwork"
  on public.interviews
  using (can_edit_client_canvas(client_id));

-- investment_readiness
alter table public.investment_readiness enable row level security;
drop policy if exists "client_scoped" on public.investment_readiness;
create policy "client_scoped"
  on public.investment_readiness
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.investment_readiness;
create policy "coach_funder_scoped"
  on public.investment_readiness for select
  using (can_view_client(client_id));

-- management_events
alter table public.management_events enable row level security;
drop policy if exists "client_scoped" on public.management_events;
create policy "client_scoped"
  on public.management_events
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.management_events;
create policy "coach_funder_scoped"
  on public.management_events for select
  using (can_view_client(client_id));

-- market_intelligence
alter table public.market_intelligence enable row level security;
drop policy if exists "client_scoped" on public.market_intelligence;
create policy "client_scoped"
  on public.market_intelligence
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));

-- model_config
alter table public.model_config enable row level security;
drop policy if exists "client_scoped" on public.model_config;
create policy "client_scoped"
  on public.model_config
  using (((my_role() = 'super_coach'::text) OR (client_id = my_legacy_client_id())));

-- monthly_actuals
alter table public.monthly_actuals enable row level security;
drop policy if exists "client_scoped" on public.monthly_actuals;
create policy "client_scoped"
  on public.monthly_actuals
  using (((my_role() = 'super_coach'::text) OR (client_id = my_legacy_client_id())));

-- notification_settings
alter table public.notification_settings enable row level security;
drop policy if exists "client_scoped" on public.notification_settings;
create policy "client_scoped"
  on public.notification_settings
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.notification_settings;
create policy "coach_funder_scoped"
  on public.notification_settings for select
  using (can_view_client(client_id));

-- pilot_observations
alter table public.pilot_observations enable row level security;
drop policy if exists "client_scoped" on public.pilot_observations;
create policy "client_scoped"
  on public.pilot_observations
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.pilot_observations;
create policy "coach_funder_scoped"
  on public.pilot_observations for select
  using (can_view_client(client_id));
drop policy if exists "coach_own_fieldwork" on public.pilot_observations;
create policy "coach_own_fieldwork"
  on public.pilot_observations
  using (can_edit_client_canvas(client_id));

-- programmes
alter table public.programmes enable row level security;
drop policy if exists "client_scoped" on public.programmes;
create policy "client_scoped"
  on public.programmes
  using ((my_role() = 'super_coach'::text));
drop policy if exists "coach_funder_scoped" on public.programmes;
create policy "coach_funder_scoped"
  on public.programmes for select
  using ((((my_role() = 'coach'::text) AND (EXISTS ( SELECT 1
   FROM co_implementers ci,
    engagement_clients ec
  WHERE ((ci.id = my_co_implementer_id()) AND (ec.id = ANY (ci.client_ids)) AND (ec.programme_id = programmes.id))))) OR ((my_role() = 'funder'::text) AND (id = my_funder_programme_id()))));

-- provider_links
alter table public.provider_links enable row level security;
drop policy if exists "client_scoped" on public.provider_links;
create policy "client_scoped"
  on public.provider_links
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.provider_links;
create policy "coach_funder_scoped"
  on public.provider_links for select
  using (can_view_client(client_id));

-- provider_transactions
alter table public.provider_transactions enable row level security;
drop policy if exists "client_scoped" on public.provider_transactions;
create policy "client_scoped"
  on public.provider_transactions
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.provider_transactions;
create policy "coach_funder_scoped"
  on public.provider_transactions for select
  using (can_view_client(client_id));

-- scenarios
alter table public.scenarios enable row level security;
drop policy if exists "auth_client_access_scenarios" on public.scenarios;
create policy "auth_client_access_scenarios"
  on public.scenarios
  using ((client_id IN ( SELECT user_profiles.client_id
   FROM user_profiles
  WHERE (user_profiles.id = auth.uid()))));

-- service_engagements
alter table public.service_engagements enable row level security;
drop policy if exists "client_scoped" on public.service_engagements;
create policy "client_scoped"
  on public.service_engagements
  using ((my_role() = 'super_coach'::text));

-- spend_requests
alter table public.spend_requests enable row level security;
drop policy if exists "client_scoped" on public.spend_requests;
create policy "client_scoped"
  on public.spend_requests
  using (((my_role() = 'super_coach'::text) OR (client_id = my_legacy_client_id())));

-- staff_time_records
alter table public.staff_time_records enable row level security;
drop policy if exists "client_scoped" on public.staff_time_records;
create policy "client_scoped"
  on public.staff_time_records
  using (((my_role() = 'super_coach'::text) OR (client_id = my_legacy_client_id())));

-- support_action_log
alter table public.support_action_log enable row level security;
drop policy if exists "action_log_read" on public.support_action_log;
create policy "action_log_read"
  on public.support_action_log for select
  using ((my_role() = 'super_coach'::text));

-- support_conversations
alter table public.support_conversations enable row level security;
drop policy if exists "conversations_read" on public.support_conversations;
create policy "conversations_read"
  on public.support_conversations for select
  using (((my_role() = 'super_coach'::text) OR ((client_id IS NOT NULL) AND can_view_client(client_id))));

-- support_escalations
alter table public.support_escalations enable row level security;
drop policy if exists "escalations_read" on public.support_escalations;
create policy "escalations_read"
  on public.support_escalations for select
  using (((my_role() = 'super_coach'::text) OR ((client_id IS NOT NULL) AND can_view_client(client_id))));

-- support_playbook_entries
alter table public.support_playbook_entries enable row level security;
drop policy if exists "playbook_read" on public.support_playbook_entries;
create policy "playbook_read"
  on public.support_playbook_entries for select
  using ((my_role() = ANY (ARRAY['super_coach'::text, 'co_implementer'::text])));

-- timesheets
alter table public.timesheets enable row level security;
drop policy if exists "client_scoped" on public.timesheets;
create policy "client_scoped"
  on public.timesheets
  using (((my_role() = 'super_coach'::text) OR (client_id = my_engagement_client_id())));
drop policy if exists "coach_funder_scoped" on public.timesheets;
create policy "coach_funder_scoped"
  on public.timesheets for select
  using (can_view_client(client_id));
drop policy if exists "coach_own_fieldwork" on public.timesheets;
create policy "coach_own_fieldwork"
  on public.timesheets
  using (can_edit_client_canvas(client_id));

-- unit_actuals
alter table public.unit_actuals enable row level security;
drop policy if exists "client_scoped" on public.unit_actuals;
create policy "client_scoped"
  on public.unit_actuals
  using (((my_role() = 'super_coach'::text) OR (client_id = my_legacy_client_id())));

-- user_profiles
alter table public.user_profiles enable row level security;
drop policy if exists "client_scoped" on public.user_profiles;
create policy "client_scoped"
  on public.user_profiles
  using (((id = auth.uid()) OR (my_role() = 'super_coach'::text) OR ((my_engagement_client_id() IS NOT NULL) AND (engagement_client_id = my_engagement_client_id()))));

-- rate_limit_counters: service role only, so row level security with no policy.
alter table public.rate_limit_counters enable row level security;
