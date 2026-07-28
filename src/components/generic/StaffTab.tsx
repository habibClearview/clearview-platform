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
//                         SOURCE a customer). Measured on conversion.
//   • Operations        — shopkeepers / till staff who SERVE a sale.
//                         Measured on throughput + repeat business.
//
// Every person gets a stable staff code (SM01, OP01 …) and a target
// (HR: "all staff get some sort of target"). Downstream — sourcing
// attribution, recruitment log, attendance, KPI scorecards — all key off
// staff.id.
//
// Backed by supabase/migrations/2026_07_28_staff.sql (table `staff`,
// client-scoped via RLS; created_by_uid defaults to auth.uid()).
//
// Prop contract (wired in by GenericDashboard): { config, clientId, cc, P }
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
type TargetMetric = 'customers_recruited' | 'conversions' | 'sales_value' | 'sales_count' | 'repeat_rate' | 'custom'
type TargetPeriod = 'weekly' | 'monthly' | 'quarterly'

interface Staff {
  id: string
  staff_code: string
  full_name: string
  department: Department
  phone: string | null
  active: boolean
  notes: string | null
  target_value: number | null
  target_metric: TargetMetric
  target_metric_label: string | null
  target_period: TargetPeriod
  created_at: string
}

// ── Labels ───────────────────────────────────────────────────
const DEPT_LABEL: Record<Department, string> = {
  sales_marketing: 'Sales & Marketing',
  operations: 'Operations',
}
const DEPT_BLURB: Record<Department, string> = {
  sales_marketing: 'Go out and recruit customers — measured on turning leads into buyers.',
  operations: 'Run the shop and serve sales — measured on throughput and keeping customers coming back.',
}
const METRIC_LABEL: Record<TargetMetric, string> = {
  customers_recruited: 'Customers recruited',
  conversions: 'Conversions (lead → client)',
  sales_value: 'Sales value',
  sales_count: 'Number of sales',
  repeat_rate: 'Repeat-business rate (%)',
  custom: 'Custom…',
}
// Which target metrics make sense for each department (first is the default).
const METRICS_FOR: Record<Department, TargetMetric[]> = {
  sales_marketing: ['customers_recruited', 'conversions', 'sales_value', 'custom'],
  operations: ['sales_value', 'sales_count', 'repeat_rate', 'custom'],
}
const PERIODS: TargetPeriod[] = ['weekly', 'monthly', 'quarterly']

// Human-readable target, e.g. "12 customers recruited / month".
function targetText(s: Staff, cc: string): string {
  if (s.target_value == null) return '—'
  const per = s.target_period === 'monthly' ? 'month' : s.target_period === 'weekly' ? 'week' : 'quarter'
  if (s.target_metric === 'sales_value') return `${cc} ${Number(s.target_value).toLocaleString()} / ${per}`
  if (s.target_metric === 'repeat_rate') return `${s.target_value}% repeat / ${per}`
  const label = s.target_metric === 'custom'
    ? (s.target_metric_label || 'custom')
    : METRIC_LABEL[s.target_metric].toLowerCase()
  return `${Number(s.target_value).toLocaleString()} ${label} / ${per}`
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
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)   // staff id being edited, or 'new'
  const canManage = !!(P?.canManageTeam ?? true)

  async function load() {
    setLoading(true); setErr(null)
    try {
      const { data, error } = await supabase
        .from('staff').select('*').eq('client_id', clientId)
        .order('department', { ascending: true }).order('staff_code', { ascending: true })
      if (error) throw error
      setRows((data as Staff[]) || [])
    } catch (e: any) {
      setErr(e?.message || 'Could not load the team roster.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { if (clientId) load() /* eslint-disable-next-line */ }, [clientId])

  const byDept = useMemo(() => ({
    sales_marketing: rows.filter(r => r.department === 'sales_marketing'),
    operations: rows.filter(r => r.department === 'operations'),
  }), [rows])

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <div style={H('1.35rem')}>Staff</div>
        <div style={{ color: C.slate, fontSize: '0.9rem', marginTop: 4, maxWidth: 720 }}>
          One roster for everyone in the business, split into the two departments that run it.
          Each person has a stable code and a target. This list is what sales, recruitment,
          attendance and the scorecards all point back to — so credit and performance always
          land on the right person.
        </div>
      </div>

      {err && <div style={{ ...CARD, borderColor: C.red, color: C.red, fontSize: '0.88rem' }}>{err}</div>}

      {loading ? (
        <div style={{ ...CARD, color: C.slate, textAlign: 'center' }}>Loading…</div>
      ) : (
        <>
          {canManage && editing !== 'new' && (
            <button onClick={() => setEditing('new')} style={{ ...btn(C.cyan, true), marginBottom: '1.1rem' }}>
              + Add a person
            </button>
          )}
          {editing === 'new' && (
            <StaffForm
              clientId={clientId} currency={currency} allRows={rows}
              onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }}
            />
          )}

          {(['sales_marketing', 'operations'] as Department[]).map(dept => (
            <DeptSection
              key={dept} dept={dept} rows={byDept[dept]} currency={currency}
              canManage={canManage} editing={editing} setEditing={setEditing}
              allRows={rows} clientId={clientId} onChanged={load}
            />
          ))}
        </>
      )}
    </div>
  )
}

// ── One department block ─────────────────────────────────────
function DeptSection({ dept, rows, currency, canManage, editing, setEditing, allRows, clientId, onChanged }: {
  dept: Department; rows: Staff[]; currency: string; canManage: boolean
  editing: string | null; setEditing: (v: string | null) => void
  allRows: Staff[]; clientId: string; onChanged: () => void
}) {
  const activeCount = rows.filter(r => r.active).length
  const withTarget = rows.filter(r => r.target_value != null).length
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
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead><tr>
              <th style={th}>Code</th><th style={th}>Name</th><th style={th}>Phone</th>
              <th style={th}>Target</th><th style={th}>Status</th>{canManage && <th style={th}></th>}
            </tr></thead>
            <tbody>
              {rows.map(s => editing === s.id ? (
                <tr key={s.id}><td style={{ ...td, padding: 0 }} colSpan={canManage ? 6 : 5}>
                  <StaffForm
                    clientId={clientId} currency={currency} allRows={allRows} existing={s}
                    onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged() }}
                  />
                </td></tr>
              ) : (
                <tr key={s.id} style={{ opacity: s.active ? 1 : 0.55 }}>
                  <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700 }}>{s.staff_code}</td>
                  <td style={td}>{s.full_name}</td>
                  <td style={{ ...td, fontFamily: 'monospace', color: C.slate }}>{s.phone || '—'}</td>
                  <td style={td}>{targetText(s, currency)}</td>
                  <td style={td}>{s.active ? <Badge text="ACTIVE" tone={C.green} /> : <Badge text="INACTIVE" tone={C.slate} />}</td>
                  {canManage && (
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <button onClick={() => setEditing(s.id)} style={{ ...btn(C.cyan), marginRight: 6 }}>Edit</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Add / edit form ──────────────────────────────────────────
function StaffForm({ clientId, currency, allRows, existing, onClose, onSaved }: {
  clientId: string; currency: string; allRows: Staff[]; existing?: Staff
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
    target_value: existing?.target_value != null ? String(existing.target_value) : '',
    target_metric: (existing?.target_metric || METRICS_FOR[existing?.department || 'sales_marketing'][0]) as TargetMetric,
    target_metric_label: existing?.target_metric_label || '',
    target_period: (existing?.target_period || 'monthly') as TargetPeriod,
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // When the department changes on a NEW row, resuggest the code + default metric.
  function changeDept(d: Department) {
    setDept(d)
    setForm(f => ({
      ...f,
      staff_code: isNew ? suggestCode(d, allRows) : f.staff_code,
      target_metric: METRICS_FOR[d].includes(f.target_metric) ? f.target_metric : METRICS_FOR[d][0],
    }))
  }

  function set<K extends string>(k: K, v: any) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    const name = form.full_name.trim()
    const code = form.staff_code.trim()
    if (!name) { setMsg('Please enter the person’s name.'); return }
    if (!code) { setMsg('Please enter a staff code.'); return }
    // Guard the per-client unique code client-side for a friendly message
    // (the DB unique index is the real enforcement).
    const clash = allRows.find(r => r.id !== existing?.id && r.staff_code.toLowerCase() === code.toLowerCase())
    if (clash) { setMsg(`Code “${code}” is already used by ${clash.full_name}.`); return }

    setSaving(true); setMsg(null)
    const payload: any = {
      client_id: clientId,
      staff_code: code,
      full_name: name,
      department: dept,
      phone: form.phone.trim() || null,
      active: form.active,
      notes: form.notes.trim() || null,
      target_value: form.target_value.trim() === '' ? null : Number(form.target_value),
      target_metric: form.target_metric,
      target_metric_label: form.target_metric === 'custom' ? (form.target_metric_label.trim() || null) : null,
      target_period: form.target_period,
      updated_at: new Date().toISOString(),
    }
    try {
      if (isNew) {
        const { error } = await supabase.from('staff').insert(payload)
        if (error) throw error
      } else {
        const { error } = await supabase.from('staff').update(payload).eq('id', existing!.id)
        if (error) throw error
      }
      onSaved()
    } catch (e: any) {
      setMsg(e?.message || 'Could not save. Please try again.')
      setSaving(false)
    }
  }

  const wrap: React.CSSProperties = {
    background: C.cream, border: `1px solid ${C.border}`, borderRadius: 12,
    padding: '1.1rem 1.2rem', margin: isNew ? '0 0 1.2rem' : '0.4rem',
  }
  const field = (label: string, node: React.ReactNode) => (
    <label style={{ display: 'block' }}>
      <div style={{ ...LABEL, marginBottom: 4 }}>{label}</div>{node}
    </label>
  )

  return (
    <div style={wrap}>
      <div style={{ ...H('1rem'), marginBottom: '0.9rem' }}>{isNew ? 'Add a person' : `Edit ${existing!.full_name}`}</div>

      {/* Department picker */}
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

      {/* Target */}
      <div style={{ ...LABEL, marginBottom: 6 }}>Target</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '0.8rem', marginBottom: '0.9rem' }}>
        {field(form.target_metric === 'sales_value' ? `Amount (${currency})` : form.target_metric === 'repeat_rate' ? 'Percent' : 'How many',
          <input style={{ ...inputStyle, width: '100%', fontFamily: 'monospace' }} inputMode="numeric" value={form.target_value} onChange={e => set('target_value', e.target.value)} placeholder="e.g. 12" />)}
        {field('Measured in',
          <select style={{ ...inputStyle, width: '100%' }} value={form.target_metric} onChange={e => set('target_metric', e.target.value)}>
            {METRICS_FOR[dept].map(m => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
          </select>)}
        {field('Per',
          <select style={{ ...inputStyle, width: '100%' }} value={form.target_period} onChange={e => set('target_period', e.target.value)}>
            {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>)}
      </div>
      {form.target_metric === 'custom' && (
        <div style={{ marginBottom: '0.9rem' }}>
          {field('Name the custom target', <input style={{ ...inputStyle, width: '100%' }} value={form.target_metric_label} onChange={e => set('target_metric_label', e.target.value)} placeholder="e.g. shops visited" />)}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.8rem', marginBottom: '0.9rem' }}>
        {field('Notes (optional)', <input style={{ ...inputStyle, width: '100%' }} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Anything worth remembering" />)}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.86rem', color: C.navy, cursor: 'pointer' }}>
        <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />
        Active (uncheck for someone who has left or is on hold)
      </label>

      {msg && <div style={{ color: C.red, fontSize: '0.84rem', marginBottom: '0.7rem' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button onClick={save} disabled={saving} style={btn(C.green, true)}>{saving ? 'Saving…' : isNew ? 'Add person' : 'Save changes'}</button>
        <button onClick={onClose} disabled={saving} style={btn(C.slate)}>Cancel</button>
      </div>
    </div>
  )
}
