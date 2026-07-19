'use client'
// ============================================================
// Password reset landing page.
//
// The "Forgot password?" email links here (redirectTo …/reset-password).
// Previously this route did not exist, so every reset link hit a 404 and
// no one could actually complete a reset. Supabase parses the recovery
// token from the URL and establishes a short-lived recovery session; this
// page lets the user set a new password (min 12 chars), then signs them
// out everywhere so they log back in fresh with the new password.
// ============================================================
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const C = {
  navy: '#1B2A4A', cyan: '#00B4D8', cream: '#F8F4EE',
  white: '#FFFFFF', slate: '#4A5A6A', border: '#D8E0E8',
  red: '#C0392B', green: '#1A7A4A',
}

const MIN_LEN = 12

export default function ResetPasswordPage() {
  const [checking, setChecking] = useState(true)
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY once it has parsed the token from the URL.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') { setReady(true); setChecking(false) }
    })
    // Also catch the case where the recovery session is already in place on mount.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
      setChecking(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < MIN_LEN) { setError(`Use at least ${MIN_LEN} characters.`); return }
    if (password !== confirm) { setError('The two passwords do not match.'); return }
    setSaving(true)
    const { error: updErr } = await supabase.auth.updateUser({ password })
    if (updErr) {
      setSaving(false)
      setError('Could not set your new password — the link may have expired. Request a fresh reset link and try again.')
      return
    }
    // Sign out everywhere so the new password is what gets used next, and any
    // old sessions (including the recovery one) are cleared.
    try { await supabase.auth.signOut({ scope: 'global' }) } catch { /* fall through */ }
    setSaving(false)
    setDone(true)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.cream, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '1rem' }}>
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', letterSpacing: '0.18em', color: C.slate, marginBottom: '0.4rem' }}>CANVAS COACH</div>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 700, color: C.navy }}>Clearview</div>
      </div>

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '2rem 2.25rem', width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
        {checking ? (
          <p style={{ textAlign: 'center', color: C.slate, fontSize: '0.85rem' }}>Checking your reset link…</p>
        ) : done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✅</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.15rem', fontWeight: 700, color: C.navy, marginBottom: '0.5rem' }}>Password updated</h2>
            <p style={{ fontSize: '0.85rem', color: C.slate, lineHeight: 1.6, marginBottom: '1.25rem' }}>Your new password is set. Please sign in with it.</p>
            <a href="/" style={{ display: 'inline-block', padding: '0.65rem 1.25rem', border: 'none', borderRadius: 5, background: C.cyan, color: C.navy, fontSize: '0.9rem', fontWeight: 700, fontFamily: 'monospace', textDecoration: 'none' }}>Go to sign in</a>
          </div>
        ) : !ready ? (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.15rem', fontWeight: 700, color: C.navy, marginBottom: '0.5rem' }}>This reset link is invalid or has expired</h2>
            <p style={{ fontSize: '0.85rem', color: C.slate, lineHeight: 1.6, marginBottom: '1.25rem' }}>Reset links can only be used once and expire after a short time. Please request a new one from the sign-in page.</p>
            <a href="/" style={{ display: 'inline-block', padding: '0.6rem 1.1rem', border: `1px solid ${C.border}`, borderRadius: 5, background: 'transparent', color: C.slate, fontSize: '0.85rem', textDecoration: 'none' }}>Back to sign in</a>
          </div>
        ) : (
          <>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 700, color: C.navy, marginBottom: '1.25rem', textAlign: 'center' }}>Set a new password</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: C.navy, marginBottom: '0.3rem' }}>New password</label>
                <input type="password" required autoFocus value={password} onChange={e => setPassword(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.8rem', border: `1px solid ${C.border}`, borderRadius: 5, fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box', background: '#F4F8FC', color: C.navy }}
                  placeholder={`At least ${MIN_LEN} characters`} />
              </div>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: C.navy, marginBottom: '0.3rem' }}>Confirm new password</label>
                <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.8rem', border: `1px solid ${C.border}`, borderRadius: 5, fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box', background: '#F4F8FC', color: C.navy }}
                  placeholder="Re-enter it" />
              </div>
              {error && (
                <div style={{ background: '#FDF0EE', border: `1px solid ${C.red}`, borderRadius: 5, padding: '0.6rem 0.8rem', marginBottom: '1rem', fontSize: '0.82rem', color: C.red }}>{error}</div>
              )}
              <button type="submit" disabled={saving}
                style={{ width: '100%', padding: '0.75rem', border: 'none', borderRadius: 5, background: saving ? '#90C8D8' : C.cyan, color: C.navy, fontSize: '0.92rem', fontWeight: 700, fontFamily: 'monospace', cursor: saving ? 'not-allowed' : 'pointer', letterSpacing: '0.04em' }}>
                {saving ? 'Saving…' : 'Set new password'}
              </button>
            </form>
          </>
        )}
      </div>

      <div style={{ marginTop: '2rem', fontSize: '0.72rem', color: C.slate, fontFamily: 'monospace' }}>
        Canvas Coach · Clearview Planner · habibonifade.com
      </div>
    </div>
  )
}
