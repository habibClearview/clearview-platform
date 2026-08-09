// @ts-nocheck
'use client'
// ============================================================
// SHARING A SHOWCASE LINK
//
// A link a prospect can open with no account. It shows the method, and one
// line about how far a real engagement has got. It cannot show anything the
// engagement recorded, because the page is built on the server from a list of
// the few fields allowed out, and there is no larger payload behind it.
//
// The panel says all of that in plain words, because a coach about to send a
// link to somebody outside the engagement needs to know exactly what that
// person will see, and finding out afterwards is too late.
//
// Two switches, and they do different jobs. Sharing on or off applies to every
// link at once, so one click stops all of them the moment somebody asks you
// to. Naming the organisation is separate and off by default, because a
// prospect who sees a named engagement has learned that this organisation is a
// client, and that is the organisation's disclosure to make, not yours.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import CopyLink from '@/components/common/CopyLink'

const C = {
  card: 'var(--cv-card)', alt: 'var(--cv-alt)', border: 'var(--cv-border)',
  slate: 'var(--cv-slate)', navy: 'var(--cv-navy)', teal: 'var(--cv-teal)',
  green: 'var(--cv-green)', amber: 'var(--cv-amber)', red: 'var(--cv-red)',
}
const mono = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' }
const hint = { fontSize: '0.88rem', color: C.slate, lineHeight: 1.5 }
const btn = (col, solid) => ({
  ...mono, fontSize: '0.83rem', fontWeight: 600, padding: '0.34rem 0.8rem',
  border: `1px solid ${col}`, borderRadius: 7,
  background: solid ? col : 'transparent',
  color: solid ? 'var(--cv-on-accent)' : col, cursor: 'pointer',
})

async function api(method, body, query) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(`/api/showcase-link${query || ''}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`)
  return json
}

function fmtDate(iso) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return String(iso).slice(0, 10) }
}

export default function ShowcaseSharing({ clientId, canManage }) {
  const [state, setState] = useState({ enabled: false, nameClient: false, links: [] })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(null)
  const [label, setLabel] = useState('')

  const load = useCallback(async () => {
    if (!clientId) { setLoading(false); return }
    setLoading(true)
    try {
      setState(await api('GET', null, `?clientId=${encodeURIComponent(clientId)}`))
      setErr(null)
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  async function run(key, fn, ok) {
    if (busy) return
    setBusy(key); setErr(null); setNote(null)
    try { const r = await fn(); if (ok) setNote(typeof ok === 'function' ? ok(r) : ok); await load() }
    catch (e) { setErr(e.message || 'That did not work') }
    setBusy(null)
  }

  if (!canManage) return null
  if (loading) return <p style={hint}>Loading the sharing settings...</p>

  const live = state.links.filter((l) => !l.revoked_at && (!l.expires_at || new Date(l.expires_at) > new Date()))
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem 1.1rem', background: C.card }}>
      <div style={{ ...mono, fontSize: '0.75rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
        Share the method with a prospect
      </div>
      <p style={{ ...hint, margin: '0.4rem 0 0', maxWidth: '92ch' }}>
        A link anyone can open without an account. It shows the nine blocks, the question each one
        asks, and one line saying how far a live engagement has got. It shows <strong>no</strong>{' '}
        names, no signatures, no evidence, no notes, no fees and nothing this engagement has
        recorded. That is enforced where the page is built, not by hiding things on screen.
      </p>

      {err ? <div style={{ color: C.red, fontSize: '0.95rem', marginTop: '0.7rem' }}>{err}</div> : null}
      {note ? <div style={{ color: C.green, fontSize: '0.95rem', marginTop: '0.7rem', wordBreak: 'break-all' }}>{note}</div> : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', margin: '1rem 0 0' }}>
        <label style={{ ...hint, display: 'flex', gap: '0.55rem', alignItems: 'flex-start', cursor: 'pointer' }}>
          <input
            type="checkbox"
            aria-label="Sharing is on for this engagement"
            checked={state.enabled}
            disabled={busy === 'enabled'}
            onChange={(e) => run('enabled', () => api('POST', { clientId, action: 'settings', enabled: e.target.checked }))}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong style={{ color: C.navy }}>Sharing is on.</strong> Turning this off stops every
            link at once, including ones already sent, without having to find them.
          </span>
        </label>

        <label style={{ ...hint, display: 'flex', gap: '0.55rem', alignItems: 'flex-start', cursor: 'pointer' }}>
          <input
            type="checkbox"
            aria-label="Name the organisation on the shared page"
            checked={state.nameClient}
            disabled={busy === 'name'}
            onChange={(e) => run('name', () => api('POST', { clientId, action: 'settings', nameClient: e.target.checked }))}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong style={{ color: C.navy }}>Name the organisation.</strong> Off by default. A
            prospect who sees a named engagement has learned that this organisation is a client, and
            that is their disclosure to make rather than yours. Ask them first.
          </span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px', minWidth: 180 }}>
          <label
            htmlFor="showcase-label"
            style={{ ...mono, fontSize: '0.68rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate, display: 'block', marginBottom: 4 }}
          >
            Who is this link for
          </label>
          <input
            id="showcase-label"
            aria-label="Who this link is for"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="So you know which link to withdraw later"
            style={{
              width: '100%', padding: '0.42rem 0.55rem', borderRadius: 7,
              border: `1px solid ${C.border}`, background: 'transparent', color: 'inherit',
              fontFamily: "'Segoe UI',system-ui,sans-serif", fontSize: '0.92rem',
            }}
          />
        </div>
        <button
          type="button"
          style={btn(C.teal, true)}
          disabled={busy === 'issue'}
          onClick={() => run('issue', async () => {
            const r = await api('POST', { clientId, action: 'issue', label })
            setLabel('')
            return r
          }, 'Link created. It is in the list below with a copy button.')}
        >{busy === 'issue' ? 'Creating...' : 'Create a link'}</button>
      </div>

      {state.links.length > 0 ? (
        <>
          <div style={{ ...mono, fontSize: '0.68rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate, margin: '1.1rem 0 0.4rem' }}>
            Links ({live.length} live)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {state.links.map((l) => {
              const expired = l.expires_at && new Date(l.expires_at) <= new Date()
              const dead = Boolean(l.revoked_at) || expired
              return (
                <div key={l.id} style={{
                  display: 'flex', gap: '0.6rem', justifyContent: 'space-between', flexWrap: 'wrap',
                  alignItems: 'center', border: `1px solid ${C.border}`, borderRadius: 9,
                  padding: '0.5rem 0.75rem', opacity: dead ? 0.6 : 1,
                }}>
                  <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                    <div style={{ fontSize: '0.97rem', color: C.navy, fontWeight: 600 }}>{l.grantee_name}</div>
                    <div style={{ ...mono, fontSize: '0.76rem', color: C.slate }}>
                      {l.revoked_at
                        ? `Withdrawn ${fmtDate(l.revoked_at)}`
                        : expired
                          ? `Expired ${fmtDate(l.expires_at)}`
                          : `Works until ${fmtDate(l.expires_at)}`}
                      {l.last_accessed_at ? ` · last opened ${fmtDate(l.last_accessed_at)}` : ' · never opened'}
                    </div>
                    {!dead ? (
                      <div style={{ marginTop: '0.45rem' }}>
                        <CopyLink url={`${origin}/showcase/${l.access_token}`} compact />
                      </div>
                    ) : null}
                  </div>
                  {!dead ? (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        style={btn(C.red)}
                        disabled={busy === `rv:${l.id}`}
                        onClick={() => {
                          if (typeof window !== 'undefined' && !window.confirm(`Withdraw the link for ${l.grantee_name}? Anyone holding it will stop being able to open it.`)) return
                          run(`rv:${l.id}`, () => api('POST', { clientId, action: 'revoke', id: l.id }), 'Withdrawn.')
                        }}
                      >Withdraw</button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </>
      ) : null}
    </div>
  )
}
