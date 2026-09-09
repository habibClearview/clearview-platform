// @ts-nocheck
'use client'
// ============================================================
// COVER
//
// Who this engagement is, who is on it, where it stands, and the intellectual
// property notice.
//
// EVERY ELEMENT IS EDITED WHERE IT IS READ. 9 September 2026.
//
// Habib: it is really dumb to create a separate place to edit when each of the
// elements on the cover can be edited on the cover, so the "change the cover"
// here is dumb. He was right, and the separate form had a second failure: the
// lead consultant could not be changed at all, because that form held the
// client record and the lead consultant is a party.
//
// So there is no editor. A card's value IS the field. It reads as text until
// you put the cursor in it, and it saves when you leave it. Nothing is edited
// in two places, because there is only one place, and it is the place the fact
// is read.
//
// A person who cannot manage the engagement sees exactly what was here before:
// a reading, with no inputs at all.
//
// The attribution line is fixed and must not be removed, since the licence
// terms treat stripping it as a breach.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { loadEngagementView } from '@/lib/engagement-loader'
import { PARTY_ROLE_LABELS } from '@/lib/engagement-types'
import { briefFromConfig, periodDisagreement } from '@/lib/engagement-brief'

const C = {
  card: '#FBF7EE', box: '#FFFDF8', ink: '#1B2A41', soft: '#4C5A6B', faint: '#8B8272',
  line: 'rgba(27,42,65,.18)', teal: '#00767A', gold: '#B7791F', navy: '#22344F',
  good: '#2E7D32', warn: '#9E6B10', crit: '#C62828',
}

const PHASE_LABEL = {
  setup: 'Set up', phase_0: 'Clearing the ground',
  dp01: 'Decision Point 1', dp02: 'Decision Point 2', dp03: 'Decision Point 3',
  dp04: 'Decision Point 4', dp05: 'Decision Point 5', dp06: 'Decision Point 6',
  dp07: 'Decision Point 7', dp08: 'Decision Point 8', dp09: 'Decision Point 9',
  complete: 'Complete', paused: 'Paused', handover: 'Handover',
}
const PHASE_KEYS = ['setup', 'phase_0', 'dp01', 'dp02', 'dp03', 'dp04', 'dp05', 'dp06', 'dp07', 'dp08', 'dp09', 'complete', 'paused']

const MOMENTUM = [
  { v: 'green', l: 'On track', note: 'Continue as planned' },
  { v: 'amber', l: 'Slipping', note: 'Catch up within five working days' },
  { v: 'red', l: 'Paused', note: 'Recovery plan needed before resuming' },
]

const TYPES = [
  { v: 'crop_aggregator', l: 'Crop aggregator' },
  { v: 'livestock_aggregator', l: 'Livestock aggregator' },
  { v: 'farmer_group_enterprise', l: 'Farmer group enterprise' },
  { v: 'service_lsp', l: 'Service LSP' },
]

const SERVICES = [
  { v: 'canvas', l: 'Grant-to-Commercial Viability' },
  { v: 'financial', l: 'Clearview financial model' },
  { v: 'advisory', l: 'Advisory' },
  { v: 'portfolio_intelligence', l: 'Market Intelligence' },
]

function momentumColour(m) {
  if (m === 'red') return C.crit
  if (m === 'amber') return C.warn
  return C.good
}

function monthYear(d) {
  if (!d) return ''
  const parsed = new Date(d)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

export default function CoverPanel({ slug, canManage = false }) {
  const [view, setView] = useState(null)
  const [loading, setLoading] = useState(true)
  const [programmes, setProgrammes] = useState([])
  const [saving, setSaving] = useState(null)
  const [err, setErr] = useState(null)

  const load = useCallback(async () => {
    try {
      const v = await loadEngagementView(slug)
      setView(v)
    } catch { setView(null) }
    setLoading(false)
  }, [slug])

  useEffect(() => { if (slug) load() }, [slug, load])

  useEffect(() => {
    if (!canManage) return
    supabase.from('programmes').select('id,name').order('name')
      .then(({ data }) => setProgrammes(data || []))
  }, [canManage])

  const client = view?.client || {}
  const cfg = view?.config || {}
  const parties = view?.parties || []

  /** Change one field on the engagement record, where it is read. */
  async function saveClient(field, value) {
    if (!client.id) return
    setSaving(field); setErr(null)
    const patch = { [field]: value === '' ? null : value, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('engagement_clients').update(patch).eq('id', client.id)
    if (error) setErr(`Could not save ${field.replace(/_/g, ' ')}. Your change is still on screen, try again.`)
    else setView((v) => ({ ...v, client: { ...v.client, [field]: value === '' ? null : value } }))
    setSaving(null)
  }

  /** Momentum lives on the engagement's own settings rather than the client row. */
  async function saveMomentum(value) {
    if (!client.id) return
    setSaving('momentum'); setErr(null)
    const { error } = await supabase.from('engagement_config')
      .upsert({ client_id: client.id, momentum_status: value, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
    if (error) setErr('Could not save the momentum. Try again.')
    else setView((v) => ({ ...v, config: { ...(v.config || {}), momentum_status: value } }))
    setSaving(null)
  }

  /**
   * The lead consultant and the co-implementer are people, not fields on the
   * client record, which is why the old form could not change them however
   * many times somebody tried. Naming one here creates or renames that party.
   */
  async function savePartyName(role, name) {
    if (!client.id) return
    setSaving(role); setErr(null)
    const existing = parties.find((p) => p.party_role === role)
    const trimmed = String(name || '').trim()
    let error = null
    if (existing && !trimmed) {
      ({ error } = await supabase.from('engagement_parties').delete().eq('id', existing.id))
    } else if (existing) {
      ({ error } = await supabase.from('engagement_parties')
        .update({ name: trimmed, updated_at: new Date().toISOString() }).eq('id', existing.id))
    } else if (trimmed) {
      ({ error } = await supabase.from('engagement_parties')
        .insert({ client_id: client.id, party_role: role, name: trimmed, is_signatory: role === 'lead_consultant' }))
    }
    if (error) setErr('Could not save that name. Try again.')
    else await load()
    setSaving(null)
  }

  if (loading) return <p style={{ color: C.faint, fontSize: 14 }}>Loading the engagement...</p>
  if (!view) return <p style={{ color: C.faint, fontSize: 14 }}>This engagement could not be loaded.</p>

  const gs = view.gate_status || {}
  const done = Object.values(gs).filter((s) => s === 'complete').length
  // Counted from the engagement's own gates rather than fixed at twelve, so an
  // engagement that runs a different set does not report against a number that
  // has nothing to do with it.
  const total = Object.keys(gs).length || 12

  // What the signed document says, against what the record says.
  const brief = briefFromConfig(view.config?.brand_overrides)
  const clash = periodDisagreement(client, brief)
  const reference = brief?.reference || 'the signed document'

  const lead = parties.find((p) => p.party_role === 'lead_consultant')
  const co = parties.find((p) => p.party_role === 'co_implementer')
  const funder = parties.find((p) => p.party_role === 'client_funder') || parties.find((p) => p.party_role === 'funder_rep')

  const box = {
    background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '15px 17px',
  }
  const label = {
    fontFamily: 'var(--cv-font-mono)', fontSize: 12.5, letterSpacing: '.13em',
    textTransform: 'uppercase', color: C.faint, margin: '0 0 5px',
  }
  // A field that reads as the thing it says until somebody puts a cursor in
  // it. An input styled as a box on every card would turn a cover into a form.
  const inline = (size = 18) => ({
    font: 'inherit', fontFamily: 'var(--cv-font)', fontSize: size, color: C.ink,
    width: '100%', padding: '2px 4px', margin: '-2px -4px',
    background: 'transparent', border: '1px solid transparent', borderRadius: 6,
  })
  const small = { ...inline(12.5), color: C.soft }

  /** One editable value, or the same value as plain text when it is not yours to change. */
  const Text = ({ field, size = 18, placeholder, style }) => (
    canManage ? (
      <input
        aria-label={placeholder || field}
        defaultValue={client[field] || ''}
        placeholder={placeholder}
        style={{ ...inline(size), ...style }}
        onFocus={(e) => { e.target.style.borderColor = C.line; e.target.style.background = C.box }}
        onBlur={(e) => {
          e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent'
          if ((client[field] || '') !== e.target.value) saveClient(field, e.target.value)
        }}
      />
    ) : <span style={{ fontSize: size }}>{client[field] || placeholder}</span>
  )

  const Choice = ({ field, options, size = 18, onSave, value }) => (
    canManage ? (
      <select
        aria-label={field}
        value={value ?? (client[field] || '')}
        style={{ ...inline(size), cursor: 'pointer' }}
        onChange={(e) => (onSave ? onSave(e.target.value) : saveClient(field, e.target.value))}
      >
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    ) : (
      <span style={{ fontSize: size }}>
        {(options.find((o) => o.v === (value ?? client[field]))?.l) || 'Not set'}
      </span>
    )
  )

  return (
    <div style={{ fontFamily: "var(--cv-font)", color: C.ink }}>

      <div style={{
        background: C.navy, color: '#F3ECDE', borderRadius: 14, padding: '22px 24px', marginBottom: 16,
      }}>
        <p style={{
          fontFamily: 'var(--cv-font-mono)', fontSize: 12.5, letterSpacing: '.24em',
          textTransform: 'uppercase', color: C.gold, margin: 0,
        }}>Grant-to-Commercial Viability Canvas</p>
        {canManage ? (
          <input
            aria-label="The organisation's name"
            defaultValue={client.name || ''}
            style={{
              font: 'inherit', fontFamily: 'var(--cv-font)', fontSize: 28, fontWeight: 600,
              color: '#F3ECDE', background: 'transparent', border: '1px solid transparent',
              borderRadius: 6, width: '100%', padding: '2px 4px', margin: '6px -4px 0',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'rgba(243,236,222,.4)' }}
            onBlur={(e) => {
              e.target.style.borderColor = 'transparent'
              if ((client.name || '') !== e.target.value && e.target.value.trim()) saveClient('name', e.target.value.trim())
            }}
          />
        ) : (
          <h2 style={{ fontFamily: 'var(--cv-font)', fontSize: 28, margin: '8px 0 0', fontWeight: 600 }}>
            {client.name || 'This engagement'}
          </h2>
        )}
        <p style={{ margin: '10px 0 0', fontSize: 14, color: 'rgba(243,236,222,.85)' }}>
          {view.programme_name ? view.programme_name : 'Engagement'}
          {funder ? ` with ${funder.organisation || funder.name}` : ''}
        </p>
      </div>

      {err ? <p style={{ color: C.crit, fontSize: 13.5, margin: '0 0 10px' }}>{err}</p> : null}
      {saving ? <p style={{ color: C.faint, fontSize: 12.5, margin: '0 0 10px' }}>Saving...</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12 }}>
        <div style={box}>
          <p style={label}>Where it stands</p>
          <Choice field="status" size={20} options={PHASE_KEYS.map((k) => ({ v: k, l: PHASE_LABEL[k] }))} />
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.soft }}>
            {done} of {total} gates complete
          </p>
        </div>

        <div style={box}>
          <p style={label}>Momentum</p>
          <div style={{ color: momentumColour(cfg.momentum_status) }}>
            <Choice
              field="momentum_status" size={20} options={MOMENTUM}
              value={cfg.momentum_status || 'green'} onSave={saveMomentum}
            />
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.soft }}>
            {(MOMENTUM.find((m) => m.v === (cfg.momentum_status || 'green')) || MOMENTUM[0]).note}
          </p>
        </div>

        {/* THE LEAD CONSULTANT CAN NOW BE CHANGED. Habib: the lead consultant
            cannot be edited because it is not included in the cover that is
            editable. It never could be from that form, because it is a party
            and the form held the client record. */}
        <div style={box}>
          <p style={label}>Lead consultant</p>
          {canManage ? (
            <input
              aria-label="Lead consultant"
              defaultValue={lead?.name || ''}
              placeholder="Not named yet"
              style={inline(18)}
              onFocus={(e) => { e.target.style.borderColor = C.line; e.target.style.background = C.box }}
              onBlur={(e) => {
                e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent'
                if ((lead?.name || '') !== e.target.value) savePartyName('lead_consultant', e.target.value)
              }}
            />
          ) : <p style={{ fontSize: 18, margin: 0 }}>{lead?.name || 'Not named yet'}</p>}

          {canManage ? (
            <input
              aria-label="Co-implementer"
              defaultValue={co?.name || ''}
              placeholder="No co-implementer recorded"
              style={{ ...small, marginTop: 6 }}
              onFocus={(e) => { e.target.style.borderColor = C.line; e.target.style.background = C.box }}
              onBlur={(e) => {
                e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent'
                if ((co?.name || '') !== e.target.value) savePartyName('co_implementer', e.target.value)
              }}
            />
          ) : (
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: co ? C.soft : C.faint }}>
              {/* This card used to assert that the engagement was delivered
                  alone. That is a claim, and the absence of a co-implementer
                  party is not the same as nobody helping. */}
              {co ? `with ${co.name} as co-implementer` : 'No co-implementer recorded'}
            </p>
          )}
        </div>

        <div style={box}>
          <p style={label}>Dates</p>
          {canManage ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="date" aria-label="Start date" defaultValue={client.start_date || ''}
                style={{ ...inline(14), width: 'auto' }}
                onBlur={(e) => { if ((client.start_date || '') !== e.target.value) saveClient('start_date', e.target.value) }}
              />
              <span style={{ fontSize: 13, color: C.faint }}>to</span>
              <input
                type="date" aria-label="Target handover" defaultValue={client.expected_close || ''}
                style={{ ...inline(14), width: 'auto' }}
                onBlur={(e) => { if ((client.expected_close || '') !== e.target.value) saveClient('expected_close', e.target.value) }}
              />
            </div>
          ) : (
            <p style={{ fontSize: 18, margin: 0 }}>
              {monthYear(client.start_date) || 'Not set'}
              {client.expected_close ? ` to ${monthYear(client.expected_close)}` : ''}
            </p>
          )}
          <div style={{ marginTop: 6 }}>
            <Text field="country" size={12.5} placeholder="Location not set" style={{ color: C.soft }} />
          </div>

          {/* THE SAME FACT, STORED TWICE, DISAGREEING. 9 September 2026.
              Habib: there are repetitions of data, presentation of the same
              information that we do not need to have in multiple places. The
              period was the clearest case and it was not presentation, it was
              two stores: this record, and the brief read out of the signed
              purchase order. On Ikore they disagreed and no screen said so, so
              the Cover and the welcome letter could give a funder two
              different closing dates. Which is right is not something code can
              decide, because a start can genuinely move after an order is
              raised, so it is named and settled in one press. */}
          {clash.length > 0 && (
            <div style={{
              marginTop: 8, padding: '8px 10px', border: `1px solid ${C.warn}`, borderRadius: 8,
              fontSize: 12, color: C.soft, lineHeight: 1.5,
            }}>
              <b style={{ color: C.warn }}>These dates do not match the signed document.</b>
              {clash.map((d) => (
                <div key={d.field} style={{ marginTop: 3 }}>
                  The {d.field === 'start' ? 'start' : 'close'} is {monthYear(d.recorded) || d.recorded} here
                  and {monthYear(d.document) || d.document} on {reference}.
                </div>
              ))}
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    const patch = {}
                    clash.forEach((d) => { patch[d.field === 'start' ? 'start_date' : 'expected_close'] = d.document })
                    Object.entries(patch).forEach(([f, v]) => saveClient(f, v))
                  }}
                  style={{
                    marginTop: 6, font: 'inherit', fontSize: 12, color: C.teal, background: 'none',
                    border: 'none', padding: 0, textDecoration: 'underline', cursor: 'pointer',
                  }}
                >Use the dates on {reference}</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* THE REST OF WHAT THE SEPARATE FORM HELD, on the cover, where it is
          read. Nothing is lost by that form being gone. */}
      <div style={{ ...box, marginTop: 14 }}>
        <p style={label}>The engagement</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          <div>
            <p style={{ ...label, fontSize: 11.5 }}>Service</p>
            <Choice field="engagement_mode" size={15} options={SERVICES} />
          </div>
          <div>
            <p style={{ ...label, fontSize: 11.5 }}>Organisation type</p>
            <Choice field="type" size={15} options={TYPES} />
          </div>
          <div>
            <p style={{ ...label, fontSize: 11.5 }}>Programme</p>
            {canManage ? (
              <select
                aria-label="Programme"
                value={client.programme_id || ''}
                style={{ ...inline(15), cursor: 'pointer' }}
                onChange={(e) => saveClient('programme_id', e.target.value)}
              >
                <option value="">No programme, paying for itself</option>
                {programmes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : <p style={{ fontSize: 15, margin: 0 }}>{view.programme_name || 'No programme, paying for itself'}</p>}
          </div>
          <div>
            <p style={{ ...label, fontSize: 11.5 }}>Sector</p>
            <Text field="sector" size={15} placeholder="Not set" />
          </div>
          <div>
            <p style={{ ...label, fontSize: 11.5 }}>Chief executive</p>
            <Text field="contact_name" size={15} placeholder="Not named" />
          </div>
          <div>
            <p style={{ ...label, fontSize: 11.5 }}>Their email</p>
            <Text field="contact_email" size={15} placeholder="Not recorded" />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <p style={{ ...label, fontSize: 11.5 }}>Notes</p>
          {canManage ? (
            <textarea
              aria-label="Notes"
              defaultValue={client.notes || ''}
              placeholder="Anything that belongs on the cover of this engagement"
              style={{ ...inline(14), minHeight: 64, resize: 'vertical', borderColor: C.line, background: C.box }}
              onBlur={(e) => { if ((client.notes || '') !== e.target.value) saveClient('notes', e.target.value) }}
            />
          ) : <p style={{ fontSize: 14, margin: 0, color: C.soft, whiteSpace: 'pre-wrap' }}>{client.notes || ''}</p>}
        </div>
      </div>

      <div style={{ ...box, marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <p style={label}>Who is on this engagement</p>
          <span style={{ fontSize: 11.5, color: C.faint, fontStyle: 'italic' }}>
            Added and removed under Who is on it, and settings
          </span>
        </div>
        {parties.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, color: C.faint }}>
            No parties recorded yet. Add them under Who is on it, and settings.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 10 }}>
            {parties.map((p) => (
              <div key={p.id} style={{
                background: C.box, border: `1px solid ${C.line}`, borderRadius: 9, padding: '10px 12px',
              }}>
                <p style={{
                  fontFamily: 'var(--cv-font-mono)', fontSize: 12.5, letterSpacing: '.1em',
                  textTransform: 'uppercase', color: C.teal, margin: 0, fontWeight: 700,
                }}>{PARTY_ROLE_LABELS[p.party_role] || p.party_role}</p>
                <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600 }}>{p.name}</p>
                {p.organisation ? (
                  <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.soft }}>{p.organisation}</p>
                ) : null}
                {p.is_signatory ? (
                  <p style={{ margin: '5px 0 0', fontSize: 12.5, color: C.gold, fontWeight: 600 }}>Signs the Charter</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{
        marginTop: 14, padding: '13px 16px', border: `1px dashed ${C.line}`, borderRadius: 12,
        fontSize: 12.5, color: C.soft,
      }}>
        <b style={{ color: C.ink }}>Intellectual property.</b> Grant-to-Commercial Viability
        Canvas&trade;, its tools and the ClearView platform remain the intellectual property of The
        Canvas Coach and are licensed, not sold. Everything produced for the organisation during the
        engagement belongs to the organisation. Removing the attribution is a breach of the licence.
      </div>

      <p style={{ marginTop: 18, fontSize: 12.5, color: C.faint, fontFamily: 'var(--cv-font)', textAlign: 'center' }}>
        Grant-to-Commercial Viability Canvas&trade; &middot; The Canvas Coach &middot; habibonifade.com
      </p>
    </div>
  )
}
