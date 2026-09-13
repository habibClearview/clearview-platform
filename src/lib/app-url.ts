// ============================================================
// WHERE THIS DEPLOYMENT LIVES
//
// Every letter that carries a sign-in link has to know which site the link
// should open. Getting that wrong is not a cosmetic fault: a preview or
// staging deployment that emails a link to the live site sends somebody to
// production holding a token minted somewhere else.
//
// The rule was written once inside app/api/invite-user and then needed a
// second time by the co-implementer welcome letter, which is how two copies
// of a rule start to drift. It lives here instead.
//
//   1. NEXT_PUBLIC_APP_URL wins wherever it is set.
//   2. On a Vercel deployment that is not production, the deployment's own
//      host, so a preview links to itself.
//   3. Otherwise the live site.
// ============================================================

export function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/+$/, '')
  const vercelEnv = process.env.VERCEL_ENV
  const vercelUrl = process.env.VERCEL_URL // host only, no scheme
  if (vercelEnv && vercelEnv !== 'production' && vercelUrl) return `https://${vercelUrl}`
  return 'https://clearview.habibonifade.com'
}

/**
 * A sign-in link wrapped so a mail scanner's GET cannot spend it.
 *
 * Microsoft Defender Safe Links, Mimecast and Proofpoint all fetch a link to
 * scan it before the recipient sees the message, and a single-use sign-in link
 * is spent by that fetch. The real link travels in the fragment, which a
 * browser never sends to a server, and app/welcome/page.tsx redeems it only
 * when a person presses the button.
 */
export function scannerSafeSignIn(link: string, base: string = appBaseUrl()): string {
  return `${base.replace(/\/+$/, '')}/welcome#to=${encodeURIComponent(link)}`
}
