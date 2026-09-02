// ============================================================
// ONE DEPLOYMENT, TWO SITES.
//
// clearview.habibonifade.com is the platform. habibonifade.com is the public
// website. They are the same Vercel project because running two would mean two
// deployments, two sets of environment variables and two things to keep in
// step, for one page.
//
// So the host decides what the root address means:
//
//   habibonifade.com/            ->  /site        the public page
//   clearview.habibonifade.com/  ->  /            the platform, untouched
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not touch any other path, on any
// host. A rewrite that caught more than the root would mean every route in the
// platform now depends on a middleware being right, and the failure mode of
// getting that wrong is the whole application serving the wrong page. The
// matcher below is the root and nothing else.
//
// A rewrite rather than a redirect: the visitor's address bar keeps saying
// habibonifade.com, which is the point of having the domain.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'

/** The public site's hosts. Anything else is the platform and is left alone. */
const SITE_HOSTS = new Set(['habibonifade.com', 'www.habibonifade.com'])

export function middleware(req: NextRequest) {
  // The port is stripped because a host header carries one locally and the
  // set above holds names, not addresses.
  const host = (req.headers.get('host') || '').toLowerCase().split(':')[0]
  if (SITE_HOSTS.has(host)) {
    const url = req.nextUrl.clone()
    url.pathname = '/site'
    return NextResponse.rewrite(url)
  }
  return NextResponse.next()
}

export const config = {
  // The root, and only the root.
  matcher: '/',
}
