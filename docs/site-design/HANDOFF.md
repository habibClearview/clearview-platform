# habibonifade.com — build handoff

**Source of truth:** `Canvas Coach Site Editorial.dc.html` in this project. Read it first. Every string, colour, size and layout decision in it has been reviewed and approved. Do not redesign; port.

A second approved direction, `Canvas Coach Site.dc.html`, is kept for reference only. Build the Editorial one.

---

## 1. What this is

The public marketing site for habibonifade.com. It sits **alongside** the existing Clearview app in `habibClearview/clearview-platform`, on the same domain. Clearview stays exactly as it is, behind login, and is linked from the site header.

Habib Onifade is an independent development finance practitioner. The site sells four advisory methods and one subscription product, and its job is to capture emails into Kit so the list can be monetised.

---

## 2. Stack and placement

The repo is already Next.js. Build the site as a route group beside the app so nothing existing is touched:

```
app/
  (site)/                 <- new, public
    layout.tsx            <- site chrome: header, footer
    page.tsx              <- home, chapters 00 to 07
    what-i-do/
      [slug]/page.tsx     <- the five service pages
    method/page.tsx       <- GtCV canvas
    evidence/page.tsx
    library/page.tsx
    watch/page.tsx
    score/page.tsx        <- readiness diagnostic
    contact/page.tsx
  (app)/                  <- everything that exists now, untouched
```

The prototype is a single file switching views on `state.screen`. In production each screen becomes a real route, because these pages must be linkable from LinkedIn and indexable.

| Prototype screen | Route |
|---|---|
| `home` | `/` |
| `gtcv` | `/what-i-do/grant-to-commercial-viability` |
| `intel` | `/what-i-do/market-intelligence` |
| `icc` | `/what-i-do/investment-case` |
| `idcms` | `/what-i-do/intervention-design` |
| `tralimm` | `/what-i-do/trade-liquidity` |
| `proof` | `/evidence` |
| `library` | `/library` |
| `videos` | `/watch` |
| `assess` | `/score` |
| `contact` | `/contact` |

---

## 3. Design tokens

Sampled from Habib's own brand assets. Do not substitute.

```css
--ink:        #12222c;  /* page dark, near black */
--ink-deep:   #0b1620;  /* footer, recessed panels */
--navy:       #1b2a41;  /* brand navy */
--photo-bg:   #121213;  /* hero only: matches the portrait backdrop exactly */
--cyan:       #00afef;  /* primary accent and CTA */
--cream:      #f5f5dc;  /* light sections, body text on dark */
--cream-warm: #fffdf5;  /* raised cards on cream */
--slate:      #4a5560;  /* body text on light */
--teal:       #00767a;  /* eyebrows on light, canvas external column */
--gold:       #c9a84c;  /* canvas internal column, cost callouts */
--purple:     #6b4a8b;  /* canvas threshold column */
--green:      #2e7d32;  /* readiness tier 4 */
```

**Do not reintroduce `#00ffff`.** Habib's LinkedIn banner uses pure cyan; it fails contrast and vibrates on navy. Everything is standardised on `#00afef`.

The four canvas column colours carry meaning and must not be reassigned.

Type: **Poppins** 400/500/600/700 from Google Fonts. Nothing else.

Scale. The minimums matter; they were set after a specific complaint that body copy was too small.

| Role | Size |
|---|---|
| Display h1 | `clamp(48px, 7.4vw, 116px)`, weight 700, tracking `-0.045em`, line-height 0.92 |
| Chapter h2 | `clamp(34px, 5.2vw, 78px)`, weight 700, tracking `-0.04em` |
| Section h3 | `clamp(26px, 3.1vw, 40px)`, weight 600 |
| Lede | `clamp(21px, 1.8vw, 27px)` |
| Body | 19px to 22px. **Never below 17px.** |
| Eyebrow | 14.5px, weight 700, `letter-spacing: 0.18em`, uppercase |
| Button | 17px to 19px, weight 600 |

Layout: 1440px max content width, 40px gutters, 2px gaps between colour blocks, hard edges. **No border radius anywhere.** No drop shadows.

---

## 4. Home page structure

Eight chapters, each a full-bleed colour block carrying one idea. Chapter eyebrows are literal ("Chapter 00").

| # | Background | Content |
|---|---|---|
| 00 | `--photo-bg` | Hero. Two headline lines, second in cyan. Standing portrait, top-aligned with the h1. |
| — | `--cyan` | Rolling marquee of five statements, CSS keyframes translateX to -50%. |
| 01 | `--cream` | What changed. Four count-up stat tiles, then two columns of prose. |
| 02 | `--ink` | Who this is for. Three rows: NGOs, Businesses, Programmes. |
| 03 | `--cream` | What I do. Horizontal scroll rail of five service cards, then enquiry CTA. |
| 04 | `--gold` | The method. Canvas principle, four canvas cards with count-ups. |
| 05 | `--ink` | Evidence. Three findings in editorial three-column rows. |
| — | `--ink-deep` | Client logo marquee. |
| — | `--cream` | Who does this. Seated portrait plus four stat tiles. |
| 06 | `--ink` | Library. Four resource cards. |
| 07 | `--cyan` | Closing CTA. |

### Hero alignment — the detail that took several attempts

The eyebrow sits **full width above** the two-column row. The row is `align-items: flex-start`, the image column is `align-self: flex-start`, and the image is `width: 100%; height: auto` inside `flex: 0 1 460px`. That puts the top of the photo on the same baseline as the first headline line; measured delta 0px. Do not restructure it.

### Headings must break one sentence per line

Chapters 03 and 04 use a `<span style="display:block">` per sentence **and** carry no `max-width`. Both are required. `display: block` alone still lets each sentence wrap internally, and a `max-width` in `ch` units resolves narrower than the type needs, orphaning two-word lines. This was reported three times before it was right. Do not add width caps to headings.

---

## 5. Animation

Two effects. Both must **fail open**.

**Scroll reveal.** IntersectionObserver sets opacity and translateY. Anything already within 95% of the viewport on mount is never hidden, and a 900ms timer clears anything still hidden. In an embedded or prerendered document the observer never fires; without the timer the page stays blank.

**Count-ups.** `data-count="98"` on a span whose text content is already `98`. **Never zero the element before animating.** Write the start value inside the first `requestAnimationFrame` callback, and set a 250ms guard that stamps the final value if no frame arrives. Skip the animation entirely when `document.visibilityState !== 'visible'` or `prefers-reduced-motion` is set. Getting this wrong renders every figure on the page as `0`; it happened.

Marquees are pure CSS. No JS scroll listeners.

---

## 6. Kit integration

Habib has a Kit account. Five forms and five custom fields must exist; he has the list.

**Use the public form endpoint. No API key in client code.**

```
POST https://app.kit.com/forms/{FORM_ID}/subscriptions
FormData:
  email_address
  first_name                      (optional)
  fields[readiness_band]          e.g. "Strong readiness"
  fields[readiness_score]         "0".."10"
  fields[organisation]
  fields[signup_source]           readiness-score | library | enquiry | newsletter | market-intelligence
  fields[interest]
```

Form ids live in one config object; the prototype has `KIT.forms` at the top of the logic class. In production use `NEXT_PUBLIC_KIT_FORM_*` env vars.

Reading subscribers back, creating sequences or building a dashboard needs the **v4 API key**, which is server-side only, in `.env.local`, never `NEXT_PUBLIC_`.

Capture points and tags:

| Where | Source tag | Also sends |
|---|---|---|
| `/score` after ten questions | `readiness-score` | band and score |
| `/library` email unlock | `library` | — |
| `/contact` form | `enquiry` | organisation |
| Footer subscribe | `newsletter` | — |
| Market Intelligence page | `market-intelligence` | organisation |

The score appears on screen **whether or not** an email is given. Only the emailed report is gated. Gating the number kills completions; gating the shareable artefact does not.

Every capture must degrade gracefully with no form id configured: no crash, no fake success, honest copy on screen.

---

## 7. The readiness diagnostic

Ten yes/no questions, one per screen, with a progress bar. Questions and scoring are in the prototype logic as `QUESTIONS` and `score()`. They match the real diagnostic used in a first session. Do not rewrite them.

Bands: under 6 "Below threshold", 6 to 7 "Moderate readiness", 8 or more "Strong readiness". Each returns its own headline, meaning and next step. The result lists every `no` answer with what being wrong about it costs and which decision settles it.

---

## 8. Assets

All in `brand/` in this project. Copy them across.

| File | Use |
|---|---|
| `habib-onifade-cream.png` | header and footer wordmark |
| `habib-onifade-slate.png` | wordmark for light backgrounds |
| `canvas-coach-ink.png` | on the canvas diagram |
| `viable-by-design.png` | newsletter block |
| `client-logos.png` | logo marquee: ASI, Mercy Corps, Palladium |
| `portrait-standing.jpg` | hero. Backdrop is `#121213`; the hero section **must** be that colour or a seam appears |
| `portrait-seated.jpg` | "Who does this" on cream |

Two open asset items.

1. The hero portrait is not a cutout. It is a photo whose backdrop happens to match the section. Automatic keying cannot separate a navy suit from a dark backdrop; it was attempted several times and always ate the jacket. If a transparent PNG is supplied later, the hero can move to any colour. Until then keep `#121213`.
2. The client logo strip is cropped from a LinkedIn banner and shows three marks. DAI is clipped in the source. A clean DAI file replaces it when supplied.

Video thumbnails on `/watch` are drag-drop placeholders in the prototype. In production use real YouTube thumbnails at `https://i.ytimg.com/vi/{VIDEO_ID}/maxresdefault.jpg`, each linking to its video. Channel `@DevTVorg`, id `UCVsxYYQFT7cgnv8GpElioiQ`.

---

## 9. Service page pattern

Every service page has the same five parts:

1. Dark hero. Kind badge (Advisory or Subscription), name, the problem quote in cyan.
2. Cream band, two columns. Left: the problem, what is happening, the cost of getting it wrong with a gold left rule. Right: what I do about it, and who recognises themselves here.
3. That page's own diagram: canvas, bar chart, eight blocks, four phases, or reserve models.
4. Cyan CTA band with that service's own call to action, plus "Ask a question first".
5. Dark nav band. Previous and Next as large clickable panels, then all five with the current one in cyan. The five loop, so the last leads back to the first.

CTAs differ per service by design: Score your organisation / Join as a founding subscriber / Send me your case / Talk about your programme / See if you qualify.

---

## 10. Copy rules

Non-negotiable. These were worked through in detail.

- **No em dashes or en dashes anywhere.** Standing instruction. Use full stops, commas, or "to" in ranges: `UGX 24 to 33bn`, never `UGX 24–33bn`.
- Short sentences, plain words, roughly eighth-grade reading level. If a development professional would say it differently to a colleague in a pub, use the pub version.
- Problem first, method second, framework name last. A reader meets a situation they recognise before they meet a proprietary name.
- Loss framing is used deliberately, but only against real evidenced costs. No fake scarcity, no countdown timers, no "three places left".
- Every claim is evidenced. The real numbers: UGX 24 to 33bn unlocked by a UGX 1bn reserve, 98%+ repayment, 832 households profiled, 7 countries, 1,145 newsletter subscribers.
- Market Intelligence is described honestly as a product whose data layer is being built now with a live client, where founding subscribers shape what gets measured. Do not imply the dataset already exists.

---

## 11. Do not break

- Body copy never below 17px.
- No border radius, no shadows.
- No heading gets a `max-width`.
- Hero section background stays `#121213` while the portrait is not a cutout.
- Canvas column colours keep their meanings.
- Both animations fail open.
- The Clearview link stays in the header with its live indicator, and never gets a competing CTA beside it.
- `#00ffff` never returns.

---

## 12. Suggested build order

1. Route group, layout, tokens, Poppins, header and footer.
2. Home chapters 00 to 02, including the hero alignment.
3. Reveal and count-up hooks with the fail-open behaviour, tested at `visibilityState: hidden`.
4. Chapter 03 service rail, then the five service pages from the shared pattern.
5. The GtCV canvas, then the other four diagrams.
6. `/score` with Kit capture and band tagging.
7. `/library`, `/watch`, `/contact`, `/evidence`.
8. Kit env wiring, then confirm a real subscriber arrives tagged correctly.
9. SEO: per-route metadata, Open Graph images, sitemap. LinkedIn is the main traffic source, so Open Graph matters more than usual.
10. Test on a real phone before launch. Most traffic will arrive on mobile from LinkedIn.
