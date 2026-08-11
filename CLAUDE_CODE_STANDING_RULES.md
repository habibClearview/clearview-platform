1. Scope
Build only what the currently authorised stage specifies. Do not build ahead into later stages, even where a later stage looks trivial or where building it now looks more efficient.

Do not add features, screens, settings or options that no numbered requirement asks for.

If you believe something outside the current stage is necessary in order to complete the current stage, stop and say so. Do not proceed on that belief.

2. Existing work
Do not refactor, rename, reorganise, tidy or reformat any code you were not explicitly asked to change.

Do not modify any existing file without stating which file, which lines, and why, and receiving approval first.

Do not upgrade, downgrade, add or remove any dependency without approval.

Do not change any existing database field name, table column, page address or user visible wording.

3. Ambiguity
Where the specification is unclear, incomplete or silent, stop and ask. Do not choose.

This applies even where only one sensible option appears to exist. State the options, state which you would choose and why, and wait.

4. Technical decisions
Before writing code for a stage, state in plain English:

Which technical approach you propose.

What it costs in complexity.

What happens when it fails, including with no internet connection.

What alternatives you considered and why you set them aside.

Wait for approval before proceeding. Write for a reader who is not a developer. Do not use technical terms without explaining them in the same sentence.

5. Naming
Use the exact words given in the specification for anything a person sees or anything stored: button labels, headings, field names, page addresses, question type names.

Where the specification gives a name in quotation marks, reproduce it character for character.

Where you need a name the specification does not provide, ask.

6. Reporting
At the end of each piece of work, state:

Which numbered requirements are now complete.

For each one, how to demonstrate it, following the test written in the specification.

Which requirements remain and what blocks them.

Any decision you took that the specification did not cover.

Do not describe a requirement as complete until its written test passes. Do not describe a requirement as complete in part. It is either complete against its test or it is not.

7. Progress file
Maintain PROGRESS.md in the repository root. Update it at the end of every session and whenever a requirement is completed. It contains:

Every requirement number attempted, with status: not started, in progress, or complete.

The date each requirement was completed.

Every decision taken that the specification did not cover, with the reasoning.

Every question raised and the answer received.

Anything left unfinished, and what the next session should pick up first.

Read this file at the start of every session before doing anything else.

8. Regression
After every stage, confirm that the following still work exactly as before, and report on each by name:

The eleven blocks in the left navigation and their tables.

Every gate readiness message and counter.

The Evidence Library and its association of entries to gates.

The Session Plan, including room types and the required attendee flags.

The revision tracking on DP03 propositions.

The staging banner.

If any of these has changed, say so immediately and do not continue.

9. Data
This system holds information about real organisations and real named individuals in Nigeria, Kenya and Uganda, gathered under donor funding. Treat all of it as confidential.

Never write real client data into test files, example data, comments or logs.

Never send data to any external service that the specification has not named.

Where audio recordings are handled, they contain recorded consent and the voices of identified people. Do not build any feature that transmits, stores or processes them outside what the specification authorises.

10. When unattended
If you are running without a person available to answer, and you reach a point where these rules require you to stop and ask:

Stop the work in question.

Write the question into PROGRESS.md under a heading Questions waiting for an answer.

Move to the next requirement in the authorised stage that is not blocked by that question.

If every remaining requirement is blocked, stop entirely and write that in PROGRESS.md.

Never resolve a blocking question by choosing an answer yourself in order to keep working.
