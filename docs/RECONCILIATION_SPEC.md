# Reconciliation & Verification — Build Spec (v3.1, mapped to the live system)

Status: build spec. Supersedes the data-model assumptions in "Engineering Spec v3" by
correcting them against the schema actually running in Supabase project
`sxsenbvaitpnumdwvxaj`. Everything here is **additive** — no existing table, column,
view, RPC, or component changes behaviour. New machinery is inert until deliberately
wired in, exactly like the Track-2 migration (#89) was inert until its UI (#91) shipped.

---

## 1. What this actually does, in plain words

A customer pays a business by mobile money. A staff member logs that same sale on the
field app. Those are two independent records of one event. When they agree, the sale is
**verified** — not because anyone said so, but because two systems that don't talk to each
other landed on the same number at the same time.

That verification is the missing keystone: it turns "the business told us" into "the money
confirms it," which is the thing a bank or investor actually leans on.

Two rules sit above everything else in this build:

1. **Verification only ever adds. It never punishes.** A cash-heavy business that is honest
   and consistent must never score *lower* than it does today just because a verification
   layer now exists. Verification is an uplift for those who can get it; its absence is
   explained, not penalised. (See §7, Confidence.)
2. **Nothing is silently invented.** An unmatched inbound payment is never folded into
   revenue on its own. An unmatched field entry stays "declared." Every figure is traceable
   to one of the states in §5.

---

## 2. The real system (names to build against)

The v3 spec used placeholder names. Here is the mapping to what exists. **Build against the
right-hand column.**

| v3 spec name        | Real thing in this codebase |
|---------------------|-----------------------------|
| MSME / client       | `engagement_clients` (TEXT `id`). The app-wide key is a TEXT `client_id` equal to `engagement_clients.id`. **Not** the legacy `clients` UUID table (that's CONAS only). |
| BusinessUnit (table)| An entry in the JSON array `generic_model_config.business_units` (`{id, name, short, type, ...}`, `id` is a slug like `shop_1`, `fge`). There is **no** `business_units` table. Referenced everywhere as a TEXT `business_unit_id`. |
| Staff               | `field_operators` (`id`, `client_id`, `business_unit_id`, `display_name`, `active`, ...). Bound to exactly **one** client and **one** business unit. |
| Staff's link        | An opaque token row in `field_operator_tokens` (`token` = random hex → `operator_id`). The link does **not** encode ids; the server resolves them. |
| Transaction         | `field_transactions` (`id`, `client_id`, `business_unit_id`, `operator_id`, `plan_line_id` **NOT NULL**, `amount`, `payment_method`, `transaction_date` **(DATE, day-only)**, `synced_at`, `customer_id`, `local_id`, ...). |
| payment_mode="mobile money" | `field_transactions.payment_method = 'mobile_money'` (enum: `cash | credit | mobile_money | bank`). |

Consequences that shape the design:

- **`field_transactions.transaction_date` is a DATE.** There is no time-of-sale stored, and
  `synced_at` is useless for matching (operators default to `sync_frequency = 'end_of_day'`,
  so it clusters at day-end). The field queue **already** stamps `queued_at` (ms epoch) when
  an entry is made — we plumb that through to a new `captured_at timestamptz`. (See §6.)
- **`field_transactions.plan_line_id` is NOT NULL.** A raw inbound mobile-money payment has
  no plan line and no business unit yet, so it **cannot** live in `field_transactions`. It
  needs its own table (`provider_transactions`). (See §3.)
- Webapp monthly totals are **not** individual rows; they are monthly JSON aggregates in
  `generic_actuals.line_values`. They have no transaction grain, so they are simply out of
  scope for per-transaction reconciliation (state `not_applicable`, conceptually).

---

## 3. Schema additions (migration `2026_07_12_reconciliation_engine.sql`)

All additive, all `IF NOT EXISTS`.

**New table `provider_transactions`** — the normalized, provider-agnostic record of money
that actually moved. This is the home for "unattributed inbound."

- `id uuid pk`, `client_id text` (the wallet owner = the MSME), `provider_id text`
  (e.g. `mtn_ug_momo`), `country text`, `external_ref text` (provider's own id; idempotency),
  `amount numeric`, `currency text`, `occurred_at timestamptz` (when the payment happened),
  `direction text default 'inbound'`, `raw_payload jsonb`,
  `reconciliation_state text default 'unattributed_inbound'`
  (`matched | unattributed_inbound | ignored`),
  `matched_transaction_id uuid` (the `field_transactions.id` it paired with),
  `business_unit_id text` (filled from the match, else null),
  `created_at`, `updated_at`.
- `unique (provider_id, external_ref)` so a webhook replay can't double-insert.

**New table `provider_links`** — one row per (client, provider): the wallet link + readiness
state driving the onboarding messaging.

- `id`, `client_id text`, `provider_id text`, `country text`,
  `status text default 'not_started'` (`not_started | wallet_activated | link_pending | tier1_active`),
  `linked_at`, `revoked_at`, `config jsonb`, `created_at`, `updated_at`.
- `unique (client_id, provider_id)`.

**Additive columns on `field_transactions`** (nullable / safe defaults, back-compatible):

- `captured_at timestamptz` — real moment of sale (from the field queue's `queued_at`).
- `reconciliation_state text default 'declared_only'` (`matched | declared_only | not_applicable`).
- `matched_provider_txn_id uuid` — the `provider_transactions.id` it paired with.

RLS mirrors the existing field tables (client-scoped for authenticated reads; the
service-role key used by the reconciliation job and sync route bypasses RLS as it does today).

---

## 4. Matching logic (`src/lib/reconciliation-engine.ts`, pure)

For a given client and time window, pair unmatched `mobile_money` field entries against
unmatched inbound `provider_transactions`:

- **Candidate filter:** field entry has `payment_method = 'mobile_money'`, is not already
  matched, and has a `captured_at`. Provider txn is inbound and not already matched.
- **Amount:** exact match by default. We **do not fuzzy-match into a match** (per v3). A
  configurable `amountTolerance` (default `0`) instead surfaces near-misses (e.g. a payment
  net of a provider fee) as **review candidates**, never as silent matches.
- **Time window:** `|captured_at − occurred_at| ≤ windowMinutes` (default `15`, configurable).
- **Many candidates (the two-units-same-amount case):** deterministic bipartite pairing by
  smallest time gap first (greedy on the global list of feasible pairs, each side used once).
- **Count mismatch** (e.g. 3 field entries, 1 payment): pair what pairs; leave the rest
  `declared_only`, and flag the imbalance as a review signal — it is a useful signal, not a
  failure.

Output is a pure result object: `matches[]`, `declaredOnly[]`, `unattributedInbound[]`,
`reviewCandidates[]`. The engine touches no database — a thin runner (later) reads rows,
calls the engine, and writes states back. This is what lets us test on **simulated** provider
data before any live API exists (v3 build order, step 1).

---

## 5. The three states (+ review)

| State | Meaning | Counts as verified revenue? |
|-------|---------|------------------------------|
| `matched` | Field entry ↔ confirmed payment, auto-reconciled | **Yes** |
| `declared_only` | Field entry, no matching payment (cash, or wallet not linked) | No — stays self-reported, **not penalised** (see §7) |
| `unattributed_inbound` | Payment with no field entry | Not counted as revenue until resolved; sits in the review queue |

Review candidates (amount near-miss, or count imbalance) are surfaced to a human — in a
coach-led engagement, the coach — as a small queue, not auto-resolved.

---

## 6. Time-of-sale (`captured_at`) — the unblocker

The field offline queue already records `queued_at: Date.now()` per entry (`src/lib/field-db.ts`).
We: (a) send `queued_at` in the sync payload, (b) write it to `field_transactions.captured_at`
in `/api/field/sync`, defaulting to `synced_at` only when absent (old clients). Zero new work
for staff; entries made offline keep their true local time. This is additive and cannot break
existing sync (the column is nullable; older payloads simply omit it).

---

## 7. Confidence & not-punishing-cash (`src/lib/confidence.ts`, pure)

This is the rule-2 machinery. For each (client, period) we derive a **confidence label** and
score from what's actually known:

- `verified` — a meaningful share of value is `matched`.
- `triangulated` — not payment-verified, but corroborated (COGS/stock drawdown consistent,
  records complete, internally consistent month-on-month).
- `self_reported_plausible` — declared, internally consistent, no red flags. **This is the
  floor for an honest cash business, and it must map to today's score, not below it.**
- `flagged` — inconsistencies (e.g. unattributed inbound exceeding declared, large gaps).

Design guarantee (enforced by test): with **no** reconciliation data, confidence and the
scores it feeds are identical to today's behaviour. Verification can only lift a business
above the self-reported baseline; it can never push a cash business below it.

---

## 8. Badges / rewards (`src/lib/confidence.ts` → presentational)

Derived, never manually awarded, so they can't be gamed:

- **Payments Verified** — has `matched` transactions this period.
- **Consistently Reported** — N consecutive months of internally-consistent actuals.
- **Records Complete** — every elapsed month has actuals.
- **Books Closed** — months formally closed on time.

Badges are shown to the business (a visible reward for connecting a wallet / keeping good
records) and summarised on the coach's client view. A cash-only business can still earn
Consistently Reported / Records Complete / Books Closed — verification is one badge among
several, not the only path to recognition.

---

## 9. Provider adapters (`src/lib/providers/`)

One normalized interface; the engine never learns which provider a payment came from.

- `types.ts` — `PaymentProviderAdapter` (`initiate_link`, `check_link_status`,
  `handle_webhook → NormalizedProviderTxn`, `revoke_link`). **`handle_webhook` returns the
  client/MSME id, not a business_unit** — unit attribution comes from the field-side match.
- `simulated.ts` — deterministic fake provider for tests + pre-Uganda dry runs.
- `mtn-ug.ts` — MTN Uganda MoMo stub against the same interface; connect when credentials land.
- `registry.ts` — id → adapter.

Priority order (unchanged from v3): MTN UG → Airtel UG → M-PESA (Kenya) → Nigeria (Moniepoint/
OPay/PalmPay or Mono aggregation).

---

## 10. Onboarding readiness (`provider_links.status`)

`not_started → wallet_activated → link_pending → tier1_active`, one row per (client, provider),
driving the exact messaging in v3 §5. The Uganda script holds regardless of API timing:
the field app works today; verification "switches on shortly."

---

## 11. Build order (safe, incremental)

1. Spec (this doc) + additive migration — inert.
2. Pure engine + confidence + adapters + tests — inert libraries, nothing calls them.
3. `captured_at` plumbing through sync — additive, back-compatible.
4. Reconciliation runner (reads rows, runs engine, writes states) — new, opt-in per client.
5. Scoring uplift wiring — regression-safe: no reconciliation data ⇒ identical output.
6. Badges + review queue UI on dashboards.
7. Live MTN adapter once credentials exist; then Airtel/Kenya/Nigeria.

Steps 1–3 and 5 (the engine, confidence, capture, and a no-op-safe scoring hook) are the
foundation delivered first. Live provider wiring (4, 7) waits for credentials but is not on
the critical path — the engine is complete and tested against simulated data before then.
