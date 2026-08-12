'use client'
// ============================================================
// THE SERVICE ANCHOR BAR  (C4, C5, C7, C8, C17, C18, C19, C30, C31, C32)
//
// WHY THIS IS ONE BAR AND NOT FIVE HEADINGS. C4 says the current service is
// displayed at the top of the screen, at all times, without scrolling, on all
// five tools without exception. A heading inside each tool satisfies that only
// until somebody scrolls, and then it does not. A bar that stays at the top of
// the block satisfies it on every tool at once, including tools written later,
// and it cannot be forgotten on one of them.
//
// It is the only place the service is chosen, so the five tools below cannot
// disagree about which service the room is working on.
//
// WHY THE COUNTER LIVES HERE TOO. C30's five figures are about the service, and
// a figure that scrolls away while the room argues is a figure nobody uses.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { authedFetch } from '@/lib/authed-fetch'
import {
  COUNTER_LABELS,
  counterForPortfolio,
  counterForService,
  parkedActivities,
  type Activity,
  type Problem,
  type Service,
} from '@/lib/service-anchor'

const C = {
  navy: '#1B2A41', slate: '#4C5A6B', border: 'rgba(27,42,65,.16)',
  teal: '#2A9D8F', amber: '#D98C1F', tint: '#FBF7EE', card: '#FFFFFF',
}
const mono = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' }
const sans = "'Segoe UI',system-ui,sans-serif"

const STATES: { value: string; label: string }[] = [
  { value: 'current', label: 'Current' },
  { value: 'redesigned', label: 'Redesigned' },
  { value: 'new', label: 'New' },
]

export default function ServiceAnchorBar({
  clientId, canManage,
}: { clientId: string; canManage: boolean }) {
  const [services, setServices] = useState<Service[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [problems, setProblems] = useState<Problem[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [showParked, setShowParked] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!clientId) return
    try {
      const res = await authedFetch(`/api/services?clientId=${encodeURIComponent(clientId)}`, { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      setServices(json.services || [])
      setActivities(json.activities || [])
      setProblems(json.problems || [])
      setCurrentId(json.currentServiceId || null)
    } catch {
      /* Nothing arrives, nothing changes on screen. */
    }
  }, [clientId])

  // C32. The counts move as decisions are made, with no reload. Three seconds
  // is fast enough that a room never notices, and slow enough that a table
  // being typed into is not fighting a redraw.
  useEffect(() => {
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [load])

  const act = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true)
    try {
      await authedFetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, ...payload }),
      })
      await load()
    } catch {
      /* The next read will show whether it landed. */
    }
    setBusy(false)
  }, [clientId, load])

  // C5. The selection the whole block follows. Where nothing has been chosen,
  // the first service stands in, so the tools below are never anchored to
  // nothing on a block that plainly has services.
  const current = useMemo(
    () => services.find((s) => s.id === currentId) || services[0] || null,
    [services, currentId],
  )

  const parked = useMemo(() => parkedActivities(activities), [activities])
  const counter = useMemo(
    () => (current ? counterForService(current.id, activities, problems)
      : { startedWith: 0, noProblemStated: 0, killed: 0, paused: 0, carriedForward: 0 }),
    [current, activities, problems],
  )
  // C31. Same function, same rows, so the two cannot disagree.
  const portfolio = useMemo(() => counterForPortfolio(activities, problems), [activities, problems])

  return (
    <div style={{
      // C4. Stays at the top through all five tools. This is the whole reason
      // the bar exists rather than five headings.
      position: 'sticky', top: 0, zIndex: 20,
      background: C.tint, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: '10px 14px', fontFamily: sans,
      boxShadow: '0 2px 10px rgba(27,42,65,.06)',
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{
          ...mono, fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate,
        }}>Service</span>

        {services.length === 0 ? (
          <span style={{ fontSize: 15, color: C.slate }}>
            No service yet. Add one, and the five tools below will work inside it.
          </span>
        ) : (
          <>
            {/* C5. Changing this changes what every tool below shows. */}
            <select
              value={current?.id || ''}
              disabled={!canManage}
              onChange={(e) => { setCurrentId(e.target.value); act({ action: 'setCurrentService', serviceId: e.target.value }) }}
              aria-label="Which service the room is working on"
              style={{
                fontFamily: 'Georgia,serif', fontSize: 18, fontWeight: 600, color: C.navy,
                border: `1px solid ${C.border}`, borderRadius: 8, padding: '4px 8px',
                background: C.card, maxWidth: '26rem',
              }}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.service_name || 'Unnamed service'}</option>
              ))}
            </select>

            {/* C19. Changeable at any time, never fixed at creation. */}
            <select
              value={current?.service_state || 'current'}
              disabled={!canManage || !current}
              onChange={(e) => act({ action: 'setServiceState', id: current?.id, serviceState: e.target.value })}
              aria-label="Is this service current, redesigned or new"
              style={{
                ...mono, fontSize: 12, color: C.navy, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: '4px 8px', background: C.card,
              }}
            >
              {STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </>
        )}

        {canManage ? (
          adding ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!newName.trim()) return
                act({ action: 'addService', name: newName.trim() })
                setNewName(''); setAdding(false)
              }}
              style={{ display: 'inline-flex', gap: 6 }}
            >
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name of the service"
                aria-label="Name of the service"
                autoFocus
                style={{
                  fontSize: 14, padding: '5px 8px', borderRadius: 8,
                  border: `1px solid ${C.border}`, background: C.card, color: C.navy,
                }}
              />
              <button type="submit" disabled={busy} style={pill(C.teal, true)}>Add</button>
              <button type="button" onClick={() => setAdding(false)} style={pill(C.slate, false)}>Cancel</button>
            </form>
          ) : (
            // C8, C17. Added at any time, and it can start empty.
            <button type="button" onClick={() => setAdding(true)} style={pill(C.teal, false)}>
              Add a service
            </button>
          )
        ) : null}
      </div>

      {/* C30. The five figures for this service. C31 has them for the whole
          engagement beside them, computed from the same rows so they cannot
          disagree. Never across engagements: one client's figures in front of
          another would be a serious fault. */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
        <Figure label={COUNTER_LABELS.startedWith} n={counter.startedWith} all={portfolio.startedWith} />
        <Figure label={COUNTER_LABELS.noProblemStated} n={counter.noProblemStated} all={portfolio.noProblemStated} amber />
        <Figure label={COUNTER_LABELS.killed} n={counter.killed} all={portfolio.killed} />
        <Figure label={COUNTER_LABELS.paused} n={counter.paused} all={portfolio.paused} />
        <Figure label={COUNTER_LABELS.carriedForward} n={counter.carriedForward} all={portfolio.carriedForward} />
      </div>

      {/* C7. The bucket is visible as its own area, not hidden somewhere else.
          It appears only when it holds something, because an empty bucket on
          every block is noise. */}
      {parked.length > 0 ? (
        <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
          <button
            type="button"
            onClick={() => setShowParked((v) => !v)}
            style={{
              ...mono, fontSize: 12, color: C.amber, background: 'transparent',
              border: 'none', padding: 0, cursor: 'pointer',
            }}
          >
            {showParked ? '▾' : '▸'} Parked — {parked.length} not in any service
          </button>
          {showParked ? (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {parked.map((a) => (
                <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, color: C.navy }}>{a.activity || 'Unnamed activity'}</span>
                  {/* C15. Pulled into any service, including one made after it
                      was parked. It arrives complete, because its problems hang
                      off it and were never separated from it. */}
                  {canManage && services.length > 0 ? (
                    <select
                      value=""
                      disabled={busy}
                      onChange={(e) => { if (e.target.value) act({ action: 'moveMany', serviceId: e.target.value, activityIds: [a.id] }) }}
                      aria-label={`Move ${a.activity || 'this activity'} into a service`}
                      style={{ ...mono, fontSize: 11.5, padding: '2px 6px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card }}
                    >
                      <option value="">Pull into a service...</option>
                      {services.map((s) => <option key={s.id} value={s.id}>{s.service_name || 'Unnamed service'}</option>)}
                    </select>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** One figure, with the whole engagement's number beside it where they differ. */
function Figure({ label, n, all, amber }: { label: string; n: number; all: number; amber?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ ...mono, fontSize: 17, fontWeight: 700, color: amber && n > 0 ? C.amber : C.navy }}>{n}</span>
      <span style={{ fontSize: 11.5, color: C.slate }}>{label}</span>
      {all !== n ? (
        <span style={{ ...mono, fontSize: 10.5, color: C.slate }} title="All services in this engagement">
          ({all} in all)
        </span>
      ) : null}
    </span>
  )
}

function pill(colour: string, solid: boolean): React.CSSProperties {
  return {
    ...mono, fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 7,
    border: `1px solid ${colour}`, background: solid ? colour : 'transparent',
    color: solid ? '#FFFFFF' : colour, cursor: 'pointer',
  }
}
