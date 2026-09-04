// @ts-nocheck
'use client'
// ============================================================
// HOW THIS ENGAGEMENT RUNS
//
// The settings that shape one engagement without changing the method: what the
// blocks are called, what this engagement agreed to do, what currency it works
// in, and how it is going.
//
// LAYOUT. One row per setting: a label, the control, and an "i" that opens a
// line or two of explanation. The explanation stays shut until it is asked for,
// so the screen reads as a form to fill rather than a page to study.
//
// COPY. Each explanation says what the setting is and what it does. It does not
// list what the setting is not.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DEFAULT_VALIDATION_MIN_PER_SEGMENT } from '@/lib/engagement-types'
import { CONVERGENCE_MINIMUM } from '@/lib/interview-report'
import { sendEngagementEmail } from '@/lib/engagement-actions'

const C = {
  card: 'var(--cv-card)', alt: 'var(--cv-alt)', border: 'var(--cv-border)',
  slate: 'var(--cv-slate)', navy: 'var(--cv-navy)', teal: 'var(--cv-teal)',
  green: 'var(--cv-green)', amber: 'var(--cv-amber)', red: 'var(--cv-red)',
}
const mono = { fontFamily: 'var(--cv-font-mono)' }
const hint = { fontSize: '0.88rem', color: C.slate, lineHeight: 1.5 }
const labelText = {
  ...mono, fontSize: '0.78rem', letterSpacing: '.1em', textTransform: 'uppercase',
  color: C.slate,
}
const field = {
  width: '100%', padding: '0.44rem 0.58rem', borderRadius: 7,
  border: `1px solid ${C.border}`, background: 'var(--cv-card)', color: 'inherit',
  fontFamily: "var(--cv-font)", fontSize: '0.93rem',
}
const smallBtn = (col, solid) => ({
  ...mono, fontSize: '0.83rem', fontWeight: 600, padding: '0.36rem 0.85rem',
  border: `1px solid ${col}`, borderRadius: 7,
  background: solid ? col : 'transparent',
  color: solid ? 'var(--cv-on-accent)' : col, cursor: 'pointer',
})

const MOMENTUM = [
  { v: 'green', l: 'On track', c: C.green, note: 'Continue as planned.' },
  { v: 'amber', l: 'Slipping', c: C.amber, note: 'Catch up within five working days.' },
  { v: 'red', l: 'Stopped', c: C.red, note: 'A recovery plan is needed before this resumes.' },
]

// One setting: label, an "i" that opens the explanation, then the control.
// The explanation is closed by default so the tab reads as a form.
function Setting({ label, help, htmlFor, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: 5 }}>
        {htmlFor
          ? <label htmlFor={htmlFor} style={labelText}>{label}</label>
          : <span style={labelText}>{label}</span>}
        {help ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? `Hide the explanation of ${label}` : `What ${label} means`}
            style={{
              ...mono, width: 17, height: 17, lineHeight: '15px', padding: 0,
              borderRadius: '50%', border: `1px solid ${C.slate}`,
              background: open ? C.slate : 'transparent',
              color: open ? 'var(--cv-card)' : C.slate,
              fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0,
            }}
          >i</button>
        ) : null}
      </div>
      {open && help ? (
        <p style={{ ...hint, margin: '0 0 0.5rem', maxWidth: '78ch' }}>{help}</p>
      ) : null}
      {children}
    </div>
  )
}

async function setupApi(clientId) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch('/api/engagement-setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ clientId }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`)
  return json
}

async function api(method, body, query) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(`/api/engagement-config${query || ''}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`)
  return json
}

export default function EngagementSettings({ clientId, canManage }) {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(null)
  const [minDraft, setMinDraft] = useState('')
  const [torDraft, setTorDraft] = useState('')
  const [currencyDraft, setCurrencyDraft] = useState('')
  // Who the welcome goes to, and where it points. Loaded beside the config
  // because the button is useless without both.
  const [client, setClient] = useState(null)
  const [partyEmails, setPartyEmails] = useState([])
  // The built email, exactly as it would go out. Null until asked for.
  const [emailPreview, setEmailPreview] = useState(null)

  const load = useCallback(async () => {
    if (!clientId) { setLoading(false); return }
    setLoading(true)
    try {
      const r = await api('GET', null, `?clientId=${encodeURIComponent(clientId)}`)
      setConfig(r.config)
      setMinDraft(r.config?.validation_min_per_segment == null ? '' : String(r.config.validation_min_per_segment))
      setTorDraft(r.config?.tor_reference || '')
      setCurrencyDraft(r.config?.currency || '')
      const { data: cl } = await supabase
        .from('engagement_clients')
        .select('id,name,slug,contact_name,contact_email')
        .eq('id', clientId).single()
      setClient(cl || null)
      const { data: parties } = await supabase
        .from('engagement_parties')
        .select('email').eq('client_id', clientId)
      setPartyEmails((parties || []).map((x) => x.email).filter(Boolean))
      setErr(null)
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  async function save(key, patch, ok) {
    if (busy) return
    setBusy(key); setErr(null); setNote(null)
    try {
      await api('PATCH', { clientId, ...patch })
      setNote(ok || 'Saved.')
      await load()
    } catch (e) { setErr(e.message || 'That did not work') }
    setBusy(null)
  }

  if (!canManage) return null
  if (loading) return <p style={hint}>Loading the settings...</p>

  const c = config || {}
  const effectiveMin = c.validation_min_per_segment ?? DEFAULT_VALIDATION_MIN_PER_SEGMENT
  const usingDefault = c.validation_min_per_segment == null

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem 1.1rem', background: C.card }}>
      <div style={{ ...mono, fontSize: '0.78rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
        How this engagement runs
      </div>
      <p style={{ ...hint, margin: '0.4rem 0 0', maxWidth: '78ch' }}>
        Settings for this engagement. The nine blocks and their order are the same everywhere; these
        decide what they are called, what this engagement agreed to do, and how it is going.
      </p>

      {err ? <div style={{ color: C.red, fontSize: '0.95rem', marginTop: '0.7rem' }}>{err}</div> : null}
      {note ? <div style={{ color: C.green, fontSize: '0.95rem', marginTop: '0.7rem' }}>{note}</div> : null}

      <Setting
        label="Set this engagement up"
        help={`Creates the three things a new engagement needs: its own settings, a record for each of the twelve gates, and a Charter you can edit and issue. It adds only what is missing, so it is safe to press again. Add the people on the engagement yourself, above, so every signature carries a real name.`}
      >
        <button
          type="button"
          style={smallBtn(C.slate)}
          disabled={busy === 'scaffold'}
          onClick={async () => {
            setBusy('scaffold'); setNote(null); setErr(null)
            try {
              const r = await setupApi(clientId)
              const made = (r.created || []).join(', ')
              const had = (r.alreadyThere || []).join(', ')
              setNote(made ? `Created ${made}.${had ? ` ${had} was already there.` : ''}` : 'Everything was already in place.')
              await load()
            } catch (e) { setErr(e.message) }
            setBusy(null)
          }}
        >{busy === 'scaffold' ? 'Setting up...' : 'Set this engagement up'}</button>
      </Setting>

      <Setting
        label="Send the welcome email"
        help={`The first email the client gets from the platform. It sets out the work ahead, and its button opens their live journey — the nine Decision Points, where the work stands, and what each gate will produce. It goes to the client contact and to everyone listed as a party above, so add the people first. Their sign-in is a separate invite, sent from the client team card.`}
      >
        {(() => {
          // The client contact first, then the parties; one person listed twice
          // is one email, and an engagement with nobody on it says so rather
          // than offering a button that would send to no one.
          const to = [...new Set([client?.contact_email, ...partyEmails]
            .map((e) => (e || '').trim()).filter(Boolean))]
          const journeyUrl = client?.slug && typeof window !== 'undefined'
            ? `${window.location.origin}/engagement/${client.slug}`
            : ''
          if (to.length === 0) {
            return <p style={hint}>No email address on the client or on any party yet. Add one, then this can be sent.</p>
          }
          return (
            <div>
              <p style={{ ...hint, margin: '0 0 0.5rem' }}>
                Goes to {to.join(', ')}. The button in it opens {journeyUrl || 'the journey'}.
              </p>
              <button
                type="button"
                style={smallBtn(C.slate)}
                disabled={busy === 'preview' || !journeyUrl}
                onClick={async () => {
                  setBusy('preview'); setNote(null); setErr(null)
                  try {
                    const r = await sendEngagementEmail({
                      clientId, stage: 'scope', recipients: to, journeyUrl, preview: true,
                    })
                    if (r?.html) setEmailPreview({ subject: r.subject, html: r.html })
                    else setErr('The preview came back empty.')
                  } catch (e) { setErr(e.message || 'Could not build the preview') }
                  setBusy(null)
                }}
              >{busy === 'preview' ? 'Building...' : (emailPreview ? 'Rebuild the preview' : 'Read it first')}</button>
              {' '}
              <button
                type="button"
                style={smallBtn(C.teal)}
                disabled={busy === 'welcome' || !journeyUrl}
                onClick={async () => {
                  setBusy('welcome'); setNote(null); setErr(null)
                  try {
                    const r = await sendEngagementEmail({
                      clientId, stage: 'scope', recipients: to, journeyUrl,
                    })
                    // Email being switched off is answered with a 200, so it
                    // has to be read rather than assumed to be a success.
                    if (r && r.emailConfigured === false) {
                      setErr(r.message || r.reason || 'Email is not switched on for this environment, so nothing was sent.')
                    } else {
                      setNote(`The welcome email went to ${to.length} ${to.length === 1 ? 'person' : 'people'}.`)
                    }
                  } catch (e) { setErr(e.message || 'That did not send') }
                  setBusy(null)
                }}
              >{busy === 'welcome' ? 'Sending...' : 'Send the welcome email'}</button>
              {emailPreview ? (
                <div style={{ marginTop: '0.8rem', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ ...mono, fontSize: '0.82rem', padding: '0.5rem 0.7rem', background: C.alt, borderBottom: `1px solid ${C.border}`, display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <span style={{ color: C.slate }}>Subject:</span>
                    <span style={{ fontWeight: 600 }}>{emailPreview.subject}</span>
                    <button
                      type="button"
                      style={{ ...smallBtn(C.slate), marginLeft: 'auto', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                      onClick={() => setEmailPreview(null)}
                    >Close</button>
                  </div>
                  {/* The email's own HTML, rendered in a sandbox: it is a document
                      to look at, not code to run on this page. */}
                  <iframe
                    title="The welcome email as it will arrive"
                    srcDoc={emailPreview.html}
                    sandbox=""
                    style={{ width: '100%', height: 620, border: 0, background: '#fff', display: 'block' }}
                  />
                </div>
              ) : null}
            </div>
          )
        })()}
      </Setting>

      <Setting
        label="How the engagement is going"
        help="Your judgement, recorded. It shows on the cover and on the journey canvas."
      >
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          {MOMENTUM.map((m) => {
            const on = (c.momentum_status || 'green') === m.v
            return (
              <button
                key={m.v}
                type="button"
                title={m.note}
                aria-pressed={on}
                disabled={busy === 'momentum' || on}
                onClick={() => save('momentum', { momentumStatus: m.v }, `Recorded as ${m.l.toLowerCase()}.`)}
                style={{
                  ...mono, fontSize: '0.84rem', fontWeight: 600, padding: '0.36rem 0.85rem',
                  border: `1px solid ${m.c}`, borderRadius: 7,
                  background: on ? m.c : 'transparent',
                  color: on ? 'var(--cv-on-accent)' : m.c,
                  cursor: on ? 'default' : 'pointer',
                }}
              >{m.l}</button>
            )
          })}
        </div>
      </Setting>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '0 1.2rem' }}>
        {/*
          WHAT TO CALL EACH BLOCK IS NO LONGER A SETTING. 2 September 2026.
          This offered Zone or DP per engagement, and the engagements set up
          before the default changed still carry 'zone'. The result was that
          production showed a prospect one word on the showcase link and the
          coach another word on the same block, which is the inconsistency
          Habib reported. There is one word now, Decision Point, and it comes
          from dpLabel() in gtcv-blocks. The column stays in the database until
          a migration can drop it; nothing reads it.
        */}

        <Setting
          label="Which independence tests close it"
          htmlFor="cfg-independence"
          help="A full engagement ends with the five engagement tests done unaided. A tools handover ends with the organisation able to run the tools on its own."
        >
          <select
            id="cfg-independence"
            style={field}
            value={c.independence_test_set || 'engagement'}
            disabled={busy === 'independence'}
            onChange={(e) => save('independence', { independenceTestSet: e.target.value }, 'Test set changed.')}
          >
            <option value="engagement">The five engagement tests</option>
            <option value="tools">The tools handover tests</option>
          </select>
        </Setting>
      </div>

      <Setting
        label="Conversations agreed per segment"
        htmlFor="cfg-min"
        help={`What this engagement agreed to hold, so it is yours to set. Evidence is judged separately: a segment counts as evidenced once ${CONVERGENCE_MINIMUM} conversations point at the same problem with a real budget behind it.`}
      >
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            id="cfg-min"
            type="number"
            min={0}
            max={100}
            style={{ ...field, width: 110 }}
            value={minDraft}
            placeholder={String(DEFAULT_VALIDATION_MIN_PER_SEGMENT)}
            onChange={(e) => setMinDraft(e.target.value)}
          />
          <button
            type="button"
            style={smallBtn(C.teal, true)}
            disabled={busy === 'min'}
            onClick={() => save('min', {
              validationMinPerSegment: minDraft.trim() === '' ? null : Number(minDraft),
            }, 'Minimum saved.')}
          >{busy === 'min' ? 'Saving...' : 'Save'}</button>
          {!usingDefault ? (
            <button
              type="button"
              style={smallBtn(C.slate)}
              disabled={busy === 'min'}
              onClick={() => { setMinDraft(''); save('min', { validationMinPerSegment: null }, 'Back to the method default.') }}
            >Use the default</button>
          ) : null}
          <span style={{ ...hint, whiteSpace: 'nowrap' }}>
            Currently {effectiveMin}{usingDefault ? ' (the method default)' : ''}
          </span>
        </div>
      </Setting>

      <Setting
        label="The currency this engagement works in"
        htmlFor="cfg-currency"
        help="What the organisation prices and costs in. Every cost line, price and pipeline figure in the blocks reads in this. Your fee currency is held separately, on the coach side."
      >
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            id="cfg-currency"
            style={{ ...field, maxWidth: 140 }}
            value={currencyDraft}
            placeholder="NGN"
            maxLength={8}
            onChange={(e) => setCurrencyDraft(e.target.value)}
          />
          <button
            type="button"
            style={smallBtn(C.slate)}
            disabled={busy === 'currency'}
            onClick={() => save('currency', { currency: currencyDraft }, currencyDraft.trim()
              ? `Amounts now read in ${currencyDraft.trim().toUpperCase()}.`
              : 'Amounts now show without a currency.')}
          >{busy === 'currency' ? 'Saving...' : 'Save'}</button>
        </div>
      </Setting>

      <Setting
        label="Contract or Terms of Reference reference"
        htmlFor="cfg-tor"
        help="The name or number of the contract this engagement runs under, recorded so a claim can say which contract it is made under. This is a reference you type; there is no document attached to it."
      >
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            id="cfg-tor"
            style={{ ...field, maxWidth: 380 }}
            value={torDraft}
            placeholder="e.g. ToR 2026-04 / Contract 118"
            onChange={(e) => setTorDraft(e.target.value)}
          />
          <button
            type="button"
            style={smallBtn(C.slate)}
            disabled={busy === 'tor'}
            onClick={() => save('tor', { torReference: torDraft }, 'Reference saved.')}
          >{busy === 'tor' ? 'Saving...' : 'Save'}</button>
        </div>
      </Setting>
    </div>
  )
}
