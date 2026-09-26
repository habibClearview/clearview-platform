'use client'
// Vercel Web Analytics for the public site, and only the public site.
//
// The engagement walkthroughs under /how-i-work share the site's layout, but
// each is a private link made for one funder. They are dropped here, before
// anything leaves the browser, so their addresses never reach a dashboard.
import { Analytics } from '@vercel/analytics/next'

export function dropPrivate<T extends { url: string }>(event: T): T | null {
  return event.url.includes('/how-i-work') ? null : event
}

export default function SiteAnalytics() {
  return <Analytics beforeSend={dropPrivate} />
}
