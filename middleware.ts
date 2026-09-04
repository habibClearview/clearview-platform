// ============================================================
// ONE DEPLOYMENT, TWO SITES.
//
// clearview.habibonifade.com is the platform. habibonifade.com is the public
// site. They are the same Vercel project because running two would mean two
// deployments, two sets of environment variables and two things to keep in
// step.
//
// So the HOST decides what a path means:
//
//   habibonifade.com/score            ->  /site/score
//   habibonifade.com/                 ->  /site
//   clearview.habibonifade.com/...    ->  untouched
//
// A rewrite rather than a redirect, so the address bar keeps saying
// habibonifade.com, which is the point of having the domain.
//
// WHAT IS DELIBERATELY EXCLUDED, ON EVERY HOST.
//
//   /api        The site's own forms post there. Rewriting them into /site
//               would send them to a route that does not exist.
//   /_next      Build output. Rewriting it breaks every asset on the page.
//   /site       Already the destination. Rewriting it again would double the
//               prefix on any internal navigation.
//   anything with a dot in the last segment, which is a file: favicons,
//               images, the fonts, robots.txt.
//
// The platform is not affected by any of this: the host check fails first and
// the request passes straight through.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'

/** The public site's hosts. Anything else is the platform and is left alone. */
const SITE_HOSTS = new Set(['habibonifade.com', 'www.habibonifade.com'])

function isPassThrough(pathname: string): boolean {
  if (pathname.startsWith('/api')) return true
  if (pathname.startsWith('/_next')) return true
  if (pathname === '/site' || pathname.startsWith('/site/')) return true
  const last = pathname.split('/').pop() || ''
  return last.includes('.')
}

export function middleware(req: NextRequest) {
  // The port is stripped because a host header carries one locally and the
  // set above holds names, not addresses.
  const host = (req.headers.get('host') || '').toLowerCase().split(':')[0]
  if (!SITE_HOSTS.has(host)) return NextResponse.next()

  const { pathname } = req.nextUrl
  if (isPassThrough(pathname)) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = pathname === '/' ? '/site' : `/site${pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  // Everything except the three prefixes above, which are also checked in the
  // function itself so the two cannot fall out of step.
  matcher: ['/((?!api|_next|site).*)'],
}
