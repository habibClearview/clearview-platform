'use client'

// ============================================================
// Where a coach issues and withdraws the keys an outside system uses to
// connect to this business.
//
// 20 September 2026. Habib: "i want an API with best practice on how it is
// shared with people that i need to send it to."
//
// THE SCREEN IS BUILT AROUND ONE FACT: the key appears once.
//
// So the moment after a key is created is given the whole panel rather than a
// line in a table: a wide box, the key in a box that selects itself, a copy
// button, and a plain sentence saying it will not be shown again. Everything
// else on the screen is deliberately quieter than that box.
//
// Afterwards a key is only ever shown by its first few characters, which is
// enough to recognise it in somebody's configuration file and not enough to
// use.
// ============================================================

import { useEffect, useState } from 'react'
import { authedFetch } from '@/lib/authed-fetch'
import { SCOPES, SCOPE_LABELS, type Scope } from '@/lib/api-keys'

const C = {
  navy: 'var(--cv-navy)', card: 'var(--cv-card)', border: 'var(--cv-border-soft)',
  slate: 'var(--cv-slate)', cyan: 'var(--cv-cyan)', green: 'var(--cv-green)',
  red: 'var(--cv-red)', cream: 'var(--cv-cream)', teal: 'var(--cv-teal)',
}

const inp: React.CSSProperties = {
  width: '100%', padding: '0.55rem 0.7rem', borderRadius: 6,
  border: `1px solid ${C.border}`, background: C.card, color: C.navy, fontSize: '1.02rem',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: '0.92rem', fontWeight: 600, color: C.slate, marginBottom: '0.3rem',
}
const btn = (bg: string): React.CSSProperties => ({
  padding: '0.5rem 0.9rem', borderRadius: 6, border: 'none', background: bg,
  color: 'var(--cv-on-accent)', fontWeight: 600, fontSize: '1rem', cursor: 'pointer',
})

interface KeyRow {
  id: string; label: string; key_prefix: string; business_unit_id: string
  scopes: string[] | null; created_at: string; expires_at: string | null
  revoked_at: string | null; last_used_at: string | null; use_count: number
}

export interface ApiKeysPanelProps {
  clientId: string
  businessUnits: { id: string; name: string; active: boolean }[]
}

/** What to say about a key at a glance, in words rather than a colour alone. */
function standing(k: KeyRow): { text: string; colour: string } {
  if (k.revoked_at) return { text: 'Withdrawn', colour: C.red }
  if (k.expires_at && new Date(k.expires_at) <= new Date()) return { text: 'Expired', colour: C.red }
  if (!k.last_used_at) return { text: 'Never used', colour: C.slate }
  return { text: `Last used ${new Date(k.last_used_at).toLocaleDateString()}`, colour: C.green }
}

export default function ApiKeysPanel({ clientId, businessUnits }: ApiKeysPanelProps) {
  const [keys, setKeys] = useState<KeyRow[]>([])
  const [waiting, setWaiting] = useState(0)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ label: string; key: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState<{ label: string; business_unit_id: string; expires_in_days: string; scopes: Scope[] }>({
    label: '', business_unit_id: '', expires_in_days: '', scopes: ['model.read'],
  })

  const activeUnits = businessUnits.filter((u) => u.active)
  const unitName = (id: string) => businessUnits.find((u) => u.id === id)?.name || 'a unit that no longer exists'

  async function load() {
    setLoading(true)
    try {
      const res = await authedFetch(`/api/api-keys?client_id=${encodeURIComponent(clientId)}`)
      const data = await res.json()
      if (res.ok) { setKeys(data.keys || []); setWaiting(data.waiting_in_inbox || 0) }
      else setMessage(data.error || 'Could not load the keys.')
    } catch {
      setMessage('Could not load the keys.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleScope(scope: Scope) {
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter((s) => s !== scope) : [...f.scopes, scope],
    }))
  }

  async function create() {
    if (!form.label.trim()) { setMessage('Give the key a name so you can recognise it later.'); return }
    if (!form.business_unit_id) { setMessage('Choose which business unit this key writes to.'); return }
    setCreating(true); setMessage(null)
    try {
      const res = await authedFetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          business_unit_id: form.business_unit_id,
          label: form.label.trim(),
          scopes: form.scopes,
          expires_in_days: form.expires_in_days ? Number(form.expires_in_days) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setMessage(data.error || 'Could not create the key.'); return }
      setIssued({ label: form.label.trim(), key: data.key })
      setCopied(false)
      setShowForm(false)
      setForm({ label: '', business_unit_id: '', expires_in_days: '', scopes: ['model.read'] })
      load()
    } catch {
      setMessage('Could not create the key.')
    } finally {
      setCreating(false)
    }
  }

  async function revoke(k: KeyRow) {
    if (!window.confirm(`Withdraw "${k.label}"? Any system using it stops working on its very next call. This cannot be undone.`)) return
    setBusyId(k.id); setMessage(null)
    try {
      const res = await authedFetch(`/api/api-keys?id=${encodeURIComponent(k.id)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) setMessage(data.error || 'Could not withdraw the key.')
      else load()
    } catch {
      setMessage('Could not withdraw the key.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: C.navy }}>Connected systems</div>
        <button type="button" style={btn(C.cyan)} onClick={() => { setShowForm(!showForm); setMessage(null) }}>
          {showForm ? 'Cancel' : '+ New key'}
        </button>
      </div>

      <p style={{ fontSize: '1.05rem', color: C.slate, lineHeight: 1.6, margin: '0.6rem 0 1.1rem', maxWidth: '62ch' }}>
        A key lets another company&apos;s software send this business&apos;s sales, costs and payments straight into
        ClearView. Each key writes to one business unit and can do only what you tick below. You can withdraw
        a key at any moment and it stops working on its next call.
      </p>

      {message && (
        <div style={{ background: 'var(--cv-tint-red)', border: `1px solid ${C.red}`, borderRadius: 6, padding: '0.7rem 0.9rem', marginBottom: '1rem', color: C.navy }}>
          {message}
        </div>
      )}

      {issued && (
        <div style={{ background: 'var(--cv-tint-teal)', border: `2px solid ${C.teal}`, borderRadius: 8, padding: '1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ fontWeight: 700, color: C.navy, fontSize: '1.1rem', marginBottom: '0.5rem' }}>
            The key for {issued.label}
          </div>
          <p style={{ margin: '0 0 0.8rem', color: C.navy, lineHeight: 1.6 }}>
            Copy it now and send it to their developer. It is not stored anywhere and <strong>cannot be shown
            again</strong>. If it is lost, withdraw this key and issue another. Send it the way you would send a
            password, not in the body of an email you also send to other people.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              readOnly
              aria-label="The new key"
              id="new-api-key"
              style={{ ...inp, fontFamily: 'var(--cv-font-mono)', flex: 1, minWidth: 260 }}
              value={issued.key}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              style={btn(copied ? C.green : C.navy)}
              onClick={() => { navigator.clipboard.writeText(issued.key); setCopied(true) }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" style={btn(C.slate)} onClick={() => setIssued(null)}>Done</button>
          </div>
        </div>
      )}

      {showForm && (
        <div style={{ background: C.cream, borderRadius: 8, padding: '1.1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '0.9rem' }}>
            <div>
              <label htmlFor="api-key-label" style={lbl}>What is connecting</label>
              <input id="api-key-label" style={inp} value={form.label} placeholder="e.g. Clinic till system"
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="api-key-unit" style={lbl}>Business unit it writes to</label>
              <select id="api-key-unit" style={inp} value={form.business_unit_id}
                onChange={(e) => setForm((f) => ({ ...f, business_unit_id: e.target.value }))}>
                <option value="">Choose a unit...</option>
                {activeUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="api-key-expiry" style={lbl}>Stops working after (days)</label>
              <input id="api-key-expiry" type="number" min="1" style={inp} value={form.expires_in_days}
                placeholder="Leave blank for no end date"
                onChange={(e) => setForm((f) => ({ ...f, expires_in_days: e.target.value }))} />
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div style={{ ...lbl, marginBottom: '0.5rem' }}>What this key may do</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '0.45rem' }}>
              {SCOPES.map((s) => (
                <label key={s} htmlFor={`scope-${s}`} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', color: C.navy, fontSize: '1rem', cursor: 'pointer' }}>
                  <input id={`scope-${s}`} type="checkbox" checked={form.scopes.includes(s)}
                    onChange={() => toggleScope(s)} style={{ marginTop: '0.25rem' }} />
                  <span>{SCOPE_LABELS[s]}</span>
                </label>
              ))}
            </div>
            <p style={{ fontSize: '0.95rem', color: C.slate, marginTop: '0.6rem' }}>
              Tick only what they actually need. A key with nothing ticked can connect and do nothing, which is
              a safe place to start.
            </p>
          </div>

          <button type="button" style={{ ...btn(C.navy), marginTop: '1rem' }} disabled={creating} onClick={create}>
            {creating ? 'Creating...' : 'Create key'}
          </button>
        </div>
      )}

      {waiting > 0 && (
        <div style={{ background: 'var(--cv-tint-amber, var(--cv-cream))', border: `1px solid ${C.border}`, borderRadius: 6, padding: '0.8rem 0.9rem', marginBottom: '1rem', color: C.navy }}>
          <strong>{waiting}</strong> {waiting === 1 ? 'entry has' : 'entries have'} arrived that ClearView could not file,
          usually a product that is not on the price list yet. Nothing has been lost. They are waiting for someone to
          file them.
        </div>
      )}

      {loading ? (
        <p style={{ color: C.slate }}>Loading...</p>
      ) : keys.length === 0 ? (
        <p style={{ color: C.slate }}>No system is connected to this business yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '1.02rem' }}>
            <thead>
              <tr style={{ background: 'var(--cv-header)', color: 'var(--cv-on-accent)' }}>
                {['What is connecting', 'Unit', 'Key', 'May do', 'Calls', 'Standing', ''].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '0.5rem 0.7rem', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const s = standing(k)
                const live = !k.revoked_at && !(k.expires_at && new Date(k.expires_at) <= new Date())
                return (
                  <tr key={k.id} style={{ borderBottom: `1px solid ${C.border}`, opacity: live ? 1 : 0.55 }}>
                    <td style={{ padding: '0.55rem 0.7rem', color: C.navy }}>{k.label}</td>
                    <td style={{ padding: '0.55rem 0.7rem', color: C.slate }}>{unitName(k.business_unit_id)}</td>
                    <td style={{ padding: '0.55rem 0.7rem', color: C.slate, fontFamily: 'var(--cv-font-mono)' }}>
                      {k.key_prefix}&hellip;
                    </td>
                    <td style={{ padding: '0.55rem 0.7rem', color: C.slate }}>
                      {(k.scopes || []).length === 0
                        ? 'Nothing'
                        : (k.scopes || []).map((sc) => SCOPE_LABELS[sc as Scope] || sc).join('; ')}
                    </td>
                    <td style={{ padding: '0.55rem 0.7rem', color: C.slate, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {k.use_count}
                    </td>
                    <td style={{ padding: '0.55rem 0.7rem', color: s.colour }}>{s.text}</td>
                    <td style={{ padding: '0.55rem 0.7rem' }}>
                      {live && (
                        <button type="button" style={{ ...btn(C.red), padding: '0.35rem 0.7rem', fontSize: '0.95rem' }}
                          disabled={busyId === k.id} onClick={() => revoke(k)}>
                          {busyId === k.id ? 'Withdrawing...' : 'Withdraw'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
