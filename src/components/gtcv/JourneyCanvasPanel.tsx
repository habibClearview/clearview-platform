'use client'
// ============================================================
// THE JOURNEY CANVAS ON SCREEN  (PART K, C67 to C70)
//
// C67/C68  every gate renders what was decided, the evidence it rests on, who
//          agreed, who dissented and who signed — and it UPDATES LIVE, so a
//          room watching it sees a decision appear as it is taken.
// C69      a DATED FIXED VERSION for printing and handover.
// C70      where authors were hidden, dissent shows WITHOUT the name.
//
// WHY "FIX A VERSION" EXISTS AT ALL. A live canvas is the right thing during a
// session and the wrong thing to print: the page can change between the
// preview and the paper, and two copies in a room with no way to say which is
// later is exactly the confusion a handover pack must not create. Fixing takes
// a copy, stops the polling, stamps the moment on it, and prints THAT.
//
// C66 is honoured here too: an agreed answer folds away the submissions behind
// it, using the same remembered folding as the five tools.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authedFetch } from '@/lib/authed-fetch'
import { fixedVersionStamp, NAME_WITHHELD, NOTHING_DECIDED_YET, type GateLine } from '@/lib/journey-canvas'
import { useCollapse } from '@/components/gtcv/useCollapse'

const C = {
  navy: 'var(--cv-navy)', slate: 'var(--cv-slate)', faint: 'var(--cv-faint)',
  card: 'var(--cv-card)', alt: 'var(--cv-alt)', border: 'var(--cv-border)',
  borderSoft: 'var(--cv-border-soft)', teal: 'var(--cv-teal)', green: 'var(--cv-green)',
  amber: 'var(--cv-amber)', red: 'var(--cv-red)', tintAmber: 'var(--cv-tint-amber)',
  tintGreen: 'var(--cv-tint-green)', tintCyan: 'var(--cv-tint-cyan)',
}
const mono = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' }
const wrap = { fontFamily: "'Segoe UI',system-ui,-apple-system,sans-serif", color: C.navy }

function btn(colour: string, solid = false): React.CSSProperties {
  return {
    ...mono, fontSize: '0.78rem', fontWeight: 600, padding: '0.32rem 0.7rem',
    border: `1px solid ${colour}`, borderRadius: 7,
    background: solid ? colour : 'transparent',
    color: solid ? 'var(--cv-on-accent)' : colour, cursor: 'pointer',
  }
}

function when(at: string | null): string {
  if (!at) return ''
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function JourneyCanvasPanel({ clientId }: { clientId: string }) {
  const [gates, setGates] = useState<GateLine[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // C69. When this holds something, the screen is showing a FIXED copy and the
  // live polling has stopped. Two states, never a live view pretending to be
  // fixed or the other way about.
  const [fixed, setFixed] = useState<{ gates: GateLine[]; stamp: string } | null>(null)
  const printRef = useRef<HTMLDivElement | null>(null)
  const fold = useCollapse(clientId)

  const load = useCallback(async () => {
    if (!clientId) return
    try {
      const res = await authedFetch(`/api/journey-canvas?clientId=${encodeURIComponent(clientId)}`, { cache: 'no-store' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json?.error || 'Could not load the journey canvas')
        return
      }
      const json = await res.json()
      setGates(json.gates || [])
      setError(null)
    } catch {
      setError('Could not reach the server. What is on screen is the last thing that arrived.')
    }
  }, [clientId])

  // C68. Live. Five seconds is fast enough that a room watching a decision
  // land does not notice the wait, and slow enough not to fight a session.
  // A FIXED version does not poll: that is what fixed means.
  useEffect(() => {
    if (fixed) return
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load, fixed])

  const shown = fixed ? fixed.gates : gates
  const decidedCount = useMemo(
    () => (shown || []).reduce((n, g) => n + g.decisions.length, 0),
    [shown],
  )

  if (!clientId) return <div style={{ ...wrap, color: C.faint }}>Select an engagement to see its journey canvas.</div>
  if (!shown) return <div style={{ ...wrap, color: C.faint }}>Loading the journey canvas...</div>

  return (
    <div style={wrap}>
      {/* The print rules live with the thing they print. Everything outside the
          canvas is dropped, and a gate is not split across two pages. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #journey-canvas-print, #journey-canvas-print * { visibility: visible; }
          #journey-canvas-print { position: absolute; left: 0; top: 0; width: 100%; }
          .journey-no-print { display: none !important; }
          .journey-gate { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="journey-no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <div style={{ ...mono, fontSize: '0.78rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: C.teal }}>Part K</div>
          <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.45rem', fontWeight: 700 }}>Journey Canvas</div>
          <div style={{ fontSize: '0.95rem', color: C.slate, maxWidth: '80ch', marginTop: '0.25rem' }}>
            Every gate, what was decided at it, the evidence it rests on, who agreed, who dissented and who signed.
            {fixed ? ' This is a fixed copy and is not updating.' : ' It updates as decisions are taken.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          {fixed ? (
            <>
              <button type="button" style={btn(C.teal, true)} onClick={() => window.print()}>Print this version</button>
              <button type="button" style={btn(C.slate)} onClick={() => setFixed(null)}>Back to the live canvas</button>
            </>
          ) : (
            // C69. Take the copy FIRST, stamp it, then print, so what is on the
            // paper is what was on the screen when the button was pressed.
            <button
              type="button"
              style={btn(C.teal, true)}
              onClick={() => setFixed({ gates: gates || [], stamp: fixedVersionStamp(new Date()) })}
            >
              Fix a version for printing
            </button>
          )}
        </div>
      </div>

      {error && !fixed ? (
        <div className="journey-no-print" style={{ border: `1px solid ${C.amber}`, background: C.tintAmber, borderRadius: 8, padding: '0.6rem 0.8rem', marginBottom: '0.9rem', fontSize: '0.9rem' }}>
          {error}
        </div>
      ) : null}

      <div id="journey-canvas-print" ref={printRef}>
        {/* C69. A fixed version that does not say when it was fixed cannot be
            told from a stale live one. */}
        {fixed ? (
          <div style={{ border: `2px solid ${C.navy}`, borderRadius: 10, padding: '0.7rem 0.9rem', marginBottom: '1rem', background: C.alt }}>
            <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.05rem', fontWeight: 700 }}>{fixed.stamp}</div>
            <div style={{ fontSize: '0.88rem', color: C.slate, marginTop: '0.15rem' }}>
              Fixed for printing and handover. It does not change. The live canvas may have moved on since.
            </div>
          </div>
        ) : null}

        {decidedCount === 0 ? (
          <div style={{ fontSize: '0.95rem', color: C.slate, border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: '0.9rem 1rem' }}>
            {NOTHING_DECIDED_YET}
          </div>
        ) : null}

        {shown.map((gate) => (
          <div
            key={gate.id}
            className="journey-gate"
            style={{
              border: `1px solid ${gate.empty ? C.borderSoft : C.border}`,
              borderRadius: 10, marginBottom: '0.8rem', overflow: 'hidden',
              opacity: gate.empty ? 0.75 : 1,
            }}
          >
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', background: C.alt, padding: '0.5rem 0.8rem', borderBottom: gate.empty ? 'none' : `1px solid ${C.borderSoft}` }}>
              <span style={{ ...mono, fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: C.slate }}>
                {gate.isBlock ? 'Block' : 'Step'}
              </span>
              <span style={{ fontFamily: 'Georgia,serif', fontSize: '1.02rem', fontWeight: 700 }}>{gate.label}</span>
              {gate.empty ? (
                <span style={{ ...mono, fontSize: '0.74rem', color: C.faint }}>nothing yet</span>
              ) : (
                <span style={{ ...mono, fontSize: '0.74rem', color: C.slate }}>
                  {gate.decisions.length} decision{gate.decisions.length === 1 ? '' : 's'}
                  {gate.evidence.length ? `, ${gate.evidence.length} evidence` : ''}
                  {gate.signoffs.length ? `, ${gate.signoffs.length} signed` : ''}
                </span>
              )}
            </div>

            {gate.empty ? null : (
              <div style={{ padding: '0.6rem 0.8rem 0.7rem' }}>
                {/* ─── WHAT WAS DECIDED ─── */}
                {gate.decisions.map((d) => {
                  const open = !fold.is('answer', d.id)
                  return (
                    <div key={d.id} style={{ borderLeft: `3px solid ${C.teal}`, paddingLeft: '0.6rem', marginBottom: '0.6rem' }}>
                      <div style={{ fontSize: '0.88rem', color: C.slate }}>{d.question}</div>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: C.navy, marginTop: '0.1rem' }}>
                        {d.agreed || <span style={{ color: C.amber, fontWeight: 400 }}>Discussed, nothing agreed</span>}
                      </div>
                      <div style={{ ...mono, fontSize: '0.72rem', color: C.faint, marginTop: '0.12rem' }}>
                        {d.at ? `Agreed ${when(d.at)}` : 'Not yet agreed'}
                        {d.recordedBy ? ` · recorded by ${d.recordedBy}` : ''}
                      </div>

                      {/* C66. The submissions behind the agreed answer fold away. */}
                      <button
                        type="button"
                        className="journey-no-print"
                        onClick={() => fold.toggle('answer', d.id)}
                        aria-expanded={open}
                        style={{ ...mono, fontSize: '0.72rem', color: C.slate, background: 'transparent', border: 'none', padding: '0.2rem 0 0', cursor: 'pointer' }}
                      >
                        {open ? '▾' : '▸'} {d.submissionCount} answer{d.submissionCount === 1 ? '' : 's'} behind it
                      </button>

                      {open ? (
                        <div style={{ marginTop: '0.2rem', paddingLeft: '0.9rem' }}>
                          {/* C70. Who agreed — names only where the room allowed
                              them. A count is not identifying; four names in a
                              room of five identifies the fifth. */}
                          {d.namesWithheld ? (
                            <div style={{ fontSize: '0.84rem', color: C.slate }}>
                              {d.submissionCount} answered. {NAME_WITHHELD}.
                            </div>
                          ) : d.agreedBy.length ? (
                            <div style={{ fontSize: '0.84rem', color: C.slate }}>
                              Agreed by {d.agreedBy.join(', ')}.
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.84rem', color: C.faint }}>No answers recorded.</div>
                          )}
                        </div>
                      ) : null}

                      {/* ─── WHO DISSENTED. C70 lives here. ─── */}
                      {d.dissent.length ? (
                        <div style={{ marginTop: '0.35rem', border: `1px solid ${C.amber}`, background: C.tintAmber, borderRadius: 7, padding: '0.4rem 0.6rem' }}>
                          <div style={{ ...mono, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: C.navy }}>
                            Dissent, recorded
                          </div>
                          {d.dissent.map((v, i) => (
                            <div key={i} style={{ fontSize: '0.88rem', marginTop: '0.2rem' }}>
                              <span>{v.note}</span>
                              <span style={{ ...mono, fontSize: '0.72rem', color: C.slate }}>
                                {' '}— {v.name ? v.name : NAME_WITHHELD}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}

                {/* ─── THE EVIDENCE IT RESTS ON ─── */}
                {gate.evidence.length ? (
                  <div style={{ marginTop: '0.4rem' }}>
                    <div style={{ ...mono, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: C.slate }}>Evidence</div>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                      {gate.evidence.map((e) => (
                        <span key={e.reference || Math.random()} style={{ ...mono, fontSize: '0.76rem', border: `1px solid ${C.borderSoft}`, borderRadius: 999, padding: '0.16rem 0.55rem', background: C.tintCyan }}>
                          {e.reference || 'unreferenced'}{e.description ? ` · ${e.description}` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* ─── WHO SIGNED ─── */}
                {gate.signoffs.length ? (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ ...mono, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: C.slate }}>Signed</div>
                    {gate.signoffs.map((s, i) => (
                      <div key={i} style={{ fontSize: '0.88rem', marginTop: '0.15rem' }}>
                        <span style={{ fontWeight: 600 }}>{s.signer_name || 'Name not recorded'}</span>
                        <span style={{ color: C.slate }}>
                          {s.signer_role ? ` (${String(s.signer_role).replace(/_/g, ' ')})` : ''}
                          {' — '}
                          <span style={{ color: s.decision === 'returned' ? C.red : C.green, fontWeight: 600 }}>{s.decision || 'signed'}</span>
                          {s.signed_at ? ` ${when(s.signed_at)}` : ''}
                        </span>
                        {s.note ? <div style={{ fontSize: '0.84rem', color: C.slate }}>{s.note}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
