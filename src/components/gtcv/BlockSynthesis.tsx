// @ts-nocheck
'use client'
// ============================================================
// BLOCK SYNTHESIS
//
// Between sessions the coach writes up what a gate established: what the
// evidence supports, what it does not, and what the organisation decided.
// That write up is the thing a funder reads and the thing the next gate
// builds on, so it belongs in the record rather than in a document nobody
// else can find. It is stored on the gate itself, in evidence_summary.
//
// WHY THE ASSISTANCE SITS HERE AND NOWHERE ELSE. Assistance is offered at the
// point where the coach is doing synthesis, because that is the friction:
// reading twelve interview captures and finding what converges is slow, and
// slow work between sessions is what makes an engagement drift. The draft is
// never saved by the assistance. It lands in the box below, the coach edits
// it, and the coach presses Save. Nothing reaches the record without a person
// putting it there, which is the whole point of a method built on evidence.
//
// What is offered depends on the block, because the material differs:
//   every block   summarise the evidence recorded against this gate
//   dp02          synthesise the customer conversations
//   dp03          draft the value proposition from the segment work
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AssistPanel from './AssistPanel'

const C = {
  card: 'var(--cv-card)', border: 'var(--cv-border)', slate: 'var(--cv-slate)',
  navy: 'var(--cv-navy)', teal: 'var(--cv-teal)', green: 'var(--cv-green)',
}
const mono = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' }

export default function BlockSynthesis({ clientId, dpId, canManage }) {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    let off = false
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('canvas_decision_points')
        .select('evidence_summary')
        .eq('client_id', clientId)
        .eq('dp_id', dpId)
        .maybeSingle()
      if (off) return
      const v = data?.evidence_summary || ''
      setText(v); setSaved(v); setLoading(false)
    }
    if (clientId && dpId) load()
    return () => { off = true }
  }, [clientId, dpId])

  // The material is gathered at the moment of asking rather than held in
  // state, so a coach who has just added a capture does not have to reload
  // the page before the draft can see it.
  const gatherEvidence = useCallback(async () => {
    const [{ data: gate }, { data: evidence }] = await Promise.all([
      supabase.from('canvas_decision_points')
        .select('dp_id,label,core_question,commitment,output_required,status')
        .eq('client_id', clientId).eq('dp_id', dpId).maybeSingle(),
      supabase.from('evidence_library')
        .select('reference,date_captured,captured_by,type,description,reliability,status,dp_id')
        .eq('client_id', clientId).order('reference', { ascending: true }),
    ])
    const forGate = (evidence || []).filter((e) => !e.dp_id || e.dp_id === dpId)
    return { gate: gate || { dp_id: dpId }, evidence: forGate }
  }, [clientId, dpId])

  const gatherInterviews = useCallback(async () => {
    const { data } = await supabase
      .from('gtcv_interview_captures')
      .select('*')
      .eq('client_id', clientId)
      .order('sort_order', { ascending: true })
    return { interviews: data || [] }
  }, [clientId])

  const gatherProposition = useCallback(async () => {
    const [{ data: props }, { data: segments }] = await Promise.all([
      supabase.from('gtcv_propositions').select('*').eq('client_id', clientId),
      supabase.from('gtcv_customer_segments').select('*').eq('client_id', clientId),
    ])
    return { propositions: props || [], segments: segments || [] }
  }, [clientId])

  // Accepted drafts are added to what is already there rather than replacing
  // it. A coach who has written three careful paragraphs should not lose them
  // to one press of Accept.
  const accept = useCallback((draft) => {
    setText((prev) => (prev.trim() ? `${prev.trim()}\n\n${draft}` : draft))
    setNote('Draft added below. Edit it, then press Save to put it in the record.')
  }, [])

  async function save() {
    if (busy || !canManage) return
    setBusy(true); setNote('')
    // An update that matches no row succeeds and changes nothing, so the
    // count is what says whether anything was actually written. Without it a
    // gate that has no row yet reports Saved and loses the text on reload.
    const { data, error } = await supabase
      .from('canvas_decision_points')
      .update({ evidence_summary: text, last_reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('client_id', clientId)
      .eq('dp_id', dpId)
      .select('dp_id')
    setBusy(false)
    if (error) {
      console.error('BlockSynthesis: save failed', error)
      setNote('Could not save. Your text is still here, try again.')
      return
    }
    if (!data || data.length === 0) {
      setNote('This gate has no record yet, so there is nothing to save it against. Open the gate once from the tracker, then save again.')
      return
    }
    setSaved(text)
    setNote('Saved to the gate record.')
  }

  if (loading) return <p style={{ color: C.slate, fontSize: '0.9rem' }}>Loading...</p>

  const dirty = text !== saved

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <AssistPanel
        clientId={clientId}
        task="summarise_evidence"
        payload={gatherEvidence}
        title="Summarise the evidence for this gate"
        description="Reads what is recorded against this gate and writes a pack summary a funder could read on its own, including what the evidence does not cover."
        onAccept={accept}
        disabled={!canManage}
      />

      {dpId === 'dp02' ? (
        <AssistPanel
          clientId={clientId}
          task="synthesise_interviews"
          payload={gatherInterviews}
          title="Synthesise the customer conversations"
          description="Reads the captures and reports what converges across interviews, where a budget was actually named, and what is still unproven."
          onAccept={accept}
          disabled={!canManage}
        />
      ) : null}

      {dpId === 'dp03' ? (
        <AssistPanel
          clientId={clientId}
          task="draft_proposition"
          payload={gatherProposition}
          title="Draft the value proposition"
          description="Works from the segment, the problem in the customer's words, the outcome and the differentiation, and tests whether the differentiation can be proved."
          onAccept={accept}
          disabled={!canManage}
        />
      ) : null}

      <div>
        <label style={{
          ...mono, fontSize: '0.72rem', letterSpacing: '.1em', textTransform: 'uppercase',
          color: C.slate, display: 'block', marginBottom: 6,
        }}>
          What this gate established
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={!canManage}
          rows={10}
          placeholder="What the gate asked, what the evidence supports, what it does not cover, and what happens next."
          style={{
            width: '100%', padding: '0.7rem 0.8rem', borderRadius: 8,
            border: `1px solid ${C.border}`, background: C.card, color: 'inherit',
            fontFamily: "'Segoe UI',system-ui,sans-serif", fontSize: '0.92rem', lineHeight: 1.55,
            resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          {canManage ? (
            <button
              onClick={save}
              disabled={busy || !dirty}
              style={{
                ...mono, fontSize: '0.86rem', fontWeight: 600, padding: '0.42rem 1rem',
                borderRadius: 7, border: `1px solid ${dirty ? C.teal : C.border}`,
                background: dirty ? C.teal : 'transparent',
                color: dirty ? 'var(--cv-on-accent)' : C.slate,
                cursor: busy || !dirty ? 'default' : 'pointer',
              }}
            >
              {busy ? 'Saving...' : dirty ? 'Save to the gate record' : 'Saved'}
            </button>
          ) : null}
          {note ? <span style={{ fontSize: '0.85rem', color: C.slate }}>{note}</span> : null}
        </div>
      </div>
    </div>
  )
}
