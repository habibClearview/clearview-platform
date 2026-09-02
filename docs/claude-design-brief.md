# Design brief — habibonifade.com

Paste this whole file into Claude Design as the opening message.

Everything below marked **[HABIB TO CONFIRM]** is a gap I could not fill from
the existing codebase. Fill those in before pasting, or Claude Design will
invent them.

---

## Who this is for

Habib Onifade. He works with organisations — mostly NGOs, local service
providers and programme-funded bodies in Africa — that are living on grant
money and need to start earning revenue before the grant ends.

He is not a marketer and does not want to sound like one. The voice is plain,
direct, and unafraid to say when something is not working. No "unlock",
"empower", "journey" (except where the method literally uses it), no stock
photography of people pointing at whiteboards.

## Who reads the site

Three audiences, in this order of commercial value:

1. **A director of an organisation whose funding ends in 12–24 months.** Knows
   they have a problem, does not yet know it is a *sequencing* problem. Arrives
   sceptical: they have been sold "sustainability workshops" before.
2. **A programme manager or funder** deciding whether to pay for this on behalf
   of the organisations in their portfolio. Wants evidence and structure, not
   inspiration.
3. **An investor or DFI** interested in the market intelligence product rather
   than the coaching.

## What the site must do

In order of importance:

1. Get an email address, via the readiness assessment (already built and live).
2. Make it obvious there is more than one service, and which one a given
   reader needs.
3. Make the method feel like a method — a system with a defined sequence — and
   not a consultant's opinion.

---

## The services

### 1. Grant-to-Commercial Viability Canvas™ (GtCV) — the flagship

A structured route from grant-funded delivery to services somebody pays for.

**Nine decision points, worked in order.** Each asks one question, produces a
specific output, and does not close until there is evidence behind it and a
signature on it. No decision point opens until the one before it has closed,
and the engagement can be stopped at any of them.

The canvas is laid out like a Business Model Canvas — internal capability on
the left, a connecting centre, external market on the right — with a
transition row underneath and a diagnostic running full width across the
bottom.

| # | Name | The question it asks | Column |
|---|---|---|---|
| 1 | Service Reality Audit | What do we actually deliver, versus what we think we deliver? | Internal |
| 2 | Customer & Problem Clarity | Who owns this problem, and will they pay to solve it? | Connecting centre |
| 3 | Value Proposition Architecture | Why does this matter to this specific client, in their language? | External |
| 4 | Commercial Viability Model | What does it cost to deliver, and what must clients pay for this to survive? | Internal |
| 5 | Market Entry Design | Which clients do we pursue first, and how do we reach them? | External |
| 6 | Organisational Identity & Partner Architecture | What type of commercial entity are we becoming, and who do we partner with as that entity? | Threshold |
| 7 | Pilot & Learn Architecture | What does success look like at small scale, before committing to full delivery? | Transition |
| 8 | Scale & Expansion Pathway | Where does this go after the engagement, and what infrastructure enables it? | Transition |
| 9 | Commercial Readiness Diagnostic | Where does this organisation sit on the journey from grant-dependency to commercial viability, right now? | Full width |

**What happens before decision point 1** — this is the part most proposals
leave out and it is a genuine differentiator:

- **Engagement Charter.** What each side commits to, in writing, before any
  work starts. Signed by the organisation and the coach.
- **Pre-engagement diagnostic.** Three questions put to the Executive Director
  out loud, with all parties present, recorded in their own words: what
  commercial success looks like in 18 months; what is stopping them earning
  revenue now; what would have to be true to stop needing grant funding. Plus a
  ten-question readiness self-assessment. Signed by the CEO, confirmed by the
  coach.
- **Either can stop the engagement.** Weak answers or a low readiness score
  mean decision point 1 does not open until there has been a further
  conversation with the funder present.
- **Clearing the ground.** Every service the organisation actually runs written
  down before any of it is judged.

**Running underneath all of it:** an evidence library. Every decision closes on
evidence, filed against the decision it supports. **At the end:** five
independence tests done unaided — the organisation runs the tools without the
coach in the room, or the engagement does not close.

**The diagnostic (decision point 9)** is scored three times — kick-off,
mid-point and close — so the *movement* is the finding, not the score. Four
stages: Grant-dependent → Commercially aware → Market-ready → Commercially
viable. Six fit tests: Problem-Provider, Problem-Solution, Solution-Problem
Owner, Solution-Pilot, Solution-Market, Solution-Scale Channel.

### 2. Market Intelligence — the subscription product

Anonymised, benchmarked intelligence drawn from the portfolio of businesses
Habib works with. Sold to funders, investors and programme managers, delivered
as a live online report plus a downloadable version.

What it contains:

- **Investment readiness scored across seven dimensions:** Market Opportunity,
  Visibility, Trust, Profitability, Capacity, Resilience, Compliance
- **Readiness tiers:** Pre-Investment → Development → Near Ready → Investment
  Ready, with a stated confidence level
- **Capital absorption** — how much capital could realistically be deployed,
  and through which instrument: credit/debt, grant, equity, consignment,
  recoverable grant
- **Benchmarking by segment,** business by business, ranked, against the
  portfolio median
- **The numbers that decide bankability**, and who these businesses reach

The selling point: this is real operating data from businesses being actively
worked with, not a survey. Nothing identifies an individual business.

### 3. Investment Case Canvas

**[HABIB TO CONFIRM]** — I could not find this anywhere in the platform or
your existing materials, so I have nothing accurate to say about it. Please
write four or five lines covering:

- who it is for, and what problem it solves for them
- how it differs from the GtCV canvas
- what a client actually receives at the end
- roughly what it costs and how long it takes

### 4. IMC-MS Edition

**[HABIB TO CONFIRM]** — same. I do not know what IMC-MS stands for. Please
give me the full name and the same four or five lines.

---

## What already exists — do not redesign these away

- **The live site** at habibonifade.com, built in Next.js and deployed on
  Vercel. The readiness assessment on it works: ten questions, a score
  calculated on the server, a report emailed to the visitor.
- **The canvas drawing.** Nine decision points in their real canvas positions.
  Habib likes this and it should stay recognisably itself.
- **The platform** at clearview.habibonifade.com, where engagements are run.
  Not public. The website should refer to it, not replace it.

## The look

The existing palette, which should be the starting point:

| Role | Light | Dark |
|---|---|---|
| Background | `#EDE6D6` warm paper | `#0B1420` |
| Cards | `#FBF7EE` | `#111E31` |
| Text | `#1B2A41` deep navy | `#EDF2F8` |
| Gold (internal) | `#B7791F` | `#E0B15A` |
| Navy (connecting) | `#22344F` | `#3E5C8A` |
| Teal (external) | `#00767A` | `#2AEBEB` |
| Purple (threshold) | `#6B4A8B` | `#B79AD6` |

Typeface is Poppins. It must work in light and dark.

## What to design

1. **A home page** that makes it immediately clear there are several services
   and which one a given reader needs — the current site only presents GtCV.
2. **A page per service**, each with its own diagram. The GtCV canvas exists;
   the other three need one.
3. **A diagram for Market Intelligence** — the seven dimensions and the four
   readiness tiers. This is currently invisible to anyone outside the platform
   and it is the easiest thing to sell to a funder.
4. **The assessment**, reworked so it feels like the beginning of the method
   rather than a form at the bottom of a page.

## Constraints

- Must read well on a phone. Most of the audience is in Africa on mobile.
- Assume slow connections. No heavy imagery, no video backgrounds.
- No stock photography of people.
- Anything claiming a result must be something Habib can evidence. Do not
  invent client names, numbers of organisations served, or testimonials.
