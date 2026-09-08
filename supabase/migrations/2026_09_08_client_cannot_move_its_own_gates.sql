-- ============================================================
-- A CLIENT COULD MARK ITS OWN DECISION GATES COMPLETE.  8 September 2026.
--
-- Found by signing in as a real client against the real database and trying
-- the things a client must not be able to do. Three of five succeeded:
--
--   * mark every decision gate on their own engagement complete
--   * rename their own engagement
--   * change their own engagement status
--
-- The gate one is the serious one. The entire method rests on a gate moving
-- only when the evidence behind it holds and the people who have to sign it
-- have signed. A client who can set them all to complete can empty the
-- engagement of its meaning, and the funder reading that record would be
-- reading a fiction.
--
-- WHERE IT CAME FROM. Every one of these tables carries a policy named
-- client_scoped written FOR ALL:
--
--   using (my_role() = 'super_coach' or client_id = my_engagement_client_id())
--
-- FOR ALL means select, insert, update and delete. The intent was plainly to
-- let a client SEE its own engagement; it also let them rewrite it. Nothing in
-- the application ever did, so nothing broke and nobody noticed.
--
-- WHAT CHANGES. On these six tables the client keeps everything they had for
-- reading and loses writing. Writes go to the coaching team: super_coach, and
-- a co-implementer assigned to that client. super_coach has to be named
-- explicitly because can_edit_client_canvas covers assigned co-implementers
-- only, and it was the old FOR ALL policy that was carrying the coach's own
-- write access.
--
-- The client's own operating data is deliberately untouched. Their
-- transactions, customers, stock and figures are theirs to write, and this is
-- about the record of the method, which is not.
--
-- SAFE TO RUN TWICE.
-- ============================================================

-- Three shapes, not one. engagement_clients keys the client on its own id,
-- canvas_dp_status reaches it through canvas_engagements, and the rest carry
-- client_id directly. A single loop with one column name rolls the whole
-- migration back, which is how the difference was found.
do $$
declare
  t text;
  col text;
begin
  foreach t in array array[
    'engagement_clients',
    'canvas_decision_points',
    'canvas_decisions',
    'engagement_diagnostic',
    'handover_record'
  ]
  loop
    col := case when t = 'engagement_clients' then 'id' else 'client_id' end;

    execute format('drop policy if exists client_scoped on %I', t);
    execute format(
      'create policy client_scoped_read on %I for select using (my_role() = ''super_coach'' or %I = my_engagement_client_id())',
      t, col);

    -- with_check as well as using, so an insert is checked too, which a bare
    -- FOR ALL using-clause does not do.
    execute format('drop policy if exists coaching_team_writes on %I', t);
    execute format(
      'create policy coaching_team_writes on %I for all using (my_role() = ''super_coach'' or can_edit_client_canvas(%I)) with check (my_role() = ''super_coach'' or can_edit_client_canvas(%I))',
      t, col, col);
  end loop;
end $$;

-- canvas_dp_status reaches its client through canvas_engagements, so its two
-- policies are written out rather than generated.
drop policy if exists client_scoped on canvas_dp_status;

create policy client_scoped_read on canvas_dp_status
  for select
  using (
    my_role() = 'super_coach'
    or exists (
      select 1 from canvas_engagements ce
      where ce.id = canvas_dp_status.engagement_id
        and ce.client_id = my_engagement_client_id()
    )
  );

drop policy if exists coaching_team_writes on canvas_dp_status;

create policy coaching_team_writes on canvas_dp_status
  for all
  using (
    my_role() = 'super_coach'
    or exists (
      select 1 from canvas_engagements ce
      where ce.id = canvas_dp_status.engagement_id
        and can_edit_client_canvas(ce.client_id)
    )
  )
  with check (
    my_role() = 'super_coach'
    or exists (
      select 1 from canvas_engagements ce
      where ce.id = canvas_dp_status.engagement_id
        and can_edit_client_canvas(ce.client_id)
    )
  );
