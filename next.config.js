const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Sentry source maps in production
  productionBrowserSourceMaps: false,
}

module.exports = withSentryConfig(nextConfig, {
  // Sentry organisation and project -- set via env vars
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Silent during builds unless there's an error
  silent: true,
  // Upload source maps for better error traces
  widenClientFileUpload: true,
  // Hide source maps from browser
  hideSourceMaps: true,
  // Tree-shake Sentry in development
  disableLogger: true,
  // Don't fail build if Sentry upload fails
  dryRun: !process.env.SENTRY_AUTH_TOKEN,
})
