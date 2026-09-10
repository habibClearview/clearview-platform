// @ts-nocheck
'use client'
// ============================================================
// THE CALL, CARRIED BY THE PLATFORM
//
// Habib's requirement, in his words: the only brand that would be seen is
// Clearview, there is no third party login or anything that would cause
// friction. So this is not a link out to somebody else's product. The call
// happens on the engagement's own page, under the platform's own sign in, and
// nobody installs anything.
//
// WHY THE CALL AND THE RECORDING ARE SEPARATE THINGS ON ONE PAGE.
//
// The call is how three people in three countries hear each other. The
// recording is how their words are kept. Tying the two together is the mistake
// almost every product makes: it records the call's mixed output, which is one
// muddy track of everybody, compressed to whatever the worst line could carry,
// and useless the moment somebody's connection wobbles.
//
// Here the call carries the conversation and each person's own device records
// their own microphone at full quality. So the recording survives a bad line,
// survives somebody dropping out and rejoining, and gives the transcript one
// clean voice per speaker instead of asking software to guess who spoke. It
// also means a room of people sitting together physically needs no call at
// all, and the recording works exactly the same way.
//
// WHAT SOMEBODY DOES TO JOIN. They open the link and they are in. They have a
// login already because they are on the engagement. There is no meeting id, no
// waiting room, no download, and no account with anybody else.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import {
  LiveKitRoom, RoomAudioRenderer, ControlBar, GridLayout, ParticipantTile,
  useTracks, useParticipants, ConnectionStateToast,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import '@livekit/components-styles'
import { supabase } from '@/lib/supabase'
import { deviceId } from '@/lib/recorder-client'

const C = {
  card: 'var(--cv-card)', border: 'var(--cv-border)', slate: 'var(--cv-slate)',
  navy: 'var(--cv-navy)', teal: 'var(--cv-teal)', red: 'var(--cv-red)', amber: 'var(--cv-amber)',
}
const hint = { fontSize: '0.9rem', color: C.slate, lineHeight: 1.5 }

/**
 * Why the call ended, in words somebody can act on.
 *
 * The service reports a number. "Disconnected: 2" tells a person nothing, and
 * the one that matters here is DUPLICATE_IDENTITY, which is what happens when
 * the same person joins twice and is the failure that wasted an afternoon.
 */
function disconnectReason(reason) {
  switch (reason) {
    case 1: return 'The lead consultant ended the call.'
    case 2: return 'You were removed from the call.'
    case 3: return 'You joined this call on another device, so this one left. Only one is needed.'
    case 4: return 'The call was closed by the service.'
    case 5: return 'The connection to the call was lost. Press Join the call to come back.'
    case 6: return 'The room was closed.'
    default: return 'The call ended. Press Join the call to come back.'
  }
}

/**
 * WHO IS ON THE CALL, IN WORDS.
 *
 * Habib: I am not able to see if anyone else joined. On an audio call the tiles
 * are placeholders and it is genuinely hard to tell one grey square from an
 * empty room, so the names are also written out. This is the answer to "is the
 * funder here yet", which is asked at the start of every session.
 */
function WhoIsHere() {
  const people = useParticipants()
  return (
    <div style={{ ...hint, padding: '0.55rem 0.9rem', borderTop: `1px solid ${C.border}` }}>
      {people.length <= 1
        ? 'You are the only one here so far. Send them the link to this page.'
        : `On the call: ${people.map((p) => p.name || p.identity.split('::')[0]).join(', ')}.`}
    </div>
  )
}

/** Everybody in the room, camera or shared screen, laid out evenly. */
function Faces() {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true },
     { source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  )
  return (
    <GridLayout tracks={tracks} style={{ height: 'min(58vh, 460px)' }}>
      <ParticipantTile />
    </GridLayout>
  )
}

export default function SessionCall({ clientId, sessionId = null, onConnected = null }) {
  const [conn, setConn] = useState(null)
  const [err, setErr] = useState(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [joining, setJoining] = useState(false)

  const join = useCallback(async () => {
    setJoining(true); setErr(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const res = await fetch('/api/call-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ clientId, sessionId, deviceId: deviceId() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (json?.notConfigured) setNotConfigured(true)
        throw new Error(json?.error || `Could not join (${res.status})`)
      }
      setConn(json)
      onConnected?.(json)
    } catch (e) { setErr(e.message) }
    setJoining(false)
  }, [clientId, sessionId, onConnected])

  // The pass lasts two hours and a session can run longer, so it is renewed
  // quietly rather than dropping somebody out of a meeting.
  useEffect(() => {
    if (!conn) return
    const t = setInterval(() => { join() }, 1000 * 60 * 100)
    return () => clearInterval(t)
  }, [conn, join])

  if (notConfigured) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.amber}`, borderRadius: 12, padding: '1rem 1.1rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>The call is not switched on yet</div>
        <div style={hint}>
          The three LiveKit settings are not in the environment. Add LIVEKIT_API_KEY, LIVEKIT_API_SECRET and
          NEXT_PUBLIC_LIVEKIT_URL in Vercel, redeploy, and this becomes a call. Everything else on this page,
          including the recording, works without it.
        </div>
      </div>
    )
  }

  if (!conn) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem 1.1rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>The call</div>
        <div style={{ ...hint, marginBottom: '0.7rem' }}>
          Everyone on this engagement joins here. There is nothing to install and no second sign in.
        </div>
        <button onClick={join} disabled={joining} style={{
          fontFamily: 'var(--cv-font-mono)', fontSize: '0.9rem', fontWeight: 700,
          padding: '0.5rem 1.1rem', border: 'none', borderRadius: 7,
          background: C.teal, color: 'var(--cv-on-accent)', cursor: 'pointer',
        }}>
          {joining ? 'Joining...' : 'Join the call'}
        </button>
        {err && <div style={{ ...hint, marginTop: '0.6rem', color: C.red }}>{err}</div>}
      </div>
    )
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <LiveKitRoom
        token={conn.token}
        serverUrl={conn.url}
        connect
        audio
        video={false}
        onDisconnected={(reason) => {
          // A CALL THAT DROPS MUST SAY SO. 10 September 2026. This put the Join
          // the call button straight back with nothing on screen, so a failure
          // was indistinguishable from a click that did nothing, which is
          // exactly what it looked like.
          setConn(null)
          setErr(disconnectReason(reason))
        }}
        onError={(e) => setErr(e?.message || 'The call dropped')}
        data-lk-theme="default"
        style={{ height: 'auto' }}
      >
        <Faces />
        {/* Every voice, played out. Without this the call is silent. */}
        <RoomAudioRenderer />
        {/* The full bar, not the minimal one: camera and screen share are on
            it, and Habib could not find either. */}
        <ControlBar controls={{ microphone: true, camera: true, screenShare: true, leave: true }} />
        <ConnectionStateToast />
        <WhoIsHere />
      </LiveKitRoom>
      <div style={{ ...hint, padding: '0.6rem 0.9rem', borderTop: `1px solid ${C.border}` }}>
        Muting yourself here stops the others hearing you. It does not stop your own device recording your words,
        so nothing you say to the room is lost by muting the call.
      </div>
      {err && <div style={{ ...hint, padding: '0 0.9rem 0.7rem', color: C.red }}>{err}</div>}
    </div>
  )
}
