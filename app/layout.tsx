import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth/context'
import EnvBanner from '@/components/common/EnvBanner'

export const metadata: Metadata = {
  title: 'Clearview Planner — Canvas Coach',
  description: 'Live financial planning infrastructure for GtCV engagements',
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
        <AuthProvider>
          <div id="main">{children}</div>
        </AuthProvider>
      </body>
    </html>
  )
}
