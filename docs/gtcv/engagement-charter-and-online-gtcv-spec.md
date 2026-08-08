# Engagement Charter & Online GtCV — Build Spec

> **Status:** Draft v1 (living document — update whenever the design changes)
> **Owner:** Habib Onifade (Canvas Coach)
> **Created:** 2026-08-08
> **First engagement:** Tanager · IGNITE+ Nigeria (RFP 149) — the *first record*, not the schema
> **Branch:** `claude/coach-deploy-corrections-2kj6q4` (rebased onto `main`)
> **Related docs:** [`docs/gtcv/README.md`](./README.md) (product bible),
> [`docs/STAGING_AND_ROLLBACK.md`](../STAGING_AND_ROLLBACK.md),
> [`docs/ACCOUNTING_ARCHITECTURE.md`](../ACCOUNTING_ARCHITECTURE.md)

---

## 1. Purpose

Build the **interactive, gated, client-facing GtCV workflow** — the online version of the
Grant-to-Commercial Viability Canvas™ — plus the commercial spine around it: a per-engagement
**journey map**, a tri-party **Engagement Charter** with e-signature, a configurable **two-stage
email flow**, and **meeting scheduling**. Later phases add a **ToR→gate auto-mapping** engine and
an **auto-invoice loop**.

This is the online GtCV that `docs/gtcv/README.md` explicitly deferred *"until Clearview is
client-ready."* Clearview is now client-ready, and Tanager is paying into exactly this. Two of the
features here — *"GtCV zone progression, decision gate records, and a Tanager visibility dashboard"*
and *"six-month ClearView platform access"* — are **already contracted** in the RFP 149 cost
proposal. We are building what has been sold.

---

## 2. Founding principle — the Canvas is invariant; the engagement is configuration

The nine zones, the seven diagnostic tools, and the gate method are **fixed IP** — identical for
every client, forever. Nothing about any single client is ever hardcoded.

What varies **per engagement** is a *configuration record*:

- the client and its brand,
- the parties (client leadership, co-implementer, funder),
- the **Terms of Reference** and the **deliverables schedule**,
- the **mapping of deliverables onto decision gates**, and
- the **payment milestones** tied to those gates.

Tanager is simply the **first record** in this structure. Ikore, the next donor, a private
client — all run on the same code, different config. This is not a new idea we are inventing; it is
**already the grain of the codebase** (see §4): the bespoke per-client dashboards (CONAS, Wonderland)
were deliberately removed in favour of a single config-driven path
(`2026_07_23_drop_bespoke_conas_wonderland_tables.sql`). We stay on that path.

> **Design rule:** if a screen, query, email, or migration mentions "Tanager", "Ikore", or
> "Nigeria" as anything other than *seed data in a config row*, it is wrong.

---

## 3. What already exists that we reuse (do not rebuild)

A reconnaissance of the repo (2026-08-08) found that **most of the hard domain modelling already
exists**. The gap is the *interactive gated workflow*, not the model.

| Need | Already in the codebase | Reuse how |
|---|---|---|
| Nine zones, gate state machine, diagnostic, evidence, sign-offs, handover tests | `src/lib/canvas-types.ts` (541 lines), `src/lib/coach-types.ts` | The domain model is done — we add persistence + UI wiring |
| Multi-tenant client model | `engagement_clients` (slug, `engagement_mode: 'canvas'\|'financial'`, `clearview_active`) + `generic_model_config` | Add engagement config alongside; Tanager is a record |
| No-login external viewing | `client_access_grants` + `app/access/[token]/page.tsx` + `app/api/access-grant/[token]/route.ts` (time-limited, revocable, OTP) | Powers the journey-map **showcase link** |
| Email sending (Resend, live in production) | `app/api/access-grant/[token]/route.ts` — direct `fetch('https://api.resend.com/emails')`, `RESEND_API_KEY`, `otpAvailable()` flag, graceful fallback | Generalise the pattern into a shared helper for engagement emails |
| Staging isolation | `staging.clearview.habibonifade.com` (separate Supabase project, throwaway data), `src/lib/app-env.ts`, `EnvBanner` | Build & demo entirely on staging; live client untouched |
| AI proxy | `app/api/ai-generate/route.ts` (Anthropic, `ANTHROPIC_API_KEY` server-only, rate-limited) | Powers Phase-2 ToR→gate auto-mapping |
| Security scaffolding | RLS throughout, `src/lib/rate-limit.ts`, `src/lib/audit-log.ts`, CI route-auth gate (`.github/scripts/route_auth_check.py`), migration validator | New routes/tables must satisfy these |
| Doc-export | `docx` lib, `investment-brief-builder.ts`, access-grant doc serving | Reuse for evidence packs / invoice packs (Phase 2) |

**The gate state machine already models acceptance:**
`GateStatus = locked → not_started → in_progress → evidence_submitted → ceo_signed → coach_authorised`.
The terminal state `coach_authorised` **is deliverable acceptance** — and therefore the payment
trigger. We do not invent a new lifecycle; we attach money and evidence to the one that exists.

**The nine zones** (`CANVAS_DECISION_POINTS` in `canvas-types.ts`):

| # | Zone | Note |
|---|---|---|
| DP01 | Service Reality Audit | |
| DP02 | Customer & Problem Clarity | |
| DP03 | Value Proposition Architecture | |
| DP04 | Commercial Viability Model | **This is Clearview** |
| DP05 | Market Entry Design | |
| DP06 | Organisational Identity & Partner Architecture | |
| DP07 | Pilot Iteration 1 | |
| DP08 | Pilot Iteration 2 / Scale | |
| DP09 | Commercial Readiness Diagnostic | Commercial Readiness score /18 |

Plus `setup`, `phase0`, and `handover` phases.

---

## 4. Deliverable → gate → payment mapping

This is the heart of the commercial design. A client's **contractual deliverables** and **payment
milestones** are mapped onto the **decision gates**. When a gate reaches `coach_authorised`
(acceptance), the deliverable is accepted and the milestone becomes payable. The mapping is **data**,
confirmed by the coach — never code.

### 4.1 The mechanism (reusable for any client)

1. The coach uploads the client's **ToR + deliverables schedule** (Phase 2 automates the read).
2. The system **proposes** a mapping: each deliverable → the gate(s) that evidence it, plus the
   evidence / means-of-verification each gate needs.
3. The coach **confirms, edits, rejects, or approves** each line.
4. On approval the engagement goes live; the journey map and Charter render from this config.
5. When a gate is authorised → (Phase 2) the evidence pack is assembled → the coach approves →
   the invoice + evidence pack is sent to the client automatically.

### 4.2 Tanager — the first record (proposed, pending confirmation)

Fixed price **$39,000 incl. 7.5% VAT** (fee $36,279 + VAT $2,721), 55 consultant days,
July–December 2026.

| Milestone | Deliverables | Zones / gates | Payment on `coach_authorised` |
|---|---|---|---|
| 1 · Inception | Inception Report (workplan, methodology note, baseline cost structure) | `setup` + `phase0` | **$7,800** |
| 2 · Service Bundle Refinement | D1 refined bundles, D2 value propositions, D3 pricing models | DP01–DP04 (Service Reality → Commercial Viability / Clearview) | **$13,650** |
| 3 · Iteration I | D4 go-to-market & comms, D5 lessons (partial) | DP05–DP07 (Market Entry → Org Identity → Pilot 1) | **$9,750** |
| 4 · Final Delivery | Priced bundles, lessons-learnt report, tools/templates handover, close-out | DP08–DP09 (Pilot 2/Scale → Readiness Diagnostic) + `handover` | **$7,800** |

> This mapping is stored as the Tanager config row and is fully editable. It is *illustrative of the
> engine*, not baked into the product.

---

## 5. Data model

**All migrations are additive and applied to the staging Supabase project first**, per
`docs/STAGING_AND_ROLLBACK.md`, and must pass the CI migration validator and route-auth gate.
Use `engagement_client_id` (TEXT) everywhere; the legacy `clients` UUID is deprecated.

New tables/columns (staging-first; names indicative, finalised in the migration task):

- **`engagements`** — the per-engagement config: `engagement_client_id`, title, currency, start/end,
  ToR reference, brand overrides, status. One per contract.
- **`engagement_parties`** — parties + roles (client leadership / co-implementer / funder / coach),
  names, emails, signatory flags. Config-driven recipients for the email flow and Charter.
- **`engagement_deliverables`** — the deliverables schedule (D1…Dn), each with a payment milestone
  amount and due window.
- **`deliverable_gate_map`** — the mapping rows (`deliverable_id` ↔ `gate/DP`), with per-gate
  required evidence / means-of-verification, plus an approval flag set when the coach confirms.
- **`engagement_charters`** + **`charter_signatures`** — the Charter content snapshot and the
  tri-party e-signatures (reuse the `GateSignOff` shape from `canvas-types.ts`).
- **Per-client live canvas state** — persistence for gate status, evidence entries, diagnostic
  scores, and sign-offs (the *types* exist in `canvas-types.ts`; the tables do not yet).

Every table is RLS-scoped by engagement/client exactly like the existing
`2026_07_04_client_scoped_rls.sql` pattern.

---

## 6. Phase 1 — the week-one orientation spine

The goal: before the contract signs, the client can open a link and **see the journey, sign the
Charter, and book the kickoff** — all on staging, all reusable, nothing touching the live client.

### 6.1 Reusable engagement config
Model the engagement as configuration on top of `engagement_clients`. Seed Tanager/Ikore/Ganiat
Ettu as the first record **on staging**. No Tanager-specific code.

### 6.2 Journey-map page (two modes)
The client-facing view of the nine zones mapped to *their* deliverables and milestones — where they
are, what's next, what each gate will produce.
- **Engagement mode:** authenticated (client leadership / co-implementer / funder roles already
  exist in `user_profiles`).
- **Showcase mode:** a **no-login** link for prospects, reusing `client_access_grants` +
  `app/access/[token]`. Same page, read-only, safe to share.
Uses the accessible `--cv-*` brand tokens (see §8).

### 6.3 The Engagement Charter + e-signature
The founding governance document, assembled from three layers:
1. **Commercial terms** — straight from the RFP 149 cost proposal (scope, 55 days, fee, milestones,
   IP split: GtCV Canvas™/tools/ClearView remain Habib's IP; deliverables belong to the client/donor).
2. **Responsibilities** — *drafted for review* (the cost proposal does not spell these out): who does
   what at each gate, drawn from the Delivery Guide and the method.
3. **Governance** — the gates, the GREEN/AMBER/RED momentum protocol, the evidence standard, and the
   hours commitment behind any staff certificates.
Tri-party **e-signature** reuses the existing sign-off pattern (`GateSignOff` /
`ceo_signed` / `coach_authorised`). Signatories are config-driven.

### 6.4 Two-stage email flow (config-driven recipients)
Reusing the Resend pattern (§7):
1. **Stage 1 — client ↔ coach:** sets out the scope of what needs to be done + the link. (For
   Tanager: Tanager and Habib first.)
2. **Stage 2 — tri-party:** a separate email to all three parties.
Recipients, subjects, and bodies come from the engagement config — **never hardcoded**.

### 6.5 Meeting scheduling
Scheduling for the kickoff and gate meetings, config-driven, integrated with the email flow.
Assess reuse vs a lightweight in-app scheduler in the build task.

---

## 7. Email conventions (reuse the live Resend pattern)

Resend is already live in production via a direct API call — **not** the `resend` npm package — in
`app/api/access-grant/[token]/route.ts`:

- `resendApiKey()` trims the env var (tolerates a stray trailing newline).
- `otpAvailable()` is the feature flag: email on when `RESEND_API_KEY` is present.
- `sendOtpEmail()` does `fetch('https://api.resend.com/emails', …)` from
  `Canvas Coach <notifications@habibonifade.com>` with branded inline-hex HTML, and **degrades
  gracefully** when the key is absent.

We **generalise this into a shared `src/lib/email` helper** and use it for the engagement emails —
**without modifying the live access-grant route** (it serves the Uganda client; leave it alone and
copy the pattern). Emails use **literal brand hexes** inline (email clients don't support CSS
variables), matching the existing template: navy `#1B2A41`, cyan `#00CCCC`, cream `#F5F0E8`.

---

## 8. Brand & styling conventions

- **Styling is inline React style objects.** Tailwind is installed but effectively unused — do not
  rely on utility classes. Theme tokens live in `app/globals.css` as `--cv-*` custom properties with
  light default and a `:root[data-theme="dark"]` override.
- **Two palettes exist and should be reconciled toward the accessible tokens:**
  - Accessible `--cv-*` set (use these in-app): navy `#1B2A41`, cyan `#008383` (light) / `#2AEBEB`
    (dark), teal `#1A9DAA`, cream `#F5F0E8`, plus green/amber/red status colours. These were
    deliberately darkened from the presentation-spec hexes that failed WCAG contrast (see the comment
    in `globals.css`).
  - Inline literals in `app/page.tsx` / `app/dashboard/[slug]/page.tsx`
    (`#1B2A4A` / `#00B4D8` / `#F8F4EE`) — legacy; prefer the tokens.
- **Logo is a text wordmark**, not an image: a monospace "CANVAS COACH" kicker over a Georgia-serif
  "Clearview". Attribution string: "Canvas Coach · habibonifade.com".
- Body font is system (`'Segoe UI', system-ui, …`); headings `Georgia, serif`.

---

## 9. Phase 2 — flexibility engines (design now, build right after launch)

### 9.1 ToR → gate auto-mapping (human-approved)
Upload any client's ToR + deliverables → `app/api/ai-generate` (Anthropic) proposes the
`deliverable_gate_map` rows + required evidence per gate → the coach **confirms / edits / rejects /
approves** each line in a review UI → approved mapping goes live. This is *the* flexibility feature:
the canvas is unchanged; only the mapping is generated, and always under human control.

### 9.2 Auto-invoice loop
Gate reaches `coach_authorised` → the system **assembles** the evidence + means-of-verification for
that gate/deliverable (reusing the `docx` export machinery) into an **approval request to the coach
first** → the coach approves → the **invoice + evidence pack is sent to the client automatically**
via the shared email helper. Human-in-the-loop at sign-off; automation only for the toil.

---

## 10. Safety, isolation & security

- **Staging first, always.** Build and demo on `staging.clearview.habibonifade.com` (separate
  Supabase project, throwaway data, yellow `EnvBanner`, `X-Robots-Tag: noindex`). The **live Uganda
  client** is on production and must never be touched by this work.
- **Additive migrations only**, applied to staging before production, validated by CI.
- **Every new API route** must pass the route-auth CI gate (no service-role key without an auth
  check), be rate-limited where expensive, and audit-logged where sensitive.
- **RLS on every new table**, scoped by engagement/client.
- **CSP** in `next.config.js` allows self + Supabase only — anything new must fit (no external
  script/style/host).
- **API security hardening** (the existing in-flight task) is the **immediate follow-on** once this
  build lands, at the client's explicit request.

---

## 11. Sequenced week-one plan

1. **This spec** (docs) — done when this file is committed.
2. **Migration** (staging): `engagements`, `engagement_parties`, `engagement_deliverables`,
   `deliverable_gate_map`, `engagement_charters`, `charter_signatures`, live canvas-state tables.
3. **Engagement config model** + Tanager seed row (staging).
4. **Journey-map page** — engagement mode + no-login showcase.
5. **Engagement Charter** page + tri-party e-signature.
6. **Shared email helper** + two-stage engagement email flow.
7. **Meeting scheduling**.
8. **Test + build + deploy to staging**; verify production/live client untouched; push to
   `claude/coach-deploy-corrections-2kj6q4`.

---

## 12. Open decisions

- **Deliverable→gate mapping for Tanager** (§4.2) — confirm the split, especially Milestone 3 closing
  at DP07.
- **Charter responsibilities** — Habib to review the drafted responsibilities layer (§6.3).
- **Scheduling** — reuse an existing integration vs a lightweight in-app scheduler.
- **Palette reconciliation** — how far to unify the two brand palettes as part of this work vs later.

---

## 13. Changelog

- **v1 (2026-08-08):** Initial draft. Founding principle, reuse map, deliverable→gate→payment
  mapping (Tanager as first record), Phase-1 spine, Phase-2 flexibility engines, conventions,
  week-one plan.
