-- ============================================================
-- Invoice packs.
--
-- A milestone payment is claimed against a deliverable, and the deliverable is
-- evidenced by the decision gates it maps to. The pack is what turns that into
-- something a funder can check: the deliverable, the gates that evidence it,
-- the evidence entries themselves, the signatures that closed those gates, and
-- a covering note.
--
-- WHY THE PACK IS STORED RATHER THAN GENERATED ON DEMAND. What was claimed has
-- to stay what was claimed. If the pack were rebuilt each time it was opened,
-- an evidence entry edited a month later would silently change the claim that
-- was already submitted. So the pack holds a snapshot of the evidence as it
-- stood when it was assembled, and re-assembling produces a new pack rather
-- than rewriting the old one.
--
-- The approval step is deliberate. The covering note may be drafted with
-- assistance, but nothing is sent until a person with manage rights reads the
-- pack and approves it. approved_by records who did.
--
-- This is the commercial layer and it is between the consultant and whoever
-- pays. It is not part of what the organisation being coached sees.
-- ============================================================

create table if not exists engagement_invoice_packs (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  deliverable_id uuid not null references public.engagement_deliverables(id) on delete cascade,

  -- What is being claimed.
  reference text,
  amount numeric,
  currency text not null default 'USD',
  period_label text,

  -- The pack itself. gates lists the decision gates the deliverable maps to;
  -- evidence is the snapshot of what supported them at assembly time.
  gates jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  signatures jsonb not null default '[]'::jsonb,
  covering_note text,

  -- Where it stands. 'draft' is assembled and not yet read, 'approved' has
  -- been read and cleared for sending, 'sent' has gone, 'paid' is settled.
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'sent', 'paid', 'withdrawn')),
  assembled_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  sent_at timestamptz,
  sent_to text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invoice_packs_client on public.engagement_invoice_packs (client_id);
create index if not exists idx_invoice_packs_deliverable on public.engagement_invoice_packs (deliverable_id);

alter table engagement_invoice_packs enable row level security;

-- Read is manage rights, not view rights. The fee is between the consultant
-- and whoever pays, and the organisation being coached has no part in it.
drop policy if exists "invoice packs readable by managers" on public.engagement_invoice_packs;
create policy "invoice packs readable by managers"
  on public.engagement_invoice_packs for select
  to authenticated
  using (public.can_manage_client_access(client_id));

drop policy if exists "invoice packs writable by managers" on public.engagement_invoice_packs;
create policy "invoice packs writable by managers"
  on public.engagement_invoice_packs for all
  to authenticated
  using (public.can_manage_client_access(client_id))
  with check (public.can_manage_client_access(client_id));

grant select, insert, update, delete on public.engagement_invoice_packs to authenticated;

-- The deliverables and their gate mapping are the same commercial layer, so
-- they are readable by the same people. Written as additive policies that
-- replace themselves by name, so applying this twice changes nothing.
alter table engagement_deliverables enable row level security;
alter table deliverable_gate_map enable row level security;

grant select, insert, update, delete on public.engagement_deliverables to authenticated;
grant select, insert, update, delete on public.deliverable_gate_map to authenticated;
