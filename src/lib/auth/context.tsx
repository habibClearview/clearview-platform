'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { AppUser, UserRole } from './types'

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

  async function loadProfile(userId: string): Promise<AppUser | null> {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, role, client_id, full_name, assigned_unit_ids')
        .eq('id', userId)
        .single()

      if (error || !data) return null

      const { data: authUser } = await supabase.auth.getUser()
      return {
        id: data.id,
        email: authUser.user?.email || '',
        role: (data.role as UserRole) || 'accounts_assistant',
        full_name: data.full_name || '',
        client_id: data.client_id,
        assigned_unit_ids: data.assigned_unit_ids || [],
      }
    } catch {
      return null
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await loadProfile(session.user.id)
        setUser(profile)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const profile = await loadProfile(session.user.id)
        setUser(profile)
      } else {
        setUser(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

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
