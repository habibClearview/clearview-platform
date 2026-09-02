'use client'

// ─────────────────────────────────────────────────────────────
// BUSINESS › Operations  (per-client dashboard section)
//
// Self-contained operations view with three sub-tabs:
//   • Deliveries       — fulfilment log; on-time vs delayed analysis
//   • Complaints       — customer complaints log; open vs resolved
//   • Staff Scorecards — per-staff performance derived from the two logs
//                        above, plus optional manual scorecard rows.
//
// Stock / inventory is NOT here — it lives under the dedicated Stores
// screen. A short note points there.
//
// Backed by supabase/migrations/2026_07_28_operations.sql
//   (op_deliveries, op_complaints, op_staff_scores). All three are
//   client-scoped via RLS; created_by_uid defaults to auth.uid().
//
// Prop contract (wired in by GenericDashboard):
//   config    — client config object (has client_id)
//   clientId  — string, === config.client_id
//   cc        — currency code (unused by operations, kept for parity)
//   P         — { role, userId, fullName }
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const C = {
  navy: 'var(--cv-navy)', cyan: 'var(--cv-cyan)', slate: 'var(--cv-slate)',
  border: 'var(--cv-border)', borderSoft: 'var(--cv-border-soft)',
  green: 'var(--cv-green)', red: 'var(--cv-red)', amber: 'var(--cv-amber)',
  card: 'var(--cv-card)', cream: 'var(--cv-cream)',
}

const CARD: React.CSSProperties = {
  background: C.card, border: `1px solid ${C.borderSoft}`,
  borderRadius: 14, padding: '1.4rem 1.6rem', marginBottom: '1.35rem',
}
const H = (size = '1.15rem'): React.CSSProperties => ({
  fontFamily: 'var(--cv-font)', fontWeight: 700, color: C.navy, fontSize: size,
})
const LABEL: React.CSSProperties = {
  fontFamily: 'var(--cv-font-mono)', fontSize: '0.78rem', letterSpacing: '0.04em',
  textTransform: 'uppercase', color: C.slate,
}

// ── Types ────────────────────────────────────────────────────
interface Delivery {
  id: string; reference: string | null; customer: string | null
  due_date: string | null; delivered_at: string | null
  status: 'pending' | 'delivered' | 'delayed' | 'cancelled'
  notes: string | null; handled_by: string | null; created_at: string
}
interface Complaint {
  id: string; customer: string | null; category: string | null
  raised_at: string | null; resolved_at: string | null
  status: 'open' | 'resolved'; severity: string | null
  notes: string | null; handled_by: string | null; created_at: string
}
interface StaffScore {
  id: string; staff_name: string | null; role: string | null
  period: string | null; metric: string | null; value: number | null
  notes: string | null; created_at: string
}

// ── Date helpers ─────────────────────────────────────────────
const TODAY = new Date().toISOString().slice(0, 10)
function daysBetween(a: string, b: string): number {
  // whole days from a → b (b - a)
  const ms = new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()
  return Math.round(ms / 86_400_000)
}

// A delivery counts as DELAYED if it was delivered after its due date, was
// explicitly marked delayed, or is past due and still not delivered.
function isDelayed(d: Delivery): boolean {
  if (d.status === 'cancelled') return false
  if (d.status === 'delayed') return true
  if (d.delivered_at && d.due_date) return d.delivered_at > d.due_date
  if (!d.delivered_at && d.due_date) return d.due_date < TODAY && d.status !== 'delivered'
  return false
}
function isDelivered(d: Delivery): boolean {
  return d.status === 'delivered' || !!d.delivered_at
}
// Only deliveries with a settled outcome (delivered or a firm delay) count
// toward on-time %. Pending-and-not-yet-due rows are excluded.
function hasOutcome(d: Delivery): boolean {
  return d.status !== 'cancelled' && (isDelivered(d) || isDelayed(d))
}
function delayDays(d: Delivery): number {
  if (d.delivered_at && d.due_date) return Math.max(0, daysBetween(d.due_date, d.delivered_at))
  if (!d.delivered_at && d.due_date && d.due_date < TODAY) return daysBetween(d.due_date, TODAY)
  return 0
}

// ── Small UI atoms ───────────────────────────────────────────
function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ minWidth: 130 }}>
      <div style={LABEL}>{label}</div>
      <div style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '1.5rem', fontWeight: 700, color: tone || C.navy, marginTop: 4 }}>
        {value}
      </div>
    </div>
  )
}
function Meter({ label, pct, tone }: { label: string; pct: number | null; tone: string }) {
  const shown = pct == null ? 0 : Math.max(0, Math.min(100, pct))
  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: C.slate, marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ fontFamily: 'var(--cv-font-mono)', fontWeight: 700, color: pct == null ? C.slate : tone }}>
          {pct == null ? 'n/a' : `${Math.round(pct)}%`}
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: C.cream, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${shown}%`, background: pct == null ? C.border : tone, borderRadius: 4 }} />
      </div>
    </div>
  )
}
function Badge({ text, tone }: { text: string; tone: string }) {
  return (
    <span style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.78rem', fontWeight: 700, color: tone, border: `1px solid ${tone}`, borderRadius: 6, padding: '0.1rem 0.45rem', whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'inherit', fontSize: '0.85rem', padding: '0.4rem 0.55rem',
  border: `1px solid ${C.border}`, borderRadius: 7, background: C.card, color: C.navy,
}
const th: React.CSSProperties = { ...LABEL, textAlign: 'left', padding: '0.5rem 0.7rem', borderBottom: `1px solid ${C.border}` }
const td: React.CSSProperties = { padding: '0.55rem 0.7rem', fontSize: '0.86rem', color: C.navy, borderBottom: `1px solid ${C.borderSoft}`, verticalAlign: 'top' }

function btn(color: string, solid = false): React.CSSProperties {
  return solid
    ? { fontFamily: 'var(--cv-font-mono)', fontSize: '0.82rem', fontWeight: 700, padding: '0.42rem 0.9rem', border: 'none', borderRadius: 7, background: color, color: 'var(--cv-on-accent)', cursor: 'pointer' }
    : { fontFamily: 'var(--cv-font-mono)', fontSize: '0.82rem', padding: '0.42rem 0.9rem', border: `1px solid ${color}`, borderRadius: 7, background: 'transparent', color, cursor: 'pointer' }
}

// ── Main component ───────────────────────────────────────────
export default function OperationsTab({ config, clientId, cc, P }: any) {
  void config; void cc // kept for prop-contract parity
  const [tab, setTab] = useState<'deliveries' | 'complaints' | 'staff'>('deliveries')

  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [scores, setScores] = useState<StaffScore[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  async function loadAll() {
    setLoading(true); setErr(null)
    try {
      const [dRes, cRes, sRes] = await Promise.all([
        supabase.from('op_deliveries').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
        supabase.from('op_complaints').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
        supabase.from('op_staff_scores').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      ])
      if (dRes.error) throw dRes.error
      if (cRes.error) throw cRes.error
      if (sRes.error) throw sRes.error
      setDeliveries((dRes.data as Delivery[]) || [])
      setComplaints((cRes.data as Complaint[]) || [])
      setScores((sRes.data as StaffScore[]) || [])
    } catch (e: any) {
      setErr(e?.message || 'Could not load operations data.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { if (clientId) loadAll() /* eslint-disable-next-line */ }, [clientId])

  const tabs: [typeof tab, string][] = [
    ['deliveries', 'Deliveries'],
    ['complaints', 'Complaints'],
    ['staff', 'Staff Scorecards'],
  ]

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <div style={H('1.35rem')}>Operations</div>
        <div style={{ color: C.slate, fontSize: '0.9rem', marginTop: 4, maxWidth: 680 }}>
          Fulfilment, customer complaints and staff performance. Stock and inventory
          live under the <strong style={{ color: C.navy }}>Stores</strong> screen.
        </div>
      </div>

      {/* sub-tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            fontFamily: 'var(--cv-font-mono)', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
            padding: '0.45rem 0.95rem', borderRadius: 8,
            border: `1px solid ${tab === id ? C.cyan : C.border}`,
            background: tab === id ? C.cyan : 'transparent',
            color: tab === id ? 'var(--cv-on-accent)' : C.slate,
          }}>{label}</button>
        ))}
      </div>

      {err && (
        <div style={{ ...CARD, borderColor: C.red, color: C.red, fontSize: '0.88rem' }}>{err}</div>
      )}
      {loading ? (
        <div style={{ ...CARD, color: C.slate, textAlign: 'center' }}>Loading…</div>
      ) : (
        <>
          {tab === 'deliveries' && <DeliveriesView rows={deliveries} clientId={clientId} P={P} onChange={loadAll} />}
          {tab === 'complaints' && <ComplaintsView rows={complaints} clientId={clientId} P={P} onChange={loadAll} />}
          {tab === 'staff' && <StaffView deliveries={deliveries} complaints={complaints} scores={scores} clientId={clientId} P={P} onChange={loadAll} />}
        </>
      )}
    </div>
  )
}

// ── Deliveries ───────────────────────────────────────────────
function DeliveriesView({ rows, clientId, P, onChange }: { rows: Delivery[]; clientId: string; P: any; onChange: () => void }) {
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState({ reference: '', customer: '', due_date: '', delivered_at: '', status: 'pending', handled_by: P?.fullName || '', notes: '' })

  const summary = useMemo(() => {
    const active = rows.filter(d => d.status !== 'cancelled')
    const outcome = active.filter(hasOutcome)
    const delayed = outcome.filter(isDelayed)
    const onTime = outcome.length - delayed.length
    const onTimePct = outcome.length ? (onTime / outcome.length) * 100 : null
    const avgDelay = delayed.length ? delayed.reduce((s, d) => s + delayDays(d), 0) / delayed.length : 0
    return { total: rows.length, active: active.length, onTimePct, delayed: delayed.length, avgDelay }
  }, [rows])

  async function save() {
    setSaving(true); setMsg(null)
    const payload: any = {
      client_id: clientId,
      reference: form.reference.trim() || null,
      customer: form.customer.trim() || null,
      due_date: form.due_date || null,
      delivered_at: form.delivered_at || null,
      status: form.status,
      handled_by: form.handled_by.trim() || null,
      notes: form.notes.trim() || null,
    }
    const { error } = await supabase.from('op_deliveries').insert(payload)
    setSaving(false)
    if (error) { setMsg('Could not save: ' + error.message); return }
    setForm({ reference: '', customer: '', due_date: '', delivered_at: '', status: 'pending', handled_by: P?.fullName || '', notes: '' })
    setAdding(false); onChange()
  }
  async function del(id: string) {
    const { error } = await supabase.from('op_deliveries').delete().eq('id', id)
    if (error) setMsg('Could not delete: ' + error.message); else onChange()
  }

  return (
    <div>
      <div style={CARD}>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <Stat label="Deliveries" value={String(summary.total)} />
          <Stat label="On-time" value={summary.onTimePct == null ? 'n/a' : `${Math.round(summary.onTimePct)}%`} tone={summary.onTimePct == null ? C.slate : summary.onTimePct >= 80 ? C.green : summary.onTimePct >= 50 ? C.amber : C.red} />
          <Stat label="Delayed" value={String(summary.delayed)} tone={summary.delayed ? C.red : C.navy} />
          <Stat label="Avg delay (days)" value={summary.avgDelay ? summary.avgDelay.toFixed(1) : '0'} tone={summary.avgDelay ? C.amber : C.navy} />
        </div>
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem', flexWrap: 'wrap', gap: '0.6rem' }}>
          <div style={H()}>Delivery log</div>
          <button onClick={() => { setAdding(a => !a); setMsg(null) }} style={btn(C.cyan, !adding)}>{adding ? 'Cancel' : '+ Add delivery'}</button>
        </div>

        {adding && (
          <div style={{ background: C.cream, border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.7rem' }}>
              <Field label="Reference"><input style={inputStyle} value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="Order / ref" /></Field>
              <Field label="Customer"><input style={inputStyle} value={form.customer} onChange={e => setForm({ ...form, customer: e.target.value })} /></Field>
              <Field label="Due date"><input type="date" style={inputStyle} value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></Field>
              <Field label="Delivered on"><input type="date" style={inputStyle} value={form.delivered_at} onChange={e => setForm({ ...form, delivered_at: e.target.value })} /></Field>
              <Field label="Status">
                <select style={inputStyle} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="pending">pending</option>
                  <option value="delivered">delivered</option>
                  <option value="delayed">delayed</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </Field>
              <Field label="Handled by"><input style={inputStyle} value={form.handled_by} onChange={e => setForm({ ...form, handled_by: e.target.value })} /></Field>
            </div>
            <div style={{ marginTop: '0.7rem' }}>
              <Field label="Notes"><input style={{ ...inputStyle, width: '100%' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
            </div>
            <div style={{ marginTop: '0.9rem' }}>
              <button disabled={saving} onClick={save} style={btn(C.green, true)}>{saving ? 'Saving…' : 'Save delivery'}</button>
            </div>
          </div>
        )}
        {msg && <div style={{ color: C.red, fontSize: '0.82rem', marginBottom: '0.6rem' }}>{msg}</div>}

        {rows.length === 0 ? (
          <Empty text="No deliveries logged yet." />
        ) : (
          <TableWrap>
            <thead><tr>
              <th style={th}>Reference</th><th style={th}>Customer</th><th style={th}>Due</th>
              <th style={th}>Delivered</th><th style={th}>Outcome</th><th style={th}>Handled by</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {rows.map(d => {
                const delayed = isDelayed(d)
                const outcome = d.status === 'cancelled' ? { t: 'cancelled', tone: C.slate }
                  : delayed ? { t: `delayed${delayDays(d) ? ` +${delayDays(d)}d` : ''}`, tone: C.red }
                  : isDelivered(d) ? { t: 'on time', tone: C.green }
                  : { t: 'pending', tone: C.amber }
                return (
                  <tr key={d.id}>
                    <td style={td}>{d.reference || '—'}</td>
                    <td style={td}>{d.customer || '—'}</td>
                    <td style={{ ...td, fontFamily: 'var(--cv-font-mono)' }}>{d.due_date || '—'}</td>
                    <td style={{ ...td, fontFamily: 'var(--cv-font-mono)' }}>{d.delivered_at || '—'}</td>
                    <td style={td}><Badge text={outcome.t} tone={outcome.tone} /></td>
                    <td style={td}>{d.handled_by || '—'}</td>
                    <td style={td}><button onClick={() => del(d.id)} style={{ ...btn(C.red), padding: '0.2rem 0.5rem', fontSize: '0.78rem' }}>Delete</button></td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  )
}

// ── Complaints ───────────────────────────────────────────────
function ComplaintsView({ rows, clientId, P, onChange }: { rows: Complaint[]; clientId: string; P: any; onChange: () => void }) {
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState({ customer: '', category: '', raised_at: TODAY, resolved_at: '', status: 'open', severity: 'medium', handled_by: P?.fullName || '', notes: '' })

  const summary = useMemo(() => {
    const open = rows.filter(c => c.status === 'open').length
    const resolved = rows.filter(c => c.status === 'resolved')
    const resolvable = resolved.filter(c => c.raised_at && c.resolved_at)
    const avgRes = resolvable.length
      ? resolvable.reduce((s, c) => s + Math.max(0, daysBetween(c.raised_at!, c.resolved_at!)), 0) / resolvable.length
      : null
    return { total: rows.length, open, resolved: resolved.length, avgRes }
  }, [rows])

  async function save() {
    setSaving(true); setMsg(null)
    const payload: any = {
      client_id: clientId,
      customer: form.customer.trim() || null,
      category: form.category.trim() || null,
      raised_at: form.raised_at || TODAY,
      resolved_at: form.status === 'resolved' ? (form.resolved_at || TODAY) : (form.resolved_at || null),
      status: form.status,
      severity: form.severity || null,
      handled_by: form.handled_by.trim() || null,
      notes: form.notes.trim() || null,
    }
    const { error } = await supabase.from('op_complaints').insert(payload)
    setSaving(false)
    if (error) { setMsg('Could not save: ' + error.message); return }
    setForm({ customer: '', category: '', raised_at: TODAY, resolved_at: '', status: 'open', severity: 'medium', handled_by: P?.fullName || '', notes: '' })
    setAdding(false); onChange()
  }
  async function resolve(c: Complaint) {
    const { error } = await supabase.from('op_complaints').update({ status: 'resolved', resolved_at: c.resolved_at || TODAY }).eq('id', c.id)
    if (error) setMsg('Could not update: ' + error.message); else onChange()
  }
  async function del(id: string) {
    const { error } = await supabase.from('op_complaints').delete().eq('id', id)
    if (error) setMsg('Could not delete: ' + error.message); else onChange()
  }

  return (
    <div>
      <div style={CARD}>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <Stat label="Complaints" value={String(summary.total)} />
          <Stat label="Open" value={String(summary.open)} tone={summary.open ? C.amber : C.green} />
          <Stat label="Resolved" value={String(summary.resolved)} tone={C.green} />
          <Stat label="Avg resolution (days)" value={summary.avgRes == null ? 'n/a' : summary.avgRes.toFixed(1)} tone={summary.avgRes == null ? C.slate : C.navy} />
        </div>
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem', flexWrap: 'wrap', gap: '0.6rem' }}>
          <div style={H()}>Complaints log</div>
          <button onClick={() => { setAdding(a => !a); setMsg(null) }} style={btn(C.cyan, !adding)}>{adding ? 'Cancel' : '+ Log complaint'}</button>
        </div>

        {adding && (
          <div style={{ background: C.cream, border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.7rem' }}>
              <Field label="Customer"><input style={inputStyle} value={form.customer} onChange={e => setForm({ ...form, customer: e.target.value })} /></Field>
              <Field label="Category"><input style={inputStyle} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. quality, delivery" /></Field>
              <Field label="Severity">
                <select style={inputStyle} value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
                  <option value="low">low</option><option value="medium">medium</option><option value="high">high</option>
                </select>
              </Field>
              <Field label="Raised on"><input type="date" style={inputStyle} value={form.raised_at} onChange={e => setForm({ ...form, raised_at: e.target.value })} /></Field>
              <Field label="Status">
                <select style={inputStyle} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="open">open</option><option value="resolved">resolved</option>
                </select>
              </Field>
              <Field label="Resolved on"><input type="date" style={inputStyle} value={form.resolved_at} onChange={e => setForm({ ...form, resolved_at: e.target.value })} /></Field>
              <Field label="Handled by"><input style={inputStyle} value={form.handled_by} onChange={e => setForm({ ...form, handled_by: e.target.value })} /></Field>
            </div>
            <div style={{ marginTop: '0.7rem' }}>
              <Field label="Notes"><input style={{ ...inputStyle, width: '100%' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
            </div>
            <div style={{ marginTop: '0.9rem' }}>
              <button disabled={saving} onClick={save} style={btn(C.green, true)}>{saving ? 'Saving…' : 'Save complaint'}</button>
            </div>
          </div>
        )}
        {msg && <div style={{ color: C.red, fontSize: '0.82rem', marginBottom: '0.6rem' }}>{msg}</div>}

        {rows.length === 0 ? (
          <Empty text="No complaints logged yet." />
        ) : (
          <TableWrap>
            <thead><tr>
              <th style={th}>Customer</th><th style={th}>Category</th><th style={th}>Severity</th>
              <th style={th}>Raised</th><th style={th}>Status</th><th style={th}>Handled by</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {rows.map(c => {
                const days = c.status === 'resolved' && c.raised_at && c.resolved_at ? Math.max(0, daysBetween(c.raised_at, c.resolved_at)) : null
                return (
                  <tr key={c.id}>
                    <td style={td}>{c.customer || '—'}</td>
                    <td style={td}>{c.category || '—'}</td>
                    <td style={td}>{c.severity ? <Badge text={c.severity} tone={c.severity === 'high' ? C.red : c.severity === 'low' ? C.slate : C.amber} /> : '—'}</td>
                    <td style={{ ...td, fontFamily: 'var(--cv-font-mono)' }}>{c.raised_at || '—'}</td>
                    <td style={td}>
                      {c.status === 'resolved'
                        ? <Badge text={days != null ? `resolved · ${days}d` : 'resolved'} tone={C.green} />
                        : <Badge text="open" tone={C.amber} />}
                    </td>
                    <td style={td}>{c.handled_by || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {c.status === 'open' && <button onClick={() => resolve(c)} style={{ ...btn(C.green), padding: '0.2rem 0.5rem', fontSize: '0.78rem', marginRight: 6 }}>Resolve</button>}
                      <button onClick={() => del(c.id)} style={{ ...btn(C.red), padding: '0.2rem 0.5rem', fontSize: '0.78rem' }}>Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  )
}

// ── Staff scorecards ─────────────────────────────────────────
function StaffView({ deliveries, complaints, scores, clientId, P, onChange }: {
  deliveries: Delivery[]; complaints: Complaint[]; scores: StaffScore[]; clientId: string; P: any; onChange: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState({ staff_name: '', role: '', period: TODAY.slice(0, 7) + '-01', metric: '', value: '', notes: '' })

  // Derive per-staff indexes from the operational logs.
  const cards = useMemo(() => {
    type Agg = {
      name: string
      delOutcome: number; delOnTime: number
      compTotal: number; compResolved: number
    }
    const map = new Map<string, Agg>()
    const get = (n: string) => {
      let a = map.get(n)
      if (!a) { a = { name: n, delOutcome: 0, delOnTime: 0, compTotal: 0, compResolved: 0 }; map.set(n, a) }
      return a
    }
    for (const d of deliveries) {
      if (!d.handled_by) continue
      if (!hasOutcome(d)) continue
      const a = get(d.handled_by.trim())
      a.delOutcome++
      if (!isDelayed(d)) a.delOnTime++
    }
    for (const c of complaints) {
      if (!c.handled_by) continue
      const a = get(c.handled_by.trim())
      a.compTotal++
      if (c.status === 'resolved') a.compResolved++
    }
    return Array.from(map.values())
      .map(a => ({
        name: a.name,
        onTimePct: a.delOutcome ? (a.delOnTime / a.delOutcome) * 100 : null,
        delCount: a.delOutcome,
        resolvedPct: a.compTotal ? (a.compResolved / a.compTotal) * 100 : null,
        compCount: a.compTotal,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [deliveries, complaints])

  async function save() {
    setSaving(true); setMsg(null)
    const payload: any = {
      client_id: clientId,
      staff_name: form.staff_name.trim() || null,
      role: form.role.trim() || null,
      period: form.period || null,
      metric: form.metric.trim() || null,
      value: form.value === '' ? null : Number(form.value),
      notes: form.notes.trim() || null,
    }
    const { error } = await supabase.from('op_staff_scores').insert(payload)
    setSaving(false)
    if (error) { setMsg('Could not save: ' + error.message); return }
    setForm({ staff_name: '', role: '', period: TODAY.slice(0, 7) + '-01', metric: '', value: '', notes: '' })
    setAdding(false); onChange()
  }
  async function del(id: string) {
    const { error } = await supabase.from('op_staff_scores').delete().eq('id', id)
    if (error) setMsg('Could not delete: ' + error.message); else onChange()
  }

  return (
    <div>
      <div style={CARD}>
        <div style={H()}>Performance by staff</div>
        <div style={{ color: C.slate, fontSize: '0.85rem', marginTop: 4, marginBottom: '1.1rem', maxWidth: 620 }}>
          Derived from who handled each delivery and complaint. Two indexes per person:
          delivery on-time rate and complaint resolution rate.
        </div>
        {cards.length === 0 ? (
          <Empty text="No staff activity yet — set “Handled by” on deliveries and complaints to build scorecards." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
            {cards.map(s => (
              <div key={s.name} style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 12, padding: '1rem 1.1rem', background: C.cream }}>
                <div style={{ ...H('1rem'), marginBottom: '0.7rem' }}>{s.name}</div>
                <Meter label={`On-time deliveries (${s.delCount})`} pct={s.onTimePct} tone={s.onTimePct == null ? C.slate : s.onTimePct >= 80 ? C.green : s.onTimePct >= 50 ? C.amber : C.red} />
                <Meter label={`Complaints resolved (${s.compCount})`} pct={s.resolvedPct} tone={s.resolvedPct == null ? C.slate : s.resolvedPct >= 80 ? C.green : s.resolvedPct >= 50 ? C.amber : C.red} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem', flexWrap: 'wrap', gap: '0.6rem' }}>
          <div style={H()}>Manual scorecard entries</div>
          <button onClick={() => { setAdding(a => !a); setMsg(null) }} style={btn(C.cyan, !adding)}>{adding ? 'Cancel' : '+ Add score'}</button>
        </div>
        <div style={{ color: C.slate, fontSize: '0.82rem', marginBottom: '0.9rem' }}>
          Optional — record a manual metric (e.g. an appraisal rating or a coached KPI) not captured by the logs above.
        </div>

        {adding && (
          <div style={{ background: C.cream, border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.7rem' }}>
              <Field label="Staff name"><input style={inputStyle} value={form.staff_name} onChange={e => setForm({ ...form, staff_name: e.target.value })} /></Field>
              <Field label="Role"><input style={inputStyle} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} /></Field>
              <Field label="Period"><input type="date" style={inputStyle} value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} /></Field>
              <Field label="Metric"><input style={inputStyle} value={form.metric} onChange={e => setForm({ ...form, metric: e.target.value })} placeholder="e.g. appraisal score" /></Field>
              <Field label="Value"><input type="number" style={inputStyle} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} /></Field>
            </div>
            <div style={{ marginTop: '0.7rem' }}>
              <Field label="Notes"><input style={{ ...inputStyle, width: '100%' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
            </div>
            <div style={{ marginTop: '0.9rem' }}>
              <button disabled={saving} onClick={save} style={btn(C.green, true)}>{saving ? 'Saving…' : 'Save score'}</button>
            </div>
          </div>
        )}
        {msg && <div style={{ color: C.red, fontSize: '0.82rem', marginBottom: '0.6rem' }}>{msg}</div>}

        {scores.length === 0 ? (
          <Empty text="No manual scores recorded." />
        ) : (
          <TableWrap>
            <thead><tr>
              <th style={th}>Staff</th><th style={th}>Role</th><th style={th}>Period</th>
              <th style={th}>Metric</th><th style={th}>Value</th><th style={th}>Notes</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {scores.map(s => (
                <tr key={s.id}>
                  <td style={td}>{s.staff_name || '—'}</td>
                  <td style={td}>{s.role || '—'}</td>
                  <td style={{ ...td, fontFamily: 'var(--cv-font-mono)' }}>{s.period || '—'}</td>
                  <td style={td}>{s.metric || '—'}</td>
                  <td style={{ ...td, fontFamily: 'var(--cv-font-mono)' }}>{s.value == null ? '—' : s.value}</td>
                  <td style={td}>{s.notes || '—'}</td>
                  <td style={td}><button onClick={() => del(s.id)} style={{ ...btn(C.red), padding: '0.2rem 0.5rem', fontSize: '0.78rem' }}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  )
}

// ── Shared little bits ───────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={LABEL}>{label}</span>
      {children}
    </label>
  )
}
function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: '1.3rem', borderRadius: 10, border: `1px dashed ${C.border}`, background: C.cream, color: C.slate, fontSize: '0.9rem', textAlign: 'center' }}>
      {text}
    </div>
  )
}
function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>{children}</table>
    </div>
  )
}
