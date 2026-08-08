// @ts-nocheck
'use client'
// ============================================================
// Coach Quick Reference.
//
// The workbook tab the coach opens before a session: all nine decision
// points on one surface, each with its core question, the session time, and
// the signal that confirms the block is genuinely resolved rather than just
// filled in. The coach guidance is included but only for coach roles, since
// the workbook marks it as not shared with the client team.
//
// Reference only. Nothing here is entered or saved, so it is safe for the
// whole team to open apart from the guidance, which is gated.
// ============================================================
import { useState } from 'react'
import { CANVAS_DECISION_POINTS } from '@/lib/canvas-types'

const C = {
  paper: 'var(--cv-cream, #F3ECDE)',
  card: '#FBF7EE',
  ink: '#1B2A41',
  soft: '#4C5A6B',
  faint: '#8B8272',
  line: 'rgba(27,42,65,.18)',
  teal: '#00767A',
  gold: '#B7791F',
}

export default function CoachQuickReference({ showGuidance = true }) {
  const [open, setOpen] = useState<string | null>(null)
  const points = CANVAS_DECISION_POINTS || []

  return (
    <div style={{ fontFamily: "'Segoe UI',system-ui,sans-serif", color: C.ink }}>
      <h2 style={{ fontFamily: 'Georgia,serif', fontSize: 22, margin: '0 0 4px', fontWeight: 600 }}>
        Coach Quick Reference
      </h2>
      <p style={{ margin: '0 0 18px', color: C.soft, fontSize: 14, maxWidth: '70ch' }}>
        Open this before a session. Each block shows the question it answers, roughly how long it
        takes, and the signal that tells you it is genuinely resolved. A block that is filled in but
        shows no signal is not complete.
      </p>

      {points.length === 0 ? (
        <p style={{ color: C.faint, fontSize: 14 }}>No decision point content is loaded.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {points.map((dp) => {
            const isOpen = open === dp.dp_id
            const components = dp.components || []
            return (
              <div
                key={dp.dp_id}
                style={{
                  background: C.card,
                  border: `1px solid ${C.line}`,
                  borderLeft: `4px solid ${isOpen ? C.teal : C.line}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : dp.dp_id)}
                  style={{
                    width: '100%', textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '14px 16px', cursor: 'pointer', display: 'flex', gap: 12,
                    alignItems: 'baseline', flexWrap: 'wrap', color: C.ink,
                  }}
                >
                  <span style={{
                    fontFamily: 'ui-monospace,monospace', fontSize: 10, fontWeight: 700,
                    letterSpacing: '.06em', color: '#fff', background: C.teal,
                    borderRadius: 4, padding: '3px 8px',
                  }}>{String(dp.dp_id).toUpperCase()}</span>
                  <span style={{ fontFamily: 'Georgia,serif', fontSize: 17, fontWeight: 600 }}>
                    {dp.zone || dp.title || dp.label}
                  </span>
                  {dp.session_time ? (
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: C.faint }}>
                      {dp.session_time}
                    </span>
                  ) : null}
                </button>

                <div style={{ padding: '0 16px 14px' }}>
                  <p style={{ margin: 0, fontStyle: 'italic', fontSize: 14, color: C.soft }}>
                    &quot;{dp.core_question}&quot;
                  </p>

                  {isOpen ? (
                    <div style={{ marginTop: 14 }}>
                      <p style={{
                        fontFamily: 'ui-monospace,monospace', fontSize: 10, letterSpacing: '.14em',
                        textTransform: 'uppercase', color: C.teal, margin: '0 0 8px',
                      }}>The nine components</p>
                      <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {components.map((c) => (
                          <li key={c.id} style={{ fontSize: 13.5, color: C.soft, lineHeight: 1.55 }}>
                            <b style={{ color: C.ink }}>{c.title}</b>
                            {c.action_trigger ? (
                              <div style={{ marginTop: 3 }}><b style={{ color: C.ink }}>Do:</b> {c.action_trigger}</div>
                            ) : null}
                            {c.signal_to_look_for ? (
                              <div style={{ marginTop: 3 }}>
                                <b style={{ color: C.teal }}>Signal:</b> {c.signal_to_look_for}
                              </div>
                            ) : null}
                            {showGuidance && c.coach_guidance ? (
                              <div style={{
                                marginTop: 5, padding: '8px 10px', background: 'rgba(183,121,31,.10)',
                                border: `1px solid rgba(183,121,31,.3)`, borderRadius: 8, fontSize: 12.5,
                              }}>
                                <b style={{ color: C.gold }}>Coach only:</b> {c.coach_guidance}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : (
                    <p style={{ margin: '8px 0 0', fontSize: 12.5, color: C.faint }}>
                      {components.length} components. Open to read them.
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p style={{ marginTop: 22, fontSize: 12, color: C.faint, fontFamily: 'Georgia,serif' }}>
        Grant-to-Commercial Viability Canvas&trade; · The Canvas Coach · habibonifade.com
      </p>
    </div>
  )
}
