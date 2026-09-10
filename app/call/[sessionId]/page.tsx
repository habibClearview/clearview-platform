// @ts-nocheck
'use client'
// ============================================================
// ROUTE: /call/[sessionId] — the session, held on the platform
//
// One page, one link, and everything a session needs on it: the call, the
// recording, and the sentence that has to be read before either.
//
// This is what Habib described for the first Ikore engagement. He and the
// funder and the Executive Director are in three places. He sends one link.
// Everybody opens it and is in the call, because they already have a login on
// this platform and there is no other account anywhere. He presses Start
// recording once and every device in the call begins recording its own
// microphone, with nothing for anybody else to press. He can see, while it
// runs, that all three are actually recording.
//
// THE SAME PAGE SERVES A ROOM SITTING TOGETHER. Nobody has to join the call:
// three laptops on a table, each recording the person in front of it, gives a
// better record than one microphone in the middle. The call is there when the
// room is not in one place, and ignored when it is.
// ============================================================
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import SessionCall from '@/components/gtcv/SessionCall'
import SessionRecorder from '@/components/gtcv/SessionRecorder'
import TranscriptPanel from '@/components/gtcv/TranscriptPanel'
import { markSignedIn, RETURN_TO_KEY, RETURN_TO_AT_KEY } from '@/lib/auth/session-guard'

const C = { navy: 'var(--cv-navy)', slate: 'var(--cv-slate)', border: 'var(--cv-border)', red: 'var(--cv-red)' }

export default function SessionCallPage({ params }) {
  const sessionId = params?.sessionId
  const [state, setState] = useState('checking')
  const [session, setSession] = useState(null)
  const [client, setClient] = useState(null)
  const [me, setMe] = useState(null)
  const [canManage, setCanManage] = useState(false)
  const [recordingId, setRecordingId] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session: auth } } = await supabase.auth.getSession()
      if (!auth) {
        // Come back here once they are in, rather than dropping them on a
        // dashboard and making them find the session again.
        try {
          localStorage.setItem(RETURN_TO_KEY, `/call/${sessionId}`)
          localStorage.setItem(RETURN_TO_AT_KEY, String(Date.now()))
        } catch { /* not essential */ }
        window.location.href = '/'
        return
      }
      markSignedIn()

      // Row level security decides this: a person not on the engagement reads
      // nothing, so there is no separate permission check to get wrong.
      const { data: s } = await supabase
        .from('gtcv_sessions').select('id,client_id,title,dp_id,planned_date').eq('id', sessionId).maybeSingle()
      if (cancelled) return
      if (!s) { setState('denied'); return }
      setSession(s)

      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from('engagement_clients').select('id,name').eq('id', s.client_id).maybeSingle(),
        supabase.from('user_profiles').select('full_name,role').eq('id', auth.user.id).maybeSingle(),
      ])
      if (cancelled) return
      setClient(c || null)
      setMe(p || null)

      // Who may start and stop a recording is the server's decision, so it is
      // asked rather than guessed from a role name here.
      try {
        const res = await fetch(`/api/session-recording?clientId=${encodeURIComponent(s.client_id)}`, {
          headers: { Authorization: `Bearer ${auth.access_token}` },
        })
        const json = await res.json().catch(() => ({}))
        if (!cancelled) setCanManage(Boolean(json?.canManage))
      } catch { /* the buttons simply do not appear */ }

      setState('ready')
    })().catch((e) => { if (!cancelled) { setErr(e.message); setState('denied') } })
    return () => { cancelled = true }
  }, [sessionId])

  // THE TRANSCRIPT APPEARS WHEN THERE IS SOMETHING TO TRANSCRIBE. The panel is
  // asked for the session's most recent recording, whether it is still running
  // or finished, so pressing Stop is followed by the transcript on the same
  // page rather than by going somewhere else to look for it.
  useEffect(() => {
    if (state !== 'ready' || !session) return
    let cancelled = false
    const tick = async () => {
      try {
        const { data: { session: auth } } = await supabase.auth.getSession()
        if (!auth) return
        const res = await fetch(`/api/session-recording?sessionId=${encodeURIComponent(session.id)}&clientId=${encodeURIComponent(session.client_id)}`, {
          headers: { Authorization: `Bearer ${auth.access_token}` },
        })
        const json = await res.json().catch(() => ({}))
        if (!cancelled) setRecordingId(json?.recording?.id || null)
      } catch { /* the panel simply does not appear yet */ }
    }
    tick()
    const t = setInterval(tick, 10000)
    return () => { cancelled = true; clearInterval(t) }
  }, [state, session])

  if (state === 'checking') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: C.slate }}>
      Loading...
    </div>
  )

  if (state === 'denied') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '0.6rem', padding: '2rem', textAlign: 'center' }}>
      <div style={{ color: C.red, fontWeight: 700 }}>This session is not open to you.</div>
      <div style={{ color: C.slate, fontSize: '0.92rem' }}>
        {err || 'Either the link is wrong or you are not on this engagement. Ask the person who sent it.'}
      </div>
      <a href="/" style={{ color: C.navy, fontSize: '0.9rem' }}>Back to your dashboard</a>
    </div>
  )

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '1.6rem 1.2rem 3rem' }}>
      {/* A WAY BACK. 10 September 2026. Habib: there is no way of getting back
          to the client page after the recording, and I assume this is what
          would happen to the client as well. There was not: this page is opened
          from a link and had nothing on it pointing anywhere. */}
      <a
        href={canManage ? `/coach?client=${encodeURIComponent(session.client_id)}&zone=sessions` : '/client'}
        style={{
          fontFamily: 'var(--cv-font-mono)', fontSize: '0.85rem', color: C.navy,
          textDecoration: 'none', display: 'inline-block', marginBottom: '0.9rem',
        }}
      >
        &larr; Back to {client?.name || 'the engagement'}
      </a>

      <div style={{ marginBottom: '1.1rem' }}>
        <div style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.76rem', letterSpacing: '.12em', textTransform: 'uppercase', color: C.slate }}>
          {client?.name || 'Engagement'}
        </div>
        <h1 style={{ margin: '0.25rem 0 0', fontSize: '1.5rem', color: C.navy }}>
          {session?.title || 'Working session'}
        </h1>
      </div>

      <SessionCall clientId={session.client_id} sessionId={session.id} />

      <div style={{ height: '1.1rem' }} />

      <SessionRecorder
        clientId={session.client_id}
        sessionId={session.id}
        dpId={session.dp_id || null}
        canManage={canManage}
        clientName={client?.name || 'this engagement'}
        title={session?.title || null}
        speakerName={me?.full_name || null}
      />

      {recordingId && (
        <>
          <div style={{ height: '1.1rem' }} />
          <TranscriptPanel recordingId={recordingId} canManage={canManage} />
        </>
      )}

      <div style={{ marginTop: '1.2rem', fontSize: '0.88rem', color: C.slate, lineHeight: 1.55, borderTop: `1px solid ${C.border}`, paddingTop: '0.9rem' }}>
        Your own device records your own microphone, at full quality, whatever the call is doing. If your
        connection drops, your recording carries on and is sent when it returns. Leave this tab open until
        the session ends.
      </div>
    </div>
  )
}
