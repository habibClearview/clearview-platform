'use client'

// ─────────────────────────────────────────────────────────────
// HUMAN RESOURCES › Attendance  (per-client dashboard section)
//
// A daily register: mark each active staff member present / late / absent,
// with a monthly on-time summary per person. One row per staff per day
// (upsert on staff_id+day). Backed by supabase/migrations/2026_07_30_attendance.sql.
//
// This is the manager-marked register. The field-app SELF clock-in (GPS proof
// of place) will write to the SAME table later — nothing here changes when it
// lands.
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
const CARD: React.CSSProperties = { background: C.card, border: `1px solid ${C.borderSoft}`, borderRadius: 14, padding: '1.3rem 1.5rem', marginBottom: '1.35rem' }
const H = (s = '1.15rem'): React.CSSProperties => ({ fontFamily: 'var(--cv-font)', fontWeight: 700, color: C.navy, fontSize: s })
const LABEL: React.CSSProperties = { fontFamily: 'var(--cv-font-mono)', fontSize: '0.72rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: C.slate }
const inputStyle: React.CSSProperties = { fontFamily: 'inherit', fontSize: '0.9rem', padding: '0.45rem 0.6rem', border: `1px solid ${C.border}`, borderRadius: 7, background: C.card, color: C.navy }
const th: React.CSSProperties = { ...LABEL, textAlign: 'left', padding: '0.5rem 0.7rem', borderBottom: `1px solid ${C.border}` }
const td: React.CSSProperties = { padding: '0.5rem 0.7rem', fontSize: '0.88rem', color: C.navy, borderBottom: `1px solid ${C.borderSoft}` }

type Status = 'present' | 'late' | 'absent'
interface Staff { id: string; staff_code: string; full_name: string; department: string; active: boolean }
interface Att { id: string; staff_id: string; day: string; status: Status }

const TODAY = new Date().toISOString().slice(0, 10)
const STATUS: { key: Status; label: string; tone: string }[] = [
  { key: 'present', label: 'Present', tone: C.green },
  { key: 'late', label: 'Late', tone: C.amber },
  { key: 'absent', label: 'Absent', tone: C.red },
]

export default function AttendanceTab({ config, clientId, cc, P }: any) {
  void config; void cc
  const [day, setDay] = useState(TODAY)
  const [staff, setStaff] = useState<Staff[]>([])
  const [rows, setRows] = useState<Att[]>([])   // whole selected month
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [needsMigration, setNeedsMigration] = useState(false)
  const canManage = !!(P?.canManageTeam ?? true)

  const month = day.slice(0, 7)
  const monthStart = `${month}-01`
  // First day of next month, as an exclusive upper bound.
  const nextMonth = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m, 1) // m is 1-based → Date month index m = next month
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }, [month])

  async function load() {
    setLoading(true); setErr(null); setNeedsMigration(false)
    try {
      const sRes = await supabase.from('staff').select('id,staff_code,full_name,department,active').eq('client_id', clientId).eq('active', true).order('department').order('staff_code')
      if (sRes.error) throw sRes.error
      setStaff((sRes.data as Staff[]) || [])
      const aRes = await supabase.from('attendance').select('id,staff_id,day,status').eq('client_id', clientId).gte('day', monthStart).lt('day', nextMonth)
      if (aRes.error) {
        // Table not created yet → guide the user, don't crash.
        if ((aRes.error as any).code === '42P01' || /attendance/i.test(aRes.error.message)) { setNeedsMigration(true); setRows([]) }
        else throw aRes.error
      } else setRows((aRes.data as Att[]) || [])
    } catch (e: any) {
      setErr(e?.message || 'Could not load attendance.')
    } finally { setLoading(false) }
  }
  useEffect(() => { if (clientId) load() /* eslint-disable-next-line */ }, [clientId, month])

  const statusFor = (staffId: string, d: string) => rows.find(r => r.staff_id === staffId && r.day === d)?.status

  async function mark(staffId: string, status: Status) {
    // Optimistic: reflect immediately, then persist.
    setRows(prev => {
      const other = prev.filter(r => !(r.staff_id === staffId && r.day === day))
      return [...other, { id: 'tmp', staff_id: staffId, day, status }]
    })
    const { error } = await supabase.from('attendance').upsert(
      { client_id: clientId, staff_id: staffId, day, status, source: 'dashboard', updated_at: new Date().toISOString() },
      { onConflict: 'staff_id,day' },
    )
    if (error) { setErr(error.message); load() } else load()
  }

  // Monthly summary per staff: counts + on-time rate (present / marked days).
  const summary = useMemo(() => {
    const m = new Map<string, { present: number; late: number; absent: number }>()
    for (const r of rows) {
      const c = m.get(r.staff_id) || { present: 0, late: 0, absent: 0 }
      c[r.status] += 1; m.set(r.staff_id, c)
    }
    return m
  }, [rows])

  const byDept = useMemo(() => {
    const m = new Map<string, Staff[]>()
    for (const s of staff) { const k = s.department || 'Unassigned'; const a = m.get(k) || []; a.push(s); m.set(k, a) }
    return Array.from(m.entries())
  }, [staff])

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <div style={H('1.35rem')}>Attendance</div>
        <div style={{ color: C.slate, fontSize: '0.9rem', marginTop: 4, maxWidth: 760 }}>
          Mark who was present, late or absent each day. The monthly on-time rate per person is
          computed from what you record here. (Field-app self clock-in with GPS will feed the same
          register later.)
        </div>
      </div>

      {needsMigration && (
        <div style={{ ...CARD, borderColor: C.amber, background: 'var(--cv-alt)' }}>
          <div style={{ fontWeight: 700, color: C.navy, marginBottom: 4 }}>One setup step needed</div>
          <div style={{ color: C.slate, fontSize: '0.9rem' }}>
            The attendance table isn’t in the database yet. Run <strong>2026_07_30_attendance.sql</strong> in
            the Supabase SQL editor, then refresh this page.
          </div>
        </div>
      )}
      {err && <div style={{ ...CARD, borderColor: C.red, color: C.red, fontSize: '0.88rem' }}>{err}</div>}

      <div style={{ ...CARD, display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
        <span style={LABEL}>Day</span>
        <input type="date" max={TODAY} style={inputStyle} value={day} onChange={e => setDay(e.target.value)} />
        <button style={{ ...inputStyle, cursor: 'pointer', fontFamily: 'var(--cv-font-mono)' }} onClick={() => setDay(TODAY)}>Today</button>
      </div>

      {loading ? (
        <div style={{ ...CARD, color: C.slate, textAlign: 'center' }}>Loading…</div>
      ) : staff.length === 0 ? (
        <div style={{ ...CARD, color: C.slate }}>No active staff yet. Add people in <strong>Staff</strong> first.</div>
      ) : (
        byDept.map(([dept, people]) => (
          <div key={dept} style={CARD}>
            <div style={{ ...H('1.1rem'), marginBottom: '0.8rem' }}>{dept}</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                <thead><tr>
                  <th style={th}>Code</th><th style={th}>Name</th>
                  <th style={th}>{new Date(day + 'T00:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' })}</th>
                  <th style={th}>This month</th>
                </tr></thead>
                <tbody>
                  {people.map(s => {
                    const cur = statusFor(s.id, day)
                    const sum = summary.get(s.id) || { present: 0, late: 0, absent: 0 }
                    const marked = sum.present + sum.late + sum.absent
                    const onTime = marked ? Math.round((sum.present / marked) * 100) : null
                    return (
                      <tr key={s.id}>
                        <td style={{ ...td, fontFamily: 'var(--cv-font-mono)', fontWeight: 700 }}>{s.staff_code}</td>
                        <td style={td}>{s.full_name}</td>
                        <td style={td}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {STATUS.map(st => {
                              const on = cur === st.key
                              return (
                                <button key={st.key} disabled={!canManage || needsMigration}
                                  onClick={() => mark(s.id, st.key)}
                                  style={{
                                    fontFamily: 'var(--cv-font-mono)', fontSize: '0.76rem', fontWeight: 700, cursor: canManage ? 'pointer' : 'default',
                                    padding: '0.28rem 0.55rem', borderRadius: 6,
                                    border: `1px solid ${on ? st.tone : C.border}`,
                                    background: on ? st.tone : 'transparent',
                                    color: on ? 'var(--cv-on-accent)' : C.slate,
                                  }}>{st.label}</button>
                              )
                            })}
                          </div>
                        </td>
                        <td style={{ ...td, fontFamily: 'var(--cv-font-mono)', fontSize: '0.82rem' }}>
                          {marked === 0 ? <span style={{ color: C.slate }}>—</span> : (
                            <span>
                              <span style={{ color: C.green }}>{sum.present}P</span> · <span style={{ color: C.amber }}>{sum.late}L</span> · <span style={{ color: C.red }}>{sum.absent}A</span>
                              {onTime != null && <span style={{ color: C.navy, fontWeight: 700 }}> · {onTime}% on-time</span>}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
