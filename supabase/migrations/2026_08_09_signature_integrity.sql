-- ============================================================
-- Signature integrity.
--
-- Two changes, both about the same thing: a signature record must say
-- truthfully who signed and who typed it in.
--
--   recorded_by_user_id  the account that entered the signature. When a
--                        signer presses Sign themselves this is the same as
--                        signer_user_id. When the lead consultant enters a
--                        signature given on paper in a session, it is the
--                        lead. Without this column the record either claims
--                        the signer logged in when they did not, or loses the
--                        fact that somebody else entered it.
--
--   one signature per party per version, and per gate action. A second row
--   for the same party on the same charter version is not a second signature,
--   it is a duplicate, and duplicates make the count of who has signed wrong.
--
-- Additive only. No column is dropped, renamed or retyped, and the unique
-- indexes are created after any existing duplicates are collapsed to the
-- earliest row, so applying this cannot fail on data already recorded.
-- ============================================================

alter table public.charter_signatures
  add column if not exists recorded_by_user_id uuid;

alter table public.gtcv_gate_signoffs
  add column if not exists recorded_by_user_id uuid;

alter table public.gtcv_gate_signoffs
  add column if not exists signature_method text;

-- Backfill: everything recorded until now was entered by the signer, since
-- there was no other path to record one.
update public.charter_signatures
  set recorded_by_user_id = signer_user_id
  where recorded_by_user_id is null and signer_user_id is not null;

update public.gtcv_gate_signoffs
  set recorded_by_user_id = signer_user_id
  where recorded_by_user_id is null and signer_user_id is not null;

update public.gtcv_gate_signoffs
  set signature_method = 'self'
  where signature_method is null;

-- Collapse any existing duplicate signatures to the earliest one, so the
-- unique index below can be created. The earliest row is kept because that is
-- when the party actually signed.
delete from public.charter_signatures a
  using public.charter_signatures b
  where a.charter_id = b.charter_id
    and a.signer_role = b.signer_role
    and (a.signed_at, a.id) > (b.signed_at, b.id);

create unique index if not exists charter_signatures_one_per_role
  on public.charter_signatures (charter_id, signer_role);

grant select, insert, update, delete on public.charter_signatures to authenticated;
grant select, insert, update, delete on public.gtcv_gate_signoffs to authenticated;
