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

1. First, get your **live** project's connection string:
   - Open your **live** project in Supabase → **Project Settings** (gear icon) → **Database**.
   - Under **Connection string**, copy the **URI** line. It looks like
     `postgresql://postgres:[YOUR-PASSWORD]@db.abcd1234.supabase.co:5432/postgres`.
2. In this project's folder, run this one command (it only **reads** the structure, it changes nothing):
   ```bash
   npx supabase db dump \
     --db-url "postgresql://postgres:[LIVE-PASSWORD]@db.[LIVE-REF].supabase.co:5432/postgres" \
     --schema public -f schema.sql
   ```
   Replace the two bits in brackets with the values from the URI you copied.
   This creates a file called `schema.sql`.
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

> **How do I check it worked?** Open the preview link on your next PR. If you
> see the yellow "STAGING — safe test copy" bar at the top, it's wired
> correctly and you're looking at staging data, not real data.

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
> which is exactly why testing on staging first matters. For data safety over
> time, the paid Supabase plan adds point-in-time database recovery (see
> Appendix).

---

## Appendix — the hands-off paid option

If the one-time schema copy in Part A feels like too much, Supabase's **Pro plan
(~$25/month)** has a **Branching** feature that creates a staging database for
every preview automatically, with the structure already cloned and kept in sync
— zero manual copying, ever. It also adds **downloadable backups** and
**point-in-time recovery** (rewind the database to any moment in the last 7
days), which is a real safety net as GtCV grows.

Everything else in this guide (the Preview-scoped Vercel variables, the STAGING
banner, one-click app rollback) stays the same either way. Say the word and I'll
give you the click-by-click to switch this on.
