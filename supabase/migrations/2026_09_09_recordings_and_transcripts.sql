-- ============================================================
-- RECORDING WHAT WAS ACTUALLY SAID. 9 September 2026.
--
-- The method rests on verbatim: the exact words a customer used, the exact
-- answers an Executive Director gave to the three pre-engagement questions.
-- Until now "verbatim" meant somebody typing fast enough, which is not a
-- record, it is a reconstruction. Habib: the verbatim answers cannot be
-- captured as the answers come through.
--
-- ONE MODEL FOR EVERY KIND OF RECORDING, because they are the same thing:
-- a planned session held remotely, a room full of people, or a field
-- interviewer alone with one customer. Each is a recording attached to the
-- engagement, made up of one track per device, transcribed once, read and
-- signed by the people who were there.
--
--   session_recordings   the recording itself. What it belongs to, when it
--                        started, who started it, what state it is in.
--   recording_tracks     one row per device. Each device records only its own
--                        microphone, so a track is one voice, which is why the
--                        transcript can say who spoke without guessing, and
--                        why a dropped line costs one track rather than the
--                        session.
--   recording_consent    who agreed to be recorded, how, and when. Written
--                        consent for a party who signs, spoken consent
--                        captured in the first seconds of the audio for a
--                        customer who will never sign anything.
--   session_transcripts  what came back, as a draft to be corrected, then
--                        signed. Signatures reuse charter_signatures rather
--                        than inventing a second way to sign.
--
-- WHY A TRACK CARRIES ITS OWN CLOCK. Devices start a second or two apart and
-- their clocks drift. Each track records the moment it started against the
-- server's own stamp for the recording, so the tracks are laid on one timeline
-- by time rather than by when a button was pressed. That is what makes three
-- people in three countries play back as one room.
--
-- SAFE TO RUN TWICE.
-- ============================================================

create table if not exists session_recordings (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,

  -- What this recording is of. Exactly one of these is set, and the check
  -- below enforces it, so a recording can never be attached to two things or
  -- to nothing.
  session_id uuid references gtcv_sessions(id) on delete set null,
  interview_id uuid,
  dp_id text,

  -- The server's own stamp. Every track's offset is measured against this.
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  started_by uuid,

  -- opening   the room is live and devices should be recording
  -- recorded  it has stopped and the tracks are in
  -- merged    the tracks have been laid on one timeline
  -- transcribed / failed
  status text not null default 'opening',
  failure_reason text,

  -- The merged file, once there is one, and the transcript that came from it.
  merged_path text,
  merged_seconds integer,

  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint session_recordings_status_check
    check (status in ('opening','recorded','merged','transcribed','failed')),
  constraint session_recordings_belongs_to_one_thing
    check (num_nonnulls(session_id, interview_id) <= 1)
);

create index if not exists session_recordings_client_idx on session_recordings(client_id);
create index if not exists session_recordings_session_idx on session_recordings(session_id);

create table if not exists recording_tracks (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references session_recordings(id) on delete cascade,

  -- Who this voice is. A party when they are on the engagement, and a typed
  -- name when they are a customer in a field interview who has no login.
  party_id uuid references engagement_parties(id) on delete set null,
  speaker_name text,

  -- The device, so two people on one engagement using two phones do not
  -- collide, and so a rejoin after a dropped line continues the same track.
  device_id text not null,

  -- Milliseconds after the recording's own started_at that this track began.
  -- The whole alignment rests on this one number.
  offset_ms integer not null default 0,
  duration_seconds integer,
  storage_path text,

  -- recording | uploaded | failed. A device that cannot record says so here,
  -- which is what puts a red mark against a name while the session is running
  -- rather than after it.
  status text not null default 'recording',
  failure_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recording_tracks_status_check
    check (status in ('recording','uploaded','failed')),
  constraint recording_tracks_one_per_device
    unique (recording_id, device_id)
);

create index if not exists recording_tracks_recording_idx on recording_tracks(recording_id);

create table if not exists recording_consent (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references session_recordings(id) on delete cascade,
  party_id uuid references engagement_parties(id) on delete set null,
  person_name text,

  -- written  they agreed in the Charter or another signed document
  -- spoken   the consent sentence was read and their answer is in the audio
  -- refused  they said no, and this is a record of that rather than a gap
  method text not null,
  -- Where in the audio the spoken consent sits, so it can never be separated
  -- from the recording it belongs to.
  spoken_at_offset_ms integer,
  agreed boolean not null default true,
  recorded_at timestamptz not null default now(),
  recorded_by uuid,

  constraint recording_consent_method_check
    check (method in ('written','spoken','refused'))
);

create index if not exists recording_consent_recording_idx on recording_consent(recording_id);

create table if not exists session_transcripts (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references session_recordings(id) on delete cascade,
  client_id text not null references engagement_clients(id) on delete cascade,

  -- The words. text is what a person reads and corrects; segments keeps the
  -- timings and the speaker for each passage, so a correction never loses
  -- where in the audio it came from.
  body text,
  segments jsonb,

  -- Which model produced it, so a transcript can always say what made it.
  produced_by text,
  language text,

  -- draft      as it came back, correctable
  -- issued     locked for signature, the way a Charter version is
  -- signed     everyone who had to sign has
  status text not null default 'draft',
  version integer not null default 1,

  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint session_transcripts_status_check
    check (status in ('draft','issued','signed'))
);

create index if not exists session_transcripts_recording_idx on session_transcripts(recording_id);
create index if not exists session_transcripts_client_idx on session_transcripts(client_id);

-- CONSENT IS A PROPERTY OF A PERSON, TAKEN ONCE. A party who agreed in the
-- Charter does not agree again every session. Null means never asked, which is
-- different from refused and has to stay different.
alter table engagement_parties
  add column if not exists recording_consent text,
  add column if not exists recording_consent_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'engagement_parties_recording_consent_check') then
    alter table engagement_parties
      add constraint engagement_parties_recording_consent_check
      check (recording_consent is null or recording_consent in ('written','spoken','refused'));
  end if;
end $$;
-- ============================================================
-- WHO MAY HEAR A RECORDING. 9 September 2026.
--
-- A recording is somebody's voice. It is the most sensitive thing this
-- platform will ever hold, so it is scoped the same way everything else is and
-- with the same shape as the fix of 8 September: the client reads its own
-- engagement and writes none of the record, the coaching team writes.
--
-- The four tables all reach the engagement through client_id, directly or
-- through the recording, so the policies are the same three lines each.
--
-- SAFE TO RUN TWICE.
-- ============================================================
alter table session_recordings enable row level security;
alter table recording_tracks enable row level security;
alter table recording_consent enable row level security;
alter table session_transcripts enable row level security;

drop policy if exists client_scoped_read on session_recordings;
drop policy if exists coaching_team_writes on session_recordings;
create policy client_scoped_read on session_recordings for select
  using (my_role() = 'super_coach' or client_id = my_engagement_client_id() or can_view_client(client_id));
create policy coaching_team_writes on session_recordings for all
  using (my_role() = 'super_coach' or can_edit_client_canvas(client_id))
  with check (my_role() = 'super_coach' or can_edit_client_canvas(client_id));

drop policy if exists client_scoped_read on session_transcripts;
drop policy if exists coaching_team_writes on session_transcripts;
create policy client_scoped_read on session_transcripts for select
  using (my_role() = 'super_coach' or client_id = my_engagement_client_id() or can_view_client(client_id));
create policy coaching_team_writes on session_transcripts for all
  using (my_role() = 'super_coach' or can_edit_client_canvas(client_id))
  with check (my_role() = 'super_coach' or can_edit_client_canvas(client_id));

-- Tracks and consent hang off a recording, so they inherit its engagement.
drop policy if exists client_scoped_read on recording_tracks;
drop policy if exists coaching_team_writes on recording_tracks;
create policy client_scoped_read on recording_tracks for select
  using (exists (select 1 from session_recordings r where r.id = recording_id
    and (my_role() = 'super_coach' or r.client_id = my_engagement_client_id() or can_view_client(r.client_id))));
create policy coaching_team_writes on recording_tracks for all
  using (exists (select 1 from session_recordings r where r.id = recording_id
    and (my_role() = 'super_coach' or can_edit_client_canvas(r.client_id))))
  with check (exists (select 1 from session_recordings r where r.id = recording_id
    and (my_role() = 'super_coach' or can_edit_client_canvas(r.client_id))));

drop policy if exists client_scoped_read on recording_consent;
drop policy if exists coaching_team_writes on recording_consent;
create policy client_scoped_read on recording_consent for select
  using (exists (select 1 from session_recordings r where r.id = recording_id
    and (my_role() = 'super_coach' or r.client_id = my_engagement_client_id() or can_view_client(r.client_id))));
create policy coaching_team_writes on recording_consent for all
  using (exists (select 1 from session_recordings r where r.id = recording_id
    and (my_role() = 'super_coach' or can_edit_client_canvas(r.client_id))))
  with check (exists (select 1 from session_recordings r where r.id = recording_id
    and (my_role() = 'super_coach' or can_edit_client_canvas(r.client_id))));
