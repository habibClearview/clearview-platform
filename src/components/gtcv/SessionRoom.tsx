// @ts-nocheck
'use client'
// ============================================================
// The coach's side of a working session.
//
// Three things, in the order they happen in a real session.
//
//   OPEN IT       choose the block, get a link and a QR code to put on screen.
//                 The room scans it and starts typing. Twelve hours by default,
//                 because a session is an afternoon.
//   WATCH IT      what the room has added, newest first, with who said it.
//                 Refreshes when asked rather than constantly, so a projected
//                 screen does not jump while somebody is reading it.
//   USE IT        turn a sentence into a row in the block's own table, in one
//                 click and in the words it was said in, or mark it used if it
//                 went in some other way. The pile shrinks honestly, which is
//                 what stops the coach reading all forty again and either
//                 missing one or using one twice.
//
// WHY THE ONE CLICK MATTERS. Before it, moving a sentence into the block meant
// reading it here and retyping it there, so it either did not happen or it
// happened with the words changed. Changed words are the one thing a verbatim
// record cannot survive: the value of what the room said is that it is what
// they said, not what the coach remembers afterwards.
//
// Four blocks hold numbers or a fixed list rather than sentences, and for those
// the button is not offered and the reason is said out loud, which is better
// than a button that quietly files a sentence somewhere nobody chose.
//
// The QR code is drawn here rather than fetched, so nothing about the session
// leaves for a third party to draw it. A link in a URL sent to an image service
// is the link, handed over.
//
// Marking is not deleting. The sentence stays with the name on it, because the
// reason to go back to a contribution is usually to go back to the person.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '@/lib/supabase'
import { GATES } from '@/lib/gtcv-gates'
import { promotionTargetFor } from '@/lib/session-promotion'
import CopyLink from '@/components/common/CopyLink'
import { formatJoinCode } from '@/lib/join-code'

const C = {
  white: 'var(--cv-card)', border: 'var(--cv-border)', navy: 'var(--cv-navy)',
  slate: 'var(--cv-slate)', cyan: 'var(--cv-teal)', green: 'var(--cv-green)',
  amber: 'var(--cv-amber)', red: 'var(--cv-red)',
}
const mono = { fontFamily: 'monospace' }
const hint = { fontSize: '0.9rem', color: C.slate, lineHeight: 1.5 }
const label = {
  ...mono, fontSize: '0.68rem', letterSpacing: '.1em', textTransform: 'uppercase',
  color: C.slate, display: 'block', marginBottom: '0.3rem',
}
const field = {
  width: '100%', padding: '0.5rem 0.6rem', border: `1px solid ${C.border}`,
  borderRadius: 7, background: 'var(--cv-bg-2)', color: C.navy, fontSize: '0.98rem',
}
const solid = {
  ...mono, fontSize: '0.9rem', fontWeight: 700, padding: '0.45rem 1rem', border: 'none',
  borderRadius: 7, background: C.cyan, color: 'var(--cv-on-accent)', cursor: 'pointer',
}
const ghost = {
  ...mono, fontSize: '0.85rem', padding: '0.3rem 0.7rem', border: `1px solid ${C.border}`,
  borderRadius: 6, background: 'transparent', color: C.slate, cursor: 'pointer',
}

async function api(path, method, body, query) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(`${path}${query || ''}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`)
  return json
}

function when(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export default function SessionRoom({ clientId, canManage, sessions = [] }) {
  const [dpId, setDpId] = useState('dp01')
  const [sessionId, setSessionId] = useState('')
  const [hours, setHours] = useState('12')
  const [links, setLinks] = useState([])
  const [contributions, setContributions] = useState([])
  const [qr, setQr] = useState({})
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)
  const [note, setNote] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showUsed, setShowUsed] = useState(false)

  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const urlFor = (token) => `${origin}/session/${token}`

  const load = useCallback(async () => {
    if (!clientId) { setLoading(false); return }
    setLoading(true)
    try {
      const [l, c] = await Promise.all([
        api('/api/session-link', 'GET', null, `?clientId=${encodeURIComponent(clientId)}`),
        api('/api/session-contributions', 'GET', null, `?clientId=${encodeURIComponent(clientId)}`),
      ])
      setLinks(l.links || [])
      setContributions(c.contributions || [])
      setErr(null)
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  // Draw a QR for each open link. Done here so the link never leaves for a
  // third party to draw it: a URL sent to an image service is the link, given
  // away.
  useEffect(() => {
    let cancelled = false
    const open = links.filter((l) => !l.revoked_at && (!l.expires_at || new Date(l.expires_at) > new Date()))
    Promise.all(open.map(async (l) => {
      const data = await QRCode.toDataURL(urlFor(l.access_token), { width: 260, margin: 1 })
      return [l.id, data]
    })).then((pairs) => { if (!cancelled) setQr(Object.fromEntries(pairs)) }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, origin])

  async function open() {
    setBusy('open'); setErr(null); setNote(null)
    try {
      await api('/api/session-link', 'POST', {
        clientId, dpId, sessionId: sessionId || undefined,
        hours: Number(hours) || undefined,
        label: sessions.find((s) => s.id === sessionId)?.title || undefined,
      })
      setNote('Open. Put the code on screen, or send the link.')
      await load()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  async function close(id) {
    if (typeof window !== 'undefined' && !window.confirm('Close this link? Anybody still holding it stops being able to add.')) return
    setBusy(`close:${id}`); setErr(null); setNote(null)
    try {
      await api('/api/session-link', 'DELETE', { clientId, id })
      setNote('Closed.')
      await load()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  async function mark(id, used) {
    setBusy(`mark:${id}`); setErr(null); setNote(null)
    try {
      const res = await api('/api/session-contributions', 'PATCH', { clientId, id, used })
      // Undoing removes the draft row it made, unless somebody has since worked
      // on it. Saying which happened matters: the coach is about to go looking
      // for a row that is either there or not.
      if (used === false && res?.keptRow) {
        setNote('Put back. The row it became has been edited since, so that has been left in the table.')
      } else if (used === false) {
        setNote('Put back on the pile.')
      }
      await load()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  async function promote(id) {
    setBusy(`promote:${id}`); setErr(null); setNote(null)
    try {
      const res = await api('/api/session-contributions', 'POST', { clientId, id })
      setNote(`Added as ${res?.describes || 'a row'}. Open the block to finish it off.`)
      await load()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  // Copying now lives in CopyLink, which every sharing surface uses, so that
  // getting a link onto a laptop works the same way wherever you are standing.

  if (loading) return <p style={hint}>Loading the room...</p>

  const live = links.filter((l) => !l.revoked_at && (!l.expires_at || new Date(l.expires_at) > new Date()))
  const shown = showUsed ? contributions : contributions.filter((c) => !c.promoted_at)
  const usedCount = contributions.filter((c) => c.promoted_at).length

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem 1.1rem', background: C.white }}>
      <div style={{ ...mono, fontSize: '0.75rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
        The room
      </div>
      <p style={{ ...hint, margin: '0.4rem 0 0', maxWidth: '92ch' }}>
        Open a block to the room and everybody in it can add what they would have said, from their own
        phone, with no account and no password. They see each other's answers, which is the point: eight
        views of the same question, side by side, instead of one person&rsquo;s memory of them. The link
        opens one block and stops working when you close it or when it expires.
      </p>

      {err ? <p style={{ color: C.red, fontSize: '0.95rem', margin: '0.6rem 0 0' }}>{err}</p> : null}
      {note ? <p style={{ color: C.cyan, fontSize: '0.95rem', margin: '0.6rem 0 0' }}>{note}</p> : null}

      {canManage ? (
        <div style={{
          marginTop: '1rem', border: `1px solid ${C.border}`, borderRadius: 10,
          background: 'var(--cv-alt)', padding: '0.85rem 1rem',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.8rem' }}>
            <div>
              <label htmlFor="sr-block" style={label}>Which block</label>
              <select id="sr-block" style={field} value={dpId} onChange={(e) => setDpId(e.target.value)}>
                {GATES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="sr-session" style={label}>Which session (optional)</label>
              <select id="sr-session" style={field} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                <option value="">Not tied to a planned session</option>
                {sessions.filter((s) => s.dp_id === dpId).map((s) => (
                  <option key={s.id} value={s.id}>{s.title || 'Untitled session'}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sr-hours" style={label}>Open for (hours)</label>
              <input id="sr-hours" type="number" min="1" max="168" style={field} value={hours}
                onChange={(e) => setHours(e.target.value)} />
            </div>
          </div>
          <button type="button" style={{ ...solid, marginTop: '0.8rem' }} disabled={busy === 'open'} onClick={open}>
            {busy === 'open' ? 'Opening...' : 'Open this block to the room'}
          </button>
          <p style={{ ...hint, margin: '0.5rem 0 0' }}>
            Tying it to a planned session keeps two sessions on the same block from reading each
            other&rsquo;s answers.
          </p>
        </div>
      ) : null}

      {live.length > 0 ? (
        <div style={{ marginTop: '1.2rem' }}>
          <div style={{ ...mono, fontSize: '0.72rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
            Open now
          </div>
          {live.map((l) => (
            <div key={l.id} style={{
              marginTop: '0.7rem', border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.85rem 1rem',
              display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap',
            }}>
              {qr[l.id] ? (
                <img src={qr[l.id]} alt={`QR code for ${l.grantee_name || 'the session'}`} width={130} height={130}
                  style={{ borderRadius: 8, background: '#fff', padding: 6 }} />
              ) : null}
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700, color: C.navy }}>{l.grantee_name || 'Working session'}</div>
                <div style={{ ...hint, marginTop: 2 }}>
                  {GATES.find((g) => g.id === l.scope_dp_id)?.label || l.scope_dp_id}
                  {l.expires_at ? ` · closes ${when(l.expires_at)}` : ''}
                  {l.last_accessed_at ? ` · last opened ${when(l.last_accessed_at)}` : ' · not opened yet'}
                </div>
                {l.join_code ? (
                  <div style={{
                    marginTop: '0.6rem', padding: '0.6rem 0.75rem', borderRadius: 9,
                    background: 'var(--cv-bg-2)', border: `1px solid ${C.border}`,
                  }}>
                    <div style={{ ...label, marginBottom: '0.25rem' }}>Put this on the screen</div>
                    <div style={{
                      ...mono, fontSize: '1.45rem', fontWeight: 700, letterSpacing: '.16em',
                      color: C.navy,
                    }}>{formatJoinCode(l.join_code)}</div>
                    <div style={{ ...hint, fontSize: '0.85rem', marginTop: '0.3rem' }}>
                      They go to <strong style={{ ...mono, color: C.navy }}>{origin.replace(/^https?:\/\//, '')}/join</strong>{' '}
                      and type it. No account, nothing to install.
                    </div>
                  </div>
                ) : null}

                <div style={{ marginTop: '0.6rem' }}>
                  <CopyLink url={urlFor(l.access_token)}
                    hint="The long way in, for sending to somebody who is not in the room." />
                </div>
                {canManage ? (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                    <button type="button" style={{ ...ghost, color: C.red }} disabled={busy === `close:${l.id}`}
                      onClick={() => close(l.id)}>{busy === `close:${l.id}` ? 'Closing...' : 'Close it'}</button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ marginTop: '1.4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.8rem', flexWrap: 'wrap' }}>
          <div style={{ ...mono, fontSize: '0.72rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
            What the rooms have added
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" style={ghost} onClick={load}>Refresh</button>
            {usedCount > 0 ? (
              <button type="button" style={ghost} onClick={() => setShowUsed((v) => !v)}>
                {showUsed ? `Hide the ${usedCount} already used` : `Show the ${usedCount} already used`}
              </button>
            ) : null}
          </div>
        </div>

        {shown.length === 0 ? (
          <p style={{ ...hint, marginTop: '0.7rem' }}>
            {contributions.length === 0
              ? 'Nothing yet. Open a block to the room and it will appear here as people type.'
              : 'Everything the rooms have added has been used.'}
          </p>
        ) : shown.map((c) => (
          <div key={c.id} style={{
            marginTop: '0.7rem', border: `1px solid ${C.border}`, borderRadius: 10,
            padding: '0.8rem 0.95rem', opacity: c.promoted_at ? 0.6 : 1,
          }}>
            <div style={{ ...hint, ...mono, fontSize: '0.75rem', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              {c.contributor_name}{c.contributor_role ? ` · ${c.contributor_role}` : ''}
              {' · '}{GATES.find((g) => g.id === c.dp_id)?.label || c.dp_id}
              {' · '}{when(c.created_at)}
            </div>
            <p style={{ margin: '0.4rem 0 0', color: C.navy, fontSize: '1rem', whiteSpace: 'pre-wrap' }}>{c.contribution}</p>
            {canManage ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: '0.6rem' }}>
                {!c.promoted_at && promotionTargetFor(c.dp_id) ? (
                  <button type="button" style={{ ...ghost, borderColor: C.cyan, color: C.cyan }}
                    disabled={busy === `promote:${c.id}`}
                    onClick={() => promote(c.id)}>
                    {busy === `promote:${c.id}`
                      ? 'Adding...'
                      : `Add to the block as ${promotionTargetFor(c.dp_id).describes}`}
                  </button>
                ) : null}
                <button type="button" style={ghost} disabled={busy === `mark:${c.id}`}
                  onClick={() => mark(c.id, !c.promoted_at)}>
                  {busy === `mark:${c.id}`
                    ? 'Saving...'
                    : c.promoted_at ? 'Put it back on the pile' : 'Mark as used'}
                </button>
                {c.promoted_to_table ? (
                  <span style={{ ...hint, fontSize: '0.82rem' }}>In the block already.</span>
                ) : !c.promoted_at && !promotionTargetFor(c.dp_id) ? (
                  <span style={{ ...hint, fontSize: '0.82rem' }}>
                    This block holds numbers rather than sentences, so this one is yours to place.
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}

        <p style={{ ...hint, marginTop: '0.9rem', maxWidth: '92ch' }}>
          Adding one to the block puts it in the block&apos;s own table in the words it was said in, with
          everything else left blank for you to complete. It is a draft, not a finding.
        </p>
        <p style={{ ...hint, marginTop: '0.5rem', maxWidth: '92ch' }}>
          Marking one as used does not delete it. It stays here with the name on it, because the reason
          to come back to something somebody said is usually to come back to the person who said it.
          Putting one back removes the draft it made, unless you have already worked on that draft, in
          which case your work stays and you are told so.
        </p>
      </div>
    </div>
  )
}
