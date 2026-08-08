-- ============================================================
-- GtCV: tracker fields on the existing decision point rows.
--
-- The Engagement Tracker in the workbook is one row per decision point
-- carrying three things the coach updates at the end of every session:
-- the status, a short evidence summary, and the priority action for the
-- next session. Status already exists on canvas_decision_points. This adds
-- the other two, plus the reviewed timestamp, so the tracker can be edited
-- in the app instead of in a spreadsheet.
--
-- SAFE TO APPLY: additive only. Adds columns if they are absent and
-- changes nothing that exists.
-- ============================================================

alter table canvas_decision_points add column if not exists evidence_summary text;
alter table canvas_decision_points add column if not exists priority_action text;
alter table canvas_decision_points add column if not exists last_reviewed_at timestamptz;
