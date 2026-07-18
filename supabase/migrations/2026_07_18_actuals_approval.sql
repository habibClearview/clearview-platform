-- ============================================================
-- Clearview: approval for submitted monthly actuals.
--
-- Background: entering monthly actuals and pressing "Submit for Approval"
-- only ever set generic_actuals.submitted = true. There was no "approved"
-- state and no screen on which a Finance Manager, CEO or coach could actually
-- approve — so submitted figures sat in limbo with nowhere to go. (A full
-- FM->CEO approval flow already existed, but only for spend requests, a
-- different table.) This migration adds the missing approval columns; the
-- approve / send-back UI is wired to them in the app.
--
-- SAFE TO APPLY: additive only. Adds four nullable/defaulted columns to the
-- existing generic_actuals table. No existing column or row is modified; every
-- current row simply reads approved = false (i.e. "submitted, not yet
-- approved" if it was submitted, or "draft" otherwise), which is the correct
-- starting point. Paste into the Supabase SQL editor and Run.
--
-- Conventions (see .github/scripts/validate-migration.py):
--   - no client_id / auth.users columns are added here, so no type rules apply
--   - RLS already governs generic_actuals; this ALTER does not change it
-- ============================================================

alter table generic_actuals add column if not exists approved boolean not null default false;
alter table generic_actuals add column if not exists approved_at timestamptz;
alter table generic_actuals add column if not exists approved_by text;
-- When an approver sends figures back for correction, the reason is stored here
-- so the person who entered them sees why. Cleared again on the next approval.
alter table generic_actuals add column if not exists review_note text;
