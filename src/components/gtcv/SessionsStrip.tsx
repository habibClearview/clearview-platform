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
// call." Both, without a setting to choose wrongly. The session page holds the
// call for when people are apart, and records the microphone of every device
// that opens it for when they are round a table. Three laptops on a table
// gives a better record than one microphone in the middle, and the call is
// simply ignored. Nothing has to be decided in advance and nothing has to be
// changed on the day.
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
          <p style={{ ...hint, marginBottom: '0.7rem' }}>
            Everyone in one room? Open the session on each laptop or phone and press Start recording there,
            and every device records the person in front of it. In different places? The same page holds the call.
            Nothing to choose in advance.
          </p>

          {sessions.length === 0 && !loading && (
            <div style={{ ...hint, padding: '0.3rem 0 0.6rem' }}>No sessions on this decision point yet.</div>
          )}

          {sessions.map(s => {
            const mine = recordingsFor(s.id)
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
