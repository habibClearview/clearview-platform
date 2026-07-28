'use client'

// ─────────────────────────────────────────────────────────────
// BUSINESS › Staff  (per-client dashboard section)
//
// The canonical people roster for a client's business — the single list
// that every other feature attributes work to. Before this, staff identity
// was fragmented across field_operators (uuid), user_profiles (uuid) and
// free-text names (op_deliveries.handled_by, customer_leads.officer, …),
// which collide and cannot carry a target or a department.
//
// Two departments, matching how the businesses actually run:
//   • Sales & Marketing — the outbound team who RECRUIT customers (they
//                         SOURCE a customer). Measured on new customers and
//                         conversion.
//   • Operations        — shopkeepers / till staff who SERVE a sale.
//                         Measured on sales, sales-to-target and repeat
//                         business.
//
// Targets are effective-dated and per-metric (staff_targets), NOT a single
// number on the person: these are growing businesses that raise targets
// monthly — sometimes weekly in season — and each period must be graded
// against the target that applied then. Raising a target = add a new dated
// row; the old one still governs the periods it covered.
//
// Backed by:
//   supabase/migrations/2026_07_28_staff.sql          (table `staff`)
//   supabase/migrations/2026_07_28_staff_targets.sql  (table `staff_targets`)
// Both client-scoped via RLS; created_by_uid defaults to auth.uid().
//
// Prop contract (wired in by GenericDashboard): { config, clientId, cc, P }
// ─────────────────────────────────────────────────────────────

import { Fragment, useEffect, useMemo, useState } from 'react'
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
  fontFamily: 'Georgia,serif', fontWeight: 700, color: C.navy, fontSize: size,
})
const LABEL: React.CSSProperties = {
  fontFamily: 'monospace', fontSize: '0.72rem', letterSpacing: '0.04em',
  textTransform: 'uppercase', color: C.slate,
}
const inputStyle: React.CSSProperties = {
  fontFamily: 'inherit', fontSize: '0.85rem', padding: '0.4rem 0.55rem',
  border: `1px solid ${C.border}`, borderRadius: 7, background: C.card, color: C.navy,
}
const th: React.CSSProperties = { ...LABEL, textAlign: 'left', padding: '0.5rem 0.7rem', borderBottom: `1px solid ${C.border}` }
const td: React.CSSProperties = { padding: '0.55rem 0.7rem', fontSize: '0.86rem', color: C.navy, borderBottom: `1px solid ${C.borderSoft}`, verticalAlign: 'top' }
function btn(color: string, solid = false): React.CSSProperties {
  return solid
    ? { fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 700, padding: '0.42rem 0.9rem', border: 'none', borderRadius: 7, background: color, color: 'var(--cv-on-accent)', cursor: 'pointer' }
    : { fontFamily: 'monospace', fontSize: '0.82rem', padding: '0.42rem 0.9rem', border: `1px solid ${color}`, borderRadius: 7, background: 'transparent', color, cursor: 'pointer' }
}
function Badge({ text, tone }: { text: string; tone: string }) {
  return (
    <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700, color: tone, border: `1px solid ${tone}`, borderRadius: 6, padding: '0.1rem 0.45rem', whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

// ── Types ────────────────────────────────────────────────────
type Department = 'operations' | 'sales_marketing'
type Metric =
  | 'new_customers' | 'lead_conversion' | 'prospect_conversion'
  | 'sales_value' | 'sales_count' | 'repeat_rate' | 'attendance_rate' | 'custom'
type Period = 'weekly' | 'monthly' | 'quarterly'

interface Staff {
  id: string
  staff_code: string
  full_name: string
  department: Department
  phone: string | null
  active: boolean
  notes: string | null
  created_at: string
}
interface Target {
  id: string
  staff_id: string
  metric: Metric
  metric_label: string | null
  target_value: number
  period: Period
  effective_from: string
  notes: string | null
  created_at: string
}

// ── Metric config (numeric, objective — no free-text scores) ──
type MetricKind = 'count' | 'percent' | 'value'
const METRIC: Record<Metric, { label: string; kind: MetricKind; unit?: string }> = {
  new_customers:       { label: 'New customers',        kind: 'count',   unit: 'customers' },
  lead_conversion:     { label: 'Lead → prospect rate', kind: 'percent' },
  prospect_conversion: { label: 'Prospect → client rate', kind: 'percent' },
  sales_value:         { label: 'Sales value',          kind: 'value' },
  sales_count:         { label: 'Number of sales',      kind: 'count',   unit: 'sales' },
  repeat_rate:         { label: 'Repeat-business rate',  kind: 'percent' },
  attendance_rate:     { label: 'On-time attendance',   kind: 'percent' },
  custom:              { label: 'Custom',               kind: 'count' },
}
// Which metrics a manager can set per department (first = default).
const METRICS_FOR: Record<Department, Metric[]> = {
  sales_marketing: ['new_customers', 'lead_conversion', 'prospect_conversion', 'sales_value', 'custom'],
  operations:      ['sales_value', 'sales_count', 'repeat_rate', 'attendance_rate', 'custom'],
}
const PERIODS: Period[] = ['weekly', 'monthly', 'quarterly']
const perWord = (p: Period) => (p === 'monthly' ? 'mo' : p === 'weekly' ? 'wk' : 'qtr')

const DEPT_LABEL: Record<Department, string> = { sales_marketing: 'Sales & Marketing', operations: 'Operations' }
const DEPT_BLURB: Record<Department, string> = {
  sales_marketing: 'Go out and recruit customers — measured on new customers won and conversion rates.',
  operations: 'Run the shop and serve sales — measured on sales, sales-to-target and repeat business.',
}

const TODAY = new Date().toISOString().slice(0, 10)

// Human-readable target, e.g. "≥ 12 customers/mo" · "≥ 60%/mo" · "≥ NGN 150,000/mo".
function fmtTarget(t: Target, cc: string): string {
  const m = METRIC[t.metric]
  const per = perWord(t.period)
  const label = t.metric === 'custom' ? (t.metric_label || 'target') : m.label.toLowerCase()
  if (m.kind === 'percent') return `${m.label}: ≥ ${t.target_value}%/${per}`
  if (m.kind === 'value') return `${m.label}: ≥ ${cc ? cc + ' ' : ''}${Number(t.target_value).toLocaleString()}/${per}`
  const unit = t.metric === 'custom' ? label : (m.unit || '')
  return `${t.metric === 'custom' ? label : m.label}: ≥ ${Number(t.target_value).toLocaleString()} ${unit}/${per}`
}

// Current target per metric = latest row with effective_from <= today.
function currentTargets(all: Target[]): Target[] {
  const byMetric = new Map<Metric, Target>()
  for (const t of all) {
    if (t.effective_from > TODAY) continue          // future-dated: not in force yet
    const prev = byMetric.get(t.metric)
    if (!prev || t.effective_from > prev.effective_from) byMetric.set(t.metric, t)
  }
  return Array.from(byMetric.values())
}

// Suggest the next stable code for a department: SM01, SM02 … / OP01 …
function suggestCode(dept: Department, all: Staff[]): string {
  const prefix = dept === 'sales_marketing' ? 'SM' : 'OP'
  let max = 0
  for (const s of all) {
    const m = (s.staff_code || '').toUpperCase().match(new RegExp(`^${prefix}(\\d+)$`))
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${prefix}${String(max + 1).padStart(2, '0')}`
}

// ── Main component ───────────────────────────────────────────
export default function StaffTab({ config, clientId, cc, P }: any) {
  void config
  const currency = cc || ''
  const [rows, setRows] = useState<Staff[]>([])
  const [targets, setTargets] = useState<Target[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)   // staff id, or 'new'
  const [targetsFor, setTargetsFor] = useState<string | null>(null) // staff id whose targets panel is open
  const canManage = !!(P?.canManageTeam ?? true)

  async function load() {
    setLoading(true); setErr(null)
    try {
      const [sRes, tRes] = await Promise.all([
        supabase.from('staff').select('*').eq('client_id', clientId)
          .order('department', { ascending: true }).order('staff_code', { ascending: true }),
        supabase.from('staff_targets').select('*').eq('client_id', clientId)
          .order('effective_from', { ascending: false }),
      ])
      if (sRes.error) throw sRes.error
      if (tRes.error) throw tRes.error
      setRows((sRes.data as Staff[]) || [])
      setTargets((tRes.data as Target[]) || [])
    } catch (e: any) {
      setErr(e?.message || 'Could not load the staff roster.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { if (clientId) load() /* eslint-disable-next-line */ }, [clientId])

  const targetsByStaff = useMemo(() => {
    const m = new Map<string, Target[]>()
    for (const t of targets) { const a = m.get(t.staff_id) || []; a.push(t); m.set(t.staff_id, a) }
    return m
  }, [targets])

  const byDept = useMemo(() => ({
    sales_marketing: rows.filter(r => r.department === 'sales_marketing'),
    operations: rows.filter(r => r.department === 'operations'),
  }), [rows])

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <div style={H('1.35rem')}>Staff</div>
        <div style={{ color: C.slate, fontSize: '0.9rem', marginTop: 4, maxWidth: 740 }}>
          One roster for everyone in the business, split into the two departments that run it.
          Each person has a stable code and dated targets. Targets can be raised any time —
          each period is scored against the target that applied then, so performance is
          undisputable numbers, never opinion.
        </div>
      </div>

      {err && <div style={{ ...CARD, borderColor: C.red, color: C.red, fontSize: '0.88rem' }}>{err}</div>}

      {loading ? (
        <div style={{ ...CARD, color: C.slate, textAlign: 'center' }}>Loading…</div>
      ) : (
        <>
          {canManage && editing !== 'new' && (
            <button onClick={() => { setEditing('new'); setTargetsFor(null) }} style={{ ...btn(C.cyan, true), marginBottom: '1.1rem' }}>
              + Add a person
            </button>
          )}
          {editing === 'new' && (
            <StaffForm clientId={clientId} allRows={rows}
              onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
          )}

          {(['sales_marketing', 'operations'] as Department[]).map(dept => (
            <DeptSection
              key={dept} dept={dept} rows={byDept[dept]} currency={currency} clientId={clientId}
              canManage={canManage} allRows={rows} targetsByStaff={targetsByStaff}
              editing={editing} setEditing={setEditing}
              targetsFor={targetsFor} setTargetsFor={setTargetsFor}
              onChanged={load} createdBy={P?.userId}
            />
          ))}
        </>
      )}
    </div>
  )
}

// ── One department block ─────────────────────────────────────
function DeptSection({ dept, rows, currency, clientId, canManage, allRows, targetsByStaff, editing, setEditing, targetsFor, setTargetsFor, onChanged }: {
  dept: Department; rows: Staff[]; currency: string; clientId: string; canManage: boolean
  allRows: Staff[]; targetsByStaff: Map<string, Target[]>
  editing: string | null; setEditing: (v: string | null) => void
  targetsFor: string | null; setTargetsFor: (v: string | null) => void
  onChanged: () => void; createdBy?: string
}) {
  const activeCount = rows.filter(r => r.active).length
  const withTarget = rows.filter(r => currentTargets(targetsByStaff.get(r.id) || []).length > 0).length
  const tone = dept === 'sales_marketing' ? C.cyan : C.amber

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.35rem' }}>
        <div style={H('1.1rem')}>{DEPT_LABEL[dept]}</div>
        <div style={{ ...LABEL, color: tone }}>{activeCount} active · {withTarget}/{rows.length} with a target</div>
      </div>
      <div style={{ color: C.slate, fontSize: '0.84rem', marginBottom: '0.9rem' }}>{DEPT_BLURB[dept]}</div>

      {rows.length === 0 ? (
        <div style={{ color: C.slate, fontSize: '0.86rem', fontStyle: 'italic' }}>No one added yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
            <thead><tr>
              <th style={th}>Code</th><th style={th}>Name</th><th style={th}>Phone</th>
              <th style={th}>Current targets</th><th style={th}>Status</th>{canManage && <th style={th}></th>}
            </tr></thead>
            <tbody>
              {rows.map(s => {
                const staffTargets = targetsByStaff.get(s.id) || []
                const current = currentTargets(staffTargets)
                if (editing === s.id) return (
                  <tr key={s.id}><td style={{ ...td, padding: 0 }} colSpan={canManage ? 6 : 5}>
                    <StaffForm clientId={clientId} allRows={allRows} existing={s}
                      onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged() }} />
                  </td></tr>
                )
                return (
                  <Fragment key={s.id}>
                    <tr style={{ opacity: s.active ? 1 : 0.55 }}>
                      <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700 }}>{s.staff_code}</td>
                      <td style={td}>{s.full_name}</td>
                      <td style={{ ...td, fontFamily: 'monospace', color: C.slate }}>{s.phone || '—'}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                          {current.map(t => (
                            <span key={t.id} style={{ fontFamily: 'monospace', fontSize: '0.74rem', color: tone, border: `1px solid ${tone}`, borderRadius: 6, padding: '0.08rem 0.4rem' }}>
                              {fmtTarget(t, currency)}
                            </span>
                          ))}
                          {current.length === 0 && !canManage && <span style={{ color: C.slate }}>—</span>}
                          {canManage && (
                            <button onClick={() => { setTargetsFor(targetsFor === s.id ? null : s.id); setEditing(null) }} style={btn(tone, current.length === 0)}>
                              {targetsFor === s.id ? 'Close' : current.length === 0 ? '+ Set targets' : 'Set / raise'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={td}>{s.active ? <Badge text="ACTIVE" tone={C.green} /> : <Badge text="INACTIVE" tone={C.slate} />}</td>
                      {canManage && (
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          <button onClick={() => { setEditing(s.id); setTargetsFor(null) }} style={btn(C.cyan)}>Edit</button>
                        </td>
                      )}
                    </tr>
                    {targetsFor === s.id && (
                      <tr><td style={{ ...td, padding: 0, background: C.cream }} colSpan={canManage ? 6 : 5}>
                        <TargetsPanel staff={s} rows={staffTargets} currency={currency} clientId={clientId}
                          canManage={canManage} onChanged={onChanged} />
                      </td></tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Targets panel (history + set/raise) ──────────────────────
function TargetsPanel({ staff, rows, currency, clientId, canManage, onChanged }: {
  staff: Staff; rows: Target[]; currency: string; clientId: string; canManage: boolean; onChanged: () => void
}) {
  const metrics = METRICS_FOR[staff.department]
  const [metric, setMetric] = useState<Metric>(metrics[0])
  const [value, setValue] = useState('')
  const [period, setPeriod] = useState<Period>('monthly')
  const [effFrom, setEffFrom] = useState(TODAY)
  const [customLabel, setCustomLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const current = currentTargets(rows)
  const kind = METRIC[metric].kind

  async function add() {
    if (value.trim() === '' || isNaN(Number(value))) { setMsg('Enter the target as a number.'); return }
    if (metric === 'custom' && !customLabel.trim()) { setMsg('Name the custom target.'); return }
    setSaving(true); setMsg(null)
    try {
      const { error } = await supabase.from('staff_targets').insert({
        client_id: clientId, staff_id: staff.id, metric,
        metric_label: metric === 'custom' ? customLabel.trim() : null,
        target_value: Number(value), period, effective_from: effFrom,
      })
      if (error) throw error
      setValue(''); setCustomLabel('')
      onChanged()
    } catch (e: any) {
      setMsg(e?.message || 'Could not save the target.'); setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this target entry? Past periods it governed will no longer be graded against it.')) return
    const { error } = await supabase.from('staff_targets').delete().eq('id', id)
    if (error) { setMsg(error.message); return }
    onChanged()
  }

  return (
    <div style={{ padding: '1.1rem 1.3rem' }}>
      <div style={{ ...H('1rem'), marginBottom: '0.2rem' }}>Targets — {staff.full_name}</div>
      <div style={{ color: C.slate, fontSize: '0.82rem', marginBottom: '0.9rem' }}>
        Raise a target any time by adding a new row with a later start date. Old rows keep
        governing the periods before that date, so history stays fair.
      </div>

      {/* Current targets in force */}
      <div style={{ ...LABEL, marginBottom: 6 }}>In force now</div>
      {current.length === 0 ? (
        <div style={{ color: C.slate, fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.9rem' }}>No target set yet.</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '0.9rem' }}>
          {current.map(t => (
            <span key={t.id} style={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 700, color: C.navy, background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '0.2rem 0.55rem' }}>
              {fmtTarget(t, currency)} <span style={{ color: C.slate, fontWeight: 400 }}>· since {t.effective_from}</span>
            </span>
          ))}
        </div>
      )}

      {/* Add / raise */}
      {canManage && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.9rem 1rem', marginBottom: '1rem' }}>
          <div style={{ ...LABEL, marginBottom: 8 }}>Set or raise a target</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '0.7rem', alignItems: 'end' }}>
            <label style={{ display: 'block' }}>
              <div style={{ ...LABEL, marginBottom: 4 }}>Metric</div>
              <select style={{ ...inputStyle, width: '100%' }} value={metric} onChange={e => setMetric(e.target.value as Metric)}>
                {metrics.map(m => <option key={m} value={m}>{METRIC[m].label}</option>)}
              </select>
            </label>
            {metric === 'custom' && (
              <label style={{ display: 'block' }}>
                <div style={{ ...LABEL, marginBottom: 4 }}>Name it</div>
                <input style={{ ...inputStyle, width: '100%' }} value={customLabel} onChange={e => setCustomLabel(e.target.value)} placeholder="e.g. shops visited" />
              </label>
            )}
            <label style={{ display: 'block' }}>
              <div style={{ ...LABEL, marginBottom: 4 }}>{kind === 'percent' ? 'Percent (≥)' : kind === 'value' ? `Amount ${currency} (≥)` : 'How many (≥)'}</div>
              <input style={{ ...inputStyle, width: '100%', fontFamily: 'monospace' }} inputMode="numeric" value={value} onChange={e => setValue(e.target.value)} placeholder={kind === 'percent' ? '60' : '12'} />
            </label>
            <label style={{ display: 'block' }}>
              <div style={{ ...LABEL, marginBottom: 4 }}>Per</div>
              <select style={{ ...inputStyle, width: '100%' }} value={period} onChange={e => setPeriod(e.target.value as Period)}>
                {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label style={{ display: 'block' }}>
              <div style={{ ...LABEL, marginBottom: 4 }}>Starts from</div>
              <input type="date" style={{ ...inputStyle, width: '100%', fontFamily: 'monospace' }} value={effFrom} onChange={e => setEffFrom(e.target.value)} />
            </label>
            <button onClick={add} disabled={saving} style={{ ...btn(C.green, true), height: 34 }}>{saving ? 'Saving…' : 'Add target'}</button>
          </div>
          {msg && <div style={{ color: C.red, fontSize: '0.82rem', marginTop: 8 }}>{msg}</div>}
        </div>
      )}

      {/* Full history */}
      <div style={{ ...LABEL, marginBottom: 6 }}>Target history</div>
      {rows.length === 0 ? (
        <div style={{ color: C.slate, fontSize: '0.85rem', fontStyle: 'italic' }}>Nothing yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
            <thead><tr>
              <th style={th}>Metric</th><th style={th}>Target</th><th style={th}>Starts</th>{canManage && <th style={th}></th>}
            </tr></thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id}>
                  <td style={td}>{t.metric === 'custom' ? (t.metric_label || 'Custom') : METRIC[t.metric].label}</td>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{fmtTarget(t, currency)}</td>
                  <td style={{ ...td, fontFamily: 'monospace', color: t.effective_from > TODAY ? C.amber : C.slate }}>
                    {t.effective_from}{t.effective_from > TODAY ? ' (future)' : ''}
                  </td>
                  {canManage && <td style={td}><button onClick={() => remove(t.id)} style={btn(C.red)}>Remove</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Add / edit person (roster fields only) ───────────────────
function StaffForm({ clientId, allRows, existing, onClose, onSaved }: {
  clientId: string; allRows: Staff[]; existing?: Staff
  onClose: () => void; onSaved: () => void
}) {
  const isNew = !existing
  const [dept, setDept] = useState<Department>(existing?.department || 'sales_marketing')
  const [form, setForm] = useState({
    staff_code: existing?.staff_code || suggestCode(existing?.department || 'sales_marketing', allRows),
    full_name: existing?.full_name || '',
    phone: existing?.phone || '',
    active: existing?.active ?? true,
    notes: existing?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  function changeDept(d: Department) {
    setDept(d)
    setForm(f => ({ ...f, staff_code: isNew ? suggestCode(d, allRows) : f.staff_code }))
  }
  function set<K extends string>(k: K, v: any) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    const name = form.full_name.trim(); const code = form.staff_code.trim()
    if (!name) { setMsg('Please enter the person’s name.'); return }
    if (!code) { setMsg('Please enter a staff code.'); return }
    const clash = allRows.find(r => r.id !== existing?.id && r.staff_code.toLowerCase() === code.toLowerCase())
    if (clash) { setMsg(`Code “${code}” is already used by ${clash.full_name}.`); return }
    setSaving(true); setMsg(null)
    const payload: any = {
      client_id: clientId, staff_code: code, full_name: name, department: dept,
      phone: form.phone.trim() || null, active: form.active, notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }
    try {
      if (isNew) { const { error } = await supabase.from('staff').insert(payload); if (error) throw error }
      else { const { error } = await supabase.from('staff').update(payload).eq('id', existing!.id); if (error) throw error }
      onSaved()
    } catch (e: any) { setMsg(e?.message || 'Could not save. Please try again.'); setSaving(false) }
  }

  const wrap: React.CSSProperties = {
    background: C.cream, border: `1px solid ${C.border}`, borderRadius: 12,
    padding: '1.1rem 1.2rem', margin: isNew ? '0 0 1.2rem' : '0.4rem',
  }
  const field = (label: string, node: React.ReactNode) => (
    <label style={{ display: 'block' }}><div style={{ ...LABEL, marginBottom: 4 }}>{label}</div>{node}</label>
  )

  return (
    <div style={wrap}>
      <div style={{ ...H('1rem'), marginBottom: '0.9rem' }}>{isNew ? 'Add a person' : `Edit ${existing!.full_name}`}</div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {(['sales_marketing', 'operations'] as Department[]).map(d => (
          <button key={d} onClick={() => changeDept(d)} style={{
            fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
            padding: '0.45rem 0.95rem', borderRadius: 8,
            border: `1px solid ${dept === d ? C.cyan : C.border}`,
            background: dept === d ? C.cyan : 'transparent',
            color: dept === d ? 'var(--cv-on-accent)' : C.slate,
          }}>{DEPT_LABEL[d]}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.8rem', marginBottom: '0.9rem' }}>
        {field('Full name', <input style={{ ...inputStyle, width: '100%' }} value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="e.g. Amina Bello" />)}
        {field('Staff code', <input style={{ ...inputStyle, width: '100%', fontFamily: 'monospace' }} value={form.staff_code} onChange={e => set('staff_code', e.target.value)} />)}
        {field('Phone (optional)', <input style={{ ...inputStyle, width: '100%' }} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="080…" />)}
      </div>
      <div style={{ marginBottom: '0.9rem' }}>
        {field('Notes (optional)', <input style={{ ...inputStyle, width: '100%' }} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Anything worth remembering" />)}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.86rem', color: C.navy, cursor: 'pointer' }}>
        <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />
        Active (uncheck for someone who has left or is on hold)
      </label>
      <div style={{ color: C.slate, fontSize: '0.8rem', marginBottom: '1rem' }}>
        Set this person’s targets with the <strong style={{ color: C.navy }}>Targets</strong> button on their row after saving.
      </div>
      {msg && <div style={{ color: C.red, fontSize: '0.84rem', marginBottom: '0.7rem' }}>{msg}</div>}
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button onClick={save} disabled={saving} style={btn(C.green, true)}>{saving ? 'Saving…' : isNew ? 'Add person' : 'Save changes'}</button>
        <button onClick={onClose} disabled={saving} style={btn(C.slate)}>Cancel</button>
      </div>
    </div>
  )
}
