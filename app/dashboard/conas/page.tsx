'use client'
import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth/context'
import LoginPage from '@/components/auth/LoginPage'
import CONASDashboard from '@/components/conas/CONASDashboard'
import { loadLocal, saveLocal } from '@/lib/auth/persistence'
import { defaultCONASInputs, type CONASInputs } from '@/lib/conas-engine'
import {
  canSeeAllUnits, canEditPlan, canLockPlan,
  canApproveSpendrequests, canSubmitSpendRequest, canEnterActuals,
} from '@/lib/auth/types'

function Loading() {
  return (
    <div style={{ minHeight:'100vh', background:'#F8F4EE', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Georgia, serif', fontSize:'1.1rem', color:'#1B2A4A' }}>
      Loading Clearview…
    </div>
  )
}

export default function CONASPage() {
  const { user, loading, signOut } = useAuth()
  const [inputs, setInputs] = useState<CONASInputs | null>(null)
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    const loaded = loadLocal(defaultCONASInputs)
    setInputs(loaded)
    setDataLoading(false)
  }, [])

  const handleInputsChange = useCallback((newInputs: CONASInputs) => {
    setInputs(newInputs)
    saveLocal(newInputs)
  }, [])

  if (loading || dataLoading) return <Loading />
  if (!user) return <LoginPage clientName="CONAS Agricultural Hub" />
  if (!inputs) return <Loading />

  const permissions = {
    role: user.role,
    fullName: user.full_name,
    userId: user.id,
    clientId: user.client_id || 'conas',
    canSeeAllUnits: canSeeAllUnits(user.role),
    canEditPlan: canEditPlan(user.role),
    canLockPlan: canLockPlan(user.role),
    canApprove: canApproveSpendrequests(user.role),
    canSubmitRequest: canSubmitSpendRequest(user.role),
    canEnterActuals: canEnterActuals(user.role),
    assignedUnitIds: user.assigned_unit_ids,
    onSignOut: signOut,
  }

  return (
    <CONASDashboard
      inputs={inputs}
      onInputsChange={handleInputsChange}
      permissions={permissions}
    />
  )
}
