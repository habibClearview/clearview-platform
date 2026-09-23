'use client'

// ============================================================
// What they planned, against what they achieved.
//
// The lead section of the presentation Habib approved. The board above says
// what happened; this says whether it was what the businesses said would
// happen, which is the question a programme director actually asks.
//
// Plan and actual are added over the same businesses in the same month, so the
// two lines describe one population. A business with an actual figure but no
// planned figure for that month is in neither, rather than counted as having
// planned nothing.
// ============================================================

import type { MonthlyPoint } from '@/lib/portfolio-monthly'

const C = {
  navy: 'var(--cv-navy)', slate: 'var(--cv-slate)', faint: 'var(--cv-faint)',
  card: 'var(--cv-card)', alt: 'var(--cv-alt)', border: 'var(--cv-border)',
  borderSoft: 'var(--cv-border-soft)', header: 'var(--cv-header)',
  teal: 'var(--cv-teal)', green: 'var(--cv-green)', amber: 'var(--cv-amber)', red: 'var(--cv-red)',
}

const th: React.CSSProperties = {
  fontFamily: 'var(--cv-font-mono)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.05em',
  textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)', padding: '8px 7px', textAlign: 'right',
  background: C.header, whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '8px 7px', borderBottom: `1px solid ${C.borderSoft}`, textAlign: 'right',
  fontFamily: 'var(--cv-font-mono)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
}

function money(v: number | null, currency: string): string {
  if (v === null || !Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  if (a >= 1e9) return (v / 1e9).toFixed(1) + 'bn'
  if (a >= 1e6) return (v / 1e6).toFixed(1) + 'm'
  if (a >= 1e3) return Math.round(v / 1e3) + 'k'
  return String(Math.round(v))
}

/**
 * Green at or above plan, amber within a tenth of it, red below that.
 *
 * Colours the figure the reader can see, not the one behind it: 99.6% prints
 * as 100% and must not print as 100% in red.
 */
function achievedColour(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return C.slate
  const shown = Math.round(pct)
  if (shown >= 100) return C.green
  if (shown >= 90) return C.amber
  return C.red
}

export interface PlanVsActualProps {
  points: MonthlyPoint[]
  currency: string
}

export default function PlanVsActual({ points, currency }: PlanVsActualProps) {
  const withPlan = points.filter((p) => p.plannedRevenue !== null && p.revenue !== null)
  if (withPlan.length === 0) {
    return (
      <p style={{ margin: 0, color: C.slate, fontSize: '1.01rem', lineHeight: 1.6 }}>
        No month yet has both a planned figure and a recorded one for the same business, so there is
        nothing to compare. This fills in as each business records a month against the plan it set.
      </p>
    )
  }

  const plannedTotal = withPlan.reduce((s, p) => s + (p.plannedRevenue as number), 0)
  const actualTotal = withPlan.reduce((s, p) => s + (p.revenue as number), 0)
  const overall = plannedTotal > 0 ? (actualTotal / plannedTotal) * 100 : null
  const monthsAtOrAbove = withPlan.filter((p) => (p.achievedPct ?? 0) >= 100).length

  return (
    <div>
      <p style={{ margin: '0 0 0.9rem', color: C.slate, fontSize: '1.01rem', lineHeight: 1.6 }}>
        Over {withPlan.length} month{withPlan.length === 1 ? '' : 's'} with both figures, these businesses sold{' '}
        <b style={{ color: achievedColour(overall) }}>{overall === null ? '—' : Math.round(overall) + '%'}</b>{' '}
        of what they planned to, and were at or above plan in{' '}
        <b>{monthsAtOrAbove}</b> of those months. Plan and actual are added over the same businesses each
        month, so a business that has not recorded a month is in neither line.
      </p>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.card, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: '0.88rem',
                        minWidth: 300 + withPlan.length * 66 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', minWidth: 190 }}>Revenue</th>
              {withPlan.map((p) => <th key={p.month} style={th}>{p.label}</th>)}
              <th style={{ ...th, color: '#FFF' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...td, textAlign: 'left', fontFamily: 'var(--cv-font)', fontWeight: 600, color: C.navy }}>
                Planned
              </td>
              {withPlan.map((p) => (
                <td key={p.month} style={{ ...td, color: C.slate }}>{money(p.plannedRevenue as number, currency)}</td>
              ))}
              <td style={{ ...td, fontWeight: 700, color: C.navy, background: 'var(--cv-cyan-dim)' }}>
                {money(plannedTotal, currency)}
              </td>
            </tr>
            <tr>
              <td style={{ ...td, textAlign: 'left', fontFamily: 'var(--cv-font)', fontWeight: 600,
                           color: C.navy, background: C.alt }}>
                Actually sold
              </td>
              {withPlan.map((p) => (
                <td key={p.month} style={{ ...td, color: C.navy, fontWeight: 600, background: C.alt }}>
                  {money(p.revenue as number, currency)}
                </td>
              ))}
              <td style={{ ...td, fontWeight: 700, color: C.navy, background: 'var(--cv-cyan-dim)' }}>
                {money(actualTotal, currency)}
              </td>
            </tr>
            <tr>
              <td style={{ ...td, textAlign: 'left', fontFamily: 'var(--cv-font)', fontWeight: 600, color: C.navy }}>
                Achieved
              </td>
              {withPlan.map((p) => (
                <td key={p.month} style={{ ...td, fontWeight: 700, color: achievedColour(p.achievedPct) }}>
                  {p.achievedPct === null ? '—' : Math.round(p.achievedPct) + '%'}
                </td>
              ))}
              <td style={{ ...td, fontWeight: 700, background: 'var(--cv-cyan-dim)', color: achievedColour(overall) }}>
                {overall === null ? '—' : Math.round(overall) + '%'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p style={{ margin: '0.7rem 0 0', fontSize: '0.9rem', color: C.faint, lineHeight: 1.6 }}>
        Money is shown in <b>{currency}</b>. Achieved is what was sold divided by what was planned for the
        same businesses in that month. Green is at or above plan, amber within a tenth of it, red below that.
      </p>
    </div>
  )
}
