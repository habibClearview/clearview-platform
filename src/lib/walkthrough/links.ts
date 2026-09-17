// ============================================================
// WHERE THE WALKTHROUGH LIVES, AS A LINK TO SEND SOMEBODY.
//
// The public site and the platform are one deployment with two addresses.
// habibonifade.com serves the pages in the site folder without the folder
// showing in the address, so the link worth sending is
// habibonifade.com/how-i-work. On a preview deployment or a laptop that
// rewriting never happens, because it is keyed to the live public address, and
// the same page is reached at /site/how-i-work instead.
//
// Both are produced here so that no screen has to know the difference, and so
// nobody is ever handed a link that only works on the machine it was copied on.
// ============================================================
import { isProduction } from '@/lib/app-env'
import { appBaseUrl } from '@/lib/app-url'

/** The public site, as a funder would type it. */
export const PUBLIC_SITE = 'https://habibonifade.com'

function base(): string {
  if (isProduction()) return `${PUBLIC_SITE}/how-i-work`
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/site/how-i-work`
}

/**
 * THE REMOTE LIVES ON THE PLATFORM, NOT ON THE PUBLIC SITE, AND IT HAS TO.
 *
 * 17 September 2026. Habib scanned the code on the screen, signed in, and
 * ended up looking at the walkthrough on his phone instead of the remote.
 *
 * Two reasons, both the same reason. A browser keeps a sign in per address,
 * and habibonifade.com is a different address from clearview.habibonifade.com
 * as far as any browser is concerned, so a coach signed in to ClearView is a
 * stranger on the public site and always will be. And the sign in page is at
 * the front door: on the platform that is the password box, but on the public
 * site the front door is the marketing home page, so being sent to sign in
 * sent him to a page about the work rather than to a way in.
 *
 * So the square code on the screen points at the platform. The projector stays
 * on habibonifade.com where the funder sees it, the phone goes to
 * clearview.habibonifade.com where the coach is already known, and the two
 * talk over the message relay, which does not care that they are on different
 * addresses.
 */
function platformBase(): string {
  const origin = isProduction() || typeof window === 'undefined'
    ? appBaseUrl()
    : window.location.origin
  return `${origin}/site/how-i-work`
}

/** The walkthrough with nobody's name on it. */
export function genericWalkthroughUrl(): string {
  return base()
}

/** One engagement's own walkthrough. */
export function clientWalkthroughUrl(slug: string): string {
  return `${base()}/${String(slug || '').trim()}`
}

/** The phone remote for a walkthrough, on the platform where a coach signs in. */
export function remoteWalkthroughUrl(slug?: string): string {
  const b = platformBase()
  return slug ? `${b}/${String(slug).trim()}/remote` : `${b}/remote`
}

/**
 * A default link from a name. The funder's name where there is one, because
 * the link is handed to the funder, and the organisation's otherwise.
 */
export function slugify(name: string): string {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '')
}
