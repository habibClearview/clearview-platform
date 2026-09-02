// @ts-nocheck
'use client'
// ============================================================
// Engagement Tracker.
//
// The workbook calls this the coach's navigation tool and says to open it
// first at every session and update it at the end of every one, even when
// the status has not moved, because the priority action always changes.
//
// One row per decision point: status, a short evidence summary, and the
// priority action for the next session. It writes to the existing
// canvas_decision_points rows, using the three fields added in
// 2026_08_09_gtcv_tracker_fields.sql.
//
// The workbook's standing rule is encoded here: any early block showing
// needs revisiting takes priority over everything downstream, so it is
// surfaced at the top rather than left for the coach to notice.
// ============================================================
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const ORDER = ['setup', 'phase_0', 'dp01', 'dp02', 'dp03', 'dp04', 'dp05', 'dp06', 'dp07', 'dp08', 'dp09', 'handover']

const LABEL = {
  setup: 'Set up and readiness',
  phase_0: 'Phase 0, clear the ground',
  dp01: 'Decision Point 1 Service Reality Audit',
  dp02: 'Decision Point 2 Customer and Problem Clarity',
  dp03: 'Decision Point 3 Value Proposition Architecture',
  dp04: 'Decision Point 4 Commercial Viability Model',
  dp05: 'Decision Point 5 Market Entry Design',
  dp06: 'Decision Point 6 Identity and Partners',
  dp07: 'Decision Point 7 Pilot and Learn',
  dp08: 'Decision Point 8 Scale and Expansion',
  dp09: 'Decision Point 9 · Commercial Readiness Diagnostic',
  handover: 'Handover',
}

const STATUSES = [
  ['not_started', 'Not started'],
  ['in_progress', 'In progress'],
  ['evidence_submitted', 'Evidence submitted'],
  ['complete', 'Complete'],
  ['needs_revisiting', 'Needs revisiting'],
]

const C = {
  card: '#FBF7EE', box: '#FFFDF8', ink: '#1B2A41', soft: '#4C5A6B', faint: '#8B8272',
  line: 'rgba(27,42,65,.18)', lineSoft: 'rgba(27,42,65,.09)',
  teal: '#00767A', gold: '#B7791F', good: '#2E7D32', crit: '#C62828',
}

function statusColour(s) {
  if (s === 'complete') return C.good
  if (s === 'needs_revisiting') return C.crit
  if (s === 'in_progress' || s === 'evidence_submitted') return C.gold
  return C.faint
}

export default function EngagementTracker({ clientId, canManage }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [note, setNote] = useState(null)

  // The cancelled flag matters here because a coach switching between clients
  // can have two reads in flight. Without it the slower one wins and the
  // tracker shows the previous client's gates under the current client's name.
  async function load(cancelled) {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('canvas_decision_points')
        .select('id,dp_id,label,status,evidence_summary,priority_action,last_reviewed_at')
        .eq('client_id', clientId)
      if (cancelled()) return
      if (error) {
        console.error('EngagementTracker: load failed', error)
        setNote('Could not load the tracker. Try again.')
        return
      }
      setNote(null)
      const byDp = new Map((data || []).map((r) => [r.dp_id, r]))
      setRows(ORDER.map((dp) => byDp.get(dp) || {
        id: `${clientId}-${dp}`, dp_id: dp, label: LABEL[dp], status: 'not_started',
        evidence_summary: '', priority_action: '', last_reviewed_at: null,
      }))
    } catch (e) {
      if (cancelled()) return
      console.error('EngagementTracker: load threw', e)
      setNote('Could not load the tracker. Try again.')
    } finally {
      if (!cancelled()) setLoading(false)
    }
  }

  useEffect(() => {
    let off = false
    if (clientId) load(() => off)
    return () => { off = true }
  }, [clientId])

  async function save(row, patch) {
    setSaving(row.dp_id)
    setNote(null)
    const next = { ...row, ...patch }
    setRows((prev) => prev.map((r) => (r.dp_id === row.dp_id ? next : r)))
    const { error } = await supabase.from('canvas_decision_points').upsert({
      id: `${clientId}-${row.dp_id}`,
      client_id: clientId,
      dp_id: row.dp_id,
      label: row.label || LABEL[row.dp_id],
      status: next.status,
      evidence_summary: next.evidence_summary,
      priority_action: next.priority_action,
      last_reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    setSaving(null)
    if (error) setNote('Could not save. ' + error.message)
    else setNote('Saved.')
  }

  if (loading) return <p style={{ color: C.faint, fontSize: 14 }}>Loading the tracker...</p>

  const flagged = rows.filter((r) => r.status === 'needs_revisiting' && ['dp01', 'dp02'].includes(r.dp_id))

  const cell = { padding: '10px 11px', borderTop: `1px solid ${C.lineSoft}`, verticalAlign: 'top', fontSize: 13.5 }
  const input = {
    width: '100%', border: `1px solid ${C.line}`, borderRadius: 7, padding: '7px 9px',
    background: C.box, color: C.ink, fontSize: 13, fontFamily: "var(--cv-font)",
  }

  return (
    <div style={{ fontFamily: "var(--cv-font)", color: C.ink }}>
      <h2 style={{ fontFamily: 'var(--cv-font)', fontSize: 22, margin: '0 0 4px', fontWeight: 600 }}>
        Engagement Tracker
      </h2>
      <p style={{ margin: '0 0 16px', color: C.soft, fontSize: 14, maxWidth: '92ch' }}>
        Open this first at every session and update it at the end of every one, even when the status
        has not moved. The priority action is what changes most.
      </p>

      {flagged.length > 0 ? (
        <div style={{
          background: 'rgba(198,40,40,.10)', border: '1px solid rgba(198,40,40,.35)',
          borderRadius: 12, padding: '12px 15px', marginBottom: 14, fontSize: 13.5,
        }}>
          <b style={{ color: C.crit }}>Priority.</b> {flagged.map((f) => LABEL[f.dp_id]).join(' and ')}{' '}
          {flagged.length === 1 ? 'is' : 'are'} marked needs revisiting. That takes priority over all
          downstream work until it is resolved.
        </div>
      ) : null}

      {note ? (
        <p style={{ fontSize: 13, color: note === 'Saved.' ? C.good : C.crit, margin: '0 0 10px' }}>{note}</p>
      ) : null}

      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%', minWidth: 820, borderCollapse: 'collapse', background: C.card,
          border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden',
        }}>
          <thead>
            <tr>
              {['Block', 'Status', 'Evidence so far', 'Priority action for the next session'].map((h, i) => (
                <th key={h} style={{
                  textAlign: 'left', fontFamily: 'var(--cv-font-mono)', fontSize: 12.5,
                  letterSpacing: '.12em', textTransform: 'uppercase', color: C.faint,
                  padding: '11px', borderBottom: `1px solid ${C.line}`, background: C.box,
                  width: i === 0 ? '22%' : i === 1 ? '16%' : '31%',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.dp_id}>
                <td style={cell}>
                  <span style={{ fontWeight: 600 }}>{LABEL[r.dp_id]}</span>
                  {r.last_reviewed_at ? (
                    <span style={{ display: 'block', fontSize: 12.5, color: C.faint, marginTop: 3 }}>
                      reviewed {new Date(r.last_reviewed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </span>
                  ) : null}
                </td>
                <td style={cell}>
                  <select
                    aria-label={`Status of ${r.label || r.dp_id}`}
                    value={r.status || 'not_started'}
                    disabled={!canManage || saving === r.dp_id}
                    onChange={(e) => save(r, { status: e.target.value })}
                    style={{ ...input, color: statusColour(r.status), fontWeight: 600 }}
                  >
                    {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td style={cell}>
                  <textarea
aria-label="One or two sentences on what exists"                     rows={2}
                    defaultValue={r.evidence_summary || ''}
                    disabled={!canManage}
                    placeholder="One or two sentences on what exists"
                    onBlur={(e) => { if (e.target.value !== (r.evidence_summary || '')) save(r, { evidence_summary: e.target.value }) }}
                    style={{ ...input, resize: 'vertical' }}
                  />
                </td>
                <td style={cell}>
                  <textarea
aria-label="The single next thing that moves this block"                     rows={2}
                    defaultValue={r.priority_action || ''}
                    disabled={!canManage}
                    placeholder="The single next thing that moves this block"
                    onBlur={(e) => { if (e.target.value !== (r.priority_action || '')) save(r, { priority_action: e.target.value }) }}
                    style={{ ...input, resize: 'vertical' }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!canManage ? (
        <p style={{ marginTop: 12, fontSize: 12.5, color: C.faint }}>
          You can read the tracker. Only the lead consultant and the co-implementer can change it.
        </p>
      ) : null}
    </div>
  )
}
