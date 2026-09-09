// @ts-nocheck
'use client'
// ============================================================
// RECORDING THE SESSION
//
// The method rests on verbatim, and verbatim used to mean somebody typing fast
// enough. This panel is what replaces that.
//
// WHAT HABIB ASKED, AND WHAT EACH ANSWER IS.
//
//   "what happens if one person pauses or mutes the mic"
//     Every device records its own microphone into its own file. Muting the
//     call mutes what the others hear; it does not stop that device recording.
//     The person's own words are still captured.
//
//   "or the record button is not clicked at the same time"
//     It never is. The server stamped the moment the recording opened and each
//     device reports how long after that stamp its own recorder began. The
//     tracks are laid on that one timeline, so starting seconds apart is
//     arithmetic rather than a problem.
//
//   "how possible is it to click record on the platform and it activates
//    record on each person's device"
//     This is that. One person presses Start recording. Every other device in
//     the session sees within a few seconds that a recording is open and
//     starts its own, with no button for them to press and nothing for them to
//     install. The only thing they ever do is allow the microphone once, the
//     first time, the way any website asks.
//
//   "what if somebody's recording silently fails"
//     It cannot be silent. Each device reports itself every half minute and
//     this panel shows a line per person: green with the minutes captured, or
//     red with the reason. A failure is found in the first minute, out loud,
//     while it can still be fixed.
//
// NOBODY IS RECORDED WHO DID NOT AGREE. If anybody on the engagement has
// refused, or has never been asked, the recording will not open and this
// screen says who to ask. Silence is never taken as agreement. The consent
// sentence is here to be read aloud, and the answers are recorded against the
// people so it is asked once rather than every session.
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { consentSentence } from '@/lib/recording'
import { DeviceRecorder, recordingSupport } from '@/lib/recorder-client'

const C = {
  card: 'var(--cv-card)', border: 'var(--cv-border)', slate: 'var(--cv-slate)',
  navy: 'var(--cv-navy)', teal: 'var(--cv-teal)', green: 'var(--cv-green)',
  amber: 'var(--cv-amber)', red: 'var(--cv-red)',
}
const mono = { fontFamily: 'var(--cv-font-mono)' }
const hint = { fontSize: '0.88rem', color: C.slate, lineHeight: 1.5 }
const btn = (col, solid) => ({
  ...mono, fontSize: '0.86rem', fontWeight: 700, padding: '0.42rem 0.95rem',
  border: `1px solid ${col}`, borderRadius: 7,
  background: solid ? col : 'transparent',
  color: solid ? 'var(--cv-on-accent)' : col, cursor: 'pointer',
})

async function api(method, body, query) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(`/api/session-recording${query || ''}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(json?.error || `Request failed (${res.status})`); e.detail = json; throw e }
  return json
}

function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function SessionRecorder({
  clientId, canManage, sessionId = null, interviewId = null, dpId = null,
  clientName = 'this engagement', title = null, speakerName = null,
  // Told the most recent recording on this session or interview, whether it is
  // still running or finished, so the screen around this one can put the
  // transcript directly underneath rather than sending somebody elsewhere.
  onRecording = null,
}) {
  const [recording, setRecording] = useState(null)
  const [live, setLive] = useState([])
  const [seconds, setSeconds] = useState(0)
  const [mine, setMine] = useState({ status: 'idle', seconds: 0, uploaded: 0, waiting: 0 })
  const [err, setErr] = useState(null)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(null)
  const [consentBlock, setConsentBlock] = useState(null)
  const [parties, setParties] = useState([])
  const [allowed, setAllowed] = useState(null)

  const recorderRef = useRef(null)
  const support = typeof window === 'undefined' ? { ok: true } : recordingSupport()

  // Has this browser already been given the microphone? If it has, this device
  // can start itself with nothing for the person to press.
  useEffect(() => {
    let cancelled = false
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) { setAllowed(null); return }
    navigator.permissions.query({ name: 'microphone' })
      .then((p) => { if (!cancelled) setAllowed(p.state === 'granted') })
      .catch(() => { if (!cancelled) setAllowed(null) })
    return () => { cancelled = true }
  }, [])

  const query = sessionId
    ? `?sessionId=${encodeURIComponent(sessionId)}&clientId=${encodeURIComponent(clientId)}`
    : interviewId
      ? `?interviewId=${encodeURIComponent(interviewId)}&clientId=${encodeURIComponent(clientId)}`
      : `?clientId=${encodeURIComponent(clientId)}`

  const read = useCallback(async () => {
    try {
      const r = await api('GET', null, query)
      const open = r.recording && r.recording.status === 'opening' ? r.recording : null
      setRecording(open)
      onRecording?.(r.recording?.id || null)
      setLive(r.live || [])
      setSeconds(r.seconds || 0)
    } catch (e) { setErr(e.message) }
  }, [query, onRecording])

  useEffect(() => { read() }, [read])

  // Five seconds. Fast enough that a device joins the recording almost as soon
  // as it opens, and that a failed microphone turns red while the sentence it
  // missed is still being said.
  useEffect(() => {
    const t = setInterval(read, 5000)
    return () => clearInterval(t)
  }, [read])

  // ─── THIS DEVICE STARTS ITSELF ─────────────────────────────
  // The whole answer to "one person presses record and everyone's device
  // records". Nobody else presses anything.
  useEffect(() => {
    if (!recording || !support.ok) return
    if (recorderRef.current) return
    if (allowed === false) return // They have to allow the microphone first.
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const rec = new DeviceRecorder({
        recordingId: recording.id,
        token: data.session?.access_token || null,
        speakerName,
        onChange: (s) => { if (!cancelled) setMine(s) },
      })
      recorderRef.current = rec
      try { await rec.start(); setAllowed(true) } catch (e) { setErr(e.message) }
    })()
    return () => { cancelled = true }
  }, [recording, allowed, support.ok, speakerName])

  // When the recording closes, this device stops itself and flushes what it
  // is still holding.
  useEffect(() => {
    if (recording || !recorderRef.current) return
    const rec = recorderRef.current
    recorderRef.current = null
    rec.stop().catch(() => {})
  }, [recording])

  // A tab closed mid-session must not take the last half minute with it.
  useEffect(() => {
    const leave = () => { recorderRef.current?.stop().catch(() => {}) }
    window.addEventListener('pagehide', leave)
    return () => { window.removeEventListener('pagehide', leave); leave() }
  }, [])

  async function loadParties() {
    const { data } = await supabase.from('engagement_parties')
      .select('id,name,party_role,recording_consent').eq('client_id', clientId).order('name')
    setParties(data || [])
  }

  async function start() {
    setBusy('start'); setErr(null); setNote(null); setConsentBlock(null)
    try {
      const r = await api('POST', {
        action: 'open', clientId, sessionId, interviewId, dpId, title,
      })
      setRecording(r.recording)
      setNote('Recording. Every device on this session starts itself within a few seconds.')
    } catch (e) {
      if (e.detail?.needsConsent) { setConsentBlock(e.detail); await loadParties() }
      else setErr(e.message)
    }
    setBusy(null)
  }

  async function stop() {
    setBusy('stop'); setErr(null)
    try {
      await recorderRef.current?.stop()
      recorderRef.current = null
      const r = await api('POST', { action: 'stop', recordingId: recording.id })
      setRecording(null)
      setNote(`Stopped. ${clock(r.seconds)} captured. The transcript is next.`)
      await read()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  async function markConsent(partyId, method) {
    setBusy(`consent:${partyId}`); setErr(null)
    try {
      await api('POST', { action: 'consent', clientId, partyId, method })
      await loadParties()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  async function allowMicrophone() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      s.getTracks().forEach((t) => t.stop())
      setAllowed(true)
      setNote('This device will now record whenever a session it is in is being recorded.')
    } catch {
      setErr('The microphone was refused. Press the padlock in the address bar and allow the microphone for this site.')
    }
  }

  const anyoneFailing = live.filter((l) => !l.ok)

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem 1.1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ ...mono, fontSize: '0.78rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
            Recording
          </div>
          <div style={{ ...hint, marginTop: '0.2rem' }}>
            {recording
              ? 'Every device in this session is recording its own microphone.'
              : 'One press records everybody, each on their own microphone, wherever they are.'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {recording && (
            <span style={{ ...mono, fontSize: '1.05rem', fontWeight: 700, color: C.red }}>
              ● {clock(seconds || mine.seconds)}
            </span>
          )}
          {canManage && !recording && (
            <button onClick={start} disabled={busy === 'start'} style={btn(C.red, true)}>
              {busy === 'start' ? 'Starting...' : 'Start recording'}
            </button>
          )}
          {canManage && recording && (
            <button onClick={stop} disabled={busy === 'stop'} style={btn(C.navy, true)}>
              {busy === 'stop' ? 'Stopping...' : 'Stop recording'}
            </button>
          )}
        </div>
      </div>

      {!support.ok && (
        <div style={{ ...hint, marginTop: '0.7rem', color: C.amber }}>
          This device cannot record: {support.reason}
        </div>
      )}

      {support.ok && allowed === false && (
        <div style={{ marginTop: '0.8rem', padding: '0.7rem 0.8rem', border: `1px solid ${C.amber}`, borderRadius: 8 }}>
          <div style={hint}>
            This device has not been given the microphone yet, so it will not record. Allow it once and it never asks again.
          </div>
          <button onClick={allowMicrophone} style={{ ...btn(C.amber, true), marginTop: '0.5rem' }}>
            Allow my microphone
          </button>
        </div>
      )}

      {/* ─── WHO IS ACTUALLY RECORDING, WHILE IT RUNS ───────── */}
      {recording && (
        <div style={{ marginTop: '0.9rem' }}>
          {live.length === 0 && <div style={hint}>Waiting for the first device to report.</div>}
          {live.map((l, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '0.3rem 0',
              borderBottom: i < live.length - 1 ? `1px solid ${C.border}` : 'none',
            }}>
              <span style={{ color: l.ok ? C.green : C.red, fontSize: '1rem' }}>{l.ok ? '●' : '▲'}</span>
              <span style={{ fontWeight: 600 }}>{l.who}</span>
              <span style={{ ...mono, fontSize: '0.82rem', color: C.slate, marginLeft: 'auto' }}>
                {l.ok ? `${l.minutes} min captured` : l.problem}
              </span>
            </div>
          ))}
          {anyoneFailing.length > 0 && (
            <div style={{ ...hint, marginTop: '0.6rem', color: C.red }}>
              Say it out loud now: {anyoneFailing.map((l) => l.who).join(', ')} {anyoneFailing.length === 1 ? 'is' : 'are'} not
              being recorded. Ask them to reload the page and allow the microphone.
            </div>
          )}
          {mine.waiting > 0 && (
            <div style={{ ...hint, marginTop: '0.5rem', color: C.amber }}>
              {mine.waiting} {mine.waiting === 1 ? 'piece' : 'pieces'} of your audio is waiting for signal. It is held on
              this device and sent as soon as the connection returns. Do not close this tab.
            </div>
          )}
        </div>
      )}

      {/* ─── NOBODY IS RECORDED WHO DID NOT AGREE ───────────── */}
      {consentBlock && (
        <div style={{ marginTop: '0.9rem', padding: '0.8rem', border: `1px solid ${C.amber}`, borderRadius: 8 }}>
          <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Not yet. {consentBlock.error}</div>
          <div style={{ ...hint, fontStyle: 'italic', margin: '0.6rem 0', paddingLeft: '0.7rem', borderLeft: `3px solid ${C.border}` }}>
            {consentSentence(clientName)}
          </div>
          <div style={{ ...hint, marginBottom: '0.5rem' }}>
            Read that out, then record what each person answered. It is asked once and it holds for every session.
          </div>
          {parties.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, minWidth: 180 }}>{p.name}</span>
              {p.recording_consent
                ? <span style={{ ...mono, fontSize: '0.8rem', color: p.recording_consent === 'refused' ? C.red : C.green }}>
                    {p.recording_consent === 'refused' ? 'Said no' : `Agreed, ${p.recording_consent}`}
                  </span>
                : (
                  <>
                    <button onClick={() => markConsent(p.id, 'spoken')} disabled={busy === `consent:${p.id}`} style={btn(C.green)}>Said yes</button>
                    <button onClick={() => markConsent(p.id, 'written')} disabled={busy === `consent:${p.id}`} style={btn(C.teal)}>Agreed in writing</button>
                    <button onClick={() => markConsent(p.id, 'refused')} disabled={busy === `consent:${p.id}`} style={btn(C.red)}>Said no</button>
                  </>
                )}
            </div>
          ))}
          <button onClick={start} style={{ ...btn(C.red, true), marginTop: '0.7rem' }}>Start recording</button>
        </div>
      )}

      {note && <div style={{ ...hint, marginTop: '0.6rem', color: C.green }}>{note}</div>}
      {err && <div style={{ ...hint, marginTop: '0.6rem', color: C.red }}>{err}</div>}
    </div>
  )
}
