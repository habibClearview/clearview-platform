'use client'

// ============================================================
// AdminConsoleTab — the "MANAGE › Admin" section of a client dashboard.
//
// Self-contained admin console over the EXISTING user-management API
// routes. Two in-component sub-tabs:
//   1. Users & Logins   — roster + per-row actions + invite form
//   2. Roles & Permissions — read-only reference matrix
//
// It reads and writes ONLY through the server routes (service-role lives
// there, never in the browser):
//   POST /api/list-users          { clientId, requesterToken }
//   POST /api/update-user         { targetUserId, updates, requesterToken }
//   POST /api/force-signout-user  { targetUserId, requesterToken }
//   POST /api/invite-user         { email, fullName, role, clientId,
//                                   assignedUnitIds, coImplementerId,
//                                   funderProgrammeId, inviterToken }
//
// Every server route resolves the actor + target from the DB and enforces
// tenant scope and the role hierarchy itself — the gating here is UX only,
// so any refusal from the server is surfaced inline rather than trusted.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { authedFetch } from '@/lib/authed-fetch'
import {
  ASSIGNABLE_ROLES,
  canAssignRole,
  canDeactivateUsers,
  canManageUnits,
} from '@/lib/auth/assignable-roles'

// ── local theme (CSS variables so light/dark + brand track the app) ──
const C = {
  navy: 'var(--cv-navy)',
  cyan: 'var(--cv-cyan)',
  slate: 'var(--cv-slate)',
  border: 'var(--cv-border)',
  borderSoft: 'var(--cv-border-soft)',
  green: 'var(--cv-green)',
  red: 'var(--cv-red)',
  amber: 'var(--cv-amber)',
  card: 'var(--cv-card)',
  cream: 'var(--cv-cream)',
  alt: 'var(--cv-alt)',
}

const card: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.borderSoft}`,
  borderRadius: 14,
  padding: '1.4rem 1.6rem',
  marginBottom: '1.35rem',
}
const h2: React.CSSProperties = {
  fontFamily: 'Georgia, serif',
  fontSize: '1.28rem',
  color: C.navy,
  margin: '0 0 0.35rem',
}
const h3: React.CSSProperties = {
  fontFamily: 'Georgia, serif',
  fontSize: '1.06rem',
  color: C.navy,
  margin: '0 0 0.9rem',
}
const label: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '0.72rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: C.slate,
}
const btn = (col: string = C.slate, filled = false): React.CSSProperties => ({
  fontFamily: 'monospace',
  fontSize: '0.8rem',
  fontWeight: 600,
  padding: '0.32rem 0.7rem',
  borderRadius: 5,
  border: `1px solid ${col}`,
  background: filled ? col : 'transparent',
  color: filled ? 'var(--cv-on-accent)' : col,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
})
const inp: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: '0.92rem',
  padding: '0.5rem 0.65rem',
  borderRadius: 7,
  border: `1px solid ${C.border}`,
  background: C.card,
  color: C.navy,
  width: '100%',
}

const ROLE_LABELS: Record<string, string> = {
  ceo: 'CEO',
  finance_manager: 'Finance Manager',
  unit_head: 'Unit Head',
  accounts_assistant: 'Accounts Assistant',
  super_coach: 'Super Coach',
  coach: 'Coach',
  funder: 'Funder',
}
const roleLabel = (r: string) => ROLE_LABELS[r] || r

// ── status derivation ────────────────────────────────────────
// list-users returns { confirmed (email_confirmed_at), lastSignIn
// (last_sign_in_at) }. It does NOT return the auth ban state, so
// "Active" here means "has a live login that has signed in", not
// "not deactivated" (see report / notes).
type Status = 'active' | 'invited' | 'never'
function deriveStatus(u: { confirmed?: boolean; lastSignIn?: string | null }): Status {
  if (u.lastSignIn) return 'active'
  if (u.confirmed) return 'never'
  return 'invited'
}
const STATUS_META: Record<Status, { text: string; col: string }> = {
  active: { text: 'Active', col: C.green },
  invited: { text: 'Invited — not yet signed in', col: C.amber },
  never: { text: 'Never logged in', col: C.slate },
}

interface Member {
  id: string
  role: string
  full_name: string | null
  email: string
  assigned_unit_ids: string[] | null
  confirmed?: boolean
  lastSignIn?: string | null
  engagement_client_id?: string | null
}

async function requesterToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || ''
}

// Whether the current actor can (per the UX gate) force-sign-out this
// target. The server is the source of truth (canForceSignout); this
// mirrors it so we don't offer an action that will only ever be refused.
function canForceSignoutUX(actorRole: string, targetRole: string): boolean {
  if (actorRole === 'super_coach') return true
  if (actorRole === 'ceo') return true
  if (actorRole === 'finance_manager') return ['unit_head', 'accounts_assistant'].includes(targetRole)
  return false
}

export default function AdminConsoleTab({ config, clientId, cc, P }: any) {
  const [sub, setSub] = useState<'users' | 'roles'>('users')
  // cc/config are part of the shared prop contract; referenced so the
  // linter keeps them and future panels can use them.
  void cc; void config

  return (
    <div>
      <div style={{ marginBottom: '1.1rem' }}>
        <h2 style={h2}>Admin</h2>
        <div style={{ fontSize: '0.95rem', color: C.slate, maxWidth: 640 }}>
          Manage who can sign in to {config?.business_name || 'this organisation'}, what each
          role can do, and the state of every login.
        </div>
      </div>

      {/* sub-tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.2rem', flexWrap: 'wrap' }}>
        {([['users', 'Users & Logins'], ['roles', 'Roles & Permissions']] as const).map(([k, t]) => (
          <button
            key={k}
            onClick={() => setSub(k)}
            style={{
              ...btn(sub === k ? C.cyan : C.slate, sub === k),
              fontSize: '0.85rem',
              padding: '0.42rem 0.95rem',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {sub === 'users'
        ? <UsersAndLogins config={config} clientId={clientId} P={P} />
        : <RolesMatrix />}
    </div>
  )
}

// ============================================================
// SUB-TAB 1 — Users & Logins
// ============================================================
function UsersAndLogins({ config, clientId, P }: any) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowMsg, setRowMsg] = useState<Record<string, { ok: boolean; text: string }>>({})
  // We can't read ban state from list-users, so track the last
  // deactivate/reactivate we performed this session to reflect it in the UI.
  const [deactivated, setDeactivated] = useState<Record<string, boolean>>({})

  const readOnly = !P?.canManageTeam
  const units: { id: string; name: string }[] = config?.business_units || []
  const unitName = (id: string) => units.find(u => u.id === id)?.name || id
  const assignable = ASSIGNABLE_ROLES[P?.role] || []

  async function load() {
    setLoading(true); setLoadErr(null)
    try {
      const res = await authedFetch('/api/list-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, requesterToken: await requesterToken() }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) { setLoadErr(data.error || 'Could not load the team.'); setMembers([]) }
      else setMembers((data.users as Member[]) || [])
    } catch {
      setLoadErr('Could not reach the server. Please try again.')
      setMembers([])
    }
    setLoading(false)
  }
  useEffect(() => { if (clientId) load() /* eslint-disable-next-line */ }, [clientId])

  function setMsg(id: string, ok: boolean, text: string) {
    setRowMsg(m => ({ ...m, [id]: { ok, text } }))
  }

  async function changeRole(m: Member, newRole: string) {
    if (!newRole || newRole === m.role) return
    setBusyId(m.id); setMsg(m.id, true, '')
    try {
      const res = await authedFetch('/api/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: m.id, updates: { role: newRole }, requesterToken: await requesterToken() }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) setMsg(m.id, false, data.error || 'Could not change role.')
      else {
        setMembers(prev => prev.map(x => x.id === m.id ? { ...x, role: newRole } : x))
        setMsg(m.id, true, `Role changed to ${roleLabel(newRole)}.`)
      }
    } catch { setMsg(m.id, false, 'Could not reach the server.') }
    setBusyId(null)
  }

  async function setActive(m: Member, active: boolean) {
    setBusyId(m.id); setMsg(m.id, true, '')
    try {
      const res = await authedFetch('/api/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: m.id, updates: { active }, requesterToken: await requesterToken() }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) setMsg(m.id, false, data.error || 'Could not update active status.')
      else {
        setDeactivated(d => ({ ...d, [m.id]: !active }))
        setMsg(m.id, true, active ? 'User reactivated.' : 'User deactivated — they can no longer sign in.')
      }
    } catch { setMsg(m.id, false, 'Could not reach the server.') }
    setBusyId(null)
  }

  async function forceSignout(m: Member) {
    setBusyId(m.id); setMsg(m.id, true, '')
    try {
      const res = await authedFetch('/api/force-signout-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: m.id, requesterToken: await requesterToken() }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) setMsg(m.id, false, data.error || 'Could not sign this user out.')
      else setMsg(m.id, true, `Signed out (${data.sessionsRevoked ?? 0} session${data.sessionsRevoked === 1 ? '' : 's'} revoked).`)
    } catch { setMsg(m.id, false, 'Could not reach the server.') }
    setBusyId(null)
  }

  async function reInvite(m: Member) {
    setBusyId(m.id); setMsg(m.id, true, '')
    try {
      const res = await authedFetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: m.email,
          fullName: m.full_name || m.email,
          role: m.role,
          clientId,
          assignedUnitIds: m.assigned_unit_ids || [],
          coImplementerId: null,
          funderProgrammeId: null,
          inviterToken: await requesterToken(),
        }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) setMsg(m.id, false, data.error || 'Could not resend the invitation.')
      else setMsg(m.id, true, data.message || 'Invitation resent.')
    } catch { setMsg(m.id, false, 'Could not reach the server.') }
    setBusyId(null)
  }

  // Normal path: email the user a "set a new password" link (same link the
  // login page's "Forgot password?" sends). Use when their email works.
  async function emailReset(m: Member) {
    setBusyId(m.id); setMsg(m.id, true, '')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(m.email, { redirectTo: `${window.location.origin}/reset-password` })
      if (error) setMsg(m.id, false, error.message || 'Could not send the reset email.')
      else setMsg(m.id, true, `Reset link emailed to ${m.email}. Ask them to check spam if it doesn’t arrive.`)
    } catch { setMsg(m.id, false, 'Could not reach the server.') }
    setBusyId(null)
  }

  // Best-practice fallback when the email never reaches them: generate a
  // one-time recovery LINK and copy it, for you to send through any channel
  // (WhatsApp/SMS). The user opens it and sets THEIR OWN password — you never
  // see or set it. Shown as a copyable link so the record can be delivered.
  const [resetLink, setResetLink] = useState<Record<string, string>>({})
  async function getResetLink(m: Member) {
    setBusyId(m.id); setMsg(m.id, true, '')
    try {
      const res = await authedFetch('/api/admin-reset-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: m.id, requesterToken: await requesterToken() }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || !data.link) { setMsg(m.id, false, data.error || 'Could not generate a reset link.'); setBusyId(null); return }
      setResetLink(r => ({ ...r, [m.id]: data.link }))
      let copied = false
      try { await navigator.clipboard.writeText(data.link); copied = true } catch { /* clipboard may be blocked; link is shown below to copy manually */ }
      setMsg(m.id, true, `${copied ? 'Reset link copied. ' : ''}Send it to ${m.full_name || m.email} — they open it and set their own password. It expires in about 1 hour.`)
    } catch { setMsg(m.id, false, 'Could not reach the server.') }
    setBusyId(null)
  }

  return (
    <div>
      {P?.canManageTeam && (
        <InviteForm clientId={clientId} units={units} assignable={assignable} onInvited={load} />
      )}

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ ...h3, marginBottom: 0 }}>Logins for {config?.business_name || 'this client'}</h3>
          <button style={btn(C.slate)} onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>

        {readOnly && (
          <div style={{ ...label, textTransform: 'none', fontSize: '0.8rem', color: C.amber, marginTop: '0.6rem' }}>
            Read-only — you can view the roster but not make changes. Ask a CEO or Finance Manager to manage the team.
          </div>
        )}

        {loading ? (
          <div style={{ color: C.slate, padding: '1.5rem 0' }}>Loading the team…</div>
        ) : loadErr ? (
          <div style={{ color: C.red, padding: '1rem 0' }}>{loadErr}</div>
        ) : members.length === 0 ? (
          <div style={{ color: C.slate, padding: '1.5rem 0' }}>No logins yet. Invite the first person above.</div>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: '0.9rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.92rem', minWidth: 640 }}>
              <thead>
                <tr>
                  {['Name', 'Email', 'Role', 'Status', ...(readOnly ? [] : ['Actions'])].map(h => (
                    <th key={h} style={{ ...label, textAlign: 'left', padding: '0.4rem 0.6rem', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map(m => {
                  const status = deriveStatus(m)
                  const meta = STATUS_META[status]
                  const isSelf = m.id === P?.userId
                  const isDeactivated = deactivated[m.id]
                  const canRole = !isSelf && canAssignRole(P?.role, m.role) && assignable.length > 0
                  const canForce = canForceSignoutUX(P?.role, m.role) && !isSelf
                  const canDeact = canDeactivateUsers(P?.role) && !isSelf
                  const canRe = status !== 'active'
                  // Resetting a password is the same authority as deactivating
                  // (managers, not yourself); the server re-checks scope/role.
                  const canReset = canDeactivateUsers(P?.role) && !isSelf
                  const busy = busyId === m.id
                  const msg = rowMsg[m.id]
                  return (
                    <tr key={m.id} style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
                      <td style={{ padding: '0.55rem 0.6rem', color: C.navy, verticalAlign: 'top' }}>
                        {m.full_name || <span style={{ color: C.slate }}>—</span>}
                        {isSelf && <span style={{ ...label, marginLeft: 6, color: C.cyan }}>you</span>}
                        {(m.assigned_unit_ids?.length ?? 0) > 0 && (
                          <div style={{ ...label, textTransform: 'none', marginTop: 3, color: C.slate }}>
                            {m.assigned_unit_ids!.map(unitName).join(', ')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.55rem 0.6rem', color: C.slate, verticalAlign: 'top' }}>{m.email || '—'}</td>
                      <td style={{ padding: '0.55rem 0.6rem', verticalAlign: 'top' }}>
                        {readOnly || !canRole ? (
                          <span style={{ color: C.navy }}>{roleLabel(m.role)}</span>
                        ) : (
                          <select
                            style={{ ...inp, width: 'auto', minWidth: 160, fontSize: '0.85rem', padding: '0.32rem 0.5rem' }}
                            value={m.role}
                            disabled={busy}
                            onChange={e => changeRole(m, e.target.value)}
                          >
                            {/* the target's current role may be one the actor
                                can't assign (e.g. a CEO row) — keep it visible
                                but the assignable set is what can be chosen. */}
                            {!assignable.includes(m.role) && (
                              <option value={m.role}>{roleLabel(m.role)}</option>
                            )}
                            {assignable.map(r => (
                              <option key={r} value={r}>{roleLabel(r)}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td style={{ padding: '0.55rem 0.6rem', verticalAlign: 'top' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: isDeactivated ? C.red : meta.col, flex: '0 0 auto' }} />
                          <span style={{ color: C.navy, fontSize: '0.86rem' }}>
                            {isDeactivated ? 'Deactivated' : meta.text}
                          </span>
                        </span>
                      </td>
                      {!readOnly && (
                        <td style={{ padding: '0.55rem 0.6rem', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            {canForce && (
                              <button style={btn(C.slate)} disabled={busy} onClick={() => forceSignout(m)}>Force sign-out</button>
                            )}
                            {canDeact && (isDeactivated ? (
                              <button style={btn(C.green)} disabled={busy} onClick={() => setActive(m, true)}>Reactivate</button>
                            ) : (
                              <button style={btn(C.red)} disabled={busy} onClick={() => setActive(m, false)}>Deactivate</button>
                            ))}
                            {canRe && (
                              <button style={btn(C.cyan)} disabled={busy} onClick={() => reInvite(m)}>Re-invite</button>
                            )}
                            {canReset && (
                              <>
                                <button style={btn(C.cyan)} disabled={busy} onClick={() => emailReset(m)} title="Email them a link to set a new password">Email reset link</button>
                                <button style={btn(C.amber)} disabled={busy} onClick={() => getResetLink(m)} title="Get a link to send them directly (use when email doesn't reach them) — they set their own password">Get reset link</button>
                              </>
                            )}
                          </div>
                          {resetLink[m.id] && (
                            <div style={{ marginTop: 6 }}>
                              <div style={{ ...label, textTransform: 'none', fontSize: '0.72rem' }}>One-time reset link (send to this person):</div>
                              <input readOnly value={resetLink[m.id]} onFocus={e => e.currentTarget.select()}
                                style={{ width: '100%', maxWidth: 320, fontSize: '0.72rem', fontFamily: 'monospace', padding: '0.3rem 0.4rem', border: `1px solid ${C.border}`, borderRadius: 6, color: C.navy, background: C.card }} />
                            </div>
                          )}
                          {msg?.text && (
                            <div style={{ marginTop: 5, fontSize: '0.8rem', color: msg.ok ? C.green : C.red, maxWidth: 260 }}>
                              {msg.text}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ ...label, textTransform: 'none', fontSize: '0.76rem', color: C.slate, marginTop: '0.9rem', lineHeight: 1.5 }}>
          Status reflects sign-in state: <b>Active</b> = has signed in; <b>Invited</b> = emailed but hasn’t accepted;
          <b> Never logged in</b> = account confirmed but never signed in. “Deactivated” shows after you deactivate a
          login this session.
        </div>
      </div>
    </div>
  )
}

// ── invite form ──────────────────────────────────────────────
function InviteForm({
  clientId, units, assignable, onInvited,
}: { clientId: string; units: { id: string; name: string }[]; assignable: string[]; onInvited: () => void }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  // Prefer unit_head as a sensible default when it's assignable.
  const [role, setRole] = useState(assignable.includes('unit_head') ? 'unit_head' : (assignable[0] || ''))
  const [unitIds, setUnitIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const needsUnits = ['unit_head', 'accounts_assistant'].includes(role)

  function toggleUnit(id: string) {
    setUnitIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function submit() {
    setMsg(null)
    if (!email.trim() || !fullName.trim()) { setMsg({ ok: false, text: 'Enter a full name and email.' }); return }
    if (!role) { setMsg({ ok: false, text: 'Pick a role.' }); return }
    if (needsUnits && unitIds.length === 0) {
      setMsg({ ok: false, text: 'Assign at least one business unit for a Unit Head or Accounts Assistant.' }); return
    }
    setSaving(true)
    try {
      const res = await authedFetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim(),
          role,
          clientId,
          assignedUnitIds: needsUnits ? unitIds : [],
          coImplementerId: null,
          funderProgrammeId: null,
          inviterToken: await requesterToken(),
        }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) setMsg({ ok: false, text: data.error || 'Could not send the invitation.' })
      else {
        setMsg({ ok: true, text: data.message || `Invitation sent to ${email.trim()}.` })
        setEmail(''); setFullName(''); setUnitIds([])
        onInvited()
      }
    } catch { setMsg({ ok: false, text: 'Could not reach the server.' }) }
    setSaving(false)
  }

  if (assignable.length === 0) return null

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ ...h3, marginBottom: 0 }}>Invite a user</h3>
        <button style={btn(C.cyan, open)} onClick={() => setOpen(o => !o)}>{open ? 'Close' : '+ Invite user'}</button>
      </div>

      {open && (
        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.9rem', maxWidth: 560 }}>
          <div>
            <div style={label}>Full name</div>
            <input style={inp} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Ada Obi" />
          </div>
          <div>
            <div style={label}>Email</div>
            <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ada@example.com" />
          </div>
          <div>
            <div style={label}>Role</div>
            <select style={inp} value={role} onChange={e => { setRole(e.target.value); setUnitIds([]) }}>
              {assignable.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </div>
          {needsUnits && (
            <div>
              <div style={label}>Business units {unitIds.length > 0 && `(${unitIds.length} selected)`}</div>
              {units.length === 0 ? (
                <div style={{ color: C.slate, fontSize: '0.86rem' }}>No business units defined yet.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.35rem' }}>
                  {units.map(u => {
                    const on = unitIds.includes(u.id)
                    return (
                      <button key={u.id} type="button" style={btn(on ? C.cyan : C.slate, on)} onClick={() => toggleUnit(u.id)}>
                        {on ? '✓ ' : ''}{u.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <button style={{ ...btn(C.green, true), fontSize: '0.88rem', padding: '0.45rem 1rem' }} disabled={saving} onClick={submit}>
              {saving ? 'Sending…' : 'Send invitation'}
            </button>
            {msg && <span style={{ fontSize: '0.85rem', color: msg.ok ? C.green : C.red }}>{msg.text}</span>}
          </div>
        </div>
      )}
      {!open && msg && (
        <div style={{ marginTop: '0.7rem', fontSize: '0.85rem', color: msg.ok ? C.green : C.red }}>{msg.text}</div>
      )}
    </div>
  )
}

// ============================================================
// SUB-TAB 2 — Roles & Permissions (read-only reference matrix)
// ============================================================
// Derived from the role model in assignable-roles.ts and the app's
// permission derivation. Read-only clarity screen for now.
const MATRIX_ROLES = ['ceo', 'finance_manager', 'unit_head', 'accounts_assistant', 'super_coach', 'coach', 'funder'] as const
const CAPS = [
  ['view', 'View dashboard'],
  ['actuals', 'Enter actuals'],
  ['plan', 'Edit plan / budget'],
  ['approve', 'Approve submissions'],
  ['team', 'Manage team'],
  ['catalogue', 'Manage catalogue'],
] as const

type Cap = typeof CAPS[number][0]
type Cell = 'yes' | 'no' | 'partial'

// yes = full; partial = scoped / conditional (own units, propose-only,
// grantable, read-only advisory); no = not permitted.
const MATRIX: Record<string, Record<Cap, Cell>> = {
  ceo:                { view: 'yes',     actuals: 'yes',     plan: 'yes',     approve: 'yes',     team: 'yes',     catalogue: 'yes' },
  finance_manager:    { view: 'yes',     actuals: 'yes',     plan: 'yes',     approve: 'partial', team: 'partial', catalogue: 'yes' },
  unit_head:          { view: 'partial', actuals: 'yes',     plan: 'partial', approve: 'no',      team: 'no',      catalogue: 'no' },
  accounts_assistant: { view: 'partial', actuals: 'yes',     plan: 'no',      approve: 'no',      team: 'no',      catalogue: 'partial' },
  super_coach:        { view: 'yes',     actuals: 'no',      plan: 'no',      approve: 'no',      team: 'yes',     catalogue: 'no' },
  coach:              { view: 'partial', actuals: 'no',      plan: 'no',      approve: 'no',      team: 'no',      catalogue: 'no' },
  funder:             { view: 'partial', actuals: 'no',      plan: 'no',      approve: 'no',      team: 'no',      catalogue: 'no' },
}

const ROLE_NOTES: Record<string, string> = {
  ceo: 'Full authority over their organisation; final approver.',
  finance_manager: 'First-line approver; can invite unit heads & accounts assistants.',
  unit_head: 'Their assigned units only; proposes plan changes for approval.',
  accounts_assistant: 'Their assigned units only; catalogue editing if granted.',
  super_coach: 'Platform admin — cross-client oversight and staffing.',
  coach: 'Advisory, read-only portfolio view.',
  funder: 'Scoped, read-only reporting view.',
}

function RolesMatrix() {
  const dot = (cell: Cell) => {
    const map: Record<Cell, { col: string; txt: string }> = {
      yes: { col: C.green, txt: 'Yes' },
      partial: { col: C.amber, txt: 'Scoped' },
      no: { col: C.slate, txt: '—' },
    }
    const m = map[cell]
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.82rem', color: cell === 'no' ? C.slate : C.navy }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.col, flex: '0 0 auto', opacity: cell === 'no' ? 0.4 : 1 }} />
        {m.txt}
      </span>
    )
  }

  return (
    <div style={card}>
      <h3 style={h3}>What each role can do</h3>
      <div style={{ ...label, textTransform: 'none', fontSize: '0.82rem', color: C.slate, marginBottom: '1rem', lineHeight: 1.55 }}>
        Reference only. <b>Scoped</b> means the ability is limited or conditional — a unit head’s view is their own
        units, a finance manager’s approval is first-line before the CEO, an accounts assistant’s catalogue access
        must be granted, and coach/funder views are read-only.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', minWidth: 680 }}>
          <thead>
            <tr>
              <th style={{ ...label, textAlign: 'left', padding: '0.5rem 0.6rem', borderBottom: `1px solid ${C.border}` }}>Role</th>
              {CAPS.map(([k, t]) => (
                <th key={k} style={{ ...label, textAlign: 'left', padding: '0.5rem 0.6rem', borderBottom: `1px solid ${C.border}` }}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX_ROLES.map(r => (
              <tr key={r} style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
                <td style={{ padding: '0.6rem', verticalAlign: 'top' }}>
                  <div style={{ color: C.navy, fontWeight: 600 }}>{roleLabel(r)}</div>
                  <div style={{ ...label, textTransform: 'none', fontSize: '0.74rem', color: C.slate, marginTop: 3, maxWidth: 220, lineHeight: 1.4 }}>
                    {ROLE_NOTES[r]}
                  </div>
                </td>
                {CAPS.map(([k]) => (
                  <td key={k} style={{ padding: '0.6rem', verticalAlign: 'top' }}>{dot(MATRIX[r][k as Cap])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ ...label, textTransform: 'none', fontSize: '0.76rem', color: C.slate, marginTop: '0.9rem' }}>
        Assignable roles follow the hierarchy in <code>assignable-roles.ts</code>: a CEO staffs their own org
        (finance manager, unit head, accounts assistant); a finance manager manages the two roles below them; a
        super coach may assign any role.
      </div>
    </div>
  )
}
