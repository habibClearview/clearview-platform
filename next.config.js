const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {}

// Only wrap with Sentry if DSN is configured
// This prevents build failures when Sentry env vars are not set
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  module.exports = withSentryConfig(nextConfig, {
    silent: true,
    widenClientFileUpload: true,
    hideSourceMaps: true,
    disableLogger: true,
    automaticVercelMonitors: false,
  })
} else {
  module.exports = nextConfig
}
