'use client'
// ============================================================
// THE THREE REMOVALS  (C12 to C16)
//
// WHAT WAS THERE BEFORE. One button, marked Delete, which deleted. So the only
// way to get something off a table was to destroy it, and the room's choice
// was between keeping a wrong row forever and losing a real one for good.
// Everything a workshop throws out at ten in the morning it half wants back by
// four in the afternoon.
//
// SO THERE ARE THREE, and C12 says they are named plainly:
//
//   Park                        out of the service, into the bucket, still
//                               there, pullable into any service later
//                               including one created afterwards
//   Move to another service     it belongs somewhere else and always did
//   Delete                      it should never have existed
//
// PARK IS THE DEFAULT AND DELETE IS NEVER IT (C16). The primary button parks.
// Delete is behind one more press and then a confirmation that uses the word.
// A default that destroys is a default that destroys somebody's work in a live
// room, at speed, in front of twenty people, with no way back.
// ============================================================
import { useEffect, useState } from 'react'
import { authedFetch } from '@/lib/authed-fetch'
import { REMOVAL_LABELS, deleteConfirmation } from '@/lib/service-anchor'

const C = {
  slate: '#4C5A6B', border: 'rgba(27,42,65,.16)', amber: '#D98C1F',
  red: '#C0392B', card: '#FFFFFF', navy: '#1B2A41',
}
const mono = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' }

export default function RowActions({
  clientId, activityId, problemId, label, onDone,
}: {
  clientId: string
  /** Exactly one of these two. An activity moves between services; a problem
   *  does not, because it belongs to an activity and travels with it. */
  activityId?: string
  problemId?: string
  /** What this row is called, so the confirmation can name it. */
  label: string
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // Fetched here, and only once the menu is opened, so the table above is not
  // making one request per row just to draw a button nobody pressed.
  const [services, setServices] = useState<{ id: string; service_name: string | null }[]>([])

  useEffect(() => {
    if (!open || services.length > 0) return
    let cancelled = false
    authedFetch(`/api/services?clientId=${encodeURIComponent(clientId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j) setServices(j.services || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open, clientId, services.length])

  const send = async (payload: Record<string, unknown>) => {
    setBusy(true)
    try {
      await authedFetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId, action: 'remove',
          ...(activityId ? { activityId } : { id: problemId }),
          ...payload,
        }),
      })
      onDone()
    } catch {
      /* The next read shows whether it landed. */
    }
    setBusy(false)
    setOpen(false)
  }

  // C15, C16. The press that needs no thought is the one that keeps the work.
  const park = () => send({ removal: 'park' })

  const remove = () => {
    // C13. It asks, and the question uses the word.
    if (typeof window !== 'undefined' && !window.confirm(deleteConfirmation(label || 'this row'))) return
    send({ removal: 'delete' })
  }

  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', position: 'relative' }}>
      <button
        type="button"
        disabled={busy}
        onClick={park}
        title="Out of this service, into the parked bucket. Nothing is lost and it can be pulled back into any service later."
        style={btn(C.amber)}
      >{REMOVAL_LABELS.park}</button>

      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        aria-label="Other ways to remove this row"
        style={btn(C.slate)}
      >...</button>

      {open ? (
        <span style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 30, marginTop: 4,
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: 8, boxShadow: '0 4px 14px rgba(27,42,65,.14)',
          display: 'flex', flexDirection: 'column', gap: 6, minWidth: '13rem',
        }}>
          {/* C14. Only an activity moves. Its problems arrive with it by not
              being touched: they hang off the activity and carry no service of
              their own, so a move cannot strand them. */}
          {activityId && services.length > 0 ? (
            <label style={{ fontSize: 12, color: C.slate }}>
              {REMOVAL_LABELS.move}
              <select
                value=""
                disabled={busy}
                onChange={(e) => { if (e.target.value) send({ removal: 'move', serviceId: e.target.value }) }}
                aria-label={REMOVAL_LABELS.move}
                style={{
                  ...mono, fontSize: 11.5, width: '100%', marginTop: 3, padding: '3px 6px',
                  borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.navy,
                }}
              >
                <option value="">Choose a service...</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.service_name || 'Unnamed service'}</option>
                ))}
              </select>
            </label>
          ) : null}

          <button type="button" disabled={busy} onClick={remove} style={btn(C.red)}>
            {REMOVAL_LABELS.delete}
          </button>
          <span style={{ fontSize: 11, color: C.slate, lineHeight: 1.35 }}>
            Deleting leaves nothing behind. Park it instead if there is any chance it comes back.
          </span>
        </span>
      ) : null}
    </span>
  )
}

function btn(colour: string): React.CSSProperties {
  return {
    ...mono, fontSize: 11.5, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
    border: `1px solid ${colour}`, background: 'transparent', color: colour,
    cursor: 'pointer', whiteSpace: 'nowrap',
  }
}
