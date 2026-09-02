// @ts-nocheck
'use client'
// ============================================================
// WHAT NEEDS YOU
//
// The first thing on the cover, because it is the question a coach opens the
// app to answer. Everything else in the platform is organised by where work
// belongs; this is organised by what is stuck.
//
// WHAT COUNTS AS STUCK. Something waiting on a decision only this person can
// make. A gate signed but not authorised, a proposed mapping nobody has ruled
// on, a claim assembled and unread, a capture written but not submitted, a
// session that was planned for a date now past. Each one is a specific thing
// blocking a specific next step, not a metric.
//
// WHAT IT WILL NOT DO. It will not count work. "Twelve captures recorded" is a
// number, not a prompt, and a screen full of numbers is how a coach learns to
// stop reading a screen. Everything here has an action attached or it is not
// here.
//
// It also says so when nothing is waiting, rather than showing an empty box.
// "Nothing is waiting on you" is a useful answer and the most common one on a
// well-run engagement.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const C = {
  card: 'var(--cv-card)', alt: 'var(--cv-alt)', border: 'var(--cv-border)',
  slate: 'var(--cv-slate)', navy: 'var(--cv-navy)', teal: 'var(--cv-teal)',
  green: 'var(--cv-green)', amber: 'var(--cv-amber)', red: 'var(--cv-red)',
}
const mono = { fontFamily: 'var(--cv-font-mono)' }
const hint = { fontSize: '0.88rem', color: C.slate, lineHeight: 1.5 }

const DP_LABEL = {
  setup: 'the pre-engagement diagnostic', phase_0: 'Phase 0',
  dp01: 'Decision Point 1', dp02: 'Decision Point 2', dp03: 'Decision Point 3',
  dp04: 'Decision Point 4', dp05: 'Decision Point 5', dp06: 'Decision Point 6',
  dp07: 'Decision Point 7', dp08: 'Decision Point 8', dp09: 'Decision Point 9',
  handover: 'the handover',
}
const gateName = (id) => DP_LABEL[id] || id

function daysAgo(iso) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return null
  return Math.floor((Date.now() - then) / 86400000)
}

export default function WhatNeedsYou({ clientId, canManage, onGoTo }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  const load = useCallback(async () => {
    if (!clientId) { setItems([]); setLoading(false); return }
    setLoading(true)
    try {
      // Everything is read at once and assembled here, because a coach asking
      // what needs them is asking one question, not six.
      const [signoffs, mappings, packs, captures, sessions, charter] = await Promise.all([
        supabase.from('gtcv_gate_signoffs').select('dp_id, decision, signed_at').eq('client_id', clientId),
        canManage
          ? supabase.from('deliverable_gate_map').select('id, approved, dp_id').eq('client_id', clientId)
          : Promise.resolve({ data: [] }),
        canManage
          ? supabase.from('engagement_invoice_packs').select('id, reference, status').eq('client_id', clientId)
          : Promise.resolve({ data: [] }),
        supabase.from('gtcv_interview_captures').select('id, status, captured_at').eq('client_id', clientId),
        supabase.from('gtcv_sessions').select('id, title, dp_id, planned_date, held_date, status').eq('client_id', clientId),
        supabase.from('engagement_charters')
          .select('id, version, status').eq('client_id', clientId)
          .order('version', { ascending: false }).limit(1).maybeSingle(),
      ])

      const found = []

      // A gate the Executive Director has signed but the lead consultant has
      // not authorised is the commonest stall in the whole method: the work is
      // done and the next zone is shut.
      const rows = signoffs.data || []
      const signedGates = new Set(rows.filter((r) => r.decision === 'signed').map((r) => r.dp_id))
      const authorised = new Set(rows.filter((r) => r.decision === 'authorised').map((r) => r.dp_id))
      const returned = new Set(rows.filter((r) => r.decision === 'returned').map((r) => r.dp_id))
      for (const dp of signedGates) {
        if (!authorised.has(dp) && !returned.has(dp) && canManage) {
          found.push({
            key: `auth:${dp}`,
            tone: C.amber,
            what: `${gateName(dp)} is signed and waiting on you to open the next zone.`,
            why: 'Until you authorise it, nobody can start the block after this one.',
            goTo: dp,
          })
        }
      }
      for (const dp of returned) {
        if (!authorised.has(dp)) {
          found.push({
            key: `ret:${dp}`,
            tone: C.red,
            what: `${gateName(dp)} was returned with a gap named.`,
            why: 'It stays open until the gap is closed and the gate is signed again.',
            goTo: dp,
          })
        }
      }

      // A proposal nobody has ruled on. It counts towards nothing and it
      // blocks any claim that would have used it.
      const pending = (mappings.data || []).filter((m) => !m.approved)
      if (pending.length > 0) {
        found.push({
          key: 'map',
          tone: C.amber,
          what: `${pending.length} proposed gate ${pending.length === 1 ? 'mapping is' : 'mappings are'} waiting on you.`,
          why: 'A proposal counts towards nothing until you approve, edit or reject it, and a claim cannot be built on one. Deliverables live in your own business area, not on this screen.',
        })
      }

      // A claim assembled and unread. The work is done and the money is not
      // moving, which is the most expensive kind of stuck.
      const drafts = (packs.data || []).filter((p) => p.status === 'draft')
      if (drafts.length > 0) {
        found.push({
          key: 'claim',
          tone: C.amber,
          what: `${drafts.length} ${drafts.length === 1 ? 'claim is' : 'claims are'} assembled and unread.`,
          why: 'Nothing is sent until you read the pack and approve it. Claims live in your own business area, not on this screen.',
        })
      }
      const approvedUnsent = (packs.data || []).filter((p) => p.status === 'approved')
      if (approvedUnsent.length > 0) {
        found.push({
          key: 'send',
          tone: C.teal,
          what: `${approvedUnsent.length} approved ${approvedUnsent.length === 1 ? 'claim has' : 'claims have'} not gone out.`,
          why: 'Approved and still sitting here. Claims live in your own business area, not on this screen.',
        })
      }

      // A capture written and never submitted is a conversation that counts
      // nowhere, and the thirty minute rule means it will only get vaguer.
      const capDrafts = (captures.data || []).filter((c) => c.status !== 'submitted')
      if (capDrafts.length > 0) {
        const oldest = capDrafts
          .map((c) => daysAgo(c.captured_at))
          .filter((n) => n !== null)
          .sort((a, b) => b - a)[0]
        found.push({
          key: 'cap',
          tone: oldest !== undefined && oldest >= 1 ? C.red : C.amber,
          what: `${capDrafts.length} customer ${capDrafts.length === 1 ? 'conversation is' : 'conversations are'} still in draft.`,
          why: oldest !== undefined && oldest >= 1
            ? `The oldest has been open ${oldest} ${oldest === 1 ? 'day' : 'days'}. A capture written from memory is worth less than one written in the room.`
            : 'A draft counts towards nothing. It is not evidence until it is submitted.',
          goTo: 'dp02',
        })
      }

      // A session planned for a date that has passed and never marked as held.
      const today = new Date().toISOString().slice(0, 10)
      const overdue = (sessions.data || []).filter((s) =>
        s.planned_date && s.planned_date < today && !s.held_date && s.status !== 'cancelled' && s.status !== 'done')
      if (overdue.length > 0) {
        found.push({
          key: 'sess',
          tone: C.amber,
          what: `${overdue.length} planned ${overdue.length === 1 ? 'session has' : 'sessions have'} passed without being marked as held.`,
          why: 'Either it happened and needs recording, or it did not and the plan has slipped.',
          goTo: 'sessions',
        })
      }

      // A Charter sitting in draft is an engagement nobody has agreed to yet.
      const ch = charter.data
      if (ch && ch.status === 'draft' && canManage) {
        found.push({
          key: 'charter',
          tone: C.amber,
          what: `The Charter is still a draft at version ${ch.version}.`,
          why: 'It cannot be signed until you issue it, and nothing is agreed until it is signed.',
          goTo: 'charter',
        })
      }

      setItems(found)
      setErr(null)
    } catch (e) {
      console.error('WhatNeedsYou: load failed', e)
      setErr('Could not work out what is waiting. What you see below may be incomplete.')
    } finally {
      setLoading(false)
    }
  }, [clientId, canManage])

  useEffect(() => { load() }, [load])

  if (loading) return null

  return (
    <div style={{
      border: `1px solid ${items.length ? C.amber : C.border}`, borderRadius: 12,
      padding: '0.95rem 1.1rem', background: C.card, marginBottom: '1.1rem',
    }}>
      <div style={{ ...mono, fontSize: '0.78rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
        What needs you
      </div>

      {err ? <div style={{ color: C.red, fontSize: '0.95rem', marginTop: '0.5rem' }}>{err}</div> : null}

      {items.length === 0 ? (
        <p style={{ ...hint, margin: '0.45rem 0 0' }}>
          Nothing is waiting on you. Every gate that has been signed has been authorised, no proposal
          or claim is sitting unread, and no conversation is stuck in draft.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.7rem' }}>
          {items.map((i) => (
            <div key={i.key} style={{
              borderLeft: `3px solid ${i.tone}`, background: C.alt,
              borderRadius: '0 9px 9px 0', padding: '0.55rem 0.8rem',
              display: 'flex', gap: '0.7rem', justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap',
            }}>
              <div style={{ flex: '1 1 320px', minWidth: 240 }}>
                <div style={{ fontSize: '0.98rem', color: C.navy, fontWeight: 600 }}>{i.what}</div>
                <div style={{ ...hint, marginTop: 2 }}>{i.why}</div>
              </div>
              {onGoTo && i.goTo ? (
                <button
                  type="button"
                  onClick={() => onGoTo(i.goTo)}
                  style={{
                    ...mono, fontSize: '0.82rem', fontWeight: 600, padding: '0.32rem 0.75rem',
                    border: `1px solid ${i.tone}`, borderRadius: 7, background: 'transparent',
                    color: i.tone, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >Open it</button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
