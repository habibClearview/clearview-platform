// @ts-nocheck
'use client'
// ============================================================
// GATE SIGN-OFF PANEL
//
// One gate, and the three things the method says can happen to it.
//
// The Delivery Guide repeats the same pattern at every zone close: the
// co-implementer drafts, the lead consultant reviews, the Executive
// Director signs. Authorising the next zone to open is separate, and it
// belongs to the lead consultant alone: "no zone opens until the previous
// gate is closed with documented evidence... a zone opened without a
// completed gate is a workshop, not a canvas engagement."
//
// Two records carry the funder's signature as well. The pre-engagement
// diagnostic record is signed by the Executive Director, the board chair,
// the funder representative and the lead consultant before Zone 1 opens,
// and is filed with the funder. The engagement completion record is signed
// by the lead consultant, the Executive Director and the funder
// representative. The scale pathway commitment additionally carries board
// approval.
//
// So the panel shows, for this gate: who has signed, who is still
// outstanding, whether the lead consultant has authorised the next zone,
// and whether the gate has been returned with a gap named. The signed-in
// user gets a Sign button only when their party role is one this gate
// requires. Authorise and Return are the lead consultant's.
//
// Writes go through /api/gate-signoff, which authenticates the caller,
// re-checks the same rules server side, and always records the signer from
// the session rather than from the request body.
//
// CLIENT AGNOSTIC: no organisation, funder or person is named here. Every
// name shown comes from the engagement's own parties.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const SIGNOFFS_TABLE = 'gtcv_gate_signoffs'
const PARTIES_TABLE = 'engagement_parties'

const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', white: 'var(--cv-card)',
  slate: 'var(--cv-slate)', border: 'var(--cv-border)', teal: 'var(--cv-teal)',
  red: 'var(--cv-red)', green: 'var(--cv-green)', amber: 'var(--cv-amber)',
  purple: 'var(--cv-purple)', alt: 'var(--cv-alt)',
}
const card = { background: C.white, border: '1px solid var(--cv-border-soft)', borderRadius: 14, padding: '1.35rem 1.5rem', marginBottom: '1.25rem', boxShadow: '0 1px 2px var(--cv-shadow-1), 0 10px 30px var(--cv-shadow-1)' }
const secH = { fontFamily: 'Georgia,serif', fontSize: '1.32rem', fontWeight: 700, color: C.navy, margin: 0 }
const hint = { fontSize: '1.01rem', color: C.slate, lineHeight: 1.4 }
const mono = { fontFamily: 'monospace', fontSize: '0.85rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.slate }
const cell = { width: '100%', padding: '0.4rem 0.55rem', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: '1.01rem', fontFamily: 'inherit', background: 'var(--cv-bg-2)', color: C.navy, boxSizing: 'border-box' }
const ghostBtn = { fontFamily: 'monospace', fontSize: '0.91rem', padding: '0.3rem 0.7rem', border: `1px solid ${C.cyan}`, borderRadius: 6, background: 'transparent', color: C.cyan, cursor: 'pointer' }
const solidBtn = { fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, padding: '0.38rem 0.9rem', border: 'none', borderRadius: 6, background: C.cyan, color: 'var(--cv-on-accent)', cursor: 'pointer' }
const warnBtn = { fontFamily: 'monospace', fontSize: '0.91rem', padding: '0.3rem 0.7rem', border: `1px solid ${C.red}`, borderRadius: 6, background: 'transparent', color: C.red, cursor: 'pointer' }

const ROLE_LABEL = {
  client_funder: 'Programme funder',
  funder_rep: 'Funder representative',
  lsp_ed: 'Executive Director',
  lsp_leadership: 'Leadership team',
  lsp_finance: 'Finance lead',
  lsp_field: 'Field team',
  lsp_board: 'Board chair',
  lead_consultant: 'Lead consultant',
  co_implementer: 'Co-implementer',
  licensed_advisor: 'Licensed advisor',
  other: 'Other',
}
function roleLabel(role) { return ROLE_LABEL[role] || role || 'Unassigned role' }

const DP_LABEL = {
  setup: 'Before Zone 1, the pre-engagement diagnostic record',
  phase_0: 'Phase 0, Assumption Clearing',
  dp01: 'DP01, Service Reality Audit',
  dp02: 'DP02, Customer and Problem Clarity',
  dp03: 'DP03, Value Proposition Architecture',
  dp04: 'DP04, Commercial Viability Model',
  dp05: 'DP05, Market Entry Design',
  dp06: 'DP06, Identity and Partner Architecture',
  dp07: 'DP07, Pilot and Learn Architecture',
  dp08: 'DP08, Scale and Expansion Pathway',
  dp09: 'DP09, Commercial Readiness Diagnostic',
  handover: 'Handover, the engagement completion record',
}

// Who signs which record. The Executive Director signs every gate. The
// funder co-signs the two records the method names, and the board chair
// signs the pre-engagement diagnostic record and approves the scale
// pathway commitment.
const EXTRA_SIGNERS = {
  setup: ['lsp_board', 'funder_rep', 'lead_consultant'],
  dp08: ['lsp_board'],
  dp09: ['funder_rep'],
  handover: ['funder_rep', 'lead_consultant'],
}
function requiredSigners(dpId) {
  return ['lsp_ed', ...(EXTRA_SIGNERS[dpId] || [])]
}

// Why the funder or the board is on this particular record.
const SIGNER_NOTE = {
  setup: 'All parties sign the diagnostic record before leaving the room, and the signed record is filed with the funder.',
  dp08: 'The board approves the scale pathway commitment.',
  dp09: 'The diagnostic is scored jointly with the funder present and the record is signed.',
  handover: 'The completion record carries three signatures: the lead consultant, the Executive Director and the funder representative.',
}

function fmtDate(iso) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return String(iso).slice(0, 10) }
}

async function postSignoff(body) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch('/api/gate-signoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`)
  return json
}

export default function GateSignOffPanel({ clientId, dpId, canManage }) {
  const [rows, setRows] = useState([])
  const [parties, setParties] = useState([])
  const [me, setMe] = useState(null)          // { userId, party }
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnNote, setReturnNote] = useState('')

  const load = useCallback(async () => {
    if (!clientId || !dpId) { setRows([]); setParties([]); setLoading(false); return }
    setLoading(true)
    const [sRes, pRes, uRes] = await Promise.all([
      supabase.from(SIGNOFFS_TABLE).select('*').eq('client_id', clientId).eq('dp_id', dpId)
        .order('signed_at', { ascending: true }),
      supabase.from(PARTIES_TABLE).select('id, party_role, name, organisation, title, user_id, sort_order')
        .eq('client_id', clientId).order('sort_order', { ascending: true }),
      supabase.auth.getUser(),
    ])
    const firstErr = sRes.error || pRes.error
    if (firstErr) setErr('Could not load the gate record: ' + firstErr.message)
    else setErr(null)
    const partyRows = pRes.data || []
    setRows(sRes.data || [])
    setParties(partyRows)
    const userId = uRes?.data?.user?.id || null
    setMe({ userId, party: userId ? partyRows.find((p) => p.user_id === userId) || null : null })
    setLoading(false)
  }, [clientId, dpId])

  useEffect(() => { load() }, [load])

  const signed = useMemo(() => rows.filter((r) => r.decision === 'signed'), [rows])
  const authorisations = useMemo(() => rows.filter((r) => r.decision === 'authorised'), [rows])
  const returns = useMemo(() => rows.filter((r) => r.decision === 'returned'), [rows])

  const needed = requiredSigners(dpId)
  const signedRoles = useMemo(() => new Set(signed.map((r) => r.signer_role)), [signed])
  const outstanding = needed.filter((r) => !signedRoles.has(r))
  const authorised = authorisations.length > 0

  function partyFor(role) {
    return parties.find((p) => p.party_role === role) || null
  }

  // The signed-in user may sign when their own party role is one this gate
  // requires. Someone with manage rights may also record a signature that
  // was given in the room, which is how a signatory without a login signs.
  const myRole = me && me.party ? me.party.party_role : null
  const iCanSign = !!myRole && needed.includes(myRole) && !signedRoles.has(myRole)

  // The route resolves who is signing from the party list, so the name is
  // never sent from here. What is sent is which role the screen believed it
  // was acting for, which the route checks rather than trusts, and for a
  // signature given in the room, which party it belongs to.
  async function act(decision, signerRole, note, onBehalfOfPartyId) {
    if (busy) return
    setBusy(true)
    try {
      await postSignoff({ clientId, dpId, decision, signerRole, note, onBehalfOfPartyId })
      setErr(null)
      setReturnOpen(false)
      setReturnNote('')
      await load()
    } catch (e) {
      setErr(e.message || 'Could not record the sign-off')
    }
    setBusy(false)
  }

  function signAsMe() {
    if (!me || !me.party) return
    act('signed', me.party.party_role, null, null)
  }

  function recordSignatureFor(role) {
    const party = partyFor(role)
    if (!party) {
      setErr(`Nobody is named as ${roleLabel(role)} on this engagement yet. Add them in Engagement Setup before recording their signature.`)
      return
    }
    if (typeof window !== 'undefined' && !window.confirm(
      `Record the signature given in the room by ${party.name}? The record will show that you entered it.`,
    )) return
    act('signed', party.party_role, null, party.id)
  }

  function authorise() {
    act('authorised', 'lead_consultant', null, null)
  }

  // Authorising with signatures still outstanding is allowed, because a lead
  // consultant sometimes has to open the next zone while a signature is
  // travelling. It is not allowed to happen by accident: the button looked
  // faded but clicked through, so one stray press closed a gate without its
  // evidence. Now the outstanding roles are named and the override is a
  // deliberate answer.
  function authoriseWithCheck() {
    if (outstanding.length > 0) {
      const who = outstanding.map(roleLabel).join(', ')
      const plural = outstanding.length === 1 ? 'has' : 'have'
      if (typeof window !== 'undefined' && !window.confirm(
        `${who} ${plural} not signed this gate. Authorising now opens the next zone without their signature. Continue?`,
      )) return
    }
    authorise()
  }

  function submitReturn() {
    if (!returnNote.trim()) { setErr('Name the gap before returning the gate'); return }
    act('returned', 'lead_consultant', returnNote.trim(), null)
  }

  const gateState = returns.length > 0 && !authorised
    ? { text: 'Returned', color: C.red }
    : authorised
      ? { text: 'Next zone authorised', color: C.green }
      : outstanding.length === 0
        ? { text: 'Signed, waiting on the lead consultant', color: C.amber }
        : { text: 'Open', color: C.slate }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <div style={secH}>Gate sign-off</div>
          <div style={{ ...hint, marginTop: '0.25rem' }}>
            {DP_LABEL[dpId] || dpId}
          </div>
        </div>
        <span style={{ fontFamily: 'monospace', fontSize: '0.87rem', color: gateState.color, border: `1px solid ${gateState.color}`, borderRadius: 999, padding: '0.15rem 0.6rem' }}>
          {gateState.text}
        </span>
      </div>

      <div style={{ ...hint, marginTop: '0.6rem' }}>
        The co-implementer drafts, the lead consultant reviews, the Executive Director signs.
        No zone opens until the lead consultant authorises it.
        {SIGNER_NOTE[dpId] ? ` ${SIGNER_NOTE[dpId]}` : ''}
      </div>

      {err && <div style={{ fontSize: '1.01rem', color: C.red, margin: '0.6rem 0' }}>{err}</div>}

      {loading ? (
        <div style={{ ...hint, marginTop: '0.8rem' }}>Loading the gate record...</div>
      ) : (
        <>
          <div style={{ ...mono, margin: '1rem 0 0.5rem' }}>Signatures</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {needed.map((role) => {
              const record = signed.find((r) => r.signer_role === role)
              const party = partyFor(role)
              const done = !!record
              return (
                <div
                  key={role}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: '0.6rem', flexWrap: 'wrap',
                    border: `1px solid ${done ? C.green : C.border}`,
                    borderRadius: 8, padding: '0.5rem 0.75rem',
                    background: done ? C.alt : 'transparent',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '1.01rem', color: C.navy, fontWeight: 600 }}>
                      {record ? record.signer_name : party ? party.name : 'Nobody named yet'}
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: C.slate }}>
                      {roleLabel(role)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {done ? (
                      <span style={{ fontFamily: 'monospace', fontSize: '0.87rem', color: C.green }}>
                        Signed {fmtDate(record.signed_at)}
                      </span>
                    ) : (
                      <span style={{ fontFamily: 'monospace', fontSize: '0.87rem', color: C.amber }}>Outstanding</span>
                    )}
                    {!done && myRole === role && (
                      <button style={solidBtn} onClick={signAsMe} disabled={busy}>Sign</button>
                    )}
                    {!done && myRole !== role && canManage && (
                      <button style={ghostBtn} onClick={() => recordSignatureFor(role)} disabled={busy}>
                        Record signature
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {iCanSign && (
            <div style={{ ...hint, marginTop: '0.6rem' }}>
              You are recorded as the {roleLabel(myRole)} on this engagement, so this gate is yours to sign.
            </div>
          )}

          <div style={{ ...mono, margin: '1.1rem 0 0.5rem' }}>Authorisation to open the next zone</div>
          <div
            style={{
              border: `1px solid ${authorised ? C.green : C.border}`,
              borderRadius: 8, padding: '0.6rem 0.75rem',
              background: authorised ? C.alt : 'transparent',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: '0.6rem', flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: '1.01rem', color: C.navy }}>
              {authorised
                ? `Authorised by ${authorisations[0].signer_name} on ${fmtDate(authorisations[0].signed_at)}`
                : 'Not yet authorised. The next zone stays shut.'}
            </div>
            {canManage && !authorised && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  style={outstanding.length ? { ...solidBtn, opacity: 0.6 } : solidBtn}
                  onClick={authoriseWithCheck}
                  disabled={busy}
                  title={outstanding.length
                    ? `Signatures are still outstanding: ${outstanding.map(roleLabel).join(', ')}`
                    : 'Open the next zone'}
                >
                  Authorise the next zone
                </button>
                <button style={warnBtn} onClick={() => setReturnOpen(!returnOpen)} disabled={busy}>
                  Return this gate
                </button>
              </div>
            )}
          </div>

          {canManage && outstanding.length > 0 && !authorised && (
            <div style={{ ...hint, marginTop: '0.5rem', color: C.amber }}>
              {outstanding.map(roleLabel).join(', ')} {outstanding.length === 1 ? 'has' : 'have'} not signed yet.
              A gate authorised without the signatures is a gate closed without evidence.
            </div>
          )}

          {returnOpen && canManage && (
            <div style={{ border: `1px solid ${C.red}`, borderRadius: 8, padding: '0.7rem 0.8rem', marginTop: '0.7rem' }}>
              <div style={{ ...mono, marginBottom: '0.35rem' }}>Name the gap</div>
              <textarea
                style={{ ...cell, minHeight: 64, resize: 'vertical', lineHeight: 1.35 }}
                value={returnNote}
                placeholder="What is missing, and what has to be true before this gate closes"
                onChange={(e) => setReturnNote(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button style={warnBtn} onClick={submitReturn} disabled={busy}>Return the gate</button>
                <button style={ghostBtn} onClick={() => { setReturnOpen(false); setReturnNote('') }}>Cancel</button>
              </div>
            </div>
          )}

          {returns.length > 0 && (
            <>
              <div style={{ ...mono, margin: '1.1rem 0 0.5rem' }}>Returned</div>
              {returns.map((r) => (
                <div key={r.id} style={{ border: `1px solid ${C.red}`, borderRadius: 8, padding: '0.6rem 0.75rem', marginBottom: '0.4rem' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: C.red }}>
                    {r.signer_name} . {fmtDate(r.signed_at)}
                  </div>
                  <div style={{ fontSize: '1.01rem', color: C.navy, marginTop: '0.2rem', whiteSpace: 'pre-wrap' }}>{r.note || ''}</div>
                </div>
              ))}
            </>
          )}

          {!canManage && !iCanSign && (
            <div style={{ ...hint, marginTop: '0.8rem' }}>
              Read only. This gate is signed by the Executive Director and authorised by the lead consultant.
            </div>
          )}
        </>
      )}
    </div>
  )
}
