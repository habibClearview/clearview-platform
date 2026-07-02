import * as Sentry from '@sentry/nextjs'

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // Only send errors in production
    enabled: process.env.NODE_ENV === 'production',
    // Capture all unhandled errors
    tracesSampleRate: 0.1,
    // Tag every error with the platform name
    initialScope: {
      tags: { platform: 'clearview' }
    },
    // Capture React component errors
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // Before sending -- scrub sensitive fields
    beforeSend(event) {
      // Never send passwords, tokens, or API keys
      if (event.request?.data) {
        const data = event.request.data as Record<string, unknown>
        if (data.token) data.token = '[REDACTED]'
        if (data.password) data.password = '[REDACTED]'
      }
      return event
    },
  })
}
