# Staging & one-click rollback — plain-language runbook

This guide sets up a **safe test copy** of Clearview so new changes can be
tried out before they ever reach real clients, and shows you how to **undo a
bad deploy in one click**.

You do not need to be technical to follow this. Every step says exactly what to
click. Do it once; after that it just works.

---

## What we're building (in one picture)

```
        WRITE CODE  ─►  Pull Request  ─►  Preview link (test here)  ─►  Merge  ─►  Live site
                                            │                                        │
                                            ▼                                        ▼
                                    STAGING database                          LIVE database
                                    (fake / safe data)                        (real clients)
```

- **Live site** (`clearview.habibonifade.com`) → talks to your **real** database. Real clients only.
- **Preview link** (the link that appears on every Pull Request) → talks to a **separate staging database** with throwaway data. Break anything you like here — no real client is affected.
- A yellow **"STAGING — safe test copy"** bar appears at the top of every staging page so it can never be confused with the real site.

Cost: **£0/month** (a second free Supabase project).

---

## Part A — Create the staging database (one time, ~15 minutes)

### Step 1 — Make a new free Supabase project
1. Go to **https://supabase.com/dashboard** and sign in.
2. Click **New project**.
3. Name it **`clearview-staging`** so it's obvious which is which.
4. Choose the **Free** plan and the same region as your live project.
5. Set a database password when asked and **save it somewhere** — you need it in Step 2.
6. Click **Create new project** and wait ~2 minutes for it to finish.

### Step 2 — Copy your live structure into staging
This copies the **shape** of your database (all the tables and rules) but
**none of the data** — staging starts empty and safe.

We use Supabase's own login (a browser sign-in) so you **never type your
database password into a command**. That keeps the password out of your
terminal history and logs.

> ⚠️ Never paste a command that contains your database password directly (e.g. a
> `postgresql://postgres:PASSWORD@...` URL) into a terminal, chat, or log — it
> gets saved in history where others could see it. The steps below avoid that.

1. Sign in to Supabase from your computer (opens your browser once):

   ```bash
   npx supabase login
   ```

2. Point the tool at your **live** project, then dump only the **structure**
   (this only **reads** — it changes nothing). Get your live project's *ref*
   from its dashboard URL (`.../project/<REF>`), then:

   ```bash
   npx supabase link --project-ref [LIVE-REF]
   npx supabase db dump --schema public -f schema.sql
   ```

   This creates a file called `schema.sql`. No password appears anywhere.

3. Now load that structure into **staging**:
   - Open your **`clearview-staging`** project → **SQL Editor** → **New query**.
   - Open `schema.sql`, copy everything, paste it into the editor, and click **Run**.
   - You should see "Success". Staging now has the same tables as live, but empty.

> Not comfortable running the command in Step 2? Send me the `schema.sql`
> contents (or tell me), and I'll hand you a cleaned "paste this and click Run"
> version. If you'd rather skip the manual copy entirely, see **Appendix: the
> hands-off paid option** at the bottom.

### Step 3 — Grab your staging keys
In the **`clearview-staging`** project → **Project Settings** → **API**, copy:
- **Project URL** (looks like `https://xxxx.supabase.co`)
- **anon public** key
- **service_role** key (this one is secret — never share it publicly)

Keep these three handy for Part B.

---

## Part B — Point preview deploys at staging (one time, ~5 minutes)

This tells Vercel: "the live site uses the real database; every preview uses the
staging database instead."

1. Go to **https://vercel.com** → your **clearview-platform** project → **Settings** → **Environment Variables**.
2. For **each** of the variables below, add it and set its **Environment** to **Preview only** (untick Production and Development), using your **staging** values from Part A, Step 3:

   | Variable | Value | Environment |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | staging Project URL | **Preview** |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon key | **Preview** |
   | `SUPABASE_SERVICE_ROLE_KEY` | staging service_role key | **Preview** |
   | `NEXT_PUBLIC_APP_ENV` | `staging` | **Preview** |

3. **Leave your existing Production variables exactly as they are** — they keep
   pointing at the live database. You are only *adding* Preview-scoped values.
4. That's it. The next Pull Request's preview link will use the staging
   database and show the yellow **STAGING** banner.

> **Why this is safe — and one honest caveat.** The `SUPABASE_SERVICE_ROLE_KEY`
> is a powerful key that can read/write past the database's normal row-level
> protections. The app's server needs it to run, so it has to be present on
> preview deploys too. Because a *Preview*-scoped variable is available to
> **every** preview deployment, that staging key is reachable from any preview —
> which is acceptable **only because staging holds throwaway/made-up data, never
> real client data** (that's the whole point of the STAGING banner telling people
> not to enter real information). It is a **separate** key from your production
> project, so it can never touch live data. If you later want to tighten this,
> Vercel lets you scope a Preview variable to a **specific branch** only — say
> the word and I'll walk you through it.

> **How do I check it worked?** Open the preview link on your next PR. If you
> see the yellow **STAGING** bar at the top, it's wired correctly and you're
> looking at the staging database, not real data.

---

## Part C — The new everyday habit (this is the whole point)

From now on, the safe order for **any** change is:

1. I open a Pull Request. Its **preview link** runs on staging.
2. You (and I) test the change on that preview link — enter figures, click
   buttons, try the risky thing — knowing it's the **safe copy**.
3. If a change needs a **database migration** (a `.sql` file), you run it on the
   **staging** project's SQL Editor **first** and we confirm it works there.
4. Only when it all looks right do we **merge** — and only then does it reach the
   **live** site and real clients.

That "run it on staging first" step is exactly the *test-before-production*
safety you asked for. It also keeps the two databases' structures in sync over
time, for free.

---

## Part D — One-click rollback (undo a bad deploy)

Vercel keeps every past version of the live site. If a deploy goes wrong, you
roll back to the last good one in seconds — **no code, no waiting**:

1. Go to **https://vercel.com** → **clearview-platform** → **Deployments**.
2. Find the last deployment that was working (it's labelled **Production** and
   has a green **Ready** tick).
3. Click the **⋯** menu on that deployment → **Promote to Production** (also
   called **Instant Rollback**).
4. Confirm. The live site is back to that version within seconds.

> **Important nuance:** rollback instantly restores the **app** (the screens and
> logic). It does **not** rewind the **database**. So if a bad change also wrote
> or deleted data, rolling back the app fixes the behaviour but not the data —
> which is exactly why testing on staging first matters. For rewinding the
> database itself, Supabase's Point-in-Time Recovery add-on exists (see Appendix
> for what it actually costs).

---

## Appendix — the hands-off paid option

If the one-time schema copy in Part A feels like too much, Supabase's
**Branching** feature (available on the **Pro plan**, which starts at ~$25/month)
creates a staging database for every preview automatically, with the structure
already cloned and kept in sync — zero manual copying, ever.

Be aware of how the costs actually stack up, so there are no surprises:

- **Pro plan** — ~$25/month base. **Includes daily backups** with 7-day
  retention (a real safety net as GtCV grows).
- **Branching** — **billed by usage on top of the Pro base**, not a flat fee:
  roughly $0.01344 per active branch per hour of compute, plus any storage/egress
  that branch uses. Short-lived preview branches are cheap; long-running ones add
  up. (This usage is not covered by the spend cap.)
- **Point-in-Time Recovery** (rewind the database to any moment in the last 7
  days) — a **separate add-on**, about **$100/month**, not included in Pro. Only
  worth it once there's real client data worth being able to rewind.

Everything else in this guide (the Preview-scoped Vercel variables, the STAGING
banner, one-click app rollback) stays the same either way. Say the word and I'll
give you the click-by-click to switch Branching on.
