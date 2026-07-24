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
      <body>
        <EnvBanner />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
