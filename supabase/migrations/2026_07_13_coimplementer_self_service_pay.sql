-- ============================================================
-- Co-implementer self-service pay: submit own timesheets, expenses,
-- and advance requests (coach still approves everything and issues
-- the invoice) -- plus real receipt/proof file uploads.
--
-- coach_advances had no receipt column at all; coach_expenses had one
-- but it was always just a pasted URL, never an actual upload -- no
-- table anywhere in this codebase uses Supabase Storage yet. Setting up
-- a real, private, RLS-scoped bucket rather than trusting a free-text
-- URL field for financial proof documents.
--
-- SAFE TO APPLY: every statement is additive (CREATE ... IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS / new policies alongside existing ones).
-- Paste into the Supabase SQL editor and Run.
-- ============================================================

-- 1) Advances can now carry a receipt/proof too, same as expenses.
alter table coach_advances add column if not exists receipt_url text;

-- 2) A private bucket for both expense receipts and advance proofs.
--    Not public -- these are financial documents. Access is entirely
--    via the RLS policy below plus short-lived signed URLs generated
--    on demand when someone views a receipt (see ReceiptUpload in
--    src/components/coach/TeamPayments.tsx), never a permanent public link.
insert into storage.buckets (id, name, public)
values ('coach-receipts', 'coach-receipts', false)
on conflict (id) do nothing;

-- 3) Object path convention: '{co_implementer_id}/{timestamp}_{filename}'.
--    A co-implementer can read/write only under their own
--    co_implementer_id folder; super_coach can read/write everything in
--    the bucket (to review receipts and, if needed, tidy up).
drop policy if exists coach_receipts_access on storage.objects;
create policy coach_receipts_access on storage.objects for all using (
  bucket_id = 'coach-receipts' and (
    my_role() = 'super_coach'
    or (my_role() = 'coach' and (storage.foldername(name))[1] = my_co_implementer_id())
  )
) with check (
  bucket_id = 'coach-receipts' and (
    my_role() = 'super_coach'
    or (my_role() = 'coach' and (storage.foldername(name))[1] = my_co_implementer_id())
  )
);
