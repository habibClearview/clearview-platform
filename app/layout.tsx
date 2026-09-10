import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth/context'
import EnvBanner from '@/components/common/EnvBanner'
import LinkProblem from '@/components/auth/LinkProblem'
import PurgeBrowserCopy from '@/components/auth/PurgeBrowserCopy'

export const metadata: Metadata = {
  title: 'Clearview Planner — Canvas Coach',
  description: 'Live financial planning infrastructure for GtCV engagements',
}

/**
 * THE SITE DID NOT FIT A PHONE, AND THIS IS WHY. 10 September 2026.
 *
 * Habib: it was impossible to join on the phone, it does not change with the
 * size of the screen, I could not read the site.
 *
 * There was no viewport declaration anywhere in the application. Without one a
 * phone does not render the page at the width of the phone. It renders it at a
 * virtual 980 pixels, the width of a desktop window, and then shrinks the whole
 * thing to fit, so every word is a third of its proper size and no layout rule
 * written for a narrow screen ever applies, because as far as the page is
 * concerned the screen is not narrow.
 *
 * This is the one line that makes a phone a phone. Zooming is deliberately left
 * available: taking it away is a habit of app-like sites and it locks out
 * anybody who needs to enlarge text to read it.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* The two weights every page draws with, fetched in parallel with the
            stylesheet instead of after it. Without this the browser only learns
            it needs them once the CSS has parsed, which is the delay the
            fallback face above has to cover. */}
        <link rel="preload" href="/fonts/poppins-400-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/poppins-600-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        <a href="#main" className="cv-skip">Skip to the main content</a>
        <EnvBanner />
        <LinkProblem />
        <PurgeBrowserCopy />
        <AuthProvider>
          <div id="main">{children}</div>
        </AuthProvider>
      </body>
    </html>
  )
}
