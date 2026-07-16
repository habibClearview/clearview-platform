## What this PR does
<!-- One sentence describing the change -->


## Type of change
- [ ] Bug fix
- [ ] New feature
- [ ] Database migration
- [ ] Test / safeguard
- [ ] Configuration / infrastructure

---

## Support Playbook Entry — required for every feature PR

<!--
Clair (our support agent) is built from these answers. Fill this in from the
USER's point of view, in plain language — not the code's. If this PR adds no
user-facing behaviour at all (pure refactor, docs, or infra), write:
"N/A — no user-facing behaviour" and skip the rest.
-->

- **What can go wrong for a user?**
  <!-- The realistic failure(s) a user could actually hit with this feature. -->

- **How would a user describe it?**
  <!-- In their words, not ours — the phrase they'd type to Clair or tell support. -->

- **Is there a safe fix?**
  <!-- The safe, reversible resolution — or "None: always escalate to a person". -->

- **Which tier does it belong to?**
  - [ ] Tier 1 — clearly fixable automatically and safely
  - [ ] Tier 2 — needs a person to look, but not urgent
  - [ ] Tier 3 — needs Habib or the assigned co-implementer immediately

---

## Pre-merge checklist — must all be checked before merge

### Code quality
- [ ] All 40 automated tests pass (`npm test`)
- [ ] Vercel preview build shows **Ready** (not Error)
- [ ] CodeRabbit review completed — no CRITICAL issues outstanding
- [ ] GitHub Action AI review shows APPROVED

### If this touches the intake form
- [ ] State captured as `const currentProducts = products` at submit time
- [ ] Revenue key is `${product.id}_rev` format — verified in code
- [ ] Uses `intake?.client_id` to link to existing client — not creating new one
- [ ] Deletes existing config before reinsert — handles resubmissions cleanly
- [ ] No `||` used for numeric inputs — uses `??` for zero safety

### If this touches the financial engine
- [ ] All numeric settings use `??` not `||` (falsy-zero check)
- [ ] Balance sheet balances — `total_assets === total_equity_and_liabilities`
- [ ] `inv_cash[0]` set from `fixed_assets` capital outflow
- [ ] `opening_cash_balance` seeded into retained earnings
- [ ] Engine regression tests still pass

### If this touches an API route
- [ ] Supabase client created inside request handler (`getSupabase()`) not at module level
- [ ] Token validated before any data access
- [ ] `client_id` always comes from validated operator/user — never from request body
- [ ] Returns correct HTTP status codes (400 for bad input, 401 for auth, 500 for server error)
- [ ] Graceful handling if `ANTHROPIC_API_KEY` or other optional env vars are absent

### If this is a database migration
- [ ] Migration validation script run — no type mismatches found
- [ ] All `client_id` columns are `TEXT` (matches `engagement_clients.id`)
- [ ] All `user_id` columns are `UUID` (matches `auth.users.id`)
- [ ] `IF NOT EXISTS` used on all CREATE TABLE statements
- [ ] RLS policies added for all new tables
- [ ] Migration tested on a fresh schema before running on production

### If this touches auth or data deletion
- [ ] Auth: every route that returns data checks the user's role AND client_id scope
- [ ] Deletion: every DELETE has a WHERE clause scoped to authenticated user's client_id
- [ ] Deletion: irreversible deletes have a confirmation step

---

## Evidence of testing
<!-- Paste the test output or a screenshot showing it works -->

