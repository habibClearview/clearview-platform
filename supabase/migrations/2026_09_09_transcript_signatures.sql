-- ============================================================
-- SIGNING WHAT WAS SAID. 9 September 2026.
--
-- A transcript that nobody has confirmed is a machine's opinion of a
-- conversation. What makes it a record is the people who were in the room
-- reading it and putting their name to it, and that is the same act as signing
-- a Charter: a named person, on a dated version, by their own hand.
--
-- WHY NOT REUSE charter_signatures. It hangs off a charter and cannot hang off
-- anything else, so a transcript signature there would need a charter that does
-- not exist. The shape is copied deliberately, so both kinds of signature read
-- the same way and neither invents its own idea of what signing means.
--
-- WHAT A SIGNATURE IS BOUND TO. A version, not a transcript. A correction after
-- signing produces a new version, and the old signatures stay against the words
-- that were actually signed. That is the entire point of signing something.
--
-- SAFE TO RUN TWICE.
-- ============================================================
create table if not exists transcript_signatures (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references session_transcripts(id) on delete cascade,
  client_id text not null references engagement_clients(id) on delete cascade,
  party_id uuid references engagement_parties(id) on delete set null,

  -- The version of the words that were signed. A later correction cannot
  -- quietly acquire somebody's signature.
  version integer not null default 1,

  signer_role text,
  signer_name text not null,
  signer_email text,
  signer_user_id uuid references auth.users(id) on delete set null,

  -- typed   they typed their own name, signed in as themselves
  -- in_room the lead consultant recorded a signature given in person, and
  --         signer_user_id stays null because nobody logged in to give it
  signature_method text not null default 'typed',
  typed_name text,
  recorded_by uuid references auth.users(id) on delete set null,

  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint transcript_signatures_method_check
    check (signature_method in ('typed','in_room')),
  -- One signature per person per version. Signing twice is a mistake, not a
  -- stronger signature.
  constraint transcript_signatures_once
    unique (transcript_id, version, party_id)
);

create index if not exists transcript_signatures_transcript_idx on transcript_signatures(transcript_id);
create index if not exists transcript_signatures_client_idx on transcript_signatures(client_id);

alter table transcript_signatures enable row level security;

-- Everybody on the engagement sees who has signed, which is what Habib asked
-- for on the Charter: all signatories see the signing as it happens.
drop policy if exists client_scoped_read on transcript_signatures;
drop policy if exists coaching_team_writes on transcript_signatures;
create policy client_scoped_read on transcript_signatures for select
  using (my_role() = 'super_coach' or client_id = my_engagement_client_id() or can_view_client(client_id));
create policy coaching_team_writes on transcript_signatures for all
  using (my_role() = 'super_coach' or can_edit_client_canvas(client_id))
  with check (my_role() = 'super_coach' or can_edit_client_canvas(client_id));
