'use client'

// ─────────────────────────────────────────────────────────────
// BUSINESS › Staff  (Human Resources — per-client dashboard section)
//
// The canonical people roster for a client's business — the single list
// that every other feature attributes work to.
//
// Departments are now CLIENT-DEFINED (table `departments`): each business
// names its own — Finance, Marketing, whatever suits them — and the roster
// groups staff under them. Two starter departments (Sales & Marketing,
// Operations) are seeded, but the client can add/rename/remove freely.
// staff.department holds the department NAME (kept in step with the list).
//
// Targets are effective-dated + per-metric (staff_targets), raised any time;
// each period is graded against the target that applied then, so performance
// is undisputable numbers.
//
// Backed by:
//   supabase/migrations/2026_07_28_staff.sql          (staff)
//   supabase/migrations/2026_07_28_staff_targets.sql  (staff_targets)
//   supabase/migrations/2026_07_29_departments.sql    (departments)
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
  fontFamily: 'var(--cv-font)', fontWeight: 700, color: C.navy, fontSize: size,
})
const LABEL: React.CSSProperties = {
  fontFamily: 'var(--cv-font-mono)', fontSize: '0.72rem', letterSpacing: '0.04em',
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
    ? { fontFamily: 'var(--cv-font-mono)', fontSize: '0.82rem', fontWeight: 700, padding: '0.42rem 0.9rem', border: 'none', borderRadius: 7, background: color, color: 'var(--cv-on-accent)', cursor: 'pointer' }
    : { fontFamily: 'var(--cv-font-mono)', fontSize: '0.82rem', padding: '0.42rem 0.9rem', border: `1px solid ${color}`, borderRadius: 7, background: 'transparent', color, cursor: 'pointer' }
}
function Badge({ text, tone }: { text: string; tone: string }) {
  return (
    <span style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.72rem', fontWeight: 700, color: tone, border: `1px solid ${tone}`, borderRadius: 6, padding: '0.1rem 0.45rem', whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

// ── Types ────────────────────────────────────────────────────
type Metric =
  | 'new_customers' | 'lead_conversion' | 'prospect_conversion'
  | 'sales_value' | 'sales_count' | 'repeat_rate' | 'attendance_rate' | 'custom'
type Period = 'weekly' | 'monthly' | 'quarterly'

interface Department { id: string; name: string; kind: string | null; sort_order: number; active: boolean }
interface Staff {
  id: string; staff_code: string; full_name: string; department: string
  phone: string | null; active: boolean; notes: string | null; created_at: string
}
interface Target {
  id: string; staff_id: string; metric: Metric; metric_label: string | null
  target_value: number; period: Period; effective_from: string; notes: string | null; created_at: string
}

// ── Metric config (numeric, objective) ───────────────────────
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
// Any department can be given any target — the manager picks what's relevant.
const ALL_METRICS: Metric[] = ['new_customers', 'lead_conversion', 'prospect_conversion', 'sales_value', 'sales_count', 'repeat_rate', 'attendance_rate', 'custom']
const PERIODS: Period[] = ['weekly', 'monthly', 'quarterly']
const perWord = (p: Period) => (p === 'monthly' ? 'mo' : p === 'weekly' ? 'wk' : 'qtr')
const TONES = ['var(--cv-cyan)', 'var(--cv-amber)', 'var(--cv-green)', 'var(--cv-purple, #8B5CF6)', 'var(--cv-teal, #14B8A6)', 'var(--cv-red)']
const TODAY = new Date().toISOString().slice(0, 10)

function fmtTarget(t: Target, cc: string): string {
  const m = METRIC[t.metric]; const per = perWord(t.period)
  const label = t.metric === 'custom' ? (t.metric_label || 'target') : m.label.toLowerCase()
  if (m.kind === 'percent') return `${m.label}: ≥ ${t.target_value}%/${per}`
  if (m.kind === 'value') return `${m.label}: ≥ ${cc ? cc + ' ' : ''}${Number(t.target_value).toLocaleString()}/${per}`
  const unit = t.metric === 'custom' ? label : (m.unit || '')
  return `${t.metric === 'custom' ? label : m.label}: ≥ ${Number(t.target_value).toLocaleString()} ${unit}/${per}`
}
function currentTargets(all: Target[]): Target[] {
  const byMetric = new Map<Metric, Target>()
  for (const t of all) {
    if (t.effective_from > TODAY) continue
    const prev = byMetric.get(t.metric)
    if (!prev || t.effective_from > prev.effective_from) byMetric.set(t.metric, t)
  }
  return Array.from(byMetric.values())
}
// Stable staff code prefix from a department name: initials, e.g.
// "Sales & Marketing" → SM, "Operations" → OP, "Finance" → FI.
function deptPrefix(name: string): string {
  const words = (name || '').trim().split(/\s+/).filter(w => /[a-z]/i.test(w))
  let p = 'ST'
  if (words.length >= 2) p = words[0][0] + words[1][0]
  else if (words.length === 1) p = words[0].slice(0, 2)
  return (p.toUpperCase().replace(/[^A-Z]/g, '') || 'ST')
}
function suggestCode(deptName: string, all: Staff[]): string {
  const prefix = deptPrefix(deptName)
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
  const [depts, setDepts] = useState<Department[]>([])
  const [targets, setTargets] = useState<Target[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)      // staff id, or 'new'
  const [targetsFor, setTargetsFor] = useState<string | null>(null)
  const canManage = !!(P?.canManageTeam ?? true)

  async function load() {
    setLoading(true); setErr(null)
    try {
      let [sRes, tRes, dRes] = await Promise.all([
        supabase.from('staff').select('*').eq('client_id', clientId).order('staff_code', { ascending: true }),
        supabase.from('staff_targets').select('*').eq('client_id', clientId).order('effective_from', { ascending: false }),
        supabase.from('departments').select('*').eq('client_id', clientId).order('sort_order', { ascending: true }).order('name', { ascending: true }),
      ])
      if (sRes.error) throw sRes.error
      if (tRes.error) throw tRes.error
      if (dRes.error) throw dRes.error
      // Seed the two starter departments if this client has none yet (covers
      // clients created after the migration). Unique index makes it safe.
      if (((dRes.data as Department[]) || []).length === 0 && canManage) {
        await supabase.from('departments').insert([
          { client_id: clientId, name: 'Sales & Marketing', kind: 'sales', sort_order: 1 },
          { client_id: clientId, name: 'Operations', kind: 'service', sort_order: 2 },
        ])
        const re = await supabase.from('departments').select('*').eq('client_id', clientId).order('sort_order', { ascending: true })
        if (!re.error) dRes = re
      }
      setRows((sRes.data as Staff[]) || [])
      setTargets((tRes.data as Target[]) || [])
      setDepts((dRes.data as Department[]) || [])
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

  const activeDepts = depts.filter(d => d.active)
  // Staff whose department no longer matches any active department (e.g. a
  // department was removed) surface under "Unassigned" so no one vanishes.
  const knownNames = new Set(depts.map(d => d.name.toLowerCase()))
  const orphanStaff = rows.filter(r => !r.department || !knownNames.has(r.department.toLowerCase()))

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <div style={H('1.35rem')}>Staff</div>
        <div style={{ color: C.slate, fontSize: '0.9rem', marginTop: 4, maxWidth: 760 }}>
          Everyone in the business, grouped by <strong>your own departments</strong> — name them
          however suits you. Each person has a stable code and dated targets; targets can be raised
          any time and each period is scored against the target that applied then, so performance is
          undisputable numbers.
        </div>
      </div>

      {err && <div style={{ ...CARD, borderColor: C.red, color: C.red, fontSize: '0.88rem' }}>{err}</div>}

      {loading ? (
        <div style={{ ...CARD, color: C.slate, textAlign: 'center' }}>Loading…</div>
      ) : (
        <>
          {canManage && <DepartmentsManager depts={depts} rows={rows} clientId={clientId} onChanged={load} />}

          {canManage && editing !== 'new' && (
            <button onClick={() => { setEditing('new'); setTargetsFor(null) }}
              disabled={activeDepts.length === 0}
              title={activeDepts.length === 0 ? 'Add a department first' : ''}
              style={{ ...btn(C.cyan, true), marginBottom: '1.1rem', opacity: activeDepts.length === 0 ? 0.5 : 1 }}>
              + Add a person
            </button>
          )}
          {editing === 'new' && (
            <StaffForm clientId={clientId} allRows={rows} depts={activeDepts}
              onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
          )}

          {activeDepts.map((dept, i) => (
            <DeptSection
              key={dept.id} deptName={dept.name} tone={TONES[i % TONES.length]}
              rows={rows.filter(r => r.department && r.department.toLowerCase() === dept.name.toLowerCase())}
              currency={currency} clientId={clientId} canManage={canManage} allRows={rows} depts={activeDepts}
              targetsByStaff={targetsByStaff} editing={editing} setEditing={setEditing}
              targetsFor={targetsFor} setTargetsFor={setTargetsFor} onChanged={load}
            />
          ))}
          {orphanStaff.length > 0 && (
            <DeptSection
              deptName="Unassigned" tone={C.slate} rows={orphanStaff} currency={currency} clientId={clientId}
              canManage={canManage} allRows={rows} depts={activeDepts} targetsByStaff={targetsByStaff}
              editing={editing} setEditing={setEditing} targetsFor={targetsFor} setTargetsFor={setTargetsFor}
              onChanged={load}
            />
          )}
        </>
      )}
    </div>
  )
}

// ── Departments manager ──────────────────────────────────────
function DepartmentsManager({ depts, rows, clientId, onChanged }: {
  depts: Department[]; rows: Staff[]; clientId: string; onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const countFor = (name: string) => rows.filter(r => r.department && r.department.toLowerCase() === name.toLowerCase()).length

  async function add() {
    const name = newName.trim()
    if (!name) { setMsg('Type a department name.'); return }
    if (depts.some(d => d.name.toLowerCase() === name.toLowerCase())) { setMsg(`"${name}" already exists.`); return }
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('departments').insert({ client_id: clientId, name, sort_order: depts.length + 1 })
    setBusy(false)
    if (error) { setMsg(error.message); return }
    setNewName(''); onChanged()
  }
  async function rename(d: Department) {
    const name = editName.trim()
    if (!name) { setMsg('Name cannot be empty.'); return }
    if (depts.some(x => x.id !== d.id && x.name.toLowerCase() === name.toLowerCase())) { setMsg(`"${name}" already exists.`); return }
    setBusy(true); setMsg(null)
    // Rename the department AND every staff member sitting in it (department is
    // stored as the name), so the group keeps its people.
    const r1 = await supabase.from('departments').update({ name, updated_at: new Date().toISOString() }).eq('id', d.id)
    if (r1.error) { setBusy(false); setMsg(r1.error.message); return }
    await supabase.from('staff').update({ department: name }).eq('client_id', clientId).eq('department', d.name)
    setBusy(false); setEditId(null); setEditName(''); onChanged()
  }
  async function remove(d: Department) {
    const n = countFor(d.name)
    if (n > 0) { setMsg(`Move or remove the ${n} person(s) in "${d.name}" first.`); return }
    if (!window.confirm(`Remove the "${d.name}" department?`)) return
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('departments').delete().eq('id', d.id)
    setBusy(false)
    if (error) { setMsg(error.message); return }
    onChanged()
  }

  return (
    <div style={{ ...CARD, background: C.cream }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={H('1.05rem')}>Departments <span style={{ ...LABEL, fontSize: '0.7rem' }}>· {depts.length}</span></div>
        <button style={btn(C.cyan)}>{open ? 'Close' : 'Manage departments'}</button>
      </div>
      {open && (
        <div style={{ marginTop: '0.9rem' }}>
          <div style={{ color: C.slate, fontSize: '0.84rem', marginBottom: '0.8rem' }}>
            Name your departments however suits this business. Staff and their targets sit under these.
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
            <input style={{ ...inputStyle, minWidth: 200 }} value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder="e.g. Finance, Logistics, Procurement…" />
            <button onClick={add} disabled={busy} style={btn(C.green, true)}>+ Add department</button>
          </div>
          {msg && <div style={{ color: C.red, fontSize: '0.82rem', marginBottom: '0.7rem' }}>{msg}</div>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
              <thead><tr><th style={th}>Department</th><th style={th}>People</th><th style={th}></th></tr></thead>
              <tbody>
                {depts.map(d => (
                  <tr key={d.id}>
                    <td style={td}>
                      {editId === d.id
                        ? <input autoFocus style={{ ...inputStyle, width: '100%' }} value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') rename(d); if (e.key === 'Escape') setEditId(null) }} />
                        : <span style={{ fontWeight: 600 }}>{d.name}</span>}
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--cv-font-mono)' }}>{countFor(d.name)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {editId === d.id ? (
                        <>
                          <button onClick={() => rename(d)} disabled={busy} style={{ ...btn(C.green, true), marginRight: 6 }}>Save</button>
                          <button onClick={() => setEditId(null)} style={btn(C.slate)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditId(d.id); setEditName(d.name); setMsg(null) }} style={{ ...btn(C.cyan), marginRight: 6 }}>Rename</button>
                          <button onClick={() => remove(d)} style={btn(C.red)}>Remove</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── One department block ─────────────────────────────────────
function DeptSection({ deptName, tone, rows, currency, clientId, canManage, allRows, depts, targetsByStaff, editing, setEditing, targetsFor, setTargetsFor, onChanged }: {
  deptName: string; tone: string; rows: Staff[]; currency: string; clientId: string; canManage: boolean
  allRows: Staff[]; depts: Department[]; targetsByStaff: Map<string, Target[]>
  editing: string | null; setEditing: (v: string | null) => void
  targetsFor: string | null; setTargetsFor: (v: string | null) => void; onChanged: () => void
}) {
  const activeCount = rows.filter(r => r.active).length
  const withTarget = rows.filter(r => currentTargets(targetsByStaff.get(r.id) || []).length > 0).length

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
        <div style={H('1.1rem')}>{deptName}</div>
        <div style={{ ...LABEL, color: tone }}>{activeCount} active · {withTarget}/{rows.length} with a target</div>
      </div>

      {rows.length === 0 ? (
        <div style={{ color: C.slate, fontSize: '0.86rem', fontStyle: 'italic' }}>No one here yet.</div>
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
                    <StaffForm clientId={clientId} allRows={allRows} depts={depts} existing={s}
                      onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged() }} />
                  </td></tr>
                )
                return (
                  <Fragment key={s.id}>
                    <tr style={{ opacity: s.active ? 1 : 0.55 }}>
                      <td style={{ ...td, fontFamily: 'var(--cv-font-mono)', fontWeight: 700 }}>{s.staff_code}</td>
                      <td style={td}>{s.full_name}</td>
                      <td style={{ ...td, fontFamily: 'var(--cv-font-mono)', color: C.slate }}>{s.phone || '—'}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                          {current.map(t => (
                            <span key={t.id} style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.74rem', color: tone, border: `1px solid ${tone}`, borderRadius: 6, padding: '0.08rem 0.4rem' }}>
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
                        <TargetsPanel staff={s} rows={staffTargets} currency={currency} clientId={clientId} canManage={canManage} onChanged={onChanged} />
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
  const [metric, setMetric] = useState<Metric>(ALL_METRICS[0])
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
      setValue(''); setCustomLabel(''); onChanged()
    } catch (e: any) { setMsg(e?.message || 'Could not save the target.'); setSaving(false) }
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
        Raise a target any time by adding a new row with a later start date. Old rows keep governing
        the periods before that date, so history stays fair.
      </div>

      <div style={{ ...LABEL, marginBottom: 6 }}>In force now</div>
      {current.length === 0 ? (
        <div style={{ color: C.slate, fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.9rem' }}>No target set yet.</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '0.9rem' }}>
          {current.map(t => (
            <span key={t.id} style={{ fontFamily: 'var(--cv-font-mono)', fontSize: '0.78rem', fontWeight: 700, color: C.navy, background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '0.2rem 0.55rem' }}>
              {fmtTarget(t, currency)} <span style={{ color: C.slate, fontWeight: 400 }}>· since {t.effective_from}</span>
            </span>
          ))}
        </div>
      )}

      {canManage && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.9rem 1rem', marginBottom: '1rem' }}>
          <div style={{ ...LABEL, marginBottom: 8 }}>Set or raise a target</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '0.7rem', alignItems: 'end' }}>
            <label style={{ display: 'block' }}>
              <div style={{ ...LABEL, marginBottom: 4 }}>Metric</div>
              <select style={{ ...inputStyle, width: '100%' }} value={metric} onChange={e => setMetric(e.target.value as Metric)}>
                {ALL_METRICS.map(m => <option key={m} value={m}>{METRIC[m].label}</option>)}
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
              <input style={{ ...inputStyle, width: '100%', fontFamily: 'var(--cv-font-mono)' }} inputMode="numeric" value={value} onChange={e => setValue(e.target.value)} placeholder={kind === 'percent' ? '60' : '12'} />
            </label>
            <label style={{ display: 'block' }}>
              <div style={{ ...LABEL, marginBottom: 4 }}>Per</div>
              <select style={{ ...inputStyle, width: '100%' }} value={period} onChange={e => setPeriod(e.target.value as Period)}>
                {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label style={{ display: 'block' }}>
              <div style={{ ...LABEL, marginBottom: 4 }}>Starts from</div>
              <input type="date" style={{ ...inputStyle, width: '100%', fontFamily: 'var(--cv-font-mono)' }} value={effFrom} onChange={e => setEffFrom(e.target.value)} />
            </label>
            <button onClick={add} disabled={saving} style={{ ...btn(C.green, true), height: 34 }}>{saving ? 'Saving…' : 'Add target'}</button>
          </div>
          {msg && <div style={{ color: C.red, fontSize: '0.82rem', marginTop: 8 }}>{msg}</div>}
        </div>
      )}

      <div style={{ ...LABEL, marginBottom: 6 }}>Target history</div>
      {rows.length === 0 ? (
        <div style={{ color: C.slate, fontSize: '0.85rem', fontStyle: 'italic' }}>Nothing yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
            <thead><tr><th style={th}>Metric</th><th style={th}>Target</th><th style={th}>Starts</th>{canManage && <th style={th}></th>}</tr></thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id}>
                  <td style={td}>{t.metric === 'custom' ? (t.metric_label || 'Custom') : METRIC[t.metric].label}</td>
                  <td style={{ ...td, fontFamily: 'var(--cv-font-mono)' }}>{fmtTarget(t, currency)}</td>
                  <td style={{ ...td, fontFamily: 'var(--cv-font-mono)', color: t.effective_from > TODAY ? C.amber : C.slate }}>
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

// ── Add / edit person ────────────────────────────────────────
function StaffForm({ clientId, allRows, depts, existing, onClose, onSaved }: {
  clientId: string; allRows: Staff[]; depts: Department[]; existing?: Staff
  onClose: () => void; onSaved: () => void
}) {
  const isNew = !existing
  const firstDept = existing?.department || depts[0]?.name || ''
  const [dept, setDept] = useState<string>(firstDept)
  const [form, setForm] = useState({
    staff_code: existing?.staff_code || suggestCode(firstDept, allRows),
    full_name: existing?.full_name || '',
    phone: existing?.phone || '',
    active: existing?.active ?? true,
    notes: existing?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  function changeDept(name: string) {
    setDept(name)
    setForm(f => ({ ...f, staff_code: isNew ? suggestCode(name, allRows) : f.staff_code }))
  }
  function set<K extends string>(k: K, v: any) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    const name = form.full_name.trim(); const code = form.staff_code.trim()
    if (!name) { setMsg('Please enter the person’s name.'); return }
    if (!code) { setMsg('Please enter a staff code.'); return }
    if (!dept) { setMsg('Pick a department.'); return }
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.8rem', marginBottom: '0.9rem' }}>
        {field('Department', (
          <select style={{ ...inputStyle, width: '100%' }} value={dept} onChange={e => changeDept(e.target.value)}>
            {depts.length === 0 && <option value="">— add a department first —</option>}
            {depts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        ))}
        {field('Full name', <input style={{ ...inputStyle, width: '100%' }} value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="e.g. Amina Bello" />)}
        {field('Staff code', <input style={{ ...inputStyle, width: '100%', fontFamily: 'var(--cv-font-mono)' }} value={form.staff_code} onChange={e => set('staff_code', e.target.value)} />)}
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
        Set this person’s targets with the <strong style={{ color: C.navy }}>Set targets</strong> button on their row after saving.
      </div>
      {msg && <div style={{ color: C.red, fontSize: '0.84rem', marginBottom: '0.7rem' }}>{msg}</div>}
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button onClick={save} disabled={saving} style={btn(C.green, true)}>{saving ? 'Saving…' : isNew ? 'Add person' : 'Save changes'}</button>
        <button onClick={onClose} disabled={saving} style={btn(C.slate)}>Cancel</button>
      </div>
    </div>
  )
}
