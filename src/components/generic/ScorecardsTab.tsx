'use client'

// ─────────────────────────────────────────────────────────────
// HUMAN RESOURCES › Scorecards  (per-client dashboard section)
//
// Per-staff performance in undisputable numbers, each with a 6-month trend
// against the target that applied. Reads ONLY data that already exists — no
// new table, no migration:
//   * staff, staff_targets                (roster + dated targets)
//   * customer_leads.officer_staff_id     (new customers + conversion)
//   * field_transactions.referred_by_staff_id (sales value credited)
//
// Metrics that need features not built yet (repeat rate, attendance) show the
// target with "not tracked yet" rather than a fake number.
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

type Metric = 'new_customers' | 'lead_conversion' | 'prospect_conversion' | 'sales_value' | 'sales_count' | 'repeat_rate' | 'attendance_rate' | 'custom'
interface Staff { id: string; staff_code: string; full_name: string; department: string; active: boolean }
interface Target { id: string; staff_id: string; metric: Metric; metric_label: string | null; target_value: number; period: string; effective_from: string }
interface Lead { officer_staff_id: string | null; stage: string; created_at: string | null }
interface Ftx { referred_by_staff_id: string | null; amount: number | null; transaction_date: string | null }

const METRIC_LABEL: Record<Metric, string> = {
  new_customers: 'New customers', lead_conversion: 'Lead → prospect', prospect_conversion: 'Prospect → client',
  sales_value: 'Sales value', sales_count: 'Number of sales', repeat_rate: 'Repeat-business rate',
  attendance_rate: 'On-time attendance', custom: 'Custom',
}
// Which metrics we can actually compute today (rest show "not tracked yet").
const COMPUTABLE = new Set<Metric>(['new_customers', 'lead_conversion', 'prospect_conversion', 'sales_value'])

const TODAY = new Date().toISOString().slice(0, 10)
function currentTarget(targets: Target[], metric: Metric): Target | null {
  let best: Target | null = null
  for (const t of targets) {
    if (t.metric !== metric || t.effective_from > TODAY) continue
    if (!best || t.effective_from > best.effective_from) best = t
  }
  return best
}

// ── Inline sparkline: line of monthly values + dashed target line ──
function Spark({ values, target, color }: { values: number[]; target?: number | null; color: string }) {
  const w = 172, h = 44, pad = 4
  const max = Math.max(...values, target || 0, 1)
  const x = (i: number) => pad + (values.length <= 1 ? 0 : (i / (values.length - 1)) * (w - 2 * pad))
  const y = (v: number) => h - pad - (v / max) * (h - 2 * pad)
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const ty = target != null ? y(target) : null
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      {ty != null && <line x1={pad} y1={ty} x2={w - pad} y2={ty} stroke={C.slate} strokeDasharray="3 3" strokeWidth="1" opacity={0.7} />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
      {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={2.2} fill={color} />)}
    </svg>
  )
}

export default function ScorecardsTab({ config, clientId, cc, P }: any) {
  void config; void P
  const currency = cc || ''
  const [staff, setStaff] = useState<Staff[]>([])
  const [targets, setTargets] = useState<Target[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [ftx, setFtx] = useState<Ftx[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setLoading(true); setErr(null)
    try {
      const [sRes, tRes, lRes] = await Promise.all([
        supabase.from('staff').select('id,staff_code,full_name,department,active').eq('client_id', clientId).eq('active', true).order('staff_code'),
        supabase.from('staff_targets').select('id,staff_id,metric,metric_label,target_value,period,effective_from').eq('client_id', clientId),
        supabase.from('customer_leads').select('officer_staff_id,stage,created_at').eq('client_id', clientId).not('officer_staff_id', 'is', null),
      ])
      if (sRes.error) throw sRes.error
      setStaff((sRes.data as Staff[]) || [])
      setTargets((tRes.data as Target[]) || [])
      setLeads((lRes.data as Lead[]) || [])
      // Credited sales — tolerant of the referred_by_staff_id column not existing yet.
      const fRes = await supabase.from('field_transactions')
        .select('referred_by_staff_id,amount,transaction_date')
        .eq('client_id', clientId).eq('transaction_type', 'sale').not('referred_by_staff_id', 'is', null)
      setFtx(!fRes.error && fRes.data ? (fRes.data as Ftx[]) : [])
    } catch (e: any) {
      setErr(e?.message || 'Could not load scorecards.')
    } finally { setLoading(false) }
  }
  useEffect(() => { if (clientId) load() /* eslint-disable-next-line */ }, [clientId])

  // Last 6 months (oldest → newest).
  const months = useMemo(() => {
    const now = new Date(); const out: { key: string; label: string }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleString('en', { month: 'short' }) })
    }
    return out
  }, [])
  const mk = (s: string | null) => (s || '').slice(0, 7)

  const byDept = useMemo(() => {
    const m = new Map<string, Staff[]>()
    for (const s of staff) { const k = s.department || 'Unassigned'; const a = m.get(k) || []; a.push(s); m.set(k, a) }
    return Array.from(m.entries())
  }, [staff])

  function statsFor(s: Staff) {
    const myLeads = leads.filter(l => l.officer_staff_id === s.id)
    const total = myLeads.length
    const reachedProspect = myLeads.filter(l => l.stage === 'prospect' || l.stage === 'client').length
    const reachedClient = myLeads.filter(l => l.stage === 'client').length
    const newCustByMonth = months.map(mo => myLeads.filter(l => mk(l.created_at) === mo.key).length)
    const mySales = ftx.filter(f => f.referred_by_staff_id === s.id)
    const salesByMonth = months.map(mo => mySales.filter(f => mk(f.transaction_date) === mo.key).reduce((a, f) => a + Number(f.amount || 0), 0))
    const myTargets = targets.filter(t => t.staff_id === s.id)
    return {
      total, leadToProspect: total ? Math.round((reachedProspect / total) * 100) : null,
      prospectToClient: reachedProspect ? Math.round((reachedClient / reachedProspect) * 100) : null,
      newCustByMonth, salesByMonth, myTargets,
      newCustThisMonth: newCustByMonth[newCustByMonth.length - 1],
      salesThisMonth: salesByMonth[salesByMonth.length - 1],
    }
  }

  const fmtVal = (metric: Metric, v: number) =>
    metric === 'sales_value' ? `${currency} ${Math.round(v).toLocaleString()}`
      : (METRIC_LABEL[metric] === 'Custom' ? String(v) : (['lead_conversion', 'prospect_conversion', 'repeat_rate', 'attendance_rate'].includes(metric) ? `${v}%` : String(Math.round(v))))

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <div style={H('1.35rem')}>Scorecards</div>
        <div style={{ color: C.slate, fontSize: '0.9rem', marginTop: 4, maxWidth: 760 }}>
          Each person’s performance in numbers, over the last 6 months, against the target that applied.
          The dashed line on each trend is the target. Set or raise targets in <strong>Staff</strong>.
        </div>
      </div>

      {err && <div style={{ ...CARD, borderColor: C.red, color: C.red, fontSize: '0.88rem' }}>{err}</div>}
      {loading ? (
        <div style={{ ...CARD, color: C.slate, textAlign: 'center' }}>Loading…</div>
      ) : staff.length === 0 ? (
        <div style={{ ...CARD, color: C.slate }}>No active staff yet. Add people in <strong>Staff</strong> first.</div>
      ) : (
        byDept.map(([dept, people]) => (
          <div key={dept} style={CARD}>
            <div style={{ ...H('1.1rem'), marginBottom: '0.9rem' }}>{dept}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {people.map(s => {
                const st = statsFor(s)
                return (
                  <div key={s.id} style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 12, padding: '1rem 1.1rem', background: C.cream }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.7rem' }}>
                      <div style={{ fontWeight: 700, color: C.navy, fontSize: '1.02rem' }}>
                        {s.full_name} <span style={{ fontFamily: 'var(--cv-font-mono)', color: C.slate, fontWeight: 400, fontSize: '0.85rem' }}>{s.staff_code}</span>
                      </div>
                      <div style={{ ...LABEL }}>
                        {st.total} leads · Lead→Prospect {st.leadToProspect ?? '—'}% · Prospect→Client {st.prospectToClient ?? '—'}%
                      </div>
                    </div>

                    {st.myTargets.length === 0 ? (
                      <div style={{ color: C.slate, fontSize: '0.85rem', fontStyle: 'italic' }}>No targets set for this person yet.</div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: '0.9rem' }}>
                        {/* one tile per metric this person has a current target for */}
                        {(['new_customers', 'sales_value', 'lead_conversion', 'prospect_conversion', 'sales_count', 'repeat_rate', 'attendance_rate', 'custom'] as Metric[])
                          .map(metric => ({ metric, tgt: currentTarget(st.myTargets, metric) }))
                          .filter(x => x.tgt)
                          .map(({ metric, tgt }) => {
                            const t = tgt!
                            const computable = COMPUTABLE.has(metric)
                            const series = metric === 'sales_value' ? st.salesByMonth : metric === 'new_customers' ? st.newCustByMonth : null
                            const actual = metric === 'sales_value' ? st.salesThisMonth
                              : metric === 'new_customers' ? st.newCustThisMonth
                              : metric === 'lead_conversion' ? st.leadToProspect
                              : metric === 'prospect_conversion' ? st.prospectToClient : null
                            const hit = actual != null && actual >= t.target_value
                            const tone = actual == null ? C.slate : hit ? C.green : C.amber
                            return (
                              <div key={metric} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.7rem 0.8rem' }}>
                                <div style={{ ...LABEL, marginBottom: 3 }}>{metric === 'custom' ? (t.metric_label || 'Custom') : METRIC_LABEL[metric]}</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                                  <span style={{ fontFamily: 'var(--cv-font-mono)', fontWeight: 700, fontSize: '1.2rem', color: tone }}>
                                    {computable && actual != null ? fmtVal(metric, actual) : '—'}
                                  </span>
                                  <span style={{ fontSize: '0.78rem', color: C.slate }}>target {fmtVal(metric, t.target_value)}/{t.period === 'monthly' ? 'mo' : t.period === 'weekly' ? 'wk' : 'qtr'}</span>
                                </div>
                                {series
                                  ? <div style={{ marginTop: 6 }}><Spark values={series} target={t.target_value} color={tone} /></div>
                                  : <div style={{ marginTop: 6, fontSize: '0.76rem', color: C.slate, fontStyle: 'italic' }}>
                                      {computable ? 'this-period rate' : 'actuals not tracked yet'}
                                    </div>}
                              </div>
                            )
                          })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
