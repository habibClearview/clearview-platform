-- ============================================================
-- Clearview Field: the missing aggregate_field_transactions function
-- Run this in the Supabase SQL Editor (Project sxsenbvaitpnumdwvxaj)
--
-- app/api/field/sync/route.ts has called this function since the day
-- Clearview Field's sync route was written -- but it was never actually
-- created in the database. Every successful sync (once the payment_method
-- bug above is also fixed) was inserting rows into field_transactions
-- correctly, then silently failing to roll them into generic_actuals,
-- which is the table the dashboard's Actuals view actually reads. This
-- is the root cause of field entries never appearing anywhere in Clearview.
--
-- What it does: for the given client, sums field_transactions by
-- (business_unit_id, month, plan_line_id) and merges those sums into
-- generic_actuals.line_values -- merges, not overwrites, so a manually
-- entered actual for one line isn't wiped out by aggregating a different
-- line's field data into the same month.
-- ============================================================

create or replace function aggregate_field_transactions(p_client_id text)
returns void
language plpgsql
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
    insert into generic_actuals (client_id, unit_id, period, line_values, entered_by, entered_at, updated_at)
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
      -- Merge just this plan_line_id's key into the existing line_values --
      -- preserves any other lines' actuals (manually entered or from a
      -- different aggregation pass) already stored for this unit/month.
      line_values = coalesce(generic_actuals.line_values, '{}'::jsonb)
        || jsonb_build_object(r.plan_line_id, r.total_amount),
      updated_at = now();
  end loop;
end;
$$;
