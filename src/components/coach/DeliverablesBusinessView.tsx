// @ts-nocheck
'use client'
// ============================================================
// Deliverables and claims, in the business area rather than on the client.
//
// WHY IT MOVED. It used to be a tab inside a client, sitting between the
// Evidence Library and the blocks. The fee, the milestones and the claims are
// between the consultant and whoever pays, and the organisation being coached
// has no part in them. Keeping them on the client screen meant the only thing
// between a beneficiary and the fee was a role check on one tab, and one check
// is one mistake away from being wrong. Off the client screen entirely, there
// is nothing to get wrong: this view lives behind the business area, which
// nobody but the lead consultant reaches at all.
//
// The engagement still triggers the claim. What a gate produced, what evidence
// stands behind it and who signed it all stay where the work is. Assembling
// that into something a funder is sent happens here.
//
// One client at a time and chosen deliberately, because a list of every
// engagement's money on one screen is a screen you cannot show anybody.
// ============================================================
import { useState } from 'react'
import DeliverablesPanel from '@/components/gtcv/DeliverablesPanel'

const C = {
  card: 'var(--cv-card)', border: 'var(--cv-border)', navy: 'var(--cv-navy)',
  slate: 'var(--cv-slate)', teal: 'var(--cv-teal)',
}
const mono = { fontFamily: 'var(--cv-font-mono)' }
const hint = { fontSize: '0.92rem', color: C.slate, lineHeight: 1.5 }

export default function DeliverablesBusinessView({ clients = [] }) {
  const [clientId, setClientId] = useState('')
  const chosen = clients.find((c) => c.id === clientId)

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 12, background: C.card,
      padding: '1.1rem 1.2rem', marginTop: '1.4rem',
    }}>
      <div style={{ ...mono, fontSize: '0.75rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
        Deliverables and claims
      </div>
      <p style={{ ...hint, margin: '0.45rem 0 0', maxWidth: '92ch' }}>
        What was contracted, which decision gates evidence it, and what still has to happen before it
        can be claimed. This sits here rather than on the client screen because the fee is between you
        and whoever pays. Nobody in the organisation being coached can reach this page at all.
      </p>

      <div style={{ marginTop: '0.9rem', maxWidth: 420 }}>
        <label htmlFor="deliv-client" style={{
          ...mono, fontSize: '0.68rem', letterSpacing: '.1em', textTransform: 'uppercase',
          color: C.slate, display: 'block', marginBottom: '0.3rem',
        }}>Which engagement</label>
        <select
          id="deliv-client"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          style={{
            width: '100%', padding: '0.5rem 0.6rem', border: `1px solid ${C.border}`,
            borderRadius: 7, background: 'var(--cv-bg-2)', color: C.navy, fontSize: '0.98rem',
          }}
        >
          <option value="">Choose one</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {chosen ? (
        <div style={{ marginTop: '1.1rem' }}>
          <DeliverablesPanel clientId={chosen.id} canManage currency={null} />
        </div>
      ) : (
        <p style={{ ...hint, marginTop: '0.9rem' }}>
          Choose an engagement to see its milestones, what evidences each one, and the claims made
          against them.
        </p>
      )}
    </div>
  )
}
