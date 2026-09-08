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

// The fields, named the way the form names them, so the message after an
// upload reads as English instead of as a list of column names.
const FIELD_NAMES = {
  payerName: 'paying client', servedName: 'served client', payerProgramme: 'programme',
  reference: 'reference', coImplementer: 'co-implementer', periodStart: 'start date', periodEnd: 'end date',
  deliverables: 'what it produces', services: 'services',
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
  // What the last upload did, said beside the upload rather than only at
  // the top of a long panel where it can be scrolled past.
  const [torSaid, setTorSaid] = useState(null)
  // The letter itself, as text. Null until it is loaded for editing.
  const [letterDraft, setLetterDraft] = useState(null)
  const [includeSignIn, setIncludeSignIn] = useState(true)

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
        help={`Attach the signed Purchase Order and Scope of Work together. The paying client, the served client, the programme, the reference, the period and the deliverables are filled in from them, and each document fills only what is still empty, so attaching both gets you further than either alone. The documents are kept privately against this engagement, and every field is yours to correct before you save.`}
      >
        <div>
          <input
            type="file" multiple accept=".pdf,.txt,application/pdf,text/plain"
            disabled={busy === 'tor'}
            style={{ ...hint, marginBottom: '0.4rem' }}
            onChange={async (e) => {
              const files = Array.from(e.target.files || [])
              if (!files.length) return
              setBusy('tor'); setNote(null); setErr(null); setTorSaid(null)
              try {
                const { data } = await supabase.auth.getSession()
                const auth = data.session?.access_token
                  ? { Authorization: `Bearer ${data.session.access_token}` } : {}
                // A purchase order names the payer; a scope of work names the
                // organisation served. Both can be attached at once, and each
                // one only fills what is still empty, so the second never
                // overwrites what the first got right.
                let merged = { ...(briefDraft || brief || {}) }
                const filled = []
                const kept = []
                for (const file of files) {
                  const body = new FormData()
                  body.append('clientId', clientId)
                  body.append('file', file)
                  const res = await fetch('/api/tor-extract', { method: 'POST', headers: auth, body })
                  const json = await res.json().catch(() => ({}))
                  if (!res.ok) throw new Error(json?.error || `Could not read ${file.name}`)
                  if (json.storeProblem) kept.push(`${file.name} was read but not filed (${json.storeProblem})`)
                  else if (json.stored) kept.push(`${file.name} filed`)
                  for (const [k, v] of Object.entries(json.fields || {})) {
                    const empty = merged[k] === undefined || merged[k] === null || merged[k] === ''
                      || (Array.isArray(merged[k]) && merged[k].length === 0)
                    if (v !== undefined && v !== null && empty) { merged[k] = v; filled.push(k) }
                  }
                }
                // A GtCV contract is a GtCV engagement. Ticking the service by
                // hand every time is exactly the friction the upload is for.
                if (!merged.services || !merged.services.length) {
                  merged.services = ['canvas']; filled.push('services')
                }
                if (!filled.length) {
                  const m = 'Nothing new came out of that. Every field it can read is already filled in.'
                  setErr(m); setTorSaid({ ok: false, text: m })
                } else {
                  setBriefDraft(merged)
                  const m = `Filled in from ${files.length === 1 ? 'the document' : `${files.length} documents`}: ${
                    [...new Set(filled)].map((k) => FIELD_NAMES[k] || k).join(', ')
                  }. Check it, then save the brief.${kept.length ? ` ${kept.join('. ')}.` : ''}`
                  setNote(m); setTorSaid({ ok: true, text: m })
                }
              } catch (e2) {
                const m = e2.message || 'Could not read that document'
                setErr(m); setTorSaid({ ok: false, text: m })
              }
              setBusy(null)
              e.target.value = ''
            }}
          />
          {busy === 'tor' ? <p style={hint}>Reading the document...</p> : null}
          {torSaid ? (
            <p style={{ ...hint, margin: '0.35rem 0 0', color: torSaid.ok ? C.green : C.red }}>{torSaid.text}</p>
          ) : null}
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
              <div style={row}><span style={lab}>Co-implementer</span>
                <input style={field} value={d.coImplementer || ''} placeholder="e.g. Ganiat Agbeke Ettu"
                  onChange={(e) => set('coImplementer', e.target.value)} /></div>
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
        label="Who receives it"
        help={`Everyone who should get the letter, by name. Each person receives their own copy: their salutation, the letter for their side of the engagement, and their own sign-in link. Nobody is put in the To or CC line with somebody else, so no recipient sees the rest of the list and no two people share a link.`}
      >
        {(() => {
          const d = briefDraft || brief || {}
          const rows = d.recipients || []
          const setRows = (next) => setBriefDraft({ ...d, recipients: next })
          const cell = { ...field, padding: '0.34rem 0.45rem', fontSize: '0.88rem' }
          return (
            <div>
              {rows.length === 0
                ? <p style={{ ...hint, margin: '0 0 0.5rem' }}>Nobody added yet. Add the people at both organisations who should receive this.</p>
                : null}
              {rows.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input style={{ ...cell, maxWidth: 70 }} placeholder="Mr" value={r.title || ''}
                    onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                  <input style={{ ...cell, maxWidth: 175 }} placeholder="Full name" value={r.name || ''}
                    onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  <input style={{ ...cell, maxWidth: 215 }} placeholder="email@organisation.org" value={r.email || ''}
                    onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
                  <input style={{ ...cell, maxWidth: 155 }} placeholder="Their role" value={r.role || ''}
                    onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} />
                  <select style={{ ...cell, maxWidth: 165 }} value={r.audience || 'payer'}
                    onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, audience: e.target.value } : x))}>
                    <option value="payer">Paying client letter</option>
                    <option value="served">Served client letter</option>
                  </select>
                  <button type="button" style={{ ...smallBtn(C.red), padding: '0.2rem 0.5rem' }}
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.45rem', flexWrap: 'wrap' }}>
                <button type="button" style={smallBtn(C.slate)}
                  onClick={() => setRows([...rows, { title: '', name: '', email: '', role: '', audience: 'payer' }])}>
                  Add someone
                </button>
                <button
                  type="button" style={smallBtn(C.teal, true)} disabled={busy === 'people' || !briefDraft}
                  onClick={async () => {
                    setBusy('people'); setNote(null); setErr(null)
                    try {
                      await api('PATCH', { clientId, brief: briefDraft })
                      setBriefDraft(null); setEmailPreview(null)
                      setNote('The recipients are saved.')
                      await load()
                    } catch (e) { setErr(e.message || 'That did not save') }
                    setBusy(null)
                  }}
                >{busy === 'people' ? 'Saving...' : 'Save the recipients'}</button>
              </div>
            </div>
          )
        })()}
      </Setting>

      <Setting
        label="The letter"
        help={`Two letters, written from the brief above: one to the organisation paying and one to the organisation being served. Read either at any time. Sending needs an address on the client or on a party; reading does not.`}
      >
        {(() => {
          // The client contact first, then the parties; one person listed twice
          // is one email, and an engagement with nobody on it says so rather
          // than offering a button that would send to no one.
          // The named list is the list. The client contact and the parties are
          // only a fallback for an engagement where nobody has been named yet.
          const named = (brief.recipients || []).map((r) => r.email).filter(Boolean)
          const to = named.length
            ? named
            : [...new Set([client?.contact_email, ...partyEmails].map((e) => (e || '').trim()).filter(Boolean))]
          // The route refuses a link that is not a web address, so a client
          // with no slug yet would fail the preview on a technicality. Fall
          // back to the platform's front door: still true, still openable.
          const origin = typeof window !== 'undefined' ? window.location.origin : ''
          const journeyUrl = client?.slug && origin
            ? `${origin}/engagement/${client.slug}`
            : origin
          // READING IS NOT SENDING. 7 September 2026. This whole block used to
          // collapse to "no email address yet" when nobody was on the client,
          // so on a fresh engagement there was no way to read the letter at
          // all — which is precisely when you most want to. Only the send
          // button needs an address now.
          return (
            <div>
              <p style={{ ...hint, margin: '0 0 0.5rem' }}>
                {to.length
                  ? <>Goes to {to.length} {to.length === 1 ? 'person' : 'people'}, each with their own copy: {to.join(', ')}.</>
                  : <>Nobody is on the list yet, so the letter can be read but not sent. Add people above.</>}
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
              {/* ONE EMAIL, NOT TWO. A client holding a letter about a platform
                  they cannot open, waiting on a second message from a different
                  sender, is the opposite of the impression this is for. */}
              <label style={{ ...hint, display: 'flex', gap: '0.35rem', alignItems: 'center', cursor: 'pointer', margin: '0 0 0.6rem' }}>
                <input
                  type="checkbox" checked={includeSignIn}
                  onChange={() => { setIncludeSignIn((v) => !v); setEmailPreview(null) }}
                />Put their sign-in in this letter, so no second email is needed
              </label>
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
                disabled={busy === 'preview'}
                onClick={async () => {
                  setBusy('preview'); setNote(null); setErr(null)
                  try {
                    const r = await sendEngagementEmail({
                      clientId, stage: 'scope', recipients: to, journeyUrl,
                      preview: true, audience: welcomeAudience, wantText: true,
                      recipientName: toName, recipientTitle: toTitle, includeSignIn,
                    })
                    if (r?.html) {
                      setEmailPreview({ subject: r.subject, html: r.html })
                      // Load the letter for editing at the same time, so the
                      // words on screen are the words that can be changed.
                      const saved = welcomeAudience === 'payer' ? brief.letterPayer : brief.letterServed
                      setLetterDraft(saved && saved.trim() ? saved : (r.text || ''))
                    }
                    else setErr('The preview came back empty.')
                  } catch (e) { setErr(e.message || 'Could not build the preview') }
                  setBusy(null)
                }}
              >{busy === 'preview' ? 'Building...' : (emailPreview ? 'Rebuild the preview' : 'Read it first')}</button>
              {' '}
              <button
                type="button"
                style={smallBtn(C.teal)}
                disabled={busy === 'welcome' || !journeyUrl || to.length === 0}
                onClick={async () => {
                  setBusy('welcome'); setNote(null); setErr(null)
                  try {
                    const r = await sendEngagementEmail({
                      clientId, stage: 'scope', recipients: to, journeyUrl,
                      audience: welcomeAudience, includeSignIn,
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
                  {/* THE PREVIEW WAS BLANK, AND THE APP DID IT TO ITSELF.
                      This was an iframe. The app sends frame-ancestors 'none'
                      and a default-src of 'self', so the browser refused to
                      render the app's own srcdoc frame and drew "refused to
                      connect" instead of the letter. Rendered inline there is
                      no frame to refuse. It is safe to do so: every word a
                      person typed is escaped on the way into this markup, so
                      the letter is text and never code. */}
                  <div
                    style={{ background: '#fff', padding: '4px 0', maxHeight: 620, overflowY: 'auto' }}
                    dangerouslySetInnerHTML={{ __html: emailPreview.html }}
                  />
                </div>
              ) : null}
              {letterDraft !== null ? (
                <div style={{ marginTop: '0.9rem' }}>
                  <div style={{ ...labelText, marginBottom: 5 }}>Edit the letter</div>
                  <p style={{ ...hint, margin: '0 0 0.4rem' }}>
                    Your words, sent over your name. A line starting with <b>#</b> is a heading,
                    a line starting with <b>-</b> is a bullet, and a blank line separates paragraphs.
                    Save, then rebuild the preview to read it back.
                  </p>
                  <textarea
                    style={{ ...field, minHeight: 320, fontFamily: 'var(--cv-font-mono)', fontSize: '0.86rem', lineHeight: 1.55 }}
                    value={letterDraft}
                    onChange={(e) => setLetterDraft(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button" style={smallBtn(C.teal, true)} disabled={busy === 'letter'}
                      onClick={async () => {
                        setBusy('letter'); setNote(null); setErr(null)
                        try {
                          const key = welcomeAudience === 'payer' ? 'letterPayer' : 'letterServed'
                          const next = { ...(briefDraft || brief || {}), [key]: letterDraft }
                          await api('PATCH', { clientId, brief: next })
                          setBriefDraft(null); setEmailPreview(null)
                          setNote('The letter is saved. Read it first again to see it as it will arrive.')
                          await load()
                        } catch (e) { setErr(e.message || 'That did not save') }
                        setBusy(null)
                      }}
                    >{busy === 'letter' ? 'Saving...' : 'Save the letter'}</button>
                    <button
                      type="button" style={smallBtn(C.slate)} disabled={busy === 'letter'}
                      onClick={async () => {
                        // Back to the generated letter, discarding the edit.
                        setBusy('letter'); setNote(null); setErr(null)
                        try {
                          const key = welcomeAudience === 'payer' ? 'letterPayer' : 'letterServed'
                          const next = { ...(briefDraft || brief || {}), [key]: '' }
                          await api('PATCH', { clientId, brief: next })
                          setBriefDraft(null); setEmailPreview(null); setLetterDraft(null)
                          setNote('Back to the generated letter.')
                          await load()
                        } catch (e) { setErr(e.message || 'That did not save') }
                        setBusy(null)
                      }}
                    >Start again from the generated letter</button>
                  </div>
                </div>
              ) : null}
            </div>
          )
        })()}
      </Setting>

    </div>
  )
}
