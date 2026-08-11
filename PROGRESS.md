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

R1 to R32: all built. None yet demonstrated on staging against the written
tests, because the branch has not been merged and deployed. See STATUS.md for
the live position and the end-of-stage report for what each test needs.

Q11, the build banner, resolved itself: no existing file needed changing. See
the section below, which is kept because it records what was checked.

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

Each of these was taken rather than waited on, under the instruction of 11
August 2026 to finish a requirement and record the concern rather than stop.

### D1. Q4 contradicted itself, and the reading that breaks nothing was taken
The answer to Q4 said both that "/join keeps its code box and sends people to
/room" and that "/join itself is untouched". Both cannot be true: /join today
sends people to /session/[token], so making it send them to /room would be
touching it.

Taken: /join is left exactly as it is, character for character, and /room
takes a code itself when the browser has not joined a room. Nothing that works
today changes, and somebody who types a code at either address gets to a room.

The code is not resolved twice. /room calls resolveJoinCode and
loadSessionLink, the same two functions /api/session-join uses, so the rules
about withdrawal, expiry, grant type and block cannot be tightened in one
place and forgotten in the other. It also shares their rate limit KEYS
deliberately, so two doors onto one code share one budget rather than giving a
guesser twice the tries.

### D2. The screens keep themselves current by asking, not by being told
The approved approach was the database's own push service. It is not used, and
the reason is in "The push channel, opened and then closed" below: a browser
holding only the public key was receiving messages from it.

Instead every screen asks the server what has arrived — the Participant Page
every second and a half, the Facilitator View every second and a half, the
room feed in the block view every five seconds. No button is pressed and no
page is reloaded, which is what R8, R27 and R29 require. R27 rules out "a
refresh button, an automatic timed reload, or a manual reload" by name; this
is none of the three, because nothing reloads. I record it plainly because it
is not the mechanism that was approved, and if you want a live socket instead
it is a stage of its own now that the channel question has an answer.

### D3. Two of the four Clearing the ground questions have no home column
R23 writes the agreed value to "the table field". gtcv_assumptions has no
column that "if the grant stopped tomorrow, how likely is it that someone
would still pay" or "signal or story" belongs in. gtcv_service_inventory does
have homes for both DP01 judgement questions.

Taken: where a question names a column, the agreed value writes there. Where
it names none, the value and the full distribution are still stored on the
question, so nothing is lost and the value can still be pressed to see how the
room answered. The two Clearing the ground judgement questions are in that
position. Tell me which columns they should write to and it is a small change.

### D4. Whether a question is named can no longer be changed once it is answered
R19 says the facilitator can change it "before opening it" and does not say
what happens afterwards. The route refuses the change once any answer exists,
because turning an anonymous question into a named one would put names on
answers people gave on the understanding that there would be none.

### D5. Merging does not overwrite the row it merges into
R21 says a pending row can be merged into an existing row and does not say
what happens to the existing wording. The existing row is left as it is, and
the submissions are marked as merged into it. The count of people who said the
same thing survives, which is what makes R22's "submitted by 4" mean anything.

### D6. Participant connection is counted, and kept away from the answer counter
Instructed on 11 August 2026: show participant connection state separately,
never mixed into the answer counter. A new table, gtcv_room_presence, records
when each device last asked what was open. The Facilitator View shows "N
devices in the room" beside the connection indicator, and the counter beside
the question is only ever answers. A device dropping off the network must not
read on a projector as a person who has finished answering.

### D7. The Refresh button's removal came with something to replace it
R28 removes the button. R27 says the screen must keep itself current. Removing
the button on its own would have left the room feed frozen, which would break
something that works today. So the same change added a five second re-read of
the list only, which replaces what is on screen only where it has actually
changed, so a coach reading a sentence is not interrupted.

### D8. An offline answer to a question that has since closed is refused
R32 says an answer submitted with no connection is delivered when the
connection returns, with nothing lost. The three guards say a submission to a
question that is no longer open is refused. Where a phone is out of signal long
enough for the room to move on, those two meet, and the guard wins: the answer
is refused and the participant is told once, plainly, rather than having it
counted against a question they were not answering. R32's own test passes,
because in it the question is still open.

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

## The push channel, opened and then closed

THIS IS THE ONE THING IN THIS STAGE YOU SHOULD READ TWICE.

On 11 August 2026 the check finally ran. The container could reach the
database host this time, where the earlier attempt could not, and the result
was not the one hoped for.

    subscribing as a visitor holding only the public key...
      subscription status: SUBSCRIBED
      control subscription status (service key): SUBSCRIBED
    control: 3 message(s) reached the service key subscription.
    RESULT: 3 message(s) REACHED THE PUBLIC KEY.
      gtcv_questions INSERT: {}
      gtcv_submissions INSERT: {}
      gtcv_room_state INSERT: {}

The control worked, so this run proves something. A browser holding only the
public key — the key that is in every copy of the site — received a message
for every write to all three room tables.

WHAT DID AND DID NOT LEAK. The contents did not come with them: every payload
arrived empty, so the words people typed and the scores they gave stayed
inside. What leaked was that a write happened, to which table, and when. That
is enough to tell a stranger that a workshop is running and when each answer
lands. Under Section 9 that is information about real organisations and real
named individuals, and it should not have left.

WHAT WAS DONE. The three tables were removed from the publication, in
supabase/migrations/2026_08_11_stage1_close_the_push_channel.sql, and the
migration was applied to staging. Nothing subscribes to that channel: both new
screens take everything through a server route holding the elevated key, so
removing it broke nothing. The publication entries were added by the Stage 1
migration earlier the same day, in the expectation that the screens would use
them, and they never did — so this undoes something from this stage rather
than something that already existed and worked.

Re-running the check afterwards reports nothing arriving at either key. That
run on its own proves nothing, because with the tables out of the publication
nobody receives anything and the control is silent for a known reason. The
proof is the earlier run, which had a working control and showed the leak.

ALSO CHECKED, DIRECTLY, on the same day: the public key is refused outright on
all four room tables over the ordinary interface, before row level security is
even reached.

    gtcv_questions      401  permission denied for table gtcv_questions
    gtcv_submissions    401  permission denied for table gtcv_submissions
    gtcv_room_state     401  permission denied for table gtcv_room_state
    gtcv_room_presence  401  permission denied for table gtcv_room_presence

TO RE-OPEN IT LATER. Adding a table back to the publication re-opens exactly
what was found here, so it should not be done without deciding first what a
holder of the public key is allowed to learn.

## The push channel check, which could not be run at first

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

## The state of staging, corrected 11 August 2026

The earlier entry here said engagement_clients was EMPTY. THAT WAS WRONG. The
query had been blocked by the container's network settings and the failure was
read as an empty result. Three engagements exist:

    11111111-1111-1111-1111-111111111111   Demo Foods Ltd
    client-ikore                           Ikore
    client_1786340570857                   GtCV Demo Client

Stage 1 is demonstrated against GtCV Demo Client, as instructed. No further
test client has been created, and the throwaway engagement made for the earlier
control test is gone: the list above is the whole of the table.

scripts/check-push-channel.mjs used to create a throwaway engagement of its
own, on the same mistaken belief. It now writes against GtCV Demo Client and
removes only what it wrote.

The Stage 1 tables and columns are applied to staging and were confirmed
present by direct query: gtcv_questions, gtcv_submissions, gtcv_room_state,
gtcv_room_presence, and the columns agreed_value, agreed_distribution,
merged_into_row_id, room_size, scale_min and scale_max.

## The nine checks, run 11 August 2026 on pull request 252

Eight passed: row level security gate, route auth gate, validate migration, the
write paths must actually work, dependency audit, react hooks gate, semgrep.

One failed: AI Code Review. It needs ANTHROPIC_API_KEY, which is deliberately
not provided. Treat this check as permanently unavailable. Do not read its log,
do not fix it, do not raise it again.

staging was 133 commits ahead of main, so main is stale. Recorded, no action.

## The Section 8 regression check, run 11 August 2026

Checked by reading the code, not assumed. Every item found by name.

  The eleven blocks in left navigation, and their tables
    Clearing the ground        Clearing the ground
    DP01 Service Reality       Service inventory
    DP02 Customer Clarity      Customer segments and the adoption test;
                               Problem prioritisation; Before you go out: the
                               conversation rules; Customer conversation
                               capture; What the conversations add up to
    DP03 Value Proposition     Proposition builder
    DP04 Viability Model       Cost, break even and pricing
    DP05 Market Entry          Message testing; Pipeline
    DP06 Identity and Partners Partner map
    DP07 Pilot and Learn       Pilot capture
    DP08 Scale Pathway         Channel logic
    DP09 Readiness             Commercial readiness
    Handover                   The five independence tests

  Gate readiness messages and counters
    "Phase 0 is not closed yet"   PhaseZeroWorkspace.tsx:662, unchanged
    "... with no budget holder"   PhaseZeroWorkspace.tsx:452, unchanged
    "... have no decision"        PhaseZeroWorkspace.tsx:664, unchanged
    "X has to be signed off before this one opens."
                                  gtcv-gates.ts, gateShutBecause, unchanged
    "0 of 2 meet the 5 and 3 rule"  STILL not found by this wording. Carried
                                  forward unresolved, as agreed.

  Evidence Library, and entries associated to gates
    EvidenceLibraryPanel.tsx filters on dp_id, new entries default to the gate
    being viewed, and the gate can be changed per row. Unchanged.

  Session Plan, room types and required attendee flags
    SessionPlanner.tsx still holds the six room kinds with their required
    roles, and still warns when a required attendee is not ticked. Unchanged.

  Revision tracking on DP03 propositions
    PropositionBuilder.tsx still carries revision_count, the "Revision N"
    badge and "Record revision". Unchanged.

  The staging banner
    EnvBanner, drawn by app/layout.tsx on every page including the two new
    ones. Unchanged, and the amendment to R25 requires it to stay.

## What the next session should pick up first

Read this file and CLAUDE_CODE_STANDING_RULES.md, then STATUS.md.

R1 to R32 are built and on the branch claude/stage1-room-capture. Nothing has
been demonstrated on staging against the written tests, because the branch is
not merged. Merging it and running the tests on GtCV Demo Client is the next
piece of work, and the report at the end of the stage says what each test
needs.

Read "The push channel, opened and then closed" above before touching
anything to do with live updating.
