// @ts-nocheck
'use client'
// ============================================================
// THE WELCOME PACK
//
// The engagement brief, and the two letters written from it. It sits on the
// client's Cover tab — the screen you land on when you open a client — because
// that is where it was looked for and not found. It used to live five tabs
// deep inside "Who is on it, and settings", next to the momentum flag, which
// is a reasonable place for a setting and a hopeless place for the first thing
// a new client ever receives.
//
// ONE COPY. Both the brief form and the send controls live here and nowhere
// else, so the screen and the letter cannot drift apart.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { sendEngagementEmail } from '@/lib/engagement-actions'
import { SERVICE_TYPES, SERVICE_LABEL } from '@/lib/engagement-brief'

const C = {
  card: 'var(--cv-card)', alt: 'var(--cv-alt)', border: 'var(--cv-border)',
  slate: 'var(--cv-slate)', navy: 'var(--cv-navy)', teal: 'var(--cv-teal)',
  green: 'var(--cv-green)', red: 'var(--cv-red)',
}
const mono = { fontFamily: 'var(--cv-font-mono)' }
const hint = { fontSize: '0.88rem', color: C.slate, lineHeight: 1.5 }
const labelText = {
  ...mono, fontSize: '0.78rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate,
}
const field = {
  width: '100%', padding: '0.44rem 0.58rem', borderRadius: 7,
  border: `1px solid ${C.border}`, background: 'var(--cv-card)', color: 'inherit',
  fontFamily: 'var(--cv-font)', fontSize: '0.93rem',
}
const smallBtn = (col, solid) => ({
  ...mono, fontSize: '0.83rem', fontWeight: 600, padding: '0.36rem 0.85rem',
  border: `1px solid ${col}`, borderRadius: 7,
  background: solid ? col : 'transparent',
  color: solid ? 'var(--cv-on-cyan)' : col, cursor: 'pointer',
})

function Setting({ label, help, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: 5 }}>
        <span style={labelText}>{label}</span>
        {help ? (
          <button
            type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
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
      {open && help ? <p style={{ ...hint, margin: '0 0 0.5rem', maxWidth: '78ch' }}>{help}</p> : null}
      {children}
    </div>
  )
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

export default function WelcomePack({ clientId, canManage }) {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(null)
  const [client, setClient] = useState(null)
  const [partyEmails, setPartyEmails] = useState([])
  const [emailPreview, setEmailPreview] = useState(null)
  const [brief, setBrief] = useState({})
  const [briefDraft, setBriefDraft] = useState(null)
  const [welcomeAudience, setWelcomeAudience] = useState('served')
  const [toTitle, setToTitle] = useState('')
  const [toName, setToName] = useState('')

  const load = useCallback(async () => {
    if (!clientId) { setLoading(false); return }
    setLoading(true)
    try {
      const r = await api('GET', null, `?clientId=${encodeURIComponent(clientId)}`)
      setBrief(r.brief || {})
      const { data: cl } = await supabase
        .from('engagement_clients')
        .select('id,name,slug,contact_name,contact_email')
        .eq('id', clientId).single()
      setClient(cl || null)
      const { data: parties } = await supabase
        .from('engagement_parties').select('email').eq('client_id', clientId)
      setPartyEmails((parties || []).map((x) => x.email).filter(Boolean))
      setErr(null)
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  if (!canManage) return null
  if (loading) return <p style={hint}>Loading the welcome pack...</p>

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem 1.1rem', background: C.card, marginBottom: '1.25rem' }}>
      <div style={{ ...labelText }}>The welcome pack</div>
      <p style={{ ...hint, margin: '0.4rem 0 0', maxWidth: '78ch' }}>
        What the signed contract says, and the two letters written from it — one to the
        organisation paying, one to the organisation being served. Read either before it goes.
      </p>
      {err ? <div style={{ color: C.red, fontSize: '0.95rem', marginTop: '0.7rem' }}>{err}</div> : null}
      {note ? <div style={{ color: C.green, fontSize: '0.95rem', marginTop: '0.7rem' }}>{note}</div> : null}

      <Setting
        label="Read it from the contract"
        help={`Attach the signed Scope of Work or Purchase Order and the fields below are filled in from it — the reference, the period of performance and the deliverables in the document's own words. Nothing is stored: the file is read and discarded, and everything it found is yours to correct before you save.`}
      >
        <div>
          <input
            type="file" accept=".pdf,.txt,application/pdf,text/plain"
            disabled={busy === 'tor'}
            style={{ ...hint, marginBottom: '0.4rem' }}
            onChange={async (e) => {
              const file = e.target.files && e.target.files[0]
              if (!file) return
              setBusy('tor'); setNote(null); setErr(null)
              try {
                const { data } = await supabase.auth.getSession()
                const body = new FormData()
                body.append('clientId', clientId)
                body.append('file', file)
                const res = await fetch('/api/tor-extract', {
                  method: 'POST',
                  headers: data.session?.access_token
                    ? { Authorization: `Bearer ${data.session.access_token}` } : {},
                  body,
                })
                const json = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(json?.error || 'Could not read that document')
                const f = json.fields || {}
                const found = Object.keys(f).filter((k) => f[k] !== undefined && f[k] !== null)
                if (!found.length) {
                  setErr(json.note || 'Nothing recognisable came out of that document. Type the details in instead.')
                } else {
                  setBriefDraft({ ...(briefDraft || brief || {}), ...f })
                  setNote(`Read from the document: ${found.join(', ')}. Check it, then save the brief.`)
                }
              } catch (e2) { setErr(e2.message || 'Could not read that document') }
              setBusy(null)
              e.target.value = ''
            }}
          />
          {busy === 'tor' ? <p style={hint}>Reading the document...</p> : null}
        </div>
      </Setting>

      <Setting
        label="The engagement brief"
        help={`What the signed Scope of Work and Purchase Order say: who pays, who the work is delivered to, which services, over what period, and what it produces. The welcome email is written from this, so filling it in once is what stops the same facts being retyped into every message.`}
      >
        {(() => {
          const d = briefDraft || brief || {}
          const set = (k, v) => setBriefDraft({ ...d, [k]: v })
          const row = { display: 'grid', gridTemplateColumns: 'minmax(150px,1fr) minmax(0,2fr)', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem' }
          const lab = { ...hint, margin: 0 }
          return (
            <div>
              <div style={row}><span style={lab}>Paying client</span>
                <input style={field} value={d.payerName || ''} placeholder="e.g. Tanager"
                  onChange={(e) => set('payerName', e.target.value)} /></div>
              <div style={row}><span style={lab}>Programme</span>
                <input style={field} value={d.payerProgramme || ''} placeholder="e.g. IGNITE+"
                  onChange={(e) => set('payerProgramme', e.target.value)} /></div>
              <div style={row}><span style={lab}>Served client</span>
                <input style={field} value={d.servedName || ''} placeholder="the organisation the work is delivered to"
                  onChange={(e) => set('servedName', e.target.value)} /></div>
              <div style={row}><span style={lab}>Reference</span>
                <input style={field} value={d.reference || ''} placeholder="e.g. Purchase Order 149"
                  onChange={(e) => set('reference', e.target.value)} /></div>
              <div style={row}><span style={lab}>Period</span>
                <span style={{ display: 'flex', gap: '0.4rem' }}>
                  <input style={field} type="date" value={(d.periodStart || '').slice(0, 10)}
                    onChange={(e) => set('periodStart', e.target.value)} />
                  <input style={field} type="date" value={(d.periodEnd || '').slice(0, 10)}
                    onChange={(e) => set('periodEnd', e.target.value)} />
                </span></div>
              <div style={{ ...row, alignItems: 'start' }}><span style={lab}>Services</span>
                <span style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                  {SERVICE_TYPES.map((t) => {
                    const on = (d.services || []).includes(t)
                    return (
                      <label key={t} style={{ ...hint, display: 'flex', gap: '0.3rem', alignItems: 'center', cursor: 'pointer' }}>
                        <input
                          type="checkbox" checked={on}
                          onChange={() => set('services', on
                            ? (d.services || []).filter((x) => x !== t)
                            : [...(d.services || []), t])}
                        />{SERVICE_LABEL[t]}
                      </label>
                    )
                  })}
                </span></div>
              <div style={{ ...row, alignItems: 'start' }}><span style={lab}>What it produces</span>
                <textarea
                  style={{ ...field, minHeight: 82 }} placeholder="One deliverable per line, in the ToR's own words"
                  value={(d.deliverables || []).join('\n')}
                  onChange={(e) => set('deliverables', e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))}
                /></div>
              <div style={{ ...row, alignItems: 'start' }}><span style={lab}>Your opening line</span>
                <textarea
                  style={{ ...field, minHeight: 82 }}
                  placeholder="Your own words, in your voice. Left empty, the welcome opens with a generated line."
                  value={d.welcomeIntro || ''}
                  onChange={(e) => set('welcomeIntro', e.target.value)}
                /></div>
              <button
                type="button" style={smallBtn(C.teal, true)} disabled={busy === 'brief' || !briefDraft}
                onClick={async () => {
                  setBusy('brief'); setNote(null); setErr(null)
                  try {
                    await api('PATCH', { clientId, brief: briefDraft })
                    setBriefDraft(null)
                    setEmailPreview(null)
                    setNote('The brief is saved. Rebuild the preview to see the welcome it writes.')
                    await load()
                  } catch (e) { setErr(e.message || 'That did not save') }
                  setBusy(null)
                }}
              >{busy === 'brief' ? 'Saving...' : 'Save the brief'}</button>
            </div>
          )
        })()}
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
              {/* THE PAYER AND THE SERVED ORGANISATION DO NOT DO THE SAME THING.
                  One is doing the work, the other is watching it and paying for
                  it, so they get different access paragraphs and the welcome is
                  sent twice — once to each — rather than once to everybody. */}
              <p style={{ ...hint, margin: '0 0 0.6rem', display: 'flex', gap: '0.9rem', flexWrap: 'wrap' }}>
                {[['served', 'the organisation being served'], ['payer', 'the paying client']].map(([v, l]) => (
                  <label key={v} style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="radio" name="welcome-audience" checked={welcomeAudience === v}
                      onChange={() => { setWelcomeAudience(v); setEmailPreview(null) }}
                    />This letter is for {l}
                  </label>
                ))}
              </p>
              {/* ADDRESSED TO A PERSON. "Dear Morgan," is how you write to a
                  child. A client gets their title and their full name, and if
                  neither is given the letter opens "Dear colleague," rather
                  than guessing at one. */}
              <p style={{ display: 'flex', gap: '0.4rem', margin: '0 0 0.6rem', flexWrap: 'wrap' }}>
                <input
                  style={{ ...field, maxWidth: 90 }} placeholder="Mr / Ms"
                  value={toTitle} onChange={(e) => { setToTitle(e.target.value); setEmailPreview(null) }}
                />
                <input
                  style={{ ...field, maxWidth: 280 }} placeholder="Full name, e.g. Morgan Mercer"
                  value={toName} onChange={(e) => { setToName(e.target.value); setEmailPreview(null) }}
                />
              </p>
              <button
                type="button"
                style={smallBtn(C.slate)}
                disabled={busy === 'preview' || !journeyUrl}
                onClick={async () => {
                  setBusy('preview'); setNote(null); setErr(null)
                  try {
                    const r = await sendEngagementEmail({
                      clientId, stage: 'scope', recipients: to, journeyUrl,
                      preview: true, audience: welcomeAudience,
                      recipientName: toName, recipientTitle: toTitle,
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
                      audience: welcomeAudience,
                      recipientName: toName, recipientTitle: toTitle,
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

    </div>
  )
}
