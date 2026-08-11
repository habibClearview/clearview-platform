# Progress

## Specification received so far

Part 1: Context, sections 1 to 5. Received 11 August 2026.
Part 2: Stage 1, requirements R1 to R32. Received 11 August 2026.

Stage 1 is authorised. No other stage is authorised.

## Requirement status

R1 to R32: not started. Awaiting approval of the technical approach under
rule 4, and answers to Q4 to Q10 below.

## Questions answered

### Q1. "rename" is not one of the service decisions the system allows
Answered 11 August 2026: add 'rename'.
Not yet built. See "Decisions taken" below for why it has not been built during
Stage 1.

### Q2. An activity can exist today with no parent service
Answered 11 August 2026: an activity that has no parent service should be put
somewhere it can be moved to a service from, but an activity must have a parent
service.
Not yet built, for the same reason as Q1.

### Q3. What happens to the existing session page at /session/[token]
Answered 11 August 2026: keep both, and follow the new instruction as closely
as possible while flagging what may not work well for the platform.

### Flag carried forward
The gate message quoted in Section 4 as "0 of 2 meet the 5 and 3 rule" is still
not found by that wording anywhere in the repository. Answered 11 August 2026:
it may become clear once all stages are posted; keep flagging if not. Carried
forward, unresolved.

## Questions waiting for an answer

Raised 11 August 2026 against Stage 1.

### Q4. How does /room know which room it is showing? (blocks R5, R6, R7, R8)
R5 gives the participant page the address /room, with nothing after it. Section
4 says the existing /join page and room code mechanism remain unchanged, and
today /join sends a participant to /session/[token], where the token in the
address identifies the session.

/room as written carries no such identifier, so a participant opening it cannot
be told which engagement, block or question they are answering.

Options:
  (a) /join keeps its code box and sends the participant to /room, with the
      session held in the browser after the code is accepted.
  (b) /room carries the identifier in the address, for example /room?s=TOKEN.
  (c) /room shows its own code box when it does not yet know the session.

I would choose (a), because it leaves /join and the code mechanism untouched as
Section 4 requires, and keeps the address exactly "/room" as R5 requires. I am
not choosing it.

### Q5. R25 and R31 contradict each other (blocks R25, R31)
R25 says the Facilitator View shows only five things: the question, the
counter, the answers as cards, the timer, and the three buttons. R31 says a
connection indicator is displayed at all times and visible without scrolling. A
connection indicator is not one of the five.

R25 also says no build banner. Section 4 separately says not to alter the
staging banner. Whether hiding the staging banner on one screen counts as
altering it is not stated.

Options:
  (a) R31 wins: the connection indicator is a sixth element on the Facilitator
      View, and the staging banner is hidden there.
  (b) R25 wins literally: no connection indicator, which fails R31.
  (c) R31 wins for the connection indicator, and the staging banner stays,
      which fails R25's "nothing else" test.

I would choose (a). I am not choosing it.

### Q6. What is the agreed value, and which field does it write to? (blocks R2, R23)
R23 says the agreed value from a score or classify question writes to the table
field. It does not say what the agreed value is when six people give six
different answers.

Options for a score question: the median; the mean; the most common value; or a
value the facilitator types after seeing the distribution.

Options for a classify question: the option with most votes; or the
facilitator's choice after seeing the split.

I would choose the facilitator typing or choosing it after the reveal, because
the method treats the distribution as the discussion and the single value as a
decision the room reaches rather than an arithmetic result. I am not choosing.

### Q7. What counts as "near identical"? (blocks R22)
R22 groups near identical submissions into one pending row. The test has four
devices submitting "similar wording" and expects one row with a count of four.
The specification does not define how alike two answers must be.

Options:
  (a) Exact match after ignoring case, spacing and punctuation. Predictable,
      but "farmer training" and "training for farmers" stay separate.
  (b) A similarity measure with a threshold. Catches more, and will sometimes
      merge two things the room meant to keep apart.
  (c) No automatic grouping: the facilitator merges, which R21 already allows.

I would choose (a), because a wrong merge destroys a contribution and the
facilitator can still merge by hand under R21, whereas an unwanted split costs
one click. I am not choosing.

### Q8. What does the Facilitator View show for a block with no questions? (blocks R4, R24)
R24 puts "Run this with the room" at the top of every block. R4 defines
question sets for two blocks only and says the others must show none without
error. R25 describes the Facilitator View as showing the current question,
which will not exist for the other nine blocks.

Options:
  (a) The button appears on every block; on a block with no questions the
      Facilitator View opens and says so in a sentence you would need to give
      me the wording for.
  (b) The button appears only on the two blocks that have questions, which
      reads against R24's "every block".

I would choose (a), and would need the exact sentence from you under rule 5. I
am not choosing.

### Q9. Who sets the timer's length? (blocks R30)
R30 says the timer can be started, paused and reset. Its test uses a two minute
timer. It does not say whether two minutes is fixed, whether the facilitator
types a length, or whether the length is stored on the question.

I would let the facilitator set it at the moment of starting, defaulting to two
minutes. I am not choosing.

### Q10. Which name shows when scores tie? (blocks R18)
R18 shows which participant gave the highest and the lowest score on a named
question. If three people all gave the highest score, the specification does not
say whether to show all three, the first to answer, or something else.

I would show all of them. I am not choosing.

## Decisions taken that the specification did not cover

None affecting the product.

One point of process, recorded because it affects what gets built and when: the
answers to Q1 (add 'rename') and Q2 (an activity must have a parent service)
are approved changes, but neither is among requirements R1 to R32. Rule 1 says
to build only what the currently authorised stage specifies and not to build
ahead. So neither has been built during Stage 1. Both are waiting to be told
which stage they belong to, or to be told explicitly that they are in scope now.

## Where the protected items live, recorded for the Section 8 regression check

Verified 11 August 2026.

  "Phase 0 is not closed yet"      src/components/gtcv/PhaseZeroWorkspace.tsx:662
  "... with no budget holder"      src/components/gtcv/PhaseZeroWorkspace.tsx:452
  "... has no decision"            src/components/gtcv/PhaseZeroWorkspace.tsx:664
  "0 of 2 meet the 5 and 3 rule"   not found by this wording

## What the next session should pick up first

Read this file and CLAUDE_CODE_STANDING_RULES.md. Stage 1 is authorised but not
started. Check whether the technical approach has been approved under rule 4
and whether Q4 to Q10 have been answered. Do not write code for Stage 1 until
both are true.
