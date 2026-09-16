// @ts-nocheck
'use client'
// ============================================================
// THE SESSIONS FOR ONE DECISION POINT, WHERE THE WORK IS
//
// Habib, 16 September 2026: "how bad clutter would it be to include session
// planning, calls and all that in each of the decision points rather than have
// a separate tab called rooms and sessions... it would be better to have all
// the elements required for or related to each decision point in the decision
// point tab... the design must just be user friendly and tidy with less
// clicks."
//
// And then, more precisely: "all the planning and everything associated with
// each decision point is moved to that decision tab. The session and room
// should then draw the details of the sessions, planned or otherwise, into it
// so it works almost like a summary."
//
// So this is the whole of it. Everything that can be done to a session for
// this decision point is done here: the sessions the method prescribes, the
// room and who it requires, when it is, who is in it, the invitation, the way
// in, what was recorded, and deleting one that never happened. Sessions and
// rooms now reads all of this back and edits nothing.
//
// A SESSION PLANNED FOR MARCH AND A SESSION STARTING NOW ARE THE SAME THING.
// There is no separate route for one that happens today: leave the time empty
// and press Open the session, or give it a time and send the invitation. Both
// end up as one row with one room and one record of who was in it.
//
// ONE SESSION, TWO WAYS TO RUN IT. Habib: "it could be that it is recorded on
// my laptop or my phone with all attendees in the same room, or it could be a
// call."
//
// ONE ROOM MEANS ONE DEVICE. 16 September 2026. I first wrote that three
// laptops round a table gives a better record than one microphone in the
// middle. Habib: "multiple laptops recording in the same room would cause
// audio feedback and make the recording useless." He is right, and the advice
// was worse than useless: two devices in one room with the call open on both
// put each one's speaker into the other's microphone, which howls and ruins
// the only copy of the conversation. Everyone in one room records on ONE
// device, and who was present is said by naming them rather than by counting
// laptops. People in different places each use their own device, where there
// is no shared air for a loop to travel through.
//
// WHO WAS THERE IS A LIST, NOT AN INFERENCE. Habib: "I should be able to
// select a participant from a dropdown list of people on the assignment." The
// people on the engagement are picked here and recorded against the session,
// so a single recording from one laptop still knows the room it was made in.
//
// The method itself lives in src/lib/method-sessions.ts, so this screen and
// the workplan read one source and cannot drift apart.
//
// Reads and writes through the browser client, so row-level security scopes
// everything to the signed-in viewer. canManage=false renders the same strip
// read only.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { whenText, nextSession } from '@/lib/session-time'
import {
  KINDS, KIND_LABEL, kindDef, ROLE_LABEL, roleLabel,
  methodSessionsFor, durationLabel, attendanceWarnings, STATUS_OPTIONS,
} from '@/lib/method-sessions'

const C = {
  card: 'var(--cv-card)', border: 'var(--cv-border)', slate: 'var(--cv-slate)',
  navy: 'var(--cv-navy)', teal: 'var(--cv-teal)', green: 'var(--cv-green)',
  amber: 'var(--cv-amber)', purple: 'var(--cv-purple)', red: 'var(--cv-red)',
}
const mono = { fontFamily: 'var(--cv-font-mono)' }
const hint = { fontSize: '0.88rem', color: C.slate, lineHeight: 1.5 }
const label = { ...mono, fontSize: '0.78rem', color: C.slate }
const btn = (col, solid) => ({
  ...mono, fontSize: '0.84rem', fontWeight: 700, padding: '0.35rem 0.8rem',
  border: `1px solid ${col}`, borderRadius: 7,
  background: solid ? col : 'transparent',
  color: solid ? 'var(--cv-on-accent)' : col, cursor: 'pointer',
})
const field = {
  width: '100%', padding: '0.42rem 0.6rem', borderRadius: 7, fontSize: 16,
  border: `1px solid ${C.border}`, background: 'var(--cv-bg-2)', color: 'inherit',
}

const PARTIES_TABLE = 'engagement_parties'
const SESSIONS_TABLE = 'gtcv_sessions'
const ATTENDANCE_TABLE = 'gtcv_session_attendance'

/** A stored instant, as the browser's own date and time box wants it. */
function localInputValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const two = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`
}

/** When a recording was made, for the line on its session. */
function recWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

/** How long a recording ran, in words. */
function recLength(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  if (s < 60) return `${s} sec`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr ${m % 60} min`
}

const BLANK = { title: '', session_kind: '', when: '', duration_minutes: 60, purpose: '', extra: [] }

export default function SessionsStrip({
  clientId, dpId, canManage = false, heading = 'Sessions', openByDefault = false,
}) {
  const [open, setOpen] = useState(openByDefault)
  const [sessions, setSessions] = useState([])
  const [parties, setParties] = useState([])
  const [attendance, setAttendance] = useState([])
  const [recordings, setRecordings] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(null)
  const [note, setNote] = useState({})
  const [adding, setAdding] = useState(false)
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState({})
  const [form, setForm] = useState(BLANK)

  const load = useCallback(async () => {
    if (!clientId || !dpId) return
    setLoading(true)
    const { data, error } = await supabase.from(SESSIONS_TABLE)
      .select('*').eq('client_id', clientId).eq('dp_id', dpId)
      .order('planned_at', { ascending: true })
    if (error) { setErr(error.message); setLoading(false); return }
    setErr(null)
    setSessions(data || [])

    // Everybody on the engagement, which is the list a participant is chosen
    // from. engagement_parties is the only place a person exists whether or
    // not they have a login, so a funder representative who never signs in is
    // still nameable.
    const { data: people } = await supabase.from(PARTIES_TABLE)
      .select('id,name,party_role,organisation,email')
      .eq('client_id', clientId).order('sort_order', { ascending: true })
    setParties(people || [])

    const ids = (data || []).map(r => r.id)
    if (ids.length) {
      // party_name arrives with 2026_09_16_session_attendance_name.sql. Asked
      // for by name so that a database without it yet fails here and falls
      // back to the pointer alone, rather than the whole strip going blank.
      let { data: att, error: attErr } = await supabase.from(ATTENDANCE_TABLE)
        .select('id,session_id,party_id,party_role,party_name,required,attended')
        .in('session_id', ids)
      if (attErr) {
        ;({ data: att } = await supabase.from(ATTENDANCE_TABLE)
          .select('id,session_id,party_id,party_role,required,attended')
          .in('session_id', ids))
      }
      setAttendance(att || [])
    } else {
      setAttendance([])
    }
    // The recordings are read through the server route, which is the only
    // thing that can see storage. A failure here never hides the sessions.
    try {
      const { data: auth } = await supabase.auth.getSession()
      const token = auth.session?.access_token
      const res = await fetch(`/api/session-recording?list=1&clientId=${encodeURIComponent(clientId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) setRecordings(json.recordings || [])
    } catch { /* the sessions still stand on their own */ }
    setLoading(false)
  }, [clientId, dpId])

  useEffect(() => { load() }, [load])

  const namedRoles = useMemo(
    () => Array.from(new Set(parties.map(p => p.party_role).filter(Boolean))),
    [parties],
  )

  // ─── What the method wants in this room ────────────────────
  // The room's own required roles, plus any the prescribed session added on
  // top of it, which are kept as attendance rows marked required.
  function warningsFor(session) {
    const rows = attendance.filter(a => a.session_id === session.id)
    return attendanceWarnings({
      kind: session.session_kind,
      extraRequired: rows.filter(a => a.required && a.party_role).map(a => a.party_role),
      presentRoles: rows.filter(a => a.attended).map(a => a.party_role),
      namedRoles,
    })
  }

  // ─── Adding ────────────────────────────────────────────────
  // The roles the method wants in this room are written down as attendance
  // rows marked required, so the gap is visible before the session runs and
  // the invitation knows who it is for. Nobody is ticked as having attended:
  // that is said afterwards, by the person who was there.
  async function markRequired(session, kind, extra) {
    const def = kindDef(kind)
    const roles = Array.from(new Set([...(def ? def.required : []), ...(extra || [])]))
    if (!roles.length) return

    // Read what is recorded rather than trusting local state, so two changes
    // in quick succession cannot both insert the same person.
    const { data: fresh } = await supabase.from(ATTENDANCE_TABLE)
      .select('id,session_id,party_id,party_role,required,attended').eq('session_id', session.id)
    const existing = fresh || []
    const rows = []
    roles.forEach(role => {
      const named = parties.filter(p => p.party_role === role)
      if (!named.length) {
        if (!existing.some(a => a.party_role === role && !a.party_id)) {
          rows.push({ client_id: clientId, session_id: session.id, party_id: null, party_role: role, required: true })
        }
        return
      }
      named.forEach(p => {
        if (!existing.some(a => a.party_id === p.id)) {
          rows.push({ client_id: clientId, session_id: session.id, party_id: p.id, party_role: role, party_name: p.name || null, required: true })
        }
      })
    })
    // Roles this room no longer wants stop being required. The row stays, so
    // an attendance already recorded is never lost.
    const noLonger = existing.filter(a => a.required && !roles.includes(a.party_role)).map(a => a.id)
    if (noLonger.length) {
      await supabase.from(ATTENDANCE_TABLE).update({ required: false }).in('id', noLonger)
      setAttendance(prev => prev.map(a => (noLonger.includes(a.id) ? { ...a, required: false } : a)))
    }
    if (!rows.length) return
    let { data, error } = await supabase.from(ATTENDANCE_TABLE).insert(rows).select()
    if (error && /party_name/i.test(`${error.code || ''} ${error.message || ''}`)) {
      const plain = rows.map(({ party_name, ...rest }) => rest)
      ;({ data, error } = await supabase.from(ATTENDANCE_TABLE).insert(plain).select())
    }
    // A unique violation means somebody got there first, which is the end
    // state this wants anyway.
    if (error && error.code !== '23505') return
    if (data) setAttendance(prev => [...prev, ...data])
  }

  async function addSession(template) {
    const title = (template ? template.title : form.title).trim()
    if (!title) { setNote({ new: { text: 'Give the session a name first.', bad: true } }); return }
    setBusy('new')
    const row = {
      client_id: clientId,
      dp_id: dpId,
      title,
      session_kind: (template ? template.kind : form.session_kind) || null,
      // A time typed into a browser is that browser's own clock. Stored as an
      // instant so a calendar in another country shows the same moment.
      planned_at: !template && form.when ? new Date(form.when).toISOString() : null,
      planned_date: !template && form.when ? form.when.slice(0, 10) : null,
      duration_minutes: template ? template.mins : (Number(form.duration_minutes) || null),
      purpose: (template ? template.purpose : form.purpose.trim()) || null,
      status: 'planned',
    }
    const { data, error } = await supabase.from(SESSIONS_TABLE).insert([row]).select().single()
    setBusy(null)
    if (error) { setNote({ new: { text: 'That did not save: ' + error.message, bad: true } }); return }
    setSessions(prev => [...prev, data].sort((a, b) => new Date(a.planned_at || 0) - new Date(b.planned_at || 0)))
    setForm(BLANK)
    setAdding(false)
    setPicking(false)
    setNote({})
    if (data.session_kind) await markRequired(data, data.session_kind, template ? template.extra : [])
  }

  // ─── Changing one ──────────────────────────────────────────
  function startEdit(s) {
    setEditing(s.id)
    setDraft({
      title: s.title || '',
      session_kind: s.session_kind || '',
      when: localInputValue(s.planned_at),
      held_date: s.held_date || '',
      duration_minutes: s.duration_minutes ?? '',
      status: s.status || 'planned',
      purpose: s.purpose || '',
      notes: s.notes || '',
    })
  }

  async function saveEdit(s) {
    setBusy(s.id)
    const kind = draft.session_kind || null
    const patch = {
      title: draft.title.trim() || 'Untitled session',
      session_kind: kind,
      planned_at: draft.when ? new Date(draft.when).toISOString() : null,
      planned_date: draft.when ? draft.when.slice(0, 10) : null,
      held_date: draft.held_date || null,
      duration_minutes: draft.duration_minutes === '' ? null : Number(draft.duration_minutes),
      status: draft.status || 'planned',
      purpose: draft.purpose.trim() || null,
      notes: draft.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from(SESSIONS_TABLE).update(patch).eq('id', s.id)
    setBusy(null)
    if (error) {
      setNote(prev => ({ ...prev, [s.id]: { text: 'That did not save, and your changes are still here: ' + error.message, bad: true } }))
      return
    }
    const roomChanged = (s.session_kind || null) !== kind
    setSessions(prev => prev.map(r => (r.id === s.id ? { ...r, ...patch } : r)))
    setEditing(null)
    setNote(prev => ({ ...prev, [s.id]: null }))
    if (roomChanged && kind) await markRequired({ ...s, ...patch }, kind, [])
  }

  /**
   * Delete a session.
   *
   * Habib, 16 September 2026: "I should be able to delete sessions that
   * planned but never happened and so on." It asks first, and it says what
   * else goes, because a session that was recorded is evidence rather than a
   * diary entry.
   */
  async function removeSession(s) {
    const mine = recordings.filter(r => r.session_id === s.id)
    const warning = mine.length
      ? `\n\nThis session has ${mine.length === 1 ? 'a recording' : `${mine.length} recordings`} on it. Delete the recording first if you want to keep it.`
      : ''
    if (typeof window !== 'undefined' && !window.confirm(
      `Delete ${s.title || 'this session'}?\n\nWho was in it goes with it. This cannot be undone.${warning}`,
    )) return
    if (mine.length) {
      setNote(prev => ({ ...prev, [s.id]: { text: 'This session has a recording on it. Delete the recording first, then the session.', bad: true } }))
      return
    }
    setBusy(s.id)
    // Kept, so a failed delete puts the session back rather than leaving the
    // screen disagreeing with the record.
    const removedAttendance = attendance.filter(a => a.session_id === s.id)
    setSessions(prev => prev.filter(r => r.id !== s.id))
    setAttendance(prev => prev.filter(a => a.session_id !== s.id))
    const { error } = await supabase.from(SESSIONS_TABLE).delete().eq('id', s.id)
    setBusy(null)
    if (error) {
      setSessions(prev => [...prev, s])
      setAttendance(prev => [...prev, ...removedAttendance])
      setNote(prev => ({ ...prev, [s.id]: { text: 'It could not be deleted: ' + error.message, bad: true } }))
    }
  }

  /**
   * Delete a recording made in this session. It asks first and it says what
   * goes: a recording is the only copy of what somebody said, and the
   * transcript and any signatures go with the audio, because all three are
   * about a conversation that will no longer exist.
   */
  async function removeRecording(rec) {
    if (typeof window !== 'undefined' && !window.confirm(
      `Delete this recording?\n\n${rec.heading || 'Recording'}, ${recWhen(rec.started_at)}\n\nThe audio, the transcript and any signatures on it go with it. This cannot be undone.`,
    )) return
    setBusy(rec.id)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const res = await fetch('/api/session-recording', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ recordingId: rec.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `It could not be deleted (${res.status})`)
      setRecordings(prev => prev.filter(x => x.id !== rec.id))
    } catch (e) {
      setNote(prev => ({ ...prev, [rec.session_id]: { text: e.message, bad: true } }))
    }
    setBusy(null)
  }

  // WHO WAS IN THE ROOM IS SAID, NOT COUNTED. One recording from one laptop
  // carries a whole room, so the room has to be named. Written against
  // engagement_parties, so somebody without a login is covered like anybody
  // else.
  async function addParticipant(session, partyId) {
    if (!partyId) return
    const party = parties.find(p => p.id === partyId)
    setBusy(session.id + partyId)
    // THE NAME IS WRITTEN DOWN, NOT ONLY POINTED AT. CodeRabbit on #276: the
    // pointer is set to null when somebody is taken off the engagement, so the
    // attendance row survived with no identity on it and a session could no
    // longer say who was in the room. The pointer is still preferred while it
    // resolves, so a corrected spelling reaches old sessions too.
    const existing = attendance.find(a => a.session_id === session.id && a.party_id === partyId)
    if (existing) {
      // Already required for this room, now actually in it.
      const { error } = await supabase.from(ATTENDANCE_TABLE).update({ attended: true }).eq('id', existing.id)
      setBusy(null)
      if (error) { setNote(prev => ({ ...prev, [session.id]: { text: 'That person could not be added: ' + error.message, bad: true } })); return }
      setAttendance(prev => prev.map(a => (a.id === existing.id ? { ...a, attended: true } : a)))
      return
    }
    const row = {
      client_id: clientId,
      session_id: session.id,
      party_id: partyId,
      party_role: party?.party_role || null,
      party_name: party?.name || null,
      required: false,
      attended: true,
    }
    let { data, error } = await supabase.from(ATTENDANCE_TABLE).insert([row]).select().single()
    if (error && /party_name/i.test(`${error.code || ''} ${error.message || ''}`)) {
      // The column is not there yet. The person is still recorded.
      const { party_name, ...withoutName } = row
      void party_name
      ;({ data, error } = await supabase.from(ATTENDANCE_TABLE).insert([withoutName]).select().single())
    }
    setBusy(null)
    if (error) { setNote(prev => ({ ...prev, [session.id]: { text: 'That person could not be added: ' + error.message, bad: true } })); return }
    setAttendance(prev => [...prev, data])
    setNote(prev => ({ ...prev, [session.id]: null }))
  }

  async function removeParticipant(row) {
    setBusy(row.id)
    // Somebody the method requires stays on the list and stops being ticked,
    // so taking them out of the room does not quietly remove the requirement.
    if (row.required) {
      const { error } = await supabase.from(ATTENDANCE_TABLE).update({ attended: null }).eq('id', row.id)
      setBusy(null)
      if (error) { setNote(prev => ({ ...prev, [row.session_id]: { text: 'That person could not be taken off: ' + error.message, bad: true } })); return }
      setAttendance(prev => prev.map(a => (a.id === row.id ? { ...a, attended: null } : a)))
      return
    }
    const { error } = await supabase.from(ATTENDANCE_TABLE).delete().eq('id', row.id)
    setBusy(null)
    if (error) { setNote(prev => ({ ...prev, [row.session_id]: { text: 'That person could not be taken off: ' + error.message, bad: true } })); return }
    setAttendance(prev => prev.filter(a => a.id !== row.id))
  }

  async function sendInvite(session) {
    setBusy(session.id)
    setNote(prev => ({ ...prev, [session.id]: null }))
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const res = await fetch('/api/session-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ sessionId: session.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'The invitation did not go.')
      setNote(prev => ({ ...prev, [session.id]: { text: json.message || 'Invitation sent.' } }))
      setSessions(prev => prev.map(s => (s.id === session.id ? { ...s, invite_sent_at: new Date().toISOString() } : s)))
    } catch (e) {
      setNote(prev => ({ ...prev, [session.id]: { text: e.message, bad: true } }))
    }
    setBusy(null)
  }

  const next = nextSession(sessions)
  const count = sessions.length
  const recordingsFor = (id) => recordings.filter(r => r.session_id === id)
  const prescribed = methodSessionsFor(dpId)
  const usedTitles = new Set(sessions.map(s => (s.title || '').trim()))

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: '1.1rem' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap',
          padding: '0.7rem 0.95rem', background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left', color: 'inherit',
        }}
      >
        <span style={{ ...mono, fontSize: '0.8rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: C.slate }}>
          {open ? '▾' : '▸'} {heading}
        </span>
        <span style={{ fontWeight: 700, color: C.navy }}>{loading ? '…' : count}</span>
        {!loading && next && (
          <span style={{ ...hint, color: C.teal }}>next {whenText(next)}</span>
        )}
        {!loading && count === 0 && <span style={hint}>nothing planned yet</span>}
        {err && <span style={{ ...hint, color: C.red }}>{err}</span>}
      </button>

      {open && (
        <div style={{ padding: '0 0.95rem 0.95rem' }}>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.55rem 0.7rem', marginBottom: '0.75rem' }}>
            <div style={{ ...hint, marginBottom: '0.3rem' }}>
              <strong style={{ color: C.navy }}>Everyone in one room.</strong> Open the session on
              <strong> one</strong> laptop or phone and press Start recording there. Name who is in the room below.
              Do not open it on a second device in the same room: two microphones and two speakers in one
              room feed back and spoil the recording.
            </div>
            <div style={{ ...hint, marginBottom: '0.3rem' }}>
              <strong style={{ color: C.navy }}>People in different places.</strong> Send the invitation.
              Everyone opens the same page, the call is there, and each device records the person in front of it.
            </div>
            <div style={hint}>
              <strong style={{ color: C.navy }}>Happening right now.</strong> A session planned for next month and a
              session starting in a minute are the same thing here. Add it, leave the time empty, and press
              Open the session.
            </div>
          </div>

          {sessions.length === 0 && !loading && (
            <div style={{ ...hint, padding: '0.3rem 0 0.6rem' }}>No sessions on this decision point yet.</div>
          )}

          {sessions.map(s => {
            const mine = recordingsFor(s.id)
            const here = attendance.filter(a => a.session_id === s.id)
            const inRoom = here.filter(a => a.attended)
            const taken = new Set(inRoom.map(a => a.party_id))
            const available = parties.filter(p => !taken.has(p.id))
            const w = warningsFor(s)
            const room = kindDef(s.session_kind)
            const isEditing = editing === s.id
            return (
              <div key={s.id} style={{
                border: `1px solid ${C.border}`,
                borderLeft: `4px solid ${room ? room.color : C.border}`,
                borderRadius: 8, padding: '0.6rem 0.75rem', marginBottom: '0.5rem',
              }}>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: C.navy }}>{s.title || 'Working session'}</div>
                    <div style={hint}>
                      {whenText(s)}
                      {s.session_kind ? ` · ${KIND_LABEL[s.session_kind] || s.session_kind}` : ''}
                      {s.duration_minutes ? ` · ${durationLabel(s.duration_minutes) || `${s.duration_minutes} min`}` : ''}
                      {s.status && s.status !== 'planned' ? ` · ${s.status}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <a href={`/call/${s.id}`} target="_blank" rel="noreferrer"
                      style={{ ...btn(C.teal, true), textDecoration: 'none', display: 'inline-block' }}>
                      Open the session
                    </a>
                    {canManage && (
                      <button type="button" style={btn(C.slate)} disabled={busy === s.id} onClick={() => sendInvite(s)}>
                        {busy === s.id ? 'Sending…' : (s.invite_sent_at ? 'Send again' : 'Invite')}
                      </button>
                    )}
                    {canManage && (
                      <button type="button" style={btn(C.slate)} onClick={() => (isEditing ? setEditing(null) : startEdit(s))}>
                        {isEditing ? 'Close' : 'Change'}
                      </button>
                    )}
                    {canManage && (
                      <button type="button" style={btn(C.red)} disabled={busy === s.id} onClick={() => removeSession(s)}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                {s.purpose && <div style={{ ...hint, marginTop: '0.35rem' }}>{s.purpose}</div>}
                {room && <div style={{ ...hint, marginTop: '0.2rem', color: room.color }}>{room.blurb}</div>}

                {/* WHAT THE METHOD WANTS IN THIS ROOM. Said, never enforced: a
                    coach who knows why the finance lead is absent should not be
                    stopped from recording the session that actually happened. */}
                {(w.missing.length > 0 || w.intruders.length > 0 || w.unnamed.length > 0) && (
                  <div style={{ border: `1px solid ${C.amber}`, background: 'var(--cv-alt)', borderRadius: 7, padding: '0.45rem 0.6rem', marginTop: '0.4rem' }}>
                    {w.missing.length > 0 && (
                      <div style={{ ...hint, color: C.amber }}>
                        The method requires {w.missing.map(roleLabel).join(', ')} in this room, and {w.missing.length === 1 ? 'that attendee is' : 'those attendees are'} not named below.
                      </div>
                    )}
                    {w.intruders.length > 0 && (
                      <div style={{ ...hint, color: C.red }}>
                        {w.intruders.map(roleLabel).join(', ')} {w.intruders.length === 1 ? 'is' : 'are'} in this session, and the method keeps that role out of this room.
                      </div>
                    )}
                    {w.unnamed.length > 0 && (
                      <div style={hint}>
                        Nobody is named for {w.unnamed.map(roleLabel).join(', ')} on this engagement yet.{' '}
                        <a href={`/coach?client=${encodeURIComponent(clientId)}&zone=eng_setup`} style={{ color: C.teal }}>
                          Add them under Who is on it, and settings, and they appear here to pick.
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* WHAT THIS SESSION PRODUCED, ON THIS SESSION. 11 September
                    2026. Habib: the evidence should be in the session box
                    rather than at the bottom, by the time you do a lot of
                    sessions it would be too cluttered. */}
                {mine.map(rec => (
                  <div key={rec.id} style={{
                    marginTop: '0.4rem', padding: '0.4rem 0.55rem', borderLeft: `3px solid ${C.teal}`,
                    background: 'var(--cv-alt)', borderRadius: 6,
                    display: 'flex', gap: '0.55rem', alignItems: 'baseline', flexWrap: 'wrap',
                  }}>
                    <span style={{ fontWeight: 600, color: C.navy, fontSize: '0.9rem' }}>Recorded {recWhen(rec.started_at)}</span>
                    {rec.merged_seconds ? <span style={hint}>{recLength(rec.merged_seconds)}</span> : null}
                    <span style={{ ...hint, color: rec.transcript?.status === 'signed' ? C.green : C.amber }}>
                      {rec.transcript
                        ? (rec.transcript.status === 'signed' ? 'Transcript signed and filed as evidence'
                          : rec.transcript.status === 'issued' ? 'Transcript waiting for signatures'
                            : 'Transcript is a draft')
                        : rec.status === 'opening' ? 'Recording now' : 'Not transcribed yet'}
                    </span>
                    {canManage && (
                      <button type="button" style={{ ...btn(C.red), marginLeft: 'auto' }}
                        disabled={busy === rec.id} onClick={() => removeRecording(rec)}
                        title="Delete this recording, its transcript and its audio">
                        {busy === rec.id ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                  </div>
                ))}

                {/* WHO IS IN THIS SESSION. Chosen from the people on the
                    engagement, so one recording made on one laptop still knows
                    the room it was made in. */}
                <div style={{ marginTop: '0.45rem', paddingTop: '0.45rem', borderTop: `1px solid var(--cv-border-soft)` }}>
                  <div style={{ ...mono, fontSize: '0.76rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: C.slate, marginBottom: '0.3rem' }}>
                    Who is in this session
                  </div>
                  {inRoom.length === 0 && <div style={{ ...hint, marginBottom: '0.35rem' }}>Nobody named yet.</div>}
                  {inRoom.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                      {inRoom.map(a => {
                        const who = parties.find(p => p.id === a.party_id)
                        // The engagement's own list first, so a corrected
                        // spelling reaches old sessions; the name written down
                        // at the time when there is nothing left to point at.
                        const name = who?.name || a.party_name || 'Somebody no longer on the engagement'
                        const role = who?.party_role || a.party_role
                        return (
                          <span key={a.id} title={who ? undefined : 'No longer on the engagement'}
                            style={{ ...mono, fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', border: `1px solid ${who ? C.purple : C.slate}`, color: who ? C.purple : C.slate, borderRadius: 999, padding: '0.15rem 0.6rem' }}>
                            {name}
                            {role ? ` · ${ROLE_LABEL[role] || role}` : ''}
                            {canManage && (
                              <button type="button" aria-label={`Take ${name} off the session`}
                                disabled={busy === a.id} onClick={() => removeParticipant(a)}
                                style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.95rem', lineHeight: 1, padding: 0 }}>
                                {'×'}
                              </button>
                            )}
                          </span>
                        )
                      })}
                    </div>
                  )}
                  {canManage && (
                    available.length > 0 ? (
                      <select
                        aria-label="Add somebody to this session"
                        style={{ ...field, maxWidth: 320 }}
                        value=""
                        disabled={!!busy}
                        onChange={e => addParticipant(s, e.target.value)}
                      >
                        <option value="">Add somebody…</option>
                        {available.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name}{p.party_role ? ` · ${ROLE_LABEL[p.party_role] || p.party_role}` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div style={hint}>
                        {parties.length === 0
                          ? 'Nobody is on this engagement yet. Add them on "Who is on it, and settings".'
                          : 'Everybody on the engagement is already in this session.'}
                      </div>
                    )
                  )}
                </div>

                {/* CHANGING THE SESSION, WHERE THE SESSION IS. Sessions and
                    rooms reads and prints; nothing is edited there. */}
                {canManage && isEditing && (
                  <div style={{ border: `1px solid ${C.teal}`, borderRadius: 8, padding: '0.7rem 0.8rem', marginTop: '0.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '0.6rem' }}>
                      <div style={{ gridColumn: '1/-1' }}>
                        <label style={label} htmlFor={`ed-title-${s.id}`}>What is this session</label>
                        <input id={`ed-title-${s.id}`} style={field} value={draft.title}
                          onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
                      </div>
                      <div>
                        <label style={label} htmlFor={`ed-kind-${s.id}`}>Room</label>
                        <select id={`ed-kind-${s.id}`} style={field} value={draft.session_kind}
                          onChange={e => setDraft(d => ({ ...d, session_kind: e.target.value }))}>
                          <option value="">Not set</option>
                          {KINDS.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={label} htmlFor={`ed-when-${s.id}`}>When it starts</label>
                        <input id={`ed-when-${s.id}`} type="datetime-local" style={field} value={draft.when}
                          onChange={e => setDraft(d => ({ ...d, when: e.target.value }))} />
                      </div>
                      <div>
                        <label style={label} htmlFor={`ed-mins-${s.id}`}>Minutes</label>
                        <input id={`ed-mins-${s.id}`} type="number" min="15" step="15" style={field} value={draft.duration_minutes}
                          onChange={e => setDraft(d => ({ ...d, duration_minutes: e.target.value }))} />
                      </div>
                      <div>
                        <label style={label} htmlFor={`ed-status-${s.id}`}>Status</label>
                        <select id={`ed-status-${s.id}`} style={field} value={draft.status}
                          onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>
                          {STATUS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={label} htmlFor={`ed-held-${s.id}`}>Held on</label>
                        <input id={`ed-held-${s.id}`} type="date" style={field} value={draft.held_date}
                          onChange={e => setDraft(d => ({ ...d, held_date: e.target.value }))} />
                      </div>
                      <div style={{ gridColumn: '1/-1' }}>
                        <label style={label} htmlFor={`ed-purpose-${s.id}`}>What it has to produce</label>
                        <textarea id={`ed-purpose-${s.id}`} style={{ ...field, minHeight: 54, resize: 'vertical' }} value={draft.purpose}
                          onChange={e => setDraft(d => ({ ...d, purpose: e.target.value }))} />
                      </div>
                      <div style={{ gridColumn: '1/-1' }}>
                        <label style={label} htmlFor={`ed-notes-${s.id}`}>Notes</label>
                        <textarea id={`ed-notes-${s.id}`} style={{ ...field, minHeight: 44, resize: 'vertical' }} value={draft.notes}
                          onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                      <button type="button" style={btn(C.teal, true)} disabled={busy === s.id} onClick={() => saveEdit(s)}>
                        {busy === s.id ? 'Saving…' : 'Save the session'}
                      </button>
                      <button type="button" style={btn(C.slate)} onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                {s.invite_sent_at && (
                  <div style={{ ...hint, marginTop: '0.25rem' }}>
                    Invitation sent {new Date(s.invite_sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </div>
                )}
                {note[s.id] && (
                  <div style={{ ...hint, marginTop: '0.3rem', color: note[s.id].bad ? C.red : C.green }}>{note[s.id].text}</div>
                )}
              </div>
            )
          })}

          {canManage && !adding && !picking && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" style={btn(C.teal)} onClick={() => setPicking(true)}>
                Sessions the method specifies here
              </button>
              <button type="button" style={btn(C.slate)} onClick={() => setAdding(true)}>+ New session</button>
            </div>
          )}

          {/* THE METHOD'S OWN SESSIONS, AT THE DECISION POINT THEY BELONG TO.
              These used to be on Sessions and rooms, which meant planning
              Decision Point 2 happened somewhere other than Decision Point 2.
              The room, the length and what the session has to produce all come
              with it, so nothing has to be typed or remembered. */}
          {canManage && picking && (
            <div style={{ border: `1px dashed ${C.teal}`, borderRadius: 8, padding: '0.7rem 0.8rem', marginTop: '0.4rem' }}>
              <div style={{ ...mono, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: C.slate, marginBottom: '0.5rem' }}>
                Sessions the method specifies here
              </div>
              {prescribed.length === 0 ? (
                <div style={hint}>The guide does not specify sessions at this decision point. Add one and set the room.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {prescribed.map(t => {
                    const already = usedTitles.has(t.title)
                    const k = kindDef(t.kind)
                    return (
                      <div key={t.title} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 320px' }}>
                          <div style={{ fontWeight: 600, color: C.navy }}>{t.title}</div>
                          <div style={{ ...mono, fontSize: '0.8rem', color: k ? k.color : C.slate }}>
                            {k ? k.l : 'Room not set'}{t.mins ? ` · ${durationLabel(t.mins)}` : ''}
                          </div>
                          <div style={{ ...hint, marginTop: '0.15rem' }}>{t.purpose}</div>
                        </div>
                        <button type="button"
                          style={already ? { ...btn(C.slate), opacity: 0.5, cursor: 'default' } : btn(C.teal)}
                          disabled={already || busy === 'new'}
                          onClick={() => addSession(t)}>
                          {already ? 'Already here' : '+ Add'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              {note.new && <div style={{ ...hint, marginTop: '0.4rem', color: note.new.bad ? C.red : C.green }}>{note.new.text}</div>}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem' }}>
                <button type="button" style={btn(C.slate)} onClick={() => { setPicking(false); setAdding(true) }}>+ Blank session</button>
                <button type="button" style={btn(C.slate)} onClick={() => setPicking(false)}>Close</button>
              </div>
            </div>
          )}

          {canManage && adding && (
            <div style={{ border: `1px solid ${C.teal}`, borderRadius: 8, padding: '0.7rem 0.8rem', marginTop: '0.4rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '0.6rem' }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={label} htmlFor="ss-title">What is this session</label>
                  <input id="ss-title" style={field} value={form.title} placeholder="Service listing plenary"
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div>
                  <label style={label} htmlFor="ss-kind">Room</label>
                  <select id="ss-kind" style={field} value={form.session_kind}
                    onChange={e => setForm(f => ({ ...f, session_kind: e.target.value }))}>
                    <option value="">Not set</option>
                    {KINDS.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label} htmlFor="ss-when">When</label>
                  <input id="ss-when" type="datetime-local" style={field} value={form.when}
                    onChange={e => setForm(f => ({ ...f, when: e.target.value }))} />
                </div>
                <div>
                  <label style={label} htmlFor="ss-mins">Minutes</label>
                  <input id="ss-mins" type="number" min="15" step="15" style={field} value={form.duration_minutes}
                    onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={label} htmlFor="ss-purpose">What it has to produce</label>
                  <input id="ss-purpose" style={field} value={form.purpose}
                    onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} />
                </div>
              </div>
              {form.session_kind && kindDef(form.session_kind) && (
                <div style={{ ...hint, marginTop: '0.4rem', color: kindDef(form.session_kind).color }}>
                  {kindDef(form.session_kind).blurb}
                </div>
              )}
              {note.new && <div style={{ ...hint, marginTop: '0.4rem', color: note.new.bad ? C.red : C.green }}>{note.new.text}</div>}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                <button type="button" style={btn(C.teal, true)} disabled={busy === 'new'} onClick={() => addSession(null)}>
                  {busy === 'new' ? 'Saving…' : 'Add the session'}
                </button>
                <button type="button" style={btn(C.slate)} onClick={() => { setAdding(false); setNote({}) }}>Cancel</button>
              </div>
              <p style={{ ...hint, marginTop: '0.5rem' }}>
                Choosing a room names the people the method wants in it, and this session says so
                above if one of them is missing. Leave the time empty for a session that is starting now.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
