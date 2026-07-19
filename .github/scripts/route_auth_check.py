#!/usr/bin/env python3
"""Fail the build if any app/api route obtains a service-role Supabase client
(which BYPASSES row-level security) without authenticating the caller.

This is the exact class of bug the security audit found: a route that talks to
the database with the service-role key — so RLS never applies — but never checks
who is calling, opening a cross-tenant hole.

The check is deliberately more structural than a plain grep:

  * Comments (// ... and /* ... */) and the *contents* of string / template
    literals are stripped first. So an auth marker sitting in a comment or a
    string can't satisfy the gate, and a mention of the service key in a comment
    can't cause a false failure.
  * Routes that reach the service client through a helper (getFieldSupabase)
    are detected too — not only routes that name SUPABASE_SERVICE_ROLE_KEY
    directly.

It remains a heuristic: it proves a recognised auth check is *present*, not that
it is wired correctly. CodeRabbit and human review stay the judge of
correctness. What it guarantees is that the zero-auth case cannot merge.
"""
import re
import sys
from pathlib import Path

ROOT = Path("app/api")

# Signals that a route acquires a service-role client (RLS bypassed):
#   SUPABASE_SERVICE_ROLE_KEY — created inline in the route
#   getFieldSupabase          — the shared helper that returns a service client
SERVICE_CLIENT = re.compile(r"SUPABASE_SERVICE_ROLE_KEY|getFieldSupabase")

# Recognised ways a route authenticates/authorizes the caller:
#   getUser (Supabase JWT) · requesterCanViewClient / resolveFieldAdminActor
#   (role+tenant helpers) · validateFieldToken (field operator token) ·
#   isGrantActive (access-grant token + OTP) · cronAuthorised (cron secret).
AUTH = re.compile(
    r"getUser|requesterCanViewClient|resolveFieldAdminActor|"
    r"validateFieldToken|isGrantActive|cronAuthorised"
)


def strip_comments_and_strings(src: str) -> str:
    """Remove // and /* */ comments and the contents of '..', ".." and `..`
    literals, leaving real code tokens. Good enough for a marker check; not a
    full TypeScript parser."""
    out = []
    i, n = 0, len(src)
    while i < n:
        two = src[i:i + 2]
        if two == "//":
            j = src.find("\n", i)
            i = n if j == -1 else j
        elif two == "/*":
            j = src.find("*/", i + 2)
            i = n if j == -1 else j + 2
        elif src[i] in "'\"`":
            quote = src[i]
            i += 1
            while i < n:
                if src[i] == "\\":
                    i += 2
                    continue
                if src[i] == quote:
                    i += 1
                    break
                i += 1
        else:
            out.append(src[i])
            i += 1
    return "".join(out)


def main() -> int:
    if not ROOT.exists():
        print(f"OK — no {ROOT} directory to check.")
        return 0

    offenders = []
    for path in sorted(ROOT.rglob("route.ts")):
        code = strip_comments_and_strings(path.read_text(encoding="utf-8"))
        if SERVICE_CLIENT.search(code) and not AUTH.search(code):
            offenders.append(str(path))

    if offenders:
        print("::error::Service-role API route(s) with NO authentication marker found.")
        print("A route that obtains a service-role Supabase client bypasses RLS and MUST")
        print("authenticate + authorize the caller. Use a helper from src/lib/auth/")
        print("(e.g. requesterCanViewClient / resolveFieldAdminActor / getUser).")
        for f in offenders:
            print(f"  - {f}")
        return 1

    print("OK — every service-role route references an authentication check.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
