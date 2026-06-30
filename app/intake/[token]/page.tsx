// @ts-nocheck
'use client'
import { useParams } from 'next/navigation'
import ClientIntakeForm from '@/components/intake/ClientIntakeForm'

export default function IntakePage() {
  const params = useParams()
  const token = params?.token as string
  return <ClientIntakeForm intakeToken={token}/>
}
