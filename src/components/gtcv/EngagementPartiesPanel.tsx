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
import { PARTY_ROLE_LABELS } from '@/lib/engagement-types'
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
  const [busy, setBusy] = useState(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(BLANK)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    if (!clientId) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('engagement_parties')
      .select('id, party_role, name, email, mobile, organisation, title, is_signatory, user_id, sort_order')
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
          <div style={{ ...mono, fontSize: '0.75rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
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
                <span style={{ ...mono, fontSize: '0.79rem', color: r.user_id ? C.green : C.amber }}>
                  {r.user_id ? 'Can sign from their own login' : 'No account here'}
                </span>
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
  const lab = { ...mono, fontSize: '0.72rem', letterSpacing: '.08em', textTransform: 'uppercase', color: C.slate, display: 'block', marginBottom: 4 }
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
