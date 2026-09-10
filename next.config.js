/** @type {import('next').NextConfig} */

// ---------------------------------------------------------------------------
// Security response headers.
//
// These are sent on every response so a browser enforces sensible protections:
// no clickjacking, no MIME sniffing, HTTPS only, a tight referrer policy, and a
// Content-Security-Policy that limits where scripts/styles/data can come from.
//
// The app loads NO external scripts, fonts, or stylesheets (all styling is
// inline React styles; fonts are system fonts), so the policy can be fairly
// tight. The one thing the browser talks to besides our own origin is Supabase
// (REST + realtime websocket), so that host is allowed in connect-src.
//
// 'unsafe-inline' (styles/scripts) and 'unsafe-eval' (scripts) are still needed:
// the UI uses inline style attributes throughout and Next.js injects inline
// hydration scripts. Tightening these to nonces is a worthwhile follow-up but a
// larger change; even with them, this CSP still blocks framing, restricts the
// network destinations, and forbids plugins/base-tag hijacking.
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
let supabaseOrigin = ''
try {
  supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : ''
} catch {
  supabaseOrigin = ''
}
const supabaseWs = supabaseOrigin ? supabaseOrigin.replace(/^https:/, 'wss:') : ''

// Include the exact project host (from env) AND the *.supabase.co wildcard as a
// safety net, so realtime/REST keep working even if the env value is absent at
// build time.
// ---------------------------------------------------------------------------
// THE CALL WAS BLOCKED BY OUR OWN HEADER. 10 September 2026.
//
// The first time a real browser opened a session room it said "could not
// establish signal connection: Failed to fetch". Nothing was wrong with the
// LiveKit key, the secret or the address. connect-src listed only ourselves and
// Supabase, so the browser refused to open the WebSocket to the media service,
// exactly as instructed.
//
// Every test until then had been against the server, and a server has no
// Content Security Policy. That is the gap: a policy can only be checked from
// the browser's side, so it is now checked in src/__tests__/browser-policy.test.ts.
// ---------------------------------------------------------------------------
const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || ''
let livekitWs = ''
let livekitHttp = ''
try {
  if (livekitUrl) {
    const u = new URL(livekitUrl)
    livekitWs = `wss://${u.host}`
    // The client checks the room over https before it opens the socket, so both
    // schemes are needed. Allowing only the socket still fails, and fails with
    // the same unhelpful "Failed to fetch".
    livekitHttp = `https://${u.host}`
  }
} catch {
  livekitWs = ''
  livekitHttp = ''
}

const connectSrc = [
  "'self'",
  supabaseOrigin,
  supabaseWs,
  'https://*.supabase.co',
  'wss://*.supabase.co',
  livekitHttp,
  livekitWs,
  // The media service answers from regional hosts under the same domain, and
  // relays through TURN on others. The exact host from the environment is above;
  // this is the safety net, the same shape as the Supabase wildcard, so a
  // region change is not an outage nobody can explain.
  'https://*.livekit.cloud',
  'wss://*.livekit.cloud',
].filter(Boolean).join(' ')

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  // A recording is fetched with the sign in on the request and then played from
  // the browser's own memory, which is a blob: address. Without this it falls
  // through to default-src and the player is silently refused.
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  `connect-src ${connectSrc}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  'upgrade-insecure-requests',
].join('; ')

// ---------------------------------------------------------------------------
// Production, or a non-production (staging / preview) build?
//
// This mirrors src/lib/app-env.ts EXACTLY so the two never disagree. We use it
// to add a "noindex" header on staging: because we deliberately make the
// staging link openable without a Vercel login (see docs/STAGING_AND_ROLLBACK.md),
// this stops Google and other search engines from ever listing the test copy.
//
// We only add noindex when we can POSITIVELY tell it is non-production. With no
// signal at all we assume production and add nothing — so the real live site is
// never accidentally hidden from search. On Vercel each environment builds with
// its own variables, so Production builds with VERCEL_ENV=production (indexable)
// and Preview builds with VERCEL_ENV=preview (noindex) with no per-request work.
// ---------------------------------------------------------------------------
function resolveAppEnv() {
  const explicit = (process.env.NEXT_PUBLIC_APP_ENV || '').trim().toLowerCase()
  if (explicit === 'staging' || explicit === 'preview') return 'staging'
  if (explicit === 'development' || explicit === 'dev' || explicit === 'local') return 'development'
  if (explicit === 'production' || explicit === 'prod') return 'production'

  const vercel = (process.env.VERCEL_ENV || '').trim().toLowerCase()
  if (vercel === 'preview') return 'staging'
  if (vercel === 'development') return 'development'

  return 'production'
}
const isNonProdBuild = resolveAppEnv() !== 'production'

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  // Force HTTPS for two years, including subdomains; eligible for the preload list.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Belt-and-braces with frame-ancestors: refuse to be framed at all.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Don't let the browser guess a response's content type.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Send only the origin (not the full path/query) on cross-origin requests.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // WHAT THE APP MAY ASK THE DEVICE FOR. 10 September 2026.
  //
  // This read microphone=() until a real browser tried to record, which told
  // the browser to forbid the microphone on this site for everybody, us
  // included. "Allow my microphone" could never work: the refusal was ours, not
  // Chrome's, and it looked exactly like a person declining.
  //
  // self means this site and nothing else. A page embedded from anywhere else
  // still gets nothing, and the browser still asks the person first. Geolocation
  // and topics stay off, because nothing here has any business with either.
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=(), browsing-topics=()',
  },
]

// On staging / preview only: tell search engines never to index the test copy.
// The live production site is left fully indexable.
if (isNonProdBuild) {
  securityHeaders.push({ key: 'X-Robots-Tag', value: 'noindex, nofollow' })
}

const nextConfig = {
  // Surface Vercel's server-only VERCEL_ENV ('production' | 'preview' |
  // 'development') to the browser bundle as NEXT_PUBLIC_VERCEL_ENV, so the
  // STAGING safety banner (src/lib/app-env.ts) appears on EVERY preview deploy
  // automatically — even before NEXT_PUBLIC_APP_ENV is set for that environment.
  // Empty string when building outside Vercel (local); app-env then treats it as
  // production, so no false banner locally unless NEXT_PUBLIC_APP_ENV says so.
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || '',
  },
  experimental: {
    // The /api/support/sync-playbook route reads docs/support-playbook/*.md at
    // runtime. Next.js only bundles files it can statically see are imported, so
    // we tell the tracer to include the markdown in that function's deployment —
    // otherwise the read fails on Vercel with ENOENT.
    //
    // /api/tor-extract has the same shape of problem for a different reason.
    // It reads a Scope of Work with pdfjs, behind a dynamic import so the
    // library is only loaded when a document is actually attached. webpack
    // cannot see through that, so pdfjs was traced into the deployment ZERO
    // times: the route built cleanly, deployed cleanly, and then threw
    // module-not-found the first time Habib attached a purchase order.
    // Listing it as an external package keeps it out of the bundle AND puts it
    // in the trace, which is what makes it exist at runtime.
    outputFileTracingIncludes: {
      '/api/support/sync-playbook': ['./docs/support-playbook/**/*'],
      '/api/tor-extract': ['./node_modules/pdfjs-dist/legacy/build/**/*'],
    },
    serverComponentsExternalPackages: ['pdfjs-dist'],
  },
  async headers() {
    return [
      {
        // Apply to every route.
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = nextConfig
