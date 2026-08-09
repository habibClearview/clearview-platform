// ============================================================
// Which build is this?
//
// WHY THIS EXISTS. Twice now a check has been run against a deployment, passed,
// and meant nothing, because the deployment being tested was not the one built
// from the change under test. A green result on last week's code is worse than
// no result: it is the result somebody trusts.
//
// It is also the answer to "nothing has changed", which is usually not a
// question about the code but about which address is open in the browser.
// Opening this on any deployment says exactly which commit is serving it.
//
// WHAT IT DISCLOSES, AND WHAT IT DELIBERATELY DOES NOT. The commit identifier,
// the branch and the environment name, and nothing else. Those three are
// already public: the branch is in the hostname of every preview, the
// environment is in the hostname too, and a commit identifier is an opaque
// forty character number that says nothing about what the commit contains.
//
// The commit message is NOT returned, and that is the whole point of this note.
// The first version of this route returned it, which would have published the
// subject line of every change to this private repository to anybody who typed
// the address. That is a small hole and it is still a hole, and it was put here
// by the same reflex that produced the faults this route exists to prevent:
// adding a field because it was available rather than because it was needed.
//
// It reads no database, holds no key, takes no input and writes nothing, so
// there is nothing here to authorise.
// ============================================================

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA || ''
  return NextResponse.json({
    commit: commit || 'unknown',
    // The short form is what a person reads and what a log line carries.
    commitShort: commit.slice(0, 7) || 'unknown',
    branch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    environment: process.env.VERCEL_ENV || 'local',
  })
}
