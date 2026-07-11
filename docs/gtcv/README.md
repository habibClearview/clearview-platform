# GtCV + Clearview — product context and decisions

Confidential. © Habib Onifade / The Canvas Coach. Kept in-repo so any working
session has full context without re-uploading the source collateral.

Source collateral in this folder:
- `GtCV_Canvas_Workbook_v2_2.xlsx` — the client-facing canvas workbook (DP forms).
- `GtCV_Engagement_Workbook_v2_1.xlsx` — the engagement/delivery workbook (zones, gates, financial model tabs).
- The full "From Grant to Commercial" handbook text and the Co-Implementer
  Engagement Delivery Guide were provided by Habib; their structure is summarised below.

## The two offerings are ONE journey at two depths

- **GtCV (Grant-to-Commercial Viability Canvas™)** — a nine Decision Point / nine "Zone"
  gated methodology that moves a grant-funded organisation to commercial viability.
  Runs ~6–8 months. Each gate opens only when the prior one closes with documented evidence.
- **Clearview** — the financial platform in this repo. It **is** GtCV's Zone 4 /
  Decision Point 04 ("Commercial Viability Model": cost model, pricing tiers, break-even,
  a financial model non-technical staff can run) **plus** the ongoing monthly monitoring
  that keeps it alive after handover.

So Clearview is one zone of GtCV running as the financial spine, and it can also stand
alone. Product decision: **one product, depth set by the client's engagement type**
(the codebase already encodes this via `engagement_mode` = `canvas` (GtCV) vs
`financial` (Clearview) + a `clearview_active` flag).

## The nine Decision Points / Zones

| DP/Zone | Name | Central question | Output (gate) |
|--------|------|------------------|---------------|
| 01 | Service Reality Audit | What do we actually deliver and what does it cost? | Costed, honest service inventory (market-logic vs grant-logic) |
| 02 | Customer & Problem Clarity | Who is the paying customer with budget authority? | Named customer segments, problem in their words, ≥5 validation conversations |
| 03 | Value Proposition Architecture | Why choose us? | Client-tested value proposition per segment |
| 04 | Commercial Viability Model | What does it cost, at what price do we sustain? | Working financial model, ≥2 pricing tiers, break-even  ← **THIS IS CLEARVIEW** |
| 05 | Market Entry Design | How do we reach the right customer? | Prioritised pipeline, tested messaging, materials |
| 06 | Organisational Identity & Partner Architecture | What commercial identity are we? | Identity statement + partner map |
| 07 | Pilot & Learn Architecture | Does it work with real paying clients? | Two live pilot iterations (I: consultant-led, II: LSP-led), revised model |
| 08 | Scale & Expansion Pathway | How do we grow without programme support? | ≥2 expansion segments with independent channel logic |
| 09 | Commercial Readiness Diagnostic | How ready are we? | **Commercial Readiness score** taken 3×: baseline / mid / close |

### Commercial Readiness Diagnostic (DP09) — six fit tests, scored 0–3, max 18
Problem–Provider, Problem–Solution, Solution–Customer, Solution–Pilot, Solution–Market,
Solution–Scale. Baseline typically 3–7; a successful close is ~12–15. The
**baseline→close progression** is the headline evidence for funders and marketing.

> Note the TWO distinct scores in the ecosystem:
> - **Commercial Readiness** (/18, GtCV DP09) — for GtCV engagements.
> - **Liquidity Readiness Score / LRS** (/100, 7 dimensions) — Clearview's own score.
> The coach dashboard shows whichever fits the engagement.

## Delivery model (from the Engagement Delivery Guide)

- Roles: **LC** Lead Consultant (Habib), **CI** Co-implementer, **LT** LSP leadership team,
  **FT** field team, **FL** finance lead, plus the funding **Programme** (e.g. Tanager, Palladium/CSJ, NIRSAL/FCDO).
- Every zone: context → prep checklist → activities (with owner/duration) → gate review. No gate skips.
- **Momentum protocol:** weekly co-implementer report, status flag GREEN / AMBER (one missed
  session, catch-up in 5 days) / RED (2+ missed or gate stalled >2 weeks → engagement pauses, review).
- Multi-country **stagger** (e.g. Nigeria wk1, Kenya wk3) so the LC is never needed in two places at once.
- Pre-engagement diagnostic (3 questions on survival / decision-readiness / success) gates whether an engagement even starts.

## Who pays vs who is served (IMPORTANT — corrected)

- **Paying customer = the programme** (Palladium/CSJ, Tanager) — the budget holder. Deals to close.
- **Served / beneficiary = the LSP and the agribusinesses** — the organisations put through the canvas.
- This is the handbook's own beneficiary-vs-customer distinction applied to the coach's OWN business.

## The coach is on the same transformation (key strategic frame)

The Canvas Coach is itself a grant/programme-dependent business (paid today by programmes)
whose own "graduation" is being paid directly by clients. Implications:
- Run the coach's own business through Clearview: engagements = business units, fee − cost-to-serve
  = unit margin, unpaid programme invoices = the coach's own DSO/working-capital risk, aggregate
  client outcomes = portfolio intelligence.
- **Clearview subscriptions are the coach's own annuity** — the recurring, client-paid revenue that
  weans the practice off one-off programme project fees. Clearview is the coach's graduation vehicle,
  not just a product he sells.

## Dashboard direction (coach)

- **Tab 1 "My Business"** (coach's own book): engagements by mode; revenue paid-up / invoiced /
  outstanding; per-engagement profitability; **payer (programme) vs served (LSP/agribusiness)** shown
  distinctly; co-implementer performance at a glance (on-time gate rate, utilisation, weekly R/A/G,
  complaints/issues); client progression along the 9 zones; **pipeline conversion** (programme deals
  and each client's own customer pipeline); marketing activities; admin-officer row appears once the
  business is big enough. Portfolio-intelligence panel turns aggregate client numbers into posts/talks/funder reports.
- **Tab 2 "Client Health"**: portfolio of clients with LRS (Clearview) or Commercial Readiness (GtCV) per card, "needs attention" band, programme averages.

## Roadmap note

- **Now:** get Clearview comfortable for clients (UI redesign in progress; larger readable font
  scale being rolled out; per-unit month-end working-capital done; Actuals grid done).
- **Later (explicitly after Clearview is client-ready):** build GtCV as an **online gated engagement**
  — the nine zones, evidence capture per gate, the Commercial Readiness Diagnostic taken 3×,
  co-implementer weekly reporting + momentum flags, multi-country stagger. Large project of its own.
