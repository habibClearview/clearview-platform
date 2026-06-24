'use client'
import { useState } from 'react'
import { useAuth } from '@/lib/auth/context'

const C = {
  navy: '#1B2A4A', cyan: '#00B4D8', cream: '#F8F4EE',
  white: '#FFFFFF', slate: '#4A5A6A', border: '#D8E0E8',
  red: '#C0392B', green: '#1A7A4A',
}

interface LoginPageProps {
  clientName?: string
  onSuccess?: () => void
}

export default function LoginPage({ clientName = 'Clearview', onSuccess }: LoginPageProps) {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await signIn(email, password)
    setLoading(false)
    if (err) {
      setError('Email or password not recognised. Please try again.')
    } else {
      onSuccess?.()
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!email) { setError('Enter your email address first.'); return }
    setLoading(true)
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    setResetSent(true)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.cream, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* Logo bar */}
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', letterSpacing: '0.18em', color: C.slate, marginBottom: '0.4rem' }}>CANVAS COACH</div>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 700, color: C.navy }}>Clearview</div>
        <div style={{ fontSize: '0.82rem', color: C.slate, marginTop: '0.25rem' }}>{clientName}</div>
      </div>

      {/* Card */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '2rem 2.25rem', width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
        {!showReset ? (
          <>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 700, color: C.navy, marginBottom: '1.5rem', textAlign: 'center' }}>Sign in to your account</h2>
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: C.navy, marginBottom: '0.3rem' }}>Email address</label>
                <input
                  type="email" required autoFocus
                  value={email} onChange={e => setEmail(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.8rem', border: `1px solid ${C.border}`, borderRadius: 5, fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box', background: '#F4F8FC', color: C.navy }}
                  placeholder="you@company.com"
                />
              </div>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: C.navy, marginBottom: '0.3rem' }}>Password</label>
                <input
                  type="password" required
                  value={password} onChange={e => setPassword(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.8rem', border: `1px solid ${C.border}`, borderRadius: 5, fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box', background: '#F4F8FC', color: C.navy }}
                  placeholder="Your password"
                />
              </div>
              {error && (
                <div style={{ background: '#FDF0EE', border: `1px solid ${C.red}`, borderRadius: 5, padding: '0.6rem 0.8rem', marginBottom: '1rem', fontSize: '0.82rem', color: C.red }}>{error}</div>
              )}
              <button
                type="submit" disabled={loading}
                style={{ width: '100%', padding: '0.75rem', border: 'none', borderRadius: 5, background: loading ? '#90C8D8' : C.cyan, color: C.navy, fontSize: '0.92rem', fontWeight: 700, fontFamily: 'monospace', cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.04em' }}>
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
              <button onClick={() => { setShowReset(true); setError('') }}
                style={{ background: 'none', border: 'none', color: C.slate, fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}>
                Forgot password?
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 700, color: C.navy, marginBottom: '0.5rem', textAlign: 'center' }}>Reset your password</h2>
            {resetSent ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✉️</div>
                <p style={{ fontSize: '0.85rem', color: C.slate, lineHeight: 1.6 }}>A password reset link has been sent to <strong>{email}</strong>. Check your inbox and follow the link to set a new password.</p>
                <button onClick={() => { setShowReset(false); setResetSent(false) }}
                  style={{ marginTop: '1.25rem', background: 'none', border: `1px solid ${C.border}`, borderRadius: 5, padding: '0.5rem 1rem', color: C.slate, fontSize: '0.82rem', cursor: 'pointer' }}>
                  Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleReset}>
                <p style={{ fontSize: '0.82rem', color: C.slate, marginBottom: '1rem', lineHeight: 1.5 }}>Enter your email address and we will send you a link to reset your password.</p>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: C.navy, marginBottom: '0.3rem' }}>Email address</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.8rem', border: `1px solid ${C.border}`, borderRadius: 5, fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box', background: '#F4F8FC', color: C.navy }}
                    placeholder="you@company.com" />
                </div>
                {error && <div style={{ color: C.red, fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</div>}
                <button type="submit" disabled={loading}
                  style={{ width: '100%', padding: '0.75rem', border: 'none', borderRadius: 5, background: C.cyan, color: C.navy, fontSize: '0.92rem', fontWeight: 700, fontFamily: 'monospace', cursor: 'pointer' }}>
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                  <button onClick={() => { setShowReset(false); setError('') }}
                    style={{ background: 'none', border: 'none', color: C.slate, fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}>
                    Back to sign in
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>

      <div style={{ marginTop: '2rem', fontSize: '0.72rem', color: C.slate, fontFamily: 'monospace' }}>
        Canvas Coach · Clearview Planner · habibonifade.com
      </div>
    </div>
  )
}
