// @ts-nocheck
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import GenericDashboard from '@/components/generic/GenericDashboard'
import type { GenericPermissions } from '@/components/generic/GenericDashboard'

function Loading() {
  return (
    <div style={{minHeight:'100vh',background:'#F8F4EE',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Georgia,serif',fontSize:'1.1rem',color:'#1B2A4A'}}>
      Loading Clearview...
    </div>
  )
}

function LoginPrompt({onLogin}:{onLogin:(e:string,p:string)=>Promise<string|null>}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function handle() {
    setLoading(true); setError('')
    const err = await onLogin(email, password)
    if (err) { setError(err); setLoading(false) }
  }
  return (
    <div style={{minHeight:'100vh',background:'#F8F4EE',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <div style={{width:'100%',maxWidth:380,padding:'0 1.5rem'}}>
        <div style={{textAlign:'center',marginBottom:'2rem'}}>
          <div style={{fontFamily:'monospace',fontSize:'0.65rem',letterSpacing:'0.15em',color:'#00B4D8',marginBottom:'0.5rem'}}>CANVAS COACH</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:'1.8rem',fontWeight:700,color:'#1B2A4A'}}>Clearview</div>
        </div>
        <div style={{background:'#fff',border:'1px solid #D8E0E8',borderRadius:12,padding:'2rem',boxShadow:'0 4px 24px rgba(0,0,0,0.06)'}}>
          <div style={{marginBottom:'1.25rem'}}>
            <label style={{display:'block',fontWeight:600,fontSize:'0.8rem',marginBottom:'0.3rem',color:'#1B2A4A'}}>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handle()}
              style={{width:'100%',padding:'0.6rem 0.75rem',border:'1px solid #D8E0E8',borderRadius:6,fontSize:'0.9rem',background:'#F4F8FC',color:'#1B2A4A',boxSizing:'border-box'}}/>
          </div>
          <div style={{marginBottom:'1.5rem'}}>
            <label style={{display:'block',fontWeight:600,fontSize:'0.8rem',marginBottom:'0.3rem',color:'#1B2A4A'}}>Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handle()}
              style={{width:'100%',padding:'0.6rem 0.75rem',border:'1px solid #D8E0E8',borderRadius:6,fontSize:'0.9rem',background:'#F4F8FC',color:'#1B2A4A',boxSizing:'border-box'}}/>
          </div>
          {error&&<div style={{color:'#C0392B',fontSize:'0.83rem',marginBottom:'1rem',padding:'0.6rem',background:'#FDF0EE',borderRadius:5}}>{error}</div>}
          <button onClick={handle} disabled={loading}
            style={{width:'100%',padding:'0.75rem',border:'none',borderRadius:6,background:loading?'#4A5A6A':'#1B2A4A',color:'#fff',fontSize:'0.9rem',fontWeight:600,cursor:loading?'not-allowed':'pointer'}}>
            {loading?'Signing in...':'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function GenericClientPage() {
  const params = useParams()
  const slug = params?.slug as string
  const [user, setUser] = useState<any>(null)
  const [clientId, setClientId] = useState<string|null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(()=>{
    async function init() {
      const {data:{session}} = await supabase.auth.getSession()
      if (!session) { setChecking(false); return }
      // Load user profile
      const {data:profile} = await supabase.from('user_profiles')
        .select('id,role,full_name,email,client_id,assigned_unit_ids')
        .eq('id',session.user.id).single()
      if (profile) setUser({...profile, email:session.user.email})
      // Find client by slug from engagement_clients
      const {data:client} = await supabase.from('engagement_clients')
        .select('id').eq('slug',slug).single()
      if (client) setClientId(client.id)
      setChecking(false)
    }
    init()
  },[slug])

  async function handleLogin(email:string, password:string) {
    const {error} = await supabase.auth.signInWithPassword({email,password})
    if (error) return error.message
    // Reload
    window.location.reload()
    return null
  }

  if (checking) return <Loading/>
  if (!user) return <LoginPrompt onLogin={handleLogin}/>
  if (!clientId) return <div style={{padding:'2rem',fontFamily:'Georgia,serif',color:'#C0392B'}}>Client not found.</div>

  const permissions: GenericPermissions = {
    role: user.role||'accounts_assistant',
    userId: user.id,
    fullName: user.full_name||'',
    clientId,
    unitIds: user.assigned_unit_ids||[],
    canEditPlan: ['super_coach','coach','ceo','finance_manager','unit_head'].includes(user.role),
    canApprove: ['super_coach','ceo','finance_manager'].includes(user.role),
    canSubmitRequest: ['super_coach','finance_manager','unit_head','accounts_assistant'].includes(user.role),
    canEnterActuals: true,
    canManageTeam: ['super_coach','ceo'].includes(user.role),
    canViewAI: ['super_coach','coach','ceo'].includes(user.role),
    onSignOut: async () => { await supabase.auth.signOut(); window.location.href='/' },
  }

  return <GenericDashboard clientId={clientId} permissions={permissions}/>
}
