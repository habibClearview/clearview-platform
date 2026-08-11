-- ============================================================
-- rate_limit_counters: take away the public key's grants, and write the
-- intention down.
--
-- WHAT WAS WRONG. Of the 71 tables the public key is granted anything on, this
-- was the only one with no policy at all. It also carried the widest grants in
-- the platform: select, insert, update, delete and truncate.
--
-- Nothing was exposed. Row level security was on, and with no policy that
-- denies everything, which a live query confirmed by returning empty. But the
-- whole protection rested on one switch, with the grants wide open underneath
-- it. Anyone turning row level security off on this table for a moment, for
-- any reason, would have handed the public key the ability to empty it.
--
-- A rate limit counter is not secret, but it is the thing that stops one
-- device flooding a room. Emptying it removes the limit.
--
-- WHAT THIS DOES. Takes the grants away, so the public key is refused before
-- any policy is consulted, and adds a policy that says no in writing rather
-- than by silence. The service key used by the server routes is unaffected: it
-- bypasses row level security by design, which is why the limiter keeps
-- working.
-- ============================================================

revoke all on table rate_limit_counters from anon;

-- Written down rather than implied. "No policy" and "a policy that permits
-- nothing" behave the same today; only one of them survives somebody reading
-- the table later and assuming an absent policy was an oversight.
drop policy if exists rate_limit_counters_deny_all on rate_limit_counters;
create policy rate_limit_counters_deny_all on rate_limit_counters
  for all
  to public
  using (false)
  with check (false);

comment on table rate_limit_counters is
  'Rate limit state. Written only by server routes holding the service key. No client role has any grant or any permitting policy.';
