// @ts-nocheck
'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

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

  // If already logged in, redirect
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        window.location.href = '/coach'
      } else {
        setChecking(false)
      }
    })
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
      setError(authError.message)
      setLoading(false)
    } else {
      window.location.href = '/coach'
    }
  }

  if (checking) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:C.cream}}>
      <div style={{color:C.slate,fontFamily:'monospace',fontSize:'0.85rem'}}>Loading...</div>
    </div>
  )

  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:C.cream,fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <div style={{width:'100%',maxWidth:400,padding:'0 1.5rem'}}>
        <div style={{textAlign:'center',marginBottom:'2rem'}}>
          <div style={{fontFamily:'monospace',fontSize:'0.65rem',letterSpacing:'0.15em',color:C.cyan,marginBottom:'0.5rem'}}>CANVAS COACH</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:'1.8rem',fontWeight:700,color:C.navy}}>Clearview</div>
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
            style={{width:'100%',padding:'0.75rem',border:'none',borderRadius:6,background:loading?C.slate:C.navy,color:C.white,fontSize:'0.9rem',fontWeight:600,cursor:loading?'not-allowed':'pointer',fontFamily:'inherit',transition:'background 0.2s'}}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </div>
        <div style={{textAlign:'center',marginTop:'1.5rem',fontSize:'0.75rem',color:C.slate}}>
          Canvas Coach · habibonifade.com · Confidential
        </div>
      </div>
    </div>
  )
}
