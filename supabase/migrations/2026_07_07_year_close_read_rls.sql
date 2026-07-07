-- ============================================================
-- Clearview: tighten generic_year_close read access
--
-- The original read policy (2026_07_04_year_end_close.sql) was only
-- client-scoped, meaning ANY role with access to a client (including
-- roles well below finance_manager) could read closing_snapshot -- a
-- full year-end Balance Sheet position -- via RLS, even though the UI
-- only ever displayed it to super_coach/ceo/finance_manager. The write
-- policy was already correctly role-restricted; the read policy was not.
-- Found by CodeRabbit review on the PR that migrated this UI out of the
-- old Annual tab.
-- ============================================================

drop policy if exists client_scoped_read on generic_year_close;

create policy client_scoped_read on generic_year_close
  for select using (
    my_role() = ANY (ARRAY['super_coach','ceo','finance_manager'])
    and (my_role() = 'super_coach' or client_id = my_engagement_client_id())
  );
