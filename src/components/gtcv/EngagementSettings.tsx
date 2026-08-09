// @ts-nocheck
'use client'
// ============================================================
// HOW THIS ENGAGEMENT RUNS
//
// The handful of settings that shape one engagement without changing the
// method. What the app calls a block, how many conversations a segment agreed
// to hold, whether the engagement is on track, and which document the
// deliverables came from.
//
// All of it was previously reachable only by writing SQL, which meant the
// person running the engagement could not adjust their own engagement. That is
// the opposite of the flexibility this platform exists to provide.
//
// Each setting says what it actually does, because a coach changing one wants
// to know what will move on screen, and finding out afterwards is too late.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DEFAULT_VALIDATION_MIN_PER_SEGMENT } from '@/lib/engagement-types'
import { CONVERGENCE_MINIMUM } from '@/lib/interview-report'

const C = {
  card: 'var(--cv-card)', alt: 'var(--cv-alt)', border: 'var(--cv-border)',
  slate: 'var(--cv-slate)', navy: 'var(--cv-navy)', teal: 'var(--cv-teal)',
  green: 'var(--cv-green)', amber: 'var(--cv-amber)', red: 'var(--cv-red)',
}
const mono = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' }
const hint = { fontSize: '0.88rem', color: C.slate, lineHeight: 1.5 }
const label = {
  ...mono, fontSize: '0.68rem', letterSpacing: '.1em', textTransform: 'uppercase',
  color: C.slate, display: 'block', marginBottom: 5,
}
const field = {
  width: '100%', padding: '0.44rem 0.58rem', borderRadius: 7,
  border: `1px solid ${C.border}`, background: 'transparent', color: 'inherit',
  fontFamily: "'Segoe UI',system-ui,sans-serif", fontSize: '0.93rem',
}

const MOMENTUM = [
  { v: 'green', l: 'On track', c: C.green, note: 'Continue as planned.' },
  { v: 'amber', l: 'Slipping', c: C.amber, note: 'Catch up within five working days.' },
  { v: 'red', l: 'Stopped', c: C.red, note: 'A recovery plan is needed before this resumes.' },
]

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

  const load = useCallback(async () => {
    if (!clientId) { setLoading(false); return }
    setLoading(true)
    try {
      const r = await api('GET', null, `?clientId=${encodeURIComponent(clientId)}`)
      setConfig(r.config)
      setMinDraft(r.config?.validation_min_per_segment == null ? '' : String(r.config.validation_min_per_segment))
      setTorDraft(r.config?.tor_reference || '')
      setCurrencyDraft(r.config?.currency || '')
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
      <div style={{ ...mono, fontSize: '0.75rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
        How this engagement runs
      </div>
      <p style={{ ...hint, margin: '0.4rem 0 0', maxWidth: '92ch' }}>
        These shape one engagement without changing the method. Every engagement runs the same nine
        blocks in the same order; what these decide is what they are called, what this engagement
        agreed to do, and how it is going.
      </p>

      <div style={{
        marginTop: '1rem', border: `1px solid ${C.border}`, borderRadius: 10,
        background: C.alt, padding: '0.85rem 1rem',
      }}>
        <div style={{ ...mono, fontSize: '0.7rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
          Scaffolding
        </div>
        <p style={{ ...hint, margin: '0.35rem 0 0.6rem', maxWidth: '92ch' }}>
          A new engagement needs three things before anything else works: its own settings, a record
          for each of the twelve gates, and a Charter to edit and issue. This creates whichever of
          them are missing and touches nothing that is already there, so pressing it twice is safe.
          It does not invent parties: a name on a signature has to be a real one, so add those
          yourself above.
        </p>
        <button
          type="button"
          style={{
            ...mono, fontSize: '0.83rem', padding: '0.4rem 0.9rem',
            border: `1px solid ${C.slate}`, borderRadius: 7, background: 'transparent',
            color: C.slate, cursor: 'pointer',
          }}
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
      </div>

      {err ? <div style={{ color: C.red, fontSize: '0.95rem', marginTop: '0.7rem' }}>{err}</div> : null}
      {note ? <div style={{ color: C.green, fontSize: '0.95rem', marginTop: '0.7rem' }}>{note}</div> : null}

      <div style={{ marginTop: '1.1rem' }}>
        <span style={label}>How the engagement is going</span>
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
        <p style={{ ...hint, margin: '0.4rem 0 0' }}>
          Your read, not a calculation. A number cannot see a leadership team distracted by a funding
          round or a signature that is travelling, and those are usually why an engagement slips.
          This shows on the cover and on the journey canvas.
        </p>
      </div>

      <div style={{ marginTop: '1.3rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '1rem' }}>
        <div>
          <label htmlFor="cfg-terminology" style={label}>What to call each block</label>
          <select
            id="cfg-terminology"
            aria-label="What to call each block"
            style={field}
            value={c.terminology || 'dp'}
            disabled={busy === 'terminology'}
            onChange={(e) => save('terminology', { terminology: e.target.value }, 'Naming changed.')}
          >
            <option value="zone">Zone 1, Zone 2, and so on</option>
            <option value="dp">DP01, DP02, and so on</option>
          </select>
          <p style={{ ...hint, margin: '0.35rem 0 0' }}>
            The same nine blocks either way. Some organisations find Zone plainer; some funders expect
            the decision point numbering from the proposal.
          </p>
        </div>

        <div>
          <label htmlFor="cfg-independence" style={label}>Which independence tests close it</label>
          <select
            id="cfg-independence"
            aria-label="Which independence tests close the engagement"
            style={field}
            value={c.independence_test_set || 'engagement'}
            disabled={busy === 'independence'}
            onChange={(e) => save('independence', { independenceTestSet: e.target.value }, 'Test set changed.')}
          >
            <option value="engagement">The five engagement tests</option>
            <option value="tools">The tools handover tests</option>
          </select>
          <p style={{ ...hint, margin: '0.35rem 0 0' }}>
            A full engagement ends with the five tests done unaided. A tools-only piece of work ends
            with the organisation able to run the tools.
          </p>
        </div>
      </div>

      <div style={{ marginTop: '1.3rem' }}>
        <label htmlFor="cfg-min" style={label}>Conversations agreed per segment</label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            id="cfg-min"
            aria-label="Conversations agreed per segment"
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
            style={{
              ...mono, fontSize: '0.83rem', fontWeight: 600, padding: '0.36rem 0.85rem',
              border: `1px solid ${C.teal}`, borderRadius: 7, background: C.teal,
              color: 'var(--cv-on-accent)', cursor: 'pointer',
            }}
            disabled={busy === 'min'}
            onClick={() => save('min', {
              validationMinPerSegment: minDraft.trim() === '' ? null : Number(minDraft),
            }, 'Minimum saved.')}
          >{busy === 'min' ? 'Saving...' : 'Save'}</button>
          {!usingDefault ? (
            <button
              type="button"
              style={{
                ...mono, fontSize: '0.83rem', padding: '0.36rem 0.8rem',
                border: `1px solid ${C.slate}`, borderRadius: 7, background: 'transparent',
                color: C.slate, cursor: 'pointer',
              }}
              disabled={busy === 'min'}
              onClick={() => { setMinDraft(''); save('min', { validationMinPerSegment: null }, 'Back to the method default.') }}
            >Use the default</button>
          ) : null}
        </div>
        <p style={{ ...hint, margin: '0.4rem 0 0', maxWidth: '92ch' }}>
          Currently <strong>{effectiveMin}</strong>
          {usingDefault ? ' , the method default, because nothing else is set.' : '.'} This is what
          this engagement agreed to do, so it is yours to set.{' '}
          <strong>It does not change what counts as evidence.</strong> A segment is only evidenced
          when {CONVERGENCE_MINIMUM} conversations point at the same problem with a real budget
          behind it, and that stays at {CONVERGENCE_MINIMUM} whatever this says. Agreeing to hold
          fewer conversations does not make fewer conversations into proof.
        </p>
      </div>

      <div style={{ marginTop: '1.3rem' }}>
        <label htmlFor="cfg-currency" style={label}>The currency this engagement works in</label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            id="cfg-currency"
            aria-label="The currency this engagement works in"
            style={{ ...field, maxWidth: 140 }}
            value={currencyDraft}
            placeholder="NGN"
            maxLength={8}
            onChange={(e) => setCurrencyDraft(e.target.value)}
          />
          <button
            type="button"
            style={{
              ...mono, fontSize: '0.83rem', padding: '0.36rem 0.8rem',
              border: `1px solid ${C.slate}`, borderRadius: 7, background: 'transparent',
              color: C.slate, cursor: 'pointer',
            }}
            disabled={busy === 'currency'}
            onClick={() => save('currency', { currency: currencyDraft }, currencyDraft.trim()
              ? `Amounts now read in ${currencyDraft.trim().toUpperCase()}.`
              : 'Amounts now show without a currency.')}
          >{busy === 'currency' ? 'Saving...' : 'Save'}</button>
        </div>
        <p style={{ ...hint, margin: '0.35rem 0 0' }}>
          What the organisation prices and costs in. Every cost line, price and pipeline figure in the
          blocks reads in this. Leave it empty and amounts show as plain numbers, which is honest for
          an engagement that has not decided but is hard to read once there are figures in the tables.{' '}
          <strong>This is not your fee currency.</strong> What you invoice in is held separately and
          never appears in front of the organisation.
        </p>
      </div>

      <div style={{ marginTop: '1.3rem' }}>
        <label htmlFor="cfg-tor" style={label}>The document the deliverables came from</label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            id="cfg-tor"
            aria-label="The document the deliverables came from"
            style={{ ...field, maxWidth: 380 }}
            value={torDraft}
            placeholder="Contract or Terms of Reference reference"
            onChange={(e) => setTorDraft(e.target.value)}
          />
          <button
            type="button"
            style={{
              ...mono, fontSize: '0.83rem', padding: '0.36rem 0.8rem',
              border: `1px solid ${C.slate}`, borderRadius: 7, background: 'transparent',
              color: C.slate, cursor: 'pointer',
            }}
            disabled={busy === 'tor'}
            onClick={() => save('tor', { torReference: torDraft }, 'Reference saved.')}
          >{busy === 'tor' ? 'Saving...' : 'Save'}</button>
        </div>
        <p style={{ ...hint, margin: '0.35rem 0 0' }}>
          Recorded so a claim can say which contract it is made under.
          {c.tor_uploaded ? ' A document has been read against this engagement.' : ' No document has been read against this engagement yet.'}
        </p>
      </div>
    </div>
  )
}
