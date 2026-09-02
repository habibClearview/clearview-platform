// @ts-nocheck
'use client'
// ============================================================
// Cover.
//
// The workbook's first tab: who this engagement is, who is on it, where it
// stands, and the intellectual property notice. In the app the Cover tab
// rendered nothing at all, so opening a client landed on an empty pane.
//
// Everything shown is configuration, read from the engagement. The
// attribution line is fixed and must not be removed, since the licence
// terms treat stripping it as a breach.
// ============================================================
import { useEffect, useState } from 'react'
import { loadEngagementView } from '@/lib/engagement-loader'
import { PARTY_ROLE_LABELS } from '@/lib/engagement-types'

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

function momentumColour(m) {
  if (m === 'red') return C.crit
  if (m === 'amber') return C.warn
  return C.good
}

export default function CoverPanel({ slug }) {
  const [view, setView] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let off = false
    async function go() {
      try {
        const v = await loadEngagementView(slug)
        if (!off) { setView(v); setLoading(false) }
      } catch { if (!off) setLoading(false) }
    }
    if (slug) go()
    return () => { off = true }
  }, [slug])

  if (loading) return <p style={{ color: C.faint, fontSize: 14 }}>Loading the engagement...</p>
  if (!view) return <p style={{ color: C.faint, fontSize: 14 }}>This engagement could not be loaded.</p>

  const client = view.client || {}
  const cfg = view.config || {}
  const parties = view.parties || []
  const gs = view.gate_status || {}
  const done = Object.values(gs).filter((s) => s === 'complete').length
  // Counted from the engagement's own gates rather than fixed at twelve, so an
  // engagement that runs a different set does not report against a number that
  // has nothing to do with it.
  const total = Object.keys(gs).length || 12

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

  return (
    <div style={{ fontFamily: "var(--cv-font)", color: C.ink }}>

      <div style={{
        background: C.navy, color: '#F3ECDE', borderRadius: 14, padding: '22px 24px', marginBottom: 16,
      }}>
        <p style={{
          fontFamily: 'var(--cv-font-mono)', fontSize: 12.5, letterSpacing: '.24em',
          textTransform: 'uppercase', color: C.gold, margin: 0,
        }}>Grant-to-Commercial Viability Canvas</p>
        <h2 style={{ fontFamily: 'var(--cv-font)', fontSize: 28, margin: '8px 0 0', fontWeight: 600 }}>
          {client.name || 'This engagement'}
        </h2>
        <p style={{ margin: '10px 0 0', fontSize: 14, color: 'rgba(243,236,222,.85)' }}>
          {view.programme_name ? view.programme_name : 'Engagement'}
          {funder ? ` with ${funder.organisation || funder.name}` : ''}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12 }}>
        <div style={box}>
          <p style={label}>Where it stands</p>
          <p style={{ fontFamily: 'var(--cv-font)', fontSize: 20, margin: 0 }}>
            {PHASE_LABEL[client.status] || client.status || 'Not started'}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.soft }}>
            {done} of {total} gates complete
          </p>
        </div>

        <div style={box}>
          <p style={label}>Momentum</p>
          <p style={{
            fontFamily: 'var(--cv-font)', fontSize: 20, margin: 0,
            color: momentumColour(cfg.momentum_status),
          }}>
            {(cfg.momentum_status || 'green') === 'green' ? 'On track'
              : cfg.momentum_status === 'amber' ? 'Slipping' : 'Paused'}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.soft }}>
            {(cfg.momentum_status || 'green') === 'green'
              ? 'Continue as planned'
              : cfg.momentum_status === 'amber'
                ? 'Catch up within five working days'
                : 'Recovery plan needed before resuming'}
          </p>
        </div>

        <div style={box}>
          <p style={label}>Lead consultant</p>
          <p style={{ fontFamily: 'var(--cv-font)', fontSize: 18, margin: 0 }}>{lead?.name || 'Not named'}</p>
          {co ? (
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.soft }}>
              with {co.name} as co-implementer
            </p>
          ) : (
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.faint }}>Delivered solo</p>
          )}
        </div>

        <div style={box}>
          <p style={label}>Dates</p>
          <p style={{ fontFamily: 'var(--cv-font)', fontSize: 18, margin: 0 }}>
            {client.start_date ? new Date(client.start_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : 'Not set'}
            {client.expected_close ? ' to ' + new Date(client.expected_close).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : ''}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.soft }}>
            {client.country || 'Location not set'}
          </p>
        </div>
      </div>

      <div style={{ ...box, marginTop: 14 }}>
        <p style={label}>Who is on this engagement</p>
        {parties.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, color: C.faint }}>
            No parties recorded yet. Add them in Engagement Setup.
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
        Grant-to-Commercial Viability Canvas&trade; · The Canvas Coach · habibonifade.com
      </p>
    </div>
  )
}
