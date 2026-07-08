-- ============================================================
-- Clearview: delegated categorization for field cost entries
--
-- An operator recording a genuinely new kind of cost -- one that
-- doesn't match any existing cost line in their catalogue -- previously
-- had no way to record it at all; they'd have to either force it into
-- the wrong category or skip recording it entirely. field_uncategorized_costs
-- lets them record what actually happened (a description and an
-- amount) immediately, with the CATEGORIZATION decision delegated to
-- whoever has the authority to assign it to the correct plan line
-- later -- a coach or CEO, via a dashboard review queue.
--
-- Deliberately a separate table from field_transactions, not a nullable
-- plan_line_id there: field_transactions.plan_line_id is NOT NULL for
-- good reason (every downstream calculation assumes a valid, real plan
-- line), and relaxing that constraint would risk every piece of logic
-- that currently trusts it always being present and valid. An
-- uncategorized cost only becomes a real field_transactions row once a
-- coach actually assigns it a plan_line_id -- at that point it's
-- promoted into field_transactions and marked resolved here, not
-- duplicated.
-- ============================================================

create table if not exists field_uncategorized_costs (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  business_unit_id text not null,
  description text not null,
  amount numeric not null,
  transaction_date date not null,
  operator_id uuid references field_operators(id),
  synced_at timestamptz not null default now(),
  categorized boolean not null default false,
  categorized_plan_line_id text,
  categorized_transaction_id uuid,
  categorized_at timestamptz,
  categorized_by text
);

create index if not exists idx_field_uncategorized_costs_pending on field_uncategorized_costs(client_id, business_unit_id) where not categorized;

alter table field_uncategorized_costs enable row level security;

create policy client_scoped_uncategorized_costs on field_uncategorized_costs
  for all using (
    my_role() = 'super_coach' or client_id = my_engagement_client_id()
  );
