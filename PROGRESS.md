# Progress

No requirements started.

## Specification received so far

Part 1: Context, sections 1 to 5. Received 11 August 2026.

The numbered requirements themselves have not been received. Part 1 names them
by range only (Stage 1 is R1 to R32, Stage 2 is R33 to R39, Stage 3 is R40 to
R47, Stage 4 is R48 to R64, Stage 5 is R65 to R71, Stage 6 is R72 to R77), and
gives no text for any individual requirement and no test for any of them.

No stage has been authorised.

## Requirement status

None attempted. Nothing can be attempted until the numbered requirements and an
authorised stage are received.

## Questions waiting for an answer

Raised 11 August 2026. All three are conflicts between Part 1 and the system as
it is deployed today, verified against the staging database and the repository
rather than assumed.

### Q1. "rename" is not one of the service decisions the system allows

Section 2 lists five provisional service decisions: keep it, redesign it,
rename it, pause it, or stop it.

The deployed database allows exactly four. The check constraint on
gtcv_service_inventory.decision permits 'keep', 'redesign', 'pause', 'stop',
and nothing else. There is no 'rename'.

Section 4 says not to change any existing dropdown and its options without
asking. Adding "rename" changes one.

Options:
  (a) Add 'rename' as a fifth decision, which alters the existing constraint
      and the existing dropdown.
  (b) Treat renaming as an outcome of 'redesign' rather than a decision of its
      own, changing nothing.
  (c) Leave the five in the specification and build against the four that
      exist, which would mean the screen cannot record what Section 2 asks for.

I would choose (a), because Section 2 states the five as the method and (b)
loses the distinction between changing what a service is and changing what it
is called. But this is a change to protected existing work, so I am not
choosing it.

### Q2. An activity can exist today with no parent service

Section 2 says never allow an activity to exist without a parent service, and
never display an activity table without its parent service visible.

Today both columns on gtcv_assumptions that could hold the parent are nullable:
service_id and service_name. An activity with no service is currently a valid
row.

Enforcing the rule changes existing behaviour, and there may already be saved
activities with no service against them.

Questions:
  (a) Should the rule be enforced on new rows only, or on all rows?
  (b) What should happen to any activity already saved without a parent
      service? Options: block the screen until each is assigned; show them
      under a holding heading until assigned; or leave them and enforce only
      going forward.

I have not chosen, and I have not inspected any client's saved rows to count
them, because that is client data and the question can be answered without it.

### Q3. What happens to the existing session page at /session/[token]

Section 3 says the participant page is at /room. Section 4 says the existing
/join page and room code mechanism remain unchanged.

Neither section mentions /session/[token], which exists today and is the page a
participant reaches after entering a room code at /join. /room and
/coach/facilitate do not exist yet.

Options:
  (a) /room is a new page and /session/[token] stays exactly as it is.
  (b) /room replaces /session/[token], and /join sends people to /room instead.

I would choose (a), because Section 4 protects the room code mechanism and (b)
changes where that mechanism sends people. But the specification is silent, so
I am not choosing.

## Decisions taken that the specification did not cover

None. No build work has begun.

## Where the protected items live, recorded for the Section 8 regression check

Verified 11 August 2026, so that later sessions can check these by name without
searching again.

  "Phase 0 is not closed yet"      src/components/gtcv/PhaseZeroWorkspace.tsx:662
  "... with no budget holder"      src/components/gtcv/PhaseZeroWorkspace.tsx:452
  "... has no decision"            src/components/gtcv/PhaseZeroWorkspace.tsx:664

The message Section 4 quotes as "0 of 2 meet the 5 and 3 rule" was not found by
that wording anywhere in the repository. It may be phrased differently on
screen. This is not a question blocking any requirement, but the exact current
wording needs establishing before Section 8 can be honestly reported against.

## What the next session should pick up first

Read this file and CLAUDE_CODE_STANDING_RULES.md. Then check whether the
numbered requirements and an authorised stage have been received. Do not begin
build work until both exist, and until Q1, Q2 and Q3 are answered, since all
three sit underneath Stage 1.
