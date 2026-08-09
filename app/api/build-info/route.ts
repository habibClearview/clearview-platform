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
// WHAT IT DISCLOSES. The commit, the branch and the Vercel environment name.
// All three are already public: the repository is the source of the commit and
// the branch, and the environment is visible in the hostname. It reads no
// database, holds no key and takes no input, so there is nothing here to
// authorise.
// ============================================================

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    // The short form is what a person reads and what a log line carries.
    commitShort: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'unknown',
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE || '',
    branch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    environment: process.env.VERCEL_ENV || 'local',
  })
}
