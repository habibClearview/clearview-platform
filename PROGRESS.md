# Progress

## Specification received so far

Part 1: Context, sections 1 to 5. Received 11 August 2026.
Part 2: Stage 1, requirements R1 to R32. Received 11 August 2026.
Amendments to R5 and R25, and answers to Q4 to Q10. Received 11 August 2026.

Stage 1 is authorised. No other stage is authorised.

## Amendments to the specification, which take precedence over the original wording

**Amendment to R5.** A personal link may carry an identifying value in the
address. On first opening, that value is consumed, stored in the browser, and
removed from the address, so that from then on the address reads exactly /room.
The remembering mechanism must be built now so it can hold both the session and
the person, even though only the session is used in Stage 1.

**Amendment to R25.** "Nothing else" has two exceptions: the staging banner and
the connection indicator required by R31. The staging banner stays on every
screen including the Facilitator View, because the risk of real client
information being entered into a staging copy is worse than the visual cost.
Everything else in R25 stands: no navigation, no sidebar, no other content.

## Requirement status

R1 to R32: not started. The approach is approved. Waiting on agreement to the
build banner proposal below, which is the last thing outstanding before code.

## Questions answered

### Q1. "rename" is not one of the service decisions the system allows
Answered 11 August 2026: add 'rename'. Then further answered the same day: do
not build it now. It is not needed to run the first workshop and it would
change an existing dropdown, which Section 4 protects. It will be issued as
Stage 1b once Stage 1 has passed its tests.

### Q2. An activity can exist today with no parent service
Answered 11 August 2026: an activity must have a parent service, and one
without a parent should sit somewhere it can be moved to a service from. Then
further answered the same day: do not build it now. It waits for Stage 1b.

### Q3. What happens to the existing session page at /session/[token]
Answered 11 August 2026: keep both. Follow the new instruction as closely as
possible and flag what may not work well for the platform.

### Q4. How does /room know which room it is showing?
Answered 11 August 2026: approved as proposed. /join keeps its code box and
sends people to /room, with the session remembered in the browser. /join itself
is untouched.

Condition: whatever is built must be able to carry a person identity, not only
a session identity, because Stage 2 introduces permanent personal links that
identify a specific person for the whole engagement. See the amendment to R5.

### Q5. R25 and R31 contradict each other
Answered 11 August 2026 by the amendment to R25 above. The connection indicator
stays. The staging banner stays.

### Q6. What is the agreed value, and which field does it write to?
Answered 11 August 2026: approved as proposed. The facilitator sets it after
the reveal, because the number is a decision the room reaches and the
distribution is the discussion that produces it.

Two conditions:
  - Never pre-fill the field with an average, a median or any calculated value.
  - Show the distribution beside the input while the facilitator types, so the
    decision is made in sight of the spread.

### Q7. What counts as "near identical"?
Answered 11 August 2026: group automatically only where the text matches
exactly after normalising for capitals, punctuation and extra spaces. Nothing
looser is automatic.

Where two entries are similar but not identical, offer a suggested merge that
the facilitator confirms or rejects. Never merge on similarity alone. A wrong
merge destroys a distinct activity and nobody notices; a missed merge costs one
click.

### Q8. What does the Facilitator View show for a block with no questions?
Answered 11 August 2026: "Run this with the room" appears on every block. On a
block with no question set it is present but disabled, with this text beside it,
word for word:

    "No questions have been set up for this block yet."

This matches how R40 handles the disabled gate button, so the behaviour is
consistent across the platform.

### Q9. Who sets the timer's length?
Answered 11 August 2026: the facilitator sets it in the Facilitator View at the
moment of use. A Question record may carry a suggested length in minutes, which
pre-fills the timer when that question opens, and the facilitator can always
override it. If no suggested length is set, the timer starts empty and the
facilitator enters a number.

### Q10. Which name shows when scores tie?
Answered 11 August 2026: show every tied name, never one chosen arbitrarily. If
more than three tie at the highest or lowest score, show three names followed by
"and 2 others", with the correct count.

### Flag carried forward
The gate message quoted in Section 4 as "0 of 2 meet the 5 and 3 rule" is still
not found by that wording anywhere in the repository. Answered 11 August 2026:
it may become clear once all stages are posted; keep flagging if not. Carried
forward, unresolved.

## Approved technical approach

Approved 11 August 2026, with two conditions held to:
  - On reconnection, re-read everything from the database before showing
    connected, so the projector never shows stale answers as current.
  - On the participant side, write to the phone's own storage first and send
    second, so a submission survives the page being closed.

## Approved changes to existing files

  src/components/gtcv/SessionRoom.tsx, removing the Refresh button (R28).
    Approved 11 August 2026.

  The file that renders the block title, adding "Run this with the room" (R24).
    Approved in principle 11 August 2026, on condition the file and lines are
    named before being changed. Not yet named.

  src/components/BuildStamp.tsx.
    NOT approved. Do not add a condition to a component two protected pages
    depend on. See the proposal below.

## Questions waiting for an answer

### Q11. The build banner on the Facilitator View (blocks R25)
Raised 11 August 2026. Proposal put; awaiting agreement.

It turns out no existing file needs changing, and no shell needs escaping,
because the build banner is not drawn by a shell at all. Findings, verified:

  app/layout.tsx is the only layout in the whole of app/. There are no nested
  layouts and no templates. It draws EnvBanner, which is the staging banner,
  and it draws it on every page.

  BuildStamp is drawn by no layout. It is rendered individually by three page
  components: src/components/coach/CoachDashboard.tsx line 2590,
  src/components/generic/GenericDashboard.tsx line 1009, and app/field/page.tsx
  lines 476 and 584.

So a new route at app/coach/facilitate/page.tsx inherits app/layout.tsx and
nothing else. It gets the staging banner, which the amendment to R25 requires
it to keep. It never renders CoachDashboard, so the build banner never appears.

Files involved: one new file, app/coach/facilitate/page.tsx. No existing file
is read, changed or moved to achieve this. BuildStamp.tsx is not touched.

## Decisions taken that the specification did not cover

None. No build work has begun.

## Where the protected items live, recorded for the Section 8 regression check

Verified 11 August 2026.

  "Phase 0 is not closed yet"      src/components/gtcv/PhaseZeroWorkspace.tsx:662
  "... with no budget holder"      src/components/gtcv/PhaseZeroWorkspace.tsx:452
  "... has no decision"            src/components/gtcv/PhaseZeroWorkspace.tsx:664
  "0 of 2 meet the 5 and 3 rule"   not found by this wording
  Staging banner                   src/components/common/EnvBanner.tsx, drawn by app/layout.tsx

## Before production, not before Stage 1

Moved here 11 August 2026. None of these blocks Stage 1. The instruction to do
the gate decision triggers now was withdrawn.

  S36, S37, S38, S39. Triggers refusing update and deletion of a signed gate
  decision; append-only evidence with a superseded marker; reopening recorded.
  Verified 11 August: gtcv_gate_signoffs has no triggers at all, so a signed
  decision can currently be edited or deleted. It does record who and when
  (recorded_by_user_id, signed_at, created_at, signature_method).

  S42. A test pinning the staging banner, so it cannot be removed unnoticed.
  EnvBanner is drawn by app/layout.tsx on every page and is driven by the
  environment, so it cannot appear in production today.

  S44. Restore a backup into a scratch project and confirm it works. Never
  done. An untested backup is a belief.

  S30 to S33. The position on audio storage, reach, consent and retention.
  Habib writes this; it is not mine to invent. Nothing touching audio is to be
  built until he does.

## Known unknowns

Things nobody can now establish, recorded so that silence is never mistaken
for assurance.

  S41. Whether production data was ever copied into staging before 11 August
  2026 cannot be determined from here. I have never done it. That is the whole
  of what can be said.

  S24, S21 to S23. What the push channel actually delivers to a browser
  holding only the public key is STILL UNKNOWN. See the section below.

## The push channel check, which could not be run

Attempted 11 August 2026 and inconclusive. scripts/check-push-channel.mjs
subscribes holding only the public key, writes a row with the service key, and
reports anything that arrives.

The public key subscription returned CHANNEL_ERROR, which looks like the
desired answer and is not one. The control subscription, using the service key
which is authorised for everything, returned CHANNEL_ERROR too, and the next
line gave the reason:

    Host not in allowlist: giugeygicxltwqnqlwto.supabase.co.
    Add this host to your network egress settings to allow access.

Both keys failed for the same reason and it has nothing to do with permissions.
The script exits with code 3 in this case, distinct from both pass and fail, so
this can never be read later as a pass.

To resolve, run from a machine that can reach the database host:

    SUPABASE_URL=https://giugeygicxltwqnqlwto.supabase.co \
    SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
    node scripts/check-push-channel.mjs

Consequence for the build, decided rather than waited on: the Participant Page
is built so that it never depends on the public key reading these tables. It
receives everything through the server route holding the elevated key and
subscribes to nothing directly. That way the unanswered question stops carrying
any weight.

## Dependencies, recorded 11 August 2026, not to be fixed this stage

Ten advisories, all rated high. Nine have a fix available; one does not.

  xlsx (SheetJS)  NEEDS A REAL DECISION LATER, ON ITS OWN.
    Prototype pollution, and a pattern that can hang on hostile input. No fix
    available. Used directly to read client workbooks, so it parses files
    people send in. That is what makes it different from the other nine.
    Fixing means leaving the npm copy for SheetJS's own distribution.

  next            Information exposure in the dev server; cache confusion on
                  the image route. Fix is a framework upgrade, so it touches
                  everything. Do not attempt during Stage 1.
  postcss         Cross-site scripting via unescaped output; file read via a
                  crafted CSS comment. Carried by next.
  undici          Response desynchronisation and cross-user disclosure via
                  caching. Carried by next.
  js-yaml         Crafted input can force very heavy CPU work.
  nanoid          Can loop indefinitely on a zero or negative size.
  brace-expansion Crafted input can force very heavy CPU work.
  glob            Command injection in its command-line tool, which is never
                  run here.
  eslint-config-next, @next/eslint-plugin-next
                  Development only, never shipped to a browser.

Last reviewed 9 August 2026, the last commit touching package.json.
Do not run npm audit again during Stage 1.

## The state of staging, found 11 August 2026

engagement_clients is EMPTY. There are no engagements on the staging database
at all. Nothing in Stage 1 can be demonstrated until one is seeded, and the
first attempt to run the push channel check failed for exactly this reason
before the network problem was reached.

## The nine checks, run 11 August 2026 on pull request 252

Eight passed: row level security gate, route auth gate, validate migration, the
write paths must actually work, dependency audit, react hooks gate, semgrep.

One failed: AI Code Review. It needs ANTHROPIC_API_KEY, which is deliberately
not provided. Treat this check as permanently unavailable. Do not read its log,
do not fix it, do not raise it again.

staging was 133 commits ahead of main, so main is stale. Recorded, no action.

## What the next session should pick up first

Read this file and CLAUDE_CODE_STANDING_RULES.md. Stage 1 is authorised, the
approach is approved, and Q4 to Q10 are answered. The only thing outstanding is
agreement to the build banner proposal recorded as Q11. Once that is agreed,
build R1 to R32 and report against the tests as written.
