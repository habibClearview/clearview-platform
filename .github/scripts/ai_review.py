#!/usr/bin/env python3
"""Ask Claude to review a PR diff for CRITICAL issues — and FAIL CLOSED.

Why this exists as a script instead of inline shell:

The previous shell version pasted the raw diff straight into a JSON string
(`... '"$DIFF"' ...`). Any newline or double-quote in the diff — i.e. every
real diff — produced invalid JSON, the API rejected it, and the script then
printed "APPROVED - Review unavailable". The security gate therefore passed
WITHOUT any review ever happening. That is a fail-OPEN gate.

This version:
  * builds the request body with json.dumps, so the diff is always encoded
    safely no matter what it contains;
  * treats every failure — no API key, network error, HTTP error, malformed
    response, empty answer — as BLOCKED, never APPROVED;
  * passes the gate ONLY when the model explicitly starts its answer with
    APPROVED. Anything else fails the gate.

Reads:  /tmp/pr_truncated.diff, env ANTHROPIC_API_KEY
Writes: review.txt (the comment body) and conclusion=success|failure to
        $GITHUB_OUTPUT.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

MODEL = "claude-sonnet-5"

PROMPT = (
    "You are reviewing a PR for the Clearview financial platform (Next.js 14, "
    "Supabase, TypeScript). Review this diff for CRITICAL issues only (auth "
    "gaps, data loss, financial calculation errors, SQL injection, falsy-zero "
    "bugs with || instead of ??, React state timing bugs, duplicate client "
    "creation, type mismatches between UUID and TEXT). Ignore style. Rate each "
    "issue as CRITICAL (blocks merge) or WARNING (informational). Be concise. "
    "Start your response with either APPROVED or BLOCKED.\n\nDiff:\n"
)


def set_output(key: str, value: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"{key}={value}\n")


def write_review(text: str) -> None:
    with open("review.txt", "w", encoding="utf-8") as f:
        f.write(text)


def fail_closed(reason: str) -> None:
    """Any failure to obtain a real review blocks the merge (never approves)."""
    print(f"::error::AI review could not complete — failing closed. {reason}")
    write_review(
        f"BLOCKED - The automated AI review could not run ({reason}). "
        "Failing closed so nothing merges unreviewed. A maintainer must fix the "
        "cause (for example add the ANTHROPIC_API_KEY repository secret) and "
        "re-run this check, or review the change manually before merging."
    )
    set_output("conclusion", "failure")
    # Exit 0 so the later comment step still posts; the status-check step reads
    # conclusion=failure and fails the job.
    sys.exit(0)


# ─── Reading the model's verdict ─────────────────────────────
# The model is asked to lead with APPROVED or BLOCKED, but it writes for people
# as well as for this parser: a markdown heading, bold, or a label in front of
# the word.
#
# AND THE MODEL LABELS ITS OWN VERDICT. 17 September 2026. A review that said,
# in full, "## Verdict: **APPROVED**" blocked the pull request. The letters-only
# form of that line is VERDICTAPPROVED, which does not start with APPROVED, so
# the gate could not read a verdict it had been handed in plain English and
# failed closed on its own heading. Failing closed is right; failing closed on a
# clear approval is a gate that blocks everything, which is the same as no gate
# at all.
#
# BLOCKED still wins if it comes first, and a line that merely mentions the word
# in a sentence is still not a verdict.
VERDICT_LABELS = ("VERDICT", "RESULT", "CONCLUSION", "DECISION", "REVIEW")


def read_verdict(review):
    """"success", "failure", or None when the review says neither."""
    for line in (review or "").splitlines()[:20]:
        letters = re.sub(r"[^A-Za-z]", "", line).upper()
        if not letters:
            continue
        for label in VERDICT_LABELS:
            if letters.startswith(label) and len(letters) > len(label):
                letters = letters[len(label):]
                break
        if letters.startswith("APPROVED"):
            return "success"
        if letters.startswith("BLOCKED"):
            return "failure"
    return None


def first_text_block(payload: object) -> str:
    """The model's visible answer, or empty when it never got to one.

    The content is a list of blocks and, because this model reasons first, the
    first block can be a thinking block. So every block is looked at rather
    than index nought being assumed.
    """
    blocks = payload.get("content") if isinstance(payload, dict) else None
    if not isinstance(blocks, list):
        return ""
    for b in blocks:
        if isinstance(b, dict) and b.get("type") == "text":
            text = (b.get("text") or "").strip()
            if text:
                return text
    return ""


def main() -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        fail_closed("ANTHROPIC_API_KEY repository secret is not set")

    try:
        with open("/tmp/pr_truncated.diff", encoding="utf-8", errors="replace") as f:
            diff = f.read()
    except OSError as e:
        fail_closed(f"could not read the diff: {e}")

    if not diff.strip():
        write_review("APPROVED - No reviewable code changes in this diff.")
        set_output("conclusion", "success")
        return

    # RAN OUT OF ROOM BEFORE IT SAID ANYTHING. 20 September 2026, twice on one
    # pull request. This model thinks before it answers, and on a long diff the
    # whole budget went on the thinking: the reply came back carrying one
    # redacted thinking block, no text at all, and stop_reason "max_tokens". The
    # gate did the right thing and blocked, but it blocked a clean change for a
    # reason that had nothing to do with the change.
    #
    # Raising the number once already failed to fix this, because the number was
    # never the point: any budget can be exhausted by a long enough diff, and
    # the failure looks identical each time. So the budget is larger AND the
    # script now recognises this one specific failure and asks again with more
    # room and a shorter brief, rather than reporting a fault to a person who
    # can only re-run it and hope.
    #
    # It still fails closed. A second empty answer blocks the merge exactly as
    # before. The retry removes a false alarm, never a real one.
    attempts = [
        {"max_tokens": 16000, "brief": ""},
        {
            "max_tokens": 24000,
            "brief": (
                "\n\nYour previous answer used the whole budget on reasoning and "
                "returned no verdict. Think briefly, then answer. Keep the whole "
                "answer under 400 words.\n"
            ),
        },
    ]

    payload = None
    review = ""
    last_problem = "the model returned no verdict"

    for attempt in attempts:
        body = json.dumps(
            {
                "model": MODEL,
                "max_tokens": attempt["max_tokens"],
                "messages": [{"role": "user", "content": PROMPT + attempt["brief"] + diff}],
            }
        ).encode("utf-8")

        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=body,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                payload = json.load(resp)
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:500]
            # An HTTP error is a real fault, not a budget problem. Stop here.
            fail_closed(f"API returned HTTP {e.code}: {detail}")
        except Exception as e:  # network / JSON / timeout — all fail closed
            fail_closed(f"request to the model failed: {e}")

        review = first_text_block(payload)
        if review:
            break

        # No verdict. Say precisely why, so a second failure is diagnosable.
        stop = payload.get("stop_reason") if isinstance(payload, dict) else None
        usage = payload.get("usage") if isinstance(payload, dict) else None
        if stop == "max_tokens":
            last_problem = (
                f"the model used its whole {attempt['max_tokens']} token budget "
                f"on reasoning and produced no verdict (usage: {json.dumps(usage)})"
            )
            print(f"::warning::AI review produced no verdict ({last_problem}); asking again.")
            continue
        last_problem = f"no text block in the API response: {json.dumps(payload)[:400]}"
        break

    if not review:
        fail_closed(last_problem)

    write_review(review)
    # Read the verdict robustly. The model is asked to lead with APPROVED/BLOCKED
    # but sometimes prefixes a markdown heading (e.g. "# Review: ...") or bolds
    # the verdict ("**APPROVED**"). Scan the first several non-empty lines and
    # take the FIRST whose letters-only form begins with the verdict word, rather
    # than only inspecting the first 40 characters — otherwise a genuinely
    # APPROVED review that happens to sit under a heading is misread as a failure
    # and needlessly blocks the PR. BLOCKED still wins if it appears first.
    conclusion = read_verdict(review)
    if conclusion is None:
        # Genuinely can't tell what the model decided — fail closed.
        fail_closed(f"could not read an APPROVED/BLOCKED verdict from the review: {review[:120]!r}")
    set_output("conclusion", conclusion)
    print(f"AI review conclusion: {conclusion}")


if __name__ == "__main__":
    main()
