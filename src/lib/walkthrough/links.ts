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

/** The public site, as a funder would type it. */
export const PUBLIC_SITE = 'https://habibonifade.com'

function base(): string {
  if (isProduction()) return `${PUBLIC_SITE}/how-i-work`
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
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

/** The phone remote for a walkthrough. */
export function remoteWalkthroughUrl(slug?: string): string {
  return slug ? `${base()}/${String(slug).trim()}/remote` : `${base()}/remote`
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
