'use client'

// Coach-facing Review Queue: the human step for anything reconciliation could
// not resolve automatically -- inbound mobile-money payments with no matching
// field entry ("unattributed inbound"), held here and NEVER silently folded
// into a client's revenue until a person resolves them.
//
// Self-contained and additive: reads the new provider_transactions table and
// shows a graceful empty state until the reconciliation runner is wired, so it
// is safe to ship now and simply fills up once live payments flow. It changes
// no existing coach view. See docs/RECONCILIATION_SPEC.md §5.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const C = {
  navy: 'var(--cv-navy)', card: 'var(--cv-card)', border: 'var(--cv-border)',
  slate: 'var(--cv-slate)', cyan: 'var(--cv-cyan)', amber: 'var(--cv-amber)',
  green: 'var(--cv-green)', alt: 'var(--cv-alt)',
}

interface ClientRow { id: string; name?: string }
interface UnattributedTxn {
  id: string
  client_id: string
  provider_id: string
  amount: number
  currency?: string
  occurred_at: string
}

export interface ReviewQueueProps {
  clients: ClientRow[]
}

export default function ReviewQueue({ clients }: ReviewQueueProps) {
  const [items, setItems] = useState<UnattributedTxn[]>([])
  const [loading, setLoading] = useState(true)

  const nameFor = (clientId: string) => clients.find(c => c.id === clientId)?.name || clientId

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const { data } = await supabase
          .from('provider_transactions')
          .select('id,client_id,provider_id,amount,currency,occurred_at')
          .eq('reconciliation_state', 'unattributed_inbound')
          .order('occurred_at', { ascending: false })
        if (!cancelled) setItems((data as UnattributedTxn[]) || [])
      } catch {
        if (!cancelled) setItems([])
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const totalValue = items.reduce((s, t) => s + (Number(t.amount) || 0), 0)

  return (
    <div>
      <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.3rem', fontWeight: 700, color: C.navy, marginBottom: '0.3rem' }}>
        Review Queue
      </div>
      <div style={{ color: C.slate, fontSize: '0.92rem', marginBottom: '1.2rem', maxWidth: 640 }}>
        Payments that arrived with no matching field-app entry, and sales that need a second look.
        Nothing here is counted as a client&#39;s revenue until you resolve it — this protects the
        &quot;verified&quot; claim.
      </div>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '1.3rem' }}>
        <Kpi label="Items to review" value={String(items.length)} color={items.length > 0 ? C.amber : C.green} />
        <Kpi label="Unmatched value" value={totalValue > 0 ? totalValue.toLocaleString() : '—'} color={C.cyan} />
      </div>

      {loading ? (
        <div style={{ color: C.slate, fontSize: '0.9rem' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{
          padding: '1.6rem', borderRadius: 12, border: `1px dashed ${C.border}`, background: C.alt,
          color: C.slate, fontSize: '0.95rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '1.8rem', marginBottom: '0.4rem' }}>✅</div>
          <div style={{ fontWeight: 700, color: C.navy, marginBottom: '0.25rem' }}>Nothing to review</div>
          Reconciliation hasn&#39;t flagged any mismatches. Items appear here automatically when a payment
          arrives with no matching sale, or when counts don&#39;t line up.
        </div>
      ) : (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {items.map((t, i) => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
              padding: '0.85rem 1.1rem', background: C.card,
              borderTop: i === 0 ? 'none' : `1px solid ${C.border}`,
            }}>
              <div>
                <div style={{ fontWeight: 700, color: C.navy, fontSize: '0.95rem' }}>{nameFor(t.client_id)}</div>
                <div style={{ color: C.slate, fontSize: '0.82rem' }}>
                  {t.provider_id} · {new Date(t.occurred_at).toLocaleString()}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                <div style={{ fontWeight: 700, color: C.navy, fontFamily: 'monospace' }}>
                  {(t.currency || 'UGX')} {(Number(t.amount) || 0).toLocaleString()}
                </div>
                <span style={{
                  fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem',
                  borderRadius: 6, background: C.amber, color: 'var(--cv-on-accent)',
                }}>UNMATCHED</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      minWidth: 150, padding: '0.85rem 1rem', borderRadius: 12, background: C.card,
      border: `1px solid ${C.border}`, borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: C.navy }}>{value}</div>
    </div>
  )
}
