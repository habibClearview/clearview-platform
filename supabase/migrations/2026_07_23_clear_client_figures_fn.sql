-- ============================================================
-- clear_client_figures(): atomic in-app figure reset
--
-- Backs the /api/clear-figures route. A plpgsql function runs in a SINGLE
-- transaction, so either everything for the chosen scope is cleared or nothing
-- is — no half-cleared model (the failure the sequential route calls risked).
--
--   scope 'actuals' — delete every recorded monthly actual, keep the model.
--   scope 'model'   — also clear plan lines / business units / shared lines and
--                     the marketing events that reference them, back to an empty
--                     model (org, currency and settings kept).
--
-- Field-app sales, stock and catalogue are never touched.
--
-- SECURITY: security definer + execute revoked from public/anon/authenticated
-- and granted only to service_role — so it can only be invoked by the
-- server-side admin route, which itself authenticates the caller (super_coach,
-- or the client's own CEO / Finance Manager) before calling it.
--
-- SAFE TO APPLY: creates one function. Paste into the Supabase SQL editor and Run.
-- ============================================================

-- NOTE ON TYPES: p_client_id is TEXT, not uuid. Client ids in this platform
-- are the engagement_clients.id TEXT values (e.g. 'client_1784...'), and
-- generic_actuals / generic_model_config / generic_market_events all store
-- client_id as TEXT — the repo's migration validator even requires client_id to
-- be TEXT. So `where client_id = p_client_id` is a text = text comparison; there
-- is no uuid/text mismatch.
create or replace function public.clear_client_figures(p_client_id text, p_scope text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_scope not in ('actuals', 'model') then
    raise exception 'invalid scope %', p_scope;
  end if;

  delete from generic_actuals where client_id = p_client_id;

  if p_scope = 'model' then
    delete from generic_market_events where client_id = p_client_id;
    update generic_model_config
      set plan_lines = '[]'::jsonb, business_units = '[]'::jsonb, shared_lines = '[]'::jsonb
      where client_id = p_client_id;
  end if;
end;
$$;

revoke all on function public.clear_client_figures(text, text) from public, anon, authenticated;
grant execute on function public.clear_client_figures(text, text) to service_role;
