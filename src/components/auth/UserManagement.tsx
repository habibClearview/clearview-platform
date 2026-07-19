'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { UserRole } from '@/lib/auth/types'
import { roleLabel } from '@/lib/auth/types'

const C = {
  navy:'#1B2A4A', cyan:'#00B4D8', cream:'#F8F4EE', white:'#FFFFFF',
  slate:'#4A5A6A', border:'#D8E0E8', teal:'#1A9DAA',
  red:'#C0392B', green:'#1A7A4A', amber:'#B8860B',
}

const inp: React.CSSProperties = {width:'100%',padding:'0.42rem 0.6rem',border:`1px solid ${C.border}`,borderRadius:4,fontSize:'0.83rem',fontFamily:'inherit',background:'#F4F8FC',color:C.navy,boxSizing:'border-box'}
const lbl: React.CSSProperties = {display:'block',fontWeight:600,fontSize:'0.8rem',marginBottom:'0.22rem',color:C.navy}

interface TeamMember {
  id: string
  email: string
  full_name: string
  role: UserRole
  assigned_unit_ids: string[]
  confirmed: boolean
  lastSignIn: string | null
}

interface InviteFormData {
  email: string
  fullName: string
  role: UserRole
  assignedUnitIds: string[]
}

// Unit options for assignment
const UNIT_OPTIONS = [
  { id: 'input_centres', label: 'All Input Profit Centres' },
  { id: 'shop_1', label: 'Shop 1' },
  { id: 'shop_2', label: 'Shop 2' },
  { id: 'shop_3', label: 'Shop 3' },
  { id: 'shop_4', label: 'Shop 4' },
  { id: 'shop_5', label: 'Shop 5' },
  { id: 'fge', label: 'FGE Production & Marketing' },
  { id: 'own_farm', label: 'CONAS Own Farm' },
  { id: 'advisory', label: 'Advisory Services' },
  { id: 'customer', label: 'Customer Acquisition & Management' },
]

const ROLE_DESCRIPTIONS: Record<string, string> = {
  finance_manager: 'Full access to planning and actuals. Can invite unit heads and accounts assistants. Approves actuals submissions.',
  unit_head:       'Plans and enters actuals for their assigned units only. Can submit spending requests.',
  accounts_assistant: 'Enters actuals for assigned units. No planning access.',
}

interface Props {
  currentUserId: string
  currentRole: UserRole
  clientId: string
  clientName: string
}

export default function UserManagement({ currentUserId, currentRole, clientId, clientName }: Props) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const [form, setForm] = useState<InviteFormData>({
    email: '', fullName: '',
    role: 'unit_head',
    assignedUnitIds: [],
  })

  const canInviteRole = (role: UserRole): boolean => {
    if (currentRole === 'ceo' || currentRole === 'super_coach') return true
    if (currentRole === 'finance_manager') return ['unit_head', 'accounts_assistant'].includes(role)
    return false
  }

  const loadMembers = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setLoading(false); return }

      const res = await fetch('/api/list-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, requesterToken: token }),
      })
      const data = await res.json() as { users?: TeamMember[]; error?: string }
      if (data.users) setMembers(data.users)
    } catch (err) {
      console.error('Load members error:', err)
    }
    setLoading(false)
  }, [clientId])

  useEffect(() => { void loadMembers() }, [loadMembers])

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!form.email || !form.fullName) { setInviteError('Please fill in all fields.'); return }
    if (!canInviteRole(form.role)) { setInviteError('You cannot assign this role.'); return }
    if (['unit_head', 'accounts_assistant'].includes(form.role) && form.assignedUnitIds.length === 0) {
      setInviteError('Please assign at least one business unit.'); return
    }

    setInviting(true)
    setInviteError('')
    setInviteMsg('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setInviteError('Session expired. Please refresh the page.'); setInviting(false); return }

      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          fullName: form.fullName,
          role: form.role,
          clientId,
          assignedUnitIds: form.assignedUnitIds,
          inviterToken: token,
        }),
      })

      const data = await res.json() as { success?: boolean; message?: string; error?: string }
      if (data.success) {
        setInviteMsg(data.message || `Invitation sent to ${form.email}.`)
        setForm({ email: '', fullName: '', role: 'unit_head', assignedUnitIds: [] })
        setShowInvite(false)
        void loadMembers()
      } else {
        setInviteError(data.error || 'Failed to send invitation.')
      }
    } catch {
      setInviteError('Network error. Please try again.')
    }
    setInviting(false)
  }

  async function updateUserUnits(userId: string, assignedUnitIds: string[]) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    await fetch('/api/update-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: userId, updates: { assigned_unit_ids: assignedUnitIds }, requesterToken: token }),
    })
    void loadMembers()
    setEditingId(null)
  }

  async function forceSignoutUser(userId: string, name: string) {
    if (!window.confirm(`Sign ${name} out of every device?\n\nThis ends all their active sessions — useful if they lost a device or forgot to log out somewhere. They can sign in again normally afterwards; the account is not deactivated.\n\nNote: a page they already have open can keep working for up to about an hour until it expires, then it is fully locked out.`)) return
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    try {
      const res = await fetch('/api/force-signout-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId, requesterToken: token }),
      })
      const data = await res.json() as { success?: boolean; sessionsRevoked?: number; error?: string }
      if (data.success) {
        const n = data.sessionsRevoked
        window.alert(`${name} has been signed out of all devices${typeof n === 'number' ? ` (${n} session${n === 1 ? '' : 's'} ended)` : ''}.`)
        void loadMembers()
      } else {
        window.alert(data.error || 'Could not sign this user out. Please try again.')
      }
    } catch {
      window.alert('Network error. Please try again.')
    }
  }

  async function deactivateUser(userId: string, name: string) {
    if (!window.confirm(`Deactivate ${name}? They will no longer be able to log in. This can be reversed.`)) return
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    await fetch('/api/update-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: userId, updates: { active: false }, requesterToken: token }),
    })
    void loadMembers()
  }

  const roleBadgeColor = (role: UserRole): string => {
    if (role === 'ceo') return C.navy
    if (role === 'finance_manager') return C.teal
    if (role === 'unit_head') return C.amber
    return C.slate
  }

  // Roles this user can invite
  const invitableRoles: { value: UserRole; label: string }[] = [
    ...(currentRole === 'ceo' || currentRole === 'super_coach'
      ? [{ value: 'finance_manager' as UserRole, label: 'Finance Manager' }]
      : []),
    { value: 'unit_head', label: 'Unit Head (Business Unit Manager)' },
    { value: 'accounts_assistant', label: 'Accounts Assistant' },
  ]

  const needsUnitAssignment = ['unit_head', 'accounts_assistant'].includes(form.role)

  return (
    <div>
      {/* Success message */}
      {inviteMsg && (
        <div style={{ background: '#F0F9F4', border: `1px solid ${C.green}`, borderRadius: 7, padding: '0.85rem 1rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: C.green, fontSize: '0.85rem' }}>✓ {inviteMsg}</span>
          <button onClick={() => setInviteMsg('')} style={{ background: 'none', border: 'none', color: C.slate, cursor: 'pointer', fontSize: '1rem' }}>×</button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', fontWeight: 700, color: C.navy }}>Team Management</div>
          <div style={{ fontSize: '0.77rem', color: C.slate, marginTop: '0.2rem' }}>{clientName} · {members.length} team member{members.length !== 1 ? 's' : ''}</div>
        </div>
        <button
          onClick={() => { setShowInvite(!showInvite); setInviteError('') }}
          style={{ fontFamily: 'monospace', fontSize: '0.75rem', padding: '0.45rem 0.9rem', border: `1px solid ${C.cyan}`, borderRadius: 5, background: showInvite ? C.cyan : 'transparent', color: showInvite ? C.navy : C.cyan, cursor: 'pointer', fontWeight: 600 }}>
          {showInvite ? 'Cancel' : '+ Invite Team Member'}
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div style={{ background: '#F4F8FC', border: `1px solid ${C.border}`, borderRadius: 8, padding: '1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: C.navy, marginBottom: '1rem' }}>Invite a new team member</div>
          <p style={{ fontSize: '0.8rem', color: C.slate, lineHeight: 1.6, marginBottom: '1rem' }}>
            They will receive an email with a link to set their password. You assign their role and permissions now — they cannot change their own role.
          </p>
          <form onSubmit={sendInvite}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={lbl}>Full Name</label>
                <input style={inp} value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="e.g. John Okello" required />
              </div>
              <div>
                <label style={lbl}>Email Address</label>
                <input type="email" style={inp} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@conas.ug" required />
              </div>
              <div>
                <label style={lbl}>Role & Permissions</label>
                <select style={inp} value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole, assignedUnitIds: [] }))}>
                  {invitableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                {ROLE_DESCRIPTIONS[form.role] && (
                  <div style={{ fontSize: '0.7rem', color: C.teal, marginTop: '0.3rem', lineHeight: 1.4 }}>{ROLE_DESCRIPTIONS[form.role]}</div>
                )}
              </div>
            </div>

            {/* Unit assignment — shown for unit_head and accounts_assistant */}
            {needsUnitAssignment && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={lbl}>Assign to Business Units</label>
                <p style={{ fontSize: '0.73rem', color: C.slate, marginBottom: '0.5rem', lineHeight: 1.4 }}>
                  Select which units this person can see and work with. They cannot access any units not listed here.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.4rem' }}>
                  {UNIT_OPTIONS.map(unit => (
                    <label key={unit.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', padding: '0.35rem 0.5rem', border: `1px solid ${form.assignedUnitIds.includes(unit.id) ? C.cyan : C.border}`, borderRadius: 4, background: form.assignedUnitIds.includes(unit.id) ? '#EAF7F8' : C.white }}>
                      <input type="checkbox"
                        checked={form.assignedUnitIds.includes(unit.id)}
                        onChange={e => setForm(f => ({
                          ...f,
                          assignedUnitIds: e.target.checked
                            ? [...f.assignedUnitIds, unit.id]
                            : f.assignedUnitIds.filter(id => id !== unit.id)
                        }))} />
                      {unit.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {inviteError && (
              <div style={{ background: '#FDF0EE', border: `1px solid ${C.red}`, borderRadius: 5, padding: '0.6rem 0.8rem', marginBottom: '1rem', fontSize: '0.82rem', color: C.red }}>{inviteError}</div>
            )}

            <button type="submit" disabled={inviting}
              style={{ padding: '0.65rem 1.5rem', border: 'none', borderRadius: 5, background: inviting ? '#90C8D8' : C.cyan, color: C.navy, fontSize: '0.88rem', fontWeight: 700, fontFamily: 'monospace', cursor: inviting ? 'not-allowed' : 'pointer' }}>
              {inviting ? 'Sending invitation…' : 'Send Invitation Email'}
            </button>
          </form>
        </div>
      )}

      {/* Team list */}
      {loading ? (
        <div style={{ color: C.slate, fontSize: '0.85rem', padding: '1rem 0' }}>Loading team members…</div>
      ) : members.length === 0 ? (
        <div style={{ color: C.slate, fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>No team members yet. Use the button above to invite your first team member.</div>
      ) : (
        <div>
          {members.map(member => (
            <div key={member.id} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: '0.85rem 1rem', marginBottom: '0.6rem', background: member.id === currentUserId ? '#F0F8FF' : C.white }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: C.navy }}>{member.full_name}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', padding: '0.1rem 0.45rem', borderRadius: 4, background: roleBadgeColor(member.role), color: C.white }}>
                      {roleLabel(member.role)}
                    </span>
                    {member.id === currentUserId && <span style={{ fontSize: '0.65rem', color: C.teal, fontFamily: 'monospace' }}>you</span>}
                    {!member.confirmed && <span style={{ fontSize: '0.65rem', color: C.amber, fontFamily: 'monospace', border: `1px solid ${C.amber}`, borderRadius: 3, padding: '0.05rem 0.35rem' }}>invite pending</span>}
                  </div>
                  <div style={{ fontSize: '0.77rem', color: C.slate }}>{member.email}</div>
                  {member.assigned_unit_ids?.length > 0 && (
                    <div style={{ fontSize: '0.72rem', color: C.slate, marginTop: '0.25rem' }}>
                      Units: {member.assigned_unit_ids.map(id => UNIT_OPTIONS.find(u => u.id === id)?.label || id).join(', ')}
                    </div>
                  )}
                  {member.lastSignIn && (
                    <div style={{ fontSize: '0.7rem', color: C.slate, marginTop: '0.2rem' }}>
                      Last sign in: {new Date(member.lastSignIn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  )}
                </div>

                {/* Actions — only show for other users, and only if permitted */}
                {member.id !== currentUserId && (currentRole === 'ceo' || currentRole === 'super_coach' || (currentRole === 'finance_manager' && ['unit_head', 'accounts_assistant'].includes(member.role))) && (
                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => setEditingId(editingId === member.id ? null : member.id)}
                      style={{ fontFamily: 'monospace', fontSize: '0.68rem', padding: '0.28rem 0.6rem', border: `1px solid ${C.border}`, borderRadius: 4, background: 'transparent', color: C.slate, cursor: 'pointer' }}>
                      Edit units
                    </button>
                    <button
                      type="button"
                      onClick={() => forceSignoutUser(member.id, member.full_name)}
                      title="End all of this user's active sessions on every device (they can sign in again)"
                      style={{ fontFamily: 'monospace', fontSize: '0.68rem', padding: '0.28rem 0.6rem', border: `1px solid ${C.amber}`, borderRadius: 4, background: 'transparent', color: C.amber, cursor: 'pointer' }}>
                      Sign out everywhere
                    </button>
                    <button
                      type="button"
                      onClick={() => deactivateUser(member.id, member.full_name)}
                      style={{ fontFamily: 'monospace', fontSize: '0.68rem', padding: '0.28rem 0.6rem', border: `1px solid ${C.red}`, borderRadius: 4, background: 'transparent', color: C.red, cursor: 'pointer' }}>
                      Deactivate
                    </button>
                  </div>
                )}
              </div>

              {/* Inline unit editor */}
              {editingId === member.id && (
                <UnitEditor
                  currentUnits={member.assigned_unit_ids || []}
                  onSave={units => updateUserUnits(member.id, units)}
                  onCancel={() => setEditingId(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function UnitEditor({ currentUnits, onSave, onCancel }: { currentUnits: string[]; onSave: (units: string[]) => void; onCancel: () => void }) {
  const [selected, setSelected] = useState<string[]>(currentUnits)
  return (
    <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#F4F8FC', borderRadius: 5, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: C.navy, marginBottom: '0.5rem' }}>Edit unit assignments</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.35rem', marginBottom: '0.75rem' }}>
        {UNIT_OPTIONS.map(unit => (
          <label key={unit.id} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', cursor: 'pointer' }}>
            <input type="checkbox"
              checked={selected.includes(unit.id)}
              onChange={e => setSelected(s => e.target.checked ? [...s, unit.id] : s.filter(id => id !== unit.id))} />
            {unit.label}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={() => onSave(selected)} style={{ fontFamily: 'monospace', fontSize: '0.72rem', padding: '0.35rem 0.8rem', border: 'none', borderRadius: 4, background: C.teal, color: C.white, cursor: 'pointer' }}>Save changes</button>
        <button onClick={onCancel} style={{ fontFamily: 'monospace', fontSize: '0.72rem', padding: '0.35rem 0.8rem', border: `1px solid ${C.border}`, borderRadius: 4, background: 'transparent', color: C.slate, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  )
}
