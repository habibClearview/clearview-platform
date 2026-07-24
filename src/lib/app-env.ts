// ============================================================
// Which environment is this running in?
// ============================================================
// Drives the "STAGING" safety banner and any environment-aware behaviour.
//
// Signal, in priority order:
//   1. NEXT_PUBLIC_APP_ENV  — the explicit flag we set per Vercel environment.
//        Set it to 'staging' on the Vercel *Preview* environment (which is
//        wired to the staging database), and to 'production' on Production.
//   2. NEXT_PUBLIC_VERCEL_ENV — Vercel's automatic signal ('preview' /
//        'production' / 'development'). Vercel's own variable is VERCEL_ENV
//        (server-only); next.config.js re-exports it under this NEXT_PUBLIC_
//        name so it reaches the browser bundle. Used as a fallback when (1) is
//        unset, so a preview deploy still shows the banner even before the flag
//        is configured for that environment.
//
// If NOTHING is set we deliberately assume 'production' — so we never paint a
// false "staging" banner on the real site. The banner is a safety net for the
// people USING the app, so a missing flag failing towards "no banner on prod"
// is the correct, non-alarming default.
//
// NEXT_PUBLIC_* values are inlined at build time, so this works identically in
// the browser and on the server.

export type AppEnv = 'production' | 'staging' | 'development'

export function appEnv(): AppEnv {
  const explicit = (process.env.NEXT_PUBLIC_APP_ENV || '').trim().toLowerCase()
  if (explicit === 'staging' || explicit === 'preview') return 'staging'
  if (explicit === 'development' || explicit === 'dev' || explicit === 'local') return 'development'
  if (explicit === 'production' || explicit === 'prod') return 'production'

  const vercel = (process.env.NEXT_PUBLIC_VERCEL_ENV || '').trim().toLowerCase()
  if (vercel === 'preview') return 'staging'
  if (vercel === 'development') return 'development'

  return 'production'
}

export function isProduction(): boolean {
  return appEnv() === 'production'
}
