'use client'
// Vercel Web Analytics for the public site, and only the public site.
//
// The engagement walkthroughs beneath /how-i-work/ share the site's layout,
// but each is a private link made for one funder. They are dropped here, before
// anything leaves the browser, so their addresses never reach a dashboard.
import { Analytics } from '@vercel/analytics/next'

export function dropPrivate<T extends { url: string }>(event: T): T | null {
  // The path alone decides, so a query string that mentions the walkthroughs
  // cannot drop a public page. /how-i-work itself is public and indexed; only
  // the addresses beneath it are dropped.
  let path = event.url
  try { path = new URL(event.url, 'https://habibonifade.com').pathname } catch {}
  return /\/how-i-work\/[^/]+/.test(path) ? null : event
}

export default function SiteAnalytics() {
  return <Analytics beforeSend={dropPrivate} />
}
