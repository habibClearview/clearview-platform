# CLAUDE.md

Guidance for Claude (and any AI agent) working in this repository. Read this
first, every session. It exists so the hard-won rules below survive
independently of any single conversation.

## What this is

**Clearview Platform** — a financial intelligence and accounting SaaS for
agribusiness clients in Uganda. Next.js 14 (App Router) + Supabase +
TypeScript. It turns field-captured transactions and planning data into a
P&L, Balance Sheet, Cash Flow, and a set of investor/lender scores
(Credit Risk, Going Concern, Investment Readiness, Liquidity Readiness).

There is a companion **offline field app** (operators capture sales/costs on
a phone, sync when online) and an **intake flow** that onboards a client's
plan.

## How we work (the loop)

- Habib writes requirements in plain English.
- Claude implements them as code, commits, and pushes to the working branch.
- Vercel auto-deploys on push/merge (Git integration). **Deploy status is
  visible via GitHub commit statuses**, not a direct Vercel dashboard.
- CodeRabbit + the GitHub Actions AI review check every PR before merge.
- Do **not** open a PR unless explicitly asked.

### Access notes (important, verify per session)
- **GitHub**: full access via MCP tools.
- **Supabase**: live access requires `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and a service-role key set as **environment
  variables on the Claude Code environment** (never committed). If they are
  absent this session, you cannot query prod or run migrations against it —
  author migration SQL under `supabase/migrations/` and let it go through the
  PR/CI path instead.
- **Vercel**: no direct dashboard/log access — read deploy state from GitHub
  statuses on `main`.

## Commands

```bash
npm ci            # install (fresh clone every session — deps are not cached)
npm run dev       # local dev server on :3000
npm run build     # production build (what Vercel runs)
npm run lint      # next lint
npm test          # vitest run — MUST be green before merge
npm run test:watch
npm run test:coverage
```

Tests: **381 passing across 12 files** as of this writing. (Note: the PR
template and `src/__tests__/README.md` still say "40" — that number is
stale, the suite has grown.)

## Architecture map

```
app/
  dashboard/            per-tenant dashboards: wonderland, conas, canvas,
                        funder, and dynamic [slug]
  field/                offline field app (operator UI)
  intake/[token]/       token-based client onboarding
  api/
    field/              sync, auth, history, customers, stock, admin/*
    investment-pitch/   investor/grant document generator (+ -conas variant)
    invite-user, update-user, list-users, send-notification

src/
  lib/                  the business logic — engines and helpers:
    generic-engine.ts     runGenericModel(config) -> drives P&L/BS/Cashflow
    conas-engine.ts       CONAS-specific model
    analytics-engine.ts   analytics
    scoring-engine.ts     Credit Risk / Going Concern / Investment Readiness
    liquidity-readiness.ts
    investment-metrics.ts NPV, IRR, customer growth
    projections.ts        forecasting
    actuals.ts            actuals merge (manual + field-derived)
    month-end-close.ts / annual-close.ts   period close workflows
    field-*.ts            field app: auth, db (dexie), cogs, stock, errors
    catalogue-validation.ts
    supabase.ts           module-level client (CLIENT-side use only)
  components/           UI, grouped by surface (dashboard, field, intake, ...)
  types/index.ts        shared types
  __tests__/            vitest suites (one per engine/area)

supabase/migrations/    dated .sql migrations (source of truth for schema)
docs/ACCOUNTING_ARCHITECTURE.md   READ THIS before touching Actuals / P&L /
                        BS / Cashflow / month-end / COGS / annual close
```

`docs/ACCOUNTING_ARCHITECTURE.md` is the agreed accounting design and its own
source of truth. **When a decision there is refined, reversed, or extended,
update that doc in the same PR as the code change.**

## Critical rules — these cause real bugs; violating them wastes time

These are enforced by CodeRabbit, the AI review action, and the PR checklist —
but follow them *before* writing code so the review has nothing to catch.

### Data types (schema-level, easy to get wrong)
- `engagement_clients.id` is **TEXT**. `user_profiles.client_id` is **UUID**.
  Any Supabase join across the two must **cast** — do not join TEXT to UUID
  raw.
- New migration columns: `client_id` columns are **TEXT**; `user_id` columns
  are **UUID** (matches `auth.users.id`).

### Numeric safety (the falsy-zero bug)
- For numeric fields use **`??`**, never **`||`**. `value || fallback` treats a
  legitimate `0` as missing and silently substitutes the fallback — this
  corrupts financial figures. Use `value ?? fallback`.

### API routes
- Create the Supabase client **inside the request handler** via a
  `getSupabase()`-style call — **not at module level**. (The module-level
  export in `src/lib/supabase.ts` is for client components only.)
- **Validate the token before any data access.** Every route that returns
  data checks the user/operator role AND `client_id` scope.
- `client_id` must come from the **validated** operator/user — **never** from
  the request body.
- Return correct status codes: 400 bad input, 401 auth, 500 server error.
- Handle optional env vars (e.g. `ANTHROPIC_API_KEY`) being absent gracefully.

### Intake form (has bitten us repeatedly)
- Capture state at submit time as a constant: `const currentProducts = products`
  — do not read React state inside async submit handlers (stale closure).
- Revenue plan-line keys use the exact format `` `${product.id}_rev` ``.
- Link to the existing client via `intake?.client_id` — **never create a new
  client record** on resubmit.
- Delete existing config before reinsert so resubmissions are clean.

### Financial engine
- All numeric settings use `??` (see above).
- Balance sheet must balance: `total_assets === total_equity_and_liabilities`.
- `inv_cash[0]` is seeded from the `fixed_assets` capital outflow.
- `opening_cash_balance` is seeded into retained earnings.
- Engine regression tests must stay green.

### Actuals data model (see architecture doc §4)
- Field-derived amounts and manually-entered amounts live in **separate**
  storage and are summed at read time. Neither writer may overwrite the
  other. `aggregate_field_transactions()` is machine-managed only.

### Deletion & auth safety
- Every `DELETE` has a `WHERE` clause scoped to the authenticated user's
  `client_id`. Irreversible deletes need a confirmation step.

### Migrations
- `IF NOT EXISTS` on all `CREATE TABLE`.
- RLS policies for every new table.
- Test on a fresh schema before running on production.
- The `validate-migration.yml` action runs `validate-migration.py` and fails
  the PR on type mismatches.

## Safeguards / CI (what blocks a merge)

- **`ai-review.yml`** — runs tests, then a Claude review of the diff; a
  `BLOCKED` verdict fails the status check.
- **`validate-migration.yml`** — validates changed SQL; type mismatches fail.
- **`session-check.yml`** — daily/manual health report (tests, deploy, open
  PRs, CodeRabbit criticals).
- **CodeRabbit** (`.coderabbit.yaml`) — assertive review focused on
  architecture, business-logic correctness, auth, SQL injection, N+1,
  falsy-zero, and the type-mismatch rules above.
- **`.github/PULL_REQUEST_TEMPLATE.md`** — the pre-merge checklist. Fill it in
  honestly; it encodes the rules above.

## Conventions

- Keep new code in the style of the surrounding file. Comment *why*, not
  *what* — existing files explain the non-obvious business reasoning inline;
  match that.
- Add/adjust a vitest suite in `src/__tests__/` for any engine or route logic
  you change.
- TypeScript throughout; path alias `@/` maps to `src/`.
