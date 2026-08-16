# START HERE — read this fully before doing anything

You are continuing work on GtCV Phase 0 for Habib Onifade. A week was lost to
mistakes that are all written down below. Read the whole file. Do not skim it,
and do not read the rest of PROGRESS.md unless a section here sends you there.

---

## 1. THE BRANCH. Get this wrong and nothing you do exists.

    git fetch origin
    git checkout claude/coach-deploy-corrections-2kj6q4

EVERY PUSH GOES TO BOTH:

    git push -u origin claude/coach-deploy-corrections-2kj6q4
    git push origin claude/coach-deploy-corrections-2kj6q4:staging

Habib's address, the only one he looks at:
https://clearview-platform-git-claude-coach-deploy-33cc44-clearview2026.vercel.app

Confirm the build is actually live before saying anything is testable:

    curl -s <address>/api/build-info

Wait for the commit hash to match. A push is not a deploy.

---

## 2. YOU HAVE DATABASE ACCESS. NEVER ASK HABIB TO RUN SQL.

`SUPABASE_ACCESS_TOKEN` is in the environment. Staging project ref is
`giugeygicxltwqnqlwto`. Run SQL yourself:

    curl -sS -X POST \
      "https://api.supabase.com/v1/projects/giugeygicxltwqnqlwto/database/query" \
      -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"query":"select 1;"}'

Habib's engagement is `client_1786340570857`.

PRODUCTION IS `sxsenbvaitpnumdwvxaj`. DO NOT TOUCH IT.

A previous session handed him a migration file to run by hand. He was right to
be angry. If you need a schema change on staging, apply it yourself, verify it
with a follow-up query, and tell him what you did. Migrations still get written
into `supabase/migrations/` as the record, but you run them.

You also have `VERCEL_TOKEN` (deployments, build logs) and the Supabase
analytics log API, which shows the real HTTP requests the browser made. Use
evidence, not guesses.

---

## 3. HABIB'S MODEL. Build nothing that contradicts this. Do not ask him to
   repeat it.

An engagement has MANY services. A session walks through all of them.

    Service                         the anchor, named once, never repeated
      └── Problems it solves        many per service
            └── Activities          many per problem, each solving that problem
                  ├── What it delivers        many values
                  ├── Who pays for it today   many values
                  ├── The assumption held     many values
                  └── What would prove it wrong

THE FIVE TOOLS, in order:

  Tool 1  Assumption Dump Canvas — the problems each service solves, the
          activity that solves each, what it delivers, who pays, the assumption,
          what would disprove it.
  Tool 2  Problem Owner Budget Matrix — takes Tool 1's problems ALREADY FILLED
          IN, never retyped, anchored by the same service. Adds who experiences
          it, who is accountable, who controls the budget, cost of not solving,
          budget mechanism. The team then validates in the field.
  Tool 3  Hypothesis Shortlist — a hypothesis per field-validated service: what
          problem it solves and who pays.
  Tool 4  Signal vs Story — is it a real market signal or a story.
  Tool 5  Continue / Pause / Kill — per field-validated service.

RULES THAT COME FROM THAT MODEL:

- ONE VARIABLE PER QUESTION. Never combine. One submission carries one set of
  values, so a combined question makes multiple answers impossible. This is
  mechanical, not stylistic.
- NEVER put a question from one tool in another tool's list. "Signal or story"
  is Tool 4. A 1-to-5 grant-dependency ranking is not Tool 1's.
- NO ATTRIBUTE WITHOUT ITS ANCHOR. No problem without a service, no activity
  without a problem, no delivers/who-pays/assumption/disproof without an
  activity. The UI enforces this; keep it enforced.
- EVERY COLUMN HAS ITS OWN "+ add", IN ITS OWN COLUMN, AT THE END OF ITS OWN
  GROUP. An add at the foot of the table can only add to whatever is last, which
  is useless when the service you want is at the top.
- The service is never asked in a room question. The room is anchored to one
  service and the phone already shows its name.

---

## 4. WHAT IS BUILT AND WORKING (do not rebuild, do not re-audit)

- Problems hang off the SERVICE (`gtcv_problem_owner_budget.service_id`),
  activities hang off the PROBLEM (`gtcv_assumptions.problem_id`). Migration
  applied to staging 14 Aug.
- Tool 1 is ONE FLAT SCROLLABLE TABLE across all services:
  Service | Problem it solves | Activity | What it delivers | Who pays |
  Assumption underneath | What would prove it wrong
- Service name written once per group, typed in its own cell. Services are added
  from the table with "+ add" under the Service column.
- The anchor chain is enforced; a locked cell says which anchor is missing.
- A row still completely empty when focus leaves it deletes itself. A row with
  SOME columns filled stays. The only row of a service is exempt.
- Tool 1's six questions, one variable each, seeded automatically:
  1 What problem does this service solve?
  2 Name one activity that solves that problem.
  3 What does that activity deliver?
  4 Who pays for it today?
  5 What has to be true for this to work?
  6 What would prove that wrong?
  The four old mixed questions were moved to gate_id `phase_0_archived` (NOT
  deleted — 12 submissions hang off them).
- Accept routes by the question's target field: the problem answer goes to the
  problem table, the rest to the activity table, both carrying the anchored
  service.
- Tools fold to their headings, remembered per engagement. Each tool carries its
  own count. "Run this with the room" is on every tool heading.
- The room feed rate limit is 20,000/hr (it was 600, which died 7 minutes into
  every session).
- The projected view is exempt from the 5-minute idle sign-out.
- Duplicate submissions fixed (a flush race sent every answer twice).
- Pending answers and their Accept buttons render directly under Tool 1's table.

15 August:

- ACCEPT FILLS THE ROW THE ANSWER IS ABOUT. The column the question targets
  decides: `problem` makes a problem under the anchored service, `activity`
  makes an activity under the problem just accepted, and delivers / who pays /
  assumption / disproof FILL that activity. Tool 2's five fill the problem.
  The rule is in `src/lib/stage1-accept.ts`, on its own, with tests.
- The four multi-value fields fill through `gtcv_activity_values`, so a second
  "who pays" is a second funder. Text typed by hand is carried across as the
  first value before the room's answer goes underneath it.
- `gtcv_room_state` holds the whole chain: `current_problem_id` and
  `current_activity_id` alongside the service. Applied to staging 15 Aug.
- Where the chain is not there yet, Accept REFUSES and the answer stays
  pending, saying which press is missing. Beside every pending answer: which
  row it will fill, and a chooser to send it to another.
- TOOL 2 READS PROBLEMS BY SERVICE. Same table shape as Tool 1, one level in:
  service written once per group, its problems beneath, then who experiences
  it / who is accountable / who controls the budget / cost of not solving /
  budget mechanism. The problem cell is the row Tool 1 states, by id.
- Tool 2 has five questions, one variable each. The problem is never asked —
  the room is working through one and it is on the wall.
- A QUESTION BELONGS TO A TOOL (`gtcv_questions.tool`, default 1). Each tool
  draws its own bar and its own pending list. Questions seed PER TOOL, so an
  engagement that opened Phase 0 before today still gets Tool 2's.
- A problem parented by its service is no longer reported as parked. That check
  only asked about activities, so every problem stated the new way was in the
  bin marked broken.
- `/api/services` was capped at 600/hr and is polled 2,100/hr. Proved from the
  counter: 830 in one hour. Now 20,000, arithmetic in the file. `/api/facilitate`
  is 40,000 because Phase 0 draws a bar and a pending list PER TOOL.

---

## 5. WHAT IS NOT BUILT. Do not claim any of it works.

1. THE PAGE MAY STILL JUMP when a control is clicked. Two causes were found and
   fixed (the loader blanking the whole workspace; a 4-second poll rebuilding
   the table). A third was found on 15 Aug and is the strongest candidate for
   what was left: /api/services refusing everything past 600 an hour while two
   pollers spent 2,100, silently — a control pressed after that did nothing,
   and the screen caught up in a lump when the window rolled over. NOT
   CONFIRMED AS THE JUMP. It could not be reproduced in a browser this session:
   minting a staging login was blocked. If it still moves, the next thing to
   read is what changes HEIGHT above the table on a click — the anchor bar's
   Rename swapping a button for a wider form, and the save indicator's error
   line wrapping.
2. The anchor bar and the workspace poll the SAME URL for the SAME payload,
   three and four seconds apart. One shared read would halve the traffic and
   stop the two copies disagreeing. Named in the comment on /api/services.
3. Park / Rename / Delete are IN THE TABLE (15 Aug). The name is typed in the
   service's own cell; Park and Delete are in that row's actions marked
   "Service". The bar now only chooses which service the room is on.
4. Discard for parked items (Bring back and Pull into a service exist).
5. THE BLOCK IS IN THE URL (15 Aug): `/coach?client=...&zone=phase_0`, written
   with replaceState. The return-to machinery already carried the path across a
   sign-out, so a timeout now returns to the block.
6. The projected view timeout: unknown whether it sends him to the login page or
   just goes blank. ASK HIM WHICH, once, before building anything for it.
7. The room control bar on Tools 3, 4 and 5 still runs Tool 1's list. Tools 1
   and 2 now each draw their own; 3 to 5 have no questions of their own yet, so
   they show Tool 1's until they do. Give them `tool: 3/4/5` seeds.

---

## 6. HOW TO BEHAVE. Every line here was learned by getting it wrong.

- HE TESTS ON A REAL PHONE AND A REAL SCREEN. A passing test proves nothing to
  him. Never say something works until he has seen it work.
- DO NOT MAKE HIM REPEAT HIMSELF. Everything he has specified is in section 3.
  If you are about to ask him to re-explain the model, re-read section 3 instead.
- ONE ROOT CAUSE, NOT FIVE PATCHES. Both page-jump bugs were single lines found
  by reading. Chasing symptoms button by button cost two full rounds.
- DO NOT SHIP WITHOUT REASONING IT THROUGH. A button labelled "add a problem"
  was wired to the activity add. An add was placed at the foot of the table when
  it needed to be per group. Both shipped, both wasted a round.
- BE BRIEF. He has said explicitly that long apologies and explanations waste his
  usage. Report what changed, what to press, what is not built. Nothing else.
- NEVER APOLOGISE AT LENGTH OR RE-LITIGATE FAULT. Fix it and move on.
- TWO LISTS AT THE END OF EVERY REPORT: "ready to test now" with exactly what to
  press, and "not built, do not test" with a one-line reason each.
- IF YOU RUN OUT OF ROOM, STOP CLEANLY AND SAY WHAT IS LEFT. Never send a
  completion message that is not true.
- READ HIS SCREENSHOTS PROPERLY. Several wrong diagnoses came from skimming one.
- VERIFY BEFORE CLAIMING. `npx tsc --noEmit`, `npm test`, `npm run lint:hooks`,
  `npm run build`. `lint:hooks` now carries no-undef, which is the ONLY thing
  checking the 55 files that carry @ts-nocheck — two crashes shipped in one day
  through that hole. src/__tests__/phase-zero-renders.test.tsx renders the
  workspace with rows in it; if you change the table, run it. Four test files have PRE-EXISTING type errors
  (generic-engine, role-preview, seed-worked-example, working-capital) — ignore
  those, they are not yours.

---

## 7. TRAPS THAT HAVE ALREADY COST A WEEK

- `reload()` in this workspace re-reads the whole engagement. Anything that sets
  a full-page loading state will blank the page and throw the scroll to the
  bottom. Apply changes in place instead.
- Defining a component inside another component's render remounts it on every
  keystroke and steals focus mid-word. `ActivityTable` is at module level for
  this reason. Keep it there.
- A `useCallback` naming a value declared BELOW it throws on first render and
  takes the whole workspace down. Check declaration order.
- Three pollers hit `/api/facilitate`: RoomControlBar (1.5s), PendingRows (3s),
  the projected view (1.5s). If you change an interval, redo the rate-limit sum
  in `app/api/facilitate/route.ts`.
- All three pollers discard failed responses silently (`if (!res.ok) return`), so
  a refused read looks exactly like "nothing happened". This is still true.
- Questions are seeded only into an EMPTY block. Changing the seed does not
  change existing rows — you must update the database rows too.

---

## 8. THE FIRST THING TO DO IN THE NEW SESSION

Do not re-audit. Do not ask him to re-explain. Start here:

1. Accept and Tool 2 are built and live. What has NOT been seen working is a
   real room: six questions run on phones, six answers accepted, one problem
   and one activity carrying four values. Watch that once before building more.
2. Tools 3, 4 and 5 have no questions. They are the next sets to write, one
   variable each, seeded with their own `tool` number.
3. Park / Rename / Delete still live in the bar above the table, not in it.
