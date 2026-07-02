'use client'
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        <div style={{fontFamily:'Arial,sans-serif',padding:'2rem',maxWidth:'600px',margin:'4rem auto'}}>
          <h2 style={{color:'#1B2A4A'}}>Something went wrong</h2>
          <p style={{color:'#666'}}>An error occurred. Please try refreshing the page.</p>
          <button onClick={() => reset()} style={{padding:'0.5rem 1rem',background:'#1B2A4A',color:'white',border:'none',borderRadius:'4px',cursor:'pointer'}}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
