'use client'
// ============================================================
// "Devices" — a self-contained header button + modal that shows the
// signed-in user every device their account is currently logged in on,
// and lets them sign out one, or every other device but this one.
//
// All data comes from three self-scoped SQL functions (see the
// 2026_07_19_self_service_sessions migration) that only ever touch the
// caller's OWN sessions — so this component needs no server route.
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { describeDevice } from '@/lib/auth/device-label'

interface SessionRow {
  id: string
  created_at: string
  last_active: string
  user_agent: string | null
  ip: string | null
  is_current: boolean
}

function fmt(ts: string | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ActiveSessionsButton({ fontSize = '0.88rem' }: { fontSize?: string }) {
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.rpc('list_my_sessions')
    if (error) {
      // If the DB functions haven't been applied yet, say so plainly.
      setError('Could not load your devices. If this persists, the database update for this feature may not be applied yet.')
      setSessions([])
    } else {
      setSessions((data as SessionRow[]) || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (open) void load() }, [open, load])

  // Drive a native <dialog> so we get focus-trapping, Escape-to-close, and the
  // backdrop for free (an accessible modal, rather than a plain div overlay
  // that keyboard users can tab out of).
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
  }, [open])
  function onBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    // A click landing on the <dialog> element itself (not its content) is the backdrop.
    if (e.target === dialogRef.current) setOpen(false)
  }

  const current = sessions.find(s => s.is_current)
  const otherCount = sessions.filter(s => !s.is_current).length

  async function signOutOne(row: SessionRow) {
    if (!window.confirm(`Sign out ${describeDevice(row.user_agent)}${row.is_current ? ' (this device)' : ''}?`)) return
    setBusyId(row.id)
    const { error } = await supabase.rpc('revoke_my_session', { target_session_id: row.id })
    setBusyId(null)
    if (error) { window.alert('Could not sign out that device. Please try again.'); return }
    if (row.is_current) { window.location.href = '/'; return }
    await load()
  }

  async function signOutOthers() {
    if (!current) { window.alert('Could not identify this device — please reload and try again.'); return }
    if (!window.confirm(`Sign out all ${otherCount} other device${otherCount === 1 ? '' : 's'}? This one stays signed in.`)) return
    setBusyId('others')
    const { error } = await supabase.rpc('revoke_my_other_sessions', { keep_session_id: current.id })
    setBusyId(null)
    if (error) { window.alert('Could not sign out the other devices. Please try again.'); return }
    await load()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="See every device your account is signed in on, and sign any of them out"
        style={{ fontFamily: 'monospace', fontSize, background: 'transparent', border: '1px solid var(--cv-wa-45, rgba(120,140,160,0.45))', borderRadius: 4, color: 'var(--cv-wa-85, #4A5A6A)', cursor: 'pointer', padding: '0.18rem 0.5rem' }}>
        Devices
      </button>

      <dialog
        ref={dialogRef}
        aria-label="Your signed-in devices"
        onClose={() => setOpen(false)}
        onCancel={() => setOpen(false)}
        onClick={onBackdropClick}
        style={{ border: 'none', padding: 0, maxWidth: 560, width: '92vw', background: 'transparent', color: '#1B2A4A' }}>
        <style>{`dialog::backdrop{background:rgba(11,31,51,0.55);} dialog[open]{margin:6vh auto;}`}</style>
        {open && (
          <div
            style={{ background: '#FFFFFF', color: '#1B2A4A', borderRadius: 10, width: '100%', maxHeight: '84vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.3)', padding: '1.25rem 1.35rem', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.15rem', fontWeight: 700 }}>Your signed-in devices</div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: '1.4rem', lineHeight: 1, color: '#4A5A6A', cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#4A5A6A', margin: '0 0 1rem', lineHeight: 1.5 }}>
              Every place your account is currently signed in. Sign out any device you don&apos;t recognise or forgot to log out of.
            </p>

            {loading ? (
              <div style={{ color: '#4A5A6A', fontSize: '0.85rem', padding: '1.5rem 0', textAlign: 'center' }}>Loading your devices…</div>
            ) : error ? (
              <div style={{ background: '#FDF0EE', border: '1px solid #C0392B', borderRadius: 6, padding: '0.7rem 0.9rem', fontSize: '0.82rem', color: '#C0392B' }}>{error}</div>
            ) : sessions.length === 0 ? (
              <div style={{ color: '#4A5A6A', fontSize: '0.85rem', padding: '1rem 0', textAlign: 'center' }}>No active sessions found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                {sessions.map(s => (
                  <div key={s.id} style={{ border: `1px solid ${s.is_current ? '#00B4D8' : '#D8E0E8'}`, background: s.is_current ? '#F0FAFC' : '#FFFFFF', borderRadius: 7, padding: '0.7rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {describeDevice(s.user_agent)}
                        {s.is_current && <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: '#00838F', border: '1px solid #00B4D8', borderRadius: 3, padding: '0.05rem 0.35rem' }}>THIS DEVICE</span>}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#4A5A6A', marginTop: '0.2rem' }}>
                        {s.ip ? `IP ${s.ip} · ` : ''}Last active {fmt(s.last_active)}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => signOutOne(s)}
                      style={{ flexShrink: 0, fontFamily: 'monospace', fontSize: '0.7rem', padding: '0.32rem 0.7rem', border: '1px solid #C0392B', borderRadius: 4, background: 'transparent', color: '#C0392B', cursor: busyId === s.id ? 'wait' : 'pointer' }}>
                      {busyId === s.id ? '…' : 'Sign out'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!loading && !error && otherCount > 0 && (
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  disabled={busyId === 'others'}
                  onClick={signOutOthers}
                  style={{ fontFamily: 'monospace', fontSize: '0.76rem', padding: '0.5rem 1rem', border: 'none', borderRadius: 5, background: '#C0392B', color: '#FFFFFF', cursor: busyId === 'others' ? 'wait' : 'pointer', fontWeight: 700 }}>
                  {busyId === 'others' ? 'Signing out…' : `Sign out all ${otherCount} other device${otherCount === 1 ? '' : 's'}`}
                </button>
              </div>
            )}

            <p style={{ fontSize: '0.7rem', color: '#8494A4', margin: '0.9rem 0 0', lineHeight: 1.45 }}>
              A device already open may keep working for up to about an hour until its access expires, then it is fully locked out.
            </p>
          </div>
        )}
      </dialog>
    </>
  )
}
