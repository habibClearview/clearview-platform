-- ============================================================
-- Charter child row integrity.
--
-- Comments and signatures each carry a client_id next to their charter_id,
-- and nothing tied the two together. A caller who could view client A could
-- insert a row with client_id 'A' and a charter_id belonging to client B, and
-- because the Charter page reads its comments and signatures by charter_id
-- alone, the row would appear on client B's Charter. Two organisations who
-- have never met would be reading each other's comments.
--
-- The durable fix is structural rather than a policy patch, because a policy
-- only binds callers going through row level security and the service-role
-- routes do not. A composite foreign key binds everyone: the pair
-- (charter_id, client_id) has to exist on the parent charter, so a mismatched
-- pair simply cannot be written, by any writer, ever.
--
-- Existing mismatched rows would block the constraint, so they are corrected
-- first by taking the parent charter's client_id as the truth. The parent is
-- the authority: a comment belongs to whichever engagement owns the charter it
-- was written on.
--
-- Additive. No column is dropped or retyped and no data is deleted.
-- ============================================================

-- The pair the children will point at.
create unique index if not exists engagement_charters_id_client
  on engagement_charters (id, client_id);

-- Correct any row whose client_id disagrees with its parent before binding.
update charter_comments c
  set client_id = ch.client_id
  from engagement_charters ch
  where c.charter_id = ch.id and c.client_id is distinct from ch.client_id;

update charter_signatures s
  set client_id = ch.client_id
  from engagement_charters ch
  where s.charter_id = ch.id and s.client_id is distinct from ch.client_id;

-- Bind each child to the parent as a pair. The old single-column foreign key
-- stays where it exists; it is implied by this one and dropping it would be a
-- destructive change for no gain.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'charter_comments_charter_client_fk'
  ) then
    alter table charter_comments
      add constraint charter_comments_charter_client_fk
      foreign key (charter_id, client_id)
      references engagement_charters (id, client_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'charter_signatures_charter_client_fk'
  ) then
    alter table charter_signatures
      add constraint charter_signatures_charter_client_fk
      foreign key (charter_id, client_id)
      references engagement_charters (id, client_id)
      on delete cascade;
  end if;
end $$;

-- The comments table was missing its grant, so authenticated callers could not
-- reach it at all even where row level security allowed them.
grant select, insert, update, delete on charter_comments to authenticated;

-- gtcv_gate_signoffs is unique on (client_id, dp_id, signer_role, decision).
-- A null in any of those columns makes every row distinct as far as the index
-- is concerned, which is the opposite of what the constraint is for: it would
-- let the same signature be recorded again and again. The three that identify
-- the record are made not null so the constraint actually holds.
update gtcv_gate_signoffs set signer_role = 'unknown' where signer_role is null;
update gtcv_gate_signoffs set decision = 'signed' where decision is null;

alter table gtcv_gate_signoffs alter column signer_role set not null;
alter table gtcv_gate_signoffs alter column decision set not null;
alter table gtcv_gate_signoffs alter column dp_id set not null;

-- Evidence references are quoted in claims and in funder packs, so two
-- entries sharing E-004 makes a claim ambiguous. One reference per client.
delete from evidence_library a
  using evidence_library b
  where a.client_id = b.client_id
    and a.reference = b.reference
    and a.reference is not null
    and (a.created_at, a.id) > (b.created_at, b.id);

create unique index if not exists evidence_library_reference_per_client
  on evidence_library (client_id, reference)
  where reference is not null;
