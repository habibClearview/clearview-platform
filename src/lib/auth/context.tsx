'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { AppUser, UserRole } from './types'
import { useSessionGuard } from './useSessionGuard'

interface AuthContextValue {
  user: AppUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null, loading: true,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string, email: string): Promise<AppUser> {
    // Try to read from user_profiles
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, role, client_id, full_name, assigned_unit_ids, engagement_client_id, co_implementer_id, funder_programme_id')
        .eq('id', userId)
        .single()

      if (!error && data && data.role) {
        return {
          id: data.id,
          email,
          role: (data.role as UserRole),
          full_name: data.full_name || '',
          client_id: data.client_id,
          assigned_unit_ids: data.assigned_unit_ids || [],
          engagement_client_id: data.engagement_client_id || null,
          co_implementer_id: data.co_implementer_id || null,
          funder_programme_id: data.funder_programme_id || null,
        }
      }
    } catch { /* fall through */ }

    // Fallback: derive role from email
    // Habib is always super_coach regardless of profile read failure
    const role: UserRole = email === 'habib@habibonifade.com' ? 'super_coach' : 'accounts_assistant'
    return {
      id: userId,
      email,
      role,
      full_name: email === 'habib@habibonifade.com' ? 'Habib Onifade' : '',
      client_id: null,
      assigned_unit_ids: [],
      engagement_client_id: null,
      co_implementer_id: null,
      funder_programme_id: null,
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await loadProfile(session.user.id, session.user.email || '')
        setUser(profile)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const profile = await loadProfile(session.user.id, session.user.email || '')
        setUser(profile)
      } else {
        setUser(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Idle-timeout + heartbeat: only active once someone is actually signed in.
  // Auto signs-out an unattended screen and drops a revoked session promptly.
  useSessionGuard(!!user)

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
