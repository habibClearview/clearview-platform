-- ============================================================
-- Programme (funder) and co-implementer portal access.
--
-- Two new logins that see a REAL, RLS-enforced subset of the same data
-- the coach already sees -- not new UI, the existing Clients path,
-- automatically scoped:
--   * co-implementer ('coach' role -- see src/lib/auth/types.ts, this
--     string already existed for exactly this purpose): sees the
--     clients already assigned to them via the existing "Co-implementers
--     & client access" feature (co_implementers.client_ids), full detail,
--     same as the coach sees for those clients.
--   * funder ('funder' role, new): sees the clients under the ONE
--     programme they're linked to (engagement_clients.programme_id),
--     at the level of detail the coach configures per programme
--     (programmes.funder_detail_level: 'summary' | 'full').
--
-- SAFE TO APPLY: every statement is additive (CREATE ... IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS / new policies alongside existing ones).
-- Nothing existing is dropped or altered -- Postgres OR-combines multiple
-- permissive RLS policies on the same table, so adding a new policy can
-- only ADD visibility for the new roles, never remove access any
-- existing role already has. Paste into the Supabase SQL editor and Run.
-- ============================================================

-- 1) Link a login to the roster/programme row it's scoped to.
alter table user_profiles add column if not exists co_implementer_id text references co_implementers(id) on delete set null;
alter table user_profiles add column if not exists funder_programme_id text references programmes(id) on delete set null;

-- 2) Coach-configurable level of detail a funder sees, per programme.
--    'summary': health status + canvas/financial headline only, no
--    drill-down into the full dashboard. 'full': the same dashboard a
--    CEO would see (minus the coach's own internal assessment notes).
alter table programmes add column if not exists funder_detail_level text not null default 'summary';

-- 3) RLS helper functions, matching the existing my_role()/
--    my_engagement_client_id() pattern exactly (security definer, stable,
--    explicit authenticated-only grant).
create or replace function my_co_implementer_id() returns text
language sql security definer stable set search_path = public
as $$ select co_implementer_id from user_profiles where id = auth.uid(); $$;
revoke all on function my_co_implementer_id() from public;
grant execute on function my_co_implementer_id() to authenticated;

create or replace function my_funder_programme_id() returns text
language sql security definer stable set search_path = public
as $$ select funder_programme_id from user_profiles where id = auth.uid(); $$;
revoke all on function my_funder_programme_id() from public;
grant execute on function my_funder_programme_id() to authenticated;

-- 4) One function answering "can the current user see this client",
--    reused by every policy below so the multi-client visibility rule
--    for the two new roles lives in exactly one place. Assumes
--    co_implementers.client_ids is a native text[] column (matching how
--    it's already read/written as a plain array in
--    src/components/coach/TeamPayments.tsx's AccessSection); if it turns
--    out to be jsonb instead, change `= any(ci.client_ids)` to
--    `?  ` / a jsonb containment check accordingly.
create or replace function can_view_client(target_client_id text) returns boolean
language sql security definer stable set search_path = public
as $$
  select
    my_role() = 'super_coach'
    or target_client_id = my_engagement_client_id()
    or (my_role() = 'coach' and exists (
      select 1 from co_implementers ci
      where ci.id = my_co_implementer_id() and target_client_id = any(ci.client_ids)
    ))
    or (my_role() = 'funder' and exists (
      select 1 from engagement_clients ec
      where ec.id = target_client_id and ec.programme_id = my_funder_programme_id()
    ));
$$;
revoke all on function can_view_client(text) from public;
grant execute on function can_view_client(text) to authenticated;

-- Same test, but only true for the co-implementer's OWN fieldwork
-- (funders never get write access to anything).
create or replace function can_edit_client_canvas(target_client_id text) returns boolean
language sql security definer stable set search_path = public
as $$
  select my_role() = 'coach' and exists (
    select 1 from co_implementers ci
    where ci.id = my_co_implementer_id() and target_client_id = any(ci.client_ids)
  );
$$;
revoke all on function can_edit_client_canvas(text) from public;
grant execute on function can_edit_client_canvas(text) to authenticated;

-- 5) engagement_clients itself.
drop policy if exists coach_funder_scoped on engagement_clients;
create policy coach_funder_scoped on engagement_clients for select using (can_view_client(id));

-- 6) Direct text client_id tables -- read access for both new roles.
do $$
declare t text;
begin
  foreach t in array array[
    'ai_health_checks','canvas_components','canvas_decision_points','canvas_decisions',
    'canvas_engagements','canvas_timesheets','client_intake_links','coach_briefings',
    'engagement_diagnostic','evidence_library','field_catalogue','file_links',
    'handover_record','hypotheses','interviews','investment_readiness',
    'management_events','notification_settings','pilot_observations','timesheets',
    'generic_actuals','generic_model_config','provider_links','provider_transactions'
  ]
  loop
    execute format('drop policy if exists coach_funder_scoped on %I', t);
    execute format('create policy coach_funder_scoped on %I for select using (can_view_client(client_id))', t);
  end loop;
end $$;

-- 7) Of those, the ones that are the co-implementer's own coaching
--    fieldwork (not coach-generated analysis/financial data) also get
--    write access for the 'coach' role -- read-only for everyone else.
do $$
declare t text;
begin
  foreach t in array array[
    'canvas_components','canvas_decision_points','canvas_decisions','canvas_engagements',
    'canvas_timesheets','evidence_library','file_links','handover_record','hypotheses',
    'interviews','pilot_observations','engagement_diagnostic','timesheets'
  ]
  loop
    execute format('drop policy if exists coach_own_fieldwork on %I', t);
    execute format('create policy coach_own_fieldwork on %I for all using (can_edit_client_canvas(client_id))', t);
  end loop;
end $$;

-- 8) canvas_* tables scoped via engagement_id -> canvas_engagements.client_id.
do $$
declare t text;
begin
  foreach t in array array[
    'canvas_assumptions','canvas_dp_status','canvas_evidence',
    'canvas_hypotheses','canvas_interviews','canvas_stakeholders'
  ]
  loop
    execute format('drop policy if exists coach_funder_scoped on %I', t);
    execute format(
      'create policy coach_funder_scoped on %I for select using (
        exists (select 1 from canvas_engagements ce where ce.id = %I.engagement_id and can_view_client(ce.client_id))
      )', t, t
    );
    execute format('drop policy if exists coach_own_fieldwork on %I', t);
    execute format(
      'create policy coach_own_fieldwork on %I for all using (
        exists (select 1 from canvas_engagements ce where ce.id = %I.engagement_id and can_edit_client_canvas(ce.client_id))
      )', t, t
    );
  end loop;
end $$;

-- 9) co_implementers / programmes: a coach reads their OWN roster row; a
--    coach or funder reads the programme(s) relevant to what they can
--    already see. Previously super_coach-only, with an explicit note in
--    2026_07_04_comprehensive_rls_audit.sql anticipating exactly this as
--    "a deliberate follow-up decision" once co-implementer login existed.
drop policy if exists coach_own_roster_row on co_implementers;
create policy coach_own_roster_row on co_implementers for select using (
  my_role() = 'coach' and id = my_co_implementer_id()
);
drop policy if exists coach_funder_scoped on programmes;
create policy coach_funder_scoped on programmes for select using (
  (my_role() = 'coach' and exists (
    select 1 from co_implementers ci, engagement_clients ec
    where ci.id = my_co_implementer_id() and ec.id = any(ci.client_ids) and ec.programme_id = programmes.id
  ))
  or (my_role() = 'funder' and id = my_funder_programme_id())
);

-- 10) A co-implementer manages their own pay records -- submit timesheets/
--     expenses, view their own advances/invoices. This is exactly the
--     feature already anticipated by canSubmitTimesheets() in
--     src/lib/coach-types.ts, never wired to a real login until now.
do $$
declare t text;
begin
  foreach t in array array['coach_timesheet_entries','coach_expenses','coach_advances','coach_invoices']
  loop
    execute format('drop policy if exists coach_own_pay_records on %I', t);
    execute format(
      'create policy coach_own_pay_records on %I for all using (
        my_role() = ''coach'' and co_implementer_id = my_co_implementer_id()
      )', t
    );
  end loop;
end $$;
