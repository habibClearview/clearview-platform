import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Clearview Planner — Canvas Coach',
  description: 'Live financial planning infrastructure for GtCV engagements',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
