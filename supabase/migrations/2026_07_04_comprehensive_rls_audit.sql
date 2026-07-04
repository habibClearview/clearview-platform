-- ============================================================
-- Clearview: comprehensive client-scoped RLS across every remaining table
-- Run this in the Supabase SQL Editor (Project sxsenbvaitpnumdwvxaj)
--
-- Covers everything found in a full audit of every table in the public
-- schema, prompted directly by a request to check for any other access
-- control gaps beyond the generic_* tables fixed previously. Three
-- distinct problems found, all fixed here:
--
-- 1. ~20 tables (including CONAS's own model_config, spend_requests,
--    staff_time_records -- a real, live client with real financial
--    data) had RLS enabled but the policy only checked
--    auth.role() = 'authenticated' -- any logged-in user, full access,
--    regardless of which client the data belongs to.
--
-- 2. A second set of tables (field_transactions, monthly_actuals, and
--    8 canvas_* tables) had policies that LOOK properly scoped -- they
--    check auth.jwt() ->> 'role' and auth.jwt() ->> 'client_id' -- but
--    the actual custom_access_token_hook function that's supposed to
--    populate those JWT claims never sets them (it only sets
--    app_metadata.user_role, a different field entirely). These
--    policies never evaluate true for anyone, so these tables are
--    currently locked to all browser access -- not exploitable, but
--    silently broken. Rather than modify the global auth hook (a
--    system-wide change affecting every login, much larger blast
--    radius), these are fixed here by replacing the broken JWT-claim
--    check with the same proven, working user_profiles-lookup pattern
--    used everywhere else in this migration.
--
-- 3. field_catalogue had RLS enabled with ZERO policies at all --
--    deny-all for browser access (safe, but likely breaks any direct
--    browser read of the catalogue).
--
-- Two helper functions avoid both duplicating the same subquery in
-- every single policy below, and the recursion risk of a table (like
-- user_profiles) referencing itself directly inside its own policy.
-- SECURITY DEFINER means these run with the function owner's
-- privileges, bypassing RLS internally for this one lookup -- they
-- only ever return facts about the CALLING user's own profile, never
-- another user's data.
-- ============================================================

create or replace function my_role() returns text
language sql security definer stable
set search_path = public
as $$
  select role from user_profiles where id = auth.uid();
$$;

create or replace function my_engagement_client_id() returns text
language sql security definer stable
set search_path = public
as $$
  select engagement_client_id from user_profiles where id = auth.uid();
$$;

create or replace function my_legacy_client_id() returns uuid
language sql security definer stable
set search_path = public
as $$
  select client_id from user_profiles where id = auth.uid();
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default. These are safe
-- regardless (they only ever return the calling user's own facts), but
-- tightening the surface explicitly to authenticated-only is cheap and
-- removes any reliance on that default being harmless.
revoke execute on function my_role() from public;
revoke execute on function my_engagement_client_id() from public;
revoke execute on function my_legacy_client_id() from public;
grant execute on function my_role() to authenticated;
grant execute on function my_engagement_client_id() to authenticated;
grant execute on function my_legacy_client_id() to authenticated;

-- ── user_profiles: a user always sees their own row, plus every
--    teammate sharing their engagement_client_id; super_coach sees all.
--    Uses the helper functions above specifically to avoid the
--    self-reference recursion risk of a table's policy querying itself
--    directly. ──
drop policy if exists auth_all on user_profiles;
drop policy if exists client_scoped on user_profiles;
create policy client_scoped on user_profiles
  for all using (
    id = auth.uid()
    or my_role() = 'super_coach'
    or (my_engagement_client_id() is not null and engagement_client_id = my_engagement_client_id())
  );

-- ── engagement_clients: a user sees only their own client's row; super_coach sees all. ──
drop policy if exists auth_all on engagement_clients;
drop policy if exists client_scoped on engagement_clients;
create policy client_scoped on engagement_clients
  for all using (
    my_role() = 'super_coach' or id = my_engagement_client_id()
  );

-- ── CONAS / legacy UUID group: model_config, spend_requests,
--    staff_time_records, unit_actuals. These use user_profiles.client_id
--    (the UUID column) directly -- no bridge needed, CONAS already
--    consistently uses this system throughout its own tables. ──
do $$
declare
  t text;
begin
  foreach t in array array['model_config','spend_requests','staff_time_records','unit_actuals']
  loop
    execute format('drop policy if exists allow_authenticated on %I', t);
    execute format('drop policy if exists client_scoped on %I', t);
    execute format(
      'create policy client_scoped on %I for all using (my_role() = ''super_coach'' or client_id = my_legacy_client_id())',
      t
    );
  end loop;
end $$;

-- ── Direct text client_id group: everything else that references
--    engagement_clients.id directly. ──
do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_health_checks','canvas_components','canvas_decision_points','canvas_decisions',
    'canvas_engagements','canvas_timesheets','client_intake_links','coach_briefings',
    'engagement_diagnostic','evidence_library','field_catalogue','file_links',
    'handover_record','hypotheses','interviews','investment_readiness',
    'management_events','notification_settings','pilot_observations','timesheets'
  ]
  loop
    execute format('drop policy if exists auth_all on %I', t);
    execute format('drop policy if exists coaches_all on %I', t);
    execute format('drop policy if exists client_scoped on %I', t);
    execute format(
      'create policy client_scoped on %I for all using (my_role() = ''super_coach'' or client_id = my_engagement_client_id())',
      t
    );
  end loop;
end $$;

-- ── canvas_* tables linked via engagement_id, not a direct client_id
--    column -- scope through canvas_engagements. ──
do $$
declare
  t text;
begin
  foreach t in array array[
    'canvas_assumptions','canvas_dp_status','canvas_evidence',
    'canvas_hypotheses','canvas_interviews','canvas_stakeholders'
  ]
  loop
    execute format('drop policy if exists coaches_all on %I', t);
    execute format('drop policy if exists client_scoped on %I', t);
    execute format(
      'create policy client_scoped on %I for all using (
        my_role() = ''super_coach'' or exists (
          select 1 from canvas_engagements ce
          where ce.id = %I.engagement_id and ce.client_id = my_engagement_client_id()
        )
      )', t, t
    );
  end loop;
end $$;

-- ── field_transactions, monthly_actuals: replace the JWT-claim
--    dependent policies (never true, see note above) with the same
--    working pattern. field_transactions and monthly_actuals both use
--    UUID client_id matching the legacy clients table (same world as
--    CONAS -- monthly_actuals in particular is the older, pre-generic-
--    model actuals table). ──
drop policy if exists ft_coach on field_transactions;
drop policy if exists ft_super_coach on field_transactions;
drop policy if exists client_scoped on field_transactions;
create policy client_scoped on field_transactions
  for all using (
    my_role() = 'super_coach' or client_id = my_engagement_client_id()
  );

drop policy if exists client_own_monthly_actuals on monthly_actuals;
drop policy if exists super_coach_monthly_actuals on monthly_actuals;
drop policy if exists client_scoped on monthly_actuals;
create policy client_scoped on monthly_actuals
  for all using (
    my_role() = 'super_coach' or client_id = my_legacy_client_id()
  );

-- ── Remaining field-app tables found depending on the same broken JWT
--    claim (fct_coach/fct_super_coach etc pattern) -- these use text
--    client_id matching engagement_clients, same as the direct group
--    above. Service-role field API routes are unaffected either way
--    (service role always bypasses RLS); this is specifically about
--    any browser-side access to these tables. ──
do $$
declare
  t text;
begin
  -- Actual policy names use short prefixes (fct_, fc_, fo_, fot_, fsl_,
  -- fvl_, mi_), not table_name + suffix -- drop those explicitly.
  drop policy if exists fct_coach on field_credit_transactions;
  drop policy if exists fct_super_coach on field_credit_transactions;
  drop policy if exists fc_coach on field_customers;
  drop policy if exists fc_super_coach on field_customers;
  drop policy if exists fo_coach on field_operators;
  drop policy if exists fo_super_coach on field_operators;
  drop policy if exists fot_super_coach on field_operator_tokens;
  drop policy if exists fsl_super_coach on field_sync_log;
  drop policy if exists fvl_super_coach on field_visit_logs;
  drop policy if exists mi_coach on market_intelligence;
  drop policy if exists mi_super_coach on market_intelligence;

  foreach t in array array[
    'field_credit_transactions','field_customers','field_operators',
    'field_operator_tokens','field_sync_log','field_visit_logs','market_intelligence'
  ]
  loop
    execute format('drop policy if exists client_scoped on %I', t);
    execute format(
      'create policy client_scoped on %I for all using (my_role() = ''super_coach'' or client_id = my_engagement_client_id())',
      t
    );
  end loop;
end $$;

-- ── co_implementers, programmes: array-based, associated with MULTIPLE
--    clients each (a co-implementer or a funder programme can span
--    several engagements). This is Habib's own operational/roster data,
--    not per-client financial data -- scoped to super_coach only as the
--    safe default. If client-facing visibility into their assigned
--    co-implementer is wanted later, that's a deliberate follow-up
--    decision, not something to guess at here. ──
drop policy if exists auth_all on co_implementers;
drop policy if exists client_scoped on co_implementers;
create policy client_scoped on co_implementers for all using (my_role() = 'super_coach');

drop policy if exists auth_all on programmes;
drop policy if exists client_scoped on programmes;
create policy client_scoped on programmes for all using (my_role() = 'super_coach');

-- ── Safety net, matching the same pattern used for the earlier
--    generic_* RLS cutover: warn if any non-super_coach user still has
--    no client reference on either system, since such a user loses all
--    access to everything covered by this migration. ──
do $$
declare
  unmigrated_count int;
begin
  select count(*) into unmigrated_count
  from user_profiles
  where role != 'super_coach' and engagement_client_id is null and client_id is null;
  if unmigrated_count > 0 then
    raise warning 'RLS cutover: % non-super_coach user_profiles row(s) have NEITHER client_id nor engagement_client_id set and will lose access to everything covered by this migration.', unmigrated_count;
  end if;
end $$;
