-- ============================================================
-- Server-side rate limiting for sensitive endpoints.
--
-- Serverless functions (Vercel) don't share memory between invocations, so an
-- in-memory counter is unreliable. This is a small Postgres fixed-window
-- counter that every instance shares.
--
-- check_rate_limit(key, max, window_seconds) records one hit in the current
-- window for `key` and returns TRUE if the caller is still under `max` for that
-- window, FALSE if they've exceeded it. It's SECURITY DEFINER and granted to
-- service_role only (routes call it with the service key), so it can't be
-- invoked or read by end users.
-- ============================================================

create table if not exists public.rate_limit_counters (
  key           text        not null,
  window_start  timestamptz not null,
  count         integer     not null default 0,
  primary key (key, window_start)
);

-- Supports cleanup of old windows.
create index if not exists rate_limit_counters_window_idx
  on public.rate_limit_counters (window_start);

-- Never expose the raw counter table to clients.
revoke all on public.rate_limit_counters from anon, authenticated;

create or replace function public.check_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  -- Floor "now" to the start of the current fixed window.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_counters (key, window_start, count)
    values (p_key, v_window_start, 1)
  on conflict (key, window_start)
    do update set count = public.rate_limit_counters.count + 1
  returning count into v_count;

  -- Opportunistic cleanup: ~1% of calls sweep windows older than a day so the
  -- table can't grow without bound. Cheap and keeps the counter self-managing.
  if random() < 0.01 then
    delete from public.rate_limit_counters
      where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_max;
end;
$$;

-- Only the service role (our API routes) may run the limiter.
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
