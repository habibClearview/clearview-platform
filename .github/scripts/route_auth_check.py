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
# getAdminClient is how almost every route written since the shared auth
# helper landed obtains a service-role client. It was missing here, so 29
# routes were invisible to this gate: they passed because they were never
# looked at, which is the failure mode a gate exists to prevent.
SERVICE_CLIENT = re.compile(r"SUPABASE_SERVICE_ROLE_KEY|getFieldSupabase|getAdminClient")

# A NARROW, STATED EXCEPTION. 13 September 2026.
#
# Two routes on this platform serve people who cannot possibly be signed in: a
# stranger on the public website answering ten questions, and a visitor joining
# the mailing list. There is no caller to authenticate, so this gate could
# never go green, and it had been failing since 4 September. A gate that is
# always red is not a gate, it is a thing people learn to scroll past, and the
# next genuine hole would have scrolled past with it.
#
# So a route may declare itself public, in one line, saying why. The exemption
# is deliberately awkward: an exact marker, on its own, with a reason after it,
# and every exempt route is printed on every run so the list stays visible and
# has to be argued for rather than accumulated.
#
# It exempts a route from THIS check only. Rate limiting, input validation and
# writing nothing outside the caller's own row are still required, and are
# still the reviewer's job to confirm.
PUBLIC_BY_DESIGN = re.compile(r"^//\s*ROUTE-AUTH-EXEMPT:\s*(\S.*)$", re.MULTILINE)

# Recognised ways a route authenticates/authorizes the caller:
#   getUser (Supabase JWT) · requesterCanViewClient / resolveFieldAdminActor
#   (role+tenant helpers) · validateFieldToken (field operator token) ·
#   isGrantActive (access-grant token + OTP) · cronAuthorised (cron secret).
AUTH = re.compile(
    r"getUser|requesterCanViewClient|resolveFieldAdminActor|"
    r"validateFieldToken|isGrantActive|cronAuthorised|"
    # requireAccess is the shared helper every engagement route goes through;
    # it resolves the caller and their rights in one place.
    r"requireAccess|"
    # loadSessionLink resolves a scoped, expiring session token server side and
    # returns null for every failure. It is the authorisation for the one route
    # that accepts writing without a login.
    #
    # resolveJoinCode is its sibling, in the same file and written to the same
    # rule: it turns a short code the room typed into the same grant, checking
    # shape, type, block, withdrawal and expiry, and answering null for every
    # failure. It is deliberately weaker on its own than a long token, so the
    # route that uses it must rate limit before reaching it. That is not
    # something this gate can see, and it is stated here so the next person to
    # add a caller knows it is required rather than optional.
    r"loadSessionLink|resolveJoinCode|loadShowcaseView"
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
    exempt = []
    for path in sorted(ROOT.rglob("route.ts")):
        raw = path.read_text(encoding="utf-8")
        code = strip_comments_and_strings(raw)
        if not SERVICE_CLIENT.search(code):
            continue
        if AUTH.search(code):
            continue
        claim = PUBLIC_BY_DESIGN.search(raw)
        if claim:
            exempt.append((str(path), claim.group(1).strip()))
            continue
        offenders.append(str(path))

    # Named every run, never silent. A gate that has been red for a fortnight
    # is a gate everybody has learned to scroll past, and an exemption nobody
    # ever reads again is the same thing more quietly.
    if exempt:
        print("Deliberately public service-role routes, each with its stated reason:")
        for f, why in exempt:
            print(f"  - {f}: {why}")
        print("")

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
