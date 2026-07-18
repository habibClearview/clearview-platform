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
  const [funderDetailLevel, setFunderDetailLevel] = useState<'summary'|'full'>('summary')
  const [checking, setChecking] = useState(true)
  const [authError, setAuthError] = useState(false)
  const [initError, setInitError] = useState<string|null>(null)

  useEffect(()=>{
    let cancelled = false
    // Watchdog: never leave the user stuck on "Loading Clearview..." forever. If
    // init hasn't resolved in 20s (a hung query / RLS timeout / network stall),
    // stop checking so the login or error screen renders instead of an infinite
    // spinner.
    const watchdog = setTimeout(()=>{ if(!cancelled){ setInitError('This took too long to load. Check your connection and reload.'); setChecking(false) } }, 20000)
    async function init() {
      const {data:{session}} = await supabase.auth.getSession()
      if (!session) { setChecking(false); return }
      // Load user profile
      const {data:profile} = await supabase.from('user_profiles')
        .select('id,role,full_name,email,client_id,engagement_client_id,assigned_unit_ids,can_manage_catalogue,co_implementer_id,funder_programme_id')
        .eq('id',session.user.id).single()
      if (profile) setUser({...profile, email:session.user.email})
      // Find client by slug from engagement_clients. This query is
      // RLS-scoped (the browser's own session, not the service key), so
      // for 'coach'/'funder' roles it already returns null unless their
      // co_implementers.client_ids / programme actually includes this
      // client -- see 2026_07_13_funder_coimplementer_access.sql.
      const {data:client} = await supabase.from('engagement_clients')
        .select('id').eq('slug',slug).single()
      // Authorization check: does this user actually belong to the client
      // resolved from the URL? Previously there was NONE at all -- any
      // authenticated user could navigate to any client's URL slug and
      // see that client's full dashboard, using their own role's
      // permissions. super_coach is the deliberate exception (sees every
      // client). ceo/finance_manager/unit_head/accounts_assistant must
      // have a matching engagement_client_id. coach/funder are multi-
      // client roles with no single engagement_client_id to compare --
      // RLS is the real gate for them (the query above already returns no
      // row if unauthorized), this just requires the role to be one of
      // the two roles RLS actually grants multi-client access to.
      const isSuperCoach = profile?.role === 'super_coach'
      const isDirectClientUser = !!profile?.engagement_client_id && profile.engagement_client_id === client?.id
      const isMultiClientRoleWithAccess = (profile?.role === 'coach' || profile?.role === 'funder') && !!client
      const isAuthorized = isSuperCoach || isDirectClientUser || isMultiClientRoleWithAccess
      if (client && isAuthorized) setClientId(client.id)
      else if (client && !isAuthorized) setAuthError(true)
      // The coach-configurable level of detail a funder sees, read from
      // their one programme -- irrelevant (default stays 'summary', but
      // unused) for every other role, since only role==='funder' ever
      // reads funderDetailLevel below.
      if (client && isAuthorized && profile?.role === 'funder' && profile.funder_programme_id) {
        const {data:programme} = await supabase.from('programmes')
          .select('funder_detail_level').eq('id',profile.funder_programme_id).single()
        if (programme?.funder_detail_level === 'full') setFunderDetailLevel('full')
      }
    }
    // Wrap the whole init so a thrown query (e.g. an RLS/id error) can never
    // leave the page hanging on "Loading Clearview..." — it surfaces the real
    // reason on screen instead, and `finally` always clears the loading state.
    init()
      .catch((e:any)=>{ if(!cancelled){ console.error('Dashboard init failed:', e); setInitError(e?.message||'Something went wrong loading this dashboard.') } })
      .finally(()=>{ if(!cancelled){ clearTimeout(watchdog); setChecking(false) } })
    return ()=>{ cancelled = true; clearTimeout(watchdog) }
  },[slug])

  async function handleLogin(email:string, password:string) {
    const {error} = await supabase.auth.signInWithPassword({email,password})
    if (error) return error.message
    // Reload
    window.location.reload()
    return null
  }

  if (checking) return <Loading/>
  if (initError) return (
    <div style={{minHeight:'100vh',background:'#F8F4EE',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Segoe UI',system-ui,sans-serif",padding:'2rem'}}>
      <div style={{maxWidth:460,textAlign:'center'}}>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:'#1B2A4A',marginBottom:'0.6rem'}}>Couldn't load this dashboard</div>
        <div style={{color:'#C0392B',fontSize:'0.95rem',marginBottom:'1.2rem',padding:'0.7rem',background:'#FDF0EE',borderRadius:6,wordBreak:'break-word'}}>{initError}</div>
        <button onClick={()=>window.location.reload()} style={{padding:'0.6rem 1.2rem',border:'none',borderRadius:6,background:'#1B2A4A',color:'#fff',fontSize:'0.9rem',fontWeight:600,cursor:'pointer'}}>Reload</button>
      </div>
    </div>
  )
  if (!user) return <LoginPrompt onLogin={handleLogin}/>
  if (authError) return <div style={{padding:'2rem',fontFamily:'Georgia,serif',color:'#C0392B'}}>You don't have access to this client's dashboard. Contact your administrator if you believe this is a mistake.</div>
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
    // Was unconditionally true for every role, including the new
    // read-only funder role -- gated to the same roles canEditPlan etc.
    // already cover, so no existing role's access changes.
    canEnterActuals: ['super_coach','coach','ceo','finance_manager','unit_head','accounts_assistant'].includes(user.role),
    canManageTeam: ['super_coach','ceo'].includes(user.role),
    // The CEO and Finance Manager always have this; anyone else needs it
    // explicitly delegated via the "Manage Field Catalogue" toggle in Team.
    canManageCatalogue: ['super_coach','ceo','finance_manager'].includes(user.role) || !!user.can_manage_catalogue,
    canViewAI: ['super_coach','coach','ceo'].includes(user.role),
    // Only meaningful for role==='funder' -- see GenericDashboard's tab
    // filtering. Every other role always gets full access regardless of
    // this value.
    funderDetailLevel,
    onSignOut: async () => { await supabase.auth.signOut(); window.location.href='/' },
  }

  return <GenericDashboard clientId={clientId} permissions={permissions}/>
}
