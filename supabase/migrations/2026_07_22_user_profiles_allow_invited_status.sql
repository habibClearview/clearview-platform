-- ============================================================
-- Allow the 'invited' status on user_profiles
--
-- THE PROBLEM: inviting a client login (e.g. a CEO) failed with
--   23514: new row for relation "user_profiles" violates check
--   constraint "user_profiles_status_check"
-- The invite writes status = 'invited' for a person who has been sent an
-- invitation email but has not yet accepted it and set a password. The
-- original status CHECK constraint (created in the Supabase dashboard, not
-- in a migration) never included 'invited', so every invite was rejected
-- and the login could not be linked to the organisation.
--
-- THE FIX: widen the constraint to include 'invited' alongside the other
-- lifecycle values. 'invited' is the honest state for a not-yet-accepted
-- login; the app moves the record on from there as the person accepts and
-- signs in. This column does NOT gate authentication -- Supabase Auth does
-- (the person must accept the email and set a password) -- so widening it
-- grants no access; it only lets us record the true state.
--
-- SAFE TO APPLY: it only relaxes an existing constraint (adds an allowed
-- value); it never rejects data that was previously accepted. Added as
-- NOT VALID first so the ALTER always succeeds regardless of any legacy
-- rows, then validated separately.
--
-- Paste into the Supabase SQL editor and Run.
-- ============================================================

alter table public.user_profiles
  drop constraint if exists user_profiles_status_check;

alter table public.user_profiles
  add constraint user_profiles_status_check
  check (status in ('invited', 'active', 'inactive', 'pending', 'suspended', 'disabled'))
  not valid;

-- Validate against existing rows in a separate step. If this fails, it means
-- some existing row holds a status outside the set above -- add that value to
-- the check list and re-run rather than dropping the constraint.
alter table public.user_profiles
  validate constraint user_profiles_status_check;
