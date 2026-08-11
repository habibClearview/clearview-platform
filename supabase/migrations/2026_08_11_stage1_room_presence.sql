-- ============================================================
-- WHO IS STILL IN THE ROOM.
--
-- WHY THIS IS SEPARATE FROM THE ANSWER COUNTER, and must stay separate.
--
-- "14 of 20" on the projector means fourteen people have answered. If devices
-- dropping off the network quietly changed that number, the facilitator would
-- read a network problem as a room that had finished answering, and move on
-- with six people's answers missing. So the two numbers are kept apart: one
-- says how many answers arrived, the other says how many phones are still
-- listening, and neither is ever folded into the other.
--
-- WHAT IS STORED. The browser's own participant identifier and when it last
-- asked what was open. No name, no address, nothing about the person. A row
-- here says a device was listening a moment ago and nothing more.
--
-- WHY A TABLE AND NOT A COUNT OF CONNECTIONS. Nothing in this platform holds a
-- connection open. Each phone asks the server what is open every second and a
-- half, and the time of its last question is the only honest evidence that it
-- is still there.
-- ============================================================

create table if not exists gtcv_room_presence (
  client_id text not null references engagement_clients(id) on delete cascade,
  -- The browser, not the person. Minted on first join and kept in that browser.
  participant_id text not null,
  last_seen_at timestamptz not null default now(),
  primary key (client_id, participant_id)
);

create index if not exists gtcv_room_presence_seen_idx
  on gtcv_room_presence (client_id, last_seen_at);

alter table gtcv_room_presence enable row level security;

-- The same policies as the rest of the room's tables. The public key reaches
-- none of it: everything a phone sees comes through a server route holding the
-- elevated key.
drop policy if exists gtcv_room_presence_view on gtcv_room_presence;
create policy gtcv_room_presence_view on gtcv_room_presence
  for select using (can_view_client(client_id));

drop policy if exists gtcv_room_presence_manage on gtcv_room_presence;
create policy gtcv_room_presence_manage on gtcv_room_presence
  for all using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));

comment on table gtcv_room_presence is
  'When each participant device last asked what was open. Shown to the facilitator separately from the answer counter, and never folded into it.';
