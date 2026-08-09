-- ============================================================
-- A code the room can type, alongside the link it already has.
--
-- WHAT WAS MISSING. Opening a block to the room produced a QR code and a sixty
-- character address. Scanning puts it on a phone. Somebody who would rather
-- work in the browser on their laptop, which is most people once a session gets
-- going, had no route in that did not involve typing sixty random characters or
-- getting the link across from another device somehow. So a second way in: a
-- short code, read off the screen at the front of the room.
--
-- IT IS NOT A SECOND KIND OF ACCESS. The code finds the same grant row, which
-- still carries the block, the engagement, the session and the expiry. Anything
-- the code opens, the link already opened. It cannot reach further, because
-- there is nothing further for it to reach.
--
-- WHY UNIQUE ONLY AMONG LINKS THAT ARE STILL OPEN. Two sessions open at once
-- must not share a code, or the room lands in whichever one the database
-- happened to return. Closing a link frees its code to be issued again, so
-- codes are not burned forever.
--
-- Expiry is deliberately NOT part of the condition, and not by preference: an
-- index cannot be built on the current time, because what it holds would have
-- to be recomputed on every row as the clock moved. So an expired link keeps
-- its code until it is closed. That costs nothing: the lookup checks expiry
-- itself and refuses, and a code the generator cannot use it simply tries
-- again for.
--
-- WHY IT IS NULLABLE. Every session link issued before today has none, and a
-- link with no code still works exactly as it did. Nothing that exists needs
-- rewriting for this to arrive.
-- ============================================================

alter table public.client_access_grants
  add column if not exists join_code text;

-- The shape is enforced here as well as in the application, because a code that
-- is not eight characters of the agreed alphabet cannot have come from the
-- generator, and a row that could only have been written by hand or by a bug
-- should not be the row a room lands on.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'client_access_grants_join_code_shape'
  ) then
    alter table public.client_access_grants
      add constraint client_access_grants_join_code_shape
      check (join_code is null or join_code ~ '^[23456789ACDEFHJKMNPQRTUVWXY]{8}$');
  end if;
end $$;

create unique index if not exists client_access_grants_join_code_live
  on public.client_access_grants (join_code)
  where join_code is not null and revoked_at is null;

comment on column public.client_access_grants.join_code is
  'Short code a room types instead of the long link. Same grant, same scope.';
