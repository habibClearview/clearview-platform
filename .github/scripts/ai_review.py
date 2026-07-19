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

    body = json.dumps(
        {
            "model": MODEL,
            "max_tokens": 2000,
            "messages": [{"role": "user", "content": PROMPT + diff}],
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
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = json.load(resp)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:500]
        fail_closed(f"API returned HTTP {e.code}: {detail}")
    except Exception as e:  # network / JSON / timeout — all fail closed
        fail_closed(f"request to the model failed: {e}")

    try:
        review = payload["content"][0]["text"].strip()
    except (KeyError, IndexError, TypeError):
        fail_closed(f"unexpected API response shape: {json.dumps(payload)[:400]}")

    if not review:
        fail_closed("the model returned an empty review")

    write_review(review)
    # Only an explicit APPROVED passes. BLOCKED — or any unrecognised opening —
    # fails the gate.
    conclusion = "success" if review.upper().startswith("APPROVED") else "failure"
    set_output("conclusion", conclusion)
    print(f"AI review conclusion: {conclusion}")


if __name__ == "__main__":
    main()
