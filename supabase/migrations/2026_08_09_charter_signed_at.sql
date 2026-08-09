-- ────────────────────────────────────────────────────────────
-- The Charter needs to record WHEN it became fully executed.
--
-- 'signed' was already an allowed status on engagement_charters, and both
-- the Charter screen and the downloadable document already render it, but
-- no code path ever set it: signing recorded a signature row and left the
-- charter's own status untouched. So a Charter signed by all three parties
-- still described itself as out for signature, on screen and in the copy
-- people file.
--
-- Additive only. Existing rows are untouched; charters already fully signed
-- move to 'signed' the next time a signature lands, and the backfill below
-- corrects any that are already complete.
-- ────────────────────────────────────────────────────────────
alter table engagement_charters
  add column if not exists signed_at timestamptz;

comment on column engagement_charters.signed_at is
  'When the last required signatory signed this version. Null while any signatory is outstanding.';

-- Backfill: any issued charter whose every signatory has already signed is
-- fully executed now, and should say so rather than waiting for a signature
-- that will never come because there is nobody left to sign.
update engagement_charters c
set    status = 'signed',
       signed_at = coalesce(
         (select max(s.signed_at) from charter_signatures s where s.charter_id = c.id),
         now()
       ),
       updated_at = now()
where  c.status = 'issued'
  and  exists (
         select 1 from engagement_parties p
         where p.client_id = c.client_id and p.is_signatory = true
       )
  and  not exists (
         select 1 from engagement_parties p
         where p.client_id = c.client_id
           and p.is_signatory = true
           and not exists (
             select 1 from charter_signatures s
             where s.charter_id = c.id and s.party_id = p.id
           )
       );
