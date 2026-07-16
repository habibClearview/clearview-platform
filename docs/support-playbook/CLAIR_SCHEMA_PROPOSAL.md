# Clair support system — database schema PROPOSAL

> **Status: PROPOSAL ONLY. Nothing here has been applied to the database.**
> This document exists so Habib can read, understand, and approve the design
> before any migration is run. The actual migration file will be created and
> applied only after explicit approval (Clair Step 2, second half).

Clair is the support agent for Clearview. It needs four tables. Below, each one
is explained in plain English (what it stores, why it's needed), followed by the
draft SQL. The draft SQL follows this repo's existing rules: `client_id` columns
are `TEXT` (to match `engagement_clients.id`), `user_id` columns are `UUID` (to
match `auth.users.id`), every table uses `CREATE TABLE IF NOT EXISTS`, and every
table gets row-level-security (RLS) so people only ever see what they're allowed
to.

---

## 1. `support_playbook_entries` — Clair's knowledge

**In plain English:** a searchable copy of everything Clair knows how to help
with. The real content lives in human-readable files (`docs/support-playbook/*.md`);
this table is the machine-readable copy Clair searches at answer time. One row =
one kind of problem Clair can recognise.

**Fields:** `feature_area` (e.g. "login"), `symptom_tags` (words a user might
use), `tier` (1/2/3), `applies_to_roles` (which of the four roles this applies
to), `user_facing_description`, `diagnostic_questions`, `safe_fix` (empty means
"no safe fix — always escalate"), `escalation_criteria`, `source_file` (which
`.md` it came from), `updated_at`.

## 2. `support_conversations` — every chat with Clair

**In plain English:** a record of each conversation, so we can see what people
asked and how it was resolved. Used for the escalation queue and our own
reporting.

**Fields:** `user_id` (who's talking, UUID), `acting_role`, `client_id` (which
client it concerns, if any — TEXT, nullable), `channel` (internal / client /
field), `messages` (the back-and-forth, JSON), `resolved_tier`, `created_at`.

## 3. `support_escalations` — anything Clair couldn't resolve

**In plain English:** when Clair can't safely fix something, it opens an
"escalation" — a to-do for a human. This is that list.

**Fields:** `conversation_id`, `client_id` (TEXT), `summary`, `status`
(open / in_progress / resolved), `assigned_to_user_id` (who should handle it —
UUID), `created_at`, `resolved_at`.

## 4. `support_action_log` — a record of anything Clair *does*

**In plain English:** created now so the schema is stable, but not used until
Step 7 (when Clair is allowed to take a couple of safe actions like resending a
verification email). Every action Clair ever takes gets logged here, before and
after, so there's always a trail.

**Fields:** `action_type`, `target_user_id` (UUID), `triggered_by` (`clair` or a
human user id), `conversation_id`, `result`, `created_at`.

---

## Draft SQL (NOT YET APPLIED — for review)

```sql
-- Clair support system. Additive only. NOT YET APPLIED.
create table if not exists support_playbook_entries (
  id uuid primary key default gen_random_uuid(),
  feature_area text not null,
  symptom_tags text[] not null default '{}',
  tier smallint not null check (tier in (1,2,3)),
  applies_to_roles text[] not null default '{}',   -- super_coach | co_implementer | financial_model_client | market_intelligence_subscriber
  user_facing_description text not null,
  diagnostic_questions text[] not null default '{}',
  safe_fix text,                                    -- null = no safe fix, always escalate
  escalation_criteria text,
  source_file text not null,
  updated_at timestamptz not null default now()
);

create table if not exists support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  acting_role text not null,
  client_id text references engagement_clients(id),   -- nullable
  channel text not null check (channel in ('internal','client','field')),
  messages jsonb not null default '[]'::jsonb,
  resolved_tier smallint check (resolved_tier in (1,2,3)),
  created_at timestamptz not null default now()
);

create table if not exists support_escalations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references support_conversations(id),
  client_id text references engagement_clients(id),
  summary text not null,
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  assigned_to_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists support_action_log (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  target_user_id uuid references auth.users(id),
  triggered_by text not null,          -- 'clair' or a human user id
  conversation_id uuid references support_conversations(id),
  result text,
  created_at timestamptz not null default now()
);

alter table support_playbook_entries enable row level security;
alter table support_conversations   enable row level security;
alter table support_escalations      enable row level security;
alter table support_action_log       enable row level security;

-- Playbook is readable by any authenticated internal user; only the backend
-- (service role) writes it from the markdown files.
create policy playbook_read on support_playbook_entries for select
  using (my_role() in ('super_coach','co_implementer'));

-- Conversations / escalations: super_coach sees all; co_implementer sees only
-- their assigned clients (reusing the SAME assignment check the coach dashboard
-- already uses — exact function to be confirmed when we wire Step 5, not invented).
create policy conversations_read on support_conversations for select
  using (my_role() = 'super_coach' or (client_id is not null and can_view_client(client_id)));
create policy escalations_read on support_escalations for select
  using (my_role() = 'super_coach' or (client_id is not null and can_view_client(client_id)));

-- Writes to conversations/escalations/action_log come from the token-authenticated
-- backend (service role), which bypasses RLS — same pattern as the existing
-- field-sync and access-grant routes. No client-side writes.
```

---

## Retention (needs your confirmation)

**The rule:** conversations older than **12 months** get *anonymised* — we strip
any free text that could contain client financial specifics, and keep only the
tier/resolution metadata for our own reporting.

**Two ways to do it:**
- **Scheduled job (recommended):** a small task runs (e.g. weekly) and anonymises
  anything past 12 months. Clean, predictable, nothing to remember.
- **Check-on-read:** anonymise a row the next time it's opened. Simpler to build,
  but old rows that are never re-opened would sit un-anonymised indefinitely —
  weaker for a retention promise.

**My recommendation:** the scheduled job, run as a Vercel Cron hitting a small
protected endpoint. **Please confirm 12 months is right** — and check your
Palladium CSJ / Ignite agreements, since a programme clause would override this.
I have NOT built either approach; this is for your decision.

---

## Vercel preview deployments (Step 2 also asks me to check this)

**What it is:** a "preview" is a private, live copy of the app built from a PR's
code, so you can click a link and *try the change* before it's merged to the real
site.

**What I can and can't see:** I can't read your Vercel project settings from the
code. But Vercel turns previews **on by default** for a connected GitHub repo, and
this repo is clearly deployed on Vercel, so previews are almost certainly already
on.

**How to confirm (2 minutes, when you land):** open PR #176. If previews are on,
you'll see either a **Vercel bot comment** with a "Visit Preview" link, or a
"Preview" deployment check near the merge button. Click it — that's the live copy
of that PR. If you see no such link on any PR, tell me and I'll explain how to
switch previews on before we go further. **I did not silently assume this — please
verify on PR #176.**

---

## What happens next (only after you approve)

1. You confirm the table design and the 12-month retention rule.
2. I create the real migration file (following the repo's migration CI checks)
   and you approve that PR.
3. Only then is anything applied to the database.
