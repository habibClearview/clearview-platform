// @ts-nocheck
'use client'
// ============================================================
// WHAT THIS ENGAGEMENT STILL NEEDS BEFORE IT IS SET UP
//
// Habib, 17 September 2026: "why is the engagement set up not showing that
// ikore has been setup - what more does it need to be set up - contract was
// uploaded, invitations has been sent to people, what else does it need for
// the status to show that the engagement has been set up?"
//
// A fair question with nowhere to look for the answer. The stage an engagement
// shows is a field somebody sets by hand, so the platform knew what was
// outstanding and never said. The three things are in the method's own
// pre-engagement brief; the arithmetic is in src/lib/engagement-setup.ts,
// where it can be tested, and this only draws it.
//
// It does not change the stage by itself. Deciding an engagement has begun is
// a judgement, and the platform's job here is to stop that judgement being
// made from memory.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { setupState } from '@/lib/engagement-setup'
import { onSolid } from '@/lib/ink'

const C = {
  navy: 'var(--cv-navy)', slate: 'var(--cv-slate)', teal: 'var(--cv-teal)',
  green: 'var(--cv-green)', amber: 'var(--cv-amber)', border: 'var(--cv-border)',
  card: 'var(--cv-card)', red: 'var(--cv-red)',
}
const mono = { fontFamily: 'var(--cv-font-mono)' }
const hint = { fontSize: '1.01rem', color: C.slate, lineHeight: 1.45 }

export default function SetupChecklist({ clientId, onGoTo }) {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  const load = useCallback(async () => {
    if (!clientId) { setLoading(false); return }
    setLoading(true)
    try {
      const [pRes, cRes] = await Promise.all([
        supabase.from('engagement_parties').select('id,name,email,is_signatory').eq('client_id', clientId),
        supabase.from('engagement_charters').select('id,status,issued_at')
          .eq('client_id', clientId).order('version', { ascending: false }).limit(1),
      ])
      if (pRes.error || cRes.error) throw new Error('read failed')
      const charter = (cRes.data || [])[0] || null
      const sRes = charter
        ? await supabase.from('charter_signatures').select('charter_id,party_id,signed_at').eq('charter_id', charter.id)
        : { data: [] }

      // The deliverables come through the server, which is the only thing that
      // can see them. A failure there is not a reason to hide the other two.
      let deliverables = []
      try {
        const { data: auth } = await supabase.auth.getSession()
        const token = auth.session?.access_token
        const res = await fetch(`/api/deliverables?clientId=${encodeURIComponent(clientId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const json = await res.json().catch(() => ({}))
        if (res.ok) deliverables = json.deliverables || []
      } catch { /* the other two still stand */ }

      setState(setupState({
        parties: pRes.data || [],
        charter,
        signatures: sRes.data || [],
        deliverables,
      }))
      setErr(null)
    } catch {
      setErr('The setup checklist could not be read just now. Nothing is wrong with the engagement, this is a connection problem.')
    }
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ ...hint, marginBottom: '1.1rem' }}>Checking what this engagement still needs...</div>
  if (err) return <div style={{ ...hint, color: C.red, marginBottom: '1.1rem' }}>{err}</div>
  if (!state) return null

  const tone = state.done ? C.green : C.amber

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${tone}`,
      borderRadius: 12, padding: '0.9rem 1.1rem', marginBottom: '1.25rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
        <span style={{ ...mono, fontSize: '0.8rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: C.slate }}>
          Is this engagement set up
        </span>
        <span style={{ fontFamily: 'var(--cv-font)', fontWeight: 700, color: tone }}>
          {state.done ? 'Yes, all three' : `${state.finished} of 3`}
        </span>
      </div>

      <p style={{ ...hint, margin: '0.4rem 0 0.7rem', maxWidth: '78ch' }}>
        {state.done
          ? 'Everything the method asks for before Decision Point 1 opens is on the record. The stage above is still yours to set.'
          : 'These are the three things the method asks for before Decision Point 1 opens. Uploading the contract and sending invitations are real work, and neither of them is on this list.'}
      </p>

      <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
        {state.steps.map((step) => (
          <li key={step.title} style={{
            display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
            padding: '0.45rem 0', borderTop: `1px solid var(--cv-border-soft)`,
          }}>
            <span aria-hidden style={{
              ...mono, fontSize: '1.01rem', fontWeight: 700,
              color: step.done ? C.green : C.amber, lineHeight: 1.4,
            }}>{step.done ? '✓' : '•'}</span>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <span style={{ fontSize: '1.01rem', color: C.navy, fontWeight: step.done ? 400 : 600 }}>
                {step.title}
              </span>
              <span style={{ display: 'block', ...hint }}>{step.detail}</span>
            </span>
            {!step.done && step.goTo && onGoTo && (
              <button
                type="button"
                onClick={() => onGoTo(step.goTo)}
                style={{
                  ...mono, fontSize: '1.01rem', fontWeight: 700, padding: '0.38rem 0.9rem',
                  border: 'none', borderRadius: 6, background: C.teal, color: onSolid(C.teal),
                  cursor: 'pointer', flexShrink: 0,
                }}
              >Go there</button>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
