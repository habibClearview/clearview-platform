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
const connectSrc = [
  "'self'",
  supabaseOrigin,
  supabaseWs,
  'https://*.supabase.co',
  'wss://*.supabase.co',
].filter(Boolean).join(' ')

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  `connect-src ${connectSrc}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  'upgrade-insecure-requests',
].join('; ')

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
  // Turn off powerful features the app never uses.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
]

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
    outputFileTracingIncludes: {
      '/api/support/sync-playbook': ['./docs/support-playbook/**/*'],
    },
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
