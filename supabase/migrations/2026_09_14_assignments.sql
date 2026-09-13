-- An assignment is the thing that was bought. 14 September 2026.
--
-- Habib: "I suspect you are confused about the client counts, and maybe we
-- need to separate paying clients from served clients. There are two
-- programmes paying at the moment. Climate Smart Jobs has employed my
-- advisory services, including the financial modelling service, for their
-- served clients Bwaeyale Vet and Viester. Tanager has employed my GtCV
-- service for their client Ikore. The Climate Smart Jobs assignment that I
-- entered as won is a new advisory that has no financial model included and
-- that is a different assignment. You have the finance for each of these but
-- it is not showing in the dashboard."
--
-- And: "the fee should be on the client, it is the client I invoiced."
--
-- The word "client" was doing two jobs, and the money was on the wrong one.
-- Three things, named apart:
--
--   PAYER                who signs and pays, and who the invoice is made out
--                        to. A programme (Climate Smart Jobs, Tanager) or an
--                        independent organisation paying for itself.
--   ASSIGNMENT           one thing bought from that payer. Carries the fee,
--                        the currency, the fee status and its dates, and the
--                        services it includes. Serves zero or more
--                        organisations. This table.
--   SERVED ORGANISATION  who the work is done with. Carries the delivery
--                        record. Holds no money.
--
-- THE FEE SITS WITH THE PAYER, RECORDED ONCE PER ASSIGNMENT. It is one fee
-- per invoice raised, which is why two assignments to the same payer carry
-- two fees. It is never on a served organisation: Bwaeyale Vet was never
-- invoiced, Climate Smart Jobs was.
--
-- WHY AN ASSIGNMENT WITH NO SERVED ORGANISATION MATTERS. The won Climate
-- Smart Jobs advisory has a fee and nobody attached to it yet. Under the old
-- shape the fee lived on a served organisation, so an assignment with nobody
-- attached had nowhere to hold its money and was invisible on every screen.
-- That is the fault this change exists to fix.
--
-- SAFE TO APPLY. Additive only. Nothing is dropped and nothing is deleted.
-- The old fee columns on engagement_clients are left exactly as they are; the
-- dashboard simply stops reading them for money once an assignment carries
-- it, so no figure is ever counted twice.

-- 1) An assignment has a name and can include more than one service --------
alter table service_engagements add column if not exists name text;
alter table service_engagements add column if not exists service_types text[] not null default '{}';
-- Dates the fee moved, so revenue can honestly be shown for a period. The
-- same two fields, with the same meaning, that engagement_clients already
-- carries.
alter table service_engagements add column if not exists fee_invoiced_at date;
alter table service_engagements add column if not exists fee_paid_at date;

comment on column service_engagements.name is
  'What this assignment is called, in the words the payer would use. Falls back to its services when empty.';
comment on column service_engagements.service_types is
  'Every service this one assignment includes. service_type is kept alongside it as the first of these, so anything still reading the single column keeps working.';

-- Every existing row includes exactly the one service it already named.
update service_engagements
   set service_types = array[service_type]
 where coalesce(array_length(service_types, 1), 0) = 0
   and service_type is not null;

-- 2) An assignment can serve more than one organisation -------------------
create table if not exists service_engagement_clients (
  engagement_id text not null references service_engagements(id) on delete cascade,
  client_id text not null references engagement_clients(id) on delete cascade,
  primary key (engagement_id, client_id)
);

comment on table service_engagement_clients is
  'Which organisations an assignment serves. Many per assignment: one Climate Smart Jobs advisory serves both Bwaeyale Vet and Viester. An assignment with no rows here serves nobody yet, which is a real state and keeps its fee.';

create index if not exists service_engagement_clients_client_idx
  on service_engagement_clients(client_id);

alter table service_engagement_clients enable row level security;
-- The same boundary service_engagements itself uses.
drop policy if exists super_coach_only on service_engagement_clients;
create policy super_coach_only on service_engagement_clients for all
  using (my_role() = 'super_coach')
  with check (my_role() = 'super_coach');

-- The one organisation each existing assignment already named.
insert into service_engagement_clients (engagement_id, client_id)
select id, beneficiary_client_id
  from service_engagements
 where beneficiary_client_id is not null
on conflict do nothing;

-- 3) Carry every fee already entered onto an assignment -------------------
--
-- Nothing is retyped and nothing is invented. One assignment per served
-- organisation that already has a fee recorded, named after that
-- organisation, carrying that organisation's exact fee, currency, status and
-- dates, and with that organisation as the one it serves. The payer is the
-- organisation's programme where it has one, and the organisation itself
-- where it is paying for its own work.
--
-- Habib then has three assignments to tidy on screen rather than three to
-- type: joining the two Climate Smart Jobs rows into the one assignment that
-- covers both organisations, and adding the won advisory.
--
-- Runs once. A second run adds nothing, because the id is derived from the
-- organisation and the primary key refuses a repeat.
insert into service_engagements (
  id, name, payer_programme_id, payer_client_id, beneficiary_client_id,
  service_type, service_types, status, fee, fee_currency, fee_status,
  fee_invoiced_at, fee_paid_at
)
select
  'asg_' || c.id,
  c.name,
  c.programme_id,
  case when c.programme_id is null then c.id else null end,
  c.id,
  coalesce(c.engagement_mode, 'advisory'),
  array[coalesce(c.engagement_mode, 'advisory')],
  case when c.status = 'complete' then 'complete' else 'active' end,
  c.engagement_fee,
  coalesce(c.fee_currency, 'USD'),
  c.fee_status,
  c.fee_invoiced_at,
  c.fee_paid_at
from engagement_clients c
where c.engagement_fee is not null
  and c.engagement_fee <> 0
on conflict (id) do nothing;

insert into service_engagement_clients (engagement_id, client_id)
select 'asg_' || c.id, c.id
  from engagement_clients c
 where c.engagement_fee is not null
   and c.engagement_fee <> 0
on conflict do nothing;
