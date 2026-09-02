// @ts-nocheck
'use client'
// ============================================================
// DELIVERABLES AND CLAIMS
//
// The commercial side of an engagement, and the only screen where money
// appears. The organisation being coached never sees this. What they see is
// the canvas and the Charter; what is owed and by whom is between the
// consultant and whoever is paying, and mixing the two would put a fee
// conversation in front of the people doing the work.
//
// HOW IT FITS TOGETHER. The canvas never changes: nine decision blocks, same
// order, every engagement. A contract calls its milestones whatever it calls
// them. Mapping one to the other is what lets the method stay fixed while the
// paperwork bends to the funder. Paste the deliverables section of a Terms of
// Reference and the mapping is proposed; every proposed row then has to be
// approved, edited or rejected by hand, because a proposal is a reading of a
// document and a reading can be wrong.
//
// A claim is assembled from the approved mappings only, and it names its own
// gaps. A gate with no evidence or no signature appears in the pack as a gap
// rather than being quietly left out, so the person approving the claim sees
// the hole before the funder does. Nothing is sent until it is approved.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { formatMoney } from '@/lib/currency'
import { supabase } from '@/lib/supabase'

const C = {
  card: 'var(--cv-card)', alt: 'var(--cv-alt)', border: 'var(--cv-border)',
  slate: 'var(--cv-slate)', navy: 'var(--cv-navy)', teal: 'var(--cv-teal)',
  green: 'var(--cv-green)', amber: 'var(--cv-amber)', red: 'var(--cv-red)',
}
const mono = { fontFamily: 'var(--cv-font-mono)' }
const hint = { fontSize: '0.88rem', color: C.slate, lineHeight: 1.5 }
const field = {
  width: '100%', padding: '0.42rem 0.55rem', borderRadius: 7,
  border: `1px solid ${C.border}`, background: 'transparent', color: 'inherit',
  fontFamily: "var(--cv-font)", fontSize: '0.92rem',
}
const btn = (col, solid) => ({
  ...mono, fontSize: '0.83rem', fontWeight: 600, padding: '0.34rem 0.78rem',
  border: `1px solid ${col}`, borderRadius: 7,
  background: solid ? col : 'transparent',
  color: solid ? 'var(--cv-on-accent)' : col, cursor: 'pointer',
})

const DP_LABEL = {
  setup: 'Pre-engagement', phase_0: 'Phase 0',
  dp01: 'Block 1 Service reality', dp02: 'Block 2 Customer clarity',
  dp03: 'Block 3 Value proposition', dp04: 'Block 4 Viability model',
  dp05: 'Block 5 Market entry', dp06: 'Block 6 Identity and partners',
  dp07: 'Block 7 Pilot iteration 1', dp08: 'Block 8 Pilot iteration 2',
  dp09: 'Block 9 Readiness diagnostic', handover: 'Handover',
}
const DP_IDS = Object.keys(DP_LABEL)

function money(amount, currency) {
  if (amount === null || amount === undefined || amount === '') return 'Not stated'
  try {
    return formatMoney(amount, currency, 0)
  } catch { return `${currency || ''} ${amount}` }
}
function fmtDate(iso) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return String(iso).slice(0, 10) }
}

async function api(path, method, body) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`)
  return json
}

export default function DeliverablesPanel({ clientId, canManage , currency: engagementCurrency }) {
  const [state, setState] = useState({ deliverables: [], mappings: [], packs: [] })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(null)
  const [torOpen, setTorOpen] = useState(false)
  const [torText, setTorText] = useState('')
  const [torRef, setTorRef] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState({ code: '', title: '', description: '', milestoneLabel: '', amount: '', currency: '', dueWindow: '' })
  const [openPack, setOpenPack] = useState(null)

  const load = useCallback(async () => {
    if (!clientId) { setLoading(false); return }
    setLoading(true)
    try {
      const data = await api(`/api/deliverables?clientId=${encodeURIComponent(clientId)}`, 'GET')
      setState(data); setErr(null)
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  async function run(key, fn, ok) {
    if (busy) return
    setBusy(key); setErr(null); setNote(null)
    try {
      const r = await fn()
      if (ok) setNote(typeof ok === 'function' ? ok(r) : ok)
      await load()
    } catch (e) { setErr(e.message || 'That did not work') }
    setBusy(null)
  }

  if (!canManage) {
    return (
      <div style={{ ...hint, border: `1px dashed ${C.border}`, borderRadius: 10, padding: '0.9rem 1rem' }}>
        The deliverables and the fee are held separately from the coaching record and are not part of
        this view.
      </div>
    )
  }

  if (loading) return <p style={hint}>Loading the deliverables...</p>

  const mapsFor = (id) => state.mappings.filter((m) => m.deliverable_id === id)
  const packsFor = (id) => state.packs.filter((p) => p.deliverable_id === id)
  const pendingCount = state.mappings.filter((m) => !m.approved).length
  const totalValue = state.deliverables.reduce((s, d) => s + (Number(d.payment_amount) || 0), 0)
  // The engagement's own currency, then whatever the first deliverable was
  // recorded in, then nothing. Never an invented one.
  const currency = engagementCurrency || state.deliverables[0]?.payment_currency || null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem 1.1rem', background: C.card }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.8rem', flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 640 }}>
            <div style={{ ...mono, fontSize: '0.75rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
              Deliverables and claims
            </div>
            <div style={{ ...hint, marginTop: '0.3rem' }}>
              The canvas never changes. What changes from one contract to the next is what the funder
              called the milestones. Mapping one to the other is what lets the same method serve any
              client. This screen is yours alone: the organisation being coached does not see it.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" style={btn(C.teal, true)} onClick={() => setTorOpen(!torOpen)}>
              {torOpen ? 'Close' : 'Read a Terms of Reference'}
            </button>
            <button type="button" style={btn(C.slate)} onClick={() => setAddOpen(!addOpen)}>
              {addOpen ? 'Close' : 'Add one by hand'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1.4rem', marginTop: '0.9rem', flexWrap: 'wrap' }}>
          <Stat label="Deliverables" value={state.deliverables.length} />
          <Stat label="Total value" value={money(totalValue, currency)} />
          <Stat label="Mappings to approve" value={pendingCount} tone={pendingCount > 0 ? C.amber : C.green} />
          <Stat label="Claims" value={state.packs.length} />
        </div>

        {err ? <div style={{ color: C.red, fontSize: '0.95rem', marginTop: '0.7rem' }}>{err}</div> : null}
        {note ? <div style={{ color: C.green, fontSize: '0.95rem', marginTop: '0.7rem' }}>{note}</div> : null}
      </div>

      {torOpen ? (
        <div style={{ border: `1px solid ${C.teal}`, borderRadius: 12, padding: '1rem 1.1rem', background: C.card }}>
          <div style={{ ...mono, fontSize: '0.75rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
            Paste the deliverables section
          </div>
          <p style={{ ...hint, margin: '0.4rem 0 0.7rem' }}>
            Paste the part of the Terms of Reference that lists the deliverables, the milestones and
            what each one pays. What comes back is a proposal. Nothing counts until you approve each
            mapping, and rejecting one leaves nothing behind.
          </p>
          <input aria-label="Document reference, for example the contract number" style={{ ...field, marginBottom: '0.5rem' }} placeholder="Document reference, for example the contract number"
            value={torRef} onChange={(e) => setTorRef(e.target.value)} />
          <textarea aria-label="Deliverable 1: ... payable on ..." style={{ ...field, minHeight: 180, resize: 'vertical' }} value={torText}
            onChange={(e) => setTorText(e.target.value)}
            placeholder="Deliverable 1: ... payable on ..." />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem' }}>
            <button type="button"
              style={btn(C.teal, true)}
              disabled={busy === 'tor' || !torText.trim()}
              onClick={() => run('tor', () => api('/api/deliverables', 'POST', {
                clientId, action: 'propose', torText, torReference: torRef || null,
              }), (r) => `Proposed ${r.addedDeliverables} deliverables and ${r.addedMappings} gate mappings. Approve each mapping below.`)}
            >{busy === 'tor' ? 'Reading...' : 'Read it and propose the mapping'}</button>
            <button type="button" style={btn(C.slate)} onClick={() => { setTorOpen(false); setTorText('') }}>Cancel</button>
          </div>
        </div>
      ) : null}

      {addOpen ? (
        <div style={{ border: `1px dashed ${C.border}`, borderRadius: 12, padding: '1rem 1.1rem', background: C.card }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.6rem' }}>
            <Lab l="Code"><input aria-label="D1" style={field} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="D1" /></Lab>
            <Lab l="Title"><input aria-label="Deliverable title" style={field} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Lab>
            <Lab l="Milestone"><input aria-label="On acceptance" style={field} value={draft.milestoneLabel} onChange={(e) => setDraft({ ...draft, milestoneLabel: e.target.value })} placeholder="On acceptance" /></Lab>
            <Lab l="Amount"><input aria-label="Amount" style={field} type="number" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} /></Lab>
            <Lab l="Currency"><input aria-label="Currency" style={field} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} /></Lab>
            <Lab l="Due"><input aria-label="Within 30 days" style={field} value={draft.dueWindow} onChange={(e) => setDraft({ ...draft, dueWindow: e.target.value })} placeholder="Within 30 days" /></Lab>
          </div>
          <div style={{ marginTop: '0.6rem' }}>
            <Lab l="What it is"><textarea aria-label="What this deliverable is" style={{ ...field, minHeight: 70, resize: 'vertical' }} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Lab>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem' }}>
            <button type="button" style={btn(C.teal, true)} disabled={busy === 'add' || !draft.title.trim()}
              onClick={() => run('add', async () => {
                await api('/api/deliverables', 'POST', {
                  clientId, action: 'add_deliverable',
                  code: draft.code, title: draft.title, description: draft.description,
                  milestoneLabel: draft.milestoneLabel,
                  amount: draft.amount === '' ? null : Number(draft.amount),
                  currency: draft.currency, dueWindow: draft.dueWindow,
                })
                setDraft({ code: '', title: '', description: '', milestoneLabel: '', amount: '', currency: '', dueWindow: '' })
                setAddOpen(false)
              })}
            >{busy === 'add' ? 'Adding...' : 'Add'}</button>
            <button type="button" style={btn(C.slate)} onClick={() => setAddOpen(false)}>Cancel</button>
          </div>
        </div>
      ) : null}

      {state.deliverables.length === 0 ? (
        <p style={hint}>
          No deliverables yet. Paste the Terms of Reference, or add them by hand. Both end up in the
          same place.
        </p>
      ) : state.deliverables.map((d) => (
        <Deliverable
          key={d.id}
          d={d}
          maps={mapsFor(d.id)}
          packs={packsFor(d.id)}
          busy={busy}
          run={run}
          clientId={clientId}
          onOpenPack={setOpenPack}
        />
      ))}

      {openPack ? (
        <PackViewer clientId={clientId} packId={openPack} onClose={() => { setOpenPack(null); load() }} />
      ) : null}
    </div>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <div style={{ ...mono, fontSize: '0.68rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>{label}</div>
      <div style={{ fontSize: '1.15rem', fontWeight: 600, color: tone || C.navy, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function Lab({ l, children }) {
  return (
    <div>
      <label style={{ ...mono, fontSize: '0.7rem', letterSpacing: '.08em', textTransform: 'uppercase', color: C.slate, display: 'block', marginBottom: 4 }}>{l}</label>
      {children}
    </div>
  )
}

function Deliverable({ d, maps, packs, busy, run, clientId, onOpenPack }) {
  const [addGate, setAddGate] = useState('')
  const [editing, setEditing] = useState(null)
  const pending = maps.filter((m) => !m.approved)
  const approved = maps.filter((m) => m.approved)
  const live = packs.filter((p) => p.status !== 'withdrawn')

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem 1.1rem', background: C.card }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 620 }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 600, color: C.navy }}>
            {d.code ? `${d.code}. ` : ''}{d.title}
          </div>
          {d.description ? <div style={{ ...hint, marginTop: '0.25rem' }}>{d.description}</div> : null}
          <div style={{ ...mono, fontSize: '0.8rem', color: C.slate, marginTop: '0.35rem' }}>
            {money(d.payment_amount, d.payment_currency)}
            {d.milestone_label ? ` · ${d.milestone_label}` : ''}
            {d.due_window ? ` · ${d.due_window}` : ''}
            {` · ${d.status}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <button type="button"
            style={btn(C.teal, true)}
            disabled={busy === `pack:${d.id}` || approved.length === 0}
            title={approved.length === 0 ? 'Approve at least one gate mapping first' : 'Assemble the claim from the approved gates'}
            onClick={() => run(`pack:${d.id}`, () => api('/api/invoice-pack', 'POST', {
              clientId, action: 'assemble', deliverableId: d.id,
            }), (r) => r.gaps?.length
              ? `Claim ${r.reference} assembled with gaps noted: ${r.gaps.join('; ')}`
              : `Claim ${r.reference} assembled. Read it and approve it before it goes.`)}
          >{busy === `pack:${d.id}` ? 'Assembling...' : 'Assemble a claim'}</button>
          <button type="button" style={btn(C.red)} disabled={busy === `del:${d.id}`}
            onClick={() => {
              if (typeof window !== 'undefined' && !window.confirm(`Remove "${d.title}"?`)) return
              run(`del:${d.id}`, () => api('/api/deliverables', 'DELETE', { clientId, id: d.id }))
            }}
          >Remove</button>
        </div>
      </div>

      {pending.length > 0 ? (
        <div style={{ marginTop: '0.8rem', border: `1px solid ${C.amber}`, borderRadius: 9, padding: '0.6rem 0.8rem' }}>
          <div style={{ ...mono, fontSize: '0.78rem', color: C.amber, fontWeight: 700 }}>
            {pending.length} proposed {pending.length === 1 ? 'mapping' : 'mappings'} waiting on you
          </div>
          <div style={{ ...hint, marginTop: '0.2rem' }}>
            A proposal is a reading of the document, and a reading can be wrong. Approve the ones that
            are right, edit the ones that are close, reject the rest.
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.8rem' }}>
        {maps.length === 0 ? (
          <p style={hint}>Not mapped to any decision gate yet. A claim cannot be assembled without one.</p>
        ) : maps.map((m) => {
          const isEditing = editing && editing.id === m.id
          return (
            <div key={m.id} style={{
              border: `1px solid ${m.approved ? C.border : C.amber}`, borderRadius: 9,
              padding: '0.55rem 0.75rem', background: m.approved ? 'transparent' : C.alt,
            }}>
              {isEditing ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '0.5rem' }}>
                    <Lab l="Gate">
                      <select aria-label="Which decision gate evidences this" style={field} value={editing.dp_id} onChange={(e) => setEditing({ ...editing, dp_id: e.target.value })}>
                        {DP_IDS.map((k) => <option key={k} value={k}>{DP_LABEL[k]}</option>)}
                      </select>
                    </Lab>
                    <Lab l="Evidence the funder needs to see">
                      <input aria-label="Evidence the funder needs to see" style={field} value={editing.required_evidence || ''} onChange={(e) => setEditing({ ...editing, required_evidence: e.target.value })} />
                    </Lab>
                  </div>
                  <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.55rem' }}>
                    <button type="button" style={btn(C.teal, true)} disabled={busy === `map:${m.id}`}
                      onClick={() => run(`map:${m.id}`, async () => {
                        await api('/api/deliverables', 'PATCH', {
                          clientId, kind: 'mapping', id: m.id,
                          dpId: editing.dp_id, requiredEvidence: editing.required_evidence || '',
                          approved: true,
                        })
                        setEditing(null)
                      })}
                    >Save and approve</button>
                    <button type="button" style={btn(C.slate)} onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ maxWidth: 560 }}>
                    <div style={{ fontSize: '0.98rem', color: C.navy, fontWeight: 600 }}>{DP_LABEL[m.dp_id] || m.dp_id}</div>
                    {m.required_evidence ? <div style={{ ...hint, marginTop: '0.15rem' }}>{m.required_evidence}</div> : null}
                    <div style={{ ...mono, fontSize: '0.75rem', color: C.slate, marginTop: '0.2rem' }}>
                      {m.source === 'ai' ? 'Proposed from the document' : 'Added by hand'}
                      {m.approved ? ` · approved ${fmtDate(m.approved_at)}` : ' · not approved'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {!m.approved ? (
                      <button type="button" style={btn(C.green, true)} disabled={busy === `ap:${m.id}`}
                        onClick={() => run(`ap:${m.id}`, () => api('/api/deliverables', 'PATCH', {
                          clientId, kind: 'mapping', id: m.id, approved: true,
                        }))}
                      >Approve</button>
                    ) : (
                      <button type="button" style={btn(C.slate)} disabled={busy === `un:${m.id}`}
                        onClick={() => run(`un:${m.id}`, () => api('/api/deliverables', 'PATCH', {
                          clientId, kind: 'mapping', id: m.id, approved: false,
                        }))}
                      >Unapprove</button>
                    )}
                    <button type="button" style={btn(C.slate)} onClick={() => setEditing({ ...m })}>Edit</button>
                    <button type="button" style={btn(C.red)} disabled={busy === `rj:${m.id}`}
                      onClick={() => run(`rj:${m.id}`, () => api('/api/deliverables', 'DELETE', {
                        clientId, kind: 'mapping', id: m.id,
                      }))}
                    >{m.approved ? 'Remove' : 'Reject'}</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220 }}>
          <Lab l="Attach another gate">
            <select aria-label="Gate to attach" style={field} value={addGate} onChange={(e) => setAddGate(e.target.value)}>
              <option value="">Choose a gate</option>
              {DP_IDS.map((k) => <option key={k} value={k}>{DP_LABEL[k]}</option>)}
            </select>
          </Lab>
        </div>
        <button type="button" style={btn(C.slate)} disabled={!addGate || busy === `addmap:${d.id}`}
          onClick={() => run(`addmap:${d.id}`, async () => {
            await api('/api/deliverables', 'POST', { clientId, action: 'add_mapping', deliverableId: d.id, dpId: addGate })
            setAddGate('')
          })}
        >Attach</button>
      </div>

      {live.length > 0 ? (
        <div style={{ marginTop: '0.9rem', borderTop: `1px solid ${C.border}`, paddingTop: '0.7rem' }}>
          <div style={{ ...mono, fontSize: '0.72rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>Claims</div>
          {live.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.4rem' }}>
              <div style={{ ...mono, fontSize: '0.87rem', color: C.navy }}>
                {p.reference} · {money(p.amount, p.currency)} · {p.status}
                {p.sent_at ? ` · sent ${fmtDate(p.sent_at)}` : ''}
              </div>
              <button type="button" style={btn(C.teal)} onClick={() => onOpenPack(p.id)}>Open</button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function PackViewer({ clientId, packId, onClose }) {
  const [pack, setPack] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [recipients, setRecipients] = useState('')
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await api(`/api/invoice-pack?packId=${encodeURIComponent(packId)}&clientId=${encodeURIComponent(clientId)}`, 'GET')
      setPack(r.pack); setNoteText(r.pack?.covering_note || '')
    } catch (e) { setErr(e.message) }
  }, [packId, clientId])

  useEffect(() => { load() }, [load])

  async function act(key, body, ok) {
    if (busy) return
    setBusy(key); setErr(null); setMsg(null)
    try {
      await api('/api/invoice-pack', 'POST', { clientId, packId, ...body })
      setMsg(ok)
      await load()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  if (!pack) {
    return (
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem', background: C.card }}>
        <p style={hint}>{err || 'Loading the claim...'}</p>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            style={btn(C.slate)}
            onClick={async () => {
              // The document is built on the server from the stored pack, so
              // what downloads is what was claimed, not what the evidence says
              // today. The browser only asks for it and saves it.
              setErr(null)
              try {
                const { data } = await supabase.auth.getSession()
                const token = data.session?.access_token
                const res = await fetch(
                  `/api/invoice-pack?packId=${encodeURIComponent(packId)}&clientId=${encodeURIComponent(clientId)}&format=docx`,
                  { headers: token ? { Authorization: `Bearer ${token}` } : {} },
                )
                if (!res.ok) {
                  const j = await res.json().catch(() => ({}))
                  throw new Error(j?.error || 'Could not build the document')
                }
                const blob = await res.blob()
                const name = (res.headers.get('Content-Disposition') || '')
                  .split('filename=')[1]?.replace(/\"/g, '') || `${pack.reference || 'claim'}.docx`
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = name
                document.body.appendChild(a)
                a.click()
                a.remove()
                URL.revokeObjectURL(url)
              } catch (e) {
                setErr(e.message || 'Could not build the document')
              }
            }}
          >Download as a document</button>
          <button type="button" style={btn(C.slate)} onClick={onClose}>Close</button>
        </div>
      </div>
    )
  }

  const gates = Array.isArray(pack.gates) ? pack.gates : []
  const evidence = Array.isArray(pack.evidence) ? pack.evidence : []
  const gaps = gates.filter((g) => g.gap)

  return (
    <div style={{ border: `2px solid ${C.teal}`, borderRadius: 12, padding: '1.1rem 1.2rem', background: C.card }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: C.navy }}>Claim {pack.reference}</div>
          <div style={{ ...mono, fontSize: '0.82rem', color: C.slate }}>
            {money(pack.amount, pack.currency)} · {pack.status} · assembled {fmtDate(pack.assembled_at)}
          </div>
        </div>
        <button type="button" style={btn(C.slate)} onClick={onClose}>Close</button>
      </div>

      {err ? <div style={{ color: C.red, fontSize: '0.95rem', marginTop: '0.6rem' }}>{err}</div> : null}
      {msg ? <div style={{ color: C.green, fontSize: '0.95rem', marginTop: '0.6rem' }}>{msg}</div> : null}

      {gaps.length > 0 ? (
        <div style={{ marginTop: '0.8rem', border: `1px solid ${C.red}`, borderRadius: 9, padding: '0.6rem 0.8rem' }}>
          <div style={{ ...mono, fontSize: '0.78rem', color: C.red, fontWeight: 700 }}>Gaps in this claim</div>
          <ul style={{ ...hint, margin: '0.3rem 0 0', paddingLeft: '1.1rem' }}>
            {gaps.map((g) => <li key={g.dp_id}>{g.label}: {g.gap}</li>)}
          </ul>
        </div>
      ) : null}

      <div style={{ ...mono, fontSize: '0.72rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate, marginTop: '0.9rem' }}>
        Gates evidencing this claim
      </div>
      {gates.map((g) => (
        <div key={g.dp_id} style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: '0.5rem 0.75rem', marginTop: '0.35rem' }}>
          <div style={{ fontSize: '0.97rem', fontWeight: 600, color: C.navy }}>{g.label}</div>
          {g.required_evidence ? <div style={hint}>{g.required_evidence}</div> : null}
          <div style={{ ...mono, fontSize: '0.78rem', color: g.gap ? C.red : C.green, marginTop: '0.2rem' }}>
            {g.evidence_count} evidence {g.evidence_count === 1 ? 'entry' : 'entries'} · {g.signature_count} {g.signature_count === 1 ? 'signature' : 'signatures'}
          </div>
        </div>
      ))}

      <div style={{ ...mono, fontSize: '0.72rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate, marginTop: '0.9rem' }}>
        Evidence in this pack ({evidence.length})
      </div>
      <div style={{ ...hint, marginTop: '0.3rem' }}>
        {evidence.length === 0 ? 'Nothing recorded.' : evidence.map((e) => `${e.reference} ${e.description || ''}`).join(' · ')}
      </div>

      <div style={{ marginTop: '0.9rem' }}>
        <Lab l="Covering note">
          <textarea aria-label="Covering note" style={{ ...field, minHeight: 150, resize: 'vertical' }} value={noteText}
            readOnly={pack.status !== 'draft'}
            onChange={(e) => setNoteText(e.target.value)} />
        </Lab>
        <div style={{ ...hint, marginTop: '0.3rem' }}>
          Drafted from the pack only. Read it before you approve it: what goes out is what you approve,
          and once approved the wording is fixed.
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.8rem', flexWrap: 'wrap' }}>
        {pack.status === 'draft' ? (
          <button type="button" style={btn(C.green, true)} disabled={busy === 'approve'}
            onClick={() => act('approve', { action: 'approve', coveringNote: noteText }, 'Approved. It can be sent now.')}
          >{busy === 'approve' ? 'Approving...' : 'Approve this claim'}</button>
        ) : null}
        {pack.status === 'approved' ? (
          <>
            <input aria-label="Recipients, comma separated" style={{ ...field, maxWidth: 320 }} placeholder="Recipients, comma separated"
              value={recipients} onChange={(e) => setRecipients(e.target.value)} />
            <button type="button" style={btn(C.teal, true)} disabled={busy === 'send' || !recipients.includes('@')}
              onClick={() => act('send', {
                action: 'send',
                recipients: recipients.split(',').map((r) => r.trim()).filter(Boolean),
              }, 'Sent.')}
            >{busy === 'send' ? 'Sending...' : 'Send it'}</button>
            <button type="button" style={btn(C.slate)} disabled={busy === 'mark'}
              onClick={() => act('mark', { action: 'mark_sent' }, 'Marked as sent.')}
            >I sent it myself</button>
          </>
        ) : null}
        {pack.status === 'sent' ? (
          <button type="button" style={btn(C.green, true)} disabled={busy === 'paid'}
            onClick={() => act('paid', { action: 'mark_paid' }, 'Marked as paid.')}
          >Mark as paid</button>
        ) : null}
        {pack.status !== 'paid' && pack.status !== 'withdrawn' ? (
          <button type="button" style={btn(C.red)} disabled={busy === 'wd'}
            onClick={() => {
              if (typeof window !== 'undefined' && !window.confirm('Withdraw this claim?')) return
              act('wd', { action: 'withdraw' }, 'Withdrawn.')
            }}
          >Withdraw</button>
        ) : null}
      </div>
    </div>
  )
}
