-- ============================================================
-- Clearview: one-time code verification for external access grants.
--
-- Answers a real gap in the email-match check added in
-- 2026_07_13_access_grants_portfolio_scope.sql: typing an email address
-- that happens to match proves nothing -- anyone can type anyone's
-- email. A one-time code sent TO that address and typed back in proves
-- the visitor actually controls that inbox, which a bare forwarded link
-- (or a forwarded "here's the email to use" note) no longer satisfies by
-- itself -- the forwarder would have to also forward a fresh code every
-- single time, real friction against casual sharing.
--
-- Columns are read/written by the service-role API route only (see
-- app/api/access-grant/[token]/route.ts) -- no RLS policy change needed,
-- this table's existing policies already cover the whole row.
--
-- SAFE TO APPLY: additive only, all nullable/defaulted. Paste into the
-- Supabase SQL editor and Run.
-- ============================================================

alter table client_access_grants add column if not exists otp_code text;              -- current 6-digit code, cleared after successful verification (single-use)
alter table client_access_grants add column if not exists otp_email text;             -- the email the current code was sent to
alter table client_access_grants add column if not exists otp_expires_at timestamptz; -- code is invalid after this, regardless of attempts remaining
alter table client_access_grants add column if not exists otp_attempts integer not null default 0; -- failed verify attempts against the CURRENT code; a fresh request resets this
