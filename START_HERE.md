# START HERE. Read this file first, then stop and follow it.

Written 13 August 2026 because a week has been lost to sessions re-reading
73KB of PROGRESS.md and re-discovering the same facts. This file is short on
purpose. Read it fully. Do NOT read all of PROGRESS.md unless this file sends
you to a named section.

## 1. THE BRANCH. Get this wrong and nothing you do exists.

    git fetch origin
    git checkout claude/coach-deploy-corrections-2kj6q4

The initial clone has a narrow refspec, so `git branch -a` shows almost nothing
until `git fetch origin` has run. `main` is ~156 commits behind. If PROGRESS.md
is missing, you are on the wrong branch. Do not conclude anything is lost.

EVERY PUSH GOES TO BOTH:

    git push -u origin claude/coach-deploy-corrections-2kj6q4
    git push origin claude/coach-deploy-corrections-2kj6q4:staging

Habib's address, the only one he looks at:
https://clearview-platform-git-claude-coach-deploy-33cc44-clearview2026.vercel.app

Confirm what it serves before saying anything is live:

    curl -s <address>/api/build-info

## 2. THE OPEN FAULT, 13 August 2026. NOTHING FLOWS FROM PHONE TO BLOCK.

UPDATED after Habib rescanned the QR. THE EARLIER HYPOTHESIS IS DEAD. Do not
spend time on it.

  BEFORE rescan: phone and block were in different rooms.
  AFTER rescan:  phone and block ARE IN THE SAME ROOM, and STILL nothing.
                 No count. Nothing he typed. No pending row. Nothing at all.

So this is NOT room addressing. The two screens agree on the room and data
still does not move between them. The fault is in ONE of exactly three places,
and the next session's whole job is to find out which, BEFORE writing any code:

  A. THE WRITE. Does POST from /room actually insert a row into
     gtcv_submissions? Check the browser network tab on the phone for the
     submit request and its response status, and query gtcv_submissions for
     rows with today's timestamp.

  B. THE READ. Does the block's feed query return those rows? The feed is
     app/api/facilitate/route.ts GET. Check what it filters on — client_id,
     gate_id, question_id, disposition — against what the write actually
     stored. A mismatch on ANY one of those four returns an empty feed and
     looks exactly like "nothing happened".

  C. THE COUNT. "0 connected, 0 devices in the room" while a device is joined
     means presence is written under a different key from the one being read.
     That is the same class of bug as B and probably the same cause.

MOST LIKELY, on the evidence: B or C — a key mismatch between what the room
writes and what the block reads. The count reading 0 with a live device is the
strongest clue and is the cheapest thing to chase first.

DO NOT start by changing the tools, the questions, or the UI. The capture path
is built. Something in the middle is not joining up.

## 3. WHAT IS ACTUALLY BUILT. Do not re-audit this.

Audited against R1 to R32 on 13 August. Present and real:
  - gtcv_questions with all five R2 properties as columns
  - /room participant page, R7's sentence verbatim, polling not refresh
  - separate labelled boxes per target field (R13)
  - score/classify lock on reveal, collect does not (R11)
  - distribution never an average (R16), split with counts (R17)
  - pending rows with Accept, Merge, Discard (R20-R22), "submitted by N"
  - question text at clamp(40px, 4.4vw, 80px) (R26)
  - NO refresh control anywhere (R28)
  - connection indicator (R31), offline queue (R32)
  - QUESTIONS ARE SEEDED AUTOMATICALLY. questionsFor() in
    app/api/facilitate/route.ts inserts startingQuestionSet(gateId) the first
    time a block is opened to a room. This is NOT missing. Two earlier sessions
    wrongly reported it as missing because they grepped for "insert" on the
    wrong line.

## 4. WHERE THE CONTROLS LIVE. This confused three sessions.

  - THE BLOCK PAGE has the room controls: Reveal, Next question, Open the
    projected view, and the question dropdown. src/components/gtcv/RoomControlBar.tsx
  - /coach/facilitate is THE PROJECTION. It deliberately has NO controls.
    C52 decided this and D15 records Habib approving it.

So "the facilitator view has no buttons" is BY DESIGN, not a bug.

## 5. HABIB'S MODEL OF THE WORK. Build nothing that contradicts this.

  Service is the anchor. It is never a cell in a row.
  Under a service: many activities (ten or more is normal).
  Under an activity: many problems, or none.
  Under each activity: who pays, what it delivers, the assumption, what would
  disprove it — EACH of which may hold several values.

  Tool 1 lists services and their activities.
  Tool 2 puts the columns on the PROBLEMS under the anchored service.
  Tool 3 turns those into hypotheses. Then Tools 4 and 5.

  THE FIVE TOOLS EACH HAVE THEIR OWN QUESTIONS AND RUN IN ORDER (13 August).
  THE CODE DOES NOT KNOW THIS. gtcv_questions has gate_id and sort_order and
  NO TOOL. The four phase_0 questions are one flat list spanning Tools 1, 3
  and 4. Tools 2 and 5 have no questions. That is why "the first question"
  opened Tool 4's question. NOT YET BUILT. See Q25 in PROGRESS.md.

## 6. HOW TO BEHAVE, learned the hard way this week.

  - Habib tests on a real phone and a real screen. A passing unit test proves
    nothing to him. Do not report something as working because it compiles.
  - When he reports a fault, READ THE SCREENSHOT PROPERLY before answering.
    Three wrong diagnoses this week came from skimming one.
  - Grep for the EXACT words on his screen. "Run this with the room", not
    "run this in the room". One wrong preposition cost a whole exchange.
  - Do not silently remove a column or a control. Say so first.
  - Two lists at the end of every report: ready to test now with what to press,
    and not built do not test with a one line reason.
  - If you run out of room, stop cleanly and say what is left. Never send a
    completion message that is not true.

## 7. MIGRATIONS. Applied by hand in the Supabase SQL editor.

There is no exec_sql and no migration step in CI. Habib runs them.
Staging project ref: giugeygicxltwqnqlwto
Production project ref: sxsenbvaitpnumdwvxaj  (DO NOT TOUCH)

All migrations to date have been run.

## 8. WHERE TO GO NEXT IN PROGRESS.md, and nowhere else unless asked.

  "THE OPEN FAULT"                    the room mismatch above
  "Q25"                               the five tools and their questions
  "Decisions taken on Habib's behalf" every choice made for him, with reasons
  "Part O"                            the nine things that must not break

Everything before 12 August in PROGRESS.md is history. Do not read it unless a
section above sends you there.
