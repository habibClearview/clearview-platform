// @ts-nocheck
'use client'
// ============================================================
// WHAT HAS BEEN RECORDED ON THIS ENGAGEMENT
//
// 10 September 2026. Habib: there is no list anywhere on the page or on the
// client page to show where and what has been recorded, who was on it.
//
// There was not. A recording could only be found by remembering which session
// it belonged to and opening that session's room, which means a record that
// exists and cannot be found, which is the same as no record.
//
// One line per recording: when, which session, how long, who was on it and
// whether their device worked, what state the transcript is in, and a way
// straight to it.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const C = {
  card: 'var(--cv-card)', border: 'var(--cv-border)', slate: 'var(--cv-slate)',
  navy: 'var(--cv-navy)', teal: 'var(--cv-teal)', green: 'var(--cv-green)',
  amber: 'var(--cv-amber)', red: 'var(--cv-red)',
}
const mono = { fontFamily: 'var(--cv-font-mono)' }
const hint = { fontSize: '0.9rem', color: C.slate, lineHeight: 1.5 }

const STATE = {
  opening: { label: 'Recording now', colour: C.red },
  recorded: { label: 'Recorded, not yet transcribed', colour: C.amber },
  merged: { label: 'Recorded', colour: C.amber },
  transcribed: { label: 'Transcribed', colour: C.teal },
  failed: { label: 'Failed', colour: C.red },
}

const TRANSCRIPT_STATE = {
  draft: { label: 'Transcript is a draft', colour: C.amber },
  issued: { label: 'Waiting for signatures', colour: C.amber },
  signed: { label: 'Signed and filed as evidence', colour: C.green },
}

function when(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function readableBytes(n) {
  const b = Math.max(0, Number(n) || 0)
  if (b < 1024) return `${b} bytes`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function length(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  if (s < 60) return `${s} sec`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr ${m % 60} min`
}

export default function RecordingsPanel({ clientId, canManage = false }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(null)
  const [note, setNote] = useState(null)
  const [leftover, setLeftover] = useState(null)

  const load = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const res = await fetch(`/api/session-recording?list=1&clientId=${encodeURIComponent(clientId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `Could not read the recordings (${res.status})`)
      // ONLY WHAT HAS NO SESSION TO SIT ON. 11 September 2026. Habib: the
      // evidence should be in the session box rather than at the bottom, by
      // the time you do a lot of sessions it would be too cluttered. Every
      // recording made in a session now appears on that session. What is left
      // here is what has no session: a field interview, and the pre-engagement
      // conversation, which happens before there is a plan.
      setRows((json.recordings || []).filter((r) => !r.session_id))
      setErr(null)

      // AUDIO NOTHING POINTS AT. 12 September 2026. Deleting a recording takes
      // its audio first and its row second. When rows were removed straight
      // from the database instead, the audio stayed behind with nothing on
      // screen to say so. Voices of named people that the platform no longer
      // admits to holding is the worst of both, so it says how much is there.
      if (canManage) {
        const lRes = await fetch(`/api/session-recording?leftover=1&clientId=${encodeURIComponent(clientId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const lJson = await lRes.json().catch(() => ({}))
        setLeftover(lRes.ok && lJson.files > 0 ? lJson : null)
      }
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [clientId, canManage])

  useEffect(() => { load() }, [load])

  /**
   * Remove a recording and its audio.
   *
   * A platform holding people's voices that cannot delete one has it the wrong
   * way round: a recording made in error, or one somebody withdraws consent
   * for, would have to stay for ever. It asks first, because it cannot be
   * undone and the audio is the only copy.
   */
  async function remove(r) {
    const what = `${r.heading}, ${when(r.started_at)}`
    if (typeof window !== 'undefined' && !window.confirm(
      `Delete this recording?\n\n${what}\n\nThe audio, the transcript and the signatures on it go with it. This cannot be undone.`,
    )) return
    setBusy(r.id); setErr(null); setNote(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const res = await fetch('/api/session-recording', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ recordingId: r.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `It could not be deleted (${res.status})`)
      setNote(`Deleted. ${json.filesRemoved || 0} ${json.filesRemoved === 1 ? 'piece' : 'pieces'} of audio removed.`)
      await load()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  /** Remove audio that no recording points at any more. */
  async function sweep() {
    if (typeof window !== 'undefined' && !window.confirm(
      `Remove ${leftover.files} leftover audio ${leftover.files === 1 ? 'file' : 'files'}?\n\n`
      + 'These belong to recordings that are no longer on the platform. This cannot be undone.',
    )) return
    setBusy('leftover'); setErr(null); setNote(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const res = await fetch('/api/session-recording', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ sweepClientId: clientId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `It could not be removed (${res.status})`)
      setNote(`Removed ${json.filesRemoved || 0} leftover audio ${json.filesRemoved === 1 ? 'file' : 'files'}.`)
      await load()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem 1.1rem' }}>
      <div style={{ ...mono, fontSize: '0.78rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
        What has been recorded
      </div>
      <div style={{ ...hint, marginTop: '0.2rem' }}>
        Recordings that do not belong to a planned session: field interviews, and the pre-engagement
        conversation. Everything recorded in a session is shown on that session in the plan above.
      </div>

      {loading && <div style={{ ...hint, marginTop: '0.6rem' }}>Reading...</div>}
      {note && <div style={{ ...hint, marginTop: '0.6rem', color: C.green }}>{note}</div>}
      {err && (
        <div style={{ ...hint, marginTop: '0.6rem', color: C.red }}>
          {err}{' '}
          <button onClick={load} style={{ ...mono, fontSize: '0.82rem', color: C.red, background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}>Try again</button>
        </div>
      )}

      {canManage && leftover && (
        <div style={{
          marginTop: '0.7rem', padding: '0.6rem 0.75rem', borderRadius: 8,
          border: `1px solid ${C.amber}`, background: 'transparent',
        }}>
          <div style={{ ...hint, color: C.navy }}>
            {leftover.files} audio {leftover.files === 1 ? 'file' : 'files'} ({readableBytes(leftover.bytes)}) are
            still in storage for recordings that are no longer on the platform. Nothing on this page plays them
            and nothing points at them.
          </div>
          <button
            type="button"
            onClick={sweep}
            disabled={busy === 'leftover'}
            style={{
              ...mono, fontSize: '0.8rem', marginTop: '0.45rem', padding: '0.25rem 0.6rem',
              border: `1px solid ${C.border}`, borderRadius: 6, background: 'transparent',
              color: C.red, cursor: 'pointer',
            }}
          >{busy === 'leftover' ? 'Removing...' : 'Remove them'}</button>
        </div>
      )}

      {!loading && !err && rows.length === 0 && (
        <div style={{ ...hint, marginTop: '0.6rem' }}>
          Nothing here. Recordings made in a planned session are shown on that session above.
        </div>
      )}

      {rows.map((r) => {
        const state = STATE[r.status] || { label: r.status, colour: C.slate }
        const t = r.transcript ? (TRANSCRIPT_STATE[r.transcript.status] || null) : null
        const broke = r.who.filter((w) => !w.ok)
        return (
          <div key={r.id} style={{ borderTop: `1px solid ${C.border}`, padding: '0.7rem 0' }}>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700 }}>{r.heading}</span>
              <span style={{ ...mono, fontSize: '0.8rem', color: C.slate }}>{when(r.started_at)}</span>
              {r.merged_seconds ? (
                <span style={{ ...mono, fontSize: '0.8rem', color: C.slate }}>{length(r.merged_seconds)}</span>
              ) : null}
              <span style={{ ...mono, fontSize: '0.8rem', color: state.colour, marginLeft: 'auto' }}>{state.label}</span>
            </div>

            <div style={{ ...hint, marginTop: '0.25rem' }}>
              {r.who.length === 0
                ? 'No device recorded on this one.'
                : <>Who was on it: {r.who.map((w) => `${w.name}${w.ok ? '' : ' (their device failed)'}`).join(', ')}.</>}
              {broke.length > 0 && <span style={{ color: C.red }}> {broke.length} of {r.who.length} captured nothing.</span>}
            </div>

            <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.4rem' }}>
              {r.session_id && (
                <a href={`/call/${r.session_id}`} style={{ ...mono, fontSize: '0.84rem', color: C.teal }}>
                  Open the session room
                </a>
              )}
              {t && <span style={{ ...mono, fontSize: '0.82rem', color: t.colour }}>{t.label}</span>}
              {!t && r.status !== 'opening' && (
                <span style={{ ...mono, fontSize: '0.82rem', color: C.amber }}>No transcript yet</span>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => remove(r)}
                  disabled={busy === r.id}
                  style={{
                    ...mono, fontSize: '0.8rem', marginLeft: 'auto', padding: '0.2rem 0.55rem',
                    border: `1px solid ${C.border}`, borderRadius: 6, background: 'transparent',
                    color: C.red, cursor: 'pointer',
                  }}
                >{busy === r.id ? 'Deleting...' : 'Delete'}</button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
