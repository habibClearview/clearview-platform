// @ts-nocheck
'use client'
// ============================================================
// WHO IS ON THIS ENGAGEMENT
//
// The party list is the engagement's cast: the Executive Director who signs
// each gate, the funder representative who co-signs two records, the board
// chair, the finance lead, the field team, the lead consultant and the
// co-implementer. Until this screen existed the list could only be written by
// hand in SQL, which meant a second client could not be set up at all without
// a developer. That is the opposite of what this platform is for.
//
// THE ACCOUNT LINK. A party's Sign button only appears for the person whose
// login matches the party. The link is made from the email address by the
// server, so the screen shows whether it found an account rather than letting
// anyone point a party at a login by hand. A party with no account is normal
// and is not a problem: a board chair who never logs in still signs, and the
// lead consultant records that signature in the room.
//
// Roles come from PARTY_ROLE_LABELS, so nothing here is specific to any one
// engagement or any one organisation.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PARTY_ROLE_LABELS, accountRoleForParty } from '@/lib/engagement-types'
// R34, R36, R37. One person's permanent link, beside the person it belongs to.
import PersonalLinkControls from '@/components/gtcv/PersonalLinkControls'

const C = {
  card: 'var(--cv-card)', border: 'var(--cv-border)', slate: 'var(--cv-slate)',
  navy: 'var(--cv-navy)', teal: 'var(--cv-teal)', green: 'var(--cv-green)',
  amber: 'var(--cv-amber)', red: 'var(--cv-red)',
}
const mono = { fontFamily: 'var(--cv-font-mono)' }
const hint = { fontSize: '0.88rem', color: C.slate, lineHeight: 1.45 }
const field = {
  width: '100%', padding: '0.42rem 0.55rem', borderRadius: 7,
  // An explicit background, so a box reads as a box. On a transparent fill the
  // border alone was faint enough that the placeholder looked like body text
  // and the field looked like a caption rather than something to type in.
  border: `1px solid ${C.border}`, background: 'var(--cv-card)', color: 'inherit',
  fontFamily: "var(--cv-font)", fontSize: '0.92rem',
}
const btn = (col, solid) => ({
  ...mono, fontSize: '0.84rem', fontWeight: 600, padding: '0.36rem 0.8rem',
  border: `1px solid ${col}`, borderRadius: 7,
  background: solid ? col : 'transparent',
  color: solid ? 'var(--cv-on-accent)' : col, cursor: 'pointer',
})

const ROLE_KEYS = Object.keys(PARTY_ROLE_LABELS)

// Who the method expects to sign something. Used only to suggest the
// signatory tick when a party is added, never to enforce it, since an
// engagement may name its signatories differently.
const USUALLY_SIGNS = ['lsp_ed', 'funder_rep', 'lsp_board', 'lead_consultant', 'client_funder']

const BLANK = {
  party_role: 'lsp_ed', name: '', email: '', mobile: '', organisation: '', title: '', is_signatory: true,
  // ONE LIST OF PEOPLE. 9 September 2026. Which welcome letter this person
  // gets, held on the person rather than in a second list of the same names.
  letter: '',
}

/** What each letter is called on screen, and what no letter means. */
const LETTER_LABEL = {
  payer: 'Paying client letter',
  served: 'Served client letter',
  // A CO-IMPLEMENTER GOT SUPABASE'S STOCK INVITE. 9 September 2026. Habib asked
  // whether there is an email that shows the onboarding of a co-implementer,
  // just like the funders and the served clients. There was not.
  co_implementer: 'Co-implementer letter',
  '': 'No letter',
}

async function call(method, body) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch('/api/engagement-party', {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`)
  return json
}

export default function EngagementPartiesPanel({ clientId, canManage }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(BLANK)
  const [editing, setEditing] = useState(null)

  /**
   * Create a login for somebody on the list.
   *
   * The role comes from their role on the engagement, the same rule the
   * welcome letter now follows, so an invitation cannot quietly hand somebody
   * the right to edit the engagement or sign a gate off because of which
   * button was pressed.
   */
  async function invite(r) {
    setBusy(`invite:${r.id}`); setErr(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const role = accountRoleForParty(r.party_role)
      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: r.email,
          fullName: r.name || r.email,
          role,
          clientId: role === 'funder' ? null : clientId,
          assignedUnitIds: [],
          coImplementerId: null,
          funderProgrammeId: null,
          inviterToken: token,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `That invitation did not go (${res.status})`)
      await load()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  /**
   * Send this person their welcome letter, and nobody else theirs.
   *
   * The letter itself, its wording and its preview live in the welcome pack.
   * What belongs to a person is whether they get one and whether it has gone,
   * and both of those are on this line, so the sending is here too.
   */
  async function sendLetter(r) {
    if (r.letter_sent_at && typeof window !== 'undefined' && !window.confirm(
      `${r.name || r.email} already had this letter on ${new Date(r.letter_sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}. Send it again?`,
    )) return
    setBusy(`letter:${r.id}`); setErr(null); setNote(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const origin = typeof window === 'undefined' ? '' : window.location.origin
      const res = await fetch('/api/engagement-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          clientId, stage: 'scope', journeyUrl: `${origin}/client`,
          includeSignIn: true, onlyEmails: [r.email],
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || json?.reason || `That did not send (${res.status})`)
      if (json?.emailConfigured === false) throw new Error(json.message || 'Email is not switched on here, so nothing was sent.')
      if (json?.reason) throw new Error(json.reason)
      setNote(`The letter went to ${r.name || r.email}.`)
      await load()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  /**
   * Correct the record of whether this person has had their letter.
   *
   * Two letters went out before anything was writing it down, so this has to
   * be able to say "they had it, on this day" without sending anything, and to
   * take that back. The day is asked for rather than assumed: a letter sent
   * last week recorded as today is a wrong date, and a wrong date is worse
   * than a missing one.
   */
  async function correctLetter(r) {
    const already = !!r.letter_sent_at
    if (already && !window.confirm(
      `Clear the record that ${r.name || r.email} has had this letter? Nothing is sent either way.`,
    )) return
    let when = null
    if (!already) {
      const today = new Date().toISOString().slice(0, 10)
      const typed = window.prompt(
        `What day did ${r.name || r.email} receive this letter?\n\nAs yyyy-mm-dd. Your email outbox has the date. Nothing is sent.`,
        today,
      )
      if (typed === null) return
      const day = typed.trim()
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T12:00:00Z`) : null
      if (!parsed || Number.isNaN(parsed.getTime())) {
        setErr(`"${day}" is not a date. Write it as yyyy-mm-dd, for example ${today}.`)
        return
      }
      if (parsed.getTime() > Date.now()) {
        setErr('That day has not happened yet, so a letter cannot have arrived on it.')
        return
      }
      when = parsed.toISOString()
    }
    setBusy(`mark:${r.id}`); setNote(null); setErr(null)
    try {
      await call('PATCH', { clientId, id: r.id, letterSentAt: already ? null : when })
      setNote(already
        ? `${r.name || r.email} is back on the list to be written to.`
        : `${r.name || r.email} is recorded as having had it on ${new Date(when).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Nothing was sent.`)
      await load()
    } catch (e) { setErr(e.message || 'That could not be recorded') }
    setBusy(null)
  }

  const load = useCallback(async () => {
    if (!clientId) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('engagement_parties')
      .select('id, party_role, name, email, mobile, organisation, title, is_signatory, user_id, sort_order, letter, letter_sent_at')
      .eq('client_id', clientId)
      .order('sort_order', { ascending: true })
    if (error) setErr('Could not load the parties: ' + error.message)
    else setErr(null)
    setRows(data || [])
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  async function run(key, fn) {
    if (busy) return
    setBusy(key); setErr(null)
    try { await fn(); await load() }
    catch (e) { setErr(e.message || 'That did not work') }
    setBusy(null)
  }

  function add() {
    run('add', async () => {
      await call('POST', {
        clientId,
        partyRole: draft.party_role,
        name: draft.name,
        email: draft.email,
        mobile: draft.mobile,
        organisation: draft.organisation,
        title: draft.title,
        isSignatory: draft.is_signatory,
        letter: draft.letter || null,
        sortOrder: rows.length + 1,
      })
      setDraft(BLANK); setAdding(false)
    })
  }

  function saveEdit() {
    const e = editing
    run(`edit:${e.id}`, async () => {
      await call('PATCH', {
        clientId, id: e.id,
        partyRole: e.party_role,
        name: e.name,
        email: e.email || '',
        mobile: e.mobile || '',
        organisation: e.organisation || '',
        title: e.title || '',
        isSignatory: !!e.is_signatory,
        letter: e.letter || null,
      })
      setEditing(null)
    })
  }

  function remove(row) {
    if (typeof window !== 'undefined' && !window.confirm(`Remove ${row.name} from this engagement?`)) return
    run(`del:${row.id}`, () => call('DELETE', { clientId, id: row.id }))
  }

  if (loading) return <p style={hint}>Loading the parties...</p>

  const signatories = rows.filter((r) => r.is_signatory)
  const unlinked = signatories.filter((r) => !r.user_id)

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem 1.1rem', background: C.card,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ ...mono, fontSize: '0.78rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
            Who is on this engagement
          </div>
          <div style={{ ...hint, marginTop: '0.3rem', maxWidth: 640 }}>
            This list decides who signs each gate and who signs the Charter. A party can only sign
            from their own login, so the email address is what connects a person to their account.
          </div>
        </div>
        {canManage && !adding ? (
          <button type="button" style={btn(C.teal, true)} onClick={() => setAdding(true)}>Add a party</button>
        ) : null}
      </div>

      {err ? <div style={{ color: C.red, fontSize: '0.95rem', margin: '0.7rem 0' }}>{err}</div> : null}
      {note ? <p style={{ ...hint, color: C.green, margin: '0 0 0.6rem' }}>{note}</p> : null}

      {unlinked.length > 0 ? (
        <div style={{
          marginTop: '0.8rem', border: `1px solid ${C.amber}`, borderRadius: 9,
          padding: '0.55rem 0.8rem', fontSize: '0.88rem', color: C.slate,
        }}>
          {unlinked.length === 1 ? `${unlinked[0].name} signs` : `${unlinked.length} signatories sign`} but
          {unlinked.length === 1 ? ' has ' : ' have '}no account here yet. They can still sign: the lead
          consultant records the signature given in the room. To let them sign themselves, add the email
          address they use to log in.
        </div>
      ) : null}

      {adding ? (
        <div style={{ marginTop: '0.9rem', border: `1px dashed ${C.border}`, borderRadius: 9, padding: '0.8rem' }}>
          <PartyFields value={draft} onChange={setDraft} />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem' }}>
            <button type="button" style={btn(C.teal, true)} onClick={add} disabled={busy === 'add' || !draft.name.trim()}>
              {busy === 'add' ? 'Adding...' : 'Add'}
            </button>
            <button type="button" style={btn(C.slate)} onClick={() => { setAdding(false); setDraft(BLANK) }}>Cancel</button>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.9rem' }}>
        {rows.length === 0 ? (
          <p style={hint}>Nobody is on this engagement yet. Add the Executive Director first, since they sign every gate.</p>
        ) : rows.map((r) => {
          const isEditing = editing && editing.id === r.id
          if (isEditing) {
            return (
              <div key={r.id} style={{ border: `1px solid ${C.teal}`, borderRadius: 9, padding: '0.8rem' }}>
                <PartyFields value={editing} onChange={setEditing} />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem' }}>
                  <button type="button" style={btn(C.teal, true)} onClick={saveEdit} disabled={busy === `edit:${r.id}`}>
                    {busy === `edit:${r.id}` ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" style={btn(C.slate)} onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            )
          }
          return (
            <div key={r.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: '0.6rem', flexWrap: 'wrap',
              border: `1px solid ${C.border}`, borderRadius: 9, padding: '0.55rem 0.8rem',
            }}>
              <div>
                <div style={{ fontSize: '1rem', color: C.navy, fontWeight: 600 }}>
                  {r.name}{r.title ? ` (${r.title})` : ''}
                </div>
                <div style={{ ...mono, fontSize: '0.8rem', color: C.slate }}>
                  {PARTY_ROLE_LABELS[r.party_role] || r.party_role}
                  {r.organisation ? ` · ${r.organisation}` : ''}
                  {r.email ? ` · ${r.email}` : ''}
                  {r.mobile ? ` · ${r.mobile}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                {r.is_signatory ? (
                  <span style={{ ...mono, fontSize: '0.79rem', color: C.navy, border: `1px solid ${C.border}`, borderRadius: 999, padding: '0.1rem 0.55rem' }}>
                    Signs
                  </span>
                ) : null}
                {/* On the same line as the person, because it is a fact about
                    them. It used to be a second list of the same names. */}
                <span style={{ ...mono, fontSize: '0.79rem', color: r.letter ? C.teal : C.slate }}>
                  {r.letter
                    ? `${LETTER_LABEL[r.letter]}${r.letter_sent_at
                      ? ` · sent ${new Date(r.letter_sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                      : ' · not sent yet'}`
                    : 'No letter'}
                </span>
                {/* ONE LIST, WITH THE LOGIN ON IT. 11 September 2026.
                    Habib: why do we still have two lists of the names of the
                    people on this assignment on this tab, the client invite and
                    login can also be on one list. The invite panel below this
                    one repeated every name purely to carry this one fact and
                    this one button, so the same person was typed, corrected and
                    read twice. */}
                <span style={{ ...mono, fontSize: '0.79rem', color: r.user_id ? C.green : C.amber }}>
                  {r.user_id ? 'Has a login' : 'No login yet'}
                </span>
                {/* SENDING THE LETTER, WHERE THE PERSON IS. 11 September
                    2026. Habib, twice: the list of names is still showing more
                    than once on this tab. The welcome pack held every one of
                    these people again purely to carry a tick box, whether they
                    had had the letter, and a send. All of that is about a
                    person, and the person is already on this line. */}
                {canManage && r.letter && r.email ? (
                  <button
                    type="button"
                    style={btn(C.teal)}
                    disabled={busy === `letter:${r.id}`}
                    onClick={() => sendLetter(r)}
                    title={`Send the ${LETTER_LABEL[r.letter]} to ${r.name || r.email} and nobody else`}
                  >{busy === `letter:${r.id}`
                    ? 'Sending...'
                    : r.letter_sent_at ? 'Send again' : 'Send the letter'}</button>
                ) : null}
                {canManage && r.letter && r.email ? (
                  <button
                    type="button"
                    disabled={busy === `mark:${r.id}`}
                    onClick={() => correctLetter(r)}
                    title={r.letter_sent_at
                      ? 'Tell the platform they never received it, so they go back on the list. Nothing is sent now.'
                      : 'Tell the platform they already had this letter, without sending anything'}
                    style={{
                      ...mono, fontSize: '0.74rem', padding: '0.25rem 0.2rem', border: 'none',
                      background: 'transparent', textDecoration: 'underline', color: C.slate, cursor: 'pointer',
                    }}
                  >{busy === `mark:${r.id}` ? 'Saving...' : 'Correct this'}</button>
                ) : null}
                {canManage && !r.user_id && r.email ? (
                  <button
                    type="button"
                    style={btn(C.teal)}
                    disabled={busy === `invite:${r.id}`}
                    onClick={() => invite(r)}
                    title={`Create a login for ${r.name || r.email} and send them the link`}
                  >{busy === `invite:${r.id}` ? 'Inviting...' : 'Give them a login'}</button>
                ) : null}
                {canManage ? (
                  <>
                    <PersonalLinkControls clientId={clientId} partyId={r.id} canManage={canManage} />
                    <button type="button" style={btn(C.slate)} onClick={() => setEditing({ ...r })}>Edit</button>
                    <button type="button" style={btn(C.red)} onClick={() => remove(r)} disabled={busy === `del:${r.id}`}>
                      {busy === `del:${r.id}` ? 'Removing...' : 'Remove'}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PartyFields({ value, onChange }) {
  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    const next = { ...value, [k]: v }
    // Choosing a role that usually signs ticks the box, because forgetting it
    // is how a gate ends up with nobody able to close it.
    if (k === 'party_role' && !('touchedSignatory' in value)) {
      next.is_signatory = USUALLY_SIGNS.includes(v)
    }
    if (k === 'is_signatory') next.touchedSignatory = true
    onChange(next)
  }
  const lab = { ...mono, fontSize: '0.78rem', letterSpacing: '.08em', textTransform: 'uppercase', color: C.slate, display: 'block', marginBottom: 4 }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '0.6rem' }}>
      <div>
        <label style={lab}>Role</label>
        <select aria-label="Role on this engagement" style={field} value={value.party_role} onChange={set('party_role')}>
          {ROLE_KEYS.map((k) => <option key={k} value={k}>{PARTY_ROLE_LABELS[k]}</option>)}
        </select>
      </div>
      <div>
        <label style={lab}>Name</label>
        <input aria-label="Full name" style={field} value={value.name || ''} onChange={set('name')} placeholder="Full name" />
      </div>
      <div>
        {/* Beside the person, on the same form. The welcome pack used to keep a
            second list of these same names purely to hold this one choice. */}
        <label style={lab}>Welcome letter</label>
        <select aria-label="Which welcome letter they receive" style={field} value={value.letter || ''} onChange={set('letter')}>
          <option value="">No letter</option>
          <option value="served">Served client letter</option>
          <option value="payer">Paying client letter</option>
          <option value="co_implementer">Co-implementer letter</option>
        </select>
      </div>
      <div>
        <label style={lab}>Job title</label>
        <input aria-label="Job title" style={field} value={value.title || ''} onChange={set('title')} placeholder="Executive Director" />
      </div>
      <div>
        <label style={lab}>Organisation</label>
        <input aria-label="Organisation" style={field} value={value.organisation || ''} onChange={set('organisation')} />
      </div>
      <div>
        {/* The placeholder shows the shape of an address. It used to carry the
            hint instead, which made the field read as a sentence of guidance
            and left people looking for a box that was already there. */}
        <label style={lab}>Email they log in with</label>
        <input aria-label="Email they log in with" style={field} type="email" value={value.email || ''} onChange={set('email')} placeholder="name@organisation.org" />
      </div>
      <div>
        {/* R33. The one box Stage 2 adds. The wording of the email box beside
            it is deliberately left exactly as it was: it still says what it
            says about a login, and Section 4 protects it. Instructed 11 August
            2026: "One new box on the list that already exists... Leave the
            existing email wording exactly as it is." */}
        <label style={lab}>Mobile</label>
        <input aria-label="Mobile" style={field} type="tel" value={value.mobile || ''} onChange={set('mobile')} placeholder="+234 800 000 0000" />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
        <label style={{ ...hint, display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!value.is_signatory} onChange={set('is_signatory')} />
          This party signs
        </label>
      </div>
    </div>
  )
}
