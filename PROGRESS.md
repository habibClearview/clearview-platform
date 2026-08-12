# Progress

## Specification received so far

Part 1: Context, sections 1 to 5. Received 11 August 2026.
Part 2: Stage 1, requirements R1 to R32. Received 11 August 2026.
Amendments to R5 and R25, and answers to Q4 to Q10. Received 11 August 2026.
Part 3: Stage 2, requirements R33 to R39. Received 11 August 2026.
Stage 1 Correction, requirements C1 to C89. Received 12 August 2026.

The correction WINS wherever it and the original disagree. It is authorised as
a single body of work, not split into stages, and is built in the seven groups
Part M sets out, reporting at the end of each group.

Stage 1 is authorised and built. Stage 2 is AUTHORISED and built: Q12 to Q18
were all answered on 11 August 2026 and the answers are recorded under each
question below.

Ordering, decided 11 August 2026: "Proceed with Stage 2 now. I will run the
Stage 1 tests tomorrow. If any Stage 1 test fails, fixing it takes priority
over Stage 2 work."

Standing instruction added the same day: on hitting a contradiction between
requirements, do not stop the whole build. Record it here under questions
waiting for an answer, move to the next requirement not blocked by it, and
keep going. Stop entirely only if every remaining requirement is blocked.

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

## WHERE THE BUILD HAS TO GO. Read this before pushing anything.

Habib's staging is this address, and no other:

    https://clearview-platform-git-claude-coach-deploy-33cc44-clearview2026.vercel.app

It is served by the branch **claude/coach-deploy-corrections-2kj6q4**. That is
the address he has open, the one his bookmark points at, and the one every
screenshot he sends comes from.

SO EVERY PUSH GOES TO BOTH:

    git push -u origin staging
    git push origin staging:claude/coach-deploy-corrections-2kj6q4

Pushing to staging alone is the same as not shipping. It has now happened
three times: he opens his address, the work is not there, and the fault looks
like the feature when it is only the branch. Do not let it happen a fourth
time. Check what the address is actually serving before saying anything is
live:

    curl -s <address>/api/build-info

## Requirement status

R1 to R32: all built and live at Habib's address. He runs the written tests.

R33 to R39: all built except the email half of R36, which is not built and is
reported as failing. See "Stage 2, requirement by requirement" below.

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

### CHANGE TO THE APPROVED APPROACH, accepted 11 August 2026

The approach as approved named the database's own push service as the way
every screen would keep itself current. IT IS NOT USED. The reason is the leak
recorded under "The push channel, opened and then closed" below: a browser
holding only the public key was receiving a message for every write to all
three room tables, and the tables were taken out of the publication to stop it.

What replaced it: every screen asks the server what has arrived. The
Participant Page and the Facilitator View every second and a half, the room
feed in the block view every five seconds. Nothing reloads and no button is
pressed, so R8, R27 and R29 are met on behaviour, and R27's three named
failures — a refresh button, an automatic timed reload, a manual reload — are
none of them.

Accepted the same day: "Polling instead of push. Accepted. You were right to
close the leak and right to tell me the mechanism changed. The requirements are
about behaviour and the behaviour is met."

Both original conditions still hold. The Facilitator View re-reads everything
before it says connected, because every read is a whole read. The Participant
Page writes to the phone's storage before it sends.

If a live socket is wanted later it is a stage of its own, and it starts by
deciding what a holder of the public key is allowed to learn.

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

### Q12. R39 reverses a decision R18 required, and it is about consent
ANSWERED 11 August 2026. Identity is stored.

The room is told, on the participant's own screen, before any anonymous
question opens, in these words:

    Your name is not shown on screen and is not shown to anyone in this room,
    but it is recorded in the system.

That sentence lives in src/lib/stage2-personal-links.ts as ANONYMOUS_NOTICE and
a test pins it word for word. It is the consent, not decoration: do not soften
it, shorten it, or hide it behind a link.

WHO MAY SEE THE IDENTITY: "nobody, in any interface, ever. Not the
facilitator, not a report, not an export. It exists only so a submission has an
owner in the record. If a route or an export would reveal it, that is a fault
and you tell me."

How that is held rather than hoped for: the identity is in its own column,
gtcv_submissions.identity_party_id, which is WRITTEN in exactly one file and
READ in none. A test walks every file under app, src and scripts and fails if
any of them names the column outside the participant route, if the participant
route ever puts it in a select, or if anything reads gtcv_submissions with a
bare star select. participant_name is untouched from Stage 1 and stays empty on
an anonymous question, so what interfaces read has nothing in it to leak.
Raised 11 August 2026. THE MOST IMPORTANT QUESTION IN STAGE 2.

R18 said: "Where anonymous, no names appear anywhere... confirm no name appears
on any screen OR IN ANY STORED RECORD VISIBLE TO THE FACILITATOR."

Stage 1 was built to the strongest reading of that. On an anonymous question
the name is not written at all. The comment in the route says why: "there is
no name in the row, so there is none to leak later."

R39 now says: "Submissions record who made them... regardless of whether the
question is displayed as anonymous."

Those can be reconciled — stored but never displayed — and that is plainly
what R39 intends. But it is a real change, not a clarification, and it should
be made deliberately:

  A room is told a question is anonymous. Under R39 it is not anonymous; it is
  unattributed on screen. The record knows. Under Section 9 these are real
  named individuals in Nigeria, Kenya and Uganda, and the question they are
  answering anonymously is usually the one they would not answer with their
  name on it.

Whichever way this goes I will build it exactly. What I need is:
  a) Confirmation that identity is stored on anonymous questions.
  b) Whether the participant is told. A room told "anonymous" that later
     learns the record kept their name is a worse outcome than either honest
     position.
  c) Who may ever see it, and by what route. "No interface displays it" today
     is not the same as never, and a database export is an interface.

### Q13. R36 needs an email service and the specification has not named one
ANSWERED 11 August 2026: "Do not send any email. Build the copy-for-messaging
route now. R36 fails its email half until I name a service, and report it that
way. Do not install or configure anything that sends mail."

Done. Copy for messaging is built. No mail service is installed, configured or
called, and no dependency was added. R36 IS REPORTED AS FAILING until a
service is named.
Raised 11 August 2026.

Checked, not assumed: NOTHING in this platform sends email. The only mention
anywhere is a placeholder button that pops up the words "In production: this
sends a notification email to the CEO via the Resend API." No mail service is
installed, configured or called.

So R36's email route means adding an external service and sending it client
names and their permanent personal links. Rule 9 says: never send data to any
external service that the specification has not named. Stage 2 does not name
one.

I need: which service, and your authorisation to send names and links to it.
Or: build the copy-for-messaging route now and leave email until you have
decided, in which case R36 fails its own test until then and I will say so.

### Q14. R33 is mostly already built, in a list Section 4 protects
ANSWERED 11 August 2026: "One new box on the list that already exists. Do not
build a second list of the same people. Leave the existing email wording
exactly as it is."

Done. One column, engagement_parties.mobile, and one box labelled Mobile beside
the others. "Email they log in with" is untouched, character for character.
Raised 11 August 2026.

"Who is on it, and settings" already holds a list of people, in
engagement_parties, with these boxes on screen today:

    Role · Name · Job title · Organisation · Email they log in with

R33 asks for name, role, organisation, and either an email address or a mobile
number. Four of the five exist. The only thing missing is the mobile number.

So the honest reading is that R33 is one new box on the list that is already
there, not a second list. Building a second would put two lists of the same
people on one page, which is the fault you have already had to point out once.

Two things I will not choose:
  a) Confirm it extends the existing list rather than creating a new one.
  b) The existing box says "Email they log in with", which is about a login.
     Under R34 it becomes the address a personal link is sent to, which is not
     a login. Changing that wording is changing user-visible wording, which
     Section 4 protects. Leave it, or change it to what?

### Q15. What does "permanent" mean at the end
ANSWERED 11 August 2026: preference approved. A personal link stops when the
engagement is closed. Revocation remains the immediate route. The word
permanent is amended to mean FOR THE LIFE OF THE ENGAGEMENT.

Built against the engagement state that already exists: status 'complete' is
closed. 'paused' is NOT, because a paused engagement is one that resumes and
killing eight people's links on a pause would be a destruction dressed up as a
rule. No new column was needed. Tested both ways.
Raised 11 August 2026. A session link lasts twelve hours because a session is
an afternoon. A personal link lasts twenty-six weeks by design.

Does it ever stop working on its own? An engagement ends. A link that still
opens a client's room a year later, sitting in somebody's WhatsApp on a phone
that has since been sold, is a standing key to their engagement.

My preference, not chosen: it stops when the engagement is closed or archived,
and revocation stays the immediate route. But you decide, because "permanent"
is your word and I will not quietly put a limit on it.

### Q16. What is a guest submission called, and where does it show
ANSWERED 11 August 2026: the word is "Guest". It appears only in the
facilitator's pending list. It never appears on the projector.

Built as a boolean, gtcv_submissions.is_guest, deliberately separate from the
identity column: the facilitator may know an answer came from a visitor,
because that changes what it is worth, and may never know which visitor. A
boolean can say the first and cannot say the second.
Raised 11 August 2026. R38 says a guest submission arrives "marked as a guest
submission". Rule 5 says exact words for anything a person sees.

    What is the word on screen? "Guest"? Something else?
    Where does it appear — on the answer card on the projector, only in the
    pending rows the facilitator works through, or both?

A word on the projector beside somebody's answer is a public statement that
they are not on the team, in front of the room.

### Q17. What does the personal link look like
ANSWERED 11 August 2026: approved as proposed. /room?p=... — short, and gone
from the address after the first open.
Raised 11 August 2026. The amendment to R5 says the link carries an
identifying value in the address, which is consumed on first opening and
removed so the address then reads exactly /room.

I need the parameter, because it is visible in the address bar and people will
read it aloud. My proposal, not chosen: /room?p=... — short, meaningless, and
gone after the first open.

### Q18. What does a revoked person see
ANSWERED 11 August 2026, word for word:

    This link is no longer open. Please speak to your facilitator.

Nothing else. No explanation, no removal language. Pinned by a test, which also
fails if the words "removed" or "revoked" ever appear in it.
Raised 11 August 2026. R37's test is that a revoked device can no longer
submit. It does not say what that person sees.

Mid-session, in a room, somebody's phone stops working. Silence is cruel and
"you have been removed from this engagement" on a projector-lit face is worse.
My preference, not chosen: it returns to the join screen, saying only that the
link is no longer open. You decide the sentence.

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
SETTLED 11 August 2026. Leave them where they are.

R23 writes the agreed value to "the table field". gtcv_assumptions has no
column that "if the grant stopped tomorrow, how likely is it that someone
would still pay" or "signal or story" belongs in. gtcv_service_inventory does
have homes for both DP01 judgement questions.

Where a question names a column, the agreed value writes there. Where it names
none, the value and the full distribution are stored on the question itself, so
nothing is lost and the value can still be pressed to see how the room
answered.

Decided: "Leave them where they are. Storing the agreed value and distribution
on the question is fine and nothing is lost. Do not add columns to
gtcv_assumptions. That table is protected and this is not worth breaching it
for."

So NO COLUMN IS TO BE ADDED TO gtcv_assumptions FOR THIS. If a later stage
wants those two judgements in the table, that is a decision to take on its own
and not a tidy-up of this one.

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

### D9. On a score or classify question the choice IS the submit button
R9 asks for "an input appropriate to its type, and a submit button". A collect
question has boxes and a Send button beneath them, which is plainly that. A
score question has the numbers on the scale as buttons, and pressing one sends
it; a classify question has the options as buttons the same way.

Taken because on a phone, in a room, one press is the appropriate input for
choosing one value, and a second press to confirm a choice that R11 lets you
change freely until the reveal would be a step with nothing behind it. If you
would rather see an explicit Send on those two, it is a small change.

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

## Resolved security findings

A list kept so that anyone reviewing this later can see what was found and what
was done, without reading the whole file. Nothing is removed from it once it is
on it.

### SF1. The push channel delivered to the public key
    Found      11 August 2026
    Closed     11 August 2026
    Severity   Real but narrow. What leaked was the fact and timing of every
               write to the three room tables, never the contents. Under
               Section 9, when a room is answering is information about real
               organisations and real named individuals.
    Cause      The Stage 1 migration added gtcv_questions, gtcv_submissions and
               gtcv_room_state to the supabase_realtime publication, in the
               expectation that the screens would subscribe to them. They never
               did.
    Proved by  scripts/check-push-channel.mjs, with a working control: the
               service key subscription received 3 messages and the public key
               subscription received 3 as well.
    Fixed by   supabase/migrations/2026_08_11_stage1_close_the_push_channel.sql
               removing all three from the publication. Applied to staging the
               same day. Nothing subscribed, so nothing broke.
    Follow on  The approved technical approach changed as a result. See "CHANGE
               TO THE APPROVED APPROACH" above.
    Re-opening Adding any of those tables back to the publication re-opens
               exactly this. Do not do it without first deciding what a holder
               of the public key is allowed to learn.

### SF2. rate_limit_counters was granted to the public key with no policy
    Found      11 August 2026
    Closed     11 August 2026
    Severity   Nothing was exposed: row level security with no policy denies
               everything. But the protection rested entirely on one switch,
               with select, insert, update, delete and truncate granted
               beneath it, and emptying the counters removes the limit that
               stops one device flooding a room.
    Fixed by   supabase/migrations/2026_08_11_rate_limit_counters_lockdown.sql
    Verified   The public key is refused with zero grants remaining. The
               service key still reads it, so the limiter works.

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

## Eight of the nine checks do not run on a pull request into staging

Found 11 August 2026, while reading the results on pull request 253. Not asked
about. Raised because it is the same shape of hole as S48, which you made first
priority: work aimed at staging goes in without being checked.

WHAT WAS EXPECTED. Nine checks, as on pull request 252.

WHAT ACTUALLY RAN on pull request 253. One.

    The write paths must actually work            RAN, passed

WHAT DID NOT RUN, and why. Each of these is triggered by a pull request into
main and by nothing else, and pull request 253 goes into staging.

    Row level security gate      .github/workflows/rls-check.yml
    Route auth gate              .github/workflows/route-auth-check.yml
    React hooks gate             .github/workflows/hooks-check.yml
    Semgrep                      .github/workflows/semgrep.yml
    Dependency audit             .github/workflows/dependency-audit.yml
    Validate migration           .github/workflows/validate-migration.yml
    AI Code Review               .github/workflows/ai-review.yml

Each says, in its own words:

    on:
      pull_request:
        branches: [main]

Only smoke-write-paths.yml lists staging as well, which is why it is the one
that ran. hooks-check.yml runs on a PUSH to staging, so it catches a merge but
never the pull request that proposes one.

WHY IT MATTERS. Everything reaches staging through a pull request into staging.
main is 133 commits behind. So in practice these seven gates are running on a
branch nothing merges into, and the branch everything merges into has one gate.
The row level security gate and the route auth gate are exactly the two that
would catch the kind of fault this stage could introduce.

RESOLVED 11 August 2026. Authorised: "Add staging to the trigger on all seven
workflows. Seven gates defending a branch nothing merges into is not
protection." Done, one line in each of the seven files and nothing else
touched:

    branches: [main]   became   branches: [main, staging]

hooks-check.yml also has a push trigger on staging. That was left exactly as it
was; only its pull_request line changed.

AI Code Review now runs on a pull request into staging as well.

### THREE OF THE GATES ARE GREEN WITHOUT HAVING CHECKED ANYTHING

Found 11 August 2026, on the run this change produced. All ten checks reported
success. Three of them succeeded by not running.

  Every table in the public schema must have row level security
      SKIPPED. Its own log: "Row level security was not checked. Set the
      SUPABASE_URL repository variable and the SUPABASE_SERVICE_ROLE_KEY
      secret to turn this gate on." then "Skipped. Without credentials this
      cannot tell a safe schema from an unchecked one." Exit 0.

  Sign in and drive the real write paths
      SKIPPED, the same way. It needs STAGING_SUPABASE_URL, STAGING_BASE_URL,
      STAGING_SUPABASE_ANON_KEY and STAGING_SUPABASE_SERVICE_ROLE_KEY. None
      are set. "Skipped. Without credentials this cannot tell a working
      deployment from an unchecked one." Exit 0.

  Validate migration
      RAN AND EXAMINED NOTHING. Its log reads "Found SQL files:" with nothing
      after it, on a pull request that adds four migration files. Its trigger
      fired correctly; its own file finding is what came up empty.

Both skips say plainly in their own logs that they are skips, which is better
than most gates manage. The problem is that a skip and a pass are the same
green tick from outside, and a green tick is what anyone actually looks at.

WHAT RAN AND GENUINELY CHECKED SOMETHING
  Every service-role API route must authenticate the caller
      "OK — every service-role route references an authentication check."
  No hook may be called conditionally               ran
  Semgrep scan                                      ran, REPORT ONLY
  npm audit (high+)                                 ran, REPORT ONLY
  test (the unit tests, inside the AI review workflow)   ran
  AI Code Review                                    passed; not investigated
                                                    further, on instruction

Report-only means those two cannot fail, whatever they find. Worth knowing
before treating them as gates.

WHAT WAS DONE ABOUT IT, and what was not. The row level security check was run
BY HAND from here against staging, holding the service key, and it passed:
"OK — every table in the public schema has row level security enabled." So the
thing the gate would have checked has been checked, this once, by a person who
can forget to do it next time.

Nothing else was done. Setting repository variables and secrets is not mine to
do, and one of the four is a service role key, which is the most dangerous
value in the platform. Recorded and handed over.

Also noticed while reading ai-review.yml: it builds its diff with
"git diff origin/main...HEAD". On a pull request into staging that compares
against main, which is 133 commits behind, so the diff it reviews is not the
diff being merged. That matters if the key is ever turned on.

The lint, the type check and the tests were all run here before every push, so
the code has been through the same checks by hand. That is not the same as a
gate, because a gate cannot be forgotten.

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


## Stage 2, requirement by requirement

Built means the code exists and its own tests pass. Complete means the written
test passes, and none of these are complete because Habib runs the tests.

  R33  BUILT. One box, Mobile, on the party list that was already in "Who is
       on it, and settings". No second list. The existing email wording is
       untouched, character for character.

  R34  BUILT. One permanent link per person, issued from the party list. It
       carries a value in the address, which is exchanged once for the signed
       cookie and then removed, so the address then reads exactly /room. The
       cookie has carried empty slots for a person since Stage 1, so nothing
       issued then had to be re-issued now.

  R35  BUILT. It follows from R34 and needed nothing of its own: the page has
       asked the server what is open every second and a half since Stage 1, and
       a personal link only means it never has to ask for a code.

  R36  HALF BUILT, AND THE OTHER HALF IS REPORTED AS FAILING.
       Copy for messaging: built. It puts a whole message on the clipboard.
       Send by email: NOT BUILT. Nothing in this platform sends email, and
       nothing was installed or configured that could. R36's written test says
       "Send one by each route. Fails if: only one route exists." By that test
       R36 FAILS, and it fails until a mail service is named.

  R37  BUILT. Withdrawing one person's link, scoped to that person and that
       engagement, so nobody else is touched. It bites immediately because the
       participant route re-checks the grant ON EVERY REQUEST, not only when
       somebody first opens their link. That re-check is the only expensive
       thing in Stage 2 and it is the whole of R37: a browser handed a cookie
       an hour ago cannot be reached to take it back.

  R38  BUILT. /join, the room code, the QR code and /session/[token] are all
       untouched — not one line changed. A code submission is marked is_guest
       and shows the word "Guest" in the facilitator's pending list only.

  R39  BUILT. Every submission records who made it, on anonymous questions as
       well. It is in its own column, written in one file and read in none, and
       a test walks every file under app, src and scripts and fails if anything
       reads it. The room is told, on their own screen, before they answer.

## Where Stage 2's identity rule is enforced

Recorded because a comment is not enforcement and the next person needs to know
the test exists before they try to "fix" it.

  src/__tests__/stage2-personal-links.test.ts
    "identity_party_id is never read by anything"

  It fails if:
    any file outside app/api/room/route.ts names the column;
    app/api/room/route.ts puts the column inside a select;
    anything reads gtcv_submissions with a bare star select, which would carry
    the identity out without ever naming it.

  If you are here because that test is failing, the answer is almost certainly
  not to change the test.


## The correction, C1 to C89. Group 1 in progress.

### What was found before writing anything

The hierarchy the correction describes already has tables. What it did not have
is the joins that make it a hierarchy, or any way to say "removed but not
destroyed".

    Service    gtcv_service_inventory      already the record C1 describes
    Activity   gtcv_assumptions            already carries service_id
    Problem    gtcv_problem_owner_budget   carried nothing at all

So Part A is joining up what exists, not building a second set of tables. That
matters: new tables would mean either migrating live engagement data, which is
the riskiest thing anybody could do to a record gathered under donor funding,
or leaving two versions of the truth.

### Counted before deciding, on staging, 12 August 2026

    8   activities with no service
    6   problem rows, none of them attached to an activity

Those numbers are why nothing here is enforced with a NOT NULL constraint. A
constraint would refuse eight rows that already exist, to enforce a rule about
rows not yet created. C2's refusal of an orphan is enforced where creation
happens instead, and the eight appear in the parked bucket where they can be
seen and pulled into a service. Nothing is deleted and nothing is guessed at.

### Group 1, built so far

  Migration applied to staging, seven columns, all nullable, nothing renamed:
    gtcv_service_inventory.service_state    C1
    gtcv_assumptions.parked_at              C15
    gtcv_assumptions.decision               C29, C30
    gtcv_problem_owner_budget.activity_id   C3, C25, C27
    gtcv_problem_owner_budget.parked_at     C15
    gtcv_problem_owner_budget.decision      C29
    gtcv_room_state.current_service_id      C5

  src/lib/service-anchor.ts, with 22 tests. The hierarchy, the three removal
  actions, the parked bucket, No problem stated, and the counter.

### The one design decision worth stating plainly

A problem stated in Tool 1 IS a row in gtcv_problem_owner_budget from the
moment it is typed. Tool 1 shows its parent's children rather than holding its
own copy of the words.

That is what makes C25 and C27 true rather than approximately true. Two copies
kept in step is a thing that works until the day it does not, and the day it
does not is in front of a room.

Likewise, problems hang off the ACTIVITY and carry no service of their own. So
C14's move carries them by not touching them. A model where they also knew
their service is a model where a move can strand them.

## Questions waiting for an answer on the correction

### Q19. C43 contradicts a guard you required in Stage 1
Raised 12 August 2026. Recorded rather than stopped for, under the standing
instruction of 11 August.

Stage 1, at your instruction, refuses "any submission to a question that is not
currently open, including one that has been closed or revealed."

C43 says a participant part way through an answer when the facilitator advances
"is allowed to finish and submit. Their answer is accepted against the question
they were answering."

The correction wins, so C43 is what gets built. What I need is the LIMIT, and I
will not choose it: for how long after a question closes is a late answer still
accepted, and does a revealed question still accept one? A reveal is the moment
the room reads the numbers off the wall, and an answer arriving after that
changes a distribution people have already discussed.

Proposal, not chosen: accept against the previous question only while the
participant had it on screen when it closed, and never after that question was
revealed. Group 3 work, so there is time.

### Q20. C29's service level decision, against a column that already exists
Raised 12 August 2026. gtcv_service_inventory.decision already exists with the
values keep, redesign, pause and stop, and is the DP01 decision. C29 wants a
service level Tool 5 decision alongside the item level ones, whose values are
carry, kill and pause.

Are those the same decision under two names, or two decisions? I have not
written to that column and will not until you say, because it is an existing
column with existing meaning and Section 4 protects it.

### Q21. C31, portfolio means which portfolio
Raised 12 August 2026. "across the whole portfolio, all services combined."
Taken as all services in THIS engagement, because a figure combining several
clients' services would be meaningless to a room and would put one client's
count in front of another. Say if you meant across engagements.

## Existing files the correction needs changed, named and awaiting approval

Rule 2. None of these has been touched.

  src/components/gtcv/PhaseZeroWorkspace.tsx
    C4, C5, C20, C21, C22, C25, C26, C30. The service selector at the top, the
    service name on all five tools, the "Problem it solves" column, and the
    counter. This is the file that also holds the three gate readiness messages
    Section 4 protects; those lines are not being touched and will be confirmed
    by name afterwards.

  src/components/gtcv/ServiceInventoryTable.tsx
    C1, C8, C19. Services as records that can be added and given a state.

  src/components/gtcv/ProblemScoringTable.tsx
    C25, C26. Tool 2 fed by Tool 1, with the parent service and activity beside
    every row.

  src/components/gtcv/SessionRoom.tsx
    C45. Removing the room opening controls and the live feed, leaving the
    Session Plan and attendance.

  app/room/page.tsx and app/api/room/route.ts
    C33 to C43. Mine from Stage 1, but named here so the list is complete.

Everything else in Group 1 needs no existing file, which is why it is built
already.


## Correction group 1, where it actually stands, 12 August 2026

BUILT AND ON YOUR ADDRESS
  C1   Service record, with current / redesigned / new.
  C2   An orphan activity is refused, in the rules and in the route.
  C3   A problem belongs to one activity. Zero problems is a valid answer.
  C4   The service is at the top of all five tools, through scrolling, from ONE
       sticky bar rather than five headings that each stop working when
       somebody scrolls.
  C5   The selector. Changing it changes what every tool below shows.
  C7   The parked bucket, visible in the block with its own area.
  C8   A service added at any time.
  C17  A service can start empty and be filled afterwards.
  C18  Activities pulled into a service from anywhere, including the bucket.
  C19  The state changeable at any time.
  C30  The five figures for the service.
  C31  The same five for every service in this engagement, from the same rows
       so they cannot disagree. Never across engagements.
  C32  They move on their own, no reload.
  C43  The rule and the sentence, in the library with tests. Not yet wired into
       the participant page — that is group 3.

C12 TO C16 ARE NOW ON THE SCREEN, on Tool 1.

  What was there before: ONE button, marked Delete, which deleted. So the only
  way to get a row off the table was to destroy it, and the room's choice was
  between keeping a wrong row forever and losing a real one for good.

  What is there now: Park as the press that needs no thought, and behind one
  more press, Move to another service and Delete. Delete asks first and the
  question uses the word. C16 is held in the route as well as on the screen: a
  removal that names no action parks, whatever sends it.

  Tools 2 to 5 still have their original single Delete. They are the next
  piece of work, along with C9 to C11's add-a-row in each tool.

NOT STARTED
  C6            the service name on the participant page
  Group 2       C20 to C29, the problem column and the carry forward

## The three gate readiness messages, confirmed by name after touching the file

Checked 12 August 2026, after the only change made to PhaseZeroWorkspace.tsx.

  "Phase 0 is not closed yet."        present, unchanged
  "... with no budget holder"         present, unchanged
  "... have no decision."             present, unchanged

The change to that file was NINE LINES ADDED and nothing removed or altered:
one import, one comment, one component. The diff is in the commit and can be
read in full in under a minute.

## Part O, checked 12 August 2026 after group 1

  C82  personal links                 untouched
  C83  withdrawn link sentence        present, word for word
  C84  consent sentence               present, word for word
  C85  identity column unreadable     its test still passes, 22 of them
  C86  Guest in the pending list only untouched
  C87  join page, code, QR, token     untouched
  C88  no refresh control             none found anywhere in the room or
                                      facilitation interface
  C88  push channel still closed      0 of the three room tables are in the
                                      publication, confirmed by query
  C89  offline queue                  untouched


## Correction group 2, done 12 August 2026

C20  "Problem it solves" is ADDED to Tool 1. "What it delivers" keeps its
     heading and its meaning and was not touched — confirmed by name after the
     change. They are two different questions: what the buyer receives, and
     what it is for.

C21  An activity holds as many problems as it needs. The cell is a list with
     "+ another problem", not a box.

C22  An activity with none says "No problem stated", in a marked amber state,
     rather than showing an empty cell that looks like a gap nobody reached.

C23  Such an activity is ABSENT from Tool 2, not present with empty fields.

C24  It is still counted, so Tool 5 resolves it with everything else rather
     than it being auto-killed at the moment the gap appears.

C25  Stating a problem in Tool 1 IS creating the Tool 2 row. There is no
     second step and no copy.

C26  Tool 2 gained a first column showing the parent service and activity on
     every row. Rows written before Tool 1 fed that table say "Not yet
     attached to an activity" rather than being hidden or guessed at.

C27  Editing in one place changes the other, because there is one row and both
     tools read it.

C12 to C16 are now on Tool 1 AND Tool 2. A problem parks or is deleted and
never moves between services, because it has no service of its own.

## Decision taken: tools 3, 4 and 5 keep their single Delete

Recorded 12 August 2026 rather than choosing quietly.

C12's own test reads "Open the actions on ANY ACTIVITY", and C7 scopes the
parked bucket to "activities and problems". Tools 3, 4 and 5 hold hypotheses,
signals and decisions, which are none of those things: a hypothesis has no
service to be moved to, and parking one would need a second bucket that C7
does not describe.

So the three actions are on the two tools that hold the hierarchy, and the
other three keep the button they had. If you want Park on those as well, say
so and it is a small change plus three columns.


## Q22. A C26 replacement was referred to but never arrived
Raised 12 August 2026. The instruction said "including the C26 replacement I
just sent". Nothing came with it and nothing since. So C26 is built to the
original wording in the correction document: Tool 2 shows the parent Service
and the parent Activity beside every Problem row. If the replacement said
something else, send it and it is a small change to one column.

## New order of work, 12 August 2026

The correction's Part M had the participant page as group 3 and the block as
group 4. Both were brought forward, on the reasoning that the hierarchy and
the two screens are what Habib can judge and everything else he has to take on
trust.

  Now       Parts A and C, controls in all five tools, service in tools 3 to 5
  Then      Part E the participant page, Part F the block as the single place
  After     Part H, Part I, Part D, Part J, Part K

## Two lists at the end of every report, from 12 August 2026

Instructed after a session was spent testing screens that were not built. The
fault was mine: it was in the report, buried in prose, where it was missed.
Every message now ends with two separate lists, last, where they cannot be
missed:

    Ready to test now, with what to do and what to see.
    Not built yet, do not test, with a one line reason.

## What I got wrong about tools 3, 4 and 5

I decided they kept their single Delete, reasoning from C12's test naming an
activity and C7's bucket naming activities and problems. That was too narrow:
C28 already said those tools "operate on activities and problems within a
Service, with the Service visible throughout", and I read past it. Corrected
12 August 2026 — all five tools now Park, Move and Delete the same way.

## A regression I made and caught in the same hour

C45 removes the room opening controls from "Sessions and rooms". Doing only
that would have left NO way for anybody to join a room at all, because the
code and the QR lived nowhere else. C44 says they belong in the block, so they
moved there in the same change. Recorded because a half-applied C45 would have
broken joining completely and looked like C44 failing.

## Decisions taken on Habib's behalf, 12 August 2026

Taken under the instruction to choose rather than stop, and listed for review.

D-C1. C47 against C52. C47 wants "Back to the table" to return to the exact
block. C52 says the projected view carries NO controls at all, and C52 is the
later and more specific rule. CHOSEN: the projection carries no controls; it
opens in a second tab and the block tab stays open behind it, so returning to
the table is switching tabs. If you want a Back button on the projection, that
is C52 loosened and I would rather you said so.

D-C2. C26 had a replacement I never received. CHOSEN: built to the original
wording — Tool 2 shows the parent Service and parent Activity on every row.

D-C3. Resend is now named, so R36's email half is built. It sends ONLY the
recipient's address, their name and their link, and nothing else. Where
RESEND_API_KEY is absent it refuses loudly rather than reporting a success that
did not happen. RESEND_API_KEY and RESEND_FROM are not set on staging, so the
button will say email is not switched on until you set them.

D-C4. C56 with R18 and R19. authors_visible is the switch that now decides
whether any name appears, and is_named is kept in step with it rather than
dropped, because the Stage 2 consent sentence and R18 are built on is_named.
Two columns, one meaning, never allowed to disagree.

D-C5. C58 and C62 are enforced by NOT WRITING, not by hiding. Where authors
are hidden, no name is written into the permanent record at all, so no future
report or export can reveal one.

## Not built, and why. 12 August 2026.

C28 filtering  The columns exist on all five tools. No row has a service yet,
               so filtering would show an empty screen on a live engagement.
               Needs a back-fill decision I would not take unasked.
C47            See D-C1.
Part J, C64 to C66   Collapsing rows. Not started.
Part K, C67 to C70   The canvas rendering decisions. Not started.

## C26 REPLACEMENT. RECEIVED 12 AUGUST 2026, ON THE THIRD SENDING.

Recorded verbatim because it was lost twice. It replaces C26 entirely.

  Every tool displays a HIERARCHY on screen, not labels on rows. The service is
  anchored at the top, ALONE, as the frame, and is never a cell in a row.
  Beneath it sits every activity in that service, each as its own row or group;
  a service commonly has ten or more. Beneath each activity sit the problems
  that activity solves; one activity may solve several problems, or none.
  THERE IS NO COMBINED "SERVICE AND ACTIVITY" COLUMN ANYWHERE.

  Tool 2 shows: the service at the top, then each activity of that service,
  then under each activity its problems, and for each problem the columns who
  experiences it, who is accountable, who controls the budget, what it costs
  them not to solve it, and the release mechanism.

  Test: a service with three activities; the first has two problems, the second
  one, the third none. Tool 2 shows the service once at the top, all three
  activities beneath it, two problems under the first, one under the second,
  and the third showing no problems.
  Fails if: service and activity appear combined in one column, or the display
  suggests one activity per service.

  Tool 3 follows the same hierarchy. A hypothesis is: this service, made up of
  these specific activities, solves this problem or set of problems, for this
  type of client. Tool 3 shows which activities and which problems each
  hypothesis is built from.

WHAT I BUILT BEFORE THIS ARRIVED WAS EXACTLY THE FAULT IT NAMES: a first column
headed "Service and activity" on every Tool 2 row. That is being removed.

C28 as amended 12 August 2026: do NOT hide unassigned rows. Tools 3 to 5 show
the anchored service and its rows, and any row with no service appears in the
Parked area exactly as Tools 1 and 2 already do. Nothing disappears for lack of
a service.

C47 REMOVED 12 August 2026. C52 wins; the projection carries no controls and
returning to the table is switching tabs.
