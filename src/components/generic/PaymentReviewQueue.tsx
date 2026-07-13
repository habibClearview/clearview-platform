'use client'

// Client-facing payment review queue: the human step for a mobile-money
// payment reconciliation could not automatically pair with a logged sale.
// Lives on the CLIENT's own dashboard, not the coach's -- the coach isn't
// operationally involved in a client's day-to-day sales, so only the
// client's own team (whoever manages field operators) can actually know
// what an unattributed payment was for. Nothing here is counted as
// verified revenue until a person resolves it. See docs/RECONCILIATION_SPEC.md §5.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const C = {
  navy: 'var(--cv-navy)', card: 'var(--cv-card)', border: 'var(--cv-border-soft)',
  slate: 'var(--cv-slate)', cyan: 'var(--cv-cyan)', green: 'var(--cv-green)',
  red: 'var(--cv-red)', alt: 'var(--cv-alt)',
}

interface UnattributedTxn { id: string; provider_id: string; amount: number; currency?: string; occurred_at: string }
interface Candidate { id: string; business_unit_id: string; amount: number; transaction_date: string }

export interface PaymentReviewQueueProps {
  clientId: string
}

export default function PaymentReviewQueue({ clientId }: PaymentReviewQueueProps) {
  const [items, setItems] = useState<UnattributedTxn[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [candLoading, setCandLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const { data } = await supabase
          .from('provider_transactions')
          .select('id,provider_id,amount,currency,occurred_at')
          .eq('client_id', clientId).eq('reconciliation_state', 'unattributed_inbound')
          .order('occurred_at', { ascending: false })
        if (!cancelled) setItems((data as UnattributedTxn[]) || [])
      } catch {
        if (!cancelled) setItems([])
      }
      if (!cancelled) setLoading(false)
    }
    if (clientId) load()
    return () => { cancelled = true }
  }, [clientId])

  function onResolved(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  async function ignore(id: string) {
    setBusyId(id); setMsg(null)
    const { error } = await supabase
      .from('provider_transactions')
      .update({ reconciliation_state: 'ignored', updated_at: new Date().toISOString() })
      .eq('id', id)
    setBusyId(null)
    if (error) return setMsg('Could not update: ' + error.message)
    if (openId === id) setOpenId(null)
    onResolved(id)
  }

  // Nearby (+-3 day) mobile-money field entries for this client that
  // aren't already linked to a DIFFERENT unattributed payment -- without
  // that exclusion, the same real sale could get matched to two separate
  // inbound payments.
  async function openMatchPicker(t: UnattributedTxn) {
    if (openId === t.id) { setOpenId(null); return }
    setOpenId(t.id); setCandidates([]); setCandLoading(true); setMsg(null)
    try {
      const day = t.occurred_at.slice(0, 10)
      const from = new Date(new Date(day + 'T00:00:00Z').getTime() - 3 * 86_400_000).toISOString().slice(0, 10)
      const to = new Date(new Date(day + 'T00:00:00Z').getTime() + 3 * 86_400_000).toISOString().slice(0, 10)
      const [{ data: already }, { data: candRows }] = await Promise.all([
        supabase.from('provider_transactions').select('matched_transaction_id').eq('client_id', clientId).not('matched_transaction_id', 'is', null),
        supabase.from('field_transactions').select('id,business_unit_id,amount,transaction_date')
          .eq('client_id', clientId).eq('payment_method', 'mobile_money')
          .gte('transaction_date', from).lte('transaction_date', to),
      ])
      const usedIds = new Set((already || []).map((r: any) => r.matched_transaction_id))
      const list = ((candRows as Candidate[]) || [])
        .filter(c => !usedIds.has(c.id))
        .sort((a, b) => Math.abs(a.amount - t.amount) - Math.abs(b.amount - t.amount))
      setCandidates(list)
    } catch (e: any) {
      setMsg('Could not load nearby sales: ' + (e?.message || 'unknown error'))
    } finally {
      setCandLoading(false)
    }
  }

  async function match(t: UnattributedTxn, c: Candidate) {
    setBusyId(t.id); setMsg(null)
    const { error } = await supabase
      .from('provider_transactions')
      .update({ reconciliation_state: 'matched', matched_transaction_id: c.id, business_unit_id: c.business_unit_id, updated_at: new Date().toISOString() })
      .eq('id', t.id)
    setBusyId(null)
    if (error) return setMsg('Could not match: ' + error.message)
    setOpenId(null)
    onResolved(t.id)
  }

  const totalValue = items.reduce((s, t) => s + (Number(t.amount) || 0), 0)

  return (
    <div>
      <div style={{ fontFamily: 'Georgia,serif', fontSize: '1.1rem', fontWeight: 700, color: C.navy, marginBottom: '0.3rem' }}>
        Payments to review
      </div>
      <div style={{ color: C.slate, fontSize: '0.9rem', marginBottom: '1rem', maxWidth: 640 }}>
        Mobile-money payments that arrived with no matching sale logged in the field app. Match each one to the
        real sale it was for, or ignore it if it isn&#39;t sales revenue (a refund, a personal transfer, a
        duplicate). Nothing here counts toward your verified revenue until it&#39;s resolved.
      </div>
      {loading ? (
        <div style={{ color: C.slate, fontSize: '0.9rem' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: '1.3rem', borderRadius: 12, border: `1px dashed ${C.border}`, background: C.alt, color: C.slate, fontSize: '0.92rem', textAlign: 'center' }}>
          Nothing to review right now.
        </div>
      ) : (
        <>
          <div style={{ fontSize: '0.85rem', color: C.slate, marginBottom: '0.6rem' }}>
            {items.length} payment{items.length === 1 ? '' : 's'} · {totalValue.toLocaleString()} total
          </div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {items.map((t, i) => (
              <div key={t.id} style={{ background: C.card, borderTop: i === 0 ? 'none' : `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.85rem 1.1rem', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: C.navy, fontFamily: 'monospace' }}>{(t.currency || 'UGX')} {(Number(t.amount) || 0).toLocaleString()}</div>
                    <div style={{ color: C.slate, fontSize: '0.8rem' }}>{t.provider_id} · {new Date(t.occurred_at).toLocaleString()}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button disabled={busyId === t.id} onClick={() => openMatchPicker(t)} style={btn(C.cyan)}>{openId === t.id ? 'Cancel' : 'Match to a sale'}</button>
                    <button disabled={busyId === t.id} onClick={() => ignore(t.id)} style={btn(C.slate)}>Ignore</button>
                  </div>
                </div>
                {openId === t.id && (
                  <div style={{ padding: '0 1.1rem 1rem', background: C.alt }}>
                    {candLoading ? (
                      <div style={{ color: C.slate, fontSize: '0.85rem' }}>Looking for nearby sales…</div>
                    ) : candidates.length === 0 ? (
                      <div style={{ color: C.slate, fontSize: '0.85rem' }}>
                        No unmatched mobile-money sales within 3 days of this payment. It may not have been logged yet, or it isn&#39;t sales revenue -- use Ignore if so.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {candidates.map(c => (
                          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.7rem', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ fontSize: '0.88rem' }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: c.amount === t.amount ? C.green : C.navy }}>{c.amount.toLocaleString()}</span>
                              <span style={{ color: C.slate, marginLeft: '0.6rem' }}>{c.transaction_date} · {c.business_unit_id}</span>
                              {c.amount === t.amount && <span style={{ marginLeft: '0.6rem', color: C.green, fontSize: '0.8rem' }}>exact amount match</span>}
                            </div>
                            <button disabled={busyId === t.id} onClick={() => match(t, c)} style={btn(C.green, true)}>Use this</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {msg && <div style={{ color: C.red, fontSize: '0.85rem', marginTop: '0.6rem' }}>{msg}</div>}
    </div>
  )
}

function btn(color: string, solid = false): React.CSSProperties {
  return solid
    ? { fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 700, padding: '0.3rem 0.7rem', border: 'none', borderRadius: 6, background: color, color: 'var(--cv-on-accent)', cursor: 'pointer' }
    : { fontFamily: 'monospace', fontSize: '0.82rem', padding: '0.3rem 0.7rem', border: `1px solid ${color}`, borderRadius: 6, background: 'transparent', color, cursor: 'pointer' }
}
