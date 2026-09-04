'use client'
// One wrapper per page carries both effects, rather than each section running
// its own observer. See motion.tsx for why both fail open.
import { useReveal, useCountUp } from '@/components/site/motion'

export default function SiteMotion({ children }: { children: React.ReactNode }) {
  const reveal = useReveal<HTMLDivElement>()
  const count = useCountUp<HTMLDivElement>()
  return (
    <div ref={(el) => { reveal.current = el; count.current = el }}>
      {children}
    </div>
  )
}
