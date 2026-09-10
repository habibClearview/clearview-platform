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

function length(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  if (s < 60) return `${s} sec`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr ${m % 60} min`
}

export default function RecordingsPanel({ clientId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

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
      setRows(json.recordings || [])
      setErr(null)
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem 1.1rem' }}>
      <div style={{ ...mono, fontSize: '0.78rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
        What has been recorded
      </div>
      <div style={{ ...hint, marginTop: '0.2rem' }}>
        Every recording on this engagement, who was on it, and what state its transcript is in.
      </div>

      {loading && <div style={{ ...hint, marginTop: '0.6rem' }}>Reading...</div>}
      {err && (
        <div style={{ ...hint, marginTop: '0.6rem', color: C.red }}>
          {err}{' '}
          <button onClick={load} style={{ ...mono, fontSize: '0.82rem', color: C.red, background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}>Try again</button>
        </div>
      )}

      {!loading && !err && rows.length === 0 && (
        <div style={{ ...hint, marginTop: '0.6rem' }}>
          Nothing has been recorded yet. Open a session room and press Start recording.
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
            </div>
          </div>
        )
      })}
    </div>
  )
}
