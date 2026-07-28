-- Cost-of-sales line detail (1b): let ANY business break a cost line into
-- named parts (materials, packaging, labour, transport, wastage, or their
-- own names). Additive and non-destructive. The line TOTAL still lives in
-- line_values (the only thing the engine reads); this column only records
-- the parts behind that total, mirroring the catalogue_quantities pattern.
-- Shape: { [plan_line_id]: [ { "name": text, "amount": number }, ... ] }
alter table generic_actuals
  add column if not exists cogs_line_detail jsonb not null default '{}'::jsonb;
