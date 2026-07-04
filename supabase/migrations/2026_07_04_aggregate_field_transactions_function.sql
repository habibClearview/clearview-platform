-- ============================================================
-- Clearview Field: the missing aggregate_field_transactions function
-- Run this in the Supabase SQL Editor (Project sxsenbvaitpnumdwvxaj)
--
-- UPDATED per docs/ACCOUNTING_ARCHITECTURE.md section 4: this function
-- now writes exclusively to field_line_values, never to line_values.
-- line_values is reserved for direct accountant entry (e.g. a paper-only
-- store) -- the two are summed together only when displayed, so neither
-- writer can ever silently overwrite the other's figures.
--
-- app/api/field/sync/route.ts has called this function since the day
-- Clearview Field's sync route was written -- but it was never actually
-- created in the database until this session. Every successful sync
-- (once the payment_method bug was also fixed) was inserting rows into
-- field_transactions correctly, then silently failing to roll them into
-- generic_actuals, which is what the dashboard's Actuals view reads.
--
-- What it does: for the given client, sums field_transactions by
-- (business_unit_id, month, plan_line_id) and merges those sums into
-- generic_actuals.field_line_values -- merges, not overwrites, so a
-- different line's field data aggregating into the same month doesn't
-- wipe out this line's figure, and manual entries in line_values are
-- never touched at all.
-- ============================================================

create or replace function aggregate_field_transactions(p_client_id text)
returns void
language plpgsql
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select
      business_unit_id,
      date_trunc('month', transaction_date)::date as period,
      plan_line_id,
      sum(amount) as total_amount
    from field_transactions
    where client_id = p_client_id
      and plan_line_id is not null
    group by business_unit_id, date_trunc('month', transaction_date)::date, plan_line_id
  loop
    insert into generic_actuals (client_id, unit_id, period, field_line_values, entered_by, entered_at, updated_at)
    values (
      p_client_id,
      r.business_unit_id,
      r.period,
      jsonb_build_object(r.plan_line_id, r.total_amount),
      'Clearview Field (aggregated)',
      now(),
      now()
    )
    on conflict (client_id, unit_id, period)
    do update set
      -- Merge just this plan_line_id's key into the existing
      -- field_line_values -- preserves any other lines' field-derived
      -- actuals already stored for this unit/month. line_values (manual
      -- entries) is never referenced here at all.
      field_line_values = coalesce(generic_actuals.field_line_values, '{}'::jsonb)
        || jsonb_build_object(r.plan_line_id, r.total_amount),
      updated_at = now();
  end loop;
end;
$$;
