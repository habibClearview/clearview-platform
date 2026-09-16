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
// Before this, running a session for Decision Point 2 meant leaving the
// decision point, finding it in a list of every session on the engagement,
// inviting from there, and opening the call from there. Four moves and a tab
// change to start a conversation you were already standing in front of. And a
// recording could only be found by remembering which session it belonged to.
//
// This is one strip at the top of the decision point. Shut, it is a single
// line: how many sessions, when the next one is. Open, it is the sessions
// themselves, with the invitation and the way in on each one.
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
// The full room rules, who the method requires in each kind of session and who
// it keeps out, stay in the planner. This is for doing rather than for
// designing.
//
// Reads and writes through the browser client, so row-level security scopes
// everything to the signed-in viewer. canManage=false renders the same strip
// read only.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const C = {
  card: 'var(--cv-card)', border: 'var(--cv-border)', slate: 'var(--cv-slate)',
  navy: 'var(--cv-navy)', teal: 'var(--cv-teal)', green: 'var(--cv-green)',
  amber: 'var(--cv-amber)', purple: 'var(--cv-purple)', red: 'var(--cv-red)',
}
const mono = { fontFamily: 'var(--cv-font-mono)' }
const hint = { fontSize: '0.88rem', color: C.slate, lineHeight: 1.5 }
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

// The same six rooms the planner and the database both know. Named here only
// so a session can be given one without leaving the decision point; what each
// room requires is the planner's job to explain.
const PARTIES_TABLE = 'engagement_parties'

// What each role is called out loud, so a dropdown reads as people rather
// than as database values.
const ROLE_LABEL = {
  client_funder: 'Funder', funder_rep: 'Funder representative',
  lsp_ed: 'Executive Director', lsp_leadership: 'Leadership',
  lsp_finance: 'Finance', lsp_field: 'Field team', lsp_board: 'Board',
  lead_consultant: 'Lead consultant', co_implementer: 'Co-implementer',
  licensed_advisor: 'Licensed advisor', other: 'Other',
}

const KIND_LABEL = {
  plenary: 'Plenary',
  joint_with_funder: 'Joint with funder',
  client_team_only: 'Client team only',
  finance_restricted: 'Finance restricted',
  field_team: 'Field team',
  one_to_one: 'One to one',
}

/** When a session is, in the words somebody would say out loud. */
export function whenText(session) {
  const at = session?.planned_at ? new Date(session.planned_at) : null
  if (at && !Number.isNaN(at.getTime())) {
    return at.toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    })
  }
  if (session?.planned_date) {
    const d = new Date(session.planned_date)
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }
  return 'No time set'
}

/** The next session still to come, or null. Held and cancelled ones are
 *  behind us whatever their date says. */
export function nextSession(sessions, now = new Date()) {
  const upcoming = (sessions || [])
    .filter(s => s.status === 'planned' && s.planned_at && new Date(s.planned_at) >= now)
    .sort((a, b) => new Date(a.planned_at) - new Date(b.planned_at))
  return upcoming[0] || null
}

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
  const [form, setForm] = useState({ title: '', session_kind: 'plenary', when: '', duration_minutes: 60, purpose: '' })

  const load = useCallback(async () => {
    if (!clientId || !dpId) return
    setLoading(true)
    const { data, error } = await supabase.from('gtcv_sessions')
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
      const { data: att } = await supabase.from('gtcv_session_attendance')
        .select('id,session_id,party_id,party_role,required,attended')
        .in('session_id', ids)
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

  async function addSession() {
    const title = form.title.trim()
    if (!title) { setNote({ new: { text: 'Give the session a name first.', bad: true } }); return }
    setBusy('new')
    const row = {
      client_id: clientId,
      dp_id: dpId,
      title,
      session_kind: form.session_kind,
      // A time typed into a browser is that browser's own clock. Stored as an
      // instant so a calendar in another country shows the same moment.
      planned_at: form.when ? new Date(form.when).toISOString() : null,
      planned_date: form.when ? form.when.slice(0, 10) : null,
      duration_minutes: Number(form.duration_minutes) || 60,
      purpose: form.purpose.trim() || null,
      status: 'planned',
    }
    const { data, error } = await supabase.from('gtcv_sessions').insert([row]).select().single()
    setBusy(null)
    if (error) { setNote({ new: { text: 'That did not save: ' + error.message, bad: true } }); return }
    setSessions(prev => [...prev, data].sort((a, b) => new Date(a.planned_at || 0) - new Date(b.planned_at || 0)))
    setForm({ title: '', session_kind: 'plenary', when: '', duration_minutes: 60, purpose: '' })
    setAdding(false)
    setNote({})
  }

  // WHO WAS IN THE ROOM IS SAID, NOT COUNTED. One recording from one laptop
  // carries a whole room, so the room has to be named. Written against
  // engagement_parties, so somebody without a login is covered like anybody
  // else.
  async function addParticipant(session, partyId) {
    if (!partyId) return
    const party = parties.find(p => p.id === partyId)
    setBusy(session.id + partyId)
    const row = {
      client_id: clientId,
      session_id: session.id,
      party_id: partyId,
      party_role: party?.party_role || null,
      required: false,
      attended: true,
    }
    const { data, error } = await supabase.from('gtcv_session_attendance').insert([row]).select().single()
    setBusy(null)
    if (error) { setNote(prev => ({ ...prev, [session.id]: { text: 'That person could not be added: ' + error.message, bad: true } })); return }
    setAttendance(prev => [...prev, data])
    setNote(prev => ({ ...prev, [session.id]: null }))
  }

  async function removeParticipant(row) {
    setBusy(row.id)
    const { error } = await supabase.from('gtcv_session_attendance').delete().eq('id', row.id)
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
            <div style={hint}>
              <strong style={{ color: C.navy }}>People in different places.</strong> Send the invitation.
              Everyone opens the same page, the call is there, and each device records the person in front of it.
            </div>
          </div>

          {sessions.length === 0 && !loading && (
            <div style={{ ...hint, padding: '0.3rem 0 0.6rem' }}>No sessions on this decision point yet.</div>
          )}

          {sessions.map(s => {
            const mine = recordingsFor(s.id)
            const here = attendance.filter(a => a.session_id === s.id)
            const taken = new Set(here.map(a => a.party_id))
            const available = parties.filter(p => !taken.has(p.id))
            return (
              <div key={s.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.6rem 0.75rem', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: C.navy }}>{s.title || 'Working session'}</div>
                    <div style={hint}>
                      {whenText(s)}
                      {s.session_kind ? ` · ${KIND_LABEL[s.session_kind] || s.session_kind}` : ''}
                      {s.duration_minutes ? ` · ${s.duration_minutes} min` : ''}
                      {s.status !== 'planned' ? ` · ${s.status}` : ''}
                    </div>
                    {mine.length > 0 && (
                      <div style={{ ...hint, color: C.green }}>
                        {mine.length === 1 ? '1 recording' : `${mine.length} recordings`} on this session
                      </div>
                    )}
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
                  </div>
                </div>
                {s.purpose && <div style={{ ...hint, marginTop: '0.35rem' }}>{s.purpose}</div>}

                {/* WHO IS IN THIS SESSION. Chosen from the people on the
                    engagement, so one recording made on one laptop still knows
                    the room it was made in. */}
                <div style={{ marginTop: '0.45rem', paddingTop: '0.45rem', borderTop: `1px solid var(--cv-border-soft)` }}>
                  <div style={{ ...mono, fontSize: '0.76rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: C.slate, marginBottom: '0.3rem' }}>
                    Who is in this session
                  </div>
                  {here.length === 0 && <div style={{ ...hint, marginBottom: '0.35rem' }}>Nobody named yet.</div>}
                  {here.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                      {here.map(a => {
                        const who = parties.find(p => p.id === a.party_id)
                        return (
                          <span key={a.id} style={{ ...mono, fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', border: `1px solid ${C.purple}`, color: C.purple, borderRadius: 999, padding: '0.15rem 0.6rem' }}>
                            {who?.name || 'Somebody no longer on the engagement'}
                            {who?.party_role ? ` · ${ROLE_LABEL[who.party_role] || who.party_role}` : ''}
                            {canManage && (
                              <button type="button" aria-label={`Take ${who?.name || 'this person'} off the session`}
                                disabled={busy === a.id} onClick={() => removeParticipant(a)}
                                style={{ background: 'transparent', border: 'none', color: C.purple, cursor: 'pointer', fontSize: '0.95rem', lineHeight: 1, padding: 0 }}>
                                {'\u00D7'}
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

          {canManage && !adding && (
            <button type="button" style={btn(C.teal)} onClick={() => setAdding(true)}>+ New session</button>
          )}

          {canManage && adding && (
            <div style={{ border: `1px solid ${C.teal}`, borderRadius: 8, padding: '0.7rem 0.8rem', marginTop: '0.4rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '0.6rem' }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ ...mono, fontSize: '0.78rem', color: C.slate }} htmlFor="ss-title">What is this session</label>
                  <input id="ss-title" style={field} value={form.title} placeholder="Service listing plenary"
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div>
                  <label style={{ ...mono, fontSize: '0.78rem', color: C.slate }} htmlFor="ss-kind">Room</label>
                  <select id="ss-kind" style={field} value={form.session_kind}
                    onChange={e => setForm(f => ({ ...f, session_kind: e.target.value }))}>
                    {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ ...mono, fontSize: '0.78rem', color: C.slate }} htmlFor="ss-when">When</label>
                  <input id="ss-when" type="datetime-local" style={field} value={form.when}
                    onChange={e => setForm(f => ({ ...f, when: e.target.value }))} />
                </div>
                <div>
                  <label style={{ ...mono, fontSize: '0.78rem', color: C.slate }} htmlFor="ss-mins">Minutes</label>
                  <input id="ss-mins" type="number" min="15" step="15" style={field} value={form.duration_minutes}
                    onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ ...mono, fontSize: '0.78rem', color: C.slate }} htmlFor="ss-purpose">What it has to produce</label>
                  <input id="ss-purpose" style={field} value={form.purpose}
                    onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} />
                </div>
              </div>
              {note.new && <div style={{ ...hint, marginTop: '0.4rem', color: note.new.bad ? C.red : C.green }}>{note.new.text}</div>}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                <button type="button" style={btn(C.teal, true)} disabled={busy === 'new'} onClick={addSession}>
                  {busy === 'new' ? 'Saving…' : 'Add the session'}
                </button>
                <button type="button" style={btn(C.slate)} onClick={() => { setAdding(false); setNote({}) }}>Cancel</button>
              </div>
              <p style={{ ...hint, marginTop: '0.5rem' }}>
                Who the method requires in each room, and who it keeps out, is on Sessions and rooms.
                Nothing here overrides it.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
