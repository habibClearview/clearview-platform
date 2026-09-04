// @ts-nocheck
'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { DEFAULT_LANDING, RETURN_TO_KEY, isSafeReturnPath, sessionIsStale, LAST_ACTIVITY_KEY } from '@/lib/auth/session-guard'

const C = {
  navy:'#1B2A4A', cyan:'#00B4D8', cream:'#F8F4EE', white:'#FFFFFF',
  slate:'#4A5A6A', border:'#D8E0E8', red:'#C0392B',
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')

  /**
   * Back to the page the session ended on, once. Read and REMOVED in the same
   * breath, so a sign-in tomorrow opens the dashboard rather than a block from
   * this afternoon. Anything that is not a plain same-origin path is discarded
   * rather than followed — see isSafeReturnPath.
   */
  /** The activity clock the guard keeps. Unreadable storage means no claim either way. */
  function readLastActivity(): string | null {
    try { return localStorage.getItem(LAST_ACTIVITY_KEY) } catch { return null }
  }

  function landingPage() {
    try {
      const saved = localStorage.getItem(RETURN_TO_KEY)
      localStorage.removeItem(RETURN_TO_KEY)
      if (isSafeReturnPath(saved)) return saved as string
    } catch { /* storage refused; the default is always safe */ }
    return DEFAULT_LANDING
  }

  useEffect(() => {
    // Timeout after 3 seconds -- if session check hangs, just show login form
    const timeout = setTimeout(() => setChecking(false), 3000)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(timeout)
      if (!session) { setChecking(false); return }
      // A SESSION IS NOT THE SAME AS A WELCOME. 4 September 2026.
      // This used to forward on the mere existence of a session, which meant a
      // browser reopened days later went straight to the dashboard and the
      // password field was never shown. The app's own rule is that an hour of
      // idle ends a session; it now holds here too, at the front door.
      if (sessionIsStale(Date.now(), readLastActivity())) {
        try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* show the form regardless */ }
        setChecking(false)
        return
      }
      window.location.href = landingPage()
    }).catch(() => {
      clearTimeout(timeout)
      setChecking(false)
    })
    return () => clearTimeout(timeout)
  }, [])

  async function handleLogin() {
    if (!email || !password) {
      setError('Please enter your email and password.')
      return
    }
    setLoading(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (authError) {
      // Don't echo the provider's raw message — it can reveal whether an email
      // exists. One generic message for every sign-in failure.
      setError('The email or password you entered is incorrect.')
      setLoading(false)
    } else {
      window.location.href = landingPage()
    }
  }

  if (checking) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:C.cream}}>
      <div style={{color:C.slate,fontFamily: 'var(--cv-font-mono)',fontSize:'0.85rem'}}>Loading...</div>
    </div>
  )

  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:C.cream,fontFamily:"var(--cv-font)"}}>
      <div style={{width:'100%',maxWidth:400,padding:'0 1.5rem'}}>
        <div style={{textAlign:'center',marginBottom:'2rem'}}>
          <div style={{fontFamily: 'var(--cv-font-mono)',fontSize:'0.78rem',letterSpacing:'0.15em',color:C.cyan,marginBottom:'0.5rem'}}>CANVAS COACH</div>
          <div style={{fontFamily:'var(--cv-font)',fontSize:'1.8rem',fontWeight:700,color:C.navy}}>Clearview</div>
          <div style={{fontSize:'0.8rem',color:C.slate,marginTop:'0.3rem'}}>Financial Planning Platform</div>
        </div>
        <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:12,padding:'2rem',boxShadow:'0 4px 24px rgba(0,0,0,0.06)'}}>
          <div style={{marginBottom:'1.25rem'}}>
            <label style={{display:'block',fontWeight:600,fontSize:'0.8rem',marginBottom:'0.3rem',color:C.navy}}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              style={{width:'100%',padding:'0.6rem 0.75rem',border:`1px solid ${C.border}`,borderRadius:6,fontSize:'0.9rem',fontFamily:'inherit',background:'#F4F8FC',color:C.navy,boxSizing:'border-box'}}
              placeholder="your@email.com"
              autoComplete="email"
            />
          </div>
          <div style={{marginBottom:'1.5rem'}}>
            <label style={{display:'block',fontWeight:600,fontSize:'0.8rem',marginBottom:'0.3rem',color:C.navy}}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              style={{width:'100%',padding:'0.6rem 0.75rem',border:`1px solid ${C.border}`,borderRadius:6,fontSize:'0.9rem',fontFamily:'inherit',background:'#F4F8FC',color:C.navy,boxSizing:'border-box'}}
              placeholder="Password"
              autoComplete="current-password"
            />
          </div>
          {error && (
            <div style={{background:'#FDF0EE',border:`1px solid ${C.red}`,borderRadius:6,padding:'0.7rem 0.9rem',marginBottom:'1rem',fontSize:'0.83rem',color:C.red}}>
              {error}
            </div>
          )}
          <button
            onClick={handleLogin}
            disabled={loading}
            style={{width:'100%',padding:'0.75rem',border:'none',borderRadius:6,background:loading?C.slate:C.navy,color:C.white,fontSize:'0.9rem',fontWeight:600,cursor:loading?'not-allowed':'pointer',fontFamily:'inherit'}}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </div>
        <div style={{textAlign:'center',marginTop:'1.5rem',fontSize:'0.78rem',color:C.slate}}>
          Canvas Coach · habibonifade.com · Confidential
        </div>
      </div>
    </div>
  )
}
