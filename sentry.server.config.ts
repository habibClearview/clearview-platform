import * as Sentry from '@sentry/nextjs'

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,
    enabled: process.env.NODE_ENV === 'production',
    tracesSampleRate: 0.1,
    initialScope: {
      tags: { platform: 'clearview', layer: 'server' }
    },
    // Capture unhandled promise rejections in API routes
    // This would have caught the k.headcount ReferenceError immediately
    integrations: [],
    beforeSend(event) {
      if (event.request?.data) {
        const data = event.request.data as Record<string, unknown>
        if (data.token) data.token = '[REDACTED]'
      }
      return event
    },
  })
}
