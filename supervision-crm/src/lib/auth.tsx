import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Membership } from './types'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  memberships: Membership[]
  isPlatformOwner: boolean
  activeContractorId: string | null
  setActiveContractorId: (id: string) => void
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshMemberships: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [activeContractorId, setActiveContractorId] = useState<string | null>(null)

  async function loadMemberships() {
    const { data, error } = await supabase
      .from('memberships')
      .select(
        '*, contractor:contractors(id, legal_name, dba, cslb_license_no, classification, license_status, license_expiry)',
      )
      .eq('status', 'active')
    if (!error && data) {
      const rows = data as unknown as Membership[]
      setMemberships(rows)
      setActiveContractorId((prev) => prev ?? rows[0]?.contractor_id ?? null)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
      if (data.session) void loadMemberships()
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (next) {
        void loadMemberships()
      } else {
        setMemberships([])
        setActiveContractorId(null)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value: AuthContextValue = {
    session,
    loading,
    memberships,
    // The owner/RMO (any active 'rmo' membership) gates the cross-tenant lead-gen modules.
    isPlatformOwner: memberships.some((m) => m.role === 'rmo' && m.status === 'active'),
    activeContractorId,
    setActiveContractorId,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error?.message ?? null }
    },
    signOut: async () => {
      await supabase.auth.signOut()
    },
    refreshMemberships: loadMemberships,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
