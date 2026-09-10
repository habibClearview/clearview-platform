// @ts-nocheck
'use client'
// ============================================================
// THE TRANSCRIPT
//
// What was said, in the words it was said in, with the name of the person who
// said it. This is the thing the whole method rests on and the thing that,
// until now, depended on somebody typing fast enough.
//
// IT IS PRODUCED ONE TRACK AT A TIME. A track is one person, and a two hour
// session is a lot of audio. Doing all of it in one request is how a long
// session ends with nothing at all, so this asks for the next track, shows
// what came back, and asks again until there are none left. Closing the tab
// half way through loses nothing: what is done is saved and the next press
// carries on from there.
//
// CORRECT, THEN ISSUE, THEN SIGN. The coaching team corrects what came back
// wrong while it is still a draft. Issuing locks the words. Signing is a
// person typing their own name, which is what a signature is; a tick beside a
// name is somebody agreeing that a name exists.
//
// A CORRECTION AFTER SIGNING MAKES A NEW VERSION, and the signatures already
// given stay against the words that were signed. Nobody's name is ever moved
// onto words they did not read.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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

async function api(path, method, body, query) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(`${path}${query || ''}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(json?.error || `Request failed (${res.status})`); e.detail = json; throw e }
  return json
}

const STATUS_LABEL = {
  draft: 'Draft, correctable',
  issued: 'Issued for signature',
  signed: 'Signed by everybody who was in the room',
}

export default function TranscriptPanel({ recordingId, canManage = false }) {
  const [transcript, setTranscript] = useState(null)
  const [signatures, setSignatures] = useState([])
  const [inTheRoom, setInTheRoom] = useState([])
  // Each person's own audio, so the transcript can be checked against what
  // was actually said rather than trusted.
  const [tracks, setTracks] = useState([])
  // Fetched only when somebody asks for it. A session is a large file and
  // loading three of them because a page opened would be rude on a phone.
  const [audio, setAudio] = useState({})
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(null)
  const [progress, setProgress] = useState(null)
  const [typed, setTyped] = useState('')
  const [err, setErr] = useState(null)
  const [note, setNote] = useState(null)

  const load = useCallback(async () => {
    if (!recordingId) return
    try {
      const r = await api('/api/session-transcribe', 'GET', null, `?recordingId=${encodeURIComponent(recordingId)}`)
      setTranscript(r.transcript || null)
      setDraft(r.transcript?.body || '')

      const rec = await api('/api/session-recording', 'GET', null, `?recordingId=${encodeURIComponent(recordingId)}`)
      setTracks((rec.tracks || []).filter((t) => t.storage_path))
      if (r.transcript?.id) {
        const s = await api('/api/transcript-sign', 'GET', null, `?transcriptId=${encodeURIComponent(r.transcript.id)}`)
        setSignatures(s.signatures || [])
        setInTheRoom(s.wereInTheRoom || [])
      }
      setErr(null)
    } catch (e) { setErr(e.message) }
  }, [recordingId])

  useEffect(() => { load() }, [load])

  /** Ask for the next track, and keep asking until there are none left. */
  async function produce() {
    setBusy('produce'); setErr(null); setNote(null)
    try {
      for (let round = 0; round < 40; round++) {
        const r = await api('/api/session-transcribe', 'POST', { recordingId })
        setProgress(r.done
          ? 'Every track is done.'
          : `${r.justDone} is done. ${r.remaining} ${r.remaining === 1 ? 'track' : 'tracks'} to go.`)
        if (r.done) break
      }
      await load()
      setNote('The transcript is here. Read it, correct anything it heard wrong, then issue it for signature.')
    } catch (e) {
      setErr(e.detail?.notConfigured
        ? 'Transcription is not switched on yet. Add OPENAI_API_KEY in Vercel and redeploy. The audio is safe and can be transcribed afterwards.'
        : e.message)
    }
    setBusy(null); setProgress(null)
  }

  /**
   * Fetch one person's audio and hand it to the player.
   *
   * It goes through the platform rather than being an address the browser can
   * open on its own, because a recording of somebody's voice must not have a
   * link that works for anybody holding it. That means the sign in has to be
   * carried on the request, which a plain audio tag cannot do, so the file is
   * fetched here and played from the browser's own memory.
   */
  async function fetchAudio(trackId) {
    setBusy(`audio:${trackId}`); setErr(null)
    try {
      const { data } = await supabase.auth.getSession()
      const res = await fetch(`/api/session-recording/audio?trackId=${encodeURIComponent(trackId)}`, {
        headers: data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {},
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `Could not fetch the audio (${res.status})`)
      }
      const blob = await res.blob()
      setAudio((prev) => ({ ...prev, [trackId]: URL.createObjectURL(blob) }))
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  // Audio held in the browser's memory is given back when the panel closes.
  useEffect(() => () => {
    Object.values(audio).forEach((u) => { try { URL.revokeObjectURL(u) } catch { /* already gone */ } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    setBusy('save'); setErr(null); setNote(null)
    try {
      await api('/api/transcript-sign', 'POST', { action: 'correct', transcriptId: transcript.id, body: draft })
      setNote('Corrections saved.')
      await load()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  async function issue() {
    if (typeof window !== 'undefined' && !window.confirm('Issue this for signature? The words cannot change after this without making a new version.')) return
    setBusy('issue'); setErr(null); setNote(null)
    try {
      await api('/api/transcript-sign', 'POST', { action: 'issue', transcriptId: transcript.id })
      setNote('Issued. Everybody who was in the room can now sign it.')
      await load()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  async function reopen() {
    if (typeof window !== 'undefined' && !window.confirm('Reopen this as a new version? The signatures already given stay against the words they signed, and everybody has to sign again.')) return
    setBusy('reopen'); setErr(null); setNote(null)
    try {
      const r = await api('/api/transcript-sign', 'POST', { action: 'reopen', transcriptId: transcript.id })
      setNote(`Reopened as version ${r.version}. The earlier signatures stay against version ${r.version - 1}.`)
      await load()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  async function sign() {
    setBusy('sign'); setErr(null); setNote(null)
    try {
      const r = await api('/api/transcript-sign', 'POST', { action: 'sign', transcriptId: transcript.id, typedName: typed })
      setNote(r.complete ? 'Signed. Everybody who was in the room has now signed it.' : `Signed as ${r.signedBy}.`)
      setTyped('')
      await load()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  if (!recordingId) return null

  const status = transcript?.status || null
  // A person in the room is a party when they have one and an account when
  // they do not. Counting parties only meant a room of people with no party
  // rows was reported as nobody left to sign, and the transcript never became
  // signed and so never reached the evidence library.
  const whoIs = (r) => r.party_id || r.user_id || r.signer_user_id || null
  const stillToSign = inTheRoom
    .filter((t) => whoIs(t) && !signatures.some((s) => whoIs(s) === whoIs(t)))
    .map((t) => t.speaker_name || 'somebody')

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem 1.1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ ...mono, fontSize: '0.78rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
            Transcript
          </div>
          <div style={{ ...hint, marginTop: '0.2rem' }}>
            {status
              ? `${STATUS_LABEL[status] || status}, version ${transcript.version}.`
              : 'What was said, in the words it was said in, with the name of who said it.'}
          </div>
        </div>
        {canManage && !status && (
          <button onClick={produce} disabled={busy === 'produce'} style={btn(C.teal, true)}>
            {busy === 'produce' ? 'Working...' : 'Produce the transcript'}
          </button>
        )}
        {canManage && status === 'draft' && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={produce} disabled={busy === 'produce'} style={btn(C.slate)}>
              {busy === 'produce' ? 'Working...' : 'Do the remaining tracks'}
            </button>
            <button onClick={save} disabled={busy === 'save'} style={btn(C.navy)}>Save corrections</button>
            <button onClick={issue} disabled={busy === 'issue'} style={btn(C.teal, true)}>Issue for signature</button>
          </div>
        )}
        {canManage && status !== 'draft' && status && (
          <button onClick={reopen} disabled={busy === 'reopen'} style={btn(C.amber)}>Correct as a new version</button>
        )}
      </div>

      {progress && <div style={{ ...hint, marginTop: '0.6rem', color: C.teal }}>{progress}</div>}

      {/* ─── THE WORDS ──────────────────────────────────────── */}
      {status === 'draft' && canManage ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck
          style={{
            width: '100%', minHeight: 320, marginTop: '0.8rem', padding: '0.7rem 0.8rem',
            border: `1px solid ${C.border}`, borderRadius: 8, background: 'var(--cv-bg-2)',
            color: 'inherit', fontFamily: 'var(--cv-font)', fontSize: '0.95rem', lineHeight: 1.6,
          }}
        />
      ) : transcript?.body ? (
        <div style={{
          marginTop: '0.8rem', padding: '0.8rem 0.9rem', border: `1px solid ${C.border}`,
          borderRadius: 8, background: 'var(--cv-bg-2)', whiteSpace: 'pre-wrap',
          fontSize: '0.95rem', lineHeight: 1.65, maxHeight: 460, overflowY: 'auto',
        }}>
          {transcript.body}
        </div>
      ) : status ? (
        <div style={{ ...hint, marginTop: '0.7rem' }}>
          Some tracks are done and some are not. Press &ldquo;Do the remaining tracks&rdquo; to finish it.
        </div>
      ) : null}

      {/* ─── WHO HAS SIGNED, SEEN BY EVERYBODY ──────────────── */}
      {status && status !== 'draft' && (
        <div style={{ marginTop: '0.9rem' }}>
          <div style={{ ...mono, fontSize: '0.76rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
            Signatures
          </div>
          {signatures.length === 0 && <div style={{ ...hint, marginTop: '0.3rem' }}>Nobody has signed this version yet.</div>}
          {signatures.map((s) => (
            <div key={s.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', padding: '0.25rem 0' }}>
              <span style={{ color: C.green }}>●</span>
              <span style={{ fontWeight: 600 }}>{s.signer_name}</span>
              <span style={{ ...mono, fontSize: '0.8rem', color: C.slate, marginLeft: 'auto' }}>
                {new Date(s.signed_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {s.signature_method === 'in_room' ? ', recorded in the room' : ''}
              </span>
            </div>
          ))}
          {stillToSign.length > 0 && (
            <div style={{ ...hint, marginTop: '0.4rem' }}>Still to sign: {stillToSign.join(', ')}.</div>
          )}
        </div>
      )}

      {/* ─── SIGNING IS TYPING YOUR OWN NAME ─────────────────── */}
      {status === 'issued' && (
        <div style={{ marginTop: '0.9rem', paddingTop: '0.8rem', borderTop: `1px solid ${C.border}` }}>
          <div style={{ ...hint, marginBottom: '0.45rem' }}>
            If this is what was said, type your own name to sign it. Your name is your signature.
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Your full name"
              style={{
                flex: '1 1 240px', padding: '0.45rem 0.6rem', border: `1px solid ${C.border}`,
                borderRadius: 7, background: 'var(--cv-card)', color: 'inherit', fontSize: '0.95rem',
              }}
            />
            <button onClick={sign} disabled={busy === 'sign' || !typed.trim()} style={btn(C.green, true)}>
              {busy === 'sign' ? 'Signing...' : 'Sign'}
            </button>
          </div>
        </div>
      )}

      {/* ─── LISTENING BACK ──────────────────────────────────
          A recording nobody can play is a bill for storage. Each person's own
          track, playable here, so a passage that reads oddly can be checked
          against what was actually said before it is corrected. The audio
          never leaves the platform's own address, so there is no link to a
          recording of somebody's voice that keeps working after they are taken
          off the engagement. */}
      {tracks.length > 0 && (
        <div style={{ marginTop: '0.9rem', paddingTop: '0.8rem', borderTop: `1px solid ${C.border}` }}>
          <div style={{ ...mono, fontSize: '0.76rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
            Listen back
          </div>
          {tracks.map((t) => (
            <div key={t.id} style={{ marginTop: '0.5rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: '0.2rem' }}>
                {t.speaker_name || 'Unnamed speaker'}
              </div>
              {audio[t.id]
                ? <audio controls autoPlay style={{ width: '100%' }} src={audio[t.id]} />
                : (
                  <button onClick={() => fetchAudio(t.id)} disabled={busy === `audio:${t.id}`} style={btn(C.navy)}>
                    {busy === `audio:${t.id}` ? 'Fetching...' : 'Play this person'}
                  </button>
                )}
            </div>
          ))}
          <div style={{ ...hint, marginTop: '0.4rem' }}>
            One track per person, at full quality, whatever the call was doing at the time.
          </div>
        </div>
      )}

      {note && <div style={{ ...hint, marginTop: '0.6rem', color: C.green }}>{note}</div>}
      {err && <div style={{ ...hint, marginTop: '0.6rem', color: C.red }}>{err}</div>}
    </div>
  )
}
