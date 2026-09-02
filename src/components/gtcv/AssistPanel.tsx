// @ts-nocheck
'use client'
// ============================================================
// GtCV ASSIST PANEL
//
// A small panel any GtCV surface can drop in to ask /api/gtcv-assist for a
// draft. It does three things and deliberately nothing else: it calls the
// route, it shows what came back, and it offers Accept or Discard.
//
// THE POINT OF THE ACCEPT STEP. A draft is a suggestion from something that
// has read only what it was handed. It is not evidence and it is not a
// decision. Nothing here writes to any table. Accept hands the text back
// through onAccept and the calling surface decides what to do with it, which
// keeps the judgement with the coach and keeps this component reusable across
// surfaces that store completely different things.
//
// The draft is shown in an editable box on purpose. A coach who wants to
// change one sentence before accepting should not have to discard the whole
// thing and start again, and the text they accept is the text they see.
//
// USAGE
//   <AssistPanel
//     clientId={clientId}
//     task="synthesise_interviews"
//     payload={{ interviews }}
//     title="Synthesise the interviews"
//     description="Reads the captures and reports what converges, what shows budget, and what is still unproven."
//     onAccept={(text) => setSynthesis(text)}
//     disabled={!canManage}
//   />
//
// PROPS
//   clientId     required, the engagement the material belongs to
//   task         one of synthesise_interviews, draft_proposition,
//                summarise_evidence
//   payload      the material to work from, or a function returning it, so a
//                surface can gather it at the moment of asking
//   title        the button and heading text
//   description  one line telling the coach what they will get
//   onAccept     called with the final text when the coach accepts
//   onDiscard    optional, called when the coach discards
//   disabled     read only surfaces pass true
// ============================================================
import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── design tokens (mirror the coach dashboard) ──────────────
const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', white: 'var(--cv-card)',
  slate: 'var(--cv-slate)', border: 'var(--cv-border)', teal: 'var(--cv-teal)',
  red: 'var(--cv-red)', green: 'var(--cv-green)', amber: 'var(--cv-amber)',
}
const mono = { fontFamily: 'var(--cv-font-mono)' }
const hint = { fontSize: '0.88rem', color: C.slate, lineHeight: 1.45 }
const btn = (col, solid) => ({
  ...mono, fontSize: '0.86rem', fontWeight: 600, padding: '0.4rem 0.9rem',
  border: `1px solid ${col}`, borderRadius: 7,
  background: solid ? col : 'transparent',
  color: solid ? 'var(--cv-on-accent)' : col,
  cursor: 'pointer', opacity: 1,
})

export default function AssistPanel({
  clientId,
  task,
  payload,
  title = 'Draft with assistance',
  description = '',
  onAccept,
  onDiscard,
  disabled = false,
}) {
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const request = useCallback(async () => {
    if (busy || disabled || !clientId) return
    setBusy(true); setError(null)

    // Resolve the payload at the moment of asking, so a surface can pass a
    // function and send whatever is on screen right now rather than whatever
    // was on screen when the panel rendered.
    let material
    try {
      material = typeof payload === 'function' ? payload() : payload
    } catch {
      setBusy(false); setError('Could not gather the material to work from.'); return
    }

    try {
      const { data } = await supabase.auth.getSession()
      const token = data && data.session ? data.session.access_token : null
      const res = await fetch('/api/gtcv-assist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ clientId, task, payload: material }),
      })
      const out = await res.json().catch(() => ({}))
      setBusy(false)
      if (!res.ok) { setError(out && out.error ? out.error : 'The draft could not be generated.'); return }
      setDraft(out.draft || '')
    } catch {
      setBusy(false)
      setError('The draft could not be generated. Please try again.')
    }
  }, [busy, disabled, clientId, task, payload])

  function accept() {
    const text = (draft || '').trim()
    if (!text) return
    if (typeof onAccept === 'function') onAccept(text)
    setDraft(null)
  }

  function discard() {
    setDraft(null)
    setError(null)
    if (typeof onDiscard === 'function') onDiscard()
  }

  return (
    <div style={{
      border: `1px solid var(--cv-border-soft)`, borderRadius: 10,
      background: 'var(--cv-bg-2)', padding: '0.85rem 1rem', marginTop: '0.9rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...mono, fontSize: '0.78rem', letterSpacing: '0.09em', textTransform: 'uppercase', color: C.slate }}>
            Assistance
          </div>
          <div style={{ fontWeight: 700, color: C.navy, marginTop: '0.15rem' }}>{title}</div>
          {description && <div style={{ ...hint, marginTop: '0.2rem', maxWidth: '92ch' }}>{description}</div>}
        </div>
        {!draft && (
          <button type="button" style={{ ...btn(C.cyan), opacity: disabled || busy ? 0.55 : 1 }}
            disabled={disabled || busy} onClick={request}>
            {busy ? 'Drafting' : title}
          </button>
        )}
      </div>

      {disabled && (
        <div style={{ ...hint, marginTop: '0.5rem' }}>Read only. Assistance is available to whoever manages this engagement.</div>
      )}

      {error && (
        <div style={{ ...hint, marginTop: '0.55rem', color: C.red }}>{error}</div>
      )}

      {draft !== null && (
        <div style={{ marginTop: '0.75rem' }}>
          <div style={{
            display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
            borderLeft: `3px solid ${C.amber}`, background: C.white,
            borderRadius: 6, padding: '0.5rem 0.7rem', marginBottom: '0.55rem',
          }}>
            <span style={{ ...mono, fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.amber, fontWeight: 700, paddingTop: '0.12rem', whiteSpace: 'nowrap' }}>
              Draft
            </span>
            <span style={{ ...hint, color: C.navy }}>
              Nothing has been saved. This was written only from the material on this screen, so
              read it against what you know before you accept it. Edit it here if one line is
              wrong. Discard it if it is not right.
            </span>
          </div>

          <textarea
            aria-label={`${title}, draft to read and edit before accepting`}
            style={{
              width: '100%', minHeight: 200, padding: '0.6rem 0.7rem',
              border: `1px solid ${C.border}`, borderRadius: 8, background: C.white,
              color: C.navy, fontSize: '0.92rem', fontFamily: 'inherit', lineHeight: 1.55,
              boxSizing: 'border-box', resize: 'vertical',
            }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" style={btn(C.teal, true)} onClick={accept} disabled={!(draft || '').trim()}>
              Accept
            </button>
            <button type="button" style={btn(C.slate)} onClick={discard}>Discard</button>
            <button type="button" style={btn(C.cyan)} disabled={busy} onClick={request}>
              {busy ? 'Drafting' : 'Draft again'}
            </button>
            <span style={{ ...hint, fontSize: '0.82rem' }}>
              Accepting hands the text to this surface. It is still yours to change afterwards.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
